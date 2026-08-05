"use client";

import { useCallback, useEffect, useRef } from "react";
import { gcj02ToWgs84Position } from "@/src/lib/geo-coordinate-conversion";
import {
  findPlanningParcelAt,
  loadPlanningParcels,
  planningReferenceSource,
  resolvePlanningParcelStyle,
  type PlanningParcel,
} from "@/src/lib/planning-reference-layer";
import { wgs84GeometryToDisplayPath } from "./amap-coordinate-conversion";

interface PlanningReferenceLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  zoom: number;
  viewportVersion: number;
  visible: boolean;
  opacity: number;
  minimumZoom: number;
}

function addDetailRow(list: HTMLDListElement, label: string, value: string | null) {
  if (!value) return;
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  list.append(term, detail);
}

function planningInfoContent(parcel: PlanningParcel, queriedAt: string) {
  const content = document.createElement("article");
  content.className = "planning-info-window";

  const eyebrow = document.createElement("span");
  eyebrow.className = "planning-info-eyebrow";
  eyebrow.textContent = "官方详细规划·参考";

  const heading = document.createElement("strong");
  heading.textContent = parcel.landUseName ?? parcel.landUseCode ?? "规划地块";

  const details = document.createElement("dl");
  addDetailRow(details, "用地代码", parcel.landUseCode);
  addDetailRow(details, "地块编号", parcel.plotNumber);
  addDetailRow(
    details,
    "用地面积",
    parcel.landAreaSquareMeters === null
      ? null
      : `${Math.round(parcel.landAreaSquareMeters).toLocaleString("zh-CN")} ㎡`,
  );
  addDetailRow(details, "规划项目", parcel.projectName);
  addDetailRow(details, "批准文号", parcel.approvalNumber);
  addDetailRow(
    details,
    "查询时间",
    new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(queriedAt)),
  );

  const source = document.createElement("a");
  source.href = planningReferenceSource.url;
  source.target = "_blank";
  source.rel = "noreferrer";
  source.textContent = planningReferenceSource.name;

  content.append(eyebrow, heading, details, source);
  return content;
}

function sourceBoundsForMap(map: AMap.Map) {
  const bounds = map.getBounds();
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  const [west, south] = gcj02ToWgs84Position([
    southWest.getLng(),
    southWest.getLat(),
  ]);
  const [east, north] = gcj02ToWgs84Position([
    northEast.getLng(),
    northEast.getLat(),
  ]);
  return { west, south, east, north };
}

export function PlanningReferenceLayer({
  amapApi,
  map,
  zoom,
  viewportVersion,
  visible,
  opacity,
  minimumZoom,
}: PlanningReferenceLayerProps) {
  const overlaysRef = useRef<AMap.Polygon[]>([]);
  const parcelsRef = useRef<PlanningParcel[]>([]);
  const queriedAtRef = useRef("");
  const infoWindowRef = useRef<AMap.InfoWindow | null>(null);
  const opacityRef = useRef(opacity);

  const clearOverlays = useCallback(() => {
    if (overlaysRef.current.length) map.remove(overlaysRef.current);
    overlaysRef.current = [];
    parcelsRef.current = [];
    queriedAtRef.current = "";
    infoWindowRef.current?.close();
  }, [map]);

  useEffect(() => {
    opacityRef.current = opacity;
    overlaysRef.current.forEach((polygon) => {
      polygon.setOptions({
        fillOpacity: opacity,
        strokeOpacity: Math.min(0.88, opacity + 0.3),
      });
    });
  }, [opacity]);

  const openParcel = useCallback((
    parcel: PlanningParcel,
    queriedAt: string,
    position: [number, number],
  ) => {
    const infoWindow = infoWindowRef.current ?? new amapApi.InfoWindow({
      autoMove: true,
      closeWhenClickMap: true,
      anchor: "bottom-center",
    });
    infoWindowRef.current = infoWindow;
    infoWindow.setContent(planningInfoContent(parcel, queriedAt));
    infoWindow.open(map, position);
  }, [amapApi, map]);

  useEffect(() => {
    if (!visible || zoom < minimumZoom) return;
    const container = map.getContainer();
    const handleMapContainerClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element
        && target.closest(".amap-marker, .amap-info-window, .amap-info-content")
      ) return;
      const bounds = container.getBoundingClientRect();
      const displayPosition = map.containerToLngLat([
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      ]);
      const sourcePosition = gcj02ToWgs84Position([
        displayPosition.getLng(),
        displayPosition.getLat(),
      ]);
      const parcel = findPlanningParcelAt(parcelsRef.current, sourcePosition);
      if (!parcel || !queriedAtRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      openParcel(parcel, queriedAtRef.current, displayPosition.toArray());
    };
    container.addEventListener("click", handleMapContainerClick, true);
    return () => {
      container.removeEventListener("click", handleMapContainerClick, true);
    };
  }, [map, minimumZoom, openParcel, visible, zoom]);

  useEffect(() => {
    if (!visible) {
      clearOverlays();
      return;
    }
    if (zoom < minimumZoom) {
      clearOverlays();
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      const result = await loadPlanningParcels(
        sourceBoundsForMap(map),
        fetch,
        controller.signal,
      );
      if (cancelled) return;
      if (result.status === "unavailable") {
        clearOverlays();
        return;
      }

      const nextOverlays = await Promise.all(result.parcels.map(async (parcel) => {
        const path = await wgs84GeometryToDisplayPath(amapApi, parcel.geometry);
        const parcelStyle = resolvePlanningParcelStyle(parcel);
        const polygon = new amapApi.Polygon();
        polygon.setOptions({
          path,
          zIndex: 9,
          bubble: false,
          cursor: "pointer",
          strokeColor: parcelStyle.strokeColor,
          strokeWeight: 1.15,
          strokeOpacity: Math.min(0.88, opacityRef.current + 0.3),
          fillColor: parcelStyle.fillColor,
          fillOpacity: opacityRef.current,
        });
        return polygon;
      }));

      if (cancelled) {
        map.remove(nextOverlays);
        return;
      }
      clearOverlays();
      overlaysRef.current = nextOverlays;
      parcelsRef.current = result.parcels;
      queriedAtRef.current = result.queriedAt;
      if (nextOverlays.length) map.add(nextOverlays);
    };

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    amapApi,
    clearOverlays,
    map,
    minimumZoom,
    viewportVersion,
    visible,
    zoom,
  ]);

  useEffect(() => () => {
    clearOverlays();
    infoWindowRef.current = null;
  }, [clearOverlays]);

  return null;
}
