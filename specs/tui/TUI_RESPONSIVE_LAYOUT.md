# TUI_RESPONSIVE_LAYOUT

Specification for TUI_RESPONSIVE_LAYOUT.

## High-Level User POV

The Codeplane TUI adapts its layout to fit whatever terminal window it runs in. Whether the user is working in a narrow 80-column tmux pane, a standard-size terminal window, or a full-screen ultra-wide session, the interface reorganizes itself to make the best use of available space — instantly, without animation, and without losing context or breaking keyboard flow.

At the smallest supported size (80 columns by 24 rows), the TUI presents a focused, stripped-down layout. The sidebar file tree disappears. List views show only essential columns — title and status — dropping metadata like timestamps, author names, and labels. Breadcrumbs in the header bar truncate from the left, showing only the most recent navigation segments prefixed with `…`. Diff views lock to unified mode since there is not enough horizontal room for a side-by-side split. Modal overlays expand to fill nearly the entire screen (90% width) rather than floating as a centered card. Every element that remains visible is fully usable — nothing is cropped mid-character or overlapping.

At the standard size (120 columns by 40 rows), the TUI unlocks its full design. The sidebar appears at 25% width in screens that use it — code explorer, diff file tree — with the main content occupying the remaining 75%. List views show all columns: title, status, author, labels, timestamps, and comment counts. The header bar displays the complete breadcrumb trail, repository context in the center, and connection status with notification badge on the right. The status bar shows full keybinding hints, sync status, and notification count. Modals float at 60% width, centered over the content.

At large sizes (200+ columns by 60+ rows), the TUI expands to take advantage of the extra room. Diffs show more context lines around changes. List metadata columns widen, showing full label names instead of abbreviated tags. The status bar displays extended keybinding hints with descriptive labels rather than just key symbols. The content area gains more vertical space for scrollable lists and detail views, reducing the need for scrolling.

When the user resizes their terminal window — dragging a corner, splitting a tmux pane, or changing font size — the layout recalculates and re-renders in the same frame. There is no flicker, no intermediate state, and no content loss. If the terminal shrinks below 80x24, the entire interface is replaced with a centered "Terminal too small" message showing the current dimensions and the minimum required. The moment the terminal grows back above the threshold, the full layout restores with the user's navigation stack, scroll positions, and focused elements intact.

The sidebar visibility is also under the user's direct control. Pressing `Ctrl+B` toggles the sidebar on or off regardless of terminal size. At minimum size the sidebar starts hidden, but if the user manually shows it via `Ctrl+B`, it overlays or compresses the content area. At standard and large sizes, the sidebar starts visible but can be hidden to give the full width to content — useful when reading a long diff or reviewing a detailed issue.

All responsive adaptations preserve the semantic color system, keyboard navigation model, and data display fidelity. No information is lost when the terminal shrinks — it is reorganized, truncated with `…` indicators, or moved behind a toggle. The user can always access everything; it is a question of how many keystrokes it takes.

## Acceptance Criteria

### Definition of Done

- [ ] Three named breakpoints are defined: `minimum` (80x24 - 119x39), `standard` (120x40 - 199x59), and `large` (200x60+).
- [ ] Below 80x24, a centered "Terminal too small" message replaces all content, showing `(current: WxH, min: 80x24)`. Header and status bar are hidden. Only `Ctrl+C` remains active.
- [ ] A `useBreakpoint()` hook returns the current breakpoint name (`"minimum"` | `"standard"` | `"large"`) derived from `useTerminalDimensions()`.
- [ ] A `useResponsiveValue()` hook accepts a map of `{ minimum, standard, large }` values and returns the value matching the current breakpoint.
- [ ] On terminal resize, layout recalculates synchronously — no flicker, no animation, no intermediate blank state.
- [ ] Resize from a valid size to below-minimum immediately shows the "too small" message.
- [ ] Resize from below-minimum to a valid size immediately restores the full layout with the previous navigation stack, scroll positions, and focused elements preserved.
- [ ] `Ctrl+B` toggles sidebar visibility on any screen that has a sidebar panel.
- [ ] At `minimum` breakpoint, sidebar starts hidden (collapsed to 0% width).
- [ ] At `standard` and `large` breakpoints, sidebar starts visible at 25% width.
- [ ] Sidebar toggle state is preserved across screen transitions within the same breakpoint.
- [ ] All OpenTUI layout calculations use percentage-based or flex-based sizing — no hardcoded pixel or column widths that break on resize.

### Content Adaptation by Breakpoint

- [ ] **Header bar (minimum):** Breadcrumb truncated from the left with `…` prefix. Repository context hidden. Notification badge shows number only (no icon text).
- [ ] **Header bar (standard):** Full breadcrumb trail up to ~80 characters. Repository context shown in center. Connection indicator and notification badge on right.
- [ ] **Header bar (large):** Full breadcrumb with no truncation. Extended header with full repo path displayed.
- [ ] **Status bar (minimum):** Only the leftmost keybinding hint and `? help` shown. Sync status hidden.
- [ ] **Status bar (standard):** Full keybinding hints, sync status, notification count, help hint.
- [ ] **Status bar (large):** Expanded keybinding hints with descriptive labels (e.g., `q quit` instead of just `q`).
- [ ] **List views (minimum):** Show only title and status columns. All metadata columns (author, labels, timestamps, comment count) hidden.
- [ ] **List views (standard):** All columns visible. Metadata columns at standard widths.
- [ ] **List views (large):** All columns visible with expanded widths. Full label names instead of abbreviations.
- [ ] **Diff view (minimum):** Unified mode only. Split view toggle (`t`) disabled with status bar hint: `split unavailable at this size`.
- [ ] **Diff view (standard):** Both unified and split modes available. File tree sidebar visible at 25%.
- [ ] **Diff view (large):** Both modes available with extra context lines (5 instead of 3). Wider line number gutters.
- [ ] **Modal overlays (minimum):** 90% width, 90% height.
- [ ] **Modal overlays (standard):** 60% width, 60% height.
- [ ] **Modal overlays (large):** 50% width, 50% height, with larger padding.

### Text Truncation

- [ ] Truncated text always ends with `…` (ellipsis character, U+2026), never mid-character.
- [ ] Breadcrumb segments exceeding 24 characters are truncated with `…` at any breakpoint.
- [ ] List item titles truncated to fit available column width minus status badge width.
- [ ] Repository names in headers truncated from the left at minimum breakpoint if they exceed available header space.
- [ ] Truncation is recalculated on resize — expanding the terminal reveals previously truncated text.

### Edge Cases

