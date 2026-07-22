"use client";

import { Navigation, Search, X } from "lucide-react";
import { FormEvent, useState } from "react";
import placesData from "@/src/data/places.json";
import { projects } from "@/src/content/project-leads";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useMapStore } from "@/src/store/map-store";
import type { Place } from "@/src/types/map";

const places = placesData as Place[];

export function SearchBar() {
  const [query, setQuery] = useState("");
  const { selectSector, selectPlace, selectProject, requestFocus, searchMessage, setSearchMessage } = useMapStore();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setSearchMessage("请输入板块或点位名称");
      return;
    }
    const sector = sectorCatalog.match(normalized);
    if (sector) {
      selectSector(sector.properties.id);
      requestFocus("sector", sector.properties.id);
      const matchedAlias = sectorCatalog.getMatchedAlias(sector.properties.id, normalized);
      setSearchMessage(matchedAlias ? `已定位：${sector.properties.name}（匹配别名：${matchedAlias}）` : `已定位：${sector.properties.name}`);
      return;
    }
    const project = projects.find((item) =>
      item.name.toLowerCase().includes(normalized)
      || item.officialName?.toLowerCase().includes(normalized),
    );
    if (project) {
      const displayName = project.officialName ?? project.name;
      selectProject(project.id);
      requestFocus("project", project.id);
      setSearchMessage("已定位新盘：" + displayName);
      return;
    }
    const place = places.find((item) => item.name.toLowerCase().includes(normalized));
    if (place) {
      selectPlace(place.id);
      requestFocus("place", place.id);
      setSearchMessage(`已定位：${place.name}`);
      return;
    }
    setSearchMessage(`没有找到“${query.trim()}”`);
  };

  return (
    <div className="search-wrap">
      <form className="search-form" onSubmit={handleSubmit} role="search">
        <Search size={18} aria-hidden="true" />
        <input value={query} onChange={(event) => { setQuery(event.target.value); if (searchMessage) setSearchMessage(""); }} placeholder="搜索板块、新盘或设施" aria-label="搜索板块、新盘或设施" />
        {query && <button type="button" className="icon-button compact" onClick={() => { setQuery(""); setSearchMessage(""); }} aria-label="清空搜索"><X size={16} /></button>}
        <button type="submit" className="search-submit" aria-label="搜索定位"><Navigation size={14} /></button>
      </form>
      {searchMessage && <div className={`search-message ${searchMessage.startsWith("没有") ? "is-error" : ""}`} role="status">{searchMessage}</div>}
    </div>
  );
}
