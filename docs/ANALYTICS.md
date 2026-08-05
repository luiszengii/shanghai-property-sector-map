# 网站访问统计

生产站使用自建 Umami，管理后台为 `https://analytics.shfang.xyz`。Umami
只在两个公开构建变量都存在时加载，因而本地开发和未配置的预生产构建
不会意外向统计服务发送事件：

- `NEXT_PUBLIC_UMAMI_SCRIPT_URL`：Umami tracker 地址；生产为
  `https://analytics.shfang.xyz/script.js`。
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`：Umami 中生产站点对应的公开网站 ID。

网站 ID 不属于保密凭据，但以 GitHub Actions Secret 保存，避免直接写入
源码。数据库密码和 `APP_SECRET` 位于服务器的 `/opt/umami/.env`；Umami
管理员密码由 Umami 在数据库中以不可直接读取的形式管理。以上凭据都不得提交
或复制到 Actions 日志。

## 登录与查看数据

- 后台地址：[`https://analytics.shfang.xyz`](https://analytics.shfang.xyz)
- 用户名：`admin`
- 管理员密码：不在仓库中保存，也不得写入 Issue、PR、Actions 日志或 agent
  记忆。优先使用用户已登录的 Chrome 会话；未登录时由用户本人输入当前密码。
- Website：`shfang.xyz`
- Website ID：`d200b8a0-893a-443a-81f4-634fe5897d60`

登录后按以下路径查看：

1. 进入 `Websites`；
2. 选择 `shfang.xyz`；
3. 在“概览”选择时间范围，例如“最近 24 小时”；
4. 查看访客、访问次数、浏览量、跳出率、平均访问时长、页面路径、来源、
   浏览器、设备和地域；
5. 需要确认刚发生的访问时，进入“实时”查看在线访客。

Umami 数据可能比页面访问晚数秒出现。修改时间范围或部署 tracker 后，应刷新
后台页面再判断是否无数据。

## 采集链路验证

统计为空时，按从客户端到服务端的顺序检查：

1. 请求生产首页并确认构建产物包含 tracker：

   ```bash
   curl -sS https://shfang.xyz/ |
     rg 'analytics\.shfang\.xyz/script\.js|d200b8a0-893a-443a-81f4-634fe5897d60'
   ```

2. 确认 tracker 可下载：

   ```bash
   curl -I https://analytics.shfang.xyz/script.js
   ```

3. 在真实浏览器打开 `https://shfang.xyz/`，检查网络请求：
   - `https://analytics.shfang.xyz/script.js` 应返回 200；
   - `https://analytics.shfang.xyz/api/send` 的预检应返回 204；
   - `/api/send` 的正式请求应返回 200。
4. 刷新 Umami 的“最近 24 小时”或“实时”页面，确认访客、访问次数或浏览量
   增加。

如果第一步缺少 tracker，先检查包含统计代码的提交是否已按
`pre-prod → main` 晋级，以及生产 Actions 是否使用了
`NEXT_PUBLIC_UMAMI_WEBSITE_ID`。预生产默认不设置该变量，因此
`pre-prod.shfang.xyz` 没有 tracker 是预期行为。

## 运维边界

- Umami、PostgreSQL 与地图应用使用不同端口和数据目录。
- 数据库仅在 Docker 内网监听；Nginx 只将 `analytics.shfang.xyz` 代理到
  `127.0.0.1:3002`。
- 预生产默认不采集到生产统计；如需统计预生产，应在 Umami 建立独立
  Website，并单独设置预生产的 Website ID。
- 统计只记录匿名访问指标；不要向 Umami 事件传递姓名、手机号、邮箱、
  账号或其他个人信息。
- Umami 自身登录是后台的唯一认证层。不要在整个 analytics 虚拟主机上启用
  Nginx HTTP Basic Auth；Basic Auth 与 Umami Bearer token 共用
  `Authorization` 请求头，会导致登录后 `/api/auth/verify` 或其他后台请求
  被 Nginx 错误拦截。

服务器关键位置：

- Compose 与环境变量：`/opt/umami/`
- Umami 上游：`127.0.0.1:3002`
- Nginx：`/etc/nginx/sites-available/analytics.shfang.xyz`
- 数据库：Docker 内网 PostgreSQL 与持久化数据卷

忘记管理员密码时，不要恢复公开默认密码。应通过腾讯云服务器控制台进入
`/opt/umami`，按照当前 Umami 版本支持的管理员恢复流程重置，然后由用户本人
完成新密码设置。任何临时密码都不得提交或写入长期日志。

## 更新与备份

在服务器上，更新前先导出 PostgreSQL 数据库；更新镜像后通过
`docker compose pull` 和 `docker compose up -d` 重建。数据卷不得删除。

数据卷不是备份。数据库导出、加密异机保存、恢复演练、RPO/RTO 和备份失败告警的
操作清单见 [`docs/OPERATIONS-RUNBOOK.md`](OPERATIONS-RUNBOOK.md)。Compose 中的
PostgreSQL 服务名和镜像版本必须先在服务器现场确认，不得从旧聊天记录猜测。
