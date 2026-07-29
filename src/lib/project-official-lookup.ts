import type { PropertyProject } from "@/src/types/map";

const fangdiNewHouseUrl =
  "https://www.fangdi.com.cn/new_house/new_house.html";

export function getOfficialPropertyLookup(project: PropertyProject) {
  return {
    title: "上海网上房地产",
    publisher: "上海市房地产交易中心",
    url: fangdiNewHouseUrl,
    searchName: project.officialName ?? project.name,
    searchAddress: project.locationAddress,
    notice: "官方查询页可能要求输入验证码；请以查询当日页面为准。",
  };
}
