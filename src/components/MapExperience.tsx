"use client";

import {
  Building2,
  Expand,
  Layers3,
  Map as MapIcon,
  Milestone,
  Minimize2,
  Navigation,
  SlidersHorizontal,
  TrainFront,
} from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useState } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useProjectCatalog } from "@/src/lib/use-project-catalog";
import { shouldDismissDetail } from "@/src/lib/detail-card-dismissal";
import { useMapStore } from "@/src/store/map-store";
import { DetailCard } from "./DetailCards";
import type { FilterPanelMode } from "./FilterPanel";
import { MapControlDrawer } from "./MapControlDrawer";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { SearchBar } from "./SearchBar";
import { MapContainer } from "./map/MapContainer";

const AppHeader = memo(function AppHeader({
  onEnterImmersive,
  quickbar,
}: {
  onEnterImmersive: () => void;
  quickbar: ReactNode;
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
      <div className="topbar-workspace">
        <SearchBar />
        {quickbar}
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
  const showMetro = useMapStore((state) => state.showMetro);
  const showElevated = useMapStore((state) => state.showElevated);
  const toggleMetro = useMapStore((state) => state.toggleMetro);
  const toggleElevated = useMapStore((state) => state.toggleElevated);
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
      <button
        type="button"
        className={`is-project${filterMode === "projects" ? " is-active" : ""}`}
        onClick={() => onToggleFilters("projects")}
        aria-expanded={filterMode === "projects"}
      >
        <Building2 size={15} />
        <span>新盘</span>
        <b>{projects.length}</b>
      </button>
      <button
        type="button"
        className={showMetro ? "is-active" : ""}
        onClick={toggleMetro}
        aria-pressed={showMetro}
        title="显示或隐藏地铁线路与地铁站"
      >
        <TrainFront size={15} />
        <span>地铁</span>
      </button>
      <button
        type="button"
        className={showElevated ? "is-active" : ""}
        onClick={toggleElevated}
        aria-pressed={showElevated}
        title="显示或隐藏高架与快速路"
      >
        <Milestone size={15} />
        <span>高架</span>
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
  const showMetro = useMapStore((state) => state.showMetro);
  const showElevated = useMapStore((state) => state.showElevated);
  const setMobileFiltersOpen = useMapStore((state) => state.setMobileFiltersOpen);
  const toggleMetro = useMapStore((state) => state.toggleMetro);
  const toggleElevated = useMapStore((state) => state.toggleElevated);
  return (
    <div className="mobile-actions">
      <button
        type="button"
        className={showMetro ? "is-active" : ""}
        onClick={toggleMetro}
        aria-pressed={showMetro}
      >
        <TrainFront size={18} />
        <span>地铁</span>
      </button>
      <button
        type="button"
        className={showElevated ? "is-active" : ""}
        onClick={toggleElevated}
        aria-pressed={showElevated}
      >
        <Milestone size={18} />
        <span>高架</span>
      </button>
      <button type="button" onClick={() => setMobileFiltersOpen(true)}>
        <Layers3 size={19} />
        <span>筛选</span>
        <b>{enabledCategoryCount}</b>
      </button>
    </div>
  );
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

  useEffect(() => {
    if (!hasDetail) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (shouldDismissDetail(event.target)) closeDetail();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [closeDetail, hasDetail]);

  return (
    <main className={`app-shell${isImmersive ? " is-immersive" : ""}${hasDetail ? " has-detail" : ""}`}>
      <MapContainer immersive={isImmersive} />
      {!isImmersive && (
        <AppHeader
          onEnterImmersive={enterImmersive}
          quickbar={(
            <MapQuickbar
              filterMode={desktopFilterMode}
              onToggleFilters={toggleDesktopFilters}
            />
          )}
        />
      )}

      {!isImmersive && (
        <>
          <MapControlDrawer
            mode={desktopFilterMode}
            onClose={() => setDesktopFilterMode(null)}
          />
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
