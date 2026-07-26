import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
} from "polygon-clipping";
import {
  draftAdditionalHoles,
  draftHoles,
  draftParts,
  type DraftPosition,
// @ts-expect-error Node 22 executes topology tests directly and needs the source extension.
} from "./sector-editor-drafts.ts";

export interface EditableSectorGeometry {
  ring: DraftPosition[];
  holes?: DraftPosition[][];
  additionalRings?: DraftPosition[][];
  additionalHoles?: DraftPosition[][][];
}

export interface TopologyViewport {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TopologyOperationResult {
  target: EditableSectorGeometry;
  neighbor?: EditableSectorGeometry;
  changedSector: "target" | "neighbor" | "both";
  areaSquareMeters: number;
}

export interface ClosedGapCandidate {
  geometry: EditableSectorGeometry;
  areaSquareMeters: number;
}

export interface ClosedGapScanResult {
  candidates: ClosedGapCandidate[];
  skippedGeometryCount: number;
}

export type PairTopologyOperation = "target-wins" | "neighbor-wins";

const coordinateEpsilon = 1e-10;
const clippingCoordinateGrid = 1e-10;

function closeRing(ring: DraftPosition[]): Pair[] {
  if (ring.length < 3) return [];
  const snapped = ring
    .map(([x, y]) => [
      Math.round(x / clippingCoordinateGrid) * clippingCoordinateGrid,
      Math.round(y / clippingCoordinateGrid) * clippingCoordinateGrid,
    ] as Pair)
    .filter((point, index, points) => (
      index === 0
      || point[0] !== points[index - 1][0]
      || point[1] !== points[index - 1][1]
    ));
  const firstSnapped = snapped[0];
  const lastSnapped = snapped.at(-1);
  if (
    snapped.length > 1
    && firstSnapped
    && lastSnapped
    && firstSnapped[0] === lastSnapped[0]
    && firstSnapped[1] === lastSnapped[1]
  ) {
    snapped.pop();
  }
  if (snapped.length < 3) return [];
  const closed = snapped;
  const first = closed[0];
  const last = closed.at(-1);
  if (!last || first[0] !== last[0] || first[1] !== last[1]) {
    closed.push([...first] as Pair);
  }
  return closed;
}

export function geometryToMultiPolygon(
  geometry: EditableSectorGeometry,
): MultiPolygon {
  const parts = draftParts(geometry);
  if (!parts.length) return [];
  const additionalHoles = draftAdditionalHoles(geometry);
  return parts.map((outer, index): Polygon => [
    closeRing(outer),
    ...(index === 0 ? draftHoles(geometry) : (additionalHoles[index - 1] ?? []))
      .map(closeRing),
  ]);
}

function openRing(ring: Pair[]): DraftPosition[] {
  const output = ring.map(([x, y]) => [x, y] as DraftPosition);
  const first = output[0];
  const last = output.at(-1);
  if (
    first
    && last
    && first[0] === last[0]
    && first[1] === last[1]
  ) {
    output.pop();
  }
  return output;
}

export function multiPolygonToGeometry(
  multiPolygon: MultiPolygon,
): EditableSectorGeometry {
  const polygons = multiPolygon
    .map((polygon) => polygon
      .map(openRing)
      .filter((ring) => ring.length >= 3))
    .filter((polygon) => polygon[0]?.length >= 3);
  const [primary, ...additional] = polygons;
  if (!primary) {
    return {
      ring: [],
      holes: [],
      additionalRings: [],
      additionalHoles: [],
    };
  }
  return {
    ring: primary[0],
    holes: primary.slice(1),
    additionalRings: additional.map((polygon) => polygon[0]),
    additionalHoles: additional.map((polygon) => polygon.slice(1)),
  };
}

function ringContainsPoint(ring: Pair[], point: DraftPosition) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonContainsPoint(polygon: Polygon, point: DraftPosition) {
  if (!polygon[0] || !ringContainsPoint(polygon[0], point)) return false;
  return !polygon.slice(1).some((hole) => ringContainsPoint(hole, point));
}

function touchesViewport(polygon: Polygon, viewport: TopologyViewport) {
  return polygon[0]?.some(([x, y]) => (
    Math.abs(x - viewport.west) <= coordinateEpsilon
    || Math.abs(x - viewport.east) <= coordinateEpsilon
    || Math.abs(y - viewport.south) <= coordinateEpsilon
    || Math.abs(y - viewport.north) <= coordinateEpsilon
  )) ?? false;
}

function viewportPolygon(viewport: TopologyViewport): Polygon {
  return [[
    [viewport.west, viewport.south],
    [viewport.east, viewport.south],
    [viewport.east, viewport.north],
    [viewport.west, viewport.north],
    [viewport.west, viewport.south],
  ]];
}

function geometryBounds(geometry: EditableSectorGeometry) {
  const positions = [
    ...draftParts(geometry).flat(),
    ...draftHoles(geometry).flat(),
    ...draftAdditionalHoles(geometry).flat(2),
  ];
  if (!positions.length) return undefined;
  return positions.reduce((bounds, [x, y]) => ({
    west: Math.min(bounds.west, x),
    south: Math.min(bounds.south, y),
    east: Math.max(bounds.east, x),
    north: Math.max(bounds.north, y),
  }), {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  });
}

function boundsIntersect(a: TopologyViewport, b: TopologyViewport) {
  return a.west <= b.east
    && a.east >= b.west
    && a.south <= b.north
    && a.north >= b.south;
}

export function geometryProximityMeters(
  first: EditableSectorGeometry,
  second: EditableSectorGeometry,
) {
  const firstBounds = geometryBounds(first);
  const secondBounds = geometryBounds(second);
  if (!firstBounds || !secondBounds) return Number.POSITIVE_INFINITY;
  const longitudeGap = Math.max(
    0,
    secondBounds.west - firstBounds.east,
    firstBounds.west - secondBounds.east,
  );
  const latitudeGap = Math.max(
    0,
    secondBounds.south - firstBounds.north,
    firstBounds.south - secondBounds.north,
  );
  const latitude = (
    firstBounds.south
    + firstBounds.north
    + secondBounds.south
    + secondBounds.north
  ) / 4;
  const longitudeMeters = longitudeGap * 111_320 * Math.cos(latitude * Math.PI / 180);
  const latitudeMeters = latitudeGap * 110_574;
  return Math.hypot(longitudeMeters, latitudeMeters);
}

function localAreaSquareMeters(multiPolygon: MultiPolygon) {
  const positions = multiPolygon.flat(2);
  if (!positions.length) return 0;
  const latitude = positions.reduce((sum, pair) => sum + pair[1], 0) / positions.length;
  const metersPerLongitudeDegree = 111_320 * Math.cos(latitude * Math.PI / 180);
  const metersPerLatitudeDegree = 110_574;
  const ringArea = (ring: Pair[]) => {
    let twiceArea = 0;
    for (let index = 0; index < ring.length; index += 1) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[(index + 1) % ring.length];
      twiceArea += (
        x1 * metersPerLongitudeDegree * y2 * metersPerLatitudeDegree
        - x2 * metersPerLongitudeDegree * y1 * metersPerLatitudeDegree
      );
    }
    return Math.abs(twiceArea) / 2;
  };
  return multiPolygon.reduce((total, polygon) => (
    total
    + ringArea(polygon[0] ?? [])
    - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0)
  ), 0);
}

