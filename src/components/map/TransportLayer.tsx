"use client";

import { useEffect, useMemo, useRef } from "react";
import transportNetworkData from "@/src/data/transport-network.wgs84.json";
import { metroStationIconSvg } from "@/src/lib/category-icon-svg";
import { wgs84ToGcj02Position } from "@/src/lib/geo-coordinate-conversion";
import {
  escapeMapPinHtml,
  mapPinMarkerContent,
} from "@/src/lib/map-pin-marker";
import {
  elevatedRoadLayerStyles,
  elevatedRoadStyle,
  metroRouteColor,
  resolveTransportVisibility,
  transportPresentation,
} from "@/src/lib/transport-layer-style";

type Position = [number, number];

interface MetroLineGroup {
  id: string;
  name: string;
  route: string;
  paths: Position[][];
}

interface MetroStation {
  id: string;
  name: string;
  position: Position;
}

interface ElevatedRoadGroup {
  id: string;
  name: string;
  kind: "expressway" | "urban";
  scope: "major" | "local";
  paths: Position[][];
}

interface TransportNetworkData {
  metroLines: MetroLineGroup[];
  metroStations: MetroStation[];
  elevatedRoads: ElevatedRoadGroup[];
}

interface TransportLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  zoom: number;
  showMetro: boolean;
  showElevated: boolean;
  stationLabelMinZoom: number;
  viewportVersion: number;
}

interface TransportOverlays {
  metroLines: AMap.Polyline[];
  elevatedRoads: AMap.Polyline[];
  elevatedRoadCasings: AMap.Polyline[];
  stationMarkers: Array<{ station: MetroStation; marker: AMap.Marker }>;
}

const transportNetwork = transportNetworkData as unknown as TransportNetworkData;

function displayPaths(paths: Position[][]) {
  return paths.map((path) => path.map(wgs84ToGcj02Position));
}

function stationMarkerContent(station: MetroStation, showLabel: boolean) {
  const labelHtml = showLabel
    ? '<span class="project-label metro-station-label"><b>'
      + escapeMapPinHtml(station.name)
      + "</b></span>"
    : "";
  return mapPinMarkerContent({
    ariaLabel: `${station.name}地铁站`,
    iconSvg: metroStationIconSvg,
    labelHtml,
    variantClass: "metro-station-marker",
    pinClass: "metro-station-pin",
  });
}

