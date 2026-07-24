"use client";

import { Database, Layers3, Map as MapIcon, MessageCircleMore, Navigation, Sparkles } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useMapStore } from "@/src/store/map-store";
import { DataDisclaimerDialog } from "./DataDisclaimerDialog";
import { DetailCard } from "./DetailCards";
import { FilterPanel } from "./FilterPanel";
import { MapLegend } from "./MapLegend";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { SearchBar } from "./SearchBar";
import { MapContainer } from "./map/MapContainer";
import { XhsInsightPanel } from "./XhsInsightPanel";

const CurrentSectorName = memo(function CurrentSectorName() {
  const selectedSectorId = useMapStore((state) => state.selectedSectorId);
  return (
    <strong>
      {selectedSectorId
        ? sectorCatalog.getFeature(selectedSectorId)?.properties.name ?? "上海全域"
        : "上海全域"}
    </strong>
  );
});

const ZoomPill = memo(function ZoomPill() {
  const zoom = useMapStore((state) => state.zoom);
  return <span className="zoom-pill">Z {zoom.toFixed(1)}</span>;
});

const AppHeader = memo(function AppHeader({
  onOpenInsight,
}: {
  onOpenInsight: () => void;
}) {
  const setDisclaimerOpen = useMapStore((state) => state.setDisclaimerOpen);
  return (
    <header className="topbar">
      <div className="brand-block">
        <span className="brand-mark"><MapIcon size={21} /></span>
        <div><h1>上海楼市互动地图</h1><p><Sparkles size={12} /> 房产板块视角 · MVP</p></div>
      </div>
      <SearchBar />
      <div className="header-status">
        <span className="status-label">当前板块</span>
        <CurrentSectorName />
        <ZoomPill />
      </div>
      <div className="header-actions">
        <button className="insight-button" onClick={onOpenInsight}><MessageCircleMore size={16} /><span>板块观察</span></button>
        <button className="data-button" onClick={() => setDisclaimerOpen(true)}><Database size={16} /><span>数据说明</span></button>
      </div>
    </header>
  );
});

const MobileActions = memo(function MobileActions({
  onOpenInsight,
}: {
  onOpenInsight: () => void;
}) {
  const enabledCategoryCount = useMapStore(
    (state) => state.enabledCategories.length,
  );
  const setMobileFiltersOpen = useMapStore((state) => state.setMobileFiltersOpen);
  const setDisclaimerOpen = useMapStore((state) => state.setDisclaimerOpen);
  return (
    <div className="mobile-actions">
      <button onClick={() => setMobileFiltersOpen(true)}><Layers3 size={19} /><span>筛选</span><b>{enabledCategoryCount}</b></button>
      <button onClick={onOpenInsight}><MessageCircleMore size={19} /><span>观察</span></button>
      <button onClick={() => setDisclaimerOpen(true)}><Database size={19} /><span>数据</span></button>
    </div>
  );
});

export function MapExperience() {
  const [isInsightOpen, setInsightOpen] = useState(false);
  const openInsight = useCallback(() => setInsightOpen(true), []);
  const closeInsight = useCallback(() => setInsightOpen(false), []);
  return (
    <main className="app-shell">
      <MapContainer />
      <AppHeader onOpenInsight={openInsight} />

      <aside className="desktop-filters"><FilterPanel /></aside>
      <DetailCard />
      <MapLegend />

      <MobileActions onOpenInsight={openInsight} />

      <div className="map-tip"><Navigation size={14} /><span>点击板块进入，放大查看设施</span></div>
      <MobileBottomSheet />
      <DataDisclaimerDialog />
      <XhsInsightPanel open={isInsightOpen} onClose={closeInsight} />
    </main>
  );
}
