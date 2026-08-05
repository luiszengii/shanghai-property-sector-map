import assert from "node:assert/strict";
import test from "node:test";
import type { CommuteRequest } from "./commute-estimate.ts";
import {
  clearCommuteResultCache,
  getOrLoadCommuteResults,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./commute-result-cache.ts";

const request: CommuteRequest = {
  id: "self:driving:morning",
  memberId: "self",
  mode: "driving",
  period: "morning",
  origin: [121.4, 31.2],
  destination: [121.5, 31.3],
  departureAt: "2026-08-05T08:20:00+08:00",
};

test.beforeEach(() => clearCommuteResultCache());

test("reuses the completed result for the same property and commute settings", async () => {
  let loadCount = 0;
  const load = async () => {
    loadCount += 1;
    return { results: [], queriedAt: "2026-08-05T12:00:00+08:00" };
  };

  const first = await getOrLoadCommuteResults([request], load);
  const second = await getOrLoadCommuteResults([request], load);

  assert.deepEqual(second, first);
  assert.equal(loadCount, 1);
});

test("deduplicates concurrent loads for the same property", async () => {
  let loadCount = 0;
  const load = async () => {
    loadCount += 1;
    await Promise.resolve();
    return { results: [], queriedAt: "2026-08-05T12:00:00+08:00" };
  };

  await Promise.all([
    getOrLoadCommuteResults([request], load),
    getOrLoadCommuteResults([request], load),
  ]);

  assert.equal(loadCount, 1);
});

test("loads again when the property or commute settings change", async () => {
  let loadCount = 0;
  const load = async () => {
    loadCount += 1;
    return { results: [], queriedAt: `2026-08-05T12:0${loadCount}:00+08:00` };
  };

  await getOrLoadCommuteResults([request], load);
  await getOrLoadCommuteResults([{ ...request, origin: [121.6, 31.4] }], load);
  await getOrLoadCommuteResults([{ ...request, mode: "transit" }], load);

  assert.equal(loadCount, 3);
});
