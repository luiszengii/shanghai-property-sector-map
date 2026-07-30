import type { SectorGeometry } from "@/src/types/map";

export interface HfwgsjSectorSnapshotFeature {
  type: "Feature";
  id: string;
  properties: {
    sourceId: string;
    name: string;
    centroid: [number, number] | null;
    classification?: "named_sector" | "district_outline_difference";
  };
  geometry: SectorGeometry;
}

export interface HfwgsjSectorSnapshot {
  type: "FeatureCollection";
  name: string;
  metadata: {
    source_page: string;
    source_endpoint: string;
    fetched_at: string;
    access_context: string;
    license_status: string;
    layer_interpretation: string;
    coordinate_note: string;
    source_key?: string;
    source_coordinate_system?: string;
    coordinate_system?: string;
    directory_count?: number;
    named_feature_count?: number;
    district_outline_difference_feature_count?: number;
    district_outline_difference_generated?: boolean;
    coverage_note?: string;
    feature_count: number;
    missing_geometry_count?: number;
    missing_geometry?: Array<{
      id?: string;
      name: string;
      district?: string;
    }>;
  };
  features: HfwgsjSectorSnapshotFeature[];
}

export function normalizeSectorSnapshotName(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replaceAll(/\s+/g, "");
}

export function isPlaceholderSectorName(value: string) {
  return /^\d+$/.test(value.trim());
}

export function getSnapshotDisplayFeatures(
  features: HfwgsjSectorSnapshotFeature[],
  {
    includeDistrictOutlineDifferences,
  }: {
    includeDistrictOutlineDifferences: boolean;
  },
) {
  return includeDistrictOutlineDifferences
    ? features
    : features.filter(
      (feature) => feature.properties.classification !== "district_outline_difference",
    );
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => Number.isFinite(coordinate));
}

function isGeometry(value: unknown): value is SectorGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  return (geometry.type === "Polygon" || geometry.type === "MultiPolygon")
    && Array.isArray(geometry.coordinates);
}

export function parseHfwgsjSectorSnapshot(value: unknown): HfwgsjSectorSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("私有板块快照不是有效对象");
  }
  const collection = value as Partial<HfwgsjSectorSnapshot>;
  if (
    collection.type !== "FeatureCollection"
    || !collection.metadata
    || !Array.isArray(collection.features)
  ) {
    throw new Error("私有板块快照不是有效的 GeoJSON FeatureCollection");
  }

  const features = collection.features.map((feature, index) => {
    if (
      !feature
      || feature.type !== "Feature"
      || !feature.properties
      || typeof feature.properties.sourceId !== "string"
      || typeof feature.properties.name !== "string"
      || (
        feature.properties.centroid !== null
        && !isPosition(feature.properties.centroid)
      )
      || !isGeometry(feature.geometry)
    ) {
      throw new Error(`私有板块快照第 ${index + 1} 个要素格式不正确`);
    }
    return feature;
  });

  if (
    collection.metadata.feature_count !== features.length
    || typeof collection.name !== "string"
  ) {
    throw new Error("私有板块快照的要素数量与元数据不一致");
  }

  return {
    ...collection,
    type: "FeatureCollection",
    name: collection.name,
    metadata: collection.metadata,
    features,
  } as HfwgsjSectorSnapshot;
}
