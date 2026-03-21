# TUI_RESPONSIVE_LAYOUT

Specification for TUI_RESPONSIVE_LAYOUT.

## High-Level User POV

The Codeplane TUI adapts its layout to fit whatever terminal window it runs in. Whether the user is working in a narrow 80-column tmux pane, a standard-size terminal window, or a full-screen ultra-wide session, the interface reorganizes itself to make the best use of available space — instantly, without animation, and without losing context or breaking keyboard flow.

At the smallest supported size (80 columns by 24 rows), the TUI presents a focused, stripped-down layout. The sidebar file tree disappears. List views show only essential columns — title and status — dropping metadata like timestamps, author names, and labels. Breadcrumbs in the header bar truncate from the left, showing only the most recent navigation segments prefixed with `…`. Diff views lock to unified mode since there is not enough horizontal room for a side-by-side split. Modal overlays expand to fill nearly the entire screen (90% width) rather than floating as a centered card. Every element that remains visible is fully usable — nothing is cropped mid-character or overlapping.

At the standard size (120 columns by 40 rows), the TUI unlocks its full design. The sidebar appears at 25% width in screens that use it — code explorer, diff file tree — with the main content occupying the remaining 75%. List views show all columns: title, status, author, labels, timestamps, and comment counts. The header bar displays the complete breadcrumb trail, repository context in the center, and connection status with notification badge on the right. The status bar shows full keybinding hints, sync status, and notification count. Modals float at 60% width, centered over the content.

At large sizes (200+ columns by 60+ rows), the TUI expands to take advantage of the extra room. Diffs show more context lines around changes. List metadata columns widen, showing full label names instead of abbreviated tags. The status bar displays extended keybinding hints with descriptive labels rather than just key symbols. The content area gains more vertical space for scrollable lists and detail views, reducing the need for scrolling.

When the user resizes their terminal window — dragging a corner, splitting a tmux pane, or changing font size — the layout recalculates and re-renders in the same frame. There is no flicker, no intermediate state, and no content loss. If the terminal shrinks below 80×24, the entire interface is replaced with a centered "Terminal too small" message showing the current dimensions and the minimum required. The moment the terminal grows back above the threshold, the full layout restores with the user's navigation stack, scroll positions, and focused elements intact.

The sidebar visibility is also under the user's direct control. Pressing `Ctrl+B` toggles the sidebar on or off regardless of terminal size. At minimum size the sidebar starts hidden, but if the user manually shows it via `Ctrl+B`, it overlays or compresses the content area. At standard and large sizes, the sidebar starts visible but can be hidden to give the full width to content — useful when reading a long diff or reviewing a detailed issue.

All responsive adaptations preserve the semantic color system, keyboard navigation model, and data display fidelity. No information is lost when the terminal shrinks — it is reorganized, truncated with `…` indicators, or moved behind a toggle. The user can always access everything; it is a question of how many keystrokes it takes.

## Acceptance Criteria

### Definition of Done

- [ ] Three named breakpoints are defined: `minimum` (80×24 – 119×39), `standard` (120×40 – 199×59), and `large` (200×60+).
- [ ] Below 80×24, a centered "Terminal too small" message replaces all content, showing `(current: WxH, min: 80x24)`. Header and status bar are hidden. Only `Ctrl+C` remains active.
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

