import * as React from "react";

export enum ScreenName {
  // Top-level screens
  Dashboard = "Dashboard",
  RepoList = "RepoList",
  Search = "Search",
  Notifications = "Notifications",
  Workspaces = "Workspaces",
  Agents = "Agents",
  Settings = "Settings",
  Organizations = "Organizations",
  Sync = "Sync",

  // Repo-scoped screens
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

  // Workspace detail
  WorkspaceDetail = "WorkspaceDetail",
  WorkspaceCreate = "WorkspaceCreate",

  // Agent detail
  AgentSessionList = "AgentSessionList",
  AgentChat = "AgentChat",
  AgentSessionCreate = "AgentSessionCreate",
  AgentSessionReplay = "AgentSessionReplay",

  // Org detail
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
  /** Extracted repo context from the current screen's params, or null */
  repoContext: { owner: string; repo: string } | null;
  /** Extracted org context from the current screen's params, or null */
  orgContext: { org: string } | null;
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

/** Props injected into every screen component by ScreenRouter */
export interface ScreenComponentProps {
  /** The ScreenEntry for this screen instance */
  entry: ScreenEntry;
  /** Convenience: parsed params */
  params: Record<string, string>;
}

/** Maximum navigation stack depth. Push beyond this drops the bottom-most entry. */
export const MAX_STACK_DEPTH = 32;

/** Default root screen when no deep-link is specified */
export const DEFAULT_ROOT_SCREEN = ScreenName.Dashboard;
