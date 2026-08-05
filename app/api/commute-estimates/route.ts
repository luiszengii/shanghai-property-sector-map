import { NextRequest, NextResponse } from "next/server";
import { estimateCommutesWithAmap } from "@/src/lib/amap-route-service";
import type { CommuteRequest } from "@/src/lib/commute-estimate";
import type { CommuteMode, HomebuyerMemberId } from "@/src/lib/homebuyer-profile";

export const dynamic = "force-dynamic";

const modes = new Set<CommuteMode>(["driving", "transit", "walking", "bicycling"]);
const memberIds = new Set<HomebuyerMemberId>(["self", "partner"]);
const periods = new Set(["morning", "evening"]);
const requestWindows = new Map<string, number[]>();

function validPosition(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || value.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate))) {
    return false;
  }
  const [longitude, latitude] = value;
  return longitude >= 118 && longitude <= 124 && latitude >= 28 && latitude <= 34;
}

function validDeparture(value: unknown) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  const now = Date.now();
  return Number.isFinite(timestamp) && timestamp > now - 60_000 && timestamp <= now + 7 * 24 * 60 * 60 * 1000;
}

function parseRequests(value: unknown): CommuteRequest[] | null {
  if (!value || typeof value !== "object" || !("requests" in value)) return null;
  const requests = (value as { requests?: unknown }).requests;
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > 8) return null;
  const parsed: CommuteRequest[] = [];
  const ids = new Set<string>();
  for (const raw of requests) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Partial<CommuteRequest>;
    if (
      typeof item.id !== "string"
      || item.id.length > 80
      || !memberIds.has(item.memberId as HomebuyerMemberId)
      || !modes.has(item.mode as CommuteMode)
      || !periods.has(item.period as string)
      || !validPosition(item.origin)
      || !validPosition(item.destination)
      || !validDeparture(item.departureAt)
      || item.id !== `${item.memberId}:${item.mode}:${item.period}`
      || ids.has(item.id)
    ) return null;
    ids.add(item.id);
    parsed.push(item as CommuteRequest);
  }
  return parsed;
}

function isRateLimited(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  const client = request.headers.get("x-real-ip")
    || forwardedFor?.[forwardedFor.length - 1]
    || "local";
  const now = Date.now();
  const recent = (requestWindows.get(client) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 12) return true;
  recent.push(now);
  requestWindows.set(client, recent);
  return false;
}

export async function POST(request: NextRequest) {
  if (isRateLimited(request)) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试。" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
  }
  const requests = parseRequests(payload);
  if (!requests) {
    return NextResponse.json(
      { error: "通勤请求参数无效。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const results = await estimateCommutesWithAmap(requests, {
    apiKey: process.env.AMAP_WEB_SERVICE_KEY ?? "",
  });
  return NextResponse.json(
    { results, queriedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
