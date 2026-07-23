import type { Metadata } from "next";
import { ObservationExplorer } from "@/src/components/ObservationExplorer";

export const metadata: Metadata = {
  title: "板块观察｜上海楼市互动地图",
  description: "上海 12 个房产板块的小红书公开观点样本索引与脱敏评论。",
  robots: { index: false, follow: false },
};

export default function ObservationsPage() {
  return <ObservationExplorer />;
}
