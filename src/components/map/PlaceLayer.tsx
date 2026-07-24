"use client";

import { useEffect, useRef } from "react";
import categoriesData from "@/src/data/categories.json";
import placesData from "@/src/data/places.json";
import { categoryIconSvg } from "@/src/lib/category-icon-svg";
import type { Category, Place } from "@/src/types/map";

const places = placesData as Place[];
const categories = categoriesData as Category[];
const categoryById = Object.fromEntries(categories.map((item) => [item.id, item]));

interface PlaceLayerProps {
  amapApi: typeof AMap;
  map: AMap.Map;
  zoom: number;
  enabledCategories: string[];
  viewportVersion: number;
  selectedPlaceId: string | null;
  onSelect: (place: Place) => void;
}

function placeMarkerContent(place: Place, selected: boolean) {
  const category = categoryById[place.category];
  return `<button class="place-marker${selected ? " is-selected" : ""}" style="--marker-color:${category.color}" aria-label="${place.name}"><span>${categoryIconSvg[category.icon]}</span></button>`;
}

export function PlaceLayer({ amapApi, map, zoom, enabledCategories, viewportVersion, selectedPlaceId, onSelect }: PlaceLayerProps) {
  const markerByPlaceIdRef = useRef(new Map<string, AMap.Marker>());
  const mountedPlaceIdsRef = useRef(new Set<string>());
  const selectedPlaceIdRef = useRef(selectedPlaceId);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const previousId = selectedPlaceIdRef.current;
    selectedPlaceIdRef.current = selectedPlaceId;
    for (const id of [previousId, selectedPlaceId]) {
      if (!id) continue;
      const marker = markerByPlaceIdRef.current.get(id);
      const place = places.find((item) => item.id === id);
      if (!marker || !place) continue;
      const selected = id === selectedPlaceId;
      marker.setContent(placeMarkerContent(place, selected));
      marker.setzIndex(selected ? 160 : 120);
    }
  }, [selectedPlaceId]);

  useEffect(() => {
    const markerByPlaceId = markerByPlaceIdRef.current;
    const mountedPlaceIds = mountedPlaceIdsRef.current;
    return () => {
      const mountedMarkers = [...mountedPlaceIds]
        .map((id) => markerByPlaceId.get(id))
        .filter((marker): marker is AMap.Marker => Boolean(marker));
      if (mountedMarkers.length) map.remove(mountedMarkers);
      mountedPlaceIds.clear();
      markerByPlaceId.clear();
    };
  }, [map]);

  useEffect(() => {
    const markerByPlaceId = markerByPlaceIdRef.current;
    const mountedPlaceIds = mountedPlaceIdsRef.current;
    const wantedPlaceIds = new Set<string>();

    const bounds = zoom >= 11.7 ? map.getBounds() : null;
    const visiblePlaces = zoom < 11.7 ? [] : places
      .filter((place) => enabledCategories.includes(place.category))
      .filter((place) => !bounds || bounds.contains([place.longitude, place.latitude]));

    for (const place of visiblePlaces) {
      wantedPlaceIds.add(place.id);
      let marker = markerByPlaceId.get(place.id);
      if (!marker) {
        const selected = place.id === selectedPlaceIdRef.current;
        marker = new amapApi.Marker({
          position: [place.longitude, place.latitude],
          content: placeMarkerContent(place, selected),
          anchor: "center",
          zIndex: selected ? 160 : 120,
          offset: new amapApi.Pixel(0, 0),
        });
        marker.on("click", () => onSelectRef.current(place));
        markerByPlaceId.set(place.id, marker);
      }
      if (!mountedPlaceIds.has(place.id)) {
        map.add(marker);
        mountedPlaceIds.add(place.id);
      }
    }

    for (const id of [...mountedPlaceIds]) {
      if (wantedPlaceIds.has(id)) continue;
      const marker = markerByPlaceId.get(id);
      if (marker) map.remove(marker);
      mountedPlaceIds.delete(id);
    }
  }, [amapApi, enabledCategories, map, viewportVersion, zoom]);

  return null;
}
