import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const collection = JSON.parse(await readFile(
  new URL("../src/data/sectors/source-backed-proxies.wgs84.json", import.meta.url),
));
const index = JSON.parse(await readFile(
  new URL("../src/data/sectors/source-backed-proxies.index.json", import.meta.url),
));

assert.equal(collection.type, "FeatureCollection");
assert.ok(collection.features.length > 0, "至少应有一个公开范围代理");
assert.equal(collection.features.length, index.features.length);

const ids = collection.features.map((feature) => feature.properties.id);
assert.equal(new Set(ids).size, ids.length, "公开范围代理不得重复覆盖同一板块");
assert.deepEqual(
  [...index.features.map((feature) => feature.id)].sort(),
  [...ids].sort(),
  "轻量索引必须与代理集合一致",
);

for (const feature of collection.features) {
  const { properties, geometry } = feature;
  assert.equal(properties.status, "source-backed-proxy");
  assert.equal(properties.coordinateSystem, "WGS84");
  assert.ok(
    typeof properties.method === "string" && properties.method.length >= 8,
    `${properties.id} 必须声明可复核的代理构建方法`,
  );
  assert.equal(properties.confidence, "medium");
  assert.ok(properties.definitionSourceIds.length > 0);
  assert.ok(properties.geometryVerificationSourceIds.length >= 2);
  assert.ok(
    geometry.type === "Polygon" || geometry.type === "MultiPolygon",
    `${properties.id} 必须是 Polygon 或 MultiPolygon`,
  );
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
  for (const [polygonIndex, polygon] of polygons.entries()) {
    const exteriorRing = polygon[0];
    assert.ok(
      exteriorRing.length >= 5,
      `${properties.id} 第 ${polygonIndex + 1} 个外环至少应包含四条来源边`,
    );
    assert.deepEqual(
      exteriorRing[0],
      exteriorRing.at(-1),
      `${properties.id} 第 ${polygonIndex + 1} 个外环必须闭合`,
    );
    const signedArea = exteriorRing.slice(0, -1).reduce((area, point, index) => {
      const next = exteriorRing[index + 1];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2;
    assert.ok(
      signedArea > 0,
      `${properties.id} 第 ${polygonIndex + 1} 个外环应为 RFC 7946 逆时针方向`,
    );
  }
}

function containsChain(ring, chain) {
  return ring.some((point, index) => chain.every((expected, offset) =>
    JSON.stringify(ring[index + offset]) === JSON.stringify(expected)
  ));
}

const suhewan = collection.features.find((feature) => feature.properties.id === "sector_suhewan");
const buyecheng = collection.features.find((feature) => feature.properties.id === "sector_buyecheng");
if (suhewan && buyecheng) {
  const suhewanRing = suhewan.geometry.coordinates[0];
  const buyechengRing = buyecheng.geometry.coordinates[0];
  const sharedRoad = [
    [121.45813, 31.24358], [121.45819, 31.24703], [121.45847, 31.2481],
    [121.45862, 31.24944], [121.45892, 31.25098], [121.45932, 31.252],
  ];
  assert.ok(containsChain(suhewanRing, sharedRoad.slice().reverse()), "苏河湾必须包含完整的共和新路共享折线");
  assert.ok(containsChain(buyechengRing, sharedRoad), "不夜城必须反向复用完整的共和新路共享折线");
}

console.log(`source-backed proxy check passed: ${collection.features.length} proxies`);
