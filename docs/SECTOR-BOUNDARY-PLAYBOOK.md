# 上海楼市板块数据研究与边界编辑手册

> 适用范围：新增、调整、拆分、合并、删除市场板块，以及查找板块名称、四至、相邻关系和可复用几何来源。
>
> 核心原则：市场板块不是法定行政区。商业平台决定“市场上怎么叫、通常和谁相邻”，许可明确的固定道路、水系和行政骨架决定“坐标怎么生成”。

## 1. Agent 收到“修改板块”后先做什么

不要先打开 GeoJSON 手改坐标。按以下顺序执行：

1. 阅读本文件和根目录 `AGENTS.md`。
2. 用板块名和稳定 ID 搜索身份、候选面、批次、来源、证据和历史决策。
3. 判断任务属于“改身份”还是“改几何”，是否影响相邻板块。
4. 先收集文字定义和相邻关系，再决定生成规则。
5. 从锁定且许可明确的数据源独立生成坐标。
6. 用米制投影执行 `union`、`difference` 和共边检查。
7. 重新生成候选面、manifest、客户端索引和目录数据。
8. 处理编辑器草稿迁移和板块观察映射。
9. 跑检查，并在 `/sector-editor` 实际点验。

快速定位一个板块：

```bash
rg -n '板块名|sector_id' \
  src/data/sectors \
  data/geo \
  docs/adr \
  docs/research \
  scripts
```

重点查看：

```bash
jq '.sectors[] | select(.id == "sector_id")' src/data/sectors/registry.json
jq '.features[] | select(.properties.id == "sector_id")' \
  src/data/sectors/reviewed-candidates.wgs84.json
```

## 2. 三种空间对象不能混为一谈

| 对象 | 含义 | 项目中的处理 |
|---|---|---|
| 市场板块 | 卖方、买方和研究机构使用的住宅市场语义 | 主产品对象；允许用户裁定，但必须记录版本和风险 |
| 行政区或街镇 | 法定治理范围 | 可作骨架和蓝色参考层，不能直接冒充市场板块 |
| 规划或功能区 | 经开区、保税区、科学城、规划单元等 | 有时可支持四至；语义不一致时只能作为参考子范围 |

同名不代表同范围。例如“金桥市场板块”“金桥镇”“金桥经开区”是三个不同对象。优先阅读：

- `docs/adr/0001-market-sector-over-administrative-boundary.md`
- `docs/adr/0015-independently-rebuild-with-authorized-sources.md`
- `docs/adr/0020-separate-sector-identities-from-geometry.md`

## 3. 数据源优先级和允许用途

### A. 官方文字四至、批复和采购文件

首选来源包括市、区政府，规划资源部门，街镇官网，政府采购文件和正式规划。

可以用于：

- 确认板块或功能区身份；
- 确认东、南、西、北四至；
- 确认道路、河道、行政单元和面积量级；
- 判断规划范围应作为主板块还是参考子范围。

操作要求：

- 记录标题、发布单位、URL、发布日期或核验日期；
- PDF 记录页码和支持的具体结论；
- 把来源登记到 `src/data/sectors/sources.json`；
- 把逐边或组合面依据登记到 `src/data/sectors/boundary-evidence.json`。

官方 PDF/JPG 没有可确认的 CRS、属性或授权矢量时，不能把图面路径转换后称为官方 GeoJSON。

### B. 天地图·上海标准地图

入口：`https://shanghai.tianditu.gov.cn/map/views/standardMap.html`

适合：

- 核对行政名称和街镇邻接；
- 核对 OSM 行政关系是否明显过期；
- 记录标准图日期、审图号和版本差异。

不适合：

- 直接从 JPG/PDF 描成市场板块；
- 把视觉参考界线称为官方 GIS 数据；
- 用行政图替代市场板块定义。

相关研究：

- `docs/OFFICIAL-SHANGHAI-ADMIN-BOUNDARIES.md`
- `docs/TIANDITU-SHANGHAI-BOUNDARY-AUDIT.md`
- `docs/SECTOR-TIANDITU-COMPARISON.md`

### C. 固定 OSM/Geofabrik 快照

这是当前项目生成道路、水系、铁路和行政骨架坐标的主要开放来源。

锁文件：

```text
data/geo/sources/osm-shanghai-260721.json
```

锁文件记录：

