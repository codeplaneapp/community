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
- [ ] Supported `--screen` values: `dashboard`, `repos`, `repositories`, `issues`, `landings`, `landing-requests`, `workspaces`, `workflows`, `search`, `notifications`, `agents`, `settings`, `organizations`, `orgs`, `sync`, `wiki`, `repo-detail`
- [ ] The navigation stack is pre-populated with intermediate screens for backward navigation via `q`
- [ ] Pre-populated stack for context-free screens: `[Dashboard, <screen>]` (depth 2)
- [ ] Pre-populated stack for repo-context screens: `[Dashboard, RepoOverview(<owner/repo>), <screen>]` (depth 3)
- [ ] Pre-populated stack for org-context screens: `[Dashboard, OrgOverview(<slug>), <screen>]` (depth 3)
- [ ] `--screen dashboard` pre-populates a stack of depth 1 (Dashboard only)
- [ ] `--repo` without `--screen` pre-populates: `[Dashboard, RepoOverview(<owner/repo>)]` (depth 2)
- [ ] `--org` without `--screen` pre-populates: `[Dashboard, OrgOverview(<slug>)]` (depth 2)
- [ ] Deep-link authentication completes before screen navigation — the auth loading screen is shown first, then the deep-linked screen
- [ ] Breadcrumb trail in the header bar accurately reflects the pre-populated stack
- [ ] After deep-link launch, all standard navigation (go-to mode, command palette, `q`, `Esc`) works identically to manual navigation
- [ ] The CLI command `codeplane tui` accepts `--screen`, `--repo`, and `--org` flags and forwards them to the TUI entry point
- [ ] Screen name resolution is case-insensitive (`--screen Issues` is equivalent to `--screen issues`)

### Validation & Error Handling

- [ ] `--screen` value is validated against the allowlist of supported screen IDs (case-insensitive comparison, stored lowercase)
- [ ] `--repo` value is validated against the regex pattern `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$`
- [ ] `--org` value is validated against the regex pattern `^[a-zA-Z0-9_.-]+$`
- [ ] If `--screen` requires repo context (`issues`, `landings`, `workflows`, `wiki`, and all other `requiresRepo: true` screens) but `--repo` is not provided, the TUI launches to Dashboard and the status bar shows `--repo required for <screen>` in error color for 5 seconds
- [ ] If `--screen` is an unrecognized value, the TUI launches to Dashboard and the status bar shows `Unknown screen: "<value>"` in error color for 5 seconds
- [ ] If `--repo` value fails regex validation, the TUI launches to Dashboard and the status bar shows `Invalid repository format: "<value>"` in error color for 5 seconds
- [ ] If `--org` value fails regex validation, the TUI launches to Dashboard and the status bar shows `Invalid organization format: "<value>"` in error color for 5 seconds
- [ ] Unrecognized `--screen` values are truncated to 32 characters in the error message to prevent visual overflow
- [ ] Invalid `--repo` values are truncated to 64 characters in the error message
- [ ] Invalid `--org` values are truncated to 32 characters in the error message
- [ ] All validation occurs before authentication — invalid deep-link parameters do not delay or block the auth flow
- [ ] Control characters (ASCII 0–31 except newline) and ANSI escape sequences are stripped from user-provided values before display in error messages

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
- [ ] Navigation stack maximum depth: 32 entries (enforced by `MAX_STACK_DEPTH`)

## Design

### CLI Command

The `codeplane tui` CLI command accepts three deep-link flags:

```
codeplane tui [--screen <id>] [--repo <owner/repo>] [--org <slug>]
```

**Flags:**

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--screen` | string | No | Target screen identifier. Case-insensitive. See allowlist below. |
| `--repo` | string | No | Repository context in `OWNER/REPO` format. Required for repo-scoped screens. |
| `--org` | string | No | Organization context as a slug. Required for org-scoped screens. |

**Screen Allowlist:**

| Screen ID | Aliases | Requires `--repo` | Requires `--org` | Target Screen |
|-----------|---------|-------------------|-------------------|---------------|
| `dashboard` | — | No | No | Dashboard |
| `repos` | `repositories` | No | No | Repository List |
| `repo-detail` | — | Yes | No | Repository Overview |
| `issues` | — | Yes | No | Issues |
| `landings` | `landing-requests` | Yes | No | Landings |
| `workflows` | — | Yes | No | Workflows |
| `wiki` | — | Yes | No | Wiki |
| `workspaces` | — | No | No | Workspaces |
| `search` | — | No | No | Search |
| `notifications` | — | No | No | Notifications |
| `agents` | — | No | No | Agents |
| `settings` | — | No | No | Settings |
| `organizations` | `orgs` | No | No | Organizations |
| `sync` | — | No | No | Sync |

The CLI command parses these flags and passes them as process arguments to the TUI entry point (`apps/tui/src/index.tsx`).

### Deep-Link Resolution Flow

```
CLI argument parsing (parseCLIArgs)
  ↓
