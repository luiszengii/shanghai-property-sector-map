"use client";

import { FilterPanel } from "./FilterPanel";
import { useMapStore } from "@/src/store/map-store";

export function MobileBottomSheet() {
  const { mobileFiltersOpen, setMobileFiltersOpen } = useMapStore();
  if (!mobileFiltersOpen) return null;
  return (
    <div className="mobile-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileFiltersOpen(false); }}>
      <div className="mobile-sheet"><span className="sheet-handle" /><FilterPanel mobile /></div>
    </div>
  );
}
