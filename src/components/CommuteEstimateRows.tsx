/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
"use client";

import { AlertTriangle, Clock3, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CommuteResult } from "@/src/lib/amap-route-service";
import { buildCommuteRequests } from "@/src/lib/commute-estimate";
import { getOrLoadCommuteResults } from "@/src/lib/commute-result-cache";
import type { CommuteMode, HomebuyerMember, HomebuyerProfile } from "@/src/lib/homebuyer-profile";

const modeLabels: Record<CommuteMode, string> = {
  driving: "驾车",
  transit: "公交",
  walking: "步行",
  bicycling: "骑行",
};

type LoadState = "loading" | "ready" | "error";

function modeText(member: HomebuyerMember, mode: CommuteMode, results: CommuteResult[]) {
  const result = results.find((candidate) => candidate.memberId === member.id && candidate.mode === mode);
  if (result?.reason === "amap-web-service-key-missing") {
    return `${modeLabels[mode]}待配置`;
  }
  if (!result || result.status !== "ok") {
    return `${modeLabels[mode]}暂不可算`;
  }
  return `${modeLabels[mode]} ${result.durationMinutes} 分钟`;
}

function formatShanghaiTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function rowSeverity(member: HomebuyerMember, results: CommuteResult[]) {
  const durations = results
    .filter((result) => result.memberId === member.id && result.status === "ok")
    .flatMap((result) => result.durationMinutes ?? []);
  if (durations.some((duration) => duration > member.commuteLimitMinutes)) return "danger";
  if (durations.some((duration) => duration >= member.commuteLimitMinutes - 10)) return "warning";
  return "normal";
}

export function CommuteEstimateRows({
  profile,
  projectPosition,
}: {
  profile: HomebuyerProfile;
  projectPosition: [number, number];
}) {
  const requests = useMemo(
    () => buildCommuteRequests(profile, projectPosition),
    [profile, projectPosition],
  );
  const [state, setState] = useState<LoadState>("loading");
  const [results, setResults] = useState<CommuteResult[]>([]);
  const [queriedAt, setQueriedAt] = useState<string | null>(null);
  const hasDriving = requests.some((request) => request.mode === "driving");

  useEffect(() => {
    let active = true;

    getOrLoadCommuteResults(requests, async () => {
      const response = await fetch("/api/commute-estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Route estimate ${response.status}`);
      return response.json() as Promise<{ results: CommuteResult[]; queriedAt: string }>;
    })
      .then((payload) => {
        if (!active) return;
        setResults(payload.results);
        setQueriedAt(payload.queriedAt);
        setState("ready");
      })
      .catch(() => {
        if (!active) return;
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [requests]);

  return (
    <section className="commute-estimates" aria-labelledby="commute-estimates-heading" aria-live="polite">
      <div className="commute-estimates-heading">
        <h3 id="commute-estimates-heading">通勤时间</h3>
        {state === "loading" && <LoaderCircle className="spin" size={17} aria-label="正在计算通勤" />}
        {state === "error" && <AlertTriangle size={17} aria-label="通勤计算失败" />}
        {state === "ready" && <Clock3 size={17} aria-hidden="true" />}
      </div>
      <div
        className="commute-estimate-rows commute-estimate-row"
        data-member-count={profile.members.length}
        style={{
          gridTemplateColumns: profile.members.length > 1
            ? "repeat(2, minmax(0, 1fr))"
            : "minmax(0, 1fr)",
        }}
      >
        {profile.members.map((member) => {
          const modes = [member.primaryMode, member.alternateMode].filter((mode): mode is CommuteMode => Boolean(mode));
          return (
            <p key={member.id} data-severity={state === "ready" ? rowSeverity(member, results) : "normal"}>
              {profile.members.length > 1 && <strong>{member.label}</strong>}
              {state === "loading" ? (
                <span className="commute-row-loading">正在计算路线…</span>
              ) : state === "error" ? (
                <span>暂时无法计算</span>
              ) : (
                <>
                  {modes.map((mode) => <span key={mode}>{modeText(member, mode, results)}</span>)}
                </>
              )}
            </p>
          );
        })}
      </div>
      {hasDriving && queriedAt && (
        <small>实时路况 · {formatShanghaiTime(queriedAt)} 查询 · 暂不支持固定时间查询</small>
      )}
    </section>
  );
}
