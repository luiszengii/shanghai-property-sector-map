import assert from "node:assert/strict";
import test from "node:test";
import {
  getSnapshotDisplayFeatures,
  isPlaceholderSectorName,
  normalizeSectorSnapshotName,
  parseHfwgsjSectorSnapshot,
  type HfwgsjSectorSnapshotFeature,
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

const square = {
  type: "Polygon" as const,
  coordinates: [[
    [121, 31],
    [122, 31],
    [122, 32],
    [121, 31],
  ]],
};

const features: HfwgsjSectorSnapshotFeature[] = [
  {
    type: "Feature",
    id: "named-a",
    properties: {
      sourceId: "named-a",
      name: "板块 A",
      centroid: [121.5, 31.5],
      classification: "named_sector",
    },
    geometry: square,
  },
  {
    type: "Feature",
    id: "named-b",
    properties: {
      sourceId: "named-b",
      name: "板块 B",
      centroid: [121.7, 31.7],
      classification: "named_sector",
    },
    geometry: square,
  },
  {
    type: "Feature",
    id: "district-outline-difference",
    properties: {
      sourceId: "district-outline-difference",
      name: "区级外轮廓差异范围",
      centroid: null,
      classification: "district_outline_difference",
    },
    geometry: square,
  },
];

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

test("RealtyNavi comparison displays only named sectors by default", () => {
  assert.deepEqual(
    getSnapshotDisplayFeatures(features, {
      includeDistrictOutlineDifferences: false,
    }).map((feature) => feature.id),
    ["named-a", "named-b"],
  );
});

test("district outline differences appear only after explicit opt-in", () => {
  assert.deepEqual(
    getSnapshotDisplayFeatures(features, {
      includeDistrictOutlineDifferences: true,
    }).map((feature) => feature.id),
    ["named-a", "named-b", "district-outline-difference"],
  );
});
