# TUI_DIFF_UNIFIED_VIEW

Specification for TUI_DIFF_UNIFIED_VIEW.

## High-Level User POV

The unified diff view is the default rendering mode of the Codeplane TUI diff viewer. When a user opens a diff — whether from the repository changes list (`d` on a change), the landing request change stack (`d` on a change or `D` for the combined landing diff), or via direct navigation (`g d` from a repository context) — the diff viewer opens in unified mode, presenting file modifications in a single-column, interleaved layout where removed lines (prefixed with `−`, red background) and added lines (prefixed with `+`, green background) appear directly adjacent to each other, surrounded by unchanged context lines. This is the same conceptual format as `jj diff` or `git diff` output, but rendered with full syntax highlighting, line numbers, and structured navigation.

The unified view occupies the full content area of the diff screen. At the top of the content area, a file header bar shows the current filename (e.g., `src/auth/token.ts`), the change type (modified, added, deleted, renamed), and a summary of additions and deletions for that file (e.g., `+14 −7`). Below the file header, the diff content renders inside a scrollable region. Each hunk is separated by a hunk header line (e.g., `@@ -42,7 +42,12 @@ function refreshToken()`) rendered in cyan, showing the line range and the nearest enclosing function or scope name when available. Context lines appear in the default terminal foreground color with a neutral background. Added lines render with a green-tinted background and a `+` sign glyph in green. Removed lines render with a red-tinted background and a `−` sign glyph in red.

Line numbers appear in the left gutter. In unified mode, two columns of line numbers are shown side by side: the left column shows the line number in the original file (before the change), and the right column shows the line number in the modified file (after the change). Added lines show a line number only in the right column; removed lines show a line number only in the left column; context lines show both. The line number columns are rendered in a muted foreground color against a slightly darker background. Line numbers can be toggled off with `l` to reclaim horizontal space on narrow terminals.

The user scrolls through the diff content with `j`/`k` (line by line) or `Ctrl+D`/`Ctrl+U` (half-page jumps). `G` jumps to the bottom of the current file's diff, and `g g` jumps to the top. When viewing a multi-file diff, `]` and `[` navigate to the next and previous file respectively. Hunks can be collapsed with `z` (all) or `Enter` (individual) and expanded with `x`. Whitespace changes can be toggled with `w`. The unified view is the only diff layout available at minimum terminal width (80×24); at 120+ columns, `t` toggles to split view.

Syntax highlighting is applied to all code lines using tree-sitter via the OpenTUI `<diff>` component, with language detected from file extension. If the diff data fails to load, the content area shows an error with "Press `R` to retry." If the diff is empty, it shows "No file changes in this diff." Binary files show "Binary file — cannot display diff."

## Acceptance Criteria

