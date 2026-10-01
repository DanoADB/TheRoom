export type NavFreshness = { updatedAt: string | null; count: number };

export function hasNewNavItems(latest: NavFreshness, seen: NavFreshness | null) {
  if (!latest.updatedAt || latest.count <= 0 || !seen) return false;
  if (!seen.updatedAt) return latest.count > seen.count;
  const timeDelta = Date.parse(latest.updatedAt) - Date.parse(seen.updatedAt);
  return timeDelta > 0 || (timeDelta === 0 && latest.count > seen.count);
}
