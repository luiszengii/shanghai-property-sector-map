import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const collection = JSON.parse(await readFile(
  new URL("../src/data/sectors/source-backed-proxies.wgs84.json", import.meta.url),
));
const editorialSeeds = JSON.parse(await readFile(
  new URL("../src/data/sectors/editorial-seeds.wgs84.json", import.meta.url),
));
const sourcesDocument = JSON.parse(await readFile(
  new URL("../src/data/sectors/sources.json", import.meta.url),
));

const targets = {
  A: [
    "sector_xijiao", "sector_buyecheng",
    "sector_lingang_main_city", "sector_ruihong_new_town", "sector_huangxing_park",
    "sector_jiading_new_city", "sector_shanghai_university", "sector_songbao",
    "sector_jiuting",
  ],
  B: [
    "sector_yangcheng", "sector_yonghe", "sector_pengpu", "sector_zhenguang",
    "sector_weifang", "sector_huamu", "sector_yangpu_dongwaitan",
    "sector_dinghai_road", "sector_jiading_old_city", "sector_dahua",
    "sector_songjiang_university_town", "sector_chongming_new_city",
  ],
};

const proxyIds = new Set(collection.features.map((feature) => feature.properties.id));
const targetIds = new Set([...targets.A, ...targets.B]);
const proxyById = new Map(collection.features.map((feature) => [
  feature.properties.id,
  feature,
]));
const seedById = new Map(editorialSeeds.features.map((feature) => [
  feature.properties.id,
  feature,
]));
const sourceIds = new Set(sourcesDocument.sources.map((source) => source.id));
const missing = Object.fromEntries(Object.entries(targets).map(([level, ids]) => [
  level,
  ids.filter((id) => !proxyIds.has(id)),
]));

assert.equal(targets.A.length, 9, "A 级代理目标应为 9 个；外高桥已升级且南大、苏河湾已下线");
assert.equal(targets.B.length, 12, "B 级代理目标应为 12 个；联洋已按用户裁定下线");
assert.deepEqual(missing, { A: [], B: [] }, `A/B 级仍未替换的椭圆：${JSON.stringify(missing)}`);

for (const id of targetIds) {
  const feature = proxyById.get(id);
  const seed = seedById.get(id);
  assert.ok(feature.properties.proxyType, `${id} 必须声明代理类型`);
  assert.ok(feature.properties.geometryRule?.length >= 24, `${id} 必须说明几何构建规则`);
  assert.notDeepEqual(feature.geometry, seed?.geometry, `${id} 不得原样复用覆盖性椭圆`);
  for (const sourceId of [
    ...feature.properties.definitionSourceIds,
    ...feature.properties.geometryVerificationSourceIds,
  ]) {
    assert.ok(sourceIds.has(sourceId), `${id} 引用了未登记来源 ${sourceId}`);
  }
}

console.log("A/B boundary coverage check passed: A=9, B=12");
