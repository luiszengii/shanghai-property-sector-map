"use client";

import { useEffect, useRef } from "react";
import { projects } from "@/src/content/project-leads";
import type { PropertyProject } from "@/src/types/map";

interface ProjectLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  zoom: number;
  visible: boolean;
  selectedProjectId: string | null;
  onSelect: (project: PropertyProject) => void;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

export function ProjectLayer({ amapApi, map, zoom, visible, selectedProjectId, onSelect }: ProjectLayerProps) {
  const markersRef = useRef<AMap.Marker[]>([]);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    markersRef.current.forEach((marker) => map.remove(marker));
    markersRef.current = [];
    if (!visible || zoom < 9.4) return;

    const markers = projects.map((project) => {
      const selected = project.id === selectedProjectId;
      const displayName = project.officialName ?? project.name;
      const price = project.averagePrice.toFixed(project.averagePrice % 1 ? 2 : 0).replace(/0$/, "") + "万";
      const label = zoom >= 11.4
        ? '<span class="project-label"><b>' + escapeHtml(displayName) + "</b><small>" + price + "/㎡</small></span>"
        : "";
      const content = '<button class="project-marker' + (selected ? " is-selected" : "") + '" aria-label="' + escapeHtml(displayName) + '"><span class="project-pin"><i>房</i></span>' + label + "</button>";
      const marker = new amapApi.Marker({ position: project.position, content, anchor: "bottom-center", zIndex: selected ? 210 : 145 });
      marker.on("click", () => {
        onSelectRef.current(project);
        map.setZoomAndCenter(Math.max(zoom, 14.2), project.position, false, 450);
      });
      map.add(marker);
      return marker;
    });
    markersRef.current = markers;

    return () => {
      markers.forEach((marker) => map.remove(marker));
    };
  }, [amapApi, map, selectedProjectId, visible, zoom]);

  return null;
}
