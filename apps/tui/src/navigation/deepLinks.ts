import type { NavigationProviderProps } from "../router/types.js";
import { ScreenName } from "../router/types.js";

type DeepLinkStackEntry = NonNullable<NavigationProviderProps["initialStack"]>[number];

export interface DeepLinkArgs {
  screen?: string;
  repo?: string;
  sessionId?: string;
  org?: string;
}

export interface DeepLinkResult {
  /** Pre-populated stack entries */
  stack: DeepLinkStackEntry[];
  /** Non-empty when validation failed */
  error?: string;
}

function resolveScreenName(input: string): ScreenName | null {
  const lower = input.toLowerCase();
  const map: Record<string, ScreenName> = {
    dashboard: ScreenName.Dashboard,
    issues: ScreenName.Issues,
    landings: ScreenName.Landings,
    "landing-requests": ScreenName.Landings,
    workspaces: ScreenName.Workspaces,
    workflows: ScreenName.Workflows,
    search: ScreenName.Search,
    notifications: ScreenName.Notifications,
    settings: ScreenName.Settings,
    organizations: ScreenName.Organizations,
    agents: ScreenName.Agents,
    wiki: ScreenName.Wiki,
    sync: ScreenName.Sync,
    repositories: ScreenName.RepoList,
    repos: ScreenName.RepoList,
    "repo-detail": ScreenName.RepoOverview,
  };
  return map[lower] ?? null;
}

export function buildInitialStack(args: DeepLinkArgs): DeepLinkResult {
  const dashboardEntry = (): DeepLinkStackEntry => ({ screen: ScreenName.Dashboard });

  if (!args.screen && !args.repo) {
    return { stack: [dashboardEntry()] };
  }

  const screenName = args.screen ? resolveScreenName(args.screen) : null;
  
  if (args.screen && !screenName) {
    return {
      stack: [dashboardEntry()],
      error: `Unknown screen: "${args.screen}"`,
    };
  }

  let owner = "";
  let repoName = "";

  if (args.repo) {
    const parts = args.repo.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        stack: [dashboardEntry()],
        error: `Invalid repository format: "${args.repo}"`,
      };
    }
    owner = parts[0];
    repoName = parts[1];
  }

  const stack: DeepLinkStackEntry[] = [dashboardEntry()];

  if (owner && repoName) {
    stack.push({
      screen: ScreenName.RepoOverview,
      params: { owner, repo: repoName },
    });
  }

  if (screenName && screenName !== ScreenName.Dashboard) {
    // If it's a repo-scoped screen but no repo provided
    const requiresRepo = [
      ScreenName.RepoOverview, ScreenName.Issues, ScreenName.IssueDetail, 
      ScreenName.IssueCreate, ScreenName.IssueEdit, ScreenName.Landings, 
      ScreenName.LandingDetail, ScreenName.LandingCreate, ScreenName.LandingEdit, 
      ScreenName.DiffView, ScreenName.Workflows, ScreenName.WorkflowRunDetail, 
      ScreenName.Wiki, ScreenName.WikiDetail
    ].includes(screenName);

    if (requiresRepo && (!owner || !repoName)) {
      return {
        stack: [dashboardEntry()],
        error: `--repo required for ${args.screen} screen`,
      };
    }

    const params: Record<string, string> = {};
    if (requiresRepo) {
      params.owner = owner;
      params.repo = repoName;
    }
    if (args.sessionId) {
      params.sessionId = args.sessionId;
    }
    if (args.org) {
      params.org = args.org;
    }

    // avoid pushing duplicates if RepoOverview is the target
    if (screenName !== ScreenName.RepoOverview || !owner) {
      stack.push({
        screen: screenName,
        params,
      });
    }
  }

  return { stack };
}

/** @deprecated Use buildInitialStack instead */
export const resolveDeepLink = buildInitialStack;