- 固定下载 URL；
- 快照日期；
- zip 和 GeoPackage SHA-256；
- CRS；
- ODbL 许可和署名。

规则：

- `latest` URL 只用于发现版本，不能作为可复算输入；
- 生成前必须核验 GeoPackage SHA-256；
- 工作 CRS 使用 `EPSG:32651`；
- 发布候选面输出为 WGS84 / `OGC:CRS84`；
- 道路和水系通常使用固定快照中的中心线或可复算行政关系；
- 新版本必须新建 source lock，不能静默替换旧快照。

### D. 链家、贝壳、房天下、安居客和其他看房平台

适合：

- 发现板块名称、别名和卖方分类；
- 判断一个板块是否独立存在；
- 判断相邻、包含、拆分和合并关系；
- 阅读公开文字形式的范围描述。

没有书面授权时，不得：

- 批量抓取或保存平台 polygon；
- 复制前端接口坐标；
- 对着截图逐点描摹；
- 绕过登录、验证码、风控或访问控制；
- 把平台坐标改几个点后当作独立数据。

链家网站地图、房天下历史板块描述等只能登记为名称或定义来源，不能登记为几何来源。

### E. `map.hfwgsj.com` 等商业板块地图

只可用于理解产品架构、板块名称、市场语义、相邻关系和大致形态。目标站协议和来源研究见：

- `docs/SHANGHAI-PROPERTY-SECTOR-SOURCES.md`
- `docs/research/hfwgsj-121-public-source-audit-2026-07-23.md`
- `docs/adr/0015-independently-rebuild-with-authorized-sources.md`

除非取得书面授权，不登录抓边界、不保存接口 polygon、不逐点复刻。用户扫码登录也不会自动产生数据再利用授权。

### F. 小红书观点样本

小红书只能作为观点样本，不能证明板块边界。任何读取、扩充或映射前必须阅读：

```text
docs/XHS-DATA-GUIDE.md
```

删除或合并板块时，不得把旧样本改名冒充新板块样本。

## 4. 仓库里去哪里改

### 身份和目录

| 文件 | 作用 | 是否手改 |
|---|---|---|
| `src/data/sectors/registry.json` | 活动板块身份、名称、定义状态、风险、几何状态 | 可通过同步脚本更新；少量邻接可审慎修改 |
| `src/data/sectors/sources.json` | 来源登记表 | 可改 |
| `src/data/sectors/boundary-evidence.json` | 四至、组合面和共享边证据 | 优先由同步脚本更新 |
| `src/data/sectors/reference-checks.json` | 旧演示面、候选面、行政参考面的差异指标 | 指标变化时更新并复算 |

### 可复算几何输入

| 目录或文件 | 作用 |
|---|---|
| `data/geo/reviewed-candidate-definitions.json` | 中央批次清单、source lock、workpack 哈希 |
| `data/geo/reviewed-candidate-batches/*.json` | 每批板块的生成方法、来源、面积门槛、拓扑依赖 |
| `data/geo/workpacks/<name>/` | 复杂联合分区的生成器、裁定、来源、候选和 QA |
| `data/geo/admin-reference-definitions.json` | 行政参考层定义 |
| `data/geo/sources/*.json` | 固定几何来源锁 |

### 生成产物

以下文件不应直接手工修边，应由脚本生成：

```text
src/data/sectors/reviewed-candidates.wgs84.json
src/data/sectors/reviewed-candidates.manifest.json
src/data/sectors/reviewed-candidates.index.json
src/data/sectors/subscopes.wgs84.json
src/data/sectors/editorial-seeds.wgs84.json
src/data/sectors/editorial-seeds.index.json
src/data/sectors/source-backed-proxies.wgs84.json
src/data/sectors/source-backed-proxies.index.json
```

### 编辑器和草稿迁移

```text
src/lib/sector-editor-drafts.ts
src/lib/sector-editor-drafts.test.ts
src/lib/sector-editor-catalog.test.ts
src/components/SectorBoundaryEditor.tsx
```

`src/lib/sector-editor-drafts.ts` 负责：

- 未修改草稿自动升级；
- 手工修改草稿保留；
- 被删除、合并或拆分身份的旧草稿归档；
- `referenceOnly` 草稿禁止导出。

### 板块观察

```text
scripts/xhs_property_report.py
docs/XHS-DATA-GUIDE.md
```

