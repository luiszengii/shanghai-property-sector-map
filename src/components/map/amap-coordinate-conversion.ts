import type { SectorGeometry } from "@/src/types/map";

export type DisplayPath = AMap.LngLat[] | AMap.LngLat[][] | AMap.LngLat[][][];

type AMapConversionResult = { locations?: AMap.LngLat[]; info?: string; infocode?: string } | string | null | undefined;

const conversionChunkSize = 40;
const conversionMinIntervalMs = 450;
const conversionRetryDelaysMs = [1_000, 2_000];

let coordinateConversionQueue: Promise<void> = Promise.resolve();
let nextCoordinateConversionAt = 0;
const wgs84PathCacheByApi = new WeakMap<typeof AMap, Map<string, Promise<DisplayPath>>>();
const wgs84PointBatchCacheByApi = new WeakMap<typeof AMap, Map<string, Promise<AMap.LngLat[]>>>();

function chunked<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function normalizedCoordinate(lng: number, lat: number) {
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))] as const;
}

function coordinateKey(lng: number, lat: number) {
  return normalizedCoordinate(lng, lat).join(",");
}

function waitForMs(duration: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, duration));
}

function conversionError(result: AMapConversionResult) {
  if (typeof result === "string") return new Error(result);
  if (!result) return new Error("WGS84 坐标转换失败");
  const error = new Error(result.info || "WGS84 坐标转换失败") as Error & { infocode?: string };
  error.infocode = result.infocode;
  return error;
}

function runQueuedConversion(amapApi: typeof AMap, input: AMap.LngLat[]) {
  const run = async () => {
    const waitDuration = Math.max(0, nextCoordinateConversionAt - Date.now());
    if (waitDuration > 0) await waitForMs(waitDuration);
    try {
      return await new Promise<AMap.LngLat[]>((resolve, reject) => {
        amapApi.convertFrom(input, "gps", (status: string, result: AMapConversionResult) => {
          if (result && typeof result !== "string" && status === "complete" && result.info === "ok" && Array.isArray(result.locations)) {
            resolve(result.locations);
          } else {
            reject(conversionError(result));
          }
        });
      });
    } finally {
      nextCoordinateConversionAt = Date.now() + conversionMinIntervalMs;
    }
  };
  const request = coordinateConversionQueue.then(run, run);
  coordinateConversionQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function convertWgs84Chunk(amapApi: typeof AMap, input: AMap.LngLat[]) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const converted = await runQueuedConversion(amapApi, input);
      if (converted.length !== input.length) throw new Error("坐标转换返回数量不一致");
      return converted;
    } catch (error) {
      const infoCode = error instanceof Error && "infocode" in error
        ? (error as Error & { infocode?: string }).infocode
        : undefined;
      const isQuotaError = infoCode === "10021" || (error instanceof Error && error.message.includes("EXCEEDED_THE_LIMIT"));
      const retryDelay = conversionRetryDelaysMs[attempt];
      if (!isQuotaError || retryDelay === undefined) throw error;
      await waitForMs(retryDelay);
    }
  }
}

async function convertWgs84Ring(
  amapApi: typeof AMap,
  ring: number[][],
  cache: Map<string, AMap.LngLat>,
) {
  const missingByKey = new Map<string, number[]>();
  ring.forEach(([lng, lat]) => {
    const key = coordinateKey(lng, lat);
    if (!cache.has(key)) missingByKey.set(key, [...normalizedCoordinate(lng, lat)]);
  });
  const missing = [...missingByKey.values()];
  for (const coordinates of chunked(missing, conversionChunkSize)) {
    const input = coordinates.map(([lng, lat]) => new amapApi.LngLat(lng, lat));
    const converted = await convertWgs84Chunk(amapApi, input);
    coordinates.forEach(([lng, lat], index) => cache.set(coordinateKey(lng, lat), converted[index]));
  }
  return ring.map(([lng, lat]) => {
    const converted = cache.get(coordinateKey(lng, lat));
    if (!converted) throw new Error(`坐标未完成转换：${lng},${lat}`);
    return converted;
  });
}

async function geometryToDisplayPath(
  amapApi: typeof AMap,
  geometry: SectorGeometry,
  isWgs84: boolean,
  cache: Map<string, AMap.LngLat>,
): Promise<DisplayPath> {
  const convertRing = (ring: number[][]) => isWgs84
    ? convertWgs84Ring(amapApi, ring, cache)
    : Promise.resolve(ring.map(([lng, lat]) => new amapApi.LngLat(lng, lat)));

  if (geometry.type === "Polygon") {
    const rings = await Promise.all(geometry.coordinates.map(convertRing));
    return rings.length === 1 ? rings[0] : rings;
  }
  return Promise.all(geometry.coordinates.map((polygon) => Promise.all(polygon.map(convertRing))));
}

export function nativeGeometryToDisplayPath(amapApi: typeof AMap, geometry: SectorGeometry) {
  return geometryToDisplayPath(amapApi, geometry, false, new Map());
}

export function wgs84GeometryToDisplayPath(
  amapApi: typeof AMap,
  cacheKey: string,
  geometry: SectorGeometry,
) {
  let apiCache = wgs84PathCacheByApi.get(amapApi);
  if (!apiCache) {
    apiCache = new Map();
    wgs84PathCacheByApi.set(amapApi, apiCache);
  }
  const cached = apiCache.get(cacheKey);
  if (cached) return cached;
  const conversionCache = new Map<string, AMap.LngLat>();
  const request = geometryToDisplayPath(amapApi, geometry, true, conversionCache)
    .catch((error: unknown) => {
      apiCache.delete(cacheKey);
      throw error;
    });
  apiCache.set(cacheKey, request);
  return request;
}

export function wgs84PointsToDisplayPositions(
  amapApi: typeof AMap,
  cacheKey: string,
  coordinates: Array<[number, number]>,
) {
  let apiCache = wgs84PointBatchCacheByApi.get(amapApi);
  if (!apiCache) {
    apiCache = new Map();
    wgs84PointBatchCacheByApi.set(amapApi, apiCache);
  }
  const cached = apiCache.get(cacheKey);
  if (cached) return cached;
  const request = (async () => {
    const converted: AMap.LngLat[] = [];
    for (const coordinateChunk of chunked(coordinates, conversionChunkSize)) {
      const input = coordinateChunk.map(([lng, lat]) => new amapApi.LngLat(lng, lat));
      converted.push(...await convertWgs84Chunk(amapApi, input));
    }
    return converted;
  })()
    .catch((error: unknown) => {
      apiCache.delete(cacheKey);
      throw error;
    });
  apiCache.set(cacheKey, request);
  return request;
}
