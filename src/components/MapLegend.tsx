"use client";

import { ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  getLocalExternalLegend,
  projectLegendLabel,
} from "@/src/components/local-research-features";
import { useMapStore } from "@/src/store/map-store";

export function MapLegend() {
  const [open, setOpen] = useState(true);
  const zoom = useMapStore((state) => state.zoom);
  const sectorBoundarySource = useMapStore((state) => state.sectorBoundarySource);
  const mode = zoom < 11.7 ? "板块总览" : zoom < 14 ? "板块 + 主要设施" : "详细设施";
  const externalLegend = getLocalExternalLegend(sectorBoundarySource);
  return (
    <div className={`map-legend glass-panel ${open ? "is-open" : ""}`}>
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="legend-dot" />{mode}<ChevronUp size={15} /></button>
      {open && (
        <div className="legend-body">
          {externalLegend ? (
            <>
              <span><i aria-hidden="true" style={{ borderTop: `3px solid ${externalLegend.color}`, width: 24 }} />{externalLegend.label}</span>
              <span><i aria-hidden="true" style={{ borderTop: "2px dashed #64748b", width: 24 }} />灰色虚线：未匹配项目板块目录的名称</span>
            </>
          ) : (
            <>
              <span><i aria-hidden="true" style={{ borderTop: "3px solid #0f766e", width: 24 }} />青绿实线：研究候选面 / 可编辑覆盖初稿</span>
              <span><i aria-hidden="true" style={{ borderTop: "2px dashed #d97706", width: 24 }} />橙色虚线：主板块内部子范围</span>
              <span><i aria-hidden="true" style={{ borderTop: "2px dashed #2563eb", width: 24 }} />蓝色虚线：独立行政参考层</span>
            </>
          )}
          <span><i className="project-swatch" />{projectLegendLabel}</span>
          <span><i className="place-swatch" />设施点位</span>
          {externalLegend ? (
            <small>{externalLegend.note} · 许可未知 · 仅限本机研究</small>
          ) : (
            <small>
              研究几何含 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> 数据；
              <a href="https://shanghai.tianditu.gov.cn/map/views/standardMap.html" target="_blank" rel="noreferrer">天地图标准图</a>仅作视觉复核
            </small>
          )}
        </div>
      )}
    </div>
  );
}
