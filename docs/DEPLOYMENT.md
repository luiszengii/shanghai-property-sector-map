# 腾讯云首尔生产部署

生产站点运行在腾讯云轻量应用服务器 `43.155.217.8`，域名为
`https://shfang.xyz`。阿里云 DNS 中的 `@` 与 `www` A 记录均指向该
IP；Nginx 终止 TLS，并反向代理到本机 `127.0.0.1:3000` 的 Next.js
standalone 服务。

## 自动发布

`.github/workflows/deploy-tencent.yml` 在每次推送到 `main` 时：

1. 使用锁文件安装依赖；
2. 运行 lint、TypeScript 与地图性能测试；
3. 使用生产高德 Key 构建 Next.js standalone 产物；
4. 排除仅允许本地读取的 `outputs/` 数据；
5. 通过专用 SSH 账号上传到 `/opt/shfang/releases/<commit-sha>`；
6. 原子切换 `/opt/shfang/current` 并重启 `shfang-map.service`；
7. 先检查本机服务，再检查 `https://shfang.xyz/`。

同一时间只允许一个生产发布运行。服务器保留最近五个版本；新版本
健康检查失败时，`scripts/activate-release.sh` 会切回前一个版本。

## GitHub Actions Secrets

仓库需要以下 Secrets，值不得提交：

- `NEXT_PUBLIC_AMAP_KEY`
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE`
- `TENCENT_SSH_PRIVATE_KEY`
- `TENCENT_SSH_KNOWN_HOSTS`

SSH 私钥只用于 GitHub Actions。服务器端 `deploy` 用户只允许公钥登录，
并且只能免密重启和检查 `shfang-map.service`。

## 服务器路径与服务

- 发布包：`/opt/shfang/releases/`
- 上传暂存：`/opt/shfang/incoming/`
- 当前版本：`/opt/shfang/current`
- systemd：`shfang-map.service`
- Nginx：`/etc/nginx/sites-available/shfang.xyz`
- TLS 续期：`certbot.timer`

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
