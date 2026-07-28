import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  listSectorEditorVersions,
  migrateLegacySectorEditorVersionStore,
  readSectorEditorVersion,
} from "../src/lib/sector-editor-version-store.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const versionDirectory = path.join(
  repositoryRoot,
  "data",
  "geo",
  "sector-editor-versions",
);
const paths = {
  manifestPath: path.join(versionDirectory, "versions.json"),
  objectDirectory: path.join(versionDirectory, "objects"),
};
const legacyValue = JSON.parse(await readFile(paths.manifestPath, "utf8"));

if (legacyValue?.schemaVersion !== 1) {
  throw new Error("versions.json 不是待迁移的 schema v1 全量快照");
}

const expectedVersionJson = new Map(
  legacyValue.versions.map((version) => [version.id, JSON.stringify(version)]),
);
const result = await migrateLegacySectorEditorVersionStore(paths, legacyValue);
const summaries = await listSectorEditorVersions(paths);

for (const summary of summaries) {
  const restored = await readSectorEditorVersion(paths, summary.id);
  if (!restored || JSON.stringify(restored) !== expectedVersionJson.get(summary.id)) {
    throw new Error(`版本 ${summary.versionNumber} 迁移后无法无损恢复`);
  }
}

console.log(JSON.stringify({
  ...result,
  restoredVersionCount: summaries.length,
}, null, 2));
