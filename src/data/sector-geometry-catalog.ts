import adminReferencesData from "@/src/data/sectors/admin-references.wgs84.json";
import editorialSeedsData from "@/src/data/sectors/editorial-seeds.wgs84.json";
import publishedTopologyData from "@/src/data/sectors/published-topology.wgs84.json";
import reviewedCandidatesData from "@/src/data/sectors/reviewed-candidates.wgs84.json";
import sourceBackedProxiesData from "@/src/data/sectors/source-backed-proxies.wgs84.json";
import subscopesData from "@/src/data/sectors/subscopes.wgs84.json";
import userReviewedOverridesData from "@/src/data/sectors/user-reviewed-overrides.wgs84.json";
import sectorsData from "@/src/data/sectors.json";
import { selectPreferredEditorGeometry } from "@/src/lib/sector-editor-catalog";
import { mergeMarketGeometryLayers } from "@/src/lib/sector-geometry-priority";
import type {
  SectorResearchGeometryFeature,
  SectorSubscopeFeature,
} from "./sector-catalog";
import type { SectorCollection, SectorGeometry } from "@/src/types/map";

export interface SectorActiveGeometry {
  kind:
    | "market-demo"
    | "reviewed-market-candidate"
    | "editorial-seed"
    | "source-backed-proxy"
    | "user-reviewed-override"
    | "administrative-reference";
  coordinateSystem: "GCJ-02-assumed" | "WGS84";
  geometry: SectorGeometry;
  center: [number, number];
}

const legacyFeatures = (sectorsData as SectorCollection).features;
const legacyFeatureById = new Map(
  legacyFeatures.map((feature) => [feature.properties.id, feature]),
);

const sourceBackedProxies = sourceBackedProxiesData.features as unknown as SectorResearchGeometryFeature[];
const sourceBackedProxyIds = new Set(
  sourceBackedProxies.map((feature) => feature.properties.id),
);
const userReviewedOverrides =
  userReviewedOverridesData.features as unknown as SectorResearchGeometryFeature[];
const publishedTopology =
  publishedTopologyData.features as unknown as SectorResearchGeometryFeature[];
const reviewedCandidates = mergeMarketGeometryLayers(
  [
    ...reviewedCandidatesData.features,
    ...editorialSeedsData.features.filter(
      (feature) => !sourceBackedProxyIds.has(feature.properties.id),
    ),
    ...sourceBackedProxies,
    ...userReviewedOverrides,
  ] as unknown as SectorResearchGeometryFeature[],
  publishedTopology,
);

export const sectorGeometryCatalog = {
  reviewedCandidates,
  publishedTopology,
  userReviewedOverrides,
  editorialSeeds: editorialSeedsData.features as unknown as SectorResearchGeometryFeature[],
  sourceBackedProxies,
  administrativeReferences: adminReferencesData.features as unknown as SectorResearchGeometryFeature[],
  subscopes: subscopesData.features as unknown as SectorSubscopeFeature[],
};

const activeMarketGeometryById = new Map(
  sectorGeometryCatalog.reviewedCandidates.map((feature) => [
    feature.properties.id,
    feature,
  ]),
);
const administrativeReferenceById = new Map(
  sectorGeometryCatalog.administrativeReferences.map((feature) => [
    feature.properties.id,
    feature,
  ]),
);

export function resolveLoadedActiveGeometry(
  id: string,
  fallbackToDemo = false,
): SectorActiveGeometry | undefined {
  const activeMarketGeometry = activeMarketGeometryById.get(id);
  const legacyFeature = legacyFeatureById.get(id);
  if (activeMarketGeometry && (!fallbackToDemo || !legacyFeature)) {
    return {
      kind: activeMarketGeometry.properties.status === "source-backed-proxy"
        ? "source-backed-proxy"
        : activeMarketGeometry.properties.status === "editorial-seed"
          ? "editorial-seed"
          : activeMarketGeometry.properties.status === "user-reviewed-override"
            ? "user-reviewed-override"
            : "reviewed-market-candidate",
      coordinateSystem: "WGS84",
      geometry: activeMarketGeometry.geometry,
      center: activeMarketGeometry.properties.labelPoint,
    };
  }
  if (!legacyFeature) return undefined;
  return {
    kind: "market-demo",
    coordinateSystem: "GCJ-02-assumed",
    geometry: legacyFeature.geometry,
    center: legacyFeature.properties.center,
  };
}

export function resolveLoadedEditorGeometry(
  id: string,
): SectorActiveGeometry | undefined {
  const activeMarketGeometry = activeMarketGeometryById.get(id);
  const administrativeReference = administrativeReferenceById.get(id);
  const legacyFeature = legacyFeatureById.get(id);
  return selectPreferredEditorGeometry({
    reviewedCandidate: activeMarketGeometry
      ? {
        kind: activeMarketGeometry.properties.status === "source-backed-proxy"
          ? "source-backed-proxy" as const
          : activeMarketGeometry.properties.status === "editorial-seed"
            ? "editorial-seed" as const
            : activeMarketGeometry.properties.status === "user-reviewed-override"
              ? "user-reviewed-override" as const
              : "reviewed-market-candidate" as const,
        coordinateSystem: "WGS84" as const,
        geometry: activeMarketGeometry.geometry,
        center: activeMarketGeometry.properties.labelPoint,
      }
      : undefined,
    administrativeReference: administrativeReference
      ? {
        kind: "administrative-reference" as const,
        coordinateSystem: "WGS84" as const,
        geometry: administrativeReference.geometry,
        center: administrativeReference.properties.labelPoint,
      }
      : undefined,
    legacyDemo: legacyFeature
      ? {
        kind: "market-demo" as const,
        coordinateSystem: "GCJ-02-assumed" as const,
        geometry: legacyFeature.geometry,
        center: legacyFeature.properties.center,
      }
      : undefined,
  });
}

export async function loadSectorGeometryCatalog() {
  return sectorGeometryCatalog;
}
