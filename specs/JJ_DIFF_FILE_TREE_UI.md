# JJ_DIFF_FILE_TREE_UI

Specification for JJ_DIFF_FILE_TREE_UI.

## High-Level User POV

## User POV

When you open the diff for a jj change or a landing request in Codeplane, the first thing you see alongside the rendered diff is a file tree sidebar — a compact, navigable inventory of every file touched by the change. Instead of scrolling blindly through dozens or hundreds of file diffs, you can immediately see the full scope of the change at a glance: which files were added, which were modified, which were deleted, renamed, or copied. Each file entry is color-coded by its change type — green for added, red for deleted, yellow for modified, cyan for renamed or copied — and annotated with a short stat summary showing lines added and removed.

The sidebar appears on the left side of the diff viewer, occupying roughly a quarter of the available width. You can click or select any file to instantly scroll the main diff content area to that file's section. As you navigate through the diff with keyboard shortcuts (bracket keys to jump between files), the sidebar cursor follows along, always highlighting which file you're currently viewing. This makes it trivially easy to orient yourself in large diffs — you always know where you are and what's left to review.

The sidebar includes a quick search filter. Press `/` (or click the search icon in the web UI) to type a case-insensitive substring, and the tree instantly narrows to only files matching your query. This is invaluable when a change touches 50 or 100 files and you need to find a specific one. A summary line at the top shows the total file count and aggregate addition/deletion stats, updating dynamically when a filter is active to show "N of M files".

On narrower screens or terminals, the sidebar hides automatically to give the diff content maximum space, but you can always toggle it back with `Ctrl+B` (TUI) or a toggle button (web). If you manually hide the sidebar, it stays hidden even if you resize to a wider viewport — your preference is respected. The sidebar never obscures the diff; it coexists as a proper panel that the diff content reflows around.

The file tree sidebar appears in every diff context across Codeplane: the change detail diff tab in the web UI, the TUI diff screen, and the landing request diff view. It uses the same data and the same interaction model everywhere. Whether you're reviewing a colleague's landing request in the browser, scanning your own change in the terminal, or inspecting a diff from a VS Code webview, the file tree sidebar gives you the same navigational superpower.

For binary files, the sidebar shows a `[bin]` suffix instead of line stats. For renamed files, it shows both the old and new paths with an arrow. For diffs that touch more than 500 files, it renders the first 500 with a clear truncation indicator so you know the list is incomplete. An empty change (zero files) shows a clear "(No files changed)" placeholder instead of an empty void.

## Acceptance Criteria

## Acceptance Criteria

### Definition of Done

- [ ] The diff file tree sidebar renders in the web UI change detail diff tab, populated from the `FileDiffItem[]` array returned by the change diff API
- [ ] The diff file tree sidebar renders in the web UI landing request diff view, populated from the landing diff API
- [ ] The diff file tree sidebar renders in the TUI diff screen, populated from `useChangeDiff()` or `useLandingDiff()` hooks
- [ ] Each file entry displays: a change type indicator icon (`A`/`D`/`M`/`R`/`C`), the file path, and a stat summary (`+N -M`)
- [ ] Change type indicators use correct colors: `A` = green, `D` = red, `M` = yellow, `R` = cyan, `C` = cyan
- [ ] Stat summaries color additions in green and deletions in red
- [ ] The currently-viewed file is visually highlighted in the sidebar (reverse-video in TUI, active background color in web)
- [ ] Clicking/selecting a file in the sidebar scrolls the main diff content area to that file's section
- [ ] Keyboard file navigation (`]`/`[` in TUI, keyboard shortcuts in web) synchronizes the sidebar cursor to match the currently-viewed file
- [ ] The sidebar includes a summary line showing total file count and aggregate stats (e.g., "12 files +340 -87")
- [ ] The sidebar includes a search/filter capability: case-insensitive substring match over file paths
- [ ] The sidebar can be toggled visible/hidden by the user
- [ ] The sidebar visibility respects responsive breakpoints (hidden below threshold, visible above)
- [ ] Manual visibility toggle state takes precedence over automatic responsive behavior
- [ ] Binary files display a `[bin]` suffix in place of line stats
- [ ] Renamed files display both old and new paths (e.g., `old/path.ts → new/path.ts`)
- [ ] Copied files display both source and destination paths
- [ ] Permission-only changes display a `[mode]` suffix
- [ ] An empty diff (zero files) shows a "(No files changed)" placeholder in the sidebar
- [ ] Diffs with more than 500 files render the first 500 entries with a truncation indicator (e.g., "…and 42 more files")
- [ ] All existing diff viewer functionality (unified/split view, syntax highlighting, hunk collapse, whitespace toggle) continues to work correctly with the sidebar present

### Input Validation & Boundary Constraints

