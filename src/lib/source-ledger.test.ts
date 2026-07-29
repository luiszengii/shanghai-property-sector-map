import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicProjectProjection,
  buildPublicProjectProjectionFromSnapshot,
  buildSnapshotProjectionPreview,
  createResearchBatch,
  createLedgerSnapshot,
  emptySourceLedger,
  mergeResearchBatch,
  parsePublicProjectProjection,
  parseSourceLedger,
  reviewResearchBatchEvidence,
  saveEvidenceRevision,
  saveSourceRevision,
// @ts-expect-error Node 22 executes this TypeScript test directly and needs the source extension.
} from "./source-ledger.ts";

test("研究结果导入为待裁定批次且不会进入当前台账", () => {
  const ledger = createResearchBatch(emptySourceLedger(), {
    id: "research-batch-1",
    label: "46 个楼盘首轮身份与 Fangdi 验收",
    createdAt: "2026-07-29T00:00:00.000Z",
    sources: [{
      id: "candidate-source-1",
      title: "网上房地产项目详情",
      publisher: "上海市房地产交易中心",
      url: "https://www.fangdi.com.cn/new_house/new_house_detail.html?project_id=example",
      sourceType: "官方查询页面",
      licenseStatus: "公开查询页面；转载许可待裁定",
      allowedUse: "仅限事实核验",
      note: "",
    }],
    evidence: [{
      id: "candidate-evidence-1",
      objectType: "project",
      objectId: "project_中建虹悦里",
      field: "法定项目名",
      value: "虹映悦庭",
      sourceId: "candidate-source-1",
      confidence: "高",
      publicationStatus: "待裁定",
      observedAt: "2026-07-29",
      reviewDueAt: null,
      note: "",
    }],
  });

  assert.equal(ledger.sources.length, 0);
  assert.equal(ledger.evidence.length, 0);
  assert.equal(ledger.researchBatches.length, 1);
  assert.equal(ledger.researchBatches[0].status, "待裁定");
  assert.equal(ledger.researchBatches[0].sourceCandidates.length, 1);
  assert.equal(ledger.researchBatches[0].evidenceCandidates.length, 1);
  assert.deepEqual(ledger.researchBatches[0].reviews, []);
});

test("验收勾选只记录批次审核且不会合并或发布候选", () => {
  const imported = createResearchBatch(emptySourceLedger(), {
    id: "research-batch-1",
    label: "待验收研究",
    createdAt: "2026-07-29T00:00:00.000Z",
    sources: [{
      id: "candidate-source-1",
      title: "官方查询",
      publisher: "官方机构",
      url: "https://example.com",
      sourceType: "官方网页",
      licenseStatus: "待裁定",
      allowedUse: "仅限事实核验",
      note: "",
    }],
    evidence: [{
      id: "candidate-evidence-1",
      objectType: "project",
      objectId: "project_中建虹悦里",
      field: "法定项目名",
      value: "虹映悦庭",
      sourceId: "candidate-source-1",
      confidence: "高",
      publicationStatus: "待裁定",
      observedAt: "2026-07-29",
      reviewDueAt: null,
      note: "",
    }],
  });
  const reviewed = reviewResearchBatchEvidence(imported, {
    batchId: "research-batch-1",
    evidenceId: "candidate-evidence-1",
    reviewed: true,
    reviewedAt: "2026-07-29T01:00:00.000Z",
  });

  assert.deepEqual(reviewed.researchBatches[0].reviews, [{
    evidenceId: "candidate-evidence-1",
    decision: "验收通过",
    reviewedAt: "2026-07-29T01:00:00.000Z",
  }]);
  assert.equal(reviewed.researchBatches[0].status, "待裁定");
  assert.equal(reviewed.sources.length, 0);
  assert.equal(reviewed.evidence.length, 0);
  assert.deepEqual(
    buildPublicProjectProjection(
      reviewed,
      "2026-07-29T01:00:00.000Z",
    ).projects,
    {},
  );

  const unchecked = reviewResearchBatchEvidence(reviewed, {
    batchId: "research-batch-1",
    evidenceId: "candidate-evidence-1",
    reviewed: false,
    reviewedAt: "2026-07-29T02:00:00.000Z",
  });
  assert.deepEqual(unchecked.researchBatches[0].reviews, []);
});

