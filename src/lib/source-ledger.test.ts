import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicProjectProjection,
  createLedgerSnapshot,
  emptySourceLedger,
  parseSourceLedger,
  saveEvidenceRevision,
  saveSourceRevision,
// @ts-expect-error Node 22 executes this TypeScript test directly and needs the source extension.
} from "./source-ledger.ts";

test("有效的空来源台账可以打开", () => {
  const ledger = parseSourceLedger({
    schemaVersion: 1,
    sources: [],
    evidence: [],
    snapshots: [],
    researchBatches: [],
  });

  assert.equal(ledger.schemaVersion, 1);
  assert.deepEqual(ledger.sources, []);
  assert.deepEqual(ledger.evidence, []);
});

test("来源台账拒绝未知的来源用途", () => {
  assert.throws(
    () => parseSourceLedger({
      schemaVersion: 1,
      sources: [{
        id: "source-1",
        currentRevisionId: "source-revision-1",
        revisions: [{
          revisionId: "source-revision-1",
          revisionNumber: 1,
          recordedAt: "2026-07-27T00:00:00.000Z",
          title: "项目官方页面",
          publisher: "开发企业",
          url: "https://example.com/project",
          sourceType: "开发商页面",
          licenseStatus: "公开网页",
          allowedUse: "自动公开",
          note: "",
        }],
      }],
      evidence: [],
      snapshots: [],
      researchBatches: [],
    }),
    /allowedUse/,
  );
});

test("修改来源会追加不可变修订而不是覆盖历史", () => {
  const first = saveSourceRevision(emptySourceLedger(), {
    id: "source-1",
    title: "项目官方页面",
    publisher: "开发企业",
    url: "https://example.com/project",
    sourceType: "开发商页面",
    licenseStatus: "公开网页",
    allowedUse: "仅限事实核验",
    note: "首次登记",
  }, {
    revisionId: "source-revision-1",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });
  const second = saveSourceRevision(first, {
    id: "source-1",
    title: "项目官方资料页",
    publisher: "开发企业",
    url: "https://example.com/project",
    sourceType: "开发商页面",
    licenseStatus: "公开网页",
    allowedUse: "可公开引用",
    note: "人工确认允许公开引用",
  }, {
    revisionId: "source-revision-2",
    recordedAt: "2026-07-28T00:00:00.000Z",
  });

  assert.equal(first.sources[0].revisions.length, 1);
  assert.equal(second.sources[0].revisions.length, 2);
  assert.equal(second.sources[0].revisions[0].title, "项目官方页面");
  assert.equal(second.sources[0].currentRevisionId, "source-revision-2");
});

test("新增证据必须引用已登记来源", () => {
  assert.throws(
    () => saveEvidenceRevision(emptySourceLedger(), {
      id: "evidence-1",
      objectType: "project",
      objectId: "project_恒文璞悦江南",
      field: "开发企业",
      value: "示例开发企业",
      sourceId: "source-missing",
      confidence: "中",
      publicationStatus: "待裁定",
      observedAt: "2026-07-27",
      reviewDueAt: null,
      note: "",
    }, {
      revisionId: "evidence-revision-1",
      recordedAt: "2026-07-27T00:00:00.000Z",
    }),
    /未登记来源/,
  );
});

test("公开投射只包含未过复核期的公开证据并删除私有备注", () => {
  const withSource = saveSourceRevision(emptySourceLedger(), {
    id: "source-1",
    title: "项目官方页面",
    publisher: "开发企业",
    url: "https://example.com/project",
    sourceType: "开发商页面",
    licenseStatus: "公开网页",
    allowedUse: "可公开引用",
    note: "仅本地保存的来源判断",
  }, {
    revisionId: "source-revision-1",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });
  const withPublicEvidence = saveEvidenceRevision(withSource, {
    id: "evidence-public",
    objectType: "project",
    objectId: "project_恒文璞悦江南",
    field: "开发企业",
    value: "示例开发企业",
    sourceId: "source-1",
    confidence: "已核验",
    publicationStatus: "可公开投射",
    observedAt: "2026-07-27",
    reviewDueAt: "2027-07-27",
    note: "本地审核备注不得公开",
  }, {
    revisionId: "evidence-revision-public",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });
  const ledger = saveEvidenceRevision(withPublicEvidence, {
    id: "evidence-stale",
    objectType: "project",
    objectId: "project_恒文璞悦江南",
    field: "项目阶段",
    value: "待售",
    sourceId: "source-1",
    confidence: "高",
    publicationStatus: "可公开投射",
    observedAt: "2025-01-01",
    reviewDueAt: "2026-01-01",
    note: "已经过期",
  }, {
    revisionId: "evidence-revision-stale",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });

  const projection = buildPublicProjectProjection(
    ledger,
    "2026-07-27T12:00:00.000Z",
  );

  assert.deepEqual(projection.projects, {
    "project_恒文璞悦江南": {
      fields: [{
        evidenceId: "evidence-public",
        field: "开发企业",
        value: "示例开发企业",
        confidence: "已核验",
        observedAt: "2026-07-27",
        source: {
          title: "项目官方页面",
          publisher: "开发企业",
          url: "https://example.com/project",
        },
      }],
    },
  });
  assert.equal(JSON.stringify(projection).includes("本地审核备注"), false);
  assert.equal(JSON.stringify(projection).includes("revision"), false);
});

test("台账版本冻结保存时的当前修订", () => {
  const withSource = saveSourceRevision(emptySourceLedger(), {
    id: "source-1",
    title: "第一版来源",
    publisher: "开发企业",
    url: "https://example.com/project",
    sourceType: "开发商页面",
    licenseStatus: "公开网页",
    allowedUse: "可公开引用",
    note: "",
  }, {
    revisionId: "source-revision-1",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });
  const withEvidence = saveEvidenceRevision(withSource, {
    id: "evidence-1",
    objectType: "project",
    objectId: "project_恒文璞悦江南",
    field: "开发企业",
    value: "第一版开发企业",
    sourceId: "source-1",
    confidence: "高",
    publicationStatus: "待裁定",
    observedAt: "2026-07-27",
    reviewDueAt: null,
    note: "",
  }, {
    revisionId: "evidence-revision-1",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });
  const snapshotted = createLedgerSnapshot(withEvidence, {
    id: "snapshot-1",
    label: "首次人工整理",
    createdAt: "2026-07-27T01:00:00.000Z",
  });
  const revised = saveSourceRevision(snapshotted, {
    id: "source-1",
    title: "第二版来源",
    publisher: "开发企业",
    url: "https://example.com/project",
    sourceType: "开发商页面",
    licenseStatus: "公开网页",
    allowedUse: "可公开引用",
    note: "",
  }, {
    revisionId: "source-revision-2",
    recordedAt: "2026-07-28T00:00:00.000Z",
  });

  assert.equal(revised.snapshots[0].sourceRevisionIds[0], "source-revision-1");
  assert.equal(revised.snapshots[0].evidenceRevisionIds[0], "evidence-revision-1");
});
