# 上海楼市互动地图：楼盘资料中心与楼盘详情开发交接

## Goal

实现仅限本地开发使用的来源台账工作台，以及由来源证据支持的公开楼盘详情数据基础。来源台账不得进入生产构建。

用户界面统一使用“楼盘资料中心”；架构文档和代码中的 `source ledger` / `source-ledger` 仍指底层来源、证据、修订与发布裁定模型。

## Read first

- Workspace instructions: `AGENTS.md`
- Property data operations: `docs/PROPERTY-DATA-GUIDE.md`
- Domain language: `CONTEXT.md`
- Decisions: `docs/adr/0040-keep-source-ledger-local-until-authenticated.md` through `docs/adr/0043-keep-private-ledger-and-generate-public-projection.md`
- Sector changes or sector-source research: read `docs/SECTOR-BOUNDARY-PLAYBOOK.md` in full first.
- XHS data: read `docs/XHS-DATA-GUIDE.md` in full before accessing or using it.

## Product decisions already approved

1. 来源台账是仅限本地开发、可编辑的维护工作台，不进入生产产物。未来需要跨设备访问时，必须先设计明确的身份验证。
2. 台账不是链接清单。可复用的来源与把来源绑定到具体对象、字段或结论的证据记录必须分开。
3. 发布状态固定为：`仅本地研究`、`待裁定`、`可公开投射`、`禁止公开`。
4. 证据置信度固定为：`已核验`、`高`、`中`、`低/线索`；置信度与许可、新鲜度、发布状态相互独立。
5. 价格是带日期和适用范围的报价快照，不是永久项目属性。公开报价必须为 `可公开投射`、未过复核期，并展示口径、范围和观察日期。
6. 每条证据保留不可变的记录修订；显式台账快照冻结一组选定修订，形成可恢复、可复现的发布状态。
7. Agent 提交有明确范围的研究批次；用户批量裁定后，候选才能进入当前台账或台账快照。Agent 不得自动发布。
8. 私有台账、修订、研究批次和快照位于被忽略的 `outputs/source-ledger/`；生成并审核后的最小公开投射位于 `src/data/`。现有板块来源文件在渐进迁移期间继续可读。
9. 本地台账默认打开 `待处理` 队列：待复核证据、待裁定记录、以及公开字段缺少充分证据的项目。
10. 公开楼盘体验由地图快速卡片和可分享的独立详情页组成。模块由公开投射数据驱动；没有合格数据的模块直接隐藏，不复刻商业平台页面或内容。

## Existing data and implementation anchors

- `src/data/sectors/sources.json`: 154 source records.
- `src/data/sectors/boundary-evidence.json`: 620 edge evidence records.
- `src/data/sectors/registry.json`: 201 sector identities.
- `data/geo/sources/osm-shanghai-260721.json` locks the OSM/Geofabrik snapshot used for open geometry.
- `src/content/project-leads.ts` and `src/data/project-locations.ts` define 46 project identities and fixed location metadata.
- `outputs/local-project-research.json` is local-only preliminary research, not an auditable field-level evidence model.
- `src/data/places.json` has 20 facility points in 10 categories, all marked `isMock: true`; they are not verified facility data.
- `src/data/public-observations.json` has 20 public aggregate observation entries. XHS raw and detailed local data remain restricted.
- Public/private controls exist in `src/lib/runtime-mode.ts`, `scripts/check-public-surface.mjs`, and local-only components/routes.
- Sector-editor versioning patterns exist in `src/lib/sector-editor-versions.ts`, `app/api/sector-editor-versions/`, and `src/components/SectorBoundaryEditor.tsx`.

## Important source and licensing boundaries

- Prefer official, developer, and openly licensed sources for facts and geometry.
- Commercial property pages may support limited manual verification, naming, semantic research, or source-link records. Do not bulk crawl, save or reproduce proprietary pages, extract platform polygons, or treat platform content as automatically publishable.
- Posts and comments are viewpoint material only, never independent proof of property facts. Do not expose author identifiers, cookies, tokens, or full raw corpora.
- Public output contains only user-approved minimal source details. Private notes, excerpts, comparisons, and research snapshots remain local.

## Suggested implementation sequence

1. Inspect local route patterns, sector-editor persistence APIs, and public-build checks. Design ledger schemas and validators first.
2. Add ignored local ledger storage, immutable record revisions, research-batch states, and explicit ledger snapshots. Test parsing, revision integrity, publication/freshness gates, and projection redaction.
3. Build local-only API routes and `/sources` workbench: default queue, object view, source/evidence editor, batch review, version browser/restore, and public projection preview.
4. Generate a narrow tracked public projection and extend `check:public` to prove private fields cannot enter production artifacts.
5. Incrementally adapt sector source/evidence and project location/research data. Do not mass-migrate or invent sources.
6. Connect project detail routes and map-card links to the public projection. Show only supported modules.
7. Run typecheck, lint, relevant tests, production build, public-surface check, and desktop/mobile browser verification.

## Current workspace state

- `CONTEXT.md` and ADRs 0040–0043 contain the approved terminology and architecture decisions and remain uncommitted.
- A first project-detail route, page, map component, styles, and map-card link exist as uncommitted work. They currently use the fixed public project catalog.
- `/sources` is now an implemented local-development workbench, with a map-header shortcut, 46-project queue/search, reusable source editor, field-level evidence editor, publication/confidence/review fields, immutable revisions, public-projection preview counts, and explicit ledger snapshots.
- `app/api/source-ledger/route.ts` and `src/lib/source-ledger-storage.ts` persist the private ledger atomically under ignored `outputs/source-ledger/ledger.json`. The route accepts only development-mode localhost requests.
- Production uses a disabled component alias; both `/sources` and `/api/source-ledger` were verified to return 404 from a production build.
- The first local seed covers `恒文璞悦江南`’s address evidence. Its current revision records observation date `2026-07-22`, next review `2027-07-22`, publication state `待裁定`, and remains private. A first recoverable ledger snapshot was saved.
- Domain tests cover strict parsing, immutable source revisions, registered-source requirements, publication/freshness gating with private-field redaction, and snapshot revision freezing.
- The explicit reviewed generator now writes `src/data/project-public-projection.json`, `check:public` validates its public shape, and project detail pages consume its fields. Remaining ledger work is batch-review UI and snapshot restore/version browsing. Do not bypass review gates by copying private ledger data into public files.
- Main-map search suggestions and the latest map/filter UI refinements remain uncommitted.
- The old map legend is no longer rendered.
- `有利配套` and `需要关注` can each be collapsed and can independently enable or disable all categories.
- Preserve unrelated work and do not use broad staging commands.
