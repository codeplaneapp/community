# TUI_DEEP_LINK_LAUNCH

Specification for TUI_DEEP_LINK_LAUNCH.

## High-Level User POV

When a developer is already working in their terminal — perhaps inside a tmux session, an SSH connection, or alongside their editor — they often want to jump directly to a specific Codeplane screen without manually navigating through the Dashboard. Deep-link launch makes this possible: instead of running `codeplane tui` and then pressing `g r`, finding a repo, pressing Enter, then pressing `g i` to reach issues, the user simply runs `codeplane tui --screen issues --repo acme/api` and the TUI opens with the issue list for `acme/api` already displayed.

The experience is seamless and immediate. The TUI launches, authenticates (showing the brief "Authenticating…" spinner as usual), and then renders the target screen directly instead of the Dashboard. The user never sees the Dashboard flash before their destination — the deep-linked screen is the first content screen they see after authentication completes.

Critically, the navigation stack is pre-populated with the logical intermediate screens so that backward navigation feels natural. When the user launched `--screen issues --repo acme/api`, the breadcrumb trail in the header bar shows `Dashboard > acme/api > Issues`. Pressing `q` takes them to the repository overview for `acme/api`. Pressing `q` again takes them to the Dashboard. Pressing `q` one more time exits the TUI. This means deep-linking is not a one-way trip — it's an entry point into the full navigation graph.

Three flags control deep-link behavior: `--screen` specifies the destination, `--repo` provides repository context in `OWNER/REPO` format, and `--org` provides organization context as a slug. Not every screen requires context: `--screen notifications` works without `--repo`, while `--screen issues` requires it. If a user forgets `--repo` for a screen that needs it, the TUI launches to the Dashboard and shows a clear error in the status bar: `--repo required for issues`. Similarly, if the user types an unrecognized screen name like `--screen foobar`, they land on the Dashboard with a status bar error: `Unknown screen: foobar`.

Input validation is strict but friendly. Repository slugs must match the pattern `OWNER/REPO` using alphanumeric characters, dots, hyphens, and underscores. Organization slugs follow the same character rules without the slash. Invalid formats are rejected with a specific error message rather than crashing.

The status bar error messages for deep-link failures are transient — they display for 5 seconds and then clear automatically. This ensures the user notices the error but isn't permanently distracted by it once they begin navigating.