### Definition of Done
- [ ] The diff viewer defaults to unified mode when opened from any entry point (change list `d`, landing change stack `d`/`D`, command palette, deep link)
- [ ] Diff data is fetched via `useChangeDiff(owner, repo, change_id)` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/jj/changes/:change_id/diff`
- [ ] Combined landing diffs are fetched via `useLandingDiff(owner, repo, number)` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/landings/:number/diff`
- [ ] The diff string is passed to the OpenTUI `<diff>` component with `view="unified"`
- [ ] The file header bar displays: filename, change type (modified/added/deleted/renamed), and addition/deletion summary (`+N −M`)
- [ ] Hunk headers render in cyan with line range and enclosing scope name
- [ ] Added lines render with green-tinted background (`#1a4d1a`) and green sign glyph (`#22c55e`)
- [ ] Removed lines render with red-tinted background (`#4d1a1a`) and red sign glyph (`#ef4444`)
- [ ] Context lines render with default terminal foreground and transparent background
- [ ] Line numbers display in a two-column gutter (old file left, new file right)
- [ ] Line numbers use muted foreground (`#6b7280`) against a dark background (`#161b22`)
- [ ] Added lines show line number only in the right column; removed lines only in the left column
- [ ] Line number display toggles with `l` keybinding
- [ ] Syntax highlighting is applied via tree-sitter, with language detected from file extension
- [ ] `j`/`k`/`Down`/`Up` scroll the diff content line by line
- [ ] `Ctrl+D` / `Ctrl+U` scroll half a page down/up
- [ ] `G` jumps to the bottom of the diff; `g g` jumps to the top
- [ ] `]` navigates to the next file; `[` navigates to the previous file (multi-file diffs)
- [ ] `z` collapses all hunks; `x` expands all hunks
- [ ] `Enter` on a hunk header toggles that hunk's collapsed/expanded state
- [ ] Collapsed hunks show `▶` with hunk summary; expanded hunks show `▼`
- [ ] `w` toggles whitespace visibility
- [ ] `t` toggles to split view (only available at 120+ columns)
- [ ] The status bar shows: current view mode ("Unified"), whitespace toggle state, line numbers state, current file position ("File 2/7")
- [ ] `R` retries a failed diff fetch
- [ ] 401 errors propagate to the app-shell auth error screen
- [ ] Empty diffs show "No file changes in this diff." in muted text
- [ ] Binary files show "Binary file — cannot display diff." in muted text
- [ ] The breadcrumb reads "Dashboard > owner/repo > Diff > filename.ext"

### Keyboard Interactions
- [ ] `j` / `Down`: Scroll down one line
- [ ] `k` / `Up`: Scroll up one line
- [ ] `Ctrl+D`: Scroll down half page
- [ ] `Ctrl+U`: Scroll up half page
- [ ] `G`: Jump to bottom of diff content
- [ ] `g g`: Jump to top of diff content
- [ ] `]`: Navigate to next file in multi-file diff
- [ ] `[`: Navigate to previous file in multi-file diff
- [ ] `l`: Toggle line number visibility
- [ ] `w`: Toggle whitespace visibility
- [ ] `t`: Toggle to split view (≥120 columns only; no-op at minimum width)
- [ ] `z`: Collapse all hunks
- [ ] `x`: Expand all hunks
- [ ] `Enter`: Toggle hunk expand/collapse when cursor is on a hunk header
- [ ] `R`: Retry failed diff fetch (only active in error state)
- [ ] `?`: Show help overlay with diff viewer keybindings
- [ ] `q`: Pop screen (return to previous screen)
- [ ] `:`: Open command palette
- [ ] `Esc`: Close help overlay if open; otherwise same as `q`

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by app-shell router
- [ ] 80×24 – 119×39 (minimum): Unified view only (`t` is no-op). File tree sidebar hidden. Line number gutter uses 4+4 characters (8ch total). File header truncates filename from left with `…/`. Hunk scope name hidden. Status bar shows abbreviated hints
- [ ] 120×40 – 199×59 (standard): Full unified view. File tree sidebar available (toggle with `Ctrl+B`). Line number gutter uses 5+5 characters (10ch total). Full filename in header. Hunk scope names visible. `t` toggles to split view
- [ ] 200×60+ (large): Extra context lines shown around hunks (5 instead of 3). Line number gutter uses 6+6 characters (12ch total). Full filename with path. Wider hunk headers. Status bar shows full keybinding hints

### Truncation & Boundary Constraints
- [ ] Filename in file header: Truncated from the left with `…/` prefix at minimum width. Full path at standard/large. Maximum 255 characters
- [ ] Hunk scope name: Hidden at minimum width. Truncated with `…` at 40 characters at standard. Full at large
- [ ] Addition/deletion summary: Fixed format `+N −M` with integer N and M
- [ ] Line numbers: Maximum 6 digits (files up to 999,999 lines). Wider gutter for larger files
- [ ] Diff content: Lines exceeding terminal width use `wrapMode` (forced `"word"` at minimum, `"none"` at standard+). Max 100,000 lines total before truncation
- [ ] File navigation wraps around (last → first, first → last). No limit on file count
- [ ] Syntax highlighting failure: Falls back to plain text
- [ ] Binary file detection: API-identified binary files show placeholder message

