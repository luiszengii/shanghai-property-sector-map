export type DisplayCoordinateSystem = "WGS84" | "GCJ-02" | "GCJ-02-assumed";

const gcj02Axis = 6_378_245;
const gcj02EccentricitySquared = 0.006693421622965943;
const wgs84PositionCache = new Map<string, [number, number]>();

export function coordinateKey(lng: number, lat: number) {
  return `${lng.toFixed(6)},${lat.toFixed(6)}`;
}

function isOutsideMainlandChina(lng: number, lat: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLatitude(lngOffset: number, latOffset: number) {
  let result = -100 + 2 * lngOffset + 3 * latOffset + 0.2 * latOffset ** 2
    + 0.1 * lngOffset * latOffset + 0.2 * Math.sqrt(Math.abs(lngOffset));
  result += (20 * Math.sin(6 * lngOffset * Math.PI) + 20 * Math.sin(2 * lngOffset * Math.PI)) * 2 / 3;
  result += (20 * Math.sin(latOffset * Math.PI) + 40 * Math.sin(latOffset / 3 * Math.PI)) * 2 / 3;
  result += (160 * Math.sin(latOffset / 12 * Math.PI) + 320 * Math.sin(latOffset * Math.PI / 30)) * 2 / 3;
  return result;
}

function transformLongitude(lngOffset: number, latOffset: number) {
  let result = 300 + lngOffset + 2 * latOffset + 0.1 * lngOffset ** 2
    + 0.1 * lngOffset * latOffset + 0.1 * Math.sqrt(Math.abs(lngOffset));
  result += (20 * Math.sin(6 * lngOffset * Math.PI) + 20 * Math.sin(2 * lngOffset * Math.PI)) * 2 / 3;
  result += (20 * Math.sin(lngOffset * Math.PI) + 40 * Math.sin(lngOffset / 3 * Math.PI)) * 2 / 3;
  result += (150 * Math.sin(lngOffset / 12 * Math.PI) + 300 * Math.sin(lngOffset / 30 * Math.PI)) * 2 / 3;
  return result;
}

/**
 * Deterministic local approximation used only for GCJ-02 map display. It does
 * not modify or replace the WGS84 research geometry kept in the data catalog.
 */
export function wgs84ToGcj02Position(position: [number, number]): [number, number] {
  const [lng, lat] = position;
  if (isOutsideMainlandChina(lng, lat)) return [lng, lat];
  const key = coordinateKey(lng, lat);
  const cached = wgs84PositionCache.get(key);
  if (cached) return cached;

  const latitudeRadians = lat / 180 * Math.PI;
  const sinLatitude = Math.sin(latitudeRadians);
  const magic = 1 - gcj02EccentricitySquared * sinLatitude ** 2;
  const squareRootMagic = Math.sqrt(magic);
  const latitudeDelta = transformLatitude(lng - 105, lat - 35) * 180
    / ((gcj02Axis * (1 - gcj02EccentricitySquared)) / (magic * squareRootMagic) * Math.PI);
  const longitudeDelta = transformLongitude(lng - 105, lat - 35) * 180
    / (gcj02Axis / squareRootMagic * Math.cos(latitudeRadians) * Math.PI);
  const converted: [number, number] = [lng + longitudeDelta, lat + latitudeDelta];
  wgs84PositionCache.set(key, converted);
  return converted;
}

export function coordinateToDisplayPosition(
  position: [number, number],
  coordinateSystem: DisplayCoordinateSystem,
) {
  return coordinateSystem === "WGS84" ? wgs84ToGcj02Position(position) : position;
}
