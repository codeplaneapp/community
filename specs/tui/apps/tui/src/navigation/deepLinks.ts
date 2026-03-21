import { ScreenName } from "../router/index.js";

export interface DeepLinkArgs {
  screen?: string;
  repo?: string;
  /** Used by agent-chat and agent-replay. Non-empty, no whitespace, max 255 chars. */
  sessionId?: string;
  org?: string;
}

export interface DeepLinkResult {
  /** Pre-populated stack entries for NavigationProviderProps.initialStack. */
  stack: Array<{ screen: string; params?: Record<string, string> }>;
  /**
   * Non-empty when validation failed.
   * Displayed in the status bar for 5 seconds on launch.
   * Stack will contain [Dashboard] as the fallback.
   */
  error?: string;
}

const SCREEN_ID_MAP: Record<string, ScreenName> = {
  dashboard:     ScreenName.Dashboard,
  repos:         ScreenName.RepoList,
  issues:        ScreenName.Issues,
  landings:      ScreenName.Landings,
  workspaces:    ScreenName.Workspaces,
  workflows:     ScreenName.Workflows,
  search:        ScreenName.Search,
  notifications: ScreenName.Notifications,
  settings:      ScreenName.Settings,
  orgs:          ScreenName.Organizations,
  sync:          ScreenName.Sync,
  wiki:          ScreenName.Wiki,

  // Agent deep-links
  agents:          ScreenName.Agents,
  "agent-chat":    ScreenName.AgentChat,
  "agent-replay":  ScreenName.AgentSessionReplay,
};

export function parseCliArgs(argv: string[]): DeepLinkArgs {
  const args: DeepLinkArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--screen":
        args.screen = next?.toLowerCase();
        i++;
        break;
      case "--repo":
        args.repo = next;
        i++;
        break;
      case "--session-id":
        args.sessionId = next;
        i++;
        break;
      case "--org":
        args.org = next;
        i++;
        break;
    }
  }

  return args;
}

function dashboardEntry(): { screen: string; params?: Record<string, string> } {
  return { screen: ScreenName.Dashboard };
}

function repoOverviewEntry(repo: { owner: string; repo: string }): { screen: string; params?: Record<string, string> } {
  return {
    screen: ScreenName.RepoOverview,
    params: { owner: repo.owner, repo: repo.repo },
  };
}

function parseRepoArg(repoStr: string): { owner: string; repo: string } | null {
  const parts = repoStr.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

export function buildInitialStack(args: DeepLinkArgs): DeepLinkResult {
  if (!args.screen) {
    return { stack: [dashboardEntry()] };
  }

  const screenName = SCREEN_ID_MAP[args.screen];
  if (!screenName) {
    return {
      stack: [dashboardEntry()],
      error: `Unknown screen: "${args.screen}"`,
    };
  }

  let repo: { owner: string; repo: string } | null = null;
  if (args.repo) {
    repo = parseRepoArg(args.repo);
    if (!repo) {
      return {
        stack: [dashboardEntry()],
        error: `Invalid repository format: "${args.repo}" (expected OWNER/REPO)`,
      };
    }
  }

  if (args.sessionId !== undefined) {
    if (!args.sessionId || /\\s/.test(args.sessionId)) {
      return {
        stack: [dashboardEntry()],
        error: `Invalid session ID format: "${args.sessionId || "(empty)"}"`,
      };
    }
    if (args.sessionId.length > 255) {
      return {
        stack: [dashboardEntry()],
        error: "Invalid session ID format: too long (max 255 chars)",
      };
    }
  }

  switch (screenName) {
    case ScreenName.Dashboard:
      return { stack: [dashboardEntry()] };

    case ScreenName.RepoList:
      return { stack: [dashboardEntry()] };

    case ScreenName.Agents: {
      if (!repo) {
        return {
          stack: [dashboardEntry()],
          error: "--repo required for agents screen",
        };
      }
      return {
        stack: [
          dashboardEntry(),
          repoOverviewEntry(repo),
          {
            screen: ScreenName.Agents,
            params: { owner: repo.owner, repo: repo.repo },
          },
        ],
      };
    }

    case ScreenName.AgentChat: {
      if (!repo) {
        return {
          stack: [dashboardEntry()],
          error: "--repo required for agent-chat screen",
        };
      }
      if (!args.sessionId) {
        return {
          stack: [dashboardEntry()],
          error: "--session-id required for agent-chat screen",
        };
      }
      return {
        stack: [
          dashboardEntry(),
          repoOverviewEntry(repo),
          {
            screen: ScreenName.Agents,
            params: { owner: repo.owner, repo: repo.repo },
          },
          {
            screen: ScreenName.AgentChat,
            params: { owner: repo.owner, repo: repo.repo, sessionId: args.sessionId },
          },
        ],
      };
    }

    case ScreenName.AgentSessionReplay: {
      if (!repo) {
        return {
          stack: [dashboardEntry()],
          error: "--repo required for agent-replay screen",
        };
      }
      if (!args.sessionId) {
        return {
          stack: [dashboardEntry()],
          error: "--session-id required for agent-replay screen",
        };
      }
      return {
        stack: [
          dashboardEntry(),
          repoOverviewEntry(repo),
          {
            screen: ScreenName.Agents,
            params: { owner: repo.owner, repo: repo.repo },
          },
          {
            screen: ScreenName.AgentSessionReplay,
            params: { owner: repo.owner, repo: repo.repo, sessionId: args.sessionId },
          },
        ],
      };
    }

    case ScreenName.AgentSessionCreate: {
      return {
        stack: [dashboardEntry()],
        error: "agent-create is not a valid deep-link screen",
      };
    }

    default: {
      return {
        stack: [dashboardEntry()],
        error: `Screen "${args.screen}" deep-link not yet implemented`,
      };
    }
  }
}
