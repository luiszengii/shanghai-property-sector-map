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

export interface PropertyProject {
  id: string;
  district: string;
  sector: string;
  name: string;
  unitType: string;
  averagePrice: number;
  advantages: string[];
  disadvantages: string[];
  education: string[];
  rating: number | null;
  officialName?: string;
  locationAddress: string;
  position: [number, number];
  locationSourceName: string;
  locationSourceUrl: string;
  locationVerifiedAt: string;
  locationConfidence: "high" | "medium";
  locationNote?: string;
  sourceName: string;
  sourceDate: string;
  verificationStatus: "unverified";
}

export interface ProjectLocation {
  officialName?: string;
  address: string;
  position: [number, number];
  sourceName: string;
  sourceUrl: string;
  verifiedAt: string;
  confidence: "high" | "medium";
  note?: string;
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
  boundaryBasis?: string;
  isMock: boolean;
  center: [number, number];
}

export type SectorReviewStatus = "reviewed-high" | "draft-medium" | "draft-low";
export type SectorGeometryStatus = "demo" | "draft" | "reviewed" | "published";
export type SectorGeometryConfidence = "high" | "medium" | "low";
export type SectorKind = "market_sector_with_official_scope_candidate" | "market_sector" | "ambiguous_market_sector" | "ambiguous_official_functional_scope";
export type SectorDefinitionStatus = "official_scope_available" | "partial_official_scope" | "historical_official_scope_needs_version_check" | "official_scope_available_but_semantics_ambiguous" | "admin_proxy_candidate" | "multiple_official_versions_need_selection";
export type SectorBoundarySide = "north" | "east" | "south" | "west";
export type SectorBoundaryStatus = "definition_confirmed" | "candidate_scope_confirmed" | "partial" | "geometry_missing" | "scope_ambiguous";
export type SectorBoundaryBasis = "official_plan_text" | "planning_unit_scope" | "historical_official_scope" | "official_scope_text" | "scope_decision_required" | "official_regulation";
export type SectorSourceLicenseStatus = "unverified" | "reference_only" | "ODbL-1.0";
export type SectorSourceAllowedUse = "demo_only" | "boundary_definition_only" | "version_check_only" | "boundary_relationship_only" | "spatial_relationship_only" | "scope_comparison_only" | "name_verification_only" | "geometry_with_attribution_and_odbl_compliance";

export interface SectorGeometryRecord {
  status: SectorGeometryStatus;
  confidence: SectorGeometryConfidence;
  coordinateSystem: "WGS84" | "GCJ-02" | "GCJ-02-assumed" | "unknown";
  coordinateSystemVerified: boolean;
  version: string;
  sourceIds: string[];
  publicationPolicy: "demo_only" | "internal_review" | "publishable";
  note: string;
}

export interface SectorRegistryEntry {
  id: string;
  canonicalName: string;
  aliases: string[];
  districtNames: string[];
  kind: SectorKind;
  reviewStatus: SectorReviewStatus;
  definitionStatus: SectorDefinitionStatus;
  definitionCandidate: string;
  definitionSourceIds: string[];
  boundaryEvidenceIds: string[];
  geometry: SectorGeometryRecord;
}

export interface SectorSourceRecord {
  id: string;
  title: string;
  publisher: string;
  url: string | null;
  sourceType: string;
  publishedAt?: string;
  licenseStatus: SectorSourceLicenseStatus;
  allowedUse: SectorSourceAllowedUse;
  note: string;
}

export interface SectorBoundaryEvidence {
  id: string;
  sectorId: string;
  side: SectorBoundarySide;
  basisType: SectorBoundaryBasis;
  featureName: string;
  status: SectorBoundaryStatus;
  confidence: SectorGeometryConfidence;
  sourceId: string;
  note?: string;
}

export interface SectorFeature {
  type: "Feature";
  properties: SectorProperties;
  geometry: SectorGeometry;
}

export type SectorGeometry =
  | {
    type: "Polygon";
    coordinates: number[][][];
  }
  | {
    type: "MultiPolygon";
    coordinates: number[][][][];
  };

export interface SectorCollection {
  type: "FeatureCollection";
  name: string;
  mockDataNotice: string;
  features: SectorFeature[];
}
