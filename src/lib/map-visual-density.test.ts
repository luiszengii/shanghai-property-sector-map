import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { PUBLIC_BASEMAP_FEATURES, sectorFillOpacity } from "./map-visual-density.ts";

test("keeps AMap POIs available for metro stations and public facilities", () => {
  assert.deepEqual(PUBLIC_BASEMAP_FEATURES, ["bg", "road", "building", "point"]);
});

test("keeps the citywide sector wash light enough to reveal transit lines", () => {
  const overviewOpacity = sectorFillOpacity(
    "reviewed-market-candidate",
    10.6,
  );

  assert.ok(overviewOpacity <= 0.16);
  assert.ok(
    sectorFillOpacity("reviewed-market-candidate", 10.6, true)
      > overviewOpacity,
  );
});
