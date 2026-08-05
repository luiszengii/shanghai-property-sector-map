type ClosestTarget = EventTarget & {
  closest?: (selector: string) => Element | null;
};

export function shouldDismissDetail(target: EventTarget | null) {
  const candidate = target as ClosestTarget | null;
  return !candidate?.closest?.(".detail-card");
}
