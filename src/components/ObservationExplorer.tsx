"use client";

import { ArrowLeft, ChevronDown, ExternalLink, FileText, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

type ResearchNote = {
  sectors: string;
  source_keywords: string;
  batch_ids: string;
  note_id: string;
  title: string;
  excerpt: string;
  published_at: string;
  likes: string | number;
  collects: string | number;
  comments: string | number;
  shares: string | number;
  source_url: string;
};

type ResearchComment = {
  sectors: string;
  note_id: string;
  content: string;
  likes: string | number;
  source_url: string;
};

type ResearchDataset = {
  meta: {
    crawl_date: string;
    raw_note_records: number;
    unique_note_records: number;
    relevant_unique_notes: number;
    raw_comment_records: number;
    unique_sanitized_comments: number;
  };
  notes: ResearchNote[];
  comments: ResearchComment[];
};

const DISTRICT_SECTORS = {
  "浦东新区": ["前滩", "张江", "金桥", "三林", "北蔡", "陆家嘴", "唐镇"],
  "闵行区": ["古美", "莘庄", "七宝", "虹桥商务区"],
  "徐汇区": ["徐汇滨江"],
  "静安区": ["大宁"],
  "虹口区": ["北外滩"],
  "青浦区": ["徐泾", "虹桥商务区"],
  "杨浦区": ["新江湾城"],
  "普陀区": ["真如"],
  "嘉定区": ["南翔"],
  "宝山区": ["顾村"],
  "松江区": ["松江新城"],
} as const;
const PAGE_SIZE = 20;

function formatDate(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "日期未知";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(numeric));
}

function compactNumber(value: string | number) {
  const number = Number(value) || 0;
  return number >= 10000 ? `${(number / 10000).toFixed(1)}万` : String(number);
}

function Highlight({ children, query }: { children: string; query: string }) {
  const needle = query.trim();
  if (!needle) return children;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = children.split(new RegExp(`(${escaped})`, "gi"));
  return <>{parts.map((part, index) => part.toLocaleLowerCase("zh-CN") === needle.toLocaleLowerCase("zh-CN") ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>)}</>;
}

