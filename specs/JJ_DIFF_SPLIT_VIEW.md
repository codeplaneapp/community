# JJ_DIFF_SPLIT_VIEW

Specification for JJ_DIFF_SPLIT_VIEW.

## High-Level User POV

When you're reviewing code changes in Codeplane — whether examining a jj change, browsing a landing request diff, or inspecting a conflict — you need to see what changed clearly. The split diff view gives you a side-by-side comparison where the old version of a file sits on the left and the new version sits on the right, letting you trace exactly how each line was transformed.

By default, Codeplane shows diffs in a unified view: additions and deletions interleaved in a single column. Pressing a toggle (a button on the web, the `t` key in the TUI) switches to split view, placing old content on the left pane with deletions highlighted in red and new content on the right pane with additions highlighted in green. Context lines — the unchanged lines surrounding your edits — appear identically on both sides so you can read the code in its full original and final forms simultaneously.

Split view is most valuable when you're reviewing non-trivial changes: a renamed function with body edits, a refactored block where lines were reordered, or a long file with scattered modifications. Unified view compresses everything into one vertical stream, which works well for small changes but becomes hard to follow when additions and deletions are interleaved across many hunks. Split view eliminates that mental overhead by showing you "what was" and "what is" side by side.

The two panes scroll together. When you scroll down in the left pane, the right pane moves in lockstep, keeping corresponding lines aligned. If a hunk has more deletions than additions (or vice versa), blank filler lines are inserted on the shorter side so context lines remain visually aligned. Hunk headers — the `@@` markers that indicate which line ranges are affected — span across both panes to visually anchor each section.

Split view adapts to your available space. On the web, it fills the content area with two equal-width columns and requires at least 768px of viewport width. In the TUI, split view requires at least 100 columns of content area (roughly 120 columns with the sidebar visible) to render usably; if your terminal is too narrow, Codeplane tells you so and keeps the unified view active. On wider terminals or large monitors, both panes expand to show more content per line, reducing horizontal scrolling.

Your view mode preference is remembered for the session. If you switch to split view while reviewing one file and then navigate to the next file, the split view stays active. If you toggle whitespace filtering, collapse or expand hunks, or resize the sidebar, the split view updates in place without resetting your preference. When you close the diff viewer and return later, the view resets to unified — the safe default for all screen sizes.

Split view is a presentation-layer feature. It does not change the underlying diff data, does not require additional API calls beyond the standard diff endpoint, and does not affect what other users see. It is a personal viewing preference that makes code review more comfortable for developers who prefer side-by-side comparison.

## Acceptance Criteria

### Definition of Done

- [ ] Users can toggle between unified and split diff view on the web UI via a clearly labeled segmented button control ("Unified" / "Split") in the diff toolbar
- [ ] Users can toggle between unified and split diff view in the TUI via the `t` key
- [ ] Split view renders two side-by-side panes: left pane shows old/deleted content, right pane shows new/added content
- [ ] Both panes scroll in synchronized lockstep — scrolling one pane scrolls the other identically
- [ ] Context (unchanged) lines appear identically on both sides at aligned vertical positions
- [ ] Filler/padding lines are inserted on the shorter side of asymmetric hunks to maintain vertical alignment
- [ ] Hunk headers (`@@` range markers) span the full width across both panes
- [ ] The feature works for all five change types: added, deleted, modified, renamed, and copied files
- [ ] The feature works in both change diff and landing request diff contexts
- [ ] The view mode preference persists across file navigation within a single diff session
- [ ] The view mode preference resets to unified when the diff viewer is closed and reopened
- [ ] Syntax highlighting renders correctly in both panes with per-file language detection
- [ ] All existing diff tests (unified view, syntax highlighting, keyboard navigation) continue to pass without regression
- [ ] No additional API calls are made when toggling to split view — it re-renders already-fetched diff data

### Boundary Constraints

- [ ] **Minimum width (TUI):** Split view requires ≥100 columns in the content area. With the default sidebar (25%), this means ≥120 total terminal columns. Below this threshold, pressing `t` shows a transient 3-second message ("Terminal too narrow for split view") and the view remains unified
- [ ] **Minimum width (Web):** Split view requires ≥768px viewport width. Below this, the split toggle is hidden and only unified view is available
- [ ] **Auto-revert on resize (TUI):** If the terminal is resized below the minimum while in split view, the view automatically reverts to unified with a flash notification. The user's preferred mode is remembered for restoration via `t` when width is sufficient again
- [ ] **Auto-revert on resize (Web):** If the browser viewport shrinks below 768px while in split view, the view automatically reverts to unified
- [ ] **Debounce on toggle:** Rapid-fire toggling (spamming `t`) is debounced at 100ms to prevent render thrashing
- [ ] **Line number gutter width:** Gutter adapts: 4 characters for narrow displays (<160 content columns), 5 characters for standard (120–159), 6 characters for wide (160+)
- [ ] **Maximum file size:** Files with more than 50,000 diff lines render with virtualized scrolling; no artificial truncation
- [ ] **Empty files:** A file with zero hunks (e.g., mode-only change) shows an informational message in both panes
- [ ] **Binary files:** Binary files display "Binary file changed" message spanning both panes; no split rendering of binary content
- [ ] **Renamed/copied files with no content change:** Both panes show identical content with a header indicating the rename/copy operation and both old_path and new path
- [ ] **Whitespace toggle interaction:** Toggling whitespace visibility (`w` in TUI, checkbox on web) while in split view re-fetches filtered diff and re-renders in split view without reverting to unified
- [ ] **Hunk collapse/expand interaction:** Collapsing a hunk in split view collapses it in both panes simultaneously; expanding restores both panes
- [ ] **Sidebar toggle interaction (TUI):** Toggling the sidebar (`Ctrl+B`) causes both split panes to resize proportionally to fill the freed/reduced space
- [ ] **Tab/focus behavior (Web):** Keyboard focus in either pane scrolls both panes. There is no independent scrolling of a single pane
- [ ] **Scroll position preservation:** Toggling between split and unified view preserves the logical line at the top of the viewport

