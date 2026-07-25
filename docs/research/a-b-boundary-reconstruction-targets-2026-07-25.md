# A / B 级板块边界重建目标清单

日期：2026-07-25
输入：`editorial-seeds-46-public-evidence-audit-2026-07-24.md`、当前 `editorial-seeds`、`source-backed-proxies` 与 `sources.json`。
用途：为把 A、B 级 25 个覆盖性椭圆替换为有来源、可编辑的参考代理提供唯一执行清单。这里的面是规划、功能或行政参考代理；不把它们表述为法定或商业平台的楼市板块原始边界。

## 计数与当前状态

| 口径 | 数量 | 说明 |
| --- | ---: | --- |
| A 级目标 | 12 | 官方闭合四至或完整规划范围。 |
| B 级目标 | 13 | 行政/功能包络、官方成员集或可复现 OSM relation，必须与邻块联合裁切。 |
| A + B | 25 | 与原审计矩阵逐项相加一致。 |
| 原始 `editorial-seeds.wgs84.json` | 46 | 文件保留全部初稿，便于编辑回退，故仍含苏河湾、不夜城的旧椭圆。 |
| 当前已替换为 `source-backed-proxy` | 2 | 苏河湾、不夜城；活跃渲染与编辑目录应优先采用代理，剩余实际椭圆为 44。 |

因此不存在“12 + 13 与 46 项审计不一致”：其余 21 项是 C 级 20 项和 D 级 1 项。当前看似 46 个椭圆，是原始 seed 文件没有删除已被覆盖的两条记录；不是 A/B 目标数变成了 23。

## A 级：官方闭合范围

