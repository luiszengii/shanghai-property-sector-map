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

"""Build low-confidence identity-comparison candidates for 徐泾—虹桥商务区.

The output deliberately carries two mutually exclusive scenarios because the
primary-sector identity decision is still pending. Coordinates come only from
the locked Geofabrik/OSM snapshot; official maps and seller pages are evidence,
not geometry sources.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pyogrio
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import linemerge, split, unary_union
from shapely.validation import make_valid


WORKPACK = Path(__file__).resolve().parent
REPO = WORKPACK.parents[3]
SOURCE_LOCK = REPO / "data/geo/sources/osm-shanghai-260721.json"
OUTPUT_GEOJSON = WORKPACK / "candidate.wgs84.geojson"
OUTPUT_QA = WORKPACK / "qa.json"
XUJING_RELATION_ID = "12979866"
XINHONG_RELATION_ID = "14187990"


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
    valid = make_valid(geometry)
    parts = [orient(part, sign=1.0) for part in polygon_parts(valid) if not part.is_empty]
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


def projected_area_square_km(geometry) -> float:
    return float(
        gpd.GeoSeries([geometry], crs="OGC:CRS84")
        .to_crs("EPSG:32651")
        .area.iloc[0]
        / 1_000_000
    )


def projected_length_m(geometry) -> float:
    return float(
        gpd.GeoSeries([geometry], crs="OGC:CRS84")
        .to_crs("EPSG:32651")
        .length.iloc[0]
    )


def line_part_count(geometry) -> int:
    if geometry.is_empty:
        return 0
    linework = [
        part
        for part in getattr(geometry, "geoms", [geometry])
        if isinstance(part, (LineString, MultiLineString)) and not part.is_empty
    ]
    if not linework:
        return 0
    merged = linemerge(unary_union(linework))
    if isinstance(merged, LineString):
        return 1
    if isinstance(merged, MultiLineString):
        return len(merged.geoms)
    return 0


def merged_linework(geometry):
    lines = [
        part
        for part in getattr(geometry, "geoms", [geometry])
        if isinstance(part, (LineString, MultiLineString)) and not part.is_empty
    ]
    if not lines:
        raise ValueError("geometry has no linework")
    return linemerge(unary_union(lines))


def inferred_route_centerline(
    roads,
    names: list[str],
    orientation: str,
    frame,
):
    """Infer one route line from named carriageways, then extend across a frame.

    At each cross-section the median coordinate of all carriageway crossings is
    used. Gaps and end segments are interpolated/extrapolated and are reported
    as closure dependencies rather than silently treated as verified road.
    """

    selected = roads[roads["name"].isin(names)]
    if selected.empty:
        raise ValueError(f"locked snapshot has no road named {names}")
    road_union = unary_union(selected.geometry)
    minx, miny, maxx, maxy = selected.total_bounds
    samples: list[tuple[float, float]] = []
    if orientation == "vertical":
        for y in np.linspace(miny, maxy, 260):
            crossing = road_union.intersection(LineString([(120.0, y), (122.0, y)]))
            xs: list[float] = []
            if crossing.geom_type == "Point":
                xs = [crossing.x]
            elif crossing.geom_type == "MultiPoint":
                xs = [point.x for point in crossing.geoms]
            if xs:
                samples.append((float(np.median(xs)), float(y)))
        axis = [point[1] for point in samples]
        values = [point[0] for point in samples]
        frame_start = frame.bounds[1] - 0.02
        frame_end = frame.bounds[3] + 0.02
    elif orientation == "horizontal":
        for x in np.linspace(minx, maxx, 260):
            crossing = road_union.intersection(LineString([(x, 30.0), (x, 32.0)]))
            ys: list[float] = []
            if crossing.geom_type == "Point":
                ys = [crossing.y]
            elif crossing.geom_type == "MultiPoint":
                ys = [point.y for point in crossing.geoms]
            if ys:
                samples.append((float(x), float(np.median(ys))))
        axis = [point[0] for point in samples]
        values = [point[1] for point in samples]
        frame_start = frame.bounds[0] - 0.02
        frame_end = frame.bounds[2] + 0.02
    else:
        raise ValueError(f"unsupported orientation {orientation}")
    if len(samples) < 16:
        raise ValueError(f"{names} does not have enough crossings to infer a centerline")

    lower_fit = np.polyfit(
        axis[:12],
        values[:12],
        1,
    )
    upper_fit = np.polyfit(
        axis[-12:],
        values[-12:],
        1,
    )
    if orientation == "vertical":
        samples.insert(0, (float(np.polyval(lower_fit, frame_start)), frame_start))
        samples.append((float(np.polyval(upper_fit, frame_end)), frame_end))
        mapped_range = (float(miny), float(maxy))
    else:
        samples.insert(0, (frame_start, float(np.polyval(lower_fit, frame_start))))
        samples.append((frame_end, float(np.polyval(upper_fit, frame_end))))
        mapped_range = (float(minx), float(maxx))
    return LineString(samples), mapped_range


def inferred_horizontal_composite(
    roads,
    segments: list[tuple[str, float | None, float | None]],
    frame,
):
    """Build a named west-to-east road chain without mixing parallel branches."""

    points: list[tuple[float, float]] = []
    mapped_min_x = float("inf")
    mapped_max_x = float("-inf")
    for name, use_min_x, use_max_x in segments:
        selected = roads[roads["name"] == name]
        if selected.empty:
            raise ValueError(f"locked snapshot has no road named {name}")
        road_union = unary_union(selected.geometry)
        minx, _miny, maxx, _maxy = selected.total_bounds
        start_x = max(float(minx), use_min_x) if use_min_x is not None else float(minx)
        end_x = min(float(maxx), use_max_x) if use_max_x is not None else float(maxx)
        mapped_min_x = min(mapped_min_x, start_x)
        mapped_max_x = max(mapped_max_x, end_x)
        for x in np.linspace(start_x, end_x, 100):
            crossing = road_union.intersection(LineString([(x, 30.0), (x, 32.0)]))
            ys: list[float] = []
            if crossing.geom_type == "Point":
                ys = [crossing.y]
            elif crossing.geom_type == "MultiPoint":
                ys = [point.y for point in crossing.geoms]
            if ys:
                points.append((float(x), float(np.median(ys))))
    points.sort(key=lambda point: point[0])
    if len(points) < 24:
        raise ValueError("composite road chain has too few samples")

    # Collapse overlapping segment samples into a stable 10 m-scale chain.
    bins: dict[int, list[tuple[float, float]]] = {}
    for point in points:
        bins.setdefault(round(point[0] * 10000), []).append(point)
    collapsed = [
        (
            float(np.median([point[0] for point in group])),
            float(np.median([point[1] for point in group])),
        )
        for _key, group in sorted(bins.items())
    ]
    smoothed = LineString(collapsed).simplify(0.00008, preserve_topology=False)
    coords = list(smoothed.coords)
    lower_fit = np.polyfit(
        [point[0] for point in coords[:12]],
        [point[1] for point in coords[:12]],
        1,
    )
    upper_fit = np.polyfit(
        [point[0] for point in coords[-12:]],
        [point[1] for point in coords[-12:]],
        1,
    )
    frame_start = frame.bounds[0] - 0.02
    frame_end = frame.bounds[2] + 0.02
    coords.insert(0, (frame_start, float(np.polyval(lower_fit, frame_start))))
    coords.append((frame_end, float(np.polyval(upper_fit, frame_end))))
    return LineString(coords), (mapped_min_x, mapped_max_x)


def cut_to_inside(geometry, line, inside: Point):
    pieces = list(split(geometry, line).geoms)
    containing = [piece for piece in pieces if piece.covers(inside)]
    if len(containing) != 1:
        raise ValueError(
            f"cut should leave one face containing {inside.wkt}, got {len(containing)}"
        )
    return normalize_polygonal(containing[0])


def road_bounded_face(frame, boundaries: list[tuple[LineString, str]], inside_xy):
    face = normalize_polygonal(frame)
    inside = Point(*inside_xy)
    for line, _label in boundaries:
        face = cut_to_inside(face, line, inside)
    return face


def feature(sector_id: str, name: str, scenario: str, geometry, properties: dict):
    return {
        "type": "Feature",
        "properties": {
            "id": f"{sector_id}__{scenario}",
            "sectorId": sector_id,
            "name": name,
            "scenarioId": scenario,
            "candidateStatus": "selected-market-candidate",
            "reviewStatus": "draft-medium",
            "coordinateSystem": "OGC:CRS84",
            "geometrySourceSnapshotId": "osm-geofabrik-shanghai-260721",
            **properties,
        },
        "geometry": round_coordinates(mapping(geometry)),
    }


def scenario_qa(scenario_id: str, left, right, domain, expected_anchor: str):
    overlap = left.intersection(right)
    covered = unary_union([left, right])
    gap = domain.difference(covered)
    shared = left.boundary.intersection(right.boundary)
    return {
        "scenarioId": scenario_id,
        "expectedSharedAnchor": expected_anchor,
        "featureCount": 2,
        "validGeometry": bool(left.is_valid and right.is_valid),
        "selfIntersectionFree": bool(left.boundary.is_simple and right.boundary.is_simple),
        "areasSquareKilometers": {
            "sector_xujing": round(projected_area_square_km(left), 4),
            "sector_hongqiao": round(projected_area_square_km(right), 4),
        },
        "overlapSquareMeters": round(projected_area_square_km(overlap) * 1_000_000, 3),
        "gapAgainstScenarioDomainSquareMeters": round(
            projected_area_square_km(gap) * 1_000_000, 3
        ),
        "sharedBoundaryLengthMeters": round(projected_length_m(shared), 3),
        "sharedBoundaryConnectedPartCount": line_part_count(shared),
        "oneSharedEdge": line_part_count(shared) == 1,
        "mutuallyExclusive": projected_area_square_km(overlap) < 0.000001,
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

    admins = pyogrio.read_dataframe(
        args.gpkg,
        layer="gis_osm_adminareas_a_free",
        where=f"osm_id IN ('{XUJING_RELATION_ID}','{XINHONG_RELATION_ID}')",
    ).to_crs("OGC:CRS84")
    by_id = {str(row.osm_id): normalize_polygonal(row.geometry) for _, row in admins.iterrows()}
    xujing_admin = by_id[XUJING_RELATION_ID]
    xinhong_admin = by_id[XINHONG_RELATION_ID]
    admin_audit_domain = normalize_polygonal(unary_union([xujing_admin, xinhong_admin]))
    construction_frame = box(121.20, 31.12, 121.38, 31.24)

    roads = pyogrio.read_dataframe(
        args.gpkg,
        layer="gis_osm_roads_free",
        bbox=construction_frame.bounds,
    ).to_crs("OGC:CRS84")

    zhuguang_line, zhuguang_range = inferred_route_centerline(
        roads, ["诸光路"], "vertical", construction_frame
    )
    xule_line, xule_range = inferred_route_centerline(
        roads, ["徐乐路"], "vertical", construction_frame
    )
    xunan_line, xunan_range = inferred_route_centerline(
        roads, ["徐南路"], "horizontal", construction_frame
    )
    songze_line, songze_range = inferred_route_centerline(
        roads, ["崧泽大道", "崧泽高架路"], "horizontal", construction_frame
    )
    beiqing_line, beiqing_range = inferred_route_centerline(
        roads, ["北青公路"], "horizontal", construction_frame
    )
    huqingping_line, huqingping_range = inferred_route_centerline(
        roads, ["沪青平公路"], "horizontal", construction_frame
    )
    s20_line, s20_range = inferred_route_centerline(
        roads, ["外环高速"], "vertical", construction_frame
    )

    selected_xujing = road_bounded_face(
        construction_frame,
        [
            (xule_line, "west"),
            (beiqing_line, "north"),
            (xunan_line, "south"),
            (zhuguang_line, "east"),
        ],
        (121.27, 31.176),
    )
    selected_hongqiao = road_bounded_face(
        construction_frame,
        [
            (zhuguang_line, "west"),
            (songze_line, "north"),
            (huqingping_line, "south"),
            (s20_line, "east"),
        ],
        (121.315, 31.188),
    )
    selected_domain = normalize_polygonal(unary_union([selected_xujing, selected_hongqiao]))

    features = [
        feature(
            "sector_xujing",
            "徐泾",
            "selected_market_core_corridor_2026_07",
            selected_xujing,
            {
                "identityDecision": "市场徐泾住宅板块；国家会展中心和虹桥枢纽均不归徐泾。",
                "geometryMethod": "four_sides_from_locked_osm_road_centerlines",
                "boundaryBasis": "西徐乐路、北北青公路、南徐南路、东诸光路；均为固定OSM道路对象推导中位线。",
                "sharedEdgeId": "edge_xujing_hongqiao_zhuguang_candidate",
            },
        ),
        feature(
            "sector_hongqiao",
            "虹桥商务区",
            "selected_market_core_corridor_2026_07",
            selected_hongqiao,
            {
                "identityDecision": "核心功能走廊小范围市场板块；国家会展中心与虹桥枢纽均归本板块。",
                "geometryMethod": "four_sides_from_locked_osm_road_centerlines",
                "boundaryBasis": "西诸光路、北崧泽大道—崧泽高架路、南沪青平公路、东外环高速；均为固定OSM道路对象推导中位线。",
                "sharedEdgeId": "edge_xujing_hongqiao_zhuguang_candidate",
            },
        ),
    ]
    output = {
        "type": "FeatureCollection",
        "properties": {
            "workpackId": "xujing-hongqiao",
            "candidateStatus": "selected-market-candidate",
            "coordinateSystem": "OGC:CRS84",
            "selectedScenarioId": "selected_market_core_corridor_2026_07",
            "discardedScenarioId": "b_necc_to_xujing_hub_to_hongqiao",
            "scopeDecision": "市场徐泾住宅板块；虹桥商务区核心功能走廊；国家会展中心和虹桥枢纽均归虹桥商务区。",
            "mergedForInternalReview": True,
        },
        "features": features,
    }
    # Run all reported QA against the serialized coordinate representation that
    # the assembler will actually consume, not the higher-precision work face.
    selected_xujing = shape(features[0]["geometry"])
    selected_hongqiao = shape(features[1]["geometry"])
    selected_domain = normalize_polygonal(
        unary_union([selected_xujing, selected_hongqiao])
    )

    buildings = pyogrio.read_dataframe(
        args.gpkg,
        layer="gis_osm_buildings_a_free",
        where="osm_id IN ('345301248','70364443')",
    ).to_crs("OGC:CRS84")
    facility_checks = []
    for osm_id, expected_name in [
        ("345301248", "国家会展中心"),
        ("70364443", "上海虹桥站"),
    ]:
        rows = buildings[buildings["osm_id"].astype(str) == osm_id]
        if len(rows) != 1:
            raise ValueError(f"expected one building {osm_id}, got {len(rows)}")
        geometry = normalize_polygonal(rows.iloc[0].geometry)
        facility_checks.append(
            {
                "expectedIdentity": expected_name,
                "osmId": osm_id,
                "insideHongqiaoCandidate": bool(selected_hongqiao.covers(geometry)),
                "insideXujingCandidate": bool(selected_xujing.covers(geometry)),
                "cutByEitherBoundary": bool(
                    selected_hongqiao.boundary.intersects(geometry)
                    or selected_xujing.boundary.intersects(geometry)
                ),
            }
        )

    seller_project_checks = [
        {
            "project": "上海蟠龙天地",
            "representativePoint": [121.2725202, 31.1894927],
            "pointSource": "OSM node 11343446415 inside 蟠龙天地公共空间",
            "sellerSourceIds": [
                "seller-anjuke-panlong-tiandi-xujing",
                "seller-fang-panlong-tiandi-xujing",
            ],
        },
        {
            "project": "青浦区西虹桥蟠龙路东侧25-07地块",
            "representativePoint": [121.2805, 31.187],
            "pointSource": "仅按公开四至设置的核验点，不是地籍坐标",
            "sellerSourceIds": [
                "seller-anjuke-xujing-list-2026",
                "seller-fang-panlong-east-25-07",
            ],
        },
    ]
    selected_shared_line = merged_linework(
        selected_xujing.boundary.intersection(selected_hongqiao.boundary)
    )
    if not isinstance(selected_shared_line, LineString):
        raise ValueError("selected shared edge is not one continuous line")
    for check in seller_project_checks:
        point = Point(*check["representativePoint"])
        check["insideXujingCandidate"] = bool(selected_xujing.covers(point))
        check["insideHongqiaoCandidate"] = bool(selected_hongqiao.covers(point))
        check["distanceToSharedBoundaryMeters"] = round(
            projected_length_m(
                LineString(
                    [
                        point,
                        selected_shared_line.interpolate(
                            selected_shared_line.project(point)
                        ),
                    ]
                )
            ),
            3,
        )

    qa = {
        "schemaVersion": "1.0.0",
        "workpackId": "xujing-hongqiao",
        "generatedAt": "2026-07-23",
        "workingCrs": "EPSG:32651",
        "outputCrs": "OGC:CRS84",
        "sourceSnapshotId": source_lock["id"],
        "sourceGeoPackageSha256": actual_hash,
        "overallStatus": "merged-internal-draft-needs-outer-edge-review",
        "assemblyReviewReady": True,
        "centralMergeReady": True,
        "centralMergeMode": "internal-review-draft",
        "publicationReady": False,
        "selectedScopeDecision": {
            "xujing": "市场徐泾住宅板块",
            "hongqiao": "虹桥商务区核心功能走廊小范围市场板块",
            "facilityAssignment": "国家会展中心和虹桥枢纽均归虹桥商务区"
        },
        "selectedCandidate": {
            **scenario_qa(
                "selected_market_core_corridor_2026_07",
                selected_xujing,
                selected_hongqiao,
                selected_domain,
                "诸光路固定OSM道路对象推导中位线",
            ),
            "roadObjectMappedRanges": {
                "sharedZhuguangLatitude": [round(zhuguang_range[0], 7), round(zhuguang_range[1], 7)],
                "xujingWestXuleLatitude": [round(xule_range[0], 7), round(xule_range[1], 7)],
                "xujingSouthXunanLongitude": [round(xunan_range[0], 7), round(xunan_range[1], 7)],
                "xujingNorthBeiqingLongitude": [round(beiqing_range[0], 7), round(beiqing_range[1], 7)],
                "hongqiaoNorthSongzeLongitude": [round(songze_range[0], 7), round(songze_range[1], 7)],
                "hongqiaoNorthSongzeLongitude": [round(songze_range[0], 7), round(songze_range[1], 7)],
                "hongqiaoSouthHuqingpingLongitude": [round(huqingping_range[0], 7), round(huqingping_range[1], 7)],
                "hongqiaoEastS20Latitude": [round(s20_range[0], 7), round(s20_range[1], 7)]
            },
            "facilityIntegrityChecks": facility_checks,
            "sellerProjectChecks": seller_project_checks,
            "outerEdgeStatus": [
                {
                    "sectorId": "sector_xujing",
                    "side": "west",
                    "anchor": "徐乐路",
                    "status": "partial-road-object-plus-unverified-south-closure",
                    "note": "固定OSM徐乐路对象纬度范围未到徐南路交点；南端以道路趋势外推闭合，需总装者复核。"
                },
                {
                    "sectorId": "sector_xujing",
                    "side": "north",
                    "anchor": "北青公路",
                    "status": "named-road-candidate-needs-market-project-review"
                },
                {
                    "sectorId": "sector_xujing",
                    "side": "south",
                    "anchor": "徐南路",
                    "status": "named-road-candidate-needs-market-project-review"
                },
                {
                    "sectorId": "sector_hongqiao",
                    "side": "north/south/east",
                    "anchor": "崧泽大道—崧泽高架路 / 沪青平公路 / 外环高速",
                    "status": "named-road-candidate-needs-core-corridor-version-review",
                    "note": "面积量级接近公开16平方公里核心区，但没有逐边官方或双卖方边界证据。"
                }
            ]
        },
        "discardedScenarioAudit": {
            "scenarioId": "b_necc_to_xujing_hub_to_hongqiao",
            "status": "rejected-by-user",
            "geometryBasis": "徐泾镇与新虹街道行政代理，仅保留身份审计，不在candidate中输出。",
            "previousAreasSquareKilometers": {
                "sector_xujing": round(projected_area_square_km(xujing_admin), 4),
                "sector_hongqiao": round(projected_area_square_km(xinhong_admin), 4)
            }
        },
        "requiredBeforePublication": [
            "总装者复核徐乐路、北青公路、徐南路是否完整覆盖市场徐泾住宅外缘",
            "总装者复核崧泽大道—崧泽高架路、沪青平公路、外环高速是否为核心功能走廊合适外缘",
            "对卖方未给完整四至的外边逐项目抽样，当前两家独立来源只充分支持蟠龙项目归徐泾",
            "确认固定OSM多车行线中位推导可作为项目约5—15米目标精度的候选，不宣称法定界址",
        ],
    }

    OUTPUT_GEOJSON.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    OUTPUT_QA.write_text(
        json.dumps(qa, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
