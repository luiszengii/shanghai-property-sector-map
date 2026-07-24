import type { SectorGeometry } from "@/src/types/map";

type Position = [number, number];

function squaredDistanceToSegment(point: Position, start: Position, end: Position) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyOpenLine(points: Position[], squaredTolerance: number): Position[] {
  if (points.length <= 2) return points;

  let furthestIndex = 0;
  let furthestDistance = squaredTolerance;
  const first = points[0];
  const last = points[points.length - 1];

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredDistanceToSegment(points[index], first, last);
    if (distance > furthestDistance) {
      furthestIndex = index;
      furthestDistance = distance;
    }
  }

  if (furthestIndex === 0) return [first, last];
  const left: Position[] = simplifyOpenLine(
    points.slice(0, furthestIndex + 1),
    squaredTolerance,
  );
  const right: Position[] = simplifyOpenLine(
    points.slice(furthestIndex),
    squaredTolerance,
  );
  return [...left.slice(0, -1), ...right];
}

function simplifyRing(ring: number[][], tolerance: number) {
  if (ring.length <= 5 || tolerance <= 0) return ring;
  const points = ring.map(([lng, lat]) => [lng, lat] as Position);
  const isClosed = points[0][0] === points.at(-1)?.[0]
    && points[0][1] === points.at(-1)?.[1];
  const openPoints = isClosed ? points.slice(0, -1) : points;
  if (openPoints.length <= 4) return ring;

  // Rotate the ring so the simplifier does not receive identical start/end points.
  let pivot = 1;
  for (let index = 2; index < openPoints.length; index += 1) {
    if (openPoints[index][0] < openPoints[pivot][0]) pivot = index;
  }
  const rotated = [...openPoints.slice(pivot), ...openPoints.slice(0, pivot + 1)];
  const simplified = simplifyOpenLine(rotated, tolerance * tolerance);
  if (simplified.length < 4) return ring;
  return [...simplified, simplified[0]];
}

/**
 * Render-only simplification. The source GeoJSON remains unchanged and is still
 * used by the editor and data checks.
 */
export function simplifySectorGeometryForDisplay(
  geometry: SectorGeometry,
  tolerance = 0.00008,
): SectorGeometry {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) => simplifyRing(ring, tolerance)),
    };
  }
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((polygon) => (
      polygon.map((ring) => simplifyRing(ring, tolerance))
    )),
  };
}
