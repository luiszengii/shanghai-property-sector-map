"use client";

import { useEffect, useRef } from "react";
import {
  clusterMapPoints,
  shouldShowProjectLabel,
  zoomToSeparatePoints,
} from "@/src/lib/project-marker-clustering";
import { projectHouseIconSvg } from "@/src/lib/category-icon-svg";
import { useProjectCatalog } from "@/src/lib/use-project-catalog";
import type { PropertyProject } from "@/src/types/map";

interface ProjectLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  zoom: number;
  visible: boolean;
  clusterEnabled: boolean;
  clusterRadius: number;
  detailMinZoom: number;
  selectedProjectId: string | null;
  onSelect: (project: PropertyProject) => void;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

function projectWorldPoint(project: PropertyProject, zoom: number) {
  const [longitude, latitude] = project.position;
  const scale = 256 * 2 ** zoom;
  const latitudeRadians = latitude * Math.PI / 180;
  return {
    item: project,
    x: (longitude + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2 * scale,
  };
}

function projectMarkerContent(
  project: PropertyProject,
  selected: boolean,
  showLabel: boolean,
) {
  const displayName = project.officialName ?? project.name;
  const price = project.research
    ? project.research.averagePrice
      .toFixed(project.research.averagePrice % 1 ? 2 : 0)
      .replace(/0$/, "") + "万/㎡"
    : "";
  const label = showLabel
    ? '<span class="project-label"><b>' + escapeHtml(displayName)
      + "</b>" + (price ? "<small>" + price + "</small>" : "") + "</span>"
    : "";
  return '<button class="project-marker'
    + (selected ? " is-selected" : "")
    + '" aria-label="' + escapeHtml(displayName)
    + '"><span class="project-pin"><i>' + projectHouseIconSvg + "</i></span>"
    + label + "</button>";
}

export function ProjectLayer({
  amapApi,
  map,
  zoom,
  visible,
  clusterEnabled,
  clusterRadius,
  detailMinZoom,
  selectedProjectId,
  onSelect,
}: ProjectLayerProps) {
  const projects = useProjectCatalog();
  const markersRef = useRef<AMap.Marker[]>([]);
  const markerByProjectIdRef = useRef(new Map<string, AMap.Marker>());
  const selectedProjectIdRef = useRef(selectedProjectId);
  const detailMinZoomRef = useRef(detailMinZoom);
  const onSelectRef = useRef(onSelect);
  const zoomBucket = Math.round(zoom * 2) / 2;
  const projectsVisibleAtZoom = zoom >= 9.4;
  const showDetailLabels = shouldShowProjectLabel(zoom, detailMinZoom);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    detailMinZoomRef.current = detailMinZoom;
  }, [detailMinZoom]);

  useEffect(() => {
    const previousId = selectedProjectIdRef.current;
    selectedProjectIdRef.current = selectedProjectId;
    for (const id of [previousId, selectedProjectId]) {
      if (!id) continue;
      const marker = markerByProjectIdRef.current.get(id);
      const project = projects.find((item) => item.id === id);
      if (!marker || !project) continue;
      const selected = id === selectedProjectId;
      marker.setContent(projectMarkerContent(project, selected, showDetailLabels));
      marker.setzIndex(selected ? 210 : 145);
    }
  }, [projects, selectedProjectId, showDetailLabels]);

  useEffect(() => {
    markersRef.current.forEach((marker) => map.remove(marker));
    markersRef.current = [];
    markerByProjectIdRef.current.clear();
    if (!visible || !projectsVisibleAtZoom) return;

    const clusters = clusterMapPoints(
      projects.map((project) => projectWorldPoint(project, zoomBucket)),
      clusterEnabled ? clusterRadius : 0,
    );
    const markers = clusters.map((cluster) => {
      if (cluster.items.length > 1) {
        const position: [number, number] = [
          cluster.items.reduce((total, project) => total + project.position[0], 0) / cluster.items.length,
          cluster.items.reduce((total, project) => total + project.position[1], 0) / cluster.items.length,
        ];
        const content = `<button class="project-cluster-marker" aria-label="${cluster.items.length} 个新房项目"><span>+${cluster.items.length}</span></button>`;
        const marker = new amapApi.Marker({
          position,
          content,
          anchor: "center",
          zIndex: 150,
        });
        marker.on("click", () => {
          const targetZoom = zoomToSeparatePoints(
            cluster.items.map((project) => projectWorldPoint(project, zoomBucket)),
            clusterRadius,
            zoomBucket,
          );
          map.setZoomAndCenter(targetZoom, position, false, 400);
        });
        map.add(marker);
        return marker;
      }

      const project = cluster.items[0];
      const selected = project.id === selectedProjectIdRef.current;
      const content = projectMarkerContent(project, selected, showDetailLabels);
      const marker = new amapApi.Marker({ position: project.position, content, anchor: "bottom-center", zIndex: selected ? 210 : 145 });
      marker.on("click", () => {
        onSelectRef.current(project);
        map.setZoomAndCenter(
          Math.max(zoomBucket, detailMinZoomRef.current),
          project.position,
          false,
          450,
        );
      });
      map.add(marker);
      markerByProjectIdRef.current.set(project.id, marker);
      return marker;
    });
    markersRef.current = markers;

    return () => {
      markers.forEach((marker) => map.remove(marker));
    };
  }, [
    amapApi,
    clusterEnabled,
    clusterRadius,
    map,
    projects,
    projectsVisibleAtZoom,
    showDetailLabels,
    visible,
    zoomBucket,
  ]);

  return null;
}
