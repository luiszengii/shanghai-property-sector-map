import type { CommuteResult } from "./amap-route-service";
import type { CommuteRequest } from "./commute-estimate";

export interface CommuteResultPayload {
  results: CommuteResult[];
  queriedAt: string;
}

const completedResults = new Map<string, CommuteResultPayload>();
const pendingResults = new Map<string, Promise<CommuteResultPayload>>();

function cacheKey(requests: CommuteRequest[]) {
  return JSON.stringify(requests);
}

export function getOrLoadCommuteResults(
  requests: CommuteRequest[],
  load: () => Promise<CommuteResultPayload>,
) {
  const key = cacheKey(requests);
  const completed = completedResults.get(key);
  if (completed) return Promise.resolve(completed);

  const pending = pendingResults.get(key);
  if (pending) return pending;

  const next = Promise.resolve()
    .then(load)
    .then((payload) => {
      completedResults.set(key, payload);
      return payload;
    })
    .finally(() => pendingResults.delete(key));
  pendingResults.set(key, next);
  return next;
}

export function clearCommuteResultCache() {
  completedResults.clear();
  pendingResults.clear();
}
