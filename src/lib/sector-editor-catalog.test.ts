import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildSectorEditorTemplates,
  selectPreferredEditorGeometry,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./sector-editor-catalog.ts";
import {
  buildCandidateOnlySectorFeatures,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./sector-catalog-features.ts";

const registry = [
  {
    id: "sector-with-geometry",
    canonicalName: "已有边界",
    districtNames: ["浦东新区"],
    definitionCandidate: "已有候选边界。",
  },
  {
    id: "sector-without-geometry",
    canonicalName: "待画板块",
    districtNames: ["浦东新区"],
    definitionCandidate: "板块已经定义，但尚未绘制边界。",
  },
];

test("the editor lists registry identities even when geometry is missing", () => {
  const templates = buildSectorEditorTemplates(
    registry,
    (id) => id === "sector-with-geometry"
      ? {
        kind: "reviewed-market-candidate",
        coordinateSystem: "WGS84",
        geometry: {
          type: "Polygon",
          coordinates: [[[121.4, 31.1], [121.5, 31.1], [121.5, 31.2], [121.4, 31.1]]],
        },
      }
      : undefined,
    (position) => position,
  );

  assert.equal(templates.length, registry.length);
  assert.deepEqual(
    templates.map(({ id, geometryStatus, ring }) => ({ id, geometryStatus, pointCount: ring.length })),
    [
      { id: "sector-with-geometry", geometryStatus: "candidate", pointCount: 3 },
      { id: "sector-without-geometry", geometryStatus: "missing", pointCount: 0 },
    ],
  );
});

test("the editor prefers the same high-precision reference shown on the main map over a legacy demo", () => {
  const legacyDemo = {
    kind: "market-demo" as const,
    coordinateSystem: "GCJ-02-assumed" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[121.3, 31.1], [121.4, 31.1], [121.4, 31.2], [121.3, 31.1]]],
    },
  };
  const administrativeReference = {
    kind: "administrative-reference" as const,
    coordinateSystem: "WGS84" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[121.35, 31.15], [121.45, 31.15], [121.45, 31.25], [121.35, 31.15]]],
    },
  };

  assert.equal(
    selectPreferredEditorGeometry({
      reviewedCandidate: undefined,
      administrativeReference,
      legacyDemo,
    }),
    administrativeReference,
  );
});

test("the editor catalog preserves holes on every multi-polygon part", () => {
  const [template] = buildSectorEditorTemplates(
    [registry[0]],
    () => ({
      kind: "reviewed-market-candidate",
      coordinateSystem: "WGS84",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [[121.1, 31.1], [121.3, 31.1], [121.3, 31.3], [121.1, 31.1]],
          ],
          [
            [[121.4, 31.4], [121.7, 31.4], [121.7, 31.7], [121.4, 31.4]],
            [[121.5, 31.5], [121.6, 31.5], [121.6, 31.6], [121.5, 31.5]],
          ],
        ],
      },
    }),
    (position) => position,
  );

  assert.equal(template.additionalRings?.length, 1);
  assert.equal(template.additionalHoles?.[0]?.length, 1);
  assert.deepEqual(template.additionalHoles?.[0]?.[0]?.[0], [121.5, 31.5]);
  assert.equal(template.previousGeometryFingerprints?.length, 1);
});

test("a reviewed candidate without a legacy demo becomes a main-map sector entry", () => {
  const record = {
    id: "sector-new",
    canonicalName: "新候选",
    aliases: [],
    districtNames: ["黄浦区"],
    kind: "market_sector" as const,
    reviewStatus: "draft-medium" as const,
    definitionStatus: "market_scope_candidate" as const,
    definitionCandidate: "候选定义。",
    definitionSourceIds: [],
    boundaryEvidenceIds: [],
    geometry: {
      status: "draft" as const,
      confidence: "medium" as const,
      coordinateSystem: "WGS84" as const,
      coordinateSystemVerified: true,
      version: "test",
      sourceIds: [],
      publicationPolicy: "internal_review" as const,
      note: "test",
    },
  };
  const geometry = {
    type: "Polygon" as const,
    coordinates: [[[121.4, 31.2], [121.5, 31.2], [121.5, 31.3], [121.4, 31.2]]],
  };

  const features = buildCandidateOnlySectorFeatures(
    [],
    [record],
    [{
      properties: { id: "sector-new", labelPoint: [121.45, 31.25] },
      geometry,
    }],
  );

  assert.equal(features.length, 1);
  assert.equal(features[0].properties.id, "sector-new");
  assert.equal(features[0].properties.name, "新候选");
  assert.equal(features[0].properties.isMock, false);
  assert.deepEqual(features[0].geometry, geometry);
});

