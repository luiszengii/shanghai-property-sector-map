import assert from "node:assert/strict";
import test from "node:test";
import type { CommuteRequest } from "./commute-estimate.ts";
import {
  estimateCommutesWithAmap,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./amap-route-service.ts";

const baseRequest: CommuteRequest = {
  id: "self:transit:morning",
  memberId: "self",
  mode: "transit",
  period: "morning",
  origin: [121.4, 31.2],
  destination: [121.5, 31.3],
  departureAt: "2026-08-05T08:10:00+08:00",
};

test("route results normalize current-traffic driving and scheduled transit seconds", async () => {
  const results = await estimateCommutesWithAmap(
    [baseRequest, { ...baseRequest, id: "self:driving:morning", mode: "driving" }],
    {
      apiKey: "server-only-key",
      fetcher: async (input) => {
        const url = String(input);
        return new Response(JSON.stringify(url.includes("/driving")
          ? {
              status: "1",
              route: { paths: [{ cost: { duration: "1860" } }] },
            }
          : {
              status: "1",
              route: { transits: [{ cost: { duration: "2500" } }] },
            }));
      },
    },
  );

  assert.deepEqual(results, [
    {
      id: "self:transit:morning",
      memberId: "self",
      mode: "transit",
      period: "morning",
      status: "ok",
      durationMinutes: 42,
    },
    {
      id: "self:driving:morning",
      memberId: "self",
      mode: "driving",
      period: "morning",
      status: "ok",
      durationMinutes: 31,
    },
  ]);
});

test("bicycling accepts AMap's live path-level duration response", async () => {
  const results = await estimateCommutesWithAmap(
    [{ ...baseRequest, id: "self:bicycling:morning", mode: "bicycling" }],
    {
      apiKey: "server-only-key",
      fetcher: async () => new Response(JSON.stringify({
        status: "1",
        route: { paths: [{ distance: "1832", duration: "520", steps: [] }] },
      })),
    },
  );

  assert.deepEqual(results, [
    {
      id: "self:bicycling:morning",
      memberId: "self",
      mode: "bicycling",
      period: "morning",
      status: "ok",
      durationMinutes: 9,
    },
  ]);
});
