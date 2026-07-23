# 奉贤 9 个目标板块的固定 OSM 行政几何证据

日期：2026-07-24

对象：西渡、南桥、奉贤金汇、海湾、柘林、奉城、四团、青村、庄行。

## 一、结论

本文件只回答：项目锁定的 OSM GPKG 中能否找到可复算的行政关系，这些关系的几何质量和拓扑是什么，以及它们能否安全地作为低置信、可编辑起画代理。它不主张行政面就是楼市板块，也不使用任何卖方专有 polygon。

结论不是“9 个全部直接生成”：

- **可直接进入低置信行政起画批次的 7 个对象**：西渡、南桥、奉贤金汇、柘林、四团、青村、庄行；
- **海湾为条件可用**：固定快照同时存在 `海湾镇` relation `17885597` 和 `海湾旅游区` relation `17885592`。后者完全嵌套于前者，二者不是两个互斥行政面。若本轮按“同名现行镇的低置信起画代理”政策执行，默认选择完整海湾镇，**不扣除海湾旅游区**，并把旅游区身份保持显式未决；只有独立市场成员证据明确指向旅游区时才改选小面；
- **奉城对“现行行政代理”是 no-go**：固定快照没有 2024 年已经成立的 `头桥街道`，原头桥地区仍包含在 relation `17885593` 的旧奉城镇面内。官方明确头桥 38.4 平方公里从奉城镇析出；因此该 relation 不能标成 2026 年现行奉城镇边界；
- 10 个候选关系（9 个镇街关系加海湾旅游区备选）全部为有效、非空、单组成面、无内洞的 `MultiPolygon`；
- 若“海湾”选择完整 `海湾镇`，9 个目标镇街关系之间没有正面积重叠，锁定拓扑上形成一个连续并集；但该并集仍采用旧奉城拓扑；
- 除海湾旅游区完全落在海湾镇内外，另有 `上海海港综合开发区` `admin_level9` 面完全落在四团镇内。两个管理区都不能与其外层镇域同时作为互斥一级板块加入同一批次。

因此，稳妥的生成顺序是：

1. 先生成 7 个无身份／版本硬冲突的低置信行政代理；
2. 本轮“海湾”按同名现行镇政策采用 `海湾镇`，不做旅游区差集，同时保留 `unresolved_haiwan_tourism_area`；若以后有成员证据证伪，再改选旅游区小面；
3. 奉城单独重建：取得当前头桥街道矢量边界，或从可复算的现行行政来源得到“旧奉城 − 头桥”；在此之前保留显式缺口，不把旧奉城 relation 冒充现行边界。

## 二、固定数据、外部核验与方法

### 2.1 几何快照

本地文件：

```text
/private/tmp/sh-sector-osm-lock/shanghai.gpkg
```

项目来源记录：

```text
data/geo/sources/osm-shanghai-260721.json
```

关键固定值：

```text
resolved URL:
https://download.geofabrik.de/asia/china/shanghai-260721-free.gpkg.zip

snapshotAt:
2026-07-21T20:21:50Z

GPKG SHA-256:
3a45dcc2173cc1e67471e0190564b7f6c19b3655697d0eff830bda48e2dcbba1
```

核对层：`gis_osm_adminareas_a_free`。

字段解释：

```text
code = 1208  -> fclass = admin_level8
code = 1209  -> fclass = admin_level9
```

面积、距离、重叠和共享边均在 EPSG:32651 下复算。relation 唯一性直接查固定 GPKG；没有用在线 OSM 结果替换锁定快照。

### 2.2 当前行政版本的第一方核验

