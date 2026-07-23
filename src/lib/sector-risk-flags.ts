const sectorRiskFlagLabels: Record<string, string> = {
  post_2018_north_bund_reorganization_review: "复核 2018 年北外滩区划调整",
  area_mismatch_review_required: "解释官方面积与开放 relation 的差异",
  mixed_non_residential_scope: "排查高校、园区、商业等非住宅范围",
  mixed_water_green_campus_scope: "排查水绿、校园和非住宅范围",
  overwide_admin_proxy: "行政代理明显过宽",
  mixed_industrial_rail_non_residential: "排查产业、铁路和非住宅范围",
};

export function formatSectorRiskFlags(riskFlags: string[] | undefined) {
  return (riskFlags ?? [])
    .map((riskFlag) => sectorRiskFlagLabels[riskFlag] ?? riskFlag)
    .join("、");
}
