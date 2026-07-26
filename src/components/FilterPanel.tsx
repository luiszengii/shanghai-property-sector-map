"use client";

import { Building2, Check, Layers3, MapPinned, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { memo, useId } from "react";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import {
  LocalSectorSourceControls,
  projectFilterLabel,
  projectFootnote,
} from "@/src/components/local-research-features";
import categoriesData from "@/src/data/categories.json";
import { useProjectCatalog } from "@/src/lib/use-project-catalog";
import { useMapStore } from "@/src/store/map-store";
import type { Category } from "@/src/types/map";

const categories = categoriesData as Category[];
const groups = [
  { id: "benefit", label: "有利配套", helper: "生活与通勤资源" },
  { id: "attention", label: "需要关注", helper: "建议结合公开资料核验" },
] as const;
const categoriesByGroup = new Map(
  groups.map((group) => [
    group.id,
    categories.filter((category) => category.group === group.id),
  ]),
);
export const FilterPanel = memo(function FilterPanel({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  const projects = useProjectCatalog();
  const clusterRadiusId = useId();
  const detailZoomId = useId();
  const sectorLabelZoomId = useId();
  const enabledCategories = useMapStore((state) => state.enabledCategories);
  const showProjects = useMapStore((state) => state.showProjects);
  const projectClusterEnabled = useMapStore((state) => state.projectClusterEnabled);
  const projectClusterRadius = useMapStore((state) => state.projectClusterRadius);
  const projectDetailMinZoom = useMapStore((state) => state.projectDetailMinZoom);
  const sectorLabelMode = useMapStore((state) => state.sectorLabelMode);
  const sectorLabelMinZoom = useMapStore((state) => state.sectorLabelMinZoom);
  const toggleCategory = useMapStore((state) => state.toggleCategory);
  const toggleProjects = useMapStore((state) => state.toggleProjects);
  const setProjectClusterEnabled = useMapStore((state) => state.setProjectClusterEnabled);
  const setProjectClusterRadius = useMapStore((state) => state.setProjectClusterRadius);
  const setProjectDetailMinZoom = useMapStore((state) => state.setProjectDetailMinZoom);
  const setSectorLabelMode = useMapStore((state) => state.setSectorLabelMode);
  const setSectorLabelMinZoom = useMapStore((state) => state.setSectorLabelMinZoom);
  const showAllCategories = useMapStore((state) => state.showAllCategories);
  const clearCategories = useMapStore((state) => state.clearCategories);
  const setMobileFiltersOpen = useMapStore((state) => state.setMobileFiltersOpen);
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
      <LocalSectorSourceControls />
      <div className="filter-group sector-label-filter-group">
        <div className="group-title"><strong>板块名称</strong><span>减少地图文字负担</span></div>
        <details className="project-display-settings sector-display-settings">
          <summary>
            <MapPinned size={13} />
            <span>显示设置</span>
            <small>{sectorLabelMode === "hover" ? "悬停时显示" : `Z ${sectorLabelMinZoom.toFixed(1)} 起显示`}</small>
          </summary>
          <div className="project-settings-body">
            <div className="sector-label-mode" role="group" aria-label="板块名称显示方式">
              <button
                type="button"
                className={sectorLabelMode === "hover" ? "is-active" : ""}
                onClick={() => setSectorLabelMode("hover")}
                aria-pressed={sectorLabelMode === "hover"}
              >
                悬停显示
              </button>
              <button
                type="button"
                className={sectorLabelMode === "zoom" ? "is-active" : ""}
                onClick={() => setSectorLabelMode("zoom")}
                aria-pressed={sectorLabelMode === "zoom"}
              >
                按 Zoom 显示
              </button>
            </div>
            <label htmlFor={sectorLabelZoomId}>
              <span>开始显示级别 <output>Z {sectorLabelMinZoom.toFixed(1)}</output></span>
              <input
                id={sectorLabelZoomId}
                type="range"
                min="10"
                max="16"
                step="0.2"
                value={sectorLabelMinZoom}
                disabled={sectorLabelMode !== "zoom"}
                onChange={(event) => setSectorLabelMinZoom(Number(event.target.value))}
              />
            </label>
            <p>悬停模式性能最好；按 Zoom 显示时会自动隐藏相互重叠的名称。</p>
          </div>
        </details>
      </div>
      <div className="filter-group project-filter-group">
        <div className="group-title"><strong>新房项目</strong><span>{projects.length} 个项目</span></div>
        <button className={"filter-item project-filter " + (showProjects ? "is-active" : "")} onClick={toggleProjects} aria-pressed={showProjects}>
          <span className="category-icon project-category-icon"><Building2 size={14} /></span>
          <span>{projectFilterLabel}</span>
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
            {(categoriesByGroup.get(group.id) ?? []).map((category) => {
              const checked = enabledCategories.includes(category.id);
              return (
                <button key={category.id} className={`filter-item ${checked ? "is-active" : ""}`} onClick={() => toggleCategory(category.id)} aria-pressed={checked}>
                  <span className="category-icon" style={{ "--category-color": category.color } as React.CSSProperties}><CategoryIcon name={category.icon} /></span>
                  <span>{category.name}</span>
                  <span className="toggle"><span /></span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="panel-footnote">{projectFootnote}</p>
    </section>
  );
});
