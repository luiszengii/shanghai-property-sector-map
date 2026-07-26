"use client";

import { ArrowRight, Building2, CalendarClock, ExternalLink, MapPin, Route, Ruler, X } from "lucide-react";
import { useMemo } from "react";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import {
  LocalProjectResearchMetadata,
  LocalProjectResearchSummary,
  projectDetailDisclaimer,
} from "@/src/components/local-research-features";
import categoriesData from "@/src/data/categories.json";
import placesData from "@/src/data/places.json";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { coordinateToDisplayPosition } from "@/src/lib/geo-coordinate-conversion";
import { formatSectorRiskFlags } from "@/src/lib/sector-risk-flags";
import { useProjectCatalog } from "@/src/lib/use-project-catalog";
import { useMapStore } from "@/src/store/map-store";
import type { Category, Place, SectorBoundarySide, SectorBoundaryStatus } from "@/src/types/map";

const places = placesData as Place[];
const categories = categoriesData as Category[];
const placeById = new Map(places.map((place) => [place.id, place]));
const categoryById = new Map(categories.map((category) => [category.id, category]));
const boundarySideLabels: Record<SectorBoundarySide, string> = { north: "北", east: "东", south: "南", west: "西" };
const evidenceStatusLabels: Record<SectorBoundaryStatus, string> = {
  definition_confirmed: "已确认",
  candidate_scope_confirmed: "候选口径已确认",
  candidate_backbone_confirmed: "候选骨架已确认",
  project_integrity_checked_candidate: "项目完整性已核验",
  adjacent_review_required: "相邻板块待联审",
  partial: "部分明确",
  geometry_missing: "缺几何",
  scope_ambiguous: "口径待定",
};

