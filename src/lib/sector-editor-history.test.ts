import assert from "node:assert/strict";
import test from "node:test";
import {
  createEditorHistory,
  recordEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./sector-editor-history.ts";

test("undo restores the previous snapshot and redo restores the changed snapshot", () => {
  let history = createEditorHistory<{ value: number }>();
  history = recordEditorHistory(history, { value: 1 }, "移动共享边");

  const undone = undoEditorHistory(history, { value: 2 });
  assert.ok(undone);
  assert.equal(undone.label, "移动共享边");
  assert.deepEqual(undone.snapshot, { value: 1 });

  const redone = redoEditorHistory(undone.history, undone.snapshot);
  assert.ok(redone);
  assert.equal(redone.label, "移动共享边");
  assert.deepEqual(redone.snapshot, { value: 2 });
});

test("recording a new change clears redo history", () => {
  let history = createEditorHistory<{ value: number }>();
  history = recordEditorHistory(history, { value: 1 }, "第一次");
  const undone = undoEditorHistory(history, { value: 2 });
  assert.ok(undone);

  const branched = recordEditorHistory(undone.history, { value: 1 }, "新分支");
  assert.equal(branched.future.length, 0);
  assert.equal(branched.past.length, 1);
});

test("history keeps only the configured number of snapshots", () => {
  let history = createEditorHistory<{ value: number }>(2);
  history = recordEditorHistory(history, { value: 1 }, "一");
  history = recordEditorHistory(history, { value: 2 }, "二");
  history = recordEditorHistory(history, { value: 3 }, "三");

  assert.deepEqual(history.past.map((entry) => entry.label), ["二", "三"]);
});
