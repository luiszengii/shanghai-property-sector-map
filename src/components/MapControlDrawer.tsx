"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FilterPanel, type FilterPanelMode } from "./FilterPanel";

export function MapControlDrawer({
  mode,
  onClose,
}: {
  mode: FilterPanelMode | null;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {mode && (
        <motion.aside
          className="desktop-filters"
          aria-label="地图控制侧栏"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -18 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="control-drawer-view"
              key={mode}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              <FilterPanel mode={mode} onClose={onClose} />
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
