"use client";

import { Database, Expand, Layers3, Map as MapIcon, MessageCircleMore, Minimize2, Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useState } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useMapStore } from "@/src/store/map-store";
import { DataDisclaimerDialog } from "./DataDisclaimerDialog";
import { DetailCard } from "./DetailCards";
import { FilterPanel } from "./FilterPanel";
import { MapLegend } from "./MapLegend";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { SearchBar } from "./SearchBar";
import { MapContainer } from "./map/MapContainer";

const XhsInsightPanel = dynamic(
  () => import("./XhsInsightPanel").then((module) => module.XhsInsightPanel),
  { ssr: false },
);

const CurrentSectorName = memo(function CurrentSectorName() {
  const selectedSectorId = useMapStore((state) => state.selectedSectorId);
  return <strong>{selectedSectorId ? sectorCatalog.getFeature(selectedSectorId)?.properties.name ?? "上海全域" : "上海全域"}</strong>;
});

const ZoomPill = memo(function ZoomPill() {
  const zoom = useMapStore((state) => state.zoom);
  return <span className="zoom-pill">Z {zoom.toFixed(1)}</span>;
});

const AppHeader = memo(function AppHeader({
  onOpenInsight,
  onEnterImmersive,
}: {
  onOpenInsight: () => void;
  onEnterImmersive: () => void;
}) {
  const setDisclaimerOpen = useMapStore((state) => state.setDisclaimerOpen);
  return (
    <header className="topbar">
      <div className="brand-block">
        <span className="brand-mark"><MapIcon size={21} /></span>
        <div>
          <h1>上海楼市互动地图</h1>
          <p><Layers3 size={12} /> {sectorCatalog.registry.length} 个板块 · 设施与新盘</p>
        </div>
      </div>
      <SearchBar />
      <div className="header-status">
        <span className="status-label">当前板块</span>
        <CurrentSectorName />
        <ZoomPill />
      </div>
      <div className="header-actions">
        <button className="immersive-button" onClick={onEnterImmersive} title="只显示地图板块和新盘 Pin"><Expand size={16} /><span>沉浸模式</span></button>
        <button className="insight-button" onClick={onOpenInsight}><MessageCircleMore size={16} /><span>板块观察</span></button>
        <button className="data-button" onClick={() => setDisclaimerOpen(true)}><Database size={16} /><span>数据说明</span></button>
      </div>
    </header>
  );
});

const MobileActions = memo(function MobileActions({ onOpenInsight }: { onOpenInsight: () => void }) {
  const enabledCategoryCount = useMapStore((state) => state.enabledCategories.length);
  const setMobileFiltersOpen = useMapStore((state) => state.setMobileFiltersOpen);
  const setDisclaimerOpen = useMapStore((state) => state.setDisclaimerOpen);
  return <div className="mobile-actions"><button onClick={() => setMobileFiltersOpen(true)}><Layers3 size={19} /><span>筛选</span><b>{enabledCategoryCount}</b></button><button onClick={onOpenInsight}><MessageCircleMore size={19} /><span>观察</span></button><button onClick={() => setDisclaimerOpen(true)}><Database size={19} /><span>数据</span></button></div>;
});

export function MapExperience() {
  const [isInsightOpen, setInsightOpen] = useState(false);
  const [isImmersive, setImmersive] = useState(false);
  const closeDetail = useMapStore((state) => state.closeDetail);
  const setDisclaimerOpen = useMapStore((state) => state.setDisclaimerOpen);
  const setMobileFiltersOpen = useMapStore((state) => state.setMobileFiltersOpen);
  const openInsight = useCallback(() => setInsightOpen(true), []);
  const closeInsight = useCallback(() => setInsightOpen(false), []);
  const enterImmersive = useCallback(() => {
    setInsightOpen(false);
    setDisclaimerOpen(false);
    setMobileFiltersOpen(false);
    closeDetail();
    setImmersive(true);
  }, [closeDetail, setDisclaimerOpen, setMobileFiltersOpen]);
  const exitImmersive = useCallback(() => setImmersive(false), []);

  useEffect(() => {
    if (!isImmersive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitImmersive();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exitImmersive, isImmersive]);

  return (
    <main className={`app-shell${isImmersive ? " is-immersive" : ""}`}>
      <MapContainer immersive={isImmersive} />
      {!isImmersive && <AppHeader onOpenInsight={openInsight} onEnterImmersive={enterImmersive} />}

      {!isImmersive && (
        <>
          <aside className="desktop-filters"><FilterPanel /></aside>
          <DetailCard />
          <MapLegend />

          <MobileActions onOpenInsight={openInsight} />

          <div className="map-tip"><Navigation size={14} /><span>点击板块进入，放大查看设施</span></div>
          <MobileBottomSheet />
          <DataDisclaimerDialog />
          {isInsightOpen && <XhsInsightPanel open onClose={closeInsight} />}
        </>
      )}
      {isImmersive && (
        <button
          type="button"
          className="immersive-exit"
          onClick={exitImmersive}
          aria-label="退出沉浸模式"
          title="退出沉浸模式（Esc）"
        >
          <Minimize2 size={17} />
          <span>退出沉浸</span>
          <kbd>Esc</kbd>
        </button>
      )}
    </main>
  );
}
