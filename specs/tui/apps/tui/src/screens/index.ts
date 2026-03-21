/**
 * Screen components for the TUI application.
 *
 * Existing screens:
 *   Agents/          — Agent session components (MessageBlock, ToolBlock stubs)
 *
 * Planned screens (see: specs/tui/prd.md § Screen Inventory):
 *   Dashboard/       — Overview: recent repos, orgs, starred, activity feed
 *   Repository/      — Repo list, overview with tab navigation
 *   Issues/          — Issue list, detail, create, edit, close/reopen
 *   Landings/        — Landing request list, detail with stack/reviews/checks
 *   Diff/            — Unified + split diff views, file tree, syntax highlight
 *   Workspaces/      — Workspace list, detail, create/suspend/resume
 *   Workflows/       — Workflow list, run detail, log streaming
 *   Search/          — Global search across repos/issues/users/code
 *   Notifications/   — Notification inbox, mark read, SSE badge updates
 *   Settings/        — User profile, emails, SSH keys, tokens
 *   Organizations/   — Org list, org overview with members/teams
 *   Sync/            — Daemon sync status, conflict list
 *   Wiki/            — Wiki page list, detail with markdown rendering
 *
 * Screen registry maps ScreenName enum → { component, requiresRepo, params, keybindings }
 */

export {}
