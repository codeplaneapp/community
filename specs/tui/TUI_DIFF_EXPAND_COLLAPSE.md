# TUI_DIFF_EXPAND_COLLAPSE

Specification for TUI_DIFF_EXPAND_COLLAPSE.

## High-Level User POV

The hunk expand/collapse feature gives a terminal-native developer fine-grained control over which sections of a diff are visible at any moment. When reviewing a large change — one that touches dozens of functions across multiple files — the developer needs the ability to collapse hunks they've already reviewed or hunks that contain boilerplate modifications, so they can focus their attention on the substantive changes that remain. This is the diff viewer's equivalent of code folding in an editor: a spatial memory aid that lets the developer manage cognitive load during review.

When a developer opens any diff in the Codeplane TUI — whether a single change diff, a combined landing request diff, or a diff accessed via the command palette — every hunk starts fully expanded. This is the default state. The developer sees all additions, deletions, and context lines for every hunk in the file, separated by cyan hunk header lines that show the line range and enclosing function/scope name.

The developer has four levels of expand/collapse control, each mapped to a single key:

**Individual hunk toggle.** When the developer's cursor (scroll position) is on or within a hunk, pressing `z` collapses that single hunk into a one-line summary. The expanded multi-line hunk content disappears and is replaced by a single line showing `▶ ⋯ N lines hidden (lines X–Y)`, rendered in muted gray (ANSI 245) with a dashed top and bottom border. The `▶` indicator signals that the hunk can be expanded. Pressing `Enter` on a collapsed hunk summary line, or pressing `z` again while the cursor is on the collapsed summary, expands it back to full content. The hunk header line reappears with the `▼` indicator, and all addition/deletion/context lines are restored.

**Collapse all hunks in the current file.** Pressing `Z` (Shift+z) collapses every hunk in the currently focused file. This is useful when the developer has finished reviewing a file and wants to compress it to a scannable summary before navigating to the next file. Every hunk becomes a single summary line showing its hidden line count. The file header remains visible, providing the filename and change statistics as orientation anchors.

**Expand all hunks in the current file.** Pressing `x` expands all collapsed hunks in the currently focused file. This is the recovery action: if the developer collapsed hunks and now wants to see everything again, a single keypress restores full visibility. Only hunks in the current file are affected; hunks in other files retain their collapsed state.

**Expand all hunks across all files.** Pressing `X` (Shift+x) is the global reset. It expands every collapsed hunk across every file in the entire diff. This is the "start over" action for developers who collapsed hunks in multiple files and want to return to the baseline fully-expanded state.

The collapse state is managed per-hunk, per-file, and persists for the lifetime of the diff screen session. Navigating between files with `]`/`[` preserves the collapse state of every file. If the developer collapses two hunks in file A, navigates to file B, collapses a hunk there, and navigates back to file A, those two hunks are still collapsed. The collapse state resets only when the developer exits the diff screen entirely (`q`) and re-enters — a fresh session starts with all hunks expanded.

Collapsed hunks interact correctly with other diff features. Scrolling with `j`/`k` treats a collapsed hunk summary as a single line — the developer scrolls past it in one movement rather than scrolling through the hidden lines. Page jumps (`Ctrl+D`/`Ctrl+U`) account for the reduced line count when hunks are collapsed. In split view mode (toggle with `t`), hunk expand/collapse works identically. A collapsed hunk shows the summary line spanning the full width across both panes. The collapse state is preserved when toggling between unified and split view.

At minimum terminal size (80×24), the collapsed hunk summary abbreviates to `▶ ⋯ N hidden` to conserve horizontal space. At standard size (120×40) and above, the full `▶ ⋯ N lines hidden (lines X–Y)` format is used. The dashed border is rendered using Unicode box-drawing characters (`╌`) at all terminal sizes.

## Acceptance Criteria

