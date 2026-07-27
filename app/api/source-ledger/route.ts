import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
  buildPublicProjectProjection,
  buildPublicProjectProjectionFromSnapshot,
  buildSnapshotProjectionPreview,
  createLedgerSnapshot,
  saveEvidenceRevision,
  saveSourceRevision,
  type EvidenceConfidence,
  type PublicationStatus,
  type SourceAllowedUse,
} from "@/src/lib/source-ledger";
import {
  readSourceLedger,
  readPublicProjectProjection,
  writePublicProjectProjection,
  writeSourceLedger,
} from "@/src/lib/source-ledger-storage";
import {
  isLocalRouteEnabled,
  localRouteNotFound,
} from "@/src/lib/local-route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function isLocalRequest(request: NextRequest) {
  return ["localhost", "127.0.0.1", "::1"].includes(request.nextUrl.hostname);
}

function localOnlyResponse() {
  return NextResponse.json({
    code: "SOURCE_LEDGER_LOCAL_ONLY",
    message: "来源台账只允许通过本机开发环境读写",
  }, {
    status: 403,
    headers: privateHeaders,
  });
}

function recordBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("请求内容必须是对象");
  }
  return value as Record<string, unknown>;
}

function stringValue(
  body: Record<string, unknown>,
  key: string,
  allowEmpty = false,
) {
  const value = body[key];
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${key} 必须是${allowEmpty ? "" : "非空"}字符串`);
  }
  return value;
}

function nullableString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${key} 必须是字符串或 null`);
  return value;
}

async function currentPayload() {
  const ledger = await readSourceLedger();
  const generatedAt = new Date().toISOString();
  return {
    ledger,
    candidateProjection: buildPublicProjectProjection(ledger, generatedAt),
    publishedProjection: await readPublicProjectProjection(),
    snapshotPreviews: ledger.snapshots.map((snapshot) => (
      buildSnapshotProjectionPreview(ledger, snapshot.id, generatedAt)
    )),
  };
}

export async function GET(request: NextRequest) {
  if (!isLocalRouteEnabled()) return localRouteNotFound();
  if (!isLocalRequest(request)) return localOnlyResponse();
  try {
    return NextResponse.json(await currentPayload(), { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({
      code: "SOURCE_LEDGER_INVALID",
      message: error instanceof Error ? error.message : "来源台账无法读取",
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
    const requestBody = recordBody(await request.json());
    const action = stringValue(requestBody, "action");
    const body = recordBody(requestBody.data);
    const ledger = await readSourceLedger();
    const now = new Date().toISOString();
    let next = ledger;

    if (action === "saveSource") {
      next = saveSourceRevision(ledger, {
        id: typeof body.id === "string" && body.id.trim()
          ? body.id
          : `source-${randomUUID()}`,
        title: stringValue(body, "title"),
        publisher: stringValue(body, "publisher"),
        url: stringValue(body, "url", true),
        sourceType: stringValue(body, "sourceType"),
        licenseStatus: stringValue(body, "licenseStatus"),
        allowedUse: stringValue(body, "allowedUse") as SourceAllowedUse,
        note: stringValue(body, "note", true),
      }, {
        revisionId: `source-revision-${randomUUID()}`,
        recordedAt: now,
      });
    } else if (action === "saveEvidence") {
      next = saveEvidenceRevision(ledger, {
        id: typeof body.id === "string" && body.id.trim()
          ? body.id
          : `evidence-${randomUUID()}`,
        objectType: "project",
        objectId: stringValue(body, "objectId"),
        field: stringValue(body, "field"),
        value: stringValue(body, "value"),
        sourceId: stringValue(body, "sourceId"),
        confidence: stringValue(body, "confidence") as EvidenceConfidence,
        publicationStatus: stringValue(body, "publicationStatus") as PublicationStatus,
        observedAt: stringValue(body, "observedAt"),
        reviewDueAt: nullableString(body, "reviewDueAt"),
        note: stringValue(body, "note", true),
      }, {
        revisionId: `evidence-revision-${randomUUID()}`,
        recordedAt: now,
      });
    } else if (action === "createSnapshot") {
      next = createLedgerSnapshot(ledger, {
        id: `ledger-snapshot-${randomUUID()}`,
        label: stringValue(body, "label"),
        createdAt: now,
      });
    } else if (action === "generatePublicProjection") {
      const snapshotId = stringValue(body, "snapshotId");
      if (body.confirmReviewed !== true) {
        throw new Error("生成公开数据前必须确认已人工复核该资料版本");
      }
      const projection = buildPublicProjectProjectionFromSnapshot(
        ledger,
        snapshotId,
        now,
      );
      const fieldCount = Object.values(projection.projects).reduce(
        (total, project) => total + project.fields.length,
        0,
      );
      if (fieldCount === 0) {
        throw new Error("该资料版本没有满足公开条件的字段，未修改公开数据");
      }
      await writePublicProjectProjection(projection);
      return NextResponse.json(await currentPayload(), {
        status: 201,
        headers: privateHeaders,
      });
    } else {
      throw new Error(`未知操作 ${action}`);
    }

    await writeSourceLedger(next);
    return NextResponse.json(await currentPayload(), {
      status: 201,
      headers: privateHeaders,
    });
  } catch (error) {
    return NextResponse.json({
      code: "SOURCE_LEDGER_SAVE_FAILED",
      message: error instanceof Error ? error.message : "来源台账保存失败",
    }, {
      status: 400,
      headers: privateHeaders,
    });
  }
}
