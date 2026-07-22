import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

const bundledGeometry = readJson("src/data/sectors.json");
const sourceGeometry = readJson("src/data/sectors.geojson");
const registryData = readJson("src/data/sectors/registry.json");
const sourceData = readJson("src/data/sectors/sources.json");
const evidenceData = readJson("src/data/sectors/boundary-evidence.json");
const candidateData = readJson("src/data/sectors/reviewed-candidates.wgs84.json");
const candidateManifest = readJson("src/data/sectors/reviewed-candidates.manifest.json");
const osmSourceLock = readJson("data/geo/sources/osm-shanghai-260721.json");

const errors = [];
const warnings = [];
const error = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function signedRingArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point, start, end) {
  const epsilon = 1e-10;
  if (Math.abs(cross(start, end, point)) > epsilon) return false;
  return point[0] >= Math.min(start[0], end[0]) - epsilon
    && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon
    && point[1] <= Math.max(start[1], end[1]) + epsilon;
}

function segmentsProperlyIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function pointInRingStrict(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return false;
    const intersects = (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1])
      && point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
        / (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function hasSelfIntersection(ring) {
  const segmentCount = ring.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      const adjacent = Math.abs(first - second) <= 1 || (first === 0 && second === segmentCount - 1);
      if (adjacent) continue;
      if (segmentsProperlyIntersect(ring[first], ring[first + 1], ring[second], ring[second + 1])) return true;
    }
  }
  return false;
}

function ringsOverlap(first, second) {
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      if (segmentsProperlyIntersect(
        first[firstIndex],
        first[firstIndex + 1],
        second[secondIndex],
        second[secondIndex + 1],
      )) return true;
    }
  }
  return first.slice(0, -1).some((point) => pointInRingStrict(point, second))
    || second.slice(0, -1).some((point) => pointInRingStrict(point, first));
}

function normalizedJson(value) {
  return JSON.stringify(value);
}

if (normalizedJson(sourceGeometry) !== normalizedJson(bundledGeometry)) {
  error("src/data/sectors.geojson 与 src/data/sectors.json 不同步");
}

if (sourceGeometry.type !== "FeatureCollection" || !Array.isArray(sourceGeometry.features)) {
  error("sectors.geojson 必须是 GeoJSON FeatureCollection");
}

const features = sourceGeometry.features ?? [];
const registry = registryData.sectors ?? [];
const sources = sourceData.sources ?? [];
const edges = evidenceData.edges ?? [];
const featureIds = features.map((feature) => feature.properties?.id);
const registryIds = registry.map((record) => record.id);
const sourceIds = sources.map((source) => source.id);
const edgeIds = edges.map((edge) => edge.id);
const candidates = candidateData.features ?? [];
const candidateIds = candidates.map((feature) => feature.properties?.id);

for (const [label, ids] of [["板块 feature", featureIds], ["板块 registry", registryIds], ["来源", sourceIds], ["边界证据", edgeIds]]) {
  if (new Set(ids).size !== ids.length) error(`${label} ID 存在重复`);
}

const sortedFeatureIds = [...featureIds].sort();
const sortedRegistryIds = [...registryIds].sort();
if (normalizedJson(sortedFeatureIds) !== normalizedJson(sortedRegistryIds)) {
  error("registry 与 GeoJSON 的板块 ID 必须一一对应");
}

const registryById = new Map(registry.map((record) => [record.id, record]));
const sourceById = new Map(sources.map((source) => [source.id, source]));
const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
const requiredBoundarySides = ["north", "east", "south", "west"];

