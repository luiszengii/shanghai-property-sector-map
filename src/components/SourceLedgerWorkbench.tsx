"use client";

import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FilePenLine,
  Link2,
  LoaderCircle,
  Plus,
  Save,
  Search,
} from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import styles from "@/app/sources/sources.module.css";
import {
  evidenceConfidences,
  getCurrentEvidenceRevision,
  getCurrentSourceRevision,
  publicationStatuses,
  sourceAllowedUses,
  type PublicProjectProjection,
  type SourceLedger,
} from "@/src/lib/source-ledger";

interface ProjectOption {
  id: string;
  name: string;
  district: string;
  sector: string;
  locationAddress: string;
  locationSourceName: string;
  locationSourceUrl: string;
  locationVerifiedAt: string;
}

interface LedgerPayload {
  ledger: SourceLedger;
  projection: PublicProjectProjection;
}

interface SourceDraft {
  id: string;
  title: string;
  publisher: string;
  url: string;
  sourceType: string;
  licenseStatus: string;
  allowedUse: (typeof sourceAllowedUses)[number];
  note: string;
}

interface EvidenceDraft {
  id: string;
  field: string;
  value: string;
  sourceId: string;
  confidence: (typeof evidenceConfidences)[number];
  publicationStatus: (typeof publicationStatuses)[number];
  observedAt: string;
  reviewDueAt: string;
  note: string;
}

const emptySourceDraft: SourceDraft = {
  id: "",
  title: "",
  publisher: "",
  url: "",
  sourceType: "官方网页",
  licenseStatus: "待核验",
  allowedUse: "仅限本地研究",
  note: "",
};

function emptyEvidenceDraft(): EvidenceDraft {
  return {
    id: "",
    field: "",
    value: "",
    sourceId: "",
    confidence: "中",
    publicationStatus: "待裁定",
    observedAt: new Date().toISOString().slice(0, 10),
    reviewDueAt: "",
    note: "",
  };
}

const fieldSuggestions = [
  "开发企业",
  "项目阶段",
  "项目地址",
  "预售许可证",
  "首次开盘",
  "交付时间",
  "轨道交通",
  "公开报价",
  "不利因素",
];