Deep-link launch is designed to integrate cleanly into scripting and automation workflows. A CI notification could include a `codeplane tui --screen workflows --repo acme/api` command that a developer can paste into their terminal to jump directly to the relevant workflow runs. An AI agent operating in a terminal workspace can use deep-links to open specific screens without needing to simulate keyboard navigation.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane tui --screen <id>` launches the TUI directly to the specified screen instead of the Dashboard
- [ ] `codeplane tui --repo <owner/repo>` sets the repository context for the session without requiring `--screen` (defaults to repo overview)
- [ ] `codeplane tui --org <slug>` sets the organization context for the session without requiring `--screen` (defaults to org overview)
- [ ] `--screen`, `--repo`, and `--org` can be combined: `--screen issues --repo acme/api` opens the issue list for `acme/api`
- [ ] Supported `--screen` values: `dashboard`, `repos`, `issues`, `landings`, `workspaces`, `workflows`, `search`, `notifications`, `agents`, `settings`, `orgs`, `sync`, `wiki`
- [ ] The navigation stack is pre-populated with intermediate screens for backward navigation via `q`
- [ ] Pre-populated stack for context-free screens: `[Dashboard, <screen>]` (depth 2)
- [ ] Pre-populated stack for repo-context screens: `[Dashboard, Repo(<owner/repo>), <screen>]` (depth 3)
- [ ] Pre-populated stack for org-context screens: `[Dashboard, Org(<slug>), <screen>]` (depth 3)
- [ ] `--screen dashboard` pre-populates a stack of depth 1 (Dashboard only)
- [ ] `--repo` without `--screen` pre-populates: `[Dashboard, Repo(<owner/repo>)]` (depth 2)
- [ ] `--org` without `--screen` pre-populates: `[Dashboard, Org(<slug>)]` (depth 2)
- [ ] Deep-link authentication completes before screen navigation — the auth loading screen is shown first, then the deep-linked screen
- [ ] Breadcrumb trail in the header bar accurately reflects the pre-populated stack
- [ ] After deep-link launch, all standard navigation (go-to mode, command palette, `q`, `Esc`) works identically to manual navigation

### Validation & Error Handling

- [ ] `--screen` value is validated against the allowlist of supported screen IDs (case-insensitive comparison, stored lowercase)
- [ ] `--repo` value is validated against the regex pattern `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$`
- [ ] `--org` value is validated against the regex pattern `^[a-zA-Z0-9_.-]+$`
- [ ] If `--screen` requires repo context (`issues`, `landings`, `workflows`, `wiki`) but `--repo` is not provided, the TUI launches to Dashboard and the status bar shows `--repo required for <screen>` in error color for 5 seconds
- [ ] If `--screen` is an unrecognized value, the TUI launches to Dashboard and the status bar shows `Unknown screen: <value>` in error color for 5 seconds
- [ ] If `--repo` value fails regex validation, the TUI launches to Dashboard and the status bar shows `Invalid repository format: <value> (expected OWNER/REPO)` in error color for 5 seconds
- [ ] If `--org` value fails regex validation, the TUI launches to Dashboard and the status bar shows `Invalid organization format: <value>` in error color for 5 seconds
- [ ] Unrecognized `--screen` values are truncated to 32 characters in the error message to prevent visual overflow
- [ ] Invalid `--repo` values are truncated to 64 characters in the error message
- [ ] Invalid `--org` values are truncated to 32 characters in the error message
- [ ] All validation occurs before authentication — invalid deep-link parameters do not delay or block the auth flow

### Terminal Edge Cases

- [ ] At minimum terminal size (80×24), deep-link status bar errors are truncated to fit within the available width (terminal width minus sync status and help hint)
- [ ] At minimum terminal size, pre-populated breadcrumbs are truncated from the left with `…` prefix following standard breadcrumb truncation rules
- [ ] On terminals without color support (`NO_COLOR=1`), status bar errors use text prefix `[ERROR]` instead of color-only error indication
- [ ] Rapid key input buffered during deep-link screen loading is processed after the screen renders — no keystrokes are lost
- [ ] If the terminal is resized during deep-link resolution (between auth and screen render), the target screen renders at the new dimensions
- [ ] If the deep-link target screen's data hook returns an error (e.g., 404 for nonexistent repo), the screen displays its standard error state; the pre-populated stack allows `q` to navigate back

### Boundary Constraints

- [ ] `--screen` value max length: 32 characters (values longer than this are rejected as unrecognized)
- [ ] `--repo` value max length: 128 characters (values longer than this fail regex validation)
- [ ] `--org` value max length: 64 characters (values longer than this fail regex validation)
- [ ] Repository owner segment max length: 64 characters
- [ ] Repository name segment max length: 64 characters
- [ ] Organization slug max length: 64 characters
- [ ] Breadcrumb segment title max length: 24 characters (truncated with `…` if exceeded)
- [ ] Status bar error message max display length: `terminal_width - 20` characters (reserves space for sync status and help hint)
- [ ] Status bar error display duration: 5 seconds (then auto-clears)

## Design

### CLI Argument Parsing

The CLI command `codeplane tui` parses deep-link flags and passes them to the TUI entry point:

```
codeplane tui [--screen <id>] [--repo <owner/repo>] [--org <slug>]
```

The TUI entry point (`apps/tui/src/index.tsx`) receives these as process arguments and parses them during bootstrap, before the React tree mounts.

### Deep-Link Resolution Flow

```
CLI argument parsing
  ↓
Validate --screen against allowlist
Validate --repo against regex
Validate --org against regex
  ↓ (validation fails → set errorMessage, fallback to Dashboard)
  ↓ (validation passes → determine target screen + context)
  ↓
Auth token loading (TUI_AUTH_TOKEN_LOADING)
  ↓ (auth fails → show auth error screen; deep-link params preserved for retry)
  ↓ (auth succeeds → proceed)
  ↓