- [ ] Terminal at exactly 80×24: all minimum-breakpoint adaptations active, no "too small" message.
- [ ] Terminal at exactly 120×40: standard breakpoint active, not minimum.
- [ ] Terminal at exactly 200×60: large breakpoint active, not standard.
- [ ] Terminal at 79×24 (one column below minimum width): "too small" message shown.
- [ ] Terminal at 80×23 (one row below minimum height): "too small" message shown.
- [ ] Terminal at 79×23 (both dimensions below minimum): "too small" message shown.
- [ ] Rapid resize events: only the final dimensions trigger layout recalculation — intermediate states do not cause multiple re-renders.
- [ ] Resize during a screen transition: the new screen renders at the new size; no artifacts from the previous screen at the old size.
- [ ] Resize during modal display: modal re-centers and resizes to the appropriate percentage for the new breakpoint.
- [ ] Resize during text input: cursor position and input content preserved; input field width adjusts.
- [ ] Resize from standard to minimum while sidebar is open: sidebar collapses automatically.
- [ ] Resize from minimum to standard with sidebar manually hidden via `Ctrl+B`: sidebar remains hidden (user preference honored).
- [ ] Unicode wide characters (CJK) in truncated text: truncation accounts for double-width characters, never splitting a wide character.
- [ ] Semantic color tokens remain applied at all breakpoints — responsive adaptations never strip colors.
- [ ] SSE streaming content (workflow logs, agent responses) continues rendering during and after resize.

### Boundary Constraints

- [ ] Minimum supported terminal: 80 columns × 24 rows.
- [ ] Content area available rows: terminal height minus 2 (1 header row + 1 status bar row), minus border rows if applicable.
- [ ] Sidebar width: 25% of terminal width at standard/large, 0% at minimum (or when toggled off).
- [ ] Maximum sidebar width: capped at 60 columns regardless of terminal width.
- [ ] Breadcrumb max segment length: 24 characters before truncation.
- [ ] Scrollbox content: no maximum row limit — scrollbox handles arbitrarily long content via virtualized rendering.
- [ ] Modal overlay minimum inner width: 40 columns (if the terminal is too narrow for this, the modal stretches to 100% minus 2 columns for borders).

## Design

### Layout Architecture

The responsive layout system is composed of three layers:

1. **Breakpoint detection** — `useBreakpoint()` hook reads `useTerminalDimensions()` and returns the current breakpoint name.
2. **Responsive value resolution** — `useResponsiveValue()` hook maps breakpoint names to concrete layout values.
3. **Layout rendering** — Components consume responsive values to set widths, visibility flags, and content truncation.

### Breakpoint Detection

```
useBreakpoint() → "minimum" | "standard" | "large"

Rules:
  width < 80 || height < 24   → null (triggers "too small" screen)
  width < 120 || height < 40  → "minimum"
  width < 200 || height < 60  → "standard"
  otherwise                   → "large"
```

The hook returns `null` when the terminal is below minimum size. The app shell checks for `null` and renders the "too small" message instead of the normal layout.

### Responsive Value Hook

```
useResponsiveValue({ minimum: T, standard: T, large: T }) → T
```

### Terminal Too Small Screen

When `useBreakpoint()` returns `null`:

```
<box width="100%" height="100%" justifyContent="center" alignItems="center" flexDirection="column">
  <text color={theme.warning} bold>Terminal too small</text>
  <text color={theme.muted}>(current: {width}×{height}, min: 80×24)</text>
</box>
```

No header bar, no status bar. Only `Ctrl+C` is active for quitting.

### Global App Shell Layout with Responsive Sidebar

```
<box flexDirection="column" width="100%" height="100%">
  <HeaderBar
    breadcrumbs={stack}
    repoContext={breakpoint !== "minimum" ? repoContext : null}
    notifCount={unreadCount}
    maxBreadcrumbWidth={breakpoint === "large" ? Infinity : breakpoint === "standard" ? 80 : width - 20}
  />

  <box flexGrow={1} flexDirection="row">
    {sidebarVisible && currentScreenHasSidebar && (
      <box width={sidebarWidth} maxWidth={60} borderRight="single" borderColor={theme.border}>
        <scrollbox>
          <SidebarContent screen={currentScreen} />
        </scrollbox>
      </box>
    )}
    <box flexGrow={1}>
      <CurrentScreen context={currentEntry.context} breakpoint={breakpoint} />
    </box>
  </box>

  <StatusBar
    hints={breakpoint === "large" ? extendedHints : breakpoint === "standard" ? standardHints : minimalHints}
    syncStatus={breakpoint !== "minimum" ? syncStatus : null}
    notifCount={unreadCount}
  />
</box>
```

