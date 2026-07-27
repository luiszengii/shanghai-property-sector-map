"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";

export function LocalResearchBanner() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 3200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <aside className="local-research-banner" aria-label="本地研究模式" role="status">
      <FlaskConical size={14} />
      <strong>本地研究模式</strong>
      <span>编辑工具、私有快照和待核验字段不会进入生产网站</span>
    </aside>
  );
}
