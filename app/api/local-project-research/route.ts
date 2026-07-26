import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isLocalRouteEnabled, localRouteNotFound } from "@/src/lib/local-route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isLocalRouteEnabled()) return localRouteNotFound();
  try {
    const target = path.join(process.cwd(), "outputs", "local-project-research.json");
    const value: unknown = JSON.parse(await readFile(target, "utf8"));
    if (
      !value
      || typeof value !== "object"
      || Array.isArray(value)
      || (value as { schemaVersion?: unknown }).schemaVersion !== 1
      || !(value as { projects?: unknown }).projects
      || typeof (value as { projects?: unknown }).projects !== "object"
      || Array.isArray((value as { projects?: unknown }).projects)
    ) {
      throw new Error("本地项目研究文件格式无效");
    }
    return NextResponse.json(value, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "本地项目研究文件不存在或格式无效" },
      {
        status: 404,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }
}
