# 古美—莘庄来源

访问与核查日期：2026-07-23

## 官方事实来源

### 上海市水务局：古美街道排水规划行业意见

- URL: https://swj.sh.gov.cn/swyw/20241203/655b8d423c5e4308bc246b6f316b5cf2.html
- 文件：沪水务〔2024〕530 号，2024-12-03。
- 可用事实：规划范围为古美街道范围，总面积 6.2 平方公里；文中还给出新泾港、虹莘路、横新港、蒲汇塘、顾戴路等排水系统局部四至。
- 限制：不是市场古美定义，也没有可复用闭合 polygon、CRS 或矢量再发布许可。局部排水系统四至不能拼成古美市场面。

### 上海市规划和自然资源局：闵行主城片区中部板块单元规划

- URL: https://ghzyj.sh.gov.cn/cmsres/9b/9b26fb350c874366897f4dcd8535ebea/b118f9e036a68671dba7b6c6fe97ceb7.pdf
- 可用事实：古美、七宝、虹桥、梅陇、莘庄位于同一 84.9 平方公里规划板块关系中。
- 限制：PDF 图面没有明确的 GIS 再利用许可、地理配准坐标或公开矢量；只作空间关系和规划语义参考，不描摹 polygon。

### 闵行区：莘庄镇综合交通规划（2023—2035 年）

- URL: https://zwgk.shmh.gov.cn/mh-xxgk-cms/UploadPath/uploadfile/2024-01-23/8e538285-f121-4463-98ea-7f29978f7704.pdf
- 可用事实：莘庄镇总面积 19.14 平方公里，与 1 区、5 街镇毗邻；莘庄主城副中心是镇域内不同的功能核心。
- 限制：公开文本未提供完整闭合线表或授权矢量，不可从 PDF 图面提取坐标并称为官方 polygon。

### 上海市规划和自然资源局：莘庄城市副中心“十四五”规划说明

- URL: https://ghzyj.sh.gov.cn/mh/20210518/431524a24e0f42078a1ee6a0a8e3fc52.html
- 可用事实：莘庄城市副中心包括莘庄枢纽、莘庄商务区等区域，总面积约 4.3 平方公里；“双核一带一环”包含枢纽核心、春申湖北部商务核心和七莘路联系带。
- 限制：4.3 平方公里副中心不是莘庄镇或市场莘庄的同义词；网页中的图片不提供可复用坐标或 polygon 许可。

### 天地图·上海：闵行区行政区划示意图

- URL: https://shanghai.tianditu.gov.cn/map/data/standardMap/上海市标准地图/8-闵行区行政区划示意图.pdf
- 版本：2025-07，沪 S（2025）040 号。
- 可用事实：核对街镇名称、形状和邻接关系。
- 限制：图面注明行政界线仅供参考；PDF 没有 GIS CRS、地理配准或矢量再发布许可，不从图面反向描线。

## 开放几何来源

### Geofabrik / OpenStreetMap 固定快照

- 快照 ID：`osm-geofabrik-shanghai-260721`
- 固定 URL: https://download.geofabrik.de/asia/china/shanghai-260721-free.gpkg.zip
- 快照时间：2026-07-21T20:21:50Z；下载核验日期：2026-07-22。
- archive SHA-256: `7311f5f65ab50a107fc5554de33c7b4ef93daa7a8af104be2b79f1eeafad4a1b`
- GPKG SHA-256: `3a45dcc2173cc1e67471e0190564b7f6c19b3655697d0eff830bda48e2dcbba1`
- CRS：`OGC:CRS84`；输出按 WGS84 经度、纬度顺序。
- 许可：ODbL 1.0；署名 `© OpenStreetMap contributors`。公开衍生数据库前需评估并履行 ODbL 共享同许可义务。
- 本 workpack 复用现有固定快照生成的古美路街道 relation `14187991` 和莘庄镇 relation `14187988` 行政参考面，没有调用或复制商业地图 polygon。

## 独立卖方语义来源

这些页面仅用于板块身份、别名和项目归属核查，不复制页面 polygon、坐标、价格或宣传结论。

### 安居客（58 集团来源家族）

- 闵行板块列表：https://sh.fang.anjuke.com/loupan/minhang/
- 莘庄板块页：https://sh.fang.anjuke.com/fangjia/minhang_106/
- 春申板块页：https://sh.fang.anjuke.com/fangjia/minhang_107/
- 中企云启春申项目页：https://sh.fang.anjuke.com/loupan/520608.html
- 观察：板块导航把“古美罗阳、七宝、春申、梅陇、莘庄”分别列出；但“中企云启春申”又被归入莘庄，说明春申—莘庄项目归属存在边界争议。
- 权利限制：网页正常公开查看，仅记录分类事实和 URL；不抓取或复刻其地图几何。

### 房天下（搜房来源家族）