- [ ] Terminal at exactly 80x24: all minimum-breakpoint adaptations active, no "too small" message.
- [ ] Terminal at exactly 120x40: standard breakpoint active, not minimum.
- [ ] Terminal at exactly 200x60: large breakpoint active, not standard.
- [ ] Terminal at 79x24 (one column below minimum width): "too small" message shown.
- [ ] Terminal at 80x23 (one row below minimum height): "too small" message shown.
- [ ] Terminal at 79x23 (both dimensions below minimum): "too small" message shown.
- [ ] Rapid resize events: only the final dimensions trigger layout recalculation — intermediate states do not cause multiple re-renders.
- [ ] Resize during a screen transition: the new screen renders at the new size; no artifacts from the previous screen at the old size.
- [ ] Resize during modal display: modal re-centers and resizes to the appropriate percentage for the new breakpoint.
- [ ] Resize during text input: cursor position and input content preserved; input field width adjusts.
- [ ] Resize from standard to minimum while sidebar is open: sidebar collapses automatically.
- [ ] Resize from minimum to standard with sidebar manually hidden via `Ctrl+B`: sidebar remains hidden (user preference honored).
- [ ] Unicode wide characters (CJK) in truncated text: truncation accounts for double-width characters, never splitting a wide character.
- [ ] Semantic color tokens remain applied at all breakpoints — responsive adaptations never strip colors.
- [ ] SSE streaming content (workflow logs, agent responses) continues rendering during and after resize.
- [ ] Terminal reports zero dimensions (0x0): treated as below-minimum, "too small" message displayed, warning logged.
- [ ] Sidebar toggle (`Ctrl+B`) on a screen without sidebar (e.g., Dashboard): no-op, no visual change, no error.
- [ ] Sidebar toggle (`Ctrl+B`) while a modal overlay is open: no-op, modal retains focus, sidebar state unchanged.
- [ ] Breakpoint change from `standard` to `minimum` while sidebar is user-toggled visible: sidebar auto-hides (auto-override takes precedence at minimum default).
- [ ] Breakpoint change from `minimum` back to `standard` after sidebar was auto-hidden: sidebar restores to its pre-auto-hide state (visible if user never toggled it off).
- [ ] Breakpoint change from `minimum` back to `standard` after user manually hid sidebar via `Ctrl+B` before resize: sidebar stays hidden (user preference honored).
- [ ] Empty breadcrumb stack (root screen): header shows only the root screen label, no `…` prefix, no separator.
- [ ] Extremely long single breadcrumb segment (e.g., 200-character repo name): truncated to 24 characters with `…` at all breakpoints.
- [ ] CJK character at truncation boundary: if truncation would split a double-width character, truncation occurs one character earlier (no half-character rendering).
- [ ] Combining Unicode characters (e.g., accents on base characters): treated as a single visual unit during truncation — combining mark is never orphaned.

### Boundary Constraints

- [ ] Minimum supported terminal: 80 columns x 24 rows.
- [ ] Content area available rows: terminal height minus 2 (1 header row + 1 status bar row), minus border rows if applicable.
- [ ] Sidebar width: 25% of terminal width at standard/large, 0% at minimum (or when toggled off).
- [ ] Maximum sidebar width: capped at 60 columns regardless of terminal width (e.g., at 300 columns, sidebar is 60 cols not 75).
- [ ] Breadcrumb max segment length: 24 characters before truncation.
- [ ] Scrollbox content: no maximum row limit — scrollbox handles arbitrarily long content via virtualized rendering.
- [ ] Modal overlay minimum inner width: 40 columns (if the terminal is too narrow for this, the modal stretches to 100% minus 2 columns for borders).
- [ ] Maximum status bar hint count at minimum: 1 hint + `? help`.
- [ ] Diff context lines: 3 at minimum and standard, 5 at large.
- [ ] Line number gutter width: 4 characters at minimum, 5 at standard, 6 at large.
- [ ] List column widths at standard: Status (10), Author (16), Labels (20), Timestamp (12), Comments (4), Title (flex-grow fills remainder).
- [ ] List column widths at large: Status (14), Author (24), Labels (32), Timestamp (20), Comments (8), Title (flex-grow fills remainder).
- [ ] List column widths at minimum: Status (8), Title (flex-grow fills remainder). All other columns hidden.

## Design

### TUI UI

#### Layout Architecture

The responsive layout system is composed of three layers:

1. **Breakpoint detection** — `useBreakpoint()` hook reads `useTerminalDimensions()` and returns the current breakpoint name.
2. **Responsive value resolution** — `useResponsiveValue()` hook maps breakpoint names to concrete layout values.
3. **Layout rendering** — Components consume responsive values to set widths, visibility flags, and content truncation.

#### Breakpoint Detection

```
useBreakpoint() -> "minimum" | "standard" | "large" | null

Rules:
  width < 80 || height < 24   -> null (triggers "too small" screen)
  width < 120 || height < 40  -> "minimum"
  width < 200 || height < 60  -> "standard"
  otherwise                   -> "large"
```

The hook returns `null` when the terminal is below minimum size. The app shell checks for `null` and renders the "too small" message instead of the normal layout. Breakpoint classification uses OR logic for downgrade: if **either** dimension falls below a threshold, the lower breakpoint applies. Both dimensions must meet the higher threshold to qualify for that breakpoint tier.

#### Responsive Value Hook

```
useResponsiveValue({ minimum: T, standard: T, large: T }) -> T
```

Returns the value corresponding to the current breakpoint. Returns `undefined` when below minimum (breakpoint is `null`), unless a fallback value is provided. Accepts any type `T` — strings, numbers, booleans, objects, arrays.

#### Terminal Too Small Screen

When `useBreakpoint()` returns `null`:

```
+----------------------------------------------------------+
|                                                          |
|                                                          |
|              Terminal too small                           |
|       (current: 60x20, min: 80x24)                      |
|                                                          |
|                                                          |
+----------------------------------------------------------+
```

- "Terminal too small" text displayed in warning color (yellow), bold.
- Dimensions line displayed in muted color (gray).
- Both lines centered vertically and horizontally.
- No header bar, no status bar rendered.
- Only `Ctrl+C` and `q` are active for quitting.
- `Escape` also quits from this screen.
- The screen does not require authentication — it renders before and independently of the auth check.

#### Global App Shell Layout

```
+-----------------------------------------------------+
| Header: breadcrumb path | repo context | status      |  <- 1 row, fixed
+-----------+-----------------------------------------+
| Sidebar   |                                         |
| (25%)     |         Content Area                    |  <- flex-grow
| max 60col |         (flex-grow)                     |
|           |                                         |
+-----------+-----------------------------------------+
| Status: keybindings | sync | notif count | ? help   |  <- 1 row, fixed
+-----------------------------------------------------+
```

