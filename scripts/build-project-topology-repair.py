# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "geopandas==1.1.4",
#   "pyogrio==0.13.0",
#   "pyproj==3.7.2",
#   "shapely==2.1.2",
# ]
# ///

"""Build a local-only, mutually exclusive Shanghai sector topology preview.

RealtyNavi is used only to decide which existing project sector should own an
independently derived OSM administrative residual. Its coordinates are never
written as output edges. The generated GeoJSON and report stay under ignored
outputs/ and must not be promoted as reviewed public geometry.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import geopandas as gpd
import pyogrio
from shapely import set_precision
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.validation import make_valid


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GPKG = (
    REPO_ROOT
    / "outputs/osm/shanghai-260728-free.gpkg/shanghai.gpkg"
)
DEFAULT_SOURCE_LOCK = (
    REPO_ROOT / "data/geo/sources/osm-shanghai-260728.json"
)
DEFAULT_REALTYNAVI = (
    REPO_ROOT
    / "outputs/realtynavi/"
    "shanghai-sector-boundaries-gcj02-2026-07-28.geojson"
)
DEFAULT_OUTPUT = (
    REPO_ROOT
    / "outputs/topology-repair/"
    "project-sector-topology-repair.wgs84.geojson"
)
DEFAULT_REPORT = (
    REPO_ROOT
    / "outputs/topology-repair/"
    "project-sector-topology-repair-report.json"
)
DEFAULT_PUBLISHED_OUTPUT = (
    REPO_ROOT / "src/data/sectors/published-topology.wgs84.json"
)
DEFAULT_PUBLISHED_INDEX = (
    REPO_ROOT / "src/data/sectors/published-topology.index.json"
)
DEFAULT_PUBLISHED_MANIFEST = (
    REPO_ROOT / "src/data/sectors/published-topology.manifest.json"
)
WORKING_CRS = "EPSG:32651"
OUTPUT_CRS = "EPSG:4326"
MINIMUM_PART_AREA_SQUARE_METERS = 1.0
TOPOLOGY_GRID_METERS = 0.1
TOPOLOGY_TOLERANCE_SQUARE_METERS = 2.0
SERIALIZED_TOPOLOGY_TOLERANCE_SQUARE_METERS = 2_000.0
EXCLUDED_OUTSIDE_SHANGHAI_OSM_RELATION_IDS = {
    "10209802",  # 海永镇（江苏省海门区）
    "10399578",  # 花鸟乡（浙江省嵊泗县）
    "19101233",  # 新仓镇（浙江省平湖市）
}

# These are semantic aliases, not copied geometry rules. Combined or ambiguous
# RealtyNavi regions intentionally remain unmapped and fall back to adjacency.
REALTYNAVI_PROJECT_ALIASES = {
    "安亭汽车城": "sector_anting",
    "共康泗塘": "sector_gongkang",
    "华新镇": "sector_huaxin",
    "江川路": "sector_laominhang",
    "金汇": "sector_fengxianjinhui",
    "长寿": "sector_changshoulu",
    "黄兴": "sector_huangxing_park",
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def polygon_parts(geometry) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    parts: list[Polygon] = []
    for child in getattr(geometry, "geoms", []):
        parts.extend(polygon_parts(child))
    return parts


def polygonal(geometry, minimum_area: float = 0):
    valid = make_valid(geometry)
    parts = [
        orient(part, sign=1.0)
        for part in polygon_parts(valid)
        if not part.is_empty and part.area >= minimum_area
    ]
    if not parts:
        return Polygon()
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def fill_enclosed_domain_holes(geometry):
    """Close gaps fully enclosed by the selected Shanghai admin skeleton.

    OSM models 莘庄工业区 at level 9 rather than level 8, and the fixed
    level-8 relations also leave one enclosed Chongming gap. Including level 9
    first and closing only remaining interior rings preserves the OSM-derived
    outer shoreline while preventing visible unowned islands inside Shanghai.
    """
    parts = polygon_parts(polygonal(geometry))
    return polygonal(
        unary_union([
            Polygon(part.exterior)
            for part in parts
        ])
    )


def projected(geometry, source_crs: str, target_crs: str):
    return gpd.GeoSeries([geometry], crs=source_crs).to_crs(target_crs).iloc[0]


def normalize_name(value: str) -> str:
    normalized = "".join(value.strip().lower().split())
    for suffix in ("街道办事处", "街道", "社区", "新镇", "镇", "乡"):
        if normalized.endswith(suffix) and len(normalized) > len(suffix):
            normalized = normalized[: -len(suffix)]
            break
    return normalized


def normalize_district(value: str) -> str:
    aliases = {
        "浦东区": "浦东新区",
    }
    return aliases.get(value.strip(), value.strip())


def transform_latitude(lng_offset: float, lat_offset: float) -> float:
    result = (
        -100
        + 2 * lng_offset
        + 3 * lat_offset
        + 0.2 * lat_offset**2
        + 0.1 * lng_offset * lat_offset
        + 0.2 * math.sqrt(abs(lng_offset))
    )
    result += (
        20 * math.sin(6 * lng_offset * math.pi)
        + 20 * math.sin(2 * lng_offset * math.pi)
    ) * 2 / 3
    result += (
        20 * math.sin(lat_offset * math.pi)
        + 40 * math.sin(lat_offset / 3 * math.pi)
    ) * 2 / 3
    result += (
        160 * math.sin(lat_offset / 12 * math.pi)
        + 320 * math.sin(lat_offset * math.pi / 30)
    ) * 2 / 3
    return result


def transform_longitude(lng_offset: float, lat_offset: float) -> float:
    result = (
        300
        + lng_offset
        + 2 * lat_offset
        + 0.1 * lng_offset**2
        + 0.1 * lng_offset * lat_offset
        + 0.1 * math.sqrt(abs(lng_offset))
    )
    result += (
        20 * math.sin(6 * lng_offset * math.pi)
        + 20 * math.sin(2 * lng_offset * math.pi)
    ) * 2 / 3
    result += (
        20 * math.sin(lng_offset * math.pi)
        + 40 * math.sin(lng_offset / 3 * math.pi)
    ) * 2 / 3
    result += (
        150 * math.sin(lng_offset / 12 * math.pi)
        + 300 * math.sin(lng_offset / 30 * math.pi)
    ) * 2 / 3
    return result


def wgs84_to_gcj02(lng: float, lat: float) -> tuple[float, float]:
    axis = 6_378_245
    eccentricity_squared = 0.006693421622965943
    latitude_radians = lat / 180 * math.pi
    sin_latitude = math.sin(latitude_radians)
    magic = 1 - eccentricity_squared * sin_latitude**2
    square_root_magic = math.sqrt(magic)
    latitude_delta = transform_latitude(lng - 105, lat - 35) * 180 / (
        (axis * (1 - eccentricity_squared))
        / (magic * square_root_magic)
        * math.pi
    )
    longitude_delta = transform_longitude(lng - 105, lat - 35) * 180 / (
        axis
        / square_root_magic
        * math.cos(latitude_radians)
        * math.pi
    )
    return lng + longitude_delta, lat + latitude_delta


def gcj02_to_wgs84(lng: float, lat: float) -> tuple[float, float]:
    longitude = lng
    latitude = lat
    for _ in range(6):
        display_longitude, display_latitude = wgs84_to_gcj02(
            longitude,
            latitude,
        )
        longitude_error = display_longitude - lng
        latitude_error = display_latitude - lat
        longitude -= longitude_error
        latitude -= latitude_error
        if abs(longitude_error) <= 1e-10 and abs(latitude_error) <= 1e-10:
            break
    return longitude, latitude


def convert_gcj_coordinates(value):
    if (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        return list(gcj02_to_wgs84(float(value[0]), float(value[1])))
    if isinstance(value, list):
        return [convert_gcj_coordinates(item) for item in value]
    return value


def gcj_geometry_to_wgs84(geometry: dict[str, Any]):
    return shape({
        "type": geometry["type"],
        "coordinates": convert_gcj_coordinates(geometry["coordinates"]),
    })


def round_coordinates(value, digits: int = 10):
    if isinstance(value, (float, int)):
        return round(float(value), digits)
    return [round_coordinates(item, digits) for item in value]


def serialize_geometry(geometry) -> dict[str, Any]:
    serialized = mapping(polygonal(geometry))
    return {
        "type": serialized["type"],
        "coordinates": round_coordinates(serialized["coordinates"]),
    }


def build_name_index(registry: list[dict[str, Any]]):
    index: dict[str, list[str]] = defaultdict(list)
    for record in registry:
        for name in [record["canonicalName"], *record.get("aliases", [])]:
            key = normalize_name(name)
            if record["id"] not in index[key]:
                index[key].append(record["id"])
    return index


def choose_name_match(
    name: str,
    district: str | None,
    name_index: dict[str, list[str]],
    registry_by_id: dict[str, dict[str, Any]],
) -> str | None:
    candidates = name_index.get(normalize_name(name), [])
    if district:
        normalized_district = normalize_district(district)
        district_candidates = [
            sector_id
            for sector_id in candidates
            if normalized_district
            in {
                normalize_district(value)
                for value in registry_by_id[sector_id]["districtNames"]
            }
        ]
        if len(district_candidates) == 1:
            return district_candidates[0]
        candidates = district_candidates or candidates
    return candidates[0] if len(candidates) == 1 else None


def load_active_project_geometries(registry_by_id):
    candidates = read_json(
        REPO_ROOT / "src/data/sectors/reviewed-candidates.wgs84.json"
    )["features"]
    overrides = read_json(
        REPO_ROOT / "src/data/sectors/user-reviewed-overrides.wgs84.json"
    )["features"]
    features_by_id = {
        feature["properties"]["id"]: feature
        for feature in [*candidates, *overrides]
        if feature["properties"]["id"] in registry_by_id
    }
    projected_by_id = {}
    source_by_id = {}
    for sector_id, feature in features_by_id.items():
        geometry = polygonal(shape(feature["geometry"]))
        if geometry.is_empty:
            continue
        projected_by_id[sector_id] = polygonal(
            projected(geometry, OUTPUT_CRS, WORKING_CRS)
        )
        source_by_id[sector_id] = feature["properties"].get(
            "status",
            "reviewed-candidate",
        )
    return projected_by_id, source_by_id


def remove_project_overlaps(projected_by_id):
    original_union = unary_union(list(projected_by_id.values()))
    original_area = sum(geometry.area for geometry in projected_by_id.values())
    priority = sorted(
        projected_by_id,
        key=lambda sector_id: (
            projected_by_id[sector_id].area,
            sector_id,
        ),
    )
    allocated = {}
    occupied = Polygon()
    clipped_area_by_id = {}
    for sector_id in priority:
        source = projected_by_id[sector_id]
        clean = polygonal(
            source.difference(occupied),
            MINIMUM_PART_AREA_SQUARE_METERS,
        )
        clipped_area_by_id[sector_id] = max(0.0, source.area - clean.area)
        if clean.is_empty:
            continue
        allocated[sector_id] = clean
        occupied = unary_union([occupied, clean])
    return {
        "allocated": allocated,
        "occupied": occupied,
        "original_union": original_union,
        "original_area": original_area,
        "clipped_area_by_id": clipped_area_by_id,
    }


def load_realtynavi_features(
    path: Path,
    name_index,
    registry_by_id,
):
    snapshot = read_json(path)
    result = []
    for feature in snapshot["features"]:
        properties = feature["properties"]
        if properties.get("classification") != "named_sector":
            continue
        name = properties["name"]
        sector_id = REALTYNAVI_PROJECT_ALIASES.get(name)
        if sector_id is None:
            sector_id = choose_name_match(
                name,
                properties.get("district"),
                name_index,
                registry_by_id,
            )
        geometry = polygonal(
            projected(
                gcj_geometry_to_wgs84(feature["geometry"]),
                OUTPUT_CRS,
                WORKING_CRS,
            )
        )
        result.append({
            "name": name,
            "district": normalize_district(properties.get("district", "")),
            "sector_id": sector_id,
            "geometry": geometry,
        })
    return result, snapshot


def infer_district(admin_geometry, realty_features) -> tuple[str | None, float]:
    district_areas: dict[str, float] = defaultdict(float)
    for reference in realty_features:
        if not reference["district"]:
            continue
        intersection = admin_geometry.intersection(reference["geometry"])
        if not intersection.is_empty:
            district_areas[reference["district"]] += intersection.area
    if not district_areas:
        return None, 0.0
    district = max(district_areas, key=district_areas.get)
    return district, district_areas[district] / admin_geometry.area


def reference_owner(piece, realty_features):
    scores: dict[str, float] = defaultdict(float)
    reference_names: dict[str, set[str]] = defaultdict(set)
    for reference in realty_features:
        sector_id = reference["sector_id"]
        if sector_id is None:
            continue
        intersection = piece.intersection(reference["geometry"])
        if intersection.is_empty:
            continue
        scores[sector_id] += intersection.area
        reference_names[sector_id].add(reference["name"])
    if not scores:
        return None
    owner = max(scores, key=lambda sector_id: scores[sector_id])
    if scores[owner] / piece.area < 0.05:
        return None
    return owner, scores[owner] / piece.area, sorted(reference_names[owner])


def adjacency_owner(piece, allocated, registry_by_id, district):
    district_ids = {
        sector_id
        for sector_id, record in registry_by_id.items()
        if not district
        or district
        in {normalize_district(value) for value in record["districtNames"]}
    }
    candidates = [
        (sector_id, geometry)
        for sector_id, geometry in allocated.items()
        if sector_id in district_ids
    ]
    if not candidates:
        candidates = list(allocated.items())

    buffered_boundary = piece.boundary.buffer(1.0)
    shared = [
        (
            geometry.boundary.intersection(buffered_boundary).length,
            sector_id,
        )
        for sector_id, geometry in candidates
    ]
    shared.sort(reverse=True)
    if shared and shared[0][0] > 1:
        return shared[0][1], "shared-boundary", shared[0][0]

    distances = [
        (piece.distance(geometry), sector_id)
        for sector_id, geometry in candidates
    ]
    distances.sort()
    if not distances:
        raise ValueError("找不到可接收空白面的项目板块")
    return distances[0][1], "nearest-sector", distances[0][0]


def assign_gap_piece(
    piece,
    admin_name,
    district,
    name_index,
    registry_by_id,
    realty_features,
    allocated,
):
    reference = reference_owner(piece, realty_features)
    if reference:
        owner, coverage, names = reference
        return owner, "realtynavi-name-on-osm-admin-residual", {
            "referenceCoveragePercent": round(coverage * 100, 2),
            "referenceNames": names,
        }

    admin_owner = choose_name_match(
        admin_name,
        district,
        name_index,
        registry_by_id,
    )
    if admin_owner:
        return admin_owner, "osm-admin-name", {}

    owner, method, value = adjacency_owner(
        piece,
        allocated,
        registry_by_id,
        district,
    )
    detail_key = (
        "sharedBoundaryMeters"
        if method == "shared-boundary"
        else "nearestDistanceMeters"
    )
    return owner, method, {detail_key: round(value, 2)}


def build(args):
    source_lock = read_json(args.source_lock)
    actual_gpkg_sha = sha256(args.gpkg)
    if actual_gpkg_sha != source_lock["gpkgSha256"]:
        raise ValueError(
            "OSM GeoPackage SHA-256 不匹配："
            f"期望 {source_lock['gpkgSha256']}，实际 {actual_gpkg_sha}"
        )

    registry = read_json(
        REPO_ROOT / "src/data/sectors/registry.json"
    )["sectors"]
    registry_by_id = {record["id"]: record for record in registry}
    name_index = build_name_index(registry)
    project_geometries, project_sources = load_active_project_geometries(
        registry_by_id
    )
    overlap_result = remove_project_overlaps(project_geometries)
    allocated = overlap_result["allocated"]
    occupied = overlap_result["occupied"]

    realty_features, realty_snapshot = load_realtynavi_features(
        args.realtynavi,
        name_index,
        registry_by_id,
    )
    raw_admin_frame = pyogrio.read_dataframe(
        args.gpkg,
        layer="gis_osm_adminareas_a_free",
        where="code=1208 OR code=1209",
    ).to_crs(WORKING_CRS)
    if len(raw_admin_frame) != 224:
        raise ValueError(
            "固定 OSM 下载框应包含 220 个 level-8 与 4 个 level-9 "
            "行政面，"
            f"实际 {len(raw_admin_frame)}"
        )
    admin_records = []
    excluded_admin_records = []
    for row in raw_admin_frame.sort_values("osm_id").itertuples():
        admin_geometry = polygonal(row.geometry)
        district, reference_coverage = infer_district(
            admin_geometry,
            realty_features,
        )
        record = {
            "osm_id": str(row.osm_id),
            "name": row.name,
            "geometry": admin_geometry,
            "district": district,
            "referenceCoveragePercent": round(reference_coverage * 100, 2),
        }
        if str(row.osm_id) in EXCLUDED_OUTSIDE_SHANGHAI_OSM_RELATION_IDS:
            excluded_admin_records.append({
                key: value
                for key, value in record.items()
                if key != "geometry"
            })
        else:
            admin_records.append(record)
    if len(admin_records) != 221:
        raise ValueError(
            "固定 OSM 下载框排除 3 个外省关系后应保留 221 个 level-8/9 "
            f"行政面，实际 {len(admin_records)}"
        )
    raw_domain = polygonal(
        unary_union([record["geometry"] for record in admin_records])
    )
    domain = fill_enclosed_domain_holes(raw_domain)
    enclosed_domain_gaps = polygonal(
        domain.difference(raw_domain),
        MINIMUM_PART_AREA_SQUARE_METERS,
    )
    original_gap = domain.difference(occupied)
    assignment_records = []

    for admin_record in admin_records:
        admin_geometry = admin_record["geometry"]
        district = admin_record["district"]
        residual = polygonal(
            admin_geometry.difference(occupied),
            MINIMUM_PART_AREA_SQUARE_METERS,
        )
        if residual.is_empty:
            continue
        for index, piece in enumerate(
            sorted(polygon_parts(residual), key=lambda part: -part.area),
            start=1,
        ):
            owner, method, details = assign_gap_piece(
                piece,
                admin_record["name"] or "",
                district,
                name_index,
                registry_by_id,
                realty_features,
                allocated,
            )
            allocated[owner] = polygonal(
                unary_union([allocated.get(owner, Polygon()), piece])
            )
            occupied = unary_union([occupied, piece])
            assignment_records.append({
                "osmAdminRelationId": admin_record["osm_id"],
                "osmAdminName": admin_record["name"],
                "part": index,
                "district": district,
                "areaSquareKilometers": round(piece.area / 1_000_000, 6),
                "ownerSectorId": owner,
                "ownerSectorName": registry_by_id[owner]["canonicalName"],
                "method": method,
                **details,
            })

    for index, piece in enumerate(
        sorted(
            polygon_parts(enclosed_domain_gaps),
            key=lambda part: -part.area,
        ),
        start=1,
    ):
        residual_piece = polygonal(
            piece.difference(occupied),
            MINIMUM_PART_AREA_SQUARE_METERS,
        )
        if residual_piece.is_empty:
            continue
        for part_index, residual_part in enumerate(
            sorted(
                polygon_parts(residual_piece),
                key=lambda part: -part.area,
            ),
            start=1,
        ):
            district, reference_coverage = infer_district(
                residual_part,
                realty_features,
            )
            owner, method, details = assign_gap_piece(
                residual_part,
                "",
                district,
                name_index,
                registry_by_id,
                realty_features,
                allocated,
            )
            allocated[owner] = polygonal(
                unary_union([
                    allocated.get(owner, Polygon()),
                    residual_part,
                ])
            )
            occupied = unary_union([occupied, residual_part])
            assignment_records.append({
                "osmAdminRelationId": f"enclosed-admin-gap-{index}",
                "osmAdminName": "OSM 行政骨架内洞",
                "part": part_index,
                "district": district,
                "areaSquareKilometers": round(
                    residual_part.area / 1_000_000,
                    6,
                ),
                "ownerSectorId": owner,
                "ownerSectorName": registry_by_id[owner]["canonicalName"],
                "method": f"enclosed-domain-{method}",
                "referenceCoveragePercent": round(
                    reference_coverage * 100,
                    2,
                ),
                **details,
            })

    target = fill_enclosed_domain_holes(
        unary_union([domain, overlap_result["original_union"]])
    )
    numerical_residual = target.difference(occupied)
    for index, piece in enumerate(
        sorted(polygon_parts(make_valid(numerical_residual)), key=lambda part: -part.area),
        start=1,
    ):
        if piece.is_empty or piece.area <= 0:
            continue
        owner, method, value = adjacency_owner(
            piece,
            allocated,
            registry_by_id,
            None,
        )
        allocated[owner] = polygonal(
            unary_union([allocated.get(owner, Polygon()), piece])
        )
        occupied = unary_union([occupied, piece])
        assignment_records.append({
            "osmAdminRelationId": "numeric-residual",
            "osmAdminName": "数值残差",
            "part": index,
            "district": None,
            "areaSquareKilometers": round(piece.area / 1_000_000, 9),
            "ownerSectorId": owner,
            "ownerSectorName": registry_by_id[owner]["canonicalName"],
            "method": f"final-{method}",
            (
                "sharedBoundaryMeters"
                if method == "shared-boundary"
                else "nearestDistanceMeters"
            ): round(value, 2),
        })
    target = polygonal(set_precision(target, TOPOLOGY_GRID_METERS))
    snapped_allocated = {
        sector_id: polygonal(
            set_precision(geometry, TOPOLOGY_GRID_METERS).intersection(target),
        )
        for sector_id, geometry in allocated.items()
    }
    snapped_allocated = {
        sector_id: geometry
        for sector_id, geometry in snapped_allocated.items()
        if not geometry.is_empty
    }
    reconciled = {}
    reconciled_union = Polygon()
    for sector_id in sorted(
        snapped_allocated,
        key=lambda value: (
            snapped_allocated[value].area,
            value,
        ),
    ):
        clean = polygonal(
            snapped_allocated[sector_id].difference(reconciled_union),
        )
        if clean.is_empty:
            continue
        reconciled[sector_id] = clean
        reconciled_union = unary_union([reconciled_union, clean])

    precision_residual = target.difference(reconciled_union)
    for index, piece in enumerate(
        sorted(polygon_parts(make_valid(precision_residual)), key=lambda part: -part.area),
        start=1,
    ):
        if piece.is_empty or piece.area <= 0:
            continue
        owner, method, value = adjacency_owner(
            piece,
            reconciled,
            registry_by_id,
            None,
        )
        piece = piece.intersection(target)
        if piece.is_empty or piece.area <= 0:
            continue
        reconciled[owner] = polygonal(
            unary_union([reconciled.get(owner, Polygon()), piece]),
        )
        reconciled_union = unary_union([reconciled_union, piece])
        assignment_records.append({
            "osmAdminRelationId": "precision-grid-residual",
            "osmAdminName": "精度网格残差",
            "part": index,
            "district": None,
            "areaSquareKilometers": round(piece.area / 1_000_000, 9),
            "ownerSectorId": owner,
            "ownerSectorName": registry_by_id[owner]["canonicalName"],
            "method": f"precision-grid-{method}",
            (
                "sharedBoundaryMeters"
                if method == "shared-boundary"
                else "nearestDistanceMeters"
            ): round(value, 2),
        })
    for sweep in range(1, 9):
        reconciled_union = unary_union(list(reconciled.values()))
        sweep_residual = target.difference(reconciled_union)
        if sweep_residual.area <= 0.001:
            break
        for index, piece in enumerate(
            sorted(polygon_parts(make_valid(sweep_residual)), key=lambda part: -part.area),
            start=1,
        ):
            if piece.is_empty or piece.area <= 0:
                continue
            piece = piece.intersection(target)
            owner, method, value = adjacency_owner(
                piece,
                reconciled,
                registry_by_id,
                None,
            )
            reconciled[owner] = polygonal(
                unary_union([reconciled.get(owner, Polygon()), piece]),
            )
            assignment_records.append({
                "osmAdminRelationId": f"precision-final-sweep-{sweep}",
                "osmAdminName": "精度最终残差",
                "part": index,
                "district": None,
                "areaSquareKilometers": round(piece.area / 1_000_000, 12),
                "ownerSectorId": owner,
                "ownerSectorName": registry_by_id[owner]["canonicalName"],
                "method": f"precision-final-{method}",
                (
                    "sharedBoundaryMeters"
                    if method == "shared-boundary"
                    else "nearestDistanceMeters"
                ): round(value, 2),
            })
    allocated = reconciled
    final_union = unary_union(list(allocated.values()))
    final_sum = sum(geometry.area for geometry in allocated.values())
    final_overlap = max(0.0, final_sum - final_union.area)
    final_gap = target.difference(final_union).area
    final_excess = final_union.difference(target).area
    if (
        final_overlap > TOPOLOGY_TOLERANCE_SQUARE_METERS
        or final_gap > TOPOLOGY_TOLERANCE_SQUARE_METERS
        or final_excess > TOPOLOGY_TOLERANCE_SQUARE_METERS
    ):
        raise ValueError(
            "拓扑修复未闭合："
            f"重叠 {final_overlap:.4f} m²，"
            f"缺口 {final_gap:.4f} m²，"
            f"超界 {final_excess:.4f} m²"
        )

    output_features = []
    assignment_methods_by_owner: dict[str, set[str]] = defaultdict(set)
    for record in assignment_records:
        assignment_methods_by_owner[record["ownerSectorId"]].add(
            record["method"]
        )
    for sector_id in sorted(allocated):
        geometry_wgs84 = polygonal(
            projected(allocated[sector_id], WORKING_CRS, OUTPUT_CRS)
        )
        if geometry_wgs84.is_empty:
            continue
        label_point = geometry_wgs84.representative_point()
        output_features.append({
            "type": "Feature",
            "id": sector_id,
            "properties": {
                "sourceId": sector_id,
                "name": registry_by_id[sector_id]["canonicalName"],
                "centroid": [
                    round(label_point.x, 7),
                    round(label_point.y, 7),
                ],
                "classification": "named_sector",
                "projectSectorId": sector_id,
                "sourceStatus": project_sources.get(
                    sector_id,
                    "gap-created-from-registered-identity",
                ),
                "repairMethods": sorted(
                    assignment_methods_by_owner.get(sector_id, set())
                ),
            },
            "geometry": serialize_geometry(geometry_wgs84),
        })

    output_sector_ids = {
        feature["properties"]["projectSectorId"]
        for feature in output_features
    }
    serialized_projected_geometries = []
    for feature in output_features:
        serialized_geometry = shape(feature["geometry"])
        if serialized_geometry.is_empty or not serialized_geometry.is_valid:
            raise ValueError(
                f"序列化后几何无效：{feature['properties']['projectSectorId']}"
            )
        serialized_projected_geometries.append(
            projected(serialized_geometry, OUTPUT_CRS, WORKING_CRS)
        )
    serialized_union = unary_union(serialized_projected_geometries)
    serialized_sum = sum(
        geometry.area
        for geometry in serialized_projected_geometries
    )
    serialized_overlap = max(0.0, serialized_sum - serialized_union.area)
    serialized_gap = target.difference(serialized_union).area
    serialized_excess = serialized_union.difference(target).area
    if (
        serialized_overlap > SERIALIZED_TOPOLOGY_TOLERANCE_SQUARE_METERS
        or serialized_gap > SERIALIZED_TOPOLOGY_TOLERANCE_SQUARE_METERS
        or serialized_excess > SERIALIZED_TOPOLOGY_TOLERANCE_SQUARE_METERS
    ):
        raise ValueError(
            "序列化后拓扑误差过大："
            f"重叠 {serialized_overlap:.4f} m²，"
            f"缺口 {serialized_gap:.4f} m²，"
            f"超界 {serialized_excess:.4f} m²"
        )
    generated_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    output = {
        "type": "FeatureCollection",
        "name": "项目板块拓扑修复预览",
        "metadata": {
            "source_key": "project-topology-repair",
            "source_page": source_lock["latestDiscoveryUrl"],
            "source_endpoint": source_lock["resolvedUrl"],
            "fetched_at": generated_at,
            "access_context": (
                "Local deterministic build from project candidates, a fixed "
                "Geofabrik/OSM snapshot, and an authorized private RealtyNavi "
                "semantic reference."
            ),
            "license_status": "local-review-mixed-provenance",
            "layer_interpretation": "unreviewed project topology repair preview",
            "source_coordinate_system": "WGS84",
            "coordinate_system": "WGS84",
            "coordinate_note": "WGS84 · OSM 全域拓扑预览",
            "directory_count": len(registry),
            "named_feature_count": len(output_features),
            "district_outline_difference_feature_count": 0,
            "feature_count": len(output_features),
            "missing_geometry_count": len(registry) - len(output_sector_ids),
            "missing_geometry": [
                {
                    "id": record["id"],
                    "name": record["canonicalName"],
                    "district": "、".join(record["districtNames"]),
                }
                for record in registry
                if record["id"] not in output_sector_ids
            ],
            "coverage_note": (
                "No RealtyNavi coordinates are written as output edges. "
                "RealtyNavi only helps select the owner of OSM-derived "
                "administrative residuals; all assignments remain unreviewed."
            ),
        },
        "features": output_features,
    }
    report = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "status": "internal-review-only",
        "inputs": {
            "osmSourceLock": str(args.source_lock.relative_to(REPO_ROOT)),
            "osmGpkgSha256": actual_gpkg_sha,
            "projectCandidateCount": len(project_geometries),
            "realtynaviSourceKey": realty_snapshot["metadata"]["source_key"],
            "realtynaviNamedFeatureCount": len(realty_features),
            "realtynaviRole": "semantic-owner-and-adjacency-reference-only",
            "osmLevel8And9DownloadFrameCount": len(raw_admin_frame),
            "osmLevel8And9ShanghaiMaskCount": len(admin_records),
            "excludedOutsideShanghaiAdminAreas": excluded_admin_records,
        },
        "rules": {
            "overlap": "smaller-current-project-footprint-wins",
            "topologyPrecisionGridMeters": TOPOLOGY_GRID_METERS,
            "topologyToleranceSquareMeters": TOPOLOGY_TOLERANCE_SQUARE_METERS,
            "serializedTopologyToleranceSquareMeters":
                SERIALIZED_TOPOLOGY_TOLERANCE_SQUARE_METERS,
            "gapBoundary": (
                "fixed-osm-level8-and-9-administrative-residual-with-"
                "enclosed-domain-hole-closure"
            ),
            "gapOwnerPriority": [
                "mapped-realtynavi-name",
                "matching-osm-admin-name",
                "shared-project-boundary",
                "nearest-project-sector-in-district",
            ],
            "publicationPolicy": (
                "Do not copy this preview into reviewed candidates. "
                "Review assignments and rebuild a licensed workpack first."
            ),
        },
        "metricsSquareKilometers": {
            "osmLevel8And9RawDomain": round(
                raw_domain.area / 1_000_000,
                6,
            ),
            "enclosedDomainGapFilled": round(
                enclosed_domain_gaps.area / 1_000_000,
                6,
            ),
            "osmLevel8And9ClosedDomain": round(
                domain.area / 1_000_000,
                6,
            ),
            "originalProjectSum": round(
                overlap_result["original_area"] / 1_000_000,
                6,
            ),
            "originalProjectUnion": round(
                overlap_result["original_union"].area / 1_000_000,
                6,
            ),
            "originalProjectOverlapExcess": round(
                (
                    overlap_result["original_area"]
                    - overlap_result["original_union"].area
                )
                / 1_000_000,
                6,
            ),
            "originalUncoveredOsmDomain": round(
                original_gap.area / 1_000_000,
                6,
            ),
            "finalTargetUnion": round(target.area / 1_000_000, 6),
            "finalOverlapExcess": round(final_overlap / 1_000_000, 9),
            "finalUncoveredTarget": round(final_gap / 1_000_000, 9),
            "finalOutsideTarget": round(final_excess / 1_000_000, 9),
            "serializedOverlapExcess": round(
                serialized_overlap / 1_000_000,
                9,
            ),
            "serializedUncoveredTarget": round(
                serialized_gap / 1_000_000,
                9,
            ),
            "serializedOutsideTarget": round(
                serialized_excess / 1_000_000,
                9,
            ),
        },
        "overlapClips": [
            {
                "sectorId": sector_id,
                "sectorName": registry_by_id[sector_id]["canonicalName"],
                "removedSquareKilometers": round(area / 1_000_000, 6),
            }
            for sector_id, area in sorted(
                overlap_result["clipped_area_by_id"].items(),
                key=lambda item: -item[1],
            )
            if area >= MINIMUM_PART_AREA_SQUARE_METERS
        ],
        "gapAssignments": assignment_records,
        "output": {
            "path": str(args.output.relative_to(REPO_ROOT)),
            "featureCount": len(output_features),
            "remainingRegistryIdentityCount": len(registry) - len(output_sector_ids),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if args.publish_approved_version:
        published_features = [
            {
                "type": "Feature",
                "properties": {
                    "id": feature["properties"]["projectSectorId"],
                    "name": feature["properties"]["name"],
                    "status": "reviewed-candidate",
                    "confidence": "user-approved-topology",
                    "coordinateSystem": "WGS84",
                    "labelPoint": feature["properties"]["centroid"],
                    "sourceStatus": feature["properties"]["sourceStatus"],
                    "repairMethods": feature["properties"]["repairMethods"],
                    "boundaryBasis": (
                        "User-approved full-domain market-sector topology "
                        "generated from fixed OSM geometry and the existing "
                        "project sector catalog."
                    ),
                },
                "geometry": feature["geometry"],
            }
            for feature in output_features
        ]
        published_output = {
            "type": "FeatureCollection",
            "name": "shanghai-approved-sector-topology",
            "metadata": {
                "schemaVersion": 1,
                "coordinateSystem": "WGS84",
                "publicationStatus": "user-approved-production",
                "approvedVersionId": args.publish_approved_version,
                "approvedAt": args.publish_approved_at,
                "sourceLock": str(args.source_lock.relative_to(REPO_ROOT)),
                "sourceSnapshotId": source_lock["id"],
                "sourceGpkgSha256": actual_gpkg_sha,
                "sourceIds": [
                    source_lock["id"],
                    "internal-user-approved-full-domain-topology-2026-07-30",
                ],
                "geometryBasis": (
                    "Fixed Geofabrik/OpenStreetMap administrative geometry, "
                    "existing project candidate geometry, and deterministic "
                    "shared-boundary allocation."
                ),
                "semanticReference": (
                    "User-authorized RealtyNavi research snapshot was used "
                    "only for sector-name ownership and adjacency decisions."
                ),
                "semanticReferenceCoordinatesPublished": False,
                "featureCount": len(published_features),
                "missingRegistryIdentityCount":
                    len(registry) - len(output_sector_ids),
                "warning": (
                    "User-approved market research topology; not a statutory, "
                    "cadastral, planning, or official administrative boundary."
                ),
            },
            "features": published_features,
        }
        published_index = {
            "schemaVersion": "1.0.0",
            "generatedFrom": str(
                args.publish_output.relative_to(REPO_ROOT)
            ),
            "approvedVersionId": args.publish_approved_version,
            "features": [
                {
                    "id": feature["properties"]["id"],
                    "labelPoint": feature["properties"]["labelPoint"],
                }
                for feature in published_features
            ],
        }
        args.publish_output.parent.mkdir(parents=True, exist_ok=True)
        args.publish_output.write_text(
            json.dumps(
                published_output,
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        args.publish_index.parent.mkdir(parents=True, exist_ok=True)
        args.publish_index.write_text(
            json.dumps(
                published_index,
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        published_manifest = {
            "schemaVersion": 1,
            "approvedVersionId": args.publish_approved_version,
            "approvedAt": args.publish_approved_at,
            "output": str(args.publish_output.relative_to(REPO_ROOT)),
            "outputSha256": sha256(args.publish_output),
            "index": str(args.publish_index.relative_to(REPO_ROOT)),
            "indexSha256": sha256(args.publish_index),
            "featureCount": len(published_features),
            "registryIdentityCount": len(registry),
            "missingRegistryIdentityIds": [
                record["id"]
                for record in registry
                if record["id"] not in output_sector_ids
            ],
            "topologyMetricsSquareKilometers": (
                report["metricsSquareKilometers"]
            ),
            "sourceLock": str(args.source_lock.relative_to(REPO_ROOT)),
            "sourceGpkgSha256": actual_gpkg_sha,
            "sourceIds": [
                source_lock["id"],
                "internal-user-approved-full-domain-topology-2026-07-30",
            ],
            "semanticReferenceCoordinatesPublished": False,
        }
        args.publish_manifest.parent.mkdir(parents=True, exist_ok=True)
        args.publish_manifest.write_text(
            json.dumps(
                published_manifest,
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        print(
            "PUBLISHED_TOPOLOGY_GREEN: "
            f"{len(published_features)} 个生产板块面，"
            f"版本 {args.publish_approved_version}"
        )
    print(
        "TOPOLOGY_REPAIR_GREEN: "
        f"{len(output_features)} 个板块，"
        f"原重叠 {(overlap_result['original_area'] - overlap_result['original_union'].area) / 1_000_000:.3f} km² → "
        f"{final_overlap / 1_000_000:.9f} km²，"
        f"原空白 {original_gap.area / 1_000_000:.3f} km² → "
        f"{final_gap / 1_000_000:.9f} km²"
    )


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpkg", type=Path, default=DEFAULT_GPKG)
    parser.add_argument(
        "--source-lock",
        type=Path,
        default=DEFAULT_SOURCE_LOCK,
    )
    parser.add_argument(
        "--realtynavi",
        type=Path,
        default=DEFAULT_REALTYNAVI,
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--publish-approved-version")
    parser.add_argument("--publish-approved-at")
    parser.add_argument(
        "--publish-output",
        type=Path,
        default=DEFAULT_PUBLISHED_OUTPUT,
    )
    parser.add_argument(
        "--publish-index",
        type=Path,
        default=DEFAULT_PUBLISHED_INDEX,
    )
    parser.add_argument(
        "--publish-manifest",
        type=Path,
        default=DEFAULT_PUBLISHED_MANIFEST,
    )
    args = parser.parse_args()
    if bool(args.publish_approved_version) != bool(args.publish_approved_at):
        parser.error(
            "--publish-approved-version and --publish-approved-at "
            "must be provided together"
        )
    return args


if __name__ == "__main__":
    build(parse_args())
