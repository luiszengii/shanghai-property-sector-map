import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
import { createEmptyHomebuyerProfile } from "./homebuyer-profile.ts";
import {
  buildCommuteRequests,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./commute-estimate.ts";

const componentSource = readFileSync(
  new URL("../components/CommuteEstimateRows.tsx", import.meta.url),
  "utf8",
);

test("one property requests one workplace-bound estimate per selected commute mode", () => {
  const profile = createEmptyHomebuyerProfile();
  profile.members[0].workLocation = { label: "公司", position: [121.5, 31.2] };
  profile.members[0].primaryMode = "transit";
  profile.members[0].alternateMode = "driving";
  profile.members.push({
    ...profile.members[0],
    id: "partner",
    label: "伴侣",
    primaryMode: "bicycling",
    alternateMode: "walking",
  });

  const requests = buildCommuteRequests(
    profile,
    [121.5, 31.2],
    new Date("2026-08-03T12:00:00+08:00"),
  );

  assert.equal(requests.length, 4);
  assert.deepEqual(requests[0], {
    id: "self:transit:morning",
    memberId: "self",
    mode: "transit",
    period: "morning",
    origin: [121.5, 31.2],
    destination: [121.5, 31.2],
    departureAt: "2026-08-04T08:40:00+08:00",
  });
  assert.equal(requests[1].id, "self:driving:morning");
  assert.equal(requests[2].id, "partner:bicycling:morning");
  assert.equal(requests[3].id, "partner:walking:morning");
  assert.ok(requests.every((request) => request.period === "morning"));
  assert.ok(requests.every((request) => request.origin[0] === 121.5 && request.origin[1] === 31.2));
  assert.ok(requests.every((request) => request.destination[0] === 121.5 && request.destination[1] === 31.2));
});

test("commute results omit a lone member label and place two members in one result row", () => {
  assert.match(
    componentSource,
    /className="commute-estimate-rows commute-estimate-row"\s+data-member-count=\{profile\.members\.length\}/,
  );
  assert.match(
    componentSource,
    /\{profile\.members\.length > 1 && <strong>\{member\.label\}<\/strong>\}/,
  );
  assert.match(
    componentSource,
    /gridTemplateColumns:\s*profile\.members\.length > 1\s*\? "repeat\(2, minmax\(0, 1fr\)\)"\s*:\s*"minmax\(0, 1fr\)"/,
  );
});

test("the compact commute card presents one unqualified title", () => {
  assert.equal(componentSource.match(/>通勤时间</g)?.length, 1);
  assert.doesNotMatch(componentSource, /当前路况预计|固定工作日预计/);
  assert.match(
    componentSource,
    /<h3 id="commute-estimates-heading">通勤时间<\/h3>/,
  );
});
