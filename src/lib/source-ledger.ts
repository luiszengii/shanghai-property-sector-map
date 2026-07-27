export const publicationStatuses = [
  "仅本地研究",
  "待裁定",
  "可公开投射",
  "禁止公开",
] as const;

export const evidenceConfidences = [
  "已核验",
  "高",
  "中",
  "低/线索",
] as const;

export const sourceAllowedUses = [
  "可公开引用",
  "仅限事实核验",
  "仅限本地研究",
  "禁止使用",
] as const;

export type PublicationStatus = (typeof publicationStatuses)[number];
export type EvidenceConfidence = (typeof evidenceConfidences)[number];
export type SourceAllowedUse = (typeof sourceAllowedUses)[number];

export interface SourceRevision {
  revisionId: string;
  revisionNumber: number;
  recordedAt: string;
  title: string;
  publisher: string;
  url: string;
  sourceType: string;
  licenseStatus: string;
  allowedUse: SourceAllowedUse;
  note: string;
}

export interface EvidenceRevision {
  revisionId: string;
  revisionNumber: number;
  recordedAt: string;
  objectType: "project";
  objectId: string;
  field: string;
  value: string;
  sourceId: string;
  confidence: EvidenceConfidence;
  publicationStatus: PublicationStatus;
  observedAt: string;
  reviewDueAt: string | null;
  note: string;
}

export interface VersionedSource {
  id: string;
  currentRevisionId: string;
  revisions: SourceRevision[];
}

export interface VersionedEvidence {
  id: string;
  currentRevisionId: string;
  revisions: EvidenceRevision[];
}

export interface LedgerSnapshot {
  id: string;
  label: string;
  createdAt: string;
  sourceRevisionIds: string[];
  evidenceRevisionIds: string[];
}

export interface ResearchBatch {
  id: string;
  label: string;
  status: "待裁定" | "已合并" | "已退回";
  createdAt: string;
  sourceIds: string[];
  evidenceIds: string[];
}

export interface SourceLedger {
  schemaVersion: 1;
  sources: VersionedSource[];
  evidence: VersionedEvidence[];
  snapshots: LedgerSnapshot[];
  researchBatches: ResearchBatch[];
}

export interface SaveSourceRevisionInput {
  id: string;
  title: string;
  publisher: string;
  url: string;
  sourceType: string;
  licenseStatus: string;
  allowedUse: SourceAllowedUse;
  note: string;
}

export interface SaveEvidenceRevisionInput {
  id: string;
  objectType: "project";
  objectId: string;
  field: string;
  value: string;
  sourceId: string;
  confidence: EvidenceConfidence;
  publicationStatus: PublicationStatus;
  observedAt: string;
  reviewDueAt: string | null;
  note: string;
}

export interface RevisionMetadata {
  revisionId: string;
  recordedAt: string;
}

export interface CreateLedgerSnapshotInput {
  id: string;
  label: string;
  createdAt: string;
}

export interface PublicProjectProjection {
  schemaVersion: 1;
  generatedAt: string;
  sourceSnapshotId: string | null;
  projects: Record<string, {
    fields: Array<{
      evidenceId: string;
      field: string;
      value: string;
      confidence: EvidenceConfidence;
      observedAt: string;
      source: {
        title: string;
        publisher: string;
        url: string;
      };
    }>;
  }>;
}

const publicFieldKeys = [
  "evidenceId",
  "field",
  "value",
  "confidence",
  "observedAt",
  "source",
] as const;

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
) {
  const actual = Object.keys(value).toSorted();
  const sortedExpected = [...expected].toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${path} 包含未允许字段`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string) {
  if (!isRecord(value)) throw new Error(`${path} 必须是对象`);
  return value;
}

function requireString(value: unknown, path: string, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${path} 必须是${allowEmpty ? "" : "非空"}字符串`);
  }
  return value;
}

function requireNumber(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${path} 必须是正整数`);
  }
  return value;
}

function requireStringArray(value: unknown, path: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path} 必须是字符串数组`);
  }
  return value as string[];
}