test("the Qingpu Songjiang Jinshan batch exposes all 30 candidates to the editor", () => {
  const batch = JSON.parse(readFileSync(
    new URL("../../data/geo/reviewed-candidate-batches/qingpu-songjiang-jinshan-thirty-2026-07.json", import.meta.url),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const records = registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));

  assert.equal(batchIds.length, 30);
  assert.equal(batchIdSet.size, 30);
  assert.equal(records.length, 30);
  assert.ok(batchIds.every((id: string) => candidateById.has(id)));

  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry:
          | { type: "Polygon"; coordinates: number[][][] }
          | { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );

  assert.equal(templates.length, 30);
  assert.ok(templates.every((template) => (
    template.geometryStatus === "candidate" && template.ring.length >= 3
  )));
  for (const template of templates) {
    const candidate = candidateById.get(template.id) as {
      geometry:
        | { type: "Polygon"; coordinates: number[][][] }
        | { type: "MultiPolygon"; coordinates: number[][][][] };
    };
    const expectedPartCount = candidate.geometry.type === "MultiPolygon"
      ? candidate.geometry.coordinates.length
      : 1;
    assert.equal(
      1 + (template.additionalRings?.length ?? 0),
      expectedPartCount,
      `${template.id} 编辑器必须保留全部候选分片`,
    );
  }
  assert.equal(
    1 + (templates.find((template) => template.id === "sector_shanyang")?.additionalRings?.length ?? 0),
    4,
  );
  assert.match(
    templates.find((template) => template.id === "sector_jinshanxincheng")?.boundaryBasis ?? "",
    /石化街道.*代理/,
  );
});

test("the Xuhui admin-aligned batch exposes all 12 candidates without inventing Hongmei Road or South Station", () => {
  const batch = JSON.parse(readFileSync(
    new URL("../../data/geo/reviewed-candidate-batches/xuhui-twelve-admin-aligned-2026-07.json", import.meta.url),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const records = registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));

  assert.equal(batchIds.length, 12);
  assert.equal(batchIdSet.size, 12);
  assert.equal(records.length, 12);
  assert.ok(batchIds.every((id: string) => candidateById.has(id)));
  assert.equal(registryData.sectors.find(
    (record: { canonicalName: string }) => record.canonicalName === "上海南站",
  )?.geometry.status, "missing");
  assert.ok(!registryData.sectors.some(
    (record: { canonicalName: string }) => record.canonicalName === "虹梅路",
  ));

  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry:
          | { type: "Polygon"; coordinates: number[][][] }
          | { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );

  assert.equal(templates.length, 12);
  assert.ok(templates.every((template) => (
    template.geometryStatus === "candidate" && template.ring.length >= 3
  )));
});

