import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function readCandidateDefinitions(relativePath) {
  const definitions = readJson(relativePath);
  const merged = {
    ...definitions,
    topologyGroups: [...(definitions.topologyGroups ?? [])],
    sectors: [...(definitions.sectors ?? [])],
    subscopes: [...(definitions.subscopes ?? [])],
  };
  for (const batchFile of definitions.batchFiles ?? []) {
    const batchPath = path.resolve(repoRoot, batchFile);
    if (!batchPath.startsWith(`${repoRoot}${path.sep}`) || !fs.existsSync(batchPath)) {
      throw new Error(`候选批次文件无效：${batchFile}`);
    }
    const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
    merged.topologyGroups.push(...(batch.topologyGroups ?? []));
    merged.sectors.push(...(batch.sectors ?? []));
    merged.subscopes.push(...(batch.subscopes ?? []));
  }
  return merged;
}

const bundledGeometry = readJson("src/data/sectors.json");
const sourceGeometry = readJson("src/data/sectors.geojson");
const registryData = readJson("src/data/sectors/registry.json");
const sourceData = readJson("src/data/sectors/sources.json");
const evidenceData = readJson("src/data/sectors/boundary-evidence.json");
const candidateData = readJson("src/data/sectors/reviewed-candidates.wgs84.json");
const candidateManifest = readJson("src/data/sectors/reviewed-candidates.manifest.json");
const subscopeData = readJson("src/data/sectors/subscopes.wgs84.json");
const adminReferenceData = readJson("src/data/sectors/admin-references.wgs84.json");
const adminReferenceManifest = readJson("src/data/sectors/admin-references.manifest.json");
const adminReferenceDefinitionsData = readJson("data/geo/admin-reference-definitions.json");
const candidateDefinitionsData = readCandidateDefinitions(
  "data/geo/reviewed-candidate-definitions.json",
);
const referenceChecksData = readJson("src/data/sectors/reference-checks.json");
const osmSourceLock = readJson("data/geo/sources/osm-shanghai-260721.json");

const errors = [];
const warnings = [];
const error = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function samePoint(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

function signedRingArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point, start, end) {
  const epsilon = 1e-14;
  if (Math.abs(cross(start, end, point)) > epsilon) return false;
  return point[0] >= Math.min(start[0], end[0]) - epsilon
    && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon
    && point[1] <= Math.max(start[1], end[1]) + epsilon;
}

function segmentsProperlyIntersect(a, b, c, d) {
  const epsilon = 1e-14;
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
}

function segmentsIntersect(a, b, c, d) {
  return segmentsProperlyIntersect(a, b, c, d)
    || pointOnSegment(a, c, d)
    || pointOnSegment(b, c, d)
    || pointOnSegment(c, a, b)
    || pointOnSegment(d, a, b);
}

function compactRing(ring) {
  const compacted = [];
  for (const point of ring) {
    if (!samePoint(compacted.at(-1), point)) compacted.push(point);
  }
  return compacted;
}

function pointOnRing(point, ring) {
  for (let index = 0; index < ring.length - 1; index += 1) {
    if (pointOnSegment(point, ring[index], ring[index + 1])) return true;
  }
  return false;
}

function pointInRingStrict(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return false;
    const intersects = (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1])
      && point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
        / (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function hasSelfIntersection(ring) {
  const compactedRing = compactRing(ring);
  const segmentCount = compactedRing.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      const adjacent = Math.abs(first - second) <= 1 || (first === 0 && second === segmentCount - 1);
      if (adjacent) continue;
      if (segmentsIntersect(
        compactedRing[first],
        compactedRing[first + 1],
        compactedRing[second],
        compactedRing[second + 1],
      )) return true;
    }
  }
  return false;
}

function ringsIntersectOrTouch(first, second) {
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      if (segmentsIntersect(
        first[firstIndex],
        first[firstIndex + 1],
        second[secondIndex],
        second[secondIndex + 1],
      )) return true;
    }
  }
  return false;
}

function ringsOverlapOrTouch(first, second) {
  return ringsIntersectOrTouch(first, second)
    || pointInRingStrict(first[0], second)
    || pointInRingStrict(second[0], first);
}

function polygonsOverlapOrTouch(first, second) {
  for (const firstRing of first) {
    for (const secondRing of second) {
      if (ringsIntersectOrTouch(firstRing, secondRing)) return true;
    }
  }
  return pointInPolygonStrict(first[0][0], second)
    || pointInPolygonStrict(second[0][0], first);
}

function ringsOverlap(first, second) {
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      if (segmentsProperlyIntersect(
        first[firstIndex],
        first[firstIndex + 1],
        second[secondIndex],
        second[secondIndex + 1],
      )) return true;
    }
  }
  return first.slice(0, -1).some((point) => pointInRingStrict(point, second))
    || second.slice(0, -1).some((point) => pointInRingStrict(point, first));
}

function normalizedJson(value) {
  return JSON.stringify(value);
}

function normalizedStringSet(values) {
  return normalizedJson([...values].sort());
}

function assertConnectedSharedEdgeBatch({
  ids,
  pairs,
  expectedPairCount,
  label,
}) {
  if (pairs.size !== expectedPairCount) {
    error(`${label}应有 ${expectedPairCount} 组内部共享边，实际 ${pairs.size} 组`);
  }
  const adjacency = new Map([...ids].map((sectorId) => [sectorId, new Set()]));
  for (const pair of pairs) {
    const [firstId, secondId] = pair.split("/");
    adjacency.get(firstId)?.add(secondId);
    adjacency.get(secondId)?.add(firstId);
  }
  const visited = new Set();
  const queue = [[...ids][0]];
  while (queue.length > 0) {
    const sectorId = queue.shift();
    if (visited.has(sectorId)) continue;
    visited.add(sectorId);
    queue.push(...(adjacency.get(sectorId) ?? []));
  }
  if (visited.size !== ids.size) {
    error(`${label}共享边图必须全连通，实际连通 ${visited.size}/${ids.size}`);
  }
}

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function nearlyEqual(first, second, tolerance = 1e-9) {
  return Number.isFinite(first) && Number.isFinite(second) && Math.abs(first - second) <= tolerance;
}

function polygonGroupsForGeometry(geometry) {
  if (geometry?.type === "Polygon" && Array.isArray(geometry.coordinates)) return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  return [];
}

function pointInPolygonStrict(point, polygon) {
  const outerRing = polygon?.[0];
  if (!outerRing || !pointInRingStrict(point, outerRing)) return false;
  return !polygon.slice(1).some((hole) => pointOnRing(point, hole) || pointInRingStrict(point, hole));
}

function pointInGeometryStrict(point, geometry) {
  return polygonGroupsForGeometry(geometry).some((polygon) => pointInPolygonStrict(point, polygon));
}

function geometryPointCount(geometry) {
  return polygonGroupsForGeometry(geometry)
    .filter(Array.isArray)
    .flatMap((polygon) => polygon)
    .reduce((total, ring) => total + (Array.isArray(ring) ? ring.length : 0), 0);
}

const meanEarthRadiusMeters = 6_371_008.8;

function sphericalRingAreaSquareMeters(ring) {
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const first = ring[index];
    const second = ring[index + 1];
    if (!Array.isArray(first) || !Array.isArray(second)
      || first.length < 2 || second.length < 2
      || !first.slice(0, 2).every(Number.isFinite)
      || !second.slice(0, 2).every(Number.isFinite)) return Number.NaN;
    const [longitude1, latitude1] = first;
    const [longitude2, latitude2] = second;
    const longitude1Radians = longitude1 * Math.PI / 180;
    const longitude2Radians = longitude2 * Math.PI / 180;
    const latitude1Radians = latitude1 * Math.PI / 180;
    const latitude2Radians = latitude2 * Math.PI / 180;
    total += (longitude2Radians - longitude1Radians)
      * (2 + Math.sin(latitude1Radians) + Math.sin(latitude2Radians));
  }
  return Math.abs(total * meanEarthRadiusMeters * meanEarthRadiusMeters / 2);
}

function geometryAreaSquareKilometers(geometry) {
  const areaSquareMeters = polygonGroupsForGeometry(geometry).filter(Array.isArray).reduce((total, polygon) => {
    const outerArea = polygon[0] ? sphericalRingAreaSquareMeters(polygon[0]) : 0;
    const holeArea = polygon.slice(1).filter(Array.isArray)
      .reduce((sum, ring) => sum + sphericalRingAreaSquareMeters(ring), 0);
    return total + Math.max(0, outerArea - holeArea);
  }, 0);
  return areaSquareMeters / 1_000_000;
}

function segmentSharedLengthMeters(
  firstStart,
  firstEnd,
  secondStart,
  secondEnd,
  {
    directionTolerance = 1e-8,
    distanceToleranceMeters = 0.05,
  } = {},
) {
  const firstVector = [
    firstEnd[0] - firstStart[0],
    firstEnd[1] - firstStart[1],
  ];
  const secondVector = [
    secondEnd[0] - secondStart[0],
    secondEnd[1] - secondStart[1],
  ];
  const firstLength = Math.hypot(...firstVector);
  const secondLength = Math.hypot(...secondVector);
  if (firstLength < 0.001 || secondLength < 0.001) return 0;

  const directionCross = Math.abs(
    firstVector[0] * secondVector[1] - firstVector[1] * secondVector[0],
  );
  if (directionCross / (firstLength * secondLength) > directionTolerance) return 0;
  const distanceToFirstLine = (point) => Math.abs(
    firstVector[0] * (point[1] - firstStart[1])
    - firstVector[1] * (point[0] - firstStart[0]),
  ) / firstLength;
  if (distanceToFirstLine(secondStart) > distanceToleranceMeters
    || distanceToFirstLine(secondEnd) > distanceToleranceMeters) return 0;

  const project = (point) => (
    (point[0] - firstStart[0]) * firstVector[0]
    + (point[1] - firstStart[1]) * firstVector[1]
  ) / firstLength;
  const secondStartOffset = project(secondStart);
  const secondEndOffset = project(secondEnd);
  const overlapStart = Math.max(0, Math.min(secondStartOffset, secondEndOffset));
  const overlapEnd = Math.min(firstLength, Math.max(secondStartOffset, secondEndOffset));
  return Math.max(0, overlapEnd - overlapStart);
}

function sharedBoundaryLengthMeters(firstGeometry, secondGeometry, options = {}) {
  const firstRings = polygonGroupsForGeometry(firstGeometry)
    .map((polygon) => polygon[0]?.map(projectWgs84ToComparisonPlane))
    .filter(Boolean);
  const secondRings = polygonGroupsForGeometry(secondGeometry)
    .map((polygon) => polygon[0]?.map(projectWgs84ToComparisonPlane))
    .filter(Boolean);
  let total = 0;
  for (const firstRing of firstRings) {
    for (const secondRing of secondRings) {
      for (let first = 0; first < firstRing.length - 1; first += 1) {
        for (let second = 0; second < secondRing.length - 1; second += 1) {
          total += segmentSharedLengthMeters(
            firstRing[first],
            firstRing[first + 1],
            secondRing[second],
            secondRing[second + 1],
            options,
          );
        }
      }
    }
  }
  return total;
}

function sharedBoundaryLengthMetersIncludingHoles(
  firstGeometry,
  secondGeometry,
  options = {},
) {
  const allProjectedRings = (geometry) => polygonGroupsForGeometry(geometry)
    .flatMap((polygon) => polygon)
    .map((ring) => ring.map(projectWgs84ToComparisonPlane));
  const firstRings = allProjectedRings(firstGeometry);
  const secondRings = allProjectedRings(secondGeometry);
  let total = 0;
  for (const firstRing of firstRings) {
    for (const secondRing of secondRings) {
      for (let first = 0; first < firstRing.length - 1; first += 1) {
        for (let second = 0; second < secondRing.length - 1; second += 1) {
          total += segmentSharedLengthMeters(
            firstRing[first],
            firstRing[first + 1],
            secondRing[second],
            secondRing[second + 1],
            options,
          );
        }
      }
    }
  }
  return total;
}

function exactSharedBoundaryLengthMeters(firstGeometry, secondGeometry) {
  const segmentMap = (geometry) => {
    const segments = new Map();
    for (const polygon of polygonGroupsForGeometry(geometry)) {
      const ring = polygon[0] ?? [];
      for (let index = 0; index < ring.length - 1; index += 1) {
        const start = ring[index];
        const end = ring[index + 1];
        const startKey = JSON.stringify(start);
        const endKey = JSON.stringify(end);
        const key = startKey < endKey
          ? `${startKey}/${endKey}`
          : `${endKey}/${startKey}`;
        const projectedStart = projectWgs84ToComparisonPlane(start);
        const projectedEnd = projectWgs84ToComparisonPlane(end);
        segments.set(key, Math.hypot(
          projectedEnd[0] - projectedStart[0],
          projectedEnd[1] - projectedStart[1],
        ));
      }
    }
    return segments;
  };
  const firstSegments = segmentMap(firstGeometry);
  const secondSegments = segmentMap(secondGeometry);
  let total = 0;
  for (const [key, length] of firstSegments) {
    if (secondSegments.has(key)) total += length;
  }
  return total;
}

function exactSharedBoundaryLengthMetersIncludingHoles(firstGeometry, secondGeometry) {
  const segmentMap = (geometry) => {
    const segments = new Map();
    for (const polygon of polygonGroupsForGeometry(geometry)) {
      for (const ring of polygon) {
        for (let index = 0; index < ring.length - 1; index += 1) {
          const start = ring[index];
          const end = ring[index + 1];
          const startKey = JSON.stringify(start);
          const endKey = JSON.stringify(end);
          const key = startKey < endKey
            ? `${startKey}/${endKey}`
            : `${endKey}/${startKey}`;
          const projectedStart = projectWgs84ToComparisonPlane(start);
          const projectedEnd = projectWgs84ToComparisonPlane(end);
          segments.set(key, Math.hypot(
            projectedEnd[0] - projectedStart[0],
            projectedEnd[1] - projectedStart[1],
          ));
        }
      }
    }
    return segments;
  };
  const firstSegments = segmentMap(firstGeometry);
  const secondSegments = segmentMap(secondGeometry);
  let total = 0;
  for (const [key, length] of firstSegments) {
    if (secondSegments.has(key)) total += length;
  }
  return total;
}

function ringLengthMeters(ring) {
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = projectWgs84ToComparisonPlane(ring[index]);
    const end = projectWgs84ToComparisonPlane(ring[index + 1]);
    total += Math.hypot(end[0] - start[0], end[1] - start[1]);
  }
  return total;
}

function geometrySha256(geometry) {
  return createHash("sha256")
    .update(JSON.stringify(geometry))
    .digest("hex");
}

const comparisonMetricMethod = {
  version: "legacy-gcj02-assumed-to-wgs84-local-plane-v1",
  legacyCoordinateSystem: "GCJ-02-assumed",
  referenceCoordinateSystem: "WGS84",
  normalization: {
    type: "iterative_inverse_gcj02_to_wgs84",
    maxIterations: 12,
    toleranceDegrees: 1e-12,
  },
  projection: {
    type: "local_equirectangular",
    center: [121.4737, 31.2304],
    earthRadiusMeters: meanEarthRadiusMeters,
  },
  rounding: {
    intersectionOverUnion: 3,
    referenceCoveredPercent: 1,
    legacyAreaRatio: 2,
    centroidDistanceKilometers: 2,
  },
};

const gcjSemiMajorAxis = 6_378_245;
const gcjEccentricitySquared = 0.006693421622965943;

function isOutsideGcj02Coverage(longitude, latitude) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function gcjLatitudeTransform(x, y) {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  value += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  value += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return value;
}

function gcjLongitudeTransform(x, y) {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  value += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  value += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return value;
}

function wgs84ToGcj02([longitude, latitude]) {
  if (isOutsideGcj02Coverage(longitude, latitude)) return [longitude, latitude];
  let latitudeDelta = gcjLatitudeTransform(longitude - 105, latitude - 35);
  let longitudeDelta = gcjLongitudeTransform(longitude - 105, latitude - 35);
  const latitudeRadians = latitude * Math.PI / 180;
  let magic = Math.sin(latitudeRadians);
  magic = 1 - gcjEccentricitySquared * magic * magic;
  const squareRootMagic = Math.sqrt(magic);
  latitudeDelta = latitudeDelta * 180
    / ((gcjSemiMajorAxis * (1 - gcjEccentricitySquared)) / (magic * squareRootMagic) * Math.PI);
  longitudeDelta = longitudeDelta * 180
    / (gcjSemiMajorAxis / squareRootMagic * Math.cos(latitudeRadians) * Math.PI);
  return [longitude + longitudeDelta, latitude + latitudeDelta];
}

function gcj02ToWgs84([longitude, latitude]) {
  if (isOutsideGcj02Coverage(longitude, latitude)) return [longitude, latitude];
  let estimatedLongitude = longitude;
  let estimatedLatitude = latitude;
  for (let iteration = 0; iteration < comparisonMetricMethod.normalization.maxIterations; iteration += 1) {
    const [convertedLongitude, convertedLatitude] = wgs84ToGcj02([
      estimatedLongitude,
      estimatedLatitude,
    ]);
    const longitudeDelta = convertedLongitude - longitude;
    const latitudeDelta = convertedLatitude - latitude;
    estimatedLongitude -= longitudeDelta;
    estimatedLatitude -= latitudeDelta;
    if (Math.max(Math.abs(longitudeDelta), Math.abs(latitudeDelta))
      < comparisonMetricMethod.normalization.toleranceDegrees) break;
  }
  return [estimatedLongitude, estimatedLatitude];
}

function projectWgs84ToComparisonPlane([longitude, latitude]) {
  const [centerLongitude, centerLatitude] = comparisonMetricMethod.projection.center;
  const longitudeScale = Math.cos(centerLatitude * Math.PI / 180);
  return [
    comparisonMetricMethod.projection.earthRadiusMeters
      * (longitude - centerLongitude) * Math.PI / 180 * longitudeScale,
    comparisonMetricMethod.projection.earthRadiusMeters
      * (latitude - centerLatitude) * Math.PI / 180,
  ];
}

