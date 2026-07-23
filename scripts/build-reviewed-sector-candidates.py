# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "geopandas==1.1.4",
#   "pyogrio==0.13.0",
#   "pyproj==3.7.2",
#   "shapely==2.1.2",
# ]
# ///

"""Build reviewed Shanghai sector candidates and their reference subscopes.

The script never downloads data and never calls a live map API. Pass the fixed
Geofabrik GeoPackage named in data/geo/sources/osm-shanghai-260721.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import geopandas as gpd
import pyogrio
from shapely.geometry import MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import nearest_points, polygonize, unary_union
from shapely.validation import make_valid


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEFINITIONS = REPO_ROOT / "data/geo/reviewed-candidate-definitions.json"
DEFAULT_OUTPUT = REPO_ROOT / "src/data/sectors/reviewed-candidates.wgs84.json"
DEFAULT_MANIFEST = REPO_ROOT / "src/data/sectors/reviewed-candidates.manifest.json"
DEFAULT_SUBSCOPES_OUTPUT = REPO_ROOT / "src/data/sectors/subscopes.wgs84.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_definitions(path: Path) -> dict[str, Any]:
    definitions = read_json(path)
    definitions.setdefault("topologyGroups", [])
    definitions.setdefault("sectors", [])
    definitions.setdefault("subscopes", [])
    for batch_file in definitions.get("batchFiles", []):
        batch_path = (REPO_ROOT / batch_file).resolve()
        if not batch_path.is_relative_to(REPO_ROOT) or not batch_path.is_file():
            raise ValueError(f"候选批次文件无效：{batch_file}")
        batch = read_json(batch_path)
        definitions["topologyGroups"].extend(batch.get("topologyGroups", []))
        definitions["sectors"].extend(batch.get("sectors", []))
        definitions["subscopes"].extend(batch.get("subscopes", []))
    return definitions


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def project_geometry(geometry, source_crs: str, target_crs: str):
    return gpd.GeoSeries([geometry], crs=source_crs).to_crs(target_crs).iloc[0]


def polygons(geometry) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return [item for item in getattr(geometry, "geoms", []) if isinstance(item, Polygon)]


def fill_small_holes(geometry, threshold: float):
    def clean_polygon(polygon: Polygon) -> Polygon:
        holes = [ring.coords for ring in polygon.interiors if Polygon(ring).area >= threshold]
        return Polygon(polygon.exterior.coords, holes)

    parts = [clean_polygon(part) for part in polygons(geometry)]
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def normalize_polygonal(geometry):
    valid = make_valid(geometry)
    parts = [orient(part, sign=1.0) for part in polygons(valid) if not part.is_empty]
    if not parts:
        raise ValueError("Geometry did not produce a polygon")
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def round_coordinates(value: Any, digits: int = 7):
    if isinstance(value, (float, int)):
        return round(float(value), digits)
    return [round_coordinates(item, digits) for item in value]


def round_polygonal_geometry(geometry, digits: int):
    serialized = mapping(geometry)
    return normalize_polygonal(shape({
        "type": serialized["type"],
        "coordinates": round_coordinates(serialized["coordinates"], digits),
    }))


def sql_names(names: list[str]) -> str:
    escaped = [name.replace("'", "''") for name in names]
    return "name IN (" + ",".join(f"'{name}'" for name in escaped) + ")"


def build_qiantan(gpkg: Path, definition: dict[str, Any], working_crs: str, output_crs: str):
    bbox_value = tuple(definition["bbox"])
    roads = pyogrio.read_dataframe(
        gpkg,
        layer="gis_osm_roads_free",
        bbox=bbox_value,
        where=sql_names(definition["roadNames"]),
    ).to_crs(working_crs)
    waterways = pyogrio.read_dataframe(
        gpkg,
        layer="gis_osm_waterways_free",
        bbox=bbox_value,
        where=sql_names(definition["waterwayNames"]),
    ).to_crs(working_crs)
    water_surfaces = pyogrio.read_dataframe(
        gpkg,
        layer="gis_osm_water_a_free",
        bbox=bbox_value,
    ).to_crs(working_crs)

    if roads.empty or waterways.empty or water_surfaces.empty:
        raise ValueError("前滩构建所需的道路或水系图层为空")

    rectangle = project_geometry(box(*bbox_value), output_crs, working_crs)
    inside_point = project_geometry(Point(*definition["insidePoint"]), output_crs, working_crs)
    waterway_union = unary_union(waterways.geometry)
    selected_water = water_surfaces[
        (water_surfaces.geometry.area > definition["minimumWaterSurfaceSquareMeters"])
        & (water_surfaces.geometry.distance(waterway_union) < definition["waterSurfaceMaxDistanceMeters"])
    ]
    water_union = unary_union(selected_water.geometry)
    land = rectangle.difference(water_union.buffer(1))
    road_union = unary_union(roads.geometry)
    snap_buffer = definition["roadSnapBufferMeters"]
    cut_land = land.difference(road_union.buffer(snap_buffer))
    containing = [part for part in polygons(cut_land) if part.contains(inside_point)]
    if len(containing) != 1:
        raise ValueError(f"前滩闭合面应唯一，实际找到 {len(containing)} 个")

    restored = containing[0].buffer(snap_buffer, join_style="mitre").intersection(land)
    containing_after_restore = [part for part in polygons(restored) if part.contains(inside_point)]
    if containing_after_restore:
        restored = max(containing_after_restore, key=lambda part: part.area)
    else:
        restored = max(polygons(restored), key=lambda part: part.area)
    restored = fill_small_holes(restored, definition["fillHolesBelowSquareMeters"])
    restored = normalize_polygonal(restored)

    output_geometry = project_geometry(restored, working_crs, output_crs)
    osm_refs = {
        "roads": sorted({str(value) for value in roads.osm_id}),
        "waterways": sorted({str(value) for value in waterways.osm_id}),
        "waterSurfaces": sorted({str(value) for value in selected_water.osm_id}),
    }
    return output_geometry, float(restored.area), osm_refs


def build_market_linear_component(
    gpkg: Path,
    definition: dict[str, Any],
    working_crs: str,
    output_crs: str,
):
    bbox_value = tuple(definition["bbox"])
    anchor_frames = []
    boundary_geometries = []
    for anchor in definition["boundaryAnchors"]:
        components = anchor.get("components")
        if components is None:
            components = [{
                "featureType": anchor["featureType"],
                "expectedIdentity": anchor["expectedIdentity"],
                "match": anchor["match"],
            }]
        component_frames = []
        for component in components:
            layer = {
                "road": "gis_osm_roads_free",
                "waterway": "gis_osm_waterways_free",
            }.get(component["featureType"])
            if layer is None:
                raise ValueError(f"未知边界锚点类型：{component['featureType']}")
            match = component["match"]
            names = match.get("names", [])
            osm_ids = {str(value) for value in match.get("osmIds", [])}
            read_options = {"layer": layer, "bbox": bbox_value}
            if names and not osm_ids:
                read_options["where"] = sql_names(names)
            frame = pyogrio.read_dataframe(gpkg, **read_options)
            if names or osm_ids:
                frame = frame[
                    frame["name"].isin(names)
                    | frame["osm_id"].astype(str).isin(osm_ids)
                ]
            if frame.empty:
                raise ValueError(
                    f"{definition['canonicalName']} {anchor['side']} 侧锚点 "
                    f"{component['expectedIdentity']} 没有匹配 OSM 对象"
                )
            frame = frame.to_crs(working_crs)
            component_frames.append((component, frame))
            boundary_geometries.extend(frame.geometry)
        anchor_frames.append((anchor, component_frames))

    rectangle = project_geometry(box(*bbox_value), output_crs, working_crs)
    inside_point = project_geometry(Point(*definition["insidePoint"]), output_crs, working_crs)
    boundary_lines = unary_union(boundary_geometries)
    cut_buffer = float(definition["cutBufferMeters"])
    cut = rectangle.difference(boundary_lines.buffer(cut_buffer))
    containing = [part for part in polygons(cut) if part.contains(inside_point)]
    if len(containing) != 1:
        raise ValueError(
            f"{definition['canonicalName']} 闭合面应唯一，实际找到 {len(containing)} 个"
        )

    restored = containing[0].buffer(cut_buffer, join_style="mitre").intersection(rectangle)
    restored_parts = [part for part in polygons(make_valid(restored)) if part.contains(inside_point)]
    if len(restored_parts) != 1:
        raise ValueError(
            f"{definition['canonicalName']} 回扩后的闭合面应唯一，实际找到 {len(restored_parts)} 个"
        )
    restored = normalize_polygonal(restored_parts[0])
    if definition.get("fillHolesBelowSquareMeters") is not None:
        restored = normalize_polygonal(fill_small_holes(
            restored,
            float(definition["fillHolesBelowSquareMeters"]),
        ))
    bbox_clearance = restored.boundary.distance(rectangle.boundary)
    if bbox_clearance < float(definition["minimumBboxClearanceMeters"]):
        raise ValueError(
            f"{definition['canonicalName']} 候选边界仍接触临时裁剪框，最小间距仅 "
            f"{bbox_clearance:.2f} 米"
        )

    anchor_manifest = []
    road_refs = set()
    waterway_refs = set()
    tolerance = float(definition["centerlineToleranceMeters"])
    for anchor, component_frames in anchor_frames:
        anchor_union = unary_union([
            geometry
            for _, frame in component_frames
            for geometry in frame.geometry
        ])
        boundary_buffer = restored.boundary.buffer(tolerance)
        coverage = restored.boundary.intersection(anchor_union.buffer(tolerance)).length
        minimum_coverage = float(anchor["minimumBoundaryCoverageMeters"])
        if coverage < minimum_coverage:
            raise ValueError(
                f"{definition['canonicalName']} {anchor['side']} 侧边界在 {tolerance:.0f} 米"
                f"容差内只覆盖 {coverage:.1f} 米，低于 {minimum_coverage:.1f} 米"
            )
        minimum_object_coverage = float(anchor.get("minimumObjectCoverageMeters", 1))
        input_refs = set()
        refs = set()
        component_manifest = []
        for component, frame in component_frames:
            component_input_refs = sorted({str(value) for value in frame.osm_id})
            boundary_frame = frame[
                frame.geometry.map(
                    lambda geometry: geometry.intersection(boundary_buffer).length
                    >= minimum_object_coverage
                )
            ]
            component_refs = sorted({str(value) for value in boundary_frame.osm_id})
            input_refs.update(component_input_refs)
            refs.update(component_refs)
            if component["featureType"] == "road":
                road_refs.update(component_refs)
            else:
                waterway_refs.update(component_refs)
            component_manifest.append({
                "featureType": component["featureType"],
                "expectedIdentity": component["expectedIdentity"],
                "osmRefs": component_refs,
                "inputOsmRefs": component_input_refs,
            })
        input_refs = sorted(input_refs)
        refs = sorted(refs)
        if not refs:
            raise ValueError(
                f"{definition['canonicalName']} {anchor['side']} 侧没有对象达到"
                f" {minimum_object_coverage:.1f} 米边界贴合长度"
            )
        anchor_manifest.append({
            "side": anchor["side"],
            "featureType": anchor["featureType"],
            "expectedIdentity": anchor["expectedIdentity"],
            "identityStatus": anchor["identityStatus"],
            "verificationSourceIds": anchor["verificationSourceIds"],
            "osmRefs": refs,
            "inputOsmRefs": input_refs,
            "boundaryCoverageWithinToleranceMeters": round(coverage, 1),
            "centerlineToleranceMeters": tolerance,
            **({"components": component_manifest} if anchor.get("components") else {}),
            **({"note": anchor["note"]} if anchor.get("note") else {}),
        })

    output_geometry = project_geometry(restored, working_crs, output_crs)
    osm_refs = {
        "roads": sorted(road_refs),
        "waterways": sorted(waterway_refs),
        "boundaryAnchors": anchor_manifest,
    }
    return output_geometry, float(restored.area), osm_refs


def build_market_linear_component_minus_candidates(
    gpkg: Path,
    definition: dict[str, Any],
    working_crs: str,
    output_crs: str,
    geometry_by_id: dict[str, Any],
):
    geometry, _, osm_refs = build_market_linear_component(
        gpkg,
        definition,
        working_crs,
        output_crs,
    )
    source_projected = project_geometry(
        geometry,
        output_crs,
        working_crs,
    )
    projected = source_projected
    subtracted_inside_source = []
    for sector_id in definition["sourceSubtractSectorIds"]:
        neighbor = geometry_by_id.get(sector_id)
        if neighbor is None:
            raise ValueError(
                f"{definition['canonicalName']} 找不到待扣除板块 {sector_id}"
            )
        neighbor_projected = project_geometry(
            neighbor,
            output_crs,
            working_crs,
        )
        subtracted_inside_source.append(
            source_projected.intersection(neighbor_projected)
        )
        projected = projected.difference(neighbor_projected)
    minimum_part_area = float(
        definition.get("minimumRetainedPartSquareMeters", 0)
    )
    retained_parts = [
        part for part in polygons(make_valid(projected))
        if part.area >= minimum_part_area
    ]
    if not retained_parts:
        raise ValueError(
            f"{definition['canonicalName']} 扣除相邻板块后没有可保留面"
        )
    projected = normalize_polygonal(unary_union(retained_parts))
    inside_point = project_geometry(
        Point(*definition["insidePoint"]),
        output_crs,
        working_crs,
    )
    if not projected.contains(inside_point):
        raise ValueError(
            f"{definition['canonicalName']} 扣除相邻板块后不包含市场裁定点"
        )
    reconstructed = normalize_polygonal(unary_union([
        projected,
        *subtracted_inside_source,
    ]))
    reconstruction_error = source_projected.symmetric_difference(
        reconstructed
    ).area
    maximum_reconstruction_error = float(
        definition.get("maximumDifferenceReconstructionErrorSquareMeters", 1)
    )
    if reconstruction_error > maximum_reconstruction_error:
        raise ValueError(
            f"{definition['canonicalName']} 差集重建误差 "
            f"{reconstruction_error:.4f} 平方米，超过 "
            f"{maximum_reconstruction_error:.4f} 平方米"
        )
    osm_refs["sourceSubtractSectorIds"] = definition["sourceSubtractSectorIds"]
    osm_refs["differenceReconstructionErrorSquareMeters"] = round(
        reconstruction_error,
        6,
    )
    output_geometry = project_geometry(projected, working_crs, output_crs)
    return output_geometry, float(projected.area), osm_refs


def build_osm_admin_candidate(gpkg: Path, definition: dict[str, Any], working_crs: str):
    relation_id = str(definition["osmAdminRelationId"])
    frame = pyogrio.read_dataframe(
        gpkg,
        layer="gis_osm_adminareas_a_free",
        where=f"osm_id='{relation_id}'",
    )
    if len(frame) != 1:
        raise ValueError(f"OSM relation {relation_id} 应唯一，实际找到 {len(frame)} 个")
    row = frame.iloc[0]
    if row["name"] != definition["expectedOsmName"]:
        raise ValueError(f"OSM relation 名称漂移：{row['name']}")
    geometry = normalize_polygonal(row.geometry)
    projected = project_geometry(geometry, frame.crs, working_crs)
    return geometry, float(projected.area), {"adminRelations": [relation_id]}


def build_named_osm_landuse_project_proxy(
    gpkg: Path,
    definition: dict[str, Any],
    working_crs: str,
    output_crs: str,
):
    expected_objects = {
        str(item["osmId"]): item["expectedName"]
        for item in definition["namedLanduseObjects"]
    }
    if len(expected_objects) != len(definition["namedLanduseObjects"]):
        raise ValueError(f"{definition['canonicalName']} 同名用地对象 ID 重复")
    if not all(osm_id.isdigit() for osm_id in expected_objects):
        raise ValueError(f"{definition['canonicalName']} 同名用地对象 ID 必须是数字")
    where = "osm_id IN (" + ",".join(sorted(expected_objects)) + ")"
    frame = pyogrio.read_dataframe(
        gpkg,
        layer="gis_osm_landuse_a_free",
        where=where,
    )
    actual_ids = {str(value) for value in frame["osm_id"]}
    if actual_ids != set(expected_objects):
        raise ValueError(
            f"{definition['canonicalName']} 同名用地对象集合漂移："
            f"缺少 {sorted(set(expected_objects) - actual_ids)}，"
            f"多出 {sorted(actual_ids - set(expected_objects))}"
        )
    for row in frame.itertuples():
        osm_id = str(row.osm_id)
        if row.name != expected_objects[osm_id]:
            raise ValueError(
                f"{definition['canonicalName']} OSM {osm_id} 名称漂移：{row.name}"
            )
        if row.fclass != definition["expectedLanduseClass"]:
            raise ValueError(
                f"{definition['canonicalName']} OSM {osm_id} 用地类型漂移："
                f"{row.fclass}"
            )

    ordered_geometries = [
        normalize_polygonal(
            frame.loc[frame["osm_id"].astype(str) == osm_id].iloc[0].geometry
        )
        for osm_id in sorted(expected_objects)
    ]
    geometry = normalize_polygonal(unary_union(ordered_geometries))
    actual_part_count = len(polygons(geometry))
    if actual_part_count != int(definition["expectedPartCount"]):
        raise ValueError(
            f"{definition['canonicalName']} 应保留 "
            f"{definition['expectedPartCount']} 个同名组成面，实际 {actual_part_count}"
        )

    projected = project_geometry(geometry, frame.crs, working_crs)
    protected_relations = definition["protectedAdminRelations"]
    protected_ids = {str(item["osmAdminRelationId"]) for item in protected_relations}
    if not all(osm_id.isdigit() for osm_id in protected_ids):
        raise ValueError(f"{definition['canonicalName']} 保护行政关系 ID 必须是数字")
    protected_frame = pyogrio.read_dataframe(
        gpkg,
        layer="gis_osm_adminareas_a_free",
        where="osm_id IN (" + ",".join(sorted(protected_ids)) + ")",
    )
    actual_protected_ids = {str(value) for value in protected_frame["osm_id"]}
    if actual_protected_ids != protected_ids:
        raise ValueError(f"{definition['canonicalName']} 保护行政关系集合漂移")
    expected_admin_names = {
        str(item["osmAdminRelationId"]): item["expectedOsmName"]
        for item in protected_relations
    }
    for row in protected_frame.itertuples():
        if row.name != expected_admin_names[str(row.osm_id)]:
            raise ValueError(
                f"{definition['canonicalName']} 保护行政关系名称漂移：{row.name}"
            )
    projected_admin = project_geometry(
        normalize_polygonal(unary_union(protected_frame.geometry)),
        protected_frame.crs,
        working_crs,
    )
    outside_area = float(projected.difference(projected_admin).area)
    maximum_outside = float(
        definition["maximumOutsideProtectedAdminSquareMeters"]
    )
    if outside_area > maximum_outside:
        raise ValueError(
            f"{definition['canonicalName']} 有 {outside_area:.3f} 平方米超出保护行政范围"
        )

    return geometry, float(projected.area), {
        "namedLanduseObjects": [
            {
                "osmId": osm_id,
                "name": expected_objects[osm_id],
                "fclass": definition["expectedLanduseClass"],
            }
            for osm_id in sorted(expected_objects)
        ],
        "landusePartCount": actual_part_count,
        "protectedAdminRelations": sorted(protected_ids),
        "outsideProtectedAdminSquareMeters": round(outside_area, 6),
        "convexHullUsed": False,
    }


def build_market_admin_union_minus_market_candidates(
    gpkg: Path,
    definition: dict[str, Any],
    working_crs: str,
    output_crs: str,
    sector_geometry_by_id: dict[str, Any],
):
    admin_relations = definition["osmAdminRelations"]
    relation_names = {
        str(item["osmAdminRelationId"]): item["expectedOsmName"]
        for item in admin_relations
    }
    if len(relation_names) != len(admin_relations):
        raise ValueError(f"{definition['canonicalName']} 行政关系 ID 重复")
    if not all(relation_id.isdigit() for relation_id in relation_names):
        raise ValueError(f"{definition['canonicalName']} 行政关系 ID 必须是数字")
    frame = pyogrio.read_dataframe(
        gpkg,
        layer="gis_osm_adminareas_a_free",
        where="osm_id IN (" + ",".join(sorted(relation_names)) + ")",
    )
    actual_ids = {str(value) for value in frame["osm_id"]}
    if actual_ids != set(relation_names):
        raise ValueError(f"{definition['canonicalName']} 行政关系集合漂移")
    for row in frame.itertuples():
        if row.name != relation_names[str(row.osm_id)]:
            raise ValueError(
                f"{definition['canonicalName']} 行政关系名称漂移：{row.name}"
            )

    admin_union = normalize_polygonal(unary_union(frame.geometry))
    projected_admin_union = project_geometry(
        admin_union,
        frame.crs,
        working_crs,
    )
    subtract_ids = definition["subtractSectorIds"]
    missing_ids = [
        sector_id
        for sector_id in subtract_ids
        if sector_id not in sector_geometry_by_id
    ]
    if missing_ids:
        raise ValueError(
            f"{definition['canonicalName']} 找不到需要扣除的市场候选："
            f"{', '.join(missing_ids)}"
        )
    projected_subtract = unary_union([
        project_geometry(
            sector_geometry_by_id[sector_id],
            output_crs,
            working_crs,
        )
        for sector_id in subtract_ids
    ])
    subtract_outside_area = float(
        projected_subtract.difference(projected_admin_union).area
    )
    maximum_subtract_outside = float(
        definition["maximumSubtractOutsideAdminSquareMeters"]
    )
    if subtract_outside_area > maximum_subtract_outside:
        raise ValueError(
            f"{definition['canonicalName']} 被扣市场有 "
            f"{subtract_outside_area:.3f} 平方米超出行政并集"
        )

    projected_difference = normalize_polygonal(
        projected_admin_union.difference(projected_subtract)
    )
    inside_point = project_geometry(
        Point(*definition["insidePoint"]),
        output_crs,
        working_crs,
    )
    if not projected_difference.contains(inside_point):
        raise ValueError(f"{definition['canonicalName']} 差集不包含市场裁定点")
    reconstructed = projected_difference.union(
        projected_subtract.intersection(projected_admin_union)
    )
    reconstruction_error = float(
        reconstructed.symmetric_difference(projected_admin_union).area
    )
    maximum_reconstruction_error = float(
        definition["maximumDifferenceReconstructionErrorSquareMeters"]
    )
    if reconstruction_error > maximum_reconstruction_error:
        raise ValueError(
            f"{definition['canonicalName']} 差集重建误差 "
            f"{reconstruction_error:.6f} 平方米超标"
        )
    geometry = normalize_polygonal(
        project_geometry(projected_difference, working_crs, output_crs)
    )
    shared_boundary_length = float(
        projected_difference.boundary.intersection(
            projected_subtract.boundary
        ).length
    )
    return geometry, float(projected_difference.area), {
        "adminRelations": [
            {
                "osmId": relation_id,
                "name": relation_names[relation_id],
            }
            for relation_id in sorted(relation_names)
        ],
        "subtractedSectorIds": subtract_ids,
        "subtractOutsideAdminSquareMeters": round(subtract_outside_area, 6),
        "differenceReconstructionErrorSquareMeters": round(
            reconstruction_error,
            6,
        ),
        "sharedBoundaryWithSubtractedCandidatesMeters": round(
            shared_boundary_length,
            3,
        ),
    }


def build_market_admin_outer_shell(
    gpkg: Path,
    definition: dict[str, Any],
    working_crs: str,
    output_crs: str,
    sector_geometry_by_id: dict[str, Any],
):
    geometry, _, osm_refs = build_osm_admin_candidate(gpkg, definition, working_crs)
    shells = [Polygon(part.exterior.coords) for part in polygons(geometry)]
    market_geometry = shells[0] if len(shells) == 1 else MultiPolygon(shells)
    subtract_ids = definition.get("subtractSectorIds", [])
    missing_ids = [sector_id for sector_id in subtract_ids if sector_id not in sector_geometry_by_id]
    if missing_ids:
        raise ValueError(
            f"{definition['canonicalName']} 找不到需要扣除的主板块：{', '.join(missing_ids)}"
        )
    if subtract_ids:
        market_geometry = market_geometry.difference(
            unary_union([sector_geometry_by_id[sector_id] for sector_id in subtract_ids])
        )
    inside_point = Point(*definition["insidePoint"])
    containing = [part for part in polygons(make_valid(market_geometry)) if part.contains(inside_point)]
    if len(containing) != 1:
        raise ValueError(
            f"{definition['canonicalName']} 必须唯一包含市场裁定点，实际找到 {len(containing)} 个"
        )
    market_geometry = normalize_polygonal(containing[0])
    projected = project_geometry(market_geometry, output_crs, working_crs)
    osm_refs["subtractedSectorIds"] = subtract_ids
    osm_refs["includedMarketAreas"] = definition.get("includedMarketAreas", [])
    return market_geometry, float(projected.area), osm_refs


def build_market_admin_candidate_with_shared_topology(
    gpkg: Path,
    definition: dict[str, Any],
    working_crs: str,
    output_crs: str,
    sector_geometry_by_id: dict[str, Any],
):
    geometry, area, osm_refs = build_osm_admin_candidate(
        gpkg,
        definition,
        working_crs,
    )
    subtract_ids = definition.get("subtractSectorIds", [])
    missing_ids = [
        sector_id
        for sector_id in subtract_ids
        if sector_id not in sector_geometry_by_id
    ]
    if missing_ids:
        raise ValueError(
            f"{definition['canonicalName']} 找不到需要扣除的既有市场候选："
            f"{', '.join(missing_ids)}"
        )
    if subtract_ids:
        projected_geometry = project_geometry(geometry, output_crs, working_crs)
        projected_protected = unary_union([
            project_geometry(
                sector_geometry_by_id[sector_id],
                output_crs,
                working_crs,
            )
            for sector_id in subtract_ids
        ])
        projected_geometry = normalize_polygonal(
            projected_geometry.difference(projected_protected)
        )
        minimum_part_area = float(
            definition.get("minimumRetainedPartSquareMeters", 0)
        )
        if minimum_part_area > 0:
            retained_parts = [
                part
                for part in polygons(make_valid(projected_geometry))
                if part.area >= minimum_part_area
            ]
            if not retained_parts:
                raise ValueError(
                    f"{definition['canonicalName']} 扣除既有市场候选后没有可保留面"
                )
            projected_geometry = normalize_polygonal(
                unary_union(retained_parts)
            )
        geometry = normalize_polygonal(
            project_geometry(projected_geometry, working_crs, output_crs)
        )
        area = float(projected_geometry.area)
        osm_refs["subtractedSectorIds"] = subtract_ids
    osm_refs["sharedEdgeSectorIds"] = definition["sharedEdgeSectorIds"]
    osm_refs["sharedEdgeSnapDistanceMeters"] = float(
        definition["sharedEdgeSnapDistanceMeters"]
    )
    return geometry, area, osm_refs


def build_official_residential_subarea_proxy(
    gpkg: Path,
    definition: dict[str, Any],
    working_crs: str,
    output_crs: str,
):
    admin_geometry, _, osm_refs = build_osm_admin_candidate(
        gpkg,
        definition,
        working_crs,
    )
    road_ids = {str(value) for value in definition["cutRoadOsmIds"]}
    roads = pyogrio.read_dataframe(
        gpkg,
        layer="gis_osm_roads_free",
        bbox=admin_geometry.bounds,
    )
    roads = roads[roads["osm_id"].astype(str).isin(road_ids)]
    actual_ids = {str(value) for value in roads["osm_id"]}
    if actual_ids != road_ids:
        missing_ids = sorted(road_ids - actual_ids)
        raise ValueError(
            f"{definition['canonicalName']} 找不到锁定的道路对象："
            f"{', '.join(missing_ids)}"
        )
    unexpected_names = sorted({
        str(value)
        for value in roads["name"]
        if value != definition["expectedCutRoadName"]
    })
    if unexpected_names:
        raise ValueError(
            f"{definition['canonicalName']} 裁切道路名称漂移："
            f"{', '.join(unexpected_names)}"
        )

    projected_admin = project_geometry(
        admin_geometry,
        output_crs,
        working_crs,
    )
    projected_roads = roads.to_crs(working_crs)
    road_union = unary_union(projected_roads.geometry)
    cut_buffer = float(definition["cutRoadBufferMeters"])
    cut = projected_admin.difference(road_union.buffer(cut_buffer))
    inside_point = project_geometry(
        Point(*definition["insidePoint"]),
        output_crs,
        working_crs,
    )
    cut_parts = polygons(make_valid(cut))
    containing = [
        part
        for part in cut_parts
        if part.contains(inside_point)
    ]
    if len(containing) != 1:
        raise ValueError(
            f"{definition['canonicalName']} 道路裁切后应唯一包含住宅裁定点，"
            f"实际找到 {len(containing)} 个"
        )
    selected_side = definition["selectedSide"]
    if selected_side != "west":
        raise ValueError(
            f"{definition['canonicalName']} 暂只支持可验证的 west 道路裁切"
        )
    excluded_parts = [
        part
        for part in cut_parts
        if part is not containing[0]
        and part.area >= float(
            definition["minimumExcludedSideAreaSquareMeters"]
        )
    ]
    if len(excluded_parts) != 1:
        raise ValueError(
            f"{definition['canonicalName']} 应唯一识别道路东侧主排除面，"
            f"实际找到 {len(excluded_parts)} 个"
        )
    excluded_part = excluded_parts[0]
    nearest_road_point = nearest_points(inside_point, road_union)[1]
    selected_representative = containing[0].representative_point()
    excluded_representative = excluded_part.representative_point()
    if (
        inside_point.x >= nearest_road_point.x
        or selected_representative.x >= excluded_representative.x
    ):
        raise ValueError(
            f"{definition['canonicalName']} 裁定点或候选面未通过军工路西侧验证"
        )

    restored = containing[0].buffer(
        cut_buffer,
        join_style="mitre",
    ).intersection(projected_admin)
    restored_parts = [
        part
        for part in polygons(make_valid(restored))
        if part.contains(inside_point)
    ]
    if len(restored_parts) != 1:
        raise ValueError(
            f"{definition['canonicalName']} 回扩道路中心线后应唯一包含住宅裁定点，"
            f"实际找到 {len(restored_parts)} 个"
        )
    projected = normalize_polygonal(restored_parts[0])
    protected_admin_relations = []
    for protected_definition in definition.get(
        "protectedAdminRelations",
        [],
    ):
        protected_geometry, _, _ = build_osm_admin_candidate(
            gpkg,
            protected_definition,
            working_crs,
        )
        projected_protected = project_geometry(
            protected_geometry,
            output_crs,
            working_crs,
        )
        overlap = projected.intersection(projected_protected).area
        maximum_overlap = float(
            protected_definition["maximumOverlapSquareMeters"]
        )
        if overlap > maximum_overlap:
            raise ValueError(
                f"{definition['canonicalName']} 与保护行政包络 "
                f"{protected_definition['expectedOsmName']} 重叠 "
                f"{overlap:.4f} 平方米"
            )
        protected_admin_relations.append({
            "osmAdminRelationId": str(
                protected_definition["osmAdminRelationId"]
            ),
            "expectedOsmName": protected_definition["expectedOsmName"],
            "overlapSquareMeters": round(overlap, 6),
            "maximumOverlapSquareMeters": maximum_overlap,
        })
    boundary_coverage = projected.boundary.intersection(
        road_union.buffer(float(definition["roadBoundaryToleranceMeters"]))
    ).length
    minimum_coverage = float(
        definition["minimumRoadBoundaryCoverageMeters"]
    )
    if boundary_coverage < minimum_coverage:
        raise ValueError(
            f"{definition['canonicalName']} 沿 {definition['expectedCutRoadName']} "
            f"边界只覆盖 {boundary_coverage:.1f} 米，低于 {minimum_coverage:.1f} 米"
        )

    geometry = normalize_polygonal(
        project_geometry(projected, working_crs, output_crs)
    )
    osm_refs.update({
        "cutRoadName": definition["expectedCutRoadName"],
        "cutRoadOsmRefs": sorted(road_ids),
        "cutRoadBufferMeters": cut_buffer,
        "roadBoundaryCoverageWithinToleranceMeters": round(
            boundary_coverage,
            1,
        ),
        "roadBoundaryToleranceMeters": float(
            definition["roadBoundaryToleranceMeters"]
        ),
        "selectedSide": selected_side,
        "selectedSideVerified": True,
        "selectedRepresentativeEasting": round(
            selected_representative.x,
            2,
        ),
        "excludedRepresentativeEasting": round(
            excluded_representative.x,
            2,
        ),
        "fullAdminRelationRejected": bool(
            definition["fullAdminRelationRejected"]
        ),
        "excludedArea": definition["excludedArea"],
        "protectedAdminRelations": protected_admin_relations,
    })
    return geometry, float(projected.area), osm_refs


def build_selected_workpack_candidate(
    definition: dict[str, Any],
    workpack_sources: dict[str, dict[str, Any]],
    working_crs: str,
    output_crs: str,
    snapshot_id: str,
):
    workpack_source_id = definition["workpackSourceId"]
    source_config = workpack_sources.get(workpack_source_id)
    if source_config is None:
        raise ValueError(
            f"{definition['canonicalName']} 找不到 workpack source：{workpack_source_id}"
        )
    source_path = (REPO_ROOT / source_config["sourceGeojson"]).resolve()
    if not source_path.is_relative_to(REPO_ROOT):
        raise ValueError(
            f"{definition['canonicalName']} workpack 路径必须位于仓库内"
        )
    if not source_path.is_file():
        raise ValueError(
            f"{definition['canonicalName']} 找不到 workpack 候选：{source_path}"
        )
    actual_hash = sha256(source_path)
    expected_hash = source_config["sourceGeojsonSha256"]
    if actual_hash != expected_hash:
        raise ValueError(
            f"{definition['canonicalName']} workpack SHA-256 不匹配：{actual_hash}"
        )

    source = read_json(source_path)
    source_feature_id_property = definition.get("sourceFeatureIdProperty", "id")
    matches = [
        feature for feature in source.get("features", [])
        if feature.get("properties", {}).get(source_feature_id_property)
        == definition["sourceFeatureId"]
    ]
    if len(matches) != 1:
        raise ValueError(
            f"{definition['canonicalName']} workpack Feature 应唯一，实际找到 {len(matches)} 个"
        )
    source_feature = matches[0]
    source_properties = source_feature.get("properties", {})
    collection_workpack_id = (
        source.get("properties", {}).get("workpackId")
        or source.get("metadata", {}).get("workpackId")
        or source_properties.get("workpackId")
    )
    if collection_workpack_id != source_config["expectedWorkpackId"]:
        raise ValueError(f"{definition['canonicalName']} workpackId 不匹配")
    for property_name, expected_value in definition.get(
        "requiredSourceProperties",
        {},
    ).items():
        if source_properties.get(property_name) != expected_value:
            raise ValueError(
                f"{definition['canonicalName']} workpack 属性 {property_name} "
                f"不是声明值 {expected_value!r}"
            )
    if source_properties.get("coordinateSystem") not in {
        "WGS84",
        "OGC:CRS84",
    }:
        raise ValueError(f"{definition['canonicalName']} workpack 坐标系不是 WGS84/CRS84")
    expected_snapshot_id = source_config["expectedGeometrySourceSnapshotId"]
    if source_properties.get("geometrySourceSnapshotId") != expected_snapshot_id:
        raise ValueError(
            f"{definition['canonicalName']} workpack geometrySourceSnapshotId "
            f"不是锁定值 {expected_snapshot_id!r}"
        )
    if expected_snapshot_id != snapshot_id:
        raise ValueError(
            f"{definition['canonicalName']} workpack 快照与中央 source lock 不一致"
        )

    geometry = normalize_polygonal(shape(source_feature["geometry"]))
    inside_point = Point(*definition["insidePoint"])
    if not geometry.contains(inside_point):
        raise ValueError(f"{definition['canonicalName']} workpack 不包含市场裁定点")
    projected = project_geometry(geometry, output_crs, working_crs)
    workpack_refs = {
        "workpackId": source_config["expectedWorkpackId"],
        "workpackSourceId": workpack_source_id,
        "sourceGeojson": source_config["sourceGeojson"],
        "sourceGeojsonSha256": actual_hash,
        "sourceFeatureId": definition["sourceFeatureId"],
        "sourceFeatureIdProperty": source_feature_id_property,
        "geometrySourceSnapshotId": expected_snapshot_id,
        "sourceAdminRelationId": source_properties.get("sourceAdminRelationId"),
        "splitEdgeId": source_properties.get("splitEdgeId"),
        "splitRoadOsmRefs": source_properties.get("splitRoadOsmRefs", []),
        "assemblyReadiness": source_properties.get("assemblyReadiness"),
        "projectIntegrityStatus": source_properties.get("projectIntegrityStatus"),
        "unfrozenAdjacentSectorIds": source_properties.get(
            "unfrozenAdjacentSectorIds",
            [],
        ),
    }
    return geometry, float(projected.area), workpack_refs


def finalize_topology_group(
    feature_by_id: dict[str, dict[str, Any]],
    geometry_by_id: dict[str, Any],
    definition_by_id: dict[str, dict[str, Any]],
    group: dict[str, Any],
    working_crs: str,
    output_crs: str,
):
    sector_ids = group["prioritySectorIds"]
    missing_ids = [
        sector_id for sector_id in sector_ids
        if sector_id not in geometry_by_id or sector_id not in feature_by_id
    ]
    if missing_ids:
        raise ValueError(
            f"拓扑组找不到候选板块：{', '.join(missing_ids)}"
        )

    projected_by_id = {}
    source_projected_by_id = {}
    occupied = None
    snap_distance = float(group.get("snapDistanceMeters", 30))
    preserve_all_parts_sector_ids = (
        set(sector_ids)
        if group.get("preserveAllPrioritySectorParts")
        else set(group.get("preserveAllPartsSectorIds", []))
    )
    for sector_id in sector_ids:
        projected = project_geometry(
            geometry_by_id[sector_id],
            output_crs,
            working_crs,
        )
        source_projected_by_id[sector_id] = projected
        definition = definition_by_id[sector_id]
        neighbor_ids = list(dict.fromkeys([
            *definition.get("snapDependencySectorIds", []),
            *definition.get("subtractSectorIds", []),
        ]))
        for neighbor_id in neighbor_ids:
            neighbor = projected_by_id.get(neighbor_id)
            if neighbor is None:
                continue
            half_snap_distance = snap_distance / 2
            shared_corridor = projected.buffer(half_snap_distance).intersection(
                neighbor.buffer(half_snap_distance)
            )
            projected = projected.union(shared_corridor).difference(neighbor)
        if occupied is not None:
            projected = projected.difference(occupied)
        inside_point = project_geometry(
            Point(*definition["insidePoint"]),
            output_crs,
            working_crs,
        )
        valid_parts = polygons(make_valid(projected))
        containing = [
            part for part in valid_parts
            if part.contains(inside_point)
        ]
        if len(containing) != 1:
            raise ValueError(
                f"{definition['canonicalName']} 米制拓扑必须唯一包含市场裁定点，"
                f"实际找到 {len(containing)} 个"
            )
        if sector_id in preserve_all_parts_sector_ids:
            projected = normalize_polygonal(unary_union(valid_parts))
        else:
            projected = normalize_polygonal(containing[0])
        projected_by_id[sector_id] = projected
        occupied = (
            projected
            if occupied is None
            else unary_union([occupied, projected])
        )

    for first_index, first_id in enumerate(sector_ids):
        for second_id in sector_ids[first_index + 1:]:
            overlap = projected_by_id[first_id].intersection(
                projected_by_id[second_id]
            ).area
            if overlap > 0.01:
                raise ValueError(
                    f"{first_id} 与 {second_id} 米制拓扑仍重叠 {overlap:.4f} 平方米"
                )

    linework = unary_union([
        geometry.boundary for geometry in projected_by_id.values()
    ])
    faces = list(polygonize(linework))
    assigned_faces = {sector_id: [] for sector_id in sector_ids}
    for face in faces:
        point = face.representative_point()
        matches = [
            sector_id for sector_id, geometry in projected_by_id.items()
            if geometry.covers(point)
        ]
        if matches:
            assigned_faces[matches[0]].append(face)

    merged_by_id = {
        sector_id: normalize_polygonal(unary_union(assigned_faces[sector_id]))
        for sector_id in sector_ids
    }
    final_linework = unary_union([
        geometry.boundary for geometry in merged_by_id.values()
    ])
    topology_vertices = collect_line_vertices(final_linework)

    finalized = {}
    for sector_id in sector_ids:
        definition = definition_by_id[sector_id]
        if not assigned_faces[sector_id]:
            raise ValueError(
                f"{definition['canonicalName']} 米制拓扑没有可分配面"
            )
        projected = insert_polygon_boundary_vertices(
            merged_by_id[sector_id],
            topology_vertices,
        )
        output_geometry = project_geometry(
            projected,
            working_crs,
            output_crs,
        )
        if group.get("roundOutputCoordinatesDigits") is not None:
            output_geometry = round_polygonal_geometry(
                output_geometry,
                int(group["roundOutputCoordinatesDigits"]),
            )
        feature = feature_by_id[sector_id]
        displacement = projected.boundary.hausdorff_distance(
            source_projected_by_id[sector_id].boundary
        )
        if displacement > snap_distance + 0.1:
            raise ValueError(
                f"{definition['canonicalName']} 米制拓扑最大位移 {displacement:.2f} 米，"
                f"超出声明连接距离 {snap_distance:.2f} 米"
            )
        previous_snap_distance = float(
            feature["properties"].get("topologySnapDistanceMeters", 0)
        )
        previous_displacement = float(
            feature["properties"].get(
                "topologyMaxBoundaryDisplacementMeters",
                0,
            )
        )
        feature["properties"]["topologySnapDistanceMeters"] = max(
            previous_snap_distance,
            snap_distance,
        )
        feature["properties"]["topologyMaxBoundaryDisplacementMeters"] = round(
            max(previous_displacement, displacement),
            2,
        )
        area_km2 = projected.area / 1_000_000
        feature["properties"]["areaSquareKilometers"] = round(area_km2, 4)
        official_area = feature["properties"].get(
            "officialAreaSquareKilometers"
        )
        if official_area is not None:
            signed_delta_ratio = (
                area_km2 - float(official_area)
            ) / float(official_area)
            if abs(signed_delta_ratio) > float(definition["areaToleranceRatio"]):
                raise ValueError(
                    f"{definition['canonicalName']} 米制拓扑后面积超出官方参考容差"
                )
            feature["properties"]["areaDeltaPercent"] = round(
                signed_delta_ratio * 100,
                2,
            )
        elif definition.get("areaRangeSquareKilometers") is not None:
            minimum_area, maximum_area = map(
                float,
                definition["areaRangeSquareKilometers"],
            )
            if not minimum_area <= area_km2 <= maximum_area:
                raise ValueError(
                    f"{definition['canonicalName']} 米制拓扑后面积 {area_km2:.4f} km² "
                    f"超出安全范围 {minimum_area:.4f}–{maximum_area:.4f} km²"
                )
        representative = output_geometry.representative_point()
        feature["properties"]["labelPoint"] = [
            round(representative.x, 7),
            round(representative.y, 7),
        ]
        feature["geometry"] = mapping(output_geometry)
        finalized[sector_id] = output_geometry
    return finalized


def collect_line_vertices(geometry) -> list[tuple[float, float]]:
    if geometry.geom_type in {"LineString", "LinearRing"}:
        return [(float(x), float(y)) for x, y, *_ in geometry.coords]
    if hasattr(geometry, "geoms"):
        return [
            vertex
            for part in geometry.geoms
            for vertex in collect_line_vertices(part)
        ]
    return []


def insert_ring_vertices(
    coordinates,
    topology_vertices: list[tuple[float, float]],
    tolerance: float = 1e-6,
):
    result = []
    for start, end in zip(coordinates, coordinates[1:]):
        start = (float(start[0]), float(start[1]))
        end = (float(end[0]), float(end[1]))
        result.append(start)
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length_squared = dx * dx + dy * dy
        if length_squared <= tolerance * tolerance:
            continue
        length = math.sqrt(length_squared)
        candidates = []
        minimum_x = min(start[0], end[0]) - tolerance
        maximum_x = max(start[0], end[0]) + tolerance
        minimum_y = min(start[1], end[1]) - tolerance
        maximum_y = max(start[1], end[1]) + tolerance
        for vertex in topology_vertices:
            if not (
                minimum_x <= vertex[0] <= maximum_x
                and minimum_y <= vertex[1] <= maximum_y
            ):
                continue
            offset_x = vertex[0] - start[0]
            offset_y = vertex[1] - start[1]
            distance = abs(dx * offset_y - dy * offset_x) / length
            if distance > tolerance:
                continue
            scale = (offset_x * dx + offset_y * dy) / length_squared
            if tolerance / length < scale < 1 - tolerance / length:
                candidates.append((scale, vertex))
        for _, vertex in sorted(set(candidates)):
            if vertex != result[-1]:
                result.append(vertex)
    result.append(result[0])
    return result


def insert_polygon_boundary_vertices(
    geometry,
    topology_vertices: list[tuple[float, float]],
    tolerance: float = 1e-6,
):
    rebuilt = []
    for part in polygons(geometry):
        shell = insert_ring_vertices(
            part.exterior.coords,
            topology_vertices,
            tolerance,
        )
        holes = [
            insert_ring_vertices(
                interior.coords,
                topology_vertices,
                tolerance,
            )
            for interior in part.interiors
        ]
        rebuilt.append(orient(Polygon(shell, holes), sign=1))
    return normalize_polygonal(
        rebuilt[0] if len(rebuilt) == 1 else MultiPolygon(rebuilt)
    )


def canonicalize_topology_group_output_vertices(
    feature_by_id: dict[str, dict[str, Any]],
    geometry_by_id: dict[str, Any],
    group: dict[str, Any],
):
    """Give both sides of every output-CRS shared edge the same split vertices."""
    sector_ids = group["prioritySectorIds"]
    linework = unary_union([
        geometry_by_id[sector_id].boundary
        for sector_id in sector_ids
    ])
    topology_vertices = collect_line_vertices(linework)
    finalized = {}
    for sector_id in sector_ids:
        geometry = insert_polygon_boundary_vertices(
            geometry_by_id[sector_id],
            topology_vertices,
            tolerance=1e-11,
        )
        if (
            group.get("roundAfterProtectedSubtraction", True)
            and group.get("roundOutputCoordinatesDigits") is not None
        ):
            geometry = round_polygonal_geometry(
                geometry,
                int(group["roundOutputCoordinatesDigits"]),
            )
        feature = feature_by_id[sector_id]
        representative = geometry.representative_point()
        feature["geometry"] = mapping(geometry)
        feature["properties"]["labelPoint"] = [
            round(representative.x, 7),
            round(representative.y, 7),
        ]
        finalized[sector_id] = geometry
    return finalized


def inherit_protected_output_boundary(
    candidate,
    protected,
    snap_distance_meters: float,
):
    """Close sub-metre round-trip gaps, then cut with the protected WGS84 edge."""
    snap_distance_degrees = snap_distance_meters / 111_320
    protected_edge_zone = protected.boundary.buffer(snap_distance_degrees)
    bridge = candidate.buffer(snap_distance_degrees).intersection(
        protected_edge_zone
    )
    return normalize_polygonal(
        candidate.union(bridge).difference(protected)
    )


def recompute_final_anchor_coverage(
    gpkg: Path,
    definition: dict[str, Any],
    geometry,
    osm_refs: dict[str, Any],
    working_crs: str,
    output_crs: str,
):
    if not definition.get("boundaryAnchors"):
        return
    bbox_value = tuple(definition["bbox"])
    projected = project_geometry(geometry, output_crs, working_crs)
    tolerance = float(definition["centerlineToleranceMeters"])
    boundary_buffer = projected.boundary.buffer(tolerance)
    road_refs = set()
    waterway_refs = set()
    manifest_by_side = {
        anchor["side"]: anchor
        for anchor in osm_refs["boundaryAnchors"]
    }

    for anchor in definition["boundaryAnchors"]:
        components = anchor.get("components") or [{
            "featureType": anchor["featureType"],
            "expectedIdentity": anchor["expectedIdentity"],
            "match": anchor["match"],
        }]
        component_frames = []
        for component in components:
            layer = {
                "road": "gis_osm_roads_free",
                "waterway": "gis_osm_waterways_free",
            }[component["featureType"]]
            match = component["match"]
            names = match.get("names", [])
            osm_ids = {str(value) for value in match.get("osmIds", [])}
            read_options = {"layer": layer, "bbox": bbox_value}
            if names and not osm_ids:
                read_options["where"] = sql_names(names)
            frame = pyogrio.read_dataframe(gpkg, **read_options)
            frame = frame[
                frame["name"].isin(names)
                | frame["osm_id"].astype(str).isin(osm_ids)
            ].to_crs(working_crs)
            component_frames.append((component, frame))

        anchor_union = unary_union([
            geometry
            for _, frame in component_frames
            for geometry in frame.geometry
        ])
        coverage = projected.boundary.intersection(
            anchor_union.buffer(tolerance)
        ).length
        minimum_coverage = float(anchor["minimumBoundaryCoverageMeters"])
        if coverage < minimum_coverage:
            raise ValueError(
                f"{definition['canonicalName']} {anchor['side']} 侧最终边界在 "
                f"{tolerance:.0f} 米容差内只覆盖 {coverage:.1f} 米，"
                f"低于 {minimum_coverage:.1f} 米"
            )

        minimum_object_coverage = float(
            anchor.get("minimumObjectCoverageMeters", 1)
        )
        final_refs = set()
        component_manifest = []
        for component, frame in component_frames:
            input_refs = sorted({str(value) for value in frame.osm_id})
            boundary_frame = frame[
                frame.geometry.map(
                    lambda candidate: candidate.intersection(boundary_buffer).length
                    >= minimum_object_coverage
                )
            ]
            refs = sorted({str(value) for value in boundary_frame.osm_id})
            if not refs:
                raise ValueError(
                    f"{definition['canonicalName']} {anchor['side']} 侧最终边界"
                    f"没有对象达到 {minimum_object_coverage:.1f} 米贴合长度"
                )
            final_refs.update(refs)
            if component["featureType"] == "road":
                road_refs.update(refs)
            else:
                waterway_refs.update(refs)
            component_manifest.append({
                "featureType": component["featureType"],
                "expectedIdentity": component["expectedIdentity"],
                "osmRefs": refs,
                "inputOsmRefs": input_refs,
            })

        manifest = manifest_by_side[anchor["side"]]
        manifest["featureType"] = anchor["featureType"]
        manifest["expectedIdentity"] = anchor["expectedIdentity"]
        manifest["identityStatus"] = anchor["identityStatus"]
        manifest["verificationSourceIds"] = anchor["verificationSourceIds"]
        manifest["osmRefs"] = sorted(final_refs)
        manifest["boundaryCoverageWithinToleranceMeters"] = round(coverage, 1)
        manifest["coverageStage"] = "final-topology"
        if anchor.get("note"):
            manifest["note"] = anchor["note"]
        else:
            manifest.pop("note", None)
        if anchor.get("components"):
            manifest["components"] = component_manifest

    osm_refs["roads"] = sorted(road_refs)
    osm_refs["waterways"] = sorted(waterway_refs)


def build_market_linear_component_with_shared_topology(
    gpkg: Path,
    definition: dict[str, Any],
    working_crs: str,
    output_crs: str,
):
    geometry, area, osm_refs = build_market_linear_component(
        gpkg,
        definition,
        working_crs,
        output_crs,
    )
    osm_refs["sharedEdgeSectorIds"] = definition["sharedEdgeSectorIds"]
    osm_refs["sharedEdgeSnapDistanceMeters"] = float(
        definition["sharedEdgeSnapDistanceMeters"]
    )
    return geometry, area, osm_refs


def build_feature(
    definition: dict[str, Any],
    geometry,
    area_square_meters: float,
    snapshot_id: str,
):
    area_km2 = area_square_meters / 1_000_000
    official_area = definition.get("officialAreaSquareKilometers")
    area_range = definition.get("areaRangeSquareKilometers")
    signed_delta_ratio = None
    if official_area is not None:
        official_area = float(official_area)
        signed_delta_ratio = (area_km2 - official_area) / official_area
        if abs(signed_delta_ratio) > definition["areaToleranceRatio"]:
            raise ValueError(
                f"{definition['canonicalName']} 候选面积 {area_km2:.4f} km² 超出容差，"
                f"官方参考 {official_area:.4f} km²"
            )
    elif area_range is not None:
        minimum_area, maximum_area = map(float, area_range)
        if not minimum_area <= area_km2 <= maximum_area:
            raise ValueError(
                f"{definition['canonicalName']} 候选面积 {area_km2:.4f} km² "
                f"超出安全范围 {minimum_area:.4f}–{maximum_area:.4f} km²"
            )
    else:
        raise ValueError(f"{definition['canonicalName']} 缺少面积安全检查")
    representative = geometry.representative_point()
    geometry_mapping = mapping(geometry)
    if not definition.get("preserveTopologyPrecision"):
        geometry_mapping["coordinates"] = round_coordinates(
            geometry_mapping["coordinates"],
        )
    feature = {
        "type": "Feature",
        "properties": {
            "id": definition["id"],
            "name": definition["canonicalName"],
            "scopeVersion": definition["scopeVersion"],
            "status": "reviewed-candidate",
            "confidence": definition.get("confidence", "medium"),
            "coordinateSystem": "WGS84",
            "geometrySourceSnapshotId": snapshot_id,
            "method": definition["method"],
            "geometryRule": definition["geometryRule"],
            "definitionSourceIds": definition["definitionSourceIds"],
            **({
                "riskFlags": definition["riskFlags"],
            } if definition.get("riskFlags") else {}),
            **({
                "adminProxyName": definition["adminProxyName"],
            } if definition.get("adminProxyName") else {}),
            **({
                "marketAdminAlignmentUnverified": bool(
                    definition["marketAdminAlignmentUnverified"]
                ),
            } if "marketAdminAlignmentUnverified" in definition else {}),
            **({
                "fullAdminRelationRejected": bool(
                    definition["fullAdminRelationRejected"]
                ),
            } if "fullAdminRelationRejected" in definition else {}),
            **({
                "fullAdminUnionRejected": bool(
                    definition["fullAdminUnionRejected"]
                ),
            } if "fullAdminUnionRejected" in definition else {}),
            **({
                "adminAreaVersionMismatch": bool(
                    definition["adminAreaVersionMismatch"]
                ),
            } if "adminAreaVersionMismatch" in definition else {}),
            **({
                "excludedArea": definition["excludedArea"],
            } if definition.get("excludedArea") else {}),
            **({
                "sharedEdgeReview": definition["sharedEdgeReview"],
            } if definition.get("sharedEdgeReview") else {}),
            **({
                "protectedAdminRelations": definition[
                    "protectedAdminRelations"
                ],
            } if definition.get("protectedAdminRelations") else {}),
            **({
                "geometryVerificationSourceIds": definition[
                    "geometryVerificationSourceIds"
                ],
            } if definition.get("geometryVerificationSourceIds") else {}),
            **({
                "includedMarketAreas": definition["includedMarketAreas"],
            } if definition.get("includedMarketAreas") else {}),
            **({
                "excludedMarketAreas": definition["excludedMarketAreas"],
            } if definition.get("excludedMarketAreas") else {}),
            **({
                "projectProxyName": definition["projectProxyName"],
            } if definition.get("projectProxyName") else {}),
            **({
                "projectLanduseOsmIds": [
                    str(value)
                    for value in definition["projectLanduseOsmIds"]
                ],
            } if definition.get("projectLanduseOsmIds") else {}),
            **({
                "historicalReferenceAreaSquareKilometers": float(
                    definition["historicalReferenceAreaSquareKilometers"]
                ),
                "historicalReferenceAreaAsOf": definition[
                    "historicalReferenceAreaAsOf"
                ],
            } if definition.get("historicalReferenceAreaSquareKilometers") else {}),
            **({
                "boundaryAnchors": [{
                    "side": anchor["side"],
                    "featureType": anchor["featureType"],
                    "expectedIdentity": anchor["expectedIdentity"],
                    "identityStatus": anchor["identityStatus"],
                    "verificationSourceIds": anchor["verificationSourceIds"],
                    **({
                        "components": [{
                            "featureType": component["featureType"],
                            "expectedIdentity": component["expectedIdentity"],
                        } for component in anchor["components"]],
                    } if anchor.get("components") else {}),
                    **({"note": anchor["note"]} if anchor.get("note") else {}),
                } for anchor in definition["boundaryAnchors"]],
            } if definition.get("boundaryAnchors") else {}),
            **({
                "sharedEdgeSectorIds": definition["sharedEdgeSectorIds"],
            } if definition.get("sharedEdgeSectorIds") else {}),
            **({
                "snapDependencySectorIds": definition["snapDependencySectorIds"],
            } if "snapDependencySectorIds" in definition else {}),
            **({
                "sharedEdgeSnapDistanceMeters": float(
                    definition["sharedEdgeSnapDistanceMeters"]
                ),
            } if definition.get("sharedEdgeSnapDistanceMeters") else {}),
            "areaSquareKilometers": round(area_km2, 4),
            "labelPoint": [round(representative.x, 7), round(representative.y, 7)],
        },
        "geometry": geometry_mapping,
    }
    if official_area is not None and signed_delta_ratio is not None:
        feature["properties"]["officialAreaSquareKilometers"] = official_area
        feature["properties"]["areaDeltaPercent"] = round(
            signed_delta_ratio * 100,
            2,
        )
    if area_range is not None:
        feature["properties"]["areaSafetyRangeSquareKilometers"] = area_range
    return feature


def build_subscope_feature(
    definition: dict[str, Any],
    geometry,
    area_square_meters: float,
    snapshot_id: str,
):
    feature = build_feature(definition, geometry, area_square_meters, snapshot_id)
    feature["properties"].update({
        "parentSectorId": definition["parentSectorId"],
        "status": "official-reference-subscope",
    })
    return feature


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpkg", type=Path, required=True)
    parser.add_argument("--definitions", type=Path, default=DEFAULT_DEFINITIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--subscopes-output", type=Path, default=DEFAULT_SUBSCOPES_OUTPUT)
    args = parser.parse_args()

    definitions = load_definitions(args.definitions)
    source_lock_path = REPO_ROOT / definitions["sourceLock"]
    source_lock = read_json(source_lock_path)
    actual_hash = sha256(args.gpkg)
    if actual_hash != source_lock["gpkgSha256"]:
        raise ValueError(f"GeoPackage SHA-256 不匹配：{actual_hash}")

    features = []
    manifest_sectors = []
    sector_geometry_by_id = {}
    topology_geometry_by_id = {}
    definition_by_id = {
        definition["id"]: definition
        for definition in definitions["sectors"]
    }
    for definition in definitions["sectors"]:
        if definition["method"] == "market_four_sides_osm_linear_component":
            geometry, area, osm_refs = build_market_linear_component(
                args.gpkg,
                definition,
                definitions["workingCrs"],
                definitions["outputCrs"],
            )
        elif definition["method"] == "market_four_sides_osm_linear_component_minus_candidates":
            geometry, area, osm_refs = build_market_linear_component_minus_candidates(
                args.gpkg,
                definition,
                definitions["workingCrs"],
                definitions["outputCrs"],
                topology_geometry_by_id,
            )
        elif definition["method"] == "market_four_sides_osm_linear_component_with_shared_topology":
            geometry, area, osm_refs = build_market_linear_component_with_shared_topology(
                args.gpkg,
                definition,
                definitions["workingCrs"],
                definitions["outputCrs"],
            )
        elif definition["method"] == "official_four_sides_osm_land_component":
            geometry, area, osm_refs = build_qiantan(
                args.gpkg,
                definition,
                definitions["workingCrs"],
                definitions["outputCrs"],
            )
        elif definition["method"] == "official_four_sides_matching_osm_admin_relation":
            geometry, area, osm_refs = build_osm_admin_candidate(
                args.gpkg,
                definition,
                definitions["workingCrs"],
            )
        elif definition["method"] == "named_osm_landuse_project_proxy":
            geometry, area, osm_refs = build_named_osm_landuse_project_proxy(
                args.gpkg,
                definition,
                definitions["workingCrs"],
                definitions["outputCrs"],
            )
        elif definition["method"] == "market_admin_union_minus_market_candidates":
            geometry, area, osm_refs = (
                build_market_admin_union_minus_market_candidates(
                    args.gpkg,
                    definition,
                    definitions["workingCrs"],
                    definitions["outputCrs"],
                    topology_geometry_by_id,
                )
            )
        elif definition["method"] == "market_admin_outer_shell_minus_market_candidates":
            geometry, area, osm_refs = build_market_admin_outer_shell(
                args.gpkg,
                definition,
                definitions["workingCrs"],
                definitions["outputCrs"],
                topology_geometry_by_id,
            )
        elif definition["method"] in {
            "market_admin_candidate_with_shared_topology",
            "non_same_name_admin_proxy",
        }:
            geometry, area, osm_refs = build_market_admin_candidate_with_shared_topology(
                args.gpkg,
                definition,
                definitions["workingCrs"],
                definitions["outputCrs"],
                topology_geometry_by_id,
            )
        elif definition["method"] == "official_residential_subarea_proxy":
            geometry, area, osm_refs = build_official_residential_subarea_proxy(
                args.gpkg,
                definition,
                definitions["workingCrs"],
                definitions["outputCrs"],
            )
        elif definition["method"] == "selected_workpack_candidate_with_shared_topology":
            geometry, area, osm_refs = build_selected_workpack_candidate(
                definition,
                definitions.get("workpackSources", {}),
                definitions["workingCrs"],
                definitions["outputCrs"],
                source_lock["id"],
            )
        else:
            raise ValueError(f"未知构建方法：{definition['method']}")
        if definition.get("sharedEdgeSectorIds"):
            osm_refs["sharedEdgeSectorIds"] = definition["sharedEdgeSectorIds"]
        if "snapDependencySectorIds" in definition:
            osm_refs["snapDependencySectorIds"] = definition[
                "snapDependencySectorIds"
            ]
        feature = build_feature(definition, geometry, area, source_lock["id"])
        finalized_geometry = shape(feature["geometry"])
        features.append(feature)
        sector_geometry_by_id[definition["id"]] = finalized_geometry
        topology_geometry_by_id[definition["id"]] = (
            finalized_geometry
            if definition.get("sharedEdgeSectorIds")
            else geometry
        )
        manifest_sectors.append({
            "id": definition["id"],
            "scopeVersion": definition["scopeVersion"],
            "method": definition["method"],
            "osmRefs": osm_refs,
        })

    feature_by_id = {
        feature["properties"]["id"]: feature
        for feature in features
    }
    for group in definitions.get("topologyGroups", []):
        finalized_group = finalize_topology_group(
            feature_by_id,
            topology_geometry_by_id,
            definition_by_id,
            group,
            definitions["workingCrs"],
            definitions["outputCrs"],
        )
        sector_geometry_by_id.update(finalized_group)
        topology_geometry_by_id.update(finalized_group)

    manifest_by_id = {
        entry["id"]: entry
        for entry in manifest_sectors
    }
    for definition in definitions["sectors"]:
        subtract_ids = definition.get("subtractSectorIds", [])
        if (
            definition["method"]
            != "market_admin_candidate_with_shared_topology"
            or not subtract_ids
        ):
            continue
        protected = unary_union([
            topology_geometry_by_id[sector_id]
            for sector_id in subtract_ids
        ])
        corrected = inherit_protected_output_boundary(
            topology_geometry_by_id[definition["id"]],
            protected,
            float(definition["sharedEdgeSnapDistanceMeters"]),
        )
        projected = project_geometry(
            corrected,
            definitions["outputCrs"],
            definitions["workingCrs"],
        )
        inside_point = Point(*definition["insidePoint"])
        if not corrected.contains(inside_point):
            raise ValueError(
                f"{definition['canonicalName']} 拓扑总装后二次扣除不包含裁定点"
            )
        feature = feature_by_id[definition["id"]]
        representative = corrected.representative_point()
        feature["geometry"] = mapping(corrected)
        feature["properties"]["areaSquareKilometers"] = round(
            projected.area / 1_000_000,
            4,
        )
        feature["properties"]["labelPoint"] = [
            round(representative.x, 7),
            round(representative.y, 7),
        ]
        topology_geometry_by_id[definition["id"]] = corrected
        sector_geometry_by_id[definition["id"]] = corrected
        manifest_by_id[definition["id"]]["osmRefs"][
            "protectedSubtractionStage"
        ] = "post-topology-output-crs"

    for group in definitions.get("topologyGroups", []):
        if not group.get("canonicalizeAfterProtectedSubtraction"):
            continue
        finalized_group = canonicalize_topology_group_output_vertices(
            feature_by_id,
            topology_geometry_by_id,
            group,
        )
        topology_geometry_by_id.update(finalized_group)
        sector_geometry_by_id.update(finalized_group)

    for definition in definitions["sectors"]:
        recompute_final_anchor_coverage(
            args.gpkg,
            definition,
            topology_geometry_by_id[definition["id"]],
            manifest_by_id[definition["id"]]["osmRefs"],
            definitions["workingCrs"],
            definitions["outputCrs"],
        )

    subscope_features = []
    manifest_subscopes = []
    for definition in definitions.get("subscopes", []):
        if definition["method"] != "official_four_sides_osm_land_component":
            raise ValueError(f"未知子范围构建方法：{definition['method']}")
        geometry, area, osm_refs = build_qiantan(
            args.gpkg,
            definition,
            definitions["workingCrs"],
            definitions["outputCrs"],
        )
        parent_geometry = sector_geometry_by_id.get(definition["parentSectorId"])
        if parent_geometry is None:
            raise ValueError(
                f"{definition['canonicalName']} 找不到主板块 {definition['parentSectorId']}"
            )
        projected_subscope = project_geometry(
            geometry,
            definitions["outputCrs"],
            definitions["workingCrs"],
        )
        projected_parent = project_geometry(
            parent_geometry,
            definitions["outputCrs"],
            definitions["workingCrs"],
        )
        outside_ratio = projected_subscope.difference(projected_parent).area / projected_subscope.area
        if outside_ratio > float(definition["maximumOutsideParentRatio"]):
            raise ValueError(
                f"{definition['canonicalName']} 超出主板块的面积比例为 {outside_ratio:.6%}"
            )
        subscope_features.append(
            build_subscope_feature(definition, geometry, area, source_lock["id"])
        )
        manifest_subscopes.append({
            "id": definition["id"],
            "parentSectorId": definition["parentSectorId"],
            "scopeVersion": definition["scopeVersion"],
            "method": definition["method"],
            "osmRefs": osm_refs,
            "outsideParentAreaRatio": round(outside_ratio, 8),
        })

    collection = {
        "type": "FeatureCollection",
        "name": "reviewed-sector-candidates-wgs84",
        "schemaVersion": "1.0.0",
        "status": "internal-review",
        "notice": "研究候选边界，非行政区划、非法定界址、非行业统一楼市板块。",
        "license": source_lock["license"],
        "attribution": source_lock["attribution"],
        "sourceSnapshotId": source_lock["id"],
        "features": features,
    }
    manifest = {
        "schemaVersion": "1.0.0",
        "generatedFrom": str(args.definitions.relative_to(REPO_ROOT)),
        "sourceLock": str(source_lock_path.relative_to(REPO_ROOT)),
        "sourceSnapshotId": source_lock["id"],
        "sourceGpkgSha256": actual_hash,
        "workingCrs": definitions["workingCrs"],
        "outputCrs": definitions["outputCrs"],
        "sectors": manifest_sectors,
        "subscopes": manifest_subscopes,
    }
    subscopes_collection = {
        "type": "FeatureCollection",
        "name": "sector-subscopes-wgs84",
        "schemaVersion": "1.0.0",
        "status": "internal-reference",
        "notice": "主楼市板块内部参考子范围；不参与主板块互斥分区，不创建新的主板块身份。",
        "license": source_lock["license"],
        "attribution": source_lock["attribution"],
        "sourceSnapshotId": source_lock["id"],
        "features": subscope_features,
    }
    for output_path in [args.output, args.manifest, args.subscopes_output]:
        output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.subscopes_output.write_text(
        json.dumps(subscopes_collection, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    try:
        displayed_output = args.output.relative_to(REPO_ROOT)
    except ValueError:
        displayed_output = args.output.resolve()
    print(
        f"生成 {len(features)} 个候选面和 {len(subscope_features)} 个子范围："
        f"{displayed_output}"
    )


if __name__ == "__main__":
    main()