test("the Changning direct batch exposes four candidates without inventing custom market scopes", () => {
  const batch = JSON.parse(readFileSync(
    new URL("../../data/geo/reviewed-candidate-batches/changning-four-direct-admin-aligned-2026-07.json", import.meta.url),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const candidateIds = new Set(candidateData.features.map(
    (feature: { properties: { id: string } }) => feature.properties.id,
  ));

  assert.deepEqual(
    [...batchIds].sort(),
    ["sector_beixinjing", "sector_tianshan", "sector_xianxia", "sector_xinhualu"],
  );
  assert.ok(batchIds.every((id: string) => candidateIds.has(id)));
  assert.equal(registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  ).length, 4);
  assert.equal(registryData.sectors.find(
    (record: { canonicalName: string }) => record.canonicalName === "西郊",
  )?.geometry.status, "missing");
  assert.equal(
    registryData.sectors.find(
      (record: { id: string }) => record.id === "sector_hongqiao",
    )?.canonicalName,
    "虹桥商务区",
  );
  assert.equal(
    candidateData.features.find(
      (feature: { properties: { id: string } }) => feature.properties.id === "sector_hongqiao",
    )?.properties?.name,
    "虹桥商务区",
  );
});

test("the Jing'an Putuo direct batch exposes 11 editable low-confidence backbones and keeps unresolved markets out", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/jingan-putuo-eleven-direct-admin-aligned-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const records = registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));

  assert.equal(batchIds.length, 11);
  assert.equal(batchIdSet.size, 11);
  assert.equal(records.length, 11);
  assert.ok(records.every((record: {
    reviewStatus: string;
    geometry: { confidence: string; publicationPolicy: string };
  }) => (
    record.reviewStatus === "draft-low"
      && record.geometry.confidence === "low"
      && record.geometry.publicationPolicy === "internal_review"
  )));
  assert.ok(batchIds.every((id: string) => candidateById.has(id)));

  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry:
          | { type: "Polygon"; coordinates: number[][][] }
          | { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );
  assert.equal(templates.length, 11);
  assert.ok(templates.every((template) => (
    template.geometryStatus === "candidate" && template.ring.length >= 3
  )));

  const taopu = records.find((record: { id: string }) => record.id === "sector_taopu");
  const taopuDefinition = batch.sectors.find(
    (definition: { id: string }) => definition.id === "sector_taopu",
  );
  assert.match(taopu?.geometry?.note ?? "", /19\.1581.*明显.*收窄/);
  assert.deepEqual(taopu?.aliases, ["桃浦镇"]);
  assert.deepEqual(
    taopuDefinition?.riskFlags,
    ["overwide_admin_proxy", "mixed_industrial_rail_non_residential"],
  );
  assert.deepEqual(
    taopuDefinition?.requiredAdjacencyReviewIds,
    ["sector_zhenru", "sector_changzheng", "sector_wanli", "unresolved_baoshan_interface"],
  );
  for (const forbiddenName of [
    "石门二路", "宝山路", "芷江西路", "共和新路", "彭浦新村", "阳城—永和",
  ]) {
    assert.ok(!registryData.sectors.some(
      (record: { canonicalName: string }) => record.canonicalName === forbiddenName,
    ));
  }
});

test("the Putuo pair preserves five Liangwancheng parts and five Ganquan Yichuan holes", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/putuo-zhongyuan-liangwancheng-ganquan-yichuan-pair-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const evidenceData = JSON.parse(readFileSync(
    new URL("../data/sectors/boundary-evidence.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const records = registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));

  assert.deepEqual(batchIds, [
    "sector_zhongyuanliangwancheng",
    "sector_ganquanyichuan",
  ]);
  assert.equal(records.length, 2);
  assert.ok(records.every((record: {
    reviewStatus: string;
    geometry: { confidence: string; publicationPolicy: string };
  }) => (
    record.reviewStatus === "draft-low"
      && record.geometry.confidence === "low"
      && record.geometry.publicationPolicy === "internal_review"
  )));

  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry:
          | { type: "Polygon"; coordinates: number[][][] }
          | { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );
  const liangwancheng = templates.find(
    (template) => template.id === "sector_zhongyuanliangwancheng",
  );
  const ganquanYichuan = templates.find(
    (template) => template.id === "sector_ganquanyichuan",
  );

  assert.equal(liangwancheng?.geometryStatus, "candidate");
  assert.equal(liangwancheng?.additionalRings?.length, 4);
  assert.deepEqual(
    liangwancheng?.linkedTopologySectorIds,
    ["sector_ganquanyichuan"],
  );
  assert.equal(ganquanYichuan?.geometryStatus, "candidate");
  assert.equal(ganquanYichuan?.holes?.length, 5);
  assert.deepEqual(
    ganquanYichuan?.linkedTopologySectorIds,
    ["sector_zhongyuanliangwancheng"],
  );
  assert.match(
    ganquanYichuan?.note ?? "",
    /行政并集差集.*光新接口/,
  );
  assert.ok(batch.sectors.find(
    (definition: { id: string }) => definition.id === "sector_ganquanyichuan",
  )?.riskFlags.includes("guangxin_interface_unresolved"));
  const pairEvidence = evidenceData.edges.filter(
    (edge: { sectorId: string }) => batchIdSet.has(edge.sectorId),
  );
  assert.equal(pairEvidence.filter(
    (edge: { sectorId: string; side: string }) => (
      edge.sectorId === "sector_zhongyuanliangwancheng"
        && edge.side === "component"
    ),
  ).length, 5);
  assert.equal(pairEvidence.filter(
    (edge: { sectorId: string; side: string }) => (
      edge.sectorId === "sector_ganquanyichuan"
        && edge.side === "component"
    ),
  ).length, 2);
  assert.equal(pairEvidence.filter(
    (edge: { sectorId: string; side: string }) => (
      edge.sectorId === "sector_ganquanyichuan"
        && edge.side === "shared_hole"
    ),
  ).length, 5);
});

test("the Baoshan direct batch exposes eight editable low-confidence backbones without inventing five complex markets", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/baoshan-eight-direct-admin-aligned-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const records = registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));
  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry: { type: "Polygon"; coordinates: number[][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );

  assert.equal(records.length, 8);
  assert.equal(templates.length, 8);
  assert.ok(templates.every((template) => (
    template.geometryStatus === "candidate" && template.ring.length >= 3
  )));
  assert.ok(records.every((record: {
    reviewStatus: string;
    marketAdminAlignmentUnverified: boolean;
    geometry: { confidence: string; publicationPolicy: string };
    riskFlags: string[];
  }) => (
    record.reviewStatus === "draft-low"
      && record.marketAdminAlignmentUnverified === true
      && record.geometry.confidence === "low"
      && record.geometry.publicationPolicy === "internal_review"
      && record.riskFlags.includes("market_boundary_not_official")
  )));
  assert.equal(records.filter((record: { riskFlags: string[] }) => (
    record.riskFlags.includes("overwide_admin_proxy")
  )).length, 6);
  assert.deepEqual(
    records.find((record: { id: string }) => record.id === "sector_gucun")
      ?.linkedTopologySectorIds,
    ["sector_zhangmiao", "sector_yanghang", "sector_luodian"],
  );
  for (const unresolvedName of ["大华", "上大", "南大", "共康", "淞宝"]) {
    assert.equal(registryData.sectors.find(
      (record: { canonicalName: string }) => record.canonicalName === unresolvedName,
    )?.geometry?.status, "missing");
  }
});

