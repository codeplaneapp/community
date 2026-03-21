# JJ_DIFF_EXPAND_AND_COLLAPSE_ALL

Specification for JJ_DIFF_EXPAND_AND_COLLAPSE_ALL.

## High-Level User POV

When you're reviewing a large diff in Codeplane — whether a jj change touching dozens of files or a landing request with a deep stack of modifications — you often need to manage the visual density of what's on screen. Individual hunk collapse and expand controls (pressing `z` on a single hunk, or `Z` to collapse all hunks in one file) give you fine-grained control, but they fall short when you want to act on the entire diff at once. The expand-and-collapse-all feature gives you two global actions that operate across every file and every hunk in the current diff: "Collapse All" compresses every hunk in every file into a one-line summary, and "Expand All" restores every hunk to its full content.

This is the reviewer's power tool for large diffs. When you first open a 40-file change, you might want to start collapsed: hit Collapse All, scan the file headers and hunk summary lines to get a structural overview of the change, then selectively expand the hunks that look interesting. Alternatively, if you've been selectively collapsing hunks as you review them and want to start fresh, Expand All resets everything to the fully-visible baseline in one action.

In the web UI, these actions appear as two buttons in the diff toolbar — "Expand all" and "Collapse all" — sitting alongside the view mode toggle and whitespace controls. They are always visible and always act on the entire diff. In the TUI, the same actions are mapped to keyboard shortcuts: `X` (Shift+x) expands all hunks across all files, and `Z` (Shift+z) collapses all hunks in the current file (with repeated use across files, or a dedicated global collapse shortcut). The TUI also provides file-scoped variants (`x` to expand all in the current file, `z` to toggle a single hunk), but the global expand-all (`X`) is the key action this feature ensures works reliably across every diff context.

These controls work identically in every diff context: change diffs, landing request diffs, and conflict inspection diffs. They work in both unified and split view modes. They interact cleanly with other diff features — collapsing all hunks updates the scroll position, the scrollbar, and the status bar's file/hunk indicators. Expanding all hunks restores syntax highlighting, line numbers, and inline comments exactly as they were.

The expand/collapse-all feature is purely a client-side presentation control. It does not make additional API calls, does not change any repository state, and does not affect what other users see. It is a personal viewing aid that makes large diffs manageable.

## Acceptance Criteria

### Definition of Done

- [ ] The Web UI diff toolbar includes an "Expand all" button that expands every collapsed hunk across all files in the current diff
- [ ] The Web UI diff toolbar includes a "Collapse all" button that collapses every expanded hunk across all files in the current diff
- [ ] The TUI supports `X` (Shift+x) to expand all hunks across all files in the current diff
- [ ] The TUI supports a global collapse-all action that collapses all hunks across all files (triggered by a keyboard shortcut, e.g., `Shift+Z` applied globally or a command-palette action)
- [ ] The TUI supports `x` to expand all hunks in the currently focused file
- [ ] The TUI supports `Z` (Shift+z) to collapse all hunks in the currently focused file
- [ ] The TUI supports `z` to toggle the focused individual hunk
- [ ] The TUI supports `Enter` on a collapsed hunk summary to expand it
- [ ] All five keybindings (`z`, `Z`, `x`, `X`, `Enter`) work in both unified and split view modes
- [ ] All hunk collapse/expand state is tracked per-hunk, per-file, and persists within the diff session
- [ ] Hunk collapse/expand state resets when the diff screen is closed and reopened
- [ ] Hunk collapse/expand state resets when whitespace filtering is toggled (because the hunk structure changes after API re-fetch)
- [ ] Hunk collapse/expand state persists across file navigation (`]`/`[`), view mode toggle (`t`), line number toggle (`l`), and sidebar toggle (`Ctrl+B`)
- [ ] The feature works for all diff contexts: change diffs, landing request diffs
- [ ] No new API endpoints or parameters are required (purely client-side)
- [ ] All existing diff viewer tests continue to pass without regression

### Boundary Constraints

