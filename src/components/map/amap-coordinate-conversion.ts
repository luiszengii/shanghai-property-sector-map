import type { SectorGeometry } from "@/src/types/map";
import { coordinateKey, wgs84ToGcj02Position } from "@/src/lib/geo-coordinate-conversion";

export type DisplayPath = AMap.LngLat[] | AMap.LngLat[][] | AMap.LngLat[][][];

const displayPositionCacheByApi = new WeakMap<typeof AMap, Map<string, AMap.LngLat>>();

function getDisplayPositionCache(amapApi: typeof AMap) {
  let cache = displayPositionCacheByApi.get(amapApi);
  if (!cache) {
    cache = new Map();
    displayPositionCacheByApi.set(amapApi, cache);
  }
  return cache;
}

function wgs84PositionToLngLat(amapApi: typeof AMap, position: [number, number]) {
  const key = coordinateKey(...position);
  const cache = getDisplayPositionCache(amapApi);
  const cached = cache.get(key);
  if (cached) return cached;
  const converted = wgs84ToGcj02Position(position);
  const displayPosition = new amapApi.LngLat(converted[0], converted[1]);
  cache.set(key, displayPosition);
  return displayPosition;
}

function nativeRingToDisplayPath(amapApi: typeof AMap, ring: number[][]) {
  return ring.map(([lng, lat]) => new amapApi.LngLat(lng, lat));
}

function wgs84RingToDisplayPath(amapApi: typeof AMap, ring: number[][]) {
  return ring.map(([lng, lat]) => wgs84PositionToLngLat(amapApi, [lng, lat]));
}

function geometryToDisplayPath(
  amapApi: typeof AMap,
  geometry: SectorGeometry,
  convertRing: (amapApi: typeof AMap, ring: number[][]) => AMap.LngLat[],
): DisplayPath {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates.map((ring) => convertRing(amapApi, ring));
    return rings.length === 1 ? rings[0] : rings;
  }
  return geometry.coordinates.map((polygon) => polygon.map((ring) => convertRing(amapApi, ring)));
}

export function nativeGeometryToDisplayPath(amapApi: typeof AMap, geometry: SectorGeometry) {
  return Promise.resolve().then(() => geometryToDisplayPath(amapApi, geometry, nativeRingToDisplayPath));
}

export function wgs84GeometryToDisplayPath(
  amapApi: typeof AMap,
  geometry: SectorGeometry,
) {
  return Promise.resolve().then(() => geometryToDisplayPath(amapApi, geometry, wgs84RingToDisplayPath));
}

export function wgs84PointsToDisplayPositions(
  amapApi: typeof AMap,
  coordinates: Array<[number, number]>,
) {
  return Promise.resolve().then(() => coordinates.map((position) => wgs84PositionToLngLat(amapApi, position)));
}
