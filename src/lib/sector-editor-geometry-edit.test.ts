import assert from "node:assert/strict";
import test from "node:test";
import {
  listDraftVertices,
  moveDraftVertices,
  removeDraftVertices,
  removeDraftPolygonPart,
  selectDraftVertexKeysInRectangle,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./sector-editor-geometry-edit.ts";

const primary = [
  [121.4, 31.2],
  [121.41, 31.2],
  [121.41, 31.21],
  [121.4, 31.21],
] as [number, number][];
const detached = [
  [121.42, 31.2],
  [121.43, 31.2],
  [121.43, 31.21],
  [121.42, 31.21],
] as [number, number][];
const third = [
  [121.44, 31.2],
  [121.45, 31.2],
  [121.45, 31.21],
  [121.44, 31.21],
] as [number, number][];
const detachedHole = [
  [121.423, 31.203],
  [121.427, 31.203],
  [121.427, 31.207],
  [121.423, 31.207],
] as [number, number][];

test("a detached polygon part can be removed together with its own holes", () => {
  const result = removeDraftPolygonPart({
    ring: primary,
    holes: [],
    additionalRings: [detached, third],
    additionalHoles: [[detachedHole], []],
  }, 1);

  assert.deepEqual(result, {
    ring: primary,
    holes: [],
    additionalRings: [third],
    additionalHoles: [[]],
  });
});

test("removing the primary polygon promotes the next part and its holes", () => {
  const result = removeDraftPolygonPart({
    ring: primary,
    holes: [],
    additionalRings: [detached, third],
    additionalHoles: [[detachedHole], []],
  }, 0);

  assert.deepEqual(result, {
    ring: detached,
    holes: [detachedHole],
    additionalRings: [third],
    additionalHoles: [[]],
  });
});

test("selected vertices are removed together without shifting later indices", () => {
  const result = removeDraftVertices({
    ring: primary,
    holes: [],
    additionalRings: [detached],
    additionalHoles: [[]],
  }, [
    { partIndex: 0, ringIndex: 0, vertexIndex: 1 },
    { partIndex: 1, ringIndex: 0, vertexIndex: 2 },
  ]);

  assert.deepEqual(result, {
    ring: [primary[0], primary[2], primary[3]],
    holes: [],
    additionalRings: [[detached[0], detached[1], detached[3]]],
    additionalHoles: [[]],
  });
});

test("dragging one selected vertex moves every selected vertex by the same delta", () => {
  const result = moveDraftVertices({
    ring: [[0, 0], [2, 0], [2, 2], [0, 2]],
    holes: [],
    additionalRings: [[[4, 0], [6, 0], [6, 2], [4, 2]]],
    additionalHoles: [[]],
  }, [
    { partIndex: 0, ringIndex: 0, vertexIndex: 1 },
    { partIndex: 1, ringIndex: 0, vertexIndex: 2 },
  ], [1, -1]);

  assert.deepEqual(result, {
    ring: [[0, 0], [3, -1], [2, 2], [0, 2]],
    holes: [],
    additionalRings: [[[4, 0], [6, 0], [7, 1], [4, 2]]],
    additionalHoles: [[]],
  });
});

test("every exterior and hole vertex receives a stable selectable reference", () => {
  const vertices = listDraftVertices({
    ring: primary,
    holes: [detachedHole],
    additionalRings: [detached],
    additionalHoles: [[]],
  });

  assert.equal(vertices.length, 12);
  assert.deepEqual(vertices[0], {
    key: "0:0:0",
    reference: { partIndex: 0, ringIndex: 0, vertexIndex: 0 },
    position: primary[0],
  });
  assert.deepEqual(vertices[4], {
    key: "0:1:0",
    reference: { partIndex: 0, ringIndex: 1, vertexIndex: 0 },
    position: detachedHole[0],
  });
  assert.deepEqual(vertices[8], {
    key: "1:0:0",
    reference: { partIndex: 1, ringIndex: 0, vertexIndex: 0 },
    position: detached[0],
  });
});

test("a bulk delete cannot leave any ring with fewer than three vertices", () => {
  assert.throws(() => removeDraftVertices({
    ring: primary,
    holes: [],
    additionalRings: [],
    additionalHoles: [],
  }, [
    { partIndex: 0, ringIndex: 0, vertexIndex: 0 },
    { partIndex: 0, ringIndex: 0, vertexIndex: 1 },
  ]), /至少需要保留 3 个顶点/);
});

test("the last polygon part cannot be removed", () => {
  assert.throws(() => removeDraftPolygonPart({
    ring: primary,
    holes: [],
    additionalRings: [],
    additionalHoles: [],
  }, 0), /至少需要保留一个闭环/);
});

test("a drag rectangle selects only visible current-sector vertices inside it", () => {
  const result = selectDraftVertexKeysInRectangle([
    { key: "0:0:0", point: [25, 30] },
    { key: "0:0:1", point: [100, 100] },
    { key: "1:0:0", point: [50, 60] },
  ], {
    start: [80, 80],
    end: [20, 20],
  });

  assert.deepEqual([...result], ["0:0:0", "1:0:0"]);
});

test("Command Shift rectangle selection appends instead of replacing existing vertices", () => {
  const result = selectDraftVertexKeysInRectangle([
    { key: "0:0:0", point: [25, 30] },
    { key: "0:0:1", point: [100, 100] },
    { key: "1:0:0", point: [50, 60] },
  ], {
    start: [20, 20],
    end: [60, 70],
  }, new Set(["0:0:1"]), true);

  assert.deepEqual([...result], ["0:0:1", "0:0:0", "1:0:0"]);
});

test("a bulk delete is rejected when reconnecting the remaining vertices would self-intersect", () => {
  assert.throws(() => removeDraftVertices({
    ring: [
      [0, 0],
      [0, 1],
      [0, 2],
      [2, 4],
      [4, 1],
      [3, 2],
      [4, 0],
      [1, 2],
    ],
    holes: [],
    additionalRings: [],
    additionalHoles: [],
  }, [
    { partIndex: 0, ringIndex: 0, vertexIndex: 3 },
  ]), /无效几何|自交/);
});

test("a group move is rejected when it would make a ring self-intersect", () => {
  assert.throws(() => moveDraftVertices({
    ring: [[0, 0], [2, 0], [2, 2], [0, 2]],
    holes: [],
    additionalRings: [],
    additionalHoles: [],
  }, [
    { partIndex: 0, ringIndex: 0, vertexIndex: 1 },
  ], [-1, 3]), /无效几何|自交/);
});

test("moving a hole outside its exterior is rejected as an invalid Polygon", () => {
  assert.throws(() => moveDraftVertices({
    ring: [[0, 0], [8, 0], [8, 8], [0, 8]],
    holes: [[[2, 2], [4, 2], [4, 4], [2, 4]]],
    additionalRings: [],
    additionalHoles: [],
  }, [
    { partIndex: 0, ringIndex: 1, vertexIndex: 0 },
    { partIndex: 0, ringIndex: 1, vertexIndex: 1 },
    { partIndex: 0, ringIndex: 1, vertexIndex: 2 },
    { partIndex: 0, ringIndex: 1, vertexIndex: 3 },
  ], [8, 0]), /无效几何|孔洞/);
});

test("moving a detached part across another part is rejected as an invalid MultiPolygon", () => {
  assert.throws(() => moveDraftVertices({
    ring: [[0, 0], [4, 0], [4, 4], [0, 4]],
    holes: [],
    additionalRings: [[[8, 0], [12, 0], [12, 4], [8, 4]]],
    additionalHoles: [[]],
  }, [
    { partIndex: 1, ringIndex: 0, vertexIndex: 0 },
    { partIndex: 1, ringIndex: 0, vertexIndex: 1 },
    { partIndex: 1, ringIndex: 0, vertexIndex: 2 },
    { partIndex: 1, ringIndex: 0, vertexIndex: 3 },
  ], [-6, 0]), /无效几何|重叠/);
});
