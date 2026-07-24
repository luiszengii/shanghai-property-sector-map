import boundaryEvidenceData from "@/src/data/sectors/boundary-evidence.json";
import candidateIndexData from "@/src/data/sectors/reviewed-candidates.index.json";
import referenceChecksData from "@/src/data/sectors/reference-checks.json";
import registryData from "@/src/data/sectors/registry.json";
import subscopesData from "@/src/data/sectors/subscopes.wgs84.json";
import sectorsData from "@/src/data/sectors.json";
import sourcesData from "@/src/data/sectors/sources.json";
import { buildCandidateOnlySectorFeatures } from "@/src/lib/sector-catalog-features";
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

export interface SectorActiveLocation {
  kind: "market-demo" | "reviewed-market-candidate" | "administrative-reference";
  coordinateSystem: "GCJ-02-assumed" | "WGS84";
  center: [number, number];
}

const legacyFeatures = (sectorsData as SectorCollection).features;
const registry = registryData.sectors as SectorRegistryEntry[];
const sources = sourcesData.sources as SectorSourceRecord[];
const boundaryEvidence = boundaryEvidenceData.edges as SectorBoundaryEvidence[];
const referenceChecks = referenceChecksData.checks as SectorReferenceCheck[];
const reviewedCandidateIndex = candidateIndexData.features.map((feature) => ({
  properties: {
    ...feature,
    labelPoint: feature.labelPoint as [number, number],
  },
}));
const subscopes = subscopesData.features as unknown as SectorSubscopeFeature[];

const legacyFeatureById = new Map(
  legacyFeatures.map((feature) => [feature.properties.id, feature]),
);
const recordById = new Map(registry.map((record) => [record.id, record]));
const sourceById = new Map(sources.map((source) => [source.id, source]));
const referenceCheckById = new Map(referenceChecks.map((check) => [check.sectorId, check]));
const boundaryEvidenceBySectorId = new Map<string, SectorBoundaryEvidence[]>();
for (const edge of boundaryEvidence) {
  boundaryEvidenceBySectorId.set(edge.sectorId, [
    ...(boundaryEvidenceBySectorId.get(edge.sectorId) ?? []),
    edge,
  ]);
}
const subscopesBySectorId = new Map<string, SectorSubscopeFeature[]>();
for (const feature of subscopes) {
  const parentId = feature.properties.parentSectorId;
  subscopesBySectorId.set(parentId, [
    ...(subscopesBySectorId.get(parentId) ?? []),
    feature,
  ]);
}
const marketDemoSources = [sourceById.get("internal-legacy-demo-v1")]
  .filter((source): source is SectorSourceRecord => Boolean(source));
const reviewedCandidateById = new Map(
  reviewedCandidateIndex.map((feature) => [feature.properties.id, feature]),
);
const candidateOnlyFeatures = buildCandidateOnlySectorFeatures(
  legacyFeatures,
  registry,
  reviewedCandidateIndex,
);
const features = [...legacyFeatures, ...candidateOnlyFeatures];
const featureById = new Map(features.map((feature) => [feature.properties.id, feature]));
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
  return boundaryEvidenceBySectorId.get(id) ?? [];
}

function getMatchedAlias(id: string, query: string) {
  const needle = normalizeSearchTerm(query);
  const record = recordById.get(id);
  if (!record || normalizeSearchTerm(record.canonicalName).includes(needle)) return undefined;
  return record.aliases.find((alias) => normalizeSearchTerm(alias).includes(needle));
}

function resolveActiveLocation(id: string, fallbackToDemo = false): SectorActiveLocation | undefined {
  const feature = featureById.get(id);
  if (!feature) return undefined;
  const reviewedCandidate = reviewedCandidateById.get(id);
  const legacyFeature = legacyFeatureById.get(id);
  if (reviewedCandidate && (!fallbackToDemo || !legacyFeature)) {
    return {
      kind: "reviewed-market-candidate",
      coordinateSystem: "WGS84",
      center: reviewedCandidate.properties.labelPoint,
    };
  }
  // Administrative references are independent comparison overlays. They do not
  // silently replace the market-sector geometry or its interaction center.
  if (!legacyFeature) return undefined;
  return {
    kind: "market-demo",
    coordinateSystem: "GCJ-02-assumed",
    center: legacyFeature.properties.center,
  };
}

export const sectorCatalog = {
  features,
  legacyFeatures,
  candidateOnlyFeatures,
  registry,
  subscopes,
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
  resolveActiveLocation,
  getReviewedCandidateIndex: (id: string) => reviewedCandidateById.get(id),
  getSubscopesForSector: (id: string) => (
    subscopesBySectorId.get(id) ?? []
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