Validate --screen against allowlist (resolveScreenName)
Validate --repo against regex
Validate --org against regex
  ↓ (validation fails → set error message, fallback to Dashboard stack)
  ↓ (validation passes → determine target screen + context)
  ↓
Build initial navigation stack (buildInitialStack)
  ↓
Auth token loading (AuthProvider)
  ↓ (auth fails → show auth error screen; deep-link params preserved for retry)
  ↓ (auth succeeds → proceed)
  ↓
Mount target screen component via NavigationProvider(initialStack)
  ↓
Show status bar error if validation failed (5s transient)
```

### Stack Pre-Population Rules

| Flags | Resulting Stack | Depth |
|-------|----------------|-------|
| (none) | `[Dashboard]` | 1 |
| `--screen dashboard` | `[Dashboard]` | 1 |
| `--screen repos` | `[Dashboard, RepoList]` | 2 |
| `--screen notifications` | `[Dashboard, Notifications]` | 2 |
| `--screen search` | `[Dashboard, Search]` | 2 |
| `--screen workspaces` | `[Dashboard, Workspaces]` | 2 |
| `--screen agents` | `[Dashboard, Agents]` | 2 |
| `--screen settings` | `[Dashboard, Settings]` | 2 |
| `--screen sync` | `[Dashboard, Sync]` | 2 |
| `--screen organizations` | `[Dashboard, Organizations]` | 2 |
| `--repo acme/api` | `[Dashboard, RepoOverview(acme/api)]` | 2 |
| `--screen issues --repo acme/api` | `[Dashboard, RepoOverview(acme/api), Issues]` | 3 |
| `--screen landings --repo acme/api` | `[Dashboard, RepoOverview(acme/api), Landings]` | 3 |
| `--screen workflows --repo acme/api` | `[Dashboard, RepoOverview(acme/api), Workflows]` | 3 |
| `--screen wiki --repo acme/api` | `[Dashboard, RepoOverview(acme/api), Wiki]` | 3 |
| `--org acme` | `[Dashboard, OrgOverview(acme)]` | 2 |
| `--screen orgs --org acme` | `[Dashboard, OrgOverview(acme)]` | 2 |

### TUI UI

#### Layout: Deep-Linked Screen After Launch

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

#### Layout: Deep-Link Failure (Dashboard with Status Bar Error)

When validation fails, the user lands on Dashboard with a transient error in the status bar:

```
┌──────────────────────────────────────────────────────┐
│ Dashboard                                           ●│
├──────────────────────────────────────────────────────┤
│                                                      │
│  Dashboard                                           │
│  ─────────                                           │
│  Recent repos, starred repos, activity feed ...      │
│                                                      │
├──────────────────────────────────────────────────────┤
│ Unknown screen: "foobar"                    ? help   │
└──────────────────────────────────────────────────────┘
```

The error text renders in the `error` semantic color (ANSI red 196). After 5 seconds, it auto-clears and the status bar reverts to showing contextual keybinding hints.

On `NO_COLOR=1` terminals, the error is prefixed with `[ERROR]` instead of relying on color.

#### OpenTUI Component Tree (Status Bar with Transient Error)

```tsx
<box flexDirection="column" width="100%" height="100%">
  {/* Header bar */}
  <box flexDirection="row" height={1} borderBottom="single">
    <box flexGrow={1}>
      <text color="muted">Dashboard</text>
      <text color="muted"> > </text>
      <text color="primary">acme/api</text>
      <text color="muted"> > </text>
      <text color="primary">Issues</text>
    </box>
    <box>
      <text color={connectionColor}>●</text>
    </box>
  </box>

  {/* Content area — target screen component */}
  <box flexGrow={1}>
    <ScreenRouter />
  </box>

  {/* Status bar with transient error */}
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

#### Keybindings

Deep-link launch does not introduce any new keybindings. All keybindings on the deep-linked screen are identical to those available when navigating to the screen manually:

| Key | Action | Notes |
|-----|--------|-------|
| `q` | Pop to previous screen in pre-populated stack | Walks back through intermediate screens |
| `Esc` | Close overlay, or pop screen | Standard behavior |
| `Ctrl+C` | Quit immediately | Standard behavior |
| `?` | Toggle help overlay | Shows keybindings for the current (deep-linked) screen |
| `:` | Open command palette | Standard behavior |
| `g` | Enter go-to mode | Standard behavior; repo context is set if `--repo` was provided |

