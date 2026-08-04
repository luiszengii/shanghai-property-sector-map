export type PlanningGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface PlanningParcel {
  id: string;
  plotNumber: string | null;
  landAreaSquareMeters: number | null;
  landUseCode: string | null;
  landUseName: string | null;
  projectName: string | null;
  approvalNumber: string | null;
  geometry: PlanningGeometry;
}

export interface PlanningBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface PlanningLayerPreferences {
  visible: boolean;
  opacity: number;
}

export type PlanningLandUseCategory =
  | "residential"
  | "commercial"
  | "public-service"
  | "industrial-logistics"
  | "transport"
  | "utilities"
  | "green-space"
  | "water-open-space"
  | "other";

export interface PlanningParcelStyle {
  category: PlanningLandUseCategory;
  label: string;
  fillColor: string;
  strokeColor: string;
}

export type PlanningLayerStatus =
  | "idle"
  | "zoom-required"
  | "loading"
  | "ready"
  | "unavailable";

export const planningReferenceSource = {
  name: "上海市规划和自然资源局·详细规划一张图",
  url: "https://shanghai.tianditu.gov.cn/xg/map.html",
  minimumZoom: 14,
} as const;

export const planningLandUseLegend: readonly PlanningParcelStyle[] = [
  { category: "residential", label: "居住", fillColor: "#f97316", strokeColor: "#9a3412" },
  { category: "commercial", label: "商业", fillColor: "#db2777", strokeColor: "#9d174d" },
  { category: "public-service", label: "公服", fillColor: "#7c3aed", strokeColor: "#5b21b6" },
  { category: "industrial-logistics", label: "产业物流", fillColor: "#a16207", strokeColor: "#713f12" },
  { category: "transport", label: "交通", fillColor: "#0891b2", strokeColor: "#155e75" },
  { category: "utilities", label: "市政", fillColor: "#e11d48", strokeColor: "#9f1239" },
  { category: "green-space", label: "绿地", fillColor: "#16a34a", strokeColor: "#166534" },
  { category: "water-open-space", label: "水域开放", fillColor: "#2563eb", strokeColor: "#1e40af" },
  { category: "other", label: "其他", fillColor: "#64748b", strokeColor: "#334155" },
] as const;

const planningStyleByCategory = new Map(
  planningLandUseLegend.map((style) => [style.category, style]),
);

function planningStyle(category: PlanningLandUseCategory) {
  return planningStyleByCategory.get(category) ?? planningLandUseLegend.at(-1)!;
}

export function resolvePlanningParcelStyle(
  parcel: Pick<PlanningParcel, "landUseCode" | "landUseName">,
): PlanningParcelStyle {
  const code = parcel.landUseCode?.trim().toUpperCase() ?? "";
  const name = parcel.landUseName?.trim() ?? "";

  if (/绿地|公园|防护绿化|林地/.test(name) || code.startsWith("G")) {
    return planningStyle("green-space");
  }
  if (/水域|河道|农林|生态|非建设|开放空间/.test(name) || code.startsWith("E")) {
    return planningStyle("water-open-space");
  }
  if (/交通|道路|轨道|铁路|停车|广场/.test(name) || code.startsWith("S")) {
    return planningStyle("transport");
  }
  if (/市政|公用设施|供应设施|环境设施|安全设施/.test(name) || code.startsWith("U")) {
    return planningStyle("utilities");
  }
  if (/公共管理|公共服务|行政|教育|科研|医疗|文化|体育|福利/.test(name) || code.startsWith("A")) {
    return planningStyle("public-service");
  }
  if (/商业|商务|服务业|娱乐|康体|商住/.test(name) || /^[BC]/.test(code)) {
    return planningStyle("commercial");
  }
  if (/工业|仓储|物流|研发产业/.test(name) || /^[MW]/.test(code)) {
    return planningStyle("industrial-logistics");
  }
  if (/居住|住宅|社区生活/.test(name) || code.startsWith("R")) {
    return planningStyle("residential");
  }
  return planningStyle("other");
}

export function shouldPlanningLayerOwnMapClicks(visible: boolean, zoom: number) {
  return visible && zoom >= planningReferenceSource.minimumZoom;
}

export const defaultPlanningLayerPreferences: PlanningLayerPreferences = {
  visible: false,
  opacity: 0.42,
};

export function togglePlanningLayer(
  preferences: PlanningLayerPreferences,
): PlanningLayerPreferences {
  return { ...preferences, visible: !preferences.visible };
}

export function setPlanningLayerOpacity(
  preferences: PlanningLayerPreferences,
  opacity: number,
): PlanningLayerPreferences {
  return {
    ...preferences,
    opacity: Math.min(0.8, Math.max(0.15, opacity)),
  };
}

