"use client";

import {
  Building2,
  Check,
  ChevronDown,
  ExternalLink,
  LandPlot,
  Layers3,
  MapPinned,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { memo, type CSSProperties, useId, useState } from "react";
import { AnimatedList } from "@/src/components/AnimatedList";
import { AnimatedProjectList } from "@/src/components/AnimatedProjectList";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import {
  LocalSectorSourceControls,
} from "@/src/components/local-research-features";
import categoriesData from "@/src/data/categories.json";
import {
  planningLandUseLegend,
  planningReferenceSource,
} from "@/src/lib/planning-reference-layer";
import { useProjectCatalog } from "@/src/lib/use-project-catalog";
import { useMapStore } from "@/src/store/map-store";
import type { Category } from "@/src/types/map";

const categories = categoriesData as Category[];
const groups = [
  { id: "benefit", label: "有利配套", helper: "生活与通勤资源" },
  { id: "attention", label: "需要关注", helper: "建议结合公开资料核验" },
] as const;
type CategoryGroupId = (typeof groups)[number]["id"];
export type FilterPanelMode = "all" | "sectors" | "projects" | "facilities";
const categoriesByGroup = new Map(
  groups.map((group) => [
    group.id,
    categories.filter((category) => category.group === group.id),
  ]),
);
export const FilterPanel = memo(function FilterPanel({
  mobile = false,
  mode = "all",
  onClose,
}: {
  mobile?: boolean;
  mode?: FilterPanelMode;
  onClose?: () => void;
}) {
  const projects = useProjectCatalog();
  const [expandedGroups, setExpandedGroups] = useState<Record<CategoryGroupId, boolean>>({
    benefit: true,
    attention: true,
  });
  const clusterRadiusId = useId();
  const detailZoomId = useId();
  const sectorLabelZoomId = useId();
  const planningOpacityId = useId();
  const categoryGroupIdPrefix = useId();
  const enabledCategories = useMapStore((state) => state.enabledCategories);
  const selectedProjectId = useMapStore((state) => state.selectedProjectId);
  const showProjects = useMapStore((state) => state.showProjects);
  const showPlanningOverlay = useMapStore((state) => state.showPlanningOverlay);
  const planningOverlayOpacity = useMapStore((state) => state.planningOverlayOpacity);
  const projectClusterEnabled = useMapStore((state) => state.projectClusterEnabled);
  const projectClusterRadius = useMapStore((state) => state.projectClusterRadius);
  const projectDetailMinZoom = useMapStore((state) => state.projectDetailMinZoom);
  const sectorLabelMode = useMapStore((state) => state.sectorLabelMode);
  const sectorLabelMinZoom = useMapStore((state) => state.sectorLabelMinZoom);
  const toggleCategory = useMapStore((state) => state.toggleCategory);
  const setCategoryGroup = useMapStore((state) => state.setCategoryGroup);
  const toggleProjects = useMapStore((state) => state.toggleProjects);
  const focusProject = useMapStore((state) => state.focusProject);
  const togglePlanningOverlay = useMapStore((state) => state.togglePlanningOverlay);
  const setPlanningOverlayOpacity = useMapStore((state) => state.setPlanningOverlayOpacity);
  const setProjectClusterEnabled = useMapStore((state) => state.setProjectClusterEnabled);
  const setProjectClusterRadius = useMapStore((state) => state.setProjectClusterRadius);
  const setProjectDetailMinZoom = useMapStore((state) => state.setProjectDetailMinZoom);
  const setSectorLabelMode = useMapStore((state) => state.setSectorLabelMode);
  const setSectorLabelMinZoom = useMapStore((state) => state.setSectorLabelMinZoom);
  const showAllCategories = useMapStore((state) => state.showAllCategories);
  const clearCategories = useMapStore((state) => state.clearCategories);
  const setMobileFiltersOpen = useMapStore((state) => state.setMobileFiltersOpen);
  const showSectorControls = mode === "all" || mode === "sectors";
  const showProjectControls = mode === "projects";
  const showFacilityControls = mode === "all" || mode === "facilities";
  const panelTitle = mode === "sectors"
    ? "板块边界"
    : mode === "projects"
      ? "新盘列表"
      : mode === "facilities"
        ? "生活设施"
        : "地图显示";
  const panelIcon = mode === "projects"
    ? <Building2 size={13} />
    : mode === "facilities"
      ? <SlidersHorizontal size={13} />
      : <Layers3 size={13} />;
  return (
    <section
      className={`filter-panel glass-panel ${mobile ? "is-mobile" : ""}`}
      aria-label={mode === "sectors"
        ? "板块边界筛选"
        : mode === "projects"
          ? "新盘列表"
          : mode === "facilities"
            ? "生活设施筛选"
            : "地图图层筛选"}
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{panelIcon} {mode === "projects" ? `${projects.length} 个项目` : "图层筛选"}</span>
          <h2>{panelTitle}</h2>
        </div>
        {(mobile || onClose) && (
          <button
            className="icon-button"
            onClick={mobile ? () => setMobileFiltersOpen(false) : onClose}
            aria-label="关闭筛选"
          >
            <X size={20} />
          </button>
        )}
      </div>
      {showSectorControls && (
        <>
          <LocalSectorSourceControls />
          <div className="filter-group planning-filter-group">
            <div className="group-title"><strong>参考图层</strong><span>规划用途参考</span></div>
            <section className={`planning-layer-card${showPlanningOverlay ? " is-active" : ""}`}>
              <button
                type="button"
                className="planning-layer-toggle"
                onClick={togglePlanningOverlay}
                aria-pressed={showPlanningOverlay}
              >
                <span className="planning-layer-icon" aria-hidden="true"><LandPlot size={14} /></span>
                <span className="planning-layer-copy">
                  <strong>官方详细规划（参考）</strong>
                  <small>Z {planningReferenceSource.minimumZoom} 后点地块查看规划</small>
                </span>
                <span className="toggle" aria-hidden="true"><span /></span>
              </button>
              {showPlanningOverlay && (
                <ul className="planning-legend-grid" aria-label="规划用地颜色图例">
                  {planningLandUseLegend.map((item) => (
                    <li key={item.category}>
                      <span
                        className="planning-legend-swatch"
                        style={{ "--planning-legend-color": item.fillColor } as React.CSSProperties}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              <details className="planning-layer-settings">
                <summary>
                  <SlidersHorizontal size={13} aria-hidden="true" />
                  <span>透明度</span>
                  <small>{Math.round(planningOverlayOpacity * 100)}%</small>
                </summary>
                <div className="planning-layer-settings-body">
                  <label htmlFor={planningOpacityId}>
                    <span>图层透明度 <output>{Math.round(planningOverlayOpacity * 100)}%</output></span>
                    <input
                      id={planningOpacityId}
                      type="range"
                      min="15"
                      max="80"
                      step="1"
                      value={Math.round(planningOverlayOpacity * 100)}
                      disabled={!showPlanningOverlay}
                      onChange={(event) => setPlanningOverlayOpacity(Number(event.target.value) / 100)}
                    />
                  </label>
                  <div className="planning-layer-source-row">
                    <a href={planningReferenceSource.url} target="_blank" rel="noreferrer">
                      {planningReferenceSource.name}<ExternalLink size={11} aria-hidden="true" />
                    </a>
                    <span>Z {planningReferenceSource.minimumZoom} 起加载</span>
                  </div>
                  <p>规划用途不等于现状、在建状态或最终实施结果。</p>
                </div>
              </details>
            </section>
          </div>
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
        </>
      )}
      {mode === "all" && (
        <div className="filter-group project-filter-group">
          <div className="group-title"><strong>新房项目</strong><span>{projects.length} 个项目</span></div>
          <button
            type="button"
            className={`filter-item project-filter${showProjects ? " is-active" : ""}`}
            onClick={toggleProjects}
            aria-pressed={showProjects}
          >
            <span className="category-icon project-category-icon"><Building2 size={14} /></span>
            <span>显示新盘标记</span>
            <span className="toggle"><span /></span>
          </button>
        </div>
      )}
      {showProjectControls && (
        <div className="project-list-panel">
          <button
            type="button"
            className={`project-visibility-switch${showProjects ? " is-active" : ""}`}
            onClick={toggleProjects}
            aria-pressed={showProjects}
          >
            <span>
              <strong>显示全部新盘</strong>
              <small>{showProjects ? "地图上显示项目标记" : "地图标记已隐藏"}</small>
            </span>
            <span className="toggle" aria-hidden="true"><span /></span>
          </button>
          <AnimatedProjectList
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelect={(project) => focusProject(project.id)}
          />
          <details className="project-display-settings project-list-settings">
            <summary>
              <SlidersHorizontal size={13} />
              <span>标记显示设置</span>
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
              <p>点击列表项目会自动定位，并打开右侧楼盘详情。</p>
            </div>
          </details>
        </div>
      )}
      {showFacilityControls && (
        <>
          <div className="filter-actions">
            <button onClick={showAllCategories}><Check size={14} /> 显示全部</button>
            <button onClick={clearCategories}><RotateCcw size={14} /> 清空</button>
          </div>
          {groups.map((group) => {
            const groupCategories = categoriesByGroup.get(group.id) ?? [];
            const groupCategoryIds = groupCategories.map((category) => category.id);
            const groupContentId = `${categoryGroupIdPrefix}-${group.id}`;
            const expanded = expandedGroups[group.id];
            return (
              <div className="filter-group category-filter-group" key={group.id}>
                <div className="category-group-header">
                  <button
                    type="button"
                    className={`category-group-toggle ${expanded ? "is-open" : ""}`}
                    onClick={() => setExpandedGroups((current) => ({
                      ...current,
                      [group.id]: !current[group.id],
                    }))}
                    aria-expanded={expanded}
                    aria-controls={groupContentId}
                  >
                    <span className="category-group-copy">
                      <strong>{group.label}</strong>
                      <small>{group.helper}</small>
                    </span>
                    <ChevronDown aria-hidden="true" size={15} />
                  </button>
                  <span className="category-group-actions" role="group" aria-label={`${group.label}批量设置`}>
                    <button type="button" onClick={() => setCategoryGroup(groupCategoryIds, true)}>全开</button>
                    <button type="button" onClick={() => setCategoryGroup(groupCategoryIds, false)}>全关</button>
                  </span>
                </div>
                {expanded && (
                  <AnimatedList className="filter-list" id={groupContentId}>
                    {groupCategories.map((category) => {
                      const checked = enabledCategories.includes(category.id);
                      return (
                        <button key={category.id} className={`filter-item ${checked ? "is-active" : ""}`} onClick={() => toggleCategory(category.id)} aria-pressed={checked}>
                          <span
                            className="category-icon facility-category-icon"
                            style={{ "--category-color": category.color } as CSSProperties}
                            aria-hidden="true"
                          >
                            <CategoryIcon name={category.icon} size={15} />
                          </span>
                          <span>{category.name}</span>
                          <span className="toggle"><span /></span>
                        </button>
                      );
                    })}
                  </AnimatedList>
                )}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
});
