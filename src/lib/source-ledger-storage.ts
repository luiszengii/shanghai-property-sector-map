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
  parseSourceLedger,
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
  const target = ledgerPath();
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(target)}-${randomUUID()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}