The content area occupies all vertical space between the header and status bars (height - 2 rows). The sidebar and main content split the horizontal space using flexbox `flexDirection="row"`. The sidebar has `flexShrink={0}` and a percentage-based `width`; the main content has `flexGrow={1}`.

The sidebar only renders when:
1. `sidebarVisible` is `true` (derived from breakpoint default + user preference), AND
2. The current screen's definition has `hasSidebar: true`.

Screens that declare `hasSidebar: true`:
- RepoOverview (code explorer tab)
- DiffView (file tree)
- Wiki (page tree)
- WikiDetail (page tree)

All other screens (Dashboard, Issues, Landings, Workspaces, Workflows, Search, Notifications, Agents, Settings, Organizations, Sync) have `hasSidebar: false`.

#### Sidebar Toggle

`Ctrl+B` toggles sidebar visibility. Sidebar state machine:

- At `minimum`: starts hidden. `Ctrl+B` shows sidebar (pushes content, not floating overlay).
- At `standard`/`large`: starts visible. `Ctrl+B` hides sidebar, giving full width to content.
- On breakpoint change from `standard` -> `minimum`: sidebar auto-hides.
- On breakpoint change from `minimum` -> `standard`: sidebar restores to its state before auto-hide. If user manually hid it, it stays hidden.

Sidebar state is modeled as two independent signals:
1. `userPreference`: `null` (never toggled) | `true` (user wants visible) | `false` (user wants hidden)
2. `autoOverride`: `boolean` (breakpoint-driven auto-collapse)

Resolution: `autoOverride` sets the default. `userPreference` overrides the default when set. At `minimum`, `autoOverride` defaults sidebar to hidden but user can force-show via `Ctrl+B`. At `standard`/`large`, `autoOverride` defaults sidebar to visible.

The `Ctrl+B` keybinding is guarded by two conditions:
- The current screen must have `hasSidebar: true` (otherwise no-op).
- No modal overlay may be active (otherwise no-op — modal retains focus).

#### Header Bar Responsive Behavior

**At minimum (80x24):**
- Breadcrumb truncated from the left with `…` prefix. Max breadcrumb width: `width - 20` (reserves space for status indicators).
- Individual breadcrumb segments exceeding 24 characters are truncated with `…` before joining.
- Repository context (owner/repo) hidden.
- Notification badge shows number only (e.g., `3`), no icon prefix.
- Connection status indicator: single `●` dot.

**At standard (120x40):**
- Full breadcrumb trail up to ~80 characters (or `width - 40`, whichever is smaller).
- Individual segments still capped at 24 characters.
- Repository context shown in center section.
- Connection indicator and notification badge on right (e.g., `● 🔔 3`).

**At large (200x60+):**
- Full breadcrumb with no max width limit.
- Individual segments still capped at 24 characters.
- Extended header with full repo path, connection status with label, full notification badge.

#### Status Bar Responsive Behavior

**At minimum (80x24):**
- Only 1 keybinding hint (the most contextually relevant) + `? help` on the right.
- Sync status hidden.
- Notification count hidden (already shown in header).

**At standard (120x40):**
- Full keybinding hints for the current screen context.
- Sync status indicator (connected/syncing/conflict/disconnected).
- Notification count.
- `? help` on the right.

**At large (200x60+):**
- Expanded keybinding hints with descriptive labels (e.g., `q quit` instead of `q:quit`, `j down` instead of `j`).
- Full sync status with label text.
- Notification count with label.
- `? help` with full text `? show help`.

#### List View Column Adaptation

**Minimum (80 cols):** Title (flex-grow) + Status (8 chars) only. Author, Labels, Timestamp, Comments hidden.

**Standard (120 cols):** Title (flex-grow) + Status (10) + Author (16) + Labels (20) + Timestamp (12) + Comments (4).

**Large (200+ cols):** Title (flex-grow) + Status (14) + Author (24) + Labels (32, full names) + Timestamp (20, full date) + Comments (8).

Column widths are defined as fixed character widths per breakpoint. The Title column always uses `flexGrow={1}` to fill remaining space. When columns are hidden at minimum breakpoint, their data is not fetched or rendered — only the column header and cells are suppressed.

#### Diff View Responsive Constraints

**Minimum (80 cols):**
- Unified mode only. Split view unavailable.
- `t` key (split toggle) shows a transient status bar message: "split unavailable at this size" for 2 seconds, then reverts to normal hints.
- Line number gutter: 4 characters.
- Context lines: 3.
- No file tree sidebar (sidebar hidden at minimum by default).

**Standard (120 cols):**
- Both unified and split modes available.
- Split panes ~47 columns each (accounting for gutter, border separator).
- Line number gutter: 5 characters.
- Context lines: 3.
- File tree sidebar at 25% width.

**Large (200+ cols):**
- Both unified and split modes available.
- Split panes ~72 columns each.
- Line number gutter: 6 characters.
- Context lines: 5 (increased from 3 to show more surrounding context).
- File tree sidebar at 25% width.

#### Modal Overlay Responsive Sizing

| Breakpoint | Width | Height | Padding |
|------------|-------|--------|---------|
| Minimum | 90% | 90% | 1 |
| Standard | 60% | 60% | 2 |
| Large | 50% | 50% | 3 |

Minimum inner width: 40 columns. If the calculated percentage width would result in fewer than 40 inner columns (accounting for border + padding), the modal stretches to `100% - 2` columns (leaving 1 column border on each side).

Modals are rendered as absolutely-positioned boxes with `zIndex={100}`, centered horizontally and vertically. They use the `surface` semantic color for background and `border` color for the border.

#### Text Truncation Rules

1. All truncated text ends with `…` (U+2026 ellipsis), never mid-character.
2. Breadcrumb segments exceeding 24 characters: truncated individually before joining with ` > ` separator.
3. Breadcrumb trail exceeding max width: segments removed from the left, replaced with `… > ` prefix.
4. List titles: truncated to fit available column width minus status badge width.
5. Repository names in header: truncated from the left at minimum if they exceed available space.
6. CJK/wide characters: display-width-aware truncation. A double-width character counts as 2 toward the limit. Truncation never splits a double-width character — if the next character would exceed the limit, truncation happens before it.
7. Combining characters: treated as part of their base character. Truncation never orphans a combining mark.
8. Truncation is recalculated on every resize — expanding the terminal reveals previously truncated text.

#### Resize Handling Flow

