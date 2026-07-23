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
  assert.ok(!registryData.sectors.some(
    (record: { canonicalName: string }) => record.canonicalName === "上海南站",
  ));
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
  for (const forbiddenName of ["中山公园", "虹桥", "古北", "西郊"]) {
    assert.ok(!registryData.sectors.some(
      (record: { canonicalName: string }) => record.canonicalName === forbiddenName,
    ));
  }
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
