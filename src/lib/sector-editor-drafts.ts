export const SECTOR_EDITOR_STORAGE_KEY = "shanghai-sector-editor:drafts:v1";
export const SECTOR_EDITOR_SCHEMA_VERSION = 1;

export type DraftPosition = [number, number];

export interface SectorBoundaryDraft {
  id: string;
  sourceSectorId?: string;
  sourceGeometryFingerprint?: string;
  name: string;
  district: string;
  boundaryBasis: string;
  note: string;
  coordinateSystem: "GCJ-02";
  ring: DraftPosition[];
  holes?: DraftPosition[][];
  additionalRings?: DraftPosition[][];
  additionalHoles?: DraftPosition[][][];
  createdAt: string;
  updatedAt: string;
}

export interface SectorDraftFeatureCollection {
  type: "FeatureCollection";
  name: "shanghai-market-sector-boundary-drafts";
  metadata: {
    schemaVersion: 1;
    coordinateSystem: "GCJ-02";
    boundaryKind: "market-sector-draft";
    exportedAt: string;
    warning: string;
  };
  features: Array<{
    type: "Feature";
    id: string;
    properties: {
      id: string;
      sourceSectorId?: string;
      sourceGeometryFingerprint?: string;
      name: string;
      district: string;
      boundaryBasis: string;
      note: string;
      coordinateSystem: "GCJ-02";
      boundaryKind: "market-sector-draft";
      status: "draft";
      createdAt: string;
      updatedAt: string;
    };
    geometry:
      | {
        type: "Polygon";
        coordinates: DraftPosition[][];
      }
      | {
        type: "MultiPolygon";
        coordinates: DraftPosition[][][];
      };
  }>;
}

interface StoredSectorEditorState {
  schemaVersion: 1;
  drafts: SectorBoundaryDraft[];
}

const exportWarning = "用户在高德地图上人工绘制的市场板块草稿，非行政区、规划或官方边界；发布前需核验并转换坐标。";
const retiredDraftSourcesBySourceId = new Map<string, {
  names: Set<string>;
  geometryFingerprints: Set<string>;
}>([
  ["sector_qiantan", {
    names: new Set(["杨思前滩"]),
    // Historical generated-candidate and editor-seed fingerprints from before ADR-0022 split the sector.
    geometryFingerprints: new Set([
      "ring-182-810406e2",
      "ring-177-c5469959",
      "ring-172-4b120fed",
      "ring-19-37ff99c",
    ]),
  }],
]);

function isFinitePosition(value: unknown): value is DraftPosition {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function positionsEqual(a: DraftPosition, b: DraftPosition) {
  return a[0] === b[0] && a[1] === b[1];
}

export function normalizeDraftRing(value: unknown): DraftPosition[] {
  if (!Array.isArray(value)) return [];
  const positions = value.filter(isFinitePosition).map(([lng, lat]) => [lng, lat] as DraftPosition);
  if (positions.length > 1 && positionsEqual(positions[0], positions.at(-1)!)) {
    positions.pop();
  }
  return positions;
}

function normalizeDraftRings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeDraftRing)
    .filter((ring) => ring.length >= 3);
}

export function draftParts(draft: Pick<SectorBoundaryDraft, "ring" | "additionalRings">) {
  return [
    normalizeDraftRing(draft.ring),
    ...normalizeDraftRings(draft.additionalRings),
  ].filter((ring) => ring.length >= 3);
}

export function draftHoles(draft: Pick<SectorBoundaryDraft, "holes">) {
  return normalizeDraftRings(draft.holes);
}

export function draftAdditionalHoles(
  draft: Pick<SectorBoundaryDraft, "additionalHoles">,
) {
  if (!Array.isArray(draft.additionalHoles)) return [];
  return draft.additionalHoles.map(normalizeDraftRings);
}

