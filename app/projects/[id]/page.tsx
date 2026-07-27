import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetailPage } from "@/src/components/ProjectDetailPage";
import { projects } from "@/src/content/project-leads";

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((project) => ({ id: project.id }));
}

function resolveProject(id: string) {
  const decodedId = decodeURIComponent(id);
  return projects.find((item) => item.id === decodedId);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = resolveProject(id);
  if (!project) return {};
  const displayName = project.officialName ?? project.name;
  return {
    title: `${displayName}｜上海楼市互动地图`,
    description: `${displayName}的公开点位、地址、交通待核验事项与信息来源说明。`,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = resolveProject(id);
  if (!project) notFound();
  return <ProjectDetailPage project={project} />;
}
