"use client";

import { Building2, Check, Layers3, RotateCcw, X } from "lucide-react";
import categoriesData from "@/src/data/categories.json";
import { projects } from "@/src/data/projects";
import { useMapStore } from "@/src/store/map-store";
import type { Category } from "@/src/types/map";

const categories = categoriesData as Category[];

export function FilterPanel({ mobile = false }: { mobile?: boolean }) {
  const { enabledCategories, showProjects, toggleCategory, toggleProjects, showAllCategories, clearCategories, setMobileFiltersOpen } = useMapStore();
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
      <p className="panel-footnote">新盘点位会用高德项目名定位；优劣势、教育及价格为用户提供的待核验观点，不构成购房建议。</p>
    </section>
  );
}
