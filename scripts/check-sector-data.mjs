import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
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
const candidateDefinitionsData = readJson("data/geo/reviewed-candidate-definitions.json");
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

function segmentSharedLengthMeters(firstStart, firstEnd, secondStart, secondEnd) {
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
  if (directionCross / (firstLength * secondLength) > 1e-8) return 0;
  const distanceToFirstLine = (point) => Math.abs(
    firstVector[0] * (point[1] - firstStart[1])
    - firstVector[1] * (point[0] - firstStart[0]),
  ) / firstLength;
  if (distanceToFirstLine(secondStart) > 0.05
    || distanceToFirstLine(secondEnd) > 0.05) return 0;

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

function sharedBoundaryLengthMeters(firstGeometry, secondGeometry) {
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
          );
        }
      }
    }
  }
  return total;
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
const candidateGeometryStatuses = new Set(["draft", "reviewed", "published"]);
const knownGeometryStatuses = ["missing", "demo", "admin-reference", ...candidateGeometryStatuses];
const geometryStatusCounts = new Map(knownGeometryStatuses.map((status) => [status, 0]));

for (const record of registry) {
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
  if (record.geometry.status !== "missing") {
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
if (subscopes.some((feature) => feature.properties?.parentSectorId === "sector_qiantan")) {
  error("sector_qiantan: 前滩已升级为一级板块，不得继续登记为杨思内部子范围");
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
    minimumSharedLengthMeters: 5_000,
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
