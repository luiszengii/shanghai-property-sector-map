import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_AMAP_VARIABLES,
  PRIVATE_DATA_REPOSITORY,
  linkPrivateData,
  writeLocalEnv,
} from "./local-workspace-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

execFileSync("gh", ["auth", "status"], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
});

execFileSync(
  "git",
  ["submodule", "update", "--init", "--recursive", ".private-data"],
  { cwd: root, stdio: "inherit" },
);

const linkResult = linkPrivateData(root);
if (linkResult.status === "existing-outputs-preserved") {
  console.log(
    "Existing outputs/ was preserved. Move or reconcile it before using the private submodule data.",
  );
} else {
  console.log(`Private data status: ${linkResult.status}.`);
}

const values = Object.fromEntries(
  LOCAL_AMAP_VARIABLES.map((name) => [
    name,
    execFileSync(
      "gh",
      ["variable", "get", name, "--repo", PRIVATE_DATA_REPOSITORY],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    ).trim(),
  ]),
);

const envPath = writeLocalEnv(root, values);
console.log(
  `Wrote ${LOCAL_AMAP_VARIABLES.join(" and ")} to ${path.basename(envPath)} without printing their values.`,
);