export function SourceLedgerWorkbench({
  projects,
}: {
  projects: ProjectOption[];
}) {
  const [payload, setPayload] = useState<LedgerPayload | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? "");
  const [projectQuery, setProjectQuery] = useState("");
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(emptySourceDraft);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft>(emptyEvidenceDraft);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/source-ledger", { cache: "no-store" })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.message ?? "楼盘资料中心读取失败");
        return value as LedgerPayload;
      })
      .then((value) => {
        if (!cancelled) setPayload(value);
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice({
            tone: "error",
            text: error instanceof Error ? error.message : "楼盘资料中心读取失败",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const currentSources = useMemo(() => (
    payload?.ledger.sources.map((source) => ({
      record: source,
      revision: getCurrentSourceRevision(source),
    })) ?? []
  ), [payload]);
  const currentEvidence = useMemo(() => (
    payload?.ledger.evidence.map((evidence) => ({
      record: evidence,
      revision: getCurrentEvidenceRevision(evidence),
    })) ?? []
  ), [payload]);
  const evidenceByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const evidence of currentEvidence) {
      counts.set(
        evidence.revision.objectId,
        (counts.get(evidence.revision.objectId) ?? 0) + 1,
      );
    }
    return counts;
  }, [currentEvidence]);
  const selectedEvidence = currentEvidence.filter(
    (evidence) => evidence.revision.objectId === selectedProject?.id,
  );
  const filteredProjects = projects.filter((project) => {
    const query = projectQuery.trim().toLocaleLowerCase("zh-CN");
    return !query || [
      project.name,
      project.district,
      project.sector,
      project.locationAddress,
    ].some((value) => value.toLocaleLowerCase("zh-CN").includes(query));
  });
  const pendingCount = projects.filter((project) => {
    const evidence = currentEvidence.filter((item) => item.revision.objectId === project.id);
    return evidence.length === 0 || evidence.some((item) => (
      item.revision.publicationStatus === "待裁定"
      || (
        item.revision.reviewDueAt !== null
        && Date.parse(item.revision.reviewDueAt) < Date.now()
      )
    ));
  }).length;

  async function mutate(action: string, data: object) {
    setBusyAction(action);
    setNotice(null);
    try {
      const response = await fetch("/api/source-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message ?? "保存失败");
      setPayload(value as LedgerPayload);
      setNotice({ tone: "ok", text: "已保存到本地资料库" });
      return true;
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "保存失败",
      });
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await mutate("saveSource", sourceDraft);
    if (saved) setSourceDraft(emptySourceDraft);
  }

  async function saveEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    const formData = new FormData(event.currentTarget);
    const readField = (name: string) => String(formData.get(name) ?? "");
    const saved = await mutate("saveEvidence", {
      ...evidenceDraft,
      field: readField("field"),
      value: readField("value"),
      sourceId: readField("sourceId"),
      confidence: readField("confidence"),
      publicationStatus: readField("publicationStatus"),
      observedAt: readField("observedAt"),
      note: readField("note"),
      objectId: selectedProject.id,
      reviewDueAt: readField("reviewDueAt") || null,
    });
    if (saved) setEvidenceDraft(emptyEvidenceDraft());
  }

  async function createSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await mutate("createSnapshot", { label: snapshotLabel });
    if (saved) setSnapshotLabel("");
  }

  function editSource(sourceId: string) {
    const item = currentSources.find((source) => source.record.id === sourceId);
    if (!item) return;
    setSourceDraft({
      id: item.record.id,
      title: item.revision.title,
      publisher: item.revision.publisher,
      url: item.revision.url,
      sourceType: item.revision.sourceType,
      licenseStatus: item.revision.licenseStatus,
      allowedUse: item.revision.allowedUse,
      note: item.revision.note,
    });
    document.querySelector("#source-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function editEvidence(evidenceId: string) {
    const item = currentEvidence.find((evidence) => evidence.record.id === evidenceId);
    if (!item) return;
    setEvidenceDraft({
      id: item.record.id,
      field: item.revision.field,
      value: item.revision.value,
      sourceId: item.revision.sourceId,
      confidence: item.revision.confidence,
      publicationStatus: item.revision.publicationStatus,
      observedAt: item.revision.observedAt,
      reviewDueAt: item.revision.reviewDueAt ?? "",
      note: item.revision.note,
    });
    document.querySelector("#evidence-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!payload && !notice) {
    return (
      <main className={styles.loading}>
        <LoaderCircle aria-hidden="true" size={24} />
        <strong>正在打开楼盘资料中心</strong>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className={styles.loading}>
        <strong>楼盘资料中心无法打开</strong>
        <p>{notice?.text}</p>
        <Link href="/">返回地图</Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Link href="/" className={styles.backLink}><ArrowLeft size={15} /> 返回地图</Link>
          <div>
            <span className={styles.eyebrow}><ClipboardList size={14} /> 仅限本地开发</span>
            <h1>楼盘资料中心</h1>
            <p>维护楼盘字段、来源、发布裁定与复核日期；保存内容不会直接进入生产网站。</p>
          </div>
        </div>
        <div className={styles.metrics}>
          <div><strong>{projects.length}</strong><span>楼盘对象</span></div>
          <div><strong>{currentSources.length}</strong><span>当前来源</span></div>
          <div><strong>{currentEvidence.length}</strong><span>字段证据</span></div>
          <div><strong>{pendingCount}</strong><span>待处理楼盘</span></div>
        </div>
        <form className={styles.snapshotForm} onSubmit={createSnapshot}>
          <label htmlFor="snapshot-label">保存资料版本</label>
          <div>
            <input
              id="snapshot-label"
              value={snapshotLabel}
              onChange={(event) => setSnapshotLabel(event.target.value)}
              placeholder="例如：完成青浦项目首轮整理"
              required
            />
            <button type="submit" disabled={busyAction === "createSnapshot"}>
              <Archive size={14} /> 保存版本
            </button>
          </div>
          <small>已有 {payload.ledger.snapshots.length} 个资料版本（暂不支持恢复）</small>
        </form>
      </header>

      {notice && (
        <div className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : ""}`} role="status">
          {notice.tone === "ok" ? <CheckCircle2 size={15} /> : null}
          {notice.text}
        </div>
      )}

      <div className={styles.workspace}>
        <aside className={styles.projectRail}>
          <div className={styles.railHeading}>
            <span>楼盘对象</span>
            <small>{filteredProjects.length} / {projects.length}</small>
          </div>
          <label className={styles.projectSearch}>
            <Search aria-hidden="true" size={15} />
            <input
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              placeholder="搜索楼盘、区或板块"
              aria-label="搜索楼盘、区或板块"
            />
          </label>
          <nav className={styles.projectList} aria-label="楼盘列表">
            {filteredProjects.map((project) => {
              const count = evidenceByProject.get(project.id) ?? 0;
              return (
                <button
                  type="button"
                  key={project.id}
                  className={project.id === selectedProject?.id ? styles.projectActive : ""}
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setEvidenceDraft(emptyEvidenceDraft());
                  }}
                >
                  <span><strong>{project.name}</strong><small>{project.district} · {project.sector}</small></span>
                  <b className={count === 0 ? styles.countEmpty : ""}>{count}</b>
                </button>
              );
            })}
          </nav>
        </aside>

        {selectedProject && (
          <section className={styles.projectWorkspace}>
            <header className={styles.projectHeader}>
              <div>
                <span>{selectedProject.district} · {selectedProject.sector}</span>
                <h2>{selectedProject.name}</h2>
                <p>{selectedProject.locationAddress}</p>
              </div>
              <Link href={`/projects/${encodeURIComponent(selectedProject.id)}`}>
                查看详情页 <ExternalLink size={13} />
              </Link>
            </header>

            <section className={styles.baseline}>
              <div>
                <span>现有公开基线</span>
                <strong>项目固定点位与地址</strong>
              </div>
              <dl>
                <div><dt>位置来源</dt><dd><a href={selectedProject.locationSourceUrl} target="_blank" rel="noreferrer">{selectedProject.locationSourceName} <ExternalLink size={11} /></a></dd></div>
                <div><dt>核对日期</dt><dd>{selectedProject.locationVerifiedAt}</dd></div>
                <div><dt>资料记录</dt><dd>{selectedEvidence.length} 条</dd></div>
                <div><dt>公开投射</dt><dd>{payload.projection.projects[selectedProject.id]?.fields.length ?? 0} 个字段</dd></div>
              </dl>
            </section>

            <div className={styles.editorGrid}>
              <section className={styles.panel}>
                <div className={styles.panelTitle}>
                  <div><span>当前字段证据</span><h3>{selectedEvidence.length} 条记录</h3></div>
                  <small>点击记录可追加修订</small>
                </div>
                <div className={styles.evidenceList}>
                  {selectedEvidence.length === 0 ? (
                    <div className={styles.emptyState}>
                      <FilePenLine size={22} />
                      <strong>这个楼盘还没有资料记录</strong>
                      <p>先登记一个来源，再为开发商、项目阶段、交通或其他字段创建证据。</p>
                    </div>
                  ) : selectedEvidence.map(({ record, revision }) => (
                    <button type="button" key={record.id} onClick={() => editEvidence(record.id)}>
                      <span className={styles.evidenceTopline}>
                        <strong>{revision.field}</strong>
                        <i className={revision.publicationStatus === "可公开投射" ? styles.publicStatus : ""}>{revision.publicationStatus}</i>
                      </span>
                      <p>{revision.value}</p>
                      <small>{revision.confidence}置信 · 观察于 {revision.observedAt} · 修订 {revision.revisionNumber}</small>
                    </button>
                  ))}
                </div>
              </section>

              <form id="evidence-editor" className={styles.panel} onSubmit={saveEvidence}>
                <div className={styles.panelTitle}>
                  <div><span>字段证据编辑器</span><h3>{evidenceDraft.id ? "追加证据修订" : "新增字段证据"}</h3></div>
                  {evidenceDraft.id && <button type="button" className={styles.textButton} onClick={() => setEvidenceDraft(emptyEvidenceDraft())}>取消编辑</button>}
                </div>
                <div className={styles.formGrid}>
                  <label>字段名称<input name="field" list="ledger-fields" value={evidenceDraft.field} onChange={(event) => setEvidenceDraft((draft) => ({ ...draft, field: event.target.value }))} required /></label>
                  <datalist id="ledger-fields">{fieldSuggestions.map((field) => <option value={field} key={field} />)}</datalist>
                  <label>来源<select name="sourceId" value={evidenceDraft.sourceId} onChange={(event) => setEvidenceDraft((draft) => ({ ...draft, sourceId: event.target.value }))} required>
                    <option value="">选择已登记来源</option>
                    {currentSources.map(({ record, revision }) => <option value={record.id} key={record.id}>{revision.title} · {revision.publisher}</option>)}
                  </select></label>
                  <label className={styles.fullField}>字段值<textarea name="value" value={evidenceDraft.value} onChange={(event) => setEvidenceDraft((draft) => ({ ...draft, value: event.target.value }))} rows={3} required /></label>
                  <label>证据置信度<select name="confidence" value={evidenceDraft.confidence} onChange={(event) => setEvidenceDraft((draft) => ({ ...draft, confidence: event.target.value as EvidenceDraft["confidence"] }))}>{evidenceConfidences.map((value) => <option key={value}>{value}</option>)}</select></label>
                  <label>发布状态<select name="publicationStatus" value={evidenceDraft.publicationStatus} onChange={(event) => setEvidenceDraft((draft) => ({ ...draft, publicationStatus: event.target.value as EvidenceDraft["publicationStatus"] }))}>{publicationStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
                  <label>观察日期<input name="observedAt" type="date" value={evidenceDraft.observedAt} onChange={(event) => setEvidenceDraft((draft) => ({ ...draft, observedAt: event.target.value }))} required /></label>
                  <label>下次复核日期<input name="reviewDueAt" type="date" value={evidenceDraft.reviewDueAt} onChange={(event) => setEvidenceDraft((draft) => ({ ...draft, reviewDueAt: event.target.value }))} /></label>
                  <label className={styles.fullField}>本地备注<textarea name="note" value={evidenceDraft.note} onChange={(event) => setEvidenceDraft((draft) => ({ ...draft, note: event.target.value }))} rows={2} placeholder="冲突、判断依据或下一步核验任务；不会进入公开投射" /></label>
                </div>
                <button className={styles.primaryButton} type="submit" disabled={currentSources.length === 0 || busyAction === "saveEvidence"}>
                  <Save size={15} /> {currentSources.length === 0 ? "请先登记来源" : "保存字段证据"}
                </button>
              </form>
            </div>

            <section id="source-editor" className={styles.sourceSection}>
              <div className={styles.sourceDirectory}>
                <div className={styles.panelTitle}>
                  <div><span>可复用来源</span><h3>{currentSources.length} 条来源</h3></div>
                  <small>来源可被多个楼盘字段复用</small>
                </div>
                <div className={styles.sourceList}>
                  {currentSources.length === 0 ? (
                    <div className={styles.emptyState}><Link2 size={22} /><strong>还没有来源</strong><p>从右侧登记第一个官方页面、开发商文件或开放资料。</p></div>
                  ) : currentSources.map(({ record, revision }) => (
                    <button type="button" key={record.id} onClick={() => editSource(record.id)}>
                      <span><strong>{revision.title}</strong><small>{revision.publisher} · {revision.sourceType}</small></span>
                      <i>{revision.allowedUse}</i>
                    </button>
                  ))}
                </div>
              </div>

              <form className={styles.sourceForm} onSubmit={saveSource}>
                <div className={styles.panelTitle}>
                  <div><span>来源编辑器</span><h3>{sourceDraft.id ? "追加来源修订" : "登记新来源"}</h3></div>
                  {sourceDraft.id && <button type="button" className={styles.textButton} onClick={() => setSourceDraft(emptySourceDraft)}>取消编辑</button>}
                </div>
                <div className={styles.formGrid}>
                  <label>来源标题<input value={sourceDraft.title} onChange={(event) => setSourceDraft((draft) => ({ ...draft, title: event.target.value }))} required /></label>
                  <label>发布者<input value={sourceDraft.publisher} onChange={(event) => setSourceDraft((draft) => ({ ...draft, publisher: event.target.value }))} required /></label>
                  <label className={styles.fullField}>原始链接<input type="url" value={sourceDraft.url} onChange={(event) => setSourceDraft((draft) => ({ ...draft, url: event.target.value }))} placeholder="https://…" /></label>
                  <label>来源类型<input value={sourceDraft.sourceType} onChange={(event) => setSourceDraft((draft) => ({ ...draft, sourceType: event.target.value }))} required /></label>
                  <label>许可状态<input value={sourceDraft.licenseStatus} onChange={(event) => setSourceDraft((draft) => ({ ...draft, licenseStatus: event.target.value }))} required /></label>
                  <label className={styles.fullField}>允许用途<select value={sourceDraft.allowedUse} onChange={(event) => setSourceDraft((draft) => ({ ...draft, allowedUse: event.target.value as SourceDraft["allowedUse"] }))}>{sourceAllowedUses.map((value) => <option key={value}>{value}</option>)}</select></label>
                  <label className={styles.fullField}>本地来源备注<textarea value={sourceDraft.note} onChange={(event) => setSourceDraft((draft) => ({ ...draft, note: event.target.value }))} rows={2} placeholder="许可判断、抓取限制或人工核验说明；不会公开" /></label>
                </div>
                <button className={styles.primaryButton} type="submit" disabled={busyAction === "saveSource"}>
                  {sourceDraft.id ? <Save size={15} /> : <Plus size={15} />} 保存来源
                </button>
              </form>
            </section>
          </section>
        )}
      </div>
    </main>
  );
}
