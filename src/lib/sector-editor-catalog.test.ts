import assert from "node:assert/strict";
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
