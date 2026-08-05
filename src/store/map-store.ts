"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import categoriesData from "@/src/data/categories.json";
import type { SectorLabelMode } from "@/src/lib/sector-label-visibility";
import type { Category } from "@/src/types/map";
import { isLocalResearchMode } from "@/src/lib/runtime-mode";
import {
  defaultPlanningLayerPreferences,
  setPlanningLayerOpacity as updatePlanningLayerOpacity,
  togglePlanningLayer,
} from "@/src/lib/planning-reference-layer";

const allCategoryIds = (categoriesData as Category[]).map((item) => item.id);

export type SectorBoundarySource =
  | "project"
  | "project-topology-repair"
  | "hfwgsj-private"
  | "anjuke-private"
  | "fang-private"
  | "realtynavi-private";

interface FocusRequest {
  type: "sector" | "place" | "project";
  id: string;
  nonce: number;
}

interface MapState {
  enabledCategories: string[];
  selectedSectorId: string | null;
  selectedPlaceId: string | null;
  selectedProjectId: string | null;
  showSectorBoundaries: boolean;
  showProjects: boolean;
  showMetro: boolean;
  showElevated: boolean;
  metroStationLabelMinZoom: number;
  showPlanningOverlay: boolean;
  planningOverlayOpacity: number;
  projectClusterEnabled: boolean;
  projectClusterRadius: number;
  projectDetailMinZoom: number;
  sectorLabelMode: SectorLabelMode;
  sectorLabelMinZoom: number;
  sectorBoundarySource: SectorBoundarySource;
  showRealtynaviDistrictOutlineDifferences: boolean;
  zoom: number;
  center: [number, number];
  mobileFiltersOpen: boolean;
  disclaimerOpen: boolean;
  searchMessage: string;
  focusRequest: FocusRequest | null;
  sectorGeometryLoading: Record<string, boolean>;
  sectorGeometryFallbacks: Record<string, boolean>;
  toggleCategory: (id: string) => void;
  setCategoryGroup: (ids: string[], enabled: boolean) => void;
  showAllCategories: () => void;
  clearCategories: () => void;
  selectSector: (id: string | null) => void;
  selectPlace: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  focusProject: (id: string) => void;
  toggleSectorBoundaries: () => void;
  toggleProjects: () => void;
  toggleMetro: () => void;
  toggleElevated: () => void;
  setMetroStationLabelMinZoom: (zoom: number) => void;
  togglePlanningOverlay: () => void;
  setPlanningOverlayOpacity: (opacity: number) => void;
  setProjectClusterEnabled: (enabled: boolean) => void;
  setProjectClusterRadius: (radius: number) => void;
  setProjectDetailMinZoom: (zoom: number) => void;
  setSectorLabelMode: (mode: SectorLabelMode) => void;
  setSectorLabelMinZoom: (zoom: number) => void;
  setSectorBoundarySource: (source: SectorBoundarySource) => void;
  setShowRealtynaviDistrictOutlineDifferences: (show: boolean) => void;
  setZoom: (zoom: number) => void;
  setCenter: (center: [number, number]) => void;
  setMobileFiltersOpen: (open: boolean) => void;
  setDisclaimerOpen: (open: boolean) => void;
  setSearchMessage: (message: string) => void;
  setSectorGeometryLoading: (id: string, loading: boolean) => void;
  setSectorGeometryFallback: (id: string, fallback: boolean) => void;
  requestFocus: (type: "sector" | "place" | "project", id: string) => void;
  closeDetail: () => void;
}