for (const feature of features) {
  const id = feature.properties?.id ?? "unknown";
  const record = registryById.get(id);
  if (feature.type !== "Feature") error(`${id}: type 必须为 Feature`);
  if (feature.geometry?.type !== "Polygon") error(`${id}: 现阶段仅允许 Polygon；接入 MultiPolygon 前需升级渲染层`);
  if (!record) continue;
  if (feature.properties?.name !== record.canonicalName) error(`${id}: GeoJSON name 与 registry canonicalName 不一致`);
  if (record.geometry.status === "demo" && record.geometry.publicationPolicy !== "demo_only") {
    error(`${id}: demo 几何必须限制为 demo_only`);
  }
  if (record.geometry.status !== "demo" && !record.geometry.coordinateSystemVerified) {
    error(`${id}: 非演示几何必须确认坐标系`);
  }
  for (const sourceId of [...record.definitionSourceIds, ...record.geometry.sourceIds]) {
    if (!sourceById.has(sourceId)) error(`${id}: 引用了不存在的 sourceId ${sourceId}`);
  }
  for (const boundaryEvidenceId of record.boundaryEvidenceIds) {
    const edge = edgeById.get(boundaryEvidenceId);
    if (!edge) error(`${id}: 引用了不存在的 boundaryEvidenceId ${boundaryEvidenceId}`);
    else if (edge.sectorId !== id) error(`${id}: 边界证据 ${boundaryEvidenceId} 指向了其他板块`);
  }
  const recordEdges = record.boundaryEvidenceIds
    .map((boundaryEvidenceId) => edgeById.get(boundaryEvidenceId))
    .filter(Boolean);
  for (const side of requiredBoundarySides) {
    const sideCount = recordEdges.filter((edge) => edge.side === side).length;
    if (sideCount !== 1) error(`${id}: ${side} 边界证据应且仅应有 1 条，实际 ${sideCount} 条`);
  }
  if (record.reviewStatus === "reviewed-high") {
    const confirmedEdges = record.boundaryEvidenceIds
      .map((edgeId) => edgeById.get(edgeId))
      .filter((edge) => edge?.status === "definition_confirmed");
    if (confirmedEdges.length < 4) error(`${id}: reviewed-high 至少需要 4 条已确认定义边`);
  }
  if (record.geometry.status === "reviewed" || record.geometry.status === "published") {
    const reusableGeometrySources = record.geometry.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source) => source?.allowedUse?.includes("geometry"));
    if (reusableGeometrySources.length === 0) error(`${id}: reviewed/published 几何缺少允许几何使用的来源`);
  }

  const rings = feature.geometry?.coordinates ?? [];
  if (rings.length !== 1) warn(`${id}: 当前渲染只经过单环验证，发现 ${rings.length} 个环`);
  const outerRing = rings[0] ?? [];
  if (outerRing.length < 4) error(`${id}: 外环至少需要 4 个坐标点`);
  else {
    if (!samePoint(outerRing[0], outerRing.at(-1))) error(`${id}: 外环没有闭合`);
    for (const [longitude, latitude] of outerRing) {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) error(`${id}: 存在非数字坐标`);
      if (longitude < 120.8 || longitude > 122.2 || latitude < 30.6 || latitude > 31.9) {
        error(`${id}: 坐标超出上海合理范围 ${longitude},${latitude}`);
      }
    }
    if (hasSelfIntersection(outerRing)) error(`${id}: 外环自相交`);
    if (signedRingArea(outerRing) < 0) warn(`${id}: 外环为顺时针；正式 GeoJSON 建议按 RFC 7946 调整为逆时针`);
    if (!pointInRingStrict(feature.properties.center, outerRing)) error(`${id}: 标签中心点不在面内`);
  }
}

for (const edge of edges) {
  if (!registryById.has(edge.sectorId)) error(`${edge.id}: sectorId 不存在`);
  if (!sourceById.has(edge.sourceId)) error(`${edge.id}: sourceId 不存在`);
}

const nonDemoRegistryIds = registry
  .filter((record) => record.geometry.status !== "demo")
  .map((record) => record.id)
  .sort();
