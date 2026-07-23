import boundaryEvidenceData from "@/src/data/sectors/boundary-evidence.json";
import adminReferencesData from "@/src/data/sectors/admin-references.wgs84.json";
import referenceChecksData from "@/src/data/sectors/reference-checks.json";
import registryData from "@/src/data/sectors/registry.json";
import reviewedCandidatesData from "@/src/data/sectors/reviewed-candidates.wgs84.json";
import subscopesData from "@/src/data/sectors/subscopes.wgs84.json";
import sectorsData from "@/src/data/sectors.json";
import sourcesData from "@/src/data/sectors/sources.json";
import { buildCandidateOnlySectorFeatures } from "@/src/lib/sector-catalog-features";
import { selectPreferredEditorGeometry } from "@/src/lib/sector-editor-catalog";
import type {
  SectorBoundaryEvidence,
  SectorCollection,
  SectorFeature,
  SectorGeometry,
  SectorReferenceCheck,
  SectorRegistryEntry,
  SectorSourceRecord,
} from "@/src/types/map";

export interface SectorResearchGeometryFeature {
  properties: {
    id: string;
    coordinateSystem: "WGS84";
    status: "reviewed-candidate" | "administrative-reference";
    labelPoint: [number, number];
  };
  geometry: SectorGeometry;
}

export interface SectorSubscopeFeature {
  properties: {
    id: string;
    parentSectorId: string;
    name: string;
    coordinateSystem: "WGS84";
    status: "official-reference-subscope";
    labelPoint: [number, number];
  };
  geometry: SectorGeometry;
}

export interface SectorActiveGeometry {
  kind: "market-demo" | "reviewed-market-candidate" | "administrative-reference";
  coordinateSystem: "GCJ-02-assumed" | "WGS84";
  geometry: SectorGeometry;
  center: [number, number];
}

const legacyFeatures = (sectorsData as SectorCollection).features;
const registry = registryData.sectors as SectorRegistryEntry[];
const sources = sourcesData.sources as SectorSourceRecord[];
const boundaryEvidence = boundaryEvidenceData.edges as SectorBoundaryEvidence[];
const referenceChecks = referenceChecksData.checks as SectorReferenceCheck[];
const reviewedCandidates = reviewedCandidatesData.features as unknown as SectorResearchGeometryFeature[];
const subscopes = subscopesData.features as unknown as SectorSubscopeFeature[];
const administrativeReferences = adminReferencesData.features as unknown as SectorResearchGeometryFeature[];

const legacyFeatureById = new Map(
  legacyFeatures.map((feature) => [feature.properties.id, feature]),
);
const recordById = new Map(registry.map((record) => [record.id, record]));
const sourceById = new Map(sources.map((source) => [source.id, source]));
const referenceCheckById = new Map(referenceChecks.map((check) => [check.sectorId, check]));
const marketDemoSources = [sourceById.get("internal-legacy-demo-v1")]
  .filter((source): source is SectorSourceRecord => Boolean(source));
const reviewedCandidateById = new Map(
  reviewedCandidates.map((feature) => [feature.properties.id, feature]),
);
const candidateOnlyFeatures = buildCandidateOnlySectorFeatures(
  legacyFeatures,
  registry,
  reviewedCandidates,
);
const features = [...legacyFeatures, ...candidateOnlyFeatures];
const featureById = new Map(features.map((feature) => [feature.properties.id, feature]));
const administrativeReferenceById = new Map(
  administrativeReferences.map((feature) => [feature.properties.id, feature]),
);
const researchGeometryRecords = registry.filter(
  (record) => record.geometry.status !== "demo" && record.geometry.status !== "missing",
);
const candidateGeometryRecords = registry.filter(
  (record) => record.geometry.status !== "missing"
    && record.geometry.status !== "demo"
    && record.geometry.status !== "admin-reference",
);
const administrativeReferenceRecords = registry.filter(
  (record) => record.geometry.status === "admin-reference",
);

