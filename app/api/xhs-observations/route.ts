import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cachedPayload: string | null = null;
let cachedMtimeMs = -1;

export async function GET() {
  const datasetPath = path.join(process.cwd(), "outputs", "xhs_analysis", "web_dataset.json");
  try {
    const fileStat = await stat(datasetPath);
    if (cachedPayload === null || cachedMtimeMs !== fileStat.mtimeMs) {
      cachedPayload = await readFile(datasetPath, "utf8");
      cachedMtimeMs = fileStat.mtimeMs;
    }
    return new NextResponse(cachedPayload, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "本地研究数据尚未生成，请先运行 python3 scripts/xhs_property_report.py" },
      { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
    );
  }
}
