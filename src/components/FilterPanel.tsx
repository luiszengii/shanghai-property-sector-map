"use client";

import { Building2, Check, Layers3, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useId } from "react";
import categoriesData from "@/src/data/categories.json";
import { projects } from "@/src/content/project-leads";
import { useMapStore } from "@/src/store/map-store";
import type { Category } from "@/src/types/map";

const categories = categoriesData as Category[];

export function FilterPanel({ mobile = false }: { mobile?: boolean }) {
  const clusterRadiusId = useId();
  const detailZoomId = useId();
  const {
    enabledCategories,
    showProjects,
    projectClusterEnabled,
    projectClusterRadius,
    projectDetailMinZoom,
    toggleCategory,
    toggleProjects,
    setProjectClusterEnabled,
    setProjectClusterRadius,
    setProjectDetailMinZoom,
    showAllCategories,
    clearCategories,
    setMobileFiltersOpen,
  } = useMapStore();
  const groups = [
    { id: "benefit", label: "有利配套", helper: "生活与通勤资源" },
    { id: "attention", label: "需要关注", helper: "建议结合公开资料核验" },
  ] as const;

  return (
    <section className={`filter-panel glass-panel ${mobile ? "is-mobile" : ""}`} aria-label="设施图层筛选">
      <div className="panel-heading">
        <div>
          <span className="eyebrow"><Layers3 size={13} /> 图层筛选</span>
          <h2>设施分类</h2>
        </div>
        {mobile && <button className="icon-button" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选"><X size={20} /></button>}
      </div>
      <div className="filter-actions">
        <button onClick={showAllCategories}><Check size={14} /> 显示全部</button>
        <button onClick={clearCategories}><RotateCcw size={14} /> 清空</button>
      </div>
      <div className="filter-group project-filter-group">
        <div className="group-title"><strong>新房项目</strong><span>{projects.length} 个项目</span></div>
        <button className={"filter-item project-filter " + (showProjects ? "is-active" : "")} onClick={toggleProjects} aria-pressed={showProjects}>
          <span className="category-icon project-category-icon"><Building2 size={14} /></span>
          <span>500–800 万新盘</span>
          <span className="toggle"><span /></span>
        </button>
        <details className="project-display-settings">
          <summary>
            <SlidersHorizontal size={13} />
            <span>显示设置</span>
            <small>聚合 {projectClusterRadius}px · 详情 Z {projectDetailMinZoom.toFixed(1)}</small>
          </summary>
          <div className="project-settings-body">
            <button
              type="button"
              className={`project-setting-toggle ${projectClusterEnabled ? "is-active" : ""}`}
              onClick={() => setProjectClusterEnabled(!projectClusterEnabled)}
              aria-pressed={projectClusterEnabled}
            >
              <span>聚合相邻 Pin</span>
              <span className="toggle"><span /></span>
            </button>
            <label htmlFor={clusterRadiusId}>
              <span>聚合范围 <output>{projectClusterRadius}px</output></span>
              <input
                id={clusterRadiusId}
                type="range"
                min="32"
                max="128"
                step="8"
                value={projectClusterRadius}
                disabled={!projectClusterEnabled}
                onChange={(event) => setProjectClusterRadius(Number(event.target.value))}
              />
            </label>
            <label htmlFor={detailZoomId}>
              <span>详情显示级别 <output>Z {projectDetailMinZoom.toFixed(1)}</output></span>
              <input
                id={detailZoomId}
                type="range"
                min="11"
                max="16"
                step="0.2"
                value={projectDetailMinZoom}
                onChange={(event) => setProjectDetailMinZoom(Number(event.target.value))}
              />
            </label>
            <p>点击聚合标签会继续放大；单个项目达到设定级别后才显示详情。</p>
          </div>
        </details>
      </div>
      {groups.map((group) => (
        <div className="filter-group" key={group.id}>
          <div className="group-title"><strong>{group.label}</strong><span>{group.helper}</span></div>
          <div className="filter-list">
            {categories.filter((item) => item.group === group.id).map((category) => {
              const checked = enabledCategories.includes(category.id);
              return (
                <button key={category.id} className={`filter-item ${checked ? "is-active" : ""}`} onClick={() => toggleCategory(category.id)} aria-pressed={checked}>
                  <span className="category-icon" style={{ "--category-color": category.color } as React.CSSProperties}>{category.icon}</span>
                  <span>{category.name}</span>
                  <span className="toggle"><span /></span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="panel-footnote">46 个新盘点位已逐项核对并固定；优劣势、教育及价格仍为用户提供的待核验观点，不构成购房建议。</p>
    </section>
  );
}