Build initial navigation stack
  ↓
Mount target screen component
  ↓
Show status bar error if validation failed (5s transient)
```

### Stack Pre-Population Rules

| Flags | Resulting Stack | Depth |
|-------|----------------|-------|
| (none) | `[Dashboard]` | 1 |
| `--screen dashboard` | `[Dashboard]` | 1 |
| `--screen repos` | `[Dashboard, Repos]` | 2 |
| `--screen notifications` | `[Dashboard, Notifications]` | 2 |
| `--screen search` | `[Dashboard, Search]` | 2 |
| `--screen workspaces` | `[Dashboard, Workspaces]` | 2 |
| `--screen agents` | `[Dashboard, Agents]` | 2 |
| `--screen settings` | `[Dashboard, Settings]` | 2 |
| `--screen sync` | `[Dashboard, Sync]` | 2 |
| `--repo acme/api` | `[Dashboard, Repo(acme/api)]` | 2 |
| `--screen issues --repo acme/api` | `[Dashboard, Repo(acme/api), Issues]` | 3 |
| `--screen landings --repo acme/api` | `[Dashboard, Repo(acme/api), Landings]` | 3 |
| `--screen workflows --repo acme/api` | `[Dashboard, Repo(acme/api), Workflows]` | 3 |
| `--screen wiki --repo acme/api` | `[Dashboard, Repo(acme/api), Wiki]` | 3 |
| `--screen orgs` | `[Dashboard, Orgs]` | 2 |
| `--org acme` | `[Dashboard, Org(acme)]` | 2 |
| `--screen orgs --org acme` | `[Dashboard, Org(acme)]` | 2 |

### Layout: Deep-Linked Screen After Launch

The deep-linked screen renders within the standard app shell layout. No special visual treatment distinguishes a deep-linked launch from manual navigation:

```
┌──────────────────────────────────────────────────────┐
│ Dashboard > acme/api > Issues              acme/api ●│
├──────────────────────────────────────────────────────┤
│                                                      │
│  Issues for acme/api                                 │
│  ─────────────────────────────────                   │
│  ● #42  Fix auth regression                 3h ago   │
│  ○ #41  Add pagination to user list         1d ago   │
│  ● #40  Update CI pipeline config           2d ago   │
│  ○ #39  Remove deprecated endpoints         3d ago   │
│                                                      │
├──────────────────────────────────────────────────────┤
│ j/k navigate │ Enter open │ q back        ? help     │
└──────────────────────────────────────────────────────┘
```

**OpenTUI component tree (status bar with transient error):**

```tsx
<box flexDirection="column" width="100%" height="100%">
  <box flexDirection="row" height={1} borderBottom="single">
    <box flexGrow={1}>
      <text color="muted">Dashboard</text>
      <text color="muted"> > </text>
      <text color="primary">Dashboard</text>
    </box>
    <box>
      <text color={connectionColor}>●</text>
    </box>
  </box>

  <box flexGrow={1}>
    <DashboardScreen />
  </box>

  <box flexDirection="row" height={1} borderTop="single">
    <box flexGrow={1}>
      {deepLinkError ? (
        <text color="error">{deepLinkError}</text>
      ) : (
        <text color="muted">{contextualHints}</text>
      )}
    </box>
    <box>
      <text color="muted">? help</text>
    </box>
  </box>