#### Responsive Behavior

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

#### Data Hooks

The deep-link launch feature itself consumes:

| Hook / Function | Source | Purpose |
|----------------|--------|--------|
| `buildInitialStack()` | `apps/tui/src/navigation/deepLinks.ts` | Resolves screen name, validates args, constructs initial stack |
| `parseCLIArgs()` | `apps/tui/src/lib/terminal.ts` | Parses `--screen`, `--repo`, `--org` from process.argv |
| `useNavigation()` | `apps/tui/src/providers/NavigationProvider.tsx` | Provides navigation state initialized from `initialStack` |
| `useTerminalDimensions()` | `@opentui/react` | Determines available width for error message truncation |
| `useOnResize()` | `@opentui/react` | Re-render on terminal resize during initial screen load |

Individual deep-linked screens consume their own data hooks (e.g., `useIssues()`, `useLandings()`, `useWorkflows()`). The deep-link feature does not pre-fetch data — it only initializes the navigation stack and mounts the target screen component, which then fetches its own data.

The deep-link resolution passes context through to the `NavigationContext`:
- `--repo acme/api` results in `repoContext` of `{ owner: "acme", repo: "api" }`, available via `useNavigation().repoContext`
- `--org acme` results in `orgContext` of `{ org: "acme" }`, available via `useNavigation().orgContext`

### Documentation

The following end-user documentation should be written:

**CLI Reference — `codeplane tui` command:**

Add `--screen`, `--repo`, and `--org` flags to the `codeplane tui` help output with descriptions and examples:

```
USAGE:
  codeplane tui [flags]

FLAGS:
  --screen <id>         Jump directly to a specific screen (e.g., issues, workflows)
  --repo <owner/repo>   Set repository context (e.g., acme/api)
  --org <slug>          Set organization context (e.g., acme)

EXAMPLES:
  codeplane tui --screen issues --repo acme/api
  codeplane tui --screen notifications
  codeplane tui --repo acme/api
  codeplane tui --screen workflows --repo acme/api
  codeplane tui --org acme
```

**TUI Help Overlay — Deep-Link section:**

When the user presses `?` on any screen, the help overlay should mention that screens can be launched directly via CLI flags. No separate documentation page is needed — this is inline help.

## Permissions & Security

### Authorization

- **No additional authorization is required** for deep-link launch. The same authentication that grants access to the TUI Dashboard grants access to any deep-linked screen.
- **Per-screen authorization** is enforced at the API layer when the target screen fetches data. For example, `--screen issues --repo private/repo` will show a permission error on the issues screen if the user does not have access to that repository.
- **Deep-link parameters do not bypass any access controls.** A `--screen settings` deep-link does not grant access to settings that the user's token would not already allow.
- All authorization roles (Owner, Admin, Member, Read-Only, Anonymous) function identically whether the user arrived via deep-link or manual navigation. The deep-link layer is purely a navigation shortcut.

### Token Handling

- Deep-link flags (`--screen`, `--repo`, `--org`) are plain text parameters and contain no sensitive data.
- The auth token is loaded via the standard TUI_AUTH_TOKEN_LOADING flow. Deep-link launch does not modify, create, or store any tokens.
- Token validation occurs before the deep-linked screen renders. A user with an invalid token will see the auth error screen regardless of deep-link parameters.

### Rate Limiting

- Deep-link launch generates at most one API request during authentication (`GET /api/user`). The target screen's data hooks may generate additional requests, but these are subject to the same rate limits as manual navigation.
- Repeated deep-link launches (e.g., a script launching `codeplane tui --screen ...` in a loop) are subject to the API server's standard rate limiting. The TUI does not implement client-side rate limiting for deep-link launches.
- There is no amplification vector — deep-links do not trigger batch or recursive API calls beyond what manual navigation would trigger.

### Input Sanitization

- `--screen` is validated against a hardcoded allowlist. Values not in the list are rejected — they are never interpolated into API URLs, shell commands, or log messages without truncation.
- `--repo` and `--org` are validated against strict regex patterns. Characters outside `[a-zA-Z0-9_.-/]` cause immediate rejection.
- Error messages displaying invalid input values are truncated to prevent log injection or terminal escape sequence injection. Control characters (ASCII 0–31 except newline) and ANSI escape sequences are stripped from displayed error messages.
- All deep-link parameter values are treated as untrusted input. They are validated before being used to construct API queries or navigation state.

