import path from "node:path";
import { fileURLToPath } from "node:url";
import { linkPrivateData } from "./local-workspace-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = linkPrivateData(root);

if (result.status === "linked") {
  console.log("Linked private study data to the ignored local outputs/ path.");
} else if (result.status === "existing-outputs-preserved") {
  console.log("Kept the existing local outputs/ directory.");
} else if (result.status === "private-data-missing") {
  console.log(
    "Private data is not initialized; public map development remains available.",
  );
}
