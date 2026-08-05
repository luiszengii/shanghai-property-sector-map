# 高德地图四种出行方式预计耗时 API 调研

> 调研日期：2026-08-04（Asia/Shanghai）
>
> 范围：只使用高德开放平台官方文档、现行价格页、服务协议和官方 FAQ；重点核对驾车、步行、骑行、公交能否返回预计耗时，以及 Web 服务 API 与地图 JS API 2.0 的选择。

## 结论

**支持。** 高德可以分别计算驾车、步行、骑行、公交的路线预计耗时，四种方式的时间单位均为**秒**。

本项目若只是比较楼盘到某地点的四种通勤时间，建议优先使用 **Web 服务“路径规划 2.0” v5**，由本站后端发起请求；不要让浏览器直接持有 Web 服务 Key。四种 v5 接口都必须显式传 `show_fields=cost`，才会返回 `duration`。公交的方案总耗时明确包含等车时间。[高德路径规划 2.0 官方文档](https://lbs.amap.com/api/webservice/guide/api/newroute)

地图 JS API 2.0 也提供 `AMap.Driving`、`AMap.Walking`、`AMap.Riding`、`AMap.Transfer` 四个插件，适合需要在现有高德地图上自动绘线、显示起终点和路线面板的页面。[高德 JS API 2.0 路线规划教程](https://lbs.amap.com/api/javascript-api-v2/guide/services/navigation)

这里的“导航时间”应准确表述为**路线预计耗时（ETA）**，不是保证到达时间，也不是持续跟随用户位置、偏航重算和语音播报的完整导航 SDK。高德说明，道路、数据和算法变化可能使相同起终点在不同时间返回不同结果；其服务协议也要求路线规划结果仅供参考。[高德路径规划基础 API 文档](https://lbs.amap.com/api/webservice/guide/api/direction)；[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)

### 实施补充：固定工作日高峰与未来驾车 ETA

本轮产品共识要求显示固定工作日的早晚结果。实现选择未来 6 天内最近的周二或周三：早高峰按用户到岗时间减去本地直线距离启发式得到一次预计出发时刻，晚高峰直接使用用户下班时间；每个方向只发一次请求，不做二次逼近。

公交 v5 支持 `date`、`time`，可按该时刻查询；步行与骑行返回路线耗时，但不存在需要未来路况预测的语义。基础版 `/v5/direction/driving` 没有未来 `departureTime` 参数，因此不能把“当前驾车耗时”冒充固定工作日结果。高德物流矩阵的 `departureTime` 可用于未来 ETA，但只支持未来 6 天，并要求联系商务单独开通权限。[高德物流距离测量矩阵（1-N）](https://lbs.amap.com/api/logistic-service/guide/logistics_matrix_service/distance-measurement)

因此当前实现保留用户的驾车选择，但在高级未来 ETA 权限未开通前显示“驾车暂不可算”；不会静默回退到当前路况。一个完整的两人、每人主方式加备选方式、早晚双向场景最多产生 8 个结果槽位；驾车未开通时对应槽位不调用基础 LBS，实际调用量相应减少。

## 一、Web 服务路径规划 2.0：四种方式都能返回 `duration`

统一要求：

- 使用“Web 服务”类型 Key，通过 `key` 参数鉴权；
- `origin`、`destination` 均为 `经度,纬度`，小数不超过 6 位；
- 显式传 `show_fields=cost`；否则 v5 默认只返回基础字段，不返回耗时；
- `duration` 在官方响应定义中是字符串，业务层应先转为整数秒，再格式化为“约 N 分钟”；
- 官方文档把方案总耗时写在各方案的 `cost` 对象下；但 2026-08-04 使用新建 Web 服务 Key 实测发现，骑行 v5 的方案总耗时实际返回在 `route.paths[].duration`。适配层应兼容该实测结构，不能只按文档读取 `cost.duration`。

| 方式 | v5 endpoint | 关键参数 | 预计耗时字段 | 说明 |
|---|---|---|---|---|
| 驾车 | `GET /v5/direction/driving`；参数过长时可 `POST` | `key`、`origin`、`destination`；常用 `strategy`、`waypoints`、`plate`、`cartype`、`show_fields=cost` | `route.paths[].cost.duration`，秒 | 默认策略 `32` 为高德推荐；`33` 避堵、`38` 速度最快。最多支持 16 个途经点。 |
| 步行 | `GET /v5/direction/walking` | `key`、`origin`、`destination`、`show_fields=cost`；可选 `alternative_route`、`isindoor` | `route.paths[].cost.duration`，秒 | `alternative_route` 可取 1–3。`duration` 包括方案总耗时及 step 耗时。 |
| 骑行 | `GET /v5/direction/bicycling` | `key`、`origin`、`destination`、`show_fields=cost`；可选 `alternative_route` | 官方文档：`route.paths[].cost.duration`；本轮实测：`route.paths[].duration`，秒 | `alternative_route` 可取 1–3。普通自行车与电动车是不同接口；电动车另有 `/v5/direction/electrobike`。 |
| 公交 | `GET /v5/direction/transit/integrated` | `key`、`origin`、`destination`、`city1`、`city2`、`show_fields=cost`；建议传 `date`、`time` | `route.transits[].cost.duration`，秒 | `duration` 是方案总耗时且**包含等车时间**。`strategy=8` 为时间短模式；同城时 `city1` 与 `city2` 相同，跨城时不同。 |

来源：[高德路径规划 2.0 官方文档](https://lbs.amap.com/api/webservice/guide/api/newroute)（最后更新：2026-06-17；观察：2026-08-04）

最小请求形态：

```text
https://restapi.amap.com/v5/direction/driving
  ?origin=<lng>,<lat>
  &destination=<lng>,<lat>
  &show_fields=cost
  &key=<WEB_SERVICE_KEY>
```

公交需额外加入 `city1=<起点 citycode>&city2=<终点 citycode>`；上海同城可使用上海 citycode，并建议加入实际查询日期与时间。一次比较四种方式需要分别调用四个 endpoint，因此通常消耗 **4 次基础 LBS 调用**；这是由四个独立接口推得的实现结论，不是高德提供的单请求四模式接口。

### 旧版 v3/v4 也支持，但不建议新功能以它为首选

旧版接口同样能计算秒级预计耗时，且不要求 `show_fields=cost`：

| 方式 | 旧 endpoint | 耗时字段 |
|---|---|---|
| 驾车 | `/v3/direction/driving` | `route.paths[].duration`，秒 |
| 步行 | `/v3/direction/walking` | `route.paths[].duration`，秒 |
| 骑行 | `/v4/direction/bicycling` | `data.paths[].duration`，秒 |
| 公交 | `/v3/direction/transit/integrated` | `route.transits[].duration`，秒 |

来源：[高德路径规划基础 API 官方文档](https://lbs.amap.com/api/webservice/guide/api/direction)（最后更新：2026-02-02；观察：2026-08-04）

v5 已把四种方式统一到路径规划 2.0 文档和 `/v5/direction/...` 路径下，并提供更明确的可选字段控制，因此新实现优先 v5。旧接口可作为理解现有代码或迁移时的兼容参考。

## 二、地图 JS API 2.0：适合“计算并在地图上展示路线”

JS API 2.0 的对应插件是：

| 方式 | 插件 | 调用方式 | 官方耗时对象 |
|---|---|---|---|
| 驾车 | `AMap.Driving` | `driving.search(origin, destination, callback)` | `result.routes[].time`，秒 |
| 步行 | `AMap.Walking` | `walking.search(origin, destination, callback)` | `result.routes[].time`，秒 |
| 骑行 | `AMap.Riding` | `riding.search(origin, destination, callback)` | 骑行方案耗时，秒；当前 JS 2.0 静态参考将 `RidingResult` 的详细字段指向路线 REST 响应结构 |
| 公交 | `AMap.Transfer` | `transfer.search(origin, destination, callback)` | 公交换乘方案耗时，秒；当前 JS 2.0 静态参考将 `TransferResult` 的详细字段指向路线 REST 响应结构 |

来源：[高德 JS API 2.0 路线规划教程](https://lbs.amap.com/api/javascript-api-v2/guide/services/navigation)；[高德 JS API 2.0 静态参考手册](https://a.amap.com/jsapi/static/doc/20230922/index.html#drivingresult)；[当前 DrivingResult 参考](https://lbs.amap.com/api/maps-javascript-api/reference/route/drivingresult)

高德旧版路线对象参考把公交方案写作 `result.plans[].time`、骑行方案写作 `result.routes[].time`，单位同为秒；但当前 JS API 2.0 的 `TransferResult`、`RidingResult` 文档改为转指 REST 结果说明。因此实现 JS 插件时，应以实际加载版本的回调对象和当前 2.0 参考为准，并在适配层统一为 `{ mode, durationSeconds }`，不要假定 Web 服务的 `duration` 字段路径可以原样套到所有 JS 插件上。[高德官方路线规划对象参考](https://lbs.amap.com/api/javascript-api/reference/route-search)

### Web 服务与 JS API 的选择

| 对比项 | Web 服务 v5 | JS API 2.0 插件 |
|---|---|---|
| 最适合 | 后端只计算 ETA、统一四模式结果、控制 Key 和错误处理 | 浏览器中同时算路、画路线、显示默认路线面板 |
| 鉴权 | “Web 服务”Key；可绑定服务器出口 IP、可选数字签名 | “Web 端（JS API）”Key + 安全密钥；2021-12-02 后创建的 Key 必须配合安全密钥 |
| 时间字段 | `cost.duration`，秒；v5 必须 `show_fields=cost` | 插件回调对象使用 `time` 或其所链接的路线结果结构，秒 |
| 地图依赖 | 不要求初始化地图 | 需要在线加载 JS API 与对应插件 |
| Key 暴露面 | Key 只存在服务端 | Web 端 Key 可见；安全密钥应按官方建议通过代理服务器转发 |
| UI | 自己渲染 | 传 `map`、`panel` 后可自动绘线和显示结构化详情 |

JS API 2.0 的官方安全指南强烈建议把安全密钥保存在服务端并通过代理转发；明文 `securityJsCode` 只适合便捷开发，不建议用于生产。[JS API 2.0 安全密钥使用](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)

## 三、配额、QPS 与费用

四种路径规划都属于“基础 LBS 服务”。当前月配额由 API、JS、Android、iOS、微信小程序共享，并且还与距离测量、地理编码、坐标转换、行政区划、IP 定位、静态地图等基础 LBS 能力共享，不是每个 Key 或每种路线各有一份独立月额度。

| 开发者状态 | 基础 LBS 共享月配额 | 每种路径规划服务基础 QPS |
|---|---:|---:|
| 未认证开发者 | 0 | 0 |
| 个人认证开发者 | 150,000 次/月 | 3 次/秒 |
| 企业认证开发者（乘风计划） | 3,000,000 次/月 | 30 次/秒 |
| 企业认证开发者（技术服务许可） | 9,000,000 次/月 | 100 次/秒 |

当前基础 LBS 流量包价格为 **30 元/万次**，有效期 1 年；现行价格页还列出按月调用量的阶梯折扣。QPS 需要针对具体服务单独提升，账号下所有 Key 共用该服务的 QPS 额度。价格和配额会调整，上线前应重新检查控制台与现行价格页。[高德服务升级与价格页](https://lbs.amap.com/upgrade)；[高德基础服务计费说明](https://lbs.amap.com/pages/base_service_price)

法人或非法人组织使用，或自然人用于非个人研究学习目的时，不能仅凭有免费配额就认定可免费商用。高德服务协议要求法人或非法人组织事先购买技术服务许可；当前基础版和高级版许可分别标为 50,000 元/年和 100,000 元/年。[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)；[高德服务升级与价格页](https://lbs.amap.com/upgrade)

## 四、鉴权、安全和合规边界

### Key 必须按平台类型分开

- Web 服务 v5 必须使用“Web 服务”类型 Key；
- JS API 2.0 必须使用“Web 端（JS API）”Key和安全密钥；
- 高德错误码 `10009 USERKEY_PLAT_NOMATCH` 专门说明：例如申请的是 JS API Key，却拿去调 Web 服务接口，会因绑定平台不符而失败；
- 高德协议要求每个应用单独申请 Key，一个 Key 只用于一个应用，不得向第三方披露或转借。

来源：[Web 服务入门指南](https://lbs.amap.com/api/webservice/gettingstarted)；[高德 Web 服务错误码](https://lbs.amap.com/api/webservice/guide/tools/info/)；[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)

### 服务端 Key 应绑定出口 IP

高德官方强烈建议线上 Web 服务 Key 配置 IP 白名单；只有白名单内的服务器出口 IP 才能得到正常响应。若白名单不匹配，会返回 `10005 INVALID_USER_IP`。白名单 IP 指使用方服务器的**出口 IP**。[高德 Web 服务 IP 白名单 FAQ](https://lbs.amap.com/faq/webservice/webservice-api/basic-configuration/43238)；[Web 服务申请注意事项](https://lbs.amap.com/faq/webservice/webservice-api/basic-configuration/43234)

### 不把 ETA 当承诺，不长期存储高德结果

- 路线耗时是估算值。驾车受路况、车牌限行和策略影响；公交受日期、时间、班次和等车时间影响；
- 向用户显示“约 35 分钟 · 查询于 08:30”比显示“35 分钟到达”更准确；
- 高德协议规定只能用官方开放功能展示服务结果，不得直接存储、缓存或以技术手段抓取、使用服务内部数据。若要脱离服务使用或持久化路线结果，需要通过工单另行评估；
- 高德协议还要求告知用户，路线规划等结果可能与现实不完全一致，不能作为出行决策的唯一依据；
- 车载场景、模型或算法训练、数据集构建不在普通基础服务许可内，需要另行书面许可。

来源：[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)

### 坐标系必须先统一

高德开放平台国内服务使用 GCJ-02，高德官方把 WGS84/GPS 列为“非高德坐标”，要求转换为高德坐标以保证位置准确。[高德坐标系官方 FAQ](https://lbs.amap.com/faq/advisory/others/39838)；[高德坐标转换 API](https://lbs.amap.com/api/webservice/guide/api/convert)；[JS API 2.0 坐标转换教程](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)

本仓库的板块几何与多数研究数据保留为 WGS84，地图显示前已有 WGS84→GCJ-02 转换流程；`src/data/project-locations.ts` 的楼盘代表点则来自高德 POI，当前就是 GCJ-02。路线请求应按数据来源处理：楼盘代表点和用户在高德中确认的工作地点可直接使用；未来若改用 WGS84 几何或其他坐标源，必须先转换，且不应把源数据回写成 GCJ-02。

## 补充：固定工作日驾车 ETA 的准确产品与开通方式

高德另有比物流矩阵更贴合本产品的专用能力：Web 服务高级 API 中的“高级路径规划 → 未来路径规划 API”。它通过 `GET https://restapi.amap.com/v4/etd/driving` 查询未来 7 天的驾车路径规划结果，使用 `firsttime`（Unix 秒）、`interval` 和 `count` 指定预测时点；返回 `time_infos[].elements[].duration`，单位为分钟。它与基础路径规划 2.0 的 `/v5/direction/driving` 不是同一接口，解析器也不能复用 v5 的秒制 `cost.duration`。[高德高级路径规划官方文档](https://lbs.amap.com/api/webservice/guide/api-advanced/advanced-path)

该接口目前只向企业开发者开放，没有公开的自助开关。申请步骤是：完成企业开发者认证；创建“Web 服务”类型 Key；通过高级路径规划页面提供的商务咨询入口提交申请；在申请中写明企业账号、应用、Key、`/v4/etd/driving`、上海住宅通勤比较场景、预计月调用量和峰值 QPS，并要求确认试用、正式计费、配额、QPS、有效期及权限绑定对象。官方没有公开高级接口的固定价格、默认额度、审批时长或免费试用承诺，不能套用基础 LBS 的公开流量包价格。[商务咨询入口](https://lbs.amap.com/consult?id=16)；[企业与个人认证区别](https://lbs.amap.com/faq/account/certification/39670)；[创建 Web 服务 Key](https://lbs.amap.com/api/webservice/create-project-and-key)

开通后的最小验收应使用获授权的 Web 服务 Key、未来 7 天内的 `firsttime`、`count=1` 发起真实请求，并同时满足 `errcode=0`、`errmsg=OK` 且存在 `data.paths`、`data.time_infos` 和 `elements[].duration`。若返回 `10012 INSUFFICIENT_PRIVILEGES`，说明权限不足；`10009 USERKEY_PLAT_NOMATCH` 表示 Key 平台类型不匹配。[高德 Web 服务错误码](https://lbs.amap.com/api/webservice/guide/tools/info/)

## 五、本仓库推荐方案

### 推荐架构

```text
浏览器
  -> 本站同源 API（校验起终点、模式、频率）
      -> 按坐标来源统一为高德坐标（GCJ-02）
      -> 并行调用四个 v5 路径规划 endpoint
      -> 兼容各模式实际 duration 字段，转换为整数秒
  <- { driving, walking, bicycling, transit, queriedAt }
```

具体建议：

1. 在腾讯云生产服务器后端代理四种 v5 请求。现有部署文档记录的固定出口地址为 `43.155.217.8`，为新 Web 服务 Key 配置这一 IP 白名单；部署前仍应从服务器实测出口 IP，避免云网络调整后出现 `10005`。
2. 新建一个独立的“Web 服务”Key，作为服务端秘密环境变量保存。不要复用现有 `NEXT_PUBLIC_AMAP_KEY`；后者是浏览器可见的 JS API Key，平台类型和暴露边界都不同。
3. 四种请求一律传 `show_fields=cost`。公交另传 `city1`、`city2`，并尽可能带上用户实际计划出发的 `date`、`time`；若目标是最短耗时方案，可选 `strategy=8`。
4. 统一把各接口的字符串 `duration` 转成 `durationSeconds`，UI 再四舍五入为分钟，同时保留查询时间。请求失败或无方案时按模式单独降级，不因一个模式失败而清空另外三个结果。
5. 前端需要画路线时，可以继续使用现有 JS API 地图；但 ETA 数据仍由后端 v5 返回，避免浏览器再发一轮四模式算路请求、重复消耗配额。若未来确实要使用插件自动路线 UI，再单独评估 JS 插件结果与后端 ETA 的一致性。
6. 不持久化或缓存高德路线结果；只保存用户自有的起终点标识和产品配置。若未来业务必须缓存 ETA 或路线，先向高德提交工单取得明确许可。
7. 增加后端限流与超时；一次四模式比较会消耗四次共享月配额。官方 QPS 是按具体服务限制，四种不同服务各发一次不等于单个服务 4 QPS，但多个用户并发比较时，每一种模式都可能迅速超过个人开发者的 3 QPS，仍需按模式限流、排队或使用满足并发需求的企业额度。

本仓库依据：[部署文档](../DEPLOYMENT.md)；[项目说明](../../README.md)；现有坐标转换实现为 `src/lib/geo-coordinate-conversion.ts` 与 `src/components/map/amap-coordinate-conversion.ts`。

## 六、上线前核对清单

- [ ] 账户主体与使用场景已经取得对应技术服务许可，不把免费配额误当商用授权；
- [ ] 新 Web 服务 Key 已创建，未复用 `NEXT_PUBLIC_AMAP_KEY`；
- [ ] 已从生产服务器验证出口 IP，并把它加入高德 Key 白名单；
- [ ] 服务端环境变量、日志、错误响应都不会泄露 Key；
- [ ] 四个 endpoint 都带 `show_fields=cost`；
- [ ] WGS84 起终点在请求前已转换为高德坐标；
- [ ] 公交请求传正确 `city1`、`city2`，需要班次语义时传 `date`、`time`；
- [ ] UI 使用“预计/约”并显示查询时间，不承诺准点；
- [ ] 对四个独立请求设置限流、超时、局部失败和无方案状态；
- [ ] 未把高德路线或 ETA 结果持久化、缓存或用于训练数据。

## 官方来源

1. [高德 Web 服务路径规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)
2. [高德 Web 服务路径规划基础 API（v3/v4）](https://lbs.amap.com/api/webservice/guide/api/direction)
3. [高德地图 JS API 2.0 路线规划](https://lbs.amap.com/api/javascript-api-v2/guide/services/navigation)
4. [高德地图 JS API 2.0 静态参考手册](https://a.amap.com/jsapi/static/doc/20230922/index.html)
5. [高德 JS API 2.0 安全密钥使用](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)
6. [高德基础服务价格与配额](https://lbs.amap.com/upgrade)
7. [高德开放平台服务协议](https://lbs.amap.com/pages/terms/)
8. [高德 Web 服务 IP 白名单 FAQ](https://lbs.amap.com/faq/webservice/webservice-api/basic-configuration/43238)
9. [高德 Web 服务错误码](https://lbs.amap.com/api/webservice/guide/tools/info/)
10. [高德坐标转换 API](https://lbs.amap.com/api/webservice/guide/api/convert)