### Data Privacy

- No PII is collected or transmitted as part of deep-link resolution. The `--screen`, `--repo`, and `--org` flags contain identifiers that are already visible to the user.
- Telemetry events hash repository and organization slugs before transmission (see Telemetry section).
- Error messages containing user input are logged at `warn` level with truncation; they are never logged at `info` or below to avoid inadvertent exposure in verbose log streams.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.deep_link.launch` | TUI launched with any deep-link flag (`--screen`, `--repo`, or `--org`) | `screen`, `has_repo`, `has_org`, `terminal_width`, `terminal_height`, `color_depth` |
| `tui.deep_link.resolved` | Deep-link validation passed and stack pre-populated | `screen`, `repo_slug` (SHA-256 hashed), `org_slug` (SHA-256 hashed), `stack_depth`, `duration_ms` |
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

### Funnel Metrics

1. **Deep-link invocation** → 2. **Validation success** → 3. **Target screen rendered** → 4. **First interaction on target screen** → 5. **Navigated beyond initial screen** → 6. **Session lasted > 30s**

Drop-off between steps 1→2 indicates documentation or UX issues with flag syntax. Drop-off between steps 3→4 indicates the deep-link resolved but the screen content wasn't what the user expected. Drop-off between steps 4→5 indicates the deep-link served its purpose (quick lookup) — this is not necessarily negative.

## Observability

### Logging

| Log Level | Event | Message Format | Structured Context |
|-----------|-------|----------------|--------------------|
| `info` | Deep-link launch detected | `deep-link: launching with --screen {screen} --repo {repo} --org {org}` | `{ component: "tui", phase: "deep-link", screen, repo, org }` |
| `info` | Deep-link resolved | `deep-link: resolved to stack [{stack_entries}], depth {depth}` | `{ component: "tui", phase: "deep-link", stack_depth, screen_names }` |
| `warn` | Unknown screen | `deep-link: unknown --screen value "{value}" (truncated), falling back to dashboard` | `{ component: "tui", phase: "deep-link", error: "unknown_screen", raw_value }` |
| `warn` | Missing repo context | `deep-link: --screen {screen} requires --repo but none provided, falling back to dashboard` | `{ component: "tui", phase: "deep-link", error: "missing_repo", screen }` |
| `warn` | Invalid repo format | `deep-link: --repo "{value}" (truncated) does not match OWNER/REPO format, falling back to dashboard` | `{ component: "tui", phase: "deep-link", error: "invalid_repo", raw_value }` |
| `warn` | Invalid org format | `deep-link: --org "{value}" (truncated) does not match slug format, falling back to dashboard` | `{ component: "tui", phase: "deep-link", error: "invalid_org", raw_value }` |
| `debug` | Argument parsing | `deep-link: raw args: {argv_subset}` | `{ component: "tui", phase: "deep-link", argv }` |
| `debug` | Stack construction | `deep-link: building stack entry {index}: {screen_id} with context {context}` | `{ component: "tui", phase: "deep-link", index, screen_id, context }` |
| `debug` | Status bar error displayed | `deep-link: showing transient error in status bar: "{message}" for 5000ms` | `{ component: "tui", phase: "deep-link", error_message, duration_ms: 5000 }` |
| `debug` | Status bar error cleared | `deep-link: transient error cleared from status bar` | `{ component: "tui", phase: "deep-link" }` |

Logs are written to stderr. Log level is controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`). When `--debug` flag or `CODEPLANE_TUI_DEBUG=true` is set, log level is set to `debug`.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `tui_deep_link_launches_total` | Counter | `screen`, `has_repo`, `has_org` | Total number of TUI launches with deep-link flags |
| `tui_deep_link_validation_failures_total` | Counter | `reason` (`unknown_screen`, `missing_repo`, `invalid_repo_format`, `invalid_org_format`) | Total validation failures by reason |
| `tui_deep_link_resolution_duration_seconds` | Histogram | `screen` | Time from argument parsing to stack construction completion |
| `tui_deep_link_time_to_render_seconds` | Histogram | `screen` | Time from process start to target screen first render |
| `tui_deep_link_session_duration_seconds` | Histogram | `screen` | Total session duration for deep-link launched sessions |
| `tui_deep_link_stack_depth` | Histogram | — | Distribution of pre-populated stack depths |

### Alerts

#### ALERT: `TUIDeepLinkHighValidationFailureRate`

**Condition:** `tui_deep_link_validation_failures_total / tui_deep_link_launches_total > 0.25` over 1 hour window.

