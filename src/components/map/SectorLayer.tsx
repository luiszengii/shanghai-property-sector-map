"use client";

import { useEffect, useRef } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useMapStore } from "@/src/store/map-store";
import type { SectorFeature } from "@/src/types/map";
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
const reviewedCandidates = sectorCatalog.reviewedCandidates;
const adminReferences = sectorCatalog.administrativeReferences;
const researchGeometries = [...reviewedCandidates, ...adminReferences];
const reviewedCandidateCenters = reviewedCandidates.map((feature) => ({
  id: feature.properties.id,
  center: sectorCatalog.getActiveGeometry(feature.properties.id)?.center
    ?? feature.properties.labelPoint,
}));
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
  label: AMap.Text | null;
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
  const setSectorGeometryLoading = useMapStore((state) => state.setSectorGeometryLoading);
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
    const settledResearchIds = new Set<string>();

    const bindOverlayInteractions = (overlay: SectorOverlay) => {
      const { polygon, label, sector } = overlay;
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
      label?.on("click", () => onSelectRef.current(sector));
    };

    const createOverlays = async () => {
      for (const [index, sector] of sectors.entries()) {
        const hasResearchGeometry = sectorCatalog.hasResearchGeometry(sector.properties.id);
        if (hasResearchGeometry) {
          setSectorGeometryFallback(sector.properties.id, false);
          setSectorGeometryLoading(sector.properties.id, true);
        }
        const path = await nativeGeometryToDisplayPath(amapApi, sector.geometry);
        if (cancelled) return;
        const baseColor = palette[index % palette.length];
        const polygon = new amapApi.Polygon();
        polygon.setOptions({
          path,
          cursor: "pointer",
        });
        const activeGeometry = sectorCatalog.getActiveGeometry(sector.properties.id);
        const initialLabelPosition = activeGeometry?.kind === "market-demo"
          ? activeGeometry.center
          : sector.properties.center;
        const label = new amapApi.Text({
          text: sector.properties.name,
          position: initialLabelPosition,
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
        bindOverlayInteractions(overlay);
        map.add([polygon, label]);
        overlays.push(overlay);
      }
      overlaysRef.current = overlays;

      const researchPathRequestById = new Map(researchGeometries.map((feature) => [
        feature.properties.id,
        wgs84GeometryToDisplayPath(amapApi, feature.geometry),
      ]));

      const displayLabelById = new Map<string, AMap.LngLat>();
      try {
        const displayLabelPositions = await wgs84PointsToDisplayPositions(
          amapApi,
          reviewedCandidateCenters.map((item) => item.center),
        );
        reviewedCandidateCenters.forEach((item, index) => {
          displayLabelById.set(item.id, displayLabelPositions[index]);
        });
      } catch (error) {
        if (cancelled) return;
        console.warn("候选面标签坐标转换失败，已回退到原板块中心", error);
      }

      for (const marketOverlay of [...overlays]) {
        const id = marketOverlay.sector.properties.id;
        const reviewedCandidate = sectorCatalog.getReviewedCandidate(id);
        const adminReference = sectorCatalog.getAdministrativeReference(id);
        const researchGeometry = reviewedCandidate ?? adminReference;
        if (!researchGeometry) continue;
        const geometryKind: SectorGeometryKind = reviewedCandidate
          ? "official-scope-candidate"
          : "administrative-reference";
        try {
          const pathRequest = researchPathRequestById.get(id);
          if (!pathRequest) throw new Error(`${id} 缺少研究几何显示路径`);
          const path: DisplayPath = await pathRequest;
          if (cancelled) return;
          if (reviewedCandidate) {
            marketOverlay.geometryKind = geometryKind;
            marketOverlay.polygon.setPath(path);
            const displayLabel = displayLabelById.get(id);
            if (displayLabel) marketOverlay.label?.setPosition(displayLabel.toArray());
            marketOverlay.label?.setStyle(labelStyle(geometryKind));
            applyOverlayStyle(
              marketOverlay,
              zoomRef.current,
              selectedSectorIdRef.current === id,
            );
          } else {
            const polygon = new amapApi.Polygon();
            polygon.setOptions({ path, cursor: "pointer" });
            const administrativeOverlay: SectorOverlay = {
              polygon,
              label: null,
              baseColor: "#60a5fa",
              sector: marketOverlay.sector,
              geometryKind,
            };
            applyOverlayStyle(
              administrativeOverlay,
              zoomRef.current,
              selectedSectorIdRef.current === id,
            );
            bindOverlayInteractions(administrativeOverlay);
            map.add(polygon);
            overlays.push(administrativeOverlay);
          }
          settledResearchIds.add(id);
          setSectorGeometryLoading(id, false);
          setSectorGeometryFallback(id, false);
        } catch (error) {
          if (cancelled) return;
          settledResearchIds.add(id);
          setSectorGeometryLoading(id, false);
          setSectorGeometryFallback(id, true);
          const layerName = reviewedCandidate ? "候选面" : "行政参考层";
          console.warn(`${marketOverlay.sector.properties.name}${layerName}坐标转换失败，已保留灰色虚线演示面`, error);
        }
      }
    };

    createOverlays().catch((error: unknown) => {
      if (!cancelled) {
        researchGeometries.forEach((feature) => {
          const id = feature.properties.id;
          setSectorGeometryLoading(id, false);
          if (!settledResearchIds.has(id)) setSectorGeometryFallback(id, true);
        });
        console.error("板块研究几何加载失败", error);
      }
    });
    return () => {
      cancelled = true;
      researchGeometries.forEach((feature) => {
        setSectorGeometryLoading(feature.properties.id, false);
      });
      overlays.forEach(({ polygon, label }) => map.remove(label ? [polygon, label] : polygon));
      overlaysRef.current = [];
    };
  }, [amapApi, map, setSectorGeometryFallback, setSectorGeometryLoading]);

  useEffect(() => {
    overlaysRef.current.forEach((overlay) => {
      const { label, sector } = overlay;
      const selected = sector.properties.id === selectedSectorId;
      applyOverlayStyle(overlay, zoom, selected);
      if (zoom <= 13.2) label?.show();
      else label?.hide();
    });
  }, [selectedSectorId, zoom]);

  return null;
}
