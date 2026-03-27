import type { ComponentType, ReactNode } from "react";

export enum ScreenName {
  Dashboard = "Dashboard",
  RepoList = "RepoList",
  Search = "Search",
  Notifications = "Notifications",
  Workspaces = "Workspaces",
  Agents = "Agents",
  Settings = "Settings",
  Organizations = "Organizations",
  Sync = "Sync",
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
  WorkspaceDetail = "WorkspaceDetail",
  WorkspaceCreate = "WorkspaceCreate",
  AgentSessionList = "AgentSessionList",
  AgentChat = "AgentChat",
  AgentSessionCreate = "AgentSessionCreate",
  AgentSessionReplay = "AgentSessionReplay",
  OrgOverview = "OrgOverview",
  OrgTeamDetail = "OrgTeamDetail",
  OrgSettings = "OrgSettings",
}

export interface ScreenEntry {
  /** Unique instance ID for this stack entry. Generated at push time via crypto.randomUUID(). */
  id: string;
  /** Screen identifier string (e.g. "Dashboard", "Issues", "IssueDetail"). */
  screen: string;
  /** Screen-specific parameters as string key/value pairs. */
  params?: Record<string, string>;
}

export interface NavigationContextType {
  /** Push a new screen onto the stack. No-op if top of stack has same screen+params. */
  push(screen: string, params?: Record<string, string>): void;
  /** Pop the top screen from the stack. No-op if stack depth is 1 (root). */
  pop(): void;
  /** Replace the top-of-stack entry with a new screen+params. */
  replace(screen: string, params?: Record<string, string>): void;
  /** Clear the stack and push a single new root entry. */
  reset(screen: string, params?: Record<string, string>): void;
  /** Returns true if the stack has more than one entry. */
  canPop(): boolean;
  /** Read-only view of the full navigation stack. */
  readonly stack: readonly ScreenEntry[];
  /** The current (top-of-stack) screen entry. */
  readonly current: ScreenEntry;
}

export type NavigationContext = NavigationContextType;

export interface NavigationProviderProps {
  /** Initial screen to push as the root entry. Defaults to "Dashboard". */
  initialScreen?: string;
  /** Initial params for the root entry. */
  initialParams?: Record<string, string>;
  /** Pre-populated stack entries for deep-link launch. */
  initialStack?: Array<{ screen: string; params?: Record<string, string> }>;
  /** React children. */
  children: ReactNode;
}

export interface ScreenComponentProps {
  /** The ScreenEntry for this screen instance */
  entry: ScreenEntry;
  /** Convenience: parsed params */
  params: Record<string, string>;
}

export interface ScreenDefinition {
  /** The React component to render for this screen */
  component: ComponentType<ScreenComponentProps>;
  /** Whether this screen requires repo context (owner + repo in params) */
  requiresRepo: boolean;
  /** Whether this screen requires org context (org in params) */
  requiresOrg: boolean;
  /** Function to generate breadcrumb label from params */
  breadcrumbLabel: (params: Record<string, string>) => string;
}

/** Maximum number of entries in the navigation stack. */
export const MAX_STACK_DEPTH = 32;
/** Default root screen identifier. */
export const DEFAULT_ROOT_SCREEN = "Dashboard";

/**
 * Compare two screen entries by screen name and params (ignoring id).
 * Treats undefined params and {} as equivalent.
 */
export function screenEntriesEqual(
  a: { screen: string; params?: Record<string, string> },
  b: { screen: string; params?: Record<string, string> },
): boolean {
  if (a.screen !== b.screen) return false;

  const aKeys = a.params ? Object.keys(a.params) : [];
  const bKeys = b.params ? Object.keys(b.params) : [];

  if (aKeys.length !== bKeys.length) return false;
  if (aKeys.length === 0) return true;

  for (const key of aKeys) {
    if (a.params?.[key] !== b.params?.[key]) return false;
  }

  return true;
}
