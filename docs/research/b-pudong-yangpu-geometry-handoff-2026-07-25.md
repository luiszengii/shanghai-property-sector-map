# B 级：浦东—杨浦五个板块的可复现几何交接

日期：2026-07-25
范围：潍坊、花木、联洋、东外滩、定海路。
目的：为下一位实施者提供只使用官方文字/行政资料与 OpenStreetMap 的可编辑参考代理方案。本文不是市场板块法定边界，也不使用商业平台 polygon。

## 统一的来源记录与可复现快照

以下三个官方页面需要在 `sources.json` 新增不可变记录（不能只沿用本文的 `PD4` / `HY3` / `HY4` 文献缩写）：

| 建议 source ID | 页面 | 用途 |
| --- | --- | --- |
| `official-pudong-lianyang-community-service-list-2022` | [花木街道联洋社区公共法律服务一览表](https://www.pudong.gov.cn/zwgk/qt-hmjd/2022/286/33685.html) | 逐项列出联洋一至七居委及其辖区小区、门牌。 |
| `official-yangpu-riverside-key-functional-area-2025` | [杨浦滨江重点功能区](https://www.shyp.gov.cn/zhengwu/zwgk-qzfwj/2025/220/ea2d2053c6de6337ba1ac7992724c6d1.html) | 只用于限定“杨浦滨江”河岸功能范围，绝不直接作为东外滩市场面。 |
| `official-yangpu-dinghai-road-subdistrict-profile-2018` | [定海路街道概况](https://www.shyp.gov.cn/shypq/sqld-sqjs/20180103/53419.html) | 定海路街道外缘文字四至、复兴岛历史/人工岛背景。 |

道路和 relation 的坐标宜新增一个查询型来源，例如 `osm-overpass-b-pudong-yangpu-2026-07-25`，并在 note 中写明：WGS84、查询日、Overpass 查询文本/哈希、OSM contributors、ODbL-1.0。下列 relation 在 2026-07-25 通过 OSM API `relation/{id}.json` 核验；实施时应锁定这些对象的版本，而非取随时间变化的网页形状。

| 对象 | relation URL | 核验版本 / 时间 | 用途 |
| --- | --- | --- | --- |
| 潍坊新村街道 | [12867311](https://www.openstreetmap.org/relation/12867311) | v5, 2025-09-22T22:37:34Z | 潍坊行政底板；要用官方 2025 调整公告重新校正其与花木的公共界。 |
| 花木街道 | [12867438](https://www.openstreetmap.org/relation/12867438) | v8, 2025-09-22T22:37:34Z | 花木行政底板和联洋成员集的外侧约束。 |
| 平凉路街道 | [13464332](https://www.openstreetmap.org/relation/13464332) | v6, 2026-03-09T07:21:45Z | 东外滩的行政起画包络。 |
| 定海路街道 | [13466400](https://www.openstreetmap.org/relation/13466400) | v12, 2026-03-09T07:21:44Z | 定海路行政起画包络。 |

现有来源可直接复用：`official-pudong-boundary-adjustment-2025`、`osm-geofabrik-shanghai-260721`、`osm-odbl-1`。公告的逐字关键句是：“将潍坊新村街道与花木街道行政区域界线变更为：以杨高中路、杨高南路为界。”

## 1. 潍坊—花木：同一次构造、同一条共享线

### 输入与可复现对象

- 官方主依据：`official-pudong-boundary-adjustment-2025`；它只证明两街道的调整界，不证明任何一方等于楼市板块。
- OSM 行政底板：relation 12867311、12867438（见上表）。
- 必须一次性查询并冻结的道路对象：`highway=*` 且 `name=杨高中路` / `name=杨高南路`，范围限定在两个 relation 外包框的并集。不要按名字挑单条 way；高架、辅路和分幅会返回多个 way。

### 推荐输出

输出两个 `administrative_reference_proxy`（或更明确的 `market_admin_proxy_with_official_adjusted_edge`）：

1. 以各自 relation 的封闭面为初始壳；
2. 计算两 relation 接触/最近的官方调整段端点；
3. 从**同一份**杨高中路、杨高南路节点序列选取两端点之间的中心线，并把完全相同的坐标数组写入双方；
4. 按公告确定的两侧裁切初始壳，保留所属一侧；外缘仍只是行政参考，不扩展至源深、梅园、陆家嘴、世纪公园、杨东或联洋；
5. 在属性中登记 `sharedEdgeId: pudong-weifang-huamu-yanggao-2025`、道路 way ID/版本和两个端点 node ID。

不应手工判断“整条杨高中路/杨高南路”在何处都属于共同界；公告未给出端点。端点必须由两个行政 relation 与道路的实际相交/接触段导出并记录。这样能避免把道路延长线错误地切进不相邻片区。

## 2. 联洋：成员集代理，不能把花木整面改名

### 官方成员锚点

`official-pudong-lianyang-community-service-list-2022` 列出如下住宅/居委成员，可作为 `member-set` 的来源；它没有公布居委 polygon，因此不应伪称“官方闭合边界”。

| 居委 | 官方列出的辖区小区/门牌 |
| --- | --- |
| 联洋一居委 | 御景园（锦绣路 888 弄）、天安花园（锦绣路 800 弄）、联洋新苑（迎春路 736 弄） |
| 联洋二居委 | 当代清水园（芳甸路 77 弄）、联洋花园（丁香路 901/999/1089 弄） |
| 联洋三居委 | 金樽花园/金色维也纳（锦绣路 333 弄）、御翠园（花木路 1883 弄）、千秋别墅（柳杉路 229 弄）、四季雅苑（花木路 1983 弄）、九间堂（芳甸路 599 弄） |
| 联洋四居委 | 水清木华（芳甸路 333 弄）、华丽家族（锦绣路 666 弄）、中邦晶座（丁香路 1066 弄） |
| 联洋五居委 | 吉云公寓（罗山路 1502 弄）、仁恒河滨城（丁香路 1599/1399/1299 弄） |
| 联洋六居委 | 浦东虹桥花园（锦绣路 300 弄）、浦东虹桥公寓（迎春路 1355 弄） |
| 联洋七居委 | 联洋年华园（丁香路 910 弄） |

### 推荐构造

1. 从上述地址逐项匹配 OSM `building`/`landuse=residential`/地址节点；每项记录匹配 object ID、版本、匹配置信度。没有 OSM 对象的成员保留为待人工放点，不能靠名称模糊匹配自动塞入。
2. 将已核成员的楼宇或居住地块并集，沿**相邻公共道路中心线**闭合为 `community_member_reference_proxy`。闭合道路也须冻结 way/node ID。
3. 外侧约束只能是花木 relation 12867438；不得把整个 relation、世纪公园或非列名设施自动吞入。对花木、杨东、金桥/碧云的接口先标为 `pending-neighbor-cut`。
4. 若成员地块尚不能形成连续闭环，输出 MultiPolygon 成员集而不是虚构一个大外圈；编辑器可以继续手工并面。

## 3. 东外滩—定海路：以街道同源边做行政参考，河岸功能区只作筛选

### 输入

- 东外滩起画壳：OSM [平凉路街道 relation 13464332](https://www.openstreetmap.org/relation/13464332)；没有公开资料把它等同于“东外滩”市场，属性须明说是行政参考。
- 定海路起画壳：OSM [定海路街道 relation 13466400](https://www.openstreetmap.org/relation/13466400)。官方 `HY4` 的文字四至是：东、南隔黄浦江；西界隆昌路与宁武路；北沿周家嘴路和海安路。
- 河岸约束：`official-yangpu-riverside-key-functional-area-2025` 给出的 15.6 km² 杨浦滨江功能区是“秦皇岛路—杨树浦路—大连路—周家嘴路—许昌路—昆明路—怀德路—平凉路—内江路—控江路—军工路—闸北电厂—黄浦江”。它明显大于东外滩，故只能用于确认沿江候选不越出功能区，而非直接输出该大面。

### 配对构造与共享边

1. 用同一次 OSM relation 下载把 13464332 和 13466400 多边形拓扑化；不要分别屏幕描线。
2. 从两面共同的边界 way/node 序列提取唯一 `sharedEdgeId: yangpu-pingliang-dinghai-admin`。若 relation 当前没有严格共同坐标，先对同源 way ID/node ID 而不是经纬度近邻做重建；仍无共同成员时必须报告，不能做 1–5 m 的平行双线。
3. 东外滩输出 `riverside_admin_reference_proxy`：平凉路街道行政壳与杨浦滨江功能区的相交/邻接约束，并沿上述共享边止于定海路。不要把 15.6 km² 功能区全域、北外滩或平凉路街道全域包装成市场定稿。
4. 定海路输出 `administrative_reference_proxy`：relation 13466400 的形状作为可编辑底板，外缘以 HY4 四至逐段复核；复兴岛、码头/产业空间和已分给东外滩的部分只能在有独立开放要素或后续用户编辑依据时扣除。当前 HY4 仅叙述复兴岛历史，**不提供可直接扣除的产业 polygon**。
5. 若东外滩需要从定海路中扣除，双方必须复用第 2 步同一 shared edge；任何复兴岛扣除面应独立编号，且不能通过“剩余面归属”默认为定海路住宅市场。

## 实施前验收清单

- 每一个新 feature 的 `sourceIds`、`geometryVerificationSourceIds`、OSM object ID/version、提取日期、WGS84 坐标、`proxyType` 完整可读。
- 潍坊—花木和东外滩—定海路各有一个显式 `sharedEdgeId`，且测试逐坐标比较双方共享节点序列（允许反向），不得只测 bbox 相邻。
- 联洋若为成员 MultiPolygon，要保留每个成员的官方原文名称/门牌与 OSM 匹配证据；不为“好看”补造外边。
- `source-backed-proxy` 状态必须替换活跃编辑器中的 seed，不删除原始 `editorial-seed` 回退记录。
- UI 文案应表达“公开行政/成员/功能参考代理”，不得写成“精确楼市板块边界”。
