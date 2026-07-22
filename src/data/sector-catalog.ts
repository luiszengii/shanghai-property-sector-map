import boundaryEvidenceData from "@/src/data/sectors/boundary-evidence.json";
import registryData from "@/src/data/sectors/registry.json";
import sectorsData from "@/src/data/sectors.json";
import sourcesData from "@/src/data/sectors/sources.json";
import type {
  SectorBoundaryEvidence,
  SectorCollection,
  SectorFeature,
  SectorRegistryEntry,
  SectorSourceRecord,
} from "@/src/types/map";

const features = (sectorsData as SectorCollection).features;
const registry = registryData.sectors as SectorRegistryEntry[];
const sources = sourcesData.sources as SectorSourceRecord[];
const boundaryEvidence = boundaryEvidenceData.edges as SectorBoundaryEvidence[];

const featureById = new Map(features.map((feature) => [feature.properties.id, feature]));
const recordById = new Map(registry.map((record) => [record.id, record]));
const sourceById = new Map(sources.map((source) => [source.id, source]));
const researchGeometryRecords = registry.filter((record) => record.geometry.status !== "demo");

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

function getBoundaryEvidenceForSector(id: string) {
  return boundaryEvidence.filter((edge) => edge.sectorId === id);
}

function getMatchedAlias(id: string, query: string) {
  const needle = normalizeSearchTerm(query);
  const record = recordById.get(id);
  if (!record || normalizeSearchTerm(record.canonicalName).includes(needle)) return undefined;
  return record.aliases.find((alias) => normalizeSearchTerm(alias).includes(needle));
}

export const sectorCatalog = {
  features,
  registry,
  researchGeometryRecords,
  sources,
  boundaryEvidence,
  getFeature: (id: string) => featureById.get(id),
  getRecord: (id: string) => recordById.get(id),
  hasResearchGeometry: (id: string) => {
    const status = recordById.get(id)?.geometry.status;
    return status !== undefined && status !== "demo";
  },
  getSources: getSourcesForSector,
  getGeometrySources: getGeometrySourcesForSector,
  getBoundaryEvidence: getBoundaryEvidenceForSector,
  getMatchedAlias,
  match,
};
