"use client";

import { Check, LoaderCircle, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  createEmptyHomebuyerProfile,
  type CommuteMode,
  type HomebuyerMember,
  type HomebuyerProfile,
  type WorkLocation,
  validateHomebuyerProfile,
} from "@/src/lib/homebuyer-profile";

interface HomebuyerSettingsDialogProps {
  open: boolean;
  profile: HomebuyerProfile | null;
  onClose: () => void;
  onSave: (profile: HomebuyerProfile) => void;
  onClear: () => void;
}

interface SearchTip {
  id: string;
  name: string;
  address: string;
  position: [number, number];
}

interface LooseLngLat {
  lng?: number;
  lat?: number;
  getLng?: () => number;
  getLat?: () => number;
}

interface LooseMap {
  add: (marker: LooseMarker) => void;
  destroy: () => void;
  off: (event: string, listener: (event: { lnglat: LooseLngLat }) => void) => void;
  on: (event: string, listener: (event: { lnglat: LooseLngLat }) => void) => void;
  setZoomAndCenter: (zoom: number, center: [number, number]) => void;
}

interface LooseMarker {
  setMap: (map: LooseMap | null) => void;
  setPosition: (position: [number, number]) => void;
}

interface LooseAutoComplete {
  search: (keyword: string, callback: (status: string, result: unknown) => void) => void;
}

interface LooseAmapApi {
  AutoComplete: new (options: { city: string }) => LooseAutoComplete;
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => LooseMap;
  Marker: new (options: { position: [number, number] }) => LooseMarker;
  plugin: (plugins: string[], callback: () => void) => void;
}

const modeOptions: Array<{ value: CommuteMode; label: string }> = [
  { value: "driving", label: "驾车" },
  { value: "transit", label: "公交" },
  { value: "walking", label: "步行" },
  { value: "bicycling", label: "骑行" },
];

function readPosition(value: unknown): [number, number] | null {
  if (!value || typeof value !== "object") return null;
  const location = value as LooseLngLat;
  const longitude = location.getLng?.() ?? location.lng;
  const latitude = location.getLat?.() ?? location.lat;
  return typeof longitude === "number" && typeof latitude === "number"
    ? [longitude, latitude]
    : null;
}

function normalizeTips(result: unknown): SearchTip[] {
  if (!result || typeof result !== "object" || !("tips" in result) || !Array.isArray((result as { tips?: unknown }).tips)) {
    return [];
  }
  return ((result as { tips: unknown[] }).tips).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const tip = raw as { id?: unknown; name?: unknown; address?: unknown; district?: unknown; location?: unknown };
    const position = readPosition(tip.location);
    if (!position || typeof tip.name !== "string") return [];
    const address = [tip.district, tip.address].filter((value): value is string => typeof value === "string" && value.length > 0).join(" · ");
    return [{
      id: typeof tip.id === "string" && tip.id ? tip.id : `${tip.name}-${index}`,
      name: tip.name,
      address,
      position,
    }];
  }).slice(0, 6);
}

