import {
  draftAdditionalHoles,
  draftHoles,
  draftParts,
  isCompleteSectorDraft,
  parseSectorEditorState,
  type SectorBoundaryDraft,
// @ts-expect-error Node 22 executes version tests directly and needs the source extension.
} from "./sector-editor-drafts.ts";
import {
  gcj02ToWgs84Position,
// @ts-expect-error Node 22 executes version tests directly and needs the source extension.
} from "./geo-coordinate-conversion.ts";

export const SECTOR_EDITOR_VERSION_STORE_SCHEMA = 1;

export interface SectorEditorPersistedVersion {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  activeId: string | null;
  drafts: SectorBoundaryDraft[];
}

export interface SectorEditorVersionSummary {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  draftCount: number;
  completeDraftCount: number;
}

export interface SectorEditorVersionStore {
  schemaVersion: 1;
  versions: SectorEditorPersistedVersion[];
}

export interface UserReviewedOverrideFeature {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    status: "user-reviewed-override";
    confidence: "user-reviewed";
    coordinateSystem: "WGS84";
    labelPoint: [number, number];
    savedVersionId: string;
    savedVersionNumber: number;
    savedAt: string;
    editorCoordinateSystem: "GCJ-02";
    conversionMethod: "iterative-gcj02-to-wgs84-v1";
    boundaryBasis: string;
    note: string;
  };
  geometry:
    | {
      type: "Polygon";
      coordinates: [number, number][][];
    }
    | {
      type: "MultiPolygon";
      coordinates: [number, number][][][];
    };
}

export interface UserReviewedOverrideCollection {
  type: "FeatureCollection";
  name: "shanghai-user-reviewed-sector-overrides";
  metadata: {
    schemaVersion: 1;
    coordinateSystem: "WGS84";
    source: "sector-boundary-editor-explicit-save";
    currentVersionId: string | null;
    currentVersionNumber: number | null;
    savedAt: string | null;
    warning: string;
  };
  features: UserReviewedOverrideFeature[];
}

export function emptyUserReviewedOverrideCollection(): UserReviewedOverrideCollection {
  return {
    type: "FeatureCollection",
    name: "shanghai-user-reviewed-sector-overrides",
    metadata: {
      schemaVersion: 1,
      coordinateSystem: "WGS84",
      source: "sector-boundary-editor-explicit-save",
      currentVersionId: null,
      currentVersionNumber: null,
      savedAt: null,
      warning: "用户在高德地图编辑器中明确保存的市场板块裁定；由 GCJ-02 迭代转换为 WGS84，不是行政或法定边界。",
    },
    features: [],
  };
}

export function parseUserReviewedOverrideCollection(
  value: unknown,
): UserReviewedOverrideCollection {
  if (!isRecord(value)
    || value.type !== "FeatureCollection"
    || value.name !== "shanghai-user-reviewed-sector-overrides"
    || !isRecord(value.metadata)
    || value.metadata.schemaVersion !== 1
    || value.metadata.coordinateSystem !== "WGS84"
    || value.metadata.source !== "sector-boundary-editor-explicit-save"
    || !Array.isArray(value.features)) {
    throw new Error("当前项目地图覆盖文件格式无效");
  }
  const parsed = value as unknown as UserReviewedOverrideCollection;
  for (const [index, feature] of parsed.features.entries()) {
    if (!isRecord(feature)
      || feature.type !== "Feature"
      || !isRecord(feature.properties)
      || feature.properties.status !== "user-reviewed-override"
      || feature.properties.coordinateSystem !== "WGS84"
      || typeof feature.properties.id !== "string"
      || !isRecord(feature.geometry)
      || !["Polygon", "MultiPolygon"].includes(String(feature.geometry.type))) {
      throw new Error(`当前项目地图覆盖文件的第 ${index + 1} 个板块格式无效`);
    }
  }
  return parsed;
}

