"use client";

import type { SectorBoundarySource } from "@/src/store/map-store";
import type { PropertyProject } from "@/src/types/map";

type ProjectResearch = NonNullable<PropertyProject["research"]>;

export const projectFilterLabel = "已核验项目点位";
export const projectLegendLabel = "已核验项目点位";
export const projectFootnote = "公开页面仅展示已核验的项目名称、位置和来源，不提供价格、学区或购买建议。";
export const projectDetailDisclaimer = "页面仅公开项目名称、固定点位、地址及其来源；不展示待核验价格、学区或评价。";

export function LocalEditorShortcut(_props: { className: string }) {
  void _props;
  return null;
}

export function LocalEnvironmentSwitcher() {
  return null;
}

export function LocalSourceLedgerShortcut() {
  return null;
}

export function LocalSectorSourceControls() {
  return null;
}

export function LocalDataDisclosures() {
  return <li>公开页面只展示已核验的项目名称、固定点位、地址与来源；待核验价格、学区和评价仅保留在本地研究模式。</li>;
}

export function getLocalExternalLegend(_source: SectorBoundarySource) {
  void _source;
  return null;
}

export function LocalProjectResearchSummary(_props: { research?: ProjectResearch }) {
  void _props;
  return null;
}

export function LocalProjectResearchMetadata(_props: { research?: ProjectResearch }) {
  void _props;
  return null;
}
