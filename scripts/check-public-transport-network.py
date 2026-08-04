# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pyproj==3.7.2",
#   "shapely==2.1.2",
# ]
# ///

"""Check that published major elevated-road corridors are visually continuous."""

from __future__ import annotations

import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString
from shapely.ops import transform, unary_union


REPO_ROOT = Path(__file__).resolve().parents[1]
NETWORK = REPO_ROOT / "src/data/transport-network.wgs84.json"
BUFFER_METERS = 30
CONTINUOUS_CORRIDORS = ("中环路", "外环高速", "内环高架路")


def component_count(paths: list[list[list[float]]]) -> int:
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32651", always_xy=True)
    buffered = [
        transform(transformer.transform, LineString(path)).buffer(BUFFER_METERS)
        for path in paths
    ]
    merged = unary_union(buffered)
    return len(merged.geoms) if merged.geom_type == "MultiPolygon" else 1


def main() -> None:
    network = json.loads(NETWORK.read_text(encoding="utf-8"))
    groups = {group["name"]: group for group in network["elevatedRoads"]}
    failures: list[str] = []
    for name in CONTINUOUS_CORRIDORS:
        group = groups.get(name)
        if group is None:
            failures.append(f"{name}: missing")
            continue
        components = component_count(group["paths"])
        print(f"{name}: {components} component(s) at {BUFFER_METERS}m")
        if components != 1:
            failures.append(f"{name}: expected 1 component, got {components}")
    if failures:
        raise SystemExit("\n".join(failures))


if __name__ == "__main__":
    main()