### Edge Cases
- [ ] Terminal resize while scrolled: Scroll position preserved relative to line offset, layout recalculates synchronously
- [ ] Terminal resize from standard to minimum: `t` becomes no-op, sidebar collapses, gutter narrows
- [ ] Rapid `j`/`k` presses: Processed sequentially, one line per keypress, no debounce
- [ ] Diff with 0 files: "No file changes in this diff." — `]`/`[`/`z`/`x` are no-ops
- [ ] Diff with 1 file: `]`/`[` are no-ops. File position shows "File 1/1"
- [ ] All additions (new file): All lines green, left gutter empty
- [ ] All deletions (deleted file): All lines red, right gutter empty
- [ ] Renamed file with no content changes: Header shows rename, empty diff content
- [ ] Very large file (10,000+ lines): Scrolling remains responsive (<16ms per frame)
- [ ] Unicode and wide characters: 2-column width, alignment preserved
- [ ] Tab characters: Rendered as 4 spaces
- [ ] `w` toggle with only whitespace changes: Shows "No non-whitespace changes."
- [ ] `z` then `]`: New file opens with all hunks expanded (collapse state per-file)
- [ ] SSE disconnect: Diff uses REST only, unaffected
- [ ] No color support: `+`/`-` text signs, no backgrounds

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Diff > token.ts             │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────┬───────────────────────────────────────────────┐ │
│ │ File     │  src/auth/token.ts  (modified)    +14 −7      │ │
│ │ Tree     ├───────────────────────────────────────────────┤ │
│ │          │ @@ -42,7 +42,12 @@ refreshToken()      ▼     │ │
│ │ token.ts │  42  42  │  const token = getToken();         │ │
│ │ auth.ts  │  43  43  │  if (token.expired) {              │ │
│ │ index.ts │  44      │−   return null;                    │ │
│ │          │      44  │+   const fresh = await refresh();  │ │
│ │          │      45  │+   return fresh;                   │ │
│ │          │  45  46  │  }                                 │ │
│ └──────────┴───────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│ Unified │ j/k:scroll ]/[:file  w:whitespace l:lines  ?:help │
└──────────────────────────────────────────────────────────────┘
```

### Components Used
- `<box>` — Outer layout container (vertical flex), file header bar (horizontal flex), line number gutter container, status bar
- `<scrollbox>` — Wraps the entire diff content area for vertical scrolling
- `<diff>` — OpenTUI diff component with `view="unified"`, syntax highlighting via `filetype` and `syntaxStyle`, line numbers, and color theming
- `<text>` — Filename, change type label, addition/deletion summary, hunk collapse indicators, error/empty messages, status bar text
- `<box>` (sidebar) — File tree sidebar at 25% width, collapsible with `Ctrl+B`

### Component Composition
```jsx
<box flexDirection="column" style={{ flexGrow: 1 }}>
  <box flexDirection="row" style={{ height: 1 }}>
    <text color="primary">{currentFile.name}</text>
    <text color="muted">  ({currentFile.changeType})</text>
    <text color="success">  +{currentFile.additions}</text>
    <text color="error"> −{currentFile.deletions}</text>
  </box>
  <scrollbox style={{ flexGrow: 1 }}>
    <diff
      diff={diffString}
      view="unified"
      filetype={detectFileType(currentFile.name)}
      syntaxStyle={codeplaneThemeSyntaxStyle}
      showLineNumbers={showLineNumbers}
      wrapMode={terminalWidth < 120 ? "word" : "none"}
      addedBg="#1a4d1a"
      removedBg="#4d1a1a"
      contextBg="transparent"
      addedSignColor="#22c55e"
      removedSignColor="#ef4444"
      lineNumberFg="#6b7280"
      lineNumberBg="#161b22"
      addedLineNumberBg="#0d3a0d"
      removedLineNumberBg="#3a0d0d"
      style={{ flexGrow: 1, flexShrink: 1 }}
    />
  </scrollbox>
</box>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Scroll down one line | Diff content focused |
| `k` / `Up` | Scroll up one line | Diff content focused |
| `Ctrl+D` | Scroll down half page | Diff content focused |
| `Ctrl+U` | Scroll up half page | Diff content focused |
| `G` | Jump to bottom | Diff content focused |
| `g g` | Jump to top | Diff content focused |
| `]` | Next file | Multi-file diff |
| `[` | Previous file | Multi-file diff |
| `l` | Toggle line numbers | Always |
| `w` | Toggle whitespace | Always |
| `t` | Toggle to split view | Terminal ≥ 120 columns |
| `z` | Collapse all hunks | Always |
| `x` | Expand all hunks | Always |
| `Enter` | Toggle hunk collapse | Cursor on hunk header |
| `R` | Retry fetch | Error state |
| `?` | Help overlay | Always |
| `q` | Pop screen | Always |
| `:` | Command palette | Always |
| `Esc` | Close overlay or pop | Always |
| `Ctrl+B` | Toggle sidebar | Terminal ≥ 120 columns |

### Responsive Column Layout

**80×24 (minimum):** No sidebar. Line number gutter: 4+4 chars (8ch). Separator: 1ch. Diff content: remaining width (71ch). `wrapMode` forced to `"word"`. Filename truncated from left. Hunk scope name hidden.

**120×40 (standard):** Sidebar available (25%/30ch). Line number gutter: 5+5 chars (10ch). Separator: 1ch. Diff content: remaining width (79ch with sidebar, 109ch without). `wrapMode` default `"none"`. Full filename. Hunk scope names visible (truncated at 40ch).

**200×60 (large):** Sidebar available (25%/50ch). Line number gutter: 6+6 chars (12ch). Separator: 1ch. Diff content: remaining width (137ch with sidebar, 187ch without). Extra context lines (5 instead of 3). Full hunk scope names.

### Data Hooks
- `useChangeDiff(owner, repo, change_id)` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/jj/changes/:change_id/diff`
- `useLandingDiff(owner, repo, number)` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/landings/:number/diff`
- `useChange(owner, repo, change_id)` from `@codeplane/ui-core` → change metadata for breadcrumb
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()` from local TUI router — `push()` and `pop()` for screen transitions

### Navigation Context
Receives `{ repo, change_id }` or `{ repo, landing_number }` from parent screen push. `q` → `pop()`. `t` → toggles view mode prop (no push). `]`/`[` → updates internal file index state (no push).

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View diff (public repo) | ✅ | ✅ | ✅ | ✅ |
| View diff (private repo) | ❌ | ✅ | ✅ | ✅ |
| View landing diff (public repo) | ✅ | ✅ | ✅ | ✅ |
| View landing diff (private repo) | ❌ | ✅ | ✅ | ✅ |

- The diff viewer is read-only. No write operations are performed from this screen
- `GET /api/repos/:owner/:repo/jj/changes/:change_id/diff` respects repository visibility
- `GET /api/repos/:owner/:repo/landings/:number/diff` respects repository visibility
- Private repository diffs require at minimum read-level access

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at TUI bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- Diff content is not cached to disk (memory-only) to prevent credential-adjacent data leakage

### Rate Limiting
- 300 req/min for `GET /api/repos/:owner/:repo/jj/changes/:change_id/diff`
- 300 req/min for `GET /api/repos/:owner/:repo/landings/:number/diff`
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting
- Diff data cached in memory for the session; navigating back uses cached version (no re-fetch unless `R` is pressed)

### Input Sanitization
- No user input is sent to the API from this view (read-only display)
- Diff content, filenames, and hunk headers rendered through `<diff>` component's built-in sanitization
- Change IDs and landing numbers validated as expected formats before API calls

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.diff.unified.view` | Unified diff screen mounted with data loaded | `repo`, `change_id`, `landing_number`, `file_count`, `total_additions`, `total_deletions`, `total_lines`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_point` |
| `tui.diff.unified.scroll` | Scroll position changes (throttled to 1 event per 2s) | `repo`, `change_id`, `scroll_position_pct`, `direction`, `method` |
| `tui.diff.unified.file_navigate` | `]` or `[` pressed | `repo`, `change_id`, `from_file`, `to_file`, `file_index`, `total_files`, `direction` |
| `tui.diff.unified.toggle_line_numbers` | `l` pressed | `repo`, `change_id`, `line_numbers_visible` |
| `tui.diff.unified.toggle_whitespace` | `w` pressed | `repo`, `change_id`, `whitespace_visible` |
| `tui.diff.unified.toggle_view` | `t` pressed to switch to split | `repo`, `change_id`, `from_view`, `to_view`, `terminal_width` |
| `tui.diff.unified.hunk_collapse` | `z`, `x`, or `Enter` on hunk | `repo`, `change_id`, `action`, `file`, `hunk_count` |
| `tui.diff.unified.error` | API failure | `repo`, `change_id`, `landing_number`, `error_type`, `http_status` |
| `tui.diff.unified.retry` | `R` pressed | `repo`, `change_id`, `landing_number`, `retry_success` |
| `tui.diff.unified.exit` | User navigates away | `repo`, `change_id`, `time_spent_ms`, `files_viewed`, `total_files`, `scroll_depth_max_pct` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Diff load completion | >98% |
| Mean time to interactive | <800ms |
| File navigation usage (multi-file diffs) | >60% of multi-file views |
| Line number toggle usage | >10% of views |
| Whitespace toggle usage | >8% of views |
| Hunk collapse usage | >15% of views |
| Split view toggle rate | >20% of views at ≥120 width |
| Error rate | <2% |
| Retry success | >80% |
| Average time spent on diff | >15s |
| Files viewed per session (multi-file) | >50% of files in diff |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Screen mounted | `DiffUnified: mounted [repo={r}] [change_id={id}] [width={w}] [height={h}]` |
| `debug` | Diff loaded | `DiffUnified: loaded [repo={r}] [change_id={id}] [files={n}] [lines={l}] [duration={ms}ms]` |
| `debug` | File navigated | `DiffUnified: file nav [repo={r}] [change_id={id}] [file={f}] [index={i}/{total}]` |
| `debug` | Scroll position | `DiffUnified: scroll [repo={r}] [change_id={id}] [position={p}] [method={m}]` |
| `debug` | Line numbers toggled | `DiffUnified: line numbers [repo={r}] [visible={v}]` |
| `debug` | Whitespace toggled | `DiffUnified: whitespace [repo={r}] [visible={v}]` |
| `debug` | Hunk collapse action | `DiffUnified: hunk [repo={r}] [action={a}] [file={f}]` |
| `info` | Fully loaded and interactive | `DiffUnified: ready [repo={r}] [change_id={id}] [files={n}] [additions={a}] [deletions={d}] [total_ms={ms}]` |
| `info` | View toggled to split | `DiffUnified: view toggle [repo={r}] [to=split] [width={w}]` |
| `warn` | Diff fetch failed | `DiffUnified: fetch failed [repo={r}] [change_id={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `DiffUnified: rate limited [repo={r}] [change_id={id}] [retry_after={s}]` |
| `warn` | Diff too large (truncated) | `DiffUnified: truncated [repo={r}] [change_id={id}] [lines={l}] [cap=100000]` |
| `warn` | Slow load (>3s) | `DiffUnified: slow load [repo={r}] [change_id={id}] [duration={ms}ms]` |
| `warn` | Syntax highlight fallback | `DiffUnified: highlight fallback [repo={r}] [file={f}] [filetype={ft}]` |
| `error` | Auth error | `DiffUnified: auth error [repo={r}] [status=401]` |
| `error` | Render error | `DiffUnified: render error [repo={r}] [change_id={id}] [error={msg}]` |

Logs to stderr. Level controlled via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during diff load | Layout re-renders; fetch continues independently | Automatic |
| Resize while scrolled | Scroll position preserved (line offset). Gutter width recalculates | Synchronous |
| SSE disconnect | Diff uses REST only; unaffected | SSE provider reconnects independently |
| Auth expiry mid-session | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press `R` to retry." | User retries |
| Diff API returns 404 | "Change not found." in error color. `q` to go back | User navigates back |
| Diff API returns 500 | "Server error. Press `R` to retry." | User retries |
| Rate limit (429) | "Rate limited. Retry in {N}s." inline | User waits, then `R` |
| Binary file in multi-file diff | File section shows placeholder | Navigate to other files |
| Tree-sitter parse failure | Plain text fallback (no syntax colors) | Automatic |
| Diff exceeds 100,000 lines | Truncated with message | Informational |
| No color support | `+`/`-` text signs, no backgrounds | Theme detection |
| Rapid keypress during render | Input queued and processed in order | No dropped inputs |

### Failure Modes
- Component crash → global error boundary → "Press `r` to restart"
- Diff fetch fails → inline error state; `q` still works for navigation back
- Syntax highlighting crash for one file → that file renders as plain text; other files unaffected
- Slow network → spinner; user can press `q` to abandon
- Memory pressure from large diff → truncation cap prevents OOM

## Verification

### Test File: `e2e/tui/diff.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-DIFF-UNI-001: Unified diff at 120×40 with single-file TypeScript change — full layout with line numbers, syntax highlighting, hunk headers, file header, status bar
- SNAP-DIFF-UNI-002: Unified diff at 80×24 minimum — compact layout, word-wrapped lines, truncated filename, no sidebar, abbreviated status hints
- SNAP-DIFF-UNI-003: Unified diff at 200×60 large — expanded gutter, full filename path, extra context lines, full status bar descriptions
- SNAP-DIFF-UNI-004: Multi-file diff file header — filename, change type "modified", addition/deletion summary "+14 −7"
- SNAP-DIFF-UNI-005: New file (all additions) — all lines green background, left gutter empty, change type "added"
- SNAP-DIFF-UNI-006: Deleted file (all deletions) — all lines red background, right gutter empty, change type "deleted"
- SNAP-DIFF-UNI-007: Renamed file with changes — header shows "renamed: old → new", diff content visible
- SNAP-DIFF-UNI-008: Renamed file without changes — header shows "renamed: old → new", no diff content
- SNAP-DIFF-UNI-009: Binary file placeholder — "Binary file — cannot display diff." in muted text
- SNAP-DIFF-UNI-010: Empty diff — "No file changes in this diff." centered in muted text
- SNAP-DIFF-UNI-011: Loading state — spinner with "Loading diff…"
- SNAP-DIFF-UNI-012: Error state — red error message with "Press `R` to retry"
- SNAP-DIFF-UNI-013: Hunk header rendering — cyan color, line range, scope name with `▼` indicator
- SNAP-DIFF-UNI-014: Collapsed hunk — `▶` indicator, hunk summary line, content hidden
- SNAP-DIFF-UNI-015: All hunks collapsed (`z`) — all hunks show `▶`, only headers visible
- SNAP-DIFF-UNI-016: Line numbers visible — two-column gutter (old/new), muted color, dark background
- SNAP-DIFF-UNI-017: Line numbers hidden (`l` toggled) — no gutter, diff content takes full width
- SNAP-DIFF-UNI-018: Added line rendering — green background, green `+` sign, right line number only
- SNAP-DIFF-UNI-019: Removed line rendering — red background, red `−` sign, left line number only
- SNAP-DIFF-UNI-020: Context line rendering — default background, both line numbers present
- SNAP-DIFF-UNI-021: Syntax highlighting on TypeScript — keywords red, strings blue, comments gray italic
- SNAP-DIFF-UNI-022: Syntax highlighting on Python file — correct token colors for Python grammar
- SNAP-DIFF-UNI-023: Whitespace toggled off — whitespace-only changes hidden
- SNAP-DIFF-UNI-024: Status bar content — "Unified", whitespace state, line number state, file position "File 2/7"
- SNAP-DIFF-UNI-025: File tree sidebar visible (Ctrl+B) at 120×40 — sidebar at 25%, diff content at 75%
- SNAP-DIFF-UNI-026: File tree sidebar hidden at 80×24 — diff takes full width
- SNAP-DIFF-UNI-027: Help overlay (`?`) — modal showing all diff keybindings
- SNAP-DIFF-UNI-028: No color mode (`TERM=dumb`) — plain `+`/`-` signs, no backgrounds, readable layout

### Keyboard Interaction Tests (38 tests)

- KEY-DIFF-UNI-001: `j` scrolls down one line
- KEY-DIFF-UNI-002: `k` scrolls up one line
- KEY-DIFF-UNI-003: `Down` scrolls down one line (same as `j`)
- KEY-DIFF-UNI-004: `Up` scrolls up one line (same as `k`)
- KEY-DIFF-UNI-005: `k` at top of diff — no-op
- KEY-DIFF-UNI-006: `j` at bottom of diff — no-op
- KEY-DIFF-UNI-007: `Ctrl+D` scrolls down half page
- KEY-DIFF-UNI-008: `Ctrl+U` scrolls up half page
- KEY-DIFF-UNI-009: `G` jumps to bottom
- KEY-DIFF-UNI-010: `g g` jumps to top
- KEY-DIFF-UNI-011: `]` navigates to next file — file header updates, scroll resets
- KEY-DIFF-UNI-012: `[` navigates to previous file
- KEY-DIFF-UNI-013: `]` on last file — wraps to first file
- KEY-DIFF-UNI-014: `[` on first file — wraps to last file
- KEY-DIFF-UNI-015: `]` on single-file diff — no-op
- KEY-DIFF-UNI-016: `[` on single-file diff — no-op
- KEY-DIFF-UNI-017: `l` toggles line numbers off
- KEY-DIFF-UNI-018: `l` toggles line numbers back on
- KEY-DIFF-UNI-019: `w` toggles whitespace off
- KEY-DIFF-UNI-020: `w` toggles whitespace back on
- KEY-DIFF-UNI-021: `t` at 120 columns — switches to split view
- KEY-DIFF-UNI-022: `t` at 80 columns — no-op
- KEY-DIFF-UNI-023: `z` collapses all hunks
- KEY-DIFF-UNI-024: `x` expands all hunks
- KEY-DIFF-UNI-025: `Enter` on hunk header — toggles collapse
- KEY-DIFF-UNI-026: `Enter` on non-hunk-header line — no-op
- KEY-DIFF-UNI-027: `R` in error state — retries fetch
- KEY-DIFF-UNI-028: `R` in normal state — no-op
- KEY-DIFF-UNI-029: `?` shows help overlay
- KEY-DIFF-UNI-030: `Esc` closes help overlay
- KEY-DIFF-UNI-031: `q` pops screen
- KEY-DIFF-UNI-032: `:` opens command palette
- KEY-DIFF-UNI-033: Rapid `j` presses (20×) — scroll advances exactly 20 lines
- KEY-DIFF-UNI-034: `Ctrl+B` at 120 columns — toggles sidebar
- KEY-DIFF-UNI-035: `Ctrl+B` at 80 columns — no-op
- KEY-DIFF-UNI-036: `z` then `]` — new file opens with hunks expanded (per-file collapse state)
- KEY-DIFF-UNI-037: `w` toggle persists across file navigation
- KEY-DIFF-UNI-038: Global keybindings active — `g r` navigates to repos

### Responsive Tests (12 tests)

- RESP-DIFF-UNI-001: Layout at 80×24 — no sidebar, 8ch gutter, word wrap, truncated filename
- RESP-DIFF-UNI-002: Layout at 120×40 — sidebar available, 10ch gutter, no wrap, full filename
- RESP-DIFF-UNI-003: Layout at 200×60 — 12ch gutter, extra context lines, full paths
- RESP-DIFF-UNI-004: Resize 120→80 — sidebar collapses, gutter narrows, wrap mode changes
- RESP-DIFF-UNI-005: Resize 80→120 — wider gutter, wrap mode changes, sidebar remains hidden until `Ctrl+B`
- RESP-DIFF-UNI-006: Resize 200→80 — graceful degradation across two breakpoints
- RESP-DIFF-UNI-007: Scroll position preserved through resize
- RESP-DIFF-UNI-008: Hunk collapse state preserved through resize
- RESP-DIFF-UNI-009: Line number toggle state preserved through resize
- RESP-DIFF-UNI-010: Whitespace toggle state preserved through resize
- RESP-DIFF-UNI-011: File navigation state preserved through resize
- RESP-DIFF-UNI-012: Resize during loading state — layout adjusts, fetch continues

### Integration Tests (18 tests)

- INT-DIFF-UNI-001: Full flow — changes list → `d` → unified diff → scroll → `q` back
- INT-DIFF-UNI-002: Landing flow — landing detail → change stack → `d` → unified diff → `q` back
- INT-DIFF-UNI-003: Combined landing diff — change stack → `D` → unified diff → `q` back
- INT-DIFF-UNI-004: Multi-file navigation — `]` through all files → `[` back → `q`
- INT-DIFF-UNI-005: View toggle round trip — unified → `t` split → `t` unified → scroll preserved
- INT-DIFF-UNI-006: Auth expiry — 401 → auth error screen
- INT-DIFF-UNI-007: Rate limit — 429 → inline message → `R` → success
- INT-DIFF-UNI-008: Network timeout → error → `R` → success
- INT-DIFF-UNI-009: Server 500 → error → `R` → success
- INT-DIFF-UNI-010: `R` retry clears error and renders diff
- INT-DIFF-UNI-011: 50+ files — navigation wraps, performance smooth
- INT-DIFF-UNI-012: 10,000+ line file — scrolling responsive
- INT-DIFF-UNI-013: Mixed binary/text files — binary placeholder, text renders, `]`/`[` works
- INT-DIFF-UNI-014: Deep link — `codeplane tui --screen diff --repo owner/repo --change_id abc123`
- INT-DIFF-UNI-015: Command palette navigation to diff screen
- INT-DIFF-UNI-016: Diff cache hit — view → back → view again → instant load
- INT-DIFF-UNI-017: Syntax highlighting across file types — `.ts` → `.py` → `.go`
- INT-DIFF-UNI-018: Whitespace toggle with mixed content

### Edge Case Tests (14 tests)

- EDGE-DIFF-UNI-001: Diff with 0 files — empty state, navigation no-ops
- EDGE-DIFF-UNI-002: Diff with 1 file — `]`/`[` no-ops, "File 1/1"
- EDGE-DIFF-UNI-003: Whitespace-only changes, whitespace off — "No non-whitespace changes."
- EDGE-DIFF-UNI-004: Very long filename (255 chars) — truncated with `…/`
- EDGE-DIFF-UNI-005: File with 999,999 lines — 6-digit gutter renders correctly
- EDGE-DIFF-UNI-006: Diff exceeding 100,000 lines — truncation message
- EDGE-DIFF-UNI-007: Unicode content (CJK, emoji) — wide chars take 2 columns
- EDGE-DIFF-UNI-008: Tab characters — rendered as 4 spaces
- EDGE-DIFF-UNI-009: Concurrent resize + scroll — no crash, consistent layout
- EDGE-DIFF-UNI-010: Unrecognized file extension — plain text, no crash
- EDGE-DIFF-UNI-011: Empty string from API — treated as empty diff
- EDGE-DIFF-UNI-012: Malformed diff string — renders as plain text, no crash
- EDGE-DIFF-UNI-013: Rapid `t` toggle at exactly 120 columns — toggles correctly
- EDGE-DIFF-UNI-014: No auth token — auth error screen before diff renders

All 110 tests left failing if backend is unimplemented — never skipped or commented out.
