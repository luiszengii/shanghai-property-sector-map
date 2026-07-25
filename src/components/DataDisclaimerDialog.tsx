"use client";

import { Database, X } from "lucide-react";
import { useEffect } from "react";
import { sectorCatalog } from "@/src/data/sector-catalog";
import { useMapStore } from "@/src/store/map-store";

const candidateSectors = sectorCatalog.candidateGeometryRecords;
const editorialSeedSectors = sectorCatalog.editorialSeedRecords;
const sourceBackedProxySectors = sectorCatalog.sourceBackedProxyRecords;
const administrativeReferenceSectors = sectorCatalog.administrativeReferenceRecords;
const administrativeReferenceSectorNames = administrativeReferenceSectors.map((record) => record.canonicalName).join("、");
const unresolvedMarketSectorCount = sectorCatalog.unresolvedGeometryRecords.length;

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
          <li>500–800 万新盘清单由用户提供；均价、优劣势、教育与推荐指数尚未独立核验，仅作为看盘线索。</li>
          <li>46 个新盘点位已于 2026-07-22 按项目 POI、公开地址逐项核对并固定，不再使用板块近似点。</li>
          <li>多期或多组团项目采用主地块/整体代表点，详情卡会单独标注；中等置信点位建议看房前再次确认具体入口。</li>
          <li>当前共 {candidateSectors.length} 个板块已按可追溯文字四至与固定日期 OpenStreetMap 开放地物生成青绿实线研究候选面。</li>
          <li>其中 {sourceBackedProxySectors.length} 个板块已按公开文字四至和开放道路节点重建为参考代理，仍需与相邻市场板块共同精修，不能直接视为法定或行业统一界线。</li>
          <li>另有 {editorialSeedSectors.length} 个板块先按登记行政区、公开地名的大致中心和相邻板块位置生成低置信覆盖性初稿；这些初稿可在板块编辑器中直接拖点修改，不代表已完成边界核验。</li>
          <li>前滩与杨思现为两个互斥一级板块：前滩采用 Z000801 / ES4 四至候选，杨思为原合并候选面扣除前滩后的差集。</li>
          <li>黄浦十板块采用同名街道开放关系作为可编辑骨架；新天地填合完整淮海中路街道缺口，但不代表狭义官方新天地范围。</li>
          <li>浦东东南九板块采用同名镇开放关系形成连续、零重叠的低置信起画面；镇域几何精确不代表行政镇界就是行业统一楼市边界。</li>
          <li>本轮青浦 10、松江 10、金山 10 个板块同样只采用低置信行政骨架；华新、赵巷和新桥已扣除既有徐泾、莘庄市场候选，金山新城目前仅借石化街道起画；亭林当前约 122.7 平方公里范围是亭林镇与金山工业区合并行政展示代理。两者都不是市场定稿。</li>
          <li>徐汇 12 个同名板块目前也只是低置信行政骨架，并非徐汇完整覆盖：虹梅路街道因缺少一级市场身份暂留空缺，上海南站另行定义；徐汇滨江横跨斜土、龙华、长桥、华泾的功能范围不用于自动裁切这些骨架。</li>
          <li>长宁新华路、天山、仙霞、北新泾 4 块只采用低置信行政骨架；古北按官方新区四至重建，住宅虹桥暂按虹桥街道扣除古北生成低置信候选；中山公园只显示官方道路围合核心，不代表完整楼市板块。西郊及其他未映射街镇不会被静默并入。</li>
          <li>{administrativeReferenceSectorNames}共 {administrativeReferenceSectors.length} 个板块，只叠加蓝色虚线街镇行政参考层；行政范围不会自动等同于楼市板块。</li>
          <li>上海天地图 2025 年 7 月标准地图只用于逐块视觉核对形状、面积量级和邻接关系，不从图件复制坐标；浦东 2025 年 11 月已调整的边界段以后续公告为准。</li>
          <li>当前尚未获得任何可编辑边界的登记板块为 {unresolvedMarketSectorCount} 个；覆盖性初稿之间可能暂有重叠，后续将按道路、水系和邻接关系逐批修订为互斥边界。</li>
          <li>所有房产板块均为研究口径，不代表行政区划、法定规划界址或行业统一边界；候选面和行政参考面也不等于测绘成果。</li>
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