- [ ] **Maximum hunk count:** No upper limit on the number of hunks per file or total hunks. All hunks are individually tracked.
- [ ] **Single-line hunks:** A hunk with exactly 1 line can be collapsed. Summary shows `▶ ⋯ 1 line hidden (line X)` (singular form).
- [ ] **Zero hunks:** If a diff contains no hunks (e.g., binary-only changes or mode-only changes), all expand/collapse actions are no-ops.
- [ ] **Zero files:** If the diff contains 0 files, all expand/collapse actions are no-ops.
- [ ] **Diff with 500+ files and 2000+ hunks:** Expand-all and collapse-all complete within 100ms (no perceptible delay).
- [ ] **The `N` value** in collapsed hunk summaries (`N lines hidden`) displays as a full integer — no abbreviation for large numbers (e.g., `10437 lines hidden`, not `10k`).
- [ ] **Line range display** in `(lines X–Y)` uses an en-dash character (`–`, U+2013), not a hyphen.
- [ ] **Terminal width < 120 columns (TUI):** Collapsed hunk summary abbreviates to `▶ ⋯ N hidden` (omits the line range).
- [ ] **Terminal width ≥ 120 columns (TUI):** Full collapsed summary `▶ ⋯ N lines hidden (lines X–Y)` is displayed.
- [ ] **Web viewport < 768px:** Expand/Collapse all buttons remain visible in the toolbar (they are not width-gated).
- [ ] **Rapid keypresses (TUI):** `z`, `Z`, `x`, `X` are processed synchronously one per keypress with no debounce. Multiple rapid presses produce sequential state changes.
- [ ] **Rapid button clicks (Web):** Expand/Collapse all button clicks are debounced at 100ms to prevent render thrashing.
- [ ] **Collapsed hunk summary occupies exactly 1 row** in the scrollable area (plus 1 row for top dashed border and 1 for bottom dashed border = 3 total rows).
- [ ] **File headers remain visible** when all hunks in a file are collapsed — only hunk content is hidden, not the file-level header.

### Edge Cases

- [ ] "Collapse all" when all hunks are already collapsed: no-op, no error, no visual change
- [ ] "Expand all" when all hunks are already expanded: no-op, no error, no visual change
- [ ] "Collapse all" immediately followed by "Expand all": all hunks restored to expanded state with correct content
- [ ] "Expand all" immediately followed by "Collapse all": all hunks collapsed with correct summary lines
- [ ] Collapse all → navigate to a different file → navigate back: previously collapsed hunks in the original file remain collapsed
- [ ] Collapse all → toggle to split view: all hunks remain collapsed in split view with summary lines spanning both panes
- [ ] Collapse all → toggle whitespace: collapse state resets (all hunks re-expand after re-fetch)
- [ ] A diff with a single file containing a single hunk: collapse-all and expand-all operate on that one hunk
- [ ] A binary file section: collapse/expand actions skip it (nothing to collapse)
- [ ] A diff where some hunks contain inline comments (landing request context): collapsing a hunk with inline comments still collapses it, but the inline comment indicator is preserved in the summary line or the hunk is protected from collapse (see inline comment spec)
- [ ] Terminal resize while all hunks are collapsed: layout recalculates; summary text switches between abbreviated and full format; collapsed state preserved
- [ ] Help overlay (`?`) open: expand/collapse keybindings are no-ops while overlay is visible
- [ ] Command palette (`:`) open: expand/collapse keybindings are no-ops while palette is visible
- [ ] Loading state: expand/collapse keybindings are no-ops while diff is loading
- [ ] Error state: expand/collapse keybindings are no-ops except `R` (retry)
- [ ] Empty diff ("No file changes"): expand/collapse buttons/keys are no-ops

## Design

### Web UI Design

#### Toolbar Controls

