"use client";

import { useEffect, useRef, useState } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import type { SectorResearchGeometryFeature } from "@/src/data/sector-catalog";
import { useMapStore } from "@/src/store/map-store";
import type { SectorFeature } from "@/src/types/map";
import { simplifySectorGeometryForDisplay } from "@/src/lib/sector-display-lod";
import {
  sectorFillOpacity,
  type SectorGeometryKind,
} from "@/src/lib/map-visual-density";
import {
  shouldMountSectorLabel,
  type SectorLabelMode,
} from "@/src/lib/sector-label-visibility";
import {
  nativeGeometryToDisplayPath,
  wgs84GeometryToDisplayPath,
  wgs84PointsToDisplayPositions,
  type DisplayPath,
} from "./amap-coordinate-conversion";

const sectors = sectorCatalog.legacyFeatures;
const palette = ["#38bdf8", "#2dd4bf", "#818cf8", "#f59e0b", "#a78bfa", "#22c55e"];

function strokeColor(kind: SectorGeometryKind) {
  if (kind === "reviewed-market-candidate") return "#0f766e";
  if (kind === "official-subscope-reference") return "#d97706";
  if (kind === "administrative-reference") return "#2563eb";
  return "#64748b";
}

function geometryStrokeWeight(kind: SectorGeometryKind, zoom: number) {
  if (kind === "reviewed-market-candidate") return zoom >= 13 ? 1.5 : 2.4;
  if (kind === "official-subscope-reference") return zoom >= 13 ? 1.4 : 2;
  if (kind === "administrative-reference") return zoom >= 13 ? 1.2 : 1.8;
  return zoom >= 13 ? 1 : 1.5;
}

