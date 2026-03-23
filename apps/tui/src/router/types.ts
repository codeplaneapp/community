export enum ScreenName {
  // Top-level screens (9)
  Dashboard = "Dashboard",
  RepoList = "RepoList",
  Search = "Search",
  Notifications = "Notifications",
  Workspaces = "Workspaces",
  Agents = "Agents",
  Settings = "Settings",
  Organizations = "Organizations",
  Sync = "Sync",

  // Repo-scoped screens (14)
  RepoOverview = "RepoOverview",
  Issues = "Issues",
  IssueDetail = "IssueDetail",
  IssueCreate = "IssueCreate",
  IssueEdit = "IssueEdit",
  Landings = "Landings",
  LandingDetail = "LandingDetail",
  LandingCreate = "LandingCreate",
  LandingEdit = "LandingEdit",
  DiffView = "DiffView",
  Workflows = "Workflows",
  WorkflowRunDetail = "WorkflowRunDetail",
  Wiki = "Wiki",
  WikiDetail = "WikiDetail",

  // Workspace detail (2)
  WorkspaceDetail = "WorkspaceDetail",
  WorkspaceCreate = "WorkspaceCreate",

  // Agent detail (4)
  AgentSessionList = "AgentSessionList",
  AgentChat = "AgentChat",
  AgentSessionCreate = "AgentSessionCreate",
  AgentSessionReplay = "AgentSessionReplay",

  // Org detail (3)
  OrgOverview = "OrgOverview",
  OrgTeamDetail = "OrgTeamDetail",
  OrgSettings = "OrgSettings",
}

export interface ScreenEntry {
  /** Unique instance ID — generated via crypto.randomUUID() at push time */
  id: string;
  /** Which screen to render */
  screen: ScreenName;
  /** Screen-specific parameters (repo owner, repo name, issue number, etc.) */
  params: Record<string, string>;
  /** Display text for the breadcrumb trail in the header bar */
  breadcrumb: string;
  /** Cached scroll position for back-navigation restoration. Set by ScreenRouter on pop. */
  scrollPosition?: number;
}

export interface NavigationContext {
  /** The full navigation stack, ordered bottom-to-top */
  stack: readonly ScreenEntry[];
  /** The top-of-stack entry (the currently visible screen) */
  currentScreen: ScreenEntry;
  /** Push a new screen onto the stack */
  push(screen: ScreenName, params?: Record<string, string>): void;
  /** Pop the top screen and return to the previous one */
  pop(): void;
  /** Replace the top-of-stack screen without growing the stack */
  replace(screen: ScreenName, params?: Record<string, string>): void;
  /** Clear the stack and push a new root screen (go-to navigation) */
  reset(screen: ScreenName, params?: Record<string, string>): void;
  /** Whether there is a screen to go back to */
  canGoBack: boolean;
  /** Extracted repo context from the current stack, or null */
  repoContext: { owner: string; repo: string } | null;
  /** Extracted org context from the current stack, or null */
  orgContext: { org: string } | null;
  /** Save scroll position for an entry */
  saveScrollPosition: (entryId: string, position: number) => void;
  /** Get scroll position for an entry */
  getScrollPosition: (entryId: string) => number | undefined;
}

export interface ScreenComponentProps {
  /** The ScreenEntry for this screen instance */
  entry: ScreenEntry;
  /** Convenience: parsed params */
  params: Record<string, string>;
}

export interface ScreenDefinition {
  /** The React component to render for this screen */
  component: React.ComponentType<ScreenComponentProps>;
  /** Whether this screen requires repo context (owner + repo in params) */
  requiresRepo: boolean;
  /** Whether this screen requires org context (org in params) */
  requiresOrg: boolean;
  /** Function to generate breadcrumb label from params */
  breadcrumbLabel: (params: Record<string, string>) => string;
}

export const MAX_STACK_DEPTH = 32;
export const DEFAULT_ROOT_SCREEN = ScreenName.Dashboard;