### Core expand/collapse behavior
- [ ] All hunks are expanded by default when the diff screen mounts
- [ ] Pressing `z` collapses the hunk that contains the current scroll position (focused hunk)
- [ ] Pressing `z` on an already-collapsed hunk summary line expands that hunk (toggle behavior)
- [ ] Pressing `Enter` on a collapsed hunk summary line expands that hunk
- [ ] Pressing `Z` (Shift+z) collapses all hunks in the currently focused file
- [ ] Pressing `x` expands all collapsed hunks in the currently focused file
- [ ] Pressing `X` (Shift+x) expands all collapsed hunks across all files in the diff
- [ ] Collapsed hunk content is replaced by a single summary line: `▶ ⋯ N lines hidden (lines X–Y)`
- [ ] Expanded hunk header shows `▼` indicator before the hunk range info
- [ ] Collapse/expand transitions happen instantly (no animation, synchronous re-render)

### Collapsed hunk summary line
- [ ] The summary line shows `▶ ⋯ N lines hidden (lines X–Y)` where N is the total line count (additions + deletions + context) and X–Y is the line range in the new file
- [ ] At terminal widths < 120 columns, the summary abbreviates to `▶ ⋯ N hidden`
- [ ] At terminal widths ≥ 120 columns, the full `▶ ⋯ N lines hidden (lines X–Y)` is shown
- [ ] The summary line renders in `muted` color (ANSI 245)
- [ ] The summary line has a dashed top border (`╌`) and dashed bottom border (`╌`) in `border` color (ANSI 240)
- [ ] The `▶` indicator is rendered in `primary` color (ANSI 33, blue) to indicate interactivity
- [ ] The summary line occupies exactly 1 row in the scrollbox (not the height of the original hunk)
- [ ] The hunk header line is hidden when the hunk is collapsed — the summary replaces the entire hunk including its header

### Expanded hunk indicator
- [ ] Expanded hunks show `▼` before the hunk header range
- [ ] The `▼` indicator renders in `primary` color (ANSI 33, blue)
- [ ] The hunk header line renders in cyan (ANSI 37)
- [ ] The `▼` indicator is present by default (all hunks start expanded)

### Scroll behavior with collapsed hunks
- [ ] Scrolling `j`/`k` treats a collapsed hunk summary as 1 line
- [ ] `Ctrl+D`/`Ctrl+U` page jumps account for the reduced visible line count
- [ ] `G` jumps to the bottom of the visible content (accounting for collapsed hunks)
- [ ] `g g` jumps to the top of the visible content
- [ ] The scrollbox's scroll indicator reflects the visible content height, not the total content height
- [ ] When a hunk is collapsed, the scroll position adjusts so the developer does not lose their place
- [ ] When a hunk is expanded, the scroll position adjusts so the newly expanded content flows below the expansion point

### State persistence
- [ ] Collapse state persists across file navigation within the same diff session (`]`/`[` do not reset it)
- [ ] Collapse state persists across file tree selection (`Enter` in file tree does not reset it)
- [ ] Collapse state persists when toggling sidebar visibility (`Ctrl+B`)
- [ ] Collapse state is preserved when toggling view mode (`t` — unified to split and back)
- [ ] Collapse state does NOT persist when popping the diff screen (`q`) and re-entering
- [ ] Collapse state resets when whitespace is toggled (`w`) because the hunk structure may change after re-fetch
- [ ] Collapse state persists when line numbers are toggled (`l`)

### Split view behavior
- [ ] `z`, `Z`, `x`, `X`, and `Enter` on collapsed hunk work identically in split view mode
- [ ] Collapsed hunk summary line spans full width across both panes in split view
- [ ] Collapse state set in unified mode is preserved when switching to split mode via `t`
- [ ] Collapse state set in split mode is preserved when switching to unified mode via `t`

### Keybinding constraints
- [ ] `z` requires no modifier keys: plain `z` without Ctrl, Shift, or Meta
- [ ] `Z` requires Shift only
- [ ] `x` requires no modifier keys: plain `x` without Ctrl, Shift, or Meta
- [ ] `X` requires Shift only
- [ ] `Enter` requires no modifier keys
- [ ] All five keybindings are active from the main content focus zone only (not from file tree sidebar)
- [ ] All five keybindings are no-ops when the diff screen is in loading, error, or overlay-open states
- [ ] The key events are consumed and do not propagate to other handlers

