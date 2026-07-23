# 第二波楼市板块并行绘制协作单

更新日期：2026-07-23

## 目标

在不把行政边界冒充楼市板块、也不让多个 agent 同时修改中央拓扑文件的前提下，并行推进下一批候选边界。

当前已经进入中央候选拓扑组的板块是：

- 杨思前滩
- 世博
- 上南
- 三林

北外滩已有独立候选面。北蔡、古美、莘庄、徐泾、大宁、张江、金桥目前主要只有行政参考面或演示面，不能直接标记为精确楼市边界。

## 推荐并行批次

### 工作包 A：北蔡—御桥

优先级：最高

必须由同一个 agent 处理，不能把北蔡和御桥分给两个人。需要先裁定：

1. 北蔡、御桥是否拆成两个互斥一级板块；
2. 莲溪、大华是北蔡内部片区、独立一级板块，还是仅作为边界核验样本；
3. 北蔡西侧如何与三林、上南现有候选面闭合；
4. 北蔡南侧与康桥、东侧与张江的共享边只做到“待相邻板块复核”，不得单方冻结。

本包可以直接进入候选绘制，但最终并入中央拓扑前，必须由总装者复核与三林、上南的共享边。

### 工作包 B：徐泾—虹桥商务区

优先级：高

必须由同一个 agent 处理。两者在西虹桥一带存在直接的口径与共享边依赖，不能分别套用徐泾镇界和虹桥商务区规划全域。

需要先裁定：

1. 徐泾采用市场徐泾、徐泾镇，还是西虹桥片区口径；
2. 虹桥商务区采用核心区还是更大的主功能区；
3. 国家会展中心、虹桥枢纽及周边项目归属；
4. 两个一级板块之间只保留一条共享边。

本包与浦东南工作包空间隔离，可以完全并行。

### 工作包 C：古美—莘庄

优先级：高

可以由同一个 agent 连续处理，以复用闵行主城片区规划、道路水系和项目归属核验。两块不一定存在完整的直接共享边，因此应分别输出 polygon，但要同时检查梅陇、七宝、春申等相邻市场语义，避免用行政镇街边界机械填满中间区域。

需要先裁定：

1. 古美是否以古美路街道为骨架，再按七宝、梅陇项目归属修正；
2. 莘庄采用市场莘庄、莘庄镇，还是莘庄副中心口径；
3. 莘庄南北片与春申是否拆分；
4. 未被可靠市场板块覆盖的区域允许留白。

本包与浦东南、西虹桥工作包空间隔离，可以完全并行。

### 备用独立工作包：大宁

如果还有空闲 agent，可单独处理大宁。先在“环大宁 10.92 平方公里”和“围绕大宁公园的市场住宅板块”之间裁定，不得直接把当前大宁路街道行政参考面升级为楼市边界。

徐汇滨江也可作为另一个独立包，但必须先选择 7.4 平方公里重点范围、9.4 平方公里开发范围或另定义市场板块。它不应和大宁合成一个几何任务，只能由同一 agent 顺序处理。

## 本轮暂不并行定稿的板块

- 杨东、花木、张江：三者与北蔡形成连续边界链。可以并行做名称和项目归属研究，但应等北蔡—御桥候选面稳定后再定稿。
- 张江、金桥：两者都存在“行政镇、科学城/开发区、市场板块”多重语义，且共享边会受 2025 年行政调整参考影响，适合作为下一波同一工作包。
- 康桥：会同时影响御桥、北蔡和三林南侧，不应由某个工作包单方面画死。

## 文件所有权

并行 agent 不得直接修改以下中央文件：

- `src/data/sectors/registry.json`
- `src/data/sectors/sources.json`
- `src/data/sectors/boundary-evidence.json`
- `src/data/sectors/reviewed-candidates.wgs84.json`
- `src/data/sectors/reviewed-candidates.manifest.json`
- `src/data/sectors.geojson`
- `data/geo/reviewed-candidate-definitions.json`
- `scripts/build-reviewed-sector-candidates.py`

每个 agent 只在自己的目录产出：

```text
data/geo/workpacks/<workpack-id>/
  identity-decisions.md
  definition.fragment.json
  candidate.wgs84.geojson
  qa.json
  sources.md
```

其中：

- `identity-decisions.md` 记录用户选择、别名、一级/子范围身份；
- `definition.fragment.json` 只保存以后可并入中央定义文件的片段；
- `candidate.wgs84.geojson` 使用 WGS84，并明确是候选面；
- `qa.json` 至少记录面积、几何有效性、自重叠、与已知相邻面的重叠/缝隙、共享边长度；
- `sources.md` 记录来源、访问日期、坐标系、许可和不能直接复用的材料。

## 总装规则

总装者按以下顺序合并：

1. 复核每个工作包的身份裁定与来源；
2. 把新身份加入 `registry.json`，没有可靠几何时保持 `geometry.status = "missing"`；
3. 合并来源和逐边证据；
4. 把候选定义片段加入中央定义文件；
5. 将相邻板块加入同一个 `topologyGroups`，为每条共享边指定唯一所有者；
6. 重新生成候选 GeoJSON 和 manifest；
7. 校验一级板块无面积重叠、共享边连续、道路/河流中心线规则一致；
8. 最后才更新主地图数据。

## 可直接转发给其他 agent 的任务

### Agent A

> 负责工作包 A“北蔡—御桥”。先阅读 `docs/coordination/sector-drawing-wave-2.md`、相关 ADR、`docs/SECTOR-PILOT-EVIDENCE.md` 和 `docs/research/yangsi-qiantan-adjacent-market-sector-identity-2026-07-23.md`。先向用户逐题裁定北蔡/御桥/莲溪/大华的一级与子范围身份，再用政府事实、允许复用的 OSM 道路水系和独立卖方项目归属生成候选面。不要复制商业地图 polygon，不要修改中央文件；只写 `data/geo/workpacks/beicai-yuqiao/`。输出 WGS84 candidate、definition fragment、sources 和 QA，特别核验与三林、上南的重叠、缝隙和共享边。

### Agent B

> 负责工作包 B“徐泾—虹桥商务区”。先阅读 `docs/coordination/sector-drawing-wave-2.md`、相关 ADR 和 `docs/SECTOR-PILOT-EVIDENCE.md`。先向用户裁定徐泾口径、虹桥商务区版本以及会展中心/枢纽归属，再同时绘制两个互斥候选面。不要直接采用行政镇界或 151.4/535 平方公里规划全域，不要修改中央文件；只写 `data/geo/workpacks/xujing-hongqiao/`。输出一条唯一共享边及完整 QA。

### Agent C

> 负责工作包 C“古美—莘庄”。先阅读 `docs/coordination/sector-drawing-wave-2.md`、相关 ADR 和 `docs/SECTOR-PILOT-EVIDENCE.md`。逐题裁定市场古美、市场莘庄、莘庄南北片/春申的关系；以行政街镇和规划单元为参考骨架，但按独立卖方归属、稳定道路水系与项目完整性修正。不要修改中央文件；只写 `data/geo/workpacks/gumei-xinzhuang/`。两个 polygon 分别输出，并检查梅陇、七宝之间是否应留白。

### 总装者

> 暂不另画新区域。负责接收三个 workpack，审查身份、来源、CRS、拓扑和项目完整性，再顺序合并中央登记表、证据表和候选定义。相邻候选存在冲突时，以共享边唯一所有权为准，不直接平均两套 polygon。