- [ ] File paths in the sidebar are sourced exclusively from the API response — no user-editable path input exists
- [ ] Search filter input is capped at 128 characters; additional characters are silently dropped
- [ ] Search filter input is treated as a literal substring — no regex, glob, or shell metacharacter evaluation
- [ ] File paths longer than the sidebar width are truncated from the left with an ellipsis prefix (`…/deeply/nested/file.ts`)
- [ ] File paths containing unicode characters render correctly
- [ ] File paths containing spaces render correctly
- [ ] File paths containing special characters (parentheses, brackets, ampersands) render correctly without breaking the layout
- [ ] The maximum displayable file count is 500; entries beyond 500 are elided with a count indicator
- [ ] A single file entry never exceeds 1 row in the sidebar (no wrapping)
- [ ] Stat numbers that exceed 9,999 are displayed as `+10k` or `-10k` (abbreviated) in the web UI, or truncated to fit in the TUI

### Edge Cases

- [ ] Empty diff: sidebar shows "(No files changed)" in muted styling; no entries rendered; j/k are no-ops
- [ ] Single-file diff: sidebar shows one entry; j/k navigate within content not between entries; `]`/`[` are no-ops
- [ ] 500-file diff: all 500 entries render without performance degradation; scrolling is smooth
- [ ] 501-file diff: first 500 render normally; a truncation indicator appears at the bottom showing count of omitted files
- [ ] File with 0 additions and 0 deletions (e.g., permission change): stat shows `+0 -0` or `[mode]` suffix
- [ ] File entry with the same basename appearing in different directories (e.g., `src/index.ts` and `tests/index.ts`): both are listed with enough path context to distinguish them
- [ ] Renamed file where old and new paths are identical except for directory: displays `old/dir → new/dir` clearly
- [ ] Search filter matching zero files: sidebar shows "No matches" in muted styling; Enter is a no-op
- [ ] Search filter matching exactly one file: that file is auto-focused
- [ ] Rapid keyboard navigation (holding `j` or `k`): entries highlight sequentially without visual glitching or skipping
- [ ] Resizing the viewport across the responsive breakpoint while the sidebar is visible: sidebar hides/shows smoothly without losing scroll position or focus
- [ ] Resizing the viewport while a search filter is active: filter is preserved; results re-render at new width
- [ ] Toggling whitespace mode while the sidebar is visible: sidebar re-populates from the new API response; file list may change; cursor resets to first file
- [ ] Opening sidebar toggle during an active inline comment form (landing request diff): sidebar opens without disrupting the comment form
- [ ] File tree entry for a file whose diff failed to parse: entry is still listed (from file list) but may show no stats; clicking still scrolls to the file header

## Design

## Design

### Web UI Design

#### Layout

The diff file tree sidebar is rendered as the left panel of a two-column layout within the diff tab of the change detail page (`/:owner/:repo/changes/:changeId`, Diff tab) and the landing request diff view (`/:owner/:repo/landings/:id`, Diff tab).

**Panel structure:**
- **Sidebar panel** (left): 25% width, min 200px, max 400px, with a 1px right border. Contains: summary header, optional search input, scrollable file list.
- **Main diff content panel** (right): remaining width (`flex-grow: 1`). Contains the rendered unified or split diff.
- **Toggle button**: A small icon button at the top-left of the main panel (or integrated into the diff toolbar) that toggles sidebar visibility. Tooltip: "Toggle file tree (Ctrl+B)".

**Responsive behavior:**
- Below 768px viewport width: sidebar hidden by default; toggle button visible.
- 768px–1199px: sidebar visible at 30% width (min 180px); can be toggled off.
- 1200px and above: sidebar visible at 25% width; can be toggled off.
- Manual toggle state persists across viewport changes within the session (stored in component state). If the user explicitly hides the sidebar, resizing to a wider viewport does not re-show it. If the user explicitly shows the sidebar, resizing to a narrower viewport does not hide it unless the viewport drops below 480px (at which point it force-hides to prevent layout breakage).

#### Sidebar Content

**Summary header (sticky, top of sidebar):**
- Text: `N files  +X -Y` where N is file count, X is total additions (green), Y is total deletions (red).
- When a search filter is active: `N of M files  +X -Y` reflecting the filtered subset.
- Font: monospace, smaller than body text.

**Search input (below summary, collapsible):**
- Activated by clicking a search icon in the summary bar or pressing `/` when the sidebar has focus.
- Placeholder text: "Filter files…".
- Renders as a compact text input with a clear (×) button.
- Case-insensitive substring match against file paths.
- Filters the file list in real-time as the user types (debounced at 50ms).
- Maximum 128 characters.
- Pressing `Escape` clears the filter and collapses the search input.
- Pressing `Enter` focuses the first matching file entry.

