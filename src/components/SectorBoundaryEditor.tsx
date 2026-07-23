"use client";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Download,
  FileUp,
  Focus,
  LoaderCircle,
  MapPinned,
  Minus,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { coordinateToDisplayPosition } from "@/src/lib/geo-coordinate-conversion";
import {
  buildSectorEditorTemplates,
  buildSubscopeEditorTemplates,
} from "@/src/lib/sector-editor-catalog";
import {
  buildSectorDraftFeatureCollection,
  createDraftFromExistingSector,
  createSectorDraft,
  formatSectorDraftFilename,
  isCompleteSectorDraft,
  normalizeAmapPolygonRing,
  parseSectorDraftFeatureCollection,
  parseSectorEditorState,
  SECTOR_EDITOR_STORAGE_KEY,
  serializeSectorEditorState,
  syncUntouchedDraftsToCurrentTemplates,
  type DraftPosition,
  type ExistingSectorDraftTemplate,
  type SectorBoundaryDraft,
} from "@/src/lib/sector-editor-drafts";
import { mapZoomDeltaForShortcut } from "@/src/lib/map-keyboard-shortcuts";
import { sectorEditorMapOptions } from "@/src/lib/sector-editor-map-options";
import styles from "./SectorBoundaryEditor.module.css";

type LoadStatus = "loading" | "ready" | "missing-key" | "error";
type Notice = { tone: "neutral" | "success" | "warning"; message: string };

interface MouseToolDrawEvent {
  obj: AMap.Polygon;
}

type SidebarSectorItem =
  | {
    kind: "existing";
    template: ExistingSectorDraftTemplate;
    draft?: SectorBoundaryDraft;
  }
  | {
    kind: "custom";
    draft: SectorBoundaryDraft;
  };

const primarySectorTemplates = buildSectorEditorTemplates(
  sectorCatalog.registry,
  sectorCatalog.resolveEditorGeometry,
  coordinateToDisplayPosition,
  (id) => sectorCatalog.resolveActiveGeometry(id, true),
);
const subscopeTemplates = buildSubscopeEditorTemplates(
  sectorCatalog.subscopes,
  sectorCatalog.getRecord,
  coordinateToDisplayPosition,
);
const existingSectorTemplates: ExistingSectorDraftTemplate[] = [
  ...primarySectorTemplates,
  ...subscopeTemplates,
];
const existingSectorTemplateById = new Map(
  existingSectorTemplates.map((template) => [template.id, template]),
);

function createDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `sector-${crypto.randomUUID()}`;
  }
  return `sector-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function polygonToRing(polygon: AMap.Polygon): DraftPosition[] {
  return normalizeAmapPolygonRing(polygon.getPath());
}

function formatArea(area: number) {
  if (!area) return "尚未绘制";
  if (area >= 1_000_000) return `${(area / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(area).toLocaleString("zh-CN")} m²`;
}

export function SectorBoundaryEditor() {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const amapApiRef = useRef<typeof AMap | null>(null);
  const activePolygonRef = useRef<AMap.Polygon | null>(null);
  const polygonEditorRef = useRef<AMap.PolygonEditor | null>(null);
  const mouseToolRef = useRef<AMap.MouseTool | null>(null);
  const referencePolygonsRef = useRef<AMap.Polygon[]>([]);
  const draftsRef = useRef<SectorBoundaryDraft[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<LoadStatus>(() => (
    process.env.NEXT_PUBLIC_AMAP_KEY ? "loading" : "missing-key"
  ));
  const [errorMessage, setErrorMessage] = useState("");
  const [drafts, setDrafts] = useState<SectorBoundaryDraft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [area, setArea] = useState(0);
  const [mapZoom, setMapZoom] = useState(10.8);
  const [notice, setNotice] = useState<Notice>({
    tone: "neutral",
    message: "草稿只保存在当前浏览器，建议随时导出备份。",
  });

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeId) ?? null,
    [activeId, drafts],
  );
  const existingDraftBySourceId = useMemo(
    () => new Map(
      drafts
        .filter((draft): draft is SectorBoundaryDraft & { sourceSectorId: string } => Boolean(draft.sourceSectorId))
        .map((draft) => [draft.sourceSectorId, draft]),
    ),
    [drafts],
  );
  const customDrafts = useMemo(
    () => drafts.filter((draft) => !draft.sourceSectorId),
    [drafts],
  );
  const outdatedSourceIds = useMemo(
    () => new Set(drafts.flatMap((draft) => {
      if (!draft.sourceSectorId) return [];
      const template = existingSectorTemplateById.get(draft.sourceSectorId);
      return template?.ring.length
        && draft.sourceGeometryFingerprint !== template.geometryFingerprint
        ? [draft.sourceSectorId]
        : [];
    })),
    [drafts],
  );
  const sidebarItems = useMemo<SidebarSectorItem[]>(() => [
    ...existingSectorTemplates.map((template) => ({
      kind: "existing" as const,
      template,
      draft: existingDraftBySourceId.get(template.id),
    })),
    ...customDrafts.map((draft) => ({ kind: "custom" as const, draft })),
  ], [customDrafts, existingDraftBySourceId]);
  const visibleSidebarItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sidebarItems;
    return sidebarItems.filter((item) => {
      const draft = item.kind === "existing" ? item.draft : item.draft;
      const name = draft?.name ?? (item.kind === "existing" ? item.template.name : "");
      const district = draft?.district ?? (item.kind === "existing" ? item.template.district : "");
      const canonicalName = item.kind === "existing" ? item.template.name : "";
      return name.toLowerCase().includes(normalizedQuery)
        || district.toLowerCase().includes(normalizedQuery)
        || canonicalName.toLowerCase().includes(normalizedQuery);
    });
  }, [query, sidebarItems]);
  const inactiveGeometrySignature = useMemo(
    () => drafts
      .filter((draft) => draft.id !== activeId)
      .map((draft) => `${draft.id}:${JSON.stringify(draft.ring)}`)
      .join("|"),
    [activeId, drafts],
  );

  const updateDraft = useCallback((
    id: string,
    patch: Partial<Omit<SectorBoundaryDraft, "id" | "coordinateSystem" | "createdAt">>,
  ) => {
    const updatedAt = new Date().toISOString();
    setDrafts((current) => current.map((draft) => (
      draft.id === id ? { ...draft, ...patch, updatedAt } : draft
    )));
  }, []);

  const syncPolygonToDraft = useCallback((polygon: AMap.Polygon) => {
    const id = activeIdRef.current;
    if (!id) return;
    const ring = polygonToRing(polygon);
    if (ring.length < 3) return;
    updateDraft(id, { ring });
    setArea(polygon.getArea());
  }, [updateDraft]);

  const changeMapZoom = useCallback((delta: -1 | 1) => {
    const map = mapRef.current;
    if (!map) return;
    const nextZoom = Math.max(3, Math.min(20, map.getZoom() + delta));
    map.setZoomAndCenter(nextZoom, map.getCenter(), true);
  }, []);

  const activateExistingSector = useCallback((template: ExistingSectorDraftTemplate) => {
    const existingDraft = draftsRef.current.find((draft) => draft.sourceSectorId === template.id);
    if (existingDraft) {
      setActiveId(existingDraft.id);
      setIsDrawing(false);
      return;
    }
    const draft = createDraftFromExistingSector(template);
    setDrafts((current) => [...current, draft]);
    setActiveId(draft.id);
    setIsDrawing(false);
    setNotice({
      tone: "success",
      message: template.geometryStatus === "missing"
        ? `已载入“${template.name}”；该板块尚无边界，请点击“开始画边界”。`
        : `已载入“${template.name}”的可编辑副本；拖动橙色节点或重画边界即可修改。`,
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(SECTOR_EDITOR_STORAGE_KEY);
        if (stored) {
          const restored = parseSectorEditorState(stored);
          const synced = syncUntouchedDraftsToCurrentTemplates(restored, existingSectorTemplates);
          setDrafts(synced.drafts);
          setActiveId(synced.drafts[0]?.id ?? null);
          if (synced.preservedModifiedSourceIds.length) {
            setNotice({
              tone: "warning",
              message: `${synced.preservedModifiedSourceIds.length} 个手工修改草稿仍基于旧源边界，已保留；放弃该副本后可重新载入当前高精度边界。`,
            });
          } else if (synced.updatedSourceIds.length) {
            setNotice({
              tone: "success",
              message: `已将 ${synced.updatedSourceIds.length} 个未修改副本同步到主页当前高精度边界。`,
            });
          }
        }
      } catch (error) {
        console.warn("板块草稿恢复失败", error);
        setNotice({
          tone: "warning",
          message: "本机旧草稿无法读取；请用之前导出的 GeoJSON 恢复。",
        });
      } finally {
        setHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SECTOR_EDITOR_STORAGE_KEY, serializeSectorEditorState(drafts));
    } catch (error) {
      console.warn("板块草稿保存失败", error);
      queueMicrotask(() => {
        setNotice({ tone: "warning", message: "浏览器未能保存草稿，请立即导出备份。" });
      });
    }
  }, [drafts, hydrated]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_AMAP_KEY;
    const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;
    if (!key) return;

    let cancelled = false;
    let removeKeyboardZoom = () => {};
    if (securityJsCode) {
      (window as Window & { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = {
        securityJsCode,
      };
    }

    import("@amap/amap-jsapi-loader")
      .then(({ default: AMapLoader }) => AMapLoader.load({
        key,
        version: "2.0",
        plugins: ["AMap.MouseTool", "AMap.PolygonEditor"],
      }))
      .then((api: typeof AMap) => {
        if (cancelled || !mapHostRef.current) return;
        const map = new api.Map(mapHostRef.current, sectorEditorMapOptions);
        const syncZoom = () => setMapZoom(map.getZoom());
        const handleZoomShortcut = (event: KeyboardEvent) => {
          if (event.isComposing) return;
          const delta = mapZoomDeltaForShortcut(event);
          if (delta === null) return;
          event.preventDefault();
          event.stopPropagation();
          const nextZoom = Math.max(3, Math.min(20, map.getZoom() + delta));
          map.setZoomAndCenter(nextZoom, map.getCenter(), true);
        };
        map.on("zoomchange", syncZoom);
        window.addEventListener("keydown", handleZoomShortcut, { capture: true });
        syncZoom();
        removeKeyboardZoom = () => {
          map.off("zoomchange", syncZoom);
          window.removeEventListener("keydown", handleZoomShortcut, true);
        };
        amapApiRef.current = api;
        mapRef.current = map;
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "地图脚本加载失败");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      removeKeyboardZoom();
      polygonEditorRef.current?.close();
      mouseToolRef.current?.close(false);
      const map = mapRef.current;
      mapRef.current = null;
      amapApiRef.current = null;
      if (map) queueMicrotask(() => map.destroy());
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const api = amapApiRef.current;
    if (status !== "ready" || !map || !api) return;

    polygonEditorRef.current?.close();
    polygonEditorRef.current = null;
    if (activePolygonRef.current) map.remove(activePolygonRef.current);
    activePolygonRef.current = null;
    queueMicrotask(() => setArea(0));

    const draft = draftsRef.current.find((item) => item.id === activeIdRef.current);
    if (!draft || draft.ring.length < 3) return;

    const polygon = new api.Polygon();
    polygon.setOptions({
      path: draft.ring,
      strokeColor: "#e46f32",
      strokeWeight: 3,
      strokeOpacity: 1,
      fillColor: "#f59e0b",
      fillOpacity: 0.19,
      zIndex: 80,
    });
    map.add(polygon);
    activePolygonRef.current = polygon;
    queueMicrotask(() => setArea(polygon.getArea()));

    const editor = new api.PolygonEditor(map, polygon, {
      controlPoint: {
        content: '<span style="display:block;width:13px;height:13px;border:3px solid #fff;border-radius:50%;background:#e46f32;box-shadow:0 2px 7px rgba(15,23,42,.3)"></span>',
      },
      midControlPoint: {
        content: '<span style="display:block;width:9px;height:9px;border:2px solid #fff;border-radius:50%;background:#f7ad79"></span>',
      },
    });
    const sync = () => syncPolygonToDraft(polygon);
    editor.on("addnode", sync);
    editor.on("adjust", sync);
    editor.on("removenode", sync);
    editor.on("end", sync);
    editor.open();
    polygonEditorRef.current = editor;

    return () => {
      editor.off("addnode", sync);
      editor.off("adjust", sync);
      editor.off("removenode", sync);
      editor.off("end", sync);
      editor.close();
    };
  }, [geometryRevision, status, syncPolygonToDraft, activeId]);

  useEffect(() => {
    const map = mapRef.current;
    const polygon = activePolygonRef.current;
    if (status !== "ready" || !activeId || !map || !polygon) return;
    map.setFitView([polygon], false, [90, 90, 90, 90], 16);
  }, [activeId, status]);

  useEffect(() => {
    const map = mapRef.current;
    const api = amapApiRef.current;
    if (status !== "ready" || !map || !api) return;
    if (referencePolygonsRef.current.length) {
      map.remove(referencePolygonsRef.current);
    }

    const editableReferences = draftsRef.current
      .filter((draft) => draft.id !== activeId && draft.ring.length >= 3)
      .map((draft) => {
        const polygon = new api.Polygon();
        polygon.setOptions({
          path: draft.ring,
          strokeColor: "#0f766e",
          strokeWeight: 1.4,
          strokeOpacity: 0.74,
          strokeStyle: "dashed",
          fillColor: "#2dd4bf",
          fillOpacity: 0.07,
          cursor: "pointer",
          zIndex: 30,
        });
        polygon.on("click", () => {
          setActiveId(draft.id);
          setIsDrawing(false);
        });
        return polygon;
      });
    const editableSourceIds = new Set(
      draftsRef.current
        .map((draft) => draft.sourceSectorId)
        .filter((id): id is string => Boolean(id)),
    );
    const sourceReferences = existingSectorTemplates
      .filter((template) => template.ring.length >= 3 && !editableSourceIds.has(template.id))
      .map((template) => {
        const polygon = new api.Polygon();
        polygon.setOptions({
          path: template.ring,
          strokeColor: "#64748b",
          strokeWeight: 1.4,
          strokeOpacity: 0.72,
          strokeStyle: "dashed",
          fillColor: "#94a3b8",
          fillOpacity: 0.045,
          cursor: "pointer",
          zIndex: 24,
        });
        polygon.on("click", () => activateExistingSector(template));
        return polygon;
      });
    const references = [...sourceReferences, ...editableReferences];
    if (references.length) map.add(references);
    referencePolygonsRef.current = references;

    return () => {
      if (references.length) map.remove(references);
    };
  }, [activateExistingSector, activeId, inactiveGeometrySignature, status]);

  const addDraft = useCallback(() => {
    const draft = createSectorDraft(createDraftId());
    setDrafts((current) => [draft, ...current]);
    setActiveId(draft.id);
    setIsDrawing(false);
    setNotice({ tone: "neutral", message: "已新建草稿。填写名称后，点击地图上的“开始画边界”。" });
  }, []);

  const removeActiveDraft = useCallback(() => {
    const draft = draftsRef.current.find((item) => item.id === activeIdRef.current);
    if (!draft) return;
    const isExistingSectorCopy = Boolean(draft.sourceSectorId);
    const prompt = isExistingSectorCopy
      ? `确定放弃“${draft.name}”的本机修改并恢复为原始边界吗？已导出的备份不受影响。`
      : `确定删除“${draft.name}”的本机草稿吗？此操作不会删除已经导出的备份。`;
    if (!window.confirm(prompt)) return;
    const remaining = draftsRef.current.filter((item) => item.id !== draft.id);
    setDrafts(remaining);
    setActiveId(remaining[0]?.id ?? null);
    setGeometryRevision((value) => value + 1);
    setNotice({
      tone: "neutral",
      message: isExistingSectorCopy
        ? "已放弃本机修改；原始板块仍在列表和地图中，可随时重新载入。"
        : "已删除本机草稿；已导出的 GeoJSON 不受影响。",
    });
  }, []);

  const startDrawing = useCallback(() => {
    const map = mapRef.current;
    const api = amapApiRef.current;
    if (!map || !api || !activeIdRef.current) return;
    polygonEditorRef.current?.close();
    mouseToolRef.current?.close(false);
    const mouseTool = new api.MouseTool(map);
    mouseToolRef.current = mouseTool;
    setIsDrawing(true);
    setNotice({ tone: "neutral", message: "在地图上逐点点击，双击最后一个点完成；随后可拖动圆点精修。" });

    const handleDraw = (event: MouseToolDrawEvent) => {
      const ring = polygonToRing(event.obj);
      mouseTool.close(false);
      mouseTool.off("draw", handleDraw);
      map.remove(event.obj);
      setIsDrawing(false);
      if (ring.length < 3) {
        setNotice({ tone: "warning", message: "边界至少需要 3 个不同位置的点，请重新绘制。" });
        return;
      }
      const id = activeIdRef.current;
      if (!id) return;
      updateDraft(id, { ring });
      setGeometryRevision((value) => value + 1);
      setNotice({ tone: "success", message: "边界已自动保存。拖动橙色圆点可继续精修。" });
    };
    mouseTool.on("draw", handleDraw);
    mouseTool.polygon({
      strokeColor: "#e46f32",
      strokeWeight: 3,
      strokeOpacity: 1,
      fillColor: "#f59e0b",
      fillOpacity: 0.19,
      zIndex: 85,
    });
  }, [updateDraft]);

  const stopDrawing = useCallback(() => {
    mouseToolRef.current?.close(true);
    mouseToolRef.current = null;
    setIsDrawing(false);
    polygonEditorRef.current?.open();
    setNotice({ tone: "neutral", message: "已取消本次绘制，原草稿仍保留。" });
  }, []);

  const focusActiveDraft = useCallback(() => {
    const map = mapRef.current;
    const polygon = activePolygonRef.current;
    if (!map || !polygon) return;
    map.setFitView([polygon], false, [90, 90, 90, 90], 16);
  }, []);

  const exportDrafts = useCallback(() => {
    const collection = buildSectorDraftFeatureCollection(draftsRef.current);
    if (!collection.features.length) {
      setNotice({ tone: "warning", message: "至少完成一个有名称、且不少于 3 个点的板块后才能导出。" });
      return;
    }
    const blob = new Blob([`${JSON.stringify(collection, null, 2)}\n`], {
      type: "application/geo+json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = formatSectorDraftFilename();
    anchor.click();
    URL.revokeObjectURL(url);
    const skipped = draftsRef.current.length - collection.features.length;
    setNotice({
      tone: "success",
      message: skipped
        ? `已导出 ${collection.features.length} 个完整板块；${skipped} 个未完成草稿未导出。`
        : `已导出全部 ${collection.features.length} 个板块草稿。`,
    });
  }, []);

  const importDrafts = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseSectorDraftFeatureCollection(JSON.parse(await file.text()));
      if (!imported.length) throw new Error("文件中没有板块");
      if (draftsRef.current.length && !window.confirm(
        `导入会用文件中的 ${imported.length} 个板块替换当前浏览器里的 ${draftsRef.current.length} 个草稿，是否继续？`,
      )) return;
      setDrafts(imported);
      setActiveId(imported[0].id);
      setGeometryRevision((value) => value + 1);
      setNotice({ tone: "success", message: `已从备份恢复 ${imported.length} 个板块草稿。` });
    } catch (error) {
      setNotice({
        tone: "warning",
        message: error instanceof Error ? `导入失败：${error.message}` : "导入失败：文件格式不正确",
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Link href="/" className={styles.backLink}>
            <ChevronLeft size={16} />
            返回楼盘地图
          </Link>
          <div>
            <span className={styles.eyebrow}>LOCAL BOUNDARY WORKBENCH</span>
            <h1>板块边界编辑器</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.autoSave}>
            <Check size={14} />
            本机自动保存
          </span>
          <input
            ref={importInputRef}
            className={styles.hiddenInput}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            onChange={(event) => void importDrafts(event.target.files?.[0])}
          />
          <button type="button" className={styles.secondaryButton} onClick={() => importInputRef.current?.click()}>
            <FileUp size={15} />
            导入备份
          </button>
          <button type="button" className={styles.primaryButton} onClick={exportDrafts}>
            <Download size={15} />
            导出全部
          </button>
        </div>
      </header>

      <section className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarIntro}>
            <div>
              <span>已有板块与草稿</span>
              <strong>
                {sectorCatalog.registry.length} 个板块 · {subscopeTemplates.length} 个参考范围 · {" "}
                {primarySectorTemplates.filter((template) => template.geometryStatus === "missing").length} 个待绘制 · {" "}
                {customDrafts.length} 个自建
              </strong>
            </div>
            <button type="button" className={styles.newButton} onClick={addDraft}>
              <Plus size={15} />
              新建
            </button>
          </div>

          <label className={styles.searchBox}>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索板块名或行政区"
            />
          </label>

          <div className={styles.draftList} aria-label="已有板块与草稿列表">
            {visibleSidebarItems.length ? visibleSidebarItems.map((item, index) => {
              const draft = item.draft;
              const isExistingSector = item.kind === "existing";
              const template = isExistingSector ? item.template : null;
              const itemId = template?.id ?? draft?.id ?? `item-${index}`;
              const isActive = Boolean(draft && draft.id === activeId);
              const isComplete = Boolean(draft && isCompleteSectorDraft(draft));
              const displayName = draft?.name ?? template?.name ?? "未命名板块";
              const displayDistrict = draft?.district ?? template?.district ?? "";
              return (
                <button
                  key={`${item.kind}-${itemId}`}
                  type="button"
                  className={`${styles.draftItem} ${isActive ? styles.draftItemActive : ""}`}
                  onClick={() => {
                    if (template) {
                      if (draft) {
                        setActiveId(draft.id);
                        setIsDrawing(false);
                      } else {
                        const editableDraft = createDraftFromExistingSector(template);
                        setDrafts((current) => [...current, editableDraft]);
                        setActiveId(editableDraft.id);
                        setIsDrawing(false);
                        setNotice({
                          tone: "success",
                          message: template.geometryStatus === "missing"
                            ? `已载入“${template.name}”；该板块尚无边界，请点击“开始画边界”。`
                            : `已载入“${template.name}”的可编辑副本；拖动橙色节点或重画边界即可修改。`,
                        });
                      }
                    } else if (draft) {
                      setActiveId(draft.id);
                      setIsDrawing(false);
                    }
                  }}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{displayName}</strong>
                    <small>
                      {displayDistrict}
                      {isExistingSector
                        ? outdatedSourceIds.has(template?.id ?? "")
                          ? " · 源边界有更新"
                          : template?.geometryStatus === "missing"
                          ? ` · ${draft?.ring.length ? `${draft.ring.length} 个边界点` : "待绘制"}`
                          : ` · ${draft ? "编辑副本" : "点击编辑"}`
                        : isComplete ? ` · ${draft?.ring.length ?? 0} 个边界点` : " · 待完善"}
                    </small>
                  </div>
                  <i className={isExistingSector && !draft
                    ? styles.sourceDot
                    : isComplete ? styles.completeDot : styles.incompleteDot} />
                </button>
              );
            }) : (
              <div className={styles.emptyList}>
                <PencilLine size={20} />
                <span>没有匹配的板块或草稿</span>
              </div>
            )}
          </div>

          {activeDraft ? (
            <div className={styles.form}>
              <div className={styles.formHeading}>
                <div>
                  <span>{activeDraft.sourceSectorId ? "已有板块副本" : "自建板块"}</span>
                  <strong>{activeDraft.ring.length} 个点 · {formatArea(area)}</strong>
                </div>
                <button
                  type="button"
                  onClick={removeActiveDraft}
                  aria-label={activeDraft.sourceSectorId ? "放弃修改并恢复原始边界" : "删除当前草稿"}
                  title={activeDraft.sourceSectorId ? "放弃修改并恢复原始边界" : "删除当前草稿"}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <label>
                <span>板块名称 *</span>
                <input
                  value={activeDraft.name}
                  onChange={(event) => updateDraft(activeDraft.id, { name: event.target.value })}
                  placeholder="例如：前滩"
                />
              </label>
              <label>
                <span>所在行政区</span>
                <input
                  value={activeDraft.district}
                  onChange={(event) => updateDraft(activeDraft.id, { district: event.target.value })}
                  placeholder="例如：浦东新区"
                />
              </label>
              <label>
                <span>边界依据</span>
                <textarea
                  value={activeDraft.boundaryBasis}
                  onChange={(event) => updateDraft(activeDraft.id, { boundaryBasis: event.target.value })}
                  placeholder="例如：北至××路，东至××河…"
                  rows={3}
                />
              </label>
              <label>
                <span>核对备注</span>
                <textarea
                  value={activeDraft.note}
                  onChange={(event) => updateDraft(activeDraft.id, { note: event.target.value })}
                  placeholder="记录待查的路口、与相邻板块的争议点"
                  rows={2}
                />
              </label>
              <div className={styles.coordinateNote}>
                <MapPinned size={14} />
                <span>绘制坐标：GCJ‑02（高德）。这是市场板块草稿，不是行政区或官方规划边界。</span>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.emptyEditor} onClick={addDraft}>
              <Plus size={22} />
              <strong>选择已有板块，或新建一个</strong>
              <span>点击左侧已有板块即可载入可编辑副本</span>
            </button>
          )}
        </aside>

        <div className={styles.mapPanel} data-map-zoom={mapZoom.toFixed(1)}>
          <div ref={mapHostRef} className={styles.mapHost} aria-label="板块边界绘制地图" />

          {status === "ready" && (
            <div className={styles.mapToolbar}>
              {activeDraft && (
                <>
                  {isDrawing ? (
                    <button type="button" className={styles.stopButton} onClick={stopDrawing}>
                      取消本次绘制
                    </button>
                  ) : (
                    <button type="button" className={styles.drawButton} onClick={startDrawing}>
                      <PencilLine size={17} />
                      {activeDraft.ring.length >= 3 ? "重画边界" : "开始画边界"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={focusActiveDraft}
                    disabled={activeDraft.ring.length < 3}
                    aria-label="定位当前板块"
                    title="定位当前板块"
                  >
                    <Focus size={17} />
                  </button>
                </>
              )}
              <div className={styles.zoomControls} role="group" aria-label="地图缩放控制">
                <button type="button" onClick={() => changeMapZoom(1)} aria-label="放大地图" title="放大地图（Control/Command + =）">
                  <Plus size={16} />
                </button>
                <span aria-live="polite">Z {mapZoom.toFixed(1)}</span>
                <button type="button" onClick={() => changeMapZoom(-1)} aria-label="缩小地图" title="缩小地图（Control/Command + -）">
                  <Minus size={16} />
                </button>
              </div>
            </div>
          )}

          {status === "ready" && (
            <div className={`${styles.notice} ${styles[`notice${notice.tone[0].toUpperCase()}${notice.tone.slice(1)}`]}`}>
              {notice.tone === "warning" && <AlertTriangle size={15} />}
              {notice.tone === "success" && <Check size={15} />}
              <span>{notice.message}</span>
            </div>
          )}

          {status === "loading" && (
            <div className={styles.mapStatus}>
              <LoaderCircle className={styles.spin} size={25} />
              <strong>正在打开编辑地图</strong>
              <span>加载绘制与节点编辑工具…</span>
            </div>
          )}
          {status === "missing-key" && (
            <div className={styles.mapFallback}>
              <MapPinned size={30} />
              <strong>配置高德地图 Key 后即可绘制</strong>
              <span>草稿列表与导入导出仍可使用；地图需要 NEXT_PUBLIC_AMAP_KEY。</span>
            </div>
          )}
          {status === "error" && (
            <div className={styles.mapFallback}>
              <AlertTriangle size={30} />
              <strong>编辑地图暂时无法加载</strong>
              <span>{errorMessage || "请检查网络与高德地图配置后刷新。"}</span>
            </div>
          )}

          <div className={styles.mapGuide}>
            <span><b>1</b> 新建并命名</span>
            <span><b>2</b> 逐点点击，双击收口</span>
            <span><b>3</b> 拖动圆点精修</span>
          </div>
        </div>
      </section>
    </main>
  );
}
