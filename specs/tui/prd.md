# Codeplane TUI Product Requirements Document

This PRD defines the product requirements for the Codeplane terminal user interface (TUI). It is intentionally scoped to the TUI surface and grounded in the existing repository architecture, shared packages, and API contracts.

## Status Model

This document uses the same maturity labels as the platform PRD:

- `Implemented`: Present in the TUI as a usable screen or interaction.
- `Partial`: Screen exists but is incomplete, stubbed, or missing backend integration.
- `Gated`: Present behind a feature flag or placeholder.
- `Cloud-only / future`: Referenced in product direction but not implemented in Community Edition.

## 1. Product Summary

The Codeplane TUI is a first-class terminal client for the Codeplane platform. It is built with React 19 and OpenTUI, providing a keyboard-driven interface to the full Codeplane product surface. The TUI is launched via `codeplane tui` from the CLI and consumes the same `@codeplane/ui-core` hooks, API client, and data layer as the web UI.

The TUI is not a reduced-functionality fallback. It is a complete client targeting terminal-native developers who prefer or require a non-browser workflow.

## 2. Target Users

### 2.1 Terminal-native developers

Developers who live in tmux, zellij, or bare terminal sessions and want to interact with repositories, issues, landing requests, and workflows without leaving the terminal.

### 2.2 SSH-only environments

Users accessing remote machines, containers, or workspaces where a graphical browser is unavailable. The TUI provides full Codeplane access over SSH connections.

### 2.3 Power users in terminal multiplexers

Developers who use tmux splits, tabs, or persistent sessions and want Codeplane to fit naturally into their terminal workspace alongside editors and other CLI tools.

### 2.4 Agent-augmented terminal workflows

AI agents operating in sandboxed or workspace environments that need a programmatic-friendly interface to Codeplane product surfaces beyond raw CLI commands.

## 3. Design Constraints

### 3.1 Terminal dimensions

- Minimum supported terminal size: 80 columns x 24 rows
- Standard layout optimized for: 120 columns x 40 rows
- Large terminal support for: 200+ columns x 60+ rows
- The TUI must degrade gracefully at minimum size (collapse sidebars, truncate content, hide optional panels)

### 3.2 Input model

- Keyboard-first: all interactions must be achievable without a mouse
- Mouse support is optional and additive, never required
- Vim-inspired navigation (`j/k/h/l`) as the primary movement model
- No reliance on modifier keys beyond `Ctrl` and `Shift`

### 3.3 Display constraints

- ANSI 256 color baseline with truecolor when terminal supports it
- No images, no bitmap rendering, no sixel
- No browser-based rendering (no webviews, no iframes)
- Unicode box-drawing and braille characters for borders and progress indicators
- Monospace text only

### 3.4 Performance

- First render within 200ms of launch
- Screen transitions under 50ms
- Streaming data (SSE) must render incrementally, not buffer-then-flush
- Memory usage must remain stable during long-running sessions

## 4. Screen Inventory

The TUI exposes the following screens, mapped from the web UI and adapted for terminal constraints:

### 4.1 Dashboard

`Partial`

Overview screen showing recent repositories, organizations, starred repos, and activity feed. Quick actions for common operations.

### 4.2 Repository browser

`Partial`

Repository list with search and filtering. Repository overview with tab navigation across bookmarks, changes, code explorer, conflicts, operation log, and settings.

### 4.3 Issues

`Partial`

Issue list with state/label/assignee filtering. Issue detail view with comments. Issue creation and editing forms. Close/reopen actions.

### 4.4 Landing requests

`Partial`

Landing request list with state filtering. Landing detail with change stack, reviews, comments, checks, and conflict status. Landing creation and review forms.

### 4.5 Diff viewer

`Partial`

Unified and split diff views with toggle. File tree navigation. Syntax highlighting. Line numbers. Whitespace toggle. Scroll synchronization in split mode. Expand/collapse hunks. Inline comment support.

### 4.6 Workspaces

`Partial`

Workspace list and detail views. Create, suspend, resume actions. SSH connection info display. Status streaming.

### 4.7 Workflows

`Partial`

Workflow list. Run list and run detail. Log streaming with ANSI color passthrough. Actions: cancel, rerun, resume. Workflow dispatch. Artifact and cache views.

### 4.8 Search

`Partial`

Global search across repositories, issues, users, and code. Tab navigation between result types. Inline filtering.

### 4.9 Notifications

`Partial`

Notification inbox list. Navigate to referenced resource. Mark read (single and all). SSE streaming for real-time badge updates.

