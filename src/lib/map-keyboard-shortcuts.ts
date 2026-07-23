interface MapZoomShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export function mapZoomDeltaForShortcut(shortcut: MapZoomShortcut): -1 | 1 | null {
  if ((!shortcut.ctrlKey && !shortcut.metaKey) || shortcut.altKey) return null;
  if (shortcut.key === "=" || shortcut.key === "+" || shortcut.key === "Add") return 1;
  if (shortcut.key === "-" || shortcut.key === "_" || shortcut.key === "Subtract") return -1;
  return null;
}
