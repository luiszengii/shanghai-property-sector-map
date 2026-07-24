import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const candidatesPath = path.join(
  root,
  "src/data/sectors/reviewed-candidates.wgs84.json",
);
const outputPath = path.join(
  root,
  "src/data/sectors/reviewed-candidates.index.json",
);

const collection = JSON.parse(await readFile(candidatesPath, "utf8"));
const features = collection.features.map((feature) => ({
  id: feature.properties.id,
  labelPoint: feature.properties.labelPoint,
}));
const output = `${JSON.stringify({ schemaVersion: "1.0.0", features }, null, 2)}\n`;

if (checkOnly) {
  const current = await readFile(outputPath, "utf8");
  if (current !== output) {
    throw new Error(
      "板块客户端轻量索引已过期，请运行 npm run build:sector-client-index",
    );
  }
  console.log(`板块客户端轻量索引已同步：${features.length} 条`);
} else {
  await writeFile(outputPath, output);
  console.log(`生成板块客户端轻量索引：${features.length} 条`);
}
