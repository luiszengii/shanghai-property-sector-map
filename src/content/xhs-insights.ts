export type XhsInsight = {
  sector: string;
  district: string;
  sampleNotes: number;
  sampleComments: number;
  positioning: string;
  positives: string[];
  cautions: string[];
  checklist: string[];
};

// Aggregated, privacy-safe platform-opinion summaries. These are deliberately
// separate from src/data: they are research prompts, not verified map facts.
export const xhsInsights: XhsInsight[] = [
  { sector: "前滩", district: "浦东新区", sampleNotes: 20, sampleComments: 94, positioning: "核心商务区旁、配套较新的高门槛居住选择。", positives: ["职住距离与滨水公共空间", "次新社区的产品感"], cautions: ["总价与新旧产品价差", "具体小区的交付与生活配套"], checklist: ["楼栋噪声、日照与梯户比", "工作日门到门通勤"] },
  { sector: "张江", district: "浦东新区", sampleNotes: 19, sampleComments: 85, positioning: "科技就业导向明显，内部微区差异很大的居住带。", positives: ["科技园就业通勤", "不同预算的房源梯度"], cautions: ["板块边界大，配套不均", "产业与规划叙事需核验"], checklist: ["区分张江核心、孙桥等微区", "核对房龄、学位与挂牌"] },
  { sector: "大宁", district: "静安区", sampleNotes: 19, sampleComments: 85, positioning: "以公园和成熟生活便利性吸引自住需求的内城北部选择。", positives: ["公园、商业与市区通勤", "成熟社区便于横向比较"], cautions: ["老小区与停车问题", "小区间噪声、密度差异"], checklist: ["早晚高峰与道路噪声", "房龄、物业与维修状况"] },
  { sector: "徐泾", district: "青浦区", sampleNotes: 19, sampleComments: 90, positioning: "虹桥通勤圈内偏家庭改善、低密产品较多的选择。", positives: ["虹桥方向通勤", "空间与低密社区环境"], cautions: ["驾车依赖与高峰拥堵", "配套随位置变化明显"], checklist: ["门到门高峰通勤", "产权、物业费与流动性"] },
  { sector: "徐汇滨江", district: "徐汇区", sampleNotes: 19, sampleComments: 94, positioning: "核心滨江的文商与金融开发叙事，兼有明显的新旧住宅分层。", positives: ["滨水公共空间与文化资源", "内城通勤与西岸发展预期"], cautions: ["总价门槛高", "老房与新房差异大"], checklist: ["景观遮挡、施工与人流", "交付及配套兑现状态"] },
  { sector: "北外滩", district: "虹口区", sampleNotes: 19, sampleComments: 81, positioning: "中心城区滨江与城市更新并行，成熟速度的看法分歧较大。", positives: ["区位与江景资源", "交通及长期更新关注度"], cautions: ["建设兑现节奏", "房龄、学校与微区差异"], checklist: ["官方更新节点", "到滨江、地铁的实际可达性"] },
  { sector: "金桥", district: "浦东新区", sampleNotes: 19, sampleComments: 80, positioning: "产业就业、成熟生活设施与不同房龄社区交织的大板块。", positives: ["就业与通勤", "商业、道路和房源梯度"], cautions: ["城市界面与社区年龄差异", "教育和规划不能一概而论"], checklist: ["目标工作地高峰通勤", "停车、物业与产业影响"] },
  { sector: "虹桥商务区", district: "闵行区 / 青浦区", sampleNotes: 11, sampleComments: 37, positioning: "交通枢纽与商务会展带动的新城型选择，需先界定核心与外围。", positives: ["多方式交通与职住距离", "新社区和区域配套"], cautions: ["核心与外围差异", "新供给、噪声与高峰拥堵"], checklist: ["所属微区与步行时间", "规划设施的实际状态"] },
  { sector: "三林", district: "浦东新区", sampleNotes: 20, sampleComments: 97, positioning: "前滩周边、预算相对可控且内部产品差异明显的居住带。", positives: ["前滩方向通勤", "生活配套和价格梯度"], cautions: ["部分社区高密度与停车", "环境与产品品质不均"], checklist: ["杨思、上南等微区", "采光、梯户比与停车"] },
  { sector: "北蔡", district: "浦东新区", sampleNotes: 20, sampleComments: 99, positioning: "连接花木、张江与三林的居住选择，住宅类型跨度较大。", positives: ["多方向连接", "预算和房源类型的选择空间"], cautions: ["老小区与不同产权产品差异", "规划和现状之间可能有时间差"], checklist: ["明确大华、御桥等微区", "房龄、产权与周边环境"] },
  { sector: "古美", district: "闵行区", sampleNotes: 18, sampleComments: 80, positioning: "服务漕河泾及徐汇、虹桥通勤的成熟生活型板块。", positives: ["工作地连接", "公园和日常生活便利"], cautions: ["供应与价格压力", "部分大型配套需跨板块使用"], checklist: ["高峰通勤与施工噪声", "教育、医疗的正式来源"] },
  { sector: "莘庄", district: "闵行区", sampleNotes: 18, sampleComments: 84, positioning: "上海南部交通与生活配套较成熟的枢纽型板块，南北差异突出。", positives: ["轨道换乘与多方向连接", "商业及生活服务成熟"], cautions: ["高峰人流与拥堵", "北部老社区的房龄和停车"], checklist: ["南北片区分开比较", "换乘、道路与实际成交"] },
  { sector: "陆家嘴", district: "浦东新区", sampleNotes: 18, sampleComments: 60, positioning: "金融就业、滨江资源与高总价住宅集中的核心区。", positives: ["金融城就业与核心区通勤", "滨江、商业和城市级配套"], cautions: ["总价与持有成本", "同名项目和微区差异"], checklist: ["核对实际街道与工作地距离", "产权、房龄和道路噪声"] },
  { sector: "唐镇", district: "浦东新区", sampleNotes: 20, sampleComments: 101, positioning: "承接张江、金桥就业需求，次新家庭社区较受关注。", positives: ["靠近产业就业地", "次新与改善房源集中"], cautions: ["商业便利不均", "学校与规划宣传争议"], checklist: ["高峰通勤和地铁距离", "学校对口与商业兑现"] },
  { sector: "七宝", district: "闵行区", sampleNotes: 19, sampleComments: 90, positioning: "外环附近商业、轨道和家庭配套较成熟的居住板块。", positives: ["商业和日常生活成熟", "虹桥、漕河泾方向通勤"], cautions: ["航空噪声", "教育溢价与老房取舍"], checklist: ["分时段实测飞机噪声", "学位、停车与隔音"] },
  { sector: "新江湾城", district: "杨浦区", sampleNotes: 20, sampleComments: 88, positioning: "强调低密、绿化和改善居住氛围的北部城区选择。", positives: ["生态与低密步行环境", "较新的城市界面"], cautions: ["改善产品总价较高", "核心与边缘位置不同"], checklist: ["区分具体微区", "铁路道路噪声和通勤"] },
  { sector: "真如", district: "普陀区", sampleNotes: 18, sampleComments: 84, positioning: "老牌副中心与商业更新并行，新旧城区交织明显。", positives: ["靠近中心区和多方向轨道", "商业及城市更新关注度"], cautions: ["历史兑现节奏较慢", "新旧界面与房龄差异"], checklist: ["更新项目实际状态", "施工、铁路和步行体验"] },
  { sector: "南翔", district: "嘉定区", sampleNotes: 18, sampleComments: 85, positioning: "嘉定靠近市区、商业和居住较成熟的轨道沿线选择。", positives: ["相对靠近中心城区", "商业和房源梯度"], cautions: ["轨道拥挤与驾车堵点", "板块范围较大"], checklist: ["实测 11 号线高峰", "地铁距离和周边噪声"] },
  { sector: "顾村", district: "宝山区", sampleNotes: 19, sampleComments: 92, positioning: "外环附近兼顾预算与面积的刚需、首置型板块。", positives: ["公园、轨道和居住空间", "新旧社区选择较多"], cautions: ["市区通勤时间", "社区密度与供应压力"], checklist: ["按工作地实测通勤", "物业、停车与成交周期"] },
  { sector: "松江新城", district: "松江区", sampleNotes: 16, sampleComments: 61, positioning: "发展较早、生活配套较成熟的郊区新城，距离是核心取舍。", positives: ["空间、环境和生活配套", "总价与房龄选择丰富"], cautions: ["依赖 9 号线", "供应与流动性分歧"], checklist: ["实测高峰门到门时间", "区分新城、大学城和老城"] },
];

export const xhsResearchMeta = {
  date: "2026-07-22",
  rawNotes: 400,
  uniqueNotes: 379,
  relevantNotes: 350,
  sanitizedComments: 1558,
};