test("the Jiading current-admin batch exposes eight editable proxies while preserving three complex market identities", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/jiading-eight-direct-admin-proxies-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const records = registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));
  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );

  assert.equal(records.length, 8);
  assert.equal(templates.length, 8);
  assert.ok(templates.every((template) => (
    template.geometryStatus === "candidate" && template.ring.length >= 3
  )));
  assert.ok(records.every((record: {
    reviewStatus: string;
    marketAdminAlignmentUnverified: boolean;
    geometry: { confidence: string; publicationPolicy: string };
    riskFlags: string[];
  }) => (
    record.reviewStatus === "draft-low"
      && record.marketAdminAlignmentUnverified === true
      && record.geometry.confidence === "low"
      && record.geometry.publicationPolicy === "internal_review"
      && record.riskFlags.includes("market_boundary_not_official")
  )));
  assert.ok(batchIds.every((id: string) => (
    (candidateById.get(id) as { geometry: { type: string } }).geometry.type
      === "MultiPolygon"
  )));
  const changedAdminIds = new Set([
    "sector_malu",
    "sector_xuhang",
    "sector_juyuanxinqu",
  ]);
  assert.equal(records.filter((record: {
    id: string;
    adminAreaVersionMismatch?: boolean;
    officialCurrentAreaKm2?: number | null;
    legacyOfficialAreaKm2?: number;
  }) => (
    changedAdminIds.has(record.id)
      && record.adminAreaVersionMismatch === true
      && record.officialCurrentAreaKm2 === null
      && typeof record.legacyOfficialAreaKm2 === "number"
  )).length, 3);
  assert.ok(records.filter((record: { id: string }) => (
    !changedAdminIds.has(record.id)
  )).every((record: {
    adminAreaVersionMismatch?: boolean;
    officialCurrentAreaKm2?: number | null;
  }) => (
    record.adminAreaVersionMismatch === undefined
      && record.officialCurrentAreaKm2 === undefined
  )));
  const juyuan = records.find(
    (record: { id: string }) => record.id === "sector_juyuanxinqu",
  );
  assert.equal(juyuan?.adminProxyName, "菊园街道");
  assert.ok(juyuan?.aliases.includes("菊园街道"));
  assert.ok(juyuan?.riskFlags.includes("admin_name_version_mismatch"));
  assert.deepEqual(
    records.find((record: { id: string }) => record.id === "sector_malu")
      ?.linkedTopologySectorIds,
    ["sector_nanxiang", "sector_xuhang", "sector_anting", "sector_juyuanxinqu"],
  );
  for (const unresolvedName of ["丰庄", "嘉定新城", "嘉定老城"]) {
    assert.equal(registryData.sectors.find(
      (record: { canonicalName: string }) => record.canonicalName === unresolvedName,
    )?.geometry?.status, "missing");
  }
});