### Boundary constraints
- [ ] Maximum hunk count per file: No upper limit. All hunks managed individually
- [ ] Hunks with 1 line can still be collapsed. Summary shows `▶ ⋯ 1 line hidden (line X)` (singular)
- [ ] Zero hunks: `z`/`Z`/`x`/`X` are no-ops
- [ ] The `N` value in `N lines hidden` is displayed as a full integer (no abbreviation for large numbers)
- [ ] The line range `(lines X–Y)` uses an en-dash (–), not a hyphen

### Edge cases
- [ ] `z` pressed when all hunks in the current file are already collapsed: no-op
- [ ] `x` pressed when all hunks are already expanded: no-op
- [ ] Rapid `z`/`x` presses: processed sequentially, one action per keypress, no debounce
- [ ] Terminal resize while hunks are collapsed: layout recalculates; summary text may switch between abbreviated and full format; collapsed state preserved
- [ ] Diff with 0 files: all collapse keybindings are no-ops
- [ ] Collapsed hunk at bottom of file then `G`: cursor lands on the collapsed summary line
- [ ] `Enter` on expanded hunk header: no-op
- [ ] `Enter` on a non-hunk line: no-op
- [ ] Terminal does not support 256 colors: summary line renders with available colors; functionality unchanged
- [ ] No color support (`TERM=dumb`): `▶`/`▼` indicators still displayed; dashed border falls back to `---`

## Design

### Expanded hunk layout (default)

```
▼ @@ -42,7 +42,12 @@ function setup()
 42  42 │  const token = getToken();
 43  43 │  if (token.expired) {
 44     │−   return null;
     44 │+   const fresh = await refresh();
     45 │+   return fresh;
 45  46 │  }
```

### Collapsed hunk layout (after pressing `z`)

```
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
▶ ⋯ 7 lines hidden (lines 42–48)
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
```

### Collapsed hunk at minimum width (80×24)

```
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
▶ ⋯ 7 hidden
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
```

### Split view with collapsed hunk

Collapsed hunk summary line spans full width across both panes with dashed border continuing through the vertical separator.

### Component structure

```tsx
{/* Hunk header — expanded state */}
<box flexDirection="row" height={1}>
  <text color="primary">▼</text>
  <text color="cyan"> @@ -{oldStart},{oldCount} +{newStart},{newCount} @@ {scopeName}</text>
</box>

{/* Hunk content — expanded state */}
<box flexDirection="column">
  {hunk.lines.map((line, i) => (
    <DiffLine key={i} line={line} showLineNumbers={showLineNumbers} />
  ))}
</box>

{/* Collapsed hunk summary */}
<box flexDirection="column">
  <text color="border">{'╌'.repeat(contentWidth)}</text>
  <box flexDirection="row" height={1}>
    <text color="primary">▶</text>
    <text color="muted">
      {terminalWidth >= 120
        ? ` ⋯ ${lineCount} lines hidden (lines ${startLine}–${endLine})`
        : ` ⋯ ${lineCount} hidden`
      }
    </text>
  </box>
  <text color="border">{'╌'.repeat(contentWidth)}</text>
</box>
```

### State management

```
hunkCollapseState: Map<string, Map<number, boolean>>
  - Outer key: file path (string)
  - Inner key: hunk index (0-based integer)
  - Value: true = collapsed, false = expanded
  - Default: empty map (all hunks expanded)
  - Set by: z, Z, x, X, Enter keypresses
  - Reset by: screen unmount, whitespace toggle re-fetch

focusedHunkIndex: number
  - Derived from current scroll position mapped to hunk boundaries
  - Used by z to determine which hunk to collapse
  - Recalculated on every scroll position change
```

### Keybinding reference

| Key | Modifier | Context | Action | Condition |
|-----|----------|---------|--------|-----------|
| `z` | None | Main content | Toggle focused hunk collapse/expand | Screen loaded, no overlay |
| `Z` | Shift | Main content | Collapse all hunks in current file | Screen loaded, no overlay |
| `x` | None | Main content | Expand all hunks in current file | Screen loaded, no overlay |
| `X` | Shift | Main content | Expand all hunks across all files | Screen loaded, no overlay |
| `Enter` | None | Collapsed summary | Expand the collapsed hunk | Screen loaded, no overlay |

