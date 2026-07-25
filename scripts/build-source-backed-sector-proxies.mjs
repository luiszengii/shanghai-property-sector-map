import { writeFile } from "node:fs/promises";

// 2017 东/西片区共同以共和新路为界；两个面必须复用这条折线，不能各自近似。
const canonicalSharedGongheRoad = [
  [121.45813, 31.24358], [121.45819, 31.24703], [121.45847, 31.2481],
  [121.45862, 31.24944], [121.45892, 31.25098], [121.45932, 31.252],
];

const sourceBackedProxies = [
  {
    id: "sector_suhewan",
    name: "苏河湾",
    labelPoint: [121.468, 31.247],
    scopeVersion: "jingan-suhewan-east-functional-scope-2017-2026-07",
    confidence: "medium",
    proxyType: "historical-functional-proxy",
    definitionSourceIds: ["official-jingan-suhewan-2017-functional-scope"],
    geometryVerificationSourceIds: [
      "official-jingan-suhewan-2017-functional-scope",
      "osm-overpass-roads-2026-07-25",
    ],
    geometryRule: "按静安区 2017 年《苏河湾地区“十三五”规划》东部地区四至闭合：东河南北路，西共和新路，北交通路，南光复路、北苏州路。道路节点取 2026-07-25 OSM Overpass 可复核道路线；这是历史功能范围代理，不宣称等于楼市苏河湾。",
    ring: [
      ...canonicalSharedGongheRoad,
      [121.4692, 31.25269], [121.47206, 31.2541], [121.47468, 31.25226],
      [121.47512, 31.25183], [121.4769, 31.24969], [121.47723, 31.24842],
      [121.47776, 31.24572], [121.47843, 31.24435], [121.47631, 31.24252],
      [121.46734, 31.24235], [121.46577, 31.24156], [121.45824, 31.24291],
      [121.45813, 31.24358],
    ],
  },
  {
    id: "sector_buyecheng",
    name: "不夜城",
    labelPoint: [121.4515, 31.2485],
    scopeVersion: "jingan-buyecheng-west-functional-scope-2017-2026-07",
    confidence: "medium",
    proxyType: "historical-functional-proxy",
    definitionSourceIds: ["official-jingan-suhewan-2017-functional-scope"],
    geometryVerificationSourceIds: [
      "official-jingan-suhewan-2017-functional-scope",
      "osm-overpass-roads-2026-07-25",
    ],
    geometryRule: "按静安区 2017 年《苏河湾地区“十三五”规划》西部不夜城四至闭合：东共和新路，西恒丰北路、南苏州路，北中华新路—大统路—交通路，南光复路。道路节点取 2026-07-25 OSM Overpass 可复核道路线；这是历史功能范围代理，不宣称等于楼市不夜城。",
    ring: [
      [121.44567, 31.24545], [121.44501, 31.25496], [121.44711, 31.25415],
      [121.45017, 31.25297], [121.45527, 31.25112],
      ...canonicalSharedGongheRoad.slice().reverse(), [121.45425, 31.24074],
      [121.44567, 31.24545],
    ],
  },
];

function counterClockwiseRing(ring) {
  const signedArea = ring.slice(0, -1).reduce((area, point, index) => {
    const next = ring[index + 1];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  if (signedArea >= 0) return ring;
  const openRing = ring.slice(0, -1).reverse();
  return [...openRing, openRing[0]];
}

const features = sourceBackedProxies.map(({ ring, ...proxy }) => ({
  type: "Feature",
  properties: {
    ...proxy,
    status: "source-backed-proxy",
    coordinateSystem: "WGS84",
    method: "official_text_four_sides_osm_road_proxy",
  },
  geometry: { type: "Polygon", coordinates: [counterClockwiseRing(ring)] },
}));

const collection = {
  type: "FeatureCollection",
  name: "source-backed-sector-proxies-wgs84",
  schemaVersion: "1.0.0",
  status: "internal-review",
  notice: "依据公开规划文字四至和 OSM 道路节点重建的参考代理，非行政区划、非法定界址、非商业平台原始边界。",
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
  new URL("../src/data/sectors/source-backed-proxies.wgs84.json", import.meta.url),
  `${JSON.stringify(collection, null, 2)}\n`,
);
await writeFile(
  new URL("../src/data/sectors/source-backed-proxies.index.json", import.meta.url),
  `${JSON.stringify(index, null, 2)}\n`,
);

console.log(`built ${features.length} source-backed sector proxies`);
