import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const snapshotPath = path.join(root, "src/data/public-observations.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const projectProjectionPath = path.join(
  root,
  "src/data/project-public-projection.json",
);
const projectProjection = JSON.parse(
  readFileSync(projectProjectionPath, "utf8"),
);
const publishedTopologyPath = path.join(
  root,
  "src/data/sectors/published-topology.wgs84.json",
);
const publishedTopologyIndexPath = path.join(
  root,
  "src/data/sectors/published-topology.index.json",
);
const publishedTopologyManifestPath = path.join(
  root,
  "src/data/sectors/published-topology.manifest.json",
);
const publishedTopology = JSON.parse(
  readFileSync(publishedTopologyPath, "utf8"),
);
const publishedTopologyIndex = JSON.parse(
  readFileSync(publishedTopologyIndexPath, "utf8"),
);
const publishedTopologyManifest = JSON.parse(
  readFileSync(publishedTopologyManifestPath, "utf8"),
);
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
  "note",
  "revisions",
  "revisionid",
  "currentrevisionid",
  "researchbatches",
  "licensestatus",
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
const evidenceConfidences = new Set(["已核验", "高", "中", "低/线索"]);

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
visit(projectProjection, "projectProjection");

function fileSha256(target) {
  return createHash("sha256").update(readFileSync(target)).digest("hex");
}

if (
  publishedTopology.metadata?.publicationStatus
  !== "user-approved-production"
) {
  failures.push("published sector topology must be explicitly user-approved");
}
if (
  publishedTopology.metadata?.approvedVersionId
  !== publishedTopologyManifest.approvedVersionId
  || Number.isNaN(Date.parse(publishedTopology.metadata?.approvedAt))
) {
  failures.push("published sector topology approval metadata is invalid");
}
if (
  publishedTopology.metadata?.semanticReferenceCoordinatesPublished !== false
  || publishedTopologyManifest.semanticReferenceCoordinatesPublished !== false
) {
  failures.push("published sector topology must exclude semantic-reference coordinates");
}
if (
  fileSha256(publishedTopologyPath) !== publishedTopologyManifest.outputSha256
  || fileSha256(publishedTopologyIndexPath)
    !== publishedTopologyManifest.indexSha256
) {
  failures.push("published sector topology does not match its manifest hashes");
}
const publishedFeatures = publishedTopology.features ?? [];
const publishedIndexFeatures = publishedTopologyIndex.features ?? [];
const publishedIds = publishedFeatures.map((feature) => feature.properties?.id);
const publishedIndexIds = publishedIndexFeatures.map((feature) => feature.id);
if (
  publishedFeatures.length !== publishedTopologyManifest.featureCount
  || publishedIndexFeatures.length !== publishedTopologyManifest.featureCount
  || new Set(publishedIds).size !== publishedFeatures.length
  || JSON.stringify(publishedIds) !== JSON.stringify(publishedIndexIds)
) {
  failures.push("published sector topology feature/index identities are inconsistent");
}
for (const [index, feature] of publishedFeatures.entries()) {
  if (
    feature.type !== "Feature"
    || feature.properties?.status !== "reviewed-candidate"
    || feature.properties?.coordinateSystem !== "WGS84"
    || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
    || !Array.isArray(feature.geometry?.coordinates)
    || feature.geometry.coordinates.length === 0
  ) {
    failures.push(`published sector topology feature ${index} is invalid`);
  }
}
const topologyMetrics =
  publishedTopologyManifest.topologyMetricsSquareKilometers ?? {};
if (
  topologyMetrics.finalOverlapExcess !== 0
  || topologyMetrics.finalUncoveredTarget !== 0
  || topologyMetrics.finalOutsideTarget !== 0
  || topologyMetrics.serializedOverlapExcess > 0.002
  || topologyMetrics.serializedUncoveredTarget > 0.002
  || topologyMetrics.serializedOutsideTarget > 0.002
) {
  failures.push("published sector topology exceeds the approved topology tolerances");
}
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

const projectionRootKeys = [
  "generatedAt",
  "projects",
  "schemaVersion",
  "sourceSnapshotId",
].toSorted();
if (
  JSON.stringify(Object.keys(projectProjection).toSorted())
  !== JSON.stringify(projectionRootKeys)
) {
  failures.push("public project projection has unexpected root fields");
}
if (projectProjection.schemaVersion !== 1) {
  failures.push("public project projection schemaVersion must be 1");
}
if (Number.isNaN(Date.parse(projectProjection.generatedAt))) {
  failures.push("public project projection generatedAt must be a valid date");
}
if (
  projectProjection.sourceSnapshotId !== null
  && typeof projectProjection.sourceSnapshotId !== "string"
) {
  failures.push("public project projection sourceSnapshotId must be string or null");
}
if (
  !projectProjection.projects
  || typeof projectProjection.projects !== "object"
  || Array.isArray(projectProjection.projects)
) {
  failures.push("public project projection projects must be an object");
}
const publicFieldKeys = [
  "confidence",
  "evidenceId",
  "field",
  "observedAt",
  "source",
  "value",
].toSorted();
const publicSourceKeys = ["publisher", "title", "url"].toSorted();
for (const [projectId, project] of Object.entries(projectProjection.projects ?? {})) {
  if (!projectId.startsWith("project_")) {
    failures.push(`public project projection contains invalid project ID ${projectId}`);
  }
  if (
    !project
    || typeof project !== "object"
    || Array.isArray(project)
    || JSON.stringify(Object.keys(project).toSorted()) !== JSON.stringify(["fields"])
    || !Array.isArray(project.fields)
  ) {
    failures.push(`public project projection ${projectId} must contain only fields[]`);
    continue;
  }
  const evidenceIds = new Set();
  for (const [index, field] of project.fields.entries()) {
    const location = `${projectId}.fields[${index}]`;
    if (
      !field
      || typeof field !== "object"
      || Array.isArray(field)
      || JSON.stringify(Object.keys(field).toSorted()) !== JSON.stringify(publicFieldKeys)
    ) {
      failures.push(`${location} has unexpected fields`);
      continue;
    }
    if (evidenceIds.has(field.evidenceId)) {
      failures.push(`${location} repeats evidenceId ${field.evidenceId}`);
    }
    evidenceIds.add(field.evidenceId);
    if (!evidenceConfidences.has(field.confidence)) {
      failures.push(`${location} has invalid confidence`);
    }
    if (Number.isNaN(Date.parse(field.observedAt))) {
      failures.push(`${location} has invalid observedAt`);
    }
    if (
      !field.source
      || typeof field.source !== "object"
      || Array.isArray(field.source)
      || JSON.stringify(Object.keys(field.source).toSorted()) !== JSON.stringify(publicSourceKeys)
    ) {
      failures.push(`${location}.source has unexpected fields`);
    } else if (
      typeof field.source.url !== "string"
      || !/^https?:\/\//.test(field.source.url)
    ) {
      failures.push(`${location}.source has invalid URL`);
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
      "RealtyNavi 授权研究快照",
      "项目拓扑修复预览",
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

console.log(
  `PUBLIC_SURFACE_GREEN: ${snapshot.entryCount} public observation entries and ${Object.keys(projectProjection.projects ?? {}).length} public project entries validated`,
);