export function draftFingerprintRings(
  draft: Pick<
    SectorBoundaryDraft,
    "ring" | "holes" | "additionalRings" | "additionalHoles"
  >,
) {
  const parts = draftParts(draft);
  const additionalHoles = draftAdditionalHoles(draft);
  return [
    parts[0] ?? [],
    ...draftHoles(draft),
    ...parts.slice(1).flatMap((ring, index) => [
      ring,
      ...(additionalHoles[index] ?? []),
    ]),
  ].filter((ring) => ring.length >= 3);
}

export function normalizeAmapPolygonGeometry(value: unknown): Pick<
  SectorBoundaryDraft,
  "ring" | "holes" | "additionalRings" | "additionalHoles"
> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ring: [], holes: [], additionalRings: [], additionalHoles: [] };
  }
  const firstValue = value[0];
  if (isAmapPosition(firstValue)) {
    return {
      ring: normalizeAmapRing(value),
      holes: [],
      additionalRings: [],
      additionalHoles: [],
    };
  }
  if (!Array.isArray(firstValue) || firstValue.length === 0) {
    return { ring: [], holes: [], additionalRings: [], additionalHoles: [] };
  }
  if (isAmapPosition(firstValue[0])) {
    const [ring = [], ...holes] = value
      .map((candidate) => (
        Array.isArray(candidate) ? normalizeAmapRing(candidate) : []
      ))
      .filter((candidate) => candidate.length >= 3);
    return { ring, holes, additionalRings: [], additionalHoles: [] };
  }
  const polygons = value.flatMap((polygon): DraftPosition[][][] => {
    if (!Array.isArray(polygon)) return [];
    const rings = polygon
      .map((candidate) => (
        Array.isArray(candidate) ? normalizeAmapRing(candidate) : []
      ))
      .filter((candidate) => candidate.length >= 3);
    return rings.length ? [rings] : [];
  });
  const [primary = [], ...additionalPolygons] = polygons;
  return {
    ring: primary[0] ?? [],
    holes: primary.slice(1),
    additionalRings: additionalPolygons
      .map((polygon) => polygon[0])
      .filter((ring): ring is DraftPosition[] => Boolean(ring)),
    additionalHoles: additionalPolygons
      .filter((polygon) => Boolean(polygon[0]))
      .map((polygon) => polygon.slice(1)),
  };
}

export function normalizeAmapPolygonRing(value: unknown): DraftPosition[] {
  return normalizeAmapPolygonGeometry(value).ring;
}

export function normalizeAmapPolygonParts(value: unknown): DraftPosition[][] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const firstValue = value[0];
  if (isAmapPosition(firstValue)) {
    const ring = normalizeAmapRing(value);
    return ring.length ? [ring] : [];
  }
  if (!Array.isArray(firstValue) || firstValue.length === 0) return [];
  if (isAmapPosition(firstValue[0])) {
    const ring = normalizeAmapRing(firstValue);
    return ring.length ? [ring] : [];
  }
  return value.flatMap((polygon): DraftPosition[][] => {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) return [];
    const exteriorRing = normalizeAmapRing(polygon[0]);
    return exteriorRing.length ? [exteriorRing] : [];
  });
}

function isAmapPosition(value: unknown) {
  return isFinitePosition(value) || (
    value !== null
    && typeof value === "object"
    && "getLng" in value
  );
}

function normalizeAmapRing(value: unknown[]): DraftPosition[] {
  return normalizeDraftRing(value.flatMap((point): DraftPosition[] => {
    if (isFinitePosition(point)) return [[point[0], point[1]]];
    if (
      point !== null
      && typeof point === "object"
      && "getLng" in point
      && typeof point.getLng === "function"
      && "getLat" in point
      && typeof point.getLat === "function"
    ) {
      const lng = point.getLng();
      const lat = point.getLat();
      return Number.isFinite(lng) && Number.isFinite(lat) ? [[lng, lat]] : [];
    }
    return [];
  }));
}

export function isCompleteSectorDraft(draft: SectorBoundaryDraft) {
  const name = draft.name.trim();
  return name.length > 0 && name !== "未命名板块" && draft.ring.length >= 3;
}

