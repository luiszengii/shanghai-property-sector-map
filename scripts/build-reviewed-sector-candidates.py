# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "geopandas==1.1.4",
#   "pyogrio==0.13.0",
#   "pyproj==3.7.2",
#   "shapely==2.1.2",
# ]
# ///

"""Build the two reviewed Shanghai sector geometry candidates.

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
    official_area = float(definition["officialAreaSquareKilometers"])
    area_km2 = area_square_meters / 1_000_000
    delta_ratio = abs(area_km2 - official_area) / official_area
    if delta_ratio > definition["areaToleranceRatio"]:
        raise ValueError(
            f"{definition['canonicalName']} 候选面积 {area_km2:.4f} km² 超出容差，"
            f"官方参考 {official_area:.4f} km²"
        )
    representative = geometry.representative_point()
    geometry_mapping = mapping(geometry)
    geometry_mapping["coordinates"] = round_coordinates(geometry_mapping["coordinates"])
    return {
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
            "areaSquareKilometers": round(area_km2, 4),
            "officialAreaSquareKilometers": official_area,
            "areaDeltaPercent": round(delta_ratio * 100, 2),
            "labelPoint": [round(representative.x, 7), round(representative.y, 7)],
        },
        "geometry": geometry_mapping,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpkg", type=Path, required=True)
    parser.add_argument("--definitions", type=Path, default=DEFAULT_DEFINITIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()

    definitions = read_json(args.definitions)
    source_lock_path = REPO_ROOT / definitions["sourceLock"]
    source_lock = read_json(source_lock_path)
    actual_hash = sha256(args.gpkg)
    if actual_hash != source_lock["gpkgSha256"]:
        raise ValueError(f"GeoPackage SHA-256 不匹配：{actual_hash}")

    features = []
    manifest_sectors = []
    for definition in definitions["sectors"]:
        if definition["method"] == "official_four_sides_osm_land_component":
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
        manifest_sectors.append({
            "id": definition["id"],
            "scopeVersion": definition["scopeVersion"],
            "method": definition["method"],
            "osmRefs": osm_refs,
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
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"生成 {len(features)} 个候选面：{args.output.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
