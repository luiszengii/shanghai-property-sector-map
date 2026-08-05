import type {
  CommuteMode,
  HomebuyerMemberId,
  HomebuyerProfile,
} from "./homebuyer-profile";

export type CommutePeriod = "morning" | "evening";

export interface CommuteRequest {
  id: string;
  memberId: HomebuyerMemberId;
  mode: CommuteMode;
  period: CommutePeriod;
  origin: [number, number];
  destination: [number, number];
  departureAt: string;
}

const modeEstimate: Record<CommuteMode, { speedKph: number; circuity: number; bufferMinutes: number; minimumMinutes: number }> = {
  driving: { speedKph: 30, circuity: 1.3, bufferMinutes: 8, minimumMinutes: 15 },
  transit: { speedKph: 25, circuity: 1.35, bufferMinutes: 12, minimumMinutes: 20 },
  walking: { speedKph: 4.8, circuity: 1.25, bufferMinutes: 0, minimumMinutes: 10 },
  bicycling: { speedKph: 15, circuity: 1.2, bufferMinutes: 0, minimumMinutes: 10 },
};

function distanceKm(a: [number, number], b: [number, number]) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(b[1] - a[1]);
  const longitudeDelta = toRadians(b[0] - a[0]);
  const firstLatitude = toRadians(a[1]);
  const secondLatitude = toRadians(b[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function estimateMorningMinutes(mode: CommuteMode, origin: [number, number], destination: [number, number]) {
  const estimate = modeEstimate[mode];
  const travelMinutes = distanceKm(origin, destination) * estimate.circuity / estimate.speedKph * 60;
  return Math.min(150, Math.max(estimate.minimumMinutes, Math.ceil(travelMinutes + estimate.bufferMinutes)));
}

function shanghaiCalendarDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function nextFixedWorkday(now: Date) {
  const today = new Date(`${shanghaiCalendarDate(now)}T00:00:00Z`);
  for (let offset = 1; offset <= 6; offset += 1) {
    const candidate = new Date(today);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    if (candidate.getUTCDay() === 2 || candidate.getUTCDay() === 3) {
      return candidate.toISOString().slice(0, 10);
    }
  }
  throw new Error("未来六天内没有可用的周二或周三");
}

function departureTimestamp(date: string, clock: string, subtractMinutes = 0) {
  const [hours, minutes] = clock.split(":").map(Number);
  const dateTime = new Date(`${date}T00:00:00Z`);
  dateTime.setUTCMinutes(hours * 60 + minutes - subtractMinutes);
  return `${dateTime.toISOString().slice(0, 10)}T${dateTime.toISOString().slice(11, 16)}:00+08:00`;
}

export function buildCommuteRequests(
  profile: HomebuyerProfile,
  projectPosition: [number, number],
  now = new Date(),
): CommuteRequest[] {
  const date = nextFixedWorkday(now);
  const requests: CommuteRequest[] = [];

  for (const member of profile.members.slice(0, 2)) {
    if (!member.workLocation) continue;
    const modes = [member.primaryMode, member.alternateMode].filter((mode): mode is CommuteMode => Boolean(mode));
    for (const mode of modes) {
      const morningMinutes = estimateMorningMinutes(mode, projectPosition, member.workLocation.position);
      requests.push({
        id: `${member.id}:${mode}:morning`,
        memberId: member.id,
        mode,
        period: "morning",
        origin: projectPosition,
        destination: member.workLocation.position,
        departureAt: departureTimestamp(date, member.arrivalTime, morningMinutes),
      });
    }
  }

  return requests.slice(0, 4);
}