export function emptySectorEditorVersionStore(): SectorEditorVersionStore {
  return {
    schemaVersion: SECTOR_EDITOR_VERSION_STORE_SCHEMA,
    versions: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSectorEditorVersionStore(
  value: unknown,
): SectorEditorVersionStore {
  if (!isRecord(value)
    || value.schemaVersion !== SECTOR_EDITOR_VERSION_STORE_SCHEMA
    || !Array.isArray(value.versions)) {
    throw new Error("持久版本文件格式无效");
  }
  const versions = value.versions.map((version, index) => {
    if (!isRecord(version)) throw new Error(`第 ${index + 1} 个持久版本格式无效`);
    const id = typeof version.id === "string" ? version.id : "";
    const versionNumber = typeof version.versionNumber === "number"
      ? version.versionNumber
      : Number.NaN;
    const createdAt = typeof version.createdAt === "string" ? version.createdAt : "";
    if (!id || !Number.isInteger(versionNumber) || versionNumber < 1 || !createdAt) {
      throw new Error(`第 ${index + 1} 个持久版本缺少身份信息`);
    }
    const drafts = parseSectorEditorState(JSON.stringify({
      schemaVersion: 1,
      drafts: version.drafts,
    }));
    const requestedActiveId = typeof version.activeId === "string"
      ? version.activeId
      : null;
    return {
      id,
      versionNumber,
      label: typeof version.label === "string" && version.label.trim()
        ? version.label.trim().slice(0, 80)
        : `版本 ${versionNumber}`,
      createdAt,
      activeId: drafts.some((draft) => draft.id === requestedActiveId)
        ? requestedActiveId
        : null,
      drafts,
    };
  });
  return {
    schemaVersion: SECTOR_EDITOR_VERSION_STORE_SCHEMA,
    versions,
  };
}

export function createSectorEditorVersion(
  store: SectorEditorVersionStore,
  input: {
    label?: string;
    activeId?: string | null;
    drafts: unknown;
  },
  options: {
    createdAt: string;
    id: string;
  },
): SectorEditorPersistedVersion {
  const drafts = parseSectorEditorState(JSON.stringify({
    schemaVersion: 1,
    drafts: input.drafts,
  }));
  const versionNumber = store.versions.reduce(
    (maximum, version) => Math.max(maximum, version.versionNumber),
    0,
  ) + 1;
  const requestedActiveId = typeof input.activeId === "string"
    ? input.activeId
    : null;
  return {
    id: options.id,
    versionNumber,
    label: input.label?.trim().slice(0, 80) || `版本 ${versionNumber}`,
    createdAt: options.createdAt,
    activeId: drafts.some((draft) => draft.id === requestedActiveId)
      ? requestedActiveId
      : null,
    drafts,
  };
}

export function summarizeSectorEditorVersion(
  version: SectorEditorPersistedVersion,
): SectorEditorVersionSummary {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    createdAt: version.createdAt,
    draftCount: version.drafts.filter((draft) => !draft.archived).length,
    completeDraftCount: version.drafts.filter(
      (draft) => !draft.archived && isCompleteSectorDraft(draft),
    ).length,
  };
}

function closeWgs84Ring(ring: [number, number][]) {
  const converted = ring.map(gcj02ToWgs84Position);
  return converted.length
    ? [...converted, [...converted[0]] as [number, number]]
    : [];
}

function labelPointForRing(ring: [number, number][]): [number, number] {
  const total = ring.reduce((sum, [longitude, latitude]) => ({
    longitude: sum.longitude + longitude,
    latitude: sum.latitude + latitude,
  }), { longitude: 0, latitude: 0 });
  return ring.length
    ? [total.longitude / ring.length, total.latitude / ring.length]
    : [0, 0];
}

export function buildUserReviewedOverrideCollection(input: {
  version: SectorEditorPersistedVersion;
  registeredSectorIds: ReadonlySet<string>;
  previous?: UserReviewedOverrideCollection;
}) {
  const previous = input.previous ?? emptyUserReviewedOverrideCollection();
  const featureById = new Map(
    previous.features.map((feature) => [feature.properties.id, feature]),
  );
  const skippedUnregisteredDraftIds: string[] = [];
  let publishedDraftCount = 0;

  for (const draft of input.version.drafts) {
    if (draft.archived || draft.referenceOnly || !isCompleteSectorDraft(draft)) {
      continue;
    }
    const sectorId = draft.sourceSectorId ?? draft.id;
    if (!input.registeredSectorIds.has(sectorId)) {
      skippedUnregisteredDraftIds.push(draft.id);
      continue;
    }
    const parts = draftParts(draft);
    const primaryRing = closeWgs84Ring(parts[0] ?? []);
    if (primaryRing.length < 4) continue;
    const primaryPolygon = [
      primaryRing,
      ...draftHoles(draft).map(closeWgs84Ring),
    ];
    const additionalHoles = draftAdditionalHoles(draft);
    const additionalPolygons = parts.slice(1).map((ring, index) => [
      closeWgs84Ring(ring),
      ...(additionalHoles[index] ?? []).map(closeWgs84Ring),
    ]);
    const geometry = additionalPolygons.length
      ? {
        type: "MultiPolygon" as const,
        coordinates: [primaryPolygon, ...additionalPolygons],
      }
      : {
        type: "Polygon" as const,
        coordinates: primaryPolygon,
      };
    const exteriorWgs84 = primaryRing.slice(0, -1);
    featureById.set(sectorId, {
      type: "Feature",
      properties: {
        id: sectorId,
        name: draft.name,
        status: "user-reviewed-override",
        confidence: "user-reviewed",
        coordinateSystem: "WGS84",
        labelPoint: labelPointForRing(exteriorWgs84),
        savedVersionId: input.version.id,
        savedVersionNumber: input.version.versionNumber,
        savedAt: input.version.createdAt,
        editorCoordinateSystem: "GCJ-02",
        conversionMethod: "iterative-gcj02-to-wgs84-v1",
        boundaryBasis: draft.boundaryBasis,
        note: draft.note,
      },
      geometry,
    });
    publishedDraftCount += 1;
  }

  return {
    collection: {
      ...previous,
      metadata: {
        ...previous.metadata,
        currentVersionId: input.version.id,
        currentVersionNumber: input.version.versionNumber,
        savedAt: input.version.createdAt,
      },
      features: [...featureById.values()],
    } satisfies UserReviewedOverrideCollection,
    publishedDraftCount,
    skippedUnregisteredDraftIds,
  };
}
