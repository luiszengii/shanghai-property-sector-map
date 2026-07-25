import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bd09ToGcj02Position } from "../src/lib/geo-coordinate-conversion.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fetchedDate = "2026-07-25";

function closeRing(points) {
  if (points.length < 3) return [];
  const converted = points.map(([lng, lat]) => bd09ToGcj02Position([lng, lat]));
  const first = converted[0];
  const last = converted.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) converted.push([...first]);
  return converted;
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientRing(ring, counterClockwise) {
  const isCounterClockwise = ringArea(ring) > 0;
  return isCounterClockwise === counterClockwise ? ring : [...ring].reverse();
}

function ringsToGeometry(rawRings) {
  const rings = rawRings
    .map(closeRing)
    .filter((ring) => ring.length >= 4)
    .sort((left, right) => Math.abs(ringArea(right)) - Math.abs(ringArea(left)));
  if (rings.length === 0) return null;

  const polygons = [];
  for (const ring of rings) {
    const container = polygons.find((polygon) => pointInRing(ring[0], polygon[0]));
    if (container) container.push(ring);
    else polygons.push([ring]);
  }
  const normalized = polygons.map((polygon) => polygon.map(
    (ring, index) => orientRing(ring, index === 0),
  ));
  return normalized.length === 1
    ? { type: "Polygon", coordinates: normalized[0] }
    : { type: "MultiPolygon", coordinates: normalized };
}

function coordinateObjectToRings(coordinate) {
  return Object.values(coordinate ?? {}).map((points) => points
    .map((point) => [Number(point.baidu_lng), Number(point.baidu_lat)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)));
}

function coordinateStringToRings(value) {
  if (!value?.trim()) return [];
  return value.split("|").map((part) => part
    .split(";")
    .filter(Boolean)
    .map((point) => point.split(",").map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)));
}

function snapshotFeature({
  sourceId,
  name,
  district,
  center,
  geometry,
}) {
  return {
    type: "Feature",
    id: sourceId,
    properties: {
      sourceId,
      name,
      district,
      centroid: center ? bd09ToGcj02Position(center) : null,
    },
    geometry,
  };
}

async function buildAnjuke() {
  const inputPath = path.join(
    projectRoot,
    "outputs/anjuke",
    `shanghai-sector-boundaries-raw-${fetchedDate}.json`,
  );
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const missingGeometry = [];
  const features = [];

  for (const result of raw.results) {
    const geometry = ringsToGeometry(coordinateObjectToRings(result.result?.coordinate));
    if (!geometry) {
      missingGeometry.push({ id: result.id, name: result.name, district: result.districtName });
      continue;
    }
    features.push(snapshotFeature({
      sourceId: result.id,
      name: result.name,
      district: result.districtName,
      center: result.center,
      geometry,
    }));
  }

  const snapshot = {
    type: "FeatureCollection",
    name: "安居客上海楼市板块研究快照",
    metadata: {
      source_key: "anjuke-private",
      source_page: raw.metadata.source_page,
      source_endpoint: raw.metadata.source_endpoint,
      fetched_at: raw.metadata.fetched_at,
      access_context: raw.metadata.access_context,
      license_status: "unverified",
      layer_interpretation: "market sectors",
      source_coordinate_system: "BD-09",
      coordinate_system: "GCJ-02",
      coordinate_note: "Converted locally from BD-09 to GCJ-02 for AMap display",
      directory_count: raw.metadata.sector_count,
      feature_count: features.length,
      missing_geometry_count: missingGeometry.length,
      missing_geometry: missingGeometry,
    },
    features,
  };
  const outputPath = path.join(
    projectRoot,
    "outputs/anjuke",
    `shanghai-sector-boundaries-gcj02-${fetchedDate}.geojson`,
  );
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2));
  return { source: "anjuke", outputPath, snapshot };
}

async function buildFang() {
  const inputPath = path.join(
    projectRoot,
    "outputs/fang",
    `shanghai-sector-boundaries-raw-${fetchedDate}.json`,
  );
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const missingGeometry = [];
  const features = [];

  for (const result of raw.sectors) {
    const geometry = ringsToGeometry(coordinateStringToRings(result.baiducoord));
    if (!geometry) {
      missingGeometry.push({ name: result.comarea, district: result.district });
      continue;
    }
    features.push(snapshotFeature({
      sourceId: `fang-${result.comarea}`,
      name: result.comarea,
      district: `${result.district}区`,
      center: [Number(result.x), Number(result.y)],
      geometry,
    }));
  }

  const snapshot = {
    type: "FeatureCollection",
    name: "房天下上海楼市板块研究快照",
    metadata: {
      source_key: "fang-private",
      source_page: raw.metadata.source_page,
      source_endpoint: raw.metadata.source_endpoint,
      fetched_at: raw.metadata.fetched_at,
      access_context: "Two independent viewport grids; identical unique-name sets",
      license_status: "unverified",
      layer_interpretation: "market sectors",
      source_coordinate_system: "BD-09",
      coordinate_system: "GCJ-02",
      coordinate_note: "Converted locally from BD-09 to GCJ-02 for AMap display",
      directory_count: raw.metadata.shanghai_sector_count,
      feature_count: features.length,
      missing_geometry_count: missingGeometry.length,
      missing_geometry: missingGeometry,
      completeness_check: raw.metadata.grid_verification,
      excluded_names: raw.metadata.excluded_names,
    },
    features,
  };
  const outputPath = path.join(
    projectRoot,
    "outputs/fang",
    `shanghai-sector-boundaries-gcj02-${fetchedDate}.geojson`,
  );
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2));
  return { source: "fang", outputPath, snapshot };
}

const results = await Promise.all([buildAnjuke(), buildFang()]);
for (const { source, outputPath, snapshot } of results) {
  console.log(JSON.stringify({
    source,
    outputPath,
    directoryCount: snapshot.metadata.directory_count,
    featureCount: snapshot.metadata.feature_count,
    missingGeometryCount: snapshot.metadata.missing_geometry_count,
  }));
}
