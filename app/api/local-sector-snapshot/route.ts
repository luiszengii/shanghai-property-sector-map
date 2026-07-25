import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { parseHfwgsjSectorSnapshot } from "@/src/lib/hfwgsj-sector-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const snapshotPaths = {
  "hfwgsj-private": [
    "outputs",
    "hfwgsj",
    "shanghai-market-sectors-2026-07-25.geojson",
  ],
  "anjuke-private": [
    "outputs",
    "anjuke",
    "shanghai-sector-boundaries-gcj02-2026-07-25.geojson",
  ],
  "fang-private": [
    "outputs",
    "fang",
    "shanghai-sector-boundaries-gcj02-2026-07-25.geojson",
  ],
} as const;

type LocalSnapshotSource = keyof typeof snapshotPaths;

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(request: NextRequest) {
  const requestedSource = request.nextUrl.searchParams.get("source")
    ?? "hfwgsj-private";
  if (!(requestedSource in snapshotPaths)) {
    return NextResponse.json(
      {
        code: "LOCAL_SNAPSHOT_SOURCE_INVALID",
        message: "不支持的本地板块数据源",
      },
      { status: 400, headers: privateHeaders },
    );
  }
  const source = requestedSource as LocalSnapshotSource;
  const snapshotPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    ...snapshotPaths[source],
  );
  try {
    const snapshot = parseHfwgsjSectorSnapshot(
      JSON.parse(await readFile(snapshotPath, "utf8")),
    );
    return NextResponse.json(snapshot, { headers: privateHeaders });
  } catch (error) {
    const missing = (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    );
    return NextResponse.json(
      {
        code: missing ? "LOCAL_SNAPSHOT_MISSING" : "LOCAL_SNAPSHOT_INVALID",
        message: missing
          ? `${source} 本地私有板块快照不存在`
          : `${source} 本地私有板块快照格式不正确`,
      },
      { status: missing ? 404 : 500, headers: privateHeaders },
    );
  }
}
