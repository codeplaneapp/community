import { ScreenName } from "../router/index.js";
import type { NavigationContext } from "../router/types.js";

export interface GoToBinding {
  /** Single character pressed after `g` to trigger this binding. */
  key: string;
  /** Destination screen. */
  screen: ScreenName;
  /** If true and no repo context is active, show error instead of navigating. */
  requiresRepo: boolean;
  /** Human-readable description shown in help overlay and go-to mode hint. */
  description: string;
}

export const goToBindings: readonly GoToBinding[] = [
  { key: "d", screen: ScreenName.Dashboard,     requiresRepo: false, description: "Dashboard" },
  { key: "r", screen: ScreenName.RepoList,       requiresRepo: false, description: "Repositories" },
  { key: "i", screen: ScreenName.Issues,          requiresRepo: true,  description: "Issues" },
  { key: "l", screen: ScreenName.Landings,        requiresRepo: true,  description: "Landings" },
  { key: "w", screen: ScreenName.Workspaces,      requiresRepo: false, description: "Workspaces" },
  { key: "n", screen: ScreenName.Notifications,   requiresRepo: false, description: "Notifications" },
  { key: "s", screen: ScreenName.Search,           requiresRepo: false, description: "Search" },
  { key: "o", screen: ScreenName.Organizations,   requiresRepo: false, description: "Organizations" },
  { key: "f", screen: ScreenName.Workflows,        requiresRepo: true,  description: "Workflows" },
  { key: "k", screen: ScreenName.Wiki,             requiresRepo: true,  description: "Wiki" },

  // Agent screens
  { key: "a", screen: ScreenName.Agents, requiresRepo: true, description: "Agents" },
] as const;

export function executeGoTo(
  nav: NavigationContext,
  binding: GoToBinding,
  repoContext: { owner: string; repo: string } | null,
): { error?: string } {
  if (binding.requiresRepo && !repoContext) {
    return { error: "No repository in context" };
  }

  // Build the stack: Dashboard → RepoOverview (if repo-scoped) → target screen
  nav.reset(ScreenName.Dashboard);

  if (repoContext) {
    nav.push(ScreenName.RepoOverview, {
      owner: repoContext.owner,
      repo: repoContext.repo,
    });
  }

  const params = repoContext
    ? { owner: repoContext.owner, repo: repoContext.repo }
    : undefined;

  nav.push(binding.screen, params);

  return {};
}
