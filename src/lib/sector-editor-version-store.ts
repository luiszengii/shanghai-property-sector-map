import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  createSectorEditorVersion,
  emptySectorEditorVersionStore,
  parseSectorEditorVersionStore,
  summarizeSectorEditorVersion,
  type SectorEditorPersistedVersion,
  type SectorEditorVersionSummary,
// @ts-expect-error Node 22 executes storage tests directly and needs the source extension.
} from "./sector-editor-versions.ts";
import {
  parseSectorEditorState,
  type SectorBoundaryDraft,
// @ts-expect-error Node 22 executes storage tests directly and needs the source extension.
} from "./sector-editor-drafts.ts";

export const SECTOR_EDITOR_VERSION_MANIFEST_SCHEMA = 2;
const HASH_ALGORITHM = "sha256";
const OBJECT_ID_PATTERN = /^sha256-[a-f0-9]{64}$/;

export interface SectorEditorVersionStorePaths {
  manifestPath: string;
  objectDirectory: string;
}

interface SectorEditorStoredVersion {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  activeId: string | null;
  draftObjectIds: string[];
  draftCount: number;
  completeDraftCount: number;
}

interface SectorEditorVersionManifest {
  schemaVersion: 2;
  hashAlgorithm: "sha256";
  versions: SectorEditorStoredVersion[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyManifest(): SectorEditorVersionManifest {
  return {
    schemaVersion: SECTOR_EDITOR_VERSION_MANIFEST_SCHEMA,
    hashAlgorithm: HASH_ALGORITHM,
    versions: [],
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (
      item === undefined ? "null" : canonicalJson(item)
    )).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("版本草稿包含无法序列化的值");
  }
  return serialized;
}

function draftObjectId(draft: SectorBoundaryDraft) {
  return `sha256-${createHash(HASH_ALGORITHM)
    .update(canonicalJson(draft))
    .digest("hex")}`;
}

function parseDraftObject(value: unknown, objectId: string) {
  const [draft] = parseSectorEditorState(JSON.stringify({
    schemaVersion: 1,
    drafts: [value],
  }));
  if (!draft || draftObjectId(draft) !== objectId) {
    throw new Error(`版本草稿对象哈希不匹配：${objectId}`);
  }
  return draft;
}

function parseManifest(value: unknown): SectorEditorVersionManifest {
  if (!isRecord(value)
    || value.schemaVersion !== SECTOR_EDITOR_VERSION_MANIFEST_SCHEMA
    || value.hashAlgorithm !== HASH_ALGORITHM
    || !Array.isArray(value.versions)) {
    throw new Error("持久版本 manifest 格式无效");
  }
  const versions = value.versions.map((rawVersion, index) => {
    if (!isRecord(rawVersion)) {
      throw new Error(`第 ${index + 1} 个持久版本引用格式无效`);
    }
    const id = typeof rawVersion.id === "string" ? rawVersion.id : "";
    const versionNumber = typeof rawVersion.versionNumber === "number"
      ? rawVersion.versionNumber
      : Number.NaN;
    const createdAt = typeof rawVersion.createdAt === "string"
      ? rawVersion.createdAt
      : "";
    const draftObjectIds = Array.isArray(rawVersion.draftObjectIds)
      ? rawVersion.draftObjectIds.filter(
        (objectId): objectId is string => (
          typeof objectId === "string" && OBJECT_ID_PATTERN.test(objectId)
        ),
      )
      : [];
    if (!id
      || !Number.isInteger(versionNumber)
      || versionNumber < 1
      || !createdAt
      || !Array.isArray(rawVersion.draftObjectIds)
      || draftObjectIds.length !== rawVersion.draftObjectIds.length
      || !Number.isInteger(rawVersion.draftCount)
      || Number(rawVersion.draftCount) < 0
      || Number(rawVersion.draftCount) > draftObjectIds.length
      || !Number.isInteger(rawVersion.completeDraftCount)
      || Number(rawVersion.completeDraftCount) < 0
      || Number(rawVersion.completeDraftCount) > Number(rawVersion.draftCount)) {
      throw new Error(`第 ${index + 1} 个持久版本引用缺少有效字段`);
    }
    return {
      id,
      versionNumber,
      label: typeof rawVersion.label === "string" && rawVersion.label.trim()
        ? rawVersion.label.trim().slice(0, 80)
        : `版本 ${versionNumber}`,
      createdAt,
      activeId: typeof rawVersion.activeId === "string"
        ? rawVersion.activeId
        : null,
      draftObjectIds,
      draftCount: Number(rawVersion.draftCount),
      completeDraftCount: Number(rawVersion.completeDraftCount),
    };
  });
  return {
    schemaVersion: SECTOR_EDITOR_VERSION_MANIFEST_SCHEMA,
    hashAlgorithm: HASH_ALGORITHM,
    versions,
  };
}

async function readManifest(
  paths: SectorEditorVersionStorePaths,
): Promise<SectorEditorVersionManifest> {
  try {
    return parseManifest(JSON.parse(await readFile(paths.manifestPath, "utf8")));
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return emptyManifest();
    }
    throw error;
  }
}

async function writeJsonAtomically(targetPath: string, value: unknown) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}-${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, targetPath);
}

