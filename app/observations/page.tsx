import type { Metadata } from "next";
import { LocalObservationExplorer } from "@/src/components/ObservationExplorer";
import { PublicObservationExplorer } from "@/src/components/PublicObservationExplorer";
import { isLocalResearchMode } from "@/src/lib/runtime-mode";

export const metadata: Metadata = {
  title: "板块观察｜上海楼市互动地图",
  description: "上海 20 个房产板块的公开观点聚合样本与看房核验清单。",
  robots: { index: false, follow: false },
};

export default function ObservationsPage() {
  return isLocalResearchMode
    ? <LocalObservationExplorer />
    : <PublicObservationExplorer />;
}
