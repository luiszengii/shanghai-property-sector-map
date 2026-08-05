export const HOME_BUYER_PROFILE_STORAGE_KEY = "shfang-homebuyer-profile-v1";

export type CommuteMode = "driving" | "transit" | "walking" | "bicycling";
export type HomebuyerMemberId = "self" | "partner";

export interface WorkLocation {
  label: string;
  position: [number, number];
}

export interface HomebuyerMember {
  id: HomebuyerMemberId;
  label: string;
  workLocation: WorkLocation | null;
  primaryMode: CommuteMode;
  alternateMode: CommuteMode | null;
  commuteLimitMinutes: number;
  arrivalTime: string;
  departureTime: string;
}

export interface HomebuyerProfile {
  version: 1;
  budgetMinWan: number | null;
  budgetMaxWan: number | null;
  members: HomebuyerMember[];
}

const commuteModes = new Set<CommuteMode>(["driving", "transit", "walking", "bicycling"]);
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalBudget(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value / 10) * 10
    : null;
}

function parseMember(value: unknown, expectedId: HomebuyerMemberId): HomebuyerMember | null {
  if (!isRecord(value) || value.id !== expectedId) return null;
  const primaryMode = commuteModes.has(value.primaryMode as CommuteMode)
    ? value.primaryMode as CommuteMode
    : "driving";
  const alternateMode = commuteModes.has(value.alternateMode as CommuteMode)
    && value.alternateMode !== primaryMode
    ? value.alternateMode as CommuteMode
    : null;
  const location = isRecord(value.workLocation)
    && typeof value.workLocation.label === "string"
    && Array.isArray(value.workLocation.position)
    && value.workLocation.position.length === 2
    && value.workLocation.position.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ? {
        label: value.workLocation.label.slice(0, 40),
        position: [value.workLocation.position[0], value.workLocation.position[1]] as [number, number],
      }
    : null;

  return {
    id: expectedId,
    label: (typeof value.label === "string" ? value.label.trim() : "").slice(0, 6)
      || (expectedId === "self" ? "我" : "伴侣"),
    workLocation: location,
    primaryMode,
    alternateMode,
    commuteLimitMinutes: typeof value.commuteLimitMinutes === "number" && Number.isFinite(value.commuteLimitMinutes)
      ? Math.min(180, Math.max(10, Math.round(value.commuteLimitMinutes / 5) * 5))
      : 60,
    arrivalTime: typeof value.arrivalTime === "string" && timePattern.test(value.arrivalTime)
      ? value.arrivalTime
      : "09:00",
    departureTime: typeof value.departureTime === "string" && timePattern.test(value.departureTime)
      ? value.departureTime
      : "17:00",
  };
}

export function createEmptyHomebuyerProfile(): HomebuyerProfile {
  return {
    version: 1,
    budgetMinWan: null,
    budgetMaxWan: null,
    members: [
      {
        id: "self",
        label: "我",
        workLocation: null,
        primaryMode: "driving",
        alternateMode: null,
        commuteLimitMinutes: 60,
        arrivalTime: "09:00",
        departureTime: "17:00",
      },
    ],
  };
}

export function parseHomebuyerProfile(serialized: string | null): HomebuyerProfile | null {
  if (!serialized) return null;
  try {
    const raw: unknown = JSON.parse(serialized);
    if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.members)) return null;
    const self = parseMember(raw.members[0], "self");
    if (!self) return null;
    const partner = raw.members.length > 1 ? parseMember(raw.members[1], "partner") : null;
    const budgetMinWan = optionalBudget(raw.budgetMinWan);
    const budgetMaxWan = optionalBudget(raw.budgetMaxWan);
    return {
      version: 1,
      budgetMinWan,
      budgetMaxWan,
      members: partner ? [self, partner] : [self],
    };
  } catch {
    return null;
  }
}

export function validateHomebuyerProfile(profile: HomebuyerProfile): string[] {
  const issues: string[] = [];
  if (
    profile.budgetMinWan !== null
    && profile.budgetMaxWan !== null
    && profile.budgetMinWan > profile.budgetMaxWan
  ) {
    issues.push("最低总价不能高于最高总价。");
  }
  for (const member of profile.members) {
    if (!member.label.trim()) {
      issues.push(`请填写${member.id === "self" ? "你的" : "伴侣的"}称呼。`);
    }
    if (!member.workLocation) {
      issues.push(`请先确认${member.id === "self" ? "我" : member.label}的上班位置。`);
    }
    if (!Number.isFinite(member.commuteLimitMinutes) || member.commuteLimitMinutes < 10 || member.commuteLimitMinutes > 180) {
      issues.push(`${member.label || "成员"}的可接受单程应为 10—180 分钟。`);
    }
    if (!timePattern.test(member.arrivalTime) || !timePattern.test(member.departureTime)) {
      issues.push(`${member.label || "成员"}的上下班时间格式无效。`);
    }
  }
  return issues;
}