### Responsive behavior

| Terminal size | Summary line format | Status bar hint | Border char |
|---------------|--------------------|-----------------|-----------|
| 80×24 – 119×39 | `▶ ⋯ N hidden` | `x/z` | `╌` |
| 120×40 – 199×59 | `▶ ⋯ N lines hidden (lines X–Y)` | `x/z:hunks` | `╌` |
| 200×60+ | `▶ ⋯ N lines hidden (lines X–Y)` | `x/z:hunks` | `╌` |

On terminal resize: collapsed hunk summary text may switch between abbreviated and full format (recalculates synchronously). Collapse state is never affected by resize. Scrollbox height adjusts; scroll position recalculates to keep current content in view.

### Data hooks consumed

| Hook | Source | Purpose |
|------|--------|---------|
| `useChangeDiff(owner, repo, change_id)` | `@codeplane/ui-core` | Provides diff data with hunk boundaries for collapse tracking |
| `useLandingDiff(owner, repo, number)` | `@codeplane/ui-core` | Provides landing diff data with hunk boundaries |
| `useKeyboard(handler)` | `@opentui/react` | Register z, Z, x, X, Enter keybindings |
| `useTerminalDimensions()` | `@opentui/react` | Determine summary line format (abbreviated vs. full) |
| `useOnResize(callback)` | `@opentui/react` | Recalculate summary line width and format on resize |

## Permissions & Security

### Authorization

| Action | Required role | Behavior when unauthorized |
|--------|--------------|---------------------------|
| Collapse/expand hunks in a diff | Repository read access | N/A — if user can view the diff, expand/collapse is available |
| Collapse/expand hunks on private repo | Repository member or collaborator | N/A — same auth as viewing the diff |

The expand/collapse feature is entirely client-side. It does not make any API calls. It operates on diff data that has already been fetched and authorized. No additional permissions are required beyond the read access needed to view the diff initially.

### Token-based authentication
- No token is used by expand/collapse operations (pure client-side state)
- The diff data consumed by expand/collapse was fetched with the standard Bearer token via `@codeplane/ui-core`
- If the session expires while the developer is collapsing/expanding hunks, the next API call (e.g., whitespace toggle, file navigation that re-fetches) will surface the 401 error

### Rate limiting
- Not applicable. Expand/collapse operations are entirely client-side and do not generate API requests
- The whitespace toggle (`w`), which resets collapse state, is the only collapse-adjacent action that involves an API call, and it has its own debounce and rate limit handling (see TUI_DIFF_WHITESPACE_TOGGLE spec)