### Sidebar Toggle

`Ctrl+B` toggles sidebar visibility. Sidebar state machine:
- At `minimum`: starts hidden. `Ctrl+B` shows sidebar as overlay (pushes content, not floating).
- At `standard`/`large`: starts visible. `Ctrl+B` hides sidebar, giving full width to content.
- On breakpoint change from `standard` → `minimum`: sidebar auto-hides.
- On breakpoint change from `minimum` → `standard`: sidebar restores to its state before auto-hide. If user manually hid it, it stays hidden.

### List View Column Adaptation

**Minimum (80 cols):** Title (flex-grow) + Status (8 chars) only. Author, Labels, Timestamp, Comments hidden.

**Standard (120 cols):** Title (flex-grow) + Status (10) + Author (16) + Labels (20) + Timestamp (12) + Comments (4).

**Large (200+ cols):** Title (flex-grow) + Status (14) + Author (24) + Labels (32, full names) + Timestamp (20, full date) + Comments (8).

### Diff View Responsive Constraints

**Minimum:** Unified mode only. `t` key shows status bar message "split unavailable at this size" for 2s. Line number gutter: 4 chars. No file tree sidebar.

**Standard:** Unified and split modes. Split panes ~47 cols each. Line number gutter: 5 chars. 3 context lines.

**Large:** Unified and split modes. Split panes ~72 cols each. Line number gutter: 6 chars. 5 context lines.

### Modal Overlay Responsive Sizing

Minimum: 90% width/height. Standard: 60% width/height. Large: 50% width/height with larger padding. Minimum inner width: 40 columns (stretches to 100% - 2 if terminal too narrow).

### Keybindings

| Key | Action | Context |
|-----|--------|--------|
| `Ctrl+B` | Toggle sidebar visibility | Any screen with a sidebar panel |

Existing keybindings from other features may be conditionally disabled based on breakpoint (e.g., `t` for split-view toggle at minimum breakpoint).

### Data Hooks

- `useTerminalDimensions()` — provides `{ width, height }`, updates on resize.
- `useOnResize()` — registers callback `(width, height) => void` on terminal resize.
- `useKeyboard()` — for `Ctrl+B` sidebar toggle binding.

The responsive layout does not directly consume `@codeplane/ui-core` data hooks. Individual screens receive the current `breakpoint` as a prop or via context.

### Resize Handling Flow

1. Terminal emits resize signal.
2. OpenTUI renderer detects new dimensions.
3. `useTerminalDimensions()` updates, triggering React re-render.
4. `useBreakpoint()` recalculates breakpoint.
5. `useResponsiveValue()` hooks return new values.
6. Components re-render with new layout values.
7. Steps 2–6 happen synchronously in a single React render cycle.
8. No intermediate frame is painted.

## Permissions & Security

### Authorization

- The responsive layout system requires **no specific authorization role**. It is a client-side presentation layer operating entirely within the TUI process.
- Breakpoint detection, sidebar toggle, and layout calculations do not involve any API calls or server communication.
- The layout system functions identically for all authenticated users regardless of their authorization level (owner, admin, member, guest).
- The "Terminal too small" screen requires no authentication — it renders before and independently of the auth check.

### Rate Limiting

- Not applicable. The responsive layout system makes zero API calls.
- Rapid terminal resize events are handled locally within the TUI process. Even if the user resizes continuously, no network traffic is generated.
- Components that fetch data on resize (e.g., list views that recalculate pagination) are governed by their own data hooks' rate limiting, not the layout system.

### Token-Based Auth

- The responsive layout system does not interact with authentication tokens.
- It initializes and functions identically regardless of auth state.
- Auth-related error screens ("Not authenticated", "Session expired") are rendered within the responsive layout shell — they receive the same breakpoint-driven sizing and truncation rules.

### Security Considerations

