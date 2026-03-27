import type { NavigationContextType } from "../router/types.js";
import { ScreenName } from "../router/types.js";

export interface GoToBinding {
  key: string;
  screen: ScreenName;
  requiresRepo: boolean;
  description: string;
}

export const goToBindings: readonly GoToBinding[] = [
  { key: "d", screen: ScreenName.Dashboard,       requiresRepo: false, description: "Dashboard" },
  { key: "r", screen: ScreenName.RepoList,         requiresRepo: false, description: "Repositories" },
  { key: "i", screen: ScreenName.Issues,            requiresRepo: true,  description: "Issues" },
  { key: "l", screen: ScreenName.Landings,          requiresRepo: true,  description: "Landings" },
  { key: "w", screen: ScreenName.Workspaces,        requiresRepo: false, description: "Workspaces" },
  { key: "n", screen: ScreenName.Notifications,     requiresRepo: false, description: "Notifications" },
  { key: "s", screen: ScreenName.Search,             requiresRepo: false, description: "Search" },
  { key: "o", screen: ScreenName.Organizations,     requiresRepo: false, description: "Organizations" },
  { key: "f", screen: ScreenName.Workflows,          requiresRepo: true,  description: "Workflows" },
  { key: "k", screen: ScreenName.Wiki,               requiresRepo: true,  description: "Wiki" },
  { key: "a", screen: ScreenName.Agents,             requiresRepo: false, description: "Agents" },
] as const;

export function executeGoTo(
  nav: NavigationContextType,
  binding: GoToBinding,
  repoContext: { owner: string; repo: string } | null,
): { error?: string } {
  if (binding.requiresRepo && !repoContext) {
    return { error: "No repository in context" };
  }

  nav.reset(ScreenName.Dashboard);

  if (binding.requiresRepo && repoContext) {
    nav.push(ScreenName.RepoOverview, {
      owner: repoContext.owner,
      repo: repoContext.repo,
    });
  }

  const params = binding.requiresRepo && repoContext
    ? { owner: repoContext.owner, repo: repoContext.repo }
    : undefined;

  nav.push(binding.screen, params);

  return {};
}
