import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { simplifySectorGeometryForDisplay } from "./sector-display-lod.ts";

test("simplifies display geometry without mutating the source ring", () => {
  const geometry = {
    type: "Polygon" as const,
    coordinates: [[
      [121, 31],
      [121.00001, 31.00001],
      [121.00002, 31.00002],
      [121.01, 31],
      [121.01, 31.01],
      [121, 31.01],
      [121, 31],
    ]],
  };
  const original = structuredClone(geometry);
  const simplified = simplifySectorGeometryForDisplay(geometry, 0.0001);

  assert.deepEqual(geometry, original);
  assert.ok(simplified.coordinates[0].length < geometry.coordinates[0].length);
  assert.deepEqual(simplified.coordinates[0][0], simplified.coordinates[0].at(-1));
  assert.ok(simplified.coordinates[0].length >= 4);
});

test("preserves polygon and multipolygon structure", () => {
  const ring = [
    [121, 31],
    [121.01, 31],
    [121.01, 31.01],
    [121, 31.01],
    [121, 31],
  ];
  const polygon = simplifySectorGeometryForDisplay({
    type: "Polygon",
    coordinates: [ring, ring],
  });
  const multipolygon = simplifySectorGeometryForDisplay({
    type: "MultiPolygon",
    coordinates: [[[...ring]]],
  });

  assert.equal(polygon.type, "Polygon");
  assert.equal(polygon.coordinates.length, 2);
  assert.equal(multipolygon.type, "MultiPolygon");
  assert.equal(multipolygon.coordinates.length, 1);
});
