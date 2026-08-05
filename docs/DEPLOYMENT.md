# 腾讯云首尔生产与预生产部署

生产站点运行在腾讯云轻量应用服务器 `43.155.217.8`，域名为
`https://shfang.xyz`。阿里云 DNS 中的 `@` 与 `www` A 记录均指向该
IP；Nginx 终止 TLS，并反向代理到本机 `127.0.0.1:3000` 的 Next.js
standalone 服务。

## 自动发布

`.github/workflows/deploy-tencent.yml` 在每次推送到 `main` 时：

1. 使用锁文件安装依赖；
2. 运行 lint、TypeScript 与地图性能测试；
3. 使用生产高德 Key 与 Umami Website ID 构建 Next.js standalone 产物；
4. 排除仅允许本地读取的 `outputs/` 数据；
5. 通过专用 SSH 账号上传到 `/opt/shfang/releases/<commit-sha>`；
6. 原子切换 `/opt/shfang/current` 并重启 `shfang-map.service`；
7. 先检查本机服务，再检查 `https://shfang.xyz/`。

生产构建是“公开展示模式”：开放首页 `/`、公开观察页 `/observations` 和固定楼盘
详情页 `/projects/<id>`。板块编辑器、楼盘资料中心 `/sources`、持久版本 API、
`/api/source-ledger`、本地私有边界快照、待核验项目资料和详细小红书研究数据只在
`next dev` 开发模式可用；正式构建缺少任何额外环境变量时也会默认关闭这些能力。
部署激活脚本会验证代表性公开页面为 200、内部页面/API 为 404，并检查首页没有
私有入口或数据源名称；任一条件失败都会回滚到前一个版本。

`/observations` 使用仓库内经过审查的聚合快照
`src/data/public-observations.json`，不读取生产服务器上的 `outputs/`。
生成命令是：

```bash
pnpm build:public-observations
pnpm check:public
```

生成前需要本地存在 `outputs/xhs_analysis/web_dataset.json`。提交前应查看
公开快照差异；发布检查会拒绝身份字段、评论/帖子内部 ID、临时来源链接、
研究专用项目字段或任何被 Git 跟踪的 `outputs/` 文件。

同一时间只允许一个生产发布运行。服务器保留最近五个版本；新版本
健康检查失败时，`scripts/activate-release.sh` 会切回前一个版本。

## 预生产发布与晋级

`pre-prod` 是唯一的预生产集成分支。功能 PR 先合入该分支，
`.github/workflows/deploy-preprod.yml` 随即将同一公开构建发布到
`https://pre-prod.shfang.xyz`。预生产和生产共用首尔实例，但分别使用：

- `/opt/shfang-preprod/` 与 `/opt/shfang/` 发布目录；
- `shfang-preprod.service`（`127.0.0.1:3001`）与 `shfang-map.service`（`127.0.0.1:3000`）；
- `pre-prod.shfang.xyz` 与 `shfang.xyz` Nginx 虚拟主机。

预生产只用于人工验收，允许匿名访问，但由 Nginx 返回
`X-Robots-Tag: noindex, nofollow` 以阻止搜索引擎收录。确认后必须创建
`pre-prod` 到 `main` 的
PR；`Verify promotion source` 检查会拒绝其他来源合入 `main`。

预生产构建沿用公开展示模式，不能从远程入口写入本地编辑器版本或读取本地研究数据。
预生产默认不注入 Umami Website ID，因此不会污染生产访问统计。

公开仓库包含一个指向受鉴权私有研究仓库的 `.private-data` submodule。
生产、预生产和 PR 验证工作流均显式使用 `submodules: false`，不得初始化、
读取或打包该仓库。本地的 `pnpm setup:local` 与生产部署是两条独立路径。

## GitHub Actions Secrets

仓库需要以下 Secrets，值不得提交：

- `NEXT_PUBLIC_AMAP_KEY`
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE`
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
- `TENCENT_SSH_PRIVATE_KEY`
- `TENCENT_SSH_KNOWN_HOSTS`

SSH 私钥只用于 GitHub Actions。服务器端 `deploy` 用户只允许公钥登录，
并且只能免密重启和检查两个应用服务。预生产的
Actions 外网验收必须不带认证信息，以及时发现匿名访问回归。

访问统计后台、登录入口、数据查看和无数据排查见
[`docs/ANALYTICS.md`](ANALYTICS.md)。
日常巡检、告警、备份恢复、服务器重建、密钥轮换和续费核验见
[`docs/OPERATIONS-RUNBOOK.md`](OPERATIONS-RUNBOOK.md)。

## 服务器路径与服务

- 生产发布包：`/opt/shfang/releases/`
- 上传暂存：`/opt/shfang/incoming/`
- 当前版本：`/opt/shfang/current`
- systemd：`shfang-map.service`
- Nginx：`/etc/nginx/sites-available/shfang.xyz`
- TLS 续期：`certbot.timer`

预生产对应 `/opt/shfang-preprod/releases/`、`/opt/shfang-preprod/incoming/`、
`/opt/shfang-preprod/current` 和 `shfang-preprod.service`。

常用只读检查：

```bash
systemctl status shfang-map.service
systemctl status nginx.service
journalctl -u shfang-map.service -n 100 --no-pager
curl -I https://shfang.xyz/
```

## 手动回滚

自动回滚未覆盖的情况，可在服务器上把 `current` 指向一个已保留版本，
然后重启服务：

```bash
ln -sfn /opt/shfang/releases/<commit-sha> /opt/shfang/.current-rollback
mv -Tf /opt/shfang/.current-rollback /opt/shfang/current
systemctl restart shfang-map.service
```

回滚前应先确认目标目录存在且包含 `server.js`。
预生产回滚命令及回滚后的完整公开面检查见 `OPERATIONS-RUNBOOK.md`。