test("the Fengxian batch exposes eight current proxies and keeps stale Fengcheng drawable but geometry-missing", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/fengxian-eight-current-admin-proxies-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const fengxianIds = new Set([...batchIds, "sector_fengcheng"]);
  const records = registryData.sectors.filter(
    (record: { id: string }) => fengxianIds.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));
  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );

  assert.equal(batchIdSet.size, 8);
  assert.equal(records.length, 9);
  assert.equal(templates.length, 9);
  assert.ok(batchIds.every((id: string) => (
    (candidateById.get(id) as { geometry: { type: string } }).geometry.type
      === "MultiPolygon"
  )));
  assert.ok(templates.filter((template) => (
    template.id !== "sector_fengcheng"
  )).every((template) => (
    template.geometryStatus === "candidate" && template.ring.length >= 3
  )));
  const fengchengTemplate = templates.find(
    (template) => template.id === "sector_fengcheng",
  );
  assert.equal(fengchengTemplate?.geometryStatus, "missing");
  assert.equal(fengchengTemplate?.ring.length, 0);

  const fengchengRecord = records.find(
    (record: { id: string }) => record.id === "sector_fengcheng",
  );
  assert.equal(fengchengRecord?.geometry.status, "missing");
  assert.equal(fengchengRecord?.legacyOsmAdminRelationId, "17885593");
  assert.ok(fengchengRecord?.riskFlags.includes("missing_touqiao_subtraction"));
  assert.ok(!candidateById.has("sector_fengcheng"));

  const haiwan = records.find(
    (record: { id: string }) => record.id === "sector_haiwan",
  );
  assert.equal(haiwan?.adminProxyName, "海湾镇");
  assert.ok(haiwan?.riskFlags.includes("unresolved_haiwan_tourism_area"));
  assert.ok(haiwan?.riskFlags.includes("nested_management_zone"));

  const jinhui = records.find(
    (record: { id: string }) => record.id === "sector_fengxianjinhui",
  );
  assert.equal(jinhui?.canonicalName, "奉贤金汇");
  assert.equal(jinhui?.adminProxyName, "金汇镇");
});

test("the Minhang batch exposes four editable town proxies and keeps independent identities drawable", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/minhang-four-current-town-proxies-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url), "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url), "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const blockedIds = [
    "sector_huacao", "sector_wujing", "sector_pujiangzhen", "sector_jinganxincheng",
    "sector_minhangjinhui", "sector_longbai", "sector_hanghua", "sector_jinhongqiao", "sector_laominhang",
  ];
  const records = registryData.sectors.filter(
    (record: { id: string }) => [...batchIds, ...blockedIds].includes(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));
  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );

  assert.deepEqual(batchIds, [
    "sector_qibao",
    "sector_meilong",
    "sector_zhuanqiao",
    "sector_maqiao",
  ]);
  assert.equal(records.length, 13);
  assert.ok(batchIds.every((id: string) => (
    (candidateById.get(id) as { geometry: { type: string } }).geometry.type
      === "MultiPolygon"
  )));
  assert.ok(templates.filter((template) => !blockedIds.includes(template.id)).every(
    (template) => template.geometryStatus === "candidate" && template.ring.length >= 3,
  ));
  for (const [id, relation] of [["sector_huacao", "14187985"], ["sector_wujing", "14187982"], ["sector_pujiangzhen", "14187979"]]) {
    const record = records.find((item: { id: string }) => item.id === id);
    const template = templates.find((item) => item.id === id);
    assert.equal(record?.geometry.status, "missing");
    assert.equal(record?.definitionStatus, "market_identity_verified_geometry_blocked");
    assert.equal(record?.legacyOsmAdminRelationId, relation);
    assert.equal(template?.geometryStatus, "missing");
    assert.equal(template?.ring.length, 0);
    assert.ok(!candidateById.has(id));
  }
  for (const id of blockedIds.slice(3)) {
    const record = records.find((item: { id: string }) => item.id === id);
    const template = templates.find((item) => item.id === id);
    assert.equal(record?.geometry.status, "missing");
    assert.equal(record?.definitionStatus, "market_identity_verified_geometry_blocked");
    assert.ok(record?.riskFlags.includes("independent_market_scope_required"));
    assert.equal(template?.geometryStatus, "missing");
    assert.equal(template?.ring.length, 0);
    assert.ok(!candidateById.has(id));
  }
});

