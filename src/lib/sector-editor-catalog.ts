import type { DraftPosition, ExistingSectorDraftTemplate } from "./sector-editor-drafts";

interface EditorSectorRecord {
  id: string;
  canonicalName: string;
  districtNames: string[];
  definitionCandidate: string;
}

interface EditorActiveGeometry {
  kind:
    | "market-demo"
    | "reviewed-market-candidate"
    | "administrative-reference"
    | "official-subscope-reference";
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
  resolveLegacyGeometry?: (id: string) => EditorActiveGeometry | undefined,
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
      : activeGeometry.kind === "market-demo" ? "demo" : "candidate";
    const legacyGeometry = resolveLegacyGeometry?.(record.id);
    const legacyFirstRing = legacyGeometry?.geometry.type === "Polygon"
      ? legacyGeometry.geometry.coordinates[0]
      : legacyGeometry?.geometry.coordinates[0]?.[0];
    const legacyRing = legacyGeometry && legacyFirstRing?.length
      ? normalizeRing(legacyFirstRing.map(([longitude, latitude]) => (
        convertPosition([longitude, latitude], legacyGeometry.coordinateSystem)
      )))
      : [];
    const geometryFingerprint = fingerprintDraftRing(ring);
    const legacyGeometryFingerprint = fingerprintDraftRing(legacyRing);

    return {
      id: record.id,
      name: record.canonicalName,
      district: record.districtNames.join("、"),
      boundaryBasis: record.definitionCandidate,
      note: geometryStatus === "missing"
        ? "板块身份与定义已登记，尚未绘制边界；请在地图上人工绘制并逐边核验。"
        : activeGeometry?.kind === "administrative-reference"
          ? "从主页当前显示的高精度行政参考面载入；它不是楼市板块定稿，修改后仍需逐边核验。"
          : geometryStatus === "candidate"
            ? "从主页当前显示的研究候选面载入；修改后仍需逐边核验。"
          : "从当前地图的楼市板块演示面载入；修改后仍需逐边核验。",
      geometryStatus,
      geometryFingerprint,
      previousGeometryFingerprints: legacyRing.length && legacyGeometryFingerprint !== geometryFingerprint
        ? [legacyGeometryFingerprint]
        : [],
      ring,
    };
  });
}

export function selectPreferredEditorGeometry<Candidate, Reference, Demo>({
  reviewedCandidate,
  administrativeReference,
  legacyDemo,
}: {
  reviewedCandidate?: Candidate;
  administrativeReference?: Reference;
  legacyDemo?: Demo;
}) {
  return reviewedCandidate ?? administrativeReference ?? legacyDemo;
}

export function buildSubscopeEditorTemplates(
  subscopes: Array<{
    properties: {
      id: string;
      parentSectorId: string;
      name: string;
      coordinateSystem: "WGS84";
    };
    geometry: EditorActiveGeometry["geometry"];
  }>,
  getParent: (id: string) => EditorSectorRecord | undefined,
  convertPosition: (
    position: [number, number],
    coordinateSystem: EditorActiveGeometry["coordinateSystem"],
  ) => DraftPosition,
): ExistingSectorDraftTemplate[] {
  return subscopes.flatMap((subscope) => {
    const parent = getParent(subscope.properties.parentSectorId);
    const firstRing = subscope.geometry.type === "Polygon"
      ? subscope.geometry.coordinates[0]
      : subscope.geometry.coordinates[0]?.[0];
    if (!parent || !firstRing?.length) return [];
    const ring = normalizeRing(firstRing.map(([longitude, latitude]) => (
      convertPosition([longitude, latitude], subscope.properties.coordinateSystem)
    )));
    return [{
      id: subscope.properties.id,
      name: subscope.properties.name,
      district: parent.districtNames.join("、"),
      boundaryBasis: `属于“${parent.canonicalName}”的官方参考子范围，不参与一级板块互斥分区。`,
      note: "从主页橙色虚线高精度参考范围载入；修改后仍需逐边核验。",
      geometryStatus: "candidate",
      geometryFingerprint: fingerprintDraftRing(ring),
      ring,
    }];
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

function fingerprintDraftRing(ring: DraftPosition[]) {
  let hash = 2166136261;
  const normalized = normalizeRing(ring);
  const serialized = JSON.stringify(normalized);
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ring-${normalized.length}-${(hash >>> 0).toString(16)}`;
}
