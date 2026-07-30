"use client";

import {
  Building2,
  Expand,
  Layers3,
  Map as MapIcon,
  Minimize2,
  Navigation,
  SlidersHorizontal,
} from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useProjectCatalog } from "@/src/lib/use-project-catalog";
import { useMapStore } from "@/src/store/map-store";
import { DetailCard } from "./DetailCards";
import { FilterPanel, type FilterPanelMode } from "./FilterPanel";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { SearchBar } from "./SearchBar";
import { MapContainer } from "./map/MapContainer";

const CurrentSectorName = memo(function CurrentSectorName() {
  const selectedSectorId = useMapStore((state) => state.selectedSectorId);
  return <strong>{selectedSectorId ? sectorCatalog.getFeature(selectedSectorId)?.properties.name ?? "上海全域" : "上海全域"}</strong>;
});

const ZoomPill = memo(function ZoomPill() {
  const zoom = useMapStore((state) => state.zoom);
  return <span className="zoom-pill">Z {zoom.toFixed(1)}</span>;
});

const AppHeader = memo(function AppHeader({
  onEnterImmersive,
}: {
  onEnterImmersive: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <span className="brand-mark"><MapIcon size={21} /></span>
        <div>
          <h1>shfang</h1>
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
      </div>
    </header>
  );
});

const MapQuickbar = memo(function MapQuickbar({
  filterMode,
  onToggleFilters,
}: {
  filterMode: FilterPanelMode | null;
  onToggleFilters: (mode: FilterPanelMode) => void;
}) {
  const projects = useProjectCatalog();
  const enabledCategoryCount = useMapStore((state) => state.enabledCategories.length);
  const showProjects = useMapStore((state) => state.showProjects);
  const toggleProjects = useMapStore((state) => state.toggleProjects);
  return (
    <div className="map-quickbar" aria-label="地图快捷筛选">
      <button
        type="button"
        className={filterMode === "sectors" ? "is-active" : ""}
        onClick={() => onToggleFilters("sectors")}
        aria-expanded={filterMode === "sectors"}
      >
        <Layers3 size={15} />
        <span>板块边界</span>
      </button>
      <button type="button" className={`is-project${showProjects ? " is-active" : ""}`} onClick={toggleProjects} aria-pressed={showProjects}>
        <Building2 size={15} />
        <span>新盘</span>
        <b>{projects.length}</b>
      </button>
      <button
        type="button"
        className={filterMode === "facilities" ? "is-active" : ""}
        onClick={() => onToggleFilters("facilities")}
        aria-expanded={filterMode === "facilities"}
      >
        <SlidersHorizontal size={15} />
        <span>生活设施</span>
        <b>{enabledCategoryCount}</b>
      </button>
      <span className="map-result-count">
        <strong>{sectorCatalog.registry.length}</strong> 个板块
      </span>
    </div>
  );
});

const MobileActions = memo(function MobileActions() {
  const enabledCategoryCount = useMapStore((state) => state.enabledCategories.length);
  const setMobileFiltersOpen = useMapStore((state) => state.setMobileFiltersOpen);
  return <div className="mobile-actions"><button onClick={() => setMobileFiltersOpen(true)}><Layers3 size={19} /><span>筛选</span><b>{enabledCategoryCount}</b></button></div>;
});

export function MapExperience() {
  const [isImmersive, setImmersive] = useState(false);
  const [desktopFilterMode, setDesktopFilterMode] = useState<FilterPanelMode | null>(null);
  const selectedSectorId = useMapStore((state) => state.selectedSectorId);
  const selectedPlaceId = useMapStore((state) => state.selectedPlaceId);
  const selectedProjectId = useMapStore((state) => state.selectedProjectId);
  const closeDetail = useMapStore((state) => state.closeDetail);
  const setMobileFiltersOpen = useMapStore((state) => state.setMobileFiltersOpen);
  const hasDetail = Boolean(selectedSectorId || selectedPlaceId || selectedProjectId);
  const toggleDesktopFilters = useCallback((mode: FilterPanelMode) => {
    setDesktopFilterMode((current) => current === mode ? null : mode);
  }, []);
  const enterImmersive = useCallback(() => {
    setDesktopFilterMode(null);
    setMobileFiltersOpen(false);
    closeDetail();
    setImmersive(true);
  }, [closeDetail, setMobileFiltersOpen]);
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
    <main className={`app-shell${isImmersive ? " is-immersive" : ""}${hasDetail ? " has-detail" : ""}`}>
      <MapContainer immersive={isImmersive} />
      {!isImmersive && (
        <>
          <AppHeader onEnterImmersive={enterImmersive} />
          <MapQuickbar filterMode={desktopFilterMode} onToggleFilters={toggleDesktopFilters} />
        </>
      )}

      {!isImmersive && (
        <>
          {desktopFilterMode && (
            <aside className="desktop-filters">
              <FilterPanel mode={desktopFilterMode} onClose={() => setDesktopFilterMode(null)} />
            </aside>
          )}
          <DetailCard />

          <MobileActions />

          <div className="map-tip"><Navigation size={14} /><span>点击板块进入，放大查看设施</span></div>
          <MobileBottomSheet />
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
