/**
 * Tab bar label format at different breakpoints.
 * Used by E2E tests to construct expected terminal content.
 */
export const TAB_LABEL_FORMATS = {
  orgOverview: {
    minimum: {
      repos: "1:Repos",
      members: "2:Memb.",
      teams: "3:Teams",
      settings: "4:Sett.",
    },
    standard: {
      repos: "1:Repositories",
      members: "2:Members",
      teams: "3:Teams",
      settings: "4:Settings",
    },
  },
  teamDetail: {
    minimum: {
      members: "1:Memb.",
      repos: "2:Repos",
    },
    standard: {
      members: "1:Members",
      repos: "2:Repositories",
    },
  },
} as const;

/** Maximum filter input length (enforced by <input maxLength>) */
export const MAX_FILTER_LENGTH = 100;

/** Maximum items per tab (pagination cap from architecture spec) */
export const MAX_ITEMS_PER_TAB = 500;

/** Format count for display, matching component logic */
export function formatCount(count: number | null): string {
  if (count === null) return "";
  if (count > 9999) return " (9999+)";
  if (count > 999) return ` (${(count / 1000).toFixed(1)}K)`;
  return ` (${count})`;
}
