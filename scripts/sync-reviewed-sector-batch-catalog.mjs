import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const batchArgument = process.argv[2];
if (!batchArgument) {
  throw new Error("用法：node scripts/sync-reviewed-sector-batch-catalog.mjs <batch-json>");
}

const resolveRepoFile = (relativePath) => {
  const resolved = path.resolve(repoRoot, relativePath);
  if (!resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`路径必须位于仓库内：${relativePath}`);
  }
  return resolved;
};

const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(resolveRepoFile(relativePath), "utf8"),
);
const findTopLevelObjectSpans = (source, arrayProperty) => {
  const propertyMarker = `"${arrayProperty}"`;
  const propertyIndex = source.indexOf(propertyMarker);
  const arrayStart = source.indexOf("[", propertyIndex + propertyMarker.length);
  if (propertyIndex < 0 || arrayStart < 0) {
    throw new Error(`找不到根数组 ${arrayProperty}`);
  }
  const spans = [];
  let arrayEnd = -1;
  let objectStart = -1;
  let objectDepth = 0;
  let arrayDepth = 1;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart + 1; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "[") arrayDepth += 1;
    else if (character === "]") {
      arrayDepth -= 1;
      if (arrayDepth === 0) {
        arrayEnd = index;
        break;
      }
    } else if (character === "{") {
      if (arrayDepth === 1 && objectDepth === 0) objectStart = index;
      objectDepth += 1;
    } else if (character === "}") {
      objectDepth -= 1;
      if (arrayDepth === 1 && objectDepth === 0 && objectStart >= 0) {
        spans.push({ start: objectStart, end: index + 1 });
        objectStart = -1;
      }
    }
  }
  if (arrayEnd < 0 || objectDepth !== 0 || arrayDepth !== 0) {
    throw new Error(`${arrayProperty} 数组结构无效`);
  }
  return { arrayEnd, spans };
};

