import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { clusterMapPoints } from "./project-marker-clustering.ts";

test("groups nearby screen points and keeps distant points separate", () => {
  const clusters = clusterMapPoints([
    { item: "a", x: 0, y: 0 },
    { item: "b", x: 30, y: 10 },
    { item: "c", x: 130, y: 0 },
  ], 60);

  assert.deepEqual(clusters.map((cluster) => cluster.items), [["a", "b"], ["c"]]);
  assert.deepEqual(clusters[0].center, { x: 15, y: 5 });
});

test("returns one cluster per point when clustering is disabled", () => {
  const clusters = clusterMapPoints([
    { item: "a", x: 0, y: 0 },
    { item: "b", x: 10, y: 10 },
  ], 0);

  assert.deepEqual(clusters.map((cluster) => cluster.items), [["a"], ["b"]]);
});

test("updates the centroid as points join a cluster", () => {
  const clusters = clusterMapPoints([
    { item: "a", x: 0, y: 0 },
    { item: "b", x: 40, y: 0 },
    { item: "c", x: 65, y: 0 },
  ], 50);

  assert.deepEqual(clusters.map((cluster) => cluster.items), [["a", "b", "c"]]);
  assert.equal(clusters[0].center.x, 35);
});