### Edge Cases

- [ ] A diff with a single added line and zero deleted lines renders the added line on the right with a filler line on the left
- [ ] A diff with a single deleted line and zero added lines renders the deleted line on the left with a filler line on the right
- [ ] A change that touches 500+ files maintains split view across all file navigations without performance degradation
- [ ] A hunk with 1000+ consecutive additions inserts 1000+ filler lines on the left pane without visual artifacts
- [ ] A hunk with 10,001 lines (exceeding 10,000) still works correctly without error or truncation
- [ ] Unicode content (emoji, CJK characters, RTL text) renders in both panes without misalignment
- [ ] Very long lines (>500 characters) are handled via horizontal overflow (web: horizontal scroll; TUI: truncation with indicator)
- [ ] Switching to split view on an already-loaded diff does not re-fetch from the API
- [ ] Empty diffs (0 files changed) in split mode display "No file changes in this diff."
- [ ] Diff content containing literal `diff --git` text inside file content does not break pane rendering
- [ ] Concurrent resize and scroll operations do not cause render crashes
- [ ] Terminal at exactly 120 columns with sidebar visible: panes are narrow (~44 chars each) but scroll sync and alignment work correctly
- [ ] Rapid `t` presses (20 times in 1 second) result in consistent final state with no render artifacts
- [ ] File with 999,999 lines: line number gutter expands to 6 digits on both panes without layout breakage
- [ ] Tab characters render as 4 spaces in both panes identically
- [ ] Malformed or empty patch strings render as plain text without crashing either pane
- [ ] 16-color terminal fallback: background colors may degrade but `+`/`-` sign differentiation remains visible

## Design

### Web UI Design

