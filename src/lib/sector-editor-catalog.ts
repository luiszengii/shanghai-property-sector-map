import type { DraftPosition, ExistingSectorDraftTemplate } from "./sector-editor-drafts";

interface EditorSectorRecord {
  id: string;
  canonicalName: string;
  districtNames: string[];
  definitionCandidate: string;
}

interface EditorActiveGeometry {
  kind: "market-demo" | "reviewed-market-candidate";
  coordinateSystem: "WGS84" | "GCJ-02-assumed";
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

export function buildSectorEditorTemplates(
  registry: EditorSectorRecord[],
  resolveActiveGeometry: (id: string) => EditorActiveGeometry | undefined,
  convertPosition: (
    position: [number, number],
    coordinateSystem: EditorActiveGeometry["coordinateSystem"],
  ) => DraftPosition,
): ExistingSectorDraftTemplate[] {
  return registry.map((record) => {
    const activeGeometry = resolveActiveGeometry(record.id);
    const firstRing = activeGeometry?.geometry.type === "Polygon"
      ? activeGeometry.geometry.coordinates[0]
      : activeGeometry?.geometry.coordinates[0]?.[0];
    const ring = activeGeometry && firstRing?.length
      ? normalizeRing(firstRing.map(([longitude, latitude]) => (
        convertPosition([longitude, latitude], activeGeometry.coordinateSystem)
      )))
      : [];
    const geometryStatus = !activeGeometry
      ? "missing"
      : activeGeometry.kind === "reviewed-market-candidate" ? "candidate" : "demo";

    return {
      id: record.id,
      name: record.canonicalName,
      district: record.districtNames.join("、"),
      boundaryBasis: record.definitionCandidate,
      note: geometryStatus === "missing"
        ? "板块身份与定义已登记，尚未绘制边界；请在地图上人工绘制并逐边核验。"
        : geometryStatus === "candidate"
          ? "从当前地图的研究候选面载入；修改后仍需逐边核验。"
          : "从当前地图的楼市板块演示面载入；修改后仍需逐边核验。",
      geometryStatus,
      ring,
    };
  });
}

function normalizeRing(ring: DraftPosition[]) {
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring.at(-1)!;
    if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  }
  return ring;
}
