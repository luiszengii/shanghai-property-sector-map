"use client";

import { Building2, CalendarClock, ClipboardList, Database, GraduationCap, MapPinned, PencilRuler, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useMapStore, type SectorBoundarySource } from "@/src/store/map-store";
import type { PropertyProject } from "@/src/types/map";

type ProjectResearch = NonNullable<PropertyProject["research"]>;

export const projectFilterLabel = "本地新盘研究清单";
export const projectLegendLabel = "本地新盘研究清单";
export const projectFootnote = "项目点位已逐项核对并固定；仅本地显示的优劣势、教育及价格仍为待核验观点。";
export const projectDetailDisclaimer = "项目点位已逐项核对；本地显示的价格、交通、学校、规划及周边风险仍未独立核验。";

export function LocalEditorShortcut({ className }: { className: string }) {
  return (
    <Link href="/sector-editor" prefetch={false} className={className}>
      <PencilRuler size={17} />
      自己画板块
    </Link>
  );
}

export function LocalSourceLedgerShortcut() {
  return (
    <Link href="/sources" prefetch={false} className="data-button source-ledger-button">
      <ClipboardList size={16} />
      <span>楼盘资料中心</span>
    </Link>
  );
}

const sourceLabels: Record<SectorBoundarySource, string> = {
  project: "项目研究口径",
  "hfwgsj-private": "微观世界快照",
  "anjuke-private": "安居客快照",
  "fang-private": "房天下快照",
  "realtynavi-private": "RealtyNavi 快照",
};

export function LocalSectorSourceControls() {
  const sectorBoundarySource = useMapStore((state) => state.sectorBoundarySource);
  const setSectorBoundarySource = useMapStore((state) => state.setSectorBoundarySource);
  const showRealtynaviDistrictOutlineDifferences = useMapStore(
    (state) => state.showRealtynaviDistrictOutlineDifferences,
  );
  const setShowRealtynaviDistrictOutlineDifferences = useMapStore(
    (state) => state.setShowRealtynaviDistrictOutlineDifferences,
  );
  return (
    <div className="filter-group sector-source-filter-group">
      <div className="group-title">
        <strong>板块边界</strong>
        <span>{sourceLabels[sectorBoundarySource]}</span>
      </div>
      <div className="sector-source-options" role="radiogroup" aria-label="板块边界数据源">
        <button type="button" className={sectorBoundarySource === "project" ? "is-active" : ""} role="radio" aria-checked={sectorBoundarySource === "project"} onClick={() => setSectorBoundarySource("project")}>
          <MapPinned size={14} />
          <span><strong>项目研究边界</strong><small>当前候选面与行政参考层</small></span>
        </button>
        <button type="button" className={sectorBoundarySource === "hfwgsj-private" ? "is-active" : ""} role="radio" aria-checked={sectorBoundarySource === "hfwgsj-private"} onClick={() => setSectorBoundarySource("hfwgsj-private")}>
          <Database size={14} />
          <span><strong>微观世界私有快照</strong><small>2026-07-25 · 121 个边界</small></span>
        </button>
        <button type="button" className={sectorBoundarySource === "anjuke-private" ? "is-active" : ""} role="radio" aria-checked={sectorBoundarySource === "anjuke-private"} onClick={() => setSectorBoundarySource("anjuke-private")}>
          <Database size={14} />
          <span><strong>安居客研究快照</strong><small>2026-07-25 · 120 / 141 个边界</small></span>
        </button>
        <button type="button" className={sectorBoundarySource === "fang-private" ? "is-active" : ""} role="radio" aria-checked={sectorBoundarySource === "fang-private"} onClick={() => setSectorBoundarySource("fang-private")}>
          <Database size={14} />
          <span><strong>房天下研究快照</strong><small>2026-07-25 · 182 / 183 个边界</small></span>
        </button>
        <button type="button" className={sectorBoundarySource === "realtynavi-private" ? "is-active" : ""} role="radio" aria-checked={sectorBoundarySource === "realtynavi-private"} onClick={() => setSectorBoundarySource("realtynavi-private")}>
          <Database size={14} />
          <span><strong>RealtyNavi 授权研究快照</strong><small>2026-07-28 · 151 个命名板块</small></span>
        </button>
      </div>
      {sectorBoundarySource === "realtynavi-private" ? (
        <button
          type="button"
          className={`realtynavi-difference-toggle${showRealtynaviDistrictOutlineDifferences ? " is-active" : ""}`}
          role="switch"
          aria-checked={showRealtynaviDistrictOutlineDifferences}
          onClick={() => setShowRealtynaviDistrictOutlineDifferences(
            !showRealtynaviDistrictOutlineDifferences,
          )}
        >
          <span>
            <strong>区级外轮廓差异</strong>
            <small>16 个参考面 · 默认关闭 · 不计入板块数</small>
          </span>
          <span className="toggle" aria-hidden="true"><span /></span>
        </button>
      ) : null}
      <p className="sector-source-note">
        四套外部快照只从本机忽略文件读取；RealtyNavi 按用户确认授权仅作内部对照，其他快照许可状态不变，均不进入公开构建。
      </p>
    </div>
  );
}

