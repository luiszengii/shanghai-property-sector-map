import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
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
  ["changning-four-direct-admin-aligned-2026-07", {
    expectedSectorCount: 4,
    districtCounts: {
      长宁区: 4,
    },
  }],
  ["changning-gubei-hongqiao-mutually-exclusive-2026-07", {
    expectedSectorCount: 2,
    districtCounts: {
      长宁区: 2,
    },
    catalogMode: "changning-gubei-hongqiao",
  }],
  ["changning-zhongshan-park-core-2026-07", {
    expectedSectorCount: 1,
    districtCounts: {
      长宁区: 1,
    },
    catalogMode: "changning-zhongshan-park-core",
  }],
  ["jingan-putuo-eleven-direct-admin-aligned-2026-07", {
    expectedSectorCount: 11,
    districtCounts: {
      静安区: 4,
      普陀区: 7,
    },
  }],
  ["hongkou-yangpu-seven-direct-admin-aligned-2026-07", {
    expectedSectorCount: 7,
    districtCounts: {
      虹口区: 4,
      杨浦区: 3,
    },
  }],
  ["hongkou-yangpu-two-evidence-backed-admin-proxies-2026-07", {
    expectedSectorCount: 2,
    districtCounts: {
      杨浦区: 2,
    },
  }],
  ["putuo-zhongyuan-liangwancheng-ganquan-yichuan-pair-2026-07", {
    expectedSectorCount: 2,
    districtCounts: {
      普陀区: 2,
    },
    catalogMode: "putuo-liangwancheng-ganquan-pair",
  }],
  ["baoshan-eight-direct-admin-aligned-2026-07", {
    expectedSectorCount: 8,
    districtCounts: {
      宝山区: 8,
    },
    catalogMode: "linked-admin-batch",
  }],
  ["jiading-eight-direct-admin-proxies-2026-07", {
    expectedSectorCount: 8,
    districtCounts: {
      嘉定区: 8,
    },
    catalogMode: "linked-admin-batch",
  }],
  ["fengxian-eight-current-admin-proxies-2026-07", {
    expectedSectorCount: 8,
    districtCounts: {
      奉贤区: 8,
    },
    catalogMode: "linked-admin-batch",
  }],
  ["minhang-four-current-town-proxies-2026-07", {
    expectedSectorCount: 4,
    districtCounts: {
      闵行区: 4,
    },
    catalogMode: "linked-admin-batch",
  }],
  ["pudong-eight-current-town-proxies-2026-07", {
    expectedSectorCount: 7,
    districtCounts: {
      浦东新区: 7,
    },
    catalogMode: "linked-admin-batch",
  }],
  ["pudong-inner-five-street-proxies-2026-07", { expectedSectorCount: 5, districtCounts: { 浦东新区: 5 }, catalogMode: "linked-admin-batch" }],
  ["pudong-north-market-repartition-2026-07", { expectedSectorCount: 4, districtCounts: { 浦东新区: 4 }, catalogMode: "market-workpack-batch" }],
  ["central-user-boundaries-2026-07", { expectedSectorCount: 3, districtCounts: { 长宁区: 2, 普陀区: 1 }, catalogMode: "market-workpack-batch" }],
]);
const batchPolicy = batchPolicies.get(batch.batchId);
if (!batchPolicy || batch.sectors?.length !== batchPolicy.expectedSectorCount) {
  throw new Error("本同步入口只接受已登记且数量匹配的行政骨架候选批次");
}

