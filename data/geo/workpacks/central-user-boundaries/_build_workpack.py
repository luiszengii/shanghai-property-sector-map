# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "geopandas==1.1.4",
#   "numpy==2.4.2",
#   "networkx==3.6.1",
#   "pyogrio==0.13.0",
#   "pyproj==3.7.2",
#   "shapely==2.1.2",
# ]
# ///

"""Build three user-decided central Shanghai market-sector candidates.

Commercial maps are used only to decide market semantics and approximate
topology. Every output coordinate is derived from the locked OSM snapshot.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import networkx as nx
import pyogrio
from shapely import set_precision
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon, box, mapping
from shapely.geometry.polygon import orient
from shapely.ops import linemerge, nearest_points, polygonize, split, substring, unary_union
from shapely.validation import make_valid


WORKPACK = Path(__file__).resolve().parent
REPO = WORKPACK.parents[3]
SOURCE_LOCK = REPO / "data/geo/sources/osm-shanghai-260721.json"
OUTPUT_GEOJSON = WORKPACK / "candidate.wgs84.geojson"
OUTPUT_QA = WORKPACK / "qa.json"
WORKING_CRS = "EPSG:32651"
OUTPUT_CRS = "OGC:CRS84"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def polygon_parts(geometry):
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return [part for part in getattr(geometry, "geoms", []) if isinstance(part, Polygon)]


def normalize_polygonal(geometry):
    valid = make_valid(set_precision(geometry, 0.01, mode="valid_output"))
    parts = [
        orient(part, sign=1.0)
        for part in polygon_parts(valid)
        if not part.is_empty and part.area > 1
    ]
    if not parts:
        raise ValueError("geometry did not produce a polygon")
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def projected(geometry):
    return gpd.GeoSeries([geometry], crs=OUTPUT_CRS).to_crs(WORKING_CRS).iloc[0]


def unprojected(geometry):
    return gpd.GeoSeries([geometry], crs=WORKING_CRS).to_crs(OUTPUT_CRS).iloc[0]


def linear_parts(geometry):
    if isinstance(geometry, LineString):
        return [geometry]
    if isinstance(geometry, MultiLineString):
        return list(geometry.geoms)
    return [
        part
        for part in getattr(geometry, "geoms", [])
        if isinstance(part, LineString)
    ]


def inferred_axis(features, name: str, orientation: str, frame):
    selected = features[features["name"] == name]
    if selected.empty:
        raise ValueError(f"locked snapshot has no feature named {name}")
    union = unary_union(selected.geometry)
    minx, miny, maxx, maxy = frame.bounds
    samples = []
    if orientation == "vertical":
        for y in np.linspace(miny - 100, maxy + 100, 360):
            crossing = union.intersection(LineString([(minx - 2000, y), (maxx + 2000, y)]))
            xs = [part.x for part in getattr(crossing, "geoms", [crossing]) if isinstance(part, Point)]
            if xs:
                samples.append((float(np.median(xs)), float(y)))
    else:
        for x in np.linspace(minx - 100, maxx + 100, 360):
            crossing = union.intersection(LineString([(x, miny - 2000), (x, maxy + 2000)]))
            ys = [part.y for part in getattr(crossing, "geoms", [crossing]) if isinstance(part, Point)]
            if ys:
                samples.append((float(x), float(np.median(ys))))
    if len(samples) < 8:
        raise ValueError(f"{name} has too few crossings to infer a stable axis")
    if orientation == "vertical":
        lower_fit = np.polyfit(
            [point[1] for point in samples[:12]],
            [point[0] for point in samples[:12]],
            1,
        )
        upper_fit = np.polyfit(
            [point[1] for point in samples[-12:]],
            [point[0] for point in samples[-12:]],
            1,
        )
        samples.insert(0, (float(np.polyval(lower_fit, miny - 100)), miny - 100))
        samples.append((float(np.polyval(upper_fit, maxy + 100)), maxy + 100))
    else:
        lower_fit = np.polyfit(
            [point[0] for point in samples[:12]],
            [point[1] for point in samples[:12]],
            1,
        )
        upper_fit = np.polyfit(
            [point[0] for point in samples[-12:]],
            [point[1] for point in samples[-12:]],
            1,
        )
        samples.insert(0, (minx - 100, float(np.polyval(lower_fit, minx - 100))))
        samples.append((maxx + 100, float(np.polyval(upper_fit, maxx + 100))))
    return LineString(samples), sorted({str(value) for value in selected.osm_id})


def named_union(features, name):
    selected = features[features["name"] == name]
    if selected.empty:
        raise ValueError(f"locked snapshot has no feature named {name}")
    return unary_union(selected.geometry), sorted({str(value) for value in selected.osm_id})


def junction(first, second, hint=None):
    intersection = first.intersection(second)
    points = [
        part for part in getattr(intersection, "geoms", [intersection])
        if isinstance(part, Point)
    ]
    if points:
        return min(points, key=lambda point: point.distance(hint)) if hint else points[0]
    return nearest_points(first, second)[0]


def route_segment(route, start, end):
    merged = route if isinstance(route, LineString) else linemerge(route)
    candidates = linear_parts(merged)
    line = min(candidates, key=lambda item: item.distance(start) + item.distance(end))
    start_distance = line.project(nearest_points(line, start)[0])
    end_distance = line.project(nearest_points(line, end)[0])
    return substring(line, min(start_distance, end_distance), max(start_distance, end_distance))


def shortest_road_connector(features, start, end):
    network = unary_union(features.geometry)
    graph = nx.Graph()
    edge_geometries = {}
    for line in linear_parts(network):
        coordinates = list(line.coords)
        if len(coordinates) < 2:
            continue
        first = tuple(round(value, 2) for value in coordinates[0])
        second = tuple(round(value, 2) for value in coordinates[-1])
        graph.add_edge(first, second, weight=float(line.length))
        edge_geometries[frozenset((first, second))] = line
    nodes = list(graph.nodes)
    start_node = min(nodes, key=lambda node: Point(node).distance(start))
    end_node = min(nodes, key=lambda node: Point(node).distance(end))
    path = nx.shortest_path(graph, start_node, end_node, weight="weight")
    lines = [
        edge_geometries[frozenset((first, second))]
        for first, second in zip(path, path[1:])
    ]
    return unary_union([
        LineString([start.coords[0], start_node]),
        *lines,
        LineString([end_node, end.coords[0]]),
    ])


def cut_to_inside(face, cutter, inside):
    pieces = [part for part in split(face, cutter).geoms if isinstance(part, Polygon)]
    containing = [part for part in pieces if part.covers(inside)]
    if len(containing) != 1:
        raise ValueError(f"cutter should leave one face containing {inside.wkt}, got {len(containing)}")
    return normalize_polygonal(containing[0])


def bounded_face(frame, cutters, inside):
    face = normalize_polygonal(frame)
    for cutter in cutters:
        face = cut_to_inside(face, cutter, inside)
    return face


def buffered_barrier_face(frame, barriers, inside, cut_buffer=24):
    cut = frame.difference(unary_union(barriers).buffer(cut_buffer, join_style="mitre"))
    containing = [part for part in polygon_parts(cut) if part.contains(inside)]
    if len(containing) != 1:
        raise ValueError(f"barriers should leave one face containing {inside.wkt}, got {len(containing)}")
    restored = containing[0].buffer(cut_buffer, join_style="mitre").intersection(frame)
    containing = [part for part in polygon_parts(make_valid(restored)) if part.contains(inside)]
    if len(containing) != 1:
        raise ValueError("restored barrier face is not unique")
    return normalize_polygonal(containing[0])


def polygonized_face(barriers, inside, prefer_largest=False):
    faces = [part for part in polygonize(unary_union(barriers)) if part.area > 1]
    if prefer_largest and faces:
        return normalize_polygonal(max(faces, key=lambda part: part.area))
    containing = [part for part in faces if part.covers(inside)]
    if not containing and len(faces) == 1:
        containing = faces
    if not containing and faces:
        nearest_distance = min(part.distance(inside) for part in faces)
        containing = [
            part for part in faces
            if abs(part.distance(inside) - nearest_distance) < 0.01
        ]
    if len(containing) != 1:
        diagnostics = [
            (
                round(part.area / 1_000_000, 4),
                tuple(round(value, 1) for value in part.bounds),
                round(part.distance(inside), 1),
            )
            for part in faces
        ]
        raise ValueError(
            f"polygonized barriers should leave one face containing {inside.wkt}, "
            f"got {len(containing)} from {len(faces)} faces: {diagnostics}"
        )
    return normalize_polygonal(containing[0])


def connecting_line(first, second):
    first_point, second_point = nearest_points(first, second)
    if first_point.distance(second_point) < 0.01:
        return None
    return LineString([first_point.coords[0], second_point.coords[0]])


def closed_route_face(routes, inside):
    barriers = list(routes)
    for index, route in enumerate(routes):
        connector = connecting_line(route, routes[(index + 1) % len(routes)])
        if connector is not None:
            barriers.append(connector)
    return polygonized_face(barriers, inside)


def feature(sector_id, name, geometry, rule, route_refs):
    output = unprojected(normalize_polygonal(geometry))
    representative = output.representative_point()
    return {
        "type": "Feature",
        "properties": {
            "id": sector_id,
            "sectorId": sector_id,
            "name": name,
            "candidateStatus": "selected-market-candidate",
            "selectedForAssembly": True,
            "reviewStatus": "draft-medium",
            "coordinateSystem": OUTPUT_CRS,
            "geometrySourceSnapshotId": "osm-geofabrik-shanghai-260721",
            "geometryMethod": "user_decided_market_scope_from_locked_osm_routes",
            "geometryRule": rule,
            "areaSquareKilometers": round(float(geometry.area) / 1_000_000, 4),
            "labelPoint": [round(representative.x, 7), round(representative.y, 7)],
            "routeOsmRefs": route_refs,
        },
        "geometry": mapping(output),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpkg", type=Path, required=True)
    args = parser.parse_args()
    source_lock = json.loads(SOURCE_LOCK.read_text(encoding="utf-8"))
    actual_hash = sha256(args.gpkg)
    if actual_hash != source_lock["gpkgSha256"]:
        raise ValueError(f"GeoPackage hash mismatch: {actual_hash}")

    read_bbox = (121.38, 31.19, 121.48, 31.30)
    roads = pyogrio.read_dataframe(
        args.gpkg, layer="gis_osm_roads_free", bbox=read_bbox
    ).to_crs(WORKING_CRS)
    waterways = pyogrio.read_dataframe(
        args.gpkg, layer="gis_osm_waterways_free", bbox=read_bbox
    ).to_crs(WORKING_CRS)

    route_refs = {}
    z_frame = projected(box(121.392, 31.198, 121.438, 31.246))
    z_inside = projected(Point(121.414, 31.221))
    inner, route_refs["内环高架路"] = inferred_axis(roads, "内环高架路", "vertical", z_frame)
    jiangsu, route_refs["江苏路"] = inferred_axis(roads, "江苏路", "vertical", z_frame)
    yanan, route_refs["延安高架路"] = inferred_axis(roads, "延安高架路", "horizontal", z_frame)
    suzhou_rows = waterways[waterways["name"] == "苏州河"]
    if suzhou_rows.empty:
        raise ValueError("locked snapshot has no 苏州河")
    suzhou = unary_union(suzhou_rows.geometry)
    route_refs["苏州河"] = sorted({str(value) for value in suzhou_rows.osm_id})
    zhongshan = bounded_face(z_frame, [inner, jiangsu, yanan, suzhou], z_inside)

    zn_frame = projected(box(121.417, 31.205, 121.444, 31.239))
    zn_inside = projected(Point(121.432, 31.219))
    zn_names = ["武定西路", "万航渡路", "愚园路", "镇宁路", "江苏路", "延安西路"]
    zn_refs = {}
    zn_routes = {}
    for name in zn_names:
        zn_routes[name], zn_refs[name] = named_union(roads, name)
    north_routes = [
        route_segment(
            zn_routes["武定西路"],
            junction(zn_routes["江苏路"], zn_routes["武定西路"]),
            junction(zn_routes["武定西路"], zn_routes["万航渡路"]),
        ),
        route_segment(
            zn_routes["万航渡路"],
            junction(zn_routes["武定西路"], zn_routes["万航渡路"]),
            junction(zn_routes["万航渡路"], zn_routes["愚园路"]),
        ),
        route_segment(
            zn_routes["愚园路"],
            junction(zn_routes["万航渡路"], zn_routes["愚园路"]),
            junction(zn_routes["愚园路"], zn_routes["镇宁路"]),
        ),
    ]
    north_route = unary_union(north_routes)
    zn_west, _ = inferred_axis(roads, "江苏路", "vertical", zn_frame)
    zn_east, _ = inferred_axis(roads, "镇宁路", "vertical", zn_frame)
    zn_south, _ = inferred_axis(roads, "延安西路", "horizontal", zn_frame)
    zn_northwest = junction(zn_routes["江苏路"], zn_routes["武定西路"])
    zn_northeast = junction(zn_routes["愚园路"], zn_routes["镇宁路"])
    zn_southwest = junction(zn_routes["江苏路"], zn_routes["延安西路"])
    zn_southeast = junction(zn_routes["镇宁路"], zn_routes["延安西路"])
    zn_west_route = route_segment(
        zn_routes["江苏路"],
        zn_northwest,
        zn_southwest,
    )
    zn_east_route = route_segment(
        zn_routes["镇宁路"],
        zn_southeast,
        zn_northeast,
    )
    zn_south_route = route_segment(
        zn_routes["延安西路"],
        zn_southwest,
        zn_southeast,
    )
    zhenning = closed_route_face(
        [*north_routes, zn_east_route, zn_south_route, zn_west_route],
        zn_inside,
    )

    wn_frame = projected(box(121.397, 31.231, 121.457, 31.286))
    wn_inside = projected(Point(121.4215, 31.251))
    wn_names = ["中山北路", "中潭路"]
    wn_refs = {}
    wn_routes = {}
    for name in wn_names:
        wn_routes[name], wn_refs[name] = named_union(roads, name)
    wn_refs["苏州河"] = route_refs["苏州河"]
    wn_east_axis, _ = inferred_axis(roads, "中潭路", "vertical", wn_frame)
    zhongshan_suzhou = junction(
        wn_routes["中山北路"],
        suzhou,
        projected(Point(121.406, 31.236)),
    )
    zhongshan_zhongtan = junction(
        wn_routes["中山北路"],
        wn_routes["中潭路"],
        projected(Point(121.432, 31.258)),
    )
    zhongtan_suzhou = junction(
        wn_east_axis,
        suzhou,
        projected(Point(121.432, 31.241)),
    )
    wn_north_segment = route_segment(
            wn_routes["中山北路"],
            zhongshan_suzhou,
            zhongshan_zhongtan,
        )
    wn_east_segment = route_segment(
            wn_east_axis,
            zhongshan_zhongtan,
            zhongtan_suzhou,
        )
    connector_start, connector_end = nearest_points(
        wn_north_segment,
        wn_east_segment,
    )
    road_connector = connecting_line(wn_north_segment, wn_east_segment)
    wn_barriers = [
        wn_north_segment,
        *([road_connector] if road_connector is not None else []),
        wn_east_segment,
        shortest_road_connector(suzhou_rows, zhongtan_suzhou, zhongshan_suzhou),
    ]
    wuning = polygonized_face(wn_barriers, wn_inside)

    features = [
        feature(
            "sector_zhongshangongyuan",
            "中山公园",
            zhongshan,
            "用户裁定：南延安高架路、西内环高架路、东江苏路、北苏州河；西北保留滨水凹口。",
            route_refs,
        ),
        feature(
            "sector_zhenning_road",
            "镇宁路",
            zhenning,
            "用户裁定：北武定西路，经万航渡路、愚园路接镇宁路；东镇宁路、西江苏路、南延安西路；按道路分段闭合，不采用缓冲面。",
            zn_refs,
        ),
        feature(
            "sector_wuning",
            "武宁",
            wuning,
            "用户裁定：南苏州河，西北及北侧沿中山北路，东中潭路；中潭路按名称线方向延伸到苏州河，不采用道路缓冲面。",
            wn_refs,
        ),
    ]
    collection = {
        "type": "FeatureCollection",
        "name": "central-user-boundaries",
        "properties": {
            "workpackId": "central-user-boundaries",
            "candidateStatus": "selected-market-candidate",
            "coordinateSystem": OUTPUT_CRS,
            "commercialGeometryCopied": False,
        },
        "schemaVersion": "1.0.0",
        "sourceSnapshotId": source_lock["id"],
        "license": source_lock["license"],
        "attribution": source_lock["attribution"],
        "features": features,
    }
    overlaps = {}
    projected_by_id = {
        item["properties"]["id"]: projected(Polygon(item["geometry"]["coordinates"][0]))
        for item in features
        if item["geometry"]["type"] == "Polygon"
    }
    ids = list(projected_by_id)
    for index, first in enumerate(ids):
        for second in ids[index + 1:]:
            overlaps[f"{first}/{second}"] = round(
                float(projected_by_id[first].intersection(projected_by_id[second]).area), 3
            )
    qa = {
        "schemaVersion": "1.0.0",
        "workpackId": "central-user-boundaries",
        "generatedAt": "2026-07-25",
        "workingCrs": WORKING_CRS,
        "outputCrs": OUTPUT_CRS,
        "sourceSnapshotId": source_lock["id"],
        "sourceGeoPackageSha256": actual_hash,
        "commercialGeometryCopied": False,
        "areasSquareKilometers": {
            item["properties"]["id"]: item["properties"]["areaSquareKilometers"]
            for item in features
        },
        "overlapSquareMeters": overlaps,
        "validGeometry": all(shape["geometry"]["type"] in {"Polygon", "MultiPolygon"} for shape in features),
    }
    OUTPUT_GEOJSON.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUTPUT_QA.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"generated {len(features)} central market candidates")


if __name__ == "__main__":
    main()
