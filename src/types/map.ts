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
  officialName?: string;
  locationAddress: string;
  position: [number, number];
  locationSourceName: string;
  locationSourceUrl: string;
  locationVerifiedAt: string;
  locationConfidence: "high" | "medium";
  locationNote?: string;
  research?: {
    unitType: string;
    averagePrice: number;
    advantages: string[];
    disadvantages: string[];
    education: string[];
    rating: number | null;
    sourceName: string;
    sourceDate: string;
    verificationStatus: "unverified";
  };
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

export type CategoryIconName =
  | "GraduationCap"
  | "Stethoscope"
  | "ShoppingBag"
  | "Trees"
  | "TrainFront"
  | "Factory"
  | "Flower2"
  | "Zap"
  | "ShieldAlert";

export interface Category {
  id: PlaceCategory;
  name: string;
  group: "benefit" | "attention";
  icon: CategoryIconName;
  color: string;
}

export interface SectorProperties {
  id: string;
  name: string;
  district: string;
  description: string;
  sourceName: string;
  boundaryBasis?: string;
  geometryRole?: "generated-editor-seed";
  generatedFromCandidateId?: string;
  isMock: boolean;
  center: [number, number];
}

export type SectorReviewStatus = "reviewed-high" | "draft-medium" | "draft-low";
export type SectorGeometryStatus = "missing" | "demo" | "admin-reference" | "draft" | "reviewed" | "published";
export type SectorGeometryConfidence = "high" | "medium" | "low";
export type SectorKind = "market_sector_with_official_scope_candidate" | "market_sector" | "ambiguous_market_sector" | "ambiguous_official_functional_scope";
export type SectorDefinitionStatus =
  | "official_scope_available"
  | "market_scope_candidate"
  | "user_decided_market_scope"
  | "partial_official_scope"
  | "historical_official_scope_needs_version_check"
  | "official_scope_available_but_semantics_ambiguous"
  | "official_scope_market_candidate"
  | "market_identity_admin_backbone_candidate"
  | "admin_proxy_candidate"
  | "multiple_official_versions_need_selection";
export type SectorBoundarySide = "north" | "east" | "south" | "west";
export type SectorBoundaryStatus =
  | "definition_confirmed"
  | "candidate_scope_confirmed"
  | "candidate_backbone_confirmed"
  | "project_integrity_checked_candidate"
  | "adjacent_review_required"
  | "partial"
  | "geometry_missing"
  | "scope_ambiguous";
export type SectorBoundaryBasis =
  | "official_plan_text"
  | "seller_market_scope"
  | "planning_unit_scope"
  | "historical_official_scope"
  | "official_scope_text"
  | "scope_decision_required"
  | "official_regulation"
  | "existing_market_candidate_shared_edge"
  | "market_candidate_from_admin_backbone"
  | "named_road_market_candidate"
  | "osm_admin_relation_market_backbone"
  | "project_integrity_market_candidate"
  | "user_decided_market_shared_edge";
export type SectorSourceLicenseStatus = "unverified" | "reference_only" | "ODbL-1.0";
export type SectorSourceAllowedUse =
  | "demo_only"
  | "boundary_definition_only"
  | "boundary_verification_only"
  | "version_check_only"
  | "boundary_relationship_only"
  | "spatial_relationship_only"
  | "scope_comparison_only"
  | "market_identity_verification_only"
  | "sector_definition_and_geometry_rule"
  | "name_verification_only"
  | "visual_comparison_only"
  | "geometry_with_attribution_and_odbl_compliance";

export interface SectorGeometryRecord {
  status: SectorGeometryStatus;
  confidence: SectorGeometryConfidence;
  coordinateSystem: "WGS84" | "GCJ-02" | "GCJ-02-assumed" | "unknown";
  coordinateSystemVerified: boolean;
  version: string;
  sourceIds: string[];
  verificationSourceIds?: string[];
  publicationPolicy: "demo_only" | "internal_review" | "publishable";
  note: string;
}

export interface SectorRegistryEntry {
  id: string;
  canonicalName: string;
  aliases: string[];
  riskFlags?: string[];
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
  supportingSourceIds?: string[];
  note?: string;
}

export type SectorReferenceComparisonRole =
  | "functional_scope_not_admin"
  | "admin_proxy_and_functional_scope_conflict"
  | "official_scope_matches_admin_proxy"
  | "admin_proxy"
  | "cross_district_functional_scope";

export type SectorReferenceVerdict =
  | "not_directly_comparable"
  | "scope_choice_required"
  | "consistent"
  | "standard_map_superseded_in_segments";

export type SectorGeometryDecision =
  | "keep_official_scope_candidate"
  | "keep_market_candidate"
  | "keep_market_candidate_with_subscope"
  | "keep_demo_until_scope_selected"
  | "show_admin_reference_without_replacing_market_definition"
  | "keep_market_candidate_with_admin_reference"
  | "show_post_adjustment_admin_reference"
  | "show_admin_reference";

export interface SectorStandardMapDocument {
  title: string;
  url: string;
  mapDate: string;
  reviewNumber: string;
}

export interface SectorLegacyGeometryComparison {
  reference: string;
  intersectionOverUnion: number;
  referenceCoveredPercent: number;
  legacyAreaRatio: number;
  centroidDistanceKilometers: number;
}

export interface SectorReferenceCheck {
  sectorId: string;
  comparisonRole: SectorReferenceComparisonRole;
  verdict: SectorReferenceVerdict;
  geometryDecision: SectorGeometryDecision;
  comparableAdminName?: string;
  standardMapSourceId: string;
  standardMapDocuments: SectorStandardMapDocument[];
  legacyGeometryComparison?: SectorLegacyGeometryComparison;
  summary: string;
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
