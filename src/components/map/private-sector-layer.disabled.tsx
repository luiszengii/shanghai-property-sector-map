import type { SectorBoundarySource } from "@/src/store/map-store";
import type { SectorFeature } from "@/src/types/map";

export function PrivateSectorLayer(_props: {
  amapApi: typeof AMap;
  map: AMap.Map;
  source: Exclude<SectorBoundarySource, "project">;
  zoom: number;
  viewportVersion: number;
  viewportInteracting: boolean;
  labelMode: "hover" | "zoom";
  labelMinZoom: number;
  selectedSectorId: string | null;
  onSelect: (sector: SectorFeature) => void;
}) {
  void _props;
  return null;
}