export function ObservationExplorer() {
  const [dataset, setDataset] = useState<ResearchDataset | null>(null);
  const [error, setError] = useState("");
  const [district, setDistrict] = useState("全部行政区");
  const [sector, setSector] = useState("全部");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;
    fetch("/api/xhs-observations")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "研究数据读取失败");
        return payload as ResearchDataset;
      })
      .then((payload) => active && setDataset(payload))
      .catch((reason: Error) => active && setError(reason.message));
    return () => { active = false; };
  }, []);

  const commentsByNote = useMemo(() => {
    const grouped = new Map<string, ResearchComment[]>();
    for (const comment of dataset?.comments ?? []) grouped.set(comment.note_id, [...(grouped.get(comment.note_id) ?? []), comment]);
    return grouped;
  }, [dataset]);

  const searchIndexByNoteId = useMemo(() => new Map(
    (dataset?.notes ?? []).map((note) => {
      const commentText = (commentsByNote.get(note.note_id) ?? [])
        .map((comment) => comment.content)
        .join(" ");
      return [
        note.note_id,
        `${note.title} ${note.excerpt} ${note.sectors} ${commentText}`
          .toLocaleLowerCase("zh-CN"),
      ];
    }),
  ), [commentsByNote, dataset]);

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return (dataset?.notes ?? []).filter((note) => {
      const sectorMatch = sector === "全部" || note.sectors.split("；").includes(sector);
      const queryMatch = !needle
        || searchIndexByNoteId.get(note.note_id)?.includes(needle);
      return sectorMatch && queryMatch;
    });
  }, [dataset, query, searchIndexByNoteId, sector]);

  const availableSectorSet = useMemo(() => new Set((dataset?.notes ?? []).flatMap((note) => note.sectors.split("；"))), [dataset]);
  const visibleSectors = district === "全部行政区"
    ? Array.from(availableSectorSet)
    : (DISTRICT_SECTORS[district as keyof typeof DISTRICT_SECTORS] ?? []).filter((item) => availableSectorSet.has(item));

  function chooseDistrict(value: string) {
    setDistrict(value);
    setSector("全部");
    setVisibleCount(PAGE_SIZE);
  }

  function chooseSector(value: string) {
    setSector(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <main className="observations-page">
      <header className="observations-header">
        <div className="observations-nav">
          <Link href="/" className="back-to-map"><ArrowLeft size={17} /> 返回地图</Link>
          <span>上海楼市互动地图</span>
        </div>
        <div className="observations-hero">
          <span className="observations-kicker"><FileText size={14} /> LOCAL RESEARCH ARCHIVE · 2026</span>
          <h1>板块观察</h1>
          <p>把公开讨论整理成可搜索、可追溯的看房问题库。这里保留正文摘要、脱敏评论和原帖入口，但不把互动量当作可信度。</p>
        </div>
        {dataset && <div className="observations-metrics">
          <div><strong>{dataset.meta.relevant_unique_notes}</strong><span>相关正文</span></div>
          <div><strong>{dataset.meta.unique_sanitized_comments}</strong><span>脱敏评论</span></div>
          <div><strong>12</strong><span>研究板块</span></div>
          <div><strong>{dataset.meta.crawl_date}</strong><span>采集快照</span></div>
        </div>}
      </header>

      <section className="observations-body">
        <div className="observations-safety"><ShieldCheck size={18} /><p><strong>阅读边界</strong>：以下均为平台观点样本，不构成事实认定、购房推荐或投资建议。价格、学区、规划、交通、医疗和项目交付需另行核验。</p></div>
        <div className="observations-toolbar">
          <label className="observations-search"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} placeholder="搜索小区、通勤、噪声、学区……" /></label>
          <span aria-live="polite"><SlidersHorizontal size={15} /> {filteredNotes.length} 条结果</span>
        </div>
        <div className="observations-filter-stack">
          <div className="observations-filter-level"><span>行政区</span><nav className="observations-districts" aria-label="行政区筛选">
            {["全部行政区", ...Object.keys(DISTRICT_SECTORS)].map((item) => <button key={item} className={item === district ? "is-active" : ""} onClick={() => chooseDistrict(item)}>{item}</button>)}
          </nav></div>
          <div className="observations-filter-level"><span>板块</span><nav className="observations-sectors" aria-label="板块筛选">
            {["全部", ...visibleSectors].map((item) => <button key={item} className={item === sector ? "is-active" : ""} onClick={() => chooseSector(item)}>{item}</button>)}
          </nav></div>
        </div>

        {!dataset && !error && <div className="observations-status">正在读取本地研究数据…</div>}
        {error && <div className="observations-status is-error"><strong>暂时无法显示详细数据</strong><span>{error}</span></div>}
        {dataset && filteredNotes.length === 0 && <div className="observations-status"><strong>没有匹配的内容</strong><span>换一个关键词或板块试试。</span></div>}

        <div className="observation-list">
          {filteredNotes.slice(0, visibleCount).map((note, index) => {
            const relatedComments = commentsByNote.get(note.note_id) ?? [];
            return <article className="observation-entry" key={note.note_id}>
              <div className="observation-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="observation-main">
                <div className="observation-meta">
                  <div>{note.sectors.split("；").map((item) => <span key={item}>{item}</span>)}</div>
                  <time>{formatDate(note.published_at)}</time>
                </div>
                <h2><Highlight query={query}>{note.title || "未命名帖子"}</Highlight></h2>
                <p><Highlight query={query}>{note.excerpt || "这篇样本没有可用的正文摘要，可通过原帖链接查看。"}</Highlight></p>
                <div className="observation-signals" aria-label="采集时互动量">
                  <span>赞 {compactNumber(note.likes)}</span><span>收藏 {compactNumber(note.collects)}</span><span>评论 {compactNumber(note.comments)}</span><span>分享 {compactNumber(note.shares)}</span>
                </div>
                <div className="observation-actions">
                  <a href={note.source_url} target="_blank" rel="noreferrer">查看小红书原帖 <ExternalLink size={14} /></a>
                  {relatedComments.length > 0 && <details className="observation-comments">
                    <summary><FileText size={14} /> 查看 {relatedComments.length} 条脱敏评论 <ChevronDown size={14} /></summary>
                    <div>{relatedComments.map((comment, commentIndex) => <blockquote key={`${note.note_id}-${commentIndex}`}><p><Highlight query={query}>{comment.content}</Highlight></p><small>采集时获赞 {compactNumber(comment.likes)}</small></blockquote>)}</div>
                  </details>}
                </div>
              </div>
            </article>;
          })}
        </div>
        {visibleCount < filteredNotes.length && <button className="observations-load-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>继续加载 · 还剩 {filteredNotes.length - visibleCount} 条</button>}
        {dataset && <footer className="observations-footer">已展示 {Math.min(visibleCount, filteredNotes.length)} / {filteredNotes.length} 条 · 原始数据仅保留在本地工作区 · 原帖链接可能受平台登录状态影响</footer>}
      </section>
    </main>
  );
}
