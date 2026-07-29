import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bd09ToGcj02Position } from "../src/lib/geo-coordinate-conversion.ts";
import {
  buildCompleteDistrictPartition,
  trimRealtynaviGuardRings,
} from "./realtynavi-partition.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fetchedDate = "2026-07-25";
const realtynaviFetchedDate = "2026-07-28";

function closeRing(points) {
  if (points.length < 3) return [];
  const converted = points.map(([lng, lat]) => bd09ToGcj02Position([lng, lat]));
  const first = converted[0];
  const last = converted.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) converted.push([...first]);
  return converted;
}

function closeNativeRing(points) {
  if (points.length < 3) return [];
  const normalized = points
    .map(([lng, lat]) => [Number(lng), Number(lat)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  const first = normalized[0];
  const last = normalized.at(-1);
  if (!first || !last) return [];
  if (first[0] !== last[0] || first[1] !== last[1]) normalized.push([...first]);
  return normalized;
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

function closedRingsToGeometry(rings) {
  const sortedRings = rings
    .filter((ring) => ring.length >= 4)
    .sort((left, right) => Math.abs(ringArea(right)) - Math.abs(ringArea(left)));
  if (sortedRings.length === 0) return null;

  const polygons = [];
  for (const ring of sortedRings) {
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

function ringsToGeometry(rawRings) {
  const rings = rawRings
    .map(closeRing);
  return closedRingsToGeometry(rings);
}

function nativeRingsToGeometry(rawRings) {
  return closedRingsToGeometry(rawRings.map(closeNativeRing));
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

async function buildRealtynavi() {
  const inputPath = path.join(
    projectRoot,
    "outputs/realtynavi",
    `shanghai-sector-boundaries-raw-${realtynaviFetchedDate}.json`,
  );
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const missingGeometry = [];
  const features = [];
  const districtCoverage = [];
  let namedFeatureCount = 0;
  let districtOutlineDifferenceFeatureCount = 0;

  for (const district of raw.districts) {
    const namedGeometries = [];
    for (const sector of district.item.conditionStatisticsList ?? []) {
      if (sector.key === "全部") continue;
      const geometry = nativeRingsToGeometry(
        trimRealtynaviGuardRings(sector.coordinateVos ?? []),
      );
      if (!geometry) {
        missingGeometry.push({
          id: sector.keyId,
          name: sector.key,
          district: district.requested_district,
        });
        continue;
      }
      namedGeometries.push(geometry);
      namedFeatureCount += 1;
      const location = Array.isArray(sector.location)
        ? [Number(sector.location[1]), Number(sector.location[0])]
        : null;
      features.push({
        type: "Feature",
        id: `realtynavi-${sector.pid}-${sector.keyId}`,
        properties: {
          sourceId: `realtynavi-${sector.pid}-${sector.keyId}`,
          name: sector.key,
          district: `${district.requested_district}区`,
          centroid: (
            location
            && location.every((coordinate) => Number.isFinite(coordinate))
          ) ? location : null,
          classification: "named_sector",
        },
        geometry,
      });
    }

    const districtGeometry = nativeRingsToGeometry(
      district.item.coordinateVos ?? [],
    );
    if (!districtGeometry) {
      districtCoverage.push({
        district: `${district.requested_district}区`,
        status: "district_geometry_missing",
      });
      continue;
    }
    const partition = buildCompleteDistrictPartition({
      districtGeometry,
      namedGeometries,
    });
    districtCoverage.push({
      district: `${district.requested_district}区`,
      named_coverage_percent: partition.namedCoveragePercent,
      completed_coverage_percent: partition.completedCoveragePercent,
    });
    if (partition.districtOutlineDifferenceGeometry) {
      const sourceId = `realtynavi-district-outline-difference-${district.item.keyId}`;
      features.push({
        type: "Feature",
        id: sourceId,
        properties: {
          sourceId,
          name: `${district.requested_district}区级外轮廓差异范围`,
          district: `${district.requested_district}区`,
          centroid: null,
          classification: "district_outline_difference",
        },
        geometry: partition.districtOutlineDifferenceGeometry,
      });
      districtOutlineDifferenceFeatureCount += 1;
    }
  }

  const snapshot = {
    type: "FeatureCollection",
    name: "RealtyNavi 上海楼市板块授权研究快照",
    metadata: {
      source_key: "realtynavi-private",
      source_page: raw.metadata.source_page,
      source_endpoint: raw.metadata.source_endpoint,
      fetched_at: raw.metadata.fetched_at,
      access_context: raw.metadata.access_context,
      license_status: raw.metadata.license_status,
      authorization_assertion: raw.metadata.authorization_assertion,
      allowed_use: raw.metadata.allowed_use,
      layer_interpretation: raw.metadata.layer_interpretation,
      source_coordinate_system: "GCJ-02",
      coordinate_system: "GCJ-02",
      coordinate_note: "Source coordinates are used directly for private AMap comparison",
      directory_count: raw.metadata.sector_count,
      named_feature_count: namedFeatureCount,
      district_outline_difference_feature_count:
        districtOutlineDifferenceFeatureCount,
      feature_count: features.length,
      missing_geometry_count: missingGeometry.length,
      missing_geometry: missingGeometry,
      source_district_count: raw.metadata.district_count,
      district_outline_difference_generated: districtCoverage.every(
        (district) => district.completed_coverage_percent === 100,
      ),
      coverage_note: "All 151 source sector names are preserved. District-outline differences are derived comparison surfaces caused by mismatched district and market-sector extents; they are not RealtyNavi sectors and are hidden by default.",
      district_coverage: districtCoverage,
      client_bundle_sha256: raw.metadata.client_bundle_sha256,
      client_asset_sha256: raw.metadata.client_asset_sha256,
    },
    features,
  };
  const outputPath = path.join(
    projectRoot,
    "outputs/realtynavi",
    `shanghai-sector-boundaries-gcj02-${realtynaviFetchedDate}.geojson`,
  );
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2));
  return { source: "realtynavi", outputPath, snapshot };
}

const builders = {
  anjuke: buildAnjuke,
  fang: buildFang,
  realtynavi: buildRealtynavi,
};
const requestedSources = process.argv.slice(2);
const selectedSources = requestedSources.length > 0
  ? requestedSources
  : Object.keys(builders);
for (const source of selectedSources) {
  if (!(source in builders)) {
    throw new Error(`Unknown private sector snapshot source: ${source}`);
  }
}
const results = await Promise.all(
  selectedSources.map((source) => builders[source]()),
);
for (const { source, outputPath, snapshot } of results) {
  console.log(JSON.stringify({
    source,
    outputPath,
    directoryCount: snapshot.metadata.directory_count,
    featureCount: snapshot.metadata.feature_count,
    missingGeometryCount: snapshot.metadata.missing_geometry_count,
  }));
}