const upsertJsonArrayItems = ({
  relativePath,
  arrayProperty,
  entries,
  getId,
  compact,
}) => {
  const filePath = resolveRepoFile(relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(source);
  const existingEntries = parsed[arrayProperty] ?? [];
  const expectedById = new Map(entries.map((entry) => [getId(entry), entry]));
  if (expectedById.size !== entries.length) {
    throw new Error(`${relativePath} 的待同步记录存在重复 ID`);
  }
  const formatEntry = (entry, includeFirstLineIndent) => {
    const serialized = compact
      ? JSON.stringify(entry)
      : JSON.stringify(entry, null, 2);
    return serialized.split("\n").map(
      (line, index) => (includeFirstLineIndent || index > 0 ? `    ${line}` : line),
    ).join("\n");
  };
  const { spans } = findTopLevelObjectSpans(source, arrayProperty);
  const spanById = new Map();
  for (const span of spans) {
    const entry = JSON.parse(source.slice(span.start, span.end));
    const id = getId(entry);
    if (spanById.has(id)) throw new Error(`${relativePath} 中存在重复 ID ${id}`);
    spanById.set(id, span);
  }
  const replacements = [];
  const missingEntries = [];
  for (const entry of entries) {
    const id = getId(entry);
    const span = spanById.get(id);
    if (!span) {
      missingEntries.push(entry);
      continue;
    }
    replacements.push({
      ...span,
      replacement: formatEntry(entry, false),
    });
  }
  let nextSource = source;
  for (const replacement of replacements.sort((first, second) => second.start - first.start)) {
    nextSource = `${nextSource.slice(0, replacement.start)}${replacement.replacement}`
      + nextSource.slice(replacement.end);
  }
  if (missingEntries.length > 0) {
    const refreshed = findTopLevelObjectSpans(nextSource, arrayProperty);
    const formattedEntries = missingEntries.map(
      (entry) => formatEntry(entry, true),
    ).join(",\n");
    const separator = existingEntries.length ? ",\n" : "\n";
    nextSource = `${nextSource.slice(0, refreshed.arrayEnd)}${separator}${formattedEntries}`
      + nextSource.slice(refreshed.arrayEnd);
  }
  fs.writeFileSync(filePath, nextSource);
};

const batch = readJson(batchArgument);
const batchPolicies = new Map([
  ["qingpu-songjiang-jinshan-thirty-2026-07", {
    expectedSectorCount: 30,
    districtCounts: {
      青浦区: 10,
      松江区: 10,
      金山区: 10,
    },
  }],
  ["xuhui-twelve-admin-aligned-2026-07", {
    expectedSectorCount: 12,
    districtCounts: {
      徐汇区: 12,
    },
  }],
]);
const batchPolicy = batchPolicies.get(batch.batchId);
if (!batchPolicy || batch.sectors?.length !== batchPolicy.expectedSectorCount) {
  throw new Error("本同步入口只接受已登记且数量匹配的行政骨架候选批次");
}

const aliasesBySectorId = new Map([
  ["sector_jinshanxincheng", ["石化"]],
]);
const sides = [
  ["north", "北"],
  ["east", "东"],
  ["south", "南"],
  ["west", "西"],
];
const expectedDistrictCounts = new Map(
  Object.entries(batchPolicy.districtCounts),
);
for (const [districtName, expectedCount] of expectedDistrictCounts) {
  const actualCount = batch.sectors.filter(
    (definition) => definition.districtName === districtName,
  ).length;
  if (actualCount !== expectedCount) {
    throw new Error(`${districtName} 应有 ${expectedCount} 个候选，实际 ${actualCount} 个`);
  }
}
if (batch.sectors.some(({ districtName }) => !expectedDistrictCounts.has(districtName))) {
  throw new Error("批次包含未核验的行政区名称");
}

const registryRecords = [];
for (const definition of batch.sectors) {
  const boundaryEvidenceIds = sides.map(
    ([side]) => `${definition.id.replace(/^sector_/, "")}-${side}`,
  );
  const isJinshanNewCity = definition.id === "sector_jinshanxincheng";
  const isTinglinCombinedProxy = definition.id === "sector_tinglin";
  registryRecords.push({
    id: definition.id,
    canonicalName: definition.canonicalName,
    aliases: aliasesBySectorId.get(definition.id) ?? [],
    districtNames: [definition.districtName],
    kind: isJinshanNewCity ? "ambiguous_market_sector" : "market_sector",
    reviewStatus: "draft-low",
    definitionStatus: "market_identity_admin_backbone_candidate",
    definitionCandidate: definition.geometryRule,
    definitionSourceIds: definition.definitionSourceIds,
    boundaryEvidenceIds,
    geometry: {
      status: "draft",
      confidence: "low",
      coordinateSystem: "WGS84",
      coordinateSystemVerified: true,
      version: definition.scopeVersion,
      sourceIds: ["osm-geofabrik-shanghai-260721"],
      verificationSourceIds: definition.geometryVerificationSourceIds,
      publicationPolicy: "internal_review",
      note: isJinshanNewCity
        ? "当前只显示石化街道行政骨架，不代表完整金山新城市场边界；必须在编辑器中按石化、山阳、金山卫项目归属继续修订。"
        : isTinglinCombinedProxy
          ? "当前 OSM 亭林镇 relation 与天地图行政示意均覆盖官方规划所称亭林镇与金山工业区合并范围；它只是约 122.725 平方公里的可编辑代理，不代表已排除工业区的市场亭林。"
        : "固定 OSM 街镇 relation 只作低置信、可编辑市场候选骨架；行政边界不等于行业统一楼市板块边界。",
    },
  });
}
upsertJsonArrayItems({
  relativePath: "src/data/sectors/registry.json",
  arrayProperty: "sectors",
  entries: registryRecords,
  getId: ({ id }) => id,
  compact: false,
});

const evidenceRecords = [];
for (const definition of batch.sectors) {
  const sourceLabel = definition.expectedOsmName;
  const supportingSourceIds = [
    ...new Set([
      ...definition.definitionSourceIds.filter((sourceId) => sourceId.startsWith("official-")),
      ...definition.geometryVerificationSourceIds.filter((sourceId) => sourceId.startsWith("official-")),
    ]),
  ];
  for (const [side, sideLabel] of sides) {
    const isJinshanNewCity = definition.id === "sector_jinshanxincheng";
    const isTinglinCombinedProxy = definition.id === "sector_tinglin";
    evidenceRecords.push({
      id: `${definition.id.replace(/^sector_/, "")}-${side}`,
      sectorId: definition.id,
      side,
      basisType: "osm_admin_relation_market_backbone",
      featureName: isJinshanNewCity
        ? `金山新城（石化街道行政骨架）${sideLabel}段候选线`
        : isTinglinCombinedProxy
          ? `亭林（亭林镇与金山工业区合并行政展示代理）${sideLabel}段候选线`
        : `${definition.canonicalName}（${sourceLabel}行政骨架）${sideLabel}段候选线`,
      status: "adjacent_review_required",
      confidence: "low",
      sourceId: "osm-geofabrik-shanghai-260721",
      supportingSourceIds,
      note: isJinshanNewCity
        ? "石化街道只作金山新城的临时代理骨架；金山新城可能跨石化、山阳、金山卫，本边不得视为市场定稿。"
        : isTinglinCombinedProxy
          ? "固定 OSM 亭林镇 relation 与天地图行政示意均呈现亭林镇和金山工业区合并范围；官方规划拆分为亭林镇 78.21 平方公里、金山工业区 43.22 平方公里。本边只属合并行政展示代理，不得视为已排除工业区的市场亭林。"
        : "固定行政 relation 只提供可编辑市场候选骨架；官方材料只用于名称、邻接和面积量级人工复核，不提供本项目可再分发坐标。",
    });
  }
}
upsertJsonArrayItems({
  relativePath: "src/data/sectors/boundary-evidence.json",
  arrayProperty: "edges",
  entries: evidenceRecords,
  getId: ({ id }) => id,
  compact: true,
});

console.log(`同步 ${batch.sectors.length} 个 registry 记录和 ${batch.sectors.length * 4} 条逐边证据`);