**Toggle Control:**
A segmented button pair labeled "Unified" and "Split" appears in the diff toolbar, alongside the existing whitespace toggle and expand/collapse controls. The active mode is visually distinguished with a filled primary-color background and bold text. The toggle is hidden entirely on viewports narrower than 768px.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  [Unified] [Split]  │  ☐ Hide whitespace  │  Expand all  │  Copy│
├─────────────────────┬───────────────────┬──┬────────────────────┤
│  [File tree sidebar] │  Old (left pane)  │  │  New (right pane)  │
│                      │  Line#  Content   │  │  Line#  Content    │
│  file-a.ts       +3  │                   │  │                    │
│  file-b.rs      -12  │  42  fn old() {   │  │  42  fn new() {    │
│  file-c.py       +1  │  43  - removed    │  │  43  + added       │
│                      │  44    context     │  │  44    context     │
│                      │       ░░░ filler   │  │  45  + new line    │
└──────────────────────┴───────────────────┴──┴────────────────────┘
```

- Each pane occupies 50% of the available content width (after sidebar, if visible)
- A 1px vertical separator divides the panes in the theme's muted color
- Line number gutters are right-aligned within each pane; left gutter shows old line numbers, right gutter shows new line numbers
- Deleted lines: soft red background (`rgba(248, 81, 73, 0.10)`) on the left pane
- Added lines: soft green background (`rgba(63, 185, 80, 0.10)`) on the right pane
- Context lines: no special background, identical on both sides
- Filler/padding lines: neutral dimmed background (`rgba(128, 128, 128, 0.05)`) to distinguish from empty source lines; no line number
- Hunk headers: full-width bar spanning both panes, monospace, muted background (`#2d333b`), cyan text (`#768390`), showing `@@ line ranges @@` and scope name
- Inline word-level diff highlighting within changed lines: stronger tint (`rgba(248, 81, 73, 0.30)` for deletions, `rgba(63, 185, 80, 0.30)` for additions)
- Syntax highlighting applied to both panes with same language detection as unified view
- Per-file sticky header bar showing filename (or `old_path → path` for renames/copies), change type badge, and `+N −M` summary

**Scroll Synchronization (Web):**
Both panes are wrapped in a single virtual scroll container using CSS grid layout. The two columns scroll as one unit — there is no independent scrolling of left or right pane. This avoids desynchronization entirely.

**Responsive Behavior (Web):**
| Viewport Width | Behavior |
|---------------|----------|
| < 768px | Split toggle hidden; only unified view available |
| 768px – 1199px | Split available; panes may truncate long lines |
| ≥ 1200px | Full split view with comfortable line widths |

**State Persistence (Web):**
- View mode preference stored in the diff preferences store (`UI_CORE_STORES_DIFF_PREFERENCES`) and persisted to sessionStorage
- Preference persists across file navigation and whitespace/hunk toggle within the same diff session
- Navigating away from the diff and returning resets to unified (sessionStorage key cleared on navigation)
- URL does not change when view mode is toggled

**Keyboard Shortcuts (Web):**
All existing diff keyboard shortcuts work identically in split view. No additional shortcuts introduced.

### TUI UI Design

**Toggle:** Press `t` to toggle. Status bar shows `[unified]` or `[split]`.

**Layout (with sidebar):**
```
┌──────────┬─────────────────────┬─────────────────────┐
│ File     │ Old (deletions)     │ New (additions)      │
│ Tree     │ Line# │ Content     │ Line# │ Content      │
│ (25%)    │ (37.5%)             │ (37.5%)              │
└──────────┴─────────────────────┴─────────────────────┘
```

**Layout (sidebar hidden via `Ctrl+B`):**
```
┌──────────────────────────┬──────────────────────────┐
│ Old (deletions)          │ New (additions)           │
│ Line# │ Content          │ Line# │ Content           │
│ (50%)                    │ (50%)                     │
└──────────────────────────┴──────────────────────────┘
```

**Separator:** Single-character vertical border `│` (U+2502) in muted color.

**Color Scheme:**
- Left pane deletions: Red background (ANSI 52) with red sign text (ANSI 196)
- Right pane additions: Green background (ANSI 22) with green sign text (ANSI 34)
- Context lines: Default terminal colors on both sides
- Filler lines: Dim background (ANSI 236) with no content and no line number
- Hunk headers: Cyan (ANSI 37), bold, spanning both panes
- Line number gutter: Muted (`#888888`), deletion line numbers on `#4d1a1a` background, addition line numbers on `#1a4d1a` background

**Components:**
- `<DiffSplitView>` — Top-level container wrapping left/right `<scrollbox>` panes
- `<DiffPane side="old"|"new">` — Renders one side with line numbers and content
- `<DiffHunkHeader>` — Full-width hunk range display in cyan
- `<DiffSyncController>` — Manages scroll synchronization via shared scrollOffset ref

**Scroll Synchronization (TUI):**
Both panes share a `scrollOffset` ref. `j`/`k` updates the shared offset and both panes re-render at the new position in the same render frame. Filler lines are pre-inserted during hunk parsing to ensure line counts match. All scroll operations participate: `j`/`k`, `Ctrl+D`/`Ctrl+U`, `G`/`gg`, `]`/`[`, and mouse scroll.

**Mode State:**
- `viewMode`: `'unified'` | `'split'` (default `'unified'`)
- `preferredMode`: tracks user's explicit choice for post-auto-revert restoration
- `flashMessage`: string | null, auto-clears after 3 seconds
- `lastToggleTimestamp`: ref for debounce tracking (100ms)

**Responsive Behavior (TUI):**
| Available Content Columns | Behavior |
|--------------------------|----------|
| < 100 | Split disabled; `t` shows 3-second warning flash |
| 100 – 159 | Each pane 50%; 4–5 digit line number gutter |
| 160+ | Each pane 50%; 6-digit line number gutter |

On resize below 120 cols while in split: auto-revert to unified with flash message, preferred mode remembered. Resize back above 120 does NOT auto-restore — user presses `t`.

**Keyboard Reference (TUI):**
| Key | Action |
|-----|--------|
| `t` | Toggle unified/split view |
| `j` / `k` | Scroll both panes down/up one line |
| `Ctrl+D` / `Ctrl+U` | Page both panes half-height |
| `G` / `gg` | Jump both panes to bottom/top |
| `]` / `[` | Navigate both panes to next/previous file |
| `z` / `Z` | Collapse current/all hunks in both panes |
| `x` / `X` | Expand current/all hunks in both panes |
| `w` | Toggle whitespace (re-fetch, re-render in split) |
| `l` | Toggle line numbers in both panes |
| `Ctrl+B` | Toggle sidebar; panes resize proportionally |
| `?` | Help overlay (split view pauses, not dismissed) |
| `q` | Close diff screen |

### API Shape

**No new API endpoints or parameters are required.** Split view is a purely client-side presentation concern. It consumes the same endpoints:
- `GET /api/repos/:owner/:repo/changes/:change_id/diff`
- `GET /api/repos/:owner/:repo/landings/:number/diff`

The `file_diffs[].patch` field contains unified diff format, which the client-side parser splits into left/right line arrays.

### SDK Shape

**No new SDK types or methods are required.** The existing `ChangeDiff`, `FileDiffItem`, and `parseGitDiff()` in `packages/sdk` provide all data needed. A client-side utility function is added to the shared UI layer:

```typescript
interface DiffLine {
  type: 'addition' | 'deletion' | 'context' | 'filler';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface SplitHunkResult {
  left: DiffLine[];
  right: DiffLine[];
}

function splitHunkLines(patch: string): SplitHunkResult[];
```

This transforms unified diff hunks into paired arrays with filler line insertion. Invariant: after processing, `left.length === right.length` for every hunk.

### CLI Command

**No CLI changes.** The CLI outputs raw diff text or structured JSON. Split view is a visual rendering concept that does not apply to CLI output.

### Documentation

1. **Web UI guide section: "Viewing diffs in split mode"** — How to toggle split view from the toolbar, what the two panes represent, how scroll synchronization works, and responsive breakpoint behavior.
2. **TUI guide section: "Split diff view"** — How to toggle with `t`, minimum terminal width requirements (120 columns with sidebar), how the sidebar interacts with split panes, and a note that the preference is session-scoped.
3. **Keyboard shortcuts reference update** — Add `t` to the TUI and Web keyboard shortcuts tables with description "Toggle unified/split diff view".
4. **FAQ entry: "Why can't I see the split view button/toggle?"** — Explain minimum width requirements (768px web, 120 columns TUI) and how to widen the terminal or browser window.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Anonymous | Can use split view on public repository diffs |
| Read-only member | Can use split view on repositories they have read access to |
| Member / Write | Can use split view |
| Admin | Can use split view |
| Owner | Can use split view |

Split view is a client-side presentation toggle. It does not introduce any new data access. If a user can see the unified diff, they can see the split diff — the underlying data is identical. No additional authorization checks are required beyond the existing repository read access enforced by the diff API endpoint.

### Rate Limiting

No additional rate limiting is required. Split view does not generate additional API calls — it re-renders data already fetched by the diff endpoint. The whitespace toggle while in split view triggers the same re-fetch that it would in unified view, subject to the same rate limits documented in JJ_CHANGE_DIFF:
- Authenticated users: 300 requests/minute per user per repository
- Anonymous users: 60 requests/minute per IP per repository

The client-side debounce on toggle (100ms) prevents accidental rapid toggling from causing render issues, but since no API calls are involved, this is a UX concern rather than a rate-limiting concern.

### Data Privacy

- **No new PII exposure.** Split view renders the same source code content visible in unified view. No additional data is fetched, stored, or transmitted.
- **View mode preference** is stored in client-side session state only (component state in TUI, sessionStorage in web). It is not persisted to any server, database, or analytics store as PII.
- **No diff content duplication.** The raw API response is parsed once and rendered in two columns. No additional copies of source code are created beyond the existing in-memory representation.
- **Input sanitization:** The `viewMode` variable accepts only the string literals `'unified'` or `'split'`. No user-supplied string input is interpolated. The `t` keypress is the sole input mechanism.
- **No token transmission.** Toggling between view modes and scrolling in split view never transmit authentication tokens or make network requests.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `DiffViewModeToggled` | User toggles between unified and split | `from_mode` ("unified" \| "split"), `to_mode` ("unified" \| "split"), `client` ("web" \| "tui"), `viewport_width` (px for web, columns for TUI), `file_count` (number of files in current diff), `context` ("change" \| "landing_request"), `sidebar_visible` (boolean), `session_id` |
| `DiffSplitViewBlocked` | User attempts split view but viewport is too narrow | `client` ("web" \| "tui"), `viewport_width`, `minimum_required` (768 for web, 120 for TUI), `context` ("change" \| "landing_request"), `session_id` |
| `DiffSplitViewAutoReverted` | Split view auto-reverts to unified due to viewport resize | `client` ("web" \| "tui"), `new_viewport_width`, `previous_viewport_width`, `duration_in_split_seconds` (how long the user was in split before auto-revert), `session_id` |
| `DiffSplitViewSessionSummary` | Fired when diff viewer is closed | `total_time_in_unified_seconds`, `total_time_in_split_seconds`, `toggle_count`, `files_viewed_in_split`, `files_viewed_in_unified`, `client`, `context`, `session_id` |

### Properties Attached to All Events

| Property | Description |
|----------|-------------|
| `user_id` | Authenticated user identifier (null for anonymous) |
| `session_id` | Client session identifier |
| `timestamp` | ISO 8601 event timestamp |
| `repo_owner` | Repository owner |
| `repo_name` | Repository name |

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Split view adoption rate | >15% of diff sessions within 90 days | % of diff sessions where the user toggles to split view at least once |
| Split view retention | >50% of users who try it | Of users who try split view, % who use it again in their next diff session |
| Split view preference distribution | Track trend | Ratio of time spent in split vs unified across all sessions; informs whether the default should change |
| Blocked toggle rate | <15% | % of `DiffSplitViewBlocked` events relative to total split toggle attempts; if high, consider lowering minimum width |
| Auto-revert rate | <5% of split sessions | % of split view sessions ending via auto-revert; if high, users are on the edge of the width threshold |
| Zero increase in diff load time | P95 unchanged | Split view is client-side only; diff page load time should not increase |
| TUI crash rate from diff screen | 0% | No crashes attributable to split view rendering |
| Multi-file navigation in split | >40% | % of split view sessions where user navigates to ≥2 files (indicates sustained usage) |

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------|
| Split view toggled | `debug` | `from_mode`, `to_mode`, `client`, `viewport_width`, `session_id` |
| Split view blocked (too narrow) | `info` | `client`, `viewport_width`, `minimum_required`, `session_id` |
| Split view auto-reverted due to resize | `info` | `client`, `new_viewport_width`, `previous_viewport_width`, `session_id` |
| Hunk parse for split layout started | `debug` | `file_path`, `hunk_count`, `total_lines`, `session_id` |
| Hunk parse for split layout completed | `debug` | `file_path`, `left_lines`, `right_lines`, `filler_lines_inserted`, `parse_duration_ms`, `session_id` |
| Split view render completed | `debug` | `file_count`, `total_rendered_lines`, `render_duration_ms`, `client`, `session_id` |
| Scroll sync activated | `info` | `terminal_width`, `file_count`, `session_id` |
| Scroll sync deactivated | `info` | `trigger` (keypress \| resize), `terminal_width`, `session_id` |
| Scroll sync desynchronized (should not happen) | `warn` | `left_offset`, `right_offset`, `expected_offset`, `session_id` |
| Scroll sync recovery via navigation | `warn` | `method` (jump_top \| file_nav), `previous_left`, `previous_right`, `session_id` |
| Split view render error | `error` | `error_message`, `file_path`, `hunk_index`, `viewport_width`, `client`, `session_id` |
| Filler line alignment assertion failure | `error` | `left_count`, `right_count`, `file_path`, `hunk_index`, `session_id` |

Note: Since split view is client-side, most logging occurs in the client (browser console or TUI stderr). Server-side logging is unchanged — the diff API endpoint logs are identical regardless of which view mode the client uses.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_diff_view_mode_toggles_total` | Counter | `from_mode`, `to_mode`, `client` | Total view mode toggle events |
| `codeplane_diff_split_view_blocked_total` | Counter | `client` | Times split view was requested but blocked due to narrow viewport |
| `codeplane_diff_split_view_auto_reverted_total` | Counter | `client` | Times split view auto-reverted to unified due to resize |
| `codeplane_diff_split_hunk_parse_duration_seconds` | Histogram | `client` | Duration of client-side hunk parsing for split view layout |
| `codeplane_diff_split_view_session_duration_seconds` | Histogram | `client` | Duration of time spent in split view per diff session |
| `codeplane_diff_split_render_duration_ms` | Histogram | `client` | Time to render split view panes (target <50ms TUI, <100ms web) |

Note: Client-side metrics are collected via the telemetry event pipeline and aggregated server-side.

### Alerts

#### `DiffSplitViewHighBlockRate`
- **Condition:** `rate(codeplane_diff_split_view_blocked_total[1h]) / rate(codeplane_diff_view_mode_toggles_total{to_mode="split"}[1h]) > 0.3`
- **Severity:** Info
- **Runbook:**
  1. This is a product signal, not an engineering emergency. It means >30% of users attempting split view are being blocked by narrow viewports.
  2. Check `viewport_width` distribution in telemetry events to understand the user base's typical screen sizes.
  3. Evaluate whether the minimum width threshold (768px web, 120 cols TUI) can be lowered without degrading readability.
  4. Consider adding a tooltip or onboarding hint about minimum width requirements.
  5. If the rate is >50%, escalate to product team for threshold adjustment decision.

#### `DiffSplitRenderSlow`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_diff_split_render_duration_ms_bucket{client="tui"}[5m])) > 100`
- **Severity:** Warning
- **Runbook:**
  1. Check if a specific file or diff size is causing slow renders by correlating with `file_path` and `total_lines` from debug logs.
  2. Profile the hunk parsing function `splitHunkLines()` — large hunks with 1000+ lines may need batched rendering.
  3. Verify that filler line insertion is not creating O(n²) behavior for very asymmetric hunks.
  4. Check whether syntax highlighting is blocking the render path; it should be async/deferred.
  5. If isolated to TUI, check if the terminal emulator or SSH connection is the bottleneck.
  6. If isolated to web, check if DOM node count from filler lines is causing layout thrashing — virtualize rendering.

#### `DiffSplitViewCrash`
- **Condition:** Any client-side error report from the diff split view component with `error_level: "fatal"`
- **Severity:** Critical
- **Runbook:**
  1. Reproduce the crash using the `file_path`, `hunk_index`, and `viewport_width` from the error report.
  2. Check for division-by-zero in pane width calculation when viewport is at exact threshold boundary (768px web, 120 cols TUI).
  3. Check for out-of-bounds array access in the filler line insertion logic when one side of a hunk has zero lines.
  4. Verify that the `scrollOffset` ref is not being updated after component unmount (race condition on rapid toggle + navigation).
  5. Check if the `left.length === right.length` alignment invariant was violated — examine `filler_line_alignment_assertion_failure` error logs.
  6. Deploy a hotfix with the narrowest possible guard clause; ensure crash fallback renders unified view rather than a blank screen.
  7. Verify the error boundary catches the throw and offers `R` to retry (TUI) or a reload prompt (web).

#### `DiffSplitScrollDesync`
- **Condition:** `rate(codeplane_diff_scroll_sync_desynchronized_total[1h]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Scroll desynchronization means the left and right panes are at different scroll offsets, which should never happen.
  2. Check if the `syncScroll` prop is being correctly set to `true` on the `<diff>` component — an OpenTUI version mismatch may ignore the prop.
  3. Check for race conditions between resize events and scroll events (concurrent resize + keypress).
  4. Verify that mouse scroll events in one pane are propagating to the other pane via the shared scroll controller.
  5. Users can self-recover by pressing `gg` (jump to top) or `]`/`[` (file navigation), which resets scroll position.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Hunk parser produces misaligned left/right arrays | `left.length !== right.length` after parse | Visual misalignment in split view | Assert invariant after filler insertion; fall back to unified if assertion fails; log error |
| Scroll sync desynchronizes after rapid navigation | Left/right panes at different offsets | Confusing UX | Reset scroll offset to 0 on file navigation; re-synchronize on detected divergence |
| Viewport resize during render cycle | Stale dimensions used for layout | Panes overlap or overflow | Debounce resize handler at 100ms; re-measure before each render |
| Memory pressure from very large split diffs (500+ files) | Excessive RAM usage | Slowdown or crash | Virtualize rendering: only render visible rows plus 50-line buffer |
| Filler line insertion for 10,000+ line asymmetric hunk | Excessive DOM/Ink elements | Render stall | Cap rendered filler lines to viewport height + buffer; lazy-render remainder |
| Syntax highlighting failure for one pane | One pane colored, other plain | Inconsistent visuals | Catch highlighting errors per-pane; degrade both panes to plain text if either fails |
| OpenTUI `syncScroll` prop unsupported (version mismatch) | Panes scroll independently | Degraded UX | Fall back to unified-only with warn log; document minimum OpenTUI version requirement |
| 16-color terminal | Background colors invisible | Reduced diff clarity | Fall back to `+`/`-` sign differentiation without background colors |

## Verification

### Web UI E2E Tests (Playwright)

| Test ID | Description |
|---------|-------------|
| `WEB-SPLIT-001` | Navigate to a change diff page → verify the unified/split toggle control is visible in the toolbar |
| `WEB-SPLIT-002` | Click the "Split" toggle → verify two side-by-side panes render with a vertical separator |
| `WEB-SPLIT-003` | In split view, verify the left pane shows deleted lines with red background and the right pane shows added lines with green background |
| `WEB-SPLIT-004` | In split view, verify context (unchanged) lines appear identically on both sides |
| `WEB-SPLIT-005` | In split view, scroll down → verify both panes scroll together (check scroll position of both containers) |
| `WEB-SPLIT-006` | In split view with an asymmetric hunk (more deletions than additions), verify filler/padding lines appear on the right pane to maintain alignment |
| `WEB-SPLIT-007` | In split view with an asymmetric hunk (more additions than deletions), verify filler/padding lines appear on the left pane |
| `WEB-SPLIT-008` | In split view, verify hunk headers (`@@` lines) span the full width across both panes |
| `WEB-SPLIT-009` | Click the "Unified" toggle → verify the view returns to single-column unified mode |
| `WEB-SPLIT-010` | Toggle to split → navigate to next file via file tree → verify split view persists for the new file |
| `WEB-SPLIT-011` | Toggle to split → toggle whitespace filtering → verify split view persists and filtered diff renders in split |
| `WEB-SPLIT-012` | Toggle to split → collapse a hunk → verify the hunk collapses in both panes simultaneously |
| `WEB-SPLIT-013` | Toggle to split → expand a collapsed hunk → verify both panes expand |
| `WEB-SPLIT-014` | On a viewport width < 768px, verify the split/unified toggle is not visible |
| `WEB-SPLIT-015` | On a viewport width of exactly 768px, verify the toggle is visible and split view works |
| `WEB-SPLIT-016` | Toggle to split at 1200px width → resize browser to 600px → verify auto-revert to unified view |
| `WEB-SPLIT-017` | After auto-revert, resize back to 1200px → verify the toggle is available again (but view remains unified until manually toggled) |
| `WEB-SPLIT-018` | In split view, verify line numbers are displayed independently on both panes (left shows old line numbers, right shows new) |
| `WEB-SPLIT-019` | In split view for a binary file, verify "Binary file changed" message spans both panes |
| `WEB-SPLIT-020` | In split view for an added file (no old content), verify the left pane shows all filler lines and right pane shows all added lines |
| `WEB-SPLIT-021` | In split view for a deleted file (no new content), verify the right pane shows all filler lines and left pane shows all deleted lines |
| `WEB-SPLIT-022` | In split view for a renamed file with content changes, verify the header shows old_path → new_path and both panes render the diff |
| `WEB-SPLIT-023` | In split view, verify syntax highlighting renders on both panes for a TypeScript file |
| `WEB-SPLIT-024` | In split view, verify word-level inline diff highlighting (specific changed tokens have stronger background) |
| `WEB-SPLIT-025` | Navigate to a landing request diff → toggle split → verify it works identically to change diff split view |
| `WEB-SPLIT-026` | In split view with a diff containing 100+ files → navigate through multiple files → verify no performance degradation (page remains responsive) |
| `WEB-SPLIT-027` | In split view, verify keyboard navigation (arrow keys, Page Down/Up) scrolls both panes |
| `WEB-SPLIT-028` | Toggle split → close diff viewer → reopen same diff → verify view starts in unified (preference does not persist across sessions) |
| `WEB-SPLIT-029` | Rapidly click the toggle 10 times → verify no visual glitches and the final state is consistent |
| `WEB-SPLIT-030` | In split view for a file with lines >500 characters, verify horizontal overflow is handled (horizontal scroll or truncation) |

### TUI E2E Tests

| Test ID | Description |
|---------|-------------|
| `TUI-SPLIT-001` | Open diff view at 120×40 terminal → press `t` → verify split layout renders with two panes and vertical separator (│) → press `t` again → verify unified view restores |
| `TUI-SPLIT-002` | In split mode → verify left pane shows red-highlighted deletions and right pane shows green-highlighted additions via terminal snapshot |
| `TUI-SPLIT-003` | In split mode → verify both panes display independent line numbers matching old (left) and new (right) file line counts |
| `TUI-SPLIT-004` | In split mode with a long diff → press `j` 5 times → verify both panes scroll together (snapshot at scroll position) |
| `TUI-SPLIT-005` | In split mode with unequal hunks (10 deletions, 3 additions) → verify 7 filler lines inserted on right pane to maintain alignment |
| `TUI-SPLIT-006` | In split mode → press `]` → verify next file renders in split mode with correct content → press `[` → verify previous file returns |
| `TUI-SPLIT-007` | In split mode → press `z` to collapse current hunk → verify both panes show collapsed summary → press `x` → verify both panes expand |
| `TUI-SPLIT-008` | In split mode → press `w` → verify whitespace changes hidden/shown and split view maintained |
| `TUI-SPLIT-009` | Set terminal to 80×24 → open diff → press `t` → verify warning message "Terminal too narrow for split view" appears and view stays unified |
| `TUI-SPLIT-010` | Set terminal to 119×40 → press `t` → verify warning appears (below 120 threshold with sidebar) |
| `TUI-SPLIT-011` | In split mode at 120×40 → press `Ctrl+B` to hide sidebar → verify panes resize to fill full width (50%/50%) |
| `TUI-SPLIT-012` | In split mode → press `Ctrl+B` to show sidebar → verify panes shrink to accommodate sidebar |
| `TUI-SPLIT-013` | In split mode → verify hunk headers span full width across both panes in cyan |
| `TUI-SPLIT-014` | In split mode → press `Ctrl+D` → verify half-page scroll in both panes → press `Ctrl+U` → verify reverse |
| `TUI-SPLIT-015` | In split mode → press `G` → verify jump to bottom in both panes → press `gg` → verify jump to top |
| `TUI-SPLIT-016` | Switch to split at 160×50 terminal → verify 6-digit line number gutters on both panes |
| `TUI-SPLIT-017` | Open diff for binary file → toggle to split → verify "Binary file changed" message spans both panes |
| `TUI-SPLIT-018` | Open diff for empty change (0 files) → toggle to split → verify "No changes" message |
| `TUI-SPLIT-019` | Open diff for added file → toggle to split → verify left pane is all filler, right pane shows all added lines |
| `TUI-SPLIT-020` | Open diff for deleted file → toggle to split → verify right pane is all filler, left pane shows all deleted lines |
| `TUI-SPLIT-021` | Toggle to split → navigate through 10 files with `]` → verify no crash, no memory leak indicators, consistent rendering |
| `TUI-SPLIT-022` | In split mode → verify syntax highlighting renders on both panes for a multi-language diff |
| `TUI-SPLIT-023` | Press `t` 20 times rapidly → verify debounce prevents render thrashing and final state is correct |
| `TUI-SPLIT-024` | In split mode at 120 cols → simulate terminal resize to 80 cols → verify auto-revert to unified with no crash |
| `TUI-SPLIT-025` | After auto-revert → resize back to 120 cols → verify `t` can re-enable split view |
| `TUI-SPLIT-026` | In split mode → press `?` → verify help overlay shows and lists `t` shortcut → dismiss overlay → verify split view is still active |
| `TUI-SPLIT-027` | In split mode → press `q` → verify diff screen closes cleanly |
| `TUI-SPLIT-028` | Open landing request diff → toggle to split → verify inline comments (if present) render correctly in the appropriate pane |

### API Integration Tests

| Test ID | Description |
|---------|-------------|
| `API-SPLIT-001` | Verify `GET /api/repos/:owner/:repo/changes/:change_id/diff` response contains `patch` field in standard unified diff format parseable by the client-side split hunk parser |
| `API-SPLIT-002` | Verify that the diff response for a renamed file includes both `path` and `old_path`, enabling the split view to label panes correctly |
| `API-SPLIT-003` | Verify that `?whitespace=ignore` combined with split view client-side rendering produces correct filtered output with aligned filler lines |

### Client-Side Integration Tests (Hunk Parser — `splitHunkLines`)

| Test ID | Description |
|---------|-------------|
| `PARSE-SPLIT-001` | `splitHunkLines` for a simple modification produces equal-length left/right arrays with correct line content |
| `PARSE-SPLIT-002` | `splitHunkLines` for a pure addition (no deletions) produces right array with content and left array with only filler lines |
| `PARSE-SPLIT-003` | `splitHunkLines` for a pure deletion (no additions) produces left array with content and right array with only filler lines |
| `PARSE-SPLIT-004` | `splitHunkLines` for mixed additions/deletions interleaved with context lines maintains correct alignment |
| `PARSE-SPLIT-005` | `splitHunkLines` for a hunk with 10,000 consecutive additions produces exactly 10,000 filler lines on the left |
| `PARSE-SPLIT-006` | `splitHunkLines` for a hunk with 10,001 lines (exceeding 10,000) still works correctly without error |
| `PARSE-SPLIT-007` | `splitHunkLines` for empty patch input returns two empty arrays |
| `PARSE-SPLIT-008` | `splitHunkLines` for a patch with only context lines (no +/- lines) produces identical left/right arrays |
| `PARSE-SPLIT-009` | `splitHunkLines` preserves unicode characters (emoji, CJK) in line content |
| `PARSE-SPLIT-010` | `splitHunkLines` handles lines containing literal `+` and `-` characters in content (not diff markers) correctly |
| `PARSE-SPLIT-011` | `splitHunkLines` for a renamed file with content changes produces correct old_path content on left and new_path content on right |
| `PARSE-SPLIT-012` | `splitHunkLines` for multiple hunks in a single file produces correctly separated hunk groups with independent alignment |
| `PARSE-SPLIT-013` | `splitHunkLines` always produces `left.length === right.length` for every hunk (invariant test across 50 randomized inputs) |
| `PARSE-SPLIT-014` | `splitHunkLines` for a patch containing tab characters preserves them without conversion |

### Scroll Synchronization Tests (TUI)

| Test ID | Description |
|---------|-------------|
| `SYNC-SPLIT-001` | Split view both panes at scroll top (120×40) — context lines aligned |
| `SYNC-SPLIT-002` | `j` ×5 from top → both panes at line 6+ with matching content |
| `SYNC-SPLIT-003` | `k` at top → no-op, both panes stay at position 0 |
| `SYNC-SPLIT-004` | `Ctrl+D` from top → both panes down half visible height |
| `SYNC-SPLIT-005` | `G` from top → both panes at bottom of file |
| `SYNC-SPLIT-006` | `gg` after `G` → both panes at top |
| `SYNC-SPLIT-007` | `]` in file 1 → both panes at top of file 2 |
| `SYNC-SPLIT-008` | Rapid `j` ×20 in <1s → both panes at line 21, no desync |
| `SYNC-SPLIT-009` | `t` to unified, scroll, `t` to split → scroll position preserved |
| `SYNC-SPLIT-010` | `w` while scrolled → both panes re-render at preserved position after re-fetch |

### Responsive Tests

| Test ID | Description |
|---------|-------------|
| `RSP-SPLIT-001` | 80×24 — split rejected with flash message |
| `RSP-SPLIT-002` | 119×40 — split rejected (below threshold with sidebar) |
| `RSP-SPLIT-003` | 120×40 — split available and works correctly |
| `RSP-SPLIT-004` | 200×60 — split with wide panes and 6-digit gutters |
| `RSP-SPLIT-005` | 120→80 resize while in split → auto-revert to unified, scroll preserved |
| `RSP-SPLIT-006` | 80→120 resize after auto-revert → stays unified (no auto-restore) |
| `RSP-SPLIT-007` | 120→200 resize while in split → panes widen, position preserved |
| `RSP-SPLIT-008` | Web: 1200px → 600px resize → auto-revert |
| `RSP-SPLIT-009` | Web: exactly 768px → split available and functional |
| `RSP-SPLIT-010` | Web: 767px → split toggle hidden |
