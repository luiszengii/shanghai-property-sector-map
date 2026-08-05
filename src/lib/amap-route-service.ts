import type { CommuteMode } from "./homebuyer-profile";
import type {
  CommutePeriod,
  CommuteRequest,
} from "./commute-estimate";

export type CommuteResultStatus = "ok" | "unavailable" | "error";

export interface CommuteResult {
  id: string;
  memberId: CommuteRequest["memberId"];
  mode: CommuteMode;
  period: CommutePeriod;
  status: CommuteResultStatus;
  durationMinutes?: number;
  reason?: string;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface AmapRouteDependencies {
  apiKey: string;
  fetcher?: Fetcher;
}

const routePath: Record<CommuteMode, string> = {
  driving: "driving",
  transit: "transit/integrated",
  walking: "walking",
  bicycling: "bicycling",
};

function resultBase(request: CommuteRequest) {
  return {
    id: request.id,
    memberId: request.memberId,
    mode: request.mode,
    period: request.period,
  };
}

function routeUrl(request: CommuteRequest, apiKey: string) {
  const url = new URL(`https://restapi.amap.com/v5/direction/${routePath[request.mode]}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("origin", request.origin.map((value) => value.toFixed(6)).join(","));
  url.searchParams.set("destination", request.destination.map((value) => value.toFixed(6)).join(","));
  url.searchParams.set("show_fields", "cost");
  if (request.mode === "transit") {
    url.searchParams.set("city1", "021");
    url.searchParams.set("city2", "021");
    url.searchParams.set("date", request.departureAt.slice(0, 10));
    url.searchParams.set("time", request.departureAt.slice(11, 16).replace(":", "-"));
    url.searchParams.set("strategy", "0");
  }
  return url;
}

async function estimateOne(
  request: CommuteRequest,
  dependencies: Required<AmapRouteDependencies>,
): Promise<CommuteResult> {
  if (!dependencies.apiKey) {
    return {
      ...resultBase(request),
      status: "unavailable",
      reason: "amap-web-service-key-missing",
    };
  }

  try {
    const response = await dependencies.fetcher(routeUrl(request, dependencies.apiKey), {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`AMap HTTP ${response.status}`);
    const payload = await response.json() as {
      status?: string;
      route?: {
        paths?: Array<{ duration?: string; cost?: { duration?: string } }>;
        transits?: Array<{ cost?: { duration?: string } }>;
      };
    };
    const routeOption = request.mode === "transit"
      ? payload.route?.transits?.[0]
      : payload.route?.paths?.[0];
    const durationSeconds = Number(
      routeOption?.cost?.duration
      ?? (request.mode === "bicycling" && routeOption && "duration" in routeOption
        ? routeOption.duration
        : undefined),
    );
    if (payload.status !== "1" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return { ...resultBase(request), status: "error", reason: "no-route-result" };
    }
    return {
      ...resultBase(request),
      status: "ok",
      durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    };
  } catch {
    return { ...resultBase(request), status: "error", reason: "route-request-failed" };
  }
}

export async function estimateCommutesWithAmap(
  requests: CommuteRequest[],
  dependencies: AmapRouteDependencies,
): Promise<CommuteResult[]> {
  const resolvedDependencies: Required<AmapRouteDependencies> = {
    apiKey: dependencies.apiKey,
    fetcher: dependencies.fetcher ?? fetch,
  };
  return Promise.all(requests.slice(0, 8).map((request) => estimateOne(request, resolvedDependencies)));
}
