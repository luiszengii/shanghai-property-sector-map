import polygonClipping from "polygon-clipping";

function geometryToMultiPolygon(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Unsupported partition geometry: ${geometry.type}`);
}

function multiPolygonToGeometry(coordinates) {
  if (!coordinates || coordinates.length === 0) return null;
  return coordinates.length === 1
    ? { type: "Polygon", coordinates: coordinates[0] }
    : { type: "MultiPolygon", coordinates };
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function multiPolygonArea(multiPolygon) {
  return multiPolygon.reduce((total, polygon) => (
    total
    + ringArea(polygon[0])
    - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0)
  ), 0);
}

function percent(part, whole) {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100_000_000) / 1_000_000;
}

export function trimRealtynaviGuardRings(rawRings) {
  return rawRings
    .filter(Array.isArray)
    .map((ring) => ring.length > 2 ? ring.slice(1, -1) : []);
}

export function buildCompleteDistrictPartition({
  districtGeometry,
  namedGeometries,
}) {
  const district = geometryToMultiPolygon(districtGeometry);
  const namedInputs = namedGeometries
    .filter(Boolean)
    .map(geometryToMultiPolygon);
  const namedUnion = namedInputs.length > 0
    ? polygonClipping.union(...namedInputs)
    : [];
  const namedInsideDistrict = namedUnion.length > 0
    ? polygonClipping.intersection(district, namedUnion)
    : [];
  const districtOutlineDifference = namedUnion.length > 0
    ? polygonClipping.difference(district, namedUnion)
    : district;
  const completed = namedInsideDistrict.length > 0
    ? polygonClipping.union(namedInsideDistrict, districtOutlineDifference)
    : districtOutlineDifference;
  const districtArea = multiPolygonArea(district);
  const uncoveredAfterCompletion = completed.length > 0
    ? polygonClipping.difference(district, completed)
    : district;
  const uncoveredRatio = districtArea === 0
    ? 1
    : multiPolygonArea(uncoveredAfterCompletion) / districtArea;

  return {
    districtOutlineDifferenceGeometry: multiPolygonToGeometry(
      districtOutlineDifference,
    ),
    namedCoveragePercent: percent(
      multiPolygonArea(namedInsideDistrict),
      districtArea,
    ),
    completedCoveragePercent: uncoveredRatio <= 0.0000001
      ? 100
      : percent(districtArea - multiPolygonArea(uncoveredAfterCompletion), districtArea),
  };
}
