"use client";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Download,
  FileUp,
  Focus,
  GitMerge,
  History,
  Link2,
  LoaderCircle,
  MapPinned,
  Minus,
  PencilLine,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  Trash2,
  Unlink,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import {
  resolveLoadedActiveGeometry,
  resolveLoadedEditorGeometry,
  sectorGeometryCatalog,
} from "@/src/data/sector-geometry-catalog";
import { coordinateToDisplayPosition } from "@/src/lib/geo-coordinate-conversion";
import {
  buildSectorEditorTemplates,
  buildSubscopeEditorTemplates,
} from "@/src/lib/sector-editor-catalog";
import {
  buildSectorDraftFeatureCollection,
  createDraftFromExistingSector,
  createSectorDraft,
  draftFingerprintRings,
  draftAdditionalHoles,
  draftHoles,
  draftParts,
  findDirtyLinkedTopologyGroups,
  fingerprintDraftParts,
  formatSectorDraftFilename,
  isCompleteSectorDraft,
  normalizeAmapPolygonGeometry,
  parseSectorDraftFeatureCollection,
  parseSectorEditorState,
  SECTOR_EDITOR_STORAGE_KEY,
  serializeSectorEditorState,
  syncUntouchedDraftsToCurrentTemplates,
  type ExistingSectorDraftTemplate,
  type SectorBoundaryDraft,
} from "@/src/lib/sector-editor-drafts";
import { mapZoomDeltaForShortcut } from "@/src/lib/map-keyboard-shortcuts";
import { sectorEditorMapOptions } from "@/src/lib/sector-editor-map-options";
import {
  createEditorHistory,
  recordEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
  type EditorHistory,
} from "@/src/lib/sector-editor-history";
import type {
  SectorEditorPersistedVersion,
  SectorEditorVersionSummary,
} from "@/src/lib/sector-editor-versions";
import {
  applyPairTopologyOperation,
  applySharedEdgeEdit,
  createPairSharedEdgeSession,
  geometryProximityMeters,
  scanClosedGaps,
  type ClosedGapCandidate,
  type EditableSectorGeometry,
  type PairSharedEdgeSession,
} from "@/src/lib/sector-editor-topology";
import styles from "./SectorBoundaryEditor.module.css";

type LoadStatus = "loading" | "ready" | "missing-key" | "error";
type Notice = { tone: "neutral" | "success" | "warning"; message: string };
interface ReferencePolygonEntry {
  polygon: AMap.Polygon;
  signature: string;
  clickHandler: () => void;
}

interface GapPreviewPolygonEntry {
  polygon: AMap.Polygon;
  clickHandler: () => void;
  mouseOverHandler: () => void;
  mouseOutHandler: () => void;
}

interface MouseToolDrawEvent {
  obj: AMap.Polygon;
}

interface ActiveSharedEdgeSession {
  activeDraftId: string;
  neighborDraftId: string;
  neighborName: string;
  topology: PairSharedEdgeSession;
}