function openCompactedRing(ring) {
  const points = compactRing(ring);
  if (samePoint(points[0], points.at(-1))) points.pop();
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length];
      const current = points[index];
      const next = points[(index + 1) % points.length];
      if (Math.abs(cross(previous, current, next)) <= 1e-7) {
        points.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return points;
}

function signedOpenRingArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

function pointInTriangleInclusive(point, first, second, third) {
  const epsilon = 1e-7;
  return cross(first, second, point) >= -epsilon
    && cross(second, third, point) >= -epsilon
    && cross(third, first, point) >= -epsilon;
}

function triangulateSimpleRing(ring, label) {
  const points = openCompactedRing(ring);
  if (points.length < 3) throw new Error(`${label} 缺少可三角化的顶点`);
  if (signedOpenRingArea(points) < 0) points.reverse();
  const indices = points.map((_, index) => index);
  const triangles = [];
  while (indices.length > 3) {
    let clipped = false;
    for (let cursor = 0; cursor < indices.length; cursor += 1) {
      const previousIndex = indices[(cursor - 1 + indices.length) % indices.length];
      const currentIndex = indices[cursor];
      const nextIndex = indices[(cursor + 1) % indices.length];
      const triangle = [points[previousIndex], points[currentIndex], points[nextIndex]];
      if (cross(...triangle) <= 1e-7) continue;
      const containsOtherPoint = indices.some((candidateIndex) => (
        candidateIndex !== previousIndex
        && candidateIndex !== currentIndex
        && candidateIndex !== nextIndex
        && pointInTriangleInclusive(points[candidateIndex], ...triangle)
      ));
      if (containsOtherPoint) continue;
      triangles.push(triangle);
      indices.splice(cursor, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error(`${label} 三角化失败`);
  }
  triangles.push(indices.map((index) => points[index]));
  return triangles;
}

function lineIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDirection = [firstEnd[0] - firstStart[0], firstEnd[1] - firstStart[1]];
  const secondDirection = [secondEnd[0] - secondStart[0], secondEnd[1] - secondStart[1]];
  const denominator = firstDirection[0] * secondDirection[1]
    - firstDirection[1] * secondDirection[0];
  if (Math.abs(denominator) <= 1e-12) return firstEnd;
  const offset = [secondStart[0] - firstStart[0], secondStart[1] - firstStart[1]];
  const scale = (offset[0] * secondDirection[1] - offset[1] * secondDirection[0]) / denominator;
  return [
    firstStart[0] + scale * firstDirection[0],
    firstStart[1] + scale * firstDirection[1],
  ];
}

function clipConvexPolygon(subject, clipPolygon) {
  let output = subject;
  const epsilon = 1e-7;
  for (let edgeIndex = 0; edgeIndex < clipPolygon.length; edgeIndex += 1) {
    const clipStart = clipPolygon[edgeIndex];
    const clipEnd = clipPolygon[(edgeIndex + 1) % clipPolygon.length];
    const input = output;
    output = [];
    if (input.length === 0) break;
    let previous = input.at(-1);
    let previousInside = cross(clipStart, clipEnd, previous) >= -epsilon;
    for (const current of input) {
      const currentInside = cross(clipStart, clipEnd, current) >= -epsilon;
      if (currentInside !== previousInside) {
        output.push(lineIntersection(previous, current, clipStart, clipEnd));
      }
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }
  }
  return output;
}

function simplePolygonIntersectionArea(firstRing, secondRing, label) {
  const firstTriangles = triangulateSimpleRing(firstRing, `${label} 旧演示面`);
  const secondTriangles = triangulateSimpleRing(secondRing, `${label} 参考面`);
  let area = 0;
  for (const firstTriangle of firstTriangles) {
    for (const secondTriangle of secondTriangles) {
      const intersection = clipConvexPolygon(firstTriangle, secondTriangle);
      if (intersection.length >= 3) area += Math.abs(signedOpenRingArea(intersection));
    }
  }
  return area;
}

function simplePolygonCentroid(ring, label) {
  const points = openCompactedRing(ring);
  const signedArea = signedOpenRingArea(points);
  if (Math.abs(signedArea) <= 1e-7) throw new Error(`${label} 面积为零`);
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const factor = current[0] * next[1] - next[0] * current[1];
    x += (current[0] + next[0]) * factor;
    y += (current[1] + next[1]) * factor;
  }
  return [x / (6 * signedArea), y / (6 * signedArea)];
}

function comparisonRings(geometry, coordinateTransform, label) {
  const polygons = polygonGroupsForGeometry(geometry);
  if (polygons.length === 0) throw new Error(`${label} 缺少 Polygon 或 MultiPolygon 几何`);
  return polygons.flatMap((polygon, polygonIndex) => polygon.map((ring, ringIndex) => ({
    label: `${label} polygon ${polygonIndex + 1} ${ringIndex === 0 ? "外环" : `内环 ${ringIndex}`}`,
    sign: ringIndex === 0 ? 1 : -1,
    ring: ring.map(coordinateTransform).map(projectWgs84ToComparisonPlane),
  })));
}

function signedRingsArea(rings) {
  return rings.reduce(
    (total, item) => total + item.sign * Math.abs(signedOpenRingArea(openCompactedRing(item.ring))),
    0,
  );
}

function signedRingsCentroid(rings, label) {
  let weightedX = 0;
  let weightedY = 0;
  let totalArea = 0;
  for (const item of rings) {
    const area = Math.abs(signedOpenRingArea(openCompactedRing(item.ring)));
    const centroid = simplePolygonCentroid(item.ring, item.label);
    const signedArea = item.sign * area;
    totalArea += signedArea;
    weightedX += centroid[0] * signedArea;
    weightedY += centroid[1] * signedArea;
  }
  if (totalArea <= 1e-7) throw new Error(`${label} 面积为零或内环无效`);
  return [weightedX / totalArea, weightedY / totalArea];
}

function signedRingsIntersectionArea(firstRings, secondRings, label) {
  // Ring signs apply inclusion-exclusion, so holes and disjoint MultiPolygon parts
  // use the same triangle-intersection primitive as simple Polygon geometry.
  let area = 0;
  for (const first of firstRings) {
    for (const second of secondRings) {
      area += first.sign * second.sign
        * simplePolygonIntersectionArea(first.ring, second.ring, `${label} ${first.label} × ${second.label}`);
    }
  }
  return area;
}

function polygonComparisonRings(polygon, label) {
  return polygon.map((ring, ringIndex) => ({
    label: `${label} ${ringIndex === 0 ? "外环" : `内环 ${ringIndex}`}`,
    sign: ringIndex === 0 ? 1 : -1,
    ring: ring.map(projectWgs84ToComparisonPlane),
  }));
}

function polygonsHaveAreaOverlap(first, second, label) {
  const firstRings = polygonComparisonRings(first, `${label} 第一面`);
  const secondRings = polygonComparisonRings(second, `${label} 第二面`);
  const intersectionArea = signedRingsIntersectionArea(firstRings, secondRings, label);
  if (!Number.isFinite(intersectionArea) || intersectionArea < -0.01) {
    throw new Error(`${label} 相交面积计算无效：${intersectionArea}`);
  }
  return intersectionArea > 0.01;
}

function roundedMetric(value, digits) {
  return Number(value.toFixed(digits));
}

function computeLegacyGeometryComparison(legacyFeature, referenceFeature, label) {
  const legacyRings = comparisonRings(legacyFeature.geometry, gcj02ToWgs84, `${label} 旧演示面`);
  const referenceRings = comparisonRings(
    referenceFeature.geometry,
    (coordinate) => coordinate,
    `${label} 参考面`,
  );
  const legacyArea = signedRingsArea(legacyRings);
  const referenceArea = signedRingsArea(referenceRings);
  const intersectionArea = signedRingsIntersectionArea(legacyRings, referenceRings, label);
  const unionArea = legacyArea + referenceArea - intersectionArea;
  if (![legacyArea, referenceArea, intersectionArea, unionArea].every(Number.isFinite)
    || legacyArea <= 0 || referenceArea <= 0 || intersectionArea < 0 || unionArea <= 0
    || intersectionArea > Math.min(legacyArea, referenceArea) + 0.01) {
    throw new Error(`${label} 差异指标面积关系无效`);
  }
  const legacyCentroid = signedRingsCentroid(legacyRings, `${label} 旧演示面`);
  const referenceCentroid = signedRingsCentroid(referenceRings, `${label} 参考面`);
  const centroidDistanceMeters = Math.hypot(
    legacyCentroid[0] - referenceCentroid[0],
    legacyCentroid[1] - referenceCentroid[1],
  );
  const rounding = comparisonMetricMethod.rounding;
  return {
    intersectionOverUnion: roundedMetric(intersectionArea / unionArea, rounding.intersectionOverUnion),
    referenceCoveredPercent: roundedMetric(
      intersectionArea / referenceArea * 100,
      rounding.referenceCoveredPercent,
    ),
    legacyAreaRatio: roundedMetric(legacyArea / referenceArea, rounding.legacyAreaRatio),
    centroidDistanceKilometers: roundedMetric(
      centroidDistanceMeters / 1_000,
      rounding.centroidDistanceKilometers,
    ),
  };
}

function validateWgs84PolygonalGeometry(feature, label, labelPoint) {
  if (feature?.type !== "Feature") error(`${label}: type 必须为 Feature`);
  const polygonGroups = polygonGroupsForGeometry(feature?.geometry);
  if (polygonGroups.length === 0) {
    error(`${label}: 几何必须是 Polygon 或 MultiPolygon`);
    return;
  }

  let geometryCoordinatesAreValid = true;
  for (const [polygonIndex, polygon] of polygonGroups.entries()) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      error(`${label}: 第 ${polygonIndex + 1} 个 polygon 缺少外环`);
      geometryCoordinatesAreValid = false;
      continue;
    }
    for (const [ringIndex, ring] of polygon.entries()) {
      const ringLabel = `${label}: polygon ${polygonIndex + 1} ${ringIndex === 0 ? "外环" : `内环 ${ringIndex}`}`;
      if (!Array.isArray(ring) || ring.length < 4) {
        error(`${ringLabel} 至少需要 4 个坐标点`);
        geometryCoordinatesAreValid = false;
        continue;
      }
      let coordinatesAreValid = true;
      if (!samePoint(ring[0], ring.at(-1))) {
        error(`${ringLabel} 未闭合`);
        coordinatesAreValid = false;
        geometryCoordinatesAreValid = false;
      }
      for (const coordinate of ring) {
        if (!Array.isArray(coordinate) || coordinate.length < 2) {
          error(`${ringLabel} 存在无效坐标`);
          coordinatesAreValid = false;
          geometryCoordinatesAreValid = false;
          continue;
        }
        const [longitude, latitude] = coordinate;
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
          error(`${ringLabel} 存在非数字坐标`);
          coordinatesAreValid = false;
          geometryCoordinatesAreValid = false;
        } else if (longitude < 120.8 || longitude > 122.2 || latitude < 30.6 || latitude > 31.9) {
          error(`${ringLabel} 坐标超出上海合理范围 ${longitude},${latitude}`);
        }
      }
      if (coordinatesAreValid) {
        if (hasSelfIntersection(ring)) {
          error(`${ringLabel} 自相交或自接触`);
          geometryCoordinatesAreValid = false;
        }
        const ringDirection = signedRingArea(ring);
        if (ringIndex === 0 && ringDirection <= 0) error(`${ringLabel} 必须按 RFC 7946 使用逆时针方向`);
        if (ringIndex > 0 && ringDirection >= 0) error(`${ringLabel} 必须按 RFC 7946 使用顺时针方向`);
      }
    }
  }

  if (geometryCoordinatesAreValid) {
    for (const [polygonIndex, polygon] of polygonGroups.entries()) {
      const [outerRing, ...holes] = polygon;
      for (const [holeIndex, hole] of holes.entries()) {
        if (ringsIntersectOrTouch(outerRing, hole)
          || !hole.slice(0, -1).every((point) => pointInRingStrict(point, outerRing))) {
          error(`${label}: polygon ${polygonIndex + 1} 内环 ${holeIndex + 1} 不严格位于外环内`);
        }
      }
      for (let firstHole = 0; firstHole < holes.length; firstHole += 1) {
        for (let secondHole = firstHole + 1; secondHole < holes.length; secondHole += 1) {
          if (ringsOverlapOrTouch(holes[firstHole], holes[secondHole])) {
            error(`${label}: polygon ${polygonIndex + 1} 的内环互相重叠或接触`);
          }
        }
      }
    }
    for (let firstPolygon = 0; firstPolygon < polygonGroups.length; firstPolygon += 1) {
      for (let secondPolygon = firstPolygon + 1; secondPolygon < polygonGroups.length; secondPolygon += 1) {
        if (polygonsOverlapOrTouch(polygonGroups[firstPolygon], polygonGroups[secondPolygon])) {
          error(`${label}: MultiPolygon 的组成面互相重叠或接触`);
        }
      }
    }
  }

  if (!Array.isArray(labelPoint) || labelPoint.length !== 2 || !labelPoint.every(Number.isFinite)) {
    error(`${label}: labelPoint 必须是二元数值坐标`);
  } else if (labelPoint[0] < 120.8 || labelPoint[0] > 122.2 || labelPoint[1] < 30.6 || labelPoint[1] > 31.9) {
    error(`${label}: labelPoint 超出上海合理范围 ${labelPoint[0]},${labelPoint[1]}`);
  } else if (geometryCoordinatesAreValid && !pointInGeometryStrict(labelPoint, feature.geometry)) {
    error(`${label}: labelPoint 不在面内`);
  }
}

function validateAndGetHostname(url, label) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLocaleLowerCase("en-US").replace(/\.+$/, "");
    if (!["http:", "https:"].includes(parsedUrl.protocol) || hostname.length === 0) {
      error(`${label}: URL 必须是带域名的 HTTP(S) 地址 ${url}`);
      return undefined;
    }
    return hostname;
  } catch {
    error(`${label}: URL 无效 ${url}`);
    return undefined;
  }
}

function validateLockedOsmCollection(collection, manifest, label, expectedStatus) {
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    error(`${label}必须是 GeoJSON FeatureCollection`);
  }
  if (collection.status !== expectedStatus) error(`${label}status 必须是 ${expectedStatus}`);
  if (collection.license !== "ODbL-1.0" || !collection.attribution?.includes("OpenStreetMap")) {
    error(`${label}缺少 ODbL 许可或 OpenStreetMap 署名`);
  }
  if (collection.sourceSnapshotId !== osmSourceLock.id) error(`${label}sourceSnapshotId 与锁定来源不一致`);
  if (manifest.sourceSnapshotId !== osmSourceLock.id) error(`${label}manifest 的 sourceSnapshotId 与来源锁不一致`);
  if (manifest.sourceGpkgSha256 !== osmSourceLock.gpkgSha256) {
    error(`${label}manifest 的 GeoPackage SHA-256 与来源锁不一致`);
  }
  if (manifest.sourceLock !== "data/geo/sources/osm-shanghai-260721.json") {
    error(`${label}manifest 的 sourceLock 不正确`);
  }
  if (manifest.workingCrs !== "EPSG:32651" || manifest.outputCrs !== "OGC:CRS84") {
    error(`${label}manifest 的工作或输出坐标系不正确`);
  }
}

function validateStandardMapDocument(document, label) {
  if (!document || typeof document !== "object") {
    error(`${label}: 文档元数据无效`);
    return;
  }
  if (typeof document.title !== "string" || document.title.length === 0) error(`${label}: 缺少标题`);
  const hostname = validateAndGetHostname(document.url, label);
  if (hostname && hostname !== "shanghai.tianditu.gov.cn") error(`${label}: 不是天地图上海来源`);
  if (!/^\d{4}-\d{2}$/.test(document.mapDate ?? "")) error(`${label}: mapDate 格式无效`);
  if (typeof document.reviewNumber !== "string" || document.reviewNumber.length === 0) {
    error(`${label}: 缺少审图号`);
  }
}

if (normalizedJson(sourceGeometry) !== normalizedJson(bundledGeometry)) {
  error("src/data/sectors.geojson 与 src/data/sectors.json 不同步");
}

if (sourceGeometry.type !== "FeatureCollection" || !Array.isArray(sourceGeometry.features)) {
  error("sectors.geojson 必须是 GeoJSON FeatureCollection");
}

const features = sourceGeometry.features ?? [];
const registry = registryData.sectors ?? [];
const sources = sourceData.sources ?? [];
const edges = evidenceData.edges ?? [];
const featureIds = features.map((feature) => feature.properties?.id);
const registryIds = registry.map((record) => record.id);
const sourceIds = sources.map((source) => source.id);
const edgeIds = edges.map((edge) => edge.id);
const candidates = candidateData.features ?? [];
const candidateIds = candidates.map((feature) => feature.properties?.id);
const candidateManifestEntries = candidateManifest.sectors ?? [];
const candidateDefinitions = candidateDefinitionsData.sectors ?? [];
const topologySectorIds = new Set(
  (candidateDefinitionsData.topologyGroups ?? [])
    .flatMap((group) => group.prioritySectorIds ?? []),
);
const candidateManifestIds = candidateManifestEntries.map((entry) => entry.id);
const subscopes = subscopeData.features ?? [];
const subscopeIds = subscopes.map((feature) => feature.properties?.id);
const subscopeManifestEntries = candidateManifest.subscopes ?? [];
const subscopeManifestIds = subscopeManifestEntries.map((entry) => entry.id);
const adminReferences = adminReferenceData.features ?? [];
const adminReferenceIds = adminReferences.map((feature) => feature.properties?.id);
const adminReferenceManifestEntries = adminReferenceManifest.sectors ?? [];
const adminReferenceManifestIds = adminReferenceManifestEntries.map((entry) => entry.id);
const adminReferenceDefinitions = adminReferenceDefinitionsData.sectors ?? [];
const adminReferenceDefinitionIds = adminReferenceDefinitions.map((definition) => definition.id);
const referenceChecks = referenceChecksData.checks ?? [];
const referenceCheckIds = referenceChecks.map((check) => check.sectorId);

