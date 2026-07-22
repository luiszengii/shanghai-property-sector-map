export type PlaceCategory =
  | "school"
  | "hospital"
  | "commercial"
  | "park"
  | "metro"
  | "industry"
  | "funeral"
  | "power"
  | "waste"
  | "environment";

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  longitude: number;
  latitude: number;
  address: string;
  sourceName: string;
  sourceUrl: string;
  sourceDate: string;
  description: string;
  isMock: boolean;
}

export interface Category {
  id: PlaceCategory;
  name: string;
  group: "benefit" | "attention";
  icon: string;
  color: string;
}

export interface SectorProperties {
  id: string;
  name: string;
  district: string;
  description: string;
  sourceName: string;
  isMock: boolean;
  center: [number, number];
}

export interface SectorFeature {
  type: "Feature";
  properties: SectorProperties;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface SectorCollection {
  type: "FeatureCollection";
  name: string;
  mockDataNotice: string;
  features: SectorFeature[];
}
