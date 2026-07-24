import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { shouldMountSectorLabel } from "./sector-label-visibility.ts";

test("hover mode mounts only the active sector label", () => {
  assert.equal(shouldMountSectorLabel({
    mode: "hover",
    zoom: 10,
    minZoom: 14,
    hovered: false,
  }), false);
  assert.equal(shouldMountSectorLabel({
    mode: "hover",
    zoom: 10,
    minZoom: 14,
    hovered: true,
  }), true);
});
test("zoom mode respects the configured minimum zoom", () => {
  assert.equal(shouldMountSectorLabel({
    mode: "zoom",
    zoom: 13.8,
    minZoom: 14,
  }), false);
  assert.equal(shouldMountSectorLabel({
    mode: "zoom",
    zoom: 14,
    minZoom: 14,
  }), true);
});
