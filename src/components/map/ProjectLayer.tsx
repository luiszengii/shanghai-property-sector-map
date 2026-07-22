"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { projects } from "@/src/data/projects";
import type { PropertyProject } from "@/src/types/map";

type Position = [number, number];
type PlaceSearchResult = { poiList?: { pois?: Array<{ location?: { lng: number; lat: number } }> } };
type PlaceSearchApi = { search: (keyword: string, callback: (status: string, result: PlaceSearchResult) => void) => void };
type PlaceSearchConstructor = new (options: Record<string, unknown>) => PlaceSearchApi;

interface ProjectLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  zoom: number;
  visible: boolean;
  selectedProjectId: string | null;
  onSelect: (project: PropertyProject) => void;
}

const CACHE_KEY = "shanghai-project-map-geocodes-v1";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

function fallbackPosition(project: PropertyProject, index: number): Position {
  const angle = index * 2.4;
  const radius = 0.0025 + (index % 4) * 0.0012;
  return [project.fallbackCenter[0] + Math.cos(angle) * radius, project.fallbackCenter[1] + Math.sin(angle) * radius];
}

function readCache(): Record<string, Position> {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, Position>;
  } catch {
    return {};
  }
}

export function ProjectLayer({ amapApi, map, zoom, visible, selectedProjectId, onSelect }: ProjectLayerProps) {
  const markersRef = useRef<AMap.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const fallbackPositions = useMemo(
    () => Object.fromEntries(projects.map((project, index) => [project.id, fallbackPosition(project, index)])),
    [],
  );
  const [positions, setPositions] = useState<Record<string, Position>>(() => ({ ...fallbackPositions, ...readCache() }));

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const cached = readCache();
    const pending = projects.filter((project) => !cached[project.id]);
    if (!pending.length) return;

    amapApi.plugin("AMap.PlaceSearch", () => {
      const Constructor = (amapApi as unknown as { PlaceSearch: PlaceSearchConstructor }).PlaceSearch;
      if (!Constructor || cancelled) return;
      const search = new Constructor({ city: "上海", citylimit: true, pageSize: 1, pageIndex: 1 });
      let nextIndex = 0;

      const runNext = () => {
        if (cancelled || nextIndex >= pending.length) return;
        const project = pending[nextIndex++];
        search.search(project.searchKeyword, (status, result) => {
          const location = result.poiList?.pois?.[0]?.location;
          if (status === "complete" && location) {
            const position: Position = [location.lng, location.lat];
            cached[project.id] = position;
            setPositions((current) => ({ ...current, [project.id]: position }));
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
          }
          window.setTimeout(runNext, 90);
        });
      };

      Array.from({ length: Math.min(3, pending.length) }, runNext);
    });

    return () => {
      cancelled = true;
    };
  }, [amapApi, visible]);

  useEffect(() => {
    markersRef.current.forEach((marker) => map.remove(marker));
    markersRef.current = [];
    if (!visible || zoom < 9.4) return;

    const markers = projects.map((project) => {
      const selected = project.id === selectedProjectId;
      const price = project.averagePrice.toFixed(project.averagePrice % 1 ? 2 : 0).replace(/0$/, "") + "万";
      const label = zoom >= 11.4
        ? '<span class="project-label"><b>' + escapeHtml(project.name) + "</b><small>" + price + "/㎡</small></span>"
        : "";
      const content = '<button class="project-marker' + (selected ? " is-selected" : "") + '" aria-label="' + escapeHtml(project.name) + '"><span class="project-pin"><i>房</i></span>' + label + "</button>";
      const position = positions[project.id] ?? project.fallbackCenter;
      const marker = new amapApi.Marker({ position, content, anchor: "bottom-center", zIndex: selected ? 210 : 145 });
      marker.on("click", () => {
        onSelectRef.current(project);
        map.setZoomAndCenter(Math.max(zoom, 14.2), position, false, 450);
      });
      map.add(marker);
      return marker;
    });
    markersRef.current = markers;

    return () => {
      markers.forEach((marker) => map.remove(marker));
    };
  }, [amapApi, map, positions, selectedProjectId, visible, zoom]);

  return null;
}