export function scanClosedGaps(input: {
  viewport: TopologyViewport;
  occupied: EditableSectorGeometry[];
}): ClosedGapScanResult {
  const relevantOccupied = input.occupied
    .filter((geometry) => {
      const bounds = geometryBounds(geometry);
      return bounds ? boundsIntersect(bounds, input.viewport) : false;
    })
    .map(geometryToMultiPolygon)
    .filter((geometry) => geometry.length);
  let skippedGeometryCount = 0;
  const skippedGeometries: MultiPolygon[] = [];
  let freeSpace: MultiPolygon;
  try {
    const occupiedUnion = relevantOccupied.length
      ? polygonClipping.union(relevantOccupied[0], ...relevantOccupied.slice(1))
      : [];
    freeSpace = occupiedUnion.length
      ? polygonClipping.difference(viewportPolygon(input.viewport), occupiedUnion)
      : [viewportPolygon(input.viewport)];
  } catch {
    freeSpace = [viewportPolygon(input.viewport)];
    for (const geometry of relevantOccupied) {
      try {
        freeSpace = polygonClipping.difference(freeSpace, geometry);
      } catch {
        skippedGeometryCount += 1;
        skippedGeometries.push(geometry);
      }
    }
  }
  const candidates = freeSpace
    .filter((polygon) => !touchesViewport(polygon, input.viewport))
    .map((polygon) => ({
      geometry: multiPolygonToGeometry([polygon]),
      areaSquareMeters: localAreaSquareMeters([polygon]),
    }))
    .filter((candidate) => candidate.areaSquareMeters >= 100)
    .filter((candidate) => {
      const candidateBounds = geometryBounds(candidate.geometry);
      if (!candidateBounds) return false;
      return !skippedGeometries.some((geometry) => {
        const skippedBounds = geometryBounds(multiPolygonToGeometry(geometry));
        return skippedBounds ? boundsIntersect(candidateBounds, skippedBounds) : false;
      });
    });
  return { candidates, skippedGeometryCount };
}

export function findClosedGaps(input: {
  viewport: TopologyViewport;
  occupied: EditableSectorGeometry[];
}): ClosedGapCandidate[] {
  return scanClosedGaps(input).candidates;
}

