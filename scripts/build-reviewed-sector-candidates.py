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
from pathlib import Path
from typing import Any

import geopandas as gpd
import pyogrio
from shapely.geometry import MultiPolygon, Point, Polygon, box, mapping
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.validation import make_valid


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEFINITIONS = REPO_ROOT / "data/geo/reviewed-candidate-definitions.json"
DEFAULT_OUTPUT = REPO_ROOT / "src/data/sectors/reviewed-candidates.wgs84.json"
DEFAULT_MANIFEST = REPO_ROOT / "src/data/sectors/reviewed-candidates.manifest.json"
DEFAULT_SUBSCOPES_OUTPUT = REPO_ROOT / "src/data/sectors/subscopes.wgs84.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


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
        layer = {
            "road": "gis_osm_roads_free",
            "waterway": "gis_osm_waterways_free",
        }.get(anchor["featureType"])
        if layer is None:
            raise ValueError(f"未知边界锚点类型：{anchor['featureType']}")
        match = anchor["match"]
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
                f"{anchor['expectedIdentity']} 没有匹配 OSM 对象"
            )
        frame = frame.to_crs(working_crs)
        anchor_frames.append((anchor, frame))
        boundary_geometries.extend(frame.geometry)

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
    for anchor, frame in anchor_frames:
        anchor_union = unary_union(frame.geometry)
        coverage = restored.boundary.intersection(anchor_union.buffer(tolerance)).length
        minimum_coverage = float(anchor["minimumBoundaryCoverageMeters"])
        if coverage < minimum_coverage:
            raise ValueError(
                f"{definition['canonicalName']} {anchor['side']} 侧边界在 {tolerance:.0f} 米"
                f"容差内只覆盖 {coverage:.1f} 米，低于 {minimum_coverage:.1f} 米"
            )
        refs = sorted({str(value) for value in frame.osm_id})
        if anchor["featureType"] == "road":
            road_refs.update(refs)
        else:
            waterway_refs.update(refs)
        anchor_manifest.append({
            "side": anchor["side"],
            "featureType": anchor["featureType"],
            "expectedIdentity": anchor["expectedIdentity"],
            "identityStatus": anchor["identityStatus"],
            "verificationSourceIds": anchor["verificationSourceIds"],
            "osmRefs": refs,
            "boundaryCoverageWithinToleranceMeters": round(coverage, 1),
            "centerlineToleranceMeters": tolerance,
            **({"note": anchor["note"]} if anchor.get("note") else {}),
        })

    output_geometry = project_geometry(restored, working_crs, output_crs)
    osm_refs = {
        "roads": sorted(road_refs),
        "waterways": sorted(waterway_refs),
        "boundaryAnchors": anchor_manifest,
    }
    return output_geometry, float(restored.area), osm_refs


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


def build_feature(
    definition: dict[str, Any],
    geometry,
    area_square_meters: float,
    snapshot_id: str,
):
    area_km2 = area_square_meters / 1_000_000
    official_area = definition.get("officialAreaSquareKilometers")
    area_range = definition.get("areaRangeSquareKilometers")
    delta_ratio = None
    if official_area is not None:
        official_area = float(official_area)
        delta_ratio = abs(area_km2 - official_area) / official_area
        if delta_ratio > definition["areaToleranceRatio"]:
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
    geometry_mapping["coordinates"] = round_coordinates(geometry_mapping["coordinates"])
    feature = {
        "type": "Feature",
        "properties": {
            "id": definition["id"],
            "name": definition["canonicalName"],
            "scopeVersion": definition["scopeVersion"],
            "status": "reviewed-candidate",
            "confidence": "medium",
            "coordinateSystem": "WGS84",
            "geometrySourceSnapshotId": snapshot_id,
            "method": definition["method"],
            "geometryRule": definition["geometryRule"],
            "definitionSourceIds": definition["definitionSourceIds"],
            **({
                "boundaryAnchors": [{
                    "side": anchor["side"],
                    "featureType": anchor["featureType"],
                    "expectedIdentity": anchor["expectedIdentity"],
                    "identityStatus": anchor["identityStatus"],
                    "verificationSourceIds": anchor["verificationSourceIds"],
                    **({"note": anchor["note"]} if anchor.get("note") else {}),
                } for anchor in definition["boundaryAnchors"]],
            } if definition.get("boundaryAnchors") else {}),
            "areaSquareKilometers": round(area_km2, 4),
            "labelPoint": [round(representative.x, 7), round(representative.y, 7)],
        },
        "geometry": geometry_mapping,
    }
    if official_area is not None and delta_ratio is not None:
        feature["properties"]["officialAreaSquareKilometers"] = official_area
        feature["properties"]["areaDeltaPercent"] = round(delta_ratio * 100, 2)
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

    definitions = read_json(args.definitions)
    source_lock_path = REPO_ROOT / definitions["sourceLock"]
    source_lock = read_json(source_lock_path)
    actual_hash = sha256(args.gpkg)
    if actual_hash != source_lock["gpkgSha256"]:
        raise ValueError(f"GeoPackage SHA-256 不匹配：{actual_hash}")

    features = []
    manifest_sectors = []
    sector_geometry_by_id = {}
    for definition in definitions["sectors"]:
        if definition["method"] == "market_four_sides_osm_linear_component":
            geometry, area, osm_refs = build_market_linear_component(
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
        else:
            raise ValueError(f"未知构建方法：{definition['method']}")
        features.append(build_feature(definition, geometry, area, source_lock["id"]))
        sector_geometry_by_id[definition["id"]] = geometry
        manifest_sectors.append({
            "id": definition["id"],
            "scopeVersion": definition["scopeVersion"],
            "method": definition["method"],
            "osmRefs": osm_refs,
        })

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
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.subscopes_output.write_text(
        json.dumps(subscopes_collection, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"生成 {len(features)} 个候选面和 {len(subscope_features)} 个子范围："
        f"{args.output.relative_to(REPO_ROOT)}"
    )


if __name__ == "__main__":
    main()