for (const [label, ids] of [
  ["板块 feature", featureIds],
  ["板块 registry", registryIds],
  ["来源", sourceIds],
  ["边界证据", edgeIds],
  ["候选面", candidateIds],
  ["候选面 manifest", candidateManifestIds],
  ["板块子范围", subscopeIds],
  ["板块子范围 manifest", subscopeManifestIds],
  ["行政参考面", adminReferenceIds],
  ["行政参考面 manifest", adminReferenceManifestIds],
  ["行政参考面 definition", adminReferenceDefinitionIds],
  ["逐板块参考检查", referenceCheckIds],
]) {
  if (new Set(ids).size !== ids.length) error(`${label} ID 存在重复`);
}

const registryIdSet = new Set(registryIds);
for (const featureId of featureIds) {
  if (!registryIdSet.has(featureId)) error(`${featureId}: GeoJSON 板块没有 registry 身份记录`);
}

const legacyFeatureById = new Map(features.map((feature) => [feature.properties?.id, feature]));
const registryById = new Map(registry.map((record) => [record.id, record]));
const candidateDefinitionById = new Map(
  candidateDefinitions.map((definition) => [definition.id, definition]),
);
const sourceById = new Map(sources.map((source) => [source.id, source]));
const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
const requiredBoundarySides = ["north", "east", "south", "west"];
const allowedBoundarySides = [...requiredBoundarySides, "component", "shared_hole"];
const knownDefinitionStatuses = new Set([
  "official_scope_available",
  "market_scope_candidate",
  "user_decided_market_scope",
  "partial_official_scope",
  "historical_official_scope_needs_version_check",
  "official_scope_available_but_semantics_ambiguous",
  "official_scope_market_candidate",
  "market_identity_admin_backbone_candidate",
  "admin_proxy_candidate",
  "multiple_official_versions_need_selection",
]);
const knownSourceAllowedUses = new Set([
  "demo_only",
  "boundary_definition_only",
  "boundary_verification_only",
  "version_check_only",
  "boundary_relationship_only",
  "spatial_relationship_only",
  "scope_comparison_only",
  "market_identity_verification_only",
  "sector_definition_and_geometry_rule",
  "name_verification_only",
  "visual_comparison_only",
  "geometry_with_attribution_and_odbl_compliance",
]);
const knownBoundaryStatuses = new Set([
  "definition_confirmed",
  "candidate_scope_confirmed",
  "candidate_backbone_confirmed",
  "project_integrity_checked_candidate",
  "adjacent_review_required",
  "partial",
  "geometry_missing",
  "scope_ambiguous",
]);
const knownBoundaryBasisTypes = new Set([
  "official_plan_text",
  "seller_market_scope",
  "planning_unit_scope",
  "historical_official_scope",
  "official_scope_text",
  "scope_decision_required",
  "official_regulation",
  "existing_market_candidate_shared_edge",
  "market_candidate_from_admin_backbone",
  "named_road_market_candidate",
  "osm_admin_relation_market_backbone",
  "official_function_divide_osm_road_cut",
  "project_integrity_market_candidate",
  "user_decided_market_shared_edge",
  "named_osm_landuse_market_proxy",
]);
const candidateGeometryStatuses = new Set(["draft", "reviewed", "published"]);
const knownGeometryStatuses = ["missing", "demo", "admin-reference", ...candidateGeometryStatuses];
const geometryStatusCounts = new Map(knownGeometryStatuses.map((status) => [status, 0]));

for (const source of sources) {
  if (!knownSourceAllowedUses.has(source.allowedUse)) {
    error(`${source.id}: 未知 source allowedUse ${source.allowedUse}`);
  }
}

for (const edge of edges) {
  if (!allowedBoundarySides.includes(edge.side)) {
    error(`${edge.id}: 未知 boundary side ${edge.side}`);
  }
  if (!knownBoundaryStatuses.has(edge.status)) {
    error(`${edge.id}: 未知 boundary status ${edge.status}`);
  }
  if (!knownBoundaryBasisTypes.has(edge.basisType)) {
    error(`${edge.id}: 未知 boundary basisType ${edge.basisType}`);
  }
  for (const sourceId of [edge.sourceId, ...(edge.supportingSourceIds ?? [])]) {
    if (!sourceById.has(sourceId)) error(`${edge.id}: 引用了不存在的 sourceId ${sourceId}`);
  }
}

for (const record of registry) {
  if (!knownDefinitionStatuses.has(record.definitionStatus)) {
    error(`${record.id}: 未知 definitionStatus ${record.definitionStatus}`);
  }
  const status = record.geometry?.status;
  if (!geometryStatusCounts.has(status)) error(`${record.id}: 未知 geometry.status ${status}`);
  else geometryStatusCounts.set(status, geometryStatusCounts.get(status) + 1);
  const verificationSourceIds = record.geometry?.verificationSourceIds ?? [];
  for (const sourceId of [
    ...(record.definitionSourceIds ?? []),
    ...(record.geometry?.sourceIds ?? []),
    ...verificationSourceIds,
  ]) {
    if (!sourceById.has(sourceId)) error(`${record.id}: 引用了不存在的 sourceId ${sourceId}`);
  }
  for (const boundaryEvidenceId of record.boundaryEvidenceIds ?? []) {
    const edge = edgeById.get(boundaryEvidenceId);
    if (!edge) error(`${record.id}: 引用了不存在的 boundaryEvidenceId ${boundaryEvidenceId}`);
    else if (edge.sectorId !== record.id) {
      error(`${record.id}: 边界证据 ${boundaryEvidenceId} 指向了其他板块`);
    }
  }
  if (status === "missing") {
    if (featureIds.includes(record.id)) error(`${record.id}: missing 状态不应存在入口面几何`);
    if (record.geometry.coordinateSystem !== "unknown" || record.geometry.coordinateSystemVerified !== false) {
      error(`${record.id}: missing 状态必须使用未确认坐标系`);
    }
    if (record.geometry.sourceIds?.length) error(`${record.id}: missing 状态不应声明几何来源`);
  }
}

const candidateRegistryIds = registry
  .filter((record) => candidateGeometryStatuses.has(record.geometry.status))
  .map((record) => record.id)
  .sort();
const adminReferenceRegistryIds = registry
  .filter((record) => record.geometry.status === "admin-reference")
  .map((record) => record.id)
  .sort();

if (normalizedStringSet(candidateIds) !== normalizedJson(candidateRegistryIds)) {
  error("候选面必须且只能对应 registry 中的 draft/reviewed/published 几何");
}
if (adminReferenceRegistryIds.some((id) => !adminReferenceIds.includes(id))) {
  error("registry 中的 admin-reference 几何必须存在对应行政参考面");
}
if (normalizedStringSet(candidateManifestIds) !== normalizedStringSet(candidateIds)) {
  error("候选面 manifest 必须与候选几何一一对应");
}
for (const candidate of candidates) {
  const candidateId = candidate.properties?.id;
  const registryRecord = registryById.get(candidateId);
  if (candidate.properties?.confidence !== registryRecord?.geometry?.confidence) {
    error(`${candidateId}: 候选面 confidence 与 registry geometry.confidence 不一致`);
  }
}
if (normalizedStringSet(subscopeManifestIds) !== normalizedStringSet(subscopeIds)) {
  error("板块子范围 manifest 必须与子范围几何一一对应");
}
if (normalizedStringSet(adminReferenceManifestIds) !== normalizedStringSet(adminReferenceIds)) {
  error("行政参考面 manifest 必须与行政参考几何一一对应");
}
if (normalizedStringSet(adminReferenceDefinitionIds) !== normalizedStringSet(adminReferenceIds)) {
  error("行政参考面 definition 必须与行政参考几何一一对应");
}
if (normalizedStringSet(referenceCheckIds) !== normalizedStringSet(featureIds)) {
  error("reference-checks 必须与已有入口面几何一一对应；待绘制身份无需伪造几何检查");
}

for (const feature of features) {
  const id = feature.properties?.id ?? "unknown";
  const record = registryById.get(id);
  if (feature.type !== "Feature") error(`${id}: type 必须为 Feature`);
  if (feature.geometry?.type !== "Polygon") error(`${id}: 现阶段仅允许 Polygon；接入 MultiPolygon 前需升级渲染层`);
  if (!record) continue;
  if (feature.properties?.name !== record.canonicalName) error(`${id}: GeoJSON name 与 registry canonicalName 不一致`);
  if (record.geometry.status === "demo" && record.geometry.publicationPolicy !== "demo_only") {
    error(`${id}: demo 几何必须限制为 demo_only`);
  }
  if (record.geometry.status !== "demo" && record.geometry.status !== "missing"
    && !record.geometry.coordinateSystemVerified) {
    error(`${id}: 非演示几何必须确认坐标系`);
  }
  const recordEdges = record.boundaryEvidenceIds
    .map((boundaryEvidenceId) => edgeById.get(boundaryEvidenceId))
    .filter(Boolean);
  const usesComponentEvidence = recordEdges.some(
    (edge) => edge.side === "component" || edge.side === "shared_hole",
  );
  if (record.geometry.status !== "missing" && !usesComponentEvidence) {
    for (const side of requiredBoundarySides) {
      const sideCount = recordEdges.filter((edge) => edge.side === side).length;
      if (sideCount !== 1) error(`${id}: ${side} 边界证据应且仅应有 1 条，实际 ${sideCount} 条`);
    }
  }
  if (record.reviewStatus === "reviewed-high") {
    const confirmedEdges = record.boundaryEvidenceIds
      .map((edgeId) => edgeById.get(edgeId))
      .filter((edge) => edge?.status === "definition_confirmed");
    if (confirmedEdges.length < 4) error(`${id}: reviewed-high 至少需要 4 条已确认定义边`);
  }
  if (record.geometry.status !== "demo" && record.geometry.status !== "missing") {
    const reusableGeometrySources = record.geometry.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source) => source?.licenseStatus !== "reference_only" && source?.allowedUse?.includes("geometry"));
    if (reusableGeometrySources.length === 0) error(`${id}: 非演示几何缺少允许几何使用的来源`);
  }
  if (record.geometry.status === "admin-reference") {
    if (!Array.isArray(record.geometry.verificationSourceIds) || record.geometry.verificationSourceIds.length === 0) {
      error(`${id}: 行政参考面缺少 verificationSourceIds`);
    }
    if (record.geometry.publicationPolicy !== "internal_review") {
      error(`${id}: 行政参考面必须限制为 internal_review`);
    }
  }

  const rings = feature.geometry?.coordinates ?? [];
  if (rings.length !== 1) warn(`${id}: 当前渲染只经过单环验证，发现 ${rings.length} 个环`);
  const outerRing = rings[0] ?? [];
  if (outerRing.length < 4) error(`${id}: 外环至少需要 4 个坐标点`);
  else {
    if (!samePoint(outerRing[0], outerRing.at(-1))) error(`${id}: 外环没有闭合`);
    for (const [longitude, latitude] of outerRing) {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) error(`${id}: 存在非数字坐标`);
      if (longitude < 120.8 || longitude > 122.2 || latitude < 30.6 || latitude > 31.9) {
        error(`${id}: 坐标超出上海合理范围 ${longitude},${latitude}`);
      }
    }
    if (hasSelfIntersection(outerRing)) error(`${id}: 外环自相交`);
    if (signedRingArea(outerRing) < 0) warn(`${id}: 外环为顺时针；正式 GeoJSON 建议按 RFC 7946 调整为逆时针`);
    if (!pointInRingStrict(feature.properties.center, outerRing)) error(`${id}: 标签中心点不在面内`);
  }
}

for (const edge of edges) {
  if (!registryById.has(edge.sectorId)) error(`${edge.id}: sectorId 不存在`);
  if (!sourceById.has(edge.sourceId)) error(`${edge.id}: sourceId 不存在`);
}

const osmGeometrySource = sourceById.get(osmSourceLock.id);
if (!osmGeometrySource) error(`锁定 OSM 来源 ${osmSourceLock.id} 未登记到 sources.json`);
else if (osmGeometrySource.licenseStatus !== "ODbL-1.0"
  || osmGeometrySource.allowedUse !== "geometry_with_attribution_and_odbl_compliance") {
  error(`锁定 OSM 来源 ${osmSourceLock.id} 的许可或允许用途不正确`);
}

validateLockedOsmCollection(candidateData, candidateManifest, "候选几何", "internal-review");
validateLockedOsmCollection(subscopeData, candidateManifest, "板块子范围", "internal-reference");

const manifestById = new Map(candidateManifestEntries.map((item) => [item.id, item]));
const candidateById = new Map(candidates.map((feature) => [feature.properties?.id, feature]));
const huangpuBatchDefinitions = candidateDefinitions.filter(
  (definition) => definition.scopeVersion
    === "huangpu-admin-backbone-market-candidate-2026-07",
);
if (huangpuBatchDefinitions.length !== 9) {
  error(`黄浦九板块批次应有 9 个定义，实际 ${huangpuBatchDefinitions.length} 个`);
}
const huangpuBatchRelationIds = new Map(huangpuBatchDefinitions.map(
  (definition) => [definition.id, String(definition.osmAdminRelationId)],
));
for (const [sectorId, relationId] of huangpuBatchRelationIds) {
  const definition = candidateDefinitionById.get(sectorId);
  const candidate = candidateById.get(sectorId);
  const manifest = manifestById.get(sectorId);
  if (definition?.method !== "market_admin_candidate_with_shared_topology") {
    error(`${sectorId}: 黄浦九板块必须使用同名行政关系市场候选构建方法`);
  }
  if (!candidate) {
    error(`${sectorId}: 黄浦九板块批次缺少候选面`);
    continue;
  }
  if (candidate.properties?.topologyMaxBoundaryDisplacementMeters > 0.1) {
    error(`${sectorId}: 黄浦同源街道骨架的拓扑位移不得超过 0.1 米`);
  }
  if (normalizedStringSet(manifest?.osmRefs?.adminRelations ?? [])
    !== normalizedStringSet([relationId])) {
    error(`${sectorId}: 黄浦候选必须锁定 OSM relation ${relationId}`);
  }
  for (const neighborId of candidate.properties?.sharedEdgeSectorIds ?? []) {
    if (!huangpuBatchRelationIds.has(neighborId)) continue;
    const neighbor = candidateById.get(neighborId);
    if (neighbor
      && sharedBoundaryLengthMeters(candidate.geometry, neighbor.geometry) < 250) {
      error(`${sectorId} / ${neighborId}: 黄浦批次声明共享边不足 250 米`);
    }
  }
}
const xintiandiDefinition = candidateDefinitionById.get("sector_xintiandi");
const xintiandiCandidate = candidateById.get("sector_xintiandi");
const xintiandiManifest = manifestById.get("sector_xintiandi");
if (!xintiandiDefinition || !xintiandiCandidate) {
  error("sector_xintiandi: 黄浦中心缺口必须补成独立新天地候选面");
} else {
  if (xintiandiDefinition.method !== "market_admin_candidate_with_shared_topology"
    || String(xintiandiDefinition.osmAdminRelationId) !== "12236003") {
    error("sector_xintiandi: 必须锁定淮海中路街道 relation 12236003 作为保守市场骨架");
  }
  if (xintiandiCandidate.properties?.topologyMaxBoundaryDisplacementMeters > 0.1) {
    error("sector_xintiandi: 与黄浦九板块同源的骨架位移不得超过 0.1 米");
  }
  if (normalizedStringSet(xintiandiManifest?.osmRefs?.adminRelations ?? [])
    !== normalizedStringSet(["12236003"])) {
    error("sector_xintiandi: manifest 必须记录唯一 OSM relation 12236003");
  }
  const xintiandiNeighborIds = [
    "sector_ruijinerlu",
    "sector_dapuqiao",
    "sector_laoximen",
    "sector_yuyuan",
    "sector_waitan",
    "sector_nanjingdonglu",
  ];
  for (const neighborId of xintiandiNeighborIds) {
    const neighbor = candidateById.get(neighborId);
    if (!neighbor
      || sharedBoundaryLengthMeters(xintiandiCandidate.geometry, neighbor.geometry) < 100) {
      error(`sector_xintiandi / ${neighborId}: 被围缺口共享边不足 100 米`);
    }
  }
}

const pudongTownBackboneDefinitions = candidateDefinitions.filter(
  (definition) => definition.scopeVersion
    === "pudong-town-backbone-market-candidate-2026-07",
);
const expectedPudongTownBackboneRelations = new Map([
  ["sector_kangqiao", "14179369"],
  ["sector_zhoupu", "14179320"],
  ["sector_hangtou", "14179368"],
  ["sector_xinchang", "14179332"],
  ["sector_chuansha", "14179063"],
  ["sector_tangzhen", "14179148"],
  ["sector_xuanqiao", "14180407"],
  ["sector_huinan", "14179286"],
  ["sector_zhuqiao", "14179522"],
]);
if (normalizedStringSet(pudongTownBackboneDefinitions.map(({ id }) => id))
  !== normalizedStringSet(expectedPudongTownBackboneRelations.keys())) {
  error("浦东连续九板块定义集合与研究裁定不一致");
}
const pudongTownBackboneIds = new Set(
  pudongTownBackboneDefinitions.map((definition) => definition.id),
);
const declaredPudongSharedPairs = new Set(pudongTownBackboneDefinitions.flatMap(
  (definition) => (definition.sharedEdgeSectorIds ?? [])
    .filter((neighborId) => pudongTownBackboneIds.has(neighborId))
    .map((neighborId) => [definition.id, neighborId].sort().join("/")),
));
const expectedPudongSharedPairs = [
  "sector_kangqiao/sector_zhoupu",
  "sector_chuansha/sector_kangqiao",
  "sector_hangtou/sector_zhoupu",
  "sector_xinchang/sector_zhoupu",
  "sector_chuansha/sector_zhoupu",
  "sector_hangtou/sector_xinchang",
  "sector_chuansha/sector_xinchang",
  "sector_xinchang/sector_xuanqiao",
  "sector_chuansha/sector_tangzhen",
  "sector_chuansha/sector_xuanqiao",
  "sector_chuansha/sector_zhuqiao",
  "sector_huinan/sector_xuanqiao",
  "sector_xuanqiao/sector_zhuqiao",
  "sector_huinan/sector_zhuqiao",
];
if (normalizedStringSet(declaredPudongSharedPairs)
  !== normalizedStringSet(expectedPudongSharedPairs)) {
  error("浦东连续九板块必须声明研究确认的 14 组共享边");
}
for (const definition of pudongTownBackboneDefinitions) {
  const candidate = candidateById.get(definition.id);
  const manifest = manifestById.get(definition.id);
  if (definition.method !== "market_admin_candidate_with_shared_topology") {
    error(`${definition.id}: 浦东连续九板块必须使用同名镇关系市场候选构建方法`);
  }
  if (!candidate) {
    error(`${definition.id}: 浦东连续九板块批次缺少候选面`);
    continue;
  }
  if (candidate.properties?.topologyMaxBoundaryDisplacementMeters > 1) {
    error(`${definition.id}: 浦东同源镇骨架的拓扑位移不得超过 1 米`);
  }
  const expectedRelationId = expectedPudongTownBackboneRelations.get(definition.id);
  if (String(definition.osmAdminRelationId) !== expectedRelationId
    || normalizedStringSet(manifest?.osmRefs?.adminRelations ?? [])
      !== normalizedStringSet([expectedRelationId])) {
    error(`${definition.id}: definition / manifest 没有锁定研究确认的 OSM relation`);
  }
  for (const neighborId of candidate.properties?.sharedEdgeSectorIds ?? []) {
    if (!pudongTownBackboneIds.has(neighborId)) continue;
    const neighbor = candidateById.get(neighborId);
    if (neighbor
      && sharedBoundaryLengthMeters(candidate.geometry, neighbor.geometry) < 500) {
      error(`${definition.id} / ${neighborId}: 浦东批次声明共享边不足 500 米`);
    }
  }
}