</box>
```

### Keybindings

Deep-link launch does not introduce any new keybindings. All keybindings on the deep-linked screen are identical to those available when navigating to the screen manually:

| Key | Action | Notes |
|-----|--------|-------|
| `q` | Pop to previous screen in pre-populated stack | Walks back through intermediate screens |
| `Esc` | Close overlay, or pop screen | Standard behavior |
| `Ctrl+C` | Quit immediately | Standard behavior |
| `?` | Toggle help overlay | Shows keybindings for the current (deep-linked) screen |
| `:` | Open command palette | Standard behavior |
| `g` | Enter go-to mode | Standard behavior; repo context is set if `--repo` was provided |

### Responsive Behavior

**80×24 (minimum):**
- Status bar error messages truncated with `…` if they exceed available width
- Breadcrumb for deep-linked stack truncated from left: e.g., `… > Issues` instead of `Dashboard > acme/api > Issues`
- Content area: 22 rows for the target screen

**120×40 (standard):**
- Full breadcrumb trail visible for stack depth ≤ 3
- Status bar error messages fully displayed
- Content area: 38 rows for the target screen

**200×60 (large):**
- Full breadcrumb, no truncation
- Status bar error messages with full context
- Content area: 58 rows for the target screen

### Data Hooks

The deep-link launch feature itself consumes:

| Hook / Function | Source | Purpose |
|----------------|--------|--------|
| `useNavigation()` | TUI internal | Access `push()` and `goTo()` for stack pre-population |
| `useTerminalDimensions()` | `@opentui/react` | Determine available width for error message truncation |
| `useOnResize()` | `@opentui/react` | Re-render on terminal resize during initial screen load |

Individual deep-linked screens consume their own data hooks (e.g., `useIssues()`, `useLandings()`, `useWorkflows()`). The deep-link feature does not pre-fetch data — it only initializes the navigation stack and mounts the target screen component, which then fetches its own data.

The deep-link resolution passes context through to the `NavigationContext`:
- `--repo acme/api` sets `repoContext` to `"acme/api"`, available via `useNavigation().repoContext`
- `--org acme` sets `orgContext` to `"acme"`, available via `useNavigation().orgContext`

## Permissions & Security

### Authorization

- **No additional authorization is required** for deep-link launch. The same authentication that grants access to the TUI Dashboard grants access to any deep-linked screen.
- **Per-screen authorization** is enforced at the API layer when the target screen fetches data. For example, `--screen issues --repo private/repo` will show a permission error on the issues screen if the user does not have access to that repository.
- **Deep-link parameters do not bypass any access controls.** A `--screen settings` deep-link does not grant access to settings that the user's token would not already allow.

### Token Handling

- Deep-link flags (`--screen`, `--repo`, `--org`) are plain text parameters and contain no sensitive data.
- The auth token is loaded via the standard TUI_AUTH_TOKEN_LOADING flow. Deep-link launch does not modify, create, or store any tokens.
- Token validation occurs before the deep-linked screen renders. A user with an invalid token will see the auth error screen regardless of deep-link parameters.

### Rate Limiting

- Deep-link launch generates at most one API request during authentication (`GET /api/user`). The target screen's data hooks may generate additional requests, but these are subject to the same rate limits as manual navigation.
- Repeated deep-link launches (e.g., a script launching `codeplane tui --screen ...` in a loop) are subject to the API server's standard rate limiting. The TUI does not implement client-side rate limiting for deep-link launches.

### Input Sanitization

- `--screen` is validated against a hardcoded allowlist. Values not in the list are rejected — they are never interpolated into API URLs, shell commands, or log messages without truncation.
- `--repo` and `--org` are validated against strict regex patterns. Characters outside `[a-zA-Z0-9_.-/]` cause immediate rejection.
- Error messages displaying invalid input values are truncated to prevent log injection or terminal escape sequence injection. Control characters (ASCII 0–31 except newline) and ANSI escape sequences are stripped from displayed error messages.
- All deep-link parameter values are treated as untrusted input. They are validated before being used to construct API queries or navigation state.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.deep_link.launch` | TUI launched with any deep-link flag | `screen`, `has_repo`, `has_org`, `terminal_width`, `terminal_height`, `color_depth` |
| `tui.deep_link.resolved` | Deep-link validation passed and stack pre-populated | `screen`, `repo_slug` (hashed), `org_slug` (hashed), `stack_depth`, `duration_ms` |
| `tui.deep_link.failed` | Deep-link validation failed | `screen`, `reason` (`unknown_screen`, `missing_repo`, `invalid_repo_format`, `invalid_org_format`), `raw_screen_value` (truncated to 32 chars) |
| `tui.deep_link.nav_back` | User pressed `q` to navigate back from a deep-linked screen | `screen`, `stack_depth_before`, `stack_depth_after`, `time_on_screen_ms` |
| `tui.deep_link.session_end` | TUI session that started via deep-link ends | `initial_screen`, `screens_visited_count`, `session_duration_ms`, `exit_method`, `navigated_beyond_initial` (bool) |