**File list (scrollable area):**
- Each entry is a single row containing:
  - **Change type icon**: A colored letter/icon — `A` (green), `D` (red), `M` (yellow), `R` (cyan), `C` (cyan). Rendered as a small badge or monospace character.
  - **File path**: Display the filename and enough parent directory context to avoid ambiguity. For paths that exceed the available width, truncate from the left with `…/`. If the file is renamed, show `old_path → path`. If copied, show `source → destination`.
  - **Stat summary**: `+N -M` with additions in green and deletions in red. For binary files, show `[bin]` in a muted color. For permission-only changes, show `[mode]`.
- The entry for the currently-viewed file in the main diff area has an active/selected background (e.g., a subtle blue or primary-color tint).
- Hover state: slightly lighter background tint.
- Click: scrolls the main diff area to the clicked file's section header using smooth scrolling. Updates the active file highlight.

**Truncation indicator (bottom of list, conditional):**
- Visible only when the diff contains more than 500 files.
- Text: `…and N more files` in muted styling.
- Not interactive.

**Empty state:**
- When `file_diffs` is empty: the sidebar body shows `(No files changed)` centered in muted text.

**Keyboard shortcuts (when sidebar or diff area has focus):**
| Key | Action |
|-----|--------|
| `Ctrl+B` | Toggle sidebar visibility |
| `/` | Open search filter (when sidebar is focused) |
| `Escape` | Clear search filter / close search |
| `↑`/`↓` or `j`/`k` | Navigate file entries (when sidebar has focus) |
| `Enter` | Select file and scroll main content to it; transfer focus to main content |
| `]`/`[` | Next/previous file (works from main content; syncs sidebar cursor) |

#### Accessibility

- The file list uses `role="listbox"` with individual entries as `role="option"`.
- Active file has `aria-selected="true"`.
- The search input has `aria-label="Filter changed files"`.
- The sidebar toggle button has `aria-expanded` reflecting current state.
- Color-coded change types also have text labels (the letter itself: A/D/M/R/C) so color is not the sole indicator.
- Focus is trapped within the sidebar when Tab-navigating sidebar-internal elements.

### TUI Design

#### Layout

The TUI diff screen uses a two-pane layout:
- **File tree sidebar** (left): Conditionally rendered. Width = 25% of terminal width at ≥120 columns, 30% when toggled on at 80–119 columns (minimum 24 columns). Separated from main content by a single-line vertical border.
- **Main diff content** (right): `flexGrow=1`, fills remaining width.

**Responsive breakpoints:**
| Terminal Width | Sidebar Default | Sidebar Width |
|----------------|-----------------|---------------|
| 80–119 cols | Hidden | 30% (min 24 cols) when toggled on |
| 120–199 cols | Visible | 25% |
| 200+ cols | Visible | 25% with extra internal padding |

At any width, `Ctrl+B` toggles visibility. A `sidebarManuallyToggled` flag tracks user intent, overriding responsive defaults. Resize events respect this flag: if the user hid the sidebar at 120 cols, it stays hidden at 200 cols. If the user showed it at 80 cols, it stays shown unless the terminal width drops below 60 cols (force-hide).

#### File Entry Rendering

Each entry occupies exactly 1 row:
```
M src/auth/token.ts                    +15 -3
```

- Column 1 (1 char): change type letter with ANSI color — `A`=green(34), `D`=red(196), `M`=yellow(178), `R`=cyan(37), `C`=cyan(37)
- Column 2 (1 char): space
- Column 3 (fill): file path in default text color. Truncated from left with `…/` if it exceeds available width. Renames show `old → new`.
- Column 4 (right-aligned, ~10 chars): stat summary. `+N` in green, space, `-M` in red. Binary files show `[bin]` in muted (ANSI 245). Permission changes show `[mode]` in muted.

Focused entry: rendered with inverse video (swap foreground/background).

#### Summary Line

First row of the sidebar (non-scrollable):
```
12 files  +340 -87
```
When filtered:
```
3 of 12 files  +45 -12
```
Abbreviated at <120 cols:
```
12f +340 -87
```

#### Search Mode

Activated by pressing `/` when the focus zone is `tree`:
- A 1-row text input appears between the summary line and the file list, bordered by a horizontal rule.
- Real-time case-insensitive substring filtering.
- Max 128 characters.
- `Escape` clears the filter text and exits search mode.
- `Enter` selects the first matching entry and transfers focus to `content` zone.
- If no files match, the file list shows `(No matches)` in muted text.

#### Focus Model

The diff screen has two focus zones: `tree` and `content`.
- `Tab` / `Shift+Tab` toggles between zones.
- When `tree` is focused: `j`/`k`/`↑`/`↓` navigate file entries; `Enter` selects and transfers to `content`.
- When `content` is focused: `j`/`k` scroll diff; `]`/`[` navigate files (syncing tree cursor).
- `Shift+Tab` when sidebar is hidden is a no-op (cannot focus hidden zone).
- Selecting a file via `Enter` or `]`/`[` always clears any active search filter.

#### State

