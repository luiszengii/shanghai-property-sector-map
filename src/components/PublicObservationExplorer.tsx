"use client";

import { ArrowLeft, ExternalLink, FileText, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import snapshot from "@/src/data/public-observations.json";

const ALL_DISTRICTS = "全部行政区";

export function PublicObservationExplorer() {
  const [district, setDistrict] = useState(ALL_DISTRICTS);
  const [query, setQuery] = useState("");
  const districts = useMemo(
    () => Array.from(new Set(snapshot.entries.flatMap((entry) => entry.district.split(" / ")))),
    [],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return snapshot.entries.filter((entry) => {
      const districtMatch = district === ALL_DISTRICTS
        || entry.district.split(" / ").includes(district);
      const haystack = [
        entry.sector,
        entry.district,
        entry.positioning,
        ...entry.positives,
        ...entry.cautions,
        ...entry.checklist,
      ].join(" ").toLocaleLowerCase("zh-CN");
      return districtMatch && (!needle || haystack.includes(needle));
    });
  }, [district, query]);

  return (
    <main className="observations-page public-observations-page">
      <header className="observations-header">
        <div className="observations-nav">
          <Link href="/" className="back-to-map"><ArrowLeft size={17} /> 返回地图</Link>
          <span>上海楼市互动地图</span>
        </div>
        <div className="observations-hero">
          <span className="observations-kicker"><FileText size={14} /> PUBLIC RESEARCH SNAPSHOT · {snapshot.snapshotDate}</span>
          <h1>板块观察</h1>
          <p>把公开讨论聚合为看房问题清单。这里只发布脱敏后的归纳和少量原帖入口，不公开本地帖子索引、评论语料或身份信息。</p>
        </div>
        <div className="observations-metrics">
          <div><strong>{snapshot.entryCount}</strong><span>研究板块</span></div>
          <div><strong>{snapshot.entries.reduce((sum, item) => sum + item.sampleNotes, 0)}</strong><span>相关正文样本</span></div>
          <div><strong>{snapshot.entries.reduce((sum, item) => sum + item.sampleComments, 0)}</strong><span>脱敏评论样本</span></div>
          <div><strong>{snapshot.snapshotDate}</strong><span>采集快照</span></div>
        </div>
      </header>

      <section className="observations-body">
        <div className="observations-safety"><ShieldCheck size={18} /><p><strong>阅读边界</strong>：以下均为平台观点的聚合样本，不构成事实认定、购房推荐或投资建议。价格、学区、规划、交通、医疗和项目交付必须另行核验。</p></div>
        <div className="observations-toolbar">
          <label className="observations-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索通勤、噪声、物业、配套……" /></label>
          <span aria-live="polite">{filtered.length} 个板块</span>
        </div>
        <div className="observations-filter-stack">
          <div className="observations-filter-level"><span>行政区</span><nav className="observations-districts" aria-label="行政区筛选">
            {[ALL_DISTRICTS, ...districts].map((item) => <button key={item} className={item === district ? "is-active" : ""} onClick={() => setDistrict(item)}>{item}</button>)}
          </nav></div>
        </div>

        {filtered.length === 0 && <div className="observations-status"><strong>没有匹配的板块</strong><span>换一个关键词或行政区试试。</span></div>}
        <div className="public-observation-grid">
          {filtered.map((entry) => (
            <article className="public-observation-card" key={entry.sector}>
              <div className="observation-meta"><div><span>{entry.district}</span></div><strong>{entry.sector}</strong></div>
              <p className="public-observation-positioning">{entry.positioning}</p>
              <div className="public-observation-columns">
                <section><h2>样本中的关注点</h2><ul>{entry.positives.map((item) => <li key={item}>{item}</li>)}</ul></section>
                <section><h2>常见顾虑</h2><ul>{entry.cautions.map((item) => <li key={item}>{item}</li>)}</ul></section>
                <section><h2>看房前核验</h2><ul>{entry.checklist.map((item) => <li key={item}>{item}</li>)}</ul></section>
              </div>
              <footer>
                <span>{entry.sampleNotes} 条正文 · {entry.sampleComments} 条脱敏评论形成的聚合样本</span>
                <nav aria-label={`${entry.sector}代表来源`}>
                  {entry.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} <ExternalLink size={12} /></a>)}
                </nav>
              </footer>
            </article>
          ))}
        </div>
        <footer className="observations-footer">公开页面仅包含聚合结论与代表链接；详细帖子索引和评论语料只保存在本地研究环境。</footer>
      </section>
    </main>
  );
}