export function createSectorDraft(id: string, timestamp = new Date().toISOString()): SectorBoundaryDraft {
  return {
    id,
    name: "未命名板块",
    district: "",
    boundaryBasis: "",
    note: "",
    coordinateSystem: "GCJ-02",
    ring: [],
    holes: [],
    additionalRings: [],
    additionalHoles: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface ExistingSectorDraftTemplate {
  id: string;
  name: string;
  district: string;
  boundaryBasis: string;
  note: string;
  geometryStatus: "missing" | "demo" | "candidate";
  geometryFingerprint: string;
  previousGeometryFingerprints?: string[];
  ring: DraftPosition[];
  holes?: DraftPosition[][];
  additionalRings?: DraftPosition[][];
  additionalHoles?: DraftPosition[][][];
}

export function createDraftFromExistingSector(
  template: ExistingSectorDraftTemplate,
  timestamp = new Date().toISOString(),
): SectorBoundaryDraft {
  return {
    id: template.id,
    sourceSectorId: template.id,
    sourceGeometryFingerprint: template.geometryFingerprint,
    name: template.name,
    district: template.district,
    boundaryBasis: template.boundaryBasis,
    note: template.note,
    coordinateSystem: "GCJ-02",
    ring: normalizeDraftRing(template.ring),
    holes: normalizeDraftRings(template.holes),
    additionalRings: normalizeDraftRings(template.additionalRings),
    additionalHoles: draftAdditionalHoles(template),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function serializeSectorEditorState(drafts: SectorBoundaryDraft[]) {
  const state: StoredSectorEditorState = {
    schemaVersion: SECTOR_EDITOR_SCHEMA_VERSION,
    drafts,
  };
  return JSON.stringify(state);
}

export function parseSectorEditorState(serialized: string): SectorBoundaryDraft[] {
  const value: unknown = JSON.parse(serialized);
  assertRecord(value, "本机草稿格式无效");
  if (value.schemaVersion !== SECTOR_EDITOR_SCHEMA_VERSION || !Array.isArray(value.drafts)) {
    throw new Error("本机草稿版本不兼容");
  }
  const now = new Date().toISOString();
  return value.drafts.map((draft, index) => {
    assertRecord(draft, `第 ${index + 1} 个本机草稿格式无效`);
    const id = stringProperty(draft.id);
    if (!id) throw new Error(`第 ${index + 1} 个本机草稿缺少 ID`);
    return {
      id,
      sourceSectorId: stringProperty(draft.sourceSectorId) || undefined,
      sourceGeometryFingerprint: stringProperty(draft.sourceGeometryFingerprint) || undefined,
      name: stringProperty(draft.name) || "未命名板块",
      district: stringProperty(draft.district),
      boundaryBasis: stringProperty(draft.boundaryBasis),
      note: stringProperty(draft.note),
      coordinateSystem: "GCJ-02",
      ring: normalizeDraftRing(draft.ring),
      holes: normalizeDraftRings(draft.holes),
      additionalRings: normalizeDraftRings(draft.additionalRings),
      additionalHoles: draftAdditionalHoles(draft),
      createdAt: stringProperty(draft.createdAt) || now,
      updatedAt: stringProperty(draft.updatedAt) || now,
    };
  });
}

function closeRing(ring: DraftPosition[]) {
  const normalized = normalizeDraftRing(ring);
  if (normalized.length === 0) return [];
  return [...normalized, [...normalized[0]] as DraftPosition];
}

export function buildSectorDraftFeatureCollection(
  drafts: SectorBoundaryDraft[],
  exportedAt = new Date().toISOString(),
): SectorDraftFeatureCollection {
  const features = drafts
    .filter(isCompleteSectorDraft)
    .map((draft): SectorDraftFeatureCollection["features"][number] => {
      const parts = draftParts(draft);
      const holes = draftHoles(draft);
      const additionalHoles = draftAdditionalHoles(draft);
      const primaryPolygon = [
        closeRing(parts[0]),
        ...holes.map(closeRing),
      ];
      return {
        type: "Feature",
        id: draft.id,
        properties: {
          id: draft.id,
          sourceSectorId: draft.sourceSectorId,
          sourceGeometryFingerprint: draft.sourceGeometryFingerprint,
          name: draft.name.trim(),
          district: draft.district.trim(),
          boundaryBasis: draft.boundaryBasis.trim(),
          note: draft.note.trim(),
          coordinateSystem: "GCJ-02",
          boundaryKind: "market-sector-draft",
          status: "draft",
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        },
        geometry: parts.length > 1
          ? {
            type: "MultiPolygon",
            coordinates: [
              primaryPolygon,
              ...parts.slice(1).map((ring, index) => [
                closeRing(ring),
                ...(additionalHoles[index] ?? []).map(closeRing),
              ]),
            ],
          }
          : {
            type: "Polygon",
            coordinates: primaryPolygon,
          },
      };
    });

  return {
    type: "FeatureCollection",
    name: "shanghai-market-sector-boundary-drafts",
    metadata: {
      schemaVersion: SECTOR_EDITOR_SCHEMA_VERSION,
      coordinateSystem: "GCJ-02",
      boundaryKind: "market-sector-draft",
      exportedAt,
      warning: exportWarning,
    },
    features,
  };
}

function stringProperty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

export function parseSectorDraftFeatureCollection(value: unknown): SectorBoundaryDraft[] {
  assertRecord(value, "文件不是有效的 GeoJSON 对象");
  if (value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    throw new Error("只支持 GeoJSON FeatureCollection");
  }

  assertRecord(value.metadata, "缺少编辑器导出元数据");
  if (value.metadata.coordinateSystem !== "GCJ-02") {
    throw new Error("坐标系不是 GCJ-02，不能直接导入高德地图编辑器");
  }
  if (value.metadata.schemaVersion !== SECTOR_EDITOR_SCHEMA_VERSION) {
    throw new Error("文件版本与当前编辑器不兼容");
  }

  const importedAt = new Date().toISOString();
  const seenIds = new Set<string>();
  const drafts = value.features.map((feature, index) => {
    assertRecord(feature, `第 ${index + 1} 个板块不是有效对象`);
    assertRecord(feature.properties, `第 ${index + 1} 个板块缺少属性`);
    assertRecord(feature.geometry, `第 ${index + 1} 个板块缺少几何`);
    if (!["Polygon", "MultiPolygon"].includes(String(feature.geometry.type))
      || !Array.isArray(feature.geometry.coordinates)) {
      throw new Error(`第 ${index + 1} 个板块不是 Polygon 或 MultiPolygon`);
    }
    const polygons = feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates.flatMap((polygon): DraftPosition[][][] => {
        if (!Array.isArray(polygon)) return [];
        const rings = normalizeDraftRings(polygon);
        return rings.length ? [rings] : [];
      })
      : [normalizeDraftRings(feature.geometry.coordinates)];
    const [primaryPolygon = [], ...additionalPolygons] = polygons;
    const [ring = [], ...holes] = primaryPolygon;
    const additionalRings = additionalPolygons
      .map((polygon) => polygon[0])
      .filter((candidate): candidate is DraftPosition[] => Boolean(candidate));
    const additionalHoles = additionalPolygons
      .filter((polygon) => Boolean(polygon[0]))
      .map((polygon) => polygon.slice(1));
    if (ring.length < 3) {
      throw new Error(`第 ${index + 1} 个板块少于 3 个边界点`);
    }

    const properties = feature.properties;
    const id = stringProperty(properties.id) || stringProperty(feature.id) || `imported-${index + 1}`;
    if (seenIds.has(id)) throw new Error(`板块 ID 重复：${id}`);
    seenIds.add(id);
    const name = stringProperty(properties.name).trim();
    if (!name) throw new Error(`第 ${index + 1} 个板块缺少名称`);

    return {
      id,
      sourceSectorId: stringProperty(properties.sourceSectorId) || undefined,
      sourceGeometryFingerprint: stringProperty(properties.sourceGeometryFingerprint) || undefined,
      name,
      district: stringProperty(properties.district),
      boundaryBasis: stringProperty(properties.boundaryBasis),
      note: stringProperty(properties.note),
      coordinateSystem: "GCJ-02" as const,
      ring,
      holes,
      additionalRings,
      additionalHoles,
      createdAt: stringProperty(properties.createdAt) || importedAt,
      updatedAt: stringProperty(properties.updatedAt) || importedAt,
    };
  });

  return drafts;
}

export function syncUntouchedDraftsToCurrentTemplates(
  drafts: SectorBoundaryDraft[],
  templates: ExistingSectorDraftTemplate[],
) {
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const updatedSourceIds: string[] = [];
  const preservedModifiedSourceIds: string[] = [];
  const syncedDrafts = drafts.map((draft) => {
    if (!draft.sourceSectorId) return draft;
    const template = templateById.get(draft.sourceSectorId);
    if (!template) return draft;
    const retiredSource = retiredDraftSourcesBySourceId.get(draft.sourceSectorId);
    const draftGeometryFingerprint = fingerprintDraftParts(
      draftFingerprintRings(draft),
    );
    const hasRetiredIdentity = Boolean(
      retiredSource?.names.has(draft.name)
      || (
        draft.sourceGeometryFingerprint
        && retiredSource?.geometryFingerprints.has(draft.sourceGeometryFingerprint)
      ),
    );
    const matchesRetiredDefaultGeometry = Boolean(
      retiredSource?.geometryFingerprints.has(draftGeometryFingerprint)
      || (
        draft.sourceGeometryFingerprint
        && draft.sourceGeometryFingerprint === draftGeometryFingerprint
      ),
    );
    const mustResetToCurrentTemplate = Boolean(
      hasRetiredIdentity && matchesRetiredDefaultGeometry,
    );
    if (mustResetToCurrentTemplate) {
      updatedSourceIds.push(draft.sourceSectorId);
      return {
        ...createDraftFromExistingSector(template, draft.createdAt),
        id: draft.id,
      };
    }
    const migratedDraft = draft;
    if (template.ring.length < 3
      || migratedDraft.sourceGeometryFingerprint === template.geometryFingerprint) {
      return migratedDraft;
    }
    if (draftGeometryFingerprint === template.geometryFingerprint) {
      return {
        ...migratedDraft,
        sourceGeometryFingerprint: template.geometryFingerprint,
      };
    }
    const matchesKnownOldGeometry = Boolean(
      template.previousGeometryFingerprints?.includes(draftGeometryFingerprint),
    );
    if (!matchesKnownOldGeometry) {
      preservedModifiedSourceIds.push(migratedDraft.sourceSectorId!);
      return migratedDraft;
    }
    updatedSourceIds.push(migratedDraft.sourceSectorId!);
    return {
      ...migratedDraft,
      ring: normalizeDraftRing(template.ring),
      holes: normalizeDraftRings(template.holes),
      additionalRings: normalizeDraftRings(template.additionalRings),
      additionalHoles: draftAdditionalHoles(template),
      sourceGeometryFingerprint: template.geometryFingerprint,
    };
  });

  return {
    drafts: syncedDrafts,
    updatedSourceIds,
    preservedModifiedSourceIds,
  };
}

export function fingerprintDraftRing(ring: DraftPosition[]) {
  let hash = 2166136261;
  const normalized = normalizeDraftRing(ring);
  const serialized = JSON.stringify(normalized);
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ring-${normalized.length}-${(hash >>> 0).toString(16)}`;
}

export function fingerprintDraftParts(parts: DraftPosition[][]) {
  const normalized = parts
    .map(normalizeDraftRing)
    .filter((ring) => ring.length >= 3);
  if (normalized.length <= 1) return fingerprintDraftRing(normalized[0] ?? []);
  let hash = 2166136261;
  const serialized = JSON.stringify(normalized);
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const pointCount = normalized.reduce((total, ring) => total + ring.length, 0);
  return `parts-${normalized.length}-${pointCount}-${(hash >>> 0).toString(16)}`;
}

export function formatSectorDraftFilename(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ];
  return `上海板块边界草稿-${parts.join("-")}.geojson`;
}
