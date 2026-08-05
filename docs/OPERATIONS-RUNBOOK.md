# shfang.xyz 运维与灾备手册

本手册覆盖生产站、预生产站和 Umami 统计服务的日常检查、故障恢复与交接。
部署流水线的实现细节见 [`DEPLOYMENT.md`](DEPLOYMENT.md)，统计采集与后台使用见
[`ANALYTICS.md`](ANALYTICS.md)。

文档只记录架构、位置、非敏感标识和可执行流程。密码、SSH 私钥、数据库连接串、
Cookie、Token、验证码和 `APP_SECRET` 不得写入仓库、Issue、PR、Actions 日志或
agent 记忆。

## 1. 服务清单

| 服务 | 外部入口 | 本机上游 | 服务/运行方式 | 数据位置 |
| --- | --- | --- | --- | --- |
| 生产站 | `https://shfang.xyz`、`https://www.shfang.xyz` | `127.0.0.1:3000` | `shfang-map.service` | `/opt/shfang/`，无生产数据库 |
| 预生产站 | `https://pre-prod.shfang.xyz` | `127.0.0.1:3001` | `shfang-preprod.service` | `/opt/shfang-preprod/`，无生产数据库 |
| 访问统计 | `https://analytics.shfang.xyz` | `127.0.0.1:3002` | `/opt/umami/` 下的 Docker Compose | PostgreSQL 持久化数据卷 |

当前源站是腾讯云首尔轻量应用服务器 `43.155.217.8`，DNS 托管在阿里云。
`@` 与 `www` 指向该源站；其余记录应以阿里云 DNS 控制台的现场状态为准。

## 2. 会变化的资产状态

以下项目不能从聊天记录或历史截图推断。接管部署、处理续费或变更 DNS 前，必须在
对应控制台现场核验，并更新“最后核验”及非敏感结论。到期日可以记录，账号、订单号、
密钥和接收人联系方式不得记录。

| 项目 | 控制台/证据入口 | 当前文档状态 | 最后核验 |
| --- | --- | --- | --- |
| 轻量服务器到期日与自动续费 | 腾讯云轻量应用服务器控制台 | 待现场核验 | 未核验 |
| 月流量包、磁盘、CPU、内存告警及阈值 | 腾讯云监控/告警策略 | 待现场核验 | 未核验 |
| `shfang.xyz` 到期日与自动续费 | 阿里云域名控制台 | 待现场核验 | 未核验 |
| DNS 记录、TTL 与变更保护 | 阿里云云解析 DNS | 待现场核验 | 未核验 |
| TLS 自动续期与最近一次成功时间 | 服务器 `certbot.timer` 和证书信息 | 已知使用 Certbot，成功时间待核验 | 未核验 |
| Umami 异机备份任务及最近一次成功时间 | 服务器和备份目标 | 尚未建立可验证记录 | 未核验 |

核验后只提交非敏感状态，例如“自动续费已开启、2026-08-05 核验”。若控制台会显示
账号、手机号或订单信息，不要把截图提交到公开仓库。

## 3. 日常只读检查

在服务器上运行：

```bash
systemctl is-active shfang-map.service
systemctl is-active shfang-preprod.service
systemctl is-active nginx.service
systemctl is-active certbot.timer
systemctl status certbot.timer --no-pager
journalctl -u shfang-map.service -n 100 --no-pager
journalctl -u shfang-preprod.service -n 100 --no-pager
df -h / /opt
free -h
cd /opt/umami && docker compose ps
```

从外部网络检查：

```bash
curl --fail --silent --show-error --output /dev/null https://shfang.xyz/
curl --fail --silent --show-error --output /dev/null https://pre-prod.shfang.xyz/
curl --fail --silent --show-error --output /dev/null https://analytics.shfang.xyz/script.js
curl --silent --show-error --head https://pre-prod.shfang.xyz/ |
  grep --ignore-case '^x-robots-tag:.*noindex'
```

仓库内的完整公开面检查使用：

```bash
pnpm verify:public https://shfang.xyz
pnpm verify:public https://pre-prod.shfang.xyz
```

它会检查首页、公开观察页、一个固定楼盘详情页，并确认本地资料中心及私有 API
在公开构建中返回 404。Umami 事件是否真正入库仍须按 `ANALYTICS.md` 检查浏览器
`/api/send` 和后台“实时”页面。

## 4. 监控与告警最低要求

以下告警应有明确阈值、接收渠道、负责人和最近一次测试时间。没有控制台证据时，
不得回答“已经开启”。

