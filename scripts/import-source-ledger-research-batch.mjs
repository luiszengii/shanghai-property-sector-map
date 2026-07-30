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
  createResearchBatch,
  emptySourceLedger,
  parseSourceLedger,
} from "../src/lib/source-ledger.ts";

const inputFlag = process.argv.indexOf("--input");
const inputPath = inputFlag === -1
  ? null
  : path.resolve(process.cwd(), process.argv[inputFlag + 1] ?? "");
const checkOnly = process.argv.includes("--check");
const ledgerPath = path.join(
  process.cwd(),
  "outputs",
  "source-ledger",
  "ledger.json",
);

if (!inputPath) {
  throw new Error("必须通过 --input 指定本地研究批次 JSON");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readLedger() {
  try {
    return parseSourceLedger(await readJson(ledgerPath));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return emptySourceLedger();
    }
    throw error;
  }
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

const manifest = await readJson(inputPath);
if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
  throw new Error("研究批次清单必须是对象");
}
const batchInput = {
  id: manifest.id,
  label: manifest.label,
  createdAt: manifest.createdAt,
  sources: manifest.sources,
  evidence: manifest.evidence,
};
const ledger = await readLedger();
const existing = ledger.researchBatches.find((batch) => batch.id === batchInput.id);

if (existing) {
  const sameCandidates = JSON.stringify({
    label: existing.label,
    createdAt: existing.createdAt,
    sources: existing.sourceCandidates,
    evidence: existing.evidenceCandidates,
  }) === JSON.stringify({
    label: batchInput.label,
    createdAt: batchInput.createdAt,
    sources: batchInput.sources,
    evidence: batchInput.evidence,
  });
  if (!sameCandidates) {
    throw new Error(`研究批次 ${batchInput.id} 已存在但内容不同`);
  }
  console.log(
    `研究批次已存在：${existing.label}，${existing.sourceCandidates.length} 个来源，${existing.evidenceCandidates.length} 条候选字段`,
  );
  process.exit(0);
}

const next = createResearchBatch(ledger, batchInput);
const imported = next.researchBatches.at(-1);
if (!imported) throw new Error("研究批次未创建");

if (checkOnly) {
  console.log(
    `研究批次有效：${imported.label}，${imported.sourceCandidates.length} 个来源，${imported.evidenceCandidates.length} 条候选字段`,
  );
} else {
  await writeAtomic(ledgerPath, next);
  console.log(
    `已导入待裁定研究批次：${imported.label}，${imported.sourceCandidates.length} 个来源，${imported.evidenceCandidates.length} 条候选字段`,
  );
}
