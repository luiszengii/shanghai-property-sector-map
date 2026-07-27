import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Hospital,
  Info,
  MapPin,
  ShoppingBag,
  TrainFront,
  Trees,
} from "lucide-react";
import Link from "next/link";
import type { PropertyProject } from "@/src/types/map";
import { ProjectDetailMap } from "@/src/components/ProjectDetailMap";
import type { PublicProjectProjection } from "@/src/lib/source-ledger";
import styles from "@/app/projects/[id]/page.module.css";

type PublicProjectData = PublicProjectProjection["projects"][string];

const cautionTasks = [
  {
    title: "交通与噪音",
    task: "实地核对早晚高峰车流、轨交与道路噪音；补充不同时段记录。",
  },
  {
    title: "施工不确定性",
    task: "核查周边在建项目、规划批复和施工周期，记录影响范围。",
  },
  {
    title: "日常生活便利性",
    task: "实测到轨交、商业、学校与医院的步行路线和过街条件。",
  },
];

const facilityTasks = [
  { label: "轨道交通", icon: TrainFront },
  { label: "教育资源", icon: GraduationCap },
  { label: "商业设施", icon: ShoppingBag },
  { label: "医疗资源", icon: Hospital },
  { label: "公园绿地", icon: Trees },
];

export function ProjectDetailPage({
  project,
  publicProject,
}: {
  project: PropertyProject;
  publicProject: PublicProjectData | null;
}) {
  const displayName = project.officialName ?? project.name;
  const confidenceLabel = project.locationConfidence === "high" ? "高" : "中";
  const publicFields = publicProject?.fields ?? [];
  const fieldValue = (name: string) => (
    publicFields.find((item) => item.field === name)?.value
  );
  const publicPrice = fieldValue("公开报价");
  const transitFields = {
    station: fieldValue("附近地铁站"),
    line: fieldValue("所属线路"),
    distance: fieldValue("直线距离"),
    route: fieldValue("步行路线状态"),
  };
  const hasTransitData = Object.values(transitFields).some(Boolean);
  const overviewFieldNames = new Set([
    "项目名称",
    "行政区 / 板块",
    "项目地址",
    "点位置信度",
    "开发企业",
    "项目阶段",
    "公开报价",
    "附近地铁站",
    "所属线路",
    "直线距离",
    "步行路线状态",
  ]);
  const extraOverviewFields = publicFields.filter(
    (item) => !overviewFieldNames.has(item.field),
  );
  const additionalSources = Array.from(new Map(
    publicFields.map((item) => [item.source.url, item.source]),
  ).values()).filter((source) => source.url !== project.locationSourceUrl);

  return (
    <main className={`${styles.page} project-detail-page`}>
      <header className={styles.utilityBar}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft aria-hidden="true" size={15} />
          返回地图
        </Link>
        <div className={styles.utilityMeta}>
          <span>上海楼市互动地图 · 数据公开版</span>
          <span>点位核对：{project.locationVerifiedAt}</span>
          <a href="#sources">查看来源说明</a>
        </div>
      </header>

      <div className={styles.heroGrid}>
        <section className={styles.heroPanel}>
          <div className={styles.identity}>
            <div>
              <div className={styles.titleLine}>
                <h1>{displayName}</h1>
                <span className={styles.status}>点位已核对</span>
              </div>
              {project.officialName && project.officialName !== project.name && (
                <p className={styles.alias}>清单原名：{project.name}</p>
              )}
              <p><Building2 aria-hidden="true" size={16} /> {project.district} · {project.sector}</p>
              <p><MapPin aria-hidden="true" size={16} /> {project.locationAddress}</p>
            </div>
            <div className={styles.pricePanel}>
              <span>价格快照</span>
              <strong>{publicPrice ?? "暂无可公开报价"}</strong>
              <p>{publicPrice
                ? "显示已完成来源、日期与发布裁定的公开报价。"
                : "报价需在楼盘资料中心完成口径、日期和发布裁定后显示。"}</p>
            </div>
          </div>
        </section>
        <ProjectDetailMap
          name={displayName}
          position={project.position}
          sourceUrl={project.locationSourceUrl}
        />
      </div>

      <div className={styles.observationGrid}>
        <section className={`${styles.section} ${styles.transitSection}`}>
          <div className={styles.sectionTitle}>
            <div>
              <span>一、出行与居住观察</span>
              <h2><CheckCircle2 aria-hidden="true" size={18} /> 轨道交通事实</h2>
            </div>
            <small>仅显示已核验字段</small>
          </div>
          <div className={styles.transitBody}>
            {!hasTransitData && (
              <div className={styles.transitPending}>
                <TrainFront aria-hidden="true" size={30} />
                <strong>最近轨道站待 agent 核验</strong>
                <span>需补充线路、直线距离、步行路线与来源日期。</span>
              </div>
            )}
            <dl className={styles.factRows}>
              <div><dt>附近地铁站</dt><dd>{transitFields.station ?? "待核验"}</dd></div>
              <div><dt>所属线路</dt><dd>{transitFields.line ?? "待核验"}</dd></div>
              <div><dt>直线距离</dt><dd>{transitFields.distance ?? "未发布"}</dd></div>
              <div><dt>步行路线状态</dt><dd className={transitFields.route ? "" : styles.pendingText}>{transitFields.route ?? "待核验"}</dd></div>
            </dl>
          </div>
        </section>

        <section className={`${styles.section} ${styles.cautionSection}`}>
          <div className={styles.cautionHeading}>
            <AlertTriangle aria-hidden="true" size={20} />
            <div>
              <h2>不利因素 / 待核验</h2>
              <p>非事实结论，仅用于研究和现场核验</p>
            </div>
          </div>
          <div className={styles.cautionTable}>
            <div className={styles.cautionHeader}>
              <span>议题分类</span><span>当前研判</span><span>验证任务</span>
            </div>
            {cautionTasks.map((item) => (
              <div className={styles.cautionRow} key={item.title}>
                <strong>{item.title}</strong>
                <span><i>待核验</i> 尚无可公开结论</span>
                <p>{item.task}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.section}>
            <div className={styles.plainHeading}>
              <h2>二、关键节点时间线</h2>
              <span>当前仅展示已有公开记录</span>
            </div>
            <ol className={styles.timeline}>
              <li className={styles.timelineKnown}>
                <time>{project.locationVerifiedAt}</time>
                <span />
                <strong>项目点位核对</strong>
                <small>{project.locationConfidence === "high" ? "高置信位置" : "代表点待继续复核"}</small>
              </li>
              {["土地与开发商", "预售许可证", "首次开盘", "竣工备案"].map((label) => (
                <li key={label}>
                  <time>—</time>
                  <span />
                  <strong>{label}</strong>
                  <small>待来源台账补充</small>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.section}>
            <div className={styles.plainHeading}>
              <h2>三、项目概览</h2>
              <span>公开投射字段</span>
            </div>
            <dl className={styles.overviewGrid}>
              <div><dt>项目名称</dt><dd>{displayName}</dd></div>
              <div><dt>行政区 / 板块</dt><dd>{project.district} · {project.sector}</dd></div>
              <div><dt>项目地址</dt><dd>{project.locationAddress}</dd></div>
              <div><dt>点位置信度</dt><dd>{confidenceLabel}置信</dd></div>
              <div><dt>开发企业</dt><dd>{fieldValue("开发企业") ?? "待核验"}</dd></div>
              <div><dt>项目阶段</dt><dd>{fieldValue("项目阶段") ?? "待核验"}</dd></div>
              {extraOverviewFields.map((item) => (
                <div key={item.evidenceId}>
                  <dt>{item.field}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
            {project.locationNote && (
              <p className={styles.locationNote}><Info aria-hidden="true" size={15} /> {project.locationNote}</p>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.plainHeading}>
              <h2>四、户型与楼栋</h2>
              <span>需由预售许可或开发商公示支持</span>
            </div>
            <div className={styles.emptyModule}>
              <Building2 aria-hidden="true" size={24} />
              <div>
                <strong>暂无可公开的户型与楼栋数据</strong>
                <p>后续由 agent 提交研究批次，你裁定后再进入公开页面。</p>
              </div>
            </div>
          </section>
        </div>

        <aside className={`${styles.section} ${styles.facilities}`}>
          <div className={styles.plainHeading}>
            <h2>周边配套</h2>
            <span>不使用现有演示点</span>
          </div>
          <div className={styles.facilityList}>
            {facilityTasks.map(({ label, icon: Icon }) => (
              <div key={label}>
                <Icon aria-hidden="true" size={20} />
                <div><strong>{label}</strong><span>待核验公开点位</span></div>
                <small>—</small>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section id="sources" className={`${styles.section} ${styles.sources}`}>
        <div>
          <MapPin aria-hidden="true" size={18} />
          <h2>主要来源</h2>
          <p>
            {project.locationSourceName}
            <a href={project.locationSourceUrl} target="_blank" rel="noreferrer">
              查看原始链接 <ExternalLink aria-hidden="true" size={12} />
            </a>
            {additionalSources.map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                {source.title} · {source.publisher}
                <ExternalLink aria-hidden="true" size={12} />
              </a>
            ))}
          </p>
        </div>
        <div>
          <CalendarClock aria-hidden="true" size={18} />
          <h2>数据可信度</h2>
          <p>{confidenceLabel}置信 · 核对日期 {project.locationVerifiedAt}</p>
        </div>
        <div>
          <CheckCircle2 aria-hidden="true" size={18} />
          <h2>公开范围</h2>
          <p>公开项目身份、地址、代表点及 {publicFields.length} 个已裁定资料字段，不公开未裁定研究信息。</p>
        </div>
        <div>
          <Info aria-hidden="true" size={18} />
          <h2>信息提示</h2>
          <p>本页不构成购房、投资或交易建议；缺失字段会在完成来源裁定后逐步补充。</p>
        </div>
      </section>
    </main>
  );
}
