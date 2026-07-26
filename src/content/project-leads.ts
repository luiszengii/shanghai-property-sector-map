import { projectLocations } from "@/src/data/project-locations";
import type { PropertyProject } from "@/src/types/map";

type ProjectIdentity = [
  district: string,
  sector: string,
  name: string,
];

const identities: ProjectIdentity[] = [
  ["浦东", "川沙", "东岸观邸"],
  ["浦东", "川沙", "浦发上品"],
  ["浦东", "川沙", "陆家嘴锦绣云澜"],
  ["浦东", "曹路", "建发联发青云上"],
  ["浦东", "曹路", "金海雲墅"],
  ["浦东", "唐镇", "浦发唐城二期"],
  ["浦东", "航头", "陆家嘴锦绣澜湾"],
  ["浦东", "周浦", "金桥碧云澧悦"],
  ["浦东", "康桥", "张江金茂府"],
  ["浦东", "金桥", "金鼎睿府"],
  ["浦东", "三林", "前滩东方湾"],
  ["浦东", "三林", "招商臻境"],
  ["浦东", "惠南", "浦城云樾观海"],
  ["普陀", "桃浦", "中环云悦府"],
  ["普陀", "桃浦", "建发海阅首府"],
  ["普陀", "桃浦", "中环桃源里"],
  ["普陀", "桃浦", "宝华紫薇花园"],
  ["虹口", "江湾镇", "中建虹悦里"],
  ["松江", "大学城", "中企誉品银湖湾"],
  ["松江", "九亭", "唐顿公馆"],
  ["松江", "洞泾", "中建大椿·嘉利椿庭"],
  ["松江", "松江老城", "招商云澜湾"],
  ["宝山", "共富", "佳运瑞璟湾"],
  ["宝山", "共康", "大华公园柏翠"],
  ["宝山", "南大", "保利海上臻悦"],
  ["宝山", "南大", "中环置地中心望雲"],
  ["宝山", "南大", "中环鹭岛"],
  ["宝山", "淞宝", "上海长滩"],
  ["宝山", "顾村", "招商中旅观境"],
  ["嘉定", "南翔", "嘉悦府"],
  ["嘉定", "南翔", "华润华发时代之城"],
  ["嘉定", "江桥", "虹桥和著"],
  ["闵行", "颛桥", "保利光合上城"],
  ["闵行", "梅陇", "安高申陇院"],
  ["闵行", "梅陇", "朗拾花语"],
  ["闵行", "颛桥", "保利光合跃城"],
  ["闵行", "颛桥", "尚海林语"],
  ["闵行", "颛桥", "华润置地映江润府"],
  ["闵行", "莘庄", "中企云启春申"],
  ["闵行", "金虹桥", "古北悦公馆"],
  ["奉贤", "奉贤新城", "上江南璟荟名庭"],
  ["青浦", "徐泾", "虹桥融景"],
  ["青浦", "赵巷", "国贸虹桥璟上"],
  ["青浦", "朱家角", "璟雲里"],
  ["青浦", "朱家角", "恒文璞悦江南"],
  ["青浦", "青浦新城", "印象青城"],
];

export const projects: PropertyProject[] = identities.map(
  ([district, sector, name]) => {
    const location = projectLocations[name];
    if (!location) throw new Error(`缺少项目固定点位：${name}`);
    return {
      id: `project_${name}`,
      district,
      sector,
      name,
      officialName: location.officialName,
      locationAddress: location.address,
      position: location.position,
      locationSourceName: location.sourceName,
      locationSourceUrl: location.sourceUrl,
      locationVerifiedAt: location.verifiedAt,
      locationConfidence: location.confidence,
      locationNote: location.note,
    };
  },
);