- 外部可用性：`shfang.xyz`、`pre-prod.shfang.xyz`、
  `analytics.shfang.xyz/script.js`；
- 主机：CPU、内存、系统盘使用率、月流量包消耗；
- 服务：两个 systemd 服务、Nginx、Umami 和 PostgreSQL 容器；
- TLS：证书剩余有效期及 Certbot 续期失败；
- 数据保护：Umami 备份任务失败、备份过旧、恢复演练失败；
- 发布：GitHub Actions 生产/预生产部署失败。

建议至少每季度执行一次通知测试。告警接收人的姓名或联系方式保存在受控系统中，
公开文档只记录负责人角色，例如“站点所有者”。

## 5. Umami PostgreSQL 备份

应用发布包与 Umami 数据是两类恢复对象：GitHub 和服务器保留版本可以恢复代码，
不能恢复访问历史。Umami 数据库必须有加密的异机备份。

首次建立任务前，在 `/opt/umami` 只读确认实际服务名和挂载：

```bash
cd /opt/umami
docker compose config --services
docker compose config --images
docker compose config --volumes
docker compose ps
```

选择 PostgreSQL 服务后导出；`<postgres-service>` 必须替换为现场确认的 Compose
服务名。命令在容器内使用现有环境变量，不把密码打印到终端：

```bash
set -o pipefail
cd /opt/umami
postgres_service="REPLACE_WITH_CONFIRMED_SERVICE_NAME"
backup_dir=/opt/umami/backups
backup_file="${backup_dir}/umami-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
install -d -m 0700 "${backup_dir}"
docker compose exec -T "${postgres_service}" sh -lc \
  'pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' |
  gzip -9 > "${backup_file}"
gzip -t "${backup_file}"
chmod 0600 "${backup_file}"
```

备份完成不等于灾备完成。还必须把文件加密复制到服务器之外的受控位置，并记录：

- 自动执行频率和最大可接受数据丢失时间（RPO）；
- 本机与异机保留周期；
- 最近一次成功备份及校验时间；
- 恢复负责人和最大可接受恢复时间（RTO）；
- 最近一次隔离环境恢复演练结果。

在异机目标、RPO、RTO 和保留周期得到用户确认前，不在本文猜测数值，也不自动删除
任何历史备份。

## 6. Umami 恢复演练

恢复前先停止写入，并保留当前数据库的额外快照。不得直接在生产库上把未验证的备份
当作第一次演练。

1. 核对备份哈希并运行 `gzip -t <backup-file>`；
2. 在隔离的临时 PostgreSQL 实例创建空数据库；
3. 使用与备份来源兼容的 PostgreSQL 主版本；
4. 将 SQL 导入空库并启动同版本 Umami；
5. 验证登录、Website `shfang.xyz`、历史浏览量和新事件写入；
6. 记录耗时、失败点和演练日期，随后销毁临时实例。

导入的通用形式如下，具体数据库创建与连接参数必须以现场 Compose 配置为准：

```bash
postgres_service="REPLACE_WITH_CONFIRMED_SERVICE_NAME"
backup_file="/path/to/verified-umami-backup.sql.gz"
gzip -dc "${backup_file}" |
  docker compose exec -T "${postgres_service}" sh -lc \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

## 7. 发布、验收与回滚

功能只能按“功能 PR → `pre-prod` → 人工验收 → `pre-prod` 到 `main` 的晋级 PR”
发布。必须确认晋级的是已部署并验收的确切 `pre-prod` head；等待中的检查不是绕过
条件。

生产手动回滚：

```bash
test -f /opt/shfang/releases/<commit-sha>/server.js
ln -sfn /opt/shfang/releases/<commit-sha> /opt/shfang/.current-rollback
mv -Tf /opt/shfang/.current-rollback /opt/shfang/current
systemctl restart shfang-map.service
```

预生产手动回滚：

```bash
test -f /opt/shfang-preprod/releases/<commit-sha>/server.js
ln -sfn /opt/shfang-preprod/releases/<commit-sha> \
  /opt/shfang-preprod/.current-rollback
