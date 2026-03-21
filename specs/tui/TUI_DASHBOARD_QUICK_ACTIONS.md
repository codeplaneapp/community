# TUI_DASHBOARD_QUICK_ACTIONS

Specification for TUI_DASHBOARD_QUICK_ACTIONS.

## High-Level User POV

The quick-actions bar is a persistent, single-row toolbar anchored to the bottom of the dashboard content area — directly above the global status bar. It gives the terminal developer instant access to the most common operations without navigating menus, opening the command palette, or remembering go-to sequences. The bar is always visible on the dashboard regardless of which panel is focused, and it responds to single-key presses that feel natural alongside the vim-style navigation the rest of the TUI uses.

When the developer lands on the dashboard after launching `codeplane tui`, the quick-actions bar is immediately visible at the bottom of the content area. It displays a compact row of labeled shortcuts: **`c`** to create a new repository, **`i`** to create a new issue (context-dependent — only active when a repository is in context from a previous navigation), **`n`** to jump to the notifications inbox, **`s`** to open global search, and **`/`** to activate the inline filter for whichever dashboard panel currently has focus. Each action is rendered as a bold key character followed by a muted-color label (e.g., `c:new repo`), separated by two spaces from the next action.

Pressing one of the quick-action keys triggers its action immediately. There is no confirmation dialog and no intermediate state — the TUI pushes the target screen onto the navigation stack (or activates the filter input) in under 50ms. Because these keys are single characters, they are only active when the dashboard panel list has focus and no text input (like the inline filter) is active. When the inline filter input is focused, all single-character keys route to the filter input instead, and the quick-action keys are temporarily suppressed to avoid conflicts.

The quick-actions bar adapts to the terminal width. At standard and large sizes (120+ columns), all action labels are shown in full (e.g., `n:notifications`). At minimum size (80×24), labels are abbreviated to fit (e.g., `n:notifs`). If the terminal is so narrow that not all actions fit on one row, the lowest-priority actions are hidden from right to left, but the remaining actions are always reachable via the command palette.

The bar serves a secondary purpose as a learning affordance. New users can glance at the bar to discover available shortcuts without pressing `?` to open the help overlay. The bar's content is static — it does not change based on the focused panel (except for the `/` action, which always targets the focused panel's filter). This predictability is intentional: the developer builds muscle memory for the quick-action keys because they always do the same thing on the dashboard.

If the developer is not authenticated or if their session has expired, the quick-action keys that require API calls (`c` for create repo) still push the target screen, which then handles the auth error independently. The quick-actions bar itself never makes API requests and never shows loading or error states.

## Acceptance Criteria

### Definition of Done

- [ ] The quick-actions bar renders as a single-row `<box>` at the bottom of the dashboard content area, above the global status bar.
- [ ] The bar is visible on the dashboard at all supported terminal sizes (80×24 through 200×60+).
- [ ] The bar displays labeled shortcuts: `c:new repo`, `i:new issue`, `n:notifications`, `s:search`, `/:filter`.
- [ ] Each key label is rendered in bold text; each action description is rendered in `muted` color (ANSI 245).
- [ ] Actions are separated by at least 2 spaces of padding.
- [ ] Pressing `c` pushes the create-repository screen onto the navigation stack.
- [ ] Pressing `i` pushes the create-issue screen onto the navigation stack. If no repository is in context, pressing `i` shows a transient inline message "Select a repository first" in `warning` color (ANSI 178) that auto-dismisses after 2 seconds.
- [ ] Pressing `n` pushes the notifications screen onto the navigation stack.
- [ ] Pressing `s` pushes the global search screen onto the navigation stack.
- [ ] Pressing `/` activates the inline filter input in the currently focused dashboard panel.
- [ ] Quick-action keys are suppressed (no-op) when the inline filter input or any other text input is focused.
- [ ] Quick-action keys are suppressed during go-to mode (`g` prefix active).
- [ ] Quick-action keys are suppressed when a modal overlay (command palette, help overlay, confirmation dialog) is open.
- [ ] Screen transitions triggered by quick actions complete within 50ms.
- [ ] Pressing `q` after a quick-action navigation pops back to the dashboard with the quick-actions bar intact.

### Keyboard Interactions

| Key | Action | Condition |
|-----|--------|-----------|
| `c` | Push create-repository screen | No text input focused, no modal open, no go-to mode |
| `i` | Push create-issue screen (or show "Select a repository first") | No text input focused, no modal open, no go-to mode |
| `n` | Push notifications screen | No text input focused, no modal open, no go-to mode |
| `s` | Push global search screen | No text input focused, no modal open, no go-to mode |
| `/` | Activate inline filter for focused panel | No text input focused, no modal open, no go-to mode |

