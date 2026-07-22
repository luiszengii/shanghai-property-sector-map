"use client";

import { ArrowRight, Building2, CalendarClock, ExternalLink, GraduationCap, MapPin, Route, Ruler, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";
import categoriesData from "@/src/data/categories.json";
import placesData from "@/src/data/places.json";
import { projects } from "@/src/content/project-leads";
import sectorsData from "@/src/data/sectors.json";
import { useMapStore } from "@/src/store/map-store";
import type { Category, Place, SectorCollection } from "@/src/types/map";

const places = placesData as Place[];
const sectors = (sectorsData as SectorCollection).features;
const categories = categoriesData as Category[];

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
  const { selectedSectorId, selectedPlaceId, selectedProjectId, center, closeDetail, requestFocus, selectSector } = useMapStore();
  const place = places.find((item) => item.id === selectedPlaceId);
  const project = projects.find((item) => item.id === selectedProjectId);
  const sector = sectors.find((item) => item.properties.id === selectedSectorId);

  if (!place && !project && !sector) return null;

  if (project) {
    return (
      <article className="detail-card project-detail-card glass-panel" aria-label={project.name + "详情"}>
        <button className="icon-button detail-close" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
        <span className="eyebrow">{project.district} · {project.sector} · 500–800 万新盘</span>
        <h2>{project.name}</h2>
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
          <div><dt><GraduationCap size={15} /> 周边教育</dt><dd>{project.education.join("、")}</dd></div>
          <div><dt><Building2 size={15} /> 信息来源</dt><dd>{project.sourceName}</dd></div>
          <div><dt><CalendarClock size={15} /> 收录日期</dt><dd>{project.sourceDate}</dd></div>
        </dl>
        <p className="project-disclaimer">价格、交通、学校、规划及周边风险均未独立核验；点位由高德项目名称搜索，匹配失败时显示板块内近似位置。</p>
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
  return (
    <article className="detail-card glass-panel" aria-label={`${sector.properties.name}板块详情`}>
      <button className="icon-button detail-close" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
      <span className="eyebrow">楼市板块 · {sector.properties.district}</span>
      <h2>{sector.properties.name}</h2>
      <span className="mock-badge">演示边界</span>
      <p className="detail-description">{sector.properties.description}</p>
      <dl className="detail-list">
        <div><dt><Building2 size={15} /> 所属行政区</dt><dd>{sector.properties.district}</dd></div>
        {sector.properties.boundaryBasis && <div><dt><Route size={15} /> 边界参考</dt><dd>{sector.properties.boundaryBasis}</dd></div>}
        <div><dt><MapPin size={15} /> 数据来源</dt><dd>{sector.properties.sourceName}</dd></div>
      </dl>
      <button className="primary-action" onClick={() => { selectSector(sector.properties.id); requestFocus("sector", sector.properties.id); }}>
        查看板块设施 <ArrowRight size={16} />
      </button>
    </article>
  );
}