1. Terminal emits SIGWINCH signal.
2. OpenTUI renderer detects new dimensions via its native Zig core.
3. `useTerminalDimensions()` updates its `{ width, height }` state.
4. `useBreakpoint()` recalculates breakpoint via `getBreakpoint()`.
5. `useResponsiveValue()` hooks return new values for the new breakpoint.
6. Components re-render with new layout values.
7. Steps 2-6 happen synchronously in a single React render cycle.
8. No intermediate frame is painted. No debounce. No animation.

#### Keybindings

| Key | Action | Context |
|-----|--------|---------|
| `Ctrl+B` | Toggle sidebar visibility | Any screen with `hasSidebar: true`. No-op if modal is open. No-op on screens without sidebar. |

Existing keybindings from other features may be conditionally disabled based on breakpoint (e.g., `t` for split-view toggle at minimum breakpoint shows a transient message instead of toggling).

#### Data Hooks

- `useTerminalDimensions()` — from `@opentui/react`. Provides `{ width, height }`, updates on resize.
- `useOnResize()` — from `@opentui/react`. Registers callback `(width, height) => void` on terminal resize.
- `useKeyboard()` — from `@opentui/react`. For `Ctrl+B` sidebar toggle binding (handled through KeybindingProvider).

The responsive layout does not directly consume `@codeplane/ui-core` data hooks. Individual screens receive the current `breakpoint` as a prop or via layout context.

### Documentation

End-user documentation should cover:

1. **Keyboard reference** — Document `Ctrl+B` as the sidebar toggle in the TUI keyboard shortcuts reference. Note that it only applies on screens with a sidebar (code explorer, diff viewer, wiki).
2. **Terminal requirements** — Document the minimum terminal size (80x24) in the TUI getting started guide. Explain what happens when the terminal is too small and how to resolve it (resize or use a larger terminal).
3. **Responsive behavior guide** — A section in the TUI user guide explaining how the layout adapts to different terminal sizes. Include the three breakpoints (minimum, standard, large) with descriptions of what changes at each tier. This helps users understand why certain UI elements appear or disappear as they resize.
4. **tmux/multiplexer tips** — A brief section explaining that the TUI works well in tmux splits and panes, and that it adapts instantly to pane resizes. Recommend a minimum pane size of 80x24.

## Permissions & Security

### Authorization

- The responsive layout system requires **no specific authorization role**. It is a client-side presentation layer operating entirely within the TUI process.
- Breakpoint detection, sidebar toggle, and layout calculations do not involve any API calls or server communication.
- The layout system functions identically for all authenticated users regardless of their authorization level (Owner, Admin, Member, Read-Only, Guest).
- The "Terminal too small" screen requires no authentication — it renders before and independently of the auth check.
- Anonymous users (unauthenticated TUI sessions) still receive full responsive layout behavior. Auth errors ("Session expired", "Not authenticated") are rendered within the responsive layout shell with the same breakpoint-driven sizing.

### Rate Limiting

- Not applicable. The responsive layout system makes zero API calls.
- Rapid terminal resize events are handled locally within the TUI process. Even if the user resizes continuously, no network traffic is generated.
- Components that fetch data on resize (e.g., list views that recalculate pagination) are governed by their own data hooks' rate limiting, not the layout system.

### Data Privacy

- Terminal dimensions (`width`, `height`) are included in telemetry events. These are not PII but reveal information about the user's terminal environment. Telemetry is opt-in and controlled by the user's telemetry preferences.
- No layout-related data is persisted to disk or sent to the API server.
- Sidebar visibility state is held in memory only and not persisted across TUI sessions.
- The `Ctrl+B` sidebar toggle does not expose any data or modify any state beyond the local sidebar visibility flag.
- Terminal dimensions are read from the local terminal emulator via OpenTUI's native bindings. They are not user-supplied input and cannot be spoofed in a security-relevant way.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.responsive.breakpoint_init` | TUI startup, after first breakpoint calculation | `breakpoint` (`minimum` / `standard` / `large`), `width`, `height`, `color_tier` |
| `tui.responsive.breakpoint_change` | Terminal resize causes breakpoint transition | `from_breakpoint`, `to_breakpoint`, `from_width`, `from_height`, `to_width`, `to_height` |
| `tui.responsive.terminal_too_small` | Terminal drops below 80x24 | `width`, `height`, `previous_breakpoint` |
| `tui.responsive.terminal_restored` | Terminal grows back above 80x24 from too-small state | `width`, `height`, `new_breakpoint`, `too_small_duration_ms` |
| `tui.responsive.sidebar_toggle` | User presses `Ctrl+B` | `action` (`show` / `hide`), `breakpoint`, `screen` |
| `tui.responsive.resize` | Any terminal resize event (batched — at most 1 per render cycle) | `old_width`, `old_height`, `new_width`, `new_height`, `breakpoint`, `resize_count_in_session` |
| `tui.responsive.split_unavailable` | User presses `t` for split view at minimum breakpoint | `width`, `height` |

### Success Indicators

- **Breakpoint distribution**: Percentage of sessions in each breakpoint (`minimum` < 30%, `standard` 50-60%, `large` 10-20%) — indicates user terminal size norms.
- **Terminal-too-small rate**: Percentage of sessions encountering the "too small" state (target: < 5%).
- **Too-small recovery rate**: Of sessions that encounter "too small", percentage that resize and continue (target: > 80%).
- **Too-small median duration**: Median time spent in "too small" state (target: < 5 seconds, indicating quick resize recovery).
- **Sidebar toggle frequency**: Average sidebar toggles per session (> 0.5 indicates users actively customizing their layout — healthy engagement).
- **Resize frequency**: Average resize events per session — high counts indicate tmux/multiplexer usage patterns.
- **Split-unavailable rate**: How often users attempt split view at minimum size — high rate (> 10%) suggests minimum breakpoint is frustrating for diff review and may indicate a need to lower the split threshold.
- **Session duration by breakpoint**: Median session length segmented by initial breakpoint — reveals whether users at smaller sizes have shorter (frustrated) or comparable sessions.

## Observability

### Logging

