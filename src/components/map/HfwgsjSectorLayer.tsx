"use client";

import { useEffect, useRef, useState } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import {
  getSnapshotDisplayFeatures,
  isPlaceholderSectorName,
  normalizeSectorSnapshotName,
  parseHfwgsjSectorSnapshot,
  type HfwgsjSectorSnapshotFeature,
} from "@/src/lib/hfwgsj-sector-snapshot";
import { simplifySectorGeometryForDisplay } from "@/src/lib/sector-display-lod";
import {
  shouldMountSectorLabel,
  type SectorLabelMode,
} from "@/src/lib/sector-label-visibility";
import type { SectorFeature } from "@/src/types/map";
import {
  useMapStore,
  type SectorBoundarySource,
} from "@/src/store/map-store";
import { nativeGeometryToDisplayPath } from "./amap-coordinate-conversion";

type PrivateSnapshotSource = Exclude<SectorBoundarySource, "project">;

interface PrivateSectorLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  source: PrivateSnapshotSource;
  zoom: number;
  viewportVersion: number;
  viewportInteracting: boolean;
  labelMode: SectorLabelMode;
  labelMinZoom: number;
  selectedSectorId: string | null;
  onSelect: (sector: SectorFeature) => void;
}

interface SnapshotOverlay {
  polygon: AMap.Polygon;
  label: AMap.Text | null;
  matchedSector: SectorFeature | null;
  labelMounted: boolean;
  hoverLeaveTimer: ReturnType<typeof setTimeout> | null;
  palette: SnapshotPalette;
  districtOutlineDifference: boolean;
}

type SnapshotStatus =
  | { state: "loading"; count: 0 }
  | { state: "ready"; count: number }
  | { state: "error"; count: 0 };

interface SnapshotPalette {
  fill: string;
  stroke: string;
  selectedStroke: string;
  label: string;
  labelBorder: string;
}

const snapshotConfigs: Record<PrivateSnapshotSource, {
  label: string;
  url: string;
  palette: SnapshotPalette;
}> = {
  "hfwgsj-private": {
    label: "微观世界私有快照",
    url: "/api/local-sector-snapshot?source=hfwgsj-private",
    palette: {
      fill: "#8b5cf6",
      stroke: "#7c3aed",
      selectedStroke: "#312e81",
      label: "#5b21b6",
      labelBorder: "rgba(124, 58, 237, .28)",
    },
  },
  "anjuke-private": {
    label: "安居客研究快照",
    url: "/api/local-sector-snapshot?source=anjuke-private",
    palette: {
      fill: "#f97316",
      stroke: "#ea580c",
      selectedStroke: "#9a3412",
      label: "#c2410c",
      labelBorder: "rgba(234, 88, 12, .3)",
    },
  },
  "fang-private": {
    label: "房天下研究快照",
    url: "/api/local-sector-snapshot?source=fang-private",
    palette: {
      fill: "#2563eb",
      stroke: "#1d4ed8",
      selectedStroke: "#1e3a8a",
      label: "#1d4ed8",
      labelBorder: "rgba(37, 99, 235, .28)",
    },
  },
  "realtynavi-private": {
    label: "RealtyNavi 授权研究快照",
    url: "/api/local-sector-snapshot?source=realtynavi-private",
    palette: {
      fill: "#e11d48",
      stroke: "#be123c",
      selectedStroke: "#881337",
      label: "#be123c",
      labelBorder: "rgba(190, 18, 60, .28)",
    },
  },
};

const snapshotSectorByName = new Map<string, SectorFeature>();
for (const record of sectorCatalog.registry) {
  const sector = sectorCatalog.getFeature(record.id);
  if (!sector) continue;
  for (const name of [record.canonicalName, ...record.aliases]) {
    snapshotSectorByName.set(normalizeSectorSnapshotName(name), sector);
  }
}

