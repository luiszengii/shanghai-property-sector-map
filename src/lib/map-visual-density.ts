export const PUBLIC_BASEMAP_FEATURES = [
  "bg",
  "road",
  "building",
  "point",
];

export type SectorGeometryKind =
  | "reviewed-market-candidate"
  | "official-subscope-reference"
  | "administrative-reference"
  | "demo";

export function sectorFillOpacity(
  kind: SectorGeometryKind,
  zoom: number,
  selected = false,
) {
  const base = zoom >= 14
    ? 0.015
    : zoom >= 12
      ? Math.max(0.03, 0.12 - (zoom - 12) * 0.045)
      : Math.min(0.16, 0.1 + (12 - zoom) * 0.03);

  if (selected) return Math.max(base, 0.2);
  if (kind === "official-subscope-reference") return base * 0.3;
  if (kind === "administrative-reference") return base * 0.38;
  if (kind === "demo") return base * 0.65;
  return base;
}
