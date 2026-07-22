"use client";

import { Check, Layers3, RotateCcw, X } from "lucide-react";
import categoriesData from "@/src/data/categories.json";
import { useMapStore } from "@/src/store/map-store";
import type { Category } from "@/src/types/map";

const categories = categoriesData as Category[];

export function FilterPanel({ mobile = false }: { mobile?: boolean }) {
  const { enabledCategories, toggleCategory, showAllCategories, clearCategories, setMobileFiltersOpen } = useMapStore();
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
      <p className="panel-footnote">点位及边界均为演示数据，请以正式公开资料为准。</p>
    </section>
  );
}