| State Variable | Type | Description |
|----------------|------|-------------|
| `focusedFileIndex` | `number` | Currently highlighted file in the tree (0-indexed) |
| `focusZone` | `"tree" \| "content"` | Which pane has keyboard focus |
| `sidebarVisible` | `boolean` | Whether the sidebar is currently rendered |
| `sidebarManuallyToggled` | `boolean` | Whether the user has explicitly toggled the sidebar |
| `searchActive` | `boolean` | Whether the search input is visible |
| `searchQuery` | `string` | Current search filter text |
| `scrollOffset` | `number` | Scroll position within the file list |

### Documentation

The following end-user documentation should be written:

1. **"Navigating Diffs with the File Tree"** — A guide section within the diff viewer documentation explaining how to use the file tree sidebar. Covers: what the sidebar shows, how to navigate files, how to use the search filter, how to toggle visibility, and how the sidebar synchronizes with keyboard navigation in the main diff area. Includes annotated screenshots for web and TUI.

2. **"Keyboard Shortcuts: Diff Viewer"** — An updated keyboard shortcuts reference table that includes all sidebar-related shortcuts (`Ctrl+B`, `/`, `Escape`, `Enter` for file selection, `Tab`/`Shift+Tab` for focus switching).

3. **"Responsive Layout"** — A note in the layout/responsive documentation explaining the sidebar's responsive behavior: when it auto-hides, when it auto-shows, and how manual toggle overrides automatic behavior.

## Permissions & Security

## Permissions & Security

### Authorization

The diff file tree sidebar is a **read-only, client-side UI component**. It does not make any API calls beyond what the diff viewer already makes. The file list is derived entirely from the `file_diffs` array in the diff API response. Therefore, permissions are inherited from the underlying diff endpoint:

| Role | View Diff File Tree (Public Repo) | View Diff File Tree (Private Repo) |
|------|----------------------------------|-----------------------------------|
| Owner | ✅ | ✅ |
| Admin | ✅ | ✅ |
| Member | ✅ | ✅ |
| Read-Only | ✅ | ✅ |
| Anonymous | ✅ | ❌ (repo returns 404) |

No additional authorization check is required for the sidebar itself. If the user can view the diff, they can see the file tree.

### Rate Limiting

The file tree sidebar does not introduce any new API calls. All data comes from the existing change diff or landing diff endpoints, which are already rate-limited:
- **Authenticated users**: 300 requests/minute for change diff
- **Anonymous users**: 60 requests/minute for change diff

Sidebar interactions (navigation, search filtering, toggle) are entirely client-side and impose zero server load.

The search filter is evaluated client-side against the already-fetched `file_diffs` array. No search queries are sent to the server. This eliminates any search-based abuse vector.

### Data Privacy

- File paths displayed in the sidebar reflect repository source code structure. These are already visible in the diff content itself — the sidebar does not expose any additional information.
- The search filter input is processed locally and never transmitted to the server.
- Sidebar visibility state and search query are stored in component-local state (not persisted to local storage or cookies) and are cleared on page navigation.
- No file path data from the sidebar is included in telemetry events (see Telemetry section — events track indices and counts, not file paths).
- The sidebar does not cache file paths beyond the lifetime of the diff view component.

## Telemetry & Product Analytics

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `DiffFileTreeViewed` | Diff viewer rendered with the sidebar visible (either by default or user toggle) | `source` (web/tui), `repo_owner`, `repo_name`, `file_count`, `terminal_width` (TUI only), `viewport_width` (web only), `responsive_breakpoint` (narrow/standard/wide), `sidebar_visible_by_default` (boolean) |
| `DiffFileTreeFileSelected` | User clicks/selects a file entry in the sidebar | `source`, `file_index`, `total_files`, `selection_method` (click/enter/search_enter), `change_type` (A/D/M/R/C), `had_active_search` (boolean) |
| `DiffFileTreeFileSynced` | Sidebar cursor updates in response to `]`/`[` navigation in the main diff content | `source`, `direction` (next/prev), `from_index`, `to_index`, `total_files` |
| `DiffFileTreeSearchOpened` | User activates the search filter | `source`, `file_count` |
| `DiffFileTreeSearchCompleted` | User resolves the search (selects a match, clears, or escapes) | `source`, `query_length`, `match_count`, `total_files`, `outcome` (selected/cleared/escaped) |
| `DiffFileTreeToggled` | User toggles sidebar visibility | `source`, `new_state` (visible/hidden), `trigger` (manual/keyboard), `viewport_width` (web) or `terminal_width` (TUI) |
| `DiffFileTreeAutoHidden` | Sidebar auto-hidden due to viewport/terminal resize below threshold | `source`, `old_width`, `new_width` |
| `DiffFileTreeFocusChanged` | Focus zone changes between tree and content (TUI only) | `new_focus_zone` (tree/content), `method` (tab/shift_tab/enter) |

### Event Properties (Common)

