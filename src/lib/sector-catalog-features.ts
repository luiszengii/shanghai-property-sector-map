import type {
  SectorFeature,
  SectorGeometry,
  SectorRegistryEntry,
} from "../types/map";

interface ReviewedCandidateEntry {
  properties: {
    id: string;
    labelPoint: [number, number];
  };
  geometry: SectorGeometry;
}

export function buildCandidateOnlySectorFeatures(
  legacyFeatures: SectorFeature[],
  registry: SectorRegistryEntry[],
  reviewedCandidates: ReviewedCandidateEntry[],
): SectorFeature[] {
  const legacyIds = new Set(legacyFeatures.map((feature) => feature.properties.id));
  const recordById = new Map(registry.map((record) => [record.id, record]));

  return reviewedCandidates.flatMap((candidate): SectorFeature[] => {
    if (legacyIds.has(candidate.properties.id)) return [];
    const record = recordById.get(candidate.properties.id);
    if (!record) return [];
    return [{
      type: "Feature",
      properties: {
        id: record.id,
        name: record.canonicalName,
        district: record.districtNames.join(" / "),
        description: record.definitionCandidate,
        sourceName: "登记证据与开放几何生成的研究候选",
        boundaryBasis: record.definitionCandidate,
        isMock: false,
        center: candidate.properties.labelPoint,
      },
      geometry: candidate.geometry,
    }];
  });
}