test("全部验收的研究批次可以并入当前台账但不会自动公开", () => {
  const imported = createResearchBatch(emptySourceLedger(), {
    id: "research-batch-merge",
    label: "待合并研究",
    createdAt: "2026-07-29T00:00:00.000Z",
    sources: [{
      id: "candidate-source-merge",
      title: "官方查询",
      publisher: "官方机构",
      url: "https://example.com",
      sourceType: "官方网页",
      licenseStatus: "待裁定",
      allowedUse: "仅限事实核验",
      note: "",
    }],
    evidence: [{
      id: "candidate-evidence-merge",
      objectType: "project",
      objectId: "project_中建虹悦里",
      field: "法定项目名",
      value: "虹映悦庭",
      sourceId: "candidate-source-merge",
      confidence: "高",
      publicationStatus: "待裁定",
      observedAt: "2026-07-29",
      reviewDueAt: null,
      note: "",
    }],
  });
  const reviewed = reviewResearchBatchEvidence(imported, {
    batchId: "research-batch-merge",
    evidenceId: "candidate-evidence-merge",
    reviewed: true,
    reviewedAt: "2026-07-29T01:00:00.000Z",
  });

  const merged = mergeResearchBatch(reviewed, {
    batchId: "research-batch-merge",
    mergedAt: "2026-07-29T02:00:00.000Z",
    sourceRevisionIds: {
      "candidate-source-merge": "source-revision-merge",
    },
    evidenceRevisionIds: {
      "candidate-evidence-merge": "evidence-revision-merge",
    },
  });

  assert.equal(merged.researchBatches[0].status, "已合并");
  assert.equal(merged.sources.length, 1);
  assert.equal(merged.sources[0].currentRevisionId, "source-revision-merge");
  assert.equal(merged.evidence.length, 1);
  assert.equal(merged.evidence[0].currentRevisionId, "evidence-revision-merge");
  assert.equal(merged.evidence[0].revisions[0].publicationStatus, "待裁定");
  assert.deepEqual(
    buildPublicProjectProjection(
      merged,
      "2026-07-29T03:00:00.000Z",
    ).projects,
    {},
  );
});

test("仍有未验收候选时研究批次不能并入当前台账", () => {
  const imported = createResearchBatch(emptySourceLedger(), {
    id: "research-batch-unreviewed",
    label: "未完成验收研究",
    createdAt: "2026-07-29T00:00:00.000Z",
    sources: [{
      id: "candidate-source-unreviewed",
      title: "官方查询",
      publisher: "官方机构",
      url: "https://example.com",
      sourceType: "官方网页",
      licenseStatus: "待裁定",
      allowedUse: "仅限事实核验",
      note: "",
    }],
    evidence: [{
      id: "candidate-evidence-unreviewed",
      objectType: "project",
      objectId: "project_中建虹悦里",
      field: "法定项目名",
      value: "虹映悦庭",
      sourceId: "candidate-source-unreviewed",
      confidence: "高",
      publicationStatus: "待裁定",
      observedAt: "2026-07-29",
      reviewDueAt: null,
      note: "",
    }],
  });

  assert.throws(
    () => mergeResearchBatch(imported, {
      batchId: "research-batch-unreviewed",
      mergedAt: "2026-07-29T02:00:00.000Z",
      sourceRevisionIds: {
        "candidate-source-unreviewed": "source-revision-unreviewed",
      },
      evidenceRevisionIds: {
        "candidate-evidence-unreviewed": "evidence-revision-unreviewed",
      },
    }),
    /仍有 1 条候选未验收/,
  );
  assert.equal(imported.sources.length, 0);
  assert.equal(imported.evidence.length, 0);
  assert.equal(imported.researchBatches[0].status, "待裁定");
});

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
  assert.equal(projection.sourceSnapshotId, null);
  assert.equal(JSON.stringify(projection).includes("本地审核备注"), false);
  assert.equal(JSON.stringify(projection).includes("revision"), false);
});

