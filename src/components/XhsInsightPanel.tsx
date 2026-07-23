"use client";

import { BadgeCheck, ChevronRight, CircleAlert, ClipboardCheck, MessageCircleMore, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { xhsInsights, xhsResearchMeta } from "@/src/content/xhs-insights";

type Props = { open: boolean; onClose: () => void };

export function XhsInsightPanel({ open, onClose }: Props) {
  const [sectorName, setSectorName] = useState(xhsInsights[0].sector);
  const insight = useMemo(() => xhsInsights.find((item) => item.sector === sectorName) ?? xhsInsights[0], [sectorName]);

  if (!open) return null;

  return (
    <div className="insight-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="insight-panel" role="dialog" aria-modal="true" aria-label="板块观察" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button insight-close" onClick={onClose} aria-label="关闭板块观察"><X size={18} /></button>
        <div className="insight-heading">
          <span className="eyebrow"><Sparkles size={13} /> 平台观点样本</span>
          <h2>从讨论里，先看见要问的问题</h2>
          <p>12 个上海板块的公开讨论聚合。这里呈现的是看房者常提到的线索，不是房产事实、推荐或投资建议。</p>
        </div>

        <div className="insight-stats" aria-label="样本概况">
          <div><strong>{xhsInsights.length}</strong><span>板块</span></div>
          <div><strong>{xhsResearchMeta.relevantNotes}</strong><span>相关正文</span></div>
          <div><strong>{xhsResearchMeta.sanitizedComments}</strong><span>脱敏评论</span></div>
        </div>

        <div className="insight-sector-nav" role="tablist" aria-label="选择板块">
          {xhsInsights.map((item) => <button key={item.sector} role="tab" aria-selected={item.sector === sectorName} className={item.sector === sectorName ? "is-active" : ""} onClick={() => setSectorName(item.sector)}>{item.sector}</button>)}
        </div>

        <div className="insight-current" key={insight.sector}>
          <div className="insight-title-row">
            <div><span>{insight.district}</span><h3>{insight.sector}</h3></div>
            <div className="sample-count"><MessageCircleMore size={15} /><b>{insight.sampleNotes}</b> 篇 / {insight.sampleComments} 条</div>
          </div>
          <p className="insight-positioning">{insight.positioning}</p>
          <div className="insight-columns">
            <div className="insight-column is-positive"><h4><BadgeCheck size={16} /> 讨论中的吸引点</h4><ul>{insight.positives.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div className="insight-column is-caution"><h4><CircleAlert size={16} /> 常见顾虑</h4><ul>{insight.cautions.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
          <div className="insight-checklist"><div><ClipboardCheck size={17} /><strong>把观点变成实勘清单</strong></div>{insight.checklist.map((item) => <span key={item}><ChevronRight size={14} /> {item}</span>)}</div>
        </div>

        <footer className="insight-footnote">采集快照 {xhsResearchMeta.date} · 原始 {xhsResearchMeta.rawNotes} 条正文按帖去重为 {xhsResearchMeta.uniqueNotes} 条 · 不以互动量判断真实性</footer>
        <Link className="insight-detail-link" href="/observations">进入完整板块观察 <ChevronRight size={16} /></Link>
      </section>
    </div>
  );
}
