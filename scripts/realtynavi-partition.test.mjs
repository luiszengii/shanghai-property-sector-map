import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompleteDistrictPartition,
  trimRealtynaviGuardRings,
} from "./realtynavi-partition.mjs";

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function geometryArea(geometry) {
  if (!geometry) return 0;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
  return polygons.reduce((sum, polygon) => (
    sum
    + ringArea(polygon[0])
    - polygon.slice(1).reduce((holeSum, ring) => holeSum + ringArea(ring), 0)
  ), 0);
}

test("removes RealtyNavi client guard coordinates before closing a sector ring", () => {
  const rings = trimRealtynaviGuardRings([
    [
      ["𝟏", "31.2"],
      ["121.1", "31.1"],
      ["121.2", "31.1"],
      ["121.2", "31.2"],
      ["121.1", "31.1"],
      ["𝟏", "31.2"],
    ],
  ]);

  assert.deepEqual(rings, [[
    ["121.1", "31.1"],
    ["121.2", "31.1"],
    ["121.2", "31.2"],
    ["121.1", "31.1"],
  ]]);
});

test("separates district-outline differences from named sectors", () => {
  const districtGeometry = {
    type: "Polygon",
    coordinates: [[
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]],
  };
  const namedGeometries = [
    {
      type: "Polygon",
      coordinates: [[
        [0, 0],
        [4, 0],
        [4, 10],
        [0, 10],
        [0, 0],
      ]],
    },
    {
      type: "Polygon",
      coordinates: [[
        [6, 0],
        [10, 0],
        [10, 10],
        [6, 10],
        [6, 0],
      ]],
    },
  ];

  const partition = buildCompleteDistrictPartition({
    districtGeometry,
    namedGeometries,
  });

  assert.equal(geometryArea(partition.districtOutlineDifferenceGeometry), 20);
  assert.equal(partition.namedCoveragePercent, 80);
  assert.equal(partition.completedCoveragePercent, 100);
});