### Event Properties (Common)

- `screen`: The `--screen` value provided (or `null` if only `--repo`/`--org` was provided)
- `has_repo`: Boolean indicating whether `--repo` was provided
- `has_org`: Boolean indicating whether `--org` was provided
- `terminal_width`, `terminal_height`: Terminal dimensions at launch
- `color_depth`: Detected color support (`16`, `256`, `truecolor`)
- `duration_ms`: Time from TUI process start to target screen first render (includes auth)
- `session_duration_ms`: Total time the TUI was open
- `exit_method`: `quit` (q from root), `ctrl_c`, or `error`
- `navigated_beyond_initial`: Whether the user navigated to any screen not in the pre-populated stack

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Deep-link usage rate | > 15% of TUI sessions | Percentage of TUI launches that use `--screen`, `--repo`, or `--org` |
| Deep-link validation success rate | > 90% | Percentage of deep-link launches where all parameters pass validation |
| Deep-link to engagement | > 60% | Percentage of deep-link sessions where the user interacts with the target screen (not just immediately quit) |
| Backward navigation rate | > 40% | Percentage of deep-link sessions where the user presses `q` to explore the pre-populated stack |
| Time to first interaction | < 500ms | Median time from process start to the user's first keypress on the target screen (includes auth) |
| Deep-link error rate | < 10% | Percentage of deep-link launches that fail validation |
| Most common deep-link screens | Informational | Distribution of `--screen` values to inform product investment |

## Observability

### Logging

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `info` | Deep-link launch detected | `deep-link: launching with --screen {screen} --repo {repo} --org {org}` |
| `info` | Deep-link resolved | `deep-link: resolved to stack [{stack_entries}], depth {depth}` |
| `warn` | Unknown screen | `deep-link: unknown --screen value "{value}" (truncated), falling back to dashboard` |
| `warn` | Missing repo context | `deep-link: --screen {screen} requires --repo but none provided, falling back to dashboard` |
| `warn` | Invalid repo format | `deep-link: --repo "{value}" (truncated) does not match OWNER/REPO format, falling back to dashboard` |
| `warn` | Invalid org format | `deep-link: --org "{value}" (truncated) does not match slug format, falling back to dashboard` |
| `debug` | Argument parsing | `deep-link: raw args: {argv_subset}` |
| `debug` | Stack construction | `deep-link: building stack entry {index}: {screen_id} with context {context}` |
| `debug` | Status bar error displayed | `deep-link: showing transient error in status bar: "{message}" for 5000ms` |
| `debug` | Status bar error cleared | `deep-link: transient error cleared from status bar` |

Logs are written to stderr. Log level is controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Unrecognized `--screen` value | Not in allowlist | Launch to Dashboard; show transient status bar error for 5s |
| `--screen` requires repo but `--repo` not provided | Screen ID in repo-required set and no `--repo` flag | Launch to Dashboard; show transient status bar error for 5s |
| `--repo` fails regex validation | Does not match `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$` | Launch to Dashboard; show transient status bar error for 5s |
| `--org` fails regex validation | Does not match `^[a-zA-Z0-9_.-]+$` | Launch to Dashboard; show transient status bar error for 5s |
| Deep-linked repo does not exist | Target screen's data hook returns 404 | Screen shows "Repository not found" error; `q` pops to Dashboard |
| Deep-linked repo not authorized | Target screen's data hook returns 403 | Screen shows "Access denied" error; `q` pops to Dashboard |
| Auth fails during deep-link launch | TUI_AUTH_TOKEN_LOADING surfaces error | Auth error screen shown; deep-link params preserved in memory for retry via `R` |
| Terminal resize during deep-link stack construction | `useOnResize` fires | Stack construction is synchronous and unaffected; screen renders at new dimensions |
| SSE disconnect during deep-link screen data load | SSE provider detects loss | Status bar shows disconnect indicator; screen data loads via HTTP; SSE reconnects independently |
| Network timeout on deep-linked screen data | Data hook timeout (30s) | Screen shows timeout error with `R` to retry; stack is intact for `q` navigation |
| `--screen` value contains control characters or escape sequences | Input sanitization detects chars outside printable ASCII | Characters stripped before display in error message; treated as unrecognized screen |