const expectedOuterThirtyRelations = new Map([
  ["sector_huaxin", ["12979864"]],
  ["sector_chonggu", ["12979862"]],
  ["sector_baihe", ["12979863"]],
  ["sector_zhaoxiang", ["12979867"]],
  ["sector_xianghuaqiao", ["12979865"]],
  ["sector_xiayang", ["12979861"]],
  ["sector_yingpu", ["12979868"]],
  ["sector_zhujiajiao", ["12979869"]],
  ["sector_jinze", ["12979871"]],
  ["sector_liantang", ["12979870"]],
  ["sector_sijing", ["17016138"]],
  ["sector_dongjing", ["17191451"]],
  ["sector_xinqiao", ["17191452"]],
  ["sector_sheshan", ["17685018"]],
  ["sector_xiaokunshan", ["17685019"]],
  ["sector_chedun", ["17191450"]],
  ["sector_xinbang", ["17715762"]],
  ["sector_shihudang", ["16490107"]],
  ["sector_maogang", ["17885626"]],
  ["sector_yexie", ["17885642"]],
  ["sector_jinshanxincheng", ["18058389"]],
  ["sector_jinshanwei", ["18058384"]],
  ["sector_shanyang", ["18058383"]],
  ["sector_zhujing", ["18058385"]],
  ["sector_fengjing", ["18058390"]],
  ["sector_tinglin", ["16230588"]],
  ["sector_zhangyan", ["18058388"]],
  ["sector_langxia", ["18052560"]],
  ["sector_luxiang", ["18058386"]],
  ["sector_caojing", ["18058387"]],
]);
const outerThirtyDefinitions = candidateDefinitions.filter(
  (definition) => expectedOuterThirtyRelations.has(definition.id),
);
if (normalizedStringSet(outerThirtyDefinitions.map(({ id }) => id))
  !== normalizedStringSet(expectedOuterThirtyRelations.keys())) {
  error("青浦—松江—金山连续批次必须恰好包含研究裁定的 30 个新增板块");
}
const outerThirtyIds = new Set(expectedOuterThirtyRelations.keys());
const outerThirtySharedPairs = new Set(outerThirtyDefinitions.flatMap(
  (definition) => (definition.sharedEdgeSectorIds ?? [])
    .filter((neighborId) => outerThirtyIds.has(neighborId))
    .map((neighborId) => [definition.id, neighborId].sort().join("/")),
));
assertConnectedSharedEdgeBatch({
  ids: outerThirtyIds,
  pairs: outerThirtySharedPairs,
  expectedPairCount: 64,
  label: "青浦—松江—金山批次",
});
for (const definition of outerThirtyDefinitions) {
  const candidate = candidateById.get(definition.id);
  const manifest = manifestById.get(definition.id);
  const registryRecord = registryById.get(definition.id);
  const expectedRelations = expectedOuterThirtyRelations.get(definition.id);
  const declaredRelations = [String(definition.osmAdminRelationId)];
  if (definition.method !== "market_admin_candidate_with_shared_topology") {
    error(`${definition.id}: 青浦—松江—金山批次必须使用行政关系市场候选构建方法`);
  }
  if (normalizedStringSet(declaredRelations) !== normalizedStringSet(expectedRelations)
    || normalizedStringSet(manifest?.osmRefs?.adminRelations ?? [])
      !== normalizedStringSet(expectedRelations)) {
    error(`${definition.id}: definition / manifest 没有锁定研究确认的 OSM relation`);
  }
  if (definition.confidence !== "low"
    || candidate?.properties?.confidence !== "low"
    || registryRecord?.geometry?.confidence !== "low"
    || registryRecord?.reviewStatus !== "draft-low") {
    error(`${definition.id}: 行政骨架市场候选必须保持 low / draft-low`);
  }
  if (!["青浦区", "松江区", "金山区"].includes(definition.districtName)
    || normalizedStringSet(registryRecord?.districtNames ?? [])
      !== normalizedStringSet([definition.districtName])) {
    error(`${definition.id}: definition / registry 行政区必须一致且显式声明`);
  }
  if (!candidate) {
    error(`${definition.id}: 青浦—松江—金山批次缺少候选面`);
    continue;
  }
  for (const neighborId of candidate.properties?.sharedEdgeSectorIds ?? []) {
    if (!outerThirtyIds.has(neighborId)) continue;
    const neighbor = candidateById.get(neighborId);
    const sharedLength = neighbor
      ? sharedBoundaryLengthMeters(candidate.geometry, neighbor.geometry)
      : 0;
    const exactSharedLength = neighbor
      ? exactSharedBoundaryLengthMeters(candidate.geometry, neighbor.geometry)
      : 0;
    if (sharedLength < 100) {
      error(`${definition.id} / ${neighborId}: 青浦—松江—金山批次声明共享边不足 100 米`);
    }
    if (exactSharedLength < 100
      || Math.abs(exactSharedLength - sharedLength) > 0.01) {
      error(`${definition.id} / ${neighborId}: 共享边两侧必须使用完全相同的坐标序列`);
    }
  }
}
for (const [sectorId, protectedSectorId, minimumSharedLengthMeters] of [
  ["sector_huaxin", "sector_xujing", 4_000],
  ["sector_zhaoxiang", "sector_xujing", 2_500],
  ["sector_xinqiao", "sector_xinzhuang", 500],
]) {
  const definition = candidateDefinitionById.get(sectorId);
  const candidate = candidateById.get(sectorId);
  const protectedCandidate = candidateById.get(protectedSectorId);
  const manifest = manifestById.get(sectorId);
  const approximateSharedLength = candidate && protectedCandidate
    ? sharedBoundaryLengthMeters(candidate.geometry, protectedCandidate.geometry)
    : 0;
  const coordinateEquivalentSharedLength = candidate && protectedCandidate
    ? sharedBoundaryLengthMeters(
      candidate.geometry,
      protectedCandidate.geometry,
      {
        directionTolerance: 1e-8,
        distanceToleranceMeters: 0.000001,
      },
    )
    : 0;
  if (!(definition?.subtractSectorIds ?? []).includes(protectedSectorId)
    || !(manifest?.osmRefs?.subtractedSectorIds ?? []).includes(protectedSectorId)) {
    error(`${sectorId}: 必须显式扣除既有市场候选 ${protectedSectorId}`);
  }
  if (approximateSharedLength < minimumSharedLengthMeters) {
    error(`${sectorId} / ${protectedSectorId}: 扣除后共享边不足验收长度`);
  }
  if (coordinateEquivalentSharedLength < minimumSharedLengthMeters) {
    error(`${sectorId} / ${protectedSectorId}: 保护边必须在 1 微米内保持坐标等价`);
  }
}

const expectedXuhuiTwelveRelations = new Map([
  ["sector_xujiahui", "13469990"],
  ["sector_hunanlu", "13469979"],
  ["sector_tianpinglu", "13469980"],
  ["sector_fenglinlu", "13470052"],
  ["sector_xietulu", "13470053"],
  ["sector_longhua", "13470146"],
  ["sector_tianlin", "13470318"],
  ["sector_caohejing", "13470278"],
  ["sector_kangjian", "13470479"],
  ["sector_lingyunlu", "13470540"],
  ["sector_changqiao", "13470589"],
  ["sector_huajing", "13470658"],
]);
const xuhuiTwelveDefinitions = candidateDefinitions.filter(
  (definition) => expectedXuhuiTwelveRelations.has(definition.id),
);
if (normalizedStringSet(xuhuiTwelveDefinitions.map(({ id }) => id))
  !== normalizedStringSet(expectedXuhuiTwelveRelations.keys())) {
  error("徐汇同名街镇批次必须恰好包含研究确认的 12 个市场候选");
}
const xuhuiTwelveIds = new Set(expectedXuhuiTwelveRelations.keys());
const xuhuiTwelveSharedPairs = new Set(xuhuiTwelveDefinitions.flatMap(
  (definition) => (definition.sharedEdgeSectorIds ?? [])
    .filter((neighborId) => xuhuiTwelveIds.has(neighborId))
    .map((neighborId) => [definition.id, neighborId].sort().join("/")),
));
assertConnectedSharedEdgeBatch({
  ids: xuhuiTwelveIds,
  pairs: xuhuiTwelveSharedPairs,
  expectedPairCount: 21,
  label: "徐汇同名街镇批次",
});
for (const forbiddenName of ["虹梅路", "上海南站"]) {
  if ([...registryById.values()].some(
    (record) => record.canonicalName === forbiddenName,
  )) {
    error(`徐汇批次不得在未裁定市场四至前自动注册 ${forbiddenName}`);
  }
}
for (const definition of xuhuiTwelveDefinitions) {
  const candidate = candidateById.get(definition.id);
  const registryRecord = registryById.get(definition.id);
  const manifest = manifestById.get(definition.id);
  const expectedRelation = expectedXuhuiTwelveRelations.get(definition.id);
  if (definition.method !== "market_admin_candidate_with_shared_topology"
    || String(definition.osmAdminRelationId) !== expectedRelation
    || normalizedStringSet(manifest?.osmRefs?.adminRelations ?? [])
      !== normalizedStringSet([expectedRelation])) {
    error(`${definition.id}: 徐汇批次没有锁定研究确认的 OSM 行政关系`);
  }
  if (definition.districtName !== "徐汇区"
    || normalizedStringSet(registryRecord?.districtNames ?? [])
      !== normalizedStringSet(["徐汇区"])) {
    error(`${definition.id}: 徐汇批次行政归属必须保持徐汇区`);
  }
  if (definition.confidence !== "low"
    || candidate?.properties?.confidence !== "low"
    || registryRecord?.geometry?.confidence !== "low"
    || registryRecord?.reviewStatus !== "draft-low"
  || registryRecord?.geometry?.publicationPolicy !== "internal_review") {
    error(`${definition.id}: 徐汇行政骨架必须保持 low / draft-low / internal_review`);
  }
  for (const neighborId of definition.sharedEdgeSectorIds ?? []) {
    if (!xuhuiTwelveIds.has(neighborId)) continue;
    const neighbor = candidateById.get(neighborId);
    const sharedLength = candidate && neighbor
      ? sharedBoundaryLengthMeters(candidate.geometry, neighbor.geometry)
      : 0;
    const exactSharedLength = candidate && neighbor
      ? exactSharedBoundaryLengthMeters(candidate.geometry, neighbor.geometry)
      : 0;
    if (sharedLength < 100
      || exactSharedLength < 100
      || Math.abs(exactSharedLength - sharedLength) > 0.01) {
      error(`${definition.id} / ${neighborId}: 徐汇批次共享边必须使用完全相同的坐标序列`);
    }
  }
}
for (const [sectorId, protectedSectorId, minimumSharedLengthMeters] of [
  ["sector_longhua", "sector_yangsi", 300],
  ["sector_longhua", "sector_shibo", 1_500],
  ["sector_changqiao", "sector_yangsi", 40],
  ["sector_changqiao", "sector_sanlin", 1_000],
  ["sector_kangjian", "sector_gumei", 1_500],
]) {
  const definition = candidateDefinitionById.get(sectorId);
  const candidate = candidateById.get(sectorId);
  const protectedCandidate = candidateById.get(protectedSectorId);
  const manifest = manifestById.get(sectorId);
  const coordinateEquivalentSharedLength = candidate && protectedCandidate
    ? sharedBoundaryLengthMeters(
      candidate.geometry,
      protectedCandidate.geometry,
      {
        directionTolerance: 1e-8,
        distanceToleranceMeters: 0.000001,
      },
    )
    : 0;
  if (!(definition?.subtractSectorIds ?? []).includes(protectedSectorId)
    || !(manifest?.osmRefs?.subtractedSectorIds ?? []).includes(protectedSectorId)) {
    error(`${sectorId}: 必须显式扣除既有市场候选 ${protectedSectorId}`);
  }
  if (coordinateEquivalentSharedLength < minimumSharedLengthMeters) {
    error(`${sectorId} / ${protectedSectorId}: 保护边必须在 1 微米内保持坐标等价`);
  }
}

const expectedChangningFourRelations = new Map([
  ["sector_xinhualu", "13469094"],
  ["sector_tianshan", "13469232"],
  ["sector_xianxia", "13469351"],
  ["sector_beixinjing", "14184083"],
]);
const changningFourDefinitions = candidateDefinitions.filter(
  (definition) => expectedChangningFourRelations.has(definition.id),
);
if (normalizedStringSet(changningFourDefinitions.map(({ id }) => id))
  !== normalizedStringSet(expectedChangningFourRelations.keys())) {
  error("长宁直接同名街道批次必须恰好包含研究确认的 4 个市场候选");
}
const changningFourIds = new Set(expectedChangningFourRelations.keys());
const changningFourSharedPairs = new Set(changningFourDefinitions.flatMap(
  (definition) => (definition.sharedEdgeSectorIds ?? [])
    .filter((neighborId) => changningFourIds.has(neighborId))
    .map((neighborId) => [definition.id, neighborId].sort().join("/")),
));
if (changningFourSharedPairs.size !== 2
  || !changningFourSharedPairs.has("sector_tianshan/sector_xinhualu")
  || !changningFourSharedPairs.has("sector_tianshan/sector_xianxia")) {
  error("长宁直接同名街道批次必须保持新华路—天山—仙霞两组固定共享边");
}
for (const forbiddenName of ["西郊"]) {
  if ([...registryById.values()].some(
    (record) => record.canonicalName === forbiddenName,
  )) {
    error(`长宁直接骨架批次不得在自定义四至冻结前自动注册 ${forbiddenName}`);
  }
}
const protectedHongqiaoBusinessRegistry = registryById.get("sector_hongqiao");
const protectedHongqiaoBusinessCandidate = candidateById.get("sector_hongqiao");
if (protectedHongqiaoBusinessRegistry?.canonicalName !== "虹桥商务区"
  || protectedHongqiaoBusinessCandidate?.properties?.name !== "虹桥商务区") {
  error("sector_hongqiao 必须永久保留给虹桥商务区；长宁住宅虹桥必须使用 sector_changning_hongqiao");
}
for (const definition of changningFourDefinitions) {
  const candidate = candidateById.get(definition.id);
  const registryRecord = registryById.get(definition.id);
  const manifest = manifestById.get(definition.id);
  const expectedRelation = expectedChangningFourRelations.get(definition.id);
  if (definition.method !== "market_admin_candidate_with_shared_topology"
    || String(definition.osmAdminRelationId) !== expectedRelation
    || normalizedStringSet(manifest?.osmRefs?.adminRelations ?? [])
      !== normalizedStringSet([expectedRelation])) {
    error(`${definition.id}: 长宁批次没有锁定研究确认的 OSM 行政关系`);
  }
  if (definition.districtName !== "长宁区"
    || normalizedStringSet(registryRecord?.districtNames ?? [])
      !== normalizedStringSet(["长宁区"])) {
    error(`${definition.id}: 长宁批次行政归属必须保持长宁区`);
  }
  if (definition.confidence !== "low"
    || candidate?.properties?.confidence !== "low"
    || registryRecord?.geometry?.confidence !== "low"
    || registryRecord?.reviewStatus !== "draft-low"
    || registryRecord?.geometry?.publicationPolicy !== "internal_review") {
    error(`${definition.id}: 长宁行政骨架必须保持 low / draft-low / internal_review`);
  }
}
for (const pair of changningFourSharedPairs) {
  const [firstId, secondId] = pair.split("/");
  const first = candidateById.get(firstId);
  const second = candidateById.get(secondId);
  const sharedLength = first && second
    ? sharedBoundaryLengthMeters(first.geometry, second.geometry)
    : 0;
  const exactSharedLength = first && second
    ? exactSharedBoundaryLengthMeters(first.geometry, second.geometry)
    : 0;
  if (sharedLength < 500
    || exactSharedLength < 500
    || Math.abs(exactSharedLength - sharedLength) > 0.01) {
    error(`${firstId} / ${secondId}: 长宁批次共享边必须使用完全相同的坐标序列`);
  }
}