test("公开投射拒绝私有字段或其他未声明字段", () => {
  assert.throws(
    () => parsePublicProjectProjection({
      schemaVersion: 1,
      generatedAt: "2026-07-27T12:00:00.000Z",
      sourceSnapshotId: null,
      projects: {
        "project_恒文璞悦江南": {
          fields: [{
            evidenceId: "evidence-1",
            field: "项目地址",
            value: "青浦区珠湖路889弄",
            confidence: "已核验",
            observedAt: "2026-07-22",
            note: "不得公开的本地备注",
            source: {
              title: "项目官方页面",
              publisher: "开发企业",
              url: "https://example.com/project",
            },
          }],
        },
      },
    }),
    /未允许字段/,
  );
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

test("从资料版本生成公开投射时使用冻结修订而不是当前修订", () => {
  const withSource = saveSourceRevision(emptySourceLedger(), {
    id: "source-1",
    title: "项目官方页面",
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
    field: "项目阶段",
    value: "待售",
    sourceId: "source-1",
    confidence: "高",
    publicationStatus: "可公开投射",
    observedAt: "2026-07-27",
    reviewDueAt: "2027-07-27",
    note: "",
  }, {
    revisionId: "evidence-revision-1",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });
  const snapshotted = createLedgerSnapshot(withEvidence, {
    id: "snapshot-reviewed",
    label: "人工审核版本",
    createdAt: "2026-07-27T01:00:00.000Z",
  });
  const revised = saveEvidenceRevision(snapshotted, {
    id: "evidence-1",
    objectType: "project",
    objectId: "project_恒文璞悦江南",
    field: "项目阶段",
    value: "已售罄",
    sourceId: "source-1",
    confidence: "高",
    publicationStatus: "禁止公开",
    observedAt: "2026-07-28",
    reviewDueAt: "2027-07-28",
    note: "",
  }, {
    revisionId: "evidence-revision-2",
    recordedAt: "2026-07-28T00:00:00.000Z",
  });

  const projection = buildPublicProjectProjectionFromSnapshot(
    revised,
    "snapshot-reviewed",
    "2026-07-29T00:00:00.000Z",
  );

  assert.equal(projection.sourceSnapshotId, "snapshot-reviewed");
  assert.equal(
    projection.projects["project_恒文璞悦江南"].fields[0].value,
    "待售",
  );
});

test("资料版本预览逐条解释字段为什么没有进入公开数据", () => {
  const withSource = saveSourceRevision(emptySourceLedger(), {
    id: "source-1",
    title: "项目页面",
    publisher: "开发企业",
    url: "https://example.com/project",
    sourceType: "开发商页面",
    licenseStatus: "待核验",
    allowedUse: "仅限事实核验",
    note: "",
  }, {
    revisionId: "source-revision-1",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });
  const withEvidence = saveEvidenceRevision(withSource, {
    id: "evidence-1",
    objectType: "project",
    objectId: "project_东岸观邸",
    field: "test",
    value: "test",
    sourceId: "source-1",
    confidence: "中",
    publicationStatus: "待裁定",
    observedAt: "2026-07-27",
    reviewDueAt: null,
    note: "",
  }, {
    revisionId: "evidence-revision-1",
    recordedAt: "2026-07-27T00:00:00.000Z",
  });
  const ledger = createLedgerSnapshot(withEvidence, {
    id: "snapshot-test",
    label: "测试版本",
    createdAt: "2026-07-27T01:00:00.000Z",
  });

  const preview = buildSnapshotProjectionPreview(
    ledger,
    "snapshot-test",
    "2026-07-27T12:00:00.000Z",
  );

  assert.deepEqual(preview.projection.projects, {});
  assert.deepEqual(preview.eligibility[0].blockers, [
    "发布状态为「待裁定」",
    "来源用途为「仅限事实核验」",
  ]);
  assert.equal(preview.eligibility[0].eligible, false);
});
