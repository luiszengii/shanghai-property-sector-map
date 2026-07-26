import { FlaskConical } from "lucide-react";

export function LocalResearchBanner() {
  return (
    <aside className="local-research-banner" aria-label="本地研究模式">
      <FlaskConical size={14} />
      <strong>本地研究模式</strong>
      <span>编辑工具、私有快照和待核验字段不会进入生产网站</span>
    </aside>
  );
}