- 上海市人民政府的[奉贤区概况](https://www.shanghai.gov.cn/fengxian/index.html)记载，截至 2025 年末奉贤区辖 8 镇 4 街道；
- 上海市政府 2024 年批复[同意设立奉贤区头桥街道办事处](https://www.shanghai.gov.cn/cmsres/1b/1b141b138302402fa4c1bbbcfd34c238/562f631870576d828ebdcea37bfcf812.pdf)，明确了头桥四至；
- 奉贤区政府[头桥街道挂牌成立](https://www.fengxian.gov.cn/lddt/20240726/74107.html)明确写明“38.4 平方公里的头桥地区从奉城镇析出”；
- 奉贤区政府[头桥街道行政区划图公告](https://www.fengxian.gov.cn/mzj/tzgg/20241112/79680.html)说明变更后的行政区划图已向社会公布；
- 上海市政府 2015 年[设立西渡街道办事处的批复](https://www.shanghai.gov.cn/nw39222/20200821/0001-39222_45714.html)明确西渡四至，并同时调整南桥镇范围；
- 上海市政府 2026 年奉贤区“十五五”规划的发文对象区分“各镇人民政府、街道办事处、[海湾旅游区管委会](https://www.shanghai.gov.cn/gwk/search/content/00843930)”，说明海湾旅游区是另设管委会的管理单元，不能仅凭 OSM `admin_level9` 标签当作与镇街同级、互斥的现行行政区。

这些官方材料用于判定行政版本和名称身份，不被当作可直接复制的矢量坐标。固定 GPKG 仍只是 OSM 开放数据快照，不是法定勘界数据。

## 三、relation 唯一性与几何质量

“严格名称命中”按 GPKG `name` 字段精确匹配；目标市场名与行政名不同时另列代理名。

| 目标市场名 | 固定 OSM 名称 | relation | 层级 | EPSG:32651 面积 | 几何 | 组成面／洞 | 裁定 |
|---|---|---:|---|---:|---|---:|---|
| 西渡 | 西渡街道 | `17885603` | `admin_level8` | `31.586428 km²` | 有效、非空 | `1 / 0` | **GO**：低置信现行行政起画代理 |
| 南桥 | 南桥镇 | `17885600` | `admin_level8` | `49.326929 km²` | 有效、非空 | `1 / 0` | **GO**：低置信现行行政起画代理 |
| 奉贤金汇 | 金汇镇 | `17885595` | `admin_level8` | `71.697727 km²` | 有效、非空 | `1 / 0` | **GO**：异名低置信代理；“奉贤”是市场消歧前缀 |
| 海湾 | 海湾镇 | `17885597` | `admin_level8` | `108.338477 km²` | 有效、非空 | `1 / 0` | **CONDITIONAL-GO**：本轮建议作完整镇低置信代理；旅游区未决 |
| 海湾（备选） | 海湾旅游区 | `17885592` | `admin_level9` | `28.564381 km²` | 有效、非空 | `1 / 0` | **CONDITIONAL**：仅当市场成员指旅游区／大学城滨海片 |
| 柘林 | 柘林镇 | `17885598` | `admin_level8` | `95.100382 km²` | 有效、非空 | `1 / 0` | **GO**：低置信现行行政起画代理 |
| 奉城 | 奉城镇 | `17885593` | `admin_level8` | `109.857816 km²` | 有效、非空 | `1 / 0` | **NO-GO（现行）**：仍包含已析出的头桥街道 |
| 四团 | 四团镇 | `17809482` | `admin_level8` | `72.949507 km²` | 有效、非空 | `1 / 0` | **GO**：镇域几何可起画；东／西邻接标签须按头桥调整 |
| 青村 | 青村镇 | `17885594` | `admin_level8` | `73.066886 km²` | 有效、非空 | `1 / 0` | **GO**：镇域几何可起画；奉城侧邻接须按头桥调整 |
| 庄行 | 庄行镇 | `17885599` | `admin_level8` | `70.043098 km²` | 有效、非空 | `1 / 0` | **GO**：低置信现行行政起画代理 |

每个名称在固定层中均只命中一条关系。“海湾”的歧义不是重复同名，而是去掉行政／管理类型后，`海湾镇` 与 `海湾旅游区` 都可被错误简化成“海湾”。

固定道路层提供了额外版本反证：`头桥中路`、`头桥东路`、`头桥广福路` 共 9 个线段，总长分别约 `614.13 m`、`924.01 m`、`793.13 m`，全部被 relation `17885593` 覆盖。结合固定行政层没有 `头桥街道`、旧奉城面积仍为 `109.857816 km²`，以及官方“头桥从奉城析出”的明确记录，足以判定该 relation 不是可放行的现行奉城代理。

所有关系由驱动读为 `MultiPolygon`，当前恰好都只有一个 polygon 成员且没有内洞。生成器仍应设置：

```text
preserveMultiPolygonSemantics = true
```

不得因为当前单部件而把后续快照中的岛、飞地或洞静默丢弃。

## 四、两个嵌套管理区不能参与互斥分区

### 4.1 海湾镇与海湾旅游区

固定几何关系为：

```text
海湾镇 covers 海湾旅游区 = true
海湾旅游区落在海湾镇外面积 = 0 m²
海湾旅游区占海湾镇面积 = 26.3659%
海湾镇扣除旅游区余量 = 79.774096 km²
二者边界共线 = 25,103.91 m
```

所以：

- 把两者都登记为同批一级面会制造 `28.564381 km²` 正面积重叠；
- 对二者求并集不会得到一个“更完整”的海湾，结果仍等于海湾镇；
- 选择海湾镇作为低置信行政代理时，**不做 `海湾镇 − 海湾旅游区` 差集**；旅游区是内嵌管理参考，不是要从镇域挖掉的行政洞；
- 不能让名称模糊匹配器自动选择面积较大或层级数字较小的一条；
- “海湾”市场身份若指碧海金沙、海湾大学城或旅游区周边，完整海湾镇会严重过宽；
- “海湾”市场身份若指整个海湾镇，则旅游区 relation 只能作为内部参考层，不能再作为一级板块。

### 4.2 四团镇与上海海港综合开发区

固定快照还存在：

```text
上海海港综合开发区 relation = 17885591
fclass = admin_level9
面积 = 13.883929 km²
四团镇 covers 上海海港综合开发区 = true
开发区落在四团镇外面积 = 0 m²
开发区占四团镇面积 = 19.0322%
```

目标清单没有“上海海港综合开发区”。四团若采用完整镇域，该开发区只能作为内部管理参考；不得另加一级面，也不得为了“消除重叠”从四团镇自动扣除。

## 五、9 个 `admin_level8` 关系的锁定拓扑

本节的“9 个”把海湾解释为完整 `海湾镇`，不加入海湾旅游区。

### 5.1 覆盖与重叠

```text
9 个目标 relation 面积之和 = 681.967252 km²
9 个目标 relation 并集面积 = 681.967252 km²
正面积重叠 = 0 m²
并集组成面 = 1
并集有效 = true
```

固定快照中另有奉浦街道 `15.098324 km²` 和金海街道 `18.911146 km²`。把这两面加入后，旧版 11 个 `admin_level8` 单元形成 `715.976722 km²` 的连续、无正面积重叠并集。

这不是“当前奉贤完整行政覆盖”的证明：

- 当前官方是 8 镇 4 街道，共 12 个镇街；
- 锁定快照只有旧版 8 镇 3 街道；
- 缺失的头桥街道空间仍在旧奉城镇面中；
- GPKG 中奉贤区 `admin_level6` 外框包含大面积杭州湾水域，不能拿区框面积与镇街并集做简单差值验收。

### 5.2 同批共享边

除表内组合外，其余目标组合没有线状共享边。西渡与南桥只点接触，不能登记成共享边。

| 锁定快照组合 | 共享边 | 当前语义 |
|---|---:|---|
| 西渡—奉贤金汇 | `2,572.93 m` | 可登记 |
| 西渡—庄行 | `3,297.11 m` | 可登记 |
| 奉贤金汇—青村 | `14,158.19 m` | 可登记 |
| 奉贤金汇—旧奉城 | `13,658.16 m` | **不可按现行奉城登记；其中头桥侧待重分** |
| 南桥—青村 | `4,948.66 m` | 可登记 |
| 南桥—庄行 | `9,925.66 m` | 可登记 |
| 南桥—柘林 | `11,641.24 m` | 可登记 |
| 四团—海湾镇 | `7,608.04 m` | 可登记 |
| 四团—旧奉城 | `23,062.18 m` | **不可按现行奉城登记；头桥成为四团现行邻接** |
| 海湾镇—青村 | `8,386.51 m` | 可登记 |
| 海湾镇—旧奉城 | `13,331.64 m` | 奉城重建后复算，不预填现行长度 |
| 海湾镇—柘林 | `8,005.55 m` | 可登记 |
| 青村—旧奉城 | `16,686.48 m` | **不可按现行奉城登记；其中头桥侧待重分** |
| 青村—柘林 | `3,815.54 m` | 可登记 |
| 庄行—柘林 | `11,020.19 m` | 可登记 |

生成配置必须双向对称。表中涉及旧奉城的 4 组都应在重建后复算，不能沿用旧长度作为现行拓扑断言。

## 六、批外邻接与保护接口

下表列固定快照中长度大于 `10 m` 的主要批外共享边。`admin_level9` 内嵌面另列为“嵌套”，不是外部邻接。

| 目标 | 批外关系 | 固定共享边 | 处理建议 |
|---|---|---:|---|
| 西渡 | 金海街道 `17885602` | `6,858.78 m` | 保持未解决市场接口 |
| 西渡 | 奉浦街道 `17885601` | `5,509.47 m` | 保持未解决市场接口 |
| 西渡 | 江川路街道 `14187992` | `4,180.21 m` | 闵行跨区接口 |
| 西渡 | 吴泾镇 `14187982` | `4,087.13 m` | 闵行跨区接口 |
| 奉贤金汇 | 浦江镇 `14187979` | `12,354.42 m` | 闵行跨区接口 |
| 奉贤金汇 | 金海街道 `17885602` | `7,104.01 m` | 保持未解决市场接口 |
| 奉贤金汇 | 航头镇 `14179368` | `6,578.61 m` | 浦东跨区接口 |
| 奉贤金汇 | 新场镇 `14179332` | `1,774.74 m` | 与头桥版本共同复核 |
| 南桥 | 奉浦街道 `17885601` | `10,466.44 m` | 保持未解决市场接口 |
| 南桥 | 金海街道 `17885602` | `2,890.08 m` | 保持未解决市场接口 |
| 四团 | 大团镇 `14179370` | `12,831.94 m` | 浦东跨区接口 |
| 四团 | 泥城镇 `14180408` | `6,586.47 m` | 浦东跨区接口 |
| 四团 | 宣桥镇 `14180407` | `621.82 m` | 与头桥版本共同复核 |
| 海湾镇 | 南汇新城镇 `14180411` | `3,343.39 m` | 浦东跨区接口 |
| 海湾镇 | 泥城镇 `14180408` | `471.67 m` | 浦东跨区接口 |
| 青村 | 金海街道 `17885602` | `538.37 m` | 保持未解决市场接口 |
| 庄行 | 叶榭镇 `17885642` | `9,559.90 m` | 松江跨区接口 |
| 庄行 | 亭林镇 `16230588` | `7,342.31 m` | 金山跨区接口 |
| 庄行 | 江川路街道 `14187992` | `5,010.94 m` | 闵行跨区接口 |
| 柘林 | 漕泾镇 `18058387` | `17,004.82 m` | 金山跨区接口 |
| 柘林 | 亭林镇 `16230588` | `2,890.17 m` | 金山跨区接口 |

旧奉城 relation 还与新场、宣桥共享边，并与金汇、青村、四团共享长边。根据 2024 年官方四至，这些接口中有相当部分现已属于头桥街道。固定快照不能给出拆分后的精确长度，因此不在现行字段中硬编码旧数值。

## 七、逐块 go / no-go 与可执行字段建议

共同字段建议：

```text
districtName = 奉贤区
confidence = low
method = market_admin_candidate_with_shared_topology
sharedEdgeSnapDistanceMeters = 0.1
preserveTopologyPrecision = true
preserveMultiPolygonSemantics = true
marketAdminAlignmentUnverified = true
geometryVerificationSourceIds += osm-geofabrik-shanghai-260721
riskFlags += market_boundary_not_official
```

### 7.1 西渡 — GO

```text
id = sector_xidu
canonicalName = 西渡
osmAdminRelationId = 17885603
expectedOsmName = 西渡街道
adminProxyName = 西渡街道
insidePoint = [121.4460607, 30.9908703]
sharedEdgeSectorIds = [sector_fengxianjinhui, sector_zhuangxing]
requiredAdjacencyReviewIds = [
  unresolved_jinhai,
  unresolved_fengpu,
  unresolved_jiangchuanlu,
  unresolved_wujing
]
riskFlags += overwide_admin_proxy
```

西渡与南桥只点接触，不加入 `sharedEdgeSectorIds`。官方 2015 年四至可作为行政身份与方向校验，但没有坐标，不足以把 OSM 面升级为法定边界。

### 7.2 南桥 — GO

```text
id = sector_nanqiao
canonicalName = 南桥
osmAdminRelationId = 17885600
expectedOsmName = 南桥镇
insidePoint = [121.4612470, 30.9187575]
sharedEdgeSectorIds = [sector_qingcun, sector_zhuangxing, sector_zhelin]
requiredAdjacencyReviewIds = [unresolved_fengpu, unresolved_jinhai]
riskFlags += overwide_admin_proxy
```

完整南桥镇不等于奉贤新城，也不应吞并奉浦、金海或“上海之鱼”等功能片区身份。

### 7.3 奉贤金汇 — GO（异名代理）

```text
id = sector_fengxianjinhui
canonicalName = 奉贤金汇
osmAdminRelationId = 17885595
expectedOsmName = 金汇镇
adminProxyName = 金汇镇
insidePoint = [121.5554557, 30.9728260]
sharedEdgeSectorIds = [sector_xidu, sector_qingcun]
requiredAdjacencyReviewIds = [
  unresolved_jinhai,
  unresolved_touqiao,
  unresolved_pujiang,
  sector_hangtou,
  sector_xinchang
]
riskFlags += [admin_name_disambiguation, overwide_admin_proxy]
```

`奉贤` 是为避免与闵行“金汇”市场混淆的市场名前缀，不能把 OSM `name` 强改成“奉贤金汇”。旧金汇—奉城共享边暂不登记为当前共享边，待头桥边界就绪后复算。

### 7.4 海湾 — CONDITIONAL

方案 A，仅在市场证据指完整镇域时：

```text
id = sector_haiwan
canonicalName = 海湾
osmAdminRelationId = 17885597
expectedOsmName = 海湾镇
adminProxyName = 海湾镇
insidePoint = [121.5765253, 30.8438990]
sharedEdgeSectorIds = [sector_situan, sector_qingcun, sector_zhelin]
requiredAdjacencyReviewIds = [
  unresolved_fengcheng_current,
  unresolved_lingang_main_city,
  unresolved_nicheng,
  unresolved_haiwan_tourism_area
]
riskFlags += [overwide_admin_proxy, nested_management_zone]
```

方案 B，仅在市场成员证据指旅游区／滨海大学城片时：

```text
id = sector_haiwan
canonicalName = 海湾
osmAdminRelationId = 17885592
expectedOsmName = 海湾旅游区
adminProxyName = 海湾旅游区
adminProxyLevel = 9
insidePoint = [121.5545973, 30.8338850]
sharedEdgeSectorIds = [sector_qingcun, sector_zhelin]
requiredAdjacencyReviewIds = [unresolved_haiwan_town_remainder]
riskFlags += [management_zone_proxy, market_scope_choice_required]
```

两方案只能选一个。若选择旅游区，不能继续沿用海湾镇与四团、奉城等外层镇界邻接；若选择完整镇域，旅游区只作为内部参考。

### 7.5 柘林 — GO

```text
id = sector_zhelin
canonicalName = 柘林
osmAdminRelationId = 17885598
expectedOsmName = 柘林镇
insidePoint = [121.4379391, 30.8367207]
sharedEdgeSectorIds = [
  sector_nanqiao,
  sector_haiwan,
  sector_qingcun,
  sector_zhuangxing
]
requiredAdjacencyReviewIds = [sector_caojing, sector_tinglin]
riskFlags += overwide_admin_proxy
```

如海湾最终选择旅游区，`sector_haiwan` 仍与柘林共边，但共享边仍为同一 `8,005.55 m` 外侧线；配置应按最终关系重算，不从本文字符串复制。

### 7.6 奉城 — NO-GO（现行行政代理）

禁止配置：

```text
osmAdminRelationId = 17885593
geometryRule = 2026 年现行奉城镇
```

因为该 relation 仍包含已经析出的头桥 38.4 平方公里。

临时只可登记研究状态：

```text
id = sector_fengcheng
canonicalName = 奉城
status = needs-current-admin-rebuild
legacyOsmAdminRelationId = 17885593
legacyExpectedOsmName = 奉城镇
officialCurrentAreaKm2 = null
legacyLockedGeometryAreaKm2 = 109.857816
adminAreaVersionMismatch = true
requiredSubtractionId = unresolved_touqiao
insidePoint = [121.6504107, 30.9305340]
riskFlags = [
  stale_admin_relation,
  missing_touqiao_subtraction,
  market_boundary_not_official
]
```

如果市场身份研究明确证明卖方“奉城”仍有意包含头桥，才可另立：

```text
method = historical_admin_market_proxy
marketAdminAlignmentUnverified = true
riskFlags += market_scope_includes_separate_current_admin_unit
```

但这种情况下也不得称它为“现行奉城镇行政代理”。

### 7.7 四团 — GO（邻接版本需保护）

```text
id = sector_situan
canonicalName = 四团
osmAdminRelationId = 17809482
expectedOsmName = 四团镇
insidePoint = [121.7326552, 30.9343091]
sharedEdgeSectorIds = [sector_haiwan]
requiredAdjacencyReviewIds = [
  unresolved_touqiao,
  unresolved_datuan,
  unresolved_nicheng,
  sector_xuanqiao
]
riskFlags += [overwide_admin_proxy, nested_management_zone]
```

在头桥重建前，不把旧快照的四团—奉城长边登记为当前共享边。上海海港综合开发区只作为内嵌参考。

### 7.8 青村 — GO（邻接版本需保护）

```text
id = sector_qingcun
canonicalName = 青村
osmAdminRelationId = 17885594
expectedOsmName = 青村镇
insidePoint = [121.5425566, 30.9066810]
sharedEdgeSectorIds = [
  sector_fengxianjinhui,
  sector_nanqiao,
  sector_haiwan,
  sector_zhelin
]
requiredAdjacencyReviewIds = [unresolved_jinhai, unresolved_touqiao]
riskFlags += overwide_admin_proxy
```

旧青村—奉城共享边需在头桥边界就绪后拆分，不能把整段 `16,686.48 m` 当成当前青村—奉城边。

### 7.9 庄行 — GO

```text
id = sector_zhuangxing
canonicalName = 庄行
osmAdminRelationId = 17885599
expectedOsmName = 庄行镇
insidePoint = [121.3807994, 30.9261210]
sharedEdgeSectorIds = [sector_xidu, sector_nanqiao, sector_zhelin]
requiredAdjacencyReviewIds = [
  sector_yexie,
  sector_tinglin,
  unresolved_jiangchuanlu
]
riskFlags += overwide_admin_proxy
```

## 八、实现与验收门槛

1. 生成前验证 GPKG SHA-256 完全等于本文值；
2. relation ID 与 `expectedOsmName` 精确匹配，不按去后缀名称模糊选择；
3. 所有输出保持 `MultiPolygon`，并保留未来可能出现的全部组成面和洞；
4. 先生成 7 个 GO 对象；海湾在身份裁定前不得默认选大面或小面；
5. 奉城不得进入“现行行政代理”生成路径，直到头桥边界可复算；
6. 若海湾选择海湾镇，9 个旧版 relation 的正面积重叠应为零；若选择旅游区，则必须重新定义海湾镇余量缺口，不能把旅游区与海湾镇同时加入；
7. 海湾旅游区和上海海港综合开发区两个 `admin_level9` 内嵌面不得作为互斥一级面叠加到外层镇域；
8. 同批共享边按第 5.2 节复算，西渡—南桥点接触不得误报为共享边；
9. 涉及旧奉城的共享边一律不使用旧长度做当前拓扑断言；
10. 跨区接口只登记复核依赖，不自动改变闵行、浦东、松江、金山既有候选；
11. 所有 7 个直接代理及最终选定的海湾保持 `confidence = low`、`internal_review`、可编辑；
12. 不把 OSM、官方四至文字、行政区划图 JPG/PDF 或市场身份证据中的任一种单独宣称为法定 GIS 界线；
13. 不读取、提交或引用小红书原始帖子、评论、账号标识、Cookie 或临时 token。

## 九、可复算查询

名称与层级：

```sql
SELECT osm_id, code, fclass, name
FROM gis_osm_adminareas_a_free
WHERE name IN (
  '西渡街道', '南桥镇', '金汇镇', '海湾镇', '海湾旅游区',
  '柘林镇', '奉城镇', '四团镇', '青村镇', '庄行镇',
  '头桥街道', '上海海港综合开发区'
)
ORDER BY name;
```

关键预期：

```text
头桥街道 -> 0 rows
海湾镇 -> 17885597 / 1208 / admin_level8
海湾旅游区 -> 17885592 / 1209 / admin_level9
奉城镇 -> 17885593 / 1208 / admin_level8
```

面积和拓扑复算应使用 GeoPandas／Shapely 读取 GPKG 后投影到 `EPSG:32651`，再计算：

```python
area_km2 = geometry.area / 1_000_000
overlap_m2 = left.intersection(right).area
shared_edge_m = left.boundary.intersection(right.boundary).length
```

## 十、本研究明确不主张

- 不主张行政镇街与楼市板块天然同范围；
- 不主张 OSM relation 是法定行政界线；
- 不主张“奉贤金汇”是官方行政名称；
- 不主张“海湾镇”和“海湾旅游区”可以同时作为互斥一级板块；
- 不主张面积更大的海湾镇一定更接近卖方“海湾”；
- 不主张旧奉城 relation 是 2026 年现行奉城镇；
- 不主张头桥应该自动成为项目的第十个奉贤市场板块；
- 不主张为了铺满奉贤而把奉浦、金海或头桥残余面机械并入相邻市场；
- 不主张本文件使用了任何卖方专有 polygon 或小红书原始内容。
