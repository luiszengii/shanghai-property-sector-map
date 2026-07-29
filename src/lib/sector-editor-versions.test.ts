import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUserReviewedOverrideCollection,
  createSectorEditorVersion,
  emptySectorEditorVersionStore,
  parseSectorEditorVersionStore,
  summarizeSectorEditorVersion,
// @ts-expect-error Node 22 executes this TypeScript test directly and needs the source extension.
} from "./sector-editor-versions.ts";

const draft = {
  id: "sector-test",
  name: "测试板块",
  district: "测试区",
  boundaryBasis: "",
  note: "",
  coordinateSystem: "GCJ-02" as const,
  ring: [[121.4, 31.2], [121.5, 31.2], [121.5, 31.3]] as [number, number][],
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};

test("explicit saves receive monotonically increasing persistent version numbers", () => {
  const store = emptySectorEditorVersionStore();
  const first = createSectorEditorVersion(store, {
    drafts: [draft],
    activeId: draft.id,
  }, {
    id: "version-1",
    createdAt: "2026-07-26T01:00:00.000Z",
  });
  store.versions.push(first);
  const second = createSectorEditorVersion(store, {
    label: "共享边修复后",
    drafts: [draft],
    activeId: draft.id,
  }, {
    id: "version-2",
    createdAt: "2026-07-26T02:00:00.000Z",
  });

  assert.equal(first.versionNumber, 1);
  assert.equal(first.label, "版本 1");
  assert.equal(second.versionNumber, 2);
  assert.equal(second.label, "共享边修复后");
  assert.equal(second.activeId, draft.id);
});

test("persisted version files are validated and summarized without losing drafts", () => {
  const version = createSectorEditorVersion(emptySectorEditorVersionStore(), {
    drafts: [draft],
    activeId: draft.id,
  }, {
    id: "version-1",
    createdAt: "2026-07-26T01:00:00.000Z",
  });
  const parsed = parseSectorEditorVersionStore({
    schemaVersion: 1,
    versions: [version],
  });
  const summary = summarizeSectorEditorVersion(parsed.versions[0]);

  assert.equal(parsed.versions[0].drafts[0].name, "测试板块");
  assert.equal(summary.draftCount, 1);
  assert.equal(summary.completeDraftCount, 1);
});

test("an explicit save converts registered editor drafts into the project WGS84 override layer", () => {
  const version = createSectorEditorVersion(emptySectorEditorVersionStore(), {
    drafts: [draft],
    activeId: draft.id,
  }, {
    id: "version-1",
    createdAt: "2026-07-26T01:00:00.000Z",
  });
  const result = buildUserReviewedOverrideCollection({
    version,
    registeredSectorIds: new Set([draft.id]),
  });
  const feature = result.collection.features[0];

  assert.equal(result.publishedDraftCount, 1);
  assert.deepEqual(result.skippedUnregisteredDraftIds, []);
  assert.equal(feature.properties.id, draft.id);
  assert.equal(feature.properties.status, "user-reviewed-override");
  assert.equal(feature.geometry.type, "Polygon");
  assert.deepEqual(
    feature.geometry.coordinates[0][0],
    feature.geometry.coordinates[0].at(-1),
  );
  assert.notDeepEqual(feature.geometry.coordinates[0][0], draft.ring[0]);
});

test("unregistered custom drafts stay versioned but cannot silently enter project map data", () => {
  const version = createSectorEditorVersion(emptySectorEditorVersionStore(), {
    drafts: [draft],
  }, {
    id: "version-1",
    createdAt: "2026-07-26T01:00:00.000Z",
  });
  const result = buildUserReviewedOverrideCollection({
    version,
    registeredSectorIds: new Set(),
  });

  assert.equal(result.publishedDraftCount, 0);
  assert.deepEqual(result.skippedUnregisteredDraftIds, [draft.id]);
  assert.equal(result.collection.features.length, 0);
});

test("saving after an identity is retired removes its previous active override", () => {
  const version = createSectorEditorVersion(emptySectorEditorVersionStore(), {
    drafts: [draft],
  }, {
    id: "version-2",
    createdAt: "2026-07-28T08:30:00.000Z",
  });
  const previous = buildUserReviewedOverrideCollection({
    version,
    registeredSectorIds: new Set([draft.id]),
  }).collection;

  const result = buildUserReviewedOverrideCollection({
    version,
    registeredSectorIds: new Set(),
    previous,
  });

  assert.equal(result.publishedDraftCount, 0);
  assert.deepEqual(result.skippedUnregisteredDraftIds, [draft.id]);
  assert.equal(result.collection.features.length, 0);
});
