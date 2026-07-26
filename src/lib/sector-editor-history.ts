export interface EditorHistoryEntry<T> {
  label: string;
  snapshot: T;
}

export interface EditorHistory<T> {
  limit: number;
  past: EditorHistoryEntry<T>[];
  future: EditorHistoryEntry<T>[];
}

export interface EditorHistoryTransition<T> {
  history: EditorHistory<T>;
  label: string;
  snapshot: T;
}

export function createEditorHistory<T>(limit = 50): EditorHistory<T> {
  return {
    limit,
    past: [],
    future: [],
  };
}

export function recordEditorHistory<T>(
  history: EditorHistory<T>,
  snapshot: T,
  label: string,
): EditorHistory<T> {
  return {
    ...history,
    past: [...history.past, { label, snapshot }].slice(-history.limit),
    future: [],
  };
}

export function undoEditorHistory<T>(
  history: EditorHistory<T>,
  currentSnapshot: T,
): EditorHistoryTransition<T> | undefined {
  const entry = history.past.at(-1);
  if (!entry) return undefined;
  return {
    history: {
      ...history,
      past: history.past.slice(0, -1),
      future: [
        { label: entry.label, snapshot: currentSnapshot },
        ...history.future,
      ].slice(0, history.limit),
    },
    label: entry.label,
    snapshot: entry.snapshot,
  };
}

export function redoEditorHistory<T>(
  history: EditorHistory<T>,
  currentSnapshot: T,
): EditorHistoryTransition<T> | undefined {
  const [entry, ...remainingFuture] = history.future;
  if (!entry) return undefined;
  return {
    history: {
      ...history,
      past: [
        ...history.past,
        { label: entry.label, snapshot: currentSnapshot },
      ].slice(-history.limit),
      future: remainingFuture,
    },
    label: entry.label,
    snapshot: entry.snapshot,
  };
}