The diff toolbar (rendered above the diff content area on both the change detail Diff tab and the landing request Diff tab) includes two buttons for global expand/collapse:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Unified ▾  │  ☐ Hide whitespace  │  ⊞ Expand all  ⊟ Collapse all  │  ⎘  │
└────────────────────────────────────────────────────────────────────────────┘
```

**"Expand all" button:**
- Icon: `⊞` (or a chevron-down-double icon from the icon set)
- Label: "Expand all"
- Behavior: Expands every collapsed hunk across every file in the current diff
- Disabled state: Visually dimmed when all hunks are already expanded (no collapsed hunks exist)
- Tooltip: "Expand all collapsed sections"

**"Collapse all" button:**
- Icon: `⊟` (or a chevron-up-double icon from the icon set)
- Label: "Collapse all"
- Behavior: Collapses every expanded hunk across every file in the current diff
- Disabled state: Visually dimmed when all hunks are already collapsed (no expanded hunks exist)
- Tooltip: "Collapse all sections"

**Button placement:** After the whitespace toggle and before the copy-patch control. The two buttons are rendered as a visually grouped pair (adjacent, same styling, separated by a subtle divider or grouped in a button group).

**Button styling:**
- Default: Ghost/outline style matching the toolbar's other controls
- Hover: Subtle background highlight
- Active/pressed: Brief press feedback
- Disabled: Reduced opacity (0.4), cursor `not-allowed`, click is a no-op

#### Individual Hunk Collapse (Web)

Each hunk header (`@@ ... @@` line) is clickable. Clicking toggles that specific hunk between expanded and collapsed state.

**Expanded hunk header:**
```
▼ @@ -42,7 +42,12 @@ function setup()
```
- `▼` indicator in primary/accent color
- Cursor: pointer on hover
- Full hunk content visible below

**Collapsed hunk:**
```
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
▶ ⋯ 7 lines hidden (lines 42–48)
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```
- `▶` indicator in primary/accent color
- Text in muted/secondary color
- Dashed top and bottom borders in border color
- Clickable to expand
- Cursor: pointer on hover

**File header behavior:**
File headers (showing filename, change type, stats) are NOT collapsible via these controls. They always remain visible. Only hunks within files are collapsed/expanded.

#### Keyboard Shortcuts (Web)

The web diff viewer supports the following keyboard shortcuts for expand/collapse:

| Key | Action |
|-----|--------|
| `e` | Expand all hunks across all files |
| `c` | Collapse all hunks across all files |
| Click on hunk header | Toggle individual hunk |

Note: The web UI uses `e`/`c` rather than `x`/`z` to avoid conflicts with text input contexts. These shortcuts are only active when no input field, textarea, or modal is focused.

#### Split View Interaction (Web)

In split view mode, collapsed hunk summaries span the full width across both panes (left and right). The dashed border extends through the vertical separator. Expanding a hunk in split view restores both the left (deletions) and right (additions) pane content simultaneously.

#### Scroll Position Adjustment (Web)

- **Collapse all:** After collapsing, the scroll position adjusts to keep the topmost visible file header in view. If the previously-visible content was inside a now-collapsed hunk, the viewport scrolls to the nearest file header above that position.
- **Expand all:** After expanding, the scroll position adjusts to show the content that was at the top of the viewport before expansion, accounting for the increased content height.

#### State Persistence (Web)

- Hunk collapse state is stored in component state (not persisted to server or localStorage)
- State persists within the same page session
- State resets on page navigation away from the diff view
- State resets when whitespace filtering is toggled (diff data changes)
- State persists across view mode toggles (unified ↔ split)

### TUI UI Design

The TUI expand/collapse controls are keyboard-driven with four hierarchical levels:

| Key | Modifier | Scope | Action |
|-----|----------|-------|--------|
| `z` | None | Single hunk | Toggle the focused hunk between collapsed and expanded |
| `Z` | Shift | Current file | Collapse all hunks in the currently focused file |
| `x` | None | Current file | Expand all collapsed hunks in the currently focused file |
| `X` | Shift | All files | Expand all collapsed hunks across all files in the diff |
| `Enter` | None | Single hunk | Expand a collapsed hunk (when cursor is on collapsed summary) |

**Status bar hints:**
- At ≥120 columns: `x/z:hunks  X/Z:all`
- At <120 columns: `x/z`

**Expanded hunk display (TUI):**
```
▼ @@ -42,7 +42,12 @@ function setup()
 42  42 │  const token = getToken();
 43  43 │  if (token.expired) {
 44     │−   return null;
     44 │+   const fresh = await refresh();
     45 │+   return fresh;
 45  46 │  }
```

**Collapsed hunk display (TUI, ≥120 columns):**
```
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
▶ ⋯ 7 lines hidden (lines 42–48)
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
```

**Collapsed hunk display (TUI, <120 columns):**
```
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
▶ ⋯ 7 hidden
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
```

**Color values (TUI):**
- `▶` / `▼` indicator: Primary/blue (ANSI 33)
- Collapsed summary text: Muted (ANSI 245)
- Dashed border (`╌`): Border color (ANSI 240)
- Hunk header text: Cyan (ANSI 37)

**Split view collapsed hunk (TUI):**
The collapsed summary line spans both panes — the dashed border continues through the `│` vertical separator, and the summary text is centered across the full width.

**State management data structure:**
```
hunkCollapseState: Map<file_path: string, Map<hunk_index: number, isCollapsed: boolean>>
```
- Outer key: file path from the API response
- Inner key: zero-based hunk index within that file
- Value: `true` = collapsed, `false` or absent = expanded
- Initialized: empty Map (all hunks expanded by default)

**focusedHunkIndex** is derived from the current scroll position mapped to hunk boundaries and is recalculated on every scroll position change. It determines which hunk `z` operates on.

### API Shape

**No new API endpoints or parameters are required.** Expand/collapse all is a purely client-side presentation concern. It operates on diff data already fetched from:
- `GET /api/repos/:owner/:repo/changes/:change_id/diff`
- `GET /api/repos/:owner/:repo/landings/:number/diff`

No data is sent to or received from the server when expand/collapse actions are triggered.

### SDK Shape

**No new SDK types or methods are required.** The existing `ChangeDiff`, `FileDiffItem`, and hunk parsing utilities provide all data needed. The collapse state is managed entirely in client-side component state.

A shared utility type for the collapse state map may be added to `packages/ui-core`:

```typescript
type HunkCollapseState = Map<string, Map<number, boolean>>;