function WorkLocationPicker({
  member,
  value,
  onChange,
}: {
  member: HomebuyerMember;
  value: WorkLocation | null;
  onChange: (location: WorkLocation) => void;
}) {
  const inputId = useId();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LooseMap | null>(null);
  const markerRef = useRef<LooseMarker | null>(null);
  const autocompleteRef = useRef<LooseAutoComplete | null>(null);
  const amapApiRef = useRef<LooseAmapApi | null>(null);
  const queryRef = useRef(value?.label ?? "");
  const suppressNextSearchRef = useRef(false);
  const [query, setQuery] = useState(value?.label ?? "");
  const [pending, setPending] = useState<WorkLocation | null>(value);
  const [tips, setTips] = useState<SearchTip[]>([]);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_AMAP_KEY;
    const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;
    if (!key || !mapContainerRef.current) {
      setMapStatus("missing");
      return;
    }
    let cancelled = false;
    let api: LooseAmapApi | null = null;
    let handleMapClick: ((event: { lnglat: LooseLngLat }) => void) | null = null;
    if (securityJsCode) {
      (window as Window & { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = { securityJsCode };
    }
    import("@amap/amap-jsapi-loader")
      .then(({ default: AMapLoader }) => AMapLoader.load({ key, version: "2.0", plugins: ["AMap.AutoComplete"] }))
      .then((loadedApi) => {
        if (cancelled || !mapContainerRef.current) return;
        api = loadedApi as unknown as LooseAmapApi;
        amapApiRef.current = api;
        const center = value?.position ?? [121.4737, 31.2304];
        const map = new api.Map(mapContainerRef.current, {
          zoom: value ? 15 : 10.5,
          center,
          viewMode: "2D",
          mapStyle: "amap://styles/whitesmoke",
          features: ["bg", "road", "building"],
        });
        mapRef.current = map;
        if (value) {
          const marker = new api.Marker({ position: value.position });
          markerRef.current = marker;
          map.add(marker);
        }
        handleMapClick = (event) => {
          const position = readPosition(event.lnglat);
          if (!position) return;
          setPending({ label: queryRef.current.trim() || "地图选点", position });
        };
        map.on("click", handleMapClick);
        api.plugin(["AMap.AutoComplete"], () => {
          if (!api || cancelled) return;
          autocompleteRef.current = new api.AutoComplete({ city: "上海" });
          setMapStatus("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setMapStatus("error");
      });

    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map && handleMapClick) map.off("click", handleMapClick);
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
      map?.destroy();
      autocompleteRef.current = null;
      amapApiRef.current = null;
    };
  // The picker map is intentionally created once per dialog opening.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !pending || mapStatus !== "ready") return;
    const updateMarker = () => {
      const api = amapApiRef.current;
      if (!api || !mapRef.current) return;
      if (!markerRef.current) {
        markerRef.current = new api.Marker({ position: pending.position });
        mapRef.current.add(markerRef.current);
      } else {
        markerRef.current.setPosition(pending.position);
      }
      mapRef.current.setZoomAndCenter(15, pending.position);
    };
    updateMarker();
  }, [mapStatus, pending]);

  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      setTips([]);
      setSearchStatus("idle");
      return;
    }
    if (query.trim().length < 2 || !autocompleteRef.current) {
      setTips([]);
      setSearchStatus("idle");
      return;
    }
    const timer = window.setTimeout(() => {
      setSearchStatus("loading");
      autocompleteRef.current?.search(query.trim(), (status, result) => {
        if (status !== "complete") {
          setTips([]);
          setSearchStatus("error");
          return;
        }
        setTips(normalizeTips(result));
        setSearchStatus("idle");
      });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, mapStatus]);

  const chooseTip = (tip: SearchTip) => {
    suppressNextSearchRef.current = true;
    queryRef.current = tip.name;
    setQuery(tip.name);
    setPending({ label: tip.name, position: tip.position });
    setTips([]);
  };

  return (
    <div className="work-location-picker">
      <label htmlFor={inputId}>上班位置</label>
      <div className={`settings-search${searchStatus === "error" ? " is-error" : ""}`}>
        <Search size={16} aria-hidden="true" />
        <input
          id={inputId}
          value={query}
          onChange={(event) => {
            suppressNextSearchRef.current = false;
            queryRef.current = event.target.value;
            setQuery(event.target.value);
          }}
          placeholder="搜索公司、园区或地标"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={tips.length > 0}
          aria-controls={`${inputId}-results`}
          aria-invalid={searchStatus === "error"}
        />
        {searchStatus === "loading" && <LoaderCircle className="spin" size={16} aria-label="搜索中" />}
      </div>
      {tips.length > 0 && (
        <ul id={`${inputId}-results`} className="settings-search-results" role="listbox">
          {tips.map((tip) => (
            <li key={tip.id} role="option" aria-selected="false">
              <button type="button" onClick={() => chooseTip(tip)}>
                <strong>{tip.name}</strong>
                <span>{tip.address || "上海"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={mapContainerRef} className="settings-location-map" aria-label={`${member.label}的上班位置确认地图`} />
      <div className={`location-confirm-row${value ? " is-confirmed" : ""}`}>
        <span>
          {mapStatus === "missing" ? "地图 Key 未配置，暂不能选点" : mapStatus === "error" ? "地图加载失败，请稍后重试" : pending ? `${pending.label} · ${pending.position[0].toFixed(4)}, ${pending.position[1].toFixed(4)}` : "搜索后选中结果，也可以直接点地图"}
        </span>
        <button
          type="button"
          className="settings-inline-action"
          disabled={!pending || mapStatus !== "ready"}
          onClick={() => pending && onChange(pending)}
          data-state={value ? "success" : mapStatus === "error" ? "error" : mapStatus === "loading" ? "loading" : "default"}
        >
          {value ? <Check size={15} /> : <MapPin size={15} />}
          {value ? "已确认" : "确认位置"}
        </button>
      </div>
    </div>
  );
}

function createPartner(): HomebuyerMember {
  return {
    id: "partner",
    label: "伴侣",
    workLocation: null,
    primaryMode: "transit",
    alternateMode: null,
    commuteLimitMinutes: 60,
    arrivalTime: "09:00",
    departureTime: "17:00",
  };
}

function MemberFields({
  member,
  onChange,
  onRemove,
}: {
  member: HomebuyerMember;
  onChange: (member: HomebuyerMember) => void;
  onRemove?: () => void;
}) {
  const update = <Key extends keyof HomebuyerMember>(key: Key, value: HomebuyerMember[Key]) => {
    onChange({ ...member, [key]: value });
  };
  return (
    <section className="settings-member" aria-labelledby={`settings-${member.id}-heading`}>
      <div className="settings-section-heading">
        <h3 id={`settings-${member.id}-heading`}>{member.id === "self" ? "你的通勤" : "伴侣通勤"}</h3>
        {onRemove && <button type="button" className="settings-remove-member" onClick={onRemove}><Trash2 size={14} />移除</button>}
      </div>
      <div className="settings-grid is-member-meta">
        <label>
          称呼
          <input value={member.label} maxLength={6} onChange={(event) => update("label", event.target.value)} />
        </label>
        <label>
          可接受单程
          <span className="settings-suffix-field"><input type="number" min={10} max={180} step={5} value={member.commuteLimitMinutes} onChange={(event) => update("commuteLimitMinutes", Number(event.target.value))} /><b>分钟</b></span>
        </label>
      </div>
      <WorkLocationPicker
        key={`${member.id}-${member.workLocation?.position.join(",") ?? "unset"}`}
        member={member}
        value={member.workLocation}
        onChange={(location) => update("workLocation", location)}
      />
      <div className="settings-grid">
        <label>
          主要方式
          <select value={member.primaryMode} onChange={(event) => {
            const mode = event.target.value as CommuteMode;
            onChange({ ...member, primaryMode: mode, alternateMode: member.alternateMode === mode ? null : member.alternateMode });
          }}>
            {modeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          备选方式
          <select value={member.alternateMode ?? ""} onChange={(event) => update("alternateMode", event.target.value ? event.target.value as CommuteMode : null)}>
            <option value="">不设置</option>
            {modeOptions.filter((option) => option.value !== member.primaryMode).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

export function HomebuyerSettingsDialog({ open, profile, onClose, onSave, onClear }: HomebuyerSettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<HomebuyerProfile>(() => profile ?? createEmptyHomebuyerProfile());
  const [issues, setIssues] = useState<string[]>([]);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setDraft(profile ?? createEmptyHomebuyerProfile());
      setIssues([]);
      setCleared(false);
      dialog.showModal();
      window.setTimeout(() => firstInputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, profile]);

  const updateMember = (index: number, member: HomebuyerMember) => {
    setDraft((current) => ({
      ...current,
      members: current.members.map((existing, memberIndex) => memberIndex === index ? member : existing),
    }));
    setIssues([]);
    setCleared(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextIssues = validateHomebuyerProfile(draft);
    setIssues(nextIssues);
    if (nextIssues.length > 0) return;
    onSave(draft);
    onClose();
  };

  const clear = () => {
    setDraft(createEmptyHomebuyerProfile());
    setIssues([]);
    setCleared(true);
    onClear();
  };

  return (
    <dialog
      ref={dialogRef}
      className="homebuyer-settings-dialog"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      aria-labelledby="homebuyer-settings-title"
    >
      <form method="dialog" onSubmit={submit} className="homebuyer-settings-form">
        <header className="settings-dialog-heading">
          <div>
            <span>仅保存在当前设备</span>
            <h2 id="homebuyer-settings-title">我的选房设置</h2>
            <p>打开楼盘卡片时，按固定工作日早晚高峰估算通勤。</p>
          </div>
          <button type="button" className="icon-button settings-dialog-close" onClick={onClose} aria-label="关闭选房设置"><X size={18} /></button>
        </header>

        <section className="settings-budget" aria-labelledby="settings-budget-heading">
          <div className="settings-section-heading">
            <h3 id="settings-budget-heading">可接受总价</h3>
            <span>选填 · 万元</span>
          </div>
          <div className="settings-grid is-budget">
            <label>
              最低
              <input ref={firstInputRef} type="number" min={0} step={10} placeholder="例如 500" value={draft.budgetMinWan ?? ""} onChange={(event) => setDraft((current) => ({ ...current, budgetMinWan: event.target.value ? Number(event.target.value) : null }))} />
            </label>
            <span aria-hidden="true">—</span>
            <label>
              最高
              <input type="number" min={0} step={10} placeholder="例如 800" value={draft.budgetMaxWan ?? ""} onChange={(event) => setDraft((current) => ({ ...current, budgetMaxWan: event.target.value ? Number(event.target.value) : null }))} />
            </label>
          </div>
        </section>

        {draft.members.map((member, index) => (
          <MemberFields
            key={member.id}
            member={member}
            onChange={(nextMember) => updateMember(index, nextMember)}
            onRemove={member.id === "partner" ? () => setDraft((current) => ({ ...current, members: current.members.filter((item) => item.id !== "partner") })) : undefined}
          />
        ))}

        {draft.members.length === 1 && (
          <button type="button" className="settings-add-partner" onClick={() => setDraft((current) => ({ ...current, members: [...current.members, createPartner()] }))}>
            <Plus size={16} /> 添加伴侣
          </button>
        )}

        <p className="settings-privacy-note">设置只保存在当前设备；计算通勤时，楼盘与上班地点坐标会临时发送给本站服务和高德，不保存路线结果。</p>

        <div className="settings-feedback" aria-live="polite">
          {issues.length > 0 && <p className="is-error">{issues[0]}</p>}
          {cleared && <p className="is-success"><Check size={14} />已清空当前设备上的设置。</p>}
        </div>

        <footer className="settings-actions">
          <button type="button" className="settings-clear" onClick={clear}>清空设置</button>
          <button type="submit" className="settings-save" data-state={issues.length > 0 ? "error" : cleared ? "success" : "default"}>保存设置</button>
        </footer>
      </form>
    </dialog>
  );
}