**Severity:** Warning

**Runbook:**
1. Check the `reason` label distribution on `tui_deep_link_validation_failures_total` to identify the most common failure type.
2. If `unknown_screen` dominates: check if a screen ID was recently renamed or removed. Verify CLI help text matches the current allowlist. Check if an external integration (CI, agent) is using a stale screen ID.
3. If `missing_repo` dominates: check if users are following outdated documentation that omits `--repo` for repo-scoped screens.
4. If `invalid_repo_format` dominates: check if a common automation tool is passing repository identifiers in a non-`OWNER/REPO` format (e.g., full URLs).
5. Review recent warn-level logs with `component: "tui", phase: "deep-link"` for pattern analysis.
6. If the rate is caused by a single automated source, consider reaching out to that integration's maintainer.

#### ALERT: `TUIDeepLinkSlowResolution`

**Condition:** `histogram_quantile(0.95, tui_deep_link_time_to_render_seconds) > 2.0` over 15 minute window.

**Severity:** Warning

**Runbook:**
1. Check if the slow resolution is in the `tui_deep_link_resolution_duration_seconds` (stack construction) or the delta to `tui_deep_link_time_to_render_seconds` (auth + render).
2. If stack construction is slow: this is unexpected as it is synchronous and CPU-only. Check for resource exhaustion on the host.
3. If auth is slow: check the API server's `GET /api/user` endpoint latency. This is likely an API-side issue, not a deep-link issue.
4. If render is slow: check if the target screen's data hooks are experiencing slow API responses. Cross-reference with API latency dashboards.
5. Check `terminal_width` and `terminal_height` from recent events — extremely large terminals can slow initial render.

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Unrecognized `--screen` value | Not in allowlist | Launch to Dashboard; show transient status bar error for 5s |
| `--screen` requires repo but `--repo` not provided | Screen ID in repo-required set and no `--repo` flag | Launch to Dashboard; show transient status bar error for 5s |
| `--repo` fails regex validation | Does not match `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$` | Launch to Dashboard; show transient status bar error for 5s |
| `--org` fails regex validation | Does not match `^[a-zA-Z0-9_.-]+$` | Launch to Dashboard; show transient status bar error for 5s |
| `--screen` value exceeds 32 characters | Length check before allowlist lookup | Reject as unrecognized; truncate in error message |
| `--repo` value exceeds 128 characters | Length check before regex | Reject as invalid format; truncate in error message |
| `--org` value exceeds 64 characters | Length check before regex | Reject as invalid format; truncate in error message |
| Deep-linked repo does not exist | Target screen's data hook returns 404 | Screen shows "Repository not found" error; `q` pops to Dashboard |
| Deep-linked repo not authorized | Target screen's data hook returns 403 | Screen shows "Access denied" error; `q` pops to Dashboard |
| Auth fails during deep-link launch | TUI_AUTH_TOKEN_LOADING surfaces error | Auth error screen shown; deep-link params preserved in memory for retry via `R` |
| Terminal resize during deep-link stack construction | `useOnResize` fires | Stack construction is synchronous and unaffected; screen renders at new dimensions |
| SSE disconnect during deep-link screen data load | SSE provider detects loss | Status bar shows disconnect indicator; screen data loads via HTTP; SSE reconnects independently |
| Network timeout on deep-linked screen data | Data hook timeout (30s) | Screen shows timeout error with `R` to retry; stack is intact for `q` navigation |
| `--screen` value contains control characters or escape sequences | Input sanitization detects chars outside printable ASCII | Characters stripped before display in error message; treated as unrecognized screen |
| Contradictory flags (e.g., `--screen orgs --repo acme/api`) | Unused context parameter | TUI ignores the unused context; launches to orgs screen; `--repo` stored in `repoContext` but not consumed |
| Process startup crash from malformed UTF-8 in flag values | Argument parsing exception | TUI exits with stderr error message and non-zero exit code |
| Auth retry preserves deep-link | User presses `R` on auth error screen | Retry flow re-uses original deep-link parameters without re-launch |

### Failure Modes

- **Invalid argument combination**: If the user provides contradictory flags (e.g., `--screen orgs --repo acme/api`), the TUI ignores the unused context parameter and launches to the orgs screen. The `--repo` is stored in `repoContext` but not passed to the orgs screen.
- **Process startup crash**: If argument parsing itself throws (e.g., malformed UTF-8 in flag values), the TUI exits with a stderr error message and non-zero exit code.
- **Auth retry preserves deep-link**: If the user presses `R` on the auth error screen, the retry flow re-uses the original deep-link parameters. The user does not need to re-launch the TUI.

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