function distanceKm(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function DetailCard() {
  const projects = useProjectCatalog();
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const selectedSectorId = useMapStore((state) => state.selectedSectorId);
  const selectedPlaceId = useMapStore((state) => state.selectedPlaceId);
  const selectedProjectId = useMapStore((state) => state.selectedProjectId);
  const zoom = useMapStore((state) => state.zoom);
  const projectDetailMinZoom = useMapStore((state) => state.projectDetailMinZoom);
  const center = useMapStore((state) => state.center);
  const closeDetail = useMapStore((state) => state.closeDetail);
  const requestFocus = useMapStore((state) => state.requestFocus);
  const selectSector = useMapStore((state) => state.selectSector);
  const isRuntimeLoading = useMapStore((state) => (
    selectedSectorId
      ? Boolean(state.sectorGeometryLoading[selectedSectorId])
      : false
  ));
  const isRuntimeFallback = useMapStore((state) => (
    selectedSectorId
      ? Boolean(state.sectorGeometryFallbacks[selectedSectorId])
      : false
  ));
  const place = selectedPlaceId ? placeById.get(selectedPlaceId) : undefined;
  const project = selectedProjectId ? projectById.get(selectedProjectId) : undefined;
  const sector = selectedSectorId
    ? sectorCatalog.getFeature(selectedSectorId)
    : undefined;
  const sectorMetadata = useMemo(() => {
    if (!sector) return null;
    const id = sector.properties.id;
    return {
      sectorRecord: sectorCatalog.getRecord(id),
      definitionSources: sectorCatalog.getSources(id),
      geometrySources: sectorCatalog.getGeometrySources(id),
      geometryVerificationSources: sectorCatalog.getGeometryVerificationSources(id),
      boundaryEvidence: sectorCatalog.getBoundaryEvidence(id),
      referenceCheck: sectorCatalog.getReferenceCheck(id),
      subscopes: sectorCatalog.getSubscopesForSector(id),
    };
  }, [sector]);

  if (!place && !project && !sector) return null;

  if (project) {
    if (zoom < projectDetailMinZoom) return null;
    const displayName = project.officialName ?? project.name;
    const research = project.research;
    return (
      <article className="detail-card project-detail-card glass-panel" aria-label={displayName + "详情"}>
        <button className="icon-button detail-close" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
        <span className="eyebrow">{project.district} · {project.sector} · 已核验项目点位</span>
        <h2>{displayName}</h2>
        {project.officialName && project.officialName !== project.name && <p className="project-original-name">清单原名：{project.name}</p>}
        <LocalProjectResearchSummary research={research} />
        <dl className="detail-list project-meta">
          <div><dt><MapPin size={15} /> 项目地址</dt><dd>{project.locationAddress}</dd></div>
          <div><dt><Building2 size={15} /> 点位来源</dt><dd>{project.locationSourceName}<a href={project.locationSourceUrl} target="_blank" rel="noreferrer" aria-label="在高德地图查看项目"><ExternalLink size={13} /></a></dd></div>
          <div><dt><CalendarClock size={15} /> 点位核对</dt><dd>{project.locationVerifiedAt} · {project.locationConfidence === "high" ? "高置信" : "中等置信"}</dd></div>
          {project.locationNote && <div><dt><MapPin size={15} /> 点位说明</dt><dd>{project.locationNote}</dd></div>}
          <LocalProjectResearchMetadata research={research} />
        </dl>
        <p className="project-disclaimer">{projectDetailDisclaimer}</p>
      </article>
    );
  }

  if (place) {
    const category = categoryById.get(place.category);
    const activeGeometry = sector
      ? sectorCatalog.resolveActiveLocation(
        sector.properties.id,
        isRuntimeFallback,
      )
      : undefined;
    const origin = activeGeometry
      ? coordinateToDisplayPosition(activeGeometry.center, activeGeometry.coordinateSystem)
      : center;
    const distance = distanceKm(origin, [place.longitude, place.latitude]);
    return (
      <article className="detail-card glass-panel" aria-label={`${place.name}详情`}>
        <button className="icon-button detail-close" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
        <div className="detail-topline">
          <span className="category-icon large" style={{ "--category-color": category?.color ?? "#0f766e" } as React.CSSProperties}>{category ? <CategoryIcon name={category.icon} size={22} /> : "•"}</span>
          <div><span className="eyebrow">{category?.name}</span><h2>{place.name}</h2></div>
        </div>
        <span className="mock-badge">演示数据</span>
        <p className="detail-description">{place.description}</p>
        <dl className="detail-list">
          <div><dt><MapPin size={15} /> 地址</dt><dd>{place.address}</dd></div>
          <div><dt><Building2 size={15} /> 信息来源</dt><dd>{place.sourceName}{place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>}</dd></div>
          <div><dt><CalendarClock size={15} /> 更新时间</dt><dd>{place.sourceDate}</dd></div>
          <div><dt><Ruler size={15} /> 大致距离</dt><dd>距{sector ? "当前板块中心" : "地图中心"}约 {distance.toFixed(distance < 10 ? 1 : 0)} 公里</dd></div>
        </dl>
      </article>
    );
  }

  if (!sector) return null;
  const {
    sectorRecord,
    definitionSources,
    geometrySources,
    geometryVerificationSources,
    boundaryEvidence,
    referenceCheck,
    subscopes,
  } = sectorMetadata!;
  const geometryStatus = sectorRecord?.geometry.status;
  const isEditorialSeed = sectorCatalog.hasEditorialSeed(sector.properties.id)
    && !isRuntimeLoading
    && !isRuntimeFallback;
  const isSourceBackedProxy = sectorCatalog.hasSourceBackedProxy(sector.properties.id)
    && !isRuntimeLoading
    && !isRuntimeFallback;
  const usesAdministrativeReference = geometryStatus === "admin-reference";
  const isAdministrativeReference = usesAdministrativeReference
    && !isRuntimeLoading
    && !isRuntimeFallback;
  const isReviewedCandidate = (
    isEditorialSeed
    || isSourceBackedProxy
    || (
      geometryStatus !== undefined
      && ["draft", "reviewed", "published"].includes(geometryStatus)
    )
  ) && !isRuntimeLoading && !isRuntimeFallback;
  const geometrySourceRows: Array<{
    label: string;
    sources: typeof geometrySources;
  }> = [];
  if (geometryStatus === "demo" || isRuntimeFallback) {
    geometrySourceRows.push({ label: "楼市演示面来源", sources: sectorCatalog.marketDemoSources });
  }
  if (isSourceBackedProxy || (geometryStatus !== undefined && geometryStatus !== "demo")) {
    geometrySourceRows.push({
      label: usesAdministrativeReference ? "行政参考层来源" : "候选面来源",
      sources: geometrySources,
    });
  }
  const geometryLabel = isRuntimeLoading
      ? usesAdministrativeReference
      ? "行政参考层加载中"
      : "候选边界加载中 · 暂显演示面"
    : isRuntimeFallback
      ? usesAdministrativeReference
        ? "行政参考层转换失败 · 楼市演示面可见"
        : "演示几何 · 候选面转换失败"
      : isSourceBackedProxy
        ? "公开范围参考代理"
      : isEditorialSeed
        ? "低置信可编辑覆盖初稿"
      : isReviewedCandidate
        ? "楼市研究候选面"
      : isAdministrativeReference
          ? "行政参考层（非楼市主板块）"
          : "旧演示几何（主地图隐藏）";
  const reviewLabel = isRuntimeLoading
    ? usesAdministrativeReference
      ? "WGS84 行政参考层正在转换为地图显示坐标"
      : "WGS84 候选面正在转换为地图显示坐标"
    : isAdministrativeReference
    ? referenceCheck?.verdict === "standard_map_superseded_in_segments"
      ? "行政参考面已复核 · 浦东调整段以后续公告为准"
      : "行政参考面已与标准图、官方面积和邻接关系复核"
    : isSourceBackedProxy
      ? "公开文字四至已重建 · 仍须按相邻市场板块精修"
    : isEditorialSeed
      ? "覆盖初稿 · 待按道路、水系和邻接关系逐边精修"
    : sectorRecord?.definitionStatus === "market_scope_candidate"
      ? "身份已裁定 · 待第二来源、东界身份、南界中位线与沿线项目核验"
    : sectorRecord?.reviewStatus === "reviewed-high"
      ? "边界规则已核验 · 候选面待人工复核"
      : sectorRecord?.reviewStatus === "draft-medium"
        ? "口径待选择"
        : "定义草案 · 暂不发布";
  const baseDescription = sector.properties.description.replace(/演示范围。?$/, "");
  const description = isSourceBackedProxy
    ? `${baseDescription}；当前显示按公开规划文字四至与开放道路节点重建的参考代理，不把功能区范围直接等同于楼市板块。`
    : isEditorialSeed
    ? `${baseDescription}；当前显示按公开地名与相邻板块位置起画的低置信可编辑初稿，用于先补覆盖，不代表边界已经核验。`
    : isReviewedCandidate
    ? `${baseDescription}；当前显示按可追溯文字四至与开放地物独立重建的研究候选面。`
    : isAdministrativeReference
      ? `${baseDescription}；当前只显示蓝色虚线${referenceCheck?.comparableAdminName ?? sector.properties.name}行政参考层，不把旧演示面当作楼市主板块。`
      : sector.properties.description;
  const riskReview = formatSectorRiskFlags(sectorRecord?.riskFlags);
  return (
    <article className="detail-card glass-panel" aria-label={`${sector.properties.name}板块详情`}>
      <button className="icon-button detail-close" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
      <span className="eyebrow">楼市板块 · {(sectorRecord?.districtNames ?? [sector.properties.district]).join(" / ")}</span>
      <h2>{sector.properties.name}</h2>
      <span className="mock-badge">{geometryLabel}</span>
      <p className="detail-description">{description}</p>
      <dl className="detail-list">
        <div><dt><Building2 size={15} /> 涉及行政区</dt><dd>{sectorRecord?.districtNames.join(" / ") ?? sector.properties.district}</dd></div>
        {sectorRecord && sectorRecord.aliases.length > 0 && <div><dt><Building2 size={15} /> 常用别名</dt><dd>{sectorRecord.aliases.join("、")}</dd></div>}
        <div><dt><CalendarClock size={15} /> 核验状态</dt><dd>{reviewLabel}</dd></div>
        {sectorRecord?.definitionCandidate && <div><dt><Route size={15} /> 候选定义</dt><dd>{sectorRecord.definitionCandidate}</dd></div>}
        {riskReview && <div><dt><Route size={15} /> 重点复核</dt><dd>{riskReview}</dd></div>}
        {boundaryEvidence.length > 0 && (
          <div>
            <dt><Route size={15} /> 逐边证据</dt>
            <dd>{boundaryEvidence.map((edge, index) => <span key={edge.id}>{index > 0 && "；"}{boundarySideLabels[edge.side]}：{edge.featureName}（{evidenceStatusLabels[edge.status]}）</span>)}</dd>
          </div>
        )}
        {subscopes.length > 0 && (
          <div>
            <dt><Route size={15} /> 内部子范围</dt>
            <dd>{subscopes.map((subscope) => subscope.properties.name).join("、")}（橙色虚线，不参与主板块互斥分区）</dd>
          </div>
        )}
        <div>
          <dt><MapPin size={15} /> 当前几何</dt>
          <dd>{isRuntimeLoading
            ? usesAdministrativeReference
              ? "行政参考层正在转换为高德显示坐标；旧楼市演示面保持隐藏。"
              : "候选面正在转换为高德显示坐标，地图暂时显示灰色虚线演示面；转换完成后会自动替换。"
            : isRuntimeFallback
              ? usesAdministrativeReference
                ? "本次行政参考层坐标转换失败，灰色楼市演示面仍保留；WGS84 参考数据可稍后刷新重试。"
                : "本次候选面坐标转换失败，地图已安全回退到虚线演示面；WGS84 研究数据仍保留，可稍后刷新重试。"
              : geometryStatus === "demo"
                ? "旧演示面只在边界编辑器中作为重画起点，主地图保持留白。"
                : sectorRecord?.geometry.note ?? sector.properties.sourceName}</dd>
        </div>
        {(isReviewedCandidate || isAdministrativeReference) && (
          <div>
            <dt><MapPin size={15} /> 显示坐标</dt>
            <dd>地图显示采用本地 WGS84→GCJ-02 近似转换；WGS84 研究主几何保持不变。</dd>
          </div>
        )}
        {referenceCheck && (
          <div>
            <dt><Route size={15} /> 天地图对照</dt>
            <dd>{referenceCheck.summary}</dd>
          </div>
        )}
        {referenceCheck && referenceCheck.standardMapDocuments.length > 0 && (
          <div>
            <dt><MapPin size={15} /> 标准地图</dt>
            <dd>
              {referenceCheck.standardMapDocuments.map((document, index) => (
                <span key={document.url}>
                  {index > 0 && "、"}
                  <a href={document.url} target="_blank" rel="noreferrer">
                    {document.title}（{document.mapDate} · {document.reviewNumber}）<ExternalLink size={13} />
                  </a>
                </span>
              ))}
              <span>；仅作形状和邻接关系视觉复核，不作为坐标或法定界址来源。</span>
            </dd>
          </div>
        )}
        {geometrySourceRows.map((row) => row.sources.length > 0 && (
          <div key={row.label}>
            <dt><MapPin size={15} /> {row.label}</dt>
            <dd>{row.sources.map((source, index) => <span key={source.id}>{index > 0 && "、"}{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher}<ExternalLink size={13} /></a> : source.publisher}</span>)}</dd>
          </div>
        ))}
        {geometryVerificationSources.length > 0 && (
          <div>
            <dt><CalendarClock size={15} /> 复核来源</dt>
            <dd>{geometryVerificationSources.map((source, index) => <span key={source.id}>{index > 0 && "、"}{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher}<ExternalLink size={13} /></a> : source.publisher}</span>)}</dd>
          </div>
        )}
        {definitionSources.length > 0 && (
          <div>
            <dt><Building2 size={15} /> 定义来源</dt>
            <dd>{definitionSources.map((source, index) => <span key={source.id}>{index > 0 && "、"}{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher}<ExternalLink size={13} /></a> : source.publisher}</span>)}</dd>
          </div>
        )}
      </dl>
      <button className="primary-action" onClick={() => { selectSector(sector.properties.id); requestFocus("sector", sector.properties.id); }}>
        查看板块设施 <ArrowRight size={16} />
      </button>
    </article>
  );
}
