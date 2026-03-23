import type { ScreenEntry } from "../router/types.js";
import { ScreenName } from "./screenRegistry.js";

export function resolveDeepLink(options: {
  screen?: string;
  repo?: string;
}): Array<{ screen: string; params?: Record<string, string> }> {
  const stack: Array<{ screen: string; params?: Record<string, string> }> = [];

  stack.push({ screen: ScreenName.Dashboard });

  if (options.repo) {
    const [owner, repo] = options.repo.split("/");
    if (owner && repo) {
      stack.push({
        screen: ScreenName.RepoOverview,
        params: { owner, repo },
      });

      if (options.screen) {
        const resolved = resolveScreenName(options.screen);
        if (resolved && resolved !== ScreenName.Dashboard && resolved !== ScreenName.RepoOverview) {
          stack.push({
            screen: resolved,
            params: { owner, repo },
          });
        }
      }
    }
  } else if (options.screen) {
    const resolved = resolveScreenName(options.screen);
    if (resolved && resolved !== ScreenName.Dashboard) {
      stack.push({ screen: resolved });
    }
  }

  return stack;
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