import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { sectorEditorMapOptions } from "./sector-editor-map-options.ts";

test("pinch zoom stays anchored to the editor map center", () => {
  assert.equal(sectorEditorMapOptions.touchZoomCenter, 1);
  assert.equal(sectorEditorMapOptions.scrollWheel, true);
  assert.equal(sectorEditorMapOptions.doubleClickZoom, false);
});