### 4.10 Agent chat

`Partial`

Agent session list. Chat interface with message input and streaming response display. Session creation. Replay mode for completed sessions.

### 4.11 Settings

`Partial`

User settings screen with sections: profile, emails, SSH keys, tokens, notification preferences, connected accounts.

### 4.12 Organizations

`Partial`

Organization list. Organization overview with members and teams. Team detail view. Organization settings.

### 4.13 Command palette

`Partial`

Modal overlay activated by `:` keybinding. Fuzzy search across all available commands and navigation targets. Direct keyboard execution of selected command.

### 4.14 Sync status

`Partial`

Daemon sync status display. Conflict list with resolve and force-sync actions. Status indicator in the global status bar.

### 4.15 Wiki

`Partial`

Wiki page list. Wiki detail with markdown rendering. Wiki search.

## 5. Data Access Model

### 5.1 API consumption

The TUI consumes the Codeplane HTTP API through `@codeplane/ui-core`:

- Shared API client with authentication (token from CLI keychain or `CODEPLANE_TOKEN` environment variable)
- Shared data hooks for repositories, issues, landings, notifications, search, users, and workflows
- Shared command definitions and fuzzy search utilities

### 5.2 Streaming

Server-Sent Events (SSE) for:

- Notification badge count and inbox updates
- Workflow run log streaming
- Workspace status updates
- Agent session response streaming

SSE connections use ticket-based authentication obtained via the auth API.

### 5.3 Authentication

The TUI does not implement its own OAuth browser flow. Authentication is delegated to the CLI:

1. User authenticates via `codeplane auth login` (browser OAuth or token)
2. Token is stored in CLI keychain/config
3. TUI reads the stored token at startup
4. Fallback: `CODEPLANE_TOKEN` environment variable

### 5.4 Pagination

Cursor-based pagination for list views using scrollbox scroll-to-end detection. Page-based pagination where the API requires it.

## 6. Non-Goals

The TUI intentionally does not implement:

- Image preview (no sixel, no kitty graphics protocol)
- OAuth browser flow (delegates to CLI `codeplane auth login`)
- Admin console screens (use web UI or CLI)
- Billing management screens (use web UI)
- Marketing or landing pages
- WebRTC terminal connections (use direct SSH via CLI)
- Monaco editor or rich text editing
- File upload (use CLI for release assets, avatars)

## 7. E2E Testing Strategy

### 7.1 Test framework

TUI end-to-end tests use `@microsoft/tui-test` for:

- Terminal snapshot matching (golden-file comparison of rendered output)
- Keyboard interaction simulation (keypress sequences with assertion on resulting state)
- Regex text assertions on terminal content
- Screen transition verification

### 7.2 Test organization

Test files map to feature groups:

- `e2e/tui/app-shell.test.ts` — TUI_APP_SHELL features
- `e2e/tui/dashboard.test.ts` — TUI_DASHBOARD features
- `e2e/tui/repository.test.ts` — TUI_REPOSITORY features
- `e2e/tui/issues.test.ts` — TUI_ISSUES features
- `e2e/tui/landings.test.ts` — TUI_LANDINGS features
- `e2e/tui/diff.test.ts` — TUI_DIFF features
- `e2e/tui/workspaces.test.ts` — TUI_WORKSPACES features
- `e2e/tui/workflows.test.ts` — TUI_WORKFLOWS features
- `e2e/tui/search.test.ts` — TUI_SEARCH features
- `e2e/tui/notifications.test.ts` — TUI_NOTIFICATIONS features
- `e2e/tui/agents.test.ts` — TUI_AGENTS features
- `e2e/tui/settings.test.ts` — TUI_SETTINGS features
- `e2e/tui/organizations.test.ts` — TUI_ORGANIZATIONS features
- `e2e/tui/sync.test.ts` — TUI_SYNC features
- `e2e/tui/wiki.test.ts` — TUI_WIKI features

### 7.3 Test philosophy

- Tests that fail due to unimplemented backend features are left failing. They are never skipped or commented out.
- Each test validates a specific user-facing behavior, not implementation details.
- Snapshot tests capture the full terminal output at key interaction points.
- Tests run against a real API server (or daemon) with test fixtures, not mocks.

## 8. Source of Truth

This TUI PRD should be maintained alongside:

- [specs/tui/design.md](./design.md)
- [specs/tui/features.ts](./features.ts)
- [specs/prd.md](../prd.md)
- [specs/design.md](../design.md)
