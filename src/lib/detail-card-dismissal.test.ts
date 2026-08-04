import assert from "node:assert/strict";
import test from "node:test";
import { shouldDismissDetail } from "./detail-card-dismissal";

test("a pointer target outside the detail card dismisses it", () => {
  const outsideTarget = {
    closest: () => null,
  } as unknown as EventTarget;

  assert.equal(shouldDismissDetail(outsideTarget), true);
});

test("a pointer target inside the detail card keeps it open", () => {
  const insideTarget = {
    closest: (selector: string) => selector === ".detail-card" ? {} : null,
  } as unknown as EventTarget;

  assert.equal(shouldDismissDetail(insideTarget), false);
});
