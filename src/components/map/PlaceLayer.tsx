"use client";

import { useEffect, useRef } from "react";
import categoriesData from "@/src/data/categories.json";
import placesData from "@/src/data/places.json";
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

export function PlaceLayer({ amapApi, map, zoom, enabledCategories, viewportVersion, selectedPlaceId, onSelect }: PlaceLayerProps) {
  const markersRef = useRef<AMap.Marker[]>([]);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    markersRef.current.forEach((marker) => map.remove(marker));
    markersRef.current = [];
    if (zoom < 11.7) return;

    const bounds = map.getBounds();
    const markers = places
      .filter((place) => enabledCategories.includes(place.category))
      .filter((place) => !bounds || bounds.contains([place.longitude, place.latitude]))
      .map((place) => {
        const category = categoryById[place.category];
        const selected = place.id === selectedPlaceId;
        const content = `<button class="place-marker${selected ? " is-selected" : ""}" style="--marker-color:${category.color}" aria-label="${place.name}"><span>${category.icon}</span></button>`;
        const marker = new amapApi.Marker({
          position: [place.longitude, place.latitude],
          content,
          anchor: "center",
          zIndex: selected ? 160 : 120,
          offset: new amapApi.Pixel(0, 0),
        });
        marker.on("click", () => onSelectRef.current(place));
        map.add(marker);
        return marker;
      });
    markersRef.current = markers;

    return () => {
      markers.forEach((marker) => map.remove(marker));
    };
  }, [amapApi, enabledCategories, map, selectedPlaceId, viewportVersion, zoom]);

  return null;
}