const expectedJinganPutuoElevenRelations = new Map([
  ["sector_nanjingxilu", "14186016"],
  ["sector_jingansi", "14186014"],
  ["sector_caojiadu", "14186015"],
  ["sector_jiangninglu", "14186018"],
  ["sector_changshoulu", "14187871"],
  ["sector_caoyang", "14187873"],
  ["sector_zhenru", "14187866"],
  ["sector_changfeng", "14187872"],
  ["sector_changzheng", "14187865"],
  ["sector_taopu", "14187864"],
  ["sector_wanli", "14187867"],
]);
const jinganPutuoElevenDefinitions = candidateDefinitions.filter(
  (definition) => expectedJinganPutuoElevenRelations.has(definition.id),
);
if (normalizedStringSet(jinganPutuoElevenDefinitions.map(({ id }) => id))
  !== normalizedStringSet(expectedJinganPutuoElevenRelations.keys())) {
  error("静安—普陀直接行政骨架批次必须恰好包含研究确认的 11 个市场候选");
}
for (const definition of jinganPutuoElevenDefinitions) {
  const expectedRelation = expectedJinganPutuoElevenRelations.get(definition.id);
  const candidate = candidateById.get(definition.id);
  const registryRecord = registryById.get(definition.id);
  const manifest = manifestById.get(definition.id);
  if (definition.method !== "market_admin_candidate_with_shared_topology"
    || String(definition.osmAdminRelationId) !== expectedRelation
    || normalizedStringSet(manifest?.osmRefs?.adminRelations ?? [])
      !== normalizedStringSet([expectedRelation])) {
    error(`${definition.id}: 静安—普陀批次没有锁定研究确认的行政关系与正式生成方法`);
  }
  if (definition.confidence !== "low"
    || candidate?.properties?.confidence !== "low"
    || registryRecord?.geometry?.confidence !== "low"
    || registryRecord?.reviewStatus !== "draft-low"
    || registryRecord?.geometry?.publicationPolicy !== "internal_review") {
    error(`${definition.id}: 静安—普陀行政骨架必须保持 low / draft-low / internal_review`);
  }
}
for (const forbiddenName of [
  "石门二路", "宝山路", "芷江西路", "共和新路", "彭浦新村",
  "不夜城", "苏河湾", "阳城—永和", "阳城", "永和",
  "武宁", "真光", "光新",
]) {
  if ([...registryById.values()].some(
    (record) => record.canonicalName === forbiddenName,
  )) {
    error(`静安—普陀直接骨架批次不得在独立研究前自动注册 ${forbiddenName}`);
  }
}
const liangwanchengDefinition = candidateDefinitionById.get(
  "sector_zhongyuanliangwancheng",
);
const liangwanchengCandidate = candidateById.get(
  "sector_zhongyuanliangwancheng",
);
const liangwanchengRegistry = registryById.get(
  "sector_zhongyuanliangwancheng",
);
const liangwanchengManifest = manifestById.get(
  "sector_zhongyuanliangwancheng",
);
const ganquanYichuanDefinition = candidateDefinitionById.get(
  "sector_ganquanyichuan",
);
const ganquanYichuanCandidate = candidateById.get("sector_ganquanyichuan");
const ganquanYichuanRegistry = registryById.get("sector_ganquanyichuan");
const ganquanYichuanManifest = manifestById.get("sector_ganquanyichuan");
const ganquanYichuanReconstructionError = Number(
  ganquanYichuanManifest?.osmRefs?.differenceReconstructionErrorSquareMeters,
);
const ganquanYichuanSubtractOutside = Number(
  ganquanYichuanManifest?.osmRefs?.subtractOutsideAdminSquareMeters,
);
const ganquanYichuanSharedBoundary = Number(
  ganquanYichuanManifest?.osmRefs
    ?.sharedBoundaryWithSubtractedCandidatesMeters,
);
const expectedLiangwanchengLanduseIds = [
  "430671374",
  "430673771",
  "430673775",
  "432976922",
  "1101637576",
];
if (liangwanchengDefinition?.method !== "named_osm_landuse_project_proxy"
  || liangwanchengCandidate?.geometry?.type !== "MultiPolygon"
  || polygonGroupsForGeometry(liangwanchengCandidate.geometry).length !== 5
  || liangwanchengCandidate?.properties?.areaSquareKilometers !== 0.3674
  || normalizedStringSet(liangwanchengDefinition?.riskFlags ?? [])
    !== normalizedStringSet([
      "named_project_landuse_proxy_requires_validation",
      "multi_part_project_scope",
      "official_polygon_unavailable",
    ])
  || normalizedStringSet(liangwanchengRegistry?.riskFlags ?? [])
    !== normalizedStringSet(liangwanchengDefinition?.riskFlags ?? [])
  || liangwanchengRegistry?.reviewStatus !== "draft-low"
  || liangwanchengRegistry?.geometry?.confidence !== "low"
  || liangwanchengRegistry?.geometry?.publicationPolicy !== "internal_review") {
  error("sector_zhongyuanliangwancheng: 必须保持 5 面同名住宅用地、低置信内部候选");
}
if (normalizedStringSet(liangwanchengDefinition?.projectLanduseOsmIds ?? [])
    !== normalizedStringSet(expectedLiangwanchengLanduseIds)
  || normalizedStringSet(
    (liangwanchengManifest?.osmRefs?.namedLanduseObjects ?? [])
      .map(({ osmId }) => osmId),
  ) !== normalizedStringSet(expectedLiangwanchengLanduseIds)
  || liangwanchengManifest?.osmRefs?.landusePartCount !== 5
  || liangwanchengManifest?.osmRefs?.outsideProtectedAdminSquareMeters !== 0
  || liangwanchengManifest?.osmRefs?.convexHullUsed !== false) {
  error("sector_zhongyuanliangwancheng: 必须锁定 5 个用地 ID、禁用凸包并完全位于宜川路街道内");
}
if (ganquanYichuanDefinition?.method
    !== "market_admin_union_minus_market_candidates"
  || ganquanYichuanCandidate?.geometry?.type !== "Polygon"
  || polygonGroupsForGeometry(ganquanYichuanCandidate.geometry).length !== 1
  || polygonGroupsForGeometry(ganquanYichuanCandidate.geometry)[0]?.length !== 6
  || ganquanYichuanCandidate?.properties?.areaSquareKilometers !== 4.206
  || ganquanYichuanCandidate?.properties?.fullAdminUnionRejected !== true
  || !ganquanYichuanCandidate?.properties?.excludedMarketAreas?.includes(
    "中远两湾城",
  )
  || normalizedStringSet(ganquanYichuanDefinition?.riskFlags ?? [])
    !== normalizedStringSet([
      "admin_union_remainder_requires_validation",
      "independent_market_subtracted",
      "mixed_non_residential_scope",
      "guangxin_interface_unresolved",
      "market_boundary_not_official",
    ])
  || normalizedStringSet(ganquanYichuanRegistry?.riskFlags ?? [])
    !== normalizedStringSet(ganquanYichuanDefinition?.riskFlags ?? [])
  || ganquanYichuanRegistry?.reviewStatus !== "draft-low"
  || ganquanYichuanRegistry?.geometry?.confidence !== "low"
  || ganquanYichuanRegistry?.geometry?.publicationPolicy !== "internal_review") {
  error("sector_ganquanyichuan: 必须保持两街道行政余量、5 洞、低置信内部候选");
}
if (normalizedStringSet(
  (ganquanYichuanManifest?.osmRefs?.adminRelations ?? [])
    .map(({ osmId }) => osmId),
) !== normalizedStringSet(["14187868", "14187870"])
  || normalizedStringSet(
    ganquanYichuanManifest?.osmRefs?.subtractedSectorIds ?? [],
  ) !== normalizedStringSet(["sector_zhongyuanliangwancheng"])
  || !Number.isFinite(ganquanYichuanReconstructionError)
  || ganquanYichuanReconstructionError > 1
  || !Number.isFinite(ganquanYichuanSubtractOutside)
  || ganquanYichuanSubtractOutside > 0.01
  || !Number.isFinite(ganquanYichuanSharedBoundary)
  || ganquanYichuanSharedBoundary < 5000) {
  error("sector_ganquanyichuan: 行政并集差集必须守恒并与中远两湾城保持完整共享边");
}
if (sharedBoundaryLengthMetersIncludingHoles(
    liangwanchengCandidate?.geometry,
    ganquanYichuanCandidate?.geometry,
    { distanceToleranceMeters: 0.01 },
  ) < 5000) {
  error("中远两湾城 / 甘泉宜川: 必须保持完全相同的 5 面差集共享边");
}
if (!ganquanYichuanDefinition?.riskFlags?.includes(
  "guangxin_interface_unresolved",
)) {
  error("sector_ganquanyichuan: 必须显式保留光新接口未决风险");
}
const liangwanchengEvidence = (liangwanchengRegistry?.boundaryEvidenceIds ?? [])
  .map((edgeId) => edgeById.get(edgeId))
  .filter(Boolean);
const ganquanYichuanEvidence = (ganquanYichuanRegistry?.boundaryEvidenceIds ?? [])
  .map((edgeId) => edgeById.get(edgeId))
  .filter(Boolean);
if (liangwanchengEvidence.length !== 5
  || liangwanchengEvidence.some(
    (edge) => edge.side !== "component"
      || edge.basisType !== "named_osm_landuse_market_proxy"
      || edge.osmRefs?.length !== 1,
  )
  || normalizedStringSet(liangwanchengEvidence.flatMap(
    (edge) => edge.osmRefs ?? [],
  )) !== normalizedStringSet(expectedLiangwanchengLanduseIds)) {
  error("sector_zhongyuanliangwancheng: 5 个独立用地面必须各自拥有可寻址的组件证据");
}
if (ganquanYichuanEvidence.length !== 7
  || ganquanYichuanEvidence.filter((edge) => edge.side === "component").length !== 2
  || ganquanYichuanEvidence.filter((edge) => edge.side === "shared_hole").length !== 5
  || normalizedStringSet(ganquanYichuanEvidence
    .filter((edge) => edge.side === "shared_hole")
    .flatMap((edge) => edge.osmRefs ?? []))
    !== normalizedStringSet(expectedLiangwanchengLanduseIds)) {
  error("sector_ganquanyichuan: 两个行政组件与 5 个扣除洞必须分别登记证据");
}
if (normalizedStringSet(liangwanchengRegistry?.linkedTopologySectorIds ?? [])
    !== normalizedStringSet(["sector_ganquanyichuan"])
  || normalizedStringSet(ganquanYichuanRegistry?.linkedTopologySectorIds ?? [])
    !== normalizedStringSet(["sector_zhongyuanliangwancheng"])) {
  error("中远两湾城 / 甘泉宜川: registry 必须保留成对编辑拓扑元数据");
}
const taopuDefinition = candidateDefinitionById.get("sector_taopu");
if (normalizedStringSet(taopuDefinition?.riskFlags ?? [])
    !== normalizedStringSet([
      "overwide_admin_proxy",
      "mixed_industrial_rail_non_residential",
    ])
  || normalizedStringSet(taopuDefinition?.requiredAdjacencyReviewIds ?? [])
    !== normalizedStringSet([
      "sector_zhenru",
      "sector_changzheng",
      "sector_wanli",
      "unresolved_baoshan_interface",
    ])) {
  error("sector_taopu: 必须保留过宽/非住宅混合风险和真如、长征、万里、宝山接口复核门槛");
}

