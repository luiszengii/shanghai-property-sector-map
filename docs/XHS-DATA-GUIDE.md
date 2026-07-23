# 小红书房产观点数据使用与复爬手册

## 1. 这批数据是什么

这是为“上海楼市互动地图”采集的小红书公开房产讨论样本，用来发现用户关心的问题、形成板块研究线索和规划后续核验任务。

它不是权威房价、规划、学区或设施数据库。帖子作者可能是业主、中介、自媒体或普通看房者，内容可能过时、夸张、错误或带有利益立场。

### 当前快照

| 字段 | 内容 |
|---|---|
| 采集日期 | 2026-07-22 |
| 平台 | 小红书 Web |
| 工具 | `NanmiCoder/MediaCrawler` |
| 工具提交 | `0625e01a6bc717a3fc9c96d3dac7fb8957043838` |
| 关键词 | 上海 + 20 个板块名 + 买房优缺点（完整清单见批次与报告） |
| 原始批次 | 初始四板块；批次 A/B 补 8 板块；批次 C（陆家嘴/唐镇/七宝/新江湾城）；批次 D（真如/南翔/顾村/松江新城） |
| 原始正文 | 400 条搜索返回；按 `note_id` 去重后 379 条 |
| 原始评论 | 1,817 条；按评论标识去重后再清洗 |
| 相关正文 | 350 条唯一正文（正文直接提及对应板块） |
| 脱敏有效评论 | 1,558 条 |
| 采集设置 | 每个关键词约 20 篇；每篇最多 5 条一级评论；不抓二级评论；并发 1 |

## 2. 数据在哪里

| 路径 | 用途 | 是否可直接进入产品 |
|---|---|---|
| `outputs/xhs_raw/xhs/jsonl/search_contents_2026-07-22.jsonl` | MediaCrawler 原始正文 | 否 |
| `outputs/xhs_raw/xhs/jsonl/search_comments_2026-07-22.jsonl` | MediaCrawler 原始评论 | 否 |
| `outputs/xhs_raw/batch-a-2026-07-22/xhs/jsonl/` | 徐汇滨江、北外滩、金桥、虹桥商务区原始批次 | 否 |
| `outputs/xhs_raw/batch-b-2026-07-22/xhs/jsonl/` | 三林、北蔡、古美、莘庄原始批次 | 否 |
| `outputs/xhs_raw/batch-c-2026-07-22/xhs/jsonl/` | 陆家嘴、唐镇、七宝、新江湾城原始批次 | 否 |
| `outputs/xhs_raw/batch-d-2026-07-22/xhs/jsonl/` | 真如、南翔、顾村、松江新城原始批次 | 否 |
| `outputs/xhs_analysis/relevant_notes.csv` | 相关正文的隐私降敏索引、摘要、互动量与来源链接 | 仅供研究 |
| `outputs/xhs_analysis/sanitized_comments.jsonl` | 去除昵称、用户标识和评论 ID 的评论样本 | 仅供研究 |
| `outputs/xhs_analysis/batch_manifest.json` | 批次目录、去重前后数量和各板块覆盖统计 | 仅供研究 |
| `outputs/xhs_analysis/web_dataset.json` | 独立“板块观察”页面使用的本地脱敏数据包 | 仅供本地网站读取，不提交仓库 |
| `outputs/xhs_analysis/REPORT.md` | 统一 12 板块的利好/利空观点报告 | 可做研究入口，不是事实数据 |
| `scripts/xhs_property_report.py` | 从原始 JSONL 重新生成清洗数据和报告 | 可复用 |

`outputs/` 和 `work/` 已被 `.gitignore` 排除。这样可以避免误提交平台语料、用户信息、登录相关数据和临时访问参数。其他 agent 在同一工作区可以读取它们；新克隆的仓库需要按本手册重新采集。

## 3. 字段如何理解

### `relevant_notes.csv`

- `sectors`：正文直接提及的一个或多个目标楼市板块；同帖跨关键词只保留一行。
- `source_keywords`、`batch_ids`：该正文来自哪些搜索词、哪些本地批次，便于复核采集口径。
- `note_id`：帖子 ID，仅用于本地去重和回溯。
- `title`、`excerpt`：标题与最多 500 字的正文摘要。
- `published_at`：帖子发布时间，按 Asia/Shanghai 转为日期。
- `likes`、`collects`、`comments`、`shares`：采集时看到的互动量，不代表真实性或观点正确性。
- `source_url`：不带会话或临时访问参数的原帖 ID 链接。

### `sanitized_comments.jsonl`

- 仅保留 `sectors`、`note_id`、评论文本、点赞数和不带令牌的原帖链接。
- 已移除作者昵称、用户哈希、评论 ID 等身份字段。
- 评论只应作为问题线索或情绪信号，不能单独作为事实证据。

## 4. 推荐用法

