# 上海官方行政区边界数据调研

> 核对日期：2026-07-22。仅采用政府部门、天地图及官方测绘机构的一手来源。

## 结论

需要把两级边界分开看：

- **上海 16 个区的区界**：国家天地图有官方 GeoJSON 生成/下载能力，但没有找到“无需登录、固定 URL 直接下载”的正式下载地址。
- **各区行政区划图内部的街道/镇界**：这才是图上更接近部分楼市板块的细分边界。核查到 2026-07-22 为止，**没有找到与这批 2025 年标准地图同版、覆盖全市、公开下载的官方 GeoJSON/SHP/WFS/FeatureServer**。标准地图页面本身只发布 JPG 和 PDF。

当前最合适的来源是国家天地图的[行政区划可视化下载页](https://cloudcenter.tianditu.gov.cn/administrativeDivision)：选择“上海市”，下载层级选“县”，格式为 GeoJSON。页面明确标注数据更新时间为 **2025 年 9 月**、更新内容为“局部数据更新”，并限定“**该数据仅供地图可视化使用**”。预览页面可匿名访问，但实际生成、下载会跳转天地图统一登录，登录后还可能需要滑块验证。页面没有明确声明坐标系或开放数据许可证，因此取得文件后不能自行假定为 WGS84/GCJ-02，也不能默认允许任意再分发。

该下载页目前只提供“省 / 市 / 县”三级；“上海市 → 县”得到的是 16 个区，不包含徐泾镇、三林镇、张江镇、大宁路街道等街镇面。它也没有说明与“天地图·上海”2025 年标准地图共用同一套制图数据库或同一版界线，因此只能把它视为另一套官方区界来源，不能声称其轮廓与 PDF 完全同源。

## 官方来源对比

| 来源 | 能否得到 16 区面 | 格式 | 访问条件 | 适合本项目吗 |
|---|---|---|---|---|
| [国家天地图行政区划可视化](https://cloudcenter.tianditu.gov.cn/administrativeDivision) | 是；“上海市 → 县” | GeoJSON | 预览公开；下载需天地图登录，可能有滑块验证 | **首选**，但上线前需核对坐标系、属性字段和使用许可 |
| [民政部全国行政区划信息查询平台](http://xzqh.mca.gov.cn/map) | 是 | [上海县级行政区 TopoJSON](http://xzqh.mca.gov.cn/data/310000_xian.json)，不是 GeoJSON | 可直接访问，无 Key/登录 | 可作第二官方参照；页面未声明 CRS、更新时间和再分发许可 |
| [天地图·上海标准地图](https://shanghai.tianditu.gov.cn/map/views/standardMap.html) | 图上包含 16 区区界；各区图还画出街道/镇界 | JPG / PDF（PDF 含矢量绘图路径，但不是地理空间数据） | 可直接查看、下载 | 适合视觉核对；不能直接作为 GeoJSON 使用 |
| 上海市测绘院数字化成果 | 可申请专业测绘成果 | 官方材料明确的电子地形图为 DWG | 需说明合法用途和范围；部分范围还需审批 | 不适合当天匿名取数，公开网站使用还需另行确认授权 |

## 天地图·上海核对结果

- [标准地图清单脚本](https://shanghai.tianditu.gov.cn/map/js/standardMap/standardMap-config.js)列出了上海全市、中心城区及 16 个区的行政区划示意图；[下载脚本](https://shanghai.tianditu.gov.cn/map/js/standardMap/standardMap-main.js)只生成 JPG 查看和 PDF 下载链接，没有 GeoJSON、SHP 或 WFS 下载。
- 上海全市行政区划图可从[官方 PDF 直链](https://shanghai.tianditu.gov.cn/map/data/standardMap/%E4%B8%8A%E6%B5%B7%E5%B8%82%E6%A0%87%E5%87%86%E5%9C%B0%E5%9B%BE/17-%E4%B8%8A%E6%B5%B7%E5%B8%82%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%88%92%E7%A4%BA%E6%84%8F%E5%9B%BE.pdf)下载，但它是制图成品，不能当作 GeoJSON 使用。
- 例如[青浦区行政区划示意图 PDF](https://shanghai.tianditu.gov.cn/map/data/standardMap/%E4%B8%8A%E6%B5%B7%E5%B8%82%E6%A0%87%E5%87%86%E5%9C%B0%E5%9B%BE/14-%E9%9D%92%E6%B5%A6%E5%8C%BA%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%88%92%E7%A4%BA%E6%84%8F%E5%9B%BE.pdf)内部画的是白鹤镇、华新镇、徐泾镇、赵巷镇、夏阳街道、盈浦街道等**法定街镇边界**。PDF 图面标注“上海市测绘院编制、2025年7月、审图号沪S（2025）046号”以及“行政界线仅供参考，不作法律依据”。这些街镇与部分楼市板块同名或大致接近，但不是“楼市板块”数据。
- 这些 PDF 由 CorelDRAW/EPS 制图输出，内部轮廓可表现为矢量路径，但文件没有 GIS 要素属性、行政代码和可确认的地理坐标参考。把路径描摹或逆向配准后导出 GeoJSON，只能算二次加工数据，不能称为官方 GeoJSON，也无法保证精度。
- [天地图·上海地图服务目录](https://shanghai.tianditu.gov.cn/map/views/theme.html)公开了多项 ArcGIS REST `MapServer`，以底图、注记和影像服务为主；本次没有检索到可匿名导出上海 16 区面的 `FeatureServer` 或固定 GeoJSON 下载地址。不能把可显示行政线的栅格/切片服务等同于可下载的区界矢量。
- [天地图·上海版权声明](https://shanghai.tianditu.gov.cn/map/about.html?type=3)要求使用其内容时注明来源；转载或引用应标注“引自天地图·上海”及网站地址。

### 网络接口与服务目录补充核查

- 标准地图页加载时不调用边界数据接口；浏览器只按固定文件名请求 `*_mini.jpg`、`.jpg` 和 `.pdf`。
- 国家天地图行政区划页的公开预览接口对“上海市、县级”返回一个 GeoJSON `FeatureCollection`，含 16 个区面和 1 条“境界线”记录；前端再通过登录后的生成接口提供 `.geojson` 下载。该接口是未文档化的页面内部实现，不宜在产品中直接依赖，且它仍然不提供街道/镇面。
- [天地图·上海开放共享页](https://shanghai.tianditu.gov.cn/map/views/theme.html)公布的综合地图、注记等 ArcGIS REST 服务，公开图层主要是缓存底图或上海外包络。以 [`SHMAP_D/MapServer`](https://mape.shanghai-map.net/arcgis/rest/services/SHMAP_D/MapServer) 为例，公开可查询图层只有 1 个 `SMIMAP.SHEXTENT` 面，没有 16 区或全市街镇属性。
- ArcGIS REST 根目录中可以看到一个未在当前开放共享页列出的旧 [`qp1/MapServer`](https://mape.shanghai-map.net/arcgis/rest/services/qp1/MapServer)。其中第 8 层“街镇行政面”确实可查询 12 个青浦街镇面，但属性 `EDIT_DATE` 为 **2014-01-01**，仅覆盖青浦，服务只声明 ArcGIS JSON/AMF 输出，`f=geojson` 返回“不支持”。因此它可证明平台曾发布过街镇矢量服务，**不能作为 2025 版全市街镇边界来源**。
- 没有发现 WFS `GetCapabilities`、可用的 `FeatureServer`、SHP/ZIP 文件或覆盖 16 区全部街镇的 ArcGIS Feature Layer。

## 与楼市板块的关系

各区标准图内部是街道/镇行政区划，不是开发商、券商、房产中介统一认可的楼市板块体系。两者会出现三种关系：同名且较接近、一个楼市板块跨多个街镇、一个街镇内部又拆成多个楼市板块。尤其“前滩、徐汇滨江、虹桥商务区”等功能片区不能直接由街镇界替代。

如果产品希望借用这套轮廓，较稳妥的做法是把“街镇行政区”作为独立参考图层，再建立可追溯的 `sector ↔ street/town` 合并、拆分或手工修订关系；页面上分别标注“行政区划”和“楼市板块”，不要把后者标成官方边界。

## 专业矢量成果

[上海市企业服务云的数字化成果服务页](https://www.ssme.sh.gov.cn/public/product%21serviceDetail.do?productId=2c91c28767e9f60c0167f33fe1b0633c)和[上海市测绘院申请须知](https://www.shsmi.cn/zxzxchy/tzggchy/15326.htm)表明，正式测绘成果需按用途和范围申请；连续覆盖超过 6 平方公里时还可能需要上海市规划和自然资源局批准。官方[电子地形图确认单](https://www.shsmi.cn/CMSCshsmi/201806/201806081207014.pdf)写明相关成果为 DWG，采用上海城市平面直角坐标系，并对转让、第三方提供和商业开发作出限制。即使获批，也不能默认可以转换后公开发布。

## 对项目的建议

1. 由用户登录国家天地图，下载“上海市 → 县”的 2025 年 9 月 GeoJSON。
2. 下载后先保留原文件和来源说明，不直接覆盖当前 `sectors.geojson`；行政区与楼市板块应作为两个独立图层。
3. 检查文件中的坐标范围、`crs`/元数据、16 区名称与代码，再决定是否需要坐标转换。
4. 上线前向天地图确认公开网站缓存和再分发条件，并在页面标注来源、版本日期与用途限制。
5. 用天地图·上海标准地图 PDF 及民政部 TopoJSON做轮廓和区名的交叉核对，不以社区仓库数据冒充官方数据。
