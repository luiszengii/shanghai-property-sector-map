import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import {
  buildUserReviewedOverrideCollection,
  emptyUserReviewedOverrideCollection,
  parseUserReviewedOverrideCollection,
  summarizeSectorEditorVersion,
  type UserReviewedOverrideCollection,
} from "@/src/lib/sector-editor-versions";
import {
  appendSectorEditorVersion,
  listSectorEditorVersions,
  readSectorEditorVersion,
  type SectorEditorVersionStorePaths,
} from "@/src/lib/sector-editor-version-store";
import { isLocalRouteEnabled, localRouteNotFound } from "@/src/lib/local-route-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

const versionDirectory = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "geo",
  "sector-editor-versions",
);
const versionStorePath = path.join(versionDirectory, "versions.json");
const versionObjectDirectory = path.join(versionDirectory, "objects");
const versionStorePaths: SectorEditorVersionStorePaths = {
  manifestPath: versionStorePath,
  objectDirectory: versionObjectDirectory,
};
const overridePath = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "src",
  "data",
  "sectors",
  "user-reviewed-overrides.wgs84.json",
);
const registryPath = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "src",
  "data",
  "sectors",
  "registry.json",
);

function isLocalRequest(request: NextRequest) {
  return ["localhost", "127.0.0.1", "::1"].includes(request.nextUrl.hostname);
}

function localOnlyResponse() {
  return NextResponse.json({
    code: "SECTOR_EDITOR_VERSIONS_LOCAL_ONLY",
    message: "持久版本只允许通过本机编辑器读写",
  }, {
    status: 403,
    headers: privateHeaders,
  });
}

async function writeJsonAtomically(targetPath: string, value: unknown) {
  const targetDirectory = path.dirname(targetPath);
  await mkdir(targetDirectory, { recursive: true });
  const temporaryPath = path.join(
    targetDirectory,
    `.${path.basename(targetPath)}-${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, targetPath);
}

async function readCurrentOverrides(): Promise<UserReviewedOverrideCollection> {
  try {
    return parseUserReviewedOverrideCollection(
      JSON.parse(await readFile(overridePath, "utf8")),
    );
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return emptyUserReviewedOverrideCollection();
    }
    throw error;
  }
}

async function readRegisteredSectorIds() {
  const value: unknown = JSON.parse(await readFile(registryPath, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("板块身份登记表格式无效");
  }
  const sectors = (value as { sectors?: unknown }).sectors;
  if (!Array.isArray(sectors)) throw new Error("板块身份登记表缺少 sectors");
  return new Set(sectors.flatMap((sector) => (
    sector
    && typeof sector === "object"
    && !Array.isArray(sector)
    && typeof (sector as { id?: unknown }).id === "string"
      ? [(sector as { id: string }).id]
      : []
  )));
}

export async function GET(request: NextRequest) {
  if (!isLocalRouteEnabled()) return localRouteNotFound();
  if (!isLocalRequest(request)) return localOnlyResponse();
  try {
    const requestedId = request.nextUrl.searchParams.get("id");
    if (requestedId) {
      const version = await readSectorEditorVersion(
        versionStorePaths,
        requestedId,
      );
      if (!version) {
        return NextResponse.json({
          code: "SECTOR_EDITOR_VERSION_NOT_FOUND",
          message: "没有找到这个持久版本",
        }, {
          status: 404,
          headers: privateHeaders,
        });
      }
      return NextResponse.json({ version }, { headers: privateHeaders });
    }
    return NextResponse.json({
      versions: await listSectorEditorVersions(versionStorePaths),
    }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({
      code: "SECTOR_EDITOR_VERSION_STORE_INVALID",
      message: "项目版本文件无法读取，请检查项目数据文件",
    }, {
      status: 500,
      headers: privateHeaders,
    });
  }
}

export async function POST(request: NextRequest) {
  if (!isLocalRouteEnabled()) return localRouteNotFound();
  if (!isLocalRequest(request)) return localOnlyResponse();
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("保存内容不是有效对象");
    }
    const body = input as Record<string, unknown>;
    const version = await appendSectorEditorVersion(versionStorePaths, {
      label: typeof body.label === "string" ? body.label : undefined,
      activeId: typeof body.activeId === "string" ? body.activeId : null,
      drafts: body.drafts,
    }, {
      id: `sector-editor-version-${randomUUID()}`,
      createdAt: new Date().toISOString(),
    });
    const [registeredSectorIds, previousOverrides] = await Promise.all([
      readRegisteredSectorIds(),
      readCurrentOverrides(),
    ]);
    const overrideResult = buildUserReviewedOverrideCollection({
      version,
      registeredSectorIds,
      previous: previousOverrides,
    });
    await writeJsonAtomically(overridePath, overrideResult.collection);
    return NextResponse.json({
      version: summarizeSectorEditorVersion(version),
      publishedDraftCount: overrideResult.publishedDraftCount,
      skippedUnregisteredDraftIds: overrideResult.skippedUnregisteredDraftIds,
    }, {
      status: 201,
      headers: privateHeaders,
    });
  } catch (error) {
    return NextResponse.json({
      code: "SECTOR_EDITOR_VERSION_SAVE_FAILED",
      message: error instanceof Error ? error.message : "保存项目地图版本失败",
    }, {
      status: 400,
      headers: privateHeaders,
    });
  }
}