function collapseAllHunks(state: HunkCollapseState, fileDiffs: FileDiffItem[]): HunkCollapseState;
function expandAllHunks(): HunkCollapseState; // returns empty map
function collapseFileHunks(state: HunkCollapseState, filePath: string, hunkCount: number): HunkCollapseState;
function expandFileHunks(state: HunkCollapseState, filePath: string): HunkCollapseState;
function toggleHunk(state: HunkCollapseState, filePath: string, hunkIndex: number): HunkCollapseState;
```

These utilities are shared between Web UI and TUI via `@codeplane/ui-core`.

### CLI Command

**No CLI changes.** The CLI outputs raw diff text or structured JSON. Expand/collapse is a visual rendering concept that does not apply to CLI output. The CLI's `codeplane change diff` command is unaffected.

### Documentation

The following end-user documentation must be written:

1. **Web UI guide section: "Managing diff sections with expand and collapse"** — Document the Expand All and Collapse All toolbar buttons, their behavior, how they interact with individual hunk collapse (clicking hunk headers), and how collapse state resets when whitespace filtering is toggled or the page is navigated away.

2. **TUI guide section: "Hunk collapse and expand controls"** — Document all five keybindings (`z`, `Z`, `x`, `X`, `Enter`), the hierarchical scope model (single hunk → current file → all files), the visual indicators (`▶`/`▼`), and the collapsed summary format.

3. **Keyboard shortcuts reference update (Web)** — Add `e` (expand all) and `c` (collapse all) to the web keyboard shortcuts table.

4. **Keyboard shortcuts reference update (TUI)** — Ensure `z`, `Z`, `x`, `X`, `Enter` are listed in the TUI keyboard shortcuts table with descriptions.

5. **FAQ entry: "How do I quickly scan a large diff?"** — Explain the workflow of Collapse All → scan file headers → selectively expand interesting hunks.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Anonymous | Can use expand/collapse all on public repository diffs |
| Read-only member | Can use expand/collapse all on repositories they have read access to |
| Member / Write | Can use expand/collapse all |
| Admin | Can use expand/collapse all |
| Owner | Can use expand/collapse all |

Expand/collapse all is a client-side presentation toggle. It does not introduce any new data access, modify any repository state, or require any server interaction. If a user can view the diff, they can expand/collapse hunks. No additional authorization checks are required beyond the existing repository read access enforced by the diff API endpoints.

### Rate Limiting

No rate limiting is required. Expand/collapse all is entirely client-side and generates zero API calls. The underlying diff data is already loaded. There is no server load impact from any expand/collapse action.

### Data Privacy

- No new PII exposure. Expand/collapse all renders the same source code content that is already visible in the expanded diff.
- Collapse state is stored in client-side component state only (React/Solid component state in-memory). It is never persisted to any server, database, analytics store, or localStorage as PII.
- No diff content is duplicated in memory for collapse state — the raw API response is parsed once; collapse state only determines which parsed hunks are rendered vs. summarized.
- The collapse/expand actions do not transmit any data over the network.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `DiffHunkToggled` | User toggles a single hunk (`z`/`Enter`/click) | `action` ("collapse" or "expand"), `client` ("web" or "tui"), `file_path`, `hunk_index`, `context` ("change" or "landing_request"), `view_mode` ("unified" or "split"), `repo` (owner/repo) |
| `DiffHunksCollapsedAllFile` | User collapses all hunks in current file (`Z` in TUI) | `client`, `file_path`, `hunk_count`, `context`, `view_mode`, `repo` |
| `DiffHunksExpandedAllFile` | User expands all hunks in current file (`x` in TUI) | `client`, `file_path`, `hunk_count`, `previously_collapsed_count`, `context`, `view_mode`, `repo` |
| `DiffHunksExpandedAllGlobal` | User expands all hunks across all files (`X` in TUI, "Expand all" button on web) | `client`, `file_count`, `total_hunk_count`, `previously_collapsed_count`, `context`, `view_mode`, `repo` |
| `DiffHunksCollapsedAllGlobal` | User collapses all hunks across all files ("Collapse all" button on web, or repeated `Z` across files) | `client`, `file_count`, `total_hunk_count`, `context`, `view_mode`, `repo` |
| `DiffCollapseSessionSummary` | Fired when diff viewer is closed | `total_collapse_actions`, `total_expand_actions`, `collapse_all_count`, `expand_all_count`, `individual_toggle_count`, `files_with_collapsed_hunks_at_close`, `session_duration_seconds`, `client`, `context`, `repo` |

### Properties Attached to All Events

| Property | Description |
|----------|-------------|
| `user_id` | Authenticated user identifier (null for anonymous) |
| `session_id` | Client session identifier |
| `timestamp` | ISO 8601 event timestamp |
| `change_id` or `landing_number` | The change or landing request being viewed |

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Collapse feature adoption rate | >20% of diff sessions | Percentage of diff sessions where any collapse/expand action is used |
| Global collapse/expand usage | >10% of diff sessions | Percentage of sessions where Expand All or Collapse All (global) is used |
| Individual vs. bulk ratio | >60% individual | Percentage of collapse actions that are single-hunk (`z`/click) vs. bulk (`Z`/`X`/buttons) — high individual % indicates granular use |
| Collapse-then-selective-expand pattern | >30% of collapse-all sessions | Percentage of Collapse All actions followed by individual hunk expands (indicates the "scan and drill" workflow is being used) |
| Collapse feature retention | >50% | Of users who use collapse in one session, % who use it again in their next diff session |
| Zero regression in diff load time | P95 unchanged | Collapse/expand should not add latency to initial diff rendering |

## Observability

### Logging Requirements

Since expand/collapse all is entirely client-side, most logging occurs in the client (browser console or TUI stderr). No server-side logging changes are required.

| Log Point | Level | Structured Context |
|-----------|-------|--------------------|  
| Hunk toggled (individual) | `debug` | `action` (collapse/expand), `file_path`, `hunk_index`, `session_id` |
| All hunks in file collapsed | `debug` | `file_path`, `hunk_count`, `session_id` |
| All hunks in file expanded | `debug` | `file_path`, `hunk_count`, `previously_collapsed_count`, `session_id` |
| All hunks globally expanded | `debug` | `file_count`, `total_hunk_count`, `previously_collapsed_count`, `session_id` |
| All hunks globally collapsed | `debug` | `file_count`, `total_hunk_count`, `session_id` |
| Collapse state reset (whitespace toggle) | `info` | `reason` ("whitespace_toggle"), `previous_collapsed_count`, `session_id` |
| Collapse state reset (screen unmount) | `debug` | `reason` ("screen_unmount"), `total_collapse_actions_in_session`, `session_id` |
| Hunk collapse render error | `error` | `error_message`, `file_path`, `hunk_index`, `viewport_width`, `client`, `session_id` |
| Collapse-all performance warning | `warn` | `total_hunks`, `render_duration_ms`, `session_id` — fired if collapse-all takes >100ms |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_diff_hunk_collapse_actions_total` | Counter | `scope` ("individual", "file", "global"), `action` ("collapse", "expand"), `client` ("web", "tui") | Total hunk collapse/expand actions |
| `codeplane_diff_collapse_all_render_duration_ms` | Histogram | `client`, `scope` ("file", "global") | Time to re-render after a collapse-all or expand-all action |
| `codeplane_diff_collapsed_hunks_at_session_end` | Histogram | `client` | Number of hunks still collapsed when the diff viewer is closed |
| `codeplane_diff_collapse_session_duration_seconds` | Histogram | `client` | Duration of diff sessions where collapse was used |