### Failure Modes

- **Invalid argument combination**: If the user provides contradictory flags (e.g., `--screen orgs --repo acme/api`), the TUI ignores the unused context parameter and launches to the orgs screen. The `--repo` is stored in `repoContext` but not passed to the orgs screen.
- **Process startup crash**: If argument parsing itself throws (e.g., malformed UTF-8 in flag values), the TUI exits with a stderr error message and non-zero exit code.
- **Auth retry preserves deep-link**: If the user presses `R` on the auth error screen, the retry flow re-uses the original deep-link parameters. The user does not need to re-launch the TUI.

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

### Terminal Snapshot Tests

- **deep-link-dashboard-default**: Launch `codeplane tui` with no flags → Dashboard rendered, breadcrumb shows "Dashboard" only, stack depth 1
- **deep-link-screen-repos**: Launch `--screen repos` → Repository list screen rendered, breadcrumb shows "Dashboard > Repositories"
- **deep-link-screen-notifications**: Launch `--screen notifications` → Notifications screen rendered, breadcrumb shows "Dashboard > Notifications"
- **deep-link-screen-settings**: Launch `--screen settings` → Settings screen rendered, breadcrumb shows "Dashboard > Settings"
- **deep-link-screen-search**: Launch `--screen search` → Search screen rendered, breadcrumb shows "Dashboard > Search"
- **deep-link-repo-context-only**: Launch `--repo acme/api` (no --screen) → Repository overview for acme/api rendered, breadcrumb shows "Dashboard > acme/api"
- **deep-link-issues-with-repo**: Launch `--screen issues --repo acme/api` → Issue list screen rendered, breadcrumb shows "Dashboard > acme/api > Issues"
- **deep-link-landings-with-repo**: Launch `--screen landings --repo acme/api` → Landing request list rendered, breadcrumb shows "Dashboard > acme/api > Landings"
- **deep-link-workflows-with-repo**: Launch `--screen workflows --repo acme/api` → Workflow list rendered, breadcrumb shows "Dashboard > acme/api > Workflows"
- **deep-link-wiki-with-repo**: Launch `--screen wiki --repo acme/api` → Wiki page list rendered, breadcrumb shows "Dashboard > acme/api > Wiki"
- **deep-link-orgs-screen**: Launch `--screen orgs` → Organization list rendered, breadcrumb shows "Dashboard > Organizations"
- **deep-link-org-context-only**: Launch `--org acme` → Organization overview for acme rendered, breadcrumb shows "Dashboard > acme"
- **deep-link-unknown-screen-error**: Launch `--screen foobar` → Dashboard rendered, status bar shows "Unknown screen: foobar" in error color
- **deep-link-missing-repo-error**: Launch `--screen issues` (no --repo) → Dashboard rendered, status bar shows "--repo required for issues" in error color
- **deep-link-invalid-repo-error**: Launch `--screen issues --repo "inv@lid!!!"` → Dashboard rendered, status bar shows "Invalid repository format: inv@lid!!! (expected OWNER/REPO)" in error color
- **deep-link-invalid-org-error**: Launch `--org "inv@lid!!!"` → Dashboard rendered, status bar shows "Invalid organization format: inv@lid!!!" in error color
- **deep-link-error-clears-after-5s**: Launch `--screen foobar` → status bar error visible → wait 5 seconds → status bar shows normal keybinding hints
- **deep-link-loading-state**: Launch `--screen issues --repo acme/api` with slow API → content area shows "Loading…" spinner while header bar shows pre-populated breadcrumb

### Keyboard Interaction Tests

