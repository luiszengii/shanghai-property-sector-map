import { writeFile } from "node:fs/promises";

const seeds = [
  { id: "sector_jinganxincheng", name: "静安新城", center: [121.3775, 31.1615], radii: [0.018, 0.014], rotationDegrees: -8 },
  { id: "sector_longbai", name: "龙柏", center: [121.366, 31.187], radii: [0.017, 0.014], rotationDegrees: -12 },
  { id: "sector_hanghua", name: "航华", center: [121.354, 31.177], radii: [0.018, 0.014], rotationDegrees: 14 },
  { id: "sector_jinhongqiao", name: "金虹桥", center: [121.394, 31.185], radii: [0.018, 0.014], rotationDegrees: -8 },
  { id: "sector_laominhang", name: "老闵行", center: [121.404, 31.008], radii: [0.035, 0.025], rotationDegrees: -6 },
  { id: "sector_weifang", name: "潍坊", center: [121.526, 31.226], radii: [0.018, 0.016], rotationDegrees: 4 },
  { id: "sector_huamu", name: "花木", center: [121.553, 31.211], radii: [0.028, 0.021], rotationDegrees: -8 },
  { id: "sector_xijiao", name: "西郊", center: [121.356, 31.202], radii: [0.025, 0.018], rotationDegrees: -8 },
  { id: "sector_buyecheng", name: "不夜城", center: [121.458, 31.252], radii: [0.018, 0.014], rotationDegrees: 8 },
  { id: "sector_yangcheng", name: "阳城", center: [121.435, 31.283], radii: [0.015, 0.013], rotationDegrees: 5 },
  { id: "sector_yonghe", name: "永和", center: [121.448, 31.292], radii: [0.016, 0.014], rotationDegrees: -5 },
  { id: "sector_pengpu", name: "彭浦", center: [121.455, 31.307], radii: [0.026, 0.021], rotationDegrees: 4 },
  { id: "sector_wuning", name: "武宁", center: [121.425, 31.241], radii: [0.016, 0.013], rotationDegrees: -10 },
  { id: "sector_zhenguang", name: "真光", center: [121.382, 31.251], radii: [0.022, 0.017], rotationDegrees: 7 },
  { id: "sector_guangxin", name: "光新", center: [121.432, 31.25], radii: [0.014, 0.012], rotationDegrees: -5 },
  { id: "sector_yuanshen", name: "源深", center: [121.541, 31.239], radii: [0.015, 0.014], rotationDegrees: -7 },
  { id: "sector_yangdong", name: "杨东", center: [121.5283, 31.2009], radii: [0.015, 0.013], rotationDegrees: -5 },
  { id: "sector_lingang_main_city", name: "临港主城区", center: [121.905, 30.9], radii: [0.07, 0.055], rotationDegrees: 8 },
  { id: "sector_ruihong_new_town", name: "瑞虹新城", center: [121.495, 31.261], radii: [0.014, 0.012], rotationDegrees: -8 },
  { id: "sector_luxun_park", name: "鲁迅公园", center: [121.4789, 31.2736], radii: [0.015, 0.014], rotationDegrees: 5 },
  { id: "sector_yangpu_dongwaitan", name: "东外滩", center: [121.543, 31.263], radii: [0.028, 0.018], rotationDegrees: -6 },
  { id: "sector_dinghai_road", name: "定海路", center: [121.555, 31.274], radii: [0.024, 0.018], rotationDegrees: 7 },
  { id: "sector_huangxing_park", name: "黄兴公园", center: [121.5255, 31.2956], radii: [0.018, 0.016], rotationDegrees: -4 },
  { id: "sector_fengzhuang", name: "丰庄", center: [121.353, 31.248], radii: [0.016, 0.014], rotationDegrees: 8 },
  { id: "sector_jiading_new_city", name: "嘉定新城", center: [121.25, 31.332], radii: [0.035, 0.025], rotationDegrees: -6 },
  { id: "sector_jiading_old_city", name: "嘉定老城", center: [121.246, 31.385], radii: [0.025, 0.019], rotationDegrees: 6 },
  { id: "sector_dahua", name: "大华", center: [121.416, 31.278], radii: [0.023, 0.018], rotationDegrees: -8 },
  { id: "sector_shanghai_university", name: "上大", center: [121.4, 31.32], radii: [0.032, 0.024], rotationDegrees: 7 },
  { id: "sector_gongkang", name: "共康", center: [121.442, 31.331], radii: [0.025, 0.02], rotationDegrees: 5 },
  { id: "sector_songbao", name: "淞宝", center: [121.493, 31.397], radii: [0.04, 0.03], rotationDegrees: -7 },
  { id: "sector_zhenning_road", name: "镇宁路", center: [121.4334, 31.2195], radii: [0.012, 0.013], rotationDegrees: 5 },
  { id: "sector_xizang_north_road", name: "西藏北路", center: [121.4646, 31.2656], radii: [0.014, 0.016], rotationDegrees: -4 },
  { id: "sector_zhabei_park", name: "闸北公园", center: [121.4554, 31.2724], radii: [0.013, 0.012], rotationDegrees: 8 },
  { id: "sector_jiuting", name: "九亭", center: [121.315, 31.139], radii: [0.03, 0.023], rotationDegrees: -5 },
  { id: "sector_xinmin_villas", name: "莘闵别墅", center: [121.34, 31.105], radii: [0.028, 0.02], rotationDegrees: 7 },
  { id: "sector_songjiang_university_town", name: "松江大学城", center: [121.228, 31.056], radii: [0.035, 0.025], rotationDegrees: -6 },
  { id: "sector_songjiang_old_city", name: "松江老城", center: [121.235, 31.01], radii: [0.035, 0.025], rotationDegrees: 5 },
  { id: "sector_chongming_new_city", name: "崇明新城", center: [121.395, 31.625], radii: [0.06, 0.04], rotationDegrees: -5 },
];

