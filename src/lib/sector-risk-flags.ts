const sectorRiskFlagLabels: Record<string, string> = {
  post_2018_north_bund_reorganization_review: "复核 2018 年北外滩区划调整",
  area_mismatch_review_required: "解释官方面积与开放 relation 的差异",
  mixed_non_residential_scope: "排查高校、园区、商业等非住宅范围",
  mixed_water_green_campus_scope: "排查水绿、校园和非住宅范围",
  overwide_admin_proxy: "行政代理明显过宽",
  mixed_industrial_rail_non_residential: "排查产业、铁路和非住宅范围",
  market_name_admin_proxy_requires_validation: "市场名与行政名不同，需逐项目验证",
  mixed_campus_non_residential_scope: "排查校园和其他非住宅范围",
  named_project_landuse_proxy_requires_validation: "同名项目用地代理需逐地块验证",
  multi_part_project_scope: "项目由多个分离组成面构成",
  official_polygon_unavailable: "官方仅有成员范围，暂无可用多边形",
  admin_union_remainder_requires_validation: "行政并集差集仅作最大研究包络",
  independent_market_subtracted: "已扣除独立市场候选",
  guangxin_interface_unresolved: "光新接口尚未裁定",
  market_boundary_not_official: "候选不是官方发布的市场边界",
};

export function formatSectorRiskFlags(riskFlags: string[] | undefined) {
  return (riskFlags ?? [])
    .map((riskFlag) => sectorRiskFlagLabels[riskFlag] ?? riskFlag)
    .join("、");
}
