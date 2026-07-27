# Agent instructions

## 线上访问数据与 Umami

任何 agent 在回答“网站流量、访客、浏览量、来源、实时在线、性能数据在哪看”
或排查统计为空前，必须先完整阅读 `docs/ANALYTICS.md`。

- 生产统计后台是 `https://analytics.shfang.xyz`，Website 为 `shfang.xyz`，
  Website ID 为 `d200b8a0-893a-443a-81f4-634fe5897d60`。
- Umami 用户名是 `admin`；管理员密码不进入 Git。优先复用用户已登录的
  Chrome 会话，未登录时请用户本人输入当前密码，不得猜测、读取浏览器密码库
  或把密码写进仓库、日志和对话总结。
- 查看数据的固定入口是 `Websites → shfang.xyz → 概览`；实时采集检查使用
  “实时”。生产统计默认不包含 `pre-prod.shfang.xyz`。
- 若数据为空，先验证生产 HTML 是否包含
  `https://analytics.shfang.xyz/script.js` 和正确 Website ID，再在真实页面
  的网络请求中确认 `/api/send` 返回 200，最后刷新 Umami 最近 24 小时数据。
- 不得给整个 Umami 站点重新添加 Nginx HTTP Basic Auth；它会和 Umami 自身
  的 `Authorization` 登录令牌冲突，造成登录成功后仍被拦截。

## 楼盘资料与公开数据

任何 agent 在读取、录入、修改、批量研究或发布楼盘资料前，必须先完整阅读 `docs/PROPERTY-DATA-GUIDE.md`。

- 用户界面称“楼盘资料中心”；代码中的 `source-ledger` 指私有来源、证据、修订与发布裁定模型。
- `outputs/source-ledger/ledger.json` 是被 Git 忽略的本地研究底稿，不是公开产品数据库。不得提交该文件、私有备注、受限来源摘录或未裁定候选。
- 地图 APP 使用的核心公开楼盘资料应由已裁定记录生成到受版本控制的 `src/data/`，而不是让生产代码读取 `outputs/`。
- Agent 可以登记研究候选，但不得自行把候选改为 `可公开投射`，不得绕过人工裁定，也不得手工复制私有台账来伪造公开投射。
- 来源许可、证据置信度、复核期限和发布状态必须分别判断；“已核验”不自动代表“允许公开”。
- 当前批次审核和快照恢复尚未实现。公开投射只能通过 `npm run build:public-project-data -- --snapshot <id> --confirm-reviewed` 生成；不得用直接改 JSON 的方式替代。

## 板块边界任务

任何 agent 在新增、调整、拆分、合并、删除板块，或研究板块数据源前，必须先完整阅读 `docs/SECTOR-BOUNDARY-PLAYBOOK.md`。

- `src/data/sectors/registry.json` 是活动板块身份的唯一登记表；身份与几何必须分开处理。
- 商业地图、看房平台和截图只能帮助确认名称、市场语义、相邻关系和大致形态；没有明确授权时，不得复制、批量抓取、保存或描摹其边界坐标。
- 可发布候选面的坐标必须来自固定且许可明确的几何来源，当前首选 `data/geo/sources/osm-shanghai-260721.json` 锁定的 OSM/Geofabrik 快照，并保留来源、版本、哈希和生成命令。
- 不得手改 `src/data/sectors/reviewed-candidates*.json` 等生成产物来“修边”；应修改批次定义或 workpack 生成器后重新生成。
- 删除、合并或重命名板块时，必须同步处理编辑器草稿迁移、客户端索引和板块观察映射；历史手工草稿应归档，不得静默丢弃。

## 小红书房产观点数据

本仓库包含一套本地小红书房产研究数据。任何 agent 在读取、扩充或把这批数据用于产品前，必须先阅读 `docs/XHS-DATA-GUIDE.md`。

- 原始采集数据位于 `outputs/xhs_raw/`，清洗结果位于 `outputs/xhs_analysis/`；两者都被 `.gitignore` 排除，只在当前工作区本地保存。
- 这些数据是用户和自媒体的观点样本，不是已核验事实，不构成估值或购房建议。
- 不得把帖子中的价格、学区、规划、交通、医疗、交付或项目宣传直接写入 `src/data/`。先用政府、学校、轨交运营方、开发商正式文件等来源核验，并记录来源和核验日期。
- 不得提交作者昵称、用户标识、评论 ID、登录 Cookie、`xsec_token` 或完整原始帖子/评论语料。对外产物优先使用聚合结论和来源链接。
- 复爬时使用低并发、小样本；不得绕过验证码、风控、登录限制或平台访问控制。扫码、短信验证和 CAPTCHA 必须由用户本人完成。
- 当前清洗入口是 `python3 scripts/xhs_property_report.py`。新增板块后同步更新脚本中的板块映射、分析结论与代表性来源，并更新数据指南中的快照记录。
