import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlaceholderSectorName,
  normalizeSectorSnapshotName,
  parseHfwgsjSectorSnapshot,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./hfwgsj-sector-snapshot.ts";

const validSnapshot = {
  type: "FeatureCollection",
  name: "private-snapshot",
  metadata: {
    source_page: "https://example.com",
    source_endpoint: "https://example.com/api",
    fetched_at: "2026-07-25T00:00:00.000Z",
    access_context: "one-time export",
    license_status: "unknown",
    layer_interpretation: "market sectors",
    coordinate_note: "[longitude, latitude]",
    feature_count: 1,
  },
  features: [{
    type: "Feature",
    id: "1",
    properties: {
      sourceId: "1",
      name: "张江",
      centroid: [121.6, 31.2],
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [121.5, 31.1],
        [121.7, 31.1],
        [121.7, 31.3],
        [121.5, 31.1],
      ]],
    },
  }],
};

test("parses a sanitized private sector snapshot", () => {
  const snapshot = parseHfwgsjSectorSnapshot(validSnapshot);
  assert.equal(snapshot.features.length, 1);
  assert.equal(snapshot.features[0].properties.name, "张江");
});

test("rejects a snapshot whose metadata count does not match", () => {
  assert.throws(
    () => parseHfwgsjSectorSnapshot({
      ...validSnapshot,
      metadata: { ...validSnapshot.metadata, feature_count: 2 },
    }),
    /要素数量与元数据不一致/,
  );
});

test("normalizes names and detects numeric placeholders", () => {
  assert.equal(normalizeSectorSnapshotName(" 杨思 前滩 "), "杨思前滩");
  assert.equal(isPlaceholderSectorName(" 2 "), true);
  assert.equal(isPlaceholderSectorName("东平"), false);
});