| Log Level | Event | Message Pattern |
|-----------|-------|----------------|
| `info` | TUI startup breakpoint | `"Responsive layout initialized: {breakpoint} ({width}x{height})"` |
| `info` | Breakpoint change | `"Breakpoint changed: {from} -> {to} ({width}x{height})"` |
| `warn` | Terminal too small | `"Terminal below minimum size: {width}x{height} (min: 80x24)"` |
| `warn` | Terminal restored from too small | `"Terminal restored to valid size: {width}x{height} ({breakpoint})"` |
| `warn` | Invalid terminal dimensions | `"Terminal reported invalid dimensions: {width}x{height}"` |
| `debug` | Terminal resize | `"Terminal resized: {oldWidth}x{oldHeight} -> {newWidth}x{newHeight}"` |
| `debug` | Sidebar toggled | `"Sidebar {shown/hidden} via Ctrl+B (breakpoint: {breakpoint})"` |
| `debug` | Sidebar auto-collapsed | `"Sidebar auto-hidden: breakpoint changed to minimum"` |
| `debug` | Sidebar auto-restored | `"Sidebar auto-restored: breakpoint changed to {breakpoint}"` |
| `debug` | Split view rejected | `"Split diff view unavailable at {breakpoint} breakpoint ({width} cols)"` |
| `debug` | Modal resized | `"Modal resized: {oldWidth}% -> {newWidth}% (breakpoint: {breakpoint})"` |
| `error` | Breakpoint hook outside provider | `"useBreakpoint() called outside layout provider — returning 'standard' fallback"` |

