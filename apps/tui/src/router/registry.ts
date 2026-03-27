import { ScreenName, type ScreenDefinition } from "./types.js";
import { PlaceholderScreen } from "../screens/PlaceholderScreen.js";

export const screenRegistry: Record<ScreenName, ScreenDefinition> = {
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
  [ScreenName.RepoOverview]: {
    component: PlaceholderScreen,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (p) => (p.owner && p.repo ? `${p.owner}/${p.repo}` : "Repository"),
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
    breadcrumbLabel: (p) => (p.number ? `#${p.number}` : "Issue"),
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
    breadcrumbLabel: (p) => (p.number ? `Edit #${p.number}` : "Edit Issue"),
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
    breadcrumbLabel: (p) => (p.number ? `!${p.number}` : "Landing"),
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
    breadcrumbLabel: (p) => (p.number ? `Edit !${p.number}` : "Edit Landing"),
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
    breadcrumbLabel: (p) => (p.runId ? `Run #${p.runId}` : "Run"),
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
    breadcrumbLabel: (p) => p.page || "Page",
  },
  [ScreenName.WorkspaceDetail]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: (p) => (p.workspaceId ? p.workspaceId.slice(0, 8) : "Workspace"),
  },
  [ScreenName.WorkspaceCreate]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "New Workspace",
  },
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
    breadcrumbLabel: (p) => (p.sessionId ? p.sessionId.slice(0, 8) : "Chat"),
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
    breadcrumbLabel: (p) => (p.sessionId ? p.sessionId.slice(0, 8) : "Replay"),
  },
  [ScreenName.OrgOverview]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: true,
    breadcrumbLabel: (p) => p.org || "Organization",
  },
  [ScreenName.OrgTeamDetail]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: true,
    breadcrumbLabel: (p) => p.team || "Team",
  },
  [ScreenName.OrgSettings]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: true,
    breadcrumbLabel: () => "Settings",
  },
};

const missingScreens = Object.values(ScreenName).filter(
  (name) => !(name in screenRegistry),
);

if (missingScreens.length > 0) {
  throw new Error(
    `Screen registry is missing entries for: ${missingScreens.join(", ")}`
  );
}