只更新目录映射和聚合说明，不读取后重标原始帖子，不复用相邻板块样本，不因改边界自动复爬。

## 5. 四种常见任务

### 调整现有板块

1. 保持稳定 `sector_id`。
2. 找到所属 batch 或 workpack。
3. 更新文字定义、来源、面积安全范围和拓扑依赖。
4. 修改生成规则，不手改生成 GeoJSON。
5. 对所有相邻候选执行差集和共边检查。
6. 重新生成、同步目录并更新差异指标。
7. 未修改的本地草稿自动升级；手工修改草稿保留。

### 新增板块

1. 先在 registry 创建稳定身份；证据不足时允许 `geometry.status = "missing"`。
2. 选择现有批次或新建 batch。
3. 只有几何闭合、来源许可和版本核验通过后才生成候选面。
4. 增加来源、证据、索引、编辑器测试和板块观察缺口映射。

不要为了“地图不留空”伪造 polygon。身份存在和边界存在是两件事。

### 合并板块

1. 用户先裁定保留哪个稳定 ID 和名称。
2. 用 `union` 或“保留身份 + 吸收范围”重建目标面。
3. 被吸收 ID 从活动 registry、批次和客户端目录移除。
4. 旧范围必须被新面完整覆盖，同时与保留邻居无重叠。
5. 被吸收板块的历史草稿归档为只读 `referenceOnly`。
6. 不把旧观点样本自动改名为合并后的样本。

### 删除板块

1. 从 registry 和活动批次移除身份。
2. 明确原区域由哪个板块承接，不能留下意外空洞。
3. 从编辑器种子、来源代理、客户端索引和 XHS 缺口映射移除。
4. 历史草稿只读归档，不静默删除。
5. 增加“活动目录不存在、候选面不存在、归档不可导出”的测试。

## 6. 复杂边界必须用联合分区

如果三个以上板块互相影响，或一个板块要扣除多个保护板块，不要分别生成后再补洞。应建立一个联合 workpack：

```text
data/geo/workpacks/<workpack-name>/
  _build_workpack.py
  candidate.wgs84.geojson
  definition.fragment.json
  identity-decisions.md
  qa.json
  sources.md
```

推荐算法：

1. 从固定快照读取道路、水系和行政关系。
2. 在 `EPSG:32651` 下进行缓冲、吸附、面积和长度计算。
3. 先锁定保护面。
4. 按优先级执行 `union`、`difference`。
5. 相邻板块复用同一条输出边，不分别重画。
6. 使用固定精度网格消除浮点级自接触和细缝。
7. 转回 WGS84。
8. 输出 source hash、面积、重叠、共享边长度、覆盖率和重建误差。

本项目完整范例：

```text
data/geo/workpacks/pudong-north-repartition/
data/geo/reviewed-candidate-batches/pudong-north-market-repartition-2026-07.json
```

该范例展示：

- 金桥扣除金杨、碧云及其他现有邻接候选；
- 森兰从高行中扣除；
- 高东并入外高桥；
- 高行按航津路切分；
- 规划代理降为参考子范围；
- 删除身份的草稿迁移。

重建命令：

```bash
uv run --script \
  data/geo/workpacks/pudong-north-repartition/_build_workpack.py \
  --gpkg /absolute/path/to/locked/shanghai.gpkg
```

workpack 输出变化后，更新 `data/geo/reviewed-candidate-definitions.json` 中对应的 SHA-256。

## 7. 生成和同步顺序

复杂候选生成：

```bash
uv run --script scripts/build-reviewed-sector-candidates.py \
  --gpkg /absolute/path/to/locked/shanghai.gpkg
```

同步某个登记过策略的批次：

```bash
node scripts/sync-reviewed-sector-batch-catalog.mjs \
  data/geo/reviewed-candidate-batches/<batch>.json
```

同步其他生成层：

```bash
node scripts/build-editorial-sector-seeds.mjs
node scripts/build-source-backed-sector-proxies.mjs
npm run build:sector-client-index
```

新增一种 batch 结构时，通常还需更新：

```text
scripts/build-reviewed-sector-candidates.py
scripts/sync-reviewed-sector-batch-catalog.mjs
scripts/check-sector-data.mjs
```

同步脚本应保持幂等；连续运行两次不应产生新 diff。

