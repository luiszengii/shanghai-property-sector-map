"use client";

import { useEffect, useRef } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import adminReferencesData from "@/src/data/sectors/admin-references.wgs84.json";
import reviewedCandidatesData from "@/src/data/sectors/reviewed-candidates.wgs84.json";
import { useMapStore } from "@/src/store/map-store";
import type { SectorFeature, SectorGeometry } from "@/src/types/map";
import {
  nativeGeometryToDisplayPath,
  wgs84GeometryToDisplayPath,
  wgs84PointsToDisplayPositions,
  type DisplayPath,
} from "./amap-coordinate-conversion";

const sectors = sectorCatalog.features;
type SectorGeometryKind =
  | "official-scope-candidate"
  | "administrative-reference"
  | "demo";
type ResearchGeometryFeature = {
  properties: {
    id: string;
    coordinateSystem: "WGS84";
    status: "reviewed-candidate" | "administrative-reference";
    labelPoint: [number, number];
  };
  geometry: SectorGeometry;
};

const reviewedCandidates = reviewedCandidatesData.features as unknown as ResearchGeometryFeature[];
const adminReferences = adminReferencesData.features as unknown as ResearchGeometryFeature[];
const reviewedCandidateById = new Map(
  reviewedCandidates.map((feature) => [feature.properties.id, feature]),
);
const adminReferenceById = new Map(
  adminReferences.map((feature) => [feature.properties.id, feature]),
);
const researchGeometries = [...reviewedCandidates, ...adminReferences];
const palette = ["#38bdf8", "#2dd4bf", "#818cf8", "#f59e0b", "#a78bfa", "#22c55e"];

function strokeColor(kind: SectorGeometryKind) {
  if (kind === "official-scope-candidate") return "#0f766e";
  if (kind === "administrative-reference") return "#2563eb";
  return "#64748b";
}

function geometryFillOpacity(kind: SectorGeometryKind, zoom: number, selected = false) {
  const base = zoom >= 14
    ? 0.025
    : zoom >= 12
      ? Math.max(0.05, 0.23 - (zoom - 12) * 0.09)
      : Math.min(0.34, 0.18 + (12 - zoom) * 0.08);
  if (selected) return Math.max(base, 0.2);
  if (kind === "administrative-reference") return base * 0.38;
  if (kind === "demo") return base * 0.65;
  return base;
}

function geometryStrokeWeight(kind: SectorGeometryKind, zoom: number) {
  if (kind === "official-scope-candidate") return zoom >= 13 ? 1.5 : 2.4;
  if (kind === "administrative-reference") return zoom >= 13 ? 1.2 : 1.8;
  return zoom >= 13 ? 1 : 1.5;
}

function labelStyle(kind: SectorGeometryKind) {
  return {
    padding: "5px 9px",
    borderRadius: "999px",
    border: `1px solid ${kind === "official-scope-candidate"
      ? "rgba(15, 118, 110, .25)"
      : kind === "administrative-reference"
        ? "rgba(37, 99, 235, .25)"
        : "rgba(100, 116, 139, .25)"}`,
    background: "rgba(255,255,255,.92)",
    color: "#0f172a",
    fontSize: "12px",
    fontWeight: "700",
    boxShadow: "0 5px 16px rgba(15,23,42,.12)",
    whiteSpace: "nowrap",
  };
}

interface SectorLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  zoom: number;
  selectedSectorId: string | null;
  onSelect: (sector: SectorFeature) => void;
}

interface SectorOverlay {
  polygon: AMap.Polygon;
  label: AMap.Text;
  baseColor: string;
  sector: SectorFeature;
  geometryKind: SectorGeometryKind;
}

function applyOverlayStyle(overlay: SectorOverlay, zoom: number, selected = false) {
  const { polygon, baseColor, geometryKind } = overlay;
  polygon.setOptions({
    fillColor: baseColor,
    fillOpacity: geometryFillOpacity(geometryKind, zoom, selected),
    strokeColor: selected ? "#0f172a" : strokeColor(geometryKind),
    strokeStyle: geometryKind === "official-scope-candidate" ? "solid" : "dashed",
    strokeWeight: selected ? 3.2 : geometryStrokeWeight(geometryKind, zoom),
    strokeOpacity: zoom >= 14 ? 0.55 : geometryKind === "demo" ? 0.7 : 0.95,
    zIndex: geometryKind === "official-scope-candidate"
      ? 22
      : geometryKind === "administrative-reference"
        ? 21
        : 20,
  });
}