interface SectorEditorSnapshot {
  activeId: string | null;
  drafts: SectorBoundaryDraft[];
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
  resolveLoadedEditorGeometry,
  coordinateToDisplayPosition,
  (id) => resolveLoadedActiveGeometry(id, true),
);
const subscopeTemplates = buildSubscopeEditorTemplates(
  sectorGeometryCatalog.subscopes,
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

function linkedTopologyWarning(draft: SectorBoundaryDraft | undefined) {
  if (!draft?.linkedTopologySectorIds?.length) return undefined;
  const linkedNames = draft.linkedTopologySectorIds.map(
    (sectorId) => existingSectorTemplateById.get(sectorId)?.name ?? sectorId,
  );
  return `“${draft.name}”已修改，与“${linkedNames.join("、")}”的共享边或关联拓扑可能失配；导出前请联合更新并复核两块边界。`;
}

function polygonToDraftGeometry(polygon: AMap.Polygon) {
  return normalizeAmapPolygonGeometry(polygon.getPath());
}

function polygonPath(
  draft: Pick<
    SectorBoundaryDraft,
    "ring" | "holes" | "additionalRings" | "additionalHoles"
  >,
) {
  const parts = draftParts(draft);
  const primaryPolygon = [parts[0], ...draftHoles(draft)].filter(Boolean);
  const additionalHoles = draftAdditionalHoles(draft);
  return parts.length > 1
    ? [
      primaryPolygon,
      ...parts.slice(1).map((ring, index) => [
        ring,
        ...(additionalHoles[index] ?? []),
      ]),
    ]
    : primaryPolygon.length > 1 ? primaryPolygon : (primaryPolygon[0] ?? []);
}

function draftPointCount(
  draft: Pick<
    SectorBoundaryDraft,
    "ring" | "holes" | "additionalRings" | "additionalHoles"
  >,
) {
  return draftFingerprintRings(draft)
    .reduce((total, ring) => total + ring.length, 0);
}

function formatArea(area: number) {
  if (!area) return "尚未绘制";
  if (area >= 1_000_000) return `${(area / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(area).toLocaleString("zh-CN")} m²`;
}

function geometryPatch(geometry: EditableSectorGeometry) {
  return {
    ring: geometry.ring,
    holes: geometry.holes ?? [],
    additionalRings: geometry.additionalRings ?? [],
    additionalHoles: geometry.additionalHoles ?? [],
  };
}

export function SectorBoundaryEditor() {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const amapApiRef = useRef<typeof AMap | null>(null);
  const activePolygonRef = useRef<AMap.Polygon | null>(null);
  const polygonEditorRef = useRef<AMap.PolygonEditor | null>(null);
  const mouseToolRef = useRef<AMap.MouseTool | null>(null);
  const referencePolygonsRef = useRef(new Map<string, ReferencePolygonEntry>());
  const gapPreviewPolygonsRef = useRef<GapPreviewPolygonEntry[]>([]);
  const sharedEdgeSessionRef = useRef<ActiveSharedEdgeSession | null>(null);
  const historyRef = useRef<EditorHistory<SectorEditorSnapshot>>(
    createEditorHistory<SectorEditorSnapshot>(50),
  );
  const polygonGestureCapturedRef = useRef(false);
  const formHistoryKeyRef = useRef<string | null>(null);
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
  const [persistentVersions, setPersistentVersions] = useState<SectorEditorVersionSummary[]>([]);
  const [selectedPersistentVersionId, setSelectedPersistentVersionId] = useState("");
  const [persistentVersionLabel, setPersistentVersionLabel] = useState("");
  const [isSavingPersistentVersion, setIsSavingPersistentVersion] = useState(false);
  const [isRestoringPersistentVersion, setIsRestoringPersistentVersion] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isClaimingGap, setIsClaimingGap] = useState(false);
  const [gapPreviewCount, setGapPreviewCount] = useState(0);
  const [hoveredGapArea, setHoveredGapArea] = useState<number | null>(null);
  const [selectedNeighborId, setSelectedNeighborId] = useState("");
  const [sharedEdgeNeighborId, setSharedEdgeNeighborId] = useState<string | null>(null);
  const [historyAvailability, setHistoryAvailability] = useState({
    canRedo: false,
    canUndo: false,
  });
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [area, setArea] = useState(0);
  const [mapZoom, setMapZoom] = useState(10.8);
  const [notice, setNotice] = useState<Notice>({
    tone: "neutral",
    message: "编辑过程自动保存在当前浏览器；点击“保存并更新地图”才会写入项目数据。",
  });

  const activeDraft = useMemo(
    () => drafts.find((draft) => !draft.archived && draft.id === activeId) ?? null,
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
    () => drafts.filter((draft) => !draft.archived && !draft.sourceSectorId),
    [drafts],
  );
  const archivedDrafts = useMemo(
    () => drafts.filter((draft) => draft.archived),
    [drafts],
  );
  const topologyNeighborTemplates = useMemo(() => {
    if (!activeDraft) return [];
    const activeSourceId = activeDraft.sourceSectorId;
    const linkedIds = new Set(activeDraft.linkedTopologySectorIds ?? []);
    return existingSectorTemplates
      .filter((template) => (
        template.id !== activeSourceId
        && template.ring.length >= 3
        && (
          linkedIds.has(template.id)
          || geometryProximityMeters(activeDraft, template) <= 2_000
        )
      ))
      .toSorted((first, second) => {
        const firstLinked = linkedIds.has(first.id) ? 0 : 1;
        const secondLinked = linkedIds.has(second.id) ? 0 : 1;
        return firstLinked - secondLinked
          || first.district.localeCompare(second.district, "zh-CN")
          || first.name.localeCompare(second.name, "zh-CN");
      });
  }, [activeDraft]);
  const effectiveSelectedNeighborId = topologyNeighborTemplates.some(
    (template) => template.id === selectedNeighborId,
  )
    ? selectedNeighborId
    : activeDraft?.linkedTopologySectorIds?.find(
      (sectorId) => topologyNeighborTemplates.some((template) => template.id === sectorId),
    ) ?? topologyNeighborTemplates[0]?.id ?? "";
  const selectedNeighborTemplate = useMemo(
    () => topologyNeighborTemplates.find(
      (template) => template.id === effectiveSelectedNeighborId,
    ) ?? null,
    [effectiveSelectedNeighborId, topologyNeighborTemplates],
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
      .filter((draft) => !draft.archived && draft.id !== activeId)
      .map((draft) => (
        `${draft.id}:${fingerprintDraftParts(draftFingerprintRings(draft))}`
      ))
      .join("|"),
    [activeId, drafts],
  );
  const captureHistory = useCallback((label: string) => {
    const history = recordEditorHistory(
      historyRef.current,
      {
        activeId: activeIdRef.current,
        drafts: structuredClone(draftsRef.current),
      },
      label,
    );
    historyRef.current = history;
    setHistoryAvailability({
      canRedo: history.future.length > 0,
      canUndo: history.past.length > 0,
    });
  }, []);
  const beginFormHistory = useCallback((
    draft: SectorBoundaryDraft,
    field: string,
    label: string,
  ) => {
    const key = `${draft.id}:${field}`;
    if (formHistoryKeyRef.current === key) return;
    captureHistory(`${label}“${draft.name}”`);
    formHistoryKeyRef.current = key;
  }, [captureHistory]);
  const endFormHistory = useCallback(() => {
    formHistoryKeyRef.current = null;
  }, []);

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
    const {
      ring,
      holes,
      additionalRings,
      additionalHoles,
    } = polygonToDraftGeometry(polygon);
    if (!ring || ring.length < 3) return;
    const editedGeometry = { ring, holes, additionalRings, additionalHoles };
    const sharedSession = sharedEdgeSessionRef.current;
    if (sharedSession?.activeDraftId === id) {
      try {
        const result = applySharedEdgeEdit({
          session: sharedSession.topology,
          editedTarget: editedGeometry,
        });
        if (!polygonGestureCapturedRef.current) {
          captureHistory(`联动调整“${draftsRef.current.find((draft) => draft.id === id)?.name ?? "板块"}”与“${sharedSession.neighborName}”`);
          polygonGestureCapturedRef.current = true;
        }
        const timestamp = new Date().toISOString();
        setDrafts((current) => current.map((draft) => {
          if (draft.id === id) {
            return {
              ...draft,
              ...geometryPatch(result.target),
              linkedTopologySectorIds: Array.from(new Set([
                ...(draft.linkedTopologySectorIds ?? []),
                sharedSession.neighborDraftId,
              ])),
              updatedAt: timestamp,
            };
          }
          if (draft.id === sharedSession.neighborDraftId && result.neighbor) {
            return {
              ...draft,
              ...geometryPatch(result.neighbor),
              linkedTopologySectorIds: Array.from(new Set([
                ...(draft.linkedTopologySectorIds ?? []),
                id,
              ])),
              updatedAt: timestamp,
            };
          }
          return draft;
        }));
        setArea(result.areaSquareMeters);
        setNotice({
          tone: "success",
          message: `已同步更新“${sharedSession.neighborName}”；两块共享同一条新边。`,
        });
        return;
      } catch (error) {
        setNotice({
          tone: "warning",
          message: error instanceof Error ? error.message : "共享边联动失败",
        });
        return;
      }
    }
    if (!polygonGestureCapturedRef.current) {
      captureHistory(`调整“${draftsRef.current.find((draft) => draft.id === id)?.name ?? "板块"}”边界`);
      polygonGestureCapturedRef.current = true;
    }
    updateDraft(id, editedGeometry);
    setArea(polygon.getArea());
    const warning = linkedTopologyWarning(
      draftsRef.current.find((draft) => draft.id === id),
    );
    if (warning) setNotice({ tone: "warning", message: warning });
  }, [captureHistory, updateDraft]);

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
    captureHistory(`载入“${template.name}”编辑副本`);
    setDrafts((current) => [...current, draft]);
    setActiveId(draft.id);
    setIsDrawing(false);
    setNotice({
      tone: "success",
      message: template.geometryStatus === "missing"
        ? `已载入“${template.name}”；该板块尚无边界，请点击“开始画边界”。`
        : `已载入“${template.name}”的可编辑副本；拖动橙色节点或重画边界即可修改。`,
    });
  }, [captureHistory]);
  const handleSidebarSectorClick = useCallback((
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    const templateId = event.currentTarget.dataset.templateId;
    if (templateId) {
      const template = existingSectorTemplateById.get(templateId);
      if (template) activateExistingSector(template);
      return;
    }
    const draftId = event.currentTarget.dataset.draftId;
    if (!draftId) return;
    setActiveId(draftId);
    setIsDrawing(false);
  }, [activateExistingSector]);

  useEffect(() => {
    const map = mapRef.current;
    const api = amapApiRef.current;
    if (status !== "ready" || !map || !api || !isClaimingGap) return;
    map.setDefaultCursor("crosshair");

    const clearGapPreviews = () => {
      const entries = gapPreviewPolygonsRef.current;
      entries.forEach((entry) => {
        entry.polygon.off("click", entry.clickHandler);
        entry.polygon.off("mouseover", entry.mouseOverHandler);
        entry.polygon.off("mouseout", entry.mouseOutHandler);
      });
      if (entries.length) map.remove(entries.map((entry) => entry.polygon));
      gapPreviewPolygonsRef.current = [];
    };

    const claimGap = (candidate: ClosedGapCandidate) => {
      const target = draftsRef.current.find(
        (draft) => !draft.archived && draft.id === activeIdRef.current,
      );
      if (!target) return;
      const areaText = formatArea(candidate.areaSquareMeters);
      if (draftParts(target).length && !window.confirm(
        `“${target.name}”已有边界。确定用选中的 ${areaText} 闭合空白替换它吗？`,
      )) return;
      captureHistory(`认领“${target.name}”闭合空白`);
      updateDraft(target.id, geometryPatch(candidate.geometry));
      setGeometryRevision((value) => value + 1);
      setIsClaimingGap(false);
      setNotice({
        tone: "success",
        message: `已把 ${areaText} 的闭合空白认领为“${target.name}”；相邻板块坐标保持不变。`,
      });
    };

    const renderGapPreviews = () => {
      clearGapPreviews();
      setHoveredGapArea(null);
      const target = draftsRef.current.find(
        (draft) => !draft.archived && draft.id === activeIdRef.current,
      );
      const bounds = map.getBounds();
      if (!target || !bounds) {
        setGapPreviewCount(0);
        return;
      }
      const southWest = bounds.getSouthWest();
      const northEast = bounds.getNorthEast();
      const loadedSourceIds = new Set(
        draftsRef.current
          .map((draft) => draft.sourceSectorId)
          .filter((id): id is string => Boolean(id)),
      );
      const occupied = [
        ...draftsRef.current.filter((draft) => (
          !draft.archived
          && draftParts(draft).length > 0
        )),
        ...existingSectorTemplates.filter((template) => (
          !loadedSourceIds.has(template.id)
          && template.ring.length >= 3
        )),
      ];
      try {
        const scan = scanClosedGaps({
          viewport: {
            west: southWest.getLng(),
            south: southWest.getLat(),
            east: northEast.getLng(),
            north: northEast.getLat(),
          },
          occupied,
        });
        const candidates = scan.candidates;
        setGapPreviewCount(candidates.length);
        const entries = candidates.map((candidate): GapPreviewPolygonEntry => {
          const polygon = new api.Polygon();
          polygon.setOptions({
            path: polygonPath(candidate.geometry),
            strokeColor: "#7c3aed",
            strokeWeight: 2,
            strokeOpacity: 0.95,
            strokeStyle: "dashed",
            fillColor: "#8b5cf6",
            fillOpacity: 0.18,
            cursor: "pointer",
            bubble: false,
            zIndex: 52,
          });
          const clickHandler = () => claimGap(candidate);
          const mouseOverHandler = () => {
            polygon.setOptions({
              strokeColor: "#db2777",
              strokeWeight: 4,
              strokeOpacity: 1,
              fillColor: "#f472b6",
              fillOpacity: 0.4,
              zIndex: 68,
            });
            setHoveredGapArea(candidate.areaSquareMeters);
          };
          const mouseOutHandler = () => {
            polygon.setOptions({
              strokeColor: "#7c3aed",
              strokeWeight: 2,
              strokeOpacity: 0.95,
              fillColor: "#8b5cf6",
              fillOpacity: 0.18,
              zIndex: 52,
            });
            setHoveredGapArea(null);
          };
          polygon.on("click", clickHandler);
          polygon.on("mouseover", mouseOverHandler);
          polygon.on("mouseout", mouseOutHandler);
          return { polygon, clickHandler, mouseOverHandler, mouseOutHandler };
        });
        gapPreviewPolygonsRef.current = entries;
        if (entries.length) map.add(entries.map((entry) => entry.polygon));
        setNotice({
          tone: candidates.length ? "neutral" : "warning",
          message: scan.skippedGeometryCount
            ? `已标出 ${candidates.length} 个闭合空白；另有 ${scan.skippedGeometryCount} 个异常边界已隔离，其相交区域不会提供认领。`
            : candidates.length
              ? `已标出当前视野内 ${candidates.length} 个闭合空白；悬停高亮，点击即可认领。`
              : "当前视野没有可认领的闭合空白；可缩小地图或移动视野后重试。",
        });
      } catch (error) {
        setGapPreviewCount(0);
        setNotice({
          tone: "warning",
          message: error instanceof Error ? error.message : "无法识别当前视野内的闭合空白",
        });
      }
    };

    renderGapPreviews();
    map.on("moveend", renderGapPreviews);
    return () => {
      map.off("moveend", renderGapPreviews);
      clearGapPreviews();
      map.setDefaultCursor("default");
      setGapPreviewCount(0);
      setHoveredGapArea(null);
    };
  }, [
    activeId,
    captureHistory,
    geometryRevision,
    inactiveGeometrySignature,
    isClaimingGap,
    status,
    updateDraft,
  ]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(SECTOR_EDITOR_STORAGE_KEY);
        if (stored) {
          const restored = parseSectorEditorState(stored);
          const synced = syncUntouchedDraftsToCurrentTemplates(restored, existingSectorTemplates);
          setDrafts(synced.drafts);
          setActiveId(synced.drafts.find((draft) => !draft.archived)?.id ?? null);
          if (synced.archivedDraftIds.length) {
            setNotice({
              tone: "warning",
              message: `已按当前板块口径归档 ${synced.archivedDraftIds.length} 个已下线或已拆分的旧草稿；需要时可从侧栏恢复只读备份。`,
            });
          } else if (synced.preservedModifiedSourceIds.length) {
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
    polygonGestureCapturedRef.current = false;
    if (activePolygonRef.current) map.remove(activePolygonRef.current);
    activePolygonRef.current = null;
    queueMicrotask(() => setArea(0));

    const draft = draftsRef.current.find(
      (item) => !item.archived && item.id === activeIdRef.current,
    );
    if (!draft || draftParts(draft).length === 0) return;

    const polygon = new api.Polygon();
    polygon.setOptions({
      path: polygonPath(draft),
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
    const finish = () => {
      sync();
      polygonGestureCapturedRef.current = false;
      if (sharedEdgeSessionRef.current?.activeDraftId === draft.id) {
        setGeometryRevision((value) => value + 1);
      }
    };
    editor.on("addnode", sync);
    editor.on("adjust", sync);
    editor.on("removenode", sync);
    editor.on("end", finish);
    editor.open();
    polygonEditorRef.current = editor;

    return () => {
      editor.off("addnode", sync);
      editor.off("adjust", sync);
      editor.off("removenode", sync);
      editor.off("end", finish);
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
    const desiredReferences = new Map<string, {
      signature: string;
      path: AMap.PolygonOptions["path"];
      kind: "editable" | "source";
      clickHandler: () => void;
    }>();

    draftsRef.current
      .filter(
        (draft) => !draft.archived
          && draft.id !== activeId
          && draftParts(draft).length > 0,
      )
      .forEach((draft) => {
        desiredReferences.set(`draft:${draft.id}`, {
          signature: fingerprintDraftParts(draftFingerprintRings(draft)),
          path: polygonPath(draft),
          kind: "editable",
          clickHandler: () => {
            setActiveId(draft.id);
            setIsDrawing(false);
          },
        });
      });
    const editableSourceIds = new Set(
      draftsRef.current
        .map((draft) => draft.sourceSectorId)
        .filter((id): id is string => Boolean(id)),
    );
    existingSectorTemplates
      .filter((template) => (
        template.ring.length >= 3 && !editableSourceIds.has(template.id)
      ))
      .forEach((template) => {
        desiredReferences.set(`source:${template.id}`, {
          signature: template.geometryFingerprint,
          path: polygonPath(template),
          kind: "source",
          clickHandler: () => activateExistingSector(template),
        });
      });

    for (const [id, entry] of referencePolygonsRef.current) {
      const desired = desiredReferences.get(id);
      if (desired?.signature === entry.signature) continue;
      entry.polygon.off("click", entry.clickHandler);
      map.remove(entry.polygon);
      referencePolygonsRef.current.delete(id);
    }

    for (const [id, desired] of desiredReferences) {
      if (referencePolygonsRef.current.has(id)) continue;
      const polygon = new api.Polygon();
      polygon.setOptions(desired.kind === "editable" ? {
          path: desired.path,
          strokeColor: "#0f766e",
          strokeWeight: 1.4,
          strokeOpacity: 0.74,
          strokeStyle: "dashed",
          fillColor: "#2dd4bf",
          fillOpacity: 0.07,
          cursor: "pointer",
          zIndex: 30,
        } : {
          path: desired.path,
          strokeColor: "#64748b",
          strokeWeight: 1.4,
          strokeOpacity: 0.72,
          strokeStyle: "dashed",
          fillColor: "#94a3b8",
          fillOpacity: 0.045,
          cursor: "pointer",
          zIndex: 24,
        });
      polygon.on("click", desired.clickHandler);
      map.add(polygon);
      referencePolygonsRef.current.set(id, {
        polygon,
        signature: desired.signature,
        clickHandler: desired.clickHandler,
      });
    }
  }, [activateExistingSector, activeId, inactiveGeometrySignature, status]);

  useEffect(() => {
    const editor = polygonEditorRef.current;
    if (!editor) return;
    editor.clearAdsorbPolygons();
    if (!sharedEdgeNeighborId) return;
    const entry = referencePolygonsRef.current.get(`draft:${sharedEdgeNeighborId}`)
      ?? referencePolygonsRef.current.get(`source:${sharedEdgeNeighborId}`);
    if (entry) editor.setAdsorbPolygons(entry.polygon);
  }, [activeId, inactiveGeometrySignature, sharedEdgeNeighborId, status]);

  useEffect(() => () => {
    const map = mapRef.current;
    for (const entry of referencePolygonsRef.current.values()) {
      entry.polygon.off("click", entry.clickHandler);
      map?.remove(entry.polygon);
    }
    referencePolygonsRef.current.clear();
  }, []);

  const addDraft = useCallback(() => {
    const draft = createSectorDraft(createDraftId());
    captureHistory("新建板块草稿");
    setDrafts((current) => [draft, ...current]);
    setActiveId(draft.id);
    setIsDrawing(false);
    setNotice({ tone: "neutral", message: "已新建草稿。填写名称后，点击地图上的“开始画边界”。" });
  }, [captureHistory]);

  const removeActiveDraft = useCallback(() => {
    const draft = draftsRef.current.find((item) => item.id === activeIdRef.current);
    if (!draft) return;
    const isExistingSectorCopy = Boolean(draft.sourceSectorId);
    const prompt = isExistingSectorCopy
      ? `确定放弃“${draft.name}”的本机修改并恢复为原始边界吗？已导出的备份不受影响。`
      : `确定删除“${draft.name}”的本机草稿吗？此操作不会删除已经导出的备份。`;
    if (!window.confirm(prompt)) return;
    const remaining = draftsRef.current.filter((item) => item.id !== draft.id);
    captureHistory(isExistingSectorCopy ? `放弃“${draft.name}”修改` : `删除“${draft.name}”草稿`);
    setDrafts(remaining);
    setActiveId(remaining[0]?.id ?? null);
    setGeometryRevision((value) => value + 1);
    setNotice({
      tone: "neutral",
      message: isExistingSectorCopy
        ? "已放弃本机修改；原始板块仍在列表和地图中，可随时重新载入。"
        : "已删除本机草稿；已导出的 GeoJSON 不受影响。",
    });
  }, [captureHistory]);

  const stopSharedEdgeEditing = useCallback((message?: string) => {
    sharedEdgeSessionRef.current = null;
    setSharedEdgeNeighborId(null);
    polygonEditorRef.current?.clearAdsorbPolygons();
    if (message) setNotice({ tone: "neutral", message });
  }, []);

  const refreshPersistentVersions = useCallback(async () => {
    const response = await fetch("/api/sector-editor-versions", {
      cache: "no-store",
    });
    const payload = await response.json() as {
      message?: string;
      versions?: SectorEditorVersionSummary[];
    };
    if (!response.ok || !payload.versions) {
      throw new Error(payload.message || "无法读取持久版本");
    }
    setPersistentVersions(payload.versions);
    setSelectedPersistentVersionId((current) => (
      current && payload.versions?.some((version) => version.id === current)
        ? current
        : (payload.versions?.[0]?.id ?? "")
    ));
  }, []);

  const savePersistentVersion = useCallback(async () => {
    if (isSavingPersistentVersion) return;
    setIsSavingPersistentVersion(true);
    try {
      const response = await fetch("/api/sector-editor-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: persistentVersionLabel,
          activeId: activeIdRef.current,
          drafts: draftsRef.current,
        }),
      });
      const payload = await response.json() as {
        message?: string;
        version?: SectorEditorVersionSummary;
        publishedDraftCount?: number;
        skippedUnregisteredDraftIds?: string[];
      };
      if (!response.ok || !payload.version) {
        throw new Error(payload.message || "保存持久版本失败");
      }
      setPersistentVersionLabel("");
      await refreshPersistentVersions();
      setSelectedPersistentVersionId(payload.version.id);
      const skippedCount = payload.skippedUnregisteredDraftIds?.length ?? 0;
      setNotice({
        tone: skippedCount ? "warning" : "success",
        message: skippedCount
          ? `已保存项目版本 v${payload.version.versionNumber}，并更新 ${payload.publishedDraftCount ?? 0} 个已登记板块；另有 ${skippedCount} 个未登记自建草稿只进入版本历史，未发布到地图。`
          : `已保存项目版本 v${payload.version.versionNumber}，并更新 ${payload.publishedDraftCount ?? 0} 个已登记板块的主页地图数据。`,
      });
    } catch (error) {
      setNotice({
        tone: "warning",
        message: error instanceof Error ? error.message : "保存持久版本失败",
      });
    } finally {
      setIsSavingPersistentVersion(false);
    }
  }, [
    isSavingPersistentVersion,
    persistentVersionLabel,
    refreshPersistentVersions,
  ]);

  const restorePersistentVersion = useCallback(async () => {
    if (!selectedPersistentVersionId || isRestoringPersistentVersion) return;
    setIsRestoringPersistentVersion(true);
    try {
      const response = await fetch(
        `/api/sector-editor-versions?id=${encodeURIComponent(selectedPersistentVersionId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as {
        message?: string;
        version?: SectorEditorPersistedVersion;
      };
      if (!response.ok || !payload.version) {
        throw new Error(payload.message || "恢复持久版本失败");
      }
      const restoredDrafts = parseSectorEditorState(JSON.stringify({
        schemaVersion: 1,
        drafts: payload.version.drafts,
      }));
      captureHistory(`恢复持久版本 v${payload.version.versionNumber}`);
      stopSharedEdgeEditing();
      setIsClaimingGap(false);
      setIsDrawing(false);
      setDrafts(restoredDrafts);
      setActiveId(
        restoredDrafts.some((draft) => draft.id === payload.version?.activeId)
          ? (payload.version.activeId ?? null)
          : (restoredDrafts.find((draft) => !draft.archived)?.id ?? null),
      );
      setGeometryRevision((value) => value + 1);
      setNotice({
        tone: "success",
        message: `已恢复 v${payload.version.versionNumber}“${payload.version.label}”；本次恢复也可以撤回。`,
      });
    } catch (error) {
      setNotice({
        tone: "warning",
        message: error instanceof Error ? error.message : "恢复持久版本失败",
      });
    } finally {
      setIsRestoringPersistentVersion(false);
    }
  }, [
    captureHistory,
    isRestoringPersistentVersion,
    selectedPersistentVersionId,
    stopSharedEdgeEditing,
  ]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshPersistentVersions().catch((error: unknown) => {
        setNotice({
          tone: "warning",
          message: error instanceof Error ? error.message : "无法读取持久版本",
        });
      });
    });
  }, [refreshPersistentVersions]);

  const restoreHistorySnapshot = useCallback((
    snapshot: SectorEditorSnapshot,
    message: string,
  ) => {
    sharedEdgeSessionRef.current = null;
    polygonGestureCapturedRef.current = false;
    formHistoryKeyRef.current = null;
    polygonEditorRef.current?.clearAdsorbPolygons();
    mouseToolRef.current?.close(false);
    setSharedEdgeNeighborId(null);
    setIsClaimingGap(false);
    setIsDrawing(false);
    setDrafts(structuredClone(snapshot.drafts));
    setActiveId(snapshot.activeId);
    setGeometryRevision((value) => value + 1);
    setNotice({ tone: "success", message });
  }, []);

  const undoLastChange = useCallback(() => {
    const transition = undoEditorHistory(
      historyRef.current,
      {
        activeId: activeIdRef.current,
        drafts: structuredClone(draftsRef.current),
      },
    );
    if (!transition) return;
    historyRef.current = transition.history;
    setHistoryAvailability({
      canRedo: transition.history.future.length > 0,
      canUndo: transition.history.past.length > 0,
    });
    restoreHistorySnapshot(transition.snapshot, `已撤回：${transition.label}`);
  }, [restoreHistorySnapshot]);

  const redoLastChange = useCallback(() => {
    const transition = redoEditorHistory(
      historyRef.current,
      {
        activeId: activeIdRef.current,
        drafts: structuredClone(draftsRef.current),
      },
    );
    if (!transition) return;
    historyRef.current = transition.history;
    setHistoryAvailability({
      canRedo: transition.history.future.length > 0,
      canUndo: transition.history.past.length > 0,
    });
    restoreHistorySnapshot(transition.snapshot, `已重做：${transition.label}`);
  }, [restoreHistorySnapshot]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (
        event.isComposing
        || event.altKey
        || (!event.metaKey && !event.ctrlKey)
        || event.key.toLowerCase() !== "z"
        || event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLSelectElement
      ) return;
      event.preventDefault();
      if (event.shiftKey) redoLastChange();
      else undoLastChange();
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [redoLastChange, undoLastChange]);

  const applySelectedPairOperation = useCallback((
    operation: "target-wins" | "neighbor-wins",
  ) => {
    const target = draftsRef.current.find(
      (draft) => !draft.archived && draft.id === activeIdRef.current,
    );
    const neighborTemplate = existingSectorTemplates.find(
      (template) => template.id === effectiveSelectedNeighborId,
    );
    if (!target || !neighborTemplate) {
      setNotice({ tone: "warning", message: "请先选择当前板块和一个相邻板块。" });
      return;
    }
    const neighbor = draftsRef.current.find(
      (draft) => !draft.archived && draft.sourceSectorId === neighborTemplate.id,
    ) ?? createDraftFromExistingSector(neighborTemplate);
    const prompt = operation === "target-wins"
      ? `确定让“${target.name}”保留重叠区域，并从“${neighbor.name}”中扣除吗？两块草稿会一起保存。`
      : `确定保护“${neighbor.name}”，并从“${target.name}”中扣除重叠区域吗？`;
    if (!window.confirm(prompt)) return;
    try {
      const result = applyPairTopologyOperation({
        target,
        neighbor,
        operation,
      });
      captureHistory(operation === "target-wins"
        ? `“${target.name}”从“${neighbor.name}”划入重叠区域`
        : `保护“${neighbor.name}”并修剪“${target.name}”`);
      const timestamp = new Date().toISOString();
      const neighborExists = draftsRef.current.some((draft) => draft.id === neighbor.id);
      setDrafts((current) => {
        const base = neighborExists ? current : [...current, neighbor];
        return base.map((draft) => {
          if (draft.id === target.id) {
            return {
              ...draft,
              ...geometryPatch(result.target),
              linkedTopologySectorIds: Array.from(new Set([
                ...(draft.linkedTopologySectorIds ?? []),
                neighborTemplate.id,
              ])),
              updatedAt: timestamp,
            };
          }
          if (draft.id === neighbor.id && result.neighbor) {
            return {
              ...draft,
              ...geometryPatch(result.neighbor),
              linkedTopologySectorIds: Array.from(new Set([
                ...(draft.linkedTopologySectorIds ?? []),
                target.sourceSectorId ?? target.id,
              ])),
              updatedAt: timestamp,
            };
          }
          return draft;
        });
      });
      stopSharedEdgeEditing();
      setGeometryRevision((value) => value + 1);
      setNotice({
        tone: "success",
        message: operation === "target-wins"
          ? `已从“${neighbor.name}”扣除与“${target.name}”的重叠区域。`
          : `已保护“${neighbor.name}”，并修剪“${target.name}”。`,
      });
    } catch (error) {
      setNotice({
        tone: "warning",
        message: error instanceof Error ? error.message : "成对拓扑操作失败",
      });
    }
  }, [captureHistory, effectiveSelectedNeighborId, stopSharedEdgeEditing]);

  const toggleSharedEdgeEditing = useCallback(() => {
    if (sharedEdgeSessionRef.current) {
      stopSharedEdgeEditing("已关闭共享边联动；当前两块草稿保留。");
      return;
    }
    const target = draftsRef.current.find(
      (draft) => !draft.archived && draft.id === activeIdRef.current,
    );
    const neighborTemplate = existingSectorTemplates.find(
      (template) => template.id === effectiveSelectedNeighborId,
    );
    if (!target || !neighborTemplate) {
      setNotice({ tone: "warning", message: "请先选择当前板块和一个相邻板块。" });
      return;
    }
    const neighbor = draftsRef.current.find(
      (draft) => !draft.archived && draft.sourceSectorId === neighborTemplate.id,
    ) ?? createDraftFromExistingSector(neighborTemplate);
    try {
      const topology = createPairSharedEdgeSession({ target, neighbor });
      if (!draftsRef.current.some((draft) => draft.id === neighbor.id)) {
        captureHistory(`载入“${neighbor.name}”联动副本`);
        setDrafts((current) => [...current, neighbor]);
      }
      sharedEdgeSessionRef.current = {
        activeDraftId: target.id,
        neighborDraftId: neighbor.id,
        neighborName: neighbor.name,
        topology,
      };
      setSharedEdgeNeighborId(neighbor.id);
      setNotice({
        tone: "success",
        message: `已开启与“${neighbor.name}”的共享边联动；拖动橙色节点后，邻块会同步取联合范围的剩余部分。`,
      });
    } catch (error) {
      setNotice({
        tone: "warning",
        message: error instanceof Error ? error.message : "无法开启共享边联动",
      });
    }
  }, [captureHistory, effectiveSelectedNeighborId, stopSharedEdgeEditing]);

  useEffect(() => {
    const session = sharedEdgeSessionRef.current;
    if (!session || session.activeDraftId === activeId) return;
    sharedEdgeSessionRef.current = null;
    polygonEditorRef.current?.clearAdsorbPolygons();
    queueMicrotask(() => setSharedEdgeNeighborId(null));
  }, [activeId]);

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
      const { ring } = polygonToDraftGeometry(event.obj);
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
      captureHistory(`重画“${draftsRef.current.find((draft) => draft.id === id)?.name ?? "板块"}”边界`);
      updateDraft(id, {
        ring,
        holes: [],
        additionalRings: [],
        additionalHoles: [],
      });
      setGeometryRevision((value) => value + 1);
      const warning = linkedTopologyWarning(
        draftsRef.current.find((draft) => draft.id === id),
      );
      setNotice(warning
        ? { tone: "warning", message: warning }
        : { tone: "success", message: "边界已自动保存。拖动橙色圆点可继续精修。" });
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
  }, [captureHistory, updateDraft]);

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
    const dirtyTopologyGroups = findDirtyLinkedTopologyGroups(draftsRef.current);
    if (dirtyTopologyGroups.length) {
      const pairNames = dirtyTopologyGroups.map(({ sectorIds }) => (
        sectorIds.map(
          (sectorId) => existingSectorTemplateById.get(sectorId)?.name ?? sectorId,
        ).join(" / ")
      ));
      if (!window.confirm(
        `${pairNames.join("；")} 至少一方已修改，共享边或关联拓扑可能失配。请确认已联合更新并复核成对边界；仍继续导出？`,
      )) {
        setNotice({
          tone: "warning",
          message: "已取消导出；请联合更新成对板块后再导出。",
        });
        return;
      }
    }
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
    const referenceOnlyCount = draftsRef.current.filter(
      (draft) => !draft.archived && draft.referenceOnly,
    ).length;
    const skipped = draftsRef.current.filter(
      (draft) => !draft.archived && !draft.referenceOnly,
    ).length - collection.features.length;
    const exclusions = [
      skipped ? `${skipped} 个未完成草稿未导出` : "",
      referenceOnlyCount ? `${referenceOnlyCount} 个旧合并参考备份按规则未导出` : "",
    ].filter(Boolean);
    setNotice({
      tone: "success",
      message: exclusions.length
        ? `已导出 ${collection.features.length} 个完整板块；${exclusions.join("；")}。`
        : `已导出全部 ${collection.features.length} 个板块草稿。`,
    });
  }, []);

  const restoreArchivedDrafts = useCallback(() => {
    const archived = draftsRef.current.filter((draft) => draft.archived);
    if (!archived.length) return;
    const restoredIds = new Set(archived.map((draft) => draft.id));
    captureHistory(`恢复 ${archived.length} 个历史草稿`);
    setDrafts((current) => current.map((draft) => (
      restoredIds.has(draft.id)
        ? { ...draft, archived: false, referenceOnly: true }
        : draft
    )));
    setActiveId(archived[0].id);
    setGeometryRevision((value) => value + 1);
    setNotice({
      tone: "warning",
      message: `已恢复 ${archived.length} 个历史草稿为自建只读备份；它们仅用于人工参考，不会恢复已下线或旧合并板块身份。`,
    });
  }, [captureHistory]);

  const importDrafts = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseSectorDraftFeatureCollection(JSON.parse(await file.text()));
      if (!imported.length) throw new Error("文件中没有板块");
      if (draftsRef.current.length && !window.confirm(
        `导入会用文件中的 ${imported.length} 个板块替换当前浏览器里的 ${draftsRef.current.length} 个草稿，是否继续？`,
      )) return;
      captureHistory(`导入 ${imported.length} 个板块草稿`);
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
  }, [captureHistory]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Link href="/" className={styles.backLink}>
            <ChevronLeft size={16} />
            返回楼盘地图
          </Link>
          <div>
            <span className={styles.eyebrow}>GCJ-02 · LOCAL BOUNDARY WORKBENCH</span>
            <h1>板块边界编辑器</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.autoSave}>
            <Check size={14} />
            本机自动保存
          </span>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={undoLastChange}
            disabled={!historyAvailability.canUndo}
            title="撤回上一步（Command/Control + Z）"
          >
            <Undo2 size={15} />
            撤回
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={redoLastChange}
            disabled={!historyAvailability.canRedo}
            title="重做（Command/Control + Shift + Z）"
          >
            <Redo2 size={15} />
            重做
          </button>
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
          {archivedDrafts.length ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={restoreArchivedDrafts}
            >
              恢复 {archivedDrafts.length} 个旧合并草稿备份
            </button>
          ) : null}

          <div className={styles.versionPanel}>
            <div className={styles.versionHeading}>
              <History size={15} />
              <div>
                <strong>持久版本</strong>
                <span>保存会写入项目文件，并更新主页地图的当前生效边界</span>
              </div>
            </div>
            <div className={styles.versionSaveRow}>
              <input
                value={persistentVersionLabel}
                onChange={(event) => setPersistentVersionLabel(event.target.value)}
                placeholder={`版本说明（默认：版本 ${persistentVersions[0]?.versionNumber
                  ? persistentVersions[0].versionNumber + 1
                  : 1}）`}
                maxLength={80}
              />
              <button
                type="button"
                onClick={() => void savePersistentVersion()}
                disabled={!hydrated || isSavingPersistentVersion}
              >
                <Save size={14} />
                {isSavingPersistentVersion ? "保存中" : "保存并更新地图"}
              </button>
            </div>
            <div className={styles.versionRestoreRow}>
              <select
                value={selectedPersistentVersionId}
                onChange={(event) => setSelectedPersistentVersionId(event.target.value)}
                disabled={!persistentVersions.length}
                aria-label="选择持久版本"
              >
                {!persistentVersions.length ? (
                  <option value="">还没有持久版本</option>
                ) : persistentVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    v{version.versionNumber} · {version.label} · {" "}
                    {new Date(version.createdAt).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void restorePersistentVersion()}
                disabled={!selectedPersistentVersionId || isRestoringPersistentVersion}
                title="恢复选中版本；恢复操作本身可以撤回"
              >
                <RotateCcw size={14} />
                {isRestoringPersistentVersion ? "恢复中" : "恢复"}
              </button>
            </div>
            <span className={styles.versionHint}>
              恢复只会载入编辑器；再次点击保存后才会更新项目地图。
            </span>
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
                  data-template-id={template?.id}
                  data-draft-id={draft?.id}
                  onClick={handleSidebarSectorClick}
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
                          ? ` · ${draft && draftPointCount(draft) ? `${draftPointCount(draft)} 个边界点` : "待绘制"}`
                          : ` · ${draft ? "编辑副本" : "点击编辑"}`
                        : draft?.referenceOnly
                          ? " · 旧合并草稿参考（不导出）"
                          : isComplete && draft
                            ? ` · ${draftPointCount(draft)} 个边界点`
                            : " · 待完善"}
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
                  <strong>
                    {draftPointCount(activeDraft)} 个点
                    {draftParts(activeDraft).length > 1 ? ` · ${draftParts(activeDraft).length} 个分片` : ""}
                    {" · "}{formatArea(area)}
                  </strong>
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
                  onBlur={endFormHistory}
                  onChange={(event) => {
                    beginFormHistory(activeDraft, "name", "修改名称：");
                    updateDraft(activeDraft.id, { name: event.target.value });
                  }}
                  placeholder="例如：前滩"
                />
              </label>
              <label>
                <span>所在行政区</span>
                <input
                  value={activeDraft.district}
                  onBlur={endFormHistory}
                  onChange={(event) => {
                    beginFormHistory(activeDraft, "district", "修改行政区：");
                    updateDraft(activeDraft.id, { district: event.target.value });
                  }}
                  placeholder="例如：浦东新区"
                />
              </label>
              <label>
                <span>边界依据</span>
                <textarea
                  value={activeDraft.boundaryBasis}
                  onBlur={endFormHistory}
                  onChange={(event) => {
                    beginFormHistory(activeDraft, "boundaryBasis", "修改边界依据：");
                    updateDraft(activeDraft.id, { boundaryBasis: event.target.value });
                  }}
                  placeholder="例如：北至××路，东至××河…"
                  rows={3}
                />
              </label>
              <label>
                <span>核对备注</span>
                <textarea
                  value={activeDraft.note}
                  onBlur={endFormHistory}
                  onChange={(event) => {
                    beginFormHistory(activeDraft, "note", "修改核对备注：");
                    updateDraft(activeDraft.id, { note: event.target.value });
                  }}
                  placeholder="记录待查的路口、与相邻板块的争议点"
                  rows={2}
                />
              </label>
              <div className={styles.coordinateNote}>
                <MapPinned size={14} />
                <span>绘制坐标：GCJ‑02（高德）。这是市场板块草稿，不是行政区或官方规划边界。</span>
              </div>
              <div className={styles.topologyPanel}>
                <div className={styles.topologyHeading}>
                  <GitMerge size={15} />
                  <div>
                    <strong>拓扑修复</strong>
                    <span>所有成对修改会同时保存，可从本机草稿中恢复。</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={isClaimingGap ? styles.topologyButtonActive : styles.topologyButton}
                  onClick={() => {
                    stopSharedEdgeEditing();
                    setIsClaimingGap((current) => {
                      const next = !current;
                      setNotice({
                        tone: "neutral",
                        message: next
                          ? "正在识别当前视野内的闭合空白；稍后可悬停预览并点击认领。"
                          : "已取消认领闭合空白。",
                      });
                      return next;
                    });
                  }}
                >
                  <ScanSearch size={15} />
                  {isClaimingGap ? "取消认领空白" : "识别并认领闭合空白"}
                </button>
                <label>
                  <span>成对处理的邻块</span>
                  <select
                    value={effectiveSelectedNeighborId}
                    onChange={(event) => {
                      stopSharedEdgeEditing();
                      setSelectedNeighborId(event.target.value);
                    }}
                  >
                    {topologyNeighborTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {activeDraft.linkedTopologySectorIds?.includes(template.id) ? "关联 · " : ""}
                        {template.district} · {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.topologyPairActions}>
                  <button
                    type="button"
                    onClick={() => applySelectedPairOperation("target-wins")}
                    disabled={!selectedNeighborTemplate || draftParts(activeDraft).length === 0}
                  >
                    当前板块优先
                    <small>从邻块扣除重叠</small>
                  </button>
                  <button
                    type="button"
                    onClick={() => applySelectedPairOperation("neighbor-wins")}
                    disabled={!selectedNeighborTemplate || draftParts(activeDraft).length === 0}
                  >
                    保护所选邻块
                    <small>修剪当前板块</small>
                  </button>
                </div>
                <button
                  type="button"
                  className={sharedEdgeNeighborId ? styles.sharedEdgeButtonActive : styles.sharedEdgeButton}
                  onClick={toggleSharedEdgeEditing}
                  disabled={!selectedNeighborTemplate || draftParts(activeDraft).length === 0}
                >
                  {sharedEdgeNeighborId ? <Unlink size={15} /> : <Link2 size={15} />}
                  {sharedEdgeNeighborId
                    ? `关闭与“${selectedNeighborTemplate?.name ?? "邻块"}”的联动`
                    : "开启共享边联动拖动"}
                </button>
                <p>
                  联动模式固定两块原有联合范围：当前板块拖入的区域会从邻块扣除，拖出的区域自动归还邻块。
                </p>
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
                  {isClaimingGap ? (
                    <button
                      type="button"
                      className={styles.stopButton}
                      onClick={() => {
                        setIsClaimingGap(false);
                        setNotice({ tone: "neutral", message: "已取消认领闭合空白。" });
                      }}
                    >
                      取消认领空白
                    </button>
                  ) : isDrawing ? (
                    <button type="button" className={styles.stopButton} onClick={stopDrawing}>
                      取消本次绘制
                    </button>
                  ) : (
                    <button type="button" className={styles.drawButton} onClick={startDrawing}>
                      <PencilLine size={17} />
                      {draftParts(activeDraft).length ? "重画边界" : "开始画边界"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={focusActiveDraft}
                    disabled={draftParts(activeDraft).length === 0}
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

          <div
            className={`${styles.mapGuide} ${isClaimingGap ? styles.gapMapGuide : ""}`}
            aria-live="polite"
          >
            {isClaimingGap ? (
              <>
                <span><i className={styles.gapGuideSwatch} />{gapPreviewCount} 个闭合空白</span>
                <span>
                  {hoveredGapArea === null
                    ? "悬停高亮，点击认领"
                    : `当前高亮：${formatArea(hoveredGapArea)}`}
                </span>
              </>
            ) : (
              <>
                <span><b>1</b> 新建并命名</span>
                <span><b>2</b> 逐点点击，双击收口</span>
                <span><b>3</b> 拖动圆点精修</span>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