function round(value) {
  return Number(value.toFixed(6));
}

function buildRing(centerLongitude, centerLatitude, radiusLongitude, radiusLatitude, rotationDegrees) {
  const rotation = rotationDegrees * Math.PI / 180;
  const points = Array.from({ length: 16 }, (_, index) => {
    const angle = index * 2 * Math.PI / 16;
    const variation = index % 2 === 0 ? 1 : 0.94;
    const x = Math.cos(angle) * radiusLongitude * variation;
    const y = Math.sin(angle) * radiusLatitude * variation;
    return [
      round(centerLongitude + x * Math.cos(rotation) - y * Math.sin(rotation)),
      round(centerLatitude + x * Math.sin(rotation) + y * Math.cos(rotation)),
    ];
  });
  return [...points, points[0]];
}

const features = seeds.map(({
  id,
  name,
  center: [centerLongitude, centerLatitude],
  radii: [radiusLongitude, radiusLatitude],
  rotationDegrees,
}) => ({
  type: "Feature",
  properties: {
    id,
    name,
    scopeVersion: "coverage-first-editorial-seed-2026-07",
    status: "editorial-seed",
    confidence: "low",
    coordinateSystem: "WGS84",
    method: "manual_anchor_editable_seed",
    geometryRule: "以登记行政区、公开地名的大致中心和相邻板块相对位置生成覆盖性可编辑初稿；用于消除无几何板块并供人工拖点修订，不表示官方、测绘或商业平台原始边界。",
    labelPoint: [centerLongitude, centerLatitude],
  },
  geometry: {
    type: "Polygon",
    coordinates: [[
      ...buildRing(
        centerLongitude,
        centerLatitude,
        radiusLongitude,
        radiusLatitude,
        rotationDegrees,
      ),
    ]],
  },
}));

const collection = {
  type: "FeatureCollection",
  name: "editorial-sector-seeds-wgs84",
  schemaVersion: "1.0.0",
  status: "editable-coverage-seed",
  notice: "低置信覆盖性可编辑初稿，非行政区划、非法定界址、非行业统一楼市板块。",
  features,
};
const index = {
  schemaVersion: "1.0.0",
  features: features.map((feature) => ({
    id: feature.properties.id,
    labelPoint: feature.properties.labelPoint,
    status: feature.properties.status,
  })),
};

await writeFile(
  new URL("../src/data/sectors/editorial-seeds.wgs84.json", import.meta.url),
  `${JSON.stringify(collection, null, 2)}\n`,
);
await writeFile(
  new URL("../src/data/sectors/editorial-seeds.index.json", import.meta.url),
  `${JSON.stringify(index, null, 2)}\n`,
);

console.log(`built ${features.length} editorial sector seeds`);