export const useMapStore = create<MapState>()(
  persist(
    (set, get) => ({
      enabledCategories: allCategoryIds,
      selectedSectorId: null,
      selectedPlaceId: null,
      selectedProjectId: null,
      showSectorBoundaries: true,
      showProjects: true,
      showMetro: true,
      showElevated: true,
      metroStationLabelMinZoom: 13.8,
      showPlanningOverlay: defaultPlanningLayerPreferences.visible,
      planningOverlayOpacity: defaultPlanningLayerPreferences.opacity,
      projectClusterEnabled: true,
      projectClusterRadius: 72,
      projectDetailMinZoom: 13.8,
      sectorLabelMode: "hover",
      sectorLabelMinZoom: 13,
      sectorBoundarySource: "project",
      showRealtynaviDistrictOutlineDifferences: false,
      zoom: 10.6,
      center: [121.4737, 31.2304],
      mobileFiltersOpen: false,
      disclaimerOpen: false,
      searchMessage: "",
      focusRequest: null,
      sectorGeometryLoading: {},
      sectorGeometryFallbacks: {},
      toggleCategory: (id) =>
        set((state) => ({
          enabledCategories: state.enabledCategories.includes(id)
            ? state.enabledCategories.filter((item) => item !== id)
            : [...state.enabledCategories, id],
        })),
      setCategoryGroup: (ids, enabled) =>
        set((state) => {
          const groupIds = new Set(ids);
          return {
            enabledCategories: enabled
              ? [...new Set([...state.enabledCategories, ...ids])]
              : state.enabledCategories.filter((id) => !groupIds.has(id)),
          };
        }),
      showAllCategories: () => set({ enabledCategories: allCategoryIds }),
      clearCategories: () => set({ enabledCategories: [] }),
      selectSector: (id) => set({ selectedSectorId: id, selectedPlaceId: null, selectedProjectId: null }),
      selectPlace: (id) => set({ selectedPlaceId: id, selectedProjectId: null }),
      selectProject: (id) => set({ selectedProjectId: id, selectedPlaceId: null }),
      focusProject: (id) =>
        set((state) => ({
          showProjects: true,
          selectedPlaceId: null,
          selectedProjectId: id,
          focusRequest: {
            type: "project",
            id,
            nonce: (state.focusRequest?.nonce ?? 0) + 1,
          },
        })),
      toggleSectorBoundaries: () => set((state) => ({
        showSectorBoundaries: !state.showSectorBoundaries,
        selectedSectorId: state.showSectorBoundaries ? null : state.selectedSectorId,
      })),
      toggleProjects: () => set((state) => ({ showProjects: !state.showProjects })),
      toggleMetro: () => set((state) => ({ showMetro: !state.showMetro })),
      toggleElevated: () => set((state) => ({ showElevated: !state.showElevated })),
      setMetroStationLabelMinZoom: (zoom) =>
        set({ metroStationLabelMinZoom: zoom }),
      togglePlanningOverlay: () => set((state) => {
        const preferences = togglePlanningLayer({
          visible: state.showPlanningOverlay,
          opacity: state.planningOverlayOpacity,
        });
        return {
          showPlanningOverlay: preferences.visible,
          selectedSectorId: preferences.visible ? null : state.selectedSectorId,
        };
      }),
      setPlanningOverlayOpacity: (opacity) => set((state) => {
        const preferences = updatePlanningLayerOpacity({
          visible: state.showPlanningOverlay,
          opacity: state.planningOverlayOpacity,
        }, opacity);
        return { planningOverlayOpacity: preferences.opacity };
      }),
      setProjectClusterEnabled: (enabled) => set({ projectClusterEnabled: enabled }),
      setProjectClusterRadius: (radius) => set({ projectClusterRadius: radius }),
      setProjectDetailMinZoom: (zoom) => set({ projectDetailMinZoom: zoom }),
      setSectorLabelMode: (mode) => set({ sectorLabelMode: mode }),
      setSectorLabelMinZoom: (zoom) => set({ sectorLabelMinZoom: zoom }),
      setSectorBoundarySource: (source) =>
        set({
          sectorBoundarySource: isLocalResearchMode ? source : "project",
          selectedSectorId: null,
          focusRequest: null,
          sectorGeometryLoading: {},
          sectorGeometryFallbacks: {},
        }),
      setShowRealtynaviDistrictOutlineDifferences: (show) =>
        set({ showRealtynaviDistrictOutlineDifferences: show }),
      setZoom: (zoom) => set({ zoom }),
      setCenter: (center) => set({ center }),
      setMobileFiltersOpen: (open) => set({ mobileFiltersOpen: open }),
      setDisclaimerOpen: (open) => set({ disclaimerOpen: open }),
      setSearchMessage: (message) => set({ searchMessage: message }),
      setSectorGeometryLoading: (id, loading) =>
        set((state) => {
          if (Boolean(state.sectorGeometryLoading[id]) === loading) return state;
          const next = { ...state.sectorGeometryLoading };
          if (loading) next[id] = true;
          else delete next[id];
          return { sectorGeometryLoading: next };
        }),
      setSectorGeometryFallback: (id, fallback) =>
        set((state) => {
          if (Boolean(state.sectorGeometryFallbacks[id]) === fallback) return state;
          const next = { ...state.sectorGeometryFallbacks };
          if (fallback) next[id] = true;
          else delete next[id];
          return { sectorGeometryFallbacks: next };
        }),
      requestFocus: (type, id) =>
        set({ focusRequest: { type, id, nonce: (get().focusRequest?.nonce ?? 0) + 1 } }),
      closeDetail: () => set({ selectedPlaceId: null, selectedProjectId: null, selectedSectorId: null }),
    }),
    {
      name: "shanghai-sector-map-session",
      storage: createJSONStorage(() => sessionStorage),
      merge: (persisted, current) => {
        const stored = persisted as Partial<MapState> & {
          showTransport?: boolean;
        };
        return {
          ...current,
          ...stored,
          showMetro: stored.showMetro
            ?? stored.showTransport
            ?? current.showMetro,
          showElevated: stored.showElevated
            ?? stored.showTransport
            ?? current.showElevated,
          showSectorBoundaries: stored.showSectorBoundaries
            ?? current.showSectorBoundaries,
          sectorBoundarySource: isLocalResearchMode
            ? stored.sectorBoundarySource ?? "project"
            : "project",
        };
      },
      partialize: (state) => ({
        enabledCategories: state.enabledCategories,
        showSectorBoundaries: state.showSectorBoundaries,
        showProjects: state.showProjects,
        showMetro: state.showMetro,
        showElevated: state.showElevated,
        metroStationLabelMinZoom: state.metroStationLabelMinZoom,
        showPlanningOverlay: state.showPlanningOverlay,
        planningOverlayOpacity: state.planningOverlayOpacity,
        projectClusterEnabled: state.projectClusterEnabled,
        projectClusterRadius: state.projectClusterRadius,
        projectDetailMinZoom: state.projectDetailMinZoom,
        sectorLabelMode: state.sectorLabelMode,
        sectorLabelMinZoom: state.sectorLabelMinZoom,
        sectorBoundarySource: state.sectorBoundarySource,
      }),
    },
  ),
);
