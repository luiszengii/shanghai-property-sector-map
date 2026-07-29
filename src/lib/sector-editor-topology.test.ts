import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPairTopologyOperation,
  applySharedEdgeEdit,
  createPairSharedEdgeSession,
  findClosedGapAtPoint,
  findClosedGaps,
  geometryOverlapAreaSquareMeters,
  geometryProximityMeters,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./sector-editor-topology.ts";

const square = (west: number, south: number, east: number, north: number) => ({
  ring: [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ] as [number, number][],
});

test("a bounded blank can be claimed as a new sector geometry", () => {
  const occupied = [
    square(0, 0, 4, 1),
    square(0, 3, 4, 4),
    square(0, 1, 1, 3),
    square(3, 1, 4, 3),
  ];
  const result = findClosedGapAtPoint({
    point: [2, 2],
    viewport: { west: -1, south: -1, east: 5, north: 5 },
    occupied,
  });

  assert.deepEqual(result.target.ring, [
    [1, 1],
    [3, 1],
    [3, 3],
    [1, 3],
  ]);
  assert.equal(result.changedSector, "target");
});

test("all bounded blanks are returned for map preview while edge-connected space is excluded", () => {
  const occupied = [
    square(0, 0, 8, 1),
    square(0, 3, 8, 4),
    square(0, 1, 1, 3),
    square(3, 1, 5, 3),
    square(7, 1, 8, 3),
  ];
  const gaps = findClosedGaps({
    viewport: { west: -1, south: -1, east: 9, north: 5 },
    occupied,
  });

  assert.equal(gaps.length, 2);
  assert.deepEqual(gaps.map((gap) => gap.geometry.ring), [
    [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
    ],
    [
      [5, 1],
      [7, 1],
      [7, 3],
      [5, 3],
    ],
  ]);
  assert.ok(gaps.every((gap) => gap.areaSquareMeters > 0));
});

test("sub-millimeter shared-point drift does not abort every gap preview", () => {
  const occupied = [
    {
      ring: [
        [121.49339322494386, 31.237940431915952],
        [121.49336825788107, 31.238455439346723],
        [121.49346200018525, 31.239340161690567],
      ] as [number, number][],
    },
    {
      ring: [
        [121.49336825788106, 31.23845543934673],
        [121.49339322494386, 31.237940431915952],
        [121.49356801424815, 31.236904643276063],
      ] as [number, number][],
    },
  ];

  assert.doesNotThrow(() => findClosedGaps({
    viewport: {
      west: 121.44,
      south: 31.2,
      east: 121.54,
      north: 31.28,
    },
    occupied,
  }));
});

test("free space connected to the viewport edge cannot be claimed", () => {
  assert.throws(() => findClosedGapAtPoint({
    point: [2, 2],
    viewport: { west: 0, south: 0, east: 4, north: 4 },
    occupied: [square(0, 0, 1, 4)],
  }), /连接到当前视口外部/);
});

test("target-wins subtracts the target from the selected neighbor", () => {
  const result = applyPairTopologyOperation({
    target: square(1, 1, 3, 3),
    neighbor: square(0, 0, 2, 2),
    operation: "target-wins",
  });

  assert.equal(result.changedSector, "neighbor");
  assert.ok(result.neighbor);
  assert.deepEqual(result.neighbor?.ring, [
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ]);
});

test("neighbor-wins clips the current sector without changing its neighbor", () => {
  const neighbor = square(0, 0, 2, 2);
  const result = applyPairTopologyOperation({
    target: square(1, 1, 3, 3),
    neighbor,
    operation: "neighbor-wins",
  });

  assert.equal(result.changedSector, "target");
  assert.deepEqual(result.neighbor, neighbor);
  assert.deepEqual(result.target.ring, [
    [1, 2],
    [2, 2],
    [2, 1],
    [3, 1],
    [3, 3],
    [1, 3],
  ]);
});

test("a shared-edge edit repartitions one fixed two-sector domain", () => {
  const session = createPairSharedEdgeSession({
    target: square(0, 0, 2, 4),
    neighbor: square(2, 0, 4, 4),
  });
  const result = applySharedEdgeEdit({
    session,
    editedTarget: square(0, 0, 3, 4),
  });

  assert.deepEqual(result.target.ring, [
    [0, 0],
    [3, 0],
    [3, 4],
    [0, 4],
  ]);
  assert.deepEqual(result.neighbor?.ring, [
    [3, 0],
    [4, 0],
    [4, 4],
    [3, 4],
  ]);
});

test("disconnected sectors cannot start a shared-edge session", () => {
  assert.throws(() => createPairSharedEdgeSession({
    target: square(0, 0, 1, 1),
    neighbor: square(2, 0, 3, 1),
  }), /尚未连接/);
});

test("geometry proximity is zero for touching boxes and metric for gaps", () => {
  assert.equal(
    geometryProximityMeters(square(121.4, 31.2, 121.41, 31.21), square(121.41, 31.2, 121.42, 31.21)),
    0,
  );
  const distance = geometryProximityMeters(
    square(121.4, 31.2, 121.41, 31.21),
    square(121.42, 31.2, 121.43, 31.21),
  );
  assert.ok(distance > 900 && distance < 1_000);
});

test("pair controls distinguish an actual overlap from a shared edge", () => {
  assert.equal(
    geometryOverlapAreaSquareMeters(
      square(121.4, 31.2, 121.41, 31.21),
      square(121.41, 31.2, 121.42, 31.21),
    ),
    0,
  );
  assert.ok(
    (geometryOverlapAreaSquareMeters(
      square(121.4, 31.2, 121.415, 31.21),
      square(121.41, 31.2, 121.42, 31.21),
    ) ?? 0) > 40_000,
  );
});

test("overlap inspection ignores stored polygon parts that collapse after snapping", () => {
  const historicalMultiPartDraft = {
    ...square(121.4, 31.2, 121.42, 31.22),
    additionalRings: [[
      [121.41, 31.21],
      [121.41000000001, 31.21000000001],
      [121.41000000002, 31.21000000002],
    ]] as [number, number][][],
    additionalHoles: [[]],
  };

  const overlapArea = geometryOverlapAreaSquareMeters(
    square(121.41, 31.21, 121.43, 31.23),
    historicalMultiPartDraft,
  );

  assert.ok((overlapArea ?? 0) > 0);
});