1. 从 `REPORT.md` 了解各板块被反复讨论的优势和问题。
2. 在 `relevant_notes.csv` 中按板块、互动量或关键词筛选代表性帖子。
3. 把观点转成“待核验事项”，例如噪声、真实步行距离、学校对口、规划兑现、物业和楼栋产品差异。
4. 使用官方或一手来源核验；实地体验类事项要细化到小区、楼栋、楼层和时段。
5. 只有完成核验后，才能写入地图正式字段，并同时保留来源、核验日期和不确定性说明。

不要把互动量当可信度。高赞内容只适合决定“先核验什么”，不能决定“什么是真的”。

### 网站中的浏览入口

- 地图首页的“板块观察”先显示聚合概览，点击“进入完整板块观察”进入 `/observations` 独立页面。
- 独立页面通过 `/api/xhs-observations` 读取本地 `web_dataset.json`，支持按行政区与板块二级筛选、正文/评论关键词搜索及高亮、展开脱敏评论和跳转小红书原帖。
- 数据包位于已忽略的 `outputs/`，不会随代码进入新克隆或公开构建；新环境需要先运行清洗脚本生成。
- 页面显示正文摘要和脱敏评论，不显示作者身份、评论标识或临时访问参数。原帖链接是否可打开取决于平台当时的登录与访问状态。

## 5. 如何重新采集同类数据

### 第一次准备

在项目根目录执行：

```bash
git clone --depth 1 https://github.com/NanmiCoder/MediaCrawler.git work/MediaCrawler
cd work/MediaCrawler
uv sync
uv run playwright install chromium
```

若使用 MediaCrawler 的独立浏览器，将 `work/MediaCrawler/config/base_config.py` 中的 `ENABLE_CDP_MODE` 设为 `False`。若使用已有 Chrome，则按 MediaCrawler README 开启远程调试，且不要把 Cookie 导出到仓库。

### 小规模复爬命令

下面的命令会打开独立浏览器。首次运行需要用户用小红书 App 扫码：

```bash
cd work/MediaCrawler
uv run main.py \
  --platform xhs \
  --lt qrcode \
  --type search \
  --keywords '上海金桥买房优缺点,上海三林买房优缺点' \
  --get_comment yes \
  --get_sub_comment no \
  --headless no \
  --save_data_option jsonl \
  --crawler_max_notes_count 20 \
  --max_comments_count_singlenotes 5 \
  --max_concurrency_num 1 \
  --save_data_path '/Users/lingjunzeng/Documents/上海楼盘地图/outputs/xhs_raw/batch-YYYY-MM-DD'
```

注意：小红书搜索一页通常返回约 20 条，因此 `crawler_max_notes_count 20` 是合适的首轮采样。先看相关性和账号状态，再决定是否扩量。

### 关键词规则

- 默认使用 `上海 + 板块名 + 买房优缺点`，保证不同板块口径一致。
- 需要进一步定位时，再追加“小区名 + 隔音/物业/通勤/学区/采光”等问题词。
- 不要一次塞入大量关键词。建议每轮 2–4 个板块、并发 1、评论不超过 5 条。
- 不要为了扩大样本绕过登录、验证码、限流或其他平台控制。

### 重新生成报告

脚本当前读取 2026-07-22 的五个独立批次，并生成统一 20 板块快照：

```bash
python3 scripts/xhs_property_report.py
```

新增日期或板块时，需要：

1. 新建独立目录，例如 `outputs/xhs_raw/batch-c-YYYY-MM-DD/xhs/jsonl/`；不要复用当天已有目录，以免 JSONL 追加混入旧样本。
2. 在 `RAW_BATCHES` 登记该批次，在 `KEYWORD_TO_SECTOR` 登记搜索词与板块名。
3. 在 `SECTOR_ANALYSIS` 基于多个独立正文和评论样本重写定位、利好、利空、待核验事项与代表来源。
4. 运行脚本，核对 `batch_manifest.json` 的每个搜索词均有返回、统一数据无重复 ID，再更新本文“当前快照”。

运行后检查：

```bash
python3 -m py_compile scripts/xhs_property_report.py
python3 scripts/xhs_property_report.py
wc -l outputs/xhs_analysis/*
rg -n -i 'nickname|creator_hash|comment_id|cookie|xsec_token' outputs/xhs_analysis
```

最后一条命令应没有结果，以确认清洗产物不含这些身份字段。

## 6. 合规与质量边界

- 仅处理用户授权范围内的公开内容，并遵守平台规则和适用法律。
- 不采集或传播手机号、住址、账号标识等个人敏感信息。
- 不提交 Cookie、短信验证码、二维码、会话文件或访问令牌。
- 不把完整平台语料打包进前端、公开仓库、模型训练集或第三方服务。
- 若需要对外发布，优先发布聚合趋势、少量必要引用和原始来源链接。
- 任何价格、学区和规划结论都应标注核验日期，因为这些信息变化快。

## 7. 当前报告的核心边界

现有报告在原 12 板块基础上新增陆家嘴、唐镇、七宝、新江湾城、真如、南翔、顾村和松江新城，共覆盖 20 个板块；它仍不代表上海全部楼市板块，也不代表小红书全体用户。新增板块须沿用相同低并发、独立批次和去重口径。