const expectedHongkouYangpuSevenRelations = new Map([
  ["sector_sichuanbeilu", "13462869"],
  ["sector_quyang", "13466001"],
  ["sector_liangcheng", "13466134"],
  ["sector_jiangwanzhen", "13466137"],
  ["sector_kongjianglu", "13466004"],
  ["sector_wujiaochang", "13466003"],
  ["sector_xinjiangwancheng", "13466494"],
]);
const expectedHongkouYangpuOfficialAreas = new Map([
  ["sector_sichuanbeilu", 1.78],
  ["sector_quyang", 3.05],
  ["sector_liangcheng", 3.24],
  ["sector_jiangwanzhen", 4.17],
  ["sector_kongjianglu", 2.15],
  ["sector_wujiaochang", 7.66],
  ["sector_xinjiangwancheng", 8.67],
]);
const hongkouYangpuSevenDefinitions = candidateDefinitions.filter(
  (definition) => expectedHongkouYangpuSevenRelations.has(definition.id),
);
if (normalizedStringSet(hongkouYangpuSevenDefinitions.map(({ id }) => id))
  !== normalizedStringSet(expectedHongkouYangpuSevenRelations.keys())) {
  error("虹口—杨浦直接行政骨架批次必须恰好包含研究确认的 7 个市场候选");
}
const hongkouYangpuSevenIds = new Set(
  expectedHongkouYangpuSevenRelations.keys(),
);
const hongkouDirectAdminBackboneIds = new Set([
  "sector_sichuanbeilu",
  "sector_quyang",
  "sector_liangcheng",
  "sector_jiangwanzhen",
]);
const hongkouYangpuSharedPairs = new Set(hongkouYangpuSevenDefinitions.flatMap(
  (definition) => (definition.sharedEdgeSectorIds ?? [])
    .filter((neighborId) => hongkouYangpuSevenIds.has(neighborId))
    .map((neighborId) => [definition.id, neighborId].sort().join("/")),
));
const expectedHongkouYangpuSharedPairs = new Set([
  "sector_jiangwanzhen/sector_quyang",
  "sector_quyang/sector_wujiaochang",
  "sector_jiangwanzhen/sector_liangcheng",
  "sector_jiangwanzhen/sector_wujiaochang",
  "sector_kongjianglu/sector_wujiaochang",
  "sector_wujiaochang/sector_xinjiangwancheng",
]);
if (normalizedStringSet(hongkouYangpuSharedPairs)
  !== normalizedStringSet(expectedHongkouYangpuSharedPairs)) {
  error("虹口—杨浦七板块批次必须保留研究确认的 6 组固定行政共享边");
}
for (const definition of hongkouYangpuSevenDefinitions) {
  const expectedRelation = expectedHongkouYangpuSevenRelations.get(definition.id);
  const expectedDistrict = hongkouDirectAdminBackboneIds.has(definition.id)
    ? "虹口区"
    : "杨浦区";
  const candidate = candidateById.get(definition.id);
  const registryRecord = registryById.get(definition.id);
  const manifest = manifestById.get(definition.id);
  if (definition.method !== "market_admin_candidate_with_shared_topology"
    || String(definition.osmAdminRelationId) !== expectedRelation
    || normalizedStringSet(manifest?.osmRefs?.adminRelations ?? [])
      !== normalizedStringSet([expectedRelation])) {
    error(`${definition.id}: 虹口—杨浦批次没有锁定研究确认的 OSM 行政关系`);
  }
  if (definition.districtName !== expectedDistrict
    || normalizedStringSet(registryRecord?.districtNames ?? [])
      !== normalizedStringSet([expectedDistrict])) {
    error(`${definition.id}: 虹口—杨浦批次行政归属错误`);
  }
  if (definition.officialAreaSquareKilometers
      !== expectedHongkouYangpuOfficialAreas.get(definition.id)) {
    error(`${definition.id}: 缺少研究确认的官方面积参考`);
  }
  if (definition.confidence !== "low"
    || candidate?.properties?.confidence !== "low"
    || registryRecord?.geometry?.confidence !== "low"
    || registryRecord?.reviewStatus !== "draft-low"
    || registryRecord?.geometry?.publicationPolicy !== "internal_review") {
    error(`${definition.id}: 虹口—杨浦行政骨架必须保持 low / draft-low / internal_review`);
  }
}
for (const pair of expectedHongkouYangpuSharedPairs) {
  const [firstId, secondId] = pair.split("/");
  const first = candidateById.get(firstId);
  const second = candidateById.get(secondId);
  const sharedLength = first && second
    ? sharedBoundaryLengthMeters(first.geometry, second.geometry)
    : 0;
  const exactSharedLength = first && second
    ? exactSharedBoundaryLengthMeters(first.geometry, second.geometry)
    : 0;
  if (sharedLength < 500
    || exactSharedLength < 500
    || Math.abs(exactSharedLength - sharedLength) > 0.01) {
    error(`${firstId} / ${secondId}: 虹口—杨浦批次共享边必须使用完全相同的坐标序列`);
  }
}
const hongkouYangpuCandidateAreaTotal = [...hongkouYangpuSevenIds].reduce(
  (sum, id) => sum + Number(candidateById.get(id)?.properties?.areaSquareKilometers ?? 0),
  0,
);
if (!nearlyEqual(hongkouYangpuCandidateAreaTotal, 30.5907, 0.001)) {
  error("虹口—杨浦七板块固定 OSM 候选总面积必须保持约 30.5907 平方公里");
}
if (normalizedStringSet(
  candidateDefinitionById.get("sector_sichuanbeilu")?.riskFlags ?? [],
) !== normalizedStringSet(["post_2018_north_bund_reorganization_review"])) {
  error("sector_sichuanbeilu: 必须保留 2018 北外滩区划调整复核门槛");
}
if (normalizedStringSet(
  registryById.get("sector_sichuanbeilu")?.riskFlags ?? [],
) !== normalizedStringSet(["post_2018_north_bund_reorganization_review"])
  || normalizedStringSet(
    candidateById.get("sector_sichuanbeilu")?.properties?.riskFlags ?? [],
  ) !== normalizedStringSet(["post_2018_north_bund_reorganization_review"])) {
  error("sector_sichuanbeilu: 2018 北外滩区划风险必须同步到运行时注册表和候选面");
}
if (normalizedStringSet(
  candidateDefinitionById.get("sector_wujiaochang")?.riskFlags ?? [],
) !== normalizedStringSet([
  "area_mismatch_review_required",
  "mixed_non_residential_scope",
])) {
  error("sector_wujiaochang: 必须保留面积漂移和非住宅混合风险");
}
if (normalizedStringSet(
  registryById.get("sector_wujiaochang")?.riskFlags ?? [],
) !== normalizedStringSet([
  "area_mismatch_review_required",
  "mixed_non_residential_scope",
])
  || normalizedStringSet(
    candidateById.get("sector_wujiaochang")?.properties?.riskFlags ?? [],
  ) !== normalizedStringSet([
    "area_mismatch_review_required",
    "mixed_non_residential_scope",
  ])) {
  error("sector_wujiaochang: 面积漂移和非住宅风险必须同步到运行时注册表和候选面");
}
if (normalizedStringSet(
  candidateDefinitionById.get("sector_xinjiangwancheng")?.riskFlags ?? [],
) !== normalizedStringSet(["mixed_water_green_campus_scope"])) {
  error("sector_xinjiangwancheng: 必须保留水绿、校园和非住宅混合风险");
}
if (normalizedStringSet(
  registryById.get("sector_xinjiangwancheng")?.riskFlags ?? [],
) !== normalizedStringSet(["mixed_water_green_campus_scope"])
  || normalizedStringSet(
    candidateById.get("sector_xinjiangwancheng")?.properties?.riskFlags ?? [],
  ) !== normalizedStringSet(["mixed_water_green_campus_scope"])) {
  error("sector_xinjiangwancheng: 水绿、校园和非住宅风险必须同步到运行时注册表和候选面");
}
const expectedHongkouYangpuProxyRelations = new Map([
  ["sector_anshan", "13466002"],
  ["sector_zhongyuan", "13466582"],
]);
const expectedHongkouYangpuProxyRisks = new Map([
  ["sector_anshan", [
    "market_name_admin_proxy_requires_validation",
    "mixed_campus_non_residential_scope",
  ]],
  ["sector_zhongyuan", [
    "market_name_admin_proxy_requires_validation",
    "mixed_industrial_rail_non_residential",
  ]],
]);
const hongkouYangpuProxyDefinitions = candidateDefinitions.filter(
  (definition) => expectedHongkouYangpuProxyRelations.has(definition.id),
);
if (normalizedStringSet(hongkouYangpuProxyDefinitions.map(({ id }) => id))
  !== normalizedStringSet(expectedHongkouYangpuProxyRelations.keys())) {
  error("虹口—杨浦第二批必须恰好包含研究通过的鞍山、中原两个行政代理");
}
for (const definition of hongkouYangpuProxyDefinitions) {
  const expectedRelation = expectedHongkouYangpuProxyRelations.get(definition.id);
  const expectedRisks = expectedHongkouYangpuProxyRisks.get(definition.id);
  const candidate = candidateById.get(definition.id);
  const registryRecord = registryById.get(definition.id);
  const manifest = manifestById.get(definition.id);
  const expectedMethod = definition.id === "sector_zhongyuan"
    ? "official_residential_subarea_proxy"
    : "non_same_name_admin_proxy";
  if (definition.method !== expectedMethod
    || String(definition.osmAdminRelationId) !== expectedRelation
    || normalizedStringSet(manifest?.osmRefs?.adminRelations ?? [])
      !== normalizedStringSet([expectedRelation])) {
    error(`${definition.id}: 没有锁定研究确认的行政代理 relation 与构建方法`);
  }
  if (definition.districtName !== "杨浦区"
    || normalizedStringSet(registryRecord?.districtNames ?? [])
      !== normalizedStringSet(["杨浦区"])) {
    error(`${definition.id}: 鞍山、中原代理的行政归属必须为杨浦区`);
  }
  if (definition.confidence !== "low"
    || candidate?.properties?.confidence !== "low"
    || registryRecord?.geometry?.confidence !== "low"
    || registryRecord?.reviewStatus !== "draft-low"
    || registryRecord?.geometry?.publicationPolicy !== "internal_review") {
    error(`${definition.id}: 行政代理必须保持 low / draft-low / internal_review`);
  }
  if (normalizedStringSet(definition.riskFlags ?? [])
      !== normalizedStringSet(expectedRisks)
    || normalizedStringSet(registryRecord?.riskFlags ?? [])
      !== normalizedStringSet(expectedRisks)
    || normalizedStringSet(candidate?.properties?.riskFlags ?? [])
      !== normalizedStringSet(expectedRisks)) {
    error(`${definition.id}: 行政代理风险必须同步到定义、注册表和候选面`);
  }
}
const anshanDefinition = candidateDefinitionById.get("sector_anshan");
const anshanCandidate = candidateById.get("sector_anshan");
if (anshanDefinition?.adminProxyName !== "四平路街道"
  || anshanDefinition?.marketAdminAlignmentUnverified !== true
  || normalizedStringSet(anshanDefinition?.sharedEdgeReview ?? [])
    !== normalizedStringSet(["控江路", "五角场", "东外滩", "曲阳"])
  || anshanCandidate?.properties?.adminProxyName !== "四平路街道"
  || anshanCandidate?.properties?.marketAdminAlignmentUnverified !== true
  || normalizedStringSet(anshanCandidate?.properties?.sharedEdgeReview ?? [])
    !== normalizedStringSet(["控江路", "五角场", "东外滩", "曲阳"])
  || registryById.get("sector_anshan")?.adminProxyName !== "四平路街道"
  || registryById.get("sector_anshan")?.marketAdminAlignmentUnverified !== true
  || normalizedStringSet(
    registryById.get("sector_anshan")?.sharedEdgeReview ?? [],
  ) !== normalizedStringSet(["控江路", "五角场", "东外滩", "曲阳"])) {
  error("sector_anshan: 必须显式保留异名行政代理和四向共享边复核字段");
}
if (!nearlyEqual(
  Number(candidateById.get("sector_anshan")?.properties?.areaSquareKilometers),
  2.6433,
  0.001,
)) {
  error("sector_anshan: 四平路街道固定行政代理面积必须保持约 2.6433 平方公里");
}
if (!nearlyEqual(
  Number(candidateById.get("sector_zhongyuan")?.properties?.areaSquareKilometers),
  4.6819,
  0.001,
)) {
  error("sector_zhongyuan: 殷行街道军工路以西候选面积必须保持约 4.6819 平方公里");
}
const zhongyuanDefinition = candidateDefinitionById.get("sector_zhongyuan");
const zhongyuanManifest = manifestById.get("sector_zhongyuan");
if (zhongyuanDefinition?.fullAdminRelationRejected !== true
  || zhongyuanDefinition?.adminProxyName !== "殷行街道军工路以西住宅区"
  || zhongyuanDefinition?.selectedSide !== "west"
  || zhongyuanDefinition?.expectedCutRoadName !== "军工路"
  || zhongyuanDefinition?.excludedArea !== "军工路以东企事业单位集聚区"
  || zhongyuanDefinition?.adminAreaVersionMismatch !== true
  || normalizedStringSet(zhongyuanDefinition?.sharedEdgeReview ?? [])
    !== normalizedStringSet(["新江湾城", "黄兴公园", "五角场"])
  || candidateById.get("sector_zhongyuan")?.properties?.adminProxyName
    !== "殷行街道军工路以西住宅区"
  || candidateById.get("sector_zhongyuan")?.properties?.fullAdminRelationRejected
    !== true
  || candidateById.get("sector_zhongyuan")?.properties?.adminAreaVersionMismatch
    !== true
  || candidateById.get("sector_zhongyuan")?.properties?.excludedArea
    !== "军工路以东企事业单位集聚区"
  || normalizedStringSet(
    candidateById.get("sector_zhongyuan")?.properties?.sharedEdgeReview ?? [],
  ) !== normalizedStringSet(["新江湾城", "黄兴公园", "五角场"])
  || zhongyuanDefinition?.protectedAdminRelations?.length !== 1
  || String(
    zhongyuanDefinition?.protectedAdminRelations?.[0]?.osmAdminRelationId,
  ) !== "13466408"
  || zhongyuanDefinition?.protectedAdminRelations?.[0]?.expectedOsmName
    !== "长海路街道"
  || candidateById.get("sector_zhongyuan")?.properties
    ?.protectedAdminRelations?.length !== 1
  || registryById.get("sector_zhongyuan")?.adminProxyName
    !== "殷行街道军工路以西住宅区"
  || registryById.get("sector_zhongyuan")?.fullAdminRelationRejected !== true
  || registryById.get("sector_zhongyuan")?.adminAreaVersionMismatch !== true
  || registryById.get("sector_zhongyuan")?.excludedArea
    !== "军工路以东企事业单位集聚区"
  || normalizedStringSet(
    registryById.get("sector_zhongyuan")?.sharedEdgeReview ?? [],
  ) !== normalizedStringSet(["新江湾城", "黄兴公园", "五角场"])
  || zhongyuanManifest?.osmRefs?.fullAdminRelationRejected !== true
  || zhongyuanManifest?.osmRefs?.selectedSide !== "west"
  || zhongyuanManifest?.osmRefs?.selectedSideVerified !== true
  || zhongyuanManifest?.osmRefs?.cutRoadName !== "军工路"
  || zhongyuanManifest?.osmRefs?.excludedArea !== "军工路以东企事业单位集聚区"
  || normalizedStringSet(zhongyuanManifest?.osmRefs?.cutRoadOsmRefs ?? [])
    !== normalizedStringSet(zhongyuanDefinition?.cutRoadOsmIds ?? [])
  || Number(
    zhongyuanManifest?.osmRefs?.roadBoundaryCoverageWithinToleranceMeters,
  ) < 3900) {
  error("sector_zhongyuan: 必须锁定军工路对象并明确拒绝完整殷行街道、排除道路以东企事业区");
}
const zhongyuanProtectedAdminRelation = (
  zhongyuanManifest?.osmRefs?.protectedAdminRelations ?? []
).find(({ osmAdminRelationId }) => osmAdminRelationId === "13466408");
if (zhongyuanProtectedAdminRelation?.expectedOsmName !== "长海路街道"
  || Number(zhongyuanProtectedAdminRelation?.overlapSquareMeters) > 0.01
  || Number(
    zhongyuanProtectedAdminRelation?.maximumOverlapSquareMeters,
  ) !== 0.01) {
  error("sector_zhongyuan: 必须锁定长海路街道 relation 13466408 并保持正面积重叠为零");
}
const zhongyuanEastEvidence = edgeById.get("zhongyuan-east");
if (zhongyuanEastEvidence?.basisType
    !== "official_function_divide_osm_road_cut"
  || zhongyuanEastEvidence?.sourceId
    !== "official-yangpu-yinhang-subdistrict-profile-2025"
  || normalizedStringSet(zhongyuanEastEvidence?.osmRefs ?? [])
    !== normalizedStringSet(zhongyuanDefinition?.cutRoadOsmIds ?? [])) {
  error("sector_zhongyuan: 东侧军工路裁切边必须单独记录官方功能分区与锁定道路对象来源");
}
for (const [firstId, secondId, minimumSharedLengthMeters] of [
  ["sector_anshan", "sector_kongjianglu", 700],
  ["sector_anshan", "sector_wujiaochang", 800],
  ["sector_zhongyuan", "sector_xinjiangwancheng", 1000],
]) {
  const first = candidateById.get(firstId);
  const second = candidateById.get(secondId);
  const sharedLength = first && second
    ? sharedBoundaryLengthMeters(first.geometry, second.geometry)
    : 0;
  if (sharedLength < minimumSharedLengthMeters) {
    error(`${firstId} / ${secondId}: 研究要求的行政共享边未通过无缝复核`);
  }
}
for (const unresolvedName of [
  "瑞虹新城", "鲁迅公园", "东外滩", "定海路", "黄兴公园",
]) {
  if ([...registryById.values()].some(
    (record) => record.canonicalName === unresolvedName,
  )) {
    error(`虹口—杨浦第二批证据不足，不得自动注册 ${unresolvedName}`);
  }
}

const gubeiDefinition = candidateDefinitionById.get("sector_gubei");
const changningHongqiaoDefinition = candidateDefinitionById.get(
  "sector_changning_hongqiao",
);
const gubeiCandidate = candidateById.get("sector_gubei");
const changningHongqiaoCandidate = candidateById.get(
  "sector_changning_hongqiao",
);
const gubeiRegistry = registryById.get("sector_gubei");
const changningHongqiaoRegistry = registryById.get(
  "sector_changning_hongqiao",
);
const gubeiManifest = manifestById.get("sector_gubei");
const changningHongqiaoManifest = manifestById.get(
  "sector_changning_hongqiao",
);
if (gubeiDefinition?.method !== "market_four_sides_osm_linear_component"
  || gubeiDefinition?.officialAreaSquareKilometers !== 1.366
  || gubeiCandidate?.properties?.confidence !== "medium"
  || gubeiRegistry?.reviewStatus !== "draft-medium"
  || gubeiRegistry?.geometry?.publicationPolicy !== "internal_review") {
  error("sector_gubei: 必须保持官方四至重建的 medium / draft-medium 内部候选");
}
for (const anchor of gubeiDefinition?.boundaryAnchors ?? []) {
  const manifestAnchor = gubeiManifest?.osmRefs?.boundaryAnchors?.find(
    (item) => item.side === anchor.side,
  );
  if (!manifestAnchor
    || manifestAnchor.identityStatus !== "verified-by-osm-name"
    || manifestAnchor.centerlineToleranceMeters !== 15
    || manifestAnchor.boundaryCoverageWithinToleranceMeters
      < anchor.minimumBoundaryCoverageMeters) {
    error(`sector_gubei: ${anchor.side} 侧必须达到声明的命名道路覆盖长度`);
  }
}
if (changningHongqiaoDefinition?.method
    !== "market_admin_candidate_with_shared_topology"
  || String(changningHongqiaoDefinition?.osmAdminRelationId) !== "13469352"
  || !(changningHongqiaoDefinition?.subtractSectorIds ?? [])
    .includes("sector_gubei")
  || !(changningHongqiaoManifest?.osmRefs?.subtractedSectorIds ?? [])
    .includes("sector_gubei")
  || changningHongqiaoCandidate?.properties?.confidence !== "low"
  || changningHongqiaoRegistry?.reviewStatus !== "draft-low"
  || changningHongqiaoRegistry?.geometry?.publicationPolicy !== "internal_review") {
  error("sector_changning_hongqiao: 必须保持虹桥街道减古北的 low / draft-low 推导候选");
}
const gubeiPolygonGroups = gubeiCandidate
  ? polygonGroupsForGeometry(gubeiCandidate.geometry)
  : [];
const changningHongqiaoPolygonGroups = changningHongqiaoCandidate
  ? polygonGroupsForGeometry(changningHongqiaoCandidate.geometry)
  : [];
if (gubeiPolygonGroups.length !== 1 || gubeiPolygonGroups[0]?.length !== 1) {
  error("sector_gubei: 古北必须是无数值内洞的单一 Polygon");
}
if (changningHongqiaoPolygonGroups.length !== 1
  || changningHongqiaoPolygonGroups[0]?.length !== 2) {
  error("sector_changning_hongqiao: 住宅虹桥必须以单一 Polygon 内洞完整扣除古北");
}
const exactGubeiHongqiaoSharedLength = gubeiCandidate && changningHongqiaoCandidate
  ? exactSharedBoundaryLengthMetersIncludingHoles(
    gubeiCandidate.geometry,
    changningHongqiaoCandidate.geometry,
  )
  : 0;
const gubeiOuterBoundaryLength = gubeiPolygonGroups[0]?.[0]
  ? ringLengthMeters(gubeiPolygonGroups[0][0])
  : 0;
if (gubeiOuterBoundaryLength <= 0
  || Math.abs(exactGubeiHongqiaoSharedLength - gubeiOuterBoundaryLength) > 0.01) {
  error("sector_gubei / sector_changning_hongqiao: 古北扣除边必须保持完整精确共边");
}
if (protectedHongqiaoBusinessCandidate?.properties?.scopeVersion
    !== "market-core-function-corridor-2026-07"
  || protectedHongqiaoBusinessCandidate?.properties?.areaSquareKilometers
    !== 16.8075
  // Baseline is the exact pre-batch geometry from commit 2c057ca.
  || geometrySha256(protectedHongqiaoBusinessCandidate?.geometry)
    !== "1ec7da5352ca8d8002828437b1eccb176dc64f53db67d98db3b120be4985396b") {
  error("sector_hongqiao: 长宁住宅虹桥批次不得改写虹桥商务区候选");
}

const zhongshanParkDefinition = candidateDefinitionById.get(
  "sector_zhongshangongyuan",
);
const zhongshanParkCandidate = candidateById.get("sector_zhongshangongyuan");
const zhongshanParkRegistry = registryById.get("sector_zhongshangongyuan");
const zhongshanParkManifest = manifestById.get("sector_zhongshangongyuan");
if (zhongshanParkDefinition?.method !== "market_four_sides_osm_linear_component"
  || zhongshanParkCandidate?.properties?.areaSquareKilometers !== 1.0727
  || zhongshanParkCandidate?.properties?.confidence !== "medium"
  || zhongshanParkRegistry?.reviewStatus !== "draft-medium"
  || zhongshanParkRegistry?.geometry?.publicationPolicy !== "internal_review") {
  error("sector_zhongshangongyuan: 必须保持官方道路围合的 medium 内部核心候选");
}
if (zhongshanParkDefinition?.boundaryAnchors?.length !== 4) {
  error("sector_zhongshangongyuan: 必须完整登记四侧官方道路锚点");
}
for (const anchor of zhongshanParkDefinition?.boundaryAnchors ?? []) {
  const manifestAnchor = zhongshanParkManifest?.osmRefs?.boundaryAnchors?.find(
    (item) => item.side === anchor.side,
  );
  if (!manifestAnchor
    || manifestAnchor.identityStatus !== "verified-by-osm-name"
    || manifestAnchor.centerlineToleranceMeters !== 15
    || manifestAnchor.boundaryCoverageWithinToleranceMeters
      < anchor.minimumBoundaryCoverageMeters) {
    error(`sector_zhongshangongyuan: ${anchor.side} 侧必须达到声明的官方命名道路覆盖长度`);
  }
}
if ([...registryById.values()].some(
  (record) => record.canonicalName === "西郊",
)) {
  error("sector_zhongshangongyuan: 中山公园核心批次不得在联合裁定前自动注册西郊");
}

const qiantanPrimaryCandidate = candidateById.get("sector_qiantan");
const yangsiPrimaryCandidate = candidateById.get("sector_yangsi");
if (!qiantanPrimaryCandidate || qiantanPrimaryCandidate.properties?.name !== "前滩") {
  error("sector_qiantan: 前滩必须保持独立一级候选面");
}
if (!yangsiPrimaryCandidate || yangsiPrimaryCandidate.properties?.name !== "杨思") {
  error("sector_yangsi: 杨思必须保持独立一级候选面");
} else if (!yangsiPrimaryCandidate.properties?.excludedMarketAreas?.includes("前滩")) {
  error("sector_yangsi: 必须显式记录从原合并范围扣除前滩");
}
if (subscopes.some((feature) => (
  feature.properties?.id === "subscope_qiantan_z000801"
  || feature.properties?.scopeVersion === "Z000801-ES4"
  || feature.properties?.name === "前滩（Z000801 / ES4）"
))) {
  error("sector_qiantan: 前滩已升级为一级板块，不得继续登记为杨思内部子范围");
}
const yangsiManifest = manifestById.get("sector_yangsi");
const yangsiReconstructionError = yangsiManifest
  ?.osmRefs?.differenceReconstructionErrorSquareMeters;
