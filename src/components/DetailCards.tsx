"use client";

import { ArrowRight, Building2, CalendarClock, ExternalLink, GraduationCap, MapPin, Route, Ruler, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";
import categoriesData from "@/src/data/categories.json";
import placesData from "@/src/data/places.json";
import { projects } from "@/src/content/project-leads";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useMapStore } from "@/src/store/map-store";
import type { Category, Place, SectorBoundarySide, SectorBoundaryStatus } from "@/src/types/map";

const places = placesData as Place[];
const sectors = sectorCatalog.features;
const categories = categoriesData as Category[];
const boundarySideLabels: Record<SectorBoundarySide, string> = { north: "北", east: "东", south: "南", west: "西" };
const evidenceStatusLabels: Record<SectorBoundaryStatus, string> = {
  definition_confirmed: "已确认",
  candidate_scope_confirmed: "候选口径已确认",
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
  const { selectedSectorId, selectedPlaceId, selectedProjectId, center, closeDetail, requestFocus, selectSector, sectorGeometryFallbacks } = useMapStore();
  const place = places.find((item) => item.id === selectedPlaceId);
  const project = projects.find((item) => item.id === selectedProjectId);
  const sector = sectors.find((item) => item.properties.id === selectedSectorId);

  if (!place && !project && !sector) return null;

  if (project) {
    const displayName = project.officialName ?? project.name;
    return (
      <article className="detail-card project-detail-card glass-panel" aria-label={displayName + "详情"}>
        <button className="icon-button detail-close" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
        <span className="eyebrow">{project.district} · {project.sector} · 500–800 万新盘</span>
        <h2>{displayName}</h2>
        {project.officialName && project.officialName !== project.name && <p className="project-original-name">清单原名：{project.name}</p>}
        <div className="project-summary">
          <strong>{project.averagePrice} 万元/㎡</strong>
          <span>{project.unitType}</span>
          <span className="project-rating"><Star size={13} fill="currentColor" />{project.rating === null ? "暂无推荐指数" : project.rating + "/5"}</span>
        </div>
        <span className="unverified-badge">用户观点 · 待核验</span>
        <div className="project-opinion-grid">
          <section><h3><ThumbsUp size={14} /> 项目优势</h3><ul>{project.advantages.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section className="is-caution"><h3><ThumbsDown size={14} /> 项目劣势</h3><ul>{project.disadvantages.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div>
        <dl className="detail-list project-meta">
          <div><dt><MapPin size={15} /> 项目地址</dt><dd>{project.locationAddress}</dd></div>
          <div><dt><Building2 size={15} /> 点位来源</dt><dd>{project.locationSourceName}<a href={project.locationSourceUrl} target="_blank" rel="noreferrer" aria-label="在高德地图查看项目"><ExternalLink size={13} /></a></dd></div>
          <div><dt><CalendarClock size={15} /> 点位核对</dt><dd>{project.locationVerifiedAt} · {project.locationConfidence === "high" ? "高置信" : "中等置信"}</dd></div>
          {project.locationNote && <div><dt><MapPin size={15} /> 点位说明</dt><dd>{project.locationNote}</dd></div>}
          <div><dt><GraduationCap size={15} /> 周边教育</dt><dd>{project.education.join("、")}</dd></div>
          <div><dt><Building2 size={15} /> 观点来源</dt><dd>{project.sourceName}</dd></div>
          <div><dt><CalendarClock size={15} /> 收录日期</dt><dd>{project.sourceDate}</dd></div>
        </dl>
        <p className="project-disclaimer">项目点位已于 2026-07-22 逐项核对并固化；价格、交通、学校、规划及周边风险仍未独立核验。</p>
      </article>
    );
  }

  if (place) {
    const category = categories.find((item) => item.id === place.category);
    const origin = sector?.properties.center ?? center;
    const distance = distanceKm(origin, [place.longitude, place.latitude]);
    return (
      <article className="detail-card glass-panel" aria-label={`${place.name}详情`}>
        <button className="icon-button detail-close" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
        <div className="detail-topline">
          <span className="category-icon large" style={{ "--category-color": category?.color ?? "#0f766e" } as React.CSSProperties}>{category?.icon ?? "•"}</span>
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
  const sectorRecord = sectorCatalog.getRecord(sector.properties.id);
  const definitionSources = sectorCatalog.getSources(sector.properties.id);
  const geometrySources = sectorCatalog.getGeometrySources(sector.properties.id);
  const geometryVerificationSources = sectorCatalog.getGeometryVerificationSources(sector.properties.id);
  const boundaryEvidence = sectorCatalog.getBoundaryEvidence(sector.properties.id);
  const referenceCheck = sectorCatalog.getReferenceCheck(sector.properties.id);
  const isRuntimeFallback = Boolean(sectorGeometryFallbacks[sector.properties.id]);
  const geometryStatus = sectorRecord?.geometry.status;
  const isAdministrativeReference = geometryStatus === "admin-reference" && !isRuntimeFallback;
  const isOfficialScopeCandidate = geometryStatus !== undefined
    && ["draft", "reviewed", "published"].includes(geometryStatus)
    && !isRuntimeFallback;
  const geometryLabel = isRuntimeFallback
    ? "演示几何 · 研究面转换失败"
    : isOfficialScopeCandidate
      ? "官方四至候选面"
      : isAdministrativeReference
        ? "行政参考面"
        : "演示几何";
  const reviewLabel = isAdministrativeReference
    ? referenceCheck?.verdict === "standard_map_superseded_in_segments"
      ? "行政参考面已复核 · 浦东调整段以后续公告为准"
      : "行政参考面已与标准图、官方面积和邻接关系复核"
    : sectorRecord?.reviewStatus === "reviewed-high"
      ? "边界规则已核验 · 候选面待人工复核"
      : sectorRecord?.reviewStatus === "draft-medium"
        ? "口径待选择"
        : "定义草案 · 暂不发布";
  const baseDescription = sector.properties.description.replace(/演示范围。?$/, "");
  const description = isOfficialScopeCandidate
    ? `${baseDescription}；当前显示按官方文字四至重建的研究候选面。`
    : isAdministrativeReference
      ? `${baseDescription}；当前显示${referenceCheck?.comparableAdminName ?? sector.properties.name}行政参考面。`
      : sector.properties.description;
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
        {boundaryEvidence.length > 0 && (
          <div>
            <dt><Route size={15} /> 逐边证据</dt>
            <dd>{boundaryEvidence.map((edge, index) => <span key={edge.id}>{index > 0 && "；"}{boundarySideLabels[edge.side]}：{edge.featureName}（{evidenceStatusLabels[edge.status]}）</span>)}</dd>
          </div>
        )}
        <div><dt><MapPin size={15} /> 当前几何</dt><dd>{isRuntimeFallback ? "本次高德坐标转换失败，地图已安全回退到虚线演示面；WGS84 候选数据仍保留，可稍后刷新重试。" : sectorRecord?.geometry.note ?? sector.properties.sourceName}</dd></div>
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
        {geometrySources.length > 0 && (
          <div>
            <dt><MapPin size={15} /> 几何来源</dt>
            <dd>{geometrySources.map((source, index) => <span key={source.id}>{index > 0 && "、"}{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher}<ExternalLink size={13} /></a> : source.publisher}</span>)}</dd>
          </div>
        )}
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
