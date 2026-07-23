import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { buildSectorEditorTemplates } from "./sector-editor-catalog.ts";

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
