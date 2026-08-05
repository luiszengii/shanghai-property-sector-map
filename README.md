# 上海楼市互动地图

面向房产中介主播、房产研究机构和购房用户的全屏互动地图 MVP。项目不按行政区展示，而是按前滩、大宁、张江、徐泾等常见“楼市板块”组织地图信息。

> 当前板块边界与设施点位均为明确标记的演示数据，不代表官方边界或真实设施清单，也不构成购房建议。

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript
- Tailwind CSS 4
- 高德地图 JavaScript API 2.0
- Zustand（筛选状态保存于当前页面会话）
- 本地 JSON / GeoJSON
- pnpm

## 本地运行

要求 Node.js 22.13+ 与 pnpm。

仓库所有者在新设备上使用：

```bash
gh auth login
gh auth setup-git
git clone --recurse-submodules \
  https://github.com/luiszengii/shanghai-property-sector-map.git
cd shanghai-property-sector-map
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

`pnpm setup:local` 需要已登录且有权访问私有数据仓库的 GitHub CLI。它会：

- 初始化 `.private-data` 私有 submodule；
- 将私有仓库的 `outputs/` 链接到当前仓库被忽略的本地 `outputs/`；
- 从私有仓库的 Repository Variables 获取高德本地开发配置并写入
  `.env.local`，过程中不打印变量值。

没有私有仓库权限的公开贡献者仍可使用：

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

打开 `http://localhost:3000`。在 `.env.local` 中填入：

```env
NEXT_PUBLIC_AMAP_KEY=你的高德 Web 端 Key
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=你的高德安全密钥
```

如果没有配置 Key，页面会显示清晰的配置提示，不会白屏。

### 私有研究数据

个人学习用的楼盘台账、安居客、房天下、HFWGSJ、RealtyNavi 和拓扑研究文件
位于私有仓库 `luiszengii/shanghai-property-sector-map-private-data`。公开
仓库只跟踪 submodule 提交指针，不跟踪或部署实际私有文件。

小红书原始/清洗数据、PDF 缓存、MediaCrawler、浏览器登录数据和 OSM 大型
工作下载不进入该私有仓库。私有商业地图快照只用于个人研究，不是可发布边界。

## 数据文件

- `src/data/sectors.geojson`：12 个楼市板块的近似演示多边形（正式替换入口）
- `src/data/sectors.json`：供 Next.js 直接打包使用的同内容镜像
- `src/data/places.json`：10 类设施、每类少量演示点位
- `src/data/categories.json`：分类名称、分组、颜色与图标配置

### 小红书房产观点样本

本地工作区另有一批通过 MediaCrawler 采集的小红书房产讨论样本，当前覆盖前滩、张江、大宁和徐泾。它用于发现用户关注点和生成待核验线索，不属于地图正式事实数据。

- 数据说明、使用边界与复爬方法：[`docs/XHS-DATA-GUIDE.md`](docs/XHS-DATA-GUIDE.md)
- 本地报告：`outputs/xhs_analysis/REPORT.md`
- 清洗脚本：`scripts/xhs_property_report.py`

`outputs/` 默认不进入 Git，避免误提交平台原文、用户信息和临时访问参数。

替换正式数据时请保持现有字段结构；板块边界使用 WGS84/GCJ-02 前需核对坐标系并统一转换。当前演示坐标仅用于界面功能演示。

## 功能

- 随缩放级别平滑切换板块总览、主要设施和详细点位
- 板块悬停高亮、点击定位与详情
- 设施分类单独开关、全选、清空和会话内记忆
- 搜索板块名称与点位名称并自动定位
- 点位信息、来源、更新时间、演示标记及前端距离估算
- 桌面悬浮筛选面板、移动端底部抽屉和底部详情卡
- 数据说明弹窗、加载状态、地图错误与缺少环境变量提示

## 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 线上环境与访问数据

- 生产站：[`https://shfang.xyz`](https://shfang.xyz)
- 预生产：[`https://pre-prod.shfang.xyz`](https://pre-prod.shfang.xyz)
- 访问统计后台：[`https://analytics.shfang.xyz`](https://analytics.shfang.xyz)

生产站使用自建 Umami 查看匿名访问数据。登录后台后进入
`Websites → shfang.xyz → 概览`，可以查看访客、访问次数、浏览量、来源、
浏览器、设备、地域和页面路径；“实时”页面用于确认当前上报是否正常。
预生产默认不写入生产统计。

账号、查看步骤、无数据排查和服务器运维边界见
[`docs/ANALYTICS.md`](docs/ANALYTICS.md)。管理员密码和数据库密钥不得写入
仓库、Issue、PR 或 Actions 日志。

部署发布说明见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)；日常巡检、告警、
Umami 备份恢复、服务器重建、密钥轮换、域名与续费核验见
[`docs/OPERATIONS-RUNBOOK.md`](docs/OPERATIONS-RUNBOOK.md)。会变化的控制台状态
必须现场核验，不能沿用历史截图或聊天结论。

## 部署到 Vercel

1. 将项目推送到 GitHub / GitLab / Bitbucket。
2. 在 Vercel 新建项目并导入仓库；Framework Preset 选择 Next.js。
3. Install Command 使用 `pnpm install`，Build Command 使用 `pnpm build`。
4. 在 Vercel 项目的 Environment Variables 中配置：
   - `NEXT_PUBLIC_AMAP_KEY`
   - `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE`
5. 在高德开放平台把 Vercel 生产域名和需要使用的预览域名加入 Web 服务安全域名配置。
6. 重新部署并检查地图初始化、缩放、搜索、筛选和移动端抽屉。

项目没有数据库或服务端数据依赖，可直接作为标准 Next.js 应用部署。

## 后续规划（首版不开发）

- 正式板块 GeoJSON 的采集、审核和版本管理
- 公开设施数据的来源核验、去重和定期更新
- 数据库与管理后台
- VR 全景图片与楼盘户型图
- 实时房价、挂牌量和成交量
- 学区对口关系
- 用户登录、付费功能和 AI 聊天助手
