import type {
  SectorFeature,
  SectorGeometry,
  SectorRegistryEntry,
} from "../types/map";

interface MarketGeometryEntry {
  properties: {
    id: string;
    labelPoint: [number, number];
    status?: "reviewed-candidate" | "editorial-seed" | "source-backed-proxy";
  };
  geometry?: SectorGeometry;
}

export function buildCandidateOnlySectorFeatures(
  legacyFeatures: SectorFeature[],
  registry: SectorRegistryEntry[],
  marketGeometries: MarketGeometryEntry[],
): SectorFeature[] {
  const legacyIds = new Set(legacyFeatures.map((feature) => feature.properties.id));
  const recordById = new Map(registry.map((record) => [record.id, record]));

  return marketGeometries.flatMap((candidate): SectorFeature[] => {
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
        sourceName: candidate.properties.status === "source-backed-proxy"
          ? "公开文字四至与开放道路重建的参考代理"
          : candidate.properties.status === "editorial-seed"
            ? "覆盖优先的低置信可编辑初稿"
            : "登记证据与开放几何生成的研究候选",
        boundaryBasis: record.definitionCandidate,
        isMock: false,
        center: candidate.properties.labelPoint,
      },
      geometry: candidate.geometry ?? {
        type: "Polygon",
        coordinates: [],
      },
    }];
  });
}
