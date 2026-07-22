"use client";

import { useEffect, useRef } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import reviewedCandidatesData from "@/src/data/sectors/reviewed-candidates.wgs84.json";
import { useMapStore } from "@/src/store/map-store";
import type { SectorFeature, SectorGeometry } from "@/src/types/map";
import {
  nativeGeometryToDisplayPath,
  reviewedGeometryToDisplayPath,
  type DisplayPath,
} from "./amap-coordinate-conversion";

const sectors = sectorCatalog.features;
const reviewedCandidates = reviewedCandidatesData.features as Array<{
  properties: { id: string; coordinateSystem: "WGS84" };
  geometry: SectorGeometry;
}>;
const reviewedCandidateById = new Map(reviewedCandidates.map((feature) => [feature.properties.id, feature]));
const palette = ["#38bdf8", "#2dd4bf", "#818cf8", "#f59e0b", "#a78bfa", "#22c55e"];

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
  isReviewedCandidate: boolean;
}

export function SectorLayer({ amapApi, map, zoom, selectedSectorId, onSelect }: SectorLayerProps) {
  const overlaysRef = useRef<SectorOverlay[]>([]);
  const onSelectRef = useRef(onSelect);
  const zoomRef = useRef(zoom);
  const setSectorGeometryFallback = useMapStore((state) => state.setSectorGeometryFallback);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    const overlays: SectorOverlay[] = [];

    const createOverlays = async () => {
      for (const [index, sector] of sectors.entries()) {
        const reviewedCandidate = reviewedCandidateById.get(sector.properties.id);
        let isReviewedCandidate = Boolean(reviewedCandidate);
        let path: DisplayPath;
        try {
          path = reviewedCandidate
            ? await reviewedGeometryToDisplayPath(amapApi, reviewedCandidate.properties.id, reviewedCandidate.geometry)
            : await nativeGeometryToDisplayPath(amapApi, sector.geometry);
        } catch (error) {
          if (cancelled) return;
          isReviewedCandidate = false;
          console.warn(`${sector.properties.name}候选面坐标转换失败，已回退到虚线演示面`, error);
          path = await nativeGeometryToDisplayPath(amapApi, sector.geometry);
        }
        if (cancelled) return;
        if (reviewedCandidate) setSectorGeometryFallback(sector.properties.id, !isReviewedCandidate);
        const baseColor = palette[index % palette.length];
        const polygon = new amapApi.Polygon();
        polygon.setOptions({
          path,
          strokeColor: isReviewedCandidate ? "#0f766e" : "#64748b",
          strokeOpacity: isReviewedCandidate ? 0.95 : 0.7,
          strokeStyle: isReviewedCandidate ? "solid" : "dashed",
          strokeWeight: isReviewedCandidate ? 2.4 : 1.5,
          fillColor: baseColor,
          fillOpacity: isReviewedCandidate ? 0.3 : 0.16,
          zIndex: isReviewedCandidate ? 22 : 20,
          cursor: "pointer",
        });
        const label = new amapApi.Text({
          text: sector.properties.name,
          position: sector.properties.center,
          anchor: "center",
          zIndex: 25,
          style: {
            padding: "5px 9px",
            borderRadius: "999px",
            border: "1px solid rgba(15, 118, 110, .25)",
            background: "rgba(255,255,255,.92)",
            color: "#0f172a",
            fontSize: "12px",
            fontWeight: "700",
            boxShadow: "0 5px 16px rgba(15,23,42,.12)",
            whiteSpace: "nowrap",
          },
        });

        const highlight = () => polygon.setOptions({ fillOpacity: 0.48, strokeWeight: 3, strokeColor: "#0f766e" });
        const restore = () => polygon.setOptions({ fillOpacity: zoomRef.current >= 13 ? 0.05 : Math.max(0.1, 0.34 - (zoomRef.current - 10) * 0.1), strokeWeight: isReviewedCandidate ? 2.4 : 1.5 });
        polygon.on("mouseover", highlight);
        polygon.on("mouseout", restore);
        polygon.on("click", () => onSelectRef.current(sector));
        label.on("click", () => onSelectRef.current(sector));
        map.add([polygon, label]);
        overlays.push({ polygon, label, baseColor, sector, isReviewedCandidate });
      }
      overlaysRef.current = overlays;
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
    const fillOpacity = zoom >= 14 ? 0.025 : zoom >= 12 ? Math.max(0.05, 0.23 - (zoom - 12) * 0.09) : Math.min(0.34, 0.18 + (12 - zoom) * 0.08);
    overlaysRef.current.forEach(({ polygon, label, baseColor, sector, isReviewedCandidate }) => {
      const selected = sector.properties.id === selectedSectorId;
      polygon.setOptions({
        fillColor: baseColor,
        fillOpacity: selected ? Math.max(fillOpacity, 0.2) : isReviewedCandidate ? fillOpacity : fillOpacity * 0.65,
        strokeColor: selected ? "#0f172a" : isReviewedCandidate ? "#0f766e" : "#64748b",
        strokeStyle: isReviewedCandidate ? "solid" : "dashed",
        strokeWeight: selected ? 3.2 : isReviewedCandidate ? (zoom >= 13 ? 1.5 : 2.4) : (zoom >= 13 ? 1 : 1.5),
        strokeOpacity: zoom >= 14 ? 0.55 : isReviewedCandidate ? 0.95 : 0.7,
      });
      if (zoom <= 13.2) label.show();
      else label.hide();
    });
  }, [selectedSectorId, zoom]);

  return null;
}