function requireEnum<T extends readonly string[]>(
  value: unknown,
  options: T,
  path: string,
): T[number] {
  if (typeof value !== "string" || !options.includes(value)) {
    throw new Error(`${path} 无效`);
  }
  return value as T[number];
}

function requireIsoDate(value: unknown, path: string, nullable = false) {
  if (nullable && value === null) return null;
  const text = requireString(value, path);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${path} 必须是有效日期`);
  return text;
}

function validateVersionedSource(value: unknown, index: number) {
  const path = `sources[${index}]`;
  const record = requireRecord(value, path);
  const id = requireString(record.id, `${path}.id`);
  const currentRevisionId = requireString(record.currentRevisionId, `${path}.currentRevisionId`);
  if (!Array.isArray(record.revisions) || record.revisions.length === 0) {
    throw new Error(`${path}.revisions 必须至少包含一条修订`);
  }
  const revisionIds = new Set<string>();
  const revisionNumbers = new Set<number>();
  for (const [revisionIndex, revisionValue] of record.revisions.entries()) {
    const revisionPath = `${path}.revisions[${revisionIndex}]`;
    const revision = requireRecord(revisionValue, revisionPath);
    const revisionId = requireString(revision.revisionId, `${revisionPath}.revisionId`);
    const revisionNumber = requireNumber(revision.revisionNumber, `${revisionPath}.revisionNumber`);
    if (revisionIds.has(revisionId) || revisionNumbers.has(revisionNumber)) {
      throw new Error(`${revisionPath} 包含重复修订`);
    }
    revisionIds.add(revisionId);
    revisionNumbers.add(revisionNumber);
    requireIsoDate(revision.recordedAt, `${revisionPath}.recordedAt`);
    requireString(revision.title, `${revisionPath}.title`);
    requireString(revision.publisher, `${revisionPath}.publisher`);
    requireString(revision.url, `${revisionPath}.url`, true);
    requireString(revision.sourceType, `${revisionPath}.sourceType`);
    requireString(revision.licenseStatus, `${revisionPath}.licenseStatus`);
    requireEnum(revision.allowedUse, sourceAllowedUses, `${revisionPath}.allowedUse`);
    requireString(revision.note, `${revisionPath}.note`, true);
  }
  if (!revisionIds.has(currentRevisionId)) {
    throw new Error(`${path}.currentRevisionId 没有对应修订`);
  }
  return id;
}

function validateVersionedEvidence(value: unknown, index: number) {
  const path = `evidence[${index}]`;
  const record = requireRecord(value, path);
  const id = requireString(record.id, `${path}.id`);
  const currentRevisionId = requireString(record.currentRevisionId, `${path}.currentRevisionId`);
  if (!Array.isArray(record.revisions) || record.revisions.length === 0) {
    throw new Error(`${path}.revisions 必须至少包含一条修订`);
  }
  const revisionIds = new Set<string>();
  const revisionNumbers = new Set<number>();
  for (const [revisionIndex, revisionValue] of record.revisions.entries()) {
    const revisionPath = `${path}.revisions[${revisionIndex}]`;
    const revision = requireRecord(revisionValue, revisionPath);
    const revisionId = requireString(revision.revisionId, `${revisionPath}.revisionId`);
    const revisionNumber = requireNumber(revision.revisionNumber, `${revisionPath}.revisionNumber`);
    if (revisionIds.has(revisionId) || revisionNumbers.has(revisionNumber)) {
      throw new Error(`${revisionPath} 包含重复修订`);
    }
    revisionIds.add(revisionId);
    revisionNumbers.add(revisionNumber);
    requireIsoDate(revision.recordedAt, `${revisionPath}.recordedAt`);
    if (revision.objectType !== "project") {
      throw new Error(`${revisionPath}.objectType 无效`);
    }
    requireString(revision.objectId, `${revisionPath}.objectId`);
    requireString(revision.field, `${revisionPath}.field`);
    requireString(revision.value, `${revisionPath}.value`);
    requireString(revision.sourceId, `${revisionPath}.sourceId`);
    requireEnum(revision.confidence, evidenceConfidences, `${revisionPath}.confidence`);
    requireEnum(revision.publicationStatus, publicationStatuses, `${revisionPath}.publicationStatus`);
    requireIsoDate(revision.observedAt, `${revisionPath}.observedAt`);
    requireIsoDate(revision.reviewDueAt, `${revisionPath}.reviewDueAt`, true);
    requireString(revision.note, `${revisionPath}.note`, true);
  }
  if (!revisionIds.has(currentRevisionId)) {
    throw new Error(`${path}.currentRevisionId 没有对应修订`);
  }
  return id;
}

export function parseSourceLedger(value: unknown): SourceLedger {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("来源台账 schemaVersion 必须为 1");
  }
  if (
    !Array.isArray(value.sources)
    || !Array.isArray(value.evidence)
    || !Array.isArray(value.snapshots)
    || !Array.isArray(value.researchBatches)
  ) {
    throw new Error("来源台账缺少必要集合");
  }
  const sourceIds = new Set<string>();
  for (const [index, source] of value.sources.entries()) {
    const id = validateVersionedSource(source, index);
    if (sourceIds.has(id)) throw new Error(`sources 包含重复 ID ${id}`);
    sourceIds.add(id);
  }
  const evidenceIds = new Set<string>();
  for (const [index, evidence] of value.evidence.entries()) {
    const id = validateVersionedEvidence(evidence, index);
    if (evidenceIds.has(id)) throw new Error(`evidence 包含重复 ID ${id}`);
    evidenceIds.add(id);
  }
  for (const [index, snapshotValue] of value.snapshots.entries()) {
    const path = `snapshots[${index}]`;
    const snapshot = requireRecord(snapshotValue, path);
    requireString(snapshot.id, `${path}.id`);
    requireString(snapshot.label, `${path}.label`);
    requireIsoDate(snapshot.createdAt, `${path}.createdAt`);
    requireStringArray(snapshot.sourceRevisionIds, `${path}.sourceRevisionIds`);
    requireStringArray(snapshot.evidenceRevisionIds, `${path}.evidenceRevisionIds`);
  }
  for (const [index, batchValue] of value.researchBatches.entries()) {
    const path = `researchBatches[${index}]`;
    const batch = requireRecord(batchValue, path);
    requireString(batch.id, `${path}.id`);
    requireString(batch.label, `${path}.label`);
    requireEnum(batch.status, ["待裁定", "已合并", "已退回"] as const, `${path}.status`);
    requireIsoDate(batch.createdAt, `${path}.createdAt`);
    requireStringArray(batch.sourceIds, `${path}.sourceIds`);
    requireStringArray(batch.evidenceIds, `${path}.evidenceIds`);
  }
  return value as unknown as SourceLedger;
}

export function parsePublicProjectProjection(
  value: unknown,
): PublicProjectProjection {
  const projection = requireRecord(value, "publicProjection");
  requireExactKeys(
    projection,
    ["schemaVersion", "generatedAt", "sourceSnapshotId", "projects"],
    "publicProjection",
  );
  if (projection.schemaVersion !== 1) {
    throw new Error("公开投射 schemaVersion 必须为 1");
  }
  requireIsoDate(projection.generatedAt, "publicProjection.generatedAt");
  if (
    projection.sourceSnapshotId !== null
    && typeof projection.sourceSnapshotId !== "string"
  ) {
    throw new Error("publicProjection.sourceSnapshotId 必须是字符串或 null");
  }
  const projects = requireRecord(projection.projects, "publicProjection.projects");
  for (const [projectId, projectValue] of Object.entries(projects)) {
    const projectPath = `publicProjection.projects.${projectId}`;
    const project = requireRecord(projectValue, projectPath);
    requireExactKeys(project, ["fields"], projectPath);
    if (!Array.isArray(project.fields)) {
      throw new Error(`${projectPath}.fields 必须是数组`);
    }
    const evidenceIds = new Set<string>();
    for (const [index, fieldValue] of project.fields.entries()) {
      const fieldPath = `${projectPath}.fields[${index}]`;
      const field = requireRecord(fieldValue, fieldPath);
      requireExactKeys(field, publicFieldKeys, fieldPath);
      const evidenceId = requireString(field.evidenceId, `${fieldPath}.evidenceId`);
      if (evidenceIds.has(evidenceId)) {
        throw new Error(`${projectPath} 包含重复 evidenceId ${evidenceId}`);
      }
      evidenceIds.add(evidenceId);
      requireString(field.field, `${fieldPath}.field`);
      requireString(field.value, `${fieldPath}.value`);
      requireEnum(field.confidence, evidenceConfidences, `${fieldPath}.confidence`);
      requireIsoDate(field.observedAt, `${fieldPath}.observedAt`);
      const source = requireRecord(field.source, `${fieldPath}.source`);
      requireExactKeys(source, ["title", "publisher", "url"], `${fieldPath}.source`);
      requireString(source.title, `${fieldPath}.source.title`);
      requireString(source.publisher, `${fieldPath}.source.publisher`);
      requireString(source.url, `${fieldPath}.source.url`);
    }
  }
  return value as PublicProjectProjection;
}

export function emptySourceLedger(): SourceLedger {
  return {
    schemaVersion: 1,
    sources: [],
    evidence: [],
    snapshots: [],
    researchBatches: [],
  };
}

export function saveSourceRevision(
  ledger: SourceLedger,
  input: SaveSourceRevisionInput,
  metadata: RevisionMetadata,
) {
  const existing = ledger.sources.find((source) => source.id === input.id);
  const revision: SourceRevision = {
    revisionId: metadata.revisionId,
    revisionNumber: existing
      ? Math.max(...existing.revisions.map((item) => item.revisionNumber)) + 1
      : 1,
    recordedAt: metadata.recordedAt,
    title: input.title,
    publisher: input.publisher,
    url: input.url,
    sourceType: input.sourceType,
    licenseStatus: input.licenseStatus,
    allowedUse: input.allowedUse,
    note: input.note,
  };
  const nextSource: VersionedSource = {
    id: input.id,
    currentRevisionId: revision.revisionId,
    revisions: existing ? [...existing.revisions, revision] : [revision],
  };
  return parseSourceLedger({
    ...ledger,
    sources: existing
      ? ledger.sources.map((source) => source.id === input.id ? nextSource : source)
      : [...ledger.sources, nextSource],
  });
}

export function saveEvidenceRevision(
  ledger: SourceLedger,
  input: SaveEvidenceRevisionInput,
  metadata: RevisionMetadata,
) {
  if (!ledger.sources.some((source) => source.id === input.sourceId)) {
    throw new Error(`证据引用了未登记来源 ${input.sourceId}`);
  }
  const existing = ledger.evidence.find((evidence) => evidence.id === input.id);
  const revision: EvidenceRevision = {
    revisionId: metadata.revisionId,
    revisionNumber: existing
      ? Math.max(...existing.revisions.map((item) => item.revisionNumber)) + 1
      : 1,
    recordedAt: metadata.recordedAt,
    objectType: input.objectType,
    objectId: input.objectId,
    field: input.field,
    value: input.value,
    sourceId: input.sourceId,
    confidence: input.confidence,
    publicationStatus: input.publicationStatus,
    observedAt: input.observedAt,
    reviewDueAt: input.reviewDueAt,
    note: input.note,
  };
  const nextEvidence: VersionedEvidence = {
    id: input.id,
    currentRevisionId: revision.revisionId,
    revisions: existing ? [...existing.revisions, revision] : [revision],
  };
  return parseSourceLedger({
    ...ledger,
    evidence: existing
      ? ledger.evidence.map((evidence) => evidence.id === input.id ? nextEvidence : evidence)
      : [...ledger.evidence, nextEvidence],
  });
}

function currentRevision<T extends { revisionId: string }>(
  record: { currentRevisionId: string; revisions: T[] },
) {
  const revision = record.revisions.find(
    (item) => item.revisionId === record.currentRevisionId,
  );
  if (!revision) throw new Error(`当前修订 ${record.currentRevisionId} 不存在`);
  return revision;
}

export function getCurrentSourceRevision(source: VersionedSource) {
  return currentRevision(source);
}

export function getCurrentEvidenceRevision(evidence: VersionedEvidence) {
  return currentRevision(evidence);
}

export function buildPublicProjectProjection(
  ledger: SourceLedger,
  generatedAt: string,
  sourceSnapshotId: string | null = null,
): PublicProjectProjection {
  const generatedTimestamp = Date.parse(generatedAt);
  if (Number.isNaN(generatedTimestamp)) throw new Error("公开投射时间无效");
  const sources = new Map(
    ledger.sources.map((source) => [source.id, currentRevision(source)]),
  );
  const projects: PublicProjectProjection["projects"] = {};
  for (const evidenceRecord of ledger.evidence) {
    const evidence = currentRevision(evidenceRecord);
    const source = sources.get(evidence.sourceId);
    const stale = evidence.reviewDueAt !== null
      && Date.parse(evidence.reviewDueAt) < generatedTimestamp;
    if (
      evidence.publicationStatus !== "可公开投射"
      || stale
      || !source
      || source.allowedUse !== "可公开引用"
    ) {
      continue;
    }
    const project = projects[evidence.objectId] ?? { fields: [] };
    project.fields.push({
      evidenceId: evidenceRecord.id,
      field: evidence.field,
      value: evidence.value,
      confidence: evidence.confidence,
      observedAt: evidence.observedAt,
      source: {
        title: source.title,
        publisher: source.publisher,
        url: source.url,
      },
    });
    projects[evidence.objectId] = project;
  }
  return {
    schemaVersion: 1,
    generatedAt,
    sourceSnapshotId,
    projects,
  };
}

export function buildPublicProjectProjectionFromSnapshot(
  ledger: SourceLedger,
  snapshotId: string,
  generatedAt: string,
) {
  const snapshot = ledger.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) throw new Error(`资料版本不存在 ${snapshotId}`);
  const sourceRevisionIds = new Set(snapshot.sourceRevisionIds);
  const evidenceRevisionIds = new Set(snapshot.evidenceRevisionIds);
  const frozenLedger: SourceLedger = {
    ...ledger,
    sources: ledger.sources.flatMap((source) => {
      const revision = source.revisions.find((item) => (
        sourceRevisionIds.has(item.revisionId)
      ));
      return revision ? [{
        ...source,
        currentRevisionId: revision.revisionId,
      }] : [];
    }),
    evidence: ledger.evidence.flatMap((evidence) => {
      const revision = evidence.revisions.find((item) => (
        evidenceRevisionIds.has(item.revisionId)
      ));
      return revision ? [{
        ...evidence,
        currentRevisionId: revision.revisionId,
      }] : [];
    }),
  };
  return buildPublicProjectProjection(frozenLedger, generatedAt, snapshot.id);
}

export function createLedgerSnapshot(
  ledger: SourceLedger,
  input: CreateLedgerSnapshotInput,
) {
  if (ledger.snapshots.some((snapshot) => snapshot.id === input.id)) {
    throw new Error(`台账版本 ID 已存在 ${input.id}`);
  }
  const snapshot: LedgerSnapshot = {
    id: input.id,
    label: input.label,
    createdAt: input.createdAt,
    sourceRevisionIds: ledger.sources.map((source) => source.currentRevisionId),
    evidenceRevisionIds: ledger.evidence.map((evidence) => evidence.currentRevisionId),
  };
  return parseSourceLedger({
    ...ledger,
    snapshots: [...ledger.snapshots, snapshot],
  });
}
