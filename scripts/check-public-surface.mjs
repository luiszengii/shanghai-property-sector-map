import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const snapshotPath = path.join(root, "src/data/public-observations.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const failures = [];
const forbiddenKeys = new Set([
  "author",
  "author_id",
  "nickname",
  "user_id",
  "creator_hash",
  "comment_id",
  "note_id",
  "cookie",
  "xsec_token",
  "source_keywords",
  "batch_ids",
]);
const entryKeys = [
  "sector",
  "district",
  "sampleNotes",
  "sampleComments",
  "positioning",
  "positives",
  "cautions",
  "checklist",
  "sources",
].toSorted();

function visit(value, location = "snapshot") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(key.toLowerCase())) {
      failures.push(`${location} contains forbidden key ${key}`);
    }
    visit(nested, `${location}.${key}`);
  }
}

visit(snapshot);
const snapshotText = JSON.stringify(snapshot);
for (const pattern of [
  /\b(?:nickname|creator_hash|comment_id|note_id|user_id|cookie|xsec_token)\b/i,
  /\b1[3-9]\d{9}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
]) {
  if (pattern.test(snapshotText)) {
    failures.push(`public observation snapshot matches forbidden pattern ${pattern}`);
  }
}
if (snapshot.schemaVersion !== 1) failures.push("public observation schemaVersion must be 1");
if (snapshot.entryCount !== 20 || snapshot.entries?.length !== 20) {
  failures.push("public observation snapshot must contain 20 sector entries");
}
for (const [index, entry] of (snapshot.entries ?? []).entries()) {
  const keys = Object.keys(entry).toSorted();
  if (JSON.stringify(keys) !== JSON.stringify(entryKeys)) {
    failures.push(`entry ${index} has unexpected fields`);
  }
  if (!Array.isArray(entry.sources) || entry.sources.length < 1 || entry.sources.length > 2) {
    failures.push(`entry ${index} must contain 1-2 representative sources`);
  }
  for (const source of entry.sources ?? []) {
    if (
      typeof source.url !== "string"
      || !/^https:\/\/www\.xiaohongshu\.com\/explore\/[A-Za-z0-9]+$/.test(source.url)
    ) {
      failures.push(`entry ${index} contains a non-stable source URL`);
    }
  }
}

const trackedOutputs = execFileSync("git", ["ls-files", "outputs"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (trackedOutputs) failures.push("outputs/ contains tracked files");

const publicProjects = readFileSync(path.join(root, "src/content/project-leads.ts"), "utf8");
if (/averagePrice|advantages|disadvantages|education|rating|verificationStatus/.test(publicProjects)) {
  failures.push("public project catalog contains research-only fields");
}

const artifactArg = process.argv.indexOf("--artifact");
if (artifactArg !== -1) {
  const artifactRoot = path.resolve(root, process.argv[artifactArg + 1] ?? "");
  if (!existsSync(artifactRoot)) {
    failures.push(`artifact directory does not exist: ${artifactRoot}`);
  } else {
    const forbiddenArtifactText = [
      "微观世界私有快照",
      "安居客研究快照",
      "房天下研究快照",
      "用户观点 · 待核验",
      "自己画板块",
    ];
    const stack = [artifactRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const name of readdirSync(current)) {
        const target = path.join(current, name);
        const targetStats = lstatSync(target);
        if (targetStats.isSymbolicLink()) continue;
        if (targetStats.isDirectory()) {
          stack.push(target);
          continue;
        }
        if (!/\.(?:js|html|json|txt|map)$/.test(name)) continue;
        const body = readFileSync(target, "utf8");
        for (const forbidden of forbiddenArtifactText) {
          if (body.includes(forbidden)) {
            failures.push(`production client artifact contains "${forbidden}" in ${path.relative(root, target)}`);
          }
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `PUBLIC_SURFACE_RED: ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`PUBLIC_SURFACE_GREEN: ${snapshot.entryCount} public observation entries validated`);
