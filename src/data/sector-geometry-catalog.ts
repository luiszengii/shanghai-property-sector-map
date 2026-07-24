import adminReferencesData from "@/src/data/sectors/admin-references.wgs84.json";
import reviewedCandidatesData from "@/src/data/sectors/reviewed-candidates.wgs84.json";
import subscopesData from "@/src/data/sectors/subscopes.wgs84.json";
import sectorsData from "@/src/data/sectors.json";
import { selectPreferredEditorGeometry } from "@/src/lib/sector-editor-catalog";
import type {
  SectorResearchGeometryFeature,
  SectorSubscopeFeature,
} from "./sector-catalog";
import type { SectorCollection, SectorGeometry } from "@/src/types/map";

export interface SectorActiveGeometry {
  kind: "market-demo" | "reviewed-market-candidate" | "administrative-reference";
  coordinateSystem: "GCJ-02-assumed" | "WGS84";
  geometry: SectorGeometry;
  center: [number, number];
}

const legacyFeatures = (sectorsData as SectorCollection).features;
const legacyFeatureById = new Map(
  legacyFeatures.map((feature) => [feature.properties.id, feature]),
);

export const sectorGeometryCatalog = {
  reviewedCandidates: reviewedCandidatesData.features as unknown as SectorResearchGeometryFeature[],
  administrativeReferences: adminReferencesData.features as unknown as SectorResearchGeometryFeature[],
  subscopes: subscopesData.features as unknown as SectorSubscopeFeature[],
};

const reviewedCandidateById = new Map(
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
  const reviewedCandidate = reviewedCandidateById.get(id);
  const legacyFeature = legacyFeatureById.get(id);
  if (reviewedCandidate && (!fallbackToDemo || !legacyFeature)) {
    return {
      kind: "reviewed-market-candidate",
      coordinateSystem: "WGS84",
      geometry: reviewedCandidate.geometry,
      center: reviewedCandidate.properties.labelPoint,
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
  const reviewedCandidate = reviewedCandidateById.get(id);
  const administrativeReference = administrativeReferenceById.get(id);
  const legacyFeature = legacyFeatureById.get(id);
  return selectPreferredEditorGeometry({
    reviewedCandidate: reviewedCandidate
      ? {
        kind: "reviewed-market-candidate" as const,
        coordinateSystem: "WGS84" as const,
        geometry: reviewedCandidate.geometry,
        center: reviewedCandidate.properties.labelPoint,
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