Note: Client-side metrics are collected via the telemetry event pipeline and aggregated server-side. They do not generate direct Prometheus scrape endpoints on the client.

### Alerts

#### `DiffCollapseRenderSlow`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_diff_collapse_all_render_duration_ms_bucket[5m])) > 200`
- **Severity:** Warning
- **Runbook:**
  1. Check if a specific file or diff size is causing slow renders by correlating with `total_hunks` from warning logs.
  2. Profile the collapse-all state update function — large diffs with 1000+ hunks may require batched state updates.
  3. Verify that the Map iteration for setting all hunk states is not causing O(n²) behavior through unnecessary re-renders.
  4. Check if syntax highlighting teardown/rebuild is blocking the re-render (it should be preserved, not recreated).
  5. If isolated to web, check if the virtual scroll container is re-measuring layout for all collapsed sections simultaneously — consider batching DOM updates.
  6. If isolated to TUI, check if the terminal is flushing too many ANSI escape sequences at once on large diffs.

#### `DiffCollapseRenderCrash`
- **Condition:** Any client-side error report from the diff collapse/expand component with `error_level: "fatal"`
- **Severity:** Critical
- **Runbook:**
  1. Reproduce the crash using the `file_path`, `hunk_index`, and `viewport_width` from the error report.
  2. Check for out-of-bounds access in the hunk collapse state map when hunk indices change after a whitespace re-fetch without a state reset.
  3. Check for division-by-zero in scroll position recalculation when all hunks are collapsed (total visible height could approach zero for very small diffs).
  4. Verify that the focusedHunkIndex derivation handles the case where all hunks are collapsed (no expandable content under cursor).
  5. Deploy a hotfix that catches the error and falls back to all-expanded state rather than crashing.
  6. Ensure error boundary catches the crash and re-renders the diff in all-expanded state.