export function findClosedGapAtPoint(input: {
  point: DraftPosition;
  viewport: TopologyViewport;
  occupied: EditableSectorGeometry[];
}): TopologyOperationResult {
  const relevantOccupied = input.occupied
    .filter((geometry) => {
      const bounds = geometryBounds(geometry);
      return bounds ? boundsIntersect(bounds, input.viewport) : false;
    })
    .map(geometryToMultiPolygon)
    .filter((geometry) => geometry.length);
  const occupiedUnion = relevantOccupied.length
    ? polygonClipping.union(relevantOccupied[0], ...relevantOccupied.slice(1))
    : [];
  if (occupiedUnion.some((polygon) => polygonContainsPoint(polygon, input.point))) {
    throw new Error("点击位置已被现有板块覆盖，不是空白区域");
  }
  const freeSpace = occupiedUnion.length
    ? polygonClipping.difference(viewportPolygon(input.viewport), occupiedUnion)
    : [viewportPolygon(input.viewport)];
  const selected = freeSpace.find((polygon) => polygonContainsPoint(polygon, input.point));
  if (!selected) throw new Error("没有找到点击位置对应的空白区域");
  if (touchesViewport(selected, input.viewport)) {
    throw new Error("该空白连接到当前视口外部，尚未形成可认领的闭合区域");
  }
  const geometry = multiPolygonToGeometry([selected]);
  const areaSquareMeters = localAreaSquareMeters([selected]);
  if (areaSquareMeters < 100) {
    throw new Error("闭合空白小于 100 m²，可能只是坐标误差或狭缝");
  }
  return {
    target: geometry,
    changedSector: "target",
    areaSquareMeters,
  };
}

function requireGeometry(
  multiPolygon: MultiPolygon,
  message: string,
): EditableSectorGeometry {
  if (!multiPolygon.length) throw new Error(message);
  return multiPolygonToGeometry(multiPolygon);
}

export function applyPairTopologyOperation(input: {
  target: EditableSectorGeometry;
  neighbor: EditableSectorGeometry;
  operation: PairTopologyOperation;
}): TopologyOperationResult {
  const target = geometryToMultiPolygon(input.target);
  const neighbor = geometryToMultiPolygon(input.neighbor);
  if (!target.length || !neighbor.length) {
    throw new Error("成对拓扑操作要求两块板块都已有边界");
  }
  if (!polygonClipping.intersection(target, neighbor).length) {
    throw new Error("当前板块与所选邻块没有重叠，不需要执行取差集");
  }
  if (input.operation === "target-wins") {
    const nextNeighbor = polygonClipping.difference(neighbor, target);
    return {
      target: input.target,
      neighbor: requireGeometry(nextNeighbor, "当前板块会完全吞并所选邻块，已拒绝操作"),
      changedSector: "neighbor",
      areaSquareMeters: localAreaSquareMeters(target),
    };
  }
  const nextTarget = polygonClipping.difference(target, neighbor);
  return {
    target: requireGeometry(nextTarget, "所选邻块会完全覆盖当前板块，已拒绝操作"),
    neighbor: input.neighbor,
    changedSector: "target",
    areaSquareMeters: localAreaSquareMeters(nextTarget),
  };
}

export interface PairSharedEdgeSession {
  domain: MultiPolygon;
}

export function createPairSharedEdgeSession(input: {
  target: EditableSectorGeometry;
  neighbor: EditableSectorGeometry;
}): PairSharedEdgeSession {
  const target = geometryToMultiPolygon(input.target);
  const neighbor = geometryToMultiPolygon(input.neighbor);
  if (!target.length || !neighbor.length) {
    throw new Error("共享边联动要求两块板块都已有边界");
  }
  const domain = polygonClipping.union(target, neighbor);
  if (domain.length !== 1) {
    throw new Error("两块板块尚未连接，不能开启共享边联动");
  }
  return { domain };
}

export function applySharedEdgeEdit(input: {
  session: PairSharedEdgeSession;
  editedTarget: EditableSectorGeometry;
}): TopologyOperationResult {
  const editedTarget = geometryToMultiPolygon(input.editedTarget);
  const targetInsideDomain = polygonClipping.intersection(
    editedTarget,
    input.session.domain,
  );
  if (!targetInsideDomain.length) {
    throw new Error("修改后的当前板块已离开原有两板块联合范围");
  }
  const neighbor = polygonClipping.difference(
    input.session.domain,
    targetInsideDomain,
  );
  return {
    target: requireGeometry(targetInsideDomain, "修改后当前板块为空"),
    neighbor: requireGeometry(neighbor, "修改后邻块为空，已拒绝联动"),
    changedSector: "both",
    areaSquareMeters: localAreaSquareMeters(targetInsideDomain),
  };
}
