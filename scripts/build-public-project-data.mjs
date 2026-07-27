import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  buildPublicProjectProjectionFromSnapshot,
  parsePublicProjectProjection,
  parseSourceLedger,
} from "../src/lib/source-ledger.ts";

const root = process.cwd();
const inputPath = path.join(root, "outputs", "source-ledger", "ledger.json");
const outputPath = path.join(
  root,
  "src",
  "data",
  "project-public-projection.json",
);
const checkOnly = process.argv.includes("--check");
const checkSource = process.argv.includes("--check-source");
const confirmed = process.argv.includes("--confirm-reviewed");
const snapshotFlag = process.argv.indexOf("--snapshot");
const snapshotId = snapshotFlag === -1
  ? null
  : process.argv[snapshotFlag + 1] ?? null;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}-${randomUUID()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

if (checkOnly) {
  const current = parsePublicProjectProjection(await readJson(outputPath));
  if (current.sourceSnapshotId === null) {
    if (Object.keys(current.projects).length !== 0) {
      throw new Error("没有来源资料版本时，公开楼盘投射必须为空");
    }
    console.log("公开楼盘投射有效：尚未发布资料中心字段");
  } else if (checkSource) {
    const ledger = parseSourceLedger(await readJson(inputPath));
    const rebuilt = buildPublicProjectProjectionFromSnapshot(
      ledger,
      current.sourceSnapshotId,
      current.generatedAt,
    );
    if (JSON.stringify(current) !== JSON.stringify(rebuilt)) {
      throw new Error(
        "公开楼盘投射与资料版本不一致，请在人工复核后重新运行 build:public-project-data",
      );
    }
    console.log(
      `公开楼盘投射有效：${Object.keys(current.projects).length} 个楼盘，资料版本 ${current.sourceSnapshotId}`,
    );
  } else {
    console.log(
      `公开楼盘投射结构有效：${Object.keys(current.projects).length} 个楼盘，资料版本 ${current.sourceSnapshotId}`,
    );
  }
} else {
  if (!snapshotId) {
    throw new Error("必须通过 --snapshot 指定已人工审核的资料版本 ID");
  }
  if (!confirmed) {
    throw new Error("生成公开数据前必须显式传入 --confirm-reviewed");
  }
  const ledger = parseSourceLedger(await readJson(inputPath));
  const projection = buildPublicProjectProjectionFromSnapshot(
    ledger,
    snapshotId,
    new Date().toISOString(),
  );
  parsePublicProjectProjection(projection);
  await writeAtomic(outputPath, projection);
  const fieldCount = Object.values(projection.projects).reduce(
    (total, project) => total + project.fields.length,
    0,
  );
  console.log(
    `生成公开楼盘投射：${Object.keys(projection.projects).length} 个楼盘，${fieldCount} 个字段，资料版本 ${snapshotId}`,
  );
}