### Input sanitization
- No user input is sent to any API. Hunk indices and file paths used in the collapse state map are derived from the already-fetched diff data, not from user-supplied text
- The `z`, `Z`, `x`, `X`, and `Enter` key events are consumed by the handler and do not propagate

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.diff.hunk.collapse_single` | Developer presses `z` and a hunk collapses | `repo`, `change_id` or `landing_number`, `source` ("change" | "landing"), `file`, `hunk_index`, `hunk_line_count`, `view_mode`, `total_hunks_in_file`, `collapsed_hunks_in_file` (count after collapse) |
| `tui.diff.hunk.expand_single` | Developer presses `z` or `Enter` on collapsed hunk | `repo`, `change_id` or `landing_number`, `source`, `file`, `hunk_index`, `hunk_line_count`, `view_mode`, `method` ("z" | "enter"), `collapsed_hunks_in_file` |
| `tui.diff.hunk.collapse_all_file` | Developer presses `Z` | `repo`, `change_id` or `landing_number`, `source`, `file`, `hunk_count`, `view_mode` |
| `tui.diff.hunk.expand_all_file` | Developer presses `x` | `repo`, `change_id` or `landing_number`, `source`, `file`, `hunk_count`, `previously_collapsed_count`, `view_mode` |
| `tui.diff.hunk.expand_all_global` | Developer presses `X` | `repo`, `change_id` or `landing_number`, `source`, `file_count`, `total_hunk_count`, `previously_collapsed_count`, `view_mode` |
| `tui.diff.hunk.collapse_state_reset` | Collapse state resets due to whitespace toggle | `repo`, `change_id` or `landing_number`, `previously_collapsed_count`, `trigger` ("whitespace_toggle") |

### Common properties (attached to all events)

| Property | Description |
|----------|-------------|
| `session_id` | Unique TUI session identifier |
| `terminal_width` | Current terminal column count |
| `terminal_height` | Current terminal row count |
| `timestamp` | ISO 8601 event timestamp |
| `user_id` | Authenticated user identifier |

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Hunk collapse adoption | > 15% of diff sessions | Percentage of diff sessions where the developer collapses at least one hunk |
| Individual vs. bulk collapse ratio | > 60% individual | Percentage of collapse actions that are single-hunk (z) vs. collapse-all (Z) |
| Expand-after-collapse rate | > 80% of collapse sessions | Percentage of sessions where at least one hunk is re-expanded |
| Collapse-all usage | > 5% of diff sessions | Percentage of sessions where Z is used |
| Global expand usage | > 3% of diff sessions | Percentage of sessions where X is used |
| Collapse preserved across file nav | > 40% of sessions using collapse | Sessions where collapse + file navigation both used |
| Average collapsed hunks per session | 2–5 hunks | Average number of hunks collapsed per session |
| Collapse in split view | > 10% of collapse events | Percentage of collapse events in split view mode |

## Observability

### Logging requirements

| Level | Event | Format | When |
|-------|-------|--------|------|
| `debug` | `diff.hunk.collapse.single` | `{file: string, hunk_index: number, line_count: number}` | Developer presses `z` and a hunk collapses |
| `debug` | `diff.hunk.expand.single` | `{file: string, hunk_index: number, method: "z" | "enter"}` | Developer expands a single hunk |
| `debug` | `diff.hunk.collapse.all_file` | `{file: string, hunk_count: number}` | Developer presses `Z` |
| `debug` | `diff.hunk.expand.all_file` | `{file: string, hunk_count: number, previously_collapsed: number}` | Developer presses `x` |
| `debug` | `diff.hunk.expand.all_global` | `{file_count: number, hunk_count: number, previously_collapsed: number}` | Developer presses `X` |
| `debug` | `diff.hunk.collapse.state_reset` | `{trigger: "whitespace_toggle", previously_collapsed: number}` | Collapse state resets after whitespace re-fetch |
| `debug` | `diff.hunk.collapse.noop` | `{reason: string, key: string}` | Keybinding pressed but no action taken |
| `debug` | `diff.hunk.focused_index` | `{file: string, hunk_index: number, scroll_position: number}` | Focused hunk changes due to scrolling (throttled 1/sec) |
| `warn` | `diff.hunk.collapse.large_hunk` | `{file: string, hunk_index: number, line_count: number}` | Hunk with > 500 lines collapsed |

### TUI-specific error cases

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize while hunks are collapsed | Layout recalculates synchronously; summary line text adjusts to new width; collapsed state preserved | Automatic |
| Terminal resize to below minimum (< 80×24) | App shell shows "terminal too small" message; collapse state preserved in memory; restored when terminal enlarges | Automatic |
| Rapid `z`/`Z`/`x`/`X` presses | Processed sequentially, one action per keypress, no debounce. Each keypress updates state and triggers synchronous re-render | Automatic |
| `z` pressed while diff is re-rendering from previous `z` | Keypress queued; processed after current render completes | No dropped inputs |
| Whitespace toggle while hunks are collapsed | Collapse state reset; all hunks expanded in new diff data | Automatic |
| Component crash during collapse render | Global error boundary catches; "Press `r` to restart" shown | User restarts TUI |
| Very large diff (100+ hunks across many files) | All hunks track collapse state individually; Map operations are O(1) per hunk | Performance tested |
| Split view toggle while hunks are collapsed | Collapse state preserved; split view renders collapsed summaries spanning both panes | Automatic |

### Failure modes and degradation

| Failure | Impact | Degradation |
|---------|--------|-------------|
| Hunk boundary calculation error | `z` may collapse wrong hunk or no-op | Fallback: if focused hunk index is out of bounds, treat as no-op and log warning |
| Unicode rendering issue (`▶`/`▼` not supported) | Indicators may render as replacement characters | Fallback: use `>` and `v` ASCII characters when Unicode detection fails |
| Dashed border character (`╌`) not supported | Border may render as replacement characters | Fallback: use `-` ASCII character |
| State desynchronization between collapse map and diff data | Hunk indices in collapse map may not match new data | On any diff data change, clear the collapse state map entirely |

## Verification

Test file: `e2e/tui/diff.test.ts`

Tests for TUI_DIFF_EXPAND_COLLAPSE use the `EC` prefix (Expand/Collapse).

### Snapshot tests — visual states (13 tests)

| Test ID | Test name | Terminal size | Description |
|---------|-----------|--------------|-------------|
| SNAP-EC-001 | `renders all hunks expanded by default at 120x40` | 120×40 | All hunks show `▼` indicator, full content visible, hunk headers in cyan |
| SNAP-EC-002 | `renders collapsed hunk summary at 120x40` | 120×40 | After `z`: summary `▶ ⋯ N lines hidden (lines X–Y)` with dashed borders, muted color |
| SNAP-EC-003 | `renders collapsed hunk summary at 80x24` | 80×24 | After `z`: abbreviated `▶ ⋯ N hidden` at minimum width |
| SNAP-EC-004 | `renders collapsed hunk summary at 200x60` | 200×60 | After `z`: full summary at large size with wider dashed border |
| SNAP-EC-005 | `renders all hunks collapsed in file` | 120×40 | After `Z`: all hunks collapsed; file header still visible |
| SNAP-EC-006 | `renders mixed collapse state` | 120×40 | 3 hunks: hunk 1 expanded, hunk 2 collapsed, hunk 3 expanded |
| SNAP-EC-007 | `renders expanded hunk indicator` | 120×40 | `▼` in primary color before `@@` range |
| SNAP-EC-008 | `renders collapsed hunk indicator` | 120×40 | `▶` in primary color |
| SNAP-EC-009 | `renders collapsed hunk in split view` | 120×40 | Summary spans both panes |
| SNAP-EC-010 | `renders status bar hunk hints at 120x40` | 120×40 | `x/z:hunks` in status bar |
| SNAP-EC-011 | `renders status bar hunk hints at 80x24` | 80×24 | `x/z` at minimum width |
| SNAP-EC-012 | `renders single-line hunk collapsed` | 120×40 | `▶ ⋯ 1 line hidden (line X)` singular |
| SNAP-EC-013 | `renders large hunk collapsed` | 120×40 | `▶ ⋯ 1500 lines hidden (lines X–Y)` full number |

### Keyboard interaction tests (26 tests)

| Test ID | Test name | Key sequence | Expected state change |
|---------|-----------|-------------|----------------------|
| KEY-EC-001 | `z collapses focused hunk` | scroll to hunk, `z` | Hunk collapses to summary |
| KEY-EC-002 | `z on collapsed hunk expands it` | `z`, `z` | Toggle collapse → expand |
| KEY-EC-003 | `Enter on collapsed hunk expands it` | `z`, `Enter` | Collapsed hunk expands |
| KEY-EC-004 | `Enter on expanded hunk header is no-op` | `Enter` on header | No change |
| KEY-EC-005 | `Enter on code line is no-op` | `Enter` on content | No change |
| KEY-EC-006 | `Z collapses all hunks in file` | `Z` | All hunks collapse |
| KEY-EC-007 | `x expands all hunks in file` | `Z`, `x` | Collapse then expand all |
| KEY-EC-008 | `X expands all across files` | `Z`, `]`, `Z`, `X` | Global expand |
| KEY-EC-009 | `z no-op during loading` | `z` during load | No change |
| KEY-EC-010 | `z no-op during error` | `z` on error | No change |
| KEY-EC-011 | `z no-op with help overlay` | `?`, `z` | No collapse |
| KEY-EC-012 | `z no-op with command palette` | `:`, `z` | Types into palette |
| KEY-EC-013 | `z works in split view` | `t`, `z` | Collapse in split |
| KEY-EC-014 | `collapse preserved across file nav` | `z`, `]`, `[` | State preserved |
| KEY-EC-015 | `collapse preserved across view toggle` | `z`, `t` | State preserved |
| KEY-EC-016 | `collapse reset on whitespace toggle` | `z`, `w` | State reset |
| KEY-EC-017 | `collapse preserved across line toggle` | `z`, `l` | State preserved |
| KEY-EC-018 | `collapse preserved across sidebar toggle` | `z`, `Ctrl+B` | State preserved |
| KEY-EC-019 | `rapid z presses toggle correctly` | `z`, `z`, `z` | collapse→expand→collapse |
| KEY-EC-020 | `Z then x is full expand` | `Z`, `x` | All expanded |
| KEY-EC-021 | `x when all expanded is no-op` | `x` | No change |
| KEY-EC-022 | `Z when all collapsed is no-op` | `Z`, `Z` | No change |
| KEY-EC-023 | `Ctrl+z does not trigger` | `Ctrl+z` | No change |
| KEY-EC-024 | `scroll treats collapsed as 1 line` | `z`, `j` | Scrolls past summary |
| KEY-EC-025 | `page jump accounts for collapsed` | `z`, `Ctrl+D` | Correct page distance |
| KEY-EC-026 | `G accounts for collapsed hunks` | `z`, `G` | Correct bottom position |

### Responsive behavior tests (8 tests)

| Test ID | Test name | Terminal size | Expected behavior |
|---------|-----------|--------------|-------------------|
| RSP-EC-001 | `abbreviated at 80x24` | 80×24 | `▶ ⋯ N hidden` |
| RSP-EC-002 | `full format at 120x40` | 120×40 | `▶ ⋯ N lines hidden (lines X–Y)` |
| RSP-EC-003 | `full format at 200x60` | 200×60 | Full format, wider border |
| RSP-EC-004 | `resize 120→80 abbreviates` | 120→80 | Summary abbreviates |
| RSP-EC-005 | `resize 80→120 expands` | 80→120 | Summary expands |
| RSP-EC-006 | `resize preserves state` | 120→80→120 | State unchanged |
| RSP-EC-007 | `resize adjusts border width` | 120→200 | Border extends |
| RSP-EC-008 | `status bar hint updates` | 120→80 | `x/z:hunks` → `x/z` |

### Integration tests (6 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| INT-EC-001 | `change diff hunk boundaries tracked` | 3 hunks with correct line counts |
| INT-EC-002 | `landing diff hunk boundaries tracked` | 5 hunks across 2 files |
| INT-EC-003 | `collapse state clears on whitespace re-fetch` | New diff data = all expanded |
| INT-EC-004 | `collapse state independent across files` | Per-file tracking verified |
| INT-EC-005 | `binary file skipped in collapse` | Z only collapses text files |
| INT-EC-006 | `collapse state clears on remount` | q then reopen = all expanded |

### Edge case tests (12 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| EDGE-EC-001 | `z on 0-file diff` | No crash, no-op |
| EDGE-EC-002 | `z on 0-hunk file` | No crash, no-op |
| EDGE-EC-003 | `single-line hunk collapse` | Singular "1 line hidden" |
| EDGE-EC-004 | `collapse last hunk then G` | Cursor on summary |
| EDGE-EC-005 | `Z then ] preserves file 1` | Independent per-file |
| EDGE-EC-006 | `state after unified→split→unified` | Preserved |
| EDGE-EC-007 | `1000+ line hunk full number` | No abbreviation |
| EDGE-EC-008 | `cursor between hunks` | Collapses nearest above |
| EDGE-EC-009 | `Z then x restores all` | All expanded |
| EDGE-EC-010 | `X across 5 files` | Global expand |
| EDGE-EC-011 | `collapse at exactly 120 cols split` | Renders correctly |
| EDGE-EC-012 | `no-color terminal` | Fallback to --- border |
