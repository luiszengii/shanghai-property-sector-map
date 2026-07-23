import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const datasetPath = path.join(process.cwd(), "outputs", "xhs_analysis", "web_dataset.json");
  try {
    const payload = await readFile(datasetPath, "utf8");
    return new NextResponse(payload, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
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