- **deep-link-q-walks-back-from-issues**: Launch `--screen issues --repo acme/api`, press `q` → repo overview for acme/api shown, breadcrumb "Dashboard > acme/api", stack depth 2
- **deep-link-q-walks-back-from-repo**: Continue from above, press `q` → Dashboard shown, stack depth 1
- **deep-link-q-exits-from-dashboard**: Continue from above, press `q` → TUI exits cleanly
- **deep-link-q-walks-back-from-notifications**: Launch `--screen notifications`, press `q` → Dashboard shown, stack depth 1
- **deep-link-escape-pops-from-deep-linked-screen**: Launch `--screen repos`, press `Esc` → Dashboard shown (no overlay was open)
- **deep-link-ctrl-c-exits-from-deep-linked-screen**: Launch `--screen issues --repo acme/api`, press `Ctrl+C` → TUI exits immediately
- **deep-link-goto-from-deep-linked-screen**: Launch `--screen notifications`, press `g` then `r` → Repository list shown, repo context from deep-link preserved
- **deep-link-goto-with-repo-context**: Launch `--screen issues --repo acme/api`, press `g` then `l` → Landings for acme/api shown (repo context preserved from deep-link)
- **deep-link-command-palette-from-deep-linked-screen**: Launch `--screen repos`, press `:` → command palette opens, type "notifications", press Enter → Notifications screen shown
- **deep-link-help-overlay-from-deep-linked-screen**: Launch `--screen issues --repo acme/api`, press `?` → help overlay shown with keybindings for the issues screen
- **deep-link-enter-pushes-from-deep-linked-list**: Launch `--screen issues --repo acme/api`, press `Enter` on first issue → issue detail pushed, breadcrumb shows "Dashboard > acme/api > Issues > #<id>", stack depth 4
- **deep-link-error-screen-still-navigable**: Launch `--screen foobar` → Dashboard shown with error, press `g` then `n` → Notifications shown, error message no longer visible
- **deep-link-rapid-q-from-deep-stack**: Launch `--screen issues --repo acme/api` (depth 3), send `q` `q` `q` rapidly → TUI exits cleanly

### Responsive Tests

- **deep-link-80x24-breadcrumb-truncation**: Launch `--screen issues --repo acme/api` at 80×24 → breadcrumb truncated from left, e.g., "… > Issues", content area 22 rows
- **deep-link-80x24-error-truncation**: Launch `--screen issues --repo very-long-org-name/very-long-repo-name` (invalid, too long) at 80×24 → error message truncated with `…` to fit status bar
- **deep-link-120x40-full-breadcrumb**: Launch `--screen issues --repo acme/api` at 120×40 → full breadcrumb "Dashboard > acme/api > Issues" visible, content area 38 rows
- **deep-link-200x60-full-breadcrumb**: Launch `--screen issues --repo acme/api` at 200×60 → full breadcrumb with no truncation, content area 58 rows
- **deep-link-resize-after-launch**: Launch `--screen issues --repo acme/api` at 120×40 → resize to 80×24 → breadcrumb truncation activates, content re-renders at new size
- **deep-link-resize-to-too-small**: Launch `--screen issues --repo acme/api` at 120×40 → resize to 60×20 → "Terminal too small" message replaces content
- **deep-link-resize-from-too-small**: Continue from above, resize to 120×40 → issues screen restores with full breadcrumb and pre-populated stack intact

### Integration Tests

- **deep-link-auth-then-screen**: Launch `--screen issues --repo acme/api` with valid token → auth loading screen shown first → then issues screen rendered (no Dashboard flash)
- **deep-link-auth-failure-preserves-params**: Launch `--screen issues --repo acme/api` with invalid token → auth error screen → fix token externally → press `R` → issues screen for acme/api rendered (not Dashboard)
- **deep-link-nonexistent-repo**: Launch `--screen issues --repo nonexistent/repo` → auth succeeds → issues screen shows "Repository not found" error → press `q` → Dashboard shown
- **deep-link-no-color-terminal**: Launch `--screen foobar` with `NO_COLOR=1` → error message uses text prefix `[ERROR]` instead of color
- **deep-link-case-insensitive-screen**: Launch `--screen Issues` → normalized to `issues`, launches correctly to issue list (requires repo context validation)
- **deep-link-notification-badge-on-deep-linked-screen**: Launch `--screen repos` → notification badge in header bar reflects current unread count from SSE