#### `DiffCollapseStateLeakWarning`
- **Condition:** `histogram_quantile(0.95, codeplane_diff_collapsed_hunks_at_session_end) > 500`
- **Severity:** Info
- **Runbook:**
  1. This fires if users consistently end sessions with 500+ collapsed hunks, which suggests they're opening very large diffs and using collapse heavily.
  2. Verify that the collapse state Map is garbage collected when the diff viewer unmounts — check for memory leaks from retained references.
  3. Consider adding a max-tracked-hunks cap (e.g., 10,000) with graceful degradation for extremely large diffs.
  4. No immediate remediation needed — this is a product intelligence signal about large diff usage patterns.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Collapse state map out of sync with hunk data after whitespace re-fetch | State references hunk indices that no longer exist | Potential render crash or incorrect collapse targets | Clear collapse state on any diff data re-fetch; assert hunk index bounds before accessing state |
| Scroll position calculation overflow after collapse-all | Visible height drops to near-zero; scroll offset exceeds bounds | Scroll jumps to incorrect position or crashes | Clamp scroll offset to `[0, max(visibleHeight - viewportHeight, 0)]` after any bulk collapse |
| focusedHunkIndex out of bounds after file re-render | Hunk count changes after collapse/expand | `z` targets wrong hunk or crashes | Recalculate focusedHunkIndex from scroll position on every render; clamp to valid range |
| Memory pressure from tracking 10,000+ hunks | Browser tab or TUI process uses excessive RAM for state Map | Slowdown | Cap collapse state at 10,000 entries; beyond that, use a simpler "all collapsed" boolean flag |
| Concurrent collapse and file navigation race condition | User presses `Z` and `]` in rapid succession | Collapse applies to wrong file | Process keybindings sequentially in a single event loop tick; derive target file from state at processing time |

## Verification

### Web UI E2E Tests (Playwright)

| Test ID | Description |
|---------|-------------|
| `PW-EC-001` | Navigate to a change diff page → verify the toolbar contains an "Expand all" button and a "Collapse all" button |
| `PW-EC-002` | Click "Collapse all" → verify every hunk in every file is collapsed (shows `▶ ⋯ N lines hidden` summary lines) |
| `PW-EC-003` | Click "Expand all" → verify every hunk in every file is expanded (shows full diff content with `▼` indicators) |
| `PW-EC-004` | Click "Collapse all" → click "Expand all" → verify all hunks restored to full content identical to initial state |
| `PW-EC-005` | Click "Collapse all" → verify file headers (filename, change type badge, `+N −M` stats) remain visible for every file |
| `PW-EC-006` | When all hunks are already expanded, verify "Expand all" button appears disabled/dimmed |
| `PW-EC-007` | When all hunks are already collapsed, verify "Collapse all" button appears disabled/dimmed |
| `PW-EC-008` | Click an individual hunk header to collapse it → click "Expand all" → verify the individually collapsed hunk is now expanded |
| `PW-EC-009` | Click "Collapse all" → click an individual collapsed hunk to expand it → verify only that specific hunk expands; others remain collapsed |
| `PW-EC-010` | Click "Collapse all" → click a file in the sidebar → verify the viewport scrolls to that file's header (which is still visible) |
| `PW-EC-011` | Click "Collapse all" → verify the scrollbar/scroll indicator updates to reflect the reduced content height |
| `PW-EC-012` | Click "Collapse all" → toggle whitespace filter → verify collapse state resets (all hunks expanded in the re-fetched diff) |
| `PW-EC-013` | Click "Collapse all" → toggle view mode to split → verify collapsed hunks remain collapsed in split view with summary lines spanning both panes |
| `PW-EC-014` | In split view → click "Collapse all" → verify both panes show collapsed state simultaneously |
| `PW-EC-015` | Click "Collapse all" → navigate away from the diff page → navigate back → verify collapse state has reset (all hunks expanded) |
| `PW-EC-016` | On a diff with 0 files → verify "Expand all" and "Collapse all" buttons are present but disabled or visually inactive |
| `PW-EC-017` | On a diff with binary-only files → verify "Collapse all" is a no-op (binary files have no collapsible hunks) |
| `PW-EC-018` | On a diff with 100+ files → click "Collapse all" → verify the action completes within 200ms (no perceptible delay) |
| `PW-EC-019` | On a diff with 100+ files → click "Collapse all" → verify scroll position adjusts to keep a file header in view |
| `PW-EC-020` | Rapidly click "Collapse all" and "Expand all" alternately 10 times → verify no visual glitches and final state is consistent |
| `PW-EC-021` | Verify that collapsed hunk summary shows singular form: `1 line hidden (line X)` for a single-line hunk |
| `PW-EC-022` | Verify that collapsed hunk summary shows plural form: `7 lines hidden (lines 42–48)` for a multi-line hunk |
| `PW-EC-023` | Verify that the en-dash character (–) is used in line ranges, not a hyphen (-) |
| `PW-EC-024` | Verify keyboard shortcut `e` triggers expand-all when no input is focused |
| `PW-EC-025` | Verify keyboard shortcut `c` triggers collapse-all when no input is focused |
| `PW-EC-026` | Verify keyboard shortcuts `e` and `c` do NOT trigger when a text input or textarea is focused |
| `PW-EC-027` | Navigate to a landing request diff page → click "Collapse all" → verify behavior is identical to change diff |
| `PW-EC-028` | On a diff with a hunk containing inline comments (landing request) → click "Collapse all" → verify inline comment indicators are handled (either collapsed with the hunk or the hunk is protected) |
| `PW-EC-029` | On a viewport width of 768px → verify "Expand all" and "Collapse all" buttons are visible in the toolbar |
| `PW-EC-030` | On a viewport width of 500px → verify "Expand all" and "Collapse all" buttons are still accessible (may be in overflow menu or remain visible) |
| `PW-EC-031` | Click "Collapse all" on a diff with a single file containing a single hunk → verify that one hunk collapses |
| `PW-EC-032` | Click "Collapse all" → verify a `DiffHunksCollapsedAllGlobal` telemetry event fires with correct properties |
| `PW-EC-033` | Click "Expand all" → verify a `DiffHunksExpandedAllGlobal` telemetry event fires with correct properties |
| `PW-EC-034` | Verify "Expand all" button tooltip reads "Expand all collapsed sections" |
| `PW-EC-035` | Verify "Collapse all" button tooltip reads "Collapse all sections" |

