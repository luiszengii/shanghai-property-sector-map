import process from "node:process";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
const failures = [];

async function request(pathname, init) {
  const response = await fetch(new URL(pathname, baseUrl), {
    redirect: "manual",
    ...init,
  });
  return {
    status: response.status,
    text: await response.text(),
  };
}

const home = await request("/");
const observations = await request("/observations");
const privateChecks = await Promise.all([
  request("/sector-editor"),
  request("/api/sector-editor-versions"),
  request("/api/sector-editor-versions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }),
  request("/api/local-sector-snapshot"),
  request("/api/local-project-research"),
  request("/api/xhs-observations"),
]);

if (home.status !== 200) failures.push(`/ returned ${home.status}`);
if (observations.status !== 200) failures.push(`/observations returned ${observations.status}`);
for (const [index, result] of privateChecks.entries()) {
  if (result.status !== 404) failures.push(`private endpoint ${index + 1} returned ${result.status}`);
}

const forbiddenHomeText = [
  "自己画板块",
  "微观世界私有快照",
  "安居客研究快照",
  "房天下研究快照",
  "RealtyNavi 授权研究快照",
  "用户观点 · 待核验",
];
for (const forbidden of forbiddenHomeText) {
  if (home.text.includes(forbidden)) failures.push(`homepage exposes "${forbidden}"`);
}
if (!observations.text.includes("PUBLIC RESEARCH SNAPSHOT")) {
  failures.push("observations page is missing its public snapshot marker");
}
if (observations.text.includes("LOCAL RESEARCH ARCHIVE")) {
  failures.push("observations page exposes the local research archive");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `PUBLIC_DEPLOYMENT_RED: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("PUBLIC_DEPLOYMENT_GREEN: public pages are available and local-only routes return 404");