| ID / 名称 | 主来源（审计引用 ID；仓库 source ID） | 推荐几何方法 | 必须共同处理的邻块 / 共享边 |
| --- | --- | --- | --- |
| `sector_xijiao` / 西郊 | [C1 长宁区公园城市规划](https://zwgk.shcn.gov.cn/xxgk/zdxzjc-2024/2024/92/72630/733d05ebd722401ba49e609c2939df0f.pdf)；`official-changning-xijiao-park-city-2024` | 以天山西路、新泾港、金浜路、外环绿道做唯一闭合测试；输出 `core_reference_proxy`。 | 与虹桥、龙柏、金虹桥及新泾镇方向逐边检查；不得用样板区外缘吞并相邻住宅市场。 |
| `sector_buyecheng` / 不夜城 | [J1 苏河湾地区“十三五”规划](https://www.jingan.gov.cn/govxxgk/JA0/2017-02-22/33511245-5172-48d2-aa93-1d48e76829c6.html)；`official-jingan-suhewan-2017-functional-scope` | 已完成：按西部片区文字四至 + 2026-07-25 OSM 道路节点重建 `historical_functional_proxy`。 | 与苏河湾共用共和新路边；与天目西路、闸北公园方向只做相邻核验。 |
| `sector_suhewan` / 苏河湾 | [J1 苏河湾地区“十三五”规划](https://www.jingan.gov.cn/govxxgk/JA0/2017-02-22/33511245-5172-48d2-aa93-1d48e76829c6.html)；`official-jingan-suhewan-2017-functional-scope` | 已完成：按东部片区文字四至 + 2026-07-25 OSM 道路节点重建 `historical_functional_proxy`。 | 与不夜城共用共和新路边；南侧与南京西路、北侧与西藏北路方向只做相邻核验。 |
| `sector_waigaoqiao` / 外高桥 | [PD7 外高桥保税区控规修编草案](https://www.pudong.gov.cn/zwgk/azt_fzgh/2022/306/263595.html)；审计引用 `PD7`（当前 `sources.json` 尚无专用 ID） | 以东港电路/浦东运河、五洲大道、杨高北路、威斯路闭合；标注 `planning_reference_proxy`。 | 与高桥、高行、森兰和浦东运河/港区交界联合检查；产业港区不能静默归为住宅市场。 |
| `sector_lingang_main_city` / 临港主城区 | [PD8 南汇新城“十四五”规划建设行动方案](https://ghzyj.sh.gov.cn/gzdt/20210416/6ea147ee40ae4e93bf54311d2b6af0f4.html)；审计引用 `PD8`（当前 `sources.json` 尚无专用 ID） | 若产品口径确认“临港主城区 = 南汇新城规划口径”，建 `planning_reference_proxy`；否则只先保留滴水湖核心子范围。 | 与滴水湖、书院、泥城及滨海生态/港区接口单独裁切；不得把 343.3 km² 直接宣称为住宅市场。 |
| `sector_ruihong_new_town` / 瑞虹新城 | [HY1 张江虹口园范围及瑞虹地块](https://www.shhk.gov.cn/xwzx/002008/002008040/20230728/5dee74ee-c47e-4c93-9ed6-bc95187e2af3.html)；审计引用 `HY1`（当前 `sources.json` 尚无专用 ID） | 按天虹路—瑞虹路—虹关路—虹镇老街—飞虹路闭合 `core_reference_proxy`。 | 与临平路、北外滩、四川北路、嘉兴路方向共享接口需用道路同线；不得扩成完整嘉兴路街道。 |
| `sector_huangxing_park` / 黄兴公园 | [HY5 黄兴公园四至](https://www.shyp.gov.cn/zhengwu/wlj-lyzy/2025/219/99a184770fa401b763cecdae792c4444.html)；审计引用 `HY5`（当前 `sources.json` 尚无专用 ID） | 以营口路、双阳北路、走马塘、国顺东路生成 `core_reference_proxy`；再用人工编辑扩至住宅口径。 | 与黄兴路、五角场、定海路方向的住宅扩展必须分批共边裁切；公园本体不能直接等同市场面。 |
| `sector_jiading_new_city` / 嘉定新城 | [JD2 嘉定新城整体城市设计](https://www.shanghai.gov.cn/cmsres/53/53466d85a4a64ed69b9071836d658f66/b523ca9d5fc7291c4c8848d0fb942c03.pdf)；审计引用 `JD2`（当前 `sources.json` 尚无专用 ID） | 将 159.5 km² 总体设计范围仅作为 `planning_reference_proxy`；住宅初稿围绕白银路、远香湖、嘉定新城站另收边。 | 必须同嘉定老城、菊园、新成路、马陆/南翔接口联合裁切；不得以全规划面覆盖相邻板块。 |
| `sector_shanghai_university` / 上大 | [BS2 环上大科技园“十四五”规划](https://apps.shbsq.gov.cn/attr/ueditor/da134fd8-aefd-4a04-8eed-db36f1e884d0.pdf)；审计引用 `BS2`（当前 `sources.json` 尚无专用 ID） | 将约 10 km² 上大周边规划范围做 `planning_reference_proxy`，再剔除高校和产业非住宅部分。 | 与南大、大场、祁连山路方向联合裁切；校园范围与住宅组团不得混为一面。 |
| `sector_nanda` / 南大 | [BS3 沪府〔2020〕50 号 W12-1301 单元控详规批复](https://www.shanghai.gov.cn/nw12344/20200910/0001-12344_65634.html)；审计引用 `BS3`（当前 `sources.json` 尚无专用 ID） | 以单元文字四至和 628.9 ha 生成 `planning_reference_proxy`。 | 与上大、大场、桃浦及普陀侧共享界按单元边界统一；显式保留产业、绿地和跨区部分。 |
| `sector_songbao` / 淞宝 | [BS5 淞宝单元规划](https://ghzyj.sh.gov.cn/zcdygh/20231013/73f11a45a0e7451199b0b504b750967b.html)；审计引用 `BS5`（当前 `sources.json` 尚无专用 ID） | 基于获批单元规划建立只读 `planning_reference_proxy`；只从文字或开放道路/水系重建，不描摹附图。 | 与吴淞、高境、宝山老城和港口水域共同裁切；需排除港口、产业用地。 |
| `sector_jiuting` / 九亭 | [SJ1 九亭新市镇国土空间总体规划草案](https://www.songjiang.gov.cn/zmhd/004002/20191129/05526a29-8cac-41dc-b1e4-f01322d42835.html)；审计引用 `SJ1`（当前 `sources.json` 尚无专用 ID） | 以 G50、G60、嘉闵高架、淀浦河闭合 31.32 km² 规划参考面。 | 必须与九里亭、莘闵别墅、泗泾及莘庄方向共边拆分；不可把整个新市镇直接标成住宅市场。 |

## B 级：行政 / 社区包络，必须联合裁切

| ID / 名称 | 主来源（审计引用 ID；仓库 source ID） | 推荐几何方法 | 必须共同处理的邻块 / 共享边 |
| --- | --- | --- | --- |
| `sector_yangcheng` / 阳城 | [J3 彭浦镇阳城、永和相关文明小区公示](https://www.jingan.gov.cn/zmhd/007008/007008001/20190104/9e5bfd22-28f0-4d15-9cc0-fb2bfb70ead1.html)；审计引用 `J3` | 以彭浦镇 relation 作最大包络，在完整小区和道路处裁出住宅核心。 | 必须与永和同批；并与彭浦、大宁、共康共同解决外缘。 |
| `sector_yonghe` / 永和 | [J3 彭浦镇阳城、永和相关文明小区公示](https://www.jingan.gov.cn/zmhd/007008/007008001/20190104/9e5bfd22-28f0-4d15-9cc0-fb2bfb70ead1.html)；审计引用 `J3` | 以同一彭浦镇包络内的永和二村、永和东村、永和家园成员集及道路裁切。 | 必须与阳城共画互斥共享边；再与彭浦、大宁、共康联裁。 |
| `sector_pengpu` / 彭浦 | [J4 彭浦新村街道介绍](https://www.jingan.gov.cn/jagl/006001/006001005/006001005002/20160425/7751cb83-debb-4699-a4c2-cce39dd513a4.html)；OSM relation [14186008](https://www.openstreetmap.org/relation/14186008)；`osm-geofabrik-shanghai-260721` | 将彭浦新村街道 relation 用作行政核心，不把它当完整市场。 | 与大宁、共康、阳城、永和同时裁边；正例已越行政东界时须留编辑证据。 |
| `sector_zhenguang` / 真光 | [P2 真如镇街道居民区基本情况](https://www.shpt.gov.cn/zrzjd-jiedaozhen/bmfw-zrzjd/20220801/848477.html)；审计引用 `P2` | 按“真光块”17 个居委成员拼接初版，必要时以相关行政包络为底。 | 与真如、长征、桃浦和曹杨方向共同裁切；成员居委边界需共用节点。 |
| `sector_weifang` / 潍坊 | [PD1 浦东新区部分镇、街道行政区域界线调整公告](https://www.pudong.gov.cn/zwgk/qt-qzf/2025/325/348121.html)；`official-pudong-boundary-adjustment-2025`，OSM relation [12867311](https://www.openstreetmap.org/relation/12867311) | 用历史街道 relation 作底，按公告以杨高中路、杨高南路修正潍坊—花木共享边。 | 与花木必须同批；外缘与源深、梅园、陆家嘴方向联合裁切。 |
| `sector_huamu` / 花木 | [PD1 浦东新区部分镇、街道行政区域界线调整公告](https://www.pudong.gov.cn/zwgk/qt-qzf/2025/325/348121.html)；`official-pudong-boundary-adjustment-2025`，OSM relation [12867438](https://www.openstreetmap.org/relation/12867438) | 用行政 relation 底板并采用公告边界；保留内部市场裁切。 | 与潍坊共用杨高中路、杨高南路边；与联洋、杨东、世纪公园方向联合裁切。 |
| `sector_lianyang` / 联洋 | [PD4 花木街道公共法律服务一览表](https://www.pudong.gov.cn/zwgk/qt-hmjd/2022/286/33685.html)；审计引用 `PD4` | 先按联洋一至七居委的住宅成员集拼接，再沿公共道路闭合。 | 与花木、杨东、金桥/碧云方向检查接口；不得将整个花木行政面吞入。 |
| `sector_yangpu_dongwaitan` / 东外滩 | [HY3 杨浦滨江重点功能区](https://www.shyp.gov.cn/zhengwu/zwgk-qzfwj/2025/220/ea2d2053c6de6337ba1ac7992724c6d1.html)；审计引用 `HY3` | 以平凉路街道滨江住宅区作起画包络，结合官方功能区仅定位河岸范围。 | 与定海路、平凉路、北外滩和滨江水岸共同裁切；禁止使用 15.6 km² 功能区全域。 |
| `sector_dinghai_road` / 定海路 | [HY4 定海路街道概况](https://www.shyp.gov.cn/shypq/sqld-sqjs/20180103/53419.html)；OSM relation [13466400](https://www.openstreetmap.org/relation/13466400)；`osm-geofabrik-shanghai-260721` | 先用街道 relation 替换椭圆，再扣除复兴岛产业区和东外滩组成部分。 | 与东外滩同批；与复兴岛、平凉路、杨浦滨江接口明确共边。 |
| `sector_jiading_old_city` / 嘉定老城 | [JD3 嘉定镇街道关于嘉定老城区的会办意见](https://www.jiading.gov.cn/publicity/jggk/dbjyhzxta/bljggk/181933)；审计引用 `JD3` | 以嘉定镇街道 relation 作强核心代理，并以道路/河道裁切。 | 与嘉定新城、菊园、新成路、马陆方向同批复核；禁止扩为整个嘉定区。 |
| `sector_dahua` / 大华 | [BS1 大华居委会四至](https://xxgk.shbsq.gov.cn/article.html?infoid=51ed4693-937a-4e72-82ed-ca12ac887199)；审计引用 `BS1` | 先并集已公开四至的大华一至五村居委，补足连续住宅组团。 | 与大场、上大、共康、祁连山路方向联合裁切；不能以单一大华小区包络全板块。 |
| `sector_songjiang_university_town` / 松江大学城 | [SJ3 广富林街道居委会四至和管理范围调整通知](https://www.songjiang.gov.cn/govxxgk/SHSJ70/2023-04-28/4a824af6-0291-4fa4-bae4-2525a08bd347.html)；审计引用 `SJ3` | 拼接与大学城相交社区的道路/河流边，保留校园和非住宅区为排除洞或外部区域。 | 与松江老城、松江新城、广富林、佘山/九亭方向复核；校园边不得当住宅市场边。 |
| `sector_chongming_new_city` / 崇明新城 | [CM1 城桥新城总体规划](https://shcm.gov.cn/govxxgk/qghzyj/2019-09-23/aebe9c18-3fb1-45b3-ad64-5f8ac4d2291d.html)；审计引用 `CM1`，`official-chongming-tri-islands-overview` 仅作岛域核验 | 以西、中、东区连续住宅组团重建新城核心，规划工业园只作排除/参照。 | 与城桥镇其余区域、东滩/生态及产业园边界分开；不得使用城桥镇全域或全总规范围。 |

## 实施约束

1. 每次共同裁切要把共享道路、河流或行政 relation 的同一段坐标复用到双方，而不是各自近似描线。
2. 文字四至需要通过开放道路/水系或已许可的行政关系重建；不得从 PDF 图片或商业地图描摹、下载或反推 polygon。
3. 对本表中“当前 `sources.json` 尚无专用 ID”的来源，实施前应先新增不可变的来源记录；本表暂以原审计文献编号作为来源 ID，避免伪造已有数据记录。
4. 新几何须说明 `proxyType`、WGS84、生成日期、原始来源与邻接裁切依据，并保留 OSM 的对象 ID、版本、提取日期与 ODbL 署名要求。
