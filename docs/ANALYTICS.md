# 网站访问统计

生产站使用自建 Umami，管理后台为 `https://analytics.shfang.xyz`。Umami
只在两个公开构建变量都存在时加载，因而本地开发和未配置的预生产构建
不会意外向统计服务发送事件：

- `NEXT_PUBLIC_UMAMI_SCRIPT_URL`：Umami tracker 地址；生产为
  `https://analytics.shfang.xyz/script.js`。
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`：Umami 中生产站点对应的公开网站 ID。

网站 ID 不属于保密凭据，但以 GitHub Actions Secret 保存，避免直接写入
源码。Umami 管理员密码、数据库密码和 `APP_SECRET` 只保存在服务器的
`/opt/umami/.env`，不得提交或复制到 Actions 日志。

## 运维边界

- Umami、PostgreSQL 与地图应用使用不同端口和数据目录。
- 数据库仅在 Docker 内网监听；Nginx 只将 `analytics.shfang.xyz` 代理到
  `127.0.0.1:3002`。
- 预生产默认不采集到生产统计；如需统计预生产，应在 Umami 建立独立
  Website，并单独设置预生产的 Website ID。
- 统计只记录匿名访问指标；不要向 Umami 事件传递姓名、手机号、邮箱、
  账号或其他个人信息。

## 更新与备份

在服务器上，更新前先导出 PostgreSQL 数据库；更新镜像后通过
`docker compose pull` 和 `docker compose up -d` 重建。数据卷不得删除。
