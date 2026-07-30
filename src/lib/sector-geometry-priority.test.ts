import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this test directly and requires the source extension.
import { mergeMarketGeometryLayers } from "./sector-geometry-priority.ts";

interface GeometryStub {
  properties: {
    id: string;
    source: "candidate" | "editor" | "approved-topology";
  };
}

test("approved topology is the final production geometry for the same sector", () => {
  const candidate: GeometryStub = {
    properties: { id: "sector_anshan", source: "candidate" },
  };
  const editorOverride: GeometryStub = {
    properties: { id: "sector_anshan", source: "editor" },
  };
  const approvedTopology: GeometryStub = {
    properties: { id: "sector_anshan", source: "approved-topology" },
  };
  const untouchedCandidate: GeometryStub = {
    properties: { id: "sector_qiantan", source: "candidate" },
  };

  const merged = mergeMarketGeometryLayers(
    [candidate, untouchedCandidate],
    [editorOverride],
    [approvedTopology],
  );

  assert.deepEqual(
    merged.map((feature) => feature.properties),
    [
      { id: "sector_anshan", source: "approved-topology" },
      { id: "sector_qiantan", source: "candidate" },
    ],
  );
});