### TUI E2E Tests

| Test ID | Description |
|---------|-------------|
| `TUI-EC-001` | Open diff view → press `z` → verify the focused hunk collapses to summary line → press `z` again → verify it expands |
| `TUI-EC-002` | Open diff view → press `Enter` on a collapsed hunk summary → verify it expands |
| `TUI-EC-003` | Open diff view → press `Z` → verify all hunks in the current file collapse |
| `TUI-EC-004` | Open diff view → press `x` → verify all hunks in the current file expand (after previously collapsing some) |
| `TUI-EC-005` | Open diff view → collapse hunks in file A → navigate to file B with `]` → collapse hunks → press `X` → verify all hunks in all files expand |
| `TUI-EC-006` | Press `Z` to collapse all in current file → navigate to file B with `]` → navigate back to file A with `[` → verify hunks in file A are still collapsed |
| `TUI-EC-007` | Press `X` when all hunks are already expanded → verify no-op (no visual change, no error) |
| `TUI-EC-008` | Press `z` when all hunks in the current file are already collapsed → verify no-op |
| `TUI-EC-009` | Press `x` when all hunks in the current file are already expanded → verify no-op |
| `TUI-EC-010` | Press `Z` → verify file header remains visible (filename, change type, stats) |
| `TUI-EC-011` | At 120×40 terminal → press `z` on a hunk → verify collapsed summary shows `▶ ⋯ N lines hidden (lines X–Y)` |
| `TUI-EC-012` | At 80×24 terminal → press `z` on a hunk → verify collapsed summary abbreviates to `▶ ⋯ N hidden` |
| `TUI-EC-013` | Press `z` on a 1-line hunk → verify summary shows `▶ ⋯ 1 line hidden (line X)` (singular) |
| `TUI-EC-014` | Verify `▶` indicator renders in primary/blue color (ANSI 33) |
| `TUI-EC-015` | Verify collapsed summary text renders in muted color (ANSI 245) |
| `TUI-EC-016` | Verify dashed border renders using `╌` character in border color (ANSI 240) |
| `TUI-EC-017` | Verify expanded hunk header shows `▼` indicator in primary/blue color (ANSI 33) |
| `TUI-EC-018` | Press `Z` → scroll with `j`/`k` → verify collapsed summaries are treated as single lines (scrolling past in one movement) |
| `TUI-EC-019` | Press `Z` → press `Ctrl+D` → verify half-page scroll accounts for reduced content height |
| `TUI-EC-020` | Press `Z` → press `G` → verify jump to bottom lands correctly |
| `TUI-EC-021` | Press `Z` → press `g g` → verify jump to top lands correctly |
| `TUI-EC-022` | Press `Z` → verify scrollbar indicator reflects reduced visible content height |
| `TUI-EC-023` | Press `z` to collapse a hunk → toggle to split view with `t` → verify collapsed state preserved in split view |
| `TUI-EC-024` | In split view → press `Z` → verify all hunks collapse with summary spanning both panes |
| `TUI-EC-025` | In split view → press `X` → verify all hunks expand in both panes |
| `TUI-EC-026` | Press `Z` → toggle line numbers with `l` → verify collapsed state preserved |
| `TUI-EC-027` | Press `Z` → toggle sidebar with `Ctrl+B` → verify collapsed state preserved |
| `TUI-EC-028` | Press `Z` → press `w` to toggle whitespace → verify collapsed state resets (all hunks expanded after re-fetch) |
| `TUI-EC-029` | Press `Z` → press `q` → reopen diff → verify all hunks are expanded (state reset) |
| `TUI-EC-030` | Open help overlay with `?` → press `z` → verify no hunk collapses (keybinding is no-op during overlay) |
| `TUI-EC-031` | Open command palette with `:` → press `X` → verify no expand-all occurs (keybinding is no-op during palette) |
| `TUI-EC-032` | During loading state → press `z`/`Z`/`x`/`X` → verify all are no-ops |
| `TUI-EC-033` | During error state → press `z`/`Z`/`x`/`X` → verify all are no-ops |
| `TUI-EC-034` | On a diff with 0 files → press `Z`/`X`/`z`/`x` → verify all are no-ops |
| `TUI-EC-035` | On a diff with binary-only file → press `Z` → verify no-op |
| `TUI-EC-036` | Press `z` 20 times rapidly → verify each press is processed sequentially (no debounce, no skipped actions) |
| `TUI-EC-037` | Resize terminal from 120×40 to 80×24 while hunks are collapsed → verify collapsed summary text switches to abbreviated format, state preserved |
| `TUI-EC-038` | On a diff with 50 files → press `Z` in file 1, navigate to file 25 with `]` repeatedly, press `Z`, navigate to file 50, press `Z` → press `X` → verify all 50 files' hunks are expanded |
| `TUI-EC-039` | Open landing request diff → press `Z` → verify collapse works identically to change diff |
| `TUI-EC-040` | Verify status bar shows `x/z:hunks` hint at ≥120 columns |
| `TUI-EC-041` | Verify status bar shows abbreviated hint at <120 columns |
| `TUI-EC-042` | Press `z` on an expanded hunk header → verify collapse; press `Enter` on the collapsed summary → verify expand |
| `TUI-EC-043` | Press `Enter` on a non-hunk line (context line, file header) → verify no-op |
| `TUI-EC-044` | On a diff with 500 files and 2000+ total hunks → press `X` → verify expand-all completes within 100ms |
| `TUI-EC-045` | On a diff with 500 files → press `Z` on each file sequentially → then press `X` → verify all 2000+ hunks expand |
| `TUI-EC-046` | On `TERM=dumb` → press `z` → verify `▶`/`▼` indicators still display; dashed border falls back to `---` |