async function writeDraftObject(
  paths: SectorEditorVersionStorePaths,
  draft: SectorBoundaryDraft,
) {
  const objectId = draftObjectId(draft);
  const objectPath = path.join(paths.objectDirectory, `${objectId}.json`);
  try {
    await stat(objectPath);
    const existing = parseDraftObject(
      JSON.parse(await readFile(objectPath, "utf8")),
      objectId,
    );
    return { objectId, draft: existing, created: false };
  } catch (error) {
    if (!(
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    )) {
      throw error;
    }
  }
  await mkdir(paths.objectDirectory, { recursive: true });
  const temporaryPath = path.join(
    paths.objectDirectory,
    `.${objectId}-${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, `${canonicalJson(draft)}\n`, "utf8");
  await rename(temporaryPath, objectPath);
  return { objectId, draft, created: true };
}

async function readDraftObject(
  paths: SectorEditorVersionStorePaths,
  objectId: string,
) {
  if (!OBJECT_ID_PATTERN.test(objectId)) {
    throw new Error(`版本草稿对象 ID 无效：${objectId}`);
  }
  return parseDraftObject(
    JSON.parse(await readFile(
      path.join(paths.objectDirectory, `${objectId}.json`),
      "utf8",
    )),
    objectId,
  );
}

function storedVersionFromResolved(
  version: SectorEditorPersistedVersion,
  draftObjectIds: string[],
): SectorEditorStoredVersion {
  const summary = summarizeSectorEditorVersion(version);
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    createdAt: version.createdAt,
    activeId: version.activeId,
    draftObjectIds,
    draftCount: summary.draftCount,
    completeDraftCount: summary.completeDraftCount,
  };
}

function summaryFromStored(
  version: SectorEditorStoredVersion,
): SectorEditorVersionSummary {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    createdAt: version.createdAt,
    draftCount: version.draftCount,
    completeDraftCount: version.completeDraftCount,
  };
}

export async function listSectorEditorVersions(
  paths: SectorEditorVersionStorePaths,
) {
  const manifest = await readManifest(paths);
  return manifest.versions
    .map(summaryFromStored)
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function readSectorEditorVersion(
  paths: SectorEditorVersionStorePaths,
  requestedId: string,
): Promise<SectorEditorPersistedVersion | null> {
  const manifest = await readManifest(paths);
  const stored = manifest.versions.find((version) => version.id === requestedId);
  if (!stored) return null;
  const objectById = new Map<string, SectorBoundaryDraft>();
  await Promise.all([...new Set(stored.draftObjectIds)].map(async (objectId) => {
    objectById.set(objectId, await readDraftObject(paths, objectId));
  }));
  const drafts = stored.draftObjectIds.map((objectId) => {
    const draft = objectById.get(objectId);
    if (!draft) throw new Error(`持久版本缺少草稿对象：${objectId}`);
    return draft;
  });
  return {
    id: stored.id,
    versionNumber: stored.versionNumber,
    label: stored.label,
    createdAt: stored.createdAt,
    activeId: drafts.some((draft) => draft.id === stored.activeId)
      ? stored.activeId
      : null,
    drafts,
  };
}

export async function appendSectorEditorVersion(
  paths: SectorEditorVersionStorePaths,
  input: {
    label?: string;
    activeId?: string | null;
    drafts: unknown;
  },
  options: {
    createdAt: string;
    id: string;
  },
) {
  const manifest = await readManifest(paths);
  const versionNumberOnlyStore = emptySectorEditorVersionStore();
  versionNumberOnlyStore.versions = manifest.versions.map((version) => ({
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    createdAt: version.createdAt,
    activeId: version.activeId,
    drafts: [],
  }));
  const version = createSectorEditorVersion(
    versionNumberOnlyStore,
    input,
    options,
  );
  const storedObjects = await Promise.all(
    version.drafts.map((draft) => writeDraftObject(paths, draft)),
  );
  manifest.versions.push(storedVersionFromResolved(
    version,
    storedObjects.map(({ objectId }) => objectId),
  ));
  await writeJsonAtomically(paths.manifestPath, manifest);
  return version;
}

export async function migrateLegacySectorEditorVersionStore(
  paths: SectorEditorVersionStorePaths,
  legacyValue: unknown,
) {
  const legacyStore = parseSectorEditorVersionStore(legacyValue);
  const manifest = emptyManifest();
  let createdObjectCount = 0;
  for (const version of legacyStore.versions) {
    const storedObjects = await Promise.all(
      version.drafts.map((draft) => writeDraftObject(paths, draft)),
    );
    createdObjectCount += storedObjects.filter(({ created }) => created).length;
    manifest.versions.push(storedVersionFromResolved(
      version,
      storedObjects.map(({ objectId }) => objectId),
    ));
  }
  await writeJsonAtomically(paths.manifestPath, manifest);
  return {
    versionCount: manifest.versions.length,
    referencedDraftCount: manifest.versions.reduce(
      (total, version) => total + version.draftObjectIds.length,
      0,
    ),
    objectCount: new Set(
      manifest.versions.flatMap((version) => version.draftObjectIds),
    ).size,
    createdObjectCount,
  };
}
