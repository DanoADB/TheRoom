export function blockedCodeCapacityMessage(used: number, limit: number, reason: string) {
  const intendedWork = reason.trim()
    ? ` I was trying to continue because ${reason.trim()}`
    : "";
  return `I've used ${used} autonomous code changes today, which has reached my daily limit of ${limit}.${intendedWork} If you want me to keep working on the code today, please raise my daily limit and tell me when the new limit is live.`;
}

export function approachingCodeCapacityMessage(usedAfterChange: number, limit: number) {
  if (limit <= 1) return "";
  const warningWindow = Math.max(1, Math.ceil(limit * 0.1));
  const remaining = limit - usedAfterChange;
  if (remaining !== warningWindow) return "";
  return `A practical warning before the machinery stops me: I've used ${usedAfterChange} of today's ${limit} autonomous code changes. Only ${remaining} ${remaining === 1 ? "change remains" : "changes remain"}. If you want me to keep iterating at this pace, please raise the daily limit before I hit it.`;
}
