import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import transportNetwork from "../data/transport-network.wgs84.json" with { type: "json" };

test("publishes an attributed Shanghai metro and elevated-road overlay", () => {
  assert.equal(transportNetwork.metadata.coordinateSystem, "WGS84");
  assert.equal(
    transportNetwork.metadata.sourceLock,
    "data/geo/sources/osm-shanghai-260728.json",
  );
  assert.ok(transportNetwork.metroLines.length >= 18);
  assert.ok(transportNetwork.metroStations.length >= 200);
  assert.ok(transportNetwork.elevatedRoads.length >= 2);
  assert.ok(
    transportNetwork.elevatedRoads.every((group) => (
      group.paths.length > 0
      && group.paths.every((path) => path.length >= 2)
    )),
  );
});

function pathLengthKm(path: number[][]) {
  const earthRadiusKm = 6371.0088;
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    const [previousLongitude, previousLatitude] = path[index - 1];
    const [longitude, latitude] = path[index];
    const latitudeDelta = (latitude - previousLatitude) * Math.PI / 180;
    const longitudeDelta = (longitude - previousLongitude) * Math.PI / 180;
    const previousLatitudeRadians = previousLatitude * Math.PI / 180;
    const latitudeRadians = latitude * Math.PI / 180;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(previousLatitudeRadians) * Math.cos(latitudeRadians)
      * Math.sin(longitudeDelta / 2) ** 2;
    length += earthRadiusKm * 2 * Math.asin(Math.sqrt(haversine));
  }
  return length;
}

test("publishes complete named elevated and expressway corridors", () => {
  const minimumCorridorLengthKm: Record<string, number> = {
    内环高架路: 84,
    南北高架路: 57,
    中环路: 125,
    延安高架路: 26,
    沪闵高架路: 16,
    逸仙高架路: 20,
    嘉闵高架路: 66,
    北横通道: 6.8,
    外环高速: 188,
  };
  const corridorLengthByName = new Map(
    transportNetwork.elevatedRoads.map((group) => [
      group.name,
      group.paths.reduce(
        (total, path) => total + pathLengthKm(path),
        0,
      ),
    ]),
  );

  for (const [name, minimumLength] of Object.entries(
    minimumCorridorLengthKm,
  )) {
    assert.ok(
      (corridorLengthByName.get(name) ?? 0) >= minimumLength,
      `${name} must remain continuous enough to cover at least ${minimumLength} km`,
    );
  }
});

test("publishes visually continuous ring-road overlays", () => {
  assert.doesNotThrow(() => execFileSync(
    "uv",
    ["run", "--script", "scripts/check-public-transport-network.py"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
    },
  ));
});

test("merges major elevated corridors into renderable paths without thousands of endpoint seams", () => {
  const maximumPathCounts: Record<string, number> = {
    "中环路": 80,
    "外环高速": 30,
    "内环高架路": 10,
    "南北高架路": 10,
    "延安高架路": 10,
    "沪闵高架路": 10,
    "逸仙高架路": 12,
    "嘉闵高架路": 10,
    "北横通道": 10,
  };

  for (const [name, maximumPathCount] of Object.entries(maximumPathCounts)) {
    const corridor = transportNetwork.elevatedRoads.find((group) => group.name === name);
    assert.ok(corridor, `${name} should exist`);
    assert.ok(
      corridor.paths.length <= maximumPathCount,
      `${name} has ${corridor.paths.length} independently capped paths; expected at most ${maximumPathCount}`,
    );
  }
});
