import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceLedgerWorkbench } from "@/src/components/SourceLedgerWorkbench";
import { projects } from "@/src/content/project-leads";
import { isLocalResearchMode } from "@/src/lib/runtime-mode";

export const metadata: Metadata = {
  title: "楼盘资料中心｜上海楼市互动地图",
  description: "仅限本地开发使用的楼盘来源与字段证据维护工作台。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SourcesPage() {
  if (!isLocalResearchMode) notFound();
  return (
    <SourceLedgerWorkbench
      projects={projects.map((project) => ({
        id: project.id,
        name: project.officialName ?? project.name,
        district: project.district,
        sector: project.sector,
        locationAddress: project.locationAddress,
        locationSourceName: project.locationSourceName,
        locationSourceUrl: project.locationSourceUrl,
        locationVerifiedAt: project.locationVerifiedAt,
      }))}
    />
  );
}