- 古美小区页：https://sh.esf.fang.com/housing/18_1601_1_39_0_0_1_0_0_0/
- 莘庄小区页：https://sh.esf.fang.com/housing/18_1599_0_26_0_0_3_0_0_0/
- 春申小区页：https://sh.esf.fang.com/housing/18_1609_0_0_0_0_1_0_0_0/
- 莘庄新房页：https://sh.newhouse.fang.com/house/s/shenzhuang/
- 观察：商圈导航把“春申、古美、罗阳、梅陇、七宝、莘庄”并列；春申页包含万科假日风景、春申景城等，莘庄页同时包含部分春申路项目，边界并非无争议。
- 权利限制：只记录分类事实和 URL；不复制地图 polygon。

## 项目定位核验

- `docs/PROJECT-LOCATION-VERIFICATION-2026-07-22.md`：用于核对中企云启春申（备案名莘汇名苑，秀涟路 77 弄）及安高申陇院、朗拾花语的地址/行政关系。
- `src/data/project-locations.ts`：只使用已核验的代表点做 point-in-polygon 和距离 QA；代表点不是项目红线，不能据此切割项目。

## 未使用的数据

- 本工作包没有读取 `outputs/xhs_raw/` 或 `outputs/xhs_analysis/`，也没有把小红书观点作为边界事实。
- 没有从高德、安居客、房天下、链家或其他商业地图复制 polygon。

## 第二阶段：项目归属证据

以下页面来自两个独立卖方来源家族。只记录其商圈分类、项目名称和地址，不读取或复制其地图 polygon。

### 古美 / 古美罗阳

安居客（58 集团）：

- 古美罗阳房源页：https://shanghai.anjuke.com/sale/minhang-q-gumeiluoyang/
- 新梅花苑：https://shanghai.anjuke.com/ditie-sale/b11-d3-f13-t9/
- 南方城：https://shanghai.anjuke.com/community/view/4689/jiedu-464524781-bz/
- 平南一村：https://shanghai.anjuke.com/ditie-sale/b2-d2_123-f12-l2-t9/
- 观察：东苑古龙城、平南一村、新梅花苑、南方城等均使用“古美罗阳”归属。

房天下（搜房）：

- 古美小区列表：https://sh.esf.fang.com/housing/18_1601_0_39_0_0_1_5%2C4_0_0/
- 新梅花苑：https://sh.esf.fang.com/loupan/1210008939/chushou/
- 南方城：https://sh.esf.fang.com/loupan/1210041233/chushou/
- 观察：东兰小区、华一新城、平南一二村、新梅花苑、南方城等均被列入古美。

几何裁定：两家同时支持填平古美行政 relation 内东兰/华一等住宅项目洞；但南侧项目只证明“项目属于古美罗阳”，没有给出项目之间的连续市场外框，因此不据此向梅陇机械扩面。

### 莘庄

安居客（58 集团）：

- 莘庄南广场项目示例：https://shanghai.anjuke.com/community/trends/2905
- 名都新城项目示例：https://shanghai.anjuke.com/sale/minhang/a11913-j10-m13477/
- 观察：名都新城使用“莘庄南广场”，上海康城使用“莘庄北广场”。

房天下（搜房）：

- 莘庄小区列表：https://sh.esf.fang.com/housing/18_1599_0_26_0_0_3_0_0_0/
- 莘庄新房页：https://sh.newhouse.fang.com/house/s/shenzhuang/
- 观察：名都新城、柏林春天、东苑世纪名门等归入莘庄；“中企云启春申”也被归入莘庄，说明项目名称不能单独决定春申归属。

几何裁定：名都新城和柏林春天按完整 OSM residential landuse 边界保留在莘庄；南北广场只登记为子范围。

### 春申

安居客（58 集团）：

- 春申房源页：https://shanghai.anjuke.com/gongyu-sale/chunshen/
- 高兴花园：https://shanghai.anjuke.com/community/view/817109/jiedu-3229538/
- 观察：春申景城、上海春城、高兴花园、中海寰宇天下、万科假日风景等使用春申归属。

房天下（搜房）：

- 春申小区页：https://sh.esf.fang.com/housing/18_1609_0_0_0_0_1_0_0_0/
- 观察：万科假日风景、春申景城、高兴花园、上海春城、中海寰宇天下、莘南花苑等归入春申。

几何裁定：两家共同支持的 12 个、且固定 OSM 快照中有完整住宅 landuse 的项目整体纳入春申；名都新城和柏林春天整体排除。

## 第二阶段：几何构建细节

- 春申道路框使用固定快照 `gis_osm_roads_free` 中所有同名路段，按道路走廊采样重建中心线候选：都市路、莘朱路、虹梅南路、银都路。
- 道路均存在分隔式路段；当前线位是固定 OSM 对象上的候选中心线采样，不声称为法定道路红线或唯一中位线。
- 项目修正使用同一快照 `gis_osm_landuse_a_free` 的完整 residential/retail polygon，仅用于保持项目完整；OSM ID 与项目名称保留在候选属性及 QA 项目清单中。
- 几何只来自 ODbL 固定快照和本项目独立裁定；商业卖方只贡献分类事实，不贡献坐标。
- 由于卖方分类在莘庄南广场—春申交错，当前莘庄为 MultiPolygon、春申保留项目洞。它们已并入中央内部复核候选，但仍不满足发布级连续主面的要求。