function normalizeSearchTerm(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replaceAll(/\s+/g, "");
}

function match(query: string): SectorFeature | undefined {
  const needle = normalizeSearchTerm(query);
  if (!needle) return undefined;

  const record = registry.find((item) =>
    [item.canonicalName, ...item.aliases].some((candidate) =>
      normalizeSearchTerm(candidate).includes(needle),
    ),
  );
  return record ? featureById.get(record.id) : undefined;
}

function getSourcesForSector(id: string) {
  const record = recordById.get(id);
  if (!record) return [];
  return record.definitionSourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is SectorSourceRecord => Boolean(source));
}

function getGeometrySourcesForSector(id: string) {
  const record = recordById.get(id);
  if (!record) return [];
  return record.geometry.sourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is SectorSourceRecord => Boolean(source));
}

function getGeometryVerificationSourcesForSector(id: string) {
  const record = recordById.get(id);
  if (!record) return [];
  return (record.geometry.verificationSourceIds ?? [])
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is SectorSourceRecord => Boolean(source));
}

function getBoundaryEvidenceForSector(id: string) {
  return boundaryEvidence.filter((edge) => edge.sectorId === id);
}

function getMatchedAlias(id: string, query: string) {
  const needle = normalizeSearchTerm(query);
  const record = recordById.get(id);
  if (!record || normalizeSearchTerm(record.canonicalName).includes(needle)) return undefined;
  return record.aliases.find((alias) => normalizeSearchTerm(alias).includes(needle));
}

function resolveActiveGeometry(id: string, fallbackToDemo = false): SectorActiveGeometry | undefined {
  const feature = featureById.get(id);
  if (!feature) return undefined;
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
  // Administrative references are independent comparison overlays. They do not
  // silently replace the market-sector geometry or its interaction center.
  if (!legacyFeature) return undefined;
  return {
    kind: "market-demo",
    coordinateSystem: "GCJ-02-assumed",
    geometry: legacyFeature.geometry,
    center: legacyFeature.properties.center,
  };
}

function resolveEditorGeometry(id: string): SectorActiveGeometry | undefined {
  const feature = featureById.get(id);
  const reviewedCandidate = reviewedCandidateById.get(id);
  const administrativeReference = administrativeReferenceById.get(id);
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
    legacyDemo: feature
      ? {
        kind: "market-demo" as const,
        coordinateSystem: "GCJ-02-assumed" as const,
        geometry: feature.geometry,
        center: feature.properties.center,
      }
      : undefined,
  });
}

export const sectorCatalog = {
  features,
  legacyFeatures,
  candidateOnlyFeatures,
  registry,
  reviewedCandidates,
  subscopes,
  administrativeReferences,
  researchGeometryRecords,
  candidateGeometryRecords,
  administrativeReferenceRecords,
  marketDemoSources,
  sources,
  boundaryEvidence,
  referenceChecks,
  getFeature: (id: string) => featureById.get(id),
  hasLegacyFeature: (id: string) => legacyFeatureById.has(id),
  getRecord: (id: string) => recordById.get(id),
  resolveActiveGeometry,
  resolveEditorGeometry,
  getReviewedCandidate: (id: string) => reviewedCandidateById.get(id),
  getAdministrativeReference: (id: string) => administrativeReferenceById.get(id),
  getSubscopesForSector: (id: string) => (
    subscopes.filter((feature) => feature.properties.parentSectorId === id)
  ),
  hasResearchGeometry: (id: string) => {
    const status = recordById.get(id)?.geometry.status;
    return status !== undefined && status !== "demo" && status !== "missing";
  },
  getSources: getSourcesForSector,
  getGeometrySources: getGeometrySourcesForSector,
  getGeometryVerificationSources: getGeometryVerificationSourcesForSector,
  getBoundaryEvidence: getBoundaryEvidenceForSector,
  getReferenceCheck: (id: string) => referenceCheckById.get(id),
  getMatchedAlias,
  match,
};
