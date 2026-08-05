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
const projectDetailPath = "/projects/project_%E4%B8%9C%E5%B2%B8%E8%A7%82%E9%82%B8";
const projectDetail = await request(projectDetailPath);
const privateCheckDefinitions = [
  { path: "/sector-editor" },
  { path: "/sources" },
  { path: "/api/sector-editor-versions" },
  { path: "/api/sector-editor-versions", init: {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  } },
  { path: "/api/source-ledger" },
  { path: "/api/source-ledger", init: {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  } },
  { path: "/api/local-sector-snapshot" },
  { path: "/api/local-project-research" },
  { path: "/api/xhs-observations" },
];
const privateChecks = await Promise.all(privateCheckDefinitions.map(async (check) => ({
  ...check,
  result: await request(check.path, check.init),
})));

if (home.status !== 200) failures.push(`/ returned ${home.status}`);
if (observations.status !== 200) failures.push(`/observations returned ${observations.status}`);
if (projectDetail.status !== 200) {
  failures.push(`${projectDetailPath} returned ${projectDetail.status}`);
}
for (const { path, init, result } of privateChecks) {
  if (result.status !== 404) {
    failures.push(`private endpoint ${init?.method ?? "GET"} ${path} returned ${result.status}`);
  }
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

console.log("PUBLIC_DEPLOYMENT_GREEN: public pages and project detail are available; local-only routes return 404");