mv -Tf /opt/shfang-preprod/.current-rollback /opt/shfang-preprod/current
systemctl restart shfang-preprod.service
```

回滚后重新运行对应域名的 `pnpm verify:public`。服务器只保留最近五个发布目录；目标
提交不在服务器时，应通过相应分支重新触发可审计的 GitHub Actions 部署，不要临时
复制来源不明的构建产物。

## 8. 从新服务器重建

当前仓库没有托管完整基础设施配置，因此重建前必须从仍可访问的服务器只读导出并
审查以下非秘密配置：

```bash
systemctl cat shfang-map.service
systemctl cat shfang-preprod.service
nginx -T
cd /opt/umami
docker compose config --services
docker compose config --images
docker compose config --volumes
getent passwd deploy
sudo -l -U deploy
```

`systemctl cat`、`nginx -T` 或原始 Compose 文件可能包含敏感值；只允许在受控终端
查看，不能把未经脱敏的完整输出粘贴到 agent 对话或 Actions 日志。提交模板前必须
逐项去除凭据。重建顺序为：

1. 建立最小权限 `deploy` 用户和目录所有权；
2. 只开放 SSH、HTTP、HTTPS 所需端口，3000/3001/3002 和 PostgreSQL 不对公网开放；
3. 安装并验证 Nginx、Certbot、Node 运行时、Docker 与 Compose；
4. 恢复并启动 Umami PostgreSQL，再启动 Umami；
5. 安装两个 systemd unit 和三个 Nginx 虚拟主机；
6. 从 GitHub Actions 分别部署 `pre-prod` 和 `main`；
7. 验证 TLS、公开面、`X-Robots-Tag`、Umami `/api/send` 和告警；
8. 确认 `.private-data` 与 `outputs/` 从未进入 CI、服务器发布包或生产构建。

缺少 systemd unit、Nginx 完整配置、Compose 镜像版本和防火墙规则的脱敏模板，是当前
灾备能力的已知缺口；获得现场配置后应补入受版本控制的 `ops/templates/`，敏感值继续
由 Secrets 或服务器权限文件管理。

## 9. 密钥轮换与紧急恢复

- `TENCENT_SSH_PRIVATE_KEY`：生成新部署密钥，先在服务器为 `deploy` 增加新公钥并
  验证 Actions，再撤销旧公钥；不得覆盖后才测试。
- `TENCENT_SSH_KNOWN_HOSTS`：只有通过腾讯云控制台或另一条可信通道核验服务器主机
  指纹后才能更新，不能因 SSH 报错直接接受新指纹。
- 高德 Key/安全码：先创建并限制新 Key，更新生产和预生产环境，验证地图，再撤销旧
  Key。它们会出现在浏览器构建中，不是服务器密码。
- Umami 管理员密码：由用户本人设置；agent 不读取浏览器密码库、不猜测、不记录。
- Umami `APP_SECRET`：轮换会影响现有登录会话；先备份数据库，在维护窗口执行并验证
  重新登录。

任何轮换都要记录日期、影响范围和“旧凭据已撤销”这一非敏感结论，不记录凭据值。

## 10. 域名、TLS、CDN 与备案决策

当前架构继续由首尔源站直接服务，不启用要求中国大陆备案的境内 CDN。原因是备案尚未
完成；备案完成后再依据新的大陆多节点测试、成本和服务条款评估 CDN/EdgeOne。该决策
不意味着永不使用 CDN。

DNS 变更前应记录原记录和 TTL，先降低 TTL 并等待旧 TTL 生效，再小流量验证；失败时
恢复原记录。不得删除仍用于证书签发、`www` 跳转、预生产或 Umami 的记录。每次变更后
验证四个域名的解析、TLS 和 HTTP 状态。

证书检查：

```bash
systemctl status certbot.timer --no-pager
journalctl -u certbot.service --since '90 days ago' --no-pager
certbot certificates
```

`certbot renew --dry-run` 可能访问 CA 并修改 Certbot 的运行状态，只在明确的维护检查中
执行；失败时先检查 DNS、80/443 端口和 Nginx 配置，不要删除现有证书目录。

## 11. 日志、升级与事故记录

- 应用：`journalctl -u shfang-map.service`、
  `journalctl -u shfang-preprod.service`；
- 代理：Nginx access/error log，以现场虚拟主机配置为准；
- 统计：`cd /opt/umami && docker compose logs --tail 200`；
- 发布：对应 GitHub Actions run 和部署 commit SHA。

每月检查安全更新、磁盘增长和日志保留；每次升级 Umami、PostgreSQL、Docker、Nginx、
Node 或 pnpm 前先阅读版本说明、完成备份并在预生产或隔离环境验证。事故记录至少包含
开始/恢复时间、用户影响、根因、处置、回滚 SHA 和后续措施，不包含凭据或用户隐私。
