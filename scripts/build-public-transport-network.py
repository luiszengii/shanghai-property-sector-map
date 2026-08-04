# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "geopandas==1.1.4",
#   "pyogrio==0.13.0",
#   "pyproj==3.7.2",
#   "shapely==2.1.2",
# ]
# ///

"""Build the public Shanghai metro and elevated-road presentation overlay.

The source is the version-locked Geofabrik/OpenStreetMap GeoPackage already
used by this repository. The large source download remains local; this script
publishes only simplified WGS84 display geometry with source metadata.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

import geopandas as gpd
from shapely.ops import linemerge


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_LOCK = REPO_ROOT / "data/geo/sources/osm-shanghai-260728.json"
SOURCE_GPKG = (
    REPO_ROOT / "outputs/osm/shanghai-260728-free.gpkg/shanghai.gpkg"
)
OUTPUT = REPO_ROOT / "src/data/transport-network.wgs84.json"
WORKING_CRS = "EPSG:32651"
OUTPUT_CRS = "EPSG:4326"
SIMPLIFY_TOLERANCE_METERS = 5
METRO_STATION_MAX_DISTANCE_METERS = 120
METRO_ROUTE_PATTERN = re.compile(
    r"(?:上海)?(?:地铁|轨道交通)(\d{1,2})(?:号线)?"
)
METRO_SHARED_ROUTE_PATTERN = re.compile(r"(?:地铁|轨道交通)(\d{1,2}/\d{1,2})号线")
ELEVATED_CORRIDOR_PATTERN = re.compile(
    r"高架|中环路|内环|外环|快速路|北横通道"
)
ELEVATED_ROAD_CLASSES = [
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
]
COMPLETE_CORRIDOR_ALIASES = {
    "中环路": (
        "中环路",
        "中环金沙江路地道",
        "北虹路地道",
        "仙霞路地道",
        "吴中路地道",
        "宜山路地道",
        "北虹路",
        "虹许路",
        "虹梅路",
    ),
    "外环高速": ("外环高速",),
    "内环高架路": ("内环高架路",),
}


def rounded_path(geometry) -> list[list[float]]:
    return [
        [round(float(longitude), 6), round(float(latitude), 6)]
        for longitude, latitude in geometry.coords
    ]


def normalized_metro_route(name: str) -> str:
    shared_match = METRO_SHARED_ROUTE_PATTERN.search(name)
    if shared_match:
        return shared_match.group(1).replace("/", "-")
    match = METRO_ROUTE_PATTERN.search(name)
    if match:
        return str(int(match.group(1)))
    return "network"


def simplified_paths(
    frame: gpd.GeoDataFrame,
    *,
    merge_connected: bool = False,
) -> list[list[list[float]]]:
    if frame.empty:
        return []
    working_geometry = frame.to_crs(WORKING_CRS).geometry
    if merge_connected:
        unioned = working_geometry.union_all()
        merged = (
            linemerge(unioned)
            if unioned.geom_type == "MultiLineString"
            else unioned
        )
        geometries = (
            list(merged.geoms)
            if merged.geom_type == "MultiLineString"
            else [merged]
        )
        working_geometry = gpd.GeoSeries(geometries, crs=WORKING_CRS)

    simplified = working_geometry.simplify(
        SIMPLIFY_TOLERANCE_METERS,
        preserve_topology=False,
    )
    output_geometry = gpd.GeoSeries(
        simplified,
        crs=WORKING_CRS,
    ).to_crs(OUTPUT_CRS)
    return [
        rounded_path(geometry)
        for geometry in output_geometry
        if geometry is not None and not geometry.is_empty and len(geometry.coords) >= 2
    ]


def build_metro_lines(railways: gpd.GeoDataFrame) -> list[dict[str, Any]]:
    subway = railways.loc[railways["fclass"].isin(["subway", "light_rail"])].copy()
    subway["display_name"] = subway["name"].fillna("").str.strip()
    subway["route"] = subway["display_name"].map(normalized_metro_route)

    groups: list[dict[str, Any]] = []
    for route, frame in subway.groupby("route", sort=False):
        paths = simplified_paths(frame)
        if not paths:
            continue
        route_label = route.replace("-", "/")
        groups.append({
            "id": f"metro-{route}",
            "name": "上海轨道交通网络" if route == "network" else f"上海地铁{route_label}号线",
            "route": route,
            "paths": paths,
        })

    def route_order(group: dict[str, Any]) -> tuple[int, str]:
        route = group["route"]
        if route == "network":
            return (999, route)
        return (int(route.split("-")[0]), route)

    return sorted(groups, key=route_order)


def build_metro_stations(
    transport: gpd.GeoDataFrame,
    railways: gpd.GeoDataFrame,
) -> list[dict[str, Any]]:
    subway_working = railways.loc[
        railways["fclass"].isin(["subway", "light_rail"])
    ].to_crs(WORKING_CRS)
    subway_geometry = subway_working.geometry.union_all()

    stations = transport.loc[
        transport["fclass"].eq("railway_station")
    ].copy()
    stations["display_name"] = stations["name"].fillna("").str.strip()
    stations = stations.loc[
        stations["display_name"].ne("")
        & ~stations["display_name"].str.contains("在建", regex=False)
    ].to_crs(WORKING_CRS)
    stations["metro_distance"] = stations.geometry.distance(subway_geometry)
    stations = stations.loc[
        stations["metro_distance"] <= METRO_STATION_MAX_DISTANCE_METERS
    ].sort_values(["display_name", "metro_distance", "osm_id"])
    stations = stations.drop_duplicates("display_name", keep="first").to_crs(OUTPUT_CRS)

    return [
        {
            "id": f"metro-station-{row.osm_id}",
            "name": row.display_name,
            "position": [
                round(float(row.geometry.x), 6),
                round(float(row.geometry.y), 6),
            ],
        }
        for row in stations.itertuples()
    ]


def build_elevated_roads(roads: gpd.GeoDataFrame) -> list[dict[str, Any]]:
    major = roads.loc[
        roads["fclass"].isin(ELEVATED_ROAD_CLASSES)
    ].copy()
    major["display_name"] = major["name"].fillna("").str.strip()
    major["display_ref"] = major["ref"].fillna("").str.strip()

    # `bridge`/`layer` identifies reliable elevated seeds. It is deliberately
    # not enough to expand every seed to its whole same-name road: many surface
    # roads contain one overpass and would then be painted as elevated for
    # kilometres. Only explicit elevated/ring/express corridors are completed.
    seed_mask = (
        major["bridge"].eq("T")
        | major["layer"].fillna(0).gt(0)
    ) & ~major["tunnel"].eq("T")
    seeds = major.loc[seed_mask]

    groups: list[dict[str, Any]] = []
    consumed_osm_ids: set[Any] = set()

    # Shanghai's western middle-ring transition is represented by its surface
    # road and tunnel names in OSM rather than one uninterrupted `中环路` name.
    # Canonicalise those explicit aliases into the single public corridor.
    for corridor_name, aliases in COMPLETE_CORRIDOR_ALIASES.items():
        frame = major.loc[major["display_name"].isin(aliases)]
        paths = simplified_paths(frame, merge_connected=True)
        if not paths:
            continue
        consumed_osm_ids.update(frame["osm_id"])
        groups.append({
            "id": f"elevated-complete-{len(groups) + 1:03d}",
            "name": corridor_name,
            "kind": "expressway" if "高速" in corridor_name else "urban",
            "scope": "major",
            "paths": paths,
        })

    explicit = major.loc[
        major["display_name"].str.contains(ELEVATED_CORRIDOR_PATTERN)
        & ~major["osm_id"].isin(consumed_osm_ids)
    ]
    for corridor_name, frame in explicit.groupby("display_name", sort=True):
        paths = simplified_paths(frame, merge_connected=True)
        if not paths:
            continue
        consumed_osm_ids.update(frame["osm_id"])
        expressway = (
            frame["fclass"].str.startswith("motorway").any()
            or "高速" in corridor_name
        )
        groups.append({
            "id": f"elevated-explicit-{len(groups) + 1:03d}",
            "name": corridor_name,
            "kind": "expressway" if expressway else "urban",
            "scope": "major",
            "paths": paths,
        })

    # All other roads retain only the actual bridge/layer segments. This keeps
    # the useful overpasses without colouring ordinary ground-level roads.
    remaining_seeds = seeds.loc[~seeds["osm_id"].isin(consumed_osm_ids)].copy()
    remaining_seeds["corridor_name"] = remaining_seeds["display_name"].where(
        remaining_seeds["display_name"].ne(""),
        remaining_seeds["display_ref"],
    )
    named_seeds = remaining_seeds.loc[
        remaining_seeds["corridor_name"].ne("")
    ]
    for corridor_name, frame in named_seeds.groupby("corridor_name", sort=True):
        paths = simplified_paths(frame, merge_connected=True)
        if not paths:
            continue
        expressway = frame["fclass"].str.startswith("motorway").any()
        groups.append({
            "id": f"elevated-seed-{len(groups) + 1:03d}",
            "name": corridor_name,
            "kind": "expressway" if expressway else "urban",
            "scope": "local",
            "paths": paths,
        })

    unnamed = remaining_seeds.loc[
        remaining_seeds["corridor_name"].eq("")
    ]
    for kind, frame in [
        (
            "expressway",
            unnamed.loc[unnamed["fclass"].str.startswith("motorway")],
        ),
        (
            "urban",
            unnamed.loc[~unnamed["fclass"].str.startswith("motorway")],
        ),
    ]:
        paths = simplified_paths(frame, merge_connected=True)
        if paths:
            groups.append({
                "id": f"elevated-unnamed-{kind}",
                "name": (
                    "其他高架高速"
                    if kind == "expressway"
                    else "其他城市高架"
                ),
                "kind": kind,
                "scope": "local",
                "paths": paths,
            })
    return groups


def main() -> None:
    if not SOURCE_GPKG.exists():
        raise SystemExit(
            "Missing locked OSM GeoPackage. Run `pnpm setup:local` or restore "
            f"{SOURCE_GPKG.relative_to(REPO_ROOT)} first."
        )
    source = json.loads(SOURCE_LOCK.read_text(encoding="utf-8"))
    railways = gpd.read_file(
        SOURCE_GPKG,
        layer="gis_osm_railways_free",
        engine="pyogrio",
    )
    transport = gpd.read_file(
        SOURCE_GPKG,
        layer="gis_osm_transport_free",
        engine="pyogrio",
    )
    roads = gpd.read_file(
        SOURCE_GPKG,
        layer="gis_osm_roads_free",
        engine="pyogrio",
    )

    payload = {
        "metadata": {
            "version": "shanghai-public-transport-overlay-2026-07-31",
            "coordinateSystem": "WGS84",
            "source": source["provider"],
            "sourceSnapshot": source["id"],
            "sourceSnapshotAt": source["snapshotAt"],
            "sourceArchiveSha256": source["archiveSha256"],
            "sourceLock": str(SOURCE_LOCK.relative_to(REPO_ROOT)),
            "license": "Open Database License (ODbL)",
            "generator": str(Path(__file__).relative_to(REPO_ROOT)),
            "simplifyToleranceMeters": SIMPLIFY_TOLERANCE_METERS,
        },
        "metroLines": build_metro_lines(railways),
        "metroStations": build_metro_stations(transport, railways),
        "elevatedRoads": build_elevated_roads(roads),
    }
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        "Wrote "
        f"{OUTPUT.relative_to(REPO_ROOT)} with "
        f"{len(payload['metroLines'])} metro groups, "
        f"{len(payload['metroStations'])} stations and "
        f"{len(payload['elevatedRoads'])} elevated-road groups."
    )


if __name__ == "__main__":
    main()