function labelStyle(kind: SectorGeometryKind) {
  return {
    padding: "5px 9px",
    borderRadius: "999px",
    border: `1px solid ${kind === "reviewed-market-candidate"
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
    pointerEvents: "none",
  };
}

interface SectorLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  zoom: number;
  viewportVersion: number;
  viewportInteracting: boolean;
  labelMode: SectorLabelMode;
  labelMinZoom: number;
  selectedSectorId: string | null;
  onSelect: (sector: SectorFeature) => void;
}

interface SectorOverlay {
  polygon: AMap.Polygon;
  label: AMap.Text | null;
  baseColor: string;
  sector: SectorFeature;
  geometryKind: SectorGeometryKind;
  hiddenLegacyDemo: boolean;
  labelMounted: boolean;
  hoverLeaveTimer: ReturnType<typeof setTimeout> | null;
}

function applyOverlayStyle(overlay: SectorOverlay, zoom: number, selected = false) {
  const { polygon, baseColor, geometryKind } = overlay;
  polygon.setOptions({
    fillColor: baseColor,
    fillOpacity: sectorFillOpacity(geometryKind, zoom, selected),
    strokeColor: selected && geometryKind !== "official-subscope-reference"
      ? "#0f172a"
      : strokeColor(geometryKind),
    strokeStyle: geometryKind === "reviewed-market-candidate" ? "solid" : "dashed",
    strokeWeight: selected ? 3.2 : geometryStrokeWeight(geometryKind, zoom),
    strokeOpacity: zoom >= 14 ? 0.55 : geometryKind === "demo" ? 0.7 : 0.95,
    zIndex: geometryKind === "official-subscope-reference"
      ? 23
      : geometryKind === "reviewed-market-candidate"
      ? 22
      : geometryKind === "administrative-reference"
        ? 21
        : 20,
  });
}

export function SectorLayer({
  amapApi,
  map,
  zoom,
  viewportVersion,
  viewportInteracting,
  labelMode,
  labelMinZoom,
  selectedSectorId,
  onSelect,
}: SectorLayerProps) {
  const overlaysRef = useRef<SectorOverlay[]>([]);
  const polygonGroupRef = useRef<AMap.OverlayGroup | null>(null);
  const [overlayVersion, setOverlayVersion] = useState(0);
  const onSelectRef = useRef(onSelect);
  const zoomRef = useRef(zoom);
  const labelModeRef = useRef(labelMode);
  const labelMinZoomRef = useRef(labelMinZoom);
  const selectedSectorIdRef = useRef(selectedSectorId);
  const styleZoom = Math.floor(zoom);
  const setSectorGeometryLoading = useMapStore((state) => state.setSectorGeometryLoading);
  const setSectorGeometryFallback = useMapStore((state) => state.setSectorGeometryFallback);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    labelModeRef.current = labelMode;
    labelMinZoomRef.current = labelMinZoom;
  }, [labelMinZoom, labelMode]);

  useEffect(() => {
    selectedSectorIdRef.current = selectedSectorId;
  }, [selectedSectorId]);

  useEffect(() => {
    let cancelled = false;
    const overlays: SectorOverlay[] = [];
    let researchGeometries: SectorResearchGeometryFeature[] = [];
    const polygonGroup = new amapApi.OverlayGroup();
    polygonGroupRef.current = polygonGroup;
    const settledResearchIds = new Set<string>();

    const bindOverlayInteractions = (overlay: SectorOverlay) => {
      const { polygon, label, sector } = overlay;
      const highlight = () => {
        if (overlay.hoverLeaveTimer) {
          clearTimeout(overlay.hoverLeaveTimer);
          overlay.hoverLeaveTimer = null;
        }
        polygon.setOptions({
          fillOpacity: 0.48,
          strokeWeight: 3,
          strokeColor: strokeColor(overlay.geometryKind),
        });
        if (
          label
          && !overlay.labelMounted
          && shouldMountSectorLabel({
            mode: labelModeRef.current,
            zoom: zoomRef.current,
            minZoom: labelMinZoomRef.current,
            hovered: true,
          })
        ) {
          label.show();
          map.add(label);
          overlay.labelMounted = true;
        }
      };
      const restore = () => {
        if (overlay.hoverLeaveTimer) clearTimeout(overlay.hoverLeaveTimer);
        overlay.hoverLeaveTimer = setTimeout(() => {
          overlay.hoverLeaveTimer = null;
          applyOverlayStyle(
            overlay,
            zoomRef.current,
            selectedSectorIdRef.current === sector.properties.id,
          );
          if (labelModeRef.current === "hover" && label && overlay.labelMounted) {
            map.remove(label);
            overlay.labelMounted = false;
          }
        }, 90);
      };
      polygon.on("mouseover", highlight);
      polygon.on("mouseout", restore);
      polygon.on("click", () => onSelectRef.current(sector));
    };

    const createOverlays = async () => {
      const geometryCatalogPromise = import(
        "@/src/data/sector-geometry-catalog"
      );
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
        const activeGeometry = sectorCatalog.resolveActiveLocation(sector.properties.id);
        const initialLabelPosition = activeGeometry?.kind === "market-demo"
          ? activeGeometry.center
          : sector.properties.center;
        const label = new amapApi.Text({
          text: sector.properties.name,
          position: initialLabelPosition,
          anchor: "center",
          zIndex: 25,
          clickable: false,
          style: labelStyle("demo"),
        });

        const overlay: SectorOverlay = {
          polygon,
          label,
          baseColor,
          sector,
          geometryKind: "demo",
          hiddenLegacyDemo: !sectorCatalog.getReviewedCandidateIndex(
            sector.properties.id,
          ),
          labelMounted: shouldMountSectorLabel({
            mode: labelModeRef.current,
            zoom: zoomRef.current,
            minZoom: labelMinZoomRef.current,
          }),
          hoverLeaveTimer: null,
        };
        applyOverlayStyle(
          overlay,
          zoomRef.current,
          selectedSectorIdRef.current === sector.properties.id,
        );
        bindOverlayInteractions(overlay);
        map.add(overlay.labelMounted ? [polygon, label] : polygon);
        if (overlay.hiddenLegacyDemo) {
          polygon.hide();
          map.remove(label);
          overlay.labelMounted = false;
        }
        overlays.push(overlay);
      }
      overlaysRef.current = overlays;

      const { sectorGeometryCatalog } = await geometryCatalogPromise;
      if (cancelled) return;
      const reviewedCandidates = sectorGeometryCatalog.reviewedCandidates;
      const candidateOnlyReviewedCandidates = reviewedCandidates.filter(
        (feature) => !sectorCatalog.hasLegacyFeature(feature.properties.id),
      );
      const subscopes = sectorGeometryCatalog.subscopes;
      const adminReferences = sectorGeometryCatalog.administrativeReferences;
      const reviewedCandidateById = new Map(
        reviewedCandidates.map((feature) => [feature.properties.id, feature]),
      );
      const adminReferenceById = new Map(
        adminReferences.map((feature) => [feature.properties.id, feature]),
      );
      researchGeometries = [...reviewedCandidates, ...adminReferences];
      const researchLabelCenters = researchGeometries.map((feature) => ({
        key: `${feature.properties.status}:${feature.properties.id}`,
        center: feature.properties.labelPoint,
      }));
      candidateOnlyReviewedCandidates.forEach((candidate) => {
        setSectorGeometryFallback(candidate.properties.id, false);
        setSectorGeometryLoading(candidate.properties.id, true);
      });

      const researchPathRequestByKey = new Map(researchGeometries.map((feature) => [
        `${feature.properties.status}:${feature.properties.id}`,
        wgs84GeometryToDisplayPath(
          amapApi,
          simplifySectorGeometryForDisplay(feature.geometry),
        ),
      ]));

      const displayLabelByGeometryKey = new Map<string, AMap.LngLat>();
      try {
        const displayLabelPositions = await wgs84PointsToDisplayPositions(
          amapApi,
          researchLabelCenters.map((item) => item.center),
        );
        researchLabelCenters.forEach((item, index) => {
          displayLabelByGeometryKey.set(item.key, displayLabelPositions[index]);
        });
      } catch (error) {
        if (cancelled) return;
        console.warn("候选面标签坐标转换失败，已回退到原板块中心", error);
      }

      for (const marketOverlay of [...overlays]) {
        const id = marketOverlay.sector.properties.id;
        const reviewedCandidate = reviewedCandidateById.get(id);
        const adminReference = adminReferenceById.get(id);
        const researchGeometry = reviewedCandidate ?? adminReference;
        if (!researchGeometry) continue;
        const geometryKind: SectorGeometryKind = reviewedCandidate
          ? "reviewed-market-candidate"
          : "administrative-reference";
        try {
          const pathRequest = researchPathRequestByKey.get(
            `${researchGeometry.properties.status}:${id}`,
          );
          if (!pathRequest) throw new Error(`${id} 缺少研究几何显示路径`);
          const path: DisplayPath = await pathRequest;
          if (cancelled) return;
          if (reviewedCandidate) {
            marketOverlay.geometryKind = geometryKind;
            marketOverlay.polygon.setPath(path);
            polygonGroup.addOverlay(marketOverlay.polygon);
            const displayLabel = displayLabelByGeometryKey.get(
              `${reviewedCandidate.properties.status}:${id}`,
            );
            if (displayLabel) marketOverlay.label?.setPosition(displayLabel.toArray());
            marketOverlay.label?.setStyle(labelStyle(geometryKind));
            applyOverlayStyle(
              marketOverlay,
              zoomRef.current,
              selectedSectorIdRef.current === id,
            );
          } else {
            if (!adminReference) continue;
            const polygon = new amapApi.Polygon();
            polygon.setOptions({ path, cursor: "pointer" });
            const displayLabel = displayLabelByGeometryKey.get(
              `${adminReference.properties.status}:${id}`,
            );
            const label = new amapApi.Text({
              text: marketOverlay.sector.properties.name,
              position: displayLabel?.toArray() ?? marketOverlay.sector.properties.center,
              anchor: "center",
              zIndex: 24,
              clickable: false,
              style: labelStyle("administrative-reference"),
            });
            const administrativeOverlay: SectorOverlay = {
              polygon,
              label,
              baseColor: "#60a5fa",
              sector: marketOverlay.sector,
              geometryKind,
              hiddenLegacyDemo: false,
              labelMounted: shouldMountSectorLabel({
                mode: labelModeRef.current,
                zoom: zoomRef.current,
                minZoom: labelMinZoomRef.current,
              }),
              hoverLeaveTimer: null,
            };
            applyOverlayStyle(
              administrativeOverlay,
              zoomRef.current,
              selectedSectorIdRef.current === id,
            );
            bindOverlayInteractions(administrativeOverlay);
            map.add(administrativeOverlay.labelMounted ? [polygon, label] : polygon);
            polygonGroup.addOverlay(polygon);
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
          if (!reviewedCandidate) {
            marketOverlay.hiddenLegacyDemo = false;
            marketOverlay.polygon.show();
            applyOverlayStyle(
              marketOverlay,
              zoomRef.current,
              selectedSectorIdRef.current === id,
            );
          }
          console.warn(`${marketOverlay.sector.properties.name}${layerName}坐标转换失败，已保留灰色虚线演示面`, error);
        }
      }

      for (const [index, reviewedCandidate] of candidateOnlyReviewedCandidates.entries()) {
        const id = reviewedCandidate.properties.id;
        const sector = sectorCatalog.getFeature(id);
        if (!sector) {
          settledResearchIds.add(id);
          setSectorGeometryLoading(id, false);
          console.warn(`候选面 ${id} 缺少可交互板块入口`);
          continue;
        }
        try {
          const pathRequest = researchPathRequestByKey.get(
            `${reviewedCandidate.properties.status}:${id}`,
          );
          if (!pathRequest) throw new Error(`${id} 缺少候选面显示路径`);
          const path: DisplayPath = await pathRequest;
          if (cancelled) return;
          const polygon = new amapApi.Polygon();
          polygon.setOptions({ path, cursor: "pointer" });
          const label = new amapApi.Text({
            text: sector.properties.name,
            position: displayLabelByGeometryKey.get(
              `${reviewedCandidate.properties.status}:${id}`,
            )?.toArray()
              ?? sector.properties.center,
            anchor: "center",
            zIndex: 25,
            clickable: false,
            style: labelStyle("reviewed-market-candidate"),
          });
          const overlay: SectorOverlay = {
            polygon,
            label,
            baseColor: palette[(sectors.length + index) % palette.length],
            sector,
            geometryKind: "reviewed-market-candidate",
            hiddenLegacyDemo: false,
            labelMounted: shouldMountSectorLabel({
              mode: labelModeRef.current,
              zoom: zoomRef.current,
              minZoom: labelMinZoomRef.current,
            }),
            hoverLeaveTimer: null,
          };
          applyOverlayStyle(
            overlay,
            zoomRef.current,
            selectedSectorIdRef.current === id,
          );
          bindOverlayInteractions(overlay);
          map.add(overlay.labelMounted ? [polygon, label] : polygon);
          polygonGroup.addOverlay(polygon);
          overlays.push(overlay);
          settledResearchIds.add(id);
          setSectorGeometryLoading(id, false);
          setSectorGeometryFallback(id, false);
        } catch (error) {
          if (cancelled) return;
          settledResearchIds.add(id);
          setSectorGeometryLoading(id, false);
          setSectorGeometryFallback(id, false);
          console.warn(`${sector.properties.name}候选面坐标转换失败，当前无法显示`, error);
        }
      }

      for (const subscope of subscopes) {
        const parentSector = sectorCatalog.getFeature(subscope.properties.parentSectorId);
        if (!parentSector) {
          console.warn(`子范围 ${subscope.properties.id} 缺少主板块 ${subscope.properties.parentSectorId}`);
          continue;
        }
        try {
          const path = await wgs84GeometryToDisplayPath(
            amapApi,
            simplifySectorGeometryForDisplay(subscope.geometry),
          );
          if (cancelled) return;
          const polygon = new amapApi.Polygon();
          polygon.setOptions({ path, cursor: "pointer" });
          const overlay: SectorOverlay = {
            polygon,
            label: null,
            baseColor: "#f59e0b",
            sector: parentSector,
            geometryKind: "official-subscope-reference",
            hiddenLegacyDemo: false,
            labelMounted: false,
            hoverLeaveTimer: null,
          };
          applyOverlayStyle(
            overlay,
            zoomRef.current,
            selectedSectorIdRef.current === parentSector.properties.id,
          );
          bindOverlayInteractions(overlay);
          map.add(polygon);
          polygonGroup.addOverlay(polygon);
          overlays.push(overlay);
        } catch (error) {
          if (cancelled) return;
          console.warn(`${subscope.properties.name}子范围坐标转换失败`, error);
        }
      }
      if (!cancelled) {
        overlaysRef.current = overlays;
        setOverlayVersion((version) => version + 1);
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
      overlays.forEach(({ polygon, label, hoverLeaveTimer }) => {
        if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer);
        map.remove(label ? [polygon, label] : polygon);
      });
      overlaysRef.current = [];
      polygonGroupRef.current = null;
    };
  }, [amapApi, map, setSectorGeometryFallback, setSectorGeometryLoading]);

  useEffect(() => {
    const polygonGroup = polygonGroupRef.current;
    if (!polygonGroup) return;
    if (viewportInteracting) polygonGroup.hide();
    else polygonGroup.show();
  }, [viewportInteracting]);

  useEffect(() => {
    overlaysRef.current.forEach((overlay) => {
      if (overlay.hiddenLegacyDemo) {
        overlay.polygon.hide();
        return;
      }
      applyOverlayStyle(
        overlay,
        styleZoom,
        overlay.sector.properties.id === selectedSectorId,
      );
    });
  }, [overlayVersion, selectedSectorId, styleZoom]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const labelCellWidth = zoom < 11.5 ? 94 : 82;
      const labelCellHeight = 38;
      const mapSize = map.getSize();
      const occupiedCells = new Set<string>();
      const orderedOverlays = [...overlaysRef.current].sort((left, right) => {
        const leftSelected = left.sector.properties.id === selectedSectorId ? 1 : 0;
        const rightSelected = right.sector.properties.id === selectedSectorId ? 1 : 0;
        return rightSelected - leftSelected;
      });

      orderedOverlays.forEach((overlay) => {
        const { label, polygon, sector } = overlay;
        if (overlay.hiddenLegacyDemo) {
          polygon.hide();
          if (label && overlay.labelMounted) {
            map.remove(label);
            overlay.labelMounted = false;
          }
          return;
        }
        const selected = sector.properties.id === selectedSectorId;
        if (!label) return;

        let shouldShow = shouldMountSectorLabel({
          mode: labelMode,
          zoom,
          minZoom: labelMinZoom,
        });
        const position = label.getPosition();
        if (shouldShow && position) {
          const pixel = map.lngLatToContainer(position);
          const x = pixel.getX();
          const y = pixel.getY();
          const inViewport = x >= 0
            && y >= 0
            && x <= mapSize.getWidth()
            && y <= mapSize.getHeight();
          if (!inViewport) {
            shouldShow = false;
          } else {
            const cell = `${Math.floor(x / labelCellWidth)}:${Math.floor(y / labelCellHeight)}`;
            if (!selected && occupiedCells.has(cell)) shouldShow = false;
            else occupiedCells.add(cell);
          }
        }
        if (shouldShow === overlay.labelMounted) return;
        if (shouldShow) {
          label.show();
          map.add(label);
        } else {
          map.remove(label);
        }
        overlay.labelMounted = shouldShow;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    labelMinZoom,
    labelMode,
    map,
    overlayVersion,
    selectedSectorId,
    viewportVersion,
    zoom,
  ]);

  return null;
}