### Client-Side Integration Tests (Shared Logic)

| Test ID | Description |
|---------|-------------|
| `INT-EC-001` | `collapseAllHunks()` with 3 files × 5 hunks returns a state map with all 15 hunks set to `true` |
| `INT-EC-002` | `expandAllHunks()` returns an empty Map (all hunks expanded by default) |
| `INT-EC-003` | `collapseFileHunks()` for a file with 10 hunks sets all 10 to collapsed; leaves other files unchanged |
| `INT-EC-004` | `expandFileHunks()` for a file with 10 collapsed hunks removes all entries for that file; leaves other files unchanged |
| `INT-EC-005` | `toggleHunk()` on an expanded hunk sets it to collapsed |
| `INT-EC-006` | `toggleHunk()` on a collapsed hunk sets it to expanded (removes from map) |
| `INT-EC-007` | `collapseAllHunks()` with 0 files returns an empty Map |
| `INT-EC-008` | `collapseAllHunks()` with a file containing 0 hunks (binary file) skips that file |
| `INT-EC-009` | `collapseAllHunks()` with 10,000 hunks completes within 10ms |
| `INT-EC-010` | `collapseAllHunks()` with 10,001 hunks completes without error (no artificial cap on inputs) |
| `INT-EC-011` | Collapsed hunk summary text generation: 1 line → `1 line hidden (line 42)` (singular) |
| `INT-EC-012` | Collapsed hunk summary text generation: 7 lines → `7 lines hidden (lines 42–48)` (plural, en-dash) |
| `INT-EC-013` | Collapsed hunk summary text generation: 10,437 lines → `10437 lines hidden (lines 1–10437)` (full integer, no abbreviation) |
| `INT-EC-014` | Summary text at width < 120 → `7 hidden` (abbreviated) |
| `INT-EC-015` | Summary text at width ≥ 120 → `7 lines hidden (lines 42–48)` (full) |
| `INT-EC-016` | State map handles file paths with unicode characters correctly |
| `INT-EC-017` | State map handles file paths with spaces correctly |
| `INT-EC-018` | State map handles duplicate file paths (should not occur in practice, but does not crash if encountered) |
