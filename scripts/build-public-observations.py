#!/usr/bin/env python3
"""Build a small, reviewable public XHS opinion snapshot from local research."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "outputs" / "xhs_analysis" / "web_dataset.json"
DEFAULT_OUTPUT = ROOT / "src" / "data" / "public-observations.json"

DISTRICTS = {
    "前滩": "浦东新区",
    "张江": "浦东新区",
    "大宁": "静安区",
    "徐泾": "青浦区",
    "徐汇滨江": "徐汇区",
    "北外滩": "虹口区",
    "金桥": "浦东新区",
    "虹桥商务区": "闵行区 / 青浦区",
    "三林": "浦东新区",
    "北蔡": "浦东新区",
    "古美": "闵行区",
    "莘庄": "闵行区",
    "陆家嘴": "浦东新区",
    "唐镇": "浦东新区",
    "七宝": "闵行区",
    "新江湾城": "杨浦区",
    "真如": "普陀区",
    "南翔": "嘉定区",
    "顾村": "宝山区",
    "松江新城": "松江区",
}


def load_analysis() -> dict[str, dict[str, Any]]:
    module_path = ROOT / "scripts" / "xhs_property_report.py"
    spec = importlib.util.spec_from_file_location("xhs_property_report", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("无法读取小红书分析脚本")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SECTOR_ANALYSIS


def clean_source_url(value: str) -> str:
    prefix = "https://www.xiaohongshu.com/explore/"
    if not value.startswith(prefix):
        raise ValueError("公开来源必须是小红书稳定原帖链接")
    return value.split("?", 1)[0].split("#", 1)[0]


def build_snapshot(dataset: dict[str, Any]) -> dict[str, Any]:
    analysis = load_analysis()
    notes = dataset.get("notes")
    meta = dataset.get("meta")
    if not isinstance(notes, list) or not isinstance(meta, dict):
        raise ValueError("本地 web_dataset.json 格式无效")

    note_by_id = {
        str(note.get("note_id")): note
        for note in notes
        if isinstance(note, dict) and note.get("note_id")
    }
    entries: list[dict[str, Any]] = []
    for sector, summary in analysis.items():
        selected = [
            note_by_id[note_id]
            for note_id in summary["sources"]
            if note_id in note_by_id
        ]
        for note in notes:
            if not isinstance(note, dict):
                continue
            sectors = str(note.get("sectors", "")).split("；")
            if sector in sectors and note not in selected:
                selected.append(note)
            if len(selected) >= 2:
                break
        sources = []
        seen_urls: set[str] = set()
        for note in selected:
            url = clean_source_url(str(note.get("source_url", "")))
            if url in seen_urls:
                continue
            seen_urls.add(url)
            title = str(note.get("title", "")).strip()[:70] or "小红书原帖"
            sources.append({"title": title, "url": url})
            if len(sources) == 2:
                break
        if not sources:
            raise ValueError(f"{sector} 没有可公开追溯来源")
        entries.append({
            "sector": sector,
            "district": DISTRICTS[sector],
            "sampleNotes": int(meta.get("relevant_notes_by_sector", {}).get(sector, 0)),
            "sampleComments": int(meta.get("comments_by_sector", {}).get(sector, 0)),
            "positioning": summary["positioning"],
            "positives": summary["pros"],
            "cautions": summary["cons"],
            "checklist": summary["verify"],
            "sources": sources,
        })

    return {
        "schemaVersion": 1,
        "snapshotDate": str(meta.get("crawl_date", "")),
        "entryCount": len(entries),
        "methodology": "公开平台观点的聚合研究快照；不包含作者身份、帖子正文、评论语料或互动量明细。",
        "entries": entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    dataset = json.loads(args.input.read_text(encoding="utf-8"))
    snapshot = build_snapshot(dataset)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(snapshot['entries'])} public observation entries to {args.output}")


if __name__ == "__main__":
    main()
