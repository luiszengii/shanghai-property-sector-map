"use client";

import { Database, Layers3, Map as MapIcon, MessageCircleMore, Navigation, Sparkles } from "lucide-react";
import { useState } from "react";
import sectorsData from "@/src/data/sectors.json";
import { useMapStore } from "@/src/store/map-store";
import type { SectorCollection } from "@/src/types/map";
import { DataDisclaimerDialog } from "./DataDisclaimerDialog";
import { DetailCard } from "./DetailCards";
import { FilterPanel } from "./FilterPanel";
import { MapLegend } from "./MapLegend";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { SearchBar } from "./SearchBar";
import { MapContainer } from "./map/MapContainer";
import { XhsInsightPanel } from "./XhsInsightPanel";

const sectors = (sectorsData as SectorCollection).features;

export function MapExperience() {
  const { selectedSectorId, zoom, enabledCategories, setMobileFiltersOpen, setDisclaimerOpen } = useMapStore();
  const currentSector = sectors.find((item) => item.properties.id === selectedSectorId);
  const [isInsightOpen, setInsightOpen] = useState(false);

  return (
    <main className="app-shell">
      <MapContainer />
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark"><MapIcon size={21} /></span>
          <div><h1>上海楼市互动地图</h1><p><Sparkles size={12} /> 房产板块视角 · MVP</p></div>
        </div>
        <SearchBar />
        <div className="header-status">
          <span className="status-label">当前板块</span>
          <strong>{currentSector?.properties.name ?? "上海全域"}</strong>
          <span className="zoom-pill">Z {zoom.toFixed(1)}</span>
        </div>
        <div className="header-actions">
          <button className="insight-button" onClick={() => setInsightOpen(true)}><MessageCircleMore size={16} /><span>板块观察</span></button>
          <button className="data-button" onClick={() => setDisclaimerOpen(true)}><Database size={16} /><span>数据说明</span></button>
        </div>
      </header>

      <aside className="desktop-filters"><FilterPanel /></aside>
      <DetailCard />
      <MapLegend />

      <div className="mobile-actions">
        <button onClick={() => setMobileFiltersOpen(true)}><Layers3 size={19} /><span>筛选</span><b>{enabledCategories.length}</b></button>
        <button onClick={() => setInsightOpen(true)}><MessageCircleMore size={19} /><span>观察</span></button>
        <button onClick={() => setDisclaimerOpen(true)}><Database size={19} /><span>数据</span></button>
      </div>

      <div className="map-tip"><Navigation size={14} /><span>点击板块进入，放大查看设施</span></div>
      <MobileBottomSheet />
      <DataDisclaimerDialog />
      <XhsInsightPanel open={isInsightOpen} onClose={() => setInsightOpen(false)} />
    </main>
  );
}
