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
      {open && <div className="legend-body"><span><i className="sector-swatch" />实线：候选研究边界 · 虚线：演示面</span><span><i className="project-swatch" />500–800 万新盘</span><span><i className="place-swatch" />设施点位</span><small>候选几何含 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> 数据；缩放地图自动切换信息层级</small></div>}
    </div>
  );
}