test("the Hongkou Yangpu direct batch exposes seven editable low-confidence backbones without inventing adjacent markets", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/hongkou-yangpu-seven-direct-admin-aligned-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const records = registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));

  assert.deepEqual(batchIds, [
    "sector_sichuanbeilu",
    "sector_quyang",
    "sector_liangcheng",
    "sector_jiangwanzhen",
    "sector_kongjianglu",
    "sector_wujiaochang",
    "sector_xinjiangwancheng",
  ]);
  assert.equal(batchIdSet.size, 7);
  assert.equal(records.length, 7);
  assert.ok(records.every((record: {
    reviewStatus: string;
    geometry: { confidence: string; publicationPolicy: string };
  }) => (
    record.reviewStatus === "draft-low"
      && record.geometry.confidence === "low"
      && record.geometry.publicationPolicy === "internal_review"
  )));
  assert.ok(batchIds.every((id: string) => candidateById.has(id)));

  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry:
          | { type: "Polygon"; coordinates: number[][][] }
          | { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );
  assert.equal(templates.length, 7);
  assert.ok(templates.every((template) => (
    template.geometryStatus === "candidate" && template.ring.length >= 3
  )));

  assert.deepEqual(
    records.find((record: { id: string }) => record.id === "sector_quyang")?.aliases,
    ["曲阳路", "曲阳路街道"],
  );
  assert.deepEqual(
    records.find((record: { id: string }) => record.id === "sector_liangcheng")?.aliases,
    ["凉城新村", "凉城新村街道"],
  );
  assert.deepEqual(
    records.find(
      (record: { id: string; riskFlags?: string[] }) => record.id === "sector_sichuanbeilu",
    )?.riskFlags,
    ["post_2018_north_bund_reorganization_review"],
  );
  assert.deepEqual(
    records.find(
      (record: { id: string; riskFlags?: string[] }) => record.id === "sector_wujiaochang",
    )?.riskFlags,
    ["area_mismatch_review_required", "mixed_non_residential_scope"],
  );
  assert.deepEqual(
    (candidateById.get("sector_xinjiangwancheng") as {
      properties?: { riskFlags?: string[] };
    })?.properties?.riskFlags,
    ["mixed_water_green_campus_scope"],
  );
  assert.match(
    templates.find((template) => template.id === "sector_sichuanbeilu")?.note ?? "",
    /重点复核.*2018 年北外滩区划调整/,
  );
  assert.match(
    templates.find((template) => template.id === "sector_wujiaochang")?.note ?? "",
    /重点复核.*官方面积.*高校、园区、商业/,
  );
});

test("the Hongkou Yangpu evidence-backed batch exposes only Anshan and clipped Zhongyuan", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/hongkou-yangpu-two-evidence-backed-admin-proxies-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);
  const batchIdSet = new Set(batchIds);
  const records = registryData.sectors.filter(
    (record: { id: string }) => batchIdSet.has(record.id),
  );
  const candidateById = new Map(candidateData.features.map(
    (feature: { properties: { id: string } }) => [feature.properties.id, feature],
  ));

  assert.deepEqual(batchIds, [
    "sector_anshan",
    "sector_zhongyuan",
  ]);
  assert.equal(records.length, 2);
  assert.ok(records.every((record: {
    reviewStatus: string;
    riskFlags?: string[];
    geometry: { confidence: string; publicationPolicy: string };
  }) => (
    record.reviewStatus === "draft-low"
      && record.geometry.confidence === "low"
      && record.geometry.publicationPolicy === "internal_review"
      && (record.riskFlags?.length ?? 0) > 0
  )));
  assert.ok(batchIds.every((id: string) => candidateById.has(id)));

  const templates = buildSectorEditorTemplates(
    records,
    (id) => {
      const candidate = candidateById.get(id) as {
        geometry:
          | { type: "Polygon"; coordinates: number[][][] }
          | { type: "MultiPolygon"; coordinates: number[][][][] };
      } | undefined;
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );
  assert.equal(templates.length, 2);
  assert.ok(templates.every((template) => (
    template.geometryStatus === "candidate"
      && template.ring.length >= 3
      && /重点复核/.test(template.note)
  )));
  assert.deepEqual(
    records.find(
      (record: { id: string }) => record.id === "sector_anshan",
    )?.aliases,
    ["四平路街道"],
  );
  assert.match(
    records.find(
      (record: { id: string; geometry?: { note?: string } }) => (
        record.id === "sector_zhongyuan"
      ),
    )?.geometry?.note ?? "",
    /军工路以西.*军工路以东/,
  );
  for (const unresolvedName of [
    "瑞虹新城", "鲁迅公园", "东外滩", "定海路", "黄兴公园",
  ]) {
    assert.equal(registryData.sectors.find(
      (record: { canonicalName: string }) => record.canonicalName === unresolvedName,
    )?.geometry?.status, "missing");
  }
});

