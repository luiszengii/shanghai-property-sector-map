"use client";

import { MapPin } from "lucide-react";
import { AnimatedList } from "@/src/components/AnimatedList";
import type { PropertyProject } from "@/src/types/map";

export function AnimatedProjectList({
  projects,
  selectedProjectId,
  onSelect,
}: {
  projects: PropertyProject[];
  selectedProjectId: string | null;
  onSelect: (project: PropertyProject) => void;
}) {
  return (
    <AnimatedList
      as="ul"
      className="project-list"
      ariaLabel="新盘列表"
    >
      {projects.map((project) => {
        const displayName = project.officialName ?? project.name;
        const selected = selectedProjectId === project.id;
        return (
          <button
            key={project.id}
            type="button"
            className={`project-list-item${selected ? " is-selected" : ""}`}
            onClick={() => onSelect(project)}
            aria-current={selected ? "true" : undefined}
          >
            <span className="project-list-copy">
              <strong>{displayName}</strong>
              <small>{project.district} · {project.sector}</small>
            </span>
            <MapPin className="project-list-locate" size={14} aria-hidden="true" />
          </button>
        );
      })}
    </AnimatedList>
  );
}
