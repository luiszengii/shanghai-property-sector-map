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
  sourceCandidates: SaveSourceRevisionInput[];
  evidenceCandidates: SaveEvidenceRevisionInput[];
  reviews: ResearchBatchEvidenceReview[];
}

export interface ResearchBatchEvidenceReview {
  evidenceId: string;
  decision: "验收通过";
  reviewedAt: string;
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

export interface CreateResearchBatchInput {
  id: string;
  label: string;
  createdAt: string;
  sources: SaveSourceRevisionInput[];
  evidence: SaveEvidenceRevisionInput[];
}

export interface ReviewResearchBatchEvidenceInput {
  batchId: string;
  evidenceId: string;
  reviewed: boolean;
  reviewedAt: string;
}

export interface MergeResearchBatchInput {
  batchId: string;
  mergedAt: string;
  sourceRevisionIds: Record<string, string>;
  evidenceRevisionIds: Record<string, string>;
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

export interface ProjectionEligibility {
  evidenceId: string;
  objectId: string;
  field: string;
  value: string;
  eligible: boolean;
  blockers: string[];
}

export interface SnapshotProjectionPreview {
  snapshotId: string;
  label: string;
  createdAt: string;
  sourceRevisionCount: number;
  evidenceRevisionCount: number;
  projection: PublicProjectProjection;
  eligibility: ProjectionEligibility[];
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

function validateSourceCandidate(value: unknown, path: string) {
  const candidate = requireRecord(value, path);
  const id = requireString(candidate.id, `${path}.id`);
  requireString(candidate.title, `${path}.title`);
  requireString(candidate.publisher, `${path}.publisher`);
  requireString(candidate.url, `${path}.url`, true);
  requireString(candidate.sourceType, `${path}.sourceType`);
  requireString(candidate.licenseStatus, `${path}.licenseStatus`);
  requireEnum(candidate.allowedUse, sourceAllowedUses, `${path}.allowedUse`);
  requireString(candidate.note, `${path}.note`, true);
  return id;
}

function validateEvidenceCandidate(value: unknown, path: string) {
  const candidate = requireRecord(value, path);
  const id = requireString(candidate.id, `${path}.id`);
  if (candidate.objectType !== "project") {
    throw new Error(`${path}.objectType 无效`);
  }
  requireString(candidate.objectId, `${path}.objectId`);
  requireString(candidate.field, `${path}.field`);
  requireString(candidate.value, `${path}.value`);
  const sourceId = requireString(candidate.sourceId, `${path}.sourceId`);
  requireEnum(candidate.confidence, evidenceConfidences, `${path}.confidence`);
  const publicationStatus = requireEnum(
    candidate.publicationStatus,
    publicationStatuses,
    `${path}.publicationStatus`,
  );
  if (publicationStatus !== "待裁定") {
    throw new Error(`${path}.publicationStatus 必须为待裁定`);
  }
  requireIsoDate(candidate.observedAt, `${path}.observedAt`);
  requireIsoDate(candidate.reviewDueAt, `${path}.reviewDueAt`, true);
  requireString(candidate.note, `${path}.note`, true);
  return { id, sourceId };
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
    const sourceIds = requireStringArray(batch.sourceIds, `${path}.sourceIds`);
    const evidenceIds = requireStringArray(batch.evidenceIds, `${path}.evidenceIds`);
    if (!Array.isArray(batch.sourceCandidates)) {
      throw new Error(`${path}.sourceCandidates 必须是数组`);
    }
    if (!Array.isArray(batch.evidenceCandidates)) {
      throw new Error(`${path}.evidenceCandidates 必须是数组`);
    }
    if (!Array.isArray(batch.reviews)) {
      throw new Error(`${path}.reviews 必须是数组`);
    }
    const candidateSourceIds = new Set<string>();
    for (const [candidateIndex, candidate] of batch.sourceCandidates.entries()) {
      const id = validateSourceCandidate(
        candidate,
        `${path}.sourceCandidates[${candidateIndex}]`,
      );
      if (candidateSourceIds.has(id)) {
        throw new Error(`${path}.sourceCandidates 包含重复 ID ${id}`);
      }
      candidateSourceIds.add(id);
    }
    const candidateEvidenceIds = new Set<string>();
    for (const [candidateIndex, candidate] of batch.evidenceCandidates.entries()) {
      const { id, sourceId } = validateEvidenceCandidate(
        candidate,
        `${path}.evidenceCandidates[${candidateIndex}]`,
      );
      if (candidateEvidenceIds.has(id)) {
        throw new Error(`${path}.evidenceCandidates 包含重复 ID ${id}`);
      }
      if (!candidateSourceIds.has(sourceId)) {
        throw new Error(`${path}.evidenceCandidates 引用了批次外来源 ${sourceId}`);
      }
      candidateEvidenceIds.add(id);
    }
    if (
      sourceIds.length !== candidateSourceIds.size
      || sourceIds.some((id) => !candidateSourceIds.has(id))
    ) {
      throw new Error(`${path}.sourceIds 与来源候选不一致`);
    }
    if (
      evidenceIds.length !== candidateEvidenceIds.size
      || evidenceIds.some((id) => !candidateEvidenceIds.has(id))
    ) {
      throw new Error(`${path}.evidenceIds 与证据候选不一致`);
    }
    const reviewedEvidenceIds = new Set<string>();
    for (const [reviewIndex, reviewValue] of batch.reviews.entries()) {
      const reviewPath = `${path}.reviews[${reviewIndex}]`;
      const review = requireRecord(reviewValue, reviewPath);
      const evidenceId = requireString(review.evidenceId, `${reviewPath}.evidenceId`);
      if (!candidateEvidenceIds.has(evidenceId)) {
        throw new Error(`${reviewPath} 引用了批次外证据 ${evidenceId}`);
      }
      if (reviewedEvidenceIds.has(evidenceId)) {
        throw new Error(`${path}.reviews 包含重复 evidenceId ${evidenceId}`);
      }
      reviewedEvidenceIds.add(evidenceId);
      requireEnum(review.decision, ["验收通过"] as const, `${reviewPath}.decision`);
      requireIsoDate(review.reviewedAt, `${reviewPath}.reviewedAt`);
    }
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

export function createResearchBatch(
  ledger: SourceLedger,
  input: CreateResearchBatchInput,
) {
  if (ledger.researchBatches.some((batch) => batch.id === input.id)) {
    throw new Error(`研究批次 ID 已存在 ${input.id}`);
  }
  const batch: ResearchBatch = {
    id: input.id,
    label: input.label,
    status: "待裁定",
    createdAt: input.createdAt,
    sourceIds: input.sources.map((source) => source.id),
    evidenceIds: input.evidence.map((evidence) => evidence.id),
    sourceCandidates: input.sources,
    evidenceCandidates: input.evidence,
    reviews: [],
  };
  return parseSourceLedger({
    ...ledger,
    researchBatches: [...ledger.researchBatches, batch],
  });
}

export function reviewResearchBatchEvidence(
  ledger: SourceLedger,
  input: ReviewResearchBatchEvidenceInput,
) {
  const batch = ledger.researchBatches.find((item) => item.id === input.batchId);
  if (!batch) throw new Error(`研究批次不存在 ${input.batchId}`);
  if (!batch.evidenceIds.includes(input.evidenceId)) {
    throw new Error(`研究批次不包含证据 ${input.evidenceId}`);
  }
  if (batch.status !== "待裁定") {
    throw new Error(`研究批次状态为 ${batch.status}，不能修改验收勾选`);
  }
  const review: ResearchBatchEvidenceReview = {
    evidenceId: input.evidenceId,
    decision: "验收通过",
    reviewedAt: input.reviewedAt,
  };
  const nextBatch: ResearchBatch = {
    ...batch,
    reviews: input.reviewed
      ? [
        ...batch.reviews.filter((item) => item.evidenceId !== input.evidenceId),
        review,
      ]
      : batch.reviews.filter((item) => item.evidenceId !== input.evidenceId),
  };
  return parseSourceLedger({
    ...ledger,
    researchBatches: ledger.researchBatches.map((item) => (
      item.id === input.batchId ? nextBatch : item
    )),
  });
}

export function mergeResearchBatch(
  ledger: SourceLedger,
  input: MergeResearchBatchInput,
) {
  const batch = ledger.researchBatches.find((item) => item.id === input.batchId);
  if (!batch) throw new Error(`研究批次不存在 ${input.batchId}`);
  if (batch.status !== "待裁定") {
    throw new Error(`研究批次状态为 ${batch.status}，不能再次合并`);
  }
  const reviewedIds = new Set(batch.reviews.map((review) => review.evidenceId));
  const unreviewedIds = batch.evidenceIds.filter((id) => !reviewedIds.has(id));
  if (unreviewedIds.length > 0) {
    throw new Error(`研究批次仍有 ${unreviewedIds.length} 条候选未验收`);
  }

  let next = ledger;
  for (const source of batch.sourceCandidates) {
    const revisionId = input.sourceRevisionIds[source.id];
    if (typeof revisionId !== "string" || !revisionId.trim()) {
      throw new Error(`来源候选 ${source.id} 缺少合并修订 ID`);
    }
    next = saveSourceRevision(next, source, {
      revisionId,
      recordedAt: input.mergedAt,
    });
  }
  for (const evidence of batch.evidenceCandidates) {
    const revisionId = input.evidenceRevisionIds[evidence.id];
    if (typeof revisionId !== "string" || !revisionId.trim()) {
      throw new Error(`证据候选 ${evidence.id} 缺少合并修订 ID`);
    }
    next = saveEvidenceRevision(next, evidence, {
      revisionId,
      recordedAt: input.mergedAt,
    });
  }

  return parseSourceLedger({
    ...next,
    researchBatches: next.researchBatches.map((item) => (
      item.id === input.batchId
        ? { ...item, status: "已合并" }
        : item
    )),
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

export function getPublicProjectionBlockers(
  evidence: EvidenceRevision,
  source: SourceRevision | undefined,
  generatedAt: string,
) {
  const generatedTimestamp = Date.parse(generatedAt);
  if (Number.isNaN(generatedTimestamp)) throw new Error("公开投射时间无效");
  const blockers: string[] = [];
  if (evidence.publicationStatus !== "可公开投射") {
    blockers.push(`发布状态为「${evidence.publicationStatus}」`);
  }
  if (!source) {
    blockers.push("资料版本未包含对应来源修订");
  } else if (source.allowedUse !== "可公开引用") {
    blockers.push(`来源用途为「${source.allowedUse}」`);
  }
  if (
    evidence.reviewDueAt !== null
    && Date.parse(evidence.reviewDueAt) < generatedTimestamp
  ) {
    blockers.push(`已超过复核日期 ${evidence.reviewDueAt}`);
  }
  return blockers;
}

export function buildPublicProjectProjection(
  ledger: SourceLedger,
  generatedAt: string,
  sourceSnapshotId: string | null = null,
): PublicProjectProjection {
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("公开投射时间无效");
  }
  const sources = new Map(
    ledger.sources.map((source) => [source.id, currentRevision(source)]),
  );
  const projects: PublicProjectProjection["projects"] = {};
  for (const evidenceRecord of ledger.evidence) {
    const evidence = currentRevision(evidenceRecord);
    const source = sources.get(evidence.sourceId);
    if (
      !source
      || getPublicProjectionBlockers(evidence, source, generatedAt).length > 0
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

export function buildSnapshotProjectionPreview(
  ledger: SourceLedger,
  snapshotId: string,
  generatedAt: string,
): SnapshotProjectionPreview {
  const snapshot = ledger.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) throw new Error(`资料版本不存在 ${snapshotId}`);
  const sourceRevisionIds = new Set(snapshot.sourceRevisionIds);
  const evidenceRevisionIds = new Set(snapshot.evidenceRevisionIds);
  const sources = new Map<string, SourceRevision>();
  for (const source of ledger.sources) {
    const revision = source.revisions.find((item) => (
      sourceRevisionIds.has(item.revisionId)
    ));
    if (revision) sources.set(source.id, revision);
  }
  const eligibility: ProjectionEligibility[] = [];
  for (const evidence of ledger.evidence) {
    const revision = evidence.revisions.find((item) => (
      evidenceRevisionIds.has(item.revisionId)
    ));
    if (!revision) continue;
    const blockers = getPublicProjectionBlockers(
      revision,
      sources.get(revision.sourceId),
      generatedAt,
    );
    eligibility.push({
      evidenceId: evidence.id,
      objectId: revision.objectId,
      field: revision.field,
      value: revision.value,
      eligible: blockers.length === 0,
      blockers,
    });
  }
  return {
    snapshotId: snapshot.id,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    sourceRevisionCount: snapshot.sourceRevisionIds.length,
    evidenceRevisionCount: snapshot.evidenceRevisionIds.length,
    projection: buildPublicProjectProjectionFromSnapshot(
      ledger,
      snapshot.id,
      generatedAt,
    ),
    eligibility,
  };
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