test("the Zhongshan Park official core is editable without inventing a full West Suburb sector", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/changning-zhongshan-park-core-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const definition = batch.sectors[0];
  const record = registryData.sectors.find(
    (item: { id: string }) => item.id === definition.id,
  );
  const candidate = candidateData.features.find(
    (item: { properties: { id: string } }) => item.properties.id === definition.id,
  );

  assert.equal(definition.id, "sector_zhongshangongyuan");
  assert.equal(record?.canonicalName, "中山公园");
  assert.equal(record?.reviewStatus, "draft-medium");
  assert.equal(candidate?.properties?.areaSquareKilometers, 1.0727);
  assert.equal(candidate?.geometry.type, "Polygon");
  assert.equal(registryData.sectors.find(
    (item: { canonicalName: string }) => item.canonicalName === "西郊",
  )?.geometry.status, "missing");
});

test("the Gubei and Changning residential Hongqiao batch stays mutually exclusive and distinct from Hongqiao CBD", () => {
  const batch = JSON.parse(readFileSync(
    new URL(
      "../../data/geo/reviewed-candidate-batches/changning-gubei-hongqiao-mutually-exclusive-2026-07.json",
      import.meta.url,
    ),
    "utf8",
  ));
  const registryData = JSON.parse(readFileSync(
    new URL("../data/sectors/registry.json", import.meta.url),
    "utf8",
  ));
  const candidateData = JSON.parse(readFileSync(
    new URL("../data/sectors/reviewed-candidates.wgs84.json", import.meta.url),
    "utf8",
  ));
  const batchIds = batch.sectors.map((sector: { id: string }) => sector.id);

  assert.deepEqual(
    [...batchIds].sort(),
    ["sector_changning_hongqiao", "sector_gubei"],
  );
  assert.equal(
    registryData.sectors.find(
      (record: { id: string }) => record.id === "sector_gubei",
    )?.canonicalName,
    "古北",
  );
  assert.equal(
    registryData.sectors.find(
      (record: { id: string }) => record.id === "sector_changning_hongqiao",
    )?.canonicalName,
    "虹桥",
  );
  assert.equal(
    registryData.sectors.find(
      (record: { id: string }) => record.id === "sector_hongqiao",
    )?.canonicalName,
    "虹桥商务区",
  );
  const residentialHongqiao = candidateData.features.find(
    (feature: { properties: { id: string } }) => (
      feature.properties.id === "sector_changning_hongqiao"
    ),
  );
  assert.equal(residentialHongqiao?.geometry.type, "Polygon");
  assert.equal(residentialHongqiao?.geometry.coordinates.length, 2);
  const templates = buildSectorEditorTemplates(
    registryData.sectors.filter(
      (record: { id: string }) => batchIds.includes(record.id),
    ),
    (id) => {
      const candidate = candidateData.features.find(
        (feature: { properties: { id: string } }) => feature.properties.id === id,
      );
      return candidate
        ? {
          kind: "reviewed-market-candidate" as const,
          coordinateSystem: "WGS84" as const,
          geometry: candidate.geometry,
        }
        : undefined;
    },
    (position) => position,
  );
  const residentialHongqiaoTemplate = templates.find(
    (template) => template.id === "sector_changning_hongqiao",
  );
  assert.equal(residentialHongqiaoTemplate?.holes?.length, 1);
  assert.ok(
    residentialHongqiaoTemplate?.previousGeometryFingerprints?.length,
    "外环-only旧副本必须可自动迁移到带古北扣除洞的当前模板",
  );
});