### Responsive Behavior

| Terminal size | Bar layout | Label format |
|---------------|-----------|-------------|
| 80×24 – 119×39 (minimum) | Single row, compact | `c:repo  i:issue  n:notifs  s:search  /:filter` |
| 120×40 – 199×59 (standard) | Single row, full | `c:new repo  i:new issue  n:notifications  s:search  /:filter` |
| 200×60+ (large) | Single row, full with extra padding | `c:new repo   i:new issue   n:notifications   s:search   /:filter` |

At 80 columns, if the compact labels still overflow, the rightmost actions are hidden in this priority order (lowest priority hidden first): `/:filter` → `s:search` → `i:new issue` → `n:notifications` → `c:new repo`. At minimum, `c:new repo` is always visible.

At minimum terminal size (80×24 stacked layout), the bar also includes `Tab:next panel` as the final hint.

### Truncation and Boundary Constraints

- Action labels never wrap to a second line. If they don't fit, they are hidden (not truncated).
- Key characters are always exactly 1 character wide.
- Separator between actions: exactly 2 space characters at standard and minimum sizes, 3 space characters at large sizes.
- The bar height is always exactly 1 row.
- The bar width spans 100% of the content area width.
- The transient "Select a repository first" message for `i` replaces the bar content for 2 seconds, then the bar content is restored.

### Edge Cases

- **Rapid key presses**: If the user presses `c` followed by `n` within 50ms, only the first action (`c`) fires. The second keypress is consumed by the new screen's keyboard handler.
- **Key during screen transition**: Keys pressed during the <50ms transition are queued and delivered to the new screen, not to the quick-actions bar.
- **Terminal resize during transient message**: The "Select a repository first" message re-renders at the new width; the 2-second timer is not reset.
- **Filter active + quick-action key**: Typing `c` while the filter input is focused inserts `c` into the filter, not trigger the create-repo action.
- **No color support**: Key labels use bold attribute (no color needed); action descriptions use default terminal foreground instead of ANSI 245.
- **Unicode terminal width calculation**: All labels are ASCII-only; no wide-character concerns.
- **Quick action after auth expiry**: The bar still responds; the pushed screen handles the 401 error independently.

## Design

### Layout Structure

The quick-actions bar is the last child in the dashboard content area's vertical flexbox, with a fixed height of 1 row:

```jsx
<box flexDirection="column" width="100%" height="100%">
  {/* Panel grid — takes all remaining space */}
  <box flexDirection={isCompact ? "column" : "row"} flexGrow={1}>
    {/* Dashboard panels: Recent Repos, Orgs, Starred, Activity */}
  </box>

  {/* Quick actions bar — fixed 1 row */}
  <QuickActionsBar
    onAction={handleQuickAction}
    filterTarget={focusedPanelName}
    hasRepoContext={!!repoContext}
    isInputFocused={filterActive}
  />
</box>
```

### QuickActionsBar Component

```jsx
<box
  flexDirection="row"
  height={1}
  width="100%"
  gap={isLarge ? 3 : 2}
  borderTop="single"
  borderColor={240}
>
  {visibleActions.map(action => (
    <box key={action.key} flexDirection="row">
      <text attributes={BOLD}>{action.key}</text>
      <text fg={245}>:{action.label}</text>
    </box>
  ))}

  {/* Transient message overlay */}
  {transientMessage && (
    <box position="absolute" left={0} width="100%">
      <text fg={178}>{transientMessage}</text>
    </box>
  )}
</box>
```

### Action Registry

```typescript
interface QuickAction {
  key: string;           // Single character trigger
  label: string;         // Full label (standard/large)
  compactLabel: string;  // Abbreviated label (minimum)
  priority: number;      // 1 = highest (always shown), 5 = lowest (hidden first)
  action: () => void;    // Navigation callback
  condition?: () => boolean; // Optional visibility/enabled gate
}

const QUICK_ACTIONS: QuickAction[] = [
  { key: "c", label: "new repo",       compactLabel: "repo",    priority: 1, action: () => push("create-repo") },
  { key: "i", label: "new issue",      compactLabel: "issue",   priority: 3, action: () => handleNewIssue() },
  { key: "n", label: "notifications",  compactLabel: "notifs",  priority: 2, action: () => push("notifications") },
  { key: "s", label: "search",         compactLabel: "search",  priority: 4, action: () => push("search") },
  { key: "/", label: "filter",         compactLabel: "filter",  priority: 5, action: () => activateFilter() },
];
```