const aliasesBySectorId = new Map([
  ["sector_jinshanxincheng", ["石化"]],
  ["sector_tianshan", ["天山路"]],
  ["sector_xianxia", ["仙霞新村"]],
  ["sector_caoyang", ["曹杨新村街道"]],
  ["sector_zhenru", ["真如镇街道"]],
  ["sector_changfeng", ["长风新村街道"]],
  ["sector_changzheng", ["长征镇"]],
  ["sector_taopu", ["桃浦镇"]],
  ["sector_sichuanbeilu", ["四川北路街道"]],
  ["sector_quyang", ["曲阳路", "曲阳路街道"]],
  ["sector_liangcheng", ["凉城新村", "凉城新村街道"]],
  ["sector_jiangwanzhen", ["江湾镇街道"]],
  ["sector_kongjianglu", ["控江路街道"]],
  ["sector_wujiaochang", ["五角场街道"]],
  ["sector_xinjiangwancheng", ["新江湾城街道"]],
  ["sector_anshan", ["四平路街道"]],
  ["sector_zhongyuan", ["殷行街道"]],
  ["sector_zhongyuanliangwancheng", ["两湾城", "中远两湾"]],
  ["sector_ganquanyichuan", ["甘泉", "宜川"]],
  ["sector_gucun", ["顾村镇"]],
  ["sector_zhangmiao", ["张庙街道"]],
  ["sector_songnan", ["淞南镇"]],
  ["sector_gaojing", ["高境镇"]],
  ["sector_yanghang", ["杨行镇"]],
  ["sector_luodian", ["罗店镇"]],
  ["sector_yuepu", ["月浦镇"]],
  ["sector_luojing", ["罗泾镇"]],
  ["sector_jiangqiao", ["江桥镇"]],
  ["sector_nanxiang", ["南翔镇"]],
  ["sector_malu", ["马陆镇"]],
  ["sector_xuhang", ["徐行镇"]],
  ["sector_waigang", ["外冈镇"]],
  ["sector_anting", ["安亭镇"]],
  ["sector_huating", ["华亭镇"]],
  ["sector_juyuanxinqu", ["菊园街道"]],
  ["sector_xidu", ["西渡街道"]],
  ["sector_nanqiao", ["南桥镇"]],
  ["sector_fengxianjinhui", ["金汇镇"]],
  ["sector_haiwan", ["海湾镇"]],
  ["sector_zhelin", ["柘林镇"]],
  ["sector_situan", ["四团镇"]],
  ["sector_qingcun", ["青村镇"]],
  ["sector_zhuanghang", ["庄行镇"]],
  ["sector_qibao", ["七宝镇"]],
  ["sector_huacao", ["华漕镇"]],
  ["sector_meilong", ["梅陇镇"]],
  ["sector_zhuanqiao", ["颛桥镇"]],
  ["sector_maqiao", ["马桥镇"]],
  ["sector_wujing", ["吴泾镇"]],
  ["sector_pujiangzhen", ["浦江"]],
  ["sector_gaohang", ["高行镇"]],
  ["sector_caolu", ["曹路镇"]],
  ["sector_heqing", ["合庆镇"]],
  ["sector_datun", ["大团镇"]],
  ["sector_nicheng", ["泥城镇"]],
  ["sector_shuyuan", ["书院镇"]],
  ["sector_wanxiang", ["万祥镇"]],
  ["sector_laogang", ["老港镇"]],
  ["sector_lujiazui", ["陆家嘴街道"]], ["sector_yangjing", ["洋泾街道"]], ["sector_tangqiao", ["塘桥街道"]], ["sector_jinyang", ["金杨新村街道"]], ["sector_nanmatou", ["南码头路街道"]],
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
  if (batchPolicy.catalogMode === "market-workpack-batch") {
    registryRecords.push({
      id: definition.id,
      canonicalName: definition.canonicalName,
      aliases: aliasesBySectorId.get(definition.id) ?? [],
      riskFlags: definition.riskFlags ?? [],
      districtNames: [definition.districtName],
      kind: "market_sector",
      reviewStatus: "draft-medium",
      definitionStatus: "user_decided_market_scope",
      definitionCandidate: definition.geometryRule,
      definitionSourceIds: definition.definitionSourceIds,
      linkedTopologySectorIds: definition.sharedEdgeSectorIds,
      boundaryEvidenceIds: [
        `${definition.id.replace(/^sector_/, "")}-market-scope`,
      ],
      ...(definition.includedMarketAreas
        ? { includedMarketAreas: definition.includedMarketAreas }
        : {}),
      geometry: {
        status: "draft",
        confidence: "medium",
        coordinateSystem: "WGS84",
        coordinateSystemVerified: true,
        version: definition.scopeVersion,
        sourceIds: ["osm-geofabrik-shanghai-260721"],
        verificationSourceIds: definition.geometryVerificationSourceIds,
        publicationPolicy: "internal_review",
        note: "用户裁定的楼市板块候选；商业地图只用于语义与邻接参考，坐标由固定 OSM 道路、水系或行政骨架重建，不是法定或行业统一边界。",
      },
    });
    continue;
  }
  if (batchPolicy.catalogMode === "putuo-liangwancheng-ganquan-pair") {
    const isLiangwancheng = definition.id === "sector_zhongyuanliangwancheng";
    registryRecords.push({
      id: definition.id,
      canonicalName: definition.canonicalName,
      aliases: aliasesBySectorId.get(definition.id) ?? [],
      riskFlags: definition.riskFlags ?? [],
      districtNames: [definition.districtName],
      kind: "market_sector",
      reviewStatus: "draft-low",
      definitionStatus: isLiangwancheng
        ? "market_scope_candidate"
        : "admin_proxy_candidate",
      definitionCandidate: definition.geometryRule,
      definitionSourceIds: definition.definitionSourceIds,
      ...(definition.projectProxyName
        ? { projectProxyName: definition.projectProxyName }
        : {}),
      ...(definition.projectLanduseOsmIds
        ? { projectLanduseOsmIds: definition.projectLanduseOsmIds }
        : {}),
      ...("fullAdminUnionRejected" in definition
        ? { fullAdminUnionRejected: definition.fullAdminUnionRejected }
        : {}),
      ...(definition.excludedMarketAreas
        ? { excludedMarketAreas: definition.excludedMarketAreas }
        : {}),
      ...(definition.sharedEdgeReview
        ? { sharedEdgeReview: definition.sharedEdgeReview }
        : {}),
      linkedTopologySectorIds: definition.sharedEdgeSectorIds,
      boundaryEvidenceIds: isLiangwancheng
        ? definition.namedLanduseObjects.map(
          ({ osmId }) => `zhongyuanliangwancheng-landuse-${osmId}`,
        )
        : [
          ...definition.osmAdminRelations.map(
            ({ osmAdminRelationId }) => `ganquanyichuan-admin-${osmAdminRelationId}`,
          ),
          ...batch.sectors
            .find(({ id }) => id === "sector_zhongyuanliangwancheng")
            .namedLanduseObjects.map(
              ({ osmId }) => `ganquanyichuan-shared-hole-${osmId}`,
            ),
        ],
      geometry: {
        status: "draft",
        confidence: "low",
        coordinateSystem: "WGS84",
        coordinateSystemVerified: true,
        version: definition.scopeVersion,
        sourceIds: ["osm-geofabrik-shanghai-260721"],
        verificationSourceIds: definition.geometryVerificationSourceIds,
        publicationPolicy: "internal_review",
        note: definition.registryGeometryNote,
      },
    });
    continue;
  }
  if (batchPolicy.catalogMode === "changning-zhongshan-park-core") {
    registryRecords.push({
      id: definition.id,
      canonicalName: definition.canonicalName,
      aliases: ["中山公园核心候选"],
      riskFlags: definition.riskFlags ?? [],
      districtNames: [definition.districtName],
      kind: "market_sector",
      reviewStatus: "draft-medium",
      definitionStatus: "official_scope_market_candidate",
      definitionCandidate: definition.geometryRule,
      definitionSourceIds: definition.definitionSourceIds,
      boundaryEvidenceIds: definition.boundaryAnchors.map(
        ({ side }) => `zhongshangongyuan-${side}`,
      ),
      geometry: {
        status: "draft",
        confidence: "medium",
        coordinateSystem: "WGS84",
        coordinateSystemVerified: true,
        version: definition.scopeVersion,
        sourceIds: ["osm-geofabrik-shanghai-260721"],
        verificationSourceIds: definition.geometryVerificationSourceIds,
        publicationPolicy: "internal_review",
        note: "约 1.0727 平方公里的道路围合核心候选；市级文件确认四至，但它不代表完整楼市板块，江苏路、华阳路、周家桥剩余区域继续明确留白。",
      },
    });
    continue;
  }
  if (batchPolicy.catalogMode === "changning-gubei-hongqiao") {
    const isGubei = definition.id === "sector_gubei";
    const boundaryEvidenceIds = isGubei
      ? definition.boundaryAnchors.map(
        ({ side }) => `${definition.id.replace(/^sector_/, "")}-${side}`,
      )
      : [
        "changning-hongqiao-north",
        "changning-hongqiao-east",
        "changning-hongqiao-south",
        "changning-hongqiao-west",
      ];
    registryRecords.push({
      id: definition.id,
      canonicalName: definition.canonicalName,
      aliases: isGubei ? ["古北新区"] : ["虹桥（长宁住宅）"],
      riskFlags: definition.riskFlags ?? [],
      districtNames: [definition.districtName],
      kind: "market_sector",
      reviewStatus: isGubei ? "draft-medium" : "draft-low",
      definitionStatus: isGubei
        ? "official_scope_market_candidate"
        : "market_scope_candidate",
      definitionCandidate: definition.geometryRule,
      definitionSourceIds: definition.definitionSourceIds,
      boundaryEvidenceIds,
      geometry: {
        status: "draft",
        confidence: isGubei ? "medium" : "low",
        coordinateSystem: "WGS84",
        coordinateSystemVerified: true,
        version: definition.scopeVersion,
        sourceIds: ["osm-geofabrik-shanghai-260721"],
        verificationSourceIds: definition.geometryVerificationSourceIds,
        publicationPolicy: "internal_review",
        note: isGubei
          ? "按官方古北新区四至和固定 OSM 道路线重建约 1.3388 平方公里，较官方 1.366 平方公里小约 1.99%；道路中心线候选仍需在编辑器中按完整小区归属精修。"
          : "约 2.7072 平方公里候选严格取虹桥街道开放行政骨架扣除古北；该差集是低置信项目推导，不是官方虹桥住宅边界，且与虹桥商务区使用不同 ID。",
      },
    });
    continue;
  }
  const boundaryEvidenceIds = sides.map(
    ([side]) => `${definition.id.replace(/^sector_/, "")}-${side}`,
  );
  const isJinshanNewCity = definition.id === "sector_jinshanxincheng";
  const isTinglinCombinedProxy = definition.id === "sector_tinglin";
  const isTaopuOverwideProxy = definition.id === "sector_taopu";
  registryRecords.push({
    id: definition.id,
    canonicalName: definition.canonicalName,
    aliases: aliasesBySectorId.get(definition.id) ?? [],
    riskFlags: definition.riskFlags ?? [],
    districtNames: [definition.districtName],
    kind: isJinshanNewCity ? "ambiguous_market_sector" : "market_sector",
    reviewStatus: "draft-low",
    definitionStatus: "market_identity_admin_backbone_candidate",
    definitionCandidate: definition.geometryRule,
    definitionSourceIds: definition.definitionSourceIds,
    ...(definition.adminProxyName
      ? { adminProxyName: definition.adminProxyName }
      : {}),
    ...(definition.adminBoundaryVersion
      ? { adminBoundaryVersion: definition.adminBoundaryVersion }
      : {}),
    ...("marketAdminAlignmentUnverified" in definition
      ? {
        marketAdminAlignmentUnverified:
          definition.marketAdminAlignmentUnverified,
      }
      : {}),
    ...("fullAdminRelationRejected" in definition
      ? { fullAdminRelationRejected: definition.fullAdminRelationRejected }
      : {}),
    ...("adminAreaVersionMismatch" in definition
      ? { adminAreaVersionMismatch: definition.adminAreaVersionMismatch }
      : {}),
    ...("officialCurrentAreaKm2" in definition
      ? { officialCurrentAreaKm2: definition.officialCurrentAreaKm2 }
      : {}),
    ...("legacyOfficialAreaKm2" in definition
      ? { legacyOfficialAreaKm2: definition.legacyOfficialAreaKm2 }
      : {}),
    ...(definition.excludedArea
      ? { excludedArea: definition.excludedArea }
      : {}),
    ...(definition.sharedEdgeReview
      ? { sharedEdgeReview: definition.sharedEdgeReview }
      : {}),
    ...(definition.requiredAdjacencyReviewIds
      ? {
        requiredAdjacencyReviewIds:
          definition.requiredAdjacencyReviewIds,
      }
      : {}),
    ...(batchPolicy.catalogMode === "linked-admin-batch"
      ? { linkedTopologySectorIds: definition.sharedEdgeSectorIds }
      : {}),
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
      note: definition.registryGeometryNote ?? (isJinshanNewCity
        ? "当前只显示石化街道行政骨架，不代表完整金山新城市场边界；必须在编辑器中按石化、山阳、金山卫项目归属继续修订。"
        : isTinglinCombinedProxy
          ? "当前 OSM 亭林镇 relation 与天地图行政示意均覆盖官方规划所称亭林镇与金山工业区合并范围；它只是约 122.725 平方公里的可编辑代理，不代表已排除工业区的市场亭林。"
          : isTaopuOverwideProxy
            ? "当前完整桃浦镇行政骨架约 19.1581 平方公里，明显混入产业、铁路和非住宅功能；只作低置信起画代理，必须按住宅连续区和完整项目归属显著收窄。"
            : "固定 OSM 街镇 relation 只作低置信、可编辑市场候选骨架；行政边界不等于行业统一楼市板块边界。"),
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
  if (batchPolicy.catalogMode === "market-workpack-batch") {
    evidenceRecords.push({
      id: `${definition.id.replace(/^sector_/, "")}-market-scope`,
      sectorId: definition.id,
      side: "component",
      basisType: "user_decided_market_scope_locked_osm_workpack",
      featureName: `${definition.canonicalName}联合重构候选范围`,
      status: "candidate_scope_confirmed",
      confidence: "medium",
      sourceId: definition.definitionSourceIds.find(
        (sourceId) => sourceId.startsWith("internal-user-"),
      ) ?? definition.definitionSourceIds[0],
      supportingSourceIds: [
        ...new Set([
          ...definition.definitionSourceIds,
          ...definition.geometryVerificationSourceIds,
        ]),
      ],
      note: definition.geometryRule,
    });
    continue;
  }
  if (batchPolicy.catalogMode === "putuo-liangwancheng-ganquan-pair") {
    const isLiangwancheng = definition.id === "sector_zhongyuanliangwancheng";
    if (isLiangwancheng) {
      for (const namedLanduse of definition.namedLanduseObjects) {
        evidenceRecords.push({
          id: `zhongyuanliangwancheng-landuse-${namedLanduse.osmId}`,
          sectorId: definition.id,
          side: "component",
          basisType: "named_osm_landuse_market_proxy",
          featureName: `${namedLanduse.expectedName} OSM ${namedLanduse.osmId} 项目用地外轮廓`,
          status: "adjacent_review_required",
          confidence: "low",
          sourceId: "osm-geofabrik-shanghai-260721",
          supportingSourceIds: [
            "official-putuo-zhongyuan-liangwancheng-committees-2008",
            "official-putuo-yichuan-committee-scopes-2026",
          ],
          osmRefs: [namedLanduse.osmId],
          note: "该证据只对应一个固定 OSM 同名住宅用地分片；官方门牌确认项目身份，但没有发布 GIS 外轮廓，禁止凸包或跨道路补缝。",
        });
      }
    } else {
      for (const adminRelation of definition.osmAdminRelations) {
        evidenceRecords.push({
          id: `ganquanyichuan-admin-${adminRelation.osmAdminRelationId}`,
          sectorId: definition.id,
          side: "component",
          basisType: "market_candidate_from_admin_backbone",
          featureName: `${adminRelation.expectedOsmName} OSM relation ${adminRelation.osmAdminRelationId} 最大行政包络`,
          status: "adjacent_review_required",
          confidence: "low",
          sourceId: "osm-geofabrik-shanghai-260721",
          supportingSourceIds: [
            "official-putuo-ganquan-subdistrict-scope-2019",
            "official-putuo-ganquan-subdistrict-profile-2025",
            "official-putuo-yichuan-subdistrict-profile-2026",
          ],
          osmRefs: [adminRelation.osmAdminRelationId],
          note: "该行政关系只构成甘泉宜川候选的最大包络；它不是楼市边界，光新接口和非住宅范围仍未解决。",
        });
      }
      const liangwanchengDefinition = batch.sectors.find(
        ({ id }) => id === "sector_zhongyuanliangwancheng",
      );
      for (const namedLanduse of liangwanchengDefinition.namedLanduseObjects) {
        evidenceRecords.push({
          id: `ganquanyichuan-shared-hole-${namedLanduse.osmId}`,
          sectorId: definition.id,
          side: "shared_hole",
          basisType: "existing_market_candidate_shared_edge",
          featureName: `扣除中远两湾城 OSM ${namedLanduse.osmId} 后形成的共享洞边`,
          status: "adjacent_review_required",
          confidence: "low",
          sourceId: "osm-geofabrik-shanghai-260721",
          supportingSourceIds: [
            "official-putuo-zhongyuan-liangwancheng-committees-2008",
            "official-putuo-yichuan-committee-scopes-2026",
          ],
          relatedSectorId: "sector_zhongyuanliangwancheng",
          osmRefs: [namedLanduse.osmId],
          note: "该证据逐一锁定甘泉宜川差集中的一个中远两湾城扣除洞；编辑任一板块后必须联合复核，不得静默保留旧差集。",
        });
      }
    }
    continue;
  }
  if (batchPolicy.catalogMode === "changning-zhongshan-park-core") {
    for (const anchor of definition.boundaryAnchors) {
      evidenceRecords.push({
        id: `zhongshangongyuan-${anchor.side}`,
        sectorId: definition.id,
        side: anchor.side,
        basisType: "official_scope_text",
        featureName: anchor.expectedIdentity,
        status: "candidate_scope_confirmed",
        confidence: "medium",
        sourceId: "official-shanghai-zhongshan-park-landscape-scope-2022",
        supportingSourceIds: ["osm-geofabrik-shanghai-260721"],
        note: "2022 年市级文件确认中山公园地区道路围合身份；固定 OSM 道路线用于生成可复算核心候选，不把该核心扩称完整楼市边界。",
      });
    }
    continue;
  }
  if (batchPolicy.catalogMode === "changning-gubei-hongqiao") {
    if (definition.id === "sector_gubei") {
      for (const anchor of definition.boundaryAnchors) {
        evidenceRecords.push({
          id: `gubei-${anchor.side}`,
          sectorId: definition.id,
          side: anchor.side,
          basisType: "official_scope_text",
          featureName: anchor.expectedIdentity,
          status: "candidate_scope_confirmed",
          confidence: "medium",
          sourceId: "official-changning-gubei-new-district-scope-2024",
          supportingSourceIds: ["osm-geofabrik-shanghai-260721"],
          note: "官方文字四至用于确认边界身份；固定 OSM 道路线用于生成内部可复算候选坐标，不宣称复刻法定规划坐标。",
        });
      }
    } else {
      for (const [side, sideLabel] of sides) {
        evidenceRecords.push({
          id: `changning-hongqiao-${side}`,
          sectorId: definition.id,
          side,
          basisType: "market_candidate_from_admin_backbone",
          featureName: `虹桥住宅候选外框${sideLabel}段`,
          status: "adjacent_review_required",
          confidence: "low",
          sourceId: "osm-geofabrik-shanghai-260721",
          supportingSourceIds: [
            "official-changning-admin-divisions-2025",
            "official-changning-hongqiao-subdistrict-gubei-scope-2025",
          ],
          note: "固定虹桥街道 relation 扣除古北后只形成低置信市场候选；外框仍需按天山、仙霞及沿线完整小区归属精修。",
        });
      }
    }
    continue;
  }
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
    const isTaopuOverwideProxy = definition.id === "sector_taopu";
    const isZhongyuanRoadCut = (
      definition.id === "sector_zhongyuan"
      && side === "east"
    );
    evidenceRecords.push({
      id: `${definition.id.replace(/^sector_/, "")}-${side}`,
      sectorId: definition.id,
      side,
      basisType: isZhongyuanRoadCut
        ? "official_function_divide_osm_road_cut"
        : "osm_admin_relation_market_backbone",
      featureName: isZhongyuanRoadCut
        ? "中原（殷行街道军工路以西住宅区）东侧军工路裁切线"
        : isJinshanNewCity
        ? `金山新城（石化街道行政骨架）${sideLabel}段候选线`
        : isTinglinCombinedProxy
          ? `亭林（亭林镇与金山工业区合并行政展示代理）${sideLabel}段候选线`
        : `${definition.canonicalName}（${sourceLabel}行政骨架）${sideLabel}段候选线`,
      status: "adjacent_review_required",
      confidence: "low",
      sourceId: isZhongyuanRoadCut
        ? "official-yangpu-yinhang-subdistrict-profile-2025"
        : "osm-geofabrik-shanghai-260721",
      supportingSourceIds: isZhongyuanRoadCut
        ? ["osm-geofabrik-shanghai-260721", "seller-lianjia-shanghai-sector-sitemap"]
        : supportingSourceIds,
      ...(isZhongyuanRoadCut
        ? { osmRefs: definition.cutRoadOsmIds }
        : {}),
      note: isZhongyuanRoadCut
        ? "官方资料明确军工路以西为住宅区、以东为企事业单位集聚区；固定快照中的 28 个军工路道路对象用于生成可复算裁切线，不宣称该线是行业统一市场界线。"
        : definition.boundaryEvidenceNote ?? (isJinshanNewCity
        ? "石化街道只作金山新城的临时代理骨架；金山新城可能跨石化、山阳、金山卫，本边不得视为市场定稿。"
        : isTinglinCombinedProxy
          ? "固定 OSM 亭林镇 relation 与天地图行政示意均呈现亭林镇和金山工业区合并范围；官方规划拆分为亭林镇 78.21 平方公里、金山工业区 43.22 平方公里。本边只属合并行政展示代理，不得视为已排除工业区的市场亭林。"
          : isTaopuOverwideProxy
            ? "完整桃浦镇固定行政 relation 只提供约 19.1581 平方公里的过宽起画骨架；产业、铁路和非住宅范围待按项目归属收窄，本边不得视为最终市场四至。"
            : "固定行政 relation 只提供可编辑市场候选骨架；官方材料只用于名称、邻接和面积量级人工复核，不提供本项目可再分发坐标。"),
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

execFileSync(
  process.execPath,
  [resolveRepoFile("scripts/build-sector-client-index.mjs")],
  { cwd: repoRoot, stdio: "inherit" },
);

console.log(`同步 ${registryRecords.length} 个 registry 记录和 ${evidenceRecords.length} 条逐边证据`);
