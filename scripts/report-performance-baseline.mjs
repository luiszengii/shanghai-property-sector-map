import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function fileMetric(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const [content, fileStat] = await Promise.all([
    readFile(absolutePath, "utf8"),
    stat(absolutePath),
  ]);
  return {
    path: relativePath,
    bytes: fileStat.size,
    lines: content.split("\n").length,
  };
}

async function largestClientChunks() {
  const chunkDirectory = path.join(root, ".next", "static", "chunks");
  try {
    const names = (await readdir(chunkDirectory))
      .filter((name) => name.endsWith(".js"));
    const metrics = await Promise.all(names.map(async (name) => ({
      name,
      bytes: (await stat(path.join(chunkDirectory, name))).size,
    })));
    return metrics.sort((left, right) => right.bytes - left.bytes).slice(0, 8);
  } catch {
    return [];
  }
}

const [candidates, registry, places, chunks] = await Promise.all([
  fileMetric("src/data/sectors/reviewed-candidates.wgs84.json"),
  fileMetric("src/data/sectors/registry.json"),
  fileMetric("src/data/places.json"),
  largestClientChunks(),
]);

const report = {
  generatedAt: new Date().toISOString(),
  datasets: { candidates, registry, places },
  largestClientChunks: chunks,
};

console.log(JSON.stringify(report, null, 2));
