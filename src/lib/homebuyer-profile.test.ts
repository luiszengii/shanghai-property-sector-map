import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyHomebuyerProfile,
  parseHomebuyerProfile,
  validateHomebuyerProfile,
// @ts-expect-error Node 22 executes this TypeScript test directly and requires the source extension.
} from "./homebuyer-profile.ts";

test("new homebuyer settings start with one nine-to-five commuter", () => {
  const profile = createEmptyHomebuyerProfile();

  assert.equal(profile.members.length, 1);
  assert.deepEqual(profile.members[0], {
    id: "self",
    label: "我",
    workLocation: null,
    primaryMode: "driving",
    alternateMode: null,
    commuteLimitMinutes: 60,
    arrivalTime: "09:00",
    departureTime: "17:00",
  });
  assert.equal(profile.budgetMinWan, null);
  assert.equal(profile.budgetMaxWan, null);
});

test("settings explain missing work location and an inverted budget range", () => {
  const profile = createEmptyHomebuyerProfile();
  profile.budgetMinWan = 900;
  profile.budgetMaxWan = 600;

  assert.deepEqual(validateHomebuyerProfile(profile), [
    "最低总价不能高于最高总价。",
    "请先确认我的上班位置。",
  ]);
});

test("saved settings restore only the agreed local profile fields", () => {
  const profile = parseHomebuyerProfile(JSON.stringify({
    version: 1,
    budgetMinWan: 500,
    budgetMaxWan: 800,
    members: [{
      id: "self",
      label: "你你你你你你你",
      workLocation: { label: "陆家嘴", position: [121.501, 31.239] },
      primaryMode: "transit",
      alternateMode: "driving",
      commuteLimitMinutes: 45,
      arrivalTime: "08:30",
      departureTime: "18:15",
      ignoredPrivateField: "must not survive",
    }],
    ignoredRootField: true,
  }));

  assert.deepEqual(profile, {
    version: 1,
    budgetMinWan: 500,
    budgetMaxWan: 800,
    members: [{
      id: "self",
      label: "你你你你你你",
      workLocation: { label: "陆家嘴", position: [121.501, 31.239] },
      primaryMode: "transit",
      alternateMode: "driving",
      commuteLimitMinutes: 45,
      arrivalTime: "08:30",
      departureTime: "18:15",
    }],
  });
});
