const DEFAULT_AMAP_STYLE_URL = "amap://styles/whitesmoke";
const METRO_ROUTE_COLORS: Record<string, string> = {
  "1": "#e3002b",
  "2": "#77c043",
  "3": "#f5c400",
  "3-4": "#d6a62f",
  "4": "#5a2b81",
  "5": "#a72879",
  "6": "#d40068",
  "7": "#f58220",
  "8": "#008e9c",
  "9": "#69bde2",
  "10": "#a98cc1",
  "11": "#871c2b",
  "12": "#007a60",
  "13": "#df8eb5",
  "14": "#827a04",
  "15": "#b89462",
  "16": "#20b9b5",
  "17": "#9c8466",
  "18": "#a64f37",
  network: "#5161a8",
};

export interface TransportPresentation {
  showMetroLines: boolean;
  showElevatedRoads: boolean;
  showLocalElevatedRoads: boolean;
  showMetroStations: boolean;
  showMetroStationLabels: boolean;
  metroStrokeWeight: number;
  elevatedStrokeWeight: number;
}

export interface TransportVisibility {
  metroLines: boolean;
  metroStations: boolean;
  metroStationLabels: boolean;
  elevatedRoads: boolean;
  localElevatedRoads: boolean;
}

export interface ElevatedRoadLayerStyle {
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
  isOutline: false;
}

export function resolveAmapStyleUrl(styleId: string | undefined) {
  const normalized = styleId?.trim();
  if (!normalized) return DEFAULT_AMAP_STYLE_URL;
  return normalized.startsWith("amap://styles/")
    ? normalized
    : `amap://styles/${normalized}`;
}

export function metroRouteColor(route: string) {
  return METRO_ROUTE_COLORS[route] ?? METRO_ROUTE_COLORS.network;
}

export function elevatedRoadStyle(kind: "expressway" | "urban") {
  return kind === "urban"
    ? { strokeColor: "#d97706", strokeWeight: 2.8, strokeOpacity: 0.68 }
    : { strokeColor: "#b45309", strokeWeight: 1.7, strokeOpacity: 0.34 };
}

export function elevatedRoadLayerStyles(
  kind: "expressway" | "urban",
  strokeWeight: number,
): { casing: ElevatedRoadLayerStyle; foreground: ElevatedRoadLayerStyle } {
  const style = elevatedRoadStyle(kind);
  return {
    casing: {
      strokeColor: "#ffffff",
      strokeOpacity: 0.58,
      strokeWeight: strokeWeight + 1.8,
      isOutline: false,
    },
    foreground: {
      strokeColor: style.strokeColor,
      strokeOpacity: style.strokeOpacity,
      strokeWeight,
      isOutline: false,
    },
  };
}

export function transportPresentation(
  zoom: number,
  stationLabelMinZoom = 13.8,
): TransportPresentation {
  return {
    showMetroLines: zoom >= 9.2,
    showElevatedRoads: zoom >= 9.8,
    showLocalElevatedRoads: zoom >= 13.2,
    showMetroStations: zoom >= 13.2,
    showMetroStationLabels: zoom >= stationLabelMinZoom,
    metroStrokeWeight: zoom >= 12 ? 4.2 : 3.2,
    elevatedStrokeWeight: zoom >= 12 ? 2.6 : 1.7,
  };
}

export function resolveTransportVisibility(
  presentation: TransportPresentation,
  layers: { showMetro: boolean; showElevated: boolean },
): TransportVisibility {
  return {
    metroLines: layers.showMetro && presentation.showMetroLines,
    metroStations: layers.showMetro && presentation.showMetroStations,
    metroStationLabels:
      layers.showMetro && presentation.showMetroStationLabels,
    elevatedRoads: layers.showElevated && presentation.showElevatedRoads,
    localElevatedRoads:
      layers.showElevated && presentation.showLocalElevatedRoads,
  };
}
