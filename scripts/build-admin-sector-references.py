# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "geopandas==1.1.4",
#   "pyogrio==0.13.0",
#   "pyproj==3.7.2",
#   "shapely==2.1.2",
# ]
# ///

"""Build auditable administrative reference faces for ambiguous market sectors.

The script reads only the fixed Geofabrik GeoPackage named by the source lock.
Tianditu standard maps are recorded as visual checks; their PDF paths are never
converted into coordinates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import pyogrio
from shapely.geometry import MultiPolygon, Polygon, mapping
from shapely.geometry.polygon import orient
from shapely.validation import make_valid


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEFINITIONS = REPO_ROOT / "data/geo/admin-reference-definitions.json"
DEFAULT_OUTPUT = REPO_ROOT / "src/data/sectors/admin-references.wgs84.json"
DEFAULT_MANIFEST = REPO_ROOT / "src/data/sectors/admin-references.manifest.json"


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


def polygon_parts(geometry) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return [item for item in getattr(geometry, "geoms", []) if isinstance(item, Polygon)]


def normalize_polygonal(geometry):
    valid = make_valid(geometry)
    parts = [orient(part, sign=1.0) for part in polygon_parts(valid) if not part.is_empty]
    if not parts:
        raise ValueError("Geometry did not produce a polygon")
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def round_coordinates(value: Any, digits: int = 7):
    if isinstance(value, (float, int)):
        return round(float(value), digits)
    return [round_coordinates(item, digits) for item in value]


def point_count(geometry) -> int:
    return sum(
        len(part.exterior.coords) + sum(len(ring.coords) for ring in part.interiors)
        for part in polygon_parts(geometry)
    )


def build_reference(gpkg: Path, definition: dict[str, Any], working_crs: str, output_crs: str):
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

    source_geometry = normalize_polygonal(row.geometry)
    projected = project_geometry(source_geometry, frame.crs, working_crs)
    source_area_square_meters = float(projected.area)
    simplified_projected = normalize_polygonal(
        projected.simplify(definition["simplifyToleranceMeters"], preserve_topology=True)
    )
    display_area_square_meters = float(simplified_projected.area)
    output_geometry = normalize_polygonal(
        project_geometry(simplified_projected, working_crs, output_crs)
    )

    official_area = float(definition["officialAreaSquareKilometers"])
    source_area_km2 = source_area_square_meters / 1_000_000
    display_area_km2 = display_area_square_meters / 1_000_000
    official_delta_ratio = abs(source_area_km2 - official_area) / official_area
    if official_delta_ratio > definition["areaToleranceRatio"]:
        raise ValueError(
            f"{definition['referenceAdminName']} OSM 面积 {source_area_km2:.4f} km² 超出容差，"
            f"官方参考 {official_area:.4f} km²"
        )

    representative = output_geometry.representative_point()
    geometry_mapping = mapping(output_geometry)
    geometry_mapping["coordinates"] = round_coordinates(geometry_mapping["coordinates"])
    feature = {
        "type": "Feature",
        "properties": {
            "id": definition["id"],
            "name": definition["canonicalName"],
            "referenceAdminName": definition["referenceAdminName"],
            "scopeVersion": definition["scopeVersion"],
            "status": "administrative-reference",
            "confidence": "medium",
            "coordinateSystem": "WGS84",
            "geometrySourceSnapshotId": None,
            "method": "osm_admin_relation_cross_checked_with_official_standard_map",
            "geometryRule": definition["geometryRule"],
            "verificationSourceIds": definition["verificationSourceIds"],
            "areaSquareKilometers": round(display_area_km2, 4),
            "unsimplifiedAreaSquareKilometers": round(source_area_km2, 4),
            "officialAreaSquareKilometers": official_area,
            "areaDeltaPercent": round(official_delta_ratio * 100, 2),
            "simplificationToleranceMeters": definition["simplifyToleranceMeters"],
            "labelPoint": [round(representative.x, 7), round(representative.y, 7)],
        },
        "geometry": geometry_mapping,
    }
    manifest = {
        "id": definition["id"],
        "scopeVersion": definition["scopeVersion"],
        "referenceAdminName": definition["referenceAdminName"],
        "osmRelationId": relation_id,
        "osmName": row["name"],
        "unsimplifiedAreaSquareKilometers": round(source_area_km2, 4),
        "displayAreaSquareKilometers": round(display_area_km2, 4),
        "officialAreaSquareKilometers": official_area,
        "areaDeltaPercent": round(official_delta_ratio * 100, 2),
        "simplificationToleranceMeters": definition["simplifyToleranceMeters"],
        "displayPointCount": point_count(output_geometry),
        "verificationSourceIds": definition["verificationSourceIds"],
        "standardMap": definition["standardMap"],
    }
    official_area_as_of = definition.get("officialAreaAsOf")
    if official_area_as_of:
        feature["properties"]["officialAreaAsOf"] = official_area_as_of
        manifest["officialAreaAsOf"] = official_area_as_of
    return feature, manifest


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
        feature, manifest_entry = build_reference(
            args.gpkg,
            definition,
            definitions["workingCrs"],
            definitions["outputCrs"],
        )
        feature["properties"]["geometrySourceSnapshotId"] = source_lock["id"]
        features.append(feature)
        manifest_sectors.append(manifest_entry)

    collection = {
        "type": "FeatureCollection",
        "name": "administrative-sector-references-wgs84",
        "schemaVersion": "1.0.0",
        "status": "internal-reference",
        "notice": definitions["notice"],
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
    print(f"生成 {len(features)} 个行政参考面：{args.output.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
