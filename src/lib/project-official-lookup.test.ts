import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and needs the source extension.
import { getOfficialPropertyLookup } from "./project-official-lookup.ts";
import type { PropertyProject } from "../types/map";

test("公开楼盘详情提供上海网上房地产人工查询入口和辅助条件", () => {
  const project: PropertyProject = {
    id: "project_建发联发青云上",
    district: "浦东",
    sector: "曹路",
    name: "建发联发青云上",
    officialName: "建发联发·青云上",
    locationAddress: "浦东新区顾如路219弄",
    position: [121.679628, 31.289697],
    locationSourceName: "公开位置来源",
    locationSourceUrl: "https://example.com",
    locationVerifiedAt: "2026-07-22",
    locationConfidence: "high",
  };

  const lookup = getOfficialPropertyLookup(project);
  assert.equal(
    lookup.url,
    "https://www.fangdi.com.cn/new_house/new_house.html",
  );
  assert.equal(lookup.searchName, "建发联发·青云上");
  assert.equal(lookup.searchAddress, "浦东新区顾如路219弄");
  assert.match(lookup.notice, /验证码/);
});