export function SectorLayer({ amapApi, map, zoom, selectedSectorId, onSelect }: SectorLayerProps) {
  const overlaysRef = useRef<SectorOverlay[]>([]);
  const onSelectRef = useRef(onSelect);
  const zoomRef = useRef(zoom);
  const selectedSectorIdRef = useRef(selectedSectorId);
  const setSectorGeometryFallback = useMapStore((state) => state.setSectorGeometryFallback);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    selectedSectorIdRef.current = selectedSectorId;
  }, [selectedSectorId]);

  useEffect(() => {
    let cancelled = false;
    const overlays: SectorOverlay[] = [];

    const createOverlays = async () => {
      for (const [index, sector] of sectors.entries()) {
        const path = await nativeGeometryToDisplayPath(amapApi, sector.geometry);
        if (cancelled) return;
        const baseColor = palette[index % palette.length];
        const polygon = new amapApi.Polygon();
        polygon.setOptions({
          path,
          cursor: "pointer",
        });
        const label = new amapApi.Text({
          text: sector.properties.name,
          position: sector.properties.center,
          anchor: "center",
          zIndex: 25,
          style: labelStyle("demo"),
        });

        const overlay: SectorOverlay = {
          polygon,
          label,
          baseColor,
          sector,
          geometryKind: "demo",
        };
        applyOverlayStyle(
          overlay,
          zoomRef.current,
          selectedSectorIdRef.current === sector.properties.id,
        );
        const highlight = () => polygon.setOptions({
          fillOpacity: 0.48,
          strokeWeight: 3,
          strokeColor: strokeColor(overlay.geometryKind),
        });
        const restore = () => applyOverlayStyle(
          overlay,
          zoomRef.current,
          selectedSectorIdRef.current === sector.properties.id,
        );
        polygon.on("mouseover", highlight);
        polygon.on("mouseout", restore);
        polygon.on("click", () => onSelectRef.current(sector));
        label.on("click", () => onSelectRef.current(sector));
        map.add([polygon, label]);
        overlays.push(overlay);
      }
      overlaysRef.current = overlays;

      const displayLabelById = new Map<string, AMap.LngLat>();
      try {
        const displayLabelPositions = await wgs84PointsToDisplayPositions(
          amapApi,
          "sector-research-label-points-v1",
          researchGeometries.map((feature) => feature.properties.labelPoint),
        );
        researchGeometries.forEach((feature, index) => {
          displayLabelById.set(feature.properties.id, displayLabelPositions[index]);
        });
      } catch (error) {
        if (cancelled) return;
        console.warn("研究面标签坐标转换失败，已回退到原板块中心", error);
      }

      for (const overlay of overlays) {
        const id = overlay.sector.properties.id;
        const reviewedCandidate = reviewedCandidateById.get(id);
        const adminReference = adminReferenceById.get(id);
        const researchGeometry = reviewedCandidate ?? adminReference;
        if (!researchGeometry) continue;
        const geometryKind: SectorGeometryKind = reviewedCandidate
          ? "official-scope-candidate"
          : "administrative-reference";
        try {
          const path: DisplayPath = await wgs84GeometryToDisplayPath(
            amapApi,
            `${researchGeometry.properties.status}:${researchGeometry.properties.id}`,
            researchGeometry.geometry,
          );
          if (cancelled) return;
          overlay.geometryKind = geometryKind;
          overlay.polygon.setPath(path);
          const displayLabel = displayLabelById.get(id);
          if (displayLabel) overlay.label.setPosition(displayLabel.toArray());
          overlay.label.setStyle(labelStyle(geometryKind));
          applyOverlayStyle(
            overlay,
            zoomRef.current,
            selectedSectorIdRef.current === id,
          );
          setSectorGeometryFallback(id, false);
        } catch (error) {
          if (cancelled) return;
          setSectorGeometryFallback(id, true);
          console.warn(`${overlay.sector.properties.name}研究面坐标转换失败，已回退到灰色虚线演示面`, error);
        }
      }
    };

    createOverlays().catch((error: unknown) => {
      if (!cancelled) console.error("板块候选几何加载失败", error);
    });
    return () => {
      cancelled = true;
      overlays.forEach(({ polygon, label }) => map.remove([polygon, label]));
      overlaysRef.current = [];
    };
  }, [amapApi, map, setSectorGeometryFallback]);

  useEffect(() => {
    overlaysRef.current.forEach((overlay) => {
      const { label, sector } = overlay;
      const selected = sector.properties.id === selectedSectorId;
      applyOverlayStyle(overlay, zoom, selected);
      if (zoom <= 13.2) label.show();
      else label.hide();
    });
  }, [selectedSectorId, zoom]);

  return null;
}
