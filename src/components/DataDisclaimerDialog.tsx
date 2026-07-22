"use client";

import { Database, X } from "lucide-react";
import { useEffect } from "react";
import { useMapStore } from "@/src/store/map-store";

export function DataDisclaimerDialog() {
  const { disclaimerOpen, setDisclaimerOpen } = useMapStore();

  useEffect(() => {
    if (!disclaimerOpen) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDisclaimerOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [disclaimerOpen, setDisclaimerOpen]);

  if (!disclaimerOpen) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDisclaimerOpen(false); }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="data-dialog-title">
        <button className="icon-button dialog-close" onClick={() => setDisclaimerOpen(false)} aria-label="关闭数据说明"><X size={20} /></button>
        <span className="dialog-icon"><Database size={22} /></span>
        <span className="eyebrow">DATA NOTE</span>
        <h2 id="data-dialog-title">数据说明</h2>
        <ul>
          <li>房产板块边界目前为近似演示数据，不代表官方或行业统一边界。</li>
          <li>设施信息为功能演示数据，后续需要根据公开资料持续核验与更新。</li>
          <li>“环境监管重点单位”属于监管分类，不代表周边必然受到污染。</li>
          <li>页面只展示客观地点、类别、距离和公开来源，不对影响程度作判断。</li>
          <li>本页面不构成投资或购房建议，请结合现场调查和权威资料决策。</li>
        </ul>
        <button className="primary-action full" onClick={() => setDisclaimerOpen(false)}>我已了解</button>
      </section>
    </div>
  );
}
