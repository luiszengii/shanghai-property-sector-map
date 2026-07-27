import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  emptySourceLedger,
  parsePublicProjectProjection,
  parseSourceLedger,
  type PublicProjectProjection,
  type SourceLedger,
} from "@/src/lib/source-ledger";

function ledgerPath() {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "outputs",
    "source-ledger",
    "ledger.json",
  );
}

function publicProjectionPath() {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "src",
    "data",
    "project-public-projection.json",
  );
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}-${randomUUID()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

export async function readSourceLedger(): Promise<SourceLedger> {
  try {
    return parseSourceLedger(JSON.parse(await readFile(ledgerPath(), "utf8")));
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return emptySourceLedger();
    }
    throw error;
  }
}

export async function writeSourceLedger(ledger: SourceLedger) {
  const validated = parseSourceLedger(ledger);
  await writeJsonAtomic(ledgerPath(), validated);
}

export async function readPublicProjectProjection() {
  return parsePublicProjectProjection(
    JSON.parse(await readFile(publicProjectionPath(), "utf8")),
  );
}

export async function writePublicProjectProjection(
  projection: PublicProjectProjection,
) {
  await writeJsonAtomic(
    publicProjectionPath(),
    parsePublicProjectProjection(projection),
  );
}