- Terminal dimensions are read from the local terminal emulator via OpenTUI's native bindings. They are not user-supplied input and cannot be spoofed in a security-relevant way.
- The `Ctrl+B` sidebar toggle does not expose any data or modify any state beyond the local sidebar visibility flag.
- No layout-related data is persisted to disk, sent to the network, or logged (terminal dimensions are logged at `debug` level for diagnostics but contain no sensitive information).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.responsive.breakpoint_init` | TUI startup, after first breakpoint calculation | `breakpoint` (`minimum` / `standard` / `large`), `width`, `height`, `color_tier` |
| `tui.responsive.breakpoint_change` | Terminal resize causes breakpoint transition | `from_breakpoint`, `to_breakpoint`, `from_width`, `from_height`, `to_width`, `to_height` |
| `tui.responsive.terminal_too_small` | Terminal drops below 80×24 | `width`, `height`, `previous_breakpoint` |
| `tui.responsive.terminal_restored` | Terminal grows back above 80×24 from too-small state | `width`, `height`, `new_breakpoint`, `too_small_duration_ms` |
| `tui.responsive.sidebar_toggle` | User presses `Ctrl+B` | `action` (`show` / `hide`), `breakpoint`, `screen` |
| `tui.responsive.resize` | Any terminal resize event | `old_width`, `old_height`, `new_width`, `new_height`, `breakpoint`, `resize_count_in_session` |
| `tui.responsive.split_unavailable` | User presses `t` for split view at minimum breakpoint | `width`, `height` |

### Success Indicators

- **Breakpoint distribution**: Percentage of sessions in each breakpoint (`minimum` < 30%, `standard` 50–60%, `large` 10–20%) — indicates user terminal size norms.
- **Terminal-too-small rate**: Percentage of sessions encountering the "too small" state (target: < 5%).
- **Too-small recovery rate**: Of sessions that encounter "too small", percentage that resize and continue (target: > 80%).
- **Too-small median duration**: Median time spent in "too small" state (target: < 5 seconds).
- **Sidebar toggle frequency**: Average sidebar toggles per session (> 0.5 indicates users actively customizing their layout).
- **Resize frequency**: Average resize events per session — high counts indicate tmux/multiplexer usage.
- **Split-unavailable rate**: How often users attempt split view at minimum size — high rate suggests minimum breakpoint is frustrating for diff review.

## Observability

### Logging

| Log Level | Event | Message Pattern |
|-----------|-------|----------------|
| `info` | TUI startup breakpoint | `"Responsive layout initialized: {breakpoint} ({width}×{height})"` |
| `info` | Breakpoint change | `"Breakpoint changed: {from} → {to} ({width}×{height})"` |
| `warn` | Terminal too small | `"Terminal below minimum size: {width}×{height} (min: 80×24)"` |
| `warn` | Terminal restored from too small | `"Terminal restored to valid size: {width}×{height} ({breakpoint})"` |
| `debug` | Terminal resize | `"Terminal resized: {oldWidth}×{oldHeight} → {newWidth}×{newHeight}"` |
| `debug` | Sidebar toggled | `"Sidebar {shown/hidden} via Ctrl+B (breakpoint: {breakpoint})"` |
| `debug` | Sidebar auto-collapsed | `"Sidebar auto-hidden: breakpoint changed to minimum"` |
| `debug` | Split view rejected | `"Split diff view unavailable at {breakpoint} breakpoint ({width} cols)"` |
| `debug` | Modal resized | `"Modal resized: {oldWidth}% → {newWidth}% (breakpoint: {breakpoint})"` |

Logs are written to stderr so they do not interfere with terminal rendering. Log level is controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases

| Error Scenario | Detection | Recovery |
|----------------|-----------|----------|
| Terminal resize during screen transition | `useOnResize` fires during React commit phase | Layout recalculates synchronously. New screen renders at new dimensions. No artifacts from old screen |
| Terminal resize during modal display | `useOnResize` fires while modal is open | Modal re-centers and resizes to appropriate percentage for new breakpoint. Focus remains trapped in modal |
| Terminal resize during text input | `useOnResize` fires while input is focused | Input content and cursor position preserved. Input width adjusts to new available space |
| Terminal resize during SSE streaming | `useOnResize` fires while logs/messages are streaming | Streaming continues uninterrupted. New content renders at new width. Existing content re-wraps |
| Terminal resize during data fetch | `useOnResize` fires while loading spinner is shown | Loading state renders at new dimensions. Data arrives and renders at new size |
| Rapid resize events (window drag) | Multiple resize events within one frame | React batches state updates — only the final dimensions trigger a committed render |
| Terminal reports invalid dimensions (0×0) | `useTerminalDimensions()` returns 0 for either dimension | Treated as below-minimum. "Too small" message shown. Logged as warning |
| Sidebar toggle on screen without sidebar | `Ctrl+B` pressed on Dashboard or other non-sidebar screen | No-op. No visual change, no error message |
| Sidebar toggle while modal is open | `Ctrl+B` pressed while command palette or help overlay is active | No-op. Modal retains focus. Sidebar state unchanged |
| Breakpoint hook called outside provider | Component uses `useBreakpoint()` without ancestor provider | Returns `"standard"` as safe default. Logs error-level message |

### Failure Modes

- **Layout thrashing**: Continuous rapid resizes cause excessive re-renders. Mitigation: React 19's automatic batching coalesces synchronous state updates. OpenTUI's renderer debounces resize events at the native level.
- **Content overflow at boundary**: Terminal is exactly 80 columns and content renders one character too wide. Mitigation: all width calculations use `Math.floor()` and account for border characters. OpenTUI's `<box>` clips overflow by default.
- **Stale breakpoint**: `useBreakpoint()` returns old value during first render after resize. Mitigation: `useTerminalDimensions()` updates synchronously before React's commit phase.
- **Sidebar state desync**: User toggles sidebar, then resize changes breakpoint, then resize back — sidebar should reflect user's last explicit toggle. Mitigation: sidebar state stored as `{ userPreference: boolean | null, autoOverride: boolean }` where user preference is tracked separately from auto-collapse.

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

### Terminal Snapshot Tests

- **RESPONSIVE_SNAPSHOT_01**: `renders minimum layout at 80x24` — Launch TUI at 80×24, capture full-screen snapshot. Assert: header bar shows truncated breadcrumb with `…`, no repo context, notification count only. Status bar shows single hint and `? help`. Content area is 22 rows. No sidebar visible.
- **RESPONSIVE_SNAPSHOT_02**: `renders standard layout at 120x40` — Launch TUI at 120×40, capture full-screen snapshot. Assert: header bar shows full breadcrumb, repo context in center, connection indicator and notification badge. Status bar shows full hints, sync status, notification count, help hint. Content area is 38 rows.
- **RESPONSIVE_SNAPSHOT_03**: `renders large layout at 200x60` — Launch TUI at 200×60, capture full-screen snapshot. Assert: header bar shows fully expanded breadcrumb with no truncation. Status bar shows extended hints with descriptive labels. Content area is 58 rows.
- **RESPONSIVE_SNAPSHOT_04**: `renders "terminal too small" at 60x20` — Launch TUI at 60×20, capture snapshot. Assert: centered text "Terminal too small" in warning color, "(current: 60×20, min: 80×24)" in muted color. No header bar, no status bar.
- **RESPONSIVE_SNAPSHOT_05**: `renders "terminal too small" at 79x24` — Launch TUI at 79×24, assert too-small message showing `79×24`.
- **RESPONSIVE_SNAPSHOT_06**: `renders "terminal too small" at 80x23` — Launch TUI at 80×23, assert too-small message showing `80×23`.
- **RESPONSIVE_SNAPSHOT_07**: `renders sidebar visible at 120x40 on code explorer` — Navigate to repo code explorer at 120×40. Assert: sidebar visible at ~25% width with file tree, main content at ~75%, border separator between them.
- **RESPONSIVE_SNAPSHOT_08**: `renders sidebar hidden at 80x24 on code explorer` — Navigate to repo code explorer at 80×24. Assert: no sidebar visible, content uses full width.
- **RESPONSIVE_SNAPSHOT_09**: `renders list view with all columns at 120x40` — Navigate to issue list at 120×40. Assert: title, status, author, labels, timestamp, and comments columns all visible.
- **RESPONSIVE_SNAPSHOT_10**: `renders list view with title and status only at 80x24` — Navigate to issue list at 80×24. Assert: only title and status columns visible.
- **RESPONSIVE_SNAPSHOT_11**: `renders list view with expanded columns at 200x60` — Navigate to issue list at 200×60. Assert: all columns visible with full label names and full timestamps.
- **RESPONSIVE_SNAPSHOT_12**: `renders modal at 90% width at 80x24` — Open command palette at 80×24. Assert: modal width is ~72 columns (90% of 80).
- **RESPONSIVE_SNAPSHOT_13**: `renders modal at 60% width at 120x40` — Open command palette at 120×40. Assert: modal width is ~72 columns (60% of 120).
- **RESPONSIVE_SNAPSHOT_14**: `renders modal at 50% width at 200x60` — Open command palette at 200×60. Assert: modal width is ~100 columns (50% of 200).
- **RESPONSIVE_SNAPSHOT_15**: `renders unified diff only at 80x24` — Navigate to diff view at 80×24. Assert: unified diff rendered, no split-pane layout.
- **RESPONSIVE_SNAPSHOT_16**: `renders split diff at 120x40` — Navigate to diff view at 120×40, press `t` to toggle split. Assert: two side-by-side panes.
- **RESPONSIVE_SNAPSHOT_17**: `renders diff with extra context lines at 200x60` — Navigate to diff view at 200×60. Assert: 5 context lines above and below hunks.

### Keyboard Interaction Tests

- **RESPONSIVE_KEY_01**: `Ctrl+B toggles sidebar visibility at 120x40` — At 120×40 on code explorer, assert sidebar visible. Press `Ctrl+B`, assert sidebar hidden. Press `Ctrl+B` again, assert sidebar restored.
- **RESPONSIVE_KEY_02**: `Ctrl+B shows sidebar at 80x24` — At 80×24 on code explorer, assert sidebar hidden. Press `Ctrl+B`, assert sidebar appears.
- **RESPONSIVE_KEY_03**: `Ctrl+B is no-op on dashboard` — At 120×40 on Dashboard, press `Ctrl+B`. Assert: no visual change.
- **RESPONSIVE_KEY_04**: `Ctrl+B is no-op during modal` — At 120×40, open command palette, press `Ctrl+B`. Assert: modal remains open, sidebar unchanged.
- **RESPONSIVE_KEY_05**: `t key shows error at 80x24 in diff view` — At 80×24 on diff view, press `t`. Assert: status bar shows "split unavailable at this size".
- **RESPONSIVE_KEY_06**: `t key toggles split at 120x40 in diff view` — At 120×40 on diff view, press `t`. Assert: diff switches to split mode.
- **RESPONSIVE_KEY_07**: `j/k navigation works at all breakpoints` — At 80×24, 120×40, and 200×60 on issue list, press `j` and `k`. Assert: focus moves correctly.
- **RESPONSIVE_KEY_08**: `Ctrl+C works from too-small screen` — At 60×20, press `Ctrl+C`. Assert: TUI exits cleanly.
- **RESPONSIVE_KEY_09**: `sidebar toggle preserved across screen transitions` — At 120×40, press `Ctrl+B` to hide sidebar on code explorer. Navigate to diff view. Assert: sidebar hidden. Press `Ctrl+B`, sidebar appears. Navigate back. Assert: sidebar visible.

### Resize Tests

- **RESPONSIVE_RESIZE_01**: `resize from 120x40 to 80x24 collapses sidebar` — Start at 120×40 with sidebar visible. Resize to 80×24. Assert: sidebar hidden, content fills width.
- **RESPONSIVE_RESIZE_02**: `resize from 80x24 to 120x40 restores layout` — Start at 80×24. Resize to 120×40. Assert: full header, all list columns, sidebar visible.
- **RESPONSIVE_RESIZE_03**: `resize from 120x40 to 60x20 shows too-small` — Start at 120×40. Resize to 60×20. Assert: "Terminal too small" message.
- **RESPONSIVE_RESIZE_04**: `resize from 60x20 to 120x40 restores full layout` — Start at 60×20. Resize to 120×40. Assert: full layout restored, navigation stack intact.
- **RESPONSIVE_RESIZE_05**: `resize from 120x40 to 200x60 expands layout` — Start at 120×40. Resize to 200×60. Assert: columns expand, full labels, extended hints.
- **RESPONSIVE_RESIZE_06**: `resize from 200x60 to 120x40 contracts layout` — Start at 200×60. Resize to 120×40. Assert: columns contract to standard widths.
- **RESPONSIVE_RESIZE_07**: `resize preserves scroll position` — At 120×40, scroll down 20 items. Resize to 80×24. Assert: same focused item visible.
- **RESPONSIVE_RESIZE_08**: `resize preserves focused element` — At 120×40, navigate to item 5. Resize to 80×24. Assert: item 5 still focused.
- **RESPONSIVE_RESIZE_09**: `resize during modal adjusts modal size` — At 120×40, open command palette. Resize to 80×24. Assert: modal adjusts to 90% width.
- **RESPONSIVE_RESIZE_10**: `resize during text input preserves content` — At 120×40, type in search input. Resize to 80×24. Assert: input content preserved.
- **RESPONSIVE_RESIZE_11**: `resize during diff view mode change` — At 120×40 in split diff. Resize to 80×24. Assert: diff switches to unified mode.
- **RESPONSIVE_RESIZE_12**: `resize within same breakpoint does not flash` — At 120×40, resize to 130×45. Assert: no layout jumps.
- **RESPONSIVE_RESIZE_13**: `sidebar auto-hides on resize to minimum, restores on resize back` — At 120×40 with sidebar visible. Resize to 80×24 (auto-hides). Resize back to 120×40. Assert: sidebar visible again.
- **RESPONSIVE_RESIZE_14**: `sidebar stays hidden after user toggle on resize back` — At 120×40, hide sidebar via `Ctrl+B`. Resize to 80×24. Resize back to 120×40. Assert: sidebar stays hidden.

### Integration Tests

- **RESPONSIVE_INTEGRATION_01**: `navigation stack preserved through too-small and back` — Navigate 3 deep at 120×40. Resize to 60×20. Resize back to 120×40. Assert: original stack restored.
- **RESPONSIVE_INTEGRATION_02**: `SSE streaming continues through resize` — At 120×40 on workflow log view. Resize to 80×24. Assert: logs continue streaming.
- **RESPONSIVE_INTEGRATION_03**: `colors preserved across all breakpoints` — Capture color output at 80×24, 120×40, and 200×60. Assert: semantic tokens present at all sizes.
- **RESPONSIVE_INTEGRATION_04**: `go-to navigation works at minimum breakpoint` — At 80×24, press `g` then `r`. Assert: navigates to repository list.
- **RESPONSIVE_INTEGRATION_05**: `command palette respects modal sizing per breakpoint` — At 80×24, press `:` (90% width). Resize to 120×40, press `:` (60% width).
- **RESPONSIVE_INTEGRATION_06**: `error boundary renders correctly at minimum breakpoint` — At 80×24, trigger error. Assert: error screen within 80×24 constraints.
- **RESPONSIVE_INTEGRATION_07**: `loading states render correctly at all breakpoints` — Navigate to slow screen at 80×24, 120×40, 200×60. Assert: spinner centered at each size.
- **RESPONSIVE_INTEGRATION_08**: `deep-link launch respects initial terminal size` — Launch `--screen issues --repo owner/repo` at 80×24 and 200×60. Assert: appropriate breakpoint adaptations.
