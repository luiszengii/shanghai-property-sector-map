#!/usr/bin/env python3
"""Build privacy-safe Xiaohongshu property-opinion research outputs.

Raw crawler files are intentionally kept under ignored ``outputs/xhs_raw``.
This script reads every declared crawl batch, deduplicates notes/comments in
memory, then writes analysis artefacts under ignored ``outputs/xhs_analysis``.
It is not a fact-verification pipeline and must never update ``src/data``.
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "outputs" / "xhs_analysis"
CRAWL_DATE = "2026-07-22"

# Keep batches separate on disk. MediaCrawler appends JSONL within a directory,
# so a new collection should add a new entry here rather than reuse an old path.
RAW_BATCHES = (
    ("initial-2026-07-22", ROOT / "outputs" / "xhs_raw" / "xhs" / "jsonl"),
    ("batch-a-2026-07-22", ROOT / "outputs" / "xhs_raw" / "batch-a-2026-07-22" / "xhs" / "jsonl"),
    ("batch-b-2026-07-22", ROOT / "outputs" / "xhs_raw" / "batch-b-2026-07-22" / "xhs" / "jsonl"),
    ("batch-c-2026-07-22", ROOT / "outputs" / "xhs_raw" / "batch-c-2026-07-22" / "xhs" / "jsonl"),
    ("batch-d-2026-07-22", ROOT / "outputs" / "xhs_raw" / "batch-d-2026-07-22" / "xhs" / "jsonl"),
)

KEYWORD_TO_SECTOR = {
    "上海前滩买房优缺点": "前滩",
    "上海张江买房优缺点": "张江",
    "上海大宁买房优缺点": "大宁",
    "上海徐泾买房优缺点": "徐泾",
    "上海徐汇滨江买房优缺点": "徐汇滨江",
    "上海北外滩买房优缺点": "北外滩",
    "上海金桥买房优缺点": "金桥",
    "上海虹桥商务区买房优缺点": "虹桥商务区",
    "上海三林买房优缺点": "三林",
    "上海北蔡买房优缺点": "北蔡",
    "上海古美买房优缺点": "古美",
    "上海莘庄买房优缺点": "莘庄",
    "上海陆家嘴买房优缺点": "陆家嘴",
    "上海唐镇买房优缺点": "唐镇",
    "上海七宝买房优缺点": "七宝",
    "上海新江湾城买房优缺点": "新江湾城",
    "上海真如买房优缺点": "真如",
    "上海南翔买房优缺点": "南翔",
    "上海顾村买房优缺点": "顾村",
    "上海松江新城买房优缺点": "松江新城",
}

# These registered map identities have no authorized XHS crawl batch yet.
# Some are candidate geometry and some are intentionally blank editor drafts.
# Keeping the gap explicit prevents empty entries from being
# mistaken for researched conclusions or fabricated representative sources.
PENDING_MAP_SECTORS_WITHOUT_XHS_SAMPLE = {
    "徐汇区": ("徐家汇", "湖南路", "天平路", "枫林路", "斜土路", "龙华", "田林", "漕河泾", "康健", "凌云路", "长桥", "华泾", "上海南站"),
    "长宁区": ("新华路", "天山", "仙霞", "北新泾", "古北", "虹桥", "中山公园", "西郊"),
    "静安区": ("南京西路", "静安寺", "曹家渡", "江宁路", "不夜城", "苏河湾", "阳城", "永和", "彭浦", "镇宁路", "西藏北路", "闸北公园"),
    "普陀区": ("长寿路", "曹杨", "长风", "长征", "桃浦", "万里", "甘泉宜川", "中远两湾城", "武宁", "真光", "光新"),
    "虹口区": ("四川北路", "曲阳", "凉城", "江湾镇", "瑞虹新城", "鲁迅公园"),
    "杨浦区": ("控江路", "五角场", "鞍山", "中原", "东外滩", "定海路", "黄兴公园"),
    "宝山区": ("张庙", "淞南", "高境", "杨行", "罗店", "月浦", "罗泾", "大华", "上大", "南大", "共康", "淞宝"),
    "嘉定区": ("江桥", "马陆", "徐行", "外冈", "安亭", "华亭", "菊园新区", "丰庄", "嘉定新城", "嘉定老城"),
    "闵行区": ("华漕", "梅陇", "颛桥", "马桥", "吴泾", "浦江镇", "静安新城", "闵行金汇", "龙柏", "航华", "金虹桥", "老闵行"),
    "浦东新区": ("高行", "曹路", "合庆", "大团", "泥城", "书院", "万祥", "老港", "洋泾", "塘桥", "金杨", "南码头", "潍坊", "花木", "梅园", "源深", "联洋", "杨东", "碧云", "森兰", "外高桥", "临港主城区"),
    "奉贤区": ("西渡", "南桥", "奉贤金汇", "海湾", "柘林", "奉城", "四团", "青村", "庄行"),
    "青浦区": ("华新", "重固", "白鹤", "赵巷", "香花桥", "夏阳", "盈浦", "朱家角", "金泽", "练塘"),
    "松江区": ("泗泾", "洞泾", "新桥", "佘山", "小昆山", "车墩", "新浜", "石湖荡", "泖港", "叶榭"),
    "金山区": ("金山新城", "金山卫", "山阳", "朱泾", "枫泾", "亭林", "张堰", "廊下", "吕巷", "漕泾"),
}

# These are deliberately phrased as summaries of recurring platform views, not
# as property facts. Representative note IDs are resolved only to local output
# links and are never used as proof of a claim.
SECTOR_ANALYSIS = {
    "前滩": {
        "positioning": "样本常将其定位为靠近核心商务区、商业和公共空间较新的高门槛居住板块。",
        "pros": ["通勤、商业与滨水公共空间常被一并提及。", "新房与次新社区的产品感是高频吸引点。", "对在陆家嘴或前滩工作的自住人群，通勤便利是常见理由。"],
        "cons": ["总价、持有成本和新旧产品价差被反复讨论。", "部分帖子认为生活配套仍需看具体小区和交付阶段。", "投资回报、学区等结论在样本中分歧明显。"],
        "verify": ["按楼栋核对交付年限、噪声与日照。", "核验通勤时段而非仅看地图距离。", "教育、商业和规划承诺以官方信息为准。"],
        "sources": ["6721e6eb000000001a00e33a", "66e7ed89000000000e02a15f", "66eaa6ee000000001d031e0e", "67d15f11000000001d0182a0", "68074e8e000000001b00d08d"],
    },
    "张江": {
        "positioning": "样本常将其定位为科技就业导向明显、范围很大且内部差异显著的浦东居住选择。",
        "pros": ["靠近科技园就业地是最常出现的自住理由。", "地铁、通勤和产业氛围被频繁提及。", "不同预算可在老小区、次新和周边片区中比较。"],
        "cons": ["板块边界大，不能用单一均价或标签概括。", "部分区域商业、医疗、教育成熟度被认为不均衡。", "产业、规划和学区叙事须与具体地址逐项核验。"],
        "verify": ["确认公司园区、住宅和地铁站间的实际通勤。", "区分张江核心、孙桥、北蔡等微区。", "核对小区年限、物业、学位和二手挂牌真实性。"],
        "sources": ["67f7a9bb000000002003d5e6", "67231d4f000000001b0267f7", "66fb7a45000000000601d47a", "66e92633000000001f03ee55", "66a9ef62000000000d03c71f"],
    },
    "大宁": {
        "positioning": "样本多把它描述为静安北部较成熟、以公园和生活便利性吸引自住需求的板块。",
        "pros": ["公园、商业和内环附近的生活便利是高频正面词。", "对市中心通勤和家庭生活的平衡常获认可。", "成熟社区可提供较多二手房比较样本。"],
        "cons": ["老小区、停车和房龄是典型顾虑。", "预算不足时户型、楼层和距地铁距离需取舍。", "不同小区之间噪声、密度和产品差异较大。"],
        "verify": ["实勘早晚高峰、停车和高架/道路噪声。", "核实房龄、维修资金和物业状况。", "对教育与医疗可达性做官方或现场核验。"],
        "sources": ["66f92cc4000000001a0303f2", "66e55bcd000000001b02a0d6", "66f4e5e0000000001a0346e7", "66d151ca000000001d034d2e", "66e92226000000001b03c7ad"],
    },
    "徐泾": {
        "positioning": "样本通常将其作为西上海、虹桥通勤圈内以低密住宅和家庭改善为主的选择。",
        "pros": ["虹桥方向通勤和较大居住空间是常见吸引点。", "低密、小区环境和改善型产品被频繁提及。", "不同子片区有价格和产品梯度。"],
        "cons": ["依赖驾车、距轨道站距离和早晚拥堵是高频顾虑。", "配套成熟度随小区位置变化明显。", "别墅/洋房等产品的维护与流动性需单独判断。"],
        "verify": ["按工作日高峰实测到虹桥及市区的门到门时间。", "核对轨道、商业、医疗和学校的实际距离。", "查验小区产权、物业费和交易流动性。"],
        "sources": ["67d6a32a000000001b0379a4", "6708b5e3000000001a0316fd", "66dbf5700000000020032d0a", "66e81a31000000001c034b90", "672b094e000000001a02591d"],
    },
    "徐汇滨江": {
        "positioning": "样本常把它放在核心滨江、文商与金融开发叙事中，也强调新旧住宅供给差异。",
        "pros": ["滨水公共空间、文化设施与工作机会被视为核心吸引力。", "内城通勤和西岸发展预期常被提及。", "对预算充足的改善自住者，新产品与景观资源有吸引力。"],
        "cons": ["总价门槛高，预算内可选房源与面积常需妥协。", "老房与新房的房龄、产品和价格差异大。", "规划溢价与实际居住体验不能互相替代。"],
        "verify": ["确认具体楼栋的景观遮挡、施工和滨江人流影响。", "分开比较老小区、次新和新房的单价及总价。", "核验项目交付、商业和产业兑现时间。"],
        "sources": ["68d7dd500000000012014d89", "66fed801000000001a021f67", "671e59490000000026036cf1", "676ab48d000000000b00f7f3", "69a46514000000001d026ec9"],
    },
    "北外滩": {
        "positioning": "样本多以核心城区滨江、陆家嘴外溢和长期城市更新来理解北外滩，但对成熟速度看法不一。",
        "pros": ["中心区位与江景资源是最常被提及的优势。", "城市界面、交通和未来开发被视为长期看点。", "不同预算可在核心江景与周边成熟社区间选择。"],
        "cons": ["部分样本认为建设兑现较慢，短期生活感受未必等于规划图景。", "房龄、学校与社区品质在不同微区差异明显。", "核心区与周边的价格和居住条件不能混为一谈。"],
        "verify": ["核实目标楼盘距滨江、轨道和工作地的实际可达性。", "逐项确认更新项目的官方状态和交付节点。", "查验房龄、学位政策及小区交易样本。"],
        "sources": ["6678290c000000001d03d56a", "694e99f0000000001b02f34c", "66d04e30000000001c03f157", "67cc5cca000000002003d627", "671644d5000000001a03c819"],
    },
    "金桥": {
        "positioning": "样本通常把金桥视为就业、产业和成熟生活设施交织的较大板块，适合按微区与房龄筛选。",
        "pros": ["产业就业和通勤便利是常见自住理由。", "商业设施、道路与跨江通达性被频繁提到。", "房源类型和总价梯度较多，便于横向比较。"],
        "cons": ["社区年龄和城市界面差异大，不能只看“金桥”标签。", "教育资源并非所有样本的首选理由。", "新供应、规划与价格支撑需要独立核验。"],
        "verify": ["用工作日高峰验证到张江、陆家嘴等地的通勤。", "确认目标小区房龄、停车、物业和周边产业影响。", "对学校、规划和新盘供应查官方资料。"],
        "sources": ["69de21e0000000001d0214ca", "66bc784b000000001d0345e6", "67f71d4f000000001e039123", "66f64ea4000000001b039901", "6788b9b0000000001a0320f3"],
    },
    "虹桥商务区": {
        "positioning": "样本把它视为交通枢纽与商务会展带动的新城型板块，但“核心—外围”的边界需先说清。",
        "pros": ["多方式交通、商务和会展相关通勤是高频优势。", "新社区与商业配套被不少样本视为改善型吸引力。", "对在虹桥工作的人，职住距离具有直接价值。"],
        "cons": ["板块范围大，核心与外围的发展程度、步行距离差异明显。", "新供给、交通噪声与高峰拥堵是常见顾虑。", "规划中的轨道、商业或教育不能视为现成配套。"],
        "verify": ["标出项目属于虹桥主城、蟠龙或西虹桥等哪一微区。", "实测步行至地铁、办公区和商业的时间。", "核验规划设施状态、航线/道路噪声与在售供应。"],
        "sources": ["66c07d13000000001d031c7f", "67ea64c0000000001b03c74c", "68b0366c000000001d0342d7", "66fe8a18000000001a036055", "69e3397e000000001f02c6c4"],
    },
    "三林": {
        "positioning": "样本常把三林看作前滩周边、预算相对可控且内部片区差异明显的浦东居住带。",
        "pros": ["靠近前滩及多条交通走廊是常见优势。", "商业、日常生活和价格梯度常被一并讨论。", "不同微区可提供旧改、次新或成熟小区的选择。"],
        "cons": ["高密度、采光、电梯和停车在部分社区是常见问题。", "社区环境和产品品质并不均质。", "以“前滩外溢”推断价值仍需回到具体房源。"],
        "verify": ["区分杨思、三林、上南等微区并实测通勤。", "查看目标楼栋采光、梯户比、停车与噪声。", "核验商业、轨道和更新项目的实际状态。"],
        "sources": ["67ac2398000000001e03a479", "693bcaec000000001d0310ac", "678e2e06000000001a035b99", "67c16e07000000001a034234", "66cd9d6d000000001e03bbf0"],
    },
    "北蔡": {
        "positioning": "样本常以花木、张江、三林之间的连接位置讨论北蔡，也认为其住宅类型和成熟度跨度较大。",
        "pros": ["地理位置与多个就业、商业方向的连接是常见卖点。", "预算与房源类型相比相邻核心区更有选择空间。", "成熟社区和新发展片区可做差异化比较。"],
        "cons": ["老小区、动迁/商品房等产品差异很大。", "规划潜力与当前生活配套之间存在时间差。", "同名板块内的交通和居住品质不能一概而论。"],
        "verify": ["明确目标在大华、御桥、楔形绿地等哪个微区。", "核验房龄、产权、物业和周边环境。", "对规划、学校与商业以官方资料或现场为准。"],
        "sources": ["6115e0c8000000001d03b546", "69269d8e000000001c030eb8", "69de21e0000000001d0214ca", "66f9157a000000001e03e442", "678603e8000000001a03d0ae"],
    },
    "古美": {
        "positioning": "样本多把古美描述为服务漕河泾及徐汇、虹桥通勤的成熟居住区，重视日常生活平衡。",
        "pros": ["工作地连接、轨道和道路通勤被频繁提及。", "公园、社区商业和成熟居住氛围是常见优点。", "相对更核心区域，预算与面积的平衡被一些样本认可。"],
        "cons": ["房源供应与价格压力被部分帖子讨论。", "大型商业、综合医疗等资源需跨板块使用的观点较多。", "增值预期和教育叙事不可直接从个别帖子外推。"],
        "verify": ["实测到漕河泾、徐汇和虹桥的早晚通勤。", "核实具体小区房龄、停车、噪声及周边施工。", "查验教育、医疗和交易数据的正式来源。"],
        "sources": ["66e2bf91000000001b03a8cf", "6a0fef0c000000001d038aa5", "67b81c2a000000001f03d02e", "66e420f5000000001a035d2d", "68367da5000000001e03531d"],
    },
    "莘庄": {
        "positioning": "样本常把莘庄视为上海南部交通与生活配套较成熟的枢纽型板块，并强调南北片区差别。",
        "pros": ["轨道换乘和通往市区、闵行多方向的连接是高频优势。", "商业、医疗及生活服务的成熟度常被肯定。", "房源覆盖老小区到改善产品，预算梯度较多。"],
        "cons": ["换乘、高峰拥堵和人流密度是常见负面体验。", "北部老社区的房龄、停车和环境需要重点看。", "南北片区的价格、距站与产品条件不同。"],
        "verify": ["分开比较莘庄北、南广场及春申等微区。", "工作日实测换乘、道路和停车情况。", "核验小区年限、物业及实际成交和挂牌。"],
        "sources": ["667f9d94000000001b03d010", "62497aa7000000001d0327d6", "66fd35cb000000001f03e529", "674698fe000000001a030f01", "67cba34d000000001e03e896"],
    },
    "陆家嘴": {
        "positioning": "样本常把陆家嘴视为金融就业、滨江资源与高总价住宅高度集中的核心区，但同名楼盘和周边微区需辨清。",
        "pros": ["金融城就业与核心区通勤是高频优势。", "滨江、商业和城市级配套常被提及。", "成熟豪宅与普通住宅形成多种产品比较。"],
        "cons": ["总价门槛和持有成本普遍较高。", "房龄、楼盘品质和离轨道距离差异明显。", "带“陆家嘴”名称的项目不一定处于金融城核心。"],
        "verify": ["核对项目实际街道、地铁和工作地距离。", "实勘高架、道路、游客与施工噪声。", "查验产权性质、房龄、物业与真实成交。"],
        "sources": [],
    },
    "唐镇": {
        "positioning": "样本多将唐镇定位为张江、金桥就业圈外溢的年轻家庭居住区，新社区与配套兑现是讨论重点。",
        "pros": ["靠近张江和金桥就业地是常见选择理由。", "次新与改善型社区相对集中。", "安静、居住纯度和家庭需求常被提到。"],
        "cons": ["商业便利与烟火气在不同片区不均。", "部分样本认为房价包含较高预期。", "学校和规划宣传存在争议，不能直接采信。"],
        "verify": ["实测到园区和地铁的高峰通勤。", "核验学校对口、商业开业和规划状态。", "比较商品房、动迁房及不同期次品质。"],
        "sources": [],
    },
    "七宝": {
        "positioning": "样本常把七宝视为外环附近商业、轨道和家庭配套较成熟的板块，同时反复讨论航空噪声。",
        "pros": ["商业成熟和日常生活便利是高频评价。", "多方向轨道与虹桥、漕河泾通勤有吸引力。", "学校与成熟社区对家庭买家有关注度。"],
        "cons": ["飞机航道噪声是最常见顾虑。", "教育叙事可能形成溢价。", "老房、拥堵和具体小区品质需要取舍。"],
        "verify": ["在不同天气和时段实测航空噪声。", "核验学位政策与通勤换乘。", "检查房龄、停车、隔音和楼栋位置。"],
        "sources": [],
    },
    "新江湾城": {
        "positioning": "样本多强调新江湾城的低密、绿化和改善居住氛围，也提醒核心与边缘片区条件不同。",
        "pros": ["生态、低密和步行环境是高频吸引点。", "较新的城市界面和改善产品常被认可。", "对偏好安静家庭生活的人群有吸引力。"],
        "cons": ["总价与改善产品门槛较高。", "商业、医疗和市区通勤便利度需看位置。", "靠铁路、快速路或板块边缘的项目体验不同。"],
        "verify": ["明确殷行路南北等具体微区。", "实测地铁步行、日常采购和通勤。", "检查道路铁路噪声与规划建设状态。"],
        "sources": [],
    },
    "真如": {
        "positioning": "样本常以老牌副中心、商业更新和新旧城区交织理解真如，对兑现速度仍存在分歧。",
        "pros": ["靠近中心城区和多方向轨道是常见优势。", "新商业与城市更新提升了板块关注度。", "新房与老社区提供不同预算选择。"],
        "cons": ["历史开发节奏较慢，规划预期需谨慎。", "新旧城市界面和房龄差异明显。", "部分区域施工、铁路或道路影响需实勘。"],
        "verify": ["核对轨道、商业和更新项目实际状态。", "区分真如核心与周边老社区。", "实勘施工、道路噪声和步行体验。"],
        "sources": [],
    },
    "南翔": {
        "positioning": "样本多把南翔视为嘉定靠近市区、商业和居住较成熟的选择，轨道通勤与拥挤是两面议题。",
        "pros": ["相对靠近市区且商业成熟度较高。", "11 号线和不同房源梯度便于自住比较。", "老镇生活与新社区形成多样选择。"],
        "cons": ["轨道高峰拥挤和驾车堵点被频繁提到。", "南翔范围大，站点周边和外围条件不同。", "教育、医疗和新增轨道不能只看宣传。"],
        "verify": ["工作日实测 11 号线通勤。", "核对到地铁、商业和学校的真实距离。", "检查房龄、飞机或道路噪声与供应量。"],
        "sources": [],
    },
    "顾村": {
        "positioning": "样本通常将顾村作为宝山外环附近、预算与面积较易平衡的刚需和首置板块。",
        "pros": ["公园、轨道和较大的居住空间是常见吸引点。", "新旧社区与不同总价段可供比较。", "对宝山、嘉定及市区北部通勤者有一定匹配度。"],
        "cons": ["到市中心通勤时间和高峰拥挤是主要顾虑。", "社区密度、配套和板块内部差异较大。", "二手流动性与供应压力需单独判断。"],
        "verify": ["按工作地实测轨道与驾车通勤。", "核对商业、医疗和学校的实际可达性。", "查看小区密度、停车、物业和成交周期。"],
        "sources": [],
    },
    "松江新城": {
        "positioning": "样本多把松江新城描述为发展较早、生活配套较成熟的郊区新城，距离市区是核心取舍。",
        "pros": ["居住空间、环境和生活配套常获认可。", "不同房龄与总价选择较丰富。", "对松江本地就业和家庭生活有较强匹配度。"],
        "cons": ["依赖 9 号线且高峰通勤时间较长。", "供应较多，投资与流动性观点分歧明显。", "新城、老城和大学城不能混为一谈。"],
        "verify": ["实测 9 号线高峰门到门时间。", "明确新城、大学城或老城具体位置。", "核对就业、学校、医疗与二手成交周期。"],
        "sources": [],
    },
}


def read_jsonl(path: Path, batch_id: str) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing crawl file for {batch_id}: {path}")
    records: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                record = json.loads(line)
                record["_batch_id"] = batch_id
                records.append(record)
    return records


def text(value: Any, limit: int | None = None) -> str:
    result = " ".join(str(value or "").split())
    return result if limit is None else result[:limit]


def source_url(note: dict[str, Any]) -> str:
    note_id = text(note.get("note_id"))
    # Tokens obtained during a logged-in search are transient access material;
    # never copy them into a clean output. The stable note ID remains traceable.
    return f"https://www.xiaohongshu.com/explore/{note_id}"


def note_is_relevant(note: dict[str, Any], sector: str) -> bool:
    return sector in f"{text(note.get('title'))} {text(note.get('desc'))}"


def build_dataset() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    raw_notes: list[dict[str, Any]] = []
    raw_comments: list[dict[str, Any]] = []
    for batch_id, directory in RAW_BATCHES:
        raw_notes.extend(read_jsonl(directory / f"search_contents_{CRAWL_DATE}.jsonl", batch_id))
        raw_comments.extend(read_jsonl(directory / f"search_comments_{CRAWL_DATE}.jsonl", batch_id))

    query_returns = Counter(text(note.get("source_keyword")) for note in raw_notes)
    notes_by_id: dict[str, dict[str, Any]] = {}
    for note in raw_notes:
        note_id = text(note.get("note_id"))
        if not note_id:
            continue
        keyword = text(note.get("source_keyword"))
        if note_id not in notes_by_id:
            notes_by_id[note_id] = {**note, "_keywords": {keyword}, "_batches": {note["_batch_id"]}}
        else:
            notes_by_id[note_id]["_keywords"].add(keyword)
            notes_by_id[note_id]["_batches"].add(note["_batch_id"])

    relevant_notes: list[dict[str, Any]] = []
    note_sectors: dict[str, list[str]] = {}
    for note_id, note in notes_by_id.items():
        candidate_sectors = {KEYWORD_TO_SECTOR[keyword] for keyword in note["_keywords"] if keyword in KEYWORD_TO_SECTOR}
        sectors = sorted(sector for sector in candidate_sectors if note_is_relevant(note, sector))
        if not sectors:
            continue
        note_sectors[note_id] = sectors
        relevant_notes.append({
            "sectors": "；".join(sectors),
            "source_keywords": "；".join(sorted(keyword for keyword in note["_keywords"] if keyword)),
            "batch_ids": "；".join(sorted(note["_batches"])),
            "note_id": note_id,
            "title": text(note.get("title")),
            "excerpt": text(note.get("desc"), 500),
            "published_at": text(note.get("time")),
            "likes": note.get("liked_count") or 0,
            "collects": note.get("collected_count") or 0,
            "comments": note.get("comment_count") or 0,
            "shares": note.get("share_count") or 0,
            "source_url": source_url(note),
        })

    comments_by_id: dict[str, dict[str, Any]] = {}
    for comment in raw_comments:
        comment_id = text(comment.get("comment_id"))
        note_id = text(comment.get("note_id"))
        if not comment_id or note_id not in note_sectors or comment_id in comments_by_id:
            continue
        body = text(comment.get("content"))
        if len(body) < 4:
            continue
        parent = notes_by_id[note_id]
        comments_by_id[comment_id] = {
            "sectors": "；".join(note_sectors[note_id]),
            "note_id": note_id,
            "content": body,
            "likes": comment.get("like_count") or 0,
            "source_url": source_url(parent),
        }

    metadata = {
        "crawl_date": CRAWL_DATE,
        "raw_batches": [{"id": batch_id, "directory": str(directory.relative_to(ROOT))} for batch_id, directory in RAW_BATCHES],
        "raw_note_records": len(raw_notes),
        "unique_note_records": len(notes_by_id),
        "relevant_unique_notes": len(relevant_notes),
        "raw_comment_records": len(raw_comments),
        "unique_sanitized_comments": len(comments_by_id),
        "query_returns": dict(sorted(query_returns.items())),
        "relevant_notes_by_sector": dict(sorted(Counter(sector for note in relevant_notes for sector in note["sectors"].split("；")).items())),
        "comments_by_sector": dict(sorted(Counter(sector for comment in comments_by_id.values() for sector in comment["sectors"].split("；")).items())),
        "map_sectors_without_xhs_sample": PENDING_MAP_SECTORS_WITHOUT_XHS_SAMPLE,
    }
    return relevant_notes, list(comments_by_id.values()), metadata


def write_outputs(notes: list[dict[str, Any]], comments: list[dict[str, Any]], metadata: dict[str, Any]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with (OUT_DIR / "relevant_notes.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(notes[0]) if notes else [])
        writer.writeheader()
        writer.writerows(notes)
    with (OUT_DIR / "sanitized_comments.jsonl").open("w", encoding="utf-8") as handle:
        for comment in comments:
            handle.write(json.dumps(comment, ensure_ascii=False) + "\n")
    with (OUT_DIR / "batch_manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    # Local website payload. It stays under ignored outputs/ so detailed
    # platform text is never bundled into the repository or a public build.
    with (OUT_DIR / "web_dataset.json").open("w", encoding="utf-8") as handle:
        json.dump({"meta": metadata, "notes": notes, "comments": comments}, handle, ensure_ascii=False)
        handle.write("\n")
    write_report(notes, metadata)


def write_report(notes: list[dict[str, Any]], metadata: dict[str, Any]) -> None:
    note_by_id = {note["note_id"]: note for note in notes}
    lines = [
        f"# 小红书上海房产板块观点样本：统一 {len(KEYWORD_TO_SECTOR)} 板块报告",
        "",
        f"> 采集日期：{CRAWL_DATE}。本报告是公开平台观点样本的归纳，不构成事实认定、房产推荐或投资建议。",
        "",
        "## 数据范围与去重",
        "",
        f"- 原始搜索返回：{metadata['raw_note_records']} 条正文记录；按 `note_id` 去重后 {metadata['unique_note_records']} 条。",
        f"- 正文相关样本：{metadata['relevant_unique_notes']} 条唯一正文（同帖命中多个关键词时只保留一条，并标注全部相关板块）。",
        f"- 原始一级评论：{metadata['raw_comment_records']} 条；按评论标识去重、去除过短内容并脱敏后：{metadata['unique_sanitized_comments']} 条。",
        f"- 共读取 {len(RAW_BATCHES)} 个彼此独立的本地原始批次；不抓二级评论，单并发采集。互动量仅作样本描述，不等同于真实性或代表性。",
        "",
        "## 各板块样本覆盖",
        "",
        "| 板块 | 搜索关键词 | 搜索返回 | 相关正文 | 有效一级评论 |",
        "| --- | --- | ---: | ---: | ---: |",
    ]
    for keyword, sector in KEYWORD_TO_SECTOR.items():
        lines.append(f"| {sector} | `{keyword}` | {metadata['query_returns'].get(keyword, 0)} | {metadata['relevant_notes_by_sector'].get(sector, 0)} | {metadata['comments_by_sector'].get(sector, 0)} |")

    lines.extend([
        "",
        "## 地图已登记但本快照未采集的板块",
        "",
        "以下板块只有可编辑地图候选，尚未建立小红书采集批次，因此不生成样本定位、利好、利空或代表来源：",
        "",
    ])
    for district_name, sectors in PENDING_MAP_SECTORS_WITHOUT_XHS_SAMPLE.items():
        lines.append(f"- {district_name}：{'、'.join(sectors)}。")

    for sector, analysis in SECTOR_ANALYSIS.items():
        lines.extend(["", f"## {sector}", "", f"**样本定位**：{analysis['positioning']}", "", "**样本中常见的有利因素**："])
        lines.extend(f"- {item}" for item in analysis["pros"])
        lines.extend(["", "**样本中常见的顾虑**："])
        lines.extend(f"- {item}" for item in analysis["cons"])
        lines.extend(["", "**购买前待核验**："])
        lines.extend(f"- {item}" for item in analysis["verify"])
        lines.extend(["", "**代表来源（供追溯，不代表事实背书）**："])
        selected = [note_by_id[note_id] for note_id in analysis["sources"] if note_id in note_by_id]
        # The initial manual candidates may have been filtered as off-topic.
        # Fill from independent matching posts in returned order, rather than
        # ranking by engagement, so interaction numbers do not determine voice.
        for note in notes:
            if sector in note["sectors"].split("；") and note not in selected:
                selected.append(note)
            if len(selected) == 5:
                break
        for note in selected[:5]:
            lines.append(f"- [{text(note['title'], 70) or '小红书原帖'}]({note['source_url']})")

    lines.extend([
        "",
        "## 使用边界",
        "",
        "- 请把本报告当作发现问题和生成实勘清单的入口；价格、交易、学校、规划、医疗、交通及交付信息须回到官方渠道、现场和专业人士核验。",
        "- 不以点赞、收藏或评论数量判断说法可靠性；同一叙事应至少寻找独立来源交叉验证。",
        "- 清洗输出不含发布者身份、用户哈希、评论标识、会话信息或登录信息。原始 JSONL 只作本地研究留存，受 `.gitignore` 保护。",
    ])
    (OUT_DIR / "REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    notes, comments, metadata = build_dataset()
    write_outputs(notes, comments, metadata)
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
