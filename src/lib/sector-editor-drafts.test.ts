import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSectorDraftFeatureCollection,
  createDraftFromExistingSector,
  createSectorDraft,
  isCompleteSectorDraft,
  normalizeAmapPolygonRing,
  parseSectorEditorState,
  parseSectorDraftFeatureCollection,
  serializeSectorEditorState,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./sector-editor-drafts.ts";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { mapZoomDeltaForShortcut } from "./map-keyboard-shortcuts.ts";

test("exported sector drafts are closed GCJ-02 polygons with an explicit warning", () => {
  const draft = {
    ...createSectorDraft("sector-test", "2026-07-23T08:00:00.000Z"),
    name: "测试板块",
    ring: [
      [121.4, 31.2],
      [121.5, 31.2],
      [121.5, 31.3],
    ] as [number, number][],
  };

  const collection = buildSectorDraftFeatureCollection([draft], "2026-07-23T09:00:00.000Z");

  assert.equal(collection.metadata.coordinateSystem, "GCJ-02");
  assert.match(collection.metadata.warning, /非行政区/);
  assert.deepEqual(collection.features[0].geometry.coordinates[0], [
    [121.4, 31.2],
    [121.5, 31.2],
    [121.5, 31.3],
    [121.4, 31.2],
  ]);
});

test("an editor export can be imported without keeping the closing coordinate twice", () => {
  const draft = {
    ...createSectorDraft("sector-roundtrip", "2026-07-23T08:00:00.000Z"),
    name: "往返测试",
    ring: [
      [121.1, 31.1],
      [121.2, 31.1],
      [121.2, 31.2],
    ] as [number, number][],
  };
  const collection = buildSectorDraftFeatureCollection([draft]);

  const imported = parseSectorDraftFeatureCollection(collection);

  assert.equal(imported.length, 1);
  assert.equal(imported[0].ring.length, 3);
  assert.deepEqual(imported[0].ring[0], [121.1, 31.1]);
});

test("import rejects files without an explicit GCJ-02 coordinate system", () => {
  assert.throws(
    () => parseSectorDraftFeatureCollection({
      type: "FeatureCollection",
      metadata: { schemaVersion: 1 },
      features: [],
    }),
    /坐标系不是 GCJ-02/,
  );
});

test("an unfinished local draft survives browser-storage serialization", () => {
  const draft = {
    ...createSectorDraft("sector-in-progress", "2026-07-23T08:00:00.000Z"),
    name: "画到一半",
    ring: [[121.4, 31.2]] as [number, number][],
  };

  const restored = parseSectorEditorState(serializeSectorEditorState([draft]));

  assert.equal(restored[0].name, "画到一半");
  assert.deepEqual(restored[0].ring, [[121.4, 31.2]]);
});

test("AMap polygon paths work whether the outer ring is direct or nested", () => {
  const direct = [[121.4, 31.2], [121.5, 31.2], [121.5, 31.3]];
  const nested = [direct];

  assert.deepEqual(normalizeAmapPolygonRing(direct), direct);
  assert.deepEqual(normalizeAmapPolygonRing(nested), direct);
});

test("a drawn polygon still needs a real sector name before export", () => {
  const draft = {
    ...createSectorDraft("sector-unnamed"),
    ring: [[121.4, 31.2], [121.5, 31.2], [121.5, 31.3]] as [number, number][],
  };

  assert.equal(isCompleteSectorDraft(draft), false);
  assert.equal(buildSectorDraftFeatureCollection([draft]).features.length, 0);
});

test("Control or Command plus/minus maps to one map zoom step", () => {
  assert.equal(mapZoomDeltaForShortcut({ key: "=", ctrlKey: true }), 1);
  assert.equal(mapZoomDeltaForShortcut({ key: "+", ctrlKey: true }), 1);
  assert.equal(mapZoomDeltaForShortcut({ key: "-", ctrlKey: true }), -1);
  assert.equal(mapZoomDeltaForShortcut({ key: "_", metaKey: true }), -1);
  assert.equal(mapZoomDeltaForShortcut({ key: "=", ctrlKey: false, metaKey: false }), null);
  assert.equal(mapZoomDeltaForShortcut({ key: "-", ctrlKey: true, altKey: true }), null);
});

test("an existing sector becomes an editable copy without changing its identity", () => {
  const draft = createDraftFromExistingSector({
    id: "sector-qiantan",
    name: "前滩",
    district: "浦东新区",
    boundaryBasis: "沿主要道路与水系",
    note: "从当前地图载入",
    geometryStatus: "candidate",
    ring: [[121.4, 31.1], [121.5, 31.1], [121.5, 31.2]],
  }, "2026-07-23T10:00:00.000Z");

  assert.equal(draft.id, "sector-qiantan");
  assert.equal(draft.sourceSectorId, "sector-qiantan");
  assert.equal(draft.coordinateSystem, "GCJ-02");
  assert.deepEqual(draft.ring, [[121.4, 31.1], [121.5, 31.1], [121.5, 31.2]]);

  const restored = parseSectorEditorState(serializeSectorEditorState([draft]));
  assert.equal(restored[0].sourceSectorId, "sector-qiantan");
  assert.equal(
    buildSectorDraftFeatureCollection(restored).features[0].properties.sourceSectorId,
    "sector-qiantan",
  );
});