### Keybinding Registration

Quick-action keys are registered via `useKeyboard()` with a guard that checks: (1) No text input is currently focused, (2) No modal overlay is open, (3) Go-to mode is not active, (4) The current screen is the dashboard.

### Responsive Rendering Logic

The bar uses `useTerminalDimensions()` to determine breakpoint. At < 120 cols, compact labels are used. At >= 200 cols, 3-space separators are used. Actions are sorted by priority, and only actions that fit within the available width are rendered. At minimum size (stacked layout), a `Tab:next panel` hint is appended.

### Transient Message Behavior

When `i` is pressed without repo context, a warning message replaces the bar content for 2 seconds via an absolutely-positioned `<text>` element in warning color (ANSI 178), then auto-dismisses.

### Data Hooks Consumed

| Hook | Source | Purpose |
|------|--------|---------|
| `useKeyboard()` | `@opentui/react` | Register quick-action key handlers |
| `useTerminalDimensions()` | `@opentui/react` | Determine breakpoint for label truncation and action visibility |
| `useOnResize()` | `@opentui/react` | Trigger synchronous re-layout on terminal resize |
| `useNavigation()` | local TUI | `push()` function for screen navigation |
| `useRepoContext()` | `@codeplane/ui-core` | Check if a repository is in the navigation context (for `i` action) |
| `useDashboardFocus()` | local TUI | Determine if a text input is focused (to suppress quick-action keys) |

### Navigation Targets

| Key | Screen pushed | Context passed |
|-----|--------------|----------------|
| `c` | `create-repo` | None |
| `i` | `create-issue` | `{ repo: repoContext.full_name }` |
| `n` | `notifications` | None |
| `s` | `search` | None |
| `/` | (no push) | Activates filter in focused panel |

### Interaction with Status Bar

The quick-actions bar does not duplicate the status bar's keybinding hints. The status bar shows navigation-oriented hints (`j/k:navigate`, `Enter:open`, `Tab:panel`), while the quick-actions bar shows action-oriented shortcuts. No overlap.

### Interaction with Command Palette

All quick actions are also available as commands in the command palette (`:` overlay): "Create Repository" (Action), "Create Issue" (Action), "Open Notifications" (Navigate), "Open Search" (Navigate).

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View quick-actions bar | ❌ | ✅ | ✅ |
| `c` — Create repository | ❌ | ✅ | ✅ |
| `i` — Create issue | ❌ | ✅ (with repo write access) | ✅ |
| `n` — View notifications | ❌ | ✅ | ✅ |
| `s` — Open search | ❌ | ✅ | ✅ |
| `/` — Filter dashboard panel | ❌ | ✅ | ✅ |

- The dashboard (and therefore the quick-actions bar) is only accessible to authenticated users. Unauthenticated sessions are redirected to the auth error screen at bootstrap.
- The `c` action pushes to the create-repo screen; the server enforces repo creation permissions when the form is submitted.
- The `i` action pushes to the create-issue screen with repo context; the server enforces issue creation permissions (repo write access) when the form is submitted.
- No elevated role (admin, org owner) is required for any quick action.

### Token Handling

- The quick-actions bar itself makes zero API requests. It only calls `push()` to navigate.
- The token is managed by the global `<AuthProvider>` and `<APIClientProvider>`, not by the bar.
- If the token has expired, the pushed screen handles the 401 error independently (the bar does not pre-check auth status).

### Rate Limiting

- The quick-actions bar generates zero API traffic. Rate limiting is not a concern for the bar itself.
- Rapid sequential quick-action presses (e.g., `c` then immediately `q` to go back, then `c` again) may cause rapid screen push/pop cycles, but these do not make API requests until the target screen mounts and fetches data.
- The target screens (`create-repo`, `notifications`, `search`) each have their own rate-limiting error handling.

### Input Sanitization

