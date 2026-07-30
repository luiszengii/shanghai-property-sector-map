import assert from "node:assert/strict";
import { mkdirSync, readlinkSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  linkPrivateData,
  upsertEnvContent,
} from "./local-workspace-data.mjs";

test("upsertEnvContent replaces managed values and preserves other entries", () => {
  const current = [
    "# local settings",
    "NEXT_PUBLIC_AMAP_KEY=old",
    "UNRELATED=value",
    "",
  ].join("\n");

  assert.equal(
    upsertEnvContent(current, {
      NEXT_PUBLIC_AMAP_KEY: "new-key",
      NEXT_PUBLIC_AMAP_SECURITY_JS_CODE: "security-code",
    }),
    [
      "# local settings",
      "NEXT_PUBLIC_AMAP_KEY=new-key",
      "UNRELATED=value",
      "NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=security-code",
      "",
    ].join("\n"),
  );
});

test("linkPrivateData creates the ignored outputs symlink", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shfang-local-setup-"));
  try {
    mkdirSync(path.join(root, ".private-data", "outputs"), { recursive: true });

    assert.equal(linkPrivateData(root).status, "linked");
    assert.equal(readlinkSync(path.join(root, "outputs")), ".private-data/outputs");
    assert.equal(linkPrivateData(root).status, "already-linked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("linkPrivateData preserves an existing outputs directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shfang-local-setup-"));
  try {
    mkdirSync(path.join(root, ".private-data", "outputs"), { recursive: true });
    mkdirSync(path.join(root, "outputs"));

    assert.equal(linkPrivateData(root).status, "existing-outputs-preserved");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