All tests target the `TUI_DEEP_LINK_LAUNCH` feature within the app-shell test suite using `@microsoft/tui-test`.

### Terminal Snapshot Tests

- **SNAP-DL-001: default launch (no flags) → Dashboard**: Launch `codeplane tui` with no flags → Dashboard rendered, breadcrumb shows "Dashboard" only, stack depth 1, snapshot matches golden file
- **SNAP-DL-002: --screen repos → Repository list**: Launch `--screen repos` → Repository list screen rendered, breadcrumb shows "Dashboard > Repositories", snapshot matches
- **SNAP-DL-003: --screen notifications → Notifications**: Launch `--screen notifications` → Notifications screen rendered, breadcrumb shows "Dashboard > Notifications"
- **SNAP-DL-004: --screen settings → Settings**: Launch `--screen settings` → Settings screen rendered, breadcrumb shows "Dashboard > Settings"
- **SNAP-DL-005: --screen search → Search**: Launch `--screen search` → Search screen rendered, breadcrumb shows "Dashboard > Search"
- **SNAP-DL-006: --screen workspaces → Workspaces**: Launch `--screen workspaces` → Workspaces screen rendered, breadcrumb shows "Dashboard > Workspaces"
- **SNAP-DL-007: --screen agents → Agents**: Launch `--screen agents` → Agents screen rendered, breadcrumb shows "Dashboard > Agents"
- **SNAP-DL-008: --screen sync → Sync**: Launch `--screen sync` → Sync screen rendered, breadcrumb shows "Dashboard > Sync"
- **SNAP-DL-009: --screen organizations → Organizations**: Launch `--screen organizations` → Organizations screen rendered, breadcrumb shows "Dashboard > Organizations"
- **SNAP-DL-010: --repo acme/api (no --screen) → Repo overview**: Launch `--repo acme/api` → Repository overview for acme/api rendered, breadcrumb shows "Dashboard > acme/api", stack depth 2
- **SNAP-DL-011: --screen issues --repo acme/api → Issue list**: Launch `--screen issues --repo acme/api` → Issue list screen rendered, breadcrumb shows "Dashboard > acme/api > Issues", stack depth 3
- **SNAP-DL-012: --screen landings --repo acme/api → Landings**: Launch `--screen landings --repo acme/api` → Landing request list rendered, breadcrumb shows "Dashboard > acme/api > Landings"
- **SNAP-DL-013: --screen workflows --repo acme/api → Workflows**: Launch `--screen workflows --repo acme/api` → Workflow list rendered, breadcrumb shows "Dashboard > acme/api > Workflows"
- **SNAP-DL-014: --screen wiki --repo acme/api → Wiki**: Launch `--screen wiki --repo acme/api` → Wiki page list rendered, breadcrumb shows "Dashboard > acme/api > Wiki"
- **SNAP-DL-015: --screen orgs → Organizations (alias)**: Launch `--screen orgs` → Organization list rendered, same as `--screen organizations`
- **SNAP-DL-016: --org acme → Org overview**: Launch `--org acme` → Organization overview for acme rendered, breadcrumb shows "Dashboard > acme"
- **SNAP-DL-017: --screen dashboard → Dashboard only**: Launch `--screen dashboard` → Dashboard rendered, breadcrumb shows "Dashboard" only, stack depth 1

### Validation Error Tests