export function TransportLayer({
  amapApi,
  map,
  zoom,
  showMetro,
  showElevated,
  stationLabelMinZoom,
  viewportVersion,
}: TransportLayerProps) {
  const overlaysRef = useRef<TransportOverlays | null>(null);
  const displayNetwork = useMemo(() => ({
    metroLines: transportNetwork.metroLines.map((group) => ({
      ...group,
      paths: displayPaths(group.paths),
    })),
    elevatedRoads: transportNetwork.elevatedRoads.map((group) => ({
      ...group,
      paths: displayPaths(group.paths),
    })),
    metroStations: transportNetwork.metroStations.map((station) => ({
      ...station,
      position: wgs84ToGcj02Position(station.position),
    })),
  }), []);

  useEffect(() => {
    const metroLines = displayNetwork.metroLines.map((group) => (
      new amapApi.Polyline({
        path: group.paths,
        strokeColor: metroRouteColor(group.route),
        strokeOpacity: group.route === "network" ? 0.48 : 0.88,
        strokeWeight: 3.2,
        isOutline: true,
        outlineColor: "rgba(255,255,255,.92)",
        borderWeight: 1.4,
        lineJoin: "round",
        lineCap: "round",
        zIndex: group.route === "network" ? 78 : 82,
        bubble: true,
        extData: { id: group.id, kind: "metro-line", name: group.name },
      })
    ));
    const elevatedRoadCasings = displayNetwork.elevatedRoads.map((group) => {
      const style = elevatedRoadStyle(group.kind);
      const layers = elevatedRoadLayerStyles(group.kind, style.strokeWeight);
      return new amapApi.Polyline({
        path: group.paths,
        ...layers.casing,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 68,
        bubble: true,
        extData: { id: group.id, kind: "elevated-road-casing", name: group.name },
      });
    });
    const elevatedRoads = displayNetwork.elevatedRoads.map((group) => {
      const style = elevatedRoadStyle(group.kind);
      const layers = elevatedRoadLayerStyles(group.kind, style.strokeWeight);
      return new amapApi.Polyline({
        path: group.paths,
        ...layers.foreground,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 72,
        bubble: true,
        extData: { id: group.id, kind: "elevated-road", name: group.name },
      });
    });
    const stationMarkers = displayNetwork.metroStations.map((station) => ({
      station,
      marker: new amapApi.Marker({
        position: station.position,
        content: stationMarkerContent(station, false),
        anchor: "bottom-center",
        zIndex: 140,
      }),
    }));

    overlaysRef.current = {
      metroLines,
      elevatedRoadCasings,
      elevatedRoads,
      stationMarkers,
    };
    return () => {
      map.remove([
        ...metroLines,
        ...elevatedRoadCasings,
        ...elevatedRoads,
        ...stationMarkers.map(({ marker }) => marker),
      ]);
      overlaysRef.current = null;
    };
  }, [amapApi, displayNetwork, map]);

  useEffect(() => {
    const overlays = overlaysRef.current;
    if (!overlays) return;
    const presentation = transportPresentation(zoom, stationLabelMinZoom);
    const visibility = resolveTransportVisibility(presentation, {
      showMetro,
      showElevated,
    });

    for (const [index, line] of overlays.metroLines.entries()) {
      const route = displayNetwork.metroLines[index]?.route ?? "network";
      line.setOptions({
        strokeWeight: presentation.metroStrokeWeight,
        strokeOpacity: route === "network" ? 0.48 : 0.88,
      });
      if (visibility.metroLines) {
        line.show();
        map.add(line);
      } else {
        map.remove(line);
      }
    }
    for (const [index, casing] of overlays.elevatedRoadCasings.entries()) {
      const kind = displayNetwork.elevatedRoads[index]?.kind ?? "expressway";
      const scope = displayNetwork.elevatedRoads[index]?.scope ?? "major";
      const strokeWeight = presentation.elevatedStrokeWeight
        + (kind === "urban" ? 0.8 : 0);
      const layers = elevatedRoadLayerStyles(kind, strokeWeight);
      const visible = scope === "major"
        ? visibility.elevatedRoads
        : visibility.localElevatedRoads;
      casing.setOptions(layers.casing);
      if (visible) {
        casing.show();
        map.add(casing);
      } else {
        map.remove(casing);
      }
    }
    for (const [index, road] of overlays.elevatedRoads.entries()) {
      const kind = displayNetwork.elevatedRoads[index]?.kind ?? "expressway";
      const scope = displayNetwork.elevatedRoads[index]?.scope ?? "major";
      const strokeWeight = presentation.elevatedStrokeWeight
        + (kind === "urban" ? 0.8 : 0);
      const layers = elevatedRoadLayerStyles(kind, strokeWeight);
      const visible = scope === "major"
        ? visibility.elevatedRoads
        : visibility.localElevatedRoads;
      road.setOptions(layers.foreground);
      if (visible) {
        road.show();
        map.add(road);
      } else {
        map.remove(road);
      }
    }
    const bounds = visibility.metroStationLabels ? map.getBounds() : null;
    for (const { station, marker } of overlays.stationMarkers) {
      if (visibility.metroStations) {
        marker.setContent(stationMarkerContent(
          station,
          Boolean(bounds?.contains(station.position)),
        ));
        marker.show();
        map.add(marker);
      } else {
        map.remove(marker);
      }
    }
  }, [
    displayNetwork,
    map,
    showElevated,
    showMetro,
    stationLabelMinZoom,
    viewportVersion,
    zoom,
  ]);

  return null;
}