Logs are written to stderr so they do not interfere with terminal rendering. Log level is controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`). When `CODEPLANE_TUI_DEBUG=true`, all debug-level logs are emitted as JSON to stderr.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `tui_breakpoint_init_total` | Counter | `breakpoint` | Count of TUI sessions by initial breakpoint |
| `tui_breakpoint_change_total` | Counter | `from`, `to` | Count of breakpoint transitions |
| `tui_terminal_too_small_total` | Counter | - | Count of times terminal dropped below minimum |
| `tui_terminal_too_small_duration_seconds` | Histogram | - | Duration of "too small" episodes (buckets: 1s, 2s, 5s, 10s, 30s, 60s) |
| `tui_sidebar_toggle_total` | Counter | `action`, `breakpoint` | Count of sidebar toggles by action and breakpoint |
| `tui_resize_total` | Counter | `breakpoint` | Count of resize events |
| `tui_split_unavailable_total` | Counter | - | Count of split-view attempts at minimum breakpoint |

### Alerts

#### Alert: High Terminal-Too-Small Rate

- **Condition**: `tui_terminal_too_small_total / tui_breakpoint_init_total > 0.15` over 1 hour.
- **Severity**: Warning.
- **Runbook**: This indicates > 15% of TUI sessions are encountering terminals below 80x24. Investigation steps: (1) Check if a specific client version or distribution method is shipping with an incorrect minimum size recommendation. (2) Check if a popular terminal emulator or SSH client defaults to a size below 80x24. (3) Review telemetry `width` and `height` properties on `terminal_too_small` events to identify the most common undersized dimensions. (4) If the majority are 79x24 or 80x23 (just barely below), consider whether the minimum threshold should be relaxed. (5) If dimensions are very small (e.g., 40x12), this may indicate agent/automation environments — verify that the TUI exits cleanly in these cases.

#### Alert: Terminal-Too-Small Recovery Rate Drop

- **Condition**: `tui_terminal_restored_total / tui_terminal_too_small_total < 0.6` over 1 hour.
- **Severity**: Warning.
- **Runbook**: Less than 60% of "too small" episodes are recovering (user resizes and continues). Investigation steps: (1) Check if the "too small" screen is displaying correctly — read recent error logs for rendering failures at small sizes. (2) Verify that `Ctrl+C` and `q` exit cleanly from the too-small screen. (3) Check `too_small_duration_ms` — if durations are very short (< 1s), users may be quitting immediately, suggesting the message is unclear. (4) If durations are very long (> 60s), users may not realize they need to resize. (5) Review the message text for clarity.

#### Alert: Excessive Resize Events

- **Condition**: `rate(tui_resize_total[5m]) > 100` (more than 100 resize events per 5 minutes across all sessions).
- **Severity**: Info.
- **Runbook**: High resize frequency usually indicates automated testing or unusual terminal multiplexer behavior. Investigation steps: (1) Check if a CI/testing environment is generating synthetic resize events. (2) Verify that React batching is coalescing rapid resizes into single re-renders. (3) Check memory usage — excessive re-renders could cause memory growth in long-running sessions. (4) No user action needed if this is test traffic.

### Error Cases and Failure Modes

| Error Scenario | Detection | Recovery |
|----------------|-----------|----------|
| Terminal resize during screen transition | `useOnResize` fires during React commit phase | Layout recalculates synchronously. New screen renders at new dimensions. No artifacts from old screen. |
| Terminal resize during modal display | `useOnResize` fires while modal is open | Modal re-centers and resizes to appropriate percentage for new breakpoint. Focus remains trapped in modal. |
| Terminal resize during text input | `useOnResize` fires while input is focused | Input content and cursor position preserved. Input field width adjusts to new available space. |
| Terminal resize during SSE streaming | `useOnResize` fires while logs/messages are streaming | Streaming continues uninterrupted. New content renders at new width. Existing content re-wraps. |
| Terminal resize during data fetch | `useOnResize` fires while loading spinner is shown | Loading state renders at new dimensions. Data arrives and renders at new size. |
| Rapid resize events (window drag) | Multiple resize events within one frame | React 19 batches state updates — only the final dimensions trigger a committed render. |
| Terminal reports invalid dimensions (0x0) | `useTerminalDimensions()` returns 0 for either dimension | Treated as below-minimum. "Too small" message shown. Warning logged. |
| Sidebar toggle on screen without sidebar | `Ctrl+B` pressed on Dashboard or other non-sidebar screen | No-op. No visual change, no error message. |
| Sidebar toggle while modal is open | `Ctrl+B` pressed while command palette or help overlay is active | No-op. Modal retains focus. Sidebar state unchanged. |
| Breakpoint hook called outside provider | Component uses `useBreakpoint()` without ancestor provider | Returns `"standard"` as safe default. Logs error-level message. |

**Predictable failure modes:**

- **Layout thrashing**: Continuous rapid resizes causing excessive re-renders. Mitigation: React 19's automatic batching coalesces synchronous state updates. OpenTUI's native renderer handles SIGWINCH deduplication.
- **Content overflow at boundary**: Terminal is exactly 80 columns and content renders one character too wide. Mitigation: all width calculations use `Math.floor()` and account for border characters. OpenTUI's `<box>` clips overflow by default.
- **Stale breakpoint**: `useBreakpoint()` returns old value during first render after resize. Mitigation: `useTerminalDimensions()` updates synchronously before React's commit phase.
- **Sidebar state desync**: User toggles sidebar, resize changes breakpoint, resize back — sidebar should reflect user's last explicit toggle. Mitigation: sidebar state stored as `{ userPreference: boolean | null, autoOverride: boolean }` where user preference is tracked separately from auto-collapse.

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

All responsive layout tests belong in the `e2e/tui/app-shell.test.ts` test file, grouped under `TUI_RESPONSIVE_LAYOUT` describe blocks.

### Terminal Snapshot Tests

- **RESPONSIVE_SNAPSHOT_01**: `renders minimum layout at 80x24` — Launch TUI at 80x24, capture full-screen snapshot. Assert: header bar shows truncated breadcrumb with `…`, no repo context, notification count only. Status bar shows single hint and `? help`. Content area is 22 rows. No sidebar visible.
- **RESPONSIVE_SNAPSHOT_02**: `renders standard layout at 120x40` — Launch TUI at 120x40, capture full-screen snapshot. Assert: header bar shows full breadcrumb, repo context in center, connection indicator and notification badge. Status bar shows full hints, sync status, notification count, help hint. Content area is 38 rows.
- **RESPONSIVE_SNAPSHOT_03**: `renders large layout at 200x60` — Launch TUI at 200x60, capture full-screen snapshot. Assert: header bar shows fully expanded breadcrumb with no truncation. Status bar shows extended hints with descriptive labels. Content area is 58 rows.
- **RESPONSIVE_SNAPSHOT_04**: `renders "terminal too small" at 60x20` — Launch TUI at 60x20, capture snapshot. Assert: centered text "Terminal too small" in warning color, "(current: 60x20, min: 80x24)" in muted color. No header bar, no status bar.
- **RESPONSIVE_SNAPSHOT_05**: `renders "terminal too small" at 79x24` — Launch TUI at 79x24, assert too-small message showing `79x24`.
- **RESPONSIVE_SNAPSHOT_06**: `renders "terminal too small" at 80x23` — Launch TUI at 80x23, assert too-small message showing `80x23`.
- **RESPONSIVE_SNAPSHOT_07**: `renders sidebar visible at 120x40 on code explorer` — Navigate to repo code explorer at 120x40. Assert: sidebar visible at ~25% width with file tree, main content at ~75%, border separator between them.
- **RESPONSIVE_SNAPSHOT_08**: `renders sidebar hidden at 80x24 on code explorer` — Navigate to repo code explorer at 80x24. Assert: no sidebar visible, content uses full width.
- **RESPONSIVE_SNAPSHOT_09**: `renders list view with all columns at 120x40` — Navigate to issue list at 120x40. Assert: title, status, author, labels, timestamp, and comments columns all visible.
- **RESPONSIVE_SNAPSHOT_10**: `renders list view with title and status only at 80x24` — Navigate to issue list at 80x24. Assert: only title and status columns visible.
- **RESPONSIVE_SNAPSHOT_11**: `renders list view with expanded columns at 200x60` — Navigate to issue list at 200x60. Assert: all columns visible with full label names and full timestamps.
- **RESPONSIVE_SNAPSHOT_12**: `renders modal at 90% width at 80x24` — Open command palette at 80x24. Assert: modal width is ~72 columns (90% of 80).
- **RESPONSIVE_SNAPSHOT_13**: `renders modal at 60% width at 120x40` — Open command palette at 120x40. Assert: modal width is ~72 columns (60% of 120).
- **RESPONSIVE_SNAPSHOT_14**: `renders modal at 50% width at 200x60` — Open command palette at 200x60. Assert: modal width is ~100 columns (50% of 200).
- **RESPONSIVE_SNAPSHOT_15**: `renders unified diff only at 80x24` — Navigate to diff view at 80x24. Assert: unified diff rendered, no split-pane layout.
- **RESPONSIVE_SNAPSHOT_16**: `renders split diff at 120x40` — Navigate to diff view at 120x40, press `t` to toggle split. Assert: two side-by-side panes.
- **RESPONSIVE_SNAPSHOT_17**: `renders diff with extra context lines at 200x60` — Navigate to diff view at 200x60. Assert: 5 context lines above and below hunks.
- **RESPONSIVE_SNAPSHOT_18**: `renders "terminal too small" at 79x23 (both dimensions below)` — Launch TUI at 79x23, assert too-small message showing `79x23`.
- **RESPONSIVE_SNAPSHOT_19**: `renders exactly at breakpoint boundaries` — Launch at exactly 80x24 (minimum), 120x40 (standard), 200x60 (large). Assert each renders the correct breakpoint layout without "too small" message.
- **RESPONSIVE_SNAPSHOT_20**: `renders modal minimum inner width guard` — At 80x24, open modal. Assert: if calculated inner width < 40 columns, modal stretches to 100% - 2. Verify inner content area is at least 40 columns wide.

### Keyboard Interaction Tests

- **RESPONSIVE_KEY_01**: `Ctrl+B toggles sidebar visibility at 120x40` — At 120x40 on code explorer, assert sidebar visible. Press `Ctrl+B`, assert sidebar hidden. Press `Ctrl+B` again, assert sidebar restored.
- **RESPONSIVE_KEY_02**: `Ctrl+B shows sidebar at 80x24` — At 80x24 on code explorer, assert sidebar hidden. Press `Ctrl+B`, assert sidebar appears (pushes content).
- **RESPONSIVE_KEY_03**: `Ctrl+B is no-op on dashboard` — At 120x40 on Dashboard, press `Ctrl+B`. Assert: no visual change (screenshot unchanged).
- **RESPONSIVE_KEY_04**: `Ctrl+B is no-op during modal` — At 120x40, open command palette (press `:`), press `Ctrl+B`. Assert: modal remains open, sidebar unchanged after closing modal.
- **RESPONSIVE_KEY_05**: `t key shows error at 80x24 in diff view` — At 80x24 on diff view, press `t`. Assert: status bar shows "split unavailable at this size" text. After 2 seconds, status bar reverts to normal hints.
- **RESPONSIVE_KEY_06**: `t key toggles split at 120x40 in diff view` — At 120x40 on diff view, press `t`. Assert: diff switches to split mode with two side-by-side panes.
- **RESPONSIVE_KEY_07**: `j/k navigation works at all breakpoints` — At 80x24, 120x40, and 200x60 on issue list, press `j` and `k`. Assert: focus moves correctly at each size. Focused item is highlighted.
- **RESPONSIVE_KEY_08**: `Ctrl+C works from too-small screen` — At 60x20, press `Ctrl+C`. Assert: TUI exits cleanly with exit code 0.
- **RESPONSIVE_KEY_09**: `sidebar toggle preserved across screen transitions` — At 120x40, press `Ctrl+B` to hide sidebar on code explorer. Navigate to diff view (another sidebar screen). Assert: sidebar hidden. Press `Ctrl+B`, sidebar appears. Navigate back to code explorer. Assert: sidebar visible.
- **RESPONSIVE_KEY_10**: `q exits from too-small screen` — At 60x20, press `q`. Assert: TUI exits cleanly.
- **RESPONSIVE_KEY_11**: `Ctrl+B multiple rapid toggles` — At 120x40, press `Ctrl+B` 5 times rapidly. Assert: sidebar ends in expected state (hidden if odd number of toggles, visible if even). No rendering artifacts.

### Resize Tests

- **RESPONSIVE_RESIZE_01**: `resize from 120x40 to 80x24 collapses sidebar` — Start at 120x40 with sidebar visible on code explorer. Resize to 80x24. Assert: sidebar hidden, content fills width.
- **RESPONSIVE_RESIZE_02**: `resize from 80x24 to 120x40 restores layout` — Start at 80x24. Resize to 120x40. Assert: full header, all list columns, sidebar visible on sidebar screens.
- **RESPONSIVE_RESIZE_03**: `resize from 120x40 to 60x20 shows too-small` — Start at 120x40. Resize to 60x20. Assert: "Terminal too small" message with dimensions `60x20`.
- **RESPONSIVE_RESIZE_04**: `resize from 60x20 to 120x40 restores full layout` — Start at 60x20 (too small). Resize to 120x40. Assert: full layout restored, navigation stack intact, no "too small" message.
- **RESPONSIVE_RESIZE_05**: `resize from 120x40 to 200x60 expands layout` — Start at 120x40. Resize to 200x60. Assert: columns expand, full labels visible, extended hints in status bar.
- **RESPONSIVE_RESIZE_06**: `resize from 200x60 to 120x40 contracts layout` — Start at 200x60. Resize to 120x40. Assert: columns contract to standard widths, hints contract to standard format.
- **RESPONSIVE_RESIZE_07**: `resize preserves scroll position` — At 120x40 on issue list, scroll down 20 items. Resize to 80x24. Assert: same focused item visible (may be at different position in viewport).
- **RESPONSIVE_RESIZE_08**: `resize preserves focused element` — At 120x40 on issue list, navigate to item 5 with `j`. Resize to 80x24. Assert: item 5 still focused.
- **RESPONSIVE_RESIZE_09**: `resize during modal adjusts modal size` — At 120x40, open command palette. Resize to 80x24. Assert: modal adjusts to 90% width. Content within modal still accessible.
- **RESPONSIVE_RESIZE_10**: `resize during text input preserves content` — At 120x40, focus search input (press `/`), type "hello". Resize to 80x24. Assert: input still contains "hello", cursor position preserved.
- **RESPONSIVE_RESIZE_11**: `resize during diff view forces unified at minimum` — At 120x40 in split diff mode. Resize to 80x24. Assert: diff switches to unified mode automatically.
- **RESPONSIVE_RESIZE_12**: `resize within same breakpoint does not flash` — At 120x40, resize to 130x45 (still standard). Assert: no layout jumps, same breakpoint behavior.
- **RESPONSIVE_RESIZE_13**: `sidebar auto-hides on resize to minimum, restores on resize back` — At 120x40 with sidebar visible. Resize to 80x24 (auto-hides). Resize back to 120x40. Assert: sidebar visible again (auto-override restored).
- **RESPONSIVE_RESIZE_14**: `sidebar stays hidden after user toggle on resize back` — At 120x40, hide sidebar via `Ctrl+B`. Resize to 80x24. Resize back to 120x40. Assert: sidebar stays hidden (user preference honored).
- **RESPONSIVE_RESIZE_15**: `resize from 80x24 to 200x60 skips standard` — Start at 80x24. Resize directly to 200x60. Assert: large breakpoint active, all large-breakpoint adaptations applied.
- **RESPONSIVE_RESIZE_16**: `resize to exactly 1 below each threshold` — Resize to 119x39 (just below standard). Assert: minimum breakpoint. Resize to 199x59 (just below large). Assert: standard breakpoint.

### Integration Tests

- **RESPONSIVE_INTEGRATION_01**: `navigation stack preserved through too-small and back` — Navigate 3 screens deep at 120x40. Resize to 60x20 (too small). Resize back to 120x40. Assert: all 3 screens in navigation stack, breadcrumb trail intact.
- **RESPONSIVE_INTEGRATION_02**: `SSE streaming continues through resize` — At 120x40 on workflow log view with active log stream. Resize to 80x24. Assert: logs continue streaming at new width without interruption.
- **RESPONSIVE_INTEGRATION_03**: `colors preserved across all breakpoints` — Capture color attributes of semantic elements (status badges, focused items, muted text) at 80x24, 120x40, and 200x60. Assert: correct semantic color tokens applied at all sizes.
- **RESPONSIVE_INTEGRATION_04**: `go-to navigation works at minimum breakpoint` — At 80x24, press `g` then `r`. Assert: navigates to repository list with minimum-breakpoint layout.
- **RESPONSIVE_INTEGRATION_05**: `command palette respects modal sizing per breakpoint` — At 80x24, press `:`, verify ~90% width. Close. Resize to 120x40, press `:`, verify ~60% width. Close. Resize to 200x60, press `:`, verify ~50% width.
- **RESPONSIVE_INTEGRATION_06**: `error boundary renders correctly at minimum breakpoint` — At 80x24, trigger an error (via test harness). Assert: error screen renders within 80x24 constraints with proper padding.
- **RESPONSIVE_INTEGRATION_07**: `loading states render correctly at all breakpoints` — Navigate to a screen with loading state at 80x24, 120x40, and 200x60. Assert: loading spinner centered at each size.
- **RESPONSIVE_INTEGRATION_08**: `deep-link launch respects initial terminal size` — Launch `codeplane tui --screen issues --repo owner/repo` at 80x24 and at 200x60. Assert: appropriate breakpoint adaptations applied from first render.
- **RESPONSIVE_INTEGRATION_09**: `help overlay shows current screen keybindings at each breakpoint` — At 80x24, press `?`. Assert help overlay at 90% width shows keybindings. At 120x40, press `?`. Assert help overlay at 60% width. Keybinding content identical.
- **RESPONSIVE_INTEGRATION_10**: `CJK text truncation in breadcrumb` — Navigate to a screen with a CJK breadcrumb label exceeding 24 display-width characters. Assert: breadcrumb truncated without splitting a double-width character, ends with `…`.
- **RESPONSIVE_INTEGRATION_11**: `rapid resize stress test` — Start at 120x40. Resize 20 times in rapid succession between 80x24, 120x40, and 200x60. Assert: final layout matches the last resize dimensions. No rendering artifacts, no crashes.

### Breakpoint Pure Function Tests

- **BREAKPOINT_PURE_01**: `getBreakpoint(80, 24) returns "minimum"` — Exact minimum boundary.
- **BREAKPOINT_PURE_02**: `getBreakpoint(79, 24) returns null` — One column below.
- **BREAKPOINT_PURE_03**: `getBreakpoint(80, 23) returns null` — One row below.
- **BREAKPOINT_PURE_04**: `getBreakpoint(79, 23) returns null` — Both below.
- **BREAKPOINT_PURE_05**: `getBreakpoint(119, 39) returns "minimum"` — Top of minimum range.
- **BREAKPOINT_PURE_06**: `getBreakpoint(120, 40) returns "standard"` — Exact standard boundary.
- **BREAKPOINT_PURE_07**: `getBreakpoint(199, 59) returns "standard"` — Top of standard range.
- **BREAKPOINT_PURE_08**: `getBreakpoint(200, 60) returns "large"` — Exact large boundary.
- **BREAKPOINT_PURE_09**: `getBreakpoint(300, 100) returns "large"` — Well above large.
- **BREAKPOINT_PURE_10**: `getBreakpoint(0, 0) returns null` — Zero dimensions.
- **BREAKPOINT_PURE_11**: `getBreakpoint(200, 24) returns "minimum"` — Wide but short (OR logic: height < 40).
- **BREAKPOINT_PURE_12**: `getBreakpoint(80, 60) returns "minimum"` — Tall but narrow (OR logic: width < 120).
- **BREAKPOINT_PURE_13**: `getBreakpoint(120, 39) returns "minimum"` — Width meets standard but height does not.
- **BREAKPOINT_PURE_14**: `getBreakpoint(119, 40) returns "minimum"` — Height meets standard but width does not.

### Sidebar State Pure Function Tests

- **SIDEBAR_PURE_01**: `resolveSidebarVisibility(null, null) returns { visible: false, autoOverride: true }` — Below minimum, no user preference.
- **SIDEBAR_PURE_02**: `resolveSidebarVisibility("minimum", null) returns { visible: false, autoOverride: true }` — Minimum default: hidden.
- **SIDEBAR_PURE_03**: `resolveSidebarVisibility("minimum", true) returns { visible: true, autoOverride: false }` — Minimum with user force-show.
- **SIDEBAR_PURE_04**: `resolveSidebarVisibility("standard", null) returns { visible: true, autoOverride: false }` — Standard default: visible.
- **SIDEBAR_PURE_05**: `resolveSidebarVisibility("standard", false) returns { visible: false, autoOverride: false }` — Standard with user hide.
- **SIDEBAR_PURE_06**: `resolveSidebarVisibility("large", null) returns { visible: true, autoOverride: false }` — Large default: visible.
- **SIDEBAR_PURE_07**: `resolveSidebarVisibility("large", false) returns { visible: false, autoOverride: false }` — Large with user hide.
- **SIDEBAR_PURE_08**: `resolveSidebarVisibility("large", true) returns { visible: true, autoOverride: false }` — Large with explicit user show (same as default).

### Layout Context Value Tests

- **LAYOUT_CTX_01**: `diffContextLines is 3 at minimum breakpoint`
- **LAYOUT_CTX_02**: `diffContextLines is 3 at standard breakpoint`
- **LAYOUT_CTX_03**: `diffContextLines is 5 at large breakpoint`
- **LAYOUT_CTX_04**: `lineNumberGutterWidth is 4 at minimum`
- **LAYOUT_CTX_05**: `lineNumberGutterWidth is 5 at standard`
- **LAYOUT_CTX_06**: `lineNumberGutterWidth is 6 at large`
- **LAYOUT_CTX_07**: `splitDiffAvailable is false at minimum`
- **LAYOUT_CTX_08**: `splitDiffAvailable is true at standard`
- **LAYOUT_CTX_09**: `splitDiffAvailable is true at large`
- **LAYOUT_CTX_10**: `maxBreadcrumbSegmentLength is always 24`
- **LAYOUT_CTX_11**: `modalWidth is "90%" at minimum`
- **LAYOUT_CTX_12**: `modalWidth is "60%" at standard`
- **LAYOUT_CTX_13**: `modalWidth is "50%" at large`
- **LAYOUT_CTX_14**: `sidebarWidth is "0%" at minimum (default)`
- **LAYOUT_CTX_15**: `sidebarWidth is "25%" at standard`
- **LAYOUT_CTX_16**: `sidebarWidth is "25%" at large` (or "30%" per implementation — verify matches spec)
- **LAYOUT_CTX_17**: `contentHeight equals height - 2 at all breakpoints`

### Text Truncation Tests

- **TRUNCATE_01**: `truncateText("short", 24) returns "short"` — No truncation needed.
- **TRUNCATE_02**: `truncateText("a".repeat(25), 24) returns "a".repeat(23) + "…"` — Truncated at boundary.
- **TRUNCATE_03**: `truncateText("a".repeat(24), 24) returns "a".repeat(24)` — Exactly at limit, no truncation.
- **TRUNCATE_04**: `truncateBreadcrumb(["Dashboard", "owner/repo", "Issues", "#42"], 40)` — Returns truncated trail with `…` prefix if exceeds.
- **TRUNCATE_05**: `truncateBreadcrumb(["Dashboard"], 40) returns "Dashboard"` — Single segment, no prefix.
- **TRUNCATE_06**: `CJK truncation: truncateByDisplayWidth("hello世界test", 10)` — Returns "hello世界" (10 display width: 5 + 2 + 2 + 1 would exceed, so 5 + 2 + 2 = 9, plus "…" = 10).
- **TRUNCATE_07**: `CJK at boundary: truncateByDisplayWidth("ab世", 4)` — Returns "ab世" (4 display width). `truncateByDisplayWidth("ab世", 3)` returns "ab…" (3 display width, can't fit double-width char + ellipsis).
- **TRUNCATE_08**: `empty string truncation: truncateText("", 24) returns ""` — Empty input.
- **TRUNCATE_09**: `truncation limit of 1: truncateText("hello", 1) returns "…"` — Minimum truncation.
- **TRUNCATE_10**: `truncation limit of 0: truncateText("hello", 0) returns ""` — Zero limit.
- **TRUNCATE_11**: `combining character: truncateByDisplayWidth("e\u0301llo", 3)` — "e" + combining accent treated as 1 display width, not split.
