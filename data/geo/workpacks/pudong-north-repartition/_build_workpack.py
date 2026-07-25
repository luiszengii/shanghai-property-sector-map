# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "geopandas==1.1.4",
#   "numpy==2.4.2",
#   "pyogrio==0.13.0",
#   "pyproj==3.7.2",
#   "shapely==2.1.2",
# ]
# ///

"""Rebuild the user-decided north Pudong market partition.

Commercial screenshots and seller descriptions decide market semantics only.
Every coordinate is derived from the locked Geofabrik/OSM snapshot or from the
already source-backed 10.34 km² planning-reference ring that this workpack
demotes to a child reference.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pyogrio
from shapely import set_precision
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import split, unary_union
from shapely.validation import make_valid


WORKPACK = Path(__file__).resolve().parent
REPO = WORKPACK.parents[3]
SOURCE_LOCK = REPO / "data/geo/sources/osm-shanghai-260721.json"
OUTPUT_GEOJSON = WORKPACK / "candidate.wgs84.geojson"
OUTPUT_QA = WORKPACK / "qa.json"

ADMIN_RELATIONS = {
    "gaoqiao": ("14179071", "高桥镇"),
    "gaodong": ("14179184", "高东镇"),
    "gaohang": ("14179185", "高行镇"),
    "jinyang": ("14178830", "金杨新村街道"),
}


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
    return [
        part
        for part in getattr(geometry, "geoms", [])
        if isinstance(part, Polygon)
    ]


def normalize_polygonal(geometry):
    # Remove sub-millimetre round-trip noise before every overlay so the same
    # OSM-derived edge stays bit-for-bit identical in adjacent output sectors.
    valid = make_valid(set_precision(geometry, 1e-10, mode="valid_output"))
    parts = [
        orient(part, sign=1.0)
        for part in polygon_parts(valid)
        if not part.is_empty and part.area > 0
    ]
    if not parts:
        raise ValueError("geometry did not produce a polygon")
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def round_coordinates(value, digits: int = 12):
    if isinstance(value, (float, int)):
        return round(float(value), digits)
    if isinstance(value, dict):
        return {
            key: round_coordinates(item, digits)
            for key, item in value.items()
        }
    if isinstance(value, str):
        return value
    return [round_coordinates(item, digits) for item in value]


def projected(geometry):
    return gpd.GeoSeries([geometry], crs="OGC:CRS84").to_crs("EPSG:32651").iloc[0]


def unprojected(geometry):
    return gpd.GeoSeries([geometry], crs="EPSG:32651").to_crs("OGC:CRS84").iloc[0]


def area_square_meters(geometry) -> float:
    return float(projected(geometry).area)


def length_meters(geometry) -> float:
    return float(projected(geometry).length)


def topology_intersection_area_square_meters(first, second) -> float:
    intersection = projected(first.intersection(second))
    return float(set_precision(intersection, 0.01, mode="valid_output").area)


def inferred_route_centerline(features, name: str, orientation: str, frame):
    selected = features[features["name"] == name]
    if selected.empty:
        raise ValueError(f"locked snapshot has no feature named {name}")
    feature_union = unary_union(selected.geometry)
    minx, miny, maxx, maxy = selected.total_bounds
    samples: list[tuple[float, float]] = []
    if orientation == "vertical":
        for y in np.linspace(miny, maxy, 260):
            crossing = feature_union.intersection(
                LineString([(120.0, y), (122.0, y)])
            )
            xs = (
                [crossing.x]
                if crossing.geom_type == "Point"
                else [point.x for point in getattr(crossing, "geoms", [])]
            )
            if xs:
                samples.append((float(np.median(xs)), float(y)))
        axis = [point[1] for point in samples]
        values = [point[0] for point in samples]
        frame_start = frame.bounds[1] - 0.02
        frame_end = frame.bounds[3] + 0.02
    elif orientation == "horizontal":
        for x in np.linspace(minx, maxx, 260):
            crossing = feature_union.intersection(
                LineString([(x, 30.0), (x, 32.0)])
            )
            ys = (
                [crossing.y]
                if crossing.geom_type == "Point"
                else [point.y for point in getattr(crossing, "geoms", [])]
            )
            if ys:
                samples.append((float(x), float(np.median(ys))))
        axis = [point[0] for point in samples]
        values = [point[1] for point in samples]
        frame_start = frame.bounds[0] - 0.02
        frame_end = frame.bounds[2] + 0.02
    else:
        raise ValueError(f"unsupported orientation {orientation}")
    if len(samples) < 16:
        raise ValueError(f"{name} has too few crossings to infer a centerline")

    lower_fit = np.polyfit(axis[:12], values[:12], 1)
    upper_fit = np.polyfit(axis[-12:], values[-12:], 1)
    if orientation == "vertical":
        samples.insert(0, (float(np.polyval(lower_fit, frame_start)), frame_start))
        samples.append((float(np.polyval(upper_fit, frame_end)), frame_end))
    else:
        samples.insert(0, (frame_start, float(np.polyval(lower_fit, frame_start))))
        samples.append((frame_end, float(np.polyval(upper_fit, frame_end))))
    return LineString(samples), sorted({str(value) for value in selected.osm_id})


def cut_to_inside(geometry, line, inside: Point):
    containing = [
        part
        for part in split(geometry, line).geoms
        if part.covers(inside)
    ]
    if len(containing) != 1:
        raise ValueError(
            f"cut should leave one face containing {inside.wkt}, got {len(containing)}"
        )
    return normalize_polygonal(containing[0])


def bounded_face(frame, boundaries, inside_xy):
    face = normalize_polygonal(frame)
    inside = Point(*inside_xy)
    for line, _name in boundaries:
        face = cut_to_inside(face, line, inside)
    return face


def feature(sector_id: str, name: str, geometry, properties: dict):
    serialized_geometry = normalize_polygonal(shape(mapping(geometry)))
    return {
        "type": "Feature",
        "properties": {
            "id": sector_id,
            "sectorId": sector_id,
            "name": name,
            "candidateStatus": "selected-market-candidate",
            "selectedForAssembly": True,
            "reviewStatus": "draft-medium",
            "coordinateSystem": "OGC:CRS84",
            "geometrySourceSnapshotId": "osm-geofabrik-shanghai-260721",
            **properties,
        },
        "geometry": mapping(serialized_geometry),
    }


def planning_subscope_feature(geometry):
    serialized_geometry = normalize_polygonal(shape(mapping(geometry)))
    return {
        "type": "Feature",
        "properties": {
            "id": "subscope_waigaoqiao_ftz_10_34",
            "sectorId": "subscope_waigaoqiao_ftz_10_34",
            "name": "外高桥保税区协调范围（10.34 km²）",
            "candidateStatus": "official-reference-subscope",
            "selectedForAssembly": True,
            "reviewStatus": "reference-only",
            "coordinateSystem": "OGC:CRS84",
            "geometrySourceSnapshotId": "osm-geofabrik-shanghai-260721",
            "geometryMethod": "demoted_source_backed_planning_reference",
        },
        "geometry": mapping(serialized_geometry),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpkg", type=Path, required=True)
    args = parser.parse_args()

    source_lock = json.loads(SOURCE_LOCK.read_text(encoding="utf-8"))
    actual_hash = sha256(args.gpkg)
    if actual_hash != source_lock["gpkgSha256"]:
        raise ValueError(
            f"GeoPackage hash mismatch: expected {source_lock['gpkgSha256']}, got {actual_hash}"
        )

    relation_ids = [relation_id for relation_id, _name in ADMIN_RELATIONS.values()]
    quoted_ids = ",".join(f"'{relation_id}'" for relation_id in relation_ids)
    admins = pyogrio.read_dataframe(
        args.gpkg,
        layer="gis_osm_adminareas_a_free",
        where=f"osm_id IN ({quoted_ids})",
    ).to_crs("OGC:CRS84")
    admins_by_id = {
        str(row.osm_id): (str(row["name"]), normalize_polygonal(row.geometry))
        for _, row in admins.iterrows()
    }
    for relation_id, expected_name in ADMIN_RELATIONS.values():
        actual = admins_by_id.get(relation_id)
        if actual is None or actual[0] != expected_name:
            raise ValueError(
                f"admin relation {relation_id} expected {expected_name}, got {actual}"
            )

    frame = box(121.53, 31.18, 121.70, 31.39)
    roads = pyogrio.read_dataframe(
        args.gpkg,
        layer="gis_osm_roads_free",
        bbox=frame.bounds,
    ).to_crs("OGC:CRS84")
    waterways = pyogrio.read_dataframe(
        args.gpkg,
        layer="gis_osm_waterways_free",
        bbox=frame.bounds,
    ).to_crs("OGC:CRS84")
    route_refs: dict[str, list[str]] = {}

    def road(name: str, orientation: str):
        line, refs = inferred_route_centerline(roads, name, orientation, frame)
        route_refs[name] = refs
        return line

    def waterway(name: str, orientation: str):
        line, refs = inferred_route_centerline(waterways, name, orientation, frame)
        route_refs[name] = refs
        return line

    # Rebuild the existing Biyun and Jinyang candidates only as protected
    # subtraction dependencies. They are not emitted by this workpack.
    biyun = bounded_face(
        frame,
        [
            (road("云山路", "vertical"), "west"),
            (road("金桥路", "vertical"), "east"),
            (road("杨高中路", "horizontal"), "north"),
            (road("锦绣东路", "horizontal"), "south"),
        ],
        (121.5848035, 31.2425366),
    )
    jinyang_admin = admins_by_id[ADMIN_RELATIONS["jinyang"][0]][1]
    jinyang = normalize_polygonal(jinyang_admin.difference(biyun))

    jinqiao_source = bounded_face(
        frame,
        [
            (road("金桥路", "vertical"), "west"),
            (road("外环高速", "vertical"), "east"),
            (road("龙东大道", "horizontal"), "south"),
            (waterway("赵家沟", "horizontal"), "north"),
        ],
        (121.62, 31.26),
    )
    # Multi-carriageway median inference can leave a lane-width sliver between
    # two independently reconstructed faces. Add a five-metre topology collar
    # before subtracting protected markets so the published result reuses their
    # exact boundaries instead of leaving a visual/data gap.
    jinqiao_topology_source = normalize_polygonal(
        jinqiao_source.union(unprojected(projected(biyun).buffer(5)))
    )
    jinqiao = normalize_polygonal(
        jinqiao_topology_source.difference(unary_union([jinyang, biyun]))
    )

    senlan_main = bounded_face(
        frame,
        [
            (road("张杨北路", "vertical"), "west"),
            (road("杨高北路", "vertical"), "east"),
            (waterway("赵家沟", "horizontal"), "south"),
            (road("航津路", "horizontal"), "north"),
        ],
        (121.589, 31.32),
    )
    senlan_extension = bounded_face(
        frame,
        [
            (road("浦东北路", "vertical"), "west"),
            (road("张杨北路", "vertical"), "east"),
            (road("五洲大道", "horizontal"), "south"),
            (road("洲海路", "horizontal"), "north"),
        ],
        (121.579, 31.313),
    )
    senlan = normalize_polygonal(unary_union([senlan_main, senlan_extension]))

    gaohang_admin = admins_by_id[ADMIN_RELATIONS["gaohang"][0]][1]
    gaohang_south = cut_to_inside(
        gaohang_admin,
        road("航津路", "horizontal"),
        Point(121.5772043, 31.3086035),
    )
    gaohang = normalize_polygonal(gaohang_south.difference(senlan))
    senlan_inside_gaohang = senlan.intersection(gaohang_admin)
    gaohang_north = normalize_polygonal(
        gaohang_admin.difference(
            unary_union([gaohang, senlan_inside_gaohang])
        )
    )
    waigaoqiao = normalize_polygonal(
        unary_union([
            admins_by_id[ADMIN_RELATIONS["gaoqiao"][0]][1],
            admins_by_id[ADMIN_RELATIONS["gaodong"][0]][1],
            gaohang_north,
        ]).difference(senlan)
    )

    planning_subscope = bounded_face(
        frame,
        [
            (road("杨高北路", "vertical"), "west"),
            (waterway("外环运河", "vertical"), "east"),
            (road("五洲大道", "horizontal"), "south"),
            (road("威斯路", "horizontal"), "north"),
        ],
        (121.60, 31.335),
    )

    features = [
        feature(
            "sector_jinqiao",
            "金桥",
            jinqiao,
            {
                "geometryMethod": "seller_scope_locked_osm_centerlines_minus_protected_markets",
                "boundaryBasis": "北赵家沟、东外环高速、南龙东大道、西金桥路；严格扣除金杨与碧云。",
                "protectedSectorIds": ["sector_jinyang", "sector_biyun"],
            },
        ),
        feature(
            "sector_senlan",
            "森兰",
            senlan,
            {
                "geometryMethod": "user_scope_two_locked_osm_road_faces_union",
                "boundaryBasis": "杨高北路—张杨北路—赵家沟—航津路主包络，并入浦东北路—张杨北路—五洲大道—洲海路西侧凸出片。",
                "sharedEdgeSectorIds": ["sector_gaohang", "sector_waigaoqiao"],
            },
        ),
        feature(
            "sector_gaohang",
            "高行",
            gaohang,
            {
                "geometryMethod": "admin_relation_south_of_hangjin_minus_senlan",
                "boundaryBasis": "固定高行镇行政骨架取航津路以南，并严格扣除森兰。",
                "sharedEdgeSectorIds": ["sector_senlan", "sector_waigaoqiao", "sector_caolu"],
            },
        ),
        feature(
            "sector_waigaoqiao",
            "外高桥",
            waigaoqiao,
            {
                "geometryMethod": "gaoqiao_gaodong_and_north_gaohang_admin_union",
                "boundaryBasis": "高桥镇外壳、全部高东镇及高行航津路以北部分合并；森兰保持独立。",
                "absorbedSectorIds": ["sector_gaodong"],
                "sharedEdgeSectorIds": ["sector_senlan", "sector_gaohang", "sector_caolu"],
            },
        ),
        planning_subscope_feature(planning_subscope),
    ]
    serialized = {
        feature_item["properties"]["sectorId"]: shape(feature_item["geometry"])
        for feature_item in features
    }
    jinqiao = serialized["sector_jinqiao"]
    senlan = serialized["sector_senlan"]
    gaohang = serialized["sector_gaohang"]
    waigaoqiao = serialized["sector_waigaoqiao"]
    planning_subscope = serialized["subscope_waigaoqiao_ftz_10_34"]

    old_north_domain = normalize_polygonal(unary_union([
        admins_by_id[ADMIN_RELATIONS["gaoqiao"][0]][1],
        admins_by_id[ADMIN_RELATIONS["gaodong"][0]][1],
        gaohang_admin,
        senlan,
    ]))
    new_north_domain = normalize_polygonal(
        unary_union([waigaoqiao, gaohang, senlan])
    )
    north_reconstruction_error = area_square_meters(
        old_north_domain.symmetric_difference(new_north_domain)
    )
    if north_reconstruction_error > 1:
        raise ValueError(
            f"north Pudong reconstruction error {north_reconstruction_error:.6f} m²"
        )

    overlap_checks = {
        "jinqiao_jinyang": topology_intersection_area_square_meters(jinqiao, jinyang),
        "jinqiao_biyun": topology_intersection_area_square_meters(jinqiao, biyun),
        "senlan_gaohang": topology_intersection_area_square_meters(senlan, gaohang),
        "senlan_waigaoqiao": topology_intersection_area_square_meters(senlan, waigaoqiao),
        "gaohang_waigaoqiao": topology_intersection_area_square_meters(gaohang, waigaoqiao),
    }
    if any(value > 0.01 for value in overlap_checks.values()):
        raise ValueError(f"unexpected overlap: {overlap_checks}")
    gaodong_admin = admins_by_id[ADMIN_RELATIONS["gaodong"][0]][1]
    gaodong_after_senlan = normalize_polygonal(gaodong_admin.difference(senlan))
    absorbed_gaodong_excluding_senlan_ratio = (
        area_square_meters(waigaoqiao.intersection(gaodong_after_senlan))
        / area_square_meters(gaodong_after_senlan)
    )
    if absorbed_gaodong_excluding_senlan_ratio < 0.999999:
        raise ValueError(
            "waigaoqiao does not cover all former gaodong outside senlan: "
            f"{absorbed_gaodong_excluding_senlan_ratio:.9f}"
        )

    output = {
        "type": "FeatureCollection",
        "properties": {
            "workpackId": "pudong-north-repartition",
            "candidateStatus": "selected-market-candidate",
            "coordinateSystem": "OGC:CRS84",
            "scopeDecision": "删除上海南站、联洋、高东；重构金桥、森兰、外高桥、高行，保留金杨和碧云。",
            "commercialGeometryCopied": False,
            "mergedForInternalReview": True,
        },
        "features": features,
    }
    qa = {
        "schemaVersion": "1.0.0",
        "workpackId": "pudong-north-repartition",
        "generatedAt": "2026-07-25",
        "workingCrs": "EPSG:32651",
        "outputCrs": "OGC:CRS84",
        "sourceSnapshotId": source_lock["id"],
        "sourceGeoPackageSha256": actual_hash,
        "overallStatus": "internal-review-ready",
        "commercialGeometryCopied": False,
        "validGeometry": all(
            geometry.is_valid
            for geometry in [jinqiao, senlan, gaohang, waigaoqiao, planning_subscope]
        ),
        "selfIntersectionFree": all(
            geometry.is_valid
            for geometry in [jinqiao, senlan, gaohang, waigaoqiao, planning_subscope]
        ),
        "areasSquareKilometers": {
            sector_id: round(area_square_meters(geometry) / 1_000_000, 4)
            for sector_id, geometry in serialized.items()
        },
        "overlapSquareMeters": {
            key: round(value, 6)
            for key, value in overlap_checks.items()
        },
        "northDomainReconstructionErrorSquareMeters": round(
            north_reconstruction_error, 6
        ),
        "sharedBoundaryMeters": {
            "senlan_gaohang": round(
                length_meters(senlan.boundary.intersection(gaohang.boundary)), 3
            ),
            "senlan_waigaoqiao": round(
                length_meters(senlan.boundary.intersection(waigaoqiao.boundary)), 3
            ),
            "gaohang_waigaoqiao": round(
                length_meters(gaohang.boundary.intersection(waigaoqiao.boundary)), 3
            ),
            "jinqiao_biyun": round(
                length_meters(jinqiao.boundary.intersection(biyun.boundary)), 3
            ),
        },
        "absorbedGaodongCoverageRatio": round(
            area_square_meters(
                waigaoqiao.intersection(gaodong_admin)
            )
            / area_square_meters(gaodong_admin),
            9,
        ),
        "absorbedGaodongExcludingSenlanCoverageRatio": round(
            absorbed_gaodong_excluding_senlan_ratio,
            9,
        ),
        "routeOsmRefs": route_refs,
        "adminRelationIds": {
            key: relation_id
            for key, (relation_id, _name) in ADMIN_RELATIONS.items()
        },
    }
    OUTPUT_GEOJSON.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    OUTPUT_QA.write_text(
        json.dumps(qa, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(qa, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
