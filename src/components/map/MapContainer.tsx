"use client";

import { AlertTriangle, LoaderCircle, MapPinned, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import placesData from "@/src/data/places.json";
import { projects } from "@/src/content/project-leads";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { coordinateToDisplayPosition } from "@/src/lib/geo-coordinate-conversion";
import { useMapStore } from "@/src/store/map-store";
import type { Place, PropertyProject, SectorFeature } from "@/src/types/map";
import { PlaceLayer } from "./PlaceLayer";
import { ProjectLayer } from "./ProjectLayer";
import { SectorLayer } from "./SectorLayer";

const places = placesData as Place[];

type LoadStatus = "loading" | "ready" | "missing-key" | "error";

export function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const [amapApi, setAmapApi] = useState<typeof AMap | null>(null);
  const [mapInstance, setMapInstance] = useState<AMap.Map | null>(null);
  const [status, setStatus] = useState<LoadStatus>(() => process.env.NEXT_PUBLIC_AMAP_KEY ? "loading" : "missing-key");
  const [errorMessage, setErrorMessage] = useState("");
  const [viewportVersion, setViewportVersion] = useState(0);
  const [viewportInteracting, setViewportInteracting] = useState(false);
  const {
    zoom,
    enabledCategories,
    selectedSectorId,
    selectedPlaceId,
    selectedProjectId,
    showProjects,
    projectClusterEnabled,
    projectClusterRadius,
    projectDetailMinZoom,
    focusRequest,
    sectorGeometryFallbacks,
    setZoom,
    setCenter,
    selectSector,
    selectPlace,
    selectProject,
    requestFocus,
  } = useMapStore();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_AMAP_KEY;
    const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;
    if (!key) return;

    let cancelled = false;
    let removeGestureGuard = () => {};
    if (securityJsCode) {
      (window as Window & { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = { securityJsCode };
    }
    import("@amap/amap-jsapi-loader")
      .then(({ default: AMapLoader }) => AMapLoader.load({ key, version: "2.0" }))
      .then((api: typeof AMap) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new api.Map(containerRef.current, {
          zoom: 10.6,
          center: [121.4737, 31.2304],
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
          showLabel: true,
          animateEnable: true,
          scrollWheel: true,
          doubleClickZoom: true,
          keyboardEnable: true,
          touchZoom: true,
          touchZoomCenter: 0,
        });

        let wheelFrame: number | null = null;
        let wheelDelta = 0;
        let zoomSettleTimer: number | null = null;
        let revealFrame: number | null = null;
        let zooming = false;
        const commitViewport = () => {
          const center = map.getCenter();
          setZoom(map.getZoom());
          setCenter([center.lng, center.lat]);
          setViewportVersion((value) => value + 1);
        };
        const beginZoomInteraction = () => {
          if (revealFrame !== null) {
            window.cancelAnimationFrame(revealFrame);
            revealFrame = null;
          }
          zooming = true;
          setViewportInteracting(true);
        };
        const scheduleZoomSettlement = () => {
          beginZoomInteraction();
          if (zoomSettleTimer !== null) window.clearTimeout(zoomSettleTimer);
          zoomSettleTimer = window.setTimeout(() => {
            zoomSettleTimer = null;
            zooming = false;
            commitViewport();
            // Keep the interaction class through React's overlay rebuild, then
            // reveal the fresh markers so they fade in instead of popping in.
            revealFrame = window.requestAnimationFrame(() => {
              revealFrame = window.requestAnimationFrame(() => {
                revealFrame = null;
                setViewportInteracting(false);
              });
            });
          }, 180);
        };
        const handleMoveEnd = () => {
          if (zooming) return;
          const center = map.getCenter();
          setCenter([center.lng, center.lat]);
          setViewportVersion((value) => value + 1);
        };
        const handlePinchWheel = (event: WheelEvent) => {
          if (!event.ctrlKey) return;
          const eventTarget = event.target;
          const appShell = document.querySelector(".app-shell");
          if (!(eventTarget instanceof Node) || !appShell?.contains(eventTarget)) return;
          event.preventDefault();
          event.stopPropagation();
          wheelDelta += event.deltaY;
          if (wheelFrame !== null) return;
          wheelFrame = window.requestAnimationFrame(() => {
            const delta = Math.max(-1.2, Math.min(1.2, wheelDelta * -0.018));
            const nextZoom = Math.max(3, Math.min(20, map.getZoom() + delta));
            map.setZoomAndCenter(nextZoom, map.getCenter(), true);
            wheelDelta = 0;
            wheelFrame = null;
          });
        };
        window.addEventListener("wheel", handlePinchWheel, { capture: true, passive: false });
        removeGestureGuard = () => {
          window.removeEventListener("wheel", handlePinchWheel, true);
          if (wheelFrame !== null) window.cancelAnimationFrame(wheelFrame);
        };
        map.on("zoomstart", beginZoomInteraction);
        map.on("zoomchange", scheduleZoomSettlement);
        map.on("zoomend", scheduleZoomSettlement);
        map.on("moveend", handleMoveEnd);
        mapRef.current = map;
        setMapInstance(map);
        setAmapApi(api);
        setStatus("ready");
        removeGestureGuard = () => {
          window.removeEventListener("wheel", handlePinchWheel, true);
          if (wheelFrame !== null) window.cancelAnimationFrame(wheelFrame);
          if (zoomSettleTimer !== null) window.clearTimeout(zoomSettleTimer);
          if (revealFrame !== null) window.cancelAnimationFrame(revealFrame);
          map.off("zoomstart", beginZoomInteraction);
          map.off("zoomchange", scheduleZoomSettlement);
          map.off("zoomend", scheduleZoomSettlement);
          map.off("moveend", handleMoveEnd);
        };
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "高德地图脚本加载失败";
        setErrorMessage(message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
      removeGestureGuard();
      const map = mapRef.current;
      mapRef.current = null;
      if (map) {
        // React runs this parent cleanup before the child layer cleanups. Let the
        // layers detach their overlays before destroying the underlying map.
        queueMicrotask(() => map.destroy());
      }
    };
  }, [setCenter, setZoom]);

  const changeZoom = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoomAndCenter(
      Math.max(3, Math.min(20, map.getZoom() + delta)),
      map.getCenter(),
      true,
    );
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequest) return;
    if (focusRequest.type === "sector") {
      const activeGeometry = sectorCatalog.resolveActiveGeometry(
        focusRequest.id,
        Boolean(sectorGeometryFallbacks[focusRequest.id]),
      );
      if (activeGeometry) {
        const activeCenter = coordinateToDisplayPosition(
          activeGeometry.center,
          activeGeometry.coordinateSystem,
        );
        map.setZoomAndCenter(12.4, activeCenter, false, 650);
      }
    } else if (focusRequest.type === "place") {
      const place = places.find((item) => item.id === focusRequest.id);
      if (place) map.setZoomAndCenter(15.2, [place.longitude, place.latitude], false, 650);
    } else {
      const project = projects.find((item) => item.id === focusRequest.id);
      if (project) {
        const detailMinZoom = useMapStore.getState().projectDetailMinZoom;
        map.setZoomAndCenter(
          Math.max(map.getZoom(), detailMinZoom),
          project.position,
          false,
          650,
        );
      }
    }
  }, [focusRequest, sectorGeometryFallbacks]);

  const handleSectorSelect = useCallback((sector: SectorFeature) => {
    selectSector(sector.properties.id);
    requestFocus("sector", sector.properties.id);
  }, [requestFocus, selectSector]);

  const handlePlaceSelect = useCallback((place: Place) => {
    selectPlace(place.id);
    requestFocus("place", place.id);
  }, [requestFocus, selectPlace]);

  const handleProjectSelect = useCallback((project: PropertyProject) => {
    selectProject(project.id);
  }, [selectProject]);

  return (
    <div
      className={`map-stage${viewportInteracting ? " is-viewport-interacting" : ""}`}
      aria-label="上海楼市互动地图"
    >
      <style>{`
        .map-stage .amap-marker {
          transition: opacity 140ms ease, visibility 0s linear;
        }
        .map-stage.is-viewport-interacting .amap-marker {
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          transition: opacity 110ms ease-out, visibility 0s linear 110ms;
        }
      `}</style>
      <div ref={containerRef} className="amap-host" />
      {status === "ready" && (
        <div className="map-zoom-controls" role="group" aria-label="地图缩放控制">
          <button type="button" onClick={() => changeZoom(1)} aria-label="放大地图" title="放大地图">
            <Plus size={19} />
          </button>
          <button type="button" onClick={() => changeZoom(-1)} aria-label="缩小地图" title="缩小地图">
            <Minus size={19} />
          </button>
        </div>
      )}
      {status === "loading" && (
        <div className="map-status" role="status">
          <LoaderCircle className="spin" size={24} />
          <strong>正在加载地图</strong>
          <span>准备板块边界与设施图层…</span>
        </div>
      )}
      {status === "missing-key" && (
        <div className="map-fallback">
          <div className="fallback-grid" />
          <div className="map-status key-notice" role="alert">
            <MapPinned size={28} />
            <strong>配置高德地图 Key 后即可浏览</strong>
            <span>页面功能与演示数据已就绪，请在环境变量中设置 NEXT_PUBLIC_AMAP_KEY。</span>
            <code>cp .env.example .env.local</code>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="map-fallback">
          <div className="fallback-grid" />
          <div className="map-status key-notice" role="alert">
            <AlertTriangle size={28} />
            <strong>地图暂时无法加载</strong>
            <span>{errorMessage || "请检查网络与高德地图配置后刷新页面。"}</span>
          </div>
        </div>
      )}
      {status === "ready" && amapApi && mapInstance && (
        <>
          <SectorLayer amapApi={amapApi} map={mapInstance} zoom={zoom} selectedSectorId={selectedSectorId} onSelect={handleSectorSelect} />
          <PlaceLayer amapApi={amapApi} map={mapInstance} zoom={zoom} enabledCategories={enabledCategories} viewportVersion={viewportVersion} selectedPlaceId={selectedPlaceId} onSelect={handlePlaceSelect} />
          <ProjectLayer
            amapApi={amapApi}
            map={mapInstance}
            zoom={zoom}
            visible={showProjects}
            clusterEnabled={projectClusterEnabled}
            clusterRadius={projectClusterRadius}
            detailMinZoom={projectDetailMinZoom}
            selectedProjectId={selectedProjectId}
            onSelect={handleProjectSelect}
          />
        </>
      )}
    </div>
  );
}
