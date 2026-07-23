import type { Metadata } from "next";
import { SectorBoundaryEditor } from "@/src/components/SectorBoundaryEditor";

export const metadata: Metadata = {
  title: "板块边界编辑器｜上海楼市互动地图",
  description: "在地图上人工绘制、调整并导出上海楼市板块边界草稿。",
};

export default function SectorEditorPage() {
  return <SectorBoundaryEditor />;
}
