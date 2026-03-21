/**
 * Code-backed Codeplane TUI feature inventory.
 *
 * This spec covers the terminal user interface built with React 19 + OpenTUI.
 * Features are organized by screen/domain and map to the web UI's functionality
 * adapted for terminal constraints (keyboard-first, ANSI color, no images).
 *
 * The TUI consumes @codeplane/ui-core hooks and the shared API client.
 * All features target apps/tui/src/ for implementation and e2e/tui/ for tests.
 */

export const TUIFeatureGroups = {
  // Source: apps/tui/src/ — App bootstrap, auth, routing, chrome, global affordances
  TUI_APP_SHELL: [
    "TUI_BOOTSTRAP_AND_RENDERER",
    "TUI_AUTH_TOKEN_LOADING",
    "TUI_SCREEN_ROUTER",
    "TUI_HEADER_BAR",
    "TUI_STATUS_BAR",
    "TUI_COMMAND_PALETTE",
    "TUI_HELP_OVERLAY",
    "TUI_THEME_AND_COLOR_TOKENS",
    "TUI_RESPONSIVE_LAYOUT",
    "TUI_DEEP_LINK_LAUNCH",
    "TUI_ERROR_BOUNDARY",
    "TUI_LOADING_STATES",
    "TUI_GOTO_KEYBINDINGS",
  ],

  // Source: apps/tui/src/screens/Dashboard — Dashboard screen
  TUI_DASHBOARD: [
    "TUI_DASHBOARD_SCREEN",
    "TUI_DASHBOARD_REPOS_LIST",
    "TUI_DASHBOARD_ORGS_LIST",
    "TUI_DASHBOARD_STARRED_REPOS",
    "TUI_DASHBOARD_ACTIVITY_FEED",
    "TUI_DASHBOARD_QUICK_ACTIONS",
  ],

  // Source: apps/tui/src/screens/Repository — Repo browser and sub-views
  TUI_REPOSITORY: [
    "TUI_REPO_LIST_SCREEN",
    "TUI_REPO_OVERVIEW",
    "TUI_REPO_TAB_NAVIGATION",
    "TUI_REPO_BOOKMARKS_VIEW",
    "TUI_REPO_CHANGES_VIEW",
    "TUI_REPO_CODE_EXPLORER",
    "TUI_REPO_FILE_TREE",
    "TUI_REPO_FILE_PREVIEW",
    "TUI_REPO_README_RENDER",
    "TUI_REPO_CONFLICTS_VIEW",
    "TUI_REPO_OPERATION_LOG",
    "TUI_REPO_SETTINGS_VIEW",
    "TUI_REPO_SEARCH_FILTER",
    "TUI_REPO_KEYBOARD_SHORTCUTS",
  ],

  // Source: apps/tui/src/screens/Issues — Issue list, detail, create, edit
  TUI_ISSUES: [
    "TUI_ISSUE_LIST_SCREEN",
    "TUI_ISSUE_LIST_FILTERS",
    "TUI_ISSUE_LIST_SEARCH",
    "TUI_ISSUE_DETAIL_VIEW",
    "TUI_ISSUE_CREATE_FORM",
    "TUI_ISSUE_EDIT_FORM",
    "TUI_ISSUE_CLOSE_REOPEN",
    "TUI_ISSUE_COMMENT_LIST",
    "TUI_ISSUE_COMMENT_CREATE",
    "TUI_ISSUE_LABELS_DISPLAY",
    "TUI_ISSUE_KEYBOARD_SHORTCUTS",
  ],

  // Source: apps/tui/src/screens/Landings — Landing request list, detail, create, review
  TUI_LANDINGS: [
    "TUI_LANDING_LIST_SCREEN",
    "TUI_LANDING_LIST_FILTERS",
    "TUI_LANDING_DETAIL_VIEW",
    "TUI_LANDING_CREATE_FORM",
    "TUI_LANDING_EDIT_FORM",
    "TUI_LANDING_CHANGE_STACK",
    "TUI_LANDING_REVIEWS_VIEW",
    "TUI_LANDING_REVIEW_FORM",
    "TUI_LANDING_COMMENTS_VIEW",
    "TUI_LANDING_CHECKS_VIEW",
    "TUI_LANDING_CONFLICT_STATUS",
    "TUI_LANDING_KEYBOARD_SHORTCUTS",
  ],

  // Source: apps/tui/src/screens/Diff — Diff viewer with unified/split modes
  TUI_DIFF: [
    "TUI_DIFF_SCREEN",
    "TUI_DIFF_UNIFIED_VIEW",
    "TUI_DIFF_SPLIT_VIEW",
    "TUI_DIFF_VIEW_TOGGLE",
    "TUI_DIFF_FILE_TREE",
    "TUI_DIFF_FILE_NAVIGATION",
    "TUI_DIFF_SYNTAX_HIGHLIGHT",
    "TUI_DIFF_LINE_NUMBERS",
    "TUI_DIFF_WHITESPACE_TOGGLE",
    "TUI_DIFF_SCROLL_SYNC",
    "TUI_DIFF_EXPAND_COLLAPSE",
    "TUI_DIFF_INLINE_COMMENTS",
  ],

  // Source: apps/tui/src/screens/Workspaces — Workspace list, detail, actions
  TUI_WORKSPACES: [
    "TUI_WORKSPACE_LIST_SCREEN",
    "TUI_WORKSPACE_DETAIL_VIEW",
    "TUI_WORKSPACE_CREATE_FORM",
    "TUI_WORKSPACE_SUSPEND_RESUME",
    "TUI_WORKSPACE_SSH_INFO",
    "TUI_WORKSPACE_STATUS_STREAM",
  ],

  // Source: apps/tui/src/screens/Workflows — Workflow list, runs, logs
  TUI_WORKFLOWS: [
    "TUI_WORKFLOW_LIST_SCREEN",
    "TUI_WORKFLOW_RUN_LIST",
    "TUI_WORKFLOW_RUN_DETAIL",
    "TUI_WORKFLOW_LOG_STREAM",
    "TUI_WORKFLOW_ACTIONS",
    "TUI_WORKFLOW_DISPATCH",
    "TUI_WORKFLOW_ARTIFACTS_VIEW",
    "TUI_WORKFLOW_CACHE_VIEW",
  ],

  // Source: apps/tui/src/screens/Search — Global search with tabs
  TUI_SEARCH: [
    "TUI_SEARCH_SCREEN",
    "TUI_SEARCH_REPOS_TAB",
    "TUI_SEARCH_ISSUES_TAB",
    "TUI_SEARCH_USERS_TAB",
    "TUI_SEARCH_CODE_TAB",
    "TUI_SEARCH_TAB_NAVIGATION",
    "TUI_SEARCH_INLINE_FILTER",
  ],

  // Source: apps/tui/src/screens/Notifications — Notification inbox with SSE
  TUI_NOTIFICATIONS: [
    "TUI_NOTIFICATION_LIST_SCREEN",
    "TUI_NOTIFICATION_DETAIL_NAV",
    "TUI_NOTIFICATION_MARK_READ",
    "TUI_NOTIFICATION_SSE_STREAM",
    "TUI_NOTIFICATION_BADGE",
  ],

  // Source: apps/tui/src/screens/Agents — Agent chat and session management
  TUI_AGENTS: [
    "TUI_AGENT_SESSION_LIST",
    "TUI_AGENT_CHAT_SCREEN",
    "TUI_AGENT_MESSAGE_SEND",
    "TUI_AGENT_SESSION_REPLAY",
    "TUI_AGENT_SESSION_CREATE",
  ],

  // Source: apps/tui/src/screens/Settings — User settings
  TUI_SETTINGS: [
    "TUI_SETTINGS_SCREEN",
    "TUI_SETTINGS_PROFILE",
    "TUI_SETTINGS_EMAILS",
    "TUI_SETTINGS_SSH_KEYS",
    "TUI_SETTINGS_TOKENS",
    "TUI_SETTINGS_NOTIFICATION_PREFS",
    "TUI_SETTINGS_CONNECTED_ACCOUNTS",
  ],

  // Source: apps/tui/src/screens/Organizations — Org management
  TUI_ORGANIZATIONS: [
    "TUI_ORG_LIST_SCREEN",
    "TUI_ORG_OVERVIEW",
    "TUI_ORG_MEMBERS_VIEW",
    "TUI_ORG_TEAMS_VIEW",
    "TUI_ORG_TEAM_DETAIL",
    "TUI_ORG_SETTINGS_VIEW",
  ],

  // Source: apps/tui/src/screens/Sync — Daemon sync status and conflicts
  TUI_SYNC: [
    "TUI_SYNC_STATUS_SCREEN",
    "TUI_SYNC_CONFLICT_LIST",
    "TUI_SYNC_RESOLVE_ACTION",
    "TUI_SYNC_FORCE_SYNC",
    "TUI_SYNC_STATUS_INDICATOR",
  ],

  // Source: apps/tui/src/screens/Wiki — Wiki pages and search
  TUI_WIKI: [
    "TUI_WIKI_LIST_SCREEN",
    "TUI_WIKI_DETAIL_VIEW",
    "TUI_WIKI_SEARCH",
  ],
} as const satisfies Record<string, readonly string[]>;

type TUIFeatureGroupMap = typeof TUIFeatureGroups;
export type TUIFeatureGroupName = keyof TUIFeatureGroupMap;
export type TUIFeatureName = TUIFeatureGroupMap[TUIFeatureGroupName][number];

const tuiFeatureEntries: Array<readonly [TUIFeatureName, TUIFeatureName]> = [];

for (const group of Object.values(TUIFeatureGroups) as readonly (readonly TUIFeatureName[])[]) {
  for (const feature of group) {
    tuiFeatureEntries.push([feature, feature] as const);
  }
}

export const TUIFeatures = Object.freeze(
  Object.fromEntries(tuiFeatureEntries) as Record<TUIFeatureName, TUIFeatureName>,
);