if (yangsiPrimaryCandidate
  && yangsiPrimaryCandidate.properties?.topologyMaxBoundaryDisplacementMeters > 0.1) {
  error("sector_yangsi: 严格差集候选不得再被相邻拓扑走廊扩张");
}
if (!Number.isFinite(yangsiReconstructionError)
  || yangsiReconstructionError > 1) {
  error("sector_yangsi: 原合并面减前滩的差集重建误差必须不超过 1 平方米");
}
const sanlinMarketCandidate = candidateById.get("sector_sanlin");
const dongmingMarketPoint = [121.5127542, 31.1454076];
if (!sanlinMarketCandidate) {
  error("sector_sanlin: 用户已裁定楼市三林包含东明路街道，必须提供连续候选面");
} else if (!pointInGeometryStrict(dongmingMarketPoint, sanlinMarketCandidate.geometry)) {
  error("sector_sanlin: 楼市候选面必须包含东明路街道中心测试点");
} else {
  const sanlinPolygons = polygonGroupsForGeometry(sanlinMarketCandidate.geometry);
  if (sanlinPolygons.length !== 1 || sanlinPolygons[0].length !== 1) {
    error("sector_sanlin: 楼市三林必须是填平东明路行政内洞后的单一连续面");
  }
  if (!sanlinMarketCandidate.properties?.includedMarketAreas?.includes("东明路街道")) {
    error("sector_sanlin: 候选面必须显式记录东明路街道的市场归属");
  }
}
for (const candidate of candidates) {
  const id = candidate.properties?.id ?? "unknown-candidate";
  const record = registryById.get(id);
  if (!record) {
    error(`${id}: 候选几何没有 registry 记录`);
    continue;
  }
  if (candidate.properties.status !== "reviewed-candidate") error(`${id}: 候选 status 必须是 reviewed-candidate`);
  if (candidate.properties.coordinateSystem !== "WGS84") error(`${id}: 候选主几何必须保存为 WGS84`);
  if (candidate.properties.geometrySourceSnapshotId !== osmSourceLock.id) error(`${id}: 候选来源快照不匹配`);
  if (!record.geometry.sourceIds.includes(osmSourceLock.id)) error(`${id}: 候选 registry 缺少锁定 OSM 几何来源`);
  if (!manifestById.has(id)) error(`${id}: 候选几何缺少 OSM 对象 manifest`);
  if (!isFinitePositive(candidate.properties.areaSquareKilometers)) error(`${id}: 候选面积无效`);
  const candidateDefinition = candidateDefinitionById.get(id);
  if (candidateDefinition?.historicalReferenceAreaSquareKilometers) {
    if (!nearlyEqual(
      candidate.properties.historicalReferenceAreaSquareKilometers,
      candidateDefinition.historicalReferenceAreaSquareKilometers,
      0.0001,
    ) || candidate.properties.historicalReferenceAreaAsOf
      !== candidateDefinition.historicalReferenceAreaAsOf) {
      error(`${id}: 历史面积参考值或时间口径与 definition 不一致`);
    }
    if (candidate.properties.officialAreaSquareKilometers !== undefined) {
      error(`${id}: 调整前历史面积不得冒充调整后官方面积硬校验`);
    }
  }
  validateWgs84PolygonalGeometry(candidate, `${id}: 候选面`, candidate.properties.labelPoint);

  const featureAnchors = candidate.properties.boundaryAnchors ?? [];
  const manifestAnchors = manifestById.get(id)?.osmRefs?.boundaryAnchors ?? [];
  if (featureAnchors.length > 0 || manifestAnchors.length > 0) {
    const featureSides = featureAnchors.map((anchor) => anchor.side);
    const manifestSides = manifestAnchors.map((anchor) => anchor.side);
    if (normalizedStringSet(featureSides) !== normalizedStringSet(requiredBoundarySides)
      || normalizedStringSet(manifestSides) !== normalizedStringSet(requiredBoundarySides)) {
      error(`${id}: 逐边锚点必须完整覆盖 north/east/south/west`);
    }
    for (const featureAnchor of featureAnchors) {
      const label = `${id}: ${featureAnchor.side} 侧锚点`;
      const manifestAnchor = manifestAnchors.find((anchor) => anchor.side === featureAnchor.side);
      if (!manifestAnchor) {
        error(`${label} 缺少 manifest 记录`);
        continue;
      }
      if (![
        "verified-by-osm-name",
        "verified-name-alignment-candidate",
        "unverified-candidate",
      ].includes(featureAnchor.identityStatus)) {
        error(`${label} identityStatus 无效`);
      }
      if (featureAnchor.identityStatus !== manifestAnchor.identityStatus
        || featureAnchor.expectedIdentity !== manifestAnchor.expectedIdentity
        || featureAnchor.featureType !== manifestAnchor.featureType) {
        error(`${label} feature 与 manifest 身份字段不一致`);
      }
      if (!Array.isArray(featureAnchor.verificationSourceIds)
        || featureAnchor.verificationSourceIds.length === 0) {
        error(`${label} 缺少 verificationSourceIds`);
      } else {
        for (const sourceId of featureAnchor.verificationSourceIds) {
          if (!sourceById.has(sourceId)) error(`${label} 引用了不存在的 sourceId ${sourceId}`);
        }
      }
      if (!Array.isArray(manifestAnchor.osmRefs) || manifestAnchor.osmRefs.length === 0) {
        error(`${label} 缺少锁定 OSM 对象`);
      }
      if (!Array.isArray(manifestAnchor.inputOsmRefs)
        || manifestAnchor.inputOsmRefs.length < manifestAnchor.osmRefs.length
        || manifestAnchor.osmRefs.some((ref) => !manifestAnchor.inputOsmRefs.includes(ref))) {
        error(`${label} 输入对象与边界贴合对象的来源链无效`);
      }
      if (manifestAnchor.centerlineToleranceMeters !== 15) {
        error(`${label} 必须以 15 米容差核验中心线贴合`);
      }
      if (!isFinitePositive(manifestAnchor.boundaryCoverageWithinToleranceMeters)) {
        error(`${label} 缺少有效的中心线覆盖长度`);
      }
      if (manifestAnchor.coverageStage !== "final-topology") {
        error(`${label} 覆盖率必须针对最终拓扑几何复算`);
      }
      const featureComponents = featureAnchor.components ?? [];
      const manifestComponents = manifestAnchor.components ?? [];
      if (featureAnchor.featureType === "composite-linear") {
        if (featureComponents.length < 2
          || featureComponents.length !== manifestComponents.length) {
          error(`${label} 复合边界必须完整记录各组成道路或水系`);
        }
        for (const [componentIndex, featureComponent] of featureComponents.entries()) {
          const manifestComponent = manifestComponents[componentIndex];
          const componentLabel = `${label} 组成 ${componentIndex + 1}`;
          if (!manifestComponent
            || featureComponent.featureType !== manifestComponent.featureType
            || featureComponent.expectedIdentity !== manifestComponent.expectedIdentity) {
            error(`${componentLabel} feature 与 manifest 身份字段不一致`);
            continue;
          }
          if (!Array.isArray(manifestComponent.osmRefs)
            || manifestComponent.osmRefs.length === 0) {
            error(`${componentLabel} 缺少锁定 OSM 对象`);
          }
          if (!Array.isArray(manifestComponent.inputOsmRefs)
            || manifestComponent.inputOsmRefs.length < manifestComponent.osmRefs.length
            || manifestComponent.osmRefs.some(
              (ref) => !manifestComponent.inputOsmRefs.includes(ref),
            )) {
            error(`${componentLabel} 输入对象与边界贴合对象的来源链无效`);
          }
        }
      } else if (featureComponents.length > 0 || manifestComponents.length > 0) {
        error(`${label} 非复合边界不应声明 components`);
      }
      if (featureAnchor.identityStatus.endsWith("candidate")) {
        const edge = record.boundaryEvidenceIds
          .map((edgeId) => edgeById.get(edgeId))
          .find((item) => item?.side === featureAnchor.side);
        if (!edge || edge.status === "definition_confirmed" || edge.confidence !== "low") {
          error(`${label} 未核验身份必须在边界证据中保持 low 且不得标记 definition_confirmed`);
        }
      }
    }
  }

  const sharedEdgeSectorIds = candidate.properties.sharedEdgeSectorIds ?? [];
  const manifestSharedEdgeSectorIds = manifestById.get(id)?.osmRefs?.sharedEdgeSectorIds ?? [];
  if (normalizedStringSet(sharedEdgeSectorIds)
    !== normalizedStringSet(manifestSharedEdgeSectorIds)) {
    error(`${id}: 候选面与 manifest 的共享边板块记录不一致`);
  }
  const snapDependencySectorIds = candidate.properties.snapDependencySectorIds ?? [];
  const manifestSnapDependencySectorIds = manifestById.get(id)?.osmRefs?.snapDependencySectorIds ?? [];
  if (normalizedStringSet(snapDependencySectorIds)
    !== normalizedStringSet(manifestSnapDependencySectorIds)) {
    error(`${id}: 候选面与 manifest 的吸附依赖记录不一致`);
  }
  if (snapDependencySectorIds.some(
    (sectorId) => !sharedEdgeSectorIds.includes(sectorId),
  )) {
    error(`${id}: 吸附依赖必须同时登记为对称共享边`);
  }

  if (topologySectorIds.has(id)) {
    const topologySnapDistance = candidate.properties.topologySnapDistanceMeters;
    const topologyDisplacement = candidate.properties.topologyMaxBoundaryDisplacementMeters;
    if (!isFinitePositive(topologySnapDistance)
      || !Number.isFinite(topologyDisplacement)
      || topologyDisplacement < 0
      || topologyDisplacement > topologySnapDistance + 0.1) {
      error(`${id}: 最终拓扑位移必须有效且不超过声明连接距离`);
    }
  }
}

for (const candidate of candidates) {
  const id = candidate.properties?.id;
  for (const neighborId of candidate.properties?.sharedEdgeSectorIds ?? []) {
    const neighbor = candidateById.get(neighborId);
    if (!neighbor) {
      error(`${id}: 共享边板块 ${neighborId} 缺少候选几何`);
    } else if (!(neighbor.properties?.sharedEdgeSectorIds ?? []).includes(id)) {
      error(`${id} / ${neighborId}: 共享边关系必须双向一致`);
    }
  }
}

for (let first = 0; first < candidates.length; first += 1) {
  for (let second = first + 1; second < candidates.length; second += 1) {
    const firstPolygons = polygonGroupsForGeometry(candidates[first].geometry);
    const secondPolygons = polygonGroupsForGeometry(candidates[second].geometry);
    const pairLabel = `${candidates[first].properties.name} / ${candidates[second].properties.name}`;
    if (firstPolygons.some((firstPolygon, firstPolygonIndex) => (
      secondPolygons.some((secondPolygon, secondPolygonIndex) => polygonsHaveAreaOverlap(
        firstPolygon,
        secondPolygon,
        `${pairLabel} polygon ${firstPolygonIndex + 1} × ${secondPolygonIndex + 1}`,
      ))
    ))) {
      error(
        `${candidates[first].properties.name} 与 ${candidates[second].properties.name}`
        + " 的主板块候选面发生面积重叠",
      );
    }
  }
}

for (const {
  firstId,
  secondId,
  minimumSharedLengthMeters,
} of [
  {
    firstId: "sector_qiantan",
    secondId: "sector_yangsi",
    minimumSharedLengthMeters: 4_900,
  },
  {
    firstId: "sector_qiantan",
    secondId: "sector_sanlin",
    minimumSharedLengthMeters: 2_500,
  },
  {
    firstId: "sector_yangsi",
    secondId: "sector_shangnan",
    minimumSharedLengthMeters: 450,
  },
  {
    firstId: "sector_yangsi",
    secondId: "sector_shibo",
    minimumSharedLengthMeters: 2_000,
  },
  {
    firstId: "sector_shangnan",
    secondId: "sector_shibo",
    minimumSharedLengthMeters: 1_300,
  },
]) {
  const firstCandidate = candidateById.get(firstId);
  const secondCandidate = candidateById.get(secondId);
  if (!firstCandidate || !secondCandidate) {
    error(`${firstId} / ${secondId}: 缺少需要校验的共享边候选面`);
    continue;
  }
  const sharedLength = sharedBoundaryLengthMeters(
    firstCandidate.geometry,
    secondCandidate.geometry,
  );
  if (sharedLength < minimumSharedLengthMeters) {
    error(
      `${firstId} / ${secondId}: 共享边只有 ${sharedLength.toFixed(1)} 米，`
      + `低于 ${minimumSharedLengthMeters} 米`,
    );
  }
}

const subscopeManifestById = new Map(subscopeManifestEntries.map((item) => [item.id, item]));
for (const subscope of subscopes) {
  const id = subscope.properties?.id ?? "unknown-subscope";
  const properties = subscope.properties ?? {};
  const manifest = subscopeManifestById.get(id);
  const parent = candidateById.get(properties.parentSectorId);
  if (!manifest) error(`${id}: 子范围缺少 manifest`);
  if (!parent) error(`${id}: 子范围缺少候选主板块 ${properties.parentSectorId}`);
  if (properties.status !== "official-reference-subscope") {
    error(`${id}: 子范围 status 必须是 official-reference-subscope`);
  }
  if (properties.coordinateSystem !== "WGS84") error(`${id}: 子范围必须保存为 WGS84`);
  if (properties.geometrySourceSnapshotId !== osmSourceLock.id) error(`${id}: 子范围来源快照不匹配`);
  if (manifest?.parentSectorId !== properties.parentSectorId) error(`${id}: 子范围 parentSectorId 与 manifest 不一致`);
  if (!isFinitePositive(properties.areaSquareKilometers)) error(`${id}: 子范围面积无效`);
  if (!isFinitePositive(properties.officialAreaSquareKilometers)) error(`${id}: 子范围官方参考面积无效`);
  if (!Number.isFinite(manifest?.outsideParentAreaRatio)
    || manifest.outsideParentAreaRatio < 0
    || manifest.outsideParentAreaRatio > 0.001) {
    error(`${id}: 子范围超出主板块比例无效`);
  }
  validateWgs84PolygonalGeometry(subscope, `${id}: 子范围`, properties.labelPoint);
  if (parent && !pointInGeometryStrict(properties.labelPoint, parent.geometry)) {
    error(`${id}: 子范围标签点不在主板块内`);
  }
}

validateLockedOsmCollection(
  adminReferenceData,
  adminReferenceManifest,
  "行政参考几何",
  "internal-reference",
);
if (adminReferenceDefinitionsData.sourceLock !== "data/geo/sources/osm-shanghai-260721.json") {
  error("行政参考面 definition 的 sourceLock 不正确");
}
if (adminReferenceDefinitionsData.workingCrs !== "EPSG:32651"
  || adminReferenceDefinitionsData.outputCrs !== "OGC:CRS84") {
  error("行政参考面 definition 的工作或输出坐标系不正确");
}
if (adminReferenceManifest.generatedFrom !== "data/geo/admin-reference-definitions.json") {
  error("行政参考面 manifest 的 generatedFrom 不正确");
}