export type PlanningLayerLoadResult =
  | {
    status: "ready";
    parcels: PlanningParcel[];
    queriedAt: string;
  }
  | {
    status: "unavailable";
    parcels: [];
    message: string;
  };

type FetchPlanningData = (input: string, init?: RequestInit) => Promise<Response>;

const planningQueryEndpoint = "https://map6.shanghai-map.net:6443/geoscene/rest/services/planblock/MapServer/0/query";
const planningQueryPageSize = 2_000;
const planningQueryMaximumPages = 6;
const planningQueryFields = [
  "OBJECTID",
  "PLOTNUMBER",
  "LANDAREA",
  "PLANLANDPROCODE",
  "PLANLANDPRONAME",
  "PROJECTNAME",
  "APPROVALNUMBER",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPlanningGeometry(value: unknown): value is PlanningGeometry {
  if (!isRecord(value) || !Array.isArray(value.coordinates)) return false;
  return value.type === "Polygon" || value.type === "MultiPolygon";
}

export function normalizePlanningFeatureCollection(value: unknown): PlanningParcel[] {
  if (!isRecord(value) || !Array.isArray(value.features)) return [];

  return value.features.flatMap((feature): PlanningParcel[] => {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isPlanningGeometry(feature.geometry)) {
      return [];
    }
    const properties = feature.properties;
    const objectId = properties.OBJECTID ?? feature.id;
    if (typeof objectId !== "string" && typeof objectId !== "number") return [];

    return [{
      id: String(objectId),
      plotNumber: optionalString(properties.PLOTNUMBER),
      landAreaSquareMeters: optionalNumber(properties.LANDAREA),
      landUseCode: optionalString(properties.PLANLANDPROCODE),
      landUseName: optionalString(properties.PLANLANDPRONAME),
      projectName: optionalString(properties.PROJECTNAME),
      approvalNumber: optionalString(properties.APPROVALNUMBER),
      geometry: feature.geometry,
    }];
  });
}

function pointInRing([longitude, latitude]: [number, number], ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    const [currentLongitude, currentLatitude] = currentPoint;
    const [previousLongitude, previousLatitude] = previousPoint;
    const intersects = (currentLatitude > latitude) !== (previousLatitude > latitude)
      && longitude < (previousLongitude - currentLongitude) * (latitude - currentLatitude)
        / (previousLatitude - currentLatitude) + currentLongitude;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(position: [number, number], rings: number[][][]) {
  const [outerRing, ...holes] = rings;
  return Boolean(outerRing)
    && pointInRing(position, outerRing)
    && !holes.some((hole) => pointInRing(position, hole));
}

export function findPlanningParcelAt(
  parcels: PlanningParcel[],
  position: [number, number],
) {
  return parcels.find((parcel) => {
    if (parcel.geometry.type === "Polygon") {
      return pointInPolygon(position, parcel.geometry.coordinates);
    }
    return parcel.geometry.coordinates.some((polygon) => pointInPolygon(position, polygon));
  }) ?? null;
}

function planningQueryUrl(bounds: PlanningBounds, resultOffset: number) {
  const query = new URLSearchParams({
    where: "1=1",
    geometry: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: planningQueryFields.join(","),
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: "0.00001",
    orderByFields: "OBJECTID ASC",
    resultOffset: String(resultOffset),
    resultRecordCount: String(planningQueryPageSize),
    f: "geojson",
  });
  return `${planningQueryEndpoint}?${query}`;
}

export async function loadPlanningParcels(
  bounds: PlanningBounds,
  fetchPlanningData: FetchPlanningData = fetch,
  signal?: AbortSignal,
): Promise<PlanningLayerLoadResult> {
  try {
    const parcels: PlanningParcel[] = [];
    for (let page = 0; page < planningQueryMaximumPages; page += 1) {
      const response = await fetchPlanningData(
        planningQueryUrl(bounds, page * planningQueryPageSize),
        {
          headers: { Accept: "application/geo+json, application/json" },
          signal,
        },
      );
      if (!response.ok) throw new Error(`Planning service returned ${response.status}`);
      const payload: unknown = await response.json();
      const pageParcels = normalizePlanningFeatureCollection(payload);
      parcels.push(...pageParcels);
      if (pageParcels.length < planningQueryPageSize) break;
      if (page === planningQueryMaximumPages - 1) {
        throw new Error("Planning viewport exceeds the safe feature limit");
      }
    }
    return {
      status: "ready",
      parcels,
      queriedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "unavailable",
      parcels: [],
      message: "官方规划服务暂时不可用",
    };
  }
}
