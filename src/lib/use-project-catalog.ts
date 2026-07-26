"use client";

import { useEffect, useState } from "react";
import { projects as publicProjects } from "@/src/content/project-leads";
import type { PropertyProject } from "@/src/types/map";

let cachedProjects: PropertyProject[] = publicProjects;
let localProjectsPromise: Promise<PropertyProject[]> | null = null;

function loadLocalResearchProjects() {
  if (process.env.NODE_ENV !== "development") {
    return Promise.resolve(publicProjects);
  }
  localProjectsPromise ??= fetch("/api/local-project-research", {
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) return publicProjects;
    const payload = await response.json() as {
      projects?: Record<string, NonNullable<PropertyProject["research"]>>;
    };
    if (!payload.projects) return publicProjects;
    return publicProjects.map((project) => ({
      ...project,
      research: payload.projects?.[project.name],
    }));
  });
  return localProjectsPromise;
}

export function useProjectCatalog() {
  const [projects, setProjects] = useState(cachedProjects);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let active = true;
    void loadLocalResearchProjects().then((items) => {
      cachedProjects = items;
      if (active) setProjects(items);
    });
    return () => {
      active = false;
    };
  }, []);

  return projects;
}
