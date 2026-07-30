import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const PRIVATE_DATA_REPOSITORY =
  "luiszengii/shanghai-property-sector-map-private-data";

export const LOCAL_AMAP_VARIABLES = [
  "NEXT_PUBLIC_AMAP_KEY",
  "NEXT_PUBLIC_AMAP_SECURITY_JS_CODE",
];

export function linkPrivateData(root) {
  const privateOutputs = path.join(root, ".private-data", "outputs");
  const localOutputs = path.join(root, "outputs");

  if (!existsSync(privateOutputs)) {
    return { status: "private-data-missing", localOutputs, privateOutputs };
  }

  if (existsSync(localOutputs) || lstatExists(localOutputs)) {
    const stats = lstatSync(localOutputs);
    if (stats.isSymbolicLink()) {
      const currentTarget = path.resolve(
        path.dirname(localOutputs),
        readlinkSync(localOutputs),
      );
      if (currentTarget !== privateOutputs) {
        throw new Error(
          `outputs already points to a different location: ${currentTarget}`,
        );
      }
      return { status: "already-linked", localOutputs, privateOutputs };
    }

    return { status: "existing-outputs-preserved", localOutputs, privateOutputs };
  }

  const relativeTarget = path.relative(path.dirname(localOutputs), privateOutputs);
  symlinkSync(relativeTarget, localOutputs, "dir");
  return { status: "linked", localOutputs, privateOutputs };
}

export function upsertEnvContent(current, values) {
  const remaining = new Map(Object.entries(values));
  const lines = current ? current.replace(/\r\n/g, "\n").split("\n") : [];
  const output = [];

  for (const line of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!match || !remaining.has(match[1])) {
      output.push(line);
      continue;
    }

    output.push(`${match[1]}=${formatEnvValue(remaining.get(match[1]))}`);
    remaining.delete(match[1]);
  }

  while (output.length > 0 && output.at(-1) === "") output.pop();
  for (const [name, value] of remaining) {
    output.push(`${name}=${formatEnvValue(value)}`);
  }

  return `${output.join("\n")}\n`;
}

export function writeLocalEnv(root, values) {
  const envPath = path.join(root, ".env.local");
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const next = upsertEnvContent(current, values);
  const temporaryPath = path.join(root, `.env.local.tmp-${process.pid}`);

  mkdirSync(root, { recursive: true });
  writeFileSync(temporaryPath, next, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, envPath);
  chmodSync(envPath, 0o600);

  return envPath;
}

function formatEnvValue(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("environment value must be a non-empty string");
  }
  if (!/^[A-Za-z0-9_.:/-]+$/.test(value)) {
    throw new Error("environment value contains unsupported characters");
  }
  return value;
}

function lstatExists(target) {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