All events include:
- `session_id`: unique session identifier
- `timestamp`: ISO 8601
- `user_id`: authenticated user ID (if available)
- `client_version`: Codeplane client version string

### Funnel Metrics & Success Indicators

- **Sidebar interaction rate**: % of diff views where the user interacts with the file tree (click, navigate, search, or toggle). Target: >40% for diffs with ≥3 files.
- **File selection rate**: % of diff views where the user selects at least one file from the sidebar. Target: >25%.
- **Search usage rate**: % of diff views with ≥5 files where the user opens the search filter. Target: >10%.
- **Sidebar toggle rate at narrow viewport**: % of narrow-viewport diff views where the user manually opens the hidden sidebar. Target: >30% (indicates demand at narrow widths).
- **Sync accuracy**: % of `]`/`[` navigations where the sidebar cursor correctly tracks the content position. Target: 100%.
- **Render performance**: Sidebar renders within 50ms of diff data arriving. File filter applies within 16ms of keystroke. Navigation processes at 60 entries/second throughput.

## Observability

## Observability

### Logging Requirements

Since the diff file tree sidebar is a **client-side component**, logging is primarily relevant in the TUI (which logs to stderr) and secondarily in the web UI (which logs to the browser console). No new server-side logging is introduced.

#### TUI Logging (stderr, level controlled by `CODEPLANE_LOG_LEVEL`, default `warn`)

| Log Point | Level | Structured Context |
|-----------|-------|--------------------|  
| File tree sidebar rendered | `info` | `repo`, `source` (change/landing), `file_count`, `sidebar_visible`, `terminal_width` |
| File selected from tree | `info` | `path`, `index`, `change_type`, `selection_method` |
| Search filter activated | `info` | `file_count` |
| Search filter applied | `debug` | `query_length`, `match_count`, `filter_time_ms` |
| Search filter completed | `info` | `outcome` (selected/cleared/escaped), `match_count` |
| Sidebar toggled | `debug` | `new_state`, `trigger` (manual/resize), `terminal_width` |
| Tree cursor synced via `]`/`[` | `debug` | `direction`, `from_index`, `to_index` |
| Resize layout recalculation | `debug` | `old_width`, `new_width`, `sidebar_now_visible` |
| Scroll position updated | `debug` | `scroll_offset`, `visible_range` |
| Cursor moved | `debug` | `from_index`, `to_index`, `key` |

#### Web UI Logging (browser console, level controlled by app debug flag)

| Log Point | Level | Context |
|-----------|-------|---------|
| File tree sidebar mounted | `debug` | `fileCount`, `viewportWidth`, `sidebarVisible` |
| File selected | `debug` | `index`, `path`, `changeType` |
| Search filter applied | `debug` | `queryLength`, `matchCount`, `filterTimeMs` |
| Sidebar toggle | `debug` | `newState`, `viewportWidth` |

### Prometheus Metrics

No new Prometheus (server-side) metrics are introduced for this feature. The sidebar is entirely client-side. The underlying diff API endpoint already has comprehensive metrics (`codeplane_change_diff_requests_total`, `codeplane_change_diff_duration_seconds`, `codeplane_change_diff_file_count`).