## 8. 几何验收标准

最低要求：

- WGS84 坐标合法；
- Polygon/MultiPolygon 合法、无自交；
- 面积和包围盒处于预设范围；
- 标签点位于对应面内；
- 保护板块重叠面积为 0；
- 相邻板块共享边连续；
- 合并前后联合覆盖域无意外空洞；
- 复杂重构的米制对称差误差不超过 1 m²；
- 被吸收旧范围覆盖率为 100%；
- 生成来源哈希与 source lock 一致。

浮点误差判断必须在 `EPSG:32651` 和声明的固定精度网格下完成。不要用经纬度坐标直接计算平方米。

## 9. 检查命令

```bash
npm run check:sectors
npm run check:sector-client-index
npm run check:editor
npm run typecheck
npm run lint
npm run build
```

还应按受影响的数据层运行：

```bash
node scripts/check-a-b-boundary-coverage.mjs
node scripts/check-source-backed-sector-proxies.mjs
node scripts/check-editorial-sector-seeds.mjs
```

如果全库检查存在其他分支留下的失败：

1. 保留完整错误输出；
2. 确认本次板块不再出现在错误清单中；
3. 运行本次专项 QA 和迁移测试；
4. 不得为了“全绿”放宽全局规则或把真实冲突加入白名单；
5. 在交付和 PR 中明确列出既有阻断项。

## 10. 浏览器验收

打开：

```text
http://localhost:3000/sector-editor
```

核对：

- 活动目录数量和名称正确；
- 被删除身份不再出现；
- 新版轮廓、标签和面积合理；
- 板块可点击并进入编辑；
- 手工修改草稿没有被覆盖；
- 未修改草稿已升级；
- 归档草稿为只读且不参与导出；
- 导出按钮可用；
- 页面无错误覆盖层和控制台错误。

不要为了测试迁移而清空用户 localStorage。优先用单元测试构造旧草稿；浏览器只核对真实迁移结果。

## 11. 全域拓扑修复预览

当任务是排查项目板块的全域空白和交叠，而不是发布单个已审核板块时，可生成本地拓扑修复预览：

```bash
npm run build:topology-repair-preview
```

固定输入与边界：

- 项目当前候选面和用户复核覆盖面；
- `data/geo/sources/osm-shanghai-260728.json` 锁定的 OSM/Geofabrik 街镇行政面；
- `outputs/realtynavi/` 中经用户确认授权的私有快照，只用于板块名称、归属和相邻关系判断。

生成结果位于：

```text
outputs/topology-repair/project-sector-topology-repair.wgs84.geojson
outputs/topology-repair/project-sector-topology-repair-report.json
```

两者都被 Git 忽略，只能通过本地研究模式的“项目拓扑修复预览”查看。不得把预览 GeoJSON 复制到 `reviewed-candidates.wgs84.json`，也不得把自动归属视为人工裁定。需要发布时，应根据报告逐块复核，再把明确的 OSM 边界与共同邻居写进 batch/workpack 后重新生成。

生成器必须保证：

- RealtyNavi 坐标不成为输出边；
- 上海下载框内的外省街镇被显式排除；
- 重叠处理、空白归属、数值残差和被排除面全部进入审计报告；
- 输出经过有效性、米制重叠、空白和超界检查。

## 12. 低级别 Agent 的最短执行模板

收到“调整 `<板块名>`”后，按这个模板行动：

```text
1. 读 AGENTS.md 和 docs/SECTOR-BOUNDARY-PLAYBOOK.md。
2. 搜 `<板块名>` 和稳定 sector ID，报告当前身份、几何来源、batch/workpack 和邻居。
3. 查官方四至或行政/规划依据；商业平台只确认市场语义，不拿坐标。
4. 若定义仍有两种合理选择，先让用户裁定；否则直接继续。
5. 修改 batch/workpack 生成规则，在 EPSG:32651 联合处理全部受影响邻居。
6. 重建生成产物，更新 registry、sources、boundary evidence、索引和草稿迁移。
7. 跑专项拓扑 QA、editor migration、typecheck、lint、build。
8. 在 /sector-editor 点验并报告面积、重叠、共享边、来源和未解决风险。
```

完成标准不是“地图上看着像”，而是定义可解释、坐标可复算、来源可审计、邻接拓扑可验证、历史草稿可恢复。