if (normalizedJson([...candidateIds].sort()) !== normalizedJson(nonDemoRegistryIds)) {
  error("非演示 registry 记录必须与 reviewed candidate 几何一一对应");
}
if (candidateData.license !== "ODbL-1.0" || !candidateData.attribution?.includes("OpenStreetMap")) {
  error("候选几何缺少 ODbL 许可或 OpenStreetMap 署名");
}
if (candidateData.sourceSnapshotId !== osmSourceLock.id) error("候选几何 sourceSnapshotId 与锁定来源不一致");
if (candidateManifest.sourceGpkgSha256 !== osmSourceLock.gpkgSha256) error("候选 manifest 的 GeoPackage SHA-256 与来源锁不一致");

const manifestById = new Map((candidateManifest.sectors ?? []).map((item) => [item.id, item]));
for (const candidate of candidates) {
  const id = candidate.properties?.id ?? "unknown-candidate";
  const record = registryById.get(id);
  if (!record) {
    error(`${id}: 候选几何没有 registry 记录`);
    continue;
  }
  if (candidate.properties.status !== "reviewed-candidate") error(`${id}: 候选 status 必须是 reviewed-candidate`);
  if (candidate.properties.coordinateSystem !== "WGS84") error(`${id}: 候选主几何必须保存为 WGS84`);
  if (candidate.properties.geometrySourceSnapshotId !== osmSourceLock.id) error(`${id}: 候选来源快照不匹配`);
  if (!manifestById.has(id)) error(`${id}: 候选几何缺少 OSM 对象 manifest`);
  if (!Number.isFinite(candidate.properties.areaSquareKilometers) || candidate.properties.areaSquareKilometers <= 0) {
    error(`${id}: 候选面积无效`);
  }
  const polygonGroups = candidate.geometry?.type === "Polygon"
    ? [candidate.geometry.coordinates]
    : candidate.geometry?.type === "MultiPolygon"
      ? candidate.geometry.coordinates
      : [];
  if (polygonGroups.length === 0) error(`${id}: 候选几何必须是 Polygon 或 MultiPolygon`);
  for (const polygon of polygonGroups) {
    const outerRing = polygon[0] ?? [];
    if (outerRing.length < 4 || !samePoint(outerRing[0], outerRing.at(-1))) error(`${id}: 候选外环未闭合`);
    if (hasSelfIntersection(outerRing)) error(`${id}: 候选外环自相交`);
    if (signedRingArea(outerRing) <= 0) error(`${id}: 候选外环必须按 RFC 7946 使用逆时针方向`);
    for (const [longitude, latitude] of outerRing) {
      if (longitude < 120.8 || longitude > 122.2 || latitude < 30.6 || latitude > 31.9) {
        error(`${id}: 候选坐标超出上海合理范围 ${longitude},${latitude}`);
      }
    }
  }
}

for (let first = 0; first < features.length; first += 1) {
  for (let second = first + 1; second < features.length; second += 1) {
    const firstRing = features[first].geometry?.coordinates?.[0];
    const secondRing = features[second].geometry?.coordinates?.[0];
    if (firstRing && secondRing && ringsOverlap(firstRing, secondRing)) {
      warn(`${features[first].properties.name} 与 ${features[second].properties.name} 的演示面重叠`);
    }
  }
}

const restrictedGeometryHosts = ["map.hfwgsj.com", "lianjia.com", "ke.com", "amap.com", "baidu.com", "qq.com"];
for (const record of registry) {
  for (const sourceId of record.geometry.sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source?.url) continue;
    const hostname = new URL(source.url).hostname;
    if (restrictedGeometryHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      error(`${record.id}: 几何来源 ${hostname} 属于禁止直接复制入库的平台`);
    }
  }
}

console.log(`板块数据检查：${features.length} 个入口面底稿，${candidates.length} 个候选面，${registry.length} 条注册记录，${edges.length} 条边界证据，${sources.length} 个来源。`);
for (const message of warnings) console.warn(`WARN ${message}`);
if (errors.length > 0) {
  for (const message of errors) console.error(`ERROR ${message}`);
  process.exitCode = 1;
} else {
  console.log(`通过：0 个错误，${warnings.length} 个待处理警告。`);
}
