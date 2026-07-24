export type SectorLabelMode = "hover" | "zoom";

interface SectorLabelVisibilityInput {
  mode: SectorLabelMode;
  zoom: number;
  minZoom: number;
  hovered?: boolean;
}

export function shouldMountSectorLabel({
  mode,
  zoom,
  minZoom,
  hovered = false,
}: SectorLabelVisibilityInput) {
  return mode === "hover" ? hovered : zoom >= minZoom;
}
