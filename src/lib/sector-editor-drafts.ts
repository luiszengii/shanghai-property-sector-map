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
    geometry: {
      type: "Polygon";
      coordinates: DraftPosition[][];
    };
  }>;
}

interface StoredSectorEditorState {
  schemaVersion: 1;
  drafts: SectorBoundaryDraft[];
}

const exportWarning = "用户在高德地图上人工绘制的市场板块草稿，非行政区、规划或官方边界；发布前需核验并转换坐标。";
const retiredDefaultNamesBySourceId = new Map<string, string[]>([
  ["sector_qiantan", ["杨思前滩"]],
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

export function normalizeAmapPolygonRing(value: unknown): DraftPosition[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const firstValue = value[0];
  const firstValueIsPosition = isFinitePosition(firstValue) || (
    firstValue !== null
    && typeof firstValue === "object"
    && "getLng" in firstValue
  );
  const ring = firstValueIsPosition ? value : Array.isArray(firstValue) ? firstValue : [];
  return ring.flatMap((point): DraftPosition[] => {
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
  });
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
    .map((draft) => ({
      type: "Feature" as const,
      id: draft.id,
      properties: {
        id: draft.id,
        sourceSectorId: draft.sourceSectorId,
        sourceGeometryFingerprint: draft.sourceGeometryFingerprint,
        name: draft.name.trim(),
        district: draft.district.trim(),
        boundaryBasis: draft.boundaryBasis.trim(),
        note: draft.note.trim(),
        coordinateSystem: "GCJ-02" as const,
        boundaryKind: "market-sector-draft" as const,
        status: "draft" as const,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [closeRing(draft.ring)],
      },
    }));

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
    if (feature.geometry.type !== "Polygon" || !Array.isArray(feature.geometry.coordinates)) {
      throw new Error(`第 ${index + 1} 个板块不是 Polygon`);
    }
    const firstRing = feature.geometry.coordinates[0];
    const ring = normalizeDraftRing(firstRing);
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
    const migratedDraft = retiredDefaultNamesBySourceId
      .get(draft.sourceSectorId)
      ?.includes(draft.name)
      ? { ...draft, name: template.name }
      : draft;
    if (template.ring.length < 3
      || migratedDraft.sourceGeometryFingerprint === template.geometryFingerprint) {
      return migratedDraft;
    }
    const draftGeometryFingerprint = fingerprintDraftRing(migratedDraft.ring);
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

export function formatSectorDraftFilename(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ];
  return `上海板块边界草稿-${parts.join("-")}.geojson`;
}