- **ERR-DL-001: unknown --screen → Dashboard + status bar error**: Launch `--screen foobar` → Dashboard rendered, status bar shows `Unknown screen: "foobar"` in error color
- **ERR-DL-002: missing --repo for repo-scoped screen → error**: Launch `--screen issues` (no --repo) → Dashboard rendered, status bar shows `--repo required for issues screen` in error color
- **ERR-DL-003: invalid --repo format → error**: Launch `--screen issues --repo "inv@lid!!!"` → Dashboard rendered, status bar shows `Invalid repository format: "inv@lid!!!"` in error color
- **ERR-DL-004: invalid --org format → error**: Launch `--org "inv@lid!!!"` → Dashboard rendered, status bar shows `Invalid organization format: "inv@lid!!!"` in error color
- **ERR-DL-005: error auto-clears after 5 seconds**: Launch `--screen foobar` → status bar error visible → wait 5 seconds → status bar shows normal keybinding hints (error gone)
- **ERR-DL-006: --screen value exceeding 32 chars → rejected**: Launch `--screen aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (33 chars) → Dashboard rendered, status bar error shows truncated value
- **ERR-DL-007: --repo value exceeding 128 chars → rejected**: Launch `--repo` with a 129-character string → Dashboard rendered, status bar error shows truncated value
- **ERR-DL-008: --org value exceeding 64 chars → rejected**: Launch `--org` with a 65-character string → Dashboard rendered, status bar error shows truncated value
- **ERR-DL-009: --screen with control characters → sanitized and rejected**: Launch `--screen $'\x1b[31missues'` → Dashboard rendered, escape sequences stripped from error message display
- **ERR-DL-010: --repo with only owner (no slash) → invalid format**: Launch `--repo acme` → Dashboard rendered, status bar error about invalid format
- **ERR-DL-011: --repo with trailing slash → invalid format**: Launch `--repo acme/` → Dashboard rendered, status bar error about invalid format
- **ERR-DL-012: --repo with multiple slashes → invalid format**: Launch `--repo acme/api/extra` → Dashboard rendered, status bar error about invalid format

### Keyboard Interaction Tests

- **KEY-DL-001: q walks back from repo-scoped deep-linked screen**: Launch `--screen issues --repo acme/api`, press `q` → repo overview for acme/api shown, breadcrumb "Dashboard > acme/api", stack depth 2
- **KEY-DL-002: q walks back from repo overview to dashboard**: Continue from KEY-DL-001, press `q` → Dashboard shown, stack depth 1
- **KEY-DL-003: q exits from dashboard (root)**: Continue from KEY-DL-002, press `q` → TUI exits cleanly with code 0
- **KEY-DL-004: q walks back from context-free deep-linked screen**: Launch `--screen notifications`, press `q` → Dashboard shown, stack depth 1
- **KEY-DL-005: Esc pops from deep-linked screen (no overlay open)**: Launch `--screen repos`, press `Esc` → Dashboard shown
- **KEY-DL-006: Ctrl+C exits from deep-linked screen**: Launch `--screen issues --repo acme/api`, press `Ctrl+C` → TUI exits immediately
- **KEY-DL-007: go-to from deep-linked screen preserves repo context**: Launch `--screen issues --repo acme/api`, press `g` then `l` → Landings for acme/api shown (repo context preserved)
- **KEY-DL-008: go-to to context-free screen from deep-linked screen**: Launch `--screen notifications`, press `g` then `r` → Repository list shown
- **KEY-DL-009: command palette navigation from deep-linked screen**: Launch `--screen repos`, press `:` → command palette opens, type "notifications", press Enter → Notifications screen shown
- **KEY-DL-010: help overlay from deep-linked screen**: Launch `--screen issues --repo acme/api`, press `?` → help overlay shown with keybindings for the issues screen
- **KEY-DL-011: Enter pushes detail from deep-linked list**: Launch `--screen issues --repo acme/api`, press `Enter` on first issue → issue detail pushed, breadcrumb shows "Dashboard > acme/api > Issues > #<id>", stack depth 4
- **KEY-DL-012: error screen still navigable**: Launch `--screen foobar` → Dashboard shown with error, press `g` then `n` → Notifications shown, error message no longer visible
- **KEY-DL-013: rapid q from deep stack exits cleanly**: Launch `--screen issues --repo acme/api` (depth 3), send `q` `q` `q` rapidly → TUI exits cleanly without crash
- **KEY-DL-014: case-insensitive --screen**: Launch `--screen Issues` → normalized to `issues`, issues screen requires repo context validation (shows appropriate error or renders if repo provided)
- **KEY-DL-015: --screen landing-requests alias**: Launch `--screen landing-requests --repo acme/api` → Landings screen rendered (alias resolved)
- **KEY-DL-016: --screen repositories alias**: Launch `--screen repositories` → Repository list rendered (alias resolved)

### Responsive Tests

- **RESP-DL-001: 80×24 breadcrumb truncation**: Launch `--screen issues --repo acme/api` at 80×24 → breadcrumb truncated from left, e.g., `… > Issues`, content area 22 rows
- **RESP-DL-002: 80×24 error message truncation**: Launch `--screen issues --repo very-long-org-name/very-long-repo-name` (invalid if too long) at 80×24 → error message truncated with `…` to fit status bar
- **RESP-DL-003: 120×40 full breadcrumb**: Launch `--screen issues --repo acme/api` at 120×40 → full breadcrumb "Dashboard > acme/api > Issues" visible, content area 38 rows
- **RESP-DL-004: 200×60 full breadcrumb (large)**: Launch `--screen issues --repo acme/api` at 200×60 → full breadcrumb with no truncation, content area 58 rows
- **RESP-DL-005: resize after deep-link launch**: Launch `--screen issues --repo acme/api` at 120×40 → resize to 80×24 → breadcrumb truncation activates, content re-renders at new size
- **RESP-DL-006: resize to below minimum**: Launch `--screen issues --repo acme/api` at 120×40 → resize to 60×20 → "Terminal too small" message replaces content
- **RESP-DL-007: resize from below minimum restores**: Continue from RESP-DL-006, resize to 120×40 → issues screen restores with full breadcrumb and pre-populated stack intact
- **RESP-DL-008: NO_COLOR error prefix**: Launch `--screen foobar` with `NO_COLOR=1` → error message uses text prefix `[ERROR]` instead of color-only indication

### Integration Tests

- **INT-DL-001: auth then deep-linked screen (no flash)**: Launch `--screen issues --repo acme/api` with valid token → auth loading screen shown first → then issues screen rendered (Dashboard never flashes)
- **INT-DL-002: auth failure preserves deep-link params**: Launch `--screen issues --repo acme/api` with invalid token → auth error screen → fix token → press `R` → issues screen for acme/api rendered (not Dashboard)
- **INT-DL-003: nonexistent repo shows screen-level error**: Launch `--screen issues --repo nonexistent/repo` → auth succeeds → issues screen shows "Repository not found" error → press `q` → Dashboard shown
- **INT-DL-004: unauthorized repo shows permission error**: Launch `--screen issues --repo private/repo` with read-only token → issues screen shows "Access denied" → press `q` → Dashboard
- **INT-DL-005: notification badge works on deep-linked screen**: Launch `--screen repos` → notification badge in header bar reflects current unread count from SSE
- **INT-DL-006: SSE reconnects on deep-linked screen**: Launch `--screen notifications` → SSE connected → simulate disconnect → status bar shows disconnect → SSE reconnects → notifications resume streaming
- **INT-DL-007: loading state on deep-linked screen**: Launch `--screen issues --repo acme/api` with slow API → content area shows "Loading…" spinner while header bar shows pre-populated breadcrumb immediately
- **INT-DL-008: contradictory flags handled gracefully**: Launch `--screen orgs --repo acme/api` → Organizations screen rendered, repo context stored but not consumed by orgs screen
- **INT-DL-009: --screen with --repo max valid length**: Launch `--screen issues --repo` with owner=64 chars and repo=64 chars (128 total + slash = 129, but each segment valid) → validates and renders correctly
- **INT-DL-010: CLI forwards all flags to TUI process**: Run `codeplane tui --screen issues --repo acme/api --org acme` → verify the spawned bun process receives `--screen issues --repo acme/api --org acme` in its argv

### Boundary Validation Tests

- **BOUND-DL-001: --screen at exactly 32 characters**: Launch `--screen` with a 32-character value → rejected as unrecognized (not in allowlist), but length is accepted
- **BOUND-DL-002: --screen at 33 characters**: Launch `--screen` with a 33-character value → rejected, error message shows truncated value
- **BOUND-DL-003: --repo at exactly 128 characters (valid format)**: Launch `--repo` with `owner/repo` totaling 128 chars and valid characters → accepted if segments are ≤ 64 chars each
- **BOUND-DL-004: --repo at 129 characters**: Launch `--repo` with 129-character string → rejected as invalid format
- **BOUND-DL-005: --org at exactly 64 characters**: Launch `--org` with a 64-character valid slug → accepted
- **BOUND-DL-006: --org at 65 characters**: Launch `--org` with a 65-character string → rejected as invalid format
- **BOUND-DL-007: owner segment at 64 characters**: Launch `--repo` with 64-char owner + `/` + short repo → accepted
- **BOUND-DL-008: owner segment at 65 characters**: Launch `--repo` with 65-char owner + `/` + short repo → rejected
- **BOUND-DL-009: empty --screen value**: Launch `--screen ""` → rejected as unrecognized screen
- **BOUND-DL-010: empty --repo value**: Launch `--repo ""` → rejected as invalid format
- **BOUND-DL-011: empty --org value**: Launch `--org ""` → rejected as invalid format
- **BOUND-DL-012: --repo with special valid characters**: Launch `--repo my.org-name/my_repo.name` → accepted (dots, hyphens, underscores are valid)
- **BOUND-DL-013: --repo with Unicode characters**: Launch `--repo café/résumé` → rejected (regex only allows ASCII alphanumeric + `_.-`)
- **BOUND-DL-014: breadcrumb truncation at 24-char segment limit**: Launch `--repo` with a 30-character repo name → breadcrumb segment truncated to 24 chars with `…`