- Quick-action keys are single characters matched against a fixed allowlist. No user input is passed to navigation targets via the bar.
- The `i` action passes `repoContext.full_name` as navigation context. This value is read from the API (server-validated), not from user input.
- The transient message "Select a repository first" is a static string, not user-generated.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.dashboard.quick_action.invoked` | User presses a quick-action key on the dashboard | `action` (`"create_repo"`, `"create_issue"`, `"notifications"`, `"search"`, `"filter"`), `terminal_width`, `terminal_height`, `breakpoint` (`"minimum"`, `"standard"`, `"large"`), `focused_panel` (`"recent_repos"`, `"orgs"`, `"starred_repos"`, `"activity"`) |
| `tui.dashboard.quick_action.issue_no_context` | User presses `i` without a repository in context | `terminal_width`, `terminal_height` |
| `tui.dashboard.quick_action.suppressed` | User presses a quick-action key while filter input is focused | `key`, `reason` (`"filter_focused"`, `"modal_open"`, `"goto_mode"`) |
| `tui.dashboard.quick_action.visible_count` | Dashboard renders with quick-actions bar | `visible_count`, `total_count` (5), `terminal_width`, `breakpoint`, `actions_hidden` (array of hidden action keys) |

### Common Event Properties

All quick-action events include: `session_id` (TUI session identifier), `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `color_mode` (`"truecolor"` | `"256"` | `"16"`), `layout` (`"grid"` | `"stacked"`).

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Quick action usage rate | > 25% of dashboard sessions | At least 25% of sessions that render the dashboard use at least one quick-action key |
| Create repo via quick action | > 40% of TUI repo creations | At least 40% of repos created via TUI use the `c` quick action (vs. command palette or go-to) |
| Notification access via quick action | > 30% of TUI notification views | At least 30% of notification screen visits originate from the `n` quick action |
| Search access via quick action | > 20% of TUI search sessions | At least 20% of search screen visits originate from the `s` quick action |
| Filter activation via quick action | > 50% of dashboard filter uses | At least 50% of dashboard filter activations use the `/` quick action |
| Issue no-context rate | < 10% of `i` presses | Less than 10% of `i` presses trigger the "Select a repository first" message |
| Quick action → back rate | < 15% | Less than 15% of quick action navigations result in an immediate `q` back (indicates accidental presses) |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Quick-actions bar rendered | `QuickActions: rendered [visible={n}] [hidden={keys}] [width={w}]` |
| `debug` | Quick-action key pressed | `QuickActions: invoked [key={k}] [action={name}] [panel={panel}]` |
| `debug` | Quick-action key suppressed | `QuickActions: suppressed [key={k}] [reason={reason}]` |
| `debug` | Transient message shown | `QuickActions: transient [message={msg}] [duration=2000ms]` |
| `debug` | Responsive recalculation | `QuickActions: resize [width={w}] [visible={n}] [hidden={keys}]` |
| `info` | Navigation triggered by quick action | `QuickActions: navigated [action={name}] [target_screen={screen}]` |
| `warn` | Issue creation attempted without repo context | `QuickActions: no repo context [key=i]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases Specific to TUI

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize shrinks bar below minimum (< 80 columns) | Bar hidden entirely; "Terminal too small" handled by global layout | Bar reappears when terminal is resized back to ≥ 80 columns |
| Terminal resize during transient message | Message re-renders at new width; timer continues | Message auto-dismisses after remaining time |
| Key pressed during screen transition | Key delivered to the new screen's handler, not to the quick-actions bar | No special handling needed; normal key routing |
| `push()` throws (screen not registered) | Error caught by navigation error boundary; dashboard remains visible | Bug — should not happen in production. Logged at `error` level |
| Go-to mode activated (`g` pressed) | Quick-action keys suppressed until go-to mode resolves or times out (1500ms) | Normal go-to mode behavior; bar returns to normal after |
| Command palette opened (`:` pressed) | Quick-action keys suppressed while modal is open | Bar returns to normal when modal closes |
| Help overlay opened (`?` pressed) | Quick-action keys suppressed while overlay is open | Bar returns to normal when overlay closes |
| SSE disconnect | No effect on quick-actions bar (bar makes no API calls or SSE connections) | N/A |
| Auth token expired | Bar still renders and responds to keys; pushed screens handle 401 | User re-authenticates via CLI; bar unaffected |
| React error in bar component | Caught by dashboard panel error boundary; bar disappears but panels remain | Dashboard-level error handling; quick actions still available via command palette |

### Failure Modes and Recovery

- **Bar render failure**: If the `QuickActionsBar` component throws during render, the dashboard's error boundary catches it. The four panels continue to operate normally. Quick actions remain available through the command palette (`:`) and go-to keybindings (`g n`, `g s`, etc.).
- **Key handler registration failure**: If `useKeyboard()` fails to register the quick-action handlers, no quick-action keys will fire. The user can still navigate via the command palette, go-to mode, or panel-level `Enter` actions.
- **Navigation stack overflow**: If the user rapidly triggers quick actions that push screens, the 32-screen stack limit in the router prevents unbounded growth. At the limit, the oldest non-root screen is evicted.

## Verification

### Test File: `e2e/tui/dashboard.test.ts`

### Terminal Snapshot Tests

- **SNAP-QA-001**: Quick-actions bar renders at 120x40 with all actions visible — Launch TUI at 120x40 on dashboard, assert bottom row of content area matches snapshot: `c:new repo  i:new issue  n:notifications  s:search  /:filter`, assert key characters rendered in bold, assert action labels rendered in muted color (ANSI 245)
- **SNAP-QA-002**: Quick-actions bar renders at 80x24 with compact labels — Launch TUI at 80x24, assert bar shows compact labels: `c:repo  i:issue  n:notifs  s:search  /:filter`, assert bar fits within 80 columns
- **SNAP-QA-003**: Quick-actions bar renders at 200x60 with full labels and extra padding — Launch TUI at 200x60, assert full labels with 3-space separators, assert bar spans full width
- **SNAP-QA-004**: Quick-actions bar with transient "Select a repository first" message — Launch TUI at 120x40 with no repo context, press i, assert bar content replaced with warning message in ANSI 178, wait 2 seconds, assert bar content restored
- **SNAP-QA-005**: Quick-actions bar with stacked layout includes Tab hint — Launch TUI at 80x24, assert bar includes `Tab:next panel` as final hint
- **SNAP-QA-006**: Quick-actions bar border renders above the bar — Launch TUI at 120x40, assert single-line top border in ANSI 240
- **SNAP-QA-007**: Quick-actions bar hidden when terminal below 80 columns — Resize to 60x24, assert "Terminal too small" replaces entire content
- **SNAP-QA-008**: Quick-actions bar at extreme minimum width hides lowest-priority actions — Launch TUI at 80x20, assert at least `c:repo` always visible, hidden actions are lowest priority

### Keyboard Interaction Tests

- **KEY-QA-001**: c pushes create-repository screen
- **KEY-QA-002**: i pushes create-issue screen when repo context exists
- **KEY-QA-003**: i shows transient message when no repo context
- **KEY-QA-004**: n pushes notifications screen
- **KEY-QA-005**: s pushes search screen
- **KEY-QA-006**: / activates inline filter in focused panel
- **KEY-QA-007**: Quick-action keys suppressed when filter input is focused — Press / then c, assert c typed into filter not triggering create-repo
- **KEY-QA-008**: Quick-action keys suppressed during go-to mode — Press g then n, assert go-to navigation (not quick action)
- **KEY-QA-009**: Quick-action keys suppressed when command palette is open — Press : then c, assert c typed into palette search
- **KEY-QA-010**: Quick-action keys suppressed when help overlay is open
- **KEY-QA-011**: q after quick-action navigation returns to dashboard with bar intact
- **KEY-QA-012**: Rapid quick-action presses — only first fires
- **KEY-QA-013**: / targets the correct focused panel — Tab to Orgs, press /, assert filter in Orgs panel
- **KEY-QA-014**: i transient message does not block other quick actions
- **KEY-QA-015**: Quick actions work after returning from pushed screen
- **KEY-QA-016**: Quick actions inactive on non-dashboard screens

### Responsive Tests

- **RESP-QA-001**: Bar adapts labels on resize from 120x40 to 80x24
- **RESP-QA-002**: Bar adapts labels on resize from 80x24 to 120x40
- **RESP-QA-003**: Bar adapts labels on resize from 120x40 to 200x60
- **RESP-QA-004**: Focus state preserved through resize with filter active
- **RESP-QA-005**: Bar visibility at 80x24 minimum — at least c:repo and n:notifs visible
- **RESP-QA-006**: Rapid resize does not cause visual artifacts in bar
- **RESP-QA-007**: Transient message renders correctly at minimum size

### Integration Tests

- **INT-QA-001**: Quick action c → create-repo screen → q returns to dashboard
- **INT-QA-002**: Quick action n → notifications → g d returns to dashboard with bar intact
- **INT-QA-003**: Quick action s → search → type query → q returns to dashboard (no state leak)
- **INT-QA-004**: i with repo context after visiting a repo
- **INT-QA-005**: All quick actions reachable via command palette when bar actions hidden
- **INT-QA-006**: Quick actions bar survives panel error state
- **INT-QA-007**: Quick actions bar functional during panel loading
- **INT-QA-008**: Auth error on pushed screen does not affect quick-actions bar
