import { ScreenName, type ScreenDefinition } from "./types.js";
import { PlaceholderScreen } from "../screens/PlaceholderScreen.js";

export const screenRegistry: Record<ScreenName, ScreenDefinition> = {
  // --- Top-level screens (no repo/org required) ---
  [ScreenName.Dashboard]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Dashboard",
  },
  [ScreenName.RepoList]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Repositories",
  },
  [ScreenName.Search]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Search",
  },
  [ScreenName.Notifications]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Notifications",
  },
  [ScreenName.Workspaces]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Workspaces",
  },
  [ScreenName.Agents]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Agents",
  },
  [ScreenName.Settings]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Settings",
  },
  [ScreenName.Organizations]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Organizations",
  },
  [ScreenName.Sync]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Sync",
  },

  // --- Repo-scoped screens ---
  [ScreenName.RepoOverview]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (params) => `${params.owner}/${params.repo}`,
  },
  [ScreenName.Issues]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: () => "Issues",
  },
  [ScreenName.IssueDetail]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (params) => `#${params.number}`,
  },
  [ScreenName.IssueCreate]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: () => "New Issue",
  },
  [ScreenName.IssueEdit]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (params) => `Edit #${params.number}`,
  },
  [ScreenName.Landings]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: () => "Landings",
  },
  [ScreenName.LandingDetail]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (params) => `!${params.number}`,
  },
  [ScreenName.LandingCreate]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: () => "New Landing",
  },
  [ScreenName.LandingEdit]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (params) => `Edit !${params.number}`,
  },
  [ScreenName.DiffView]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: () => "Diff",
  },
  [ScreenName.Workflows]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: () => "Workflows",
  },
  [ScreenName.WorkflowRunDetail]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (params) => `Run #${params.runId}`,
  },
  [ScreenName.Wiki]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: () => "Wiki",
  },
  [ScreenName.WikiDetail]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (params) => params.page || "Page",
  },

  // --- Workspace detail ---
  [ScreenName.WorkspaceDetail]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: (params) => params.workspaceId?.slice(0, 8) || "Workspace",
  },
  [ScreenName.WorkspaceCreate]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "New Workspace",
  },

  // --- Agent detail ---
  [ScreenName.AgentSessionList]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Agent Sessions",
  },
  [ScreenName.AgentChat]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: (params) => params.sessionId?.slice(0, 8) || "Chat",
  },
  [ScreenName.AgentSessionCreate]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "New Session",
  },
  [ScreenName.AgentSessionReplay]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: (params) => params.sessionId?.slice(0, 8) || "Replay",
  },

  // --- Org-scoped screens ---
  [ScreenName.OrgOverview]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: true,
    breadcrumbLabel: (params) => params.org || "Organization",
  },
  [ScreenName.OrgTeamDetail]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: true,
    breadcrumbLabel: (params) => params.team || "Team",
  },
  [ScreenName.OrgSettings]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: true,
    breadcrumbLabel: () => "Settings",
  },
};

// Registry completeness check (runs at import time)
const missingScreens = Object.values(ScreenName).filter(
  (name) => !(name in screenRegistry),
);
if (missingScreens.length > 0) {
  throw new Error(
    `Screen registry is missing entries for: ${missingScreens.join(", ")}`
  );
}
