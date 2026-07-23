"use client";

import { ChevronUp } from "lucide-react";
import { useState } from "react";
import { useMapStore } from "@/src/store/map-store";

export function MapLegend() {
  const [open, setOpen] = useState(true);
  const zoom = useMapStore((state) => state.zoom);
  const mode = zoom < 11.7 ? "板块总览" : zoom < 14 ? "板块 + 主要设施" : "详细设施";
  return (
    <div className={`map-legend glass-panel ${open ? "is-open" : ""}`}>
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="legend-dot" />{mode}<ChevronUp size={15} /></button>
      {open && (
        <div className="legend-body">
          <span><i aria-hidden="true" style={{ borderTop: "3px solid #0f766e", width: 24 }} />青绿实线：楼市研究候选面</span>
          <span><i aria-hidden="true" style={{ borderTop: "2px dashed #d97706", width: 24 }} />橙色虚线：主板块内部子范围</span>
          <span><i aria-hidden="true" style={{ borderTop: "2px dashed #2563eb", width: 24 }} />蓝色虚线：独立行政参考层</span>
          <span><i aria-hidden="true" style={{ borderTop: "2px dashed #64748b", width: 24 }} />灰色虚线：楼市口径待定演示面</span>
          <span><i className="project-swatch" />500–800 万新盘</span>
          <span><i className="place-swatch" />设施点位</span>
          <small>
            研究几何含 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> 数据；
            <a href="https://shanghai.tianditu.gov.cn/map/views/standardMap.html" target="_blank" rel="noreferrer">天地图标准图</a>仅作视觉复核
          </small>
        </div>
      )}
    </div>
  );
}
