"use client";

import { Navigation, Search, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import categoriesData from "@/src/data/categories.json";
import placesData from "@/src/data/places.json";
import { projects } from "@/src/content/project-leads";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useMapStore } from "@/src/store/map-store";
import type { Category, Place } from "@/src/types/map";

const places = placesData as Place[];
const categoryNames = new Map(
  (categoriesData as Category[]).map((category) => [category.id, category.name]),
);

type SearchSuggestion =
  | {
    type: "sector";
    id: string;
    name: string;
    meta: string;
    matchedAlias?: string;
  }
  | {
    type: "project";
    id: string;
    name: string;
    meta: string;
  }
  | {
    type: "place";
    id: string;
    name: string;
    meta: string;
  };

const suggestionLabels: Record<SearchSuggestion["type"], string> = {
  sector: "板块",
  project: "楼盘",
  place: "设施",
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replaceAll(/\s+/g, "");
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { selectSector, selectPlace, selectProject, requestFocus, searchMessage, setSearchMessage } = useMapStore();

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const normalized = normalize(query);
    if (!normalized) return [];

    const sectors = sectorCatalog.registry
      .flatMap((record) => {
        const matchedName = [record.canonicalName, ...record.aliases].find((candidate) =>
          normalize(candidate).includes(normalized)
        );
        if (!matchedName || !sectorCatalog.getFeature(record.id)) return [];
        return [{
          type: "sector" as const,
          id: record.id,
          name: record.canonicalName,
          meta: `${record.districtNames.join("、") || "上海"}${matchedName === record.canonicalName ? "" : ` · 别名 ${matchedName}`}`,
          matchedAlias: matchedName === record.canonicalName ? undefined : matchedName,
        }];
      })
      .slice(0, 4);

    const projectMatches = projects
      .filter((project) =>
        normalize(project.name).includes(normalized)
        || (project.officialName ? normalize(project.officialName).includes(normalized) : false)
      )
      .slice(0, 4)
      .map((project) => ({
        type: "project" as const,
        id: project.id,
        name: project.officialName ?? project.name,
        meta: `${project.district} · ${project.sector}`,
      }));

    const placeMatches = places
      .filter((place) => normalize(place.name).includes(normalized))
      .slice(0, 4)
      .map((place) => ({
        type: "place" as const,
        id: place.id,
        name: place.name,
        meta: categoryNames.get(place.category) ?? "设施",
      }));

    return [...sectors, ...projectMatches, ...placeMatches].slice(0, 9);
  }, [query]);

  const chooseSuggestion = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.name);
    setSuggestionsOpen(false);
    setActiveIndex(-1);
    if (suggestion.type === "sector") {
      selectSector(suggestion.id);
      requestFocus("sector", suggestion.id);
      setSearchMessage(suggestion.matchedAlias
        ? `已定位：${suggestion.name}（匹配别名：${suggestion.matchedAlias}）`
        : `已定位：${suggestion.name}`);
      return;
    }
    if (suggestion.type === "project") {
      selectProject(suggestion.id);
      requestFocus("project", suggestion.id);
      setSearchMessage(`已定位新盘：${suggestion.name}`);
      return;
    }
    selectPlace(suggestion.id);
    requestFocus("place", suggestion.id);
    setSearchMessage(`已定位：${suggestion.name}`);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      chooseSuggestion(suggestions[activeIndex]);
      return;
    }
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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestionsOpen || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Escape") {
      setSuggestionsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div
      className="search-wrap"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setSuggestionsOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <form className="search-form" onSubmit={handleSubmit} role="search">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSuggestionsOpen(Boolean(event.target.value.trim()));
            setActiveIndex(-1);
            if (searchMessage) setSearchMessage("");
          }}
          onFocus={() => setSuggestionsOpen(Boolean(query.trim()))}
          onKeyDown={handleKeyDown}
          placeholder="搜索板块、新盘或设施"
          aria-label="搜索板块、新盘或设施"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen && suggestions.length > 0}
          aria-controls="map-search-suggestions"
          aria-activedescendant={activeIndex >= 0 ? `map-search-option-${activeIndex}` : undefined}
        />
        {query && <button type="button" className="icon-button compact" onClick={() => { setQuery(""); setSearchMessage(""); setSuggestionsOpen(false); setActiveIndex(-1); }} aria-label="清空搜索"><X size={16} /></button>}
        <button type="submit" className="search-submit" aria-label="搜索定位"><Navigation size={14} /></button>
      </form>
      {suggestionsOpen && suggestions.length > 0 && (
        <div className="search-suggestions" id="map-search-suggestions" role="listbox" aria-label="搜索建议">
          {suggestions.map((suggestion, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              id={`map-search-option-${index}`}
              className={`search-suggestion is-${suggestion.type}${index === activeIndex ? " is-active" : ""}`}
              key={`${suggestion.type}-${suggestion.id}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseSuggestion(suggestion)}
            >
              <span className="search-suggestion-type">{suggestionLabels[suggestion.type]}</span>
              <span className="search-suggestion-copy">
                <strong>{suggestion.name}</strong>
                <small>{suggestion.meta}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <span className="search-status" role="status" aria-live="polite">{searchMessage}</span>
    </div>
  );
}