export function LocalDataDisclosures({ source }: { source: SectorBoundarySource }) {
  return (
    <>
      {source === "hfwgsj-private" && (
        <li>当前板块边界已切换为本地私有快照；来源许可与坐标系尚未独立确认，不进入公开构建。</li>
      )}
      {source === "realtynavi-private" && (
        <li>当前板块边界已切换为 RealtyNavi 授权研究快照；仅限内部对照，不进入公开构建或对外分发。</li>
      )}
      <li>本地新盘研究清单中的均价、优劣势、教育与推荐指数尚未独立核验，仅作为看盘线索。</li>
    </>
  );
}

export function getLocalExternalLegend(source: SectorBoundarySource) {
  return source === "hfwgsj-private"
    ? { color: "#7c3aed", label: "紫色实线：微观世界快照边界", note: "私有研究快照 · 坐标系尚未独立确认" }
    : source === "anjuke-private"
      ? { color: "#ea580c", label: "橙色实线：安居客板块边界", note: "BD-09 已转 GCJ-02 · 120 / 141 个边界" }
      : source === "fang-private"
        ? { color: "#1d4ed8", label: "蓝色实线：房天下板块边界", note: "BD-09 已转 GCJ-02 · 182 / 183 个边界" }
        : source === "realtynavi-private"
          ? { color: "#be123c", label: "玫红实线：RealtyNavi 命名板块", note: "授权内部对照 · GCJ-02 · 151 个命名板块 · 区级外轮廓差异默认关闭" }
        : null;
}

export function LocalProjectResearchSummary({ research }: { research?: ProjectResearch }) {
  if (!research) return null;
  return (
    <>
      <div className="project-summary">
        <strong>{research.averagePrice} 万元/㎡</strong>
        <span>{research.unitType}</span>
        <span className="project-rating"><Star size={13} fill="currentColor" />{research.rating === null ? "暂无推荐指数" : research.rating + "/5"}</span>
      </div>
      <span className="unverified-badge">仅本地 · 用户观点 · 待核验</span>
      <div className="project-opinion-grid">
        <section><h3><ThumbsUp size={14} /> 项目优势</h3><ul>{research.advantages.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="is-caution"><h3><ThumbsDown size={14} /> 项目劣势</h3><ul>{research.disadvantages.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </div>
    </>
  );
}

export function LocalProjectResearchMetadata({ research }: { research?: ProjectResearch }) {
  if (!research) return null;
  return (
    <>
      <div><dt><GraduationCap size={15} /> 周边教育</dt><dd>{research.education.join("、")}</dd></div>
      <div><dt><Building2 size={15} /> 观点来源</dt><dd>{research.sourceName}</dd></div>
      <div><dt><CalendarClock size={15} /> 收录日期</dt><dd>{research.sourceDate}</dd></div>
    </>
  );
}
