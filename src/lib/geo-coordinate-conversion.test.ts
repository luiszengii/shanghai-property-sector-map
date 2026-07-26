import assert from "node:assert/strict";
import test from "node:test";
import {
  bd09ToGcj02Position,
  gcj02ToWgs84Position,
  wgs84ToGcj02Position,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./geo-coordinate-conversion.ts";

test("converts a known Shanghai BD-09 point to GCJ-02", () => {
  const converted = bd09ToGcj02Position([121.480237, 31.236305]);
  assert.ok(Math.abs(converted[0] - 121.473699) < 0.000002);
  assert.ok(Math.abs(converted[1] - 31.230371) < 0.000002);
});

test("returns a stable cached coordinate without mutating the input", () => {
  const input: [number, number] = [121.480237, 31.236305];
  const first = bd09ToGcj02Position(input);
  const second = bd09ToGcj02Position(input);
  assert.deepEqual(input, [121.480237, 31.236305]);
  assert.equal(first, second);
});

test("round-trips a Shanghai editor coordinate back to project WGS84", () => {
  const wgs84: [number, number] = [121.473701, 31.230416];
  const display = wgs84ToGcj02Position(wgs84);
  const restored = gcj02ToWgs84Position(display);

  assert.ok(Math.abs(restored[0] - wgs84[0]) < 1e-9);
  assert.ok(Math.abs(restored[1] - wgs84[1]) < 1e-9);
});
