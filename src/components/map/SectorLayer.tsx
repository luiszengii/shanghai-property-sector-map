"use client";

import { useEffect, useRef } from "react";
import sectorsData from "@/src/data/sectors.json";
import type { SectorCollection, SectorFeature } from "@/src/types/map";

const sectors = (sectorsData as SectorCollection).features;
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
}

export function SectorLayer({ amapApi, map, zoom, selectedSectorId, onSelect }: SectorLayerProps) {
  const overlaysRef = useRef<SectorOverlay[]>([]);
  const onSelectRef = useRef(onSelect);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const overlays = sectors.map((sector, index) => {
      const baseColor = palette[index % palette.length];
      const path = sector.geometry.coordinates[0].map(([lng, lat]) => new amapApi.LngLat(lng, lat));
      const polygon = new amapApi.Polygon();
      polygon.setOptions({
        path,
        strokeColor: "#0f766e",
        strokeOpacity: 0.9,
        strokeWeight: 1.8,
        fillColor: baseColor,
        fillOpacity: 0.28,
        zIndex: 20,
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
      const restore = () => polygon.setOptions({ fillOpacity: zoomRef.current >= 13 ? 0.05 : Math.max(0.1, 0.34 - (zoomRef.current - 10) * 0.1), strokeWeight: 1.8 });
      polygon.on("mouseover", highlight);
      polygon.on("mouseout", restore);
      polygon.on("click", () => onSelectRef.current(sector));
      label.on("click", () => onSelectRef.current(sector));
      map.add([polygon, label]);
      return { polygon, label, baseColor, sector };
    });

    overlaysRef.current = overlays;
    return () => {
      overlays.forEach(({ polygon, label }) => map.remove([polygon, label]));
      overlaysRef.current = [];
    };
  }, [amapApi, map]);

  useEffect(() => {
    const fillOpacity = zoom >= 14 ? 0.025 : zoom >= 12 ? Math.max(0.05, 0.23 - (zoom - 12) * 0.09) : Math.min(0.34, 0.18 + (12 - zoom) * 0.08);
    overlaysRef.current.forEach(({ polygon, label, baseColor, sector }) => {
      const selected = sector.properties.id === selectedSectorId;
      polygon.setOptions({
        fillColor: baseColor,
        fillOpacity: selected ? Math.max(fillOpacity, 0.2) : fillOpacity,
        strokeColor: selected ? "#0f172a" : "#0f766e",
        strokeWeight: selected ? 3.2 : zoom >= 13 ? 1.2 : 1.8,
        strokeOpacity: zoom >= 14 ? 0.55 : 0.9,
      });
      if (zoom <= 13.2) label.show();
      else label.hide();
    });
  }, [selectedSectorId, zoom]);

  return null;
}
