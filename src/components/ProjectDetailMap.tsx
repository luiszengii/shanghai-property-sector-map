"use client";

import { ExternalLink, MapPinned } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/projects/[id]/page.module.css";

type MapStatus = "loading" | "ready" | "missing-key" | "error";

export function ProjectDetailMap({
  name,
  position,
  sourceUrl,
}: {
  name: string;
  position: [number, number];
  sourceUrl: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const markerRef = useRef<AMap.Marker | null>(null);
  const [status, setStatus] = useState<MapStatus>(() => (
    process.env.NEXT_PUBLIC_AMAP_KEY ? "loading" : "missing-key"
  ));

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_AMAP_KEY;
    const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;
    if (!key) return;

    let cancelled = false;
    if (securityJsCode) {
      (window as Window & {
        _AMapSecurityConfig?: { securityJsCode: string };
      })._AMapSecurityConfig = { securityJsCode };
    }

    import("@amap/amap-jsapi-loader")
      .then(({ default: AMapLoader }) => AMapLoader.load({
        key,
        version: "2.0",
      }))
      .then((api: typeof AMap) => {
        if (cancelled || !hostRef.current || mapRef.current) return;
        const map = new api.Map(hostRef.current, {
          center: position,
          zoom: 14.6,
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
          showLabel: true,
          scrollWheel: false,
          doubleClickZoom: false,
          dragEnable: true,
        });
        const marker = new api.Marker({
          position,
          title: name,
          anchor: "bottom-center",
        });
        map.add(marker);
        mapRef.current = map;
        markerRef.current = marker;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      const map = mapRef.current;
      const marker = markerRef.current;
      markerRef.current = null;
      mapRef.current = null;
      if (!map) return;
      if (marker) map.remove(marker);
      queueMicrotask(() => map.destroy());
    };
  }, [name, position]);

  return (
    <div className={styles.mapFrame}>
      <div ref={hostRef} className={styles.mapHost} aria-label={`${name}地图位置`} />
      {status !== "ready" && (
        <div className={styles.mapFallback}>
          <MapPinned aria-hidden="true" size={27} />
          <strong>{status === "loading" ? "地图加载中" : "项目点位已固定"}</strong>
          <span>
            {status === "error"
              ? "地图暂时无法加载，可在高德地图查看"
              : status === "missing-key"
                ? "本地未配置地图密钥"
                : "正在读取地图底图"}
          </span>
        </div>
      )}
      <a href={sourceUrl} target="_blank" rel="noreferrer" className={styles.mapLink}>
        在地图上查看位置 <ExternalLink aria-hidden="true" size={13} />
      </a>
    </div>
  );
}