function snapshotLabelStyle(
  districtOutlineDifference: boolean,
  palette: SnapshotPalette,
) {
  return {
    padding: "5px 9px",
    borderRadius: "999px",
    border: `1px solid ${districtOutlineDifference
      ? "rgba(100, 116, 139, .24)"
      : palette.labelBorder}`,
    background: "rgba(255,255,255,.92)",
    color: districtOutlineDifference ? "#475569" : palette.label,
    fontSize: "12px",
    fontWeight: "700",
    boxShadow: "0 5px 16px rgba(15,23,42,.12)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  };
}

function applySnapshotStyle(
  overlay: SnapshotOverlay,
  zoom: number,
  selected: boolean,
) {
  const { palette, districtOutlineDifference } = overlay;
  const baseOpacity = zoom >= 14
    ? 0.025
    : zoom >= 12
      ? Math.max(0.05, 0.22 - (zoom - 12) * 0.085)
      : Math.min(0.32, 0.16 + (12 - zoom) * 0.08);
  overlay.polygon.setOptions({
    fillColor: districtOutlineDifference ? "#94a3b8" : palette.fill,
    fillOpacity: selected ? Math.max(baseOpacity, 0.22) : baseOpacity,
    strokeColor: selected
      ? palette.selectedStroke
      : districtOutlineDifference
        ? "#64748b"
        : palette.stroke,
    strokeStyle: districtOutlineDifference ? "dashed" : "solid",
    strokeWeight: selected ? 3.2 : zoom >= 13 ? 1.4 : 2,
    strokeOpacity: zoom >= 14 ? 0.56 : 0.9,
    zIndex: selected ? 25 : districtOutlineDifference ? 22 : 23,
  });
}

function matchedSectorFor(feature: HfwgsjSectorSnapshotFeature) {
  return snapshotSectorByName.get(
    normalizeSectorSnapshotName(feature.properties.name),
  ) ?? null;
}

export function PrivateSectorLayer({
  amapApi,
  map,
  source,
  zoom,
  viewportVersion,
  viewportInteracting,
  labelMode,
  labelMinZoom,
  selectedSectorId,
  onSelect,
}: PrivateSectorLayerProps) {
  const config = snapshotConfigs[source];
  const showRealtynaviDistrictOutlineDifferences = useMapStore(
    (state) => state.showRealtynaviDistrictOutlineDifferences,
  );
  const overlaysRef = useRef<SnapshotOverlay[]>([]);
  const polygonGroupRef = useRef<AMap.OverlayGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  const zoomRef = useRef(zoom);
  const labelModeRef = useRef(labelMode);
  const labelMinZoomRef = useRef(labelMinZoom);
  const selectedSectorIdRef = useRef(selectedSectorId);
  const [overlayVersion, setOverlayVersion] = useState(0);
  const [status, setStatus] = useState<SnapshotStatus>({
    state: "loading",
    count: 0,
  });
  const [snapshotMeta, setSnapshotMeta] = useState<{
    directoryCount: number;
    namedCount: number;
    districtOutlineDifferenceCount: number;
    missingCount: number;
    coordinateNote: string;
  } | null>(null);
  const statusLabel = status.state === "loading"
    ? "正在载入私有板块快照…"
    : status.state === "error"
      ? "私有板块快照不可用"
      : snapshotMeta?.districtOutlineDifferenceCount
        ? `${config.label} · ${snapshotMeta.namedCount} 个命名板块${showRealtynaviDistrictOutlineDifferences ? ` · 已显示 ${snapshotMeta.districtOutlineDifferenceCount} 个区级外轮廓差异参考面` : ""}`
        : `${config.label} · ${status.count} / ${snapshotMeta?.directoryCount ?? status.count} 个边界`;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    zoomRef.current = zoom;
    selectedSectorIdRef.current = selectedSectorId;
  }, [selectedSectorId, zoom]);

  useEffect(() => {
    labelModeRef.current = labelMode;
    labelMinZoomRef.current = labelMinZoom;
  }, [labelMinZoom, labelMode]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const overlays: SnapshotOverlay[] = [];
    const polygonGroup = new amapApi.OverlayGroup();
    polygonGroupRef.current = polygonGroup;

    const loadSnapshot = async () => {
      setStatus({ state: "loading", count: 0 });
      setSnapshotMeta(null);
      const response = await fetch(config.url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`私有板块快照加载失败：${response.status}`);
      const snapshot = parseHfwgsjSectorSnapshot(await response.json());
      setSnapshotMeta({
        directoryCount: snapshot.metadata.directory_count ?? snapshot.features.length,
        namedCount: snapshot.metadata.named_feature_count ?? snapshot.features.length,
        districtOutlineDifferenceCount:
          snapshot.metadata.district_outline_difference_feature_count ?? 0,
        missingCount: snapshot.metadata.missing_geometry_count ?? 0,
        coordinateNote: snapshot.metadata.coordinate_note,
      });

      const displayFeatures = getSnapshotDisplayFeatures(snapshot.features, {
        includeDistrictOutlineDifferences: (
          source === "realtynavi-private"
          && showRealtynaviDistrictOutlineDifferences
        ),
      });
      for (const feature of displayFeatures) {
        const matchedSector = matchedSectorFor(feature);
        const districtOutlineDifference = (
          feature.properties.classification === "district_outline_difference"
        );
        const path = await nativeGeometryToDisplayPath(
          amapApi,
          simplifySectorGeometryForDisplay(feature.geometry),
        );
        if (cancelled) return;

        const polygon = new amapApi.Polygon();
        polygon.setOptions({
          path,
          cursor: matchedSector ? "pointer" : "default",
        });
        const shouldLabel = (
          feature.properties.centroid
          && !isPlaceholderSectorName(feature.properties.name)
        );
        const label = shouldLabel
          ? new amapApi.Text({
            text: feature.properties.name,
            position: feature.properties.centroid!,
            anchor: "center",
            zIndex: 26,
            clickable: false,
            style: snapshotLabelStyle(
              districtOutlineDifference,
              config.palette,
            ),
          })
          : null;
        const overlay: SnapshotOverlay = {
          polygon,
          label,
          matchedSector,
          labelMounted: Boolean(label) && shouldMountSectorLabel({
            mode: labelModeRef.current,
            zoom: zoomRef.current,
            minZoom: labelMinZoomRef.current,
          }),
          hoverLeaveTimer: null,
          palette: config.palette,
          districtOutlineDifference,
        };
        applySnapshotStyle(
          overlay,
          zoomRef.current,
          matchedSector?.properties.id === selectedSectorIdRef.current,
        );

        if (matchedSector) {
          polygon.on("mouseover", () => {
            if (overlay.hoverLeaveTimer) {
              clearTimeout(overlay.hoverLeaveTimer);
              overlay.hoverLeaveTimer = null;
            }
            polygon.setOptions({
              fillOpacity: 0.46,
              strokeColor: config.palette.selectedStroke,
              strokeWeight: 3,
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
          });
          polygon.on("mouseout", () => {
            if (overlay.hoverLeaveTimer) clearTimeout(overlay.hoverLeaveTimer);
            overlay.hoverLeaveTimer = setTimeout(() => {
              overlay.hoverLeaveTimer = null;
              applySnapshotStyle(
                overlay,
                zoomRef.current,
                matchedSector.properties.id === selectedSectorIdRef.current,
              );
              if (
                labelModeRef.current === "hover"
                && label
                && overlay.labelMounted
              ) {
                map.remove(label);
                overlay.labelMounted = false;
              }
            }, 90);
          });
          polygon.on("click", () => onSelectRef.current(matchedSector));
        }

        map.add(overlay.labelMounted && label ? [polygon, label] : polygon);
        polygonGroup.addOverlay(polygon);
        overlays.push(overlay);
      }

      if (cancelled) return;
      overlaysRef.current = overlays;
      setOverlayVersion((version) => version + 1);
      setStatus({ state: "ready", count: displayFeatures.length });
    };

    loadSnapshot().catch((error: unknown) => {
      if (cancelled || controller.signal.aborted) return;
      console.error("本地私有板块快照加载失败", error);
      setStatus({ state: "error", count: 0 });
    });

    return () => {
      cancelled = true;
      controller.abort();
      overlays.forEach(({ polygon, label, hoverLeaveTimer }) => {
        if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer);
        map.remove(label ? [polygon, label] : polygon);
      });
      overlaysRef.current = [];
      polygonGroupRef.current = null;
    };
  }, [
    amapApi,
    config,
    map,
    showRealtynaviDistrictOutlineDifferences,
    source,
  ]);

  useEffect(() => {
    const polygonGroup = polygonGroupRef.current;
    if (!polygonGroup) return;
    if (viewportInteracting) polygonGroup.hide();
    else polygonGroup.show();
  }, [viewportInteracting]);

  useEffect(() => {
    overlaysRef.current.forEach((overlay) => {
      applySnapshotStyle(
        overlay,
        zoom,
        overlay.matchedSector?.properties.id === selectedSectorId,
      );
    });
  }, [overlayVersion, selectedSectorId, zoom]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const occupiedCells = new Set<string>();
      const mapSize = map.getSize();
      const ordered = [...overlaysRef.current].sort((left, right) => {
        const leftSelected = left.matchedSector?.properties.id === selectedSectorId ? 1 : 0;
        const rightSelected = right.matchedSector?.properties.id === selectedSectorId ? 1 : 0;
        return rightSelected - leftSelected;
      });

      for (const overlay of ordered) {
        const label = overlay.label;
        if (!label) continue;
        const selected = overlay.matchedSector?.properties.id === selectedSectorId;
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
          if (
            x < 0
            || y < 0
            || x > mapSize.getWidth()
            || y > mapSize.getHeight()
          ) {
            shouldShow = false;
          } else {
            const cell = `${Math.floor(x / 86)}:${Math.floor(y / 38)}`;
            if (!selected && occupiedCells.has(cell)) shouldShow = false;
            else occupiedCells.add(cell);
          }
        }
        if (shouldShow === overlay.labelMounted) continue;
        if (shouldShow) {
          label.show();
          map.add(label);
        } else {
          map.remove(label);
        }
        overlay.labelMounted = shouldShow;
      }
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

  return (
    <div
      className={`sector-source-badge is-${status.state}`}
      role={status.state === "error" ? "alert" : "status"}
    >
      <strong>{statusLabel}</strong>
      <span>
        {status.state === "error"
          ? `请确认 ${source} 的本地文件仍存在`
          : snapshotMeta?.missingCount
            ? `GCJ-02 · ${snapshotMeta.missingCount} 个目录项无边界 · 许可未知 · 仅限私有研究`
            : `${snapshotMeta?.coordinateNote ?? "GCJ-02"} · 许可未知 · 仅限私有研究`}
      </span>
    </div>
  );
}