If client-side performance telemetry is collected via a metrics aggregation layer, the following client-side gauges/histograms are recommended:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_ui_diff_file_tree_render_ms` | Histogram | `client` (web/tui), `file_count_bucket` | Time to render the file tree from data arrival |
| `codeplane_ui_diff_file_tree_filter_ms` | Histogram | `client` | Time to apply a search filter keystroke |
| `codeplane_ui_diff_file_tree_files_displayed` | Gauge | `client` | Number of file entries currently displayed (after filtering) |

### Alerts

Since this is a client-side feature, traditional server-side alerts do not apply. However, the following product-health alerts should be configured based on telemetry event rates:

#### `DiffFileTreeInteractionDrop`
- **Condition**: Rolling 24h `DiffFileTreeViewed` event count drops by >50% compared to the previous 24h period, while `ChangeDiffViewed` event count remains stable.
- **Severity**: Warning
- **Runbook**:
  1. Check for recent client-side deployments that may have broken the sidebar rendering.
  2. Verify the feature flag for `JJ_DIFF_FILE_TREE_UI` is still enabled in the feature flag service.
  3. Check browser console error reports or TUI crash logs for rendering exceptions in the file tree component.
  4. If a specific client (web or TUI) shows the drop, investigate the latest release for that client.
  5. Check if the diff API response shape changed (e.g., `file_diffs` field renamed or missing) — this would silently break the sidebar.

#### `DiffFileTreeSyncFailure`
- **Condition**: `DiffFileTreeFileSynced` events have `from_index === to_index` for more than 20% of events in a 1h window (indicating the cursor is not actually moving when `]`/`[` is pressed).
- **Severity**: Warning
- **Runbook**:
  1. This indicates a synchronization bug between the main diff content scroll position and the sidebar cursor.
  2. Check recent code changes to the diff navigation handler or the file tree state management.
  3. Reproduce by opening a multi-file diff and pressing `]` repeatedly — verify the sidebar cursor advances.
  4. Check if a race condition exists between scroll animation completion and cursor update.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Diff API returns 0 `file_diffs` unexpectedly | Sidebar shows "(No files changed)" for a non-empty diff | Confusing UX but non-blocking | Log warning if API `file_diffs` is empty but diff content area has renderable patch content; show `R` to retry in TUI |
| Diff API returns >500 files | Sidebar renders first 500 + truncation indicator | User cannot navigate to files beyond 500 from sidebar | Log `warn` with total file count; user can still scroll main content manually |
| Malformed `file_diffs` entry (missing `path` field) | Skip the entry | One file missing from sidebar | Log `warn` with entry index; do not crash the sidebar |
| Unknown `change_type` value | Render `?` icon in muted color | Cosmetic degradation | Log `warn` with the unknown change_type value |
| Search filter performance degradation (>100ms for 500 files) | Noticeable input lag | Sluggish typing experience | Debounce at 50ms; ensure filter uses simple `includes()` not regex; log `debug` with filter_time_ms |
| React/Solid error in sidebar component | Error boundary isolates sidebar crash from main diff content | Sidebar disappears but diff remains usable | Error boundary renders "File tree unavailable" with option to retry; log `error` with stack trace |
| Sidebar rendered but diff content area has not loaded yet | Sidebar shows files but clicking does nothing (no scroll target) | Confusing click with no effect | Disable file entry clicks until diff content has mounted; show loading indicator in main area |
| Focus zone state becomes inconsistent (TUI) | Keyboard inputs go to wrong pane | Navigation broken | `Tab` always resets to the other zone deterministically; error boundary resets focus state |

## Verification

## Verification

### Web UI E2E Tests (Playwright)

| Test ID | Description |
|---------|-------------|
| `WEB-FTREE-001` | Navigate to `/:owner/:repo/changes/:changeId` Diff tab — sidebar renders with correct file count matching API response |
| `WEB-FTREE-002` | Each file entry in the sidebar displays a change type indicator letter (A/D/M/R/C) |
| `WEB-FTREE-003` | Change type indicators have correct colors: A=green, D=red, M=yellow, R=cyan, C=cyan |
| `WEB-FTREE-004` | Each file entry displays the file path and stat summary (+N -M) |
| `WEB-FTREE-005` | Stat additions are displayed in green; deletions in red |
| `WEB-FTREE-006` | Binary file entries show `[bin]` suffix instead of line stats |
| `WEB-FTREE-007` | Renamed file entries show `old_path → new_path` |
| `WEB-FTREE-008` | Summary line at top shows total file count and aggregate stats |
| `WEB-FTREE-009` | Clicking a file entry scrolls the main diff content to that file's section |
| `WEB-FTREE-010` | The clicked file entry becomes visually highlighted (active state) |
| `WEB-FTREE-011` | Scrolling through the main diff content with `]`/`[` updates the sidebar highlight to match |
| `WEB-FTREE-012` | Toggle button hides the sidebar; pressing again restores it |
| `WEB-FTREE-013` | `Ctrl+B` keyboard shortcut toggles the sidebar |
| `WEB-FTREE-014` | Sidebar is hidden by default when viewport width is below 768px |
| `WEB-FTREE-015` | Sidebar is visible by default when viewport width is 1200px or above |
| `WEB-FTREE-016` | Manual hide at wide viewport persists when resizing wider |
| `WEB-FTREE-017` | Manual show at narrow viewport persists when resizing narrower (until force-hide at 480px) |
| `WEB-FTREE-018` | Clicking the search icon or pressing `/` opens the search filter input |
| `WEB-FTREE-019` | Typing in the search filter narrows the file list to matching entries |
| `WEB-FTREE-020` | Search is case-insensitive |
| `WEB-FTREE-021` | Pressing `Escape` clears the search filter and restores the full file list |
| `WEB-FTREE-022` | Pressing `Enter` in the search input selects the first matching file and scrolls to it |
| `WEB-FTREE-023` | Search filter matching zero files shows "No matches" |
| `WEB-FTREE-024` | Summary line updates to show "N of M files" while filter is active |
| `WEB-FTREE-025` | Empty diff (0 files) shows "(No files changed)" in the sidebar |
| `WEB-FTREE-026` | Diff with exactly 500 files renders all entries (maximum valid count) |
| `WEB-FTREE-027` | Diff with 501+ files renders 500 entries plus truncation indicator |
| `WEB-FTREE-028` | Truncation indicator shows correct count of omitted files |
| `WEB-FTREE-029` | Long file paths are truncated with `…/` prefix without overflowing |
| `WEB-FTREE-030` | File paths with unicode characters render correctly |
| `WEB-FTREE-031` | File paths with spaces render correctly |
| `WEB-FTREE-032` | Sidebar in landing request diff view works identically to change diff view |
| `WEB-FTREE-033` | Switching from unified to split diff view does not break the sidebar |
| `WEB-FTREE-034` | Toggling whitespace mode re-populates the sidebar with updated file list |
| `WEB-FTREE-035` | Sidebar toggle during active hunk collapse state does not reset collapse state |
| `WEB-FTREE-036` | Search input enforces 128-character maximum (additional characters are silently dropped) |
| `WEB-FTREE-037` | Sidebar accessibility: `role="listbox"` is present on file list |
| `WEB-FTREE-038` | Sidebar accessibility: active file has `aria-selected="true"` |
| `WEB-FTREE-039` | Sidebar accessibility: toggle button has correct `aria-expanded` state |
| `WEB-FTREE-040` | Sidebar scroll position resets to top when navigating to a different change |

### TUI E2E Tests (@microsoft/tui-test)

#### Snapshot Tests

| Test ID | Description |
|---------|-------------|
| `SNAP-FTREE-001` | Sidebar renders correctly at 120×40 with 5-file diff |
| `SNAP-FTREE-002` | Sidebar renders correctly at 200×60 with full-width paths |
| `SNAP-FTREE-003` | Sidebar hidden at 80×24 (only main content visible) |
| `SNAP-FTREE-004` | Sidebar toggled on at 80×24 via Ctrl+B |
| `SNAP-FTREE-005` | File paths truncated with `…/` for long paths at 120×40 |
| `SNAP-FTREE-006` | Renamed file entry shows `old → new` format |
| `SNAP-FTREE-007` | Binary file entry shows `[bin]` suffix |
| `SNAP-FTREE-008` | Empty diff shows "(No files changed)" |
| `SNAP-FTREE-009` | Search mode active with filter input visible |
| `SNAP-FTREE-010` | Search with no matches shows "(No matches)" |
| `SNAP-FTREE-011` | Focused entry rendered with reverse video |
| `SNAP-FTREE-012` | Status bar shows "File N of M" |
| `SNAP-FTREE-013` | Summary line shows file count and aggregate stats |
| `SNAP-FTREE-014` | Abbreviated summary at <120 cols |
| `SNAP-FTREE-015` | 500+ files with truncation indicator |
| `SNAP-FTREE-016` | Permission-only file shows `[mode]` suffix |
| `SNAP-FTREE-017` | Sidebar after hide then re-show preserves scroll position |
| `SNAP-FTREE-018` | Filtered summary shows "N of M files" |

#### Keyboard Interaction Tests

| Test ID | Description |
|---------|-------------|
| `KEY-FTREE-001` | `j` moves cursor down one entry |
| `KEY-FTREE-002` | `k` moves cursor up one entry |
| `KEY-FTREE-003` | `↓` moves cursor down one entry |
| `KEY-FTREE-004` | `↑` moves cursor up one entry |
| `KEY-FTREE-005` | `j` at last entry is a no-op (does not wrap) |
| `KEY-FTREE-006` | `k` at first entry is a no-op (does not wrap) |
| `KEY-FTREE-007` | `Enter` selects focused file and scrolls main content to it |
| `KEY-FTREE-008` | `Enter` transfers focus from tree to content zone |
| `KEY-FTREE-009` | `G` jumps cursor to last file entry |
| `KEY-FTREE-010` | `gg` jumps cursor to first file entry |
| `KEY-FTREE-011` | `Ctrl+D` pages down through file entries |
| `KEY-FTREE-012` | `Ctrl+U` pages up through file entries |
| `KEY-FTREE-013` | `/` activates search mode |
| `KEY-FTREE-014` | Typing in search mode filters the file list incrementally |
| `KEY-FTREE-015` | Search is case-insensitive |
| `KEY-FTREE-016` | `Escape` in search mode clears filter and exits search |
| `KEY-FTREE-017` | `Enter` in search mode selects first match and transfers focus |
| `KEY-FTREE-018` | `Ctrl+B` toggles sidebar visibility |
| `KEY-FTREE-019` | `Tab` switches focus from tree to content |
| `KEY-FTREE-020` | `Shift+Tab` switches focus from content to tree |
| `KEY-FTREE-021` | `Shift+Tab` when sidebar is hidden is a no-op |
| `KEY-FTREE-022` | `]` in content zone syncs tree cursor to next file |
| `KEY-FTREE-023` | `[` in content zone syncs tree cursor to previous file |
| `KEY-FTREE-024` | `]` from last file wraps to first file (cyclic navigation) |
| `KEY-FTREE-025` | `[` from first file wraps to last file (cyclic navigation) |
| `KEY-FTREE-026` | `]` clears any active search filter before navigating |
| `KEY-FTREE-027` | Rapid `j` keypresses process sequentially without skipping entries |
| `KEY-FTREE-028` | Single-file diff: `j`/`k` in tree are no-ops |
| `KEY-FTREE-029` | `q` pops the diff screen |
| `KEY-FTREE-030` | `?` shows help overlay including sidebar shortcuts |
| `KEY-FTREE-031` | Search input truncates at 128 characters |
| `KEY-FTREE-032` | `Enter` in search mode with zero matches is a no-op |

#### Responsive Tests

| Test ID | Description |
|---------|-------------|
| `RSP-FTREE-001` | Sidebar hidden by default at 80×24 |
| `RSP-FTREE-002` | Sidebar visible by default at 120×40 |
| `RSP-FTREE-003` | Sidebar visible by default at 200×60 |
| `RSP-FTREE-004` | Sidebar width is 25% at 120×40 |
| `RSP-FTREE-005` | Sidebar width is 30% when toggled on at 80×24 |
| `RSP-FTREE-006` | Resize from 120 to 80 auto-hides sidebar (when not manually toggled) |
| `RSP-FTREE-007` | Resize from 80 to 120 auto-shows sidebar (when not manually toggled) |
| `RSP-FTREE-008` | Resize from 120 to 80 does NOT hide sidebar if user manually showed it |
| `RSP-FTREE-009` | Resize from 80 to 120 does NOT show sidebar if user manually hid it |
| `RSP-FTREE-010` | Focus transfers to content when sidebar auto-hides and tree had focus |
| `RSP-FTREE-011` | Search filter preserved across resize |
| `RSP-FTREE-012` | Force-hide below 60 cols regardless of manual toggle state |

#### Integration Tests

| Test ID | Description |
|---------|-------------|
| `INT-FTREE-001` | File tree correctly populated from change diff API response |
| `INT-FTREE-002` | File tree correctly populated from landing request diff API response |
| `INT-FTREE-003` | Whitespace toggle re-fetches diff and re-populates tree (file count may change) |
| `INT-FTREE-004` | Tree-to-content scroll sync: selecting file in tree scrolls content to correct position |
| `INT-FTREE-005` | Content-to-tree cursor sync: `]`/`[` updates tree cursor correctly |
| `INT-FTREE-006` | Mixed navigation: alternating between tree selection and `]`/`[` keeps both in sync |
| `INT-FTREE-007` | Loading state: tree shows loading spinner while diff API is in flight |
| `INT-FTREE-008` | Error state: tree shows error message when diff API fails; `R` retries |
| `INT-FTREE-009` | 401 response propagates to auth error screen |
| `INT-FTREE-010` | Deep link to diff screen with file tree opens correctly |
| `INT-FTREE-011` | Back navigation (pop screen) preserves tree state when returning to diff |
| `INT-FTREE-012` | Sidebar toggle during inline comment form (landing request) does not disrupt the form |

#### Edge Case Tests

| Test ID | Description |
|---------|-------------|
| `EDGE-FTREE-001` | 500-file diff renders all entries without crash or excessive memory usage |
| `EDGE-FTREE-002` | 501-file diff renders 500 entries + truncation indicator |
| `EDGE-FTREE-003` | File with 10,000+ line stats renders abbreviated stat (e.g., `+10k`) |
| `EDGE-FTREE-004` | File path at exactly 4096 characters truncates correctly |
| `EDGE-FTREE-005` | File path with unicode characters renders without corruption |
| `EDGE-FTREE-006` | Diff where all files are binary: every entry shows `[bin]` |
| `EDGE-FTREE-007` | Diff where all files are renamed: every entry shows `old → new` |
| `EDGE-FTREE-008` | Two files with identical basenames in different directories both display correctly |
| `EDGE-FTREE-009` | Error boundary isolates sidebar crash from main diff content |
| `EDGE-FTREE-010` | Sidebar renders correctly when diff content is still loading (disabled clicks, loading indicator) |

### CLI Tests

No new CLI tests are required — the diff file tree sidebar is a visual component that does not exist in the CLI. The CLI `codeplane change diff` command outputs raw diff text and is unaffected by this feature.

### API Tests

No new API tests are required — the diff file tree sidebar consumes the existing `GET /api/repos/:owner/:repo/changes/:change_id/diff` endpoint. All API validation is covered by the `JJ_CHANGE_DIFF` spec's test suite (API-DIFF-001 through API-DIFF-030).

### Cross-Surface Consistency Tests

| Test ID | Description |
|---------|-------------|
| `XSURF-FTREE-001` | Web and TUI sidebars display the same file count for the same diff |
| `XSURF-FTREE-002` | Web and TUI sidebars display the same change type indicators for the same files |
| `XSURF-FTREE-003` | Web and TUI sidebars display the same stat summaries for the same files |
| `XSURF-FTREE-004` | Web and TUI sidebars both show truncation indicator at 501+ files |
| `XSURF-FTREE-005` | Web and TUI sidebars both show "(No files changed)" for empty diffs |