const adminManifestById = new Map(adminReferenceManifestEntries.map((item) => [item.id, item]));
const adminDefinitionById = new Map(adminReferenceDefinitions.map((item) => [item.id, item]));
const adminReferenceById = new Map(adminReferences.map((feature) => [feature.properties?.id, feature]));
const expectedOfficialAreaAsOfById = new Map([
  ["sector_zhangjiang", "2022-pre-adjustment"],
  ["sector_beicai", "2023-pre-adjustment"],
]);
const seenOsmRelationIds = new Set();
for (const reference of adminReferences) {
  const id = reference.properties?.id ?? "unknown-admin-reference";
  const properties = reference.properties ?? {};
  const record = registryById.get(id);
  const manifest = adminManifestById.get(id);
  const definition = adminDefinitionById.get(id);
  if (!record) {
    error(`${id}: 行政参考面没有 registry 记录`);
    continue;
  }
  if (!manifest) {
    error(`${id}: 行政参考面缺少 manifest`);
    continue;
  }
  if (!definition) {
    error(`${id}: 行政参考面缺少 definition`);
    continue;
  }
  if (record.geometry.status !== "admin-reference" && !candidateById.has(id)) {
    error(`${id}: 行政参考面 registry 状态必须是 admin-reference，或同时存在市场候选面`);
  }
  if (properties.status !== "administrative-reference") error(`${id}: 行政参考面 status 必须是 administrative-reference`);
  if (properties.name !== record.canonicalName) error(`${id}: 行政参考面名称与 registry 不一致`);
  if (definition.canonicalName !== record.canonicalName) error(`${id}: definition canonicalName 与 registry 不一致`);
  if (properties.referenceAdminName !== manifest.referenceAdminName
    || properties.referenceAdminName !== definition.referenceAdminName) {
    error(`${id}: feature、manifest 与 definition 的 referenceAdminName 不一致`);
  }
  if (properties.scopeVersion !== manifest.scopeVersion || properties.scopeVersion !== definition.scopeVersion) {
    error(`${id}: feature、manifest 与 definition 的 scopeVersion 不一致`);
  }
  if (properties.coordinateSystem !== "WGS84") error(`${id}: 行政参考主几何必须保存为 WGS84`);
  if (properties.geometrySourceSnapshotId !== osmSourceLock.id) error(`${id}: 行政参考来源快照不匹配`);
  if (!record.geometry.sourceIds.includes(osmSourceLock.id)) error(`${id}: 行政参考 registry 缺少锁定 OSM 几何来源`);
  if (properties.method !== "osm_admin_relation_cross_checked_with_official_standard_map") {
    error(`${id}: 行政参考构建方法不正确`);
  }
  if (properties.geometryRule !== definition.geometryRule) error(`${id}: geometryRule 与 definition 不一致`);

  const relationId = manifest.osmRelationId;
  if (typeof relationId !== "string" || !/^\d+$/.test(relationId)) error(`${id}: OSM relation ID 无效`);
  else if (seenOsmRelationIds.has(relationId)) error(`${id}: OSM relation ID ${relationId} 重复`);
  else seenOsmRelationIds.add(relationId);
  if (typeof manifest.osmName !== "string" || manifest.osmName.length === 0) error(`${id}: manifest 缺少 OSM 名称`);
  if (relationId !== definition.osmAdminRelationId) error(`${id}: OSM relation ID 与锁定 definition 不一致`);
  if (manifest.osmName !== definition.expectedOsmName) error(`${id}: OSM 名称与锁定 definition 不一致`);

  const officialAreaAsOfValues = [
    definition.officialAreaAsOf ?? null,
    manifest.officialAreaAsOf ?? null,
    properties.officialAreaAsOf ?? null,
  ];
  if (new Set(officialAreaAsOfValues).size !== 1) {
    error(`${id}: definition、manifest 与 feature 的 officialAreaAsOf 不一致`);
  }
  if (officialAreaAsOfValues[0] !== null
    && (typeof officialAreaAsOfValues[0] !== "string" || officialAreaAsOfValues[0].length === 0)) {
    error(`${id}: officialAreaAsOf 必须是非空字符串`);
  }
  const expectedOfficialAreaAsOf = expectedOfficialAreaAsOfById.get(id);
  if (expectedOfficialAreaAsOf && officialAreaAsOfValues[0] !== expectedOfficialAreaAsOf) {
    error(`${id}: officialAreaAsOf 必须为 ${expectedOfficialAreaAsOf}`);
  }

  if (!Array.isArray(properties.verificationSourceIds)) error(`${id}: feature verificationSourceIds 必须是数组`);
  if (!Array.isArray(manifest.verificationSourceIds)) error(`${id}: manifest verificationSourceIds 必须是数组`);
  if (!Array.isArray(record.geometry.verificationSourceIds)) error(`${id}: registry verificationSourceIds 必须是数组`);
  if (!Array.isArray(definition.verificationSourceIds)) error(`${id}: definition verificationSourceIds 必须是数组`);
  const featureVerificationSourceIds = Array.isArray(properties.verificationSourceIds)
    ? properties.verificationSourceIds
    : [];
  const manifestVerificationSourceIds = Array.isArray(manifest.verificationSourceIds)
    ? manifest.verificationSourceIds
    : [];
  const registryVerificationSourceIds = Array.isArray(record.geometry.verificationSourceIds)
    ? record.geometry.verificationSourceIds
    : [];
  const definitionVerificationSourceIds = Array.isArray(definition.verificationSourceIds)
    ? definition.verificationSourceIds
    : [];
  if (new Set(featureVerificationSourceIds).size !== featureVerificationSourceIds.length) {
    error(`${id}: feature verificationSourceIds 存在重复`);
  }
  if (normalizedStringSet(featureVerificationSourceIds) !== normalizedStringSet(manifestVerificationSourceIds)
    || normalizedStringSet(featureVerificationSourceIds) !== normalizedStringSet(registryVerificationSourceIds)
    || normalizedStringSet(featureVerificationSourceIds)
      !== normalizedStringSet(definitionVerificationSourceIds)) {
    error(`${id}: feature、manifest、registry 与 definition 的 verificationSourceIds 不一致`);
  }
  if (featureVerificationSourceIds.length < 2) error(`${id}: 行政参考面至少需要两个验证来源`);
  const verificationSources = featureVerificationSourceIds.map((sourceId) => sourceById.get(sourceId));
  for (const [index, verificationSource] of verificationSources.entries()) {
    if (!verificationSource) error(`${id}: verificationSourceId 不存在 ${featureVerificationSourceIds[index]}`);
  }
  if (!verificationSources.some((source) => source?.allowedUse === "visual_comparison_only")) {
    error(`${id}: verificationSourceIds 缺少 visual_comparison_only 标准图来源`);
  }
  if (!verificationSources.some((source) => source?.sourceType?.startsWith("official_")
    && source.sourceType !== "official_standard_map_collection"
    && typeof source.publisher === "string" && source.publisher.length > 0
    && source.allowedUse !== "visual_comparison_only")) {
    error(`${id}: verificationSourceIds 缺少独立官方面积或边界验证来源`);
  }

  const areaFields = [
    ["areaSquareKilometers", properties.areaSquareKilometers],
    ["unsimplifiedAreaSquareKilometers", properties.unsimplifiedAreaSquareKilometers],
    ["officialAreaSquareKilometers", properties.officialAreaSquareKilometers],
    ["manifest.displayAreaSquareKilometers", manifest.displayAreaSquareKilometers],
    ["manifest.unsimplifiedAreaSquareKilometers", manifest.unsimplifiedAreaSquareKilometers],
    ["manifest.officialAreaSquareKilometers", manifest.officialAreaSquareKilometers],
  ];
  for (const [field, value] of areaFields) {
    if (!isFinitePositive(value)) error(`${id}: ${field} 面积无效`);
  }
  if (!nearlyEqual(properties.areaSquareKilometers, manifest.displayAreaSquareKilometers, 0.0001)) {
    error(`${id}: feature 与 manifest 的显示面积不一致`);
  }
  if (!nearlyEqual(properties.unsimplifiedAreaSquareKilometers, manifest.unsimplifiedAreaSquareKilometers, 0.0001)) {
    error(`${id}: feature 与 manifest 的未简化面积不一致`);
  }
  if (!nearlyEqual(properties.officialAreaSquareKilometers, manifest.officialAreaSquareKilometers, 0.0001)) {
    error(`${id}: feature 与 manifest 的官方参考面积不一致`);
  }
  if (!nearlyEqual(properties.officialAreaSquareKilometers, definition.officialAreaSquareKilometers, 0.0001)) {
    error(`${id}: feature 与 definition 的官方参考面积不一致`);
  }
  if (definition.areaToleranceRatio !== 0.05) error(`${id}: definition 面积容差必须为 5%`);
  const expectedAreaDeltaPercent = Math.abs(
    properties.unsimplifiedAreaSquareKilometers - properties.officialAreaSquareKilometers,
  ) / properties.officialAreaSquareKilometers * 100;
  if (!nearlyEqual(properties.areaDeltaPercent, manifest.areaDeltaPercent, 0.01)
    || !nearlyEqual(properties.areaDeltaPercent, expectedAreaDeltaPercent, 0.011)) {
    error(`${id}: areaDeltaPercent 与面积字段不一致`);
  }
  if (properties.areaDeltaPercent > 5) error(`${id}: 行政参考面与官方面积差超过 5%`);
  const simplificationAreaDeltaRatio = Math.abs(
    properties.areaSquareKilometers - properties.unsimplifiedAreaSquareKilometers,
  ) / properties.unsimplifiedAreaSquareKilometers;
  if (simplificationAreaDeltaRatio > 0.005) error(`${id}: 10 米简化导致面积变化超过 0.5%`);
  if (properties.simplificationToleranceMeters !== 10 || manifest.simplificationToleranceMeters !== 10
    || definition.simplifyToleranceMeters !== 10) {
    error(`${id}: 行政参考面必须使用 10 米拓扑保持简化`);
  }

  validateWgs84PolygonalGeometry(reference, `${id}: 行政参考面`, properties.labelPoint);
  const measuredAreaSquareKilometers = geometryAreaSquareKilometers(reference.geometry);
  if (!Number.isFinite(measuredAreaSquareKilometers)) error(`${id}: 无法从 GeoJSON 计算显示面积`);
  else {
    const measuredAreaDeltaRatio = Math.abs(measuredAreaSquareKilometers - properties.areaSquareKilometers)
      / properties.areaSquareKilometers;
    if (measuredAreaDeltaRatio > 0.005) error(`${id}: GeoJSON 实测面积与声明显示面积相差超过 0.5%`);
  }
  if (!Number.isInteger(manifest.displayPointCount) || manifest.displayPointCount < 4) {
    error(`${id}: manifest displayPointCount 无效`);
  } else if (manifest.displayPointCount !== geometryPointCount(reference.geometry)) {
    error(`${id}: manifest displayPointCount 与实际坐标点数不一致`);
  }

  const standardMap = manifest.standardMap;
  if (!standardMap || !["consistent", "superseded_in_adjusted_segments"].includes(standardMap.manualShapeVerdict)) {
    error(`${id}: manifest 缺少有效的标准图人工核对结论`);
  } else {
    const standardMapFields = ["district", "title", "url", "mapDate", "reviewNumber", "manualShapeVerdict"];
    if (!definition.standardMap || standardMapFields.some(
      (field) => standardMap[field] !== definition.standardMap[field],
    )) {
      error(`${id}: manifest 标准图元数据与 definition 不一致`);
    }
    validateStandardMapDocument(standardMap, `${id}: manifest 标准图`);
  }
}

const allowedComparisonRoles = new Set([
  "functional_scope_not_admin",
  "admin_proxy_and_functional_scope_conflict",
  "official_scope_matches_admin_proxy",
  "admin_proxy",
  "cross_district_functional_scope",
]);
const allowedReferenceVerdicts = new Set([
  "not_directly_comparable",
  "scope_choice_required",
  "consistent",
  "standard_map_superseded_in_segments",
]);
const allowedGeometryDecisions = new Set([
  "keep_official_scope_candidate",
  "keep_market_candidate",
  "keep_market_candidate_with_subscope",
  "keep_market_candidate_with_admin_reference",
  "keep_demo_until_scope_selected",
  "show_admin_reference_without_replacing_market_definition",
  "show_post_adjustment_admin_reference",
  "show_admin_reference",
]);

if (normalizedJson(referenceChecksData.comparisonMetricMethod) !== normalizedJson(comparisonMetricMethod)) {
  error("reference-checks comparisonMetricMethod 与校验器实现不一致");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceChecksData.checkedAt ?? "")) {
  error("reference-checks checkedAt 必须使用 YYYY-MM-DD 格式");
}
for (const check of referenceChecks) {
  const id = check.sectorId ?? "unknown-reference-check";
  if (!registryById.has(id)) error(`${id}: reference-check 没有 registry 记录`);
  if (!allowedComparisonRoles.has(check.comparisonRole)) error(`${id}: comparisonRole 无效`);
  if (!allowedReferenceVerdicts.has(check.verdict)) error(`${id}: verdict 无效`);
  if (!allowedGeometryDecisions.has(check.geometryDecision)) error(`${id}: geometryDecision 无效`);
  if (typeof check.summary !== "string" || check.summary.trim().length === 0) error(`${id}: reference-check 缺少摘要`);
  if (["sector_shibo", "sector_shangnan"].includes(id)
    && check.verdict !== "standard_map_superseded_in_segments") {
    error(`${id}: 2025年7月标准图局部线位已被2025年11月公告调整段替代`);
  }

  const standardMapSource = sourceById.get(check.standardMapSourceId);
  if (!standardMapSource) error(`${id}: standardMapSourceId 不存在`);
  else if (standardMapSource.licenseStatus !== "reference_only"
    || standardMapSource.allowedUse !== "visual_comparison_only") {
    error(`${id}: 标准图来源必须是 reference_only / visual_comparison_only`);
  } else if (standardMapSource.url) {
    const hostname = validateAndGetHostname(standardMapSource.url, `${id}: 标准图来源`);
    if (hostname && hostname !== "shanghai.tianditu.gov.cn") error(`${id}: 标准图来源不是天地图上海`);
  }
  const standardMapDocuments = Array.isArray(check.standardMapDocuments) ? check.standardMapDocuments : [];
  if (standardMapDocuments.length === 0) {
    error(`${id}: reference-check 至少需要一份标准图文档`);
  } else {
    for (const [index, document] of standardMapDocuments.entries()) {
      validateStandardMapDocument(document, `${id}: 标准图文档 ${index + 1}`);
    }
  }

  const comparison = check.legacyGeometryComparison;
  if (comparison) {
    if (typeof comparison.reference !== "string" || comparison.reference.length === 0) {
      error(`${id}: legacyGeometryComparison.reference 无效`);
    }
    if (!Number.isFinite(comparison.intersectionOverUnion)
      || comparison.intersectionOverUnion < 0 || comparison.intersectionOverUnion > 1) {
      error(`${id}: intersectionOverUnion 必须位于 0 到 1`);
    }
    if (!Number.isFinite(comparison.referenceCoveredPercent)
      || comparison.referenceCoveredPercent < 0 || comparison.referenceCoveredPercent > 100) {
      error(`${id}: referenceCoveredPercent 必须位于 0 到 100`);
    }
    if (!isFinitePositive(comparison.legacyAreaRatio)) error(`${id}: legacyAreaRatio 必须大于 0`);
    if (!Number.isFinite(comparison.centroidDistanceKilometers)
      || comparison.centroidDistanceKilometers < 0) {
      error(`${id}: centroidDistanceKilometers 必须大于或等于 0`);
    }
    const legacyFeature = legacyFeatureById.get(id);
    const referenceFeature = comparison.reference === "reviewed-candidate"
      ? candidateById.get(id)
      : adminReferenceById.get(id);
    if (!legacyFeature) error(`${id}: 差异指标缺少旧演示面`);
    if (!referenceFeature) error(`${id}: 差异指标引用的参考面不存在`);
    if (legacyFeature && referenceFeature) {
      try {
        const recomputed = computeLegacyGeometryComparison(legacyFeature, referenceFeature, id);
        for (const field of [
          "intersectionOverUnion",
          "referenceCoveredPercent",
          "legacyAreaRatio",
          "centroidDistanceKilometers",
        ]) {
          if (!nearlyEqual(comparison[field], recomputed[field], 1e-9)) {
            error(`${id}: ${field} 应为 ${recomputed[field]}，实际为 ${comparison[field]}`);
          }
        }
      } catch (comparisonError) {
        const message = comparisonError instanceof Error ? comparisonError.message : String(comparisonError);
        error(`${id}: 无法复算差异指标：${message}`);
      }
    }
  }

  const candidate = candidateById.get(id);
  if (candidate) {
    const editorSeed = legacyFeatureById.get(id);
    const isGeneratedEditorSeed = editorSeed?.properties?.geometryRole
      === "generated-editor-seed";
    if (isGeneratedEditorSeed) {
      if (editorSeed.properties.generatedFromCandidateId !== id) {
        error(`${id}: 生成式编辑器底稿没有指向同 ID 候选面`);
      }
      if (comparison) {
        error(`${id}: 生成式编辑器底稿不得伪装为旧版几何做循环比较`);
      }
    } else if (!comparison) {
      error(`${id}: 候选面缺少旧演示面差异指标`);
    } else if (comparison.reference !== "reviewed-candidate") {
      error(`${id}: 候选面差异指标必须引用 reviewed-candidate`);
    }
  }

  const adminReference = adminReferenceById.get(id);
  const adminManifest = adminManifestById.get(id);
  if (adminReference && adminManifest) {
    if (check.comparableAdminName !== adminReference.properties.referenceAdminName) {
      error(`${id}: reference-check comparableAdminName 与行政参考面不一致`);
    }
    if (!comparison) error(`${id}: 行政参考面缺少旧演示面差异指标`);
    else if (!candidate && comparison.reference !== `osm-admin-relation-${adminManifest.osmRelationId}`) {
      error(`${id}: 差异指标引用的 OSM relation 与行政参考 manifest 不一致`);
    }
    const adminVerificationSourceIds = Array.isArray(adminReference.properties.verificationSourceIds)
      ? adminReference.properties.verificationSourceIds
      : [];
    if (!adminVerificationSourceIds.includes(check.standardMapSourceId)) {
      error(`${id}: standardMapSourceId 未列入行政参考面的 verificationSourceIds`);
    }
    const adminStandardMap = adminManifest.standardMap;
    if (!adminStandardMap || typeof adminStandardMap !== "object") {
      error(`${id}: 行政参考 manifest 缺少标准图元数据`);
    } else {
      const matchingManifestDocument = standardMapDocuments.some((document) => (
        document?.url === adminStandardMap.url
        && document?.mapDate === adminStandardMap.mapDate
        && document?.reviewNumber === adminStandardMap.reviewNumber
      ));
      if (!matchingManifestDocument) error(`${id}: reference-check 标准图文档与行政参考 manifest 不一致`);
      if (adminStandardMap.manualShapeVerdict === "superseded_in_adjusted_segments"
        && check.verdict !== "standard_map_superseded_in_segments") {
        error(`${id}: 标准图已被后续调整段替代，reference-check verdict 不一致`);
      }
    }
  } else if ([
    "show_admin_reference_without_replacing_market_definition",
    "show_post_adjustment_admin_reference",
    "show_admin_reference",
  ].includes(check.geometryDecision)) {
    error(`${id}: geometryDecision 要求显示行政参考面，但不存在对应几何`);
  }
}

for (let first = 0; first < features.length; first += 1) {
  for (let second = first + 1; second < features.length; second += 1) {
    const firstRing = features[first].geometry?.coordinates?.[0];
    const secondRing = features[second].geometry?.coordinates?.[0];
    if (firstRing && secondRing && ringsOverlap(firstRing, secondRing)) {
      warn(`${features[first].properties.name} 与 ${features[second].properties.name} 的编辑器入口演示面重叠`);
    }
  }
}

const restrictedGeometryHosts = [
  "map.hfwgsj.com",
  "lianjia.com",
  "ke.com",
  "amap.com",
  "baidu.com",
  "qq.com",
  "tianditu.gov.cn",
];
for (const record of registry) {
  for (const sourceId of record.geometry.sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source) continue;
    if (source.licenseStatus === "reference_only" || source.allowedUse === "visual_comparison_only") {
      error(`${record.id}: reference-only / visual-only 来源 ${sourceId} 不得作为 geometry.sourceIds`);
    }
    if (!source.url) continue;
    const hostname = validateAndGetHostname(source.url, `${record.id}: 几何来源 ${sourceId}`);
    if (!hostname) continue;
    if (restrictedGeometryHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      error(`${record.id}: 几何来源 ${hostname} 属于禁止直接复制入库的平台`);
    }
  }
}

const geometryCategorySummary = knownGeometryStatuses
  .map((status) => `${status}=${geometryStatusCounts.get(status)}`)
  .join("，");
console.log(`板块数据检查：${features.length} 个入口面底稿，${candidates.length} 个候选面，${subscopes.length} 个内部子范围，${adminReferences.length} 个行政参考面，${referenceChecks.length} 条逐板块参考检查，${registry.length} 条注册记录，${edges.length} 条边界证据，${sources.length} 个来源。`);
console.log(`几何分类：${geometryCategorySummary}。`);
for (const message of warnings) console.warn(`WARN ${message}`);
if (errors.length > 0) {
  for (const message of errors) console.error(`ERROR ${message}`);
  process.exitCode = 1;
} else {
  console.log(`通过：0 个错误，${warnings.length} 个待处理警告。`);
}
