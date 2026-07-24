import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const registry = JSON.parse(
  await readFile(new URL("../src/data/sectors/registry.json", import.meta.url)),
).sectors;
const missingRecords = registry.filter(
  (record) => record.geometry.status === "missing",
);

const collection = JSON.parse(
  await readFile(
    new URL(
      "../src/data/sectors/editorial-seeds.wgs84.json",
      import.meta.url,
    ),
  ),
);
const index = JSON.parse(
  await readFile(
    new URL("../src/data/sectors/editorial-seeds.index.json", import.meta.url),
  ),
);

assert.equal(collection.type, "FeatureCollection");
assert.equal(collection.features.length, missingRecords.length);
assert.equal(index.features.length, missingRecords.length);

const expectedIds = new Set(missingRecords.map((record) => record.id));
const featureIds = collection.features.map((feature) => feature.properties.id);
assert.equal(new Set(featureIds).size, featureIds.length, "草图 id 不得重复");
assert.deepEqual(
  [...featureIds].sort(),
  [...expectedIds].sort(),
  "草图必须完整覆盖所有 missing 板块，且不能混入其他板块",
);

for (const feature of collection.features) {
  const { properties, geometry } = feature;
  assert.equal(properties.status, "editorial-seed");
  assert.equal(properties.coordinateSystem, "WGS84");
  assert.equal(properties.confidence, "low");
  assert.equal(geometry.type, "Polygon");
  assert.equal(geometry.coordinates.length, 1);

  const ring = geometry.coordinates[0];
  assert.ok(ring.length >= 9, `${properties.id} 至少需要 8 个边界节点`);
  assert.deepEqual(ring[0], ring.at(-1), `${properties.id} 边界必须闭合`);

  const [labelLongitude, labelLatitude] = properties.labelPoint;
  assert.ok(
    Number.isFinite(labelLongitude) && Number.isFinite(labelLatitude),
    `${properties.id} 中心点无效`,
  );
  for (const [longitude, latitude] of ring) {
    assert.ok(
      longitude >= 120.8
        && longitude <= 122.2
        && latitude >= 30.6
        && latitude <= 31.9,
      `${properties.id} 存在上海范围外坐标`,
    );
  }
}

const indexedIds = index.features.map((feature) => feature.id);
assert.deepEqual(
  [...indexedIds].sort(),
  [...expectedIds].sort(),
  "轻量索引必须与草图集合一致",
);

console.log(
  `editorial sector seed check passed: ${collection.features.length} editable coverage seeds`,
);
