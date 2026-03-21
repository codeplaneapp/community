# TUI_REPO_CONFLICTS_VIEW

Specification for TUI_REPO_CONFLICTS_VIEW.

## High-Level User POV

The conflicts view is the fourth tab within the repository detail screen. When a user navigates to a repository and switches to the Conflicts tab (tab `4`), they see a complete inventory of all jj-native conflicts across changes in that repository. Conflicts are a first-class jj concept — they occur when merging or rebasing produces file-level content disagreements that jj preserves rather than aborting. This view answers the developer's question: "what conflicts exist in this repo, which changes have them, which files are affected, and what type of conflict is each one?"

The conflicts view is organized as a two-level hierarchy. At the top level, conflicted changes are listed — each row shows the short change ID, short commit ID, the change description (first line), author, and a count of conflicted files within that change. Changes with more conflicts sort higher. The focused change is highlighted with reverse-video styling. Pressing `Enter` on a focused change expands it inline to reveal the individual conflicted files underneath, each showing the file path and conflict type (e.g., "2-sided conflict", "modify-delete conflict"). Pressing `Enter` again on the same change collapses the inline file list.

When a change is expanded and the user navigates into the file list with `j`/`k`, each file row becomes individually focusable. Pressing `Enter` on a focused file pushes a diff view for that specific file within the conflicted change, showing the conflict markers and the base/left/right content where available. Pressing `d` on a focused file row also opens the diff view. Pressing `v` on a focused change row pushes the full change detail screen for that change.

At the top of the conflicts view is a section header showing "Conflicts (N changes, M files)" where N is the total number of conflicted changes and M is the total number of conflicted files across all changes. A warning-colored `⚠` icon precedes the header when any unresolved conflicts exist. If all conflicts are resolved, the icon changes to a success-colored `✓`. Below the header, pressing `/` activates an inline filter that narrows both the change list and file list by file path substring match (case-insensitive).

Resolved conflicts are distinguished from unresolved ones. Resolved files show a `✓` prefix in success (green) color and a strikethrough on the file path. Unresolved files show a `✗` prefix in warning (yellow) color. A toggle keybinding `h` controls whether resolved conflicts are visible — by default, resolved conflicts are hidden to keep the view focused on actionable items. Pressing `h` toggles between "show all" and "hide resolved" modes, with the current mode indicated in the section header.

The user can press `R` at any time to hard-refresh the conflict data from the API. Since conflicts change as the user works with jj (resolving conflicts, rebasing, merging), staleness is expected and the refresh action is prominent. At minimum terminal width (80×24), the view collapses to show only change IDs, conflict counts, and file paths. At standard width (120×40), descriptions and conflict types become visible. At large width (200×60+), author names, timestamps, and resolution methods are also displayed.

If the repository has no conflicts (the happy path for a healthy repo), the content area shows a centered success-colored message: "No conflicts. All clear! ✓". If the API request fails, an inline error replaces the list content with the error description and "Press `R` to retry."

## Acceptance Criteria

### Definition of Done

- The Conflicts tab (tab `4`) renders a hierarchical list of conflicted changes and their conflicted files for the current repository
- Conflicts are fetched via `useRepoConflicts()` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/changes?has_conflict=true` and then `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` for each conflicted change
- The section header shows "Conflicts (N changes, M files)" with accurate aggregate counts
- A `⚠` icon in `warning` color precedes the header when unresolved conflicts exist; `✓` in `success` color when all are resolved
- Changes are sorted by conflict file count (descending), then change ID (ascending) as tiebreaker
- Each change row displays: short change ID (12 chars), short commit ID (12 chars), description (first line, truncated), conflict file count badge, author name (at standard+ width)
- `j`/`k` (and `Down`/`Up` arrow keys) move the focus cursor through the list (both change-level and file-level rows)
- `Enter` on a focused change row toggles inline expansion of its conflicted files
- `Enter` on a focused file row pushes the diff view for that file within the parent change
- `d` on a focused file row pushes the diff view for that file
- `v` on a focused change row pushes the change detail screen
- Resolved files show `✓` prefix in `success` color; unresolved files show `✗` prefix in `warning` color
- `h` toggles visibility of resolved conflicts (default: hidden)
- `/` activates an inline filter input that narrows the list by file path substring match (case-insensitive)
- `Esc` while the filter input is focused clears the filter text, returns focus to the list
- `x` expands all change rows; `z` collapses all change rows
- `R` triggers a hard refresh of conflict data from the API
- Empty state (no conflicts) shows "No conflicts. All clear! ✓" in `success` color centered in the content area
- Loading state shows a spinner with "Loading…" centered in the content area
- API errors display inline error message with "Press `R` to retry" hint
- Auth errors (401) propagate to the app-shell-level auth error screen
- Rate limit errors (429) display the retry-after period inline

### Keyboard Interactions

- `j` / `Down`: Move focus to next row (change or file)
- `k` / `Up`: Move focus to previous row (change or file)
- `Enter`: Toggle expand/collapse on change row; open diff view on file row
- `d`: Open diff view for focused file row
- `v`: Open change detail for focused change row
- `/`: Focus the filter input
- `Esc`: Clear filter input and return focus to list
- `h`: Toggle resolved conflict visibility
- `G`: Jump to the last row
- `g g`: Jump to the first row
- `Ctrl+D`: Page down within the scrollbox
- `Ctrl+U`: Page up within the scrollbox
- `x`: Expand all change rows
- `z`: Collapse all change rows
- `R`: Refresh conflict list (hard re-fetch from API)
- `Tab` / `Shift+Tab`: Switch to next/previous repository tab

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router — conflicts view not rendered
- 80×24 – 119×39 (minimum): Change rows show: change ID (12ch) │ conflict count badge. File rows show: status icon │ file path (remaining width). Description, commit ID, author, conflict type hidden
- 120×40 – 199×59 (standard): All standard columns visible. Change rows: change ID, commit ID, description (30ch), author (15ch), conflict count. File rows: status icon, file path (40ch), conflict type (20ch)
- 200×60+ (large): Expanded layout. Change rows add timestamp. File rows add resolution method (15ch) and resolved-by (15ch)

### Truncation and Boundary Constraints

- Change `description`: truncated to first line only, then with trailing `…` at column width (30/50 chars at standard/large). Max 200 characters from API
- Change ID display: always 12 characters (short form). Never truncated, hidden if insufficient width
- Commit ID display: always 12 characters (short form). Never truncated, hidden if insufficient width
- File path: truncated with trailing `…` from the left (showing the filename end) when exceeding column width. Paths can be up to 4096 characters
- Conflict type: displayed as-is from jj output. Truncated with `…` if exceeding 20/25 chars
- Author name: truncated with `…` at 20 chars
- Conflict count badge: "(N files)" where N max 4 digits
- Filter input: max 200 characters
- Maximum loaded conflicted changes in memory: 500 items
- Maximum conflicted files per change in memory: 1000 items
- Indent depth for file rows under an expanded change: 2 spaces

### Edge Cases

- Terminal resize while scrolled: scroll position preserved relative to focused item
- Rapid `j` presses: processed sequentially, no debouncing
- Filter during loading: filter input is disabled until initial data load completes
- SSE disconnect: conflicts view is REST-based and unaffected
- Unicode in file paths: truncation respects grapheme clusters
- Repository with zero conflicts: empty state rendered; all navigation keys function (no-op on list)
- All conflicts resolved with hide-resolved active: shows "All conflicts resolved. Press `h` to show resolved." message
- API returns 501 (not implemented): inline error shows "Conflicts endpoint not available. Backend may need updating."
- Expanding a change while filter is active: only matching files shown
- Collapse with child file focused: focus moves to parent change row
- Network error mid-expansion: partial data shown with inline error
- Very large number of conflicted changes (100+): loading progress indicator

## Design

### Layout Structure

The conflicts view occupies the tab content area below the repository tab bar:

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo                 ● SYNCED 🔔 3│
├─────────────────────────────────────────────────────────────┤
│ owner/repo                          PUBLIC    ★ 42          │
│ Description text here...                                    │
├─────────────────────────────────────────────────────────────┤
│  1:Bookmarks  2:Changes  3:Code [4:Conflicts] 5:OpLog  6:S │
├─────────────────────────────────────────────────────────────┤
│ ⚠ Conflicts (3 changes, 7 files) — unresolved  / filter  R │
│                                                             │
│  ▸ ksxypqvm1234  abc123  Fix auth flow           (3 files)  │
│  ▾ mzrlnwop5678  def456  Refactor parser         (2 files)  │
│      ✗ src/parser/mod.rs         2-sided conflict           │
│      ✗ src/parser/lexer.rs       modify-delete conflict     │
│  ▸ qrst9012abcd  ghi789  Update config            (2 files) │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:expand/diff  v:view  h:toggle   ? help │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure

Uses `<box>` for layout with `flexDirection="column"`. Section header as a single-height row with `⚠`/`✓` icon, "Conflicts" label in `primary`, aggregate counts in `muted`, mode indicator, and right-aligned filter/refresh hints. Filter `<input>` shown conditionally. Main content in `<scrollbox>` with nested `<box>` per change: a change row with expand indicator (`▸`/`▾`), change ID, optional commit ID/description/author columns, and conflict count badge. Expanded changes render child file rows with 5-char indent, resolution icon (`✓`/`✗`), file path, and optional conflict type/resolution columns. Empty state and all-resolved state as centered `<text>` elements.

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move focus down | List focused, not in filter |
| `k` / `Up` | Move focus up | List focused, not in filter |
| `Enter` | Toggle expand/collapse (change) or open diff (file) | Row focused |
| `d` | Open diff view | File row focused |
| `v` | Open change detail | Change row focused |
| `/` | Activate filter input | List focused |
| `Esc` | Clear filter / return to list | Context-dependent |
| `h` | Toggle resolved visibility | Any state |
| `G` | Jump to last row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` | Page down | List focused |
| `Ctrl+U` | Page up | List focused |
| `x` | Expand all changes | List focused |
| `z` | Collapse all changes | List focused |
| `R` | Refresh from API | Any state |

### Focus Traversal

The focus cursor traverses a flattened list: change rows are always present; file rows under expanded changes are inserted after their parent. Collapsed changes skip file rows. Resolved files skipped in hide-resolved mode. Filtered-out files skipped. When a change collapses with a child focused, focus moves to the parent.

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useRepoConflicts()` | `@codeplane/ui-core` | Fetch conflicted changes and file-level conflicts. Returns `{ changes, totalChangeCount, totalFileCount, isLoading, error, refresh }` |
| `useRepo()` | `@codeplane/ui-core` | Repository metadata and permission check |
| `useUser()` | `@codeplane/ui-core` | Current user profile |
| `useKeyboard()` | `@opentui/react` | Keybinding registration |
| `useTerminalDimensions()` | `@opentui/react` | Responsive breakpoints |
| `useOnResize()` | `@opentui/react` | Synchronous re-layout on resize |

### Navigation Context

- `Enter`/`d` on file row → `push("diff-view", { repo, changeId, filePath })`. Breadcrumb: "Dashboard > owner/repo > Conflicts > {change_id} > {filename}"
- `v` on change row → `push("change-detail", { repo, changeId })`. Breadcrumb: "Dashboard > owner/repo > Conflicts > {change_id}"

### Responsive Column Layout

- **80×24**: Change: `│ ▸ change_id (12ch) │ (N files) │`. File: `│     ✗ file_path (remaining) │`
- **120×40**: Change: `│ ▸ change_id │ commit_id │ description (30ch) │ author (15ch) │ (N files) │`. File: `│     ✗ file_path (40ch) │ conflict_type (20ch) │`
- **200×60**: Change adds timestamp. File adds resolution_method (15ch) and resolved_by (15ch)

### Status Bar Hints

List focused: `j/k:navigate  Enter:expand/diff  v:view change  d:diff  h:toggle resolved  R:refresh  ?:help`
Filter focused: `Type to filter by path  Esc:clear`

### Help Overlay — Conflicts Group

```
── Conflicts ────────────────────────
j / Down           Next row
k / Up             Previous row
Enter              Expand change / open file diff
d                  Open file diff
v                  View change detail
/                  Filter by file path
h                  Toggle resolved visibility
x                  Expand all changes
z                  Collapse all changes
R                  Refresh list
G                  Jump to bottom
g g                Jump to top
```

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View conflicts list | ❌ (TUI requires auth) | ✅ | ✅ | ✅ |
| View file diff from conflicts | ❌ | ✅ | ✅ | ✅ |
| View change detail from conflicts | ❌ | ✅ | ✅ | ✅ |
| Refresh conflict list | ❌ | ✅ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach the conflicts view
- All conflict data is read-only in this view — resolution actions happen through jj CLI or the sync/daemon conflict resolution flow, not in this tab
- Read-only collaborators can see all conflict data without restriction
- Private repository access requires appropriate role membership; the API enforces this

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen
- 403 responses show "Permission denied. You may not have access to this repository." inline

### Rate Limiting

- Authenticated users: 5,000 requests per hour (shared across all API endpoints)
- `GET /api/repos/:owner/:repo/changes?has_conflict=true`: paginated, typically 1 request per view load
- `GET /api/repos/:owner/:repo/changes/:change_id/conflicts`: 1 request per conflicted change. For N conflicted changes, this is N+1 total requests
- If 429 is returned, displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit; user presses `R` after the retry-after period
- Batch loading optimization: per-change conflict requests parallelized (max 5 concurrent)

### Input Sanitization

- Filter input is client-side only — never sent to the API
- Change IDs and file paths rendered as plain text via `<text>` components (no injection risk)
- No user-writable data in this view (all conflict data produced by jj and the API)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.conflicts.view` | Conflicts tab becomes visible (initial load completes) | `repo_full_name`, `conflicted_change_count`, `total_file_count`, `unresolved_file_count`, `resolved_file_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms` |
| `tui.repo.conflicts.expand_change` | User presses Enter on a change row to expand | `repo_full_name`, `change_id`, `conflict_file_count`, `position_in_list` |
| `tui.repo.conflicts.collapse_change` | User presses Enter on an expanded change row | `repo_full_name`, `change_id` |
| `tui.repo.conflicts.open_diff` | User opens diff for a conflicted file | `repo_full_name`, `change_id`, `file_path`, `conflict_type`, `is_resolved` |
| `tui.repo.conflicts.view_change` | User presses `v` to view change detail | `repo_full_name`, `change_id`, `conflict_file_count` |
| `tui.repo.conflicts.filter` | User activates filter | `conflicted_change_count`, `total_file_count` |
| `tui.repo.conflicts.filter_results` | User types in filter and results narrow | `filter_text_length`, `matched_change_count`, `matched_file_count` |
| `tui.repo.conflicts.toggle_resolved` | User presses `h` | `repo_full_name`, `new_mode`, `resolved_count`, `unresolved_count` |
| `tui.repo.conflicts.expand_all` | User presses `x` | `repo_full_name`, `change_count` |
| `tui.repo.conflicts.collapse_all` | User presses `z` | `repo_full_name`, `change_count` |
| `tui.repo.conflicts.refresh` | User presses `R` | `repo_full_name`, `was_error_state`, `previous_change_count` |
| `tui.repo.conflicts.error` | API request fails on initial load | `repo_full_name`, `error_type`, `http_status` |
| `tui.repo.conflicts.empty` | Empty state rendered | `repo_full_name` |

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Conflicts view load rate | >95% | % of tab visits that successfully load data |
| Expand interaction rate | >60% | % of sessions where user expands at least one change |
| Diff open rate | >30% | % of sessions where user opens a file diff |
| Change detail rate | >15% | % of sessions where user opens change detail |
| Toggle resolved adoption | >10% | % of sessions using `h` toggle |
| Filter adoption | >10% (>3 changes) | % of sessions activating filter |
| Refresh frequency | Track | Average refreshes per session |
| Error rate | <5% | % of loads resulting in error (higher tolerance for 501) |
| Time to first interaction | Track p50 | Time from mount to first keypress |
| Zero-conflict rate | Track | % of visits showing empty state |

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | Conflicts loaded | `repo_full_name`, `conflicted_change_count`, `total_file_count`, `load_time_ms` |
| `info` | Diff opened from conflicts | `repo_full_name`, `change_id`, `file_path` |
| `info` | Change detail opened from conflicts | `repo_full_name`, `change_id` |
| `warn` | API error on conflicts fetch | `http_status`, `error_message` (no token) |
| `warn` | API returns 501 (not implemented) | `endpoint`, `repo_full_name` |
| `warn` | Rate limited | `retry_after_seconds` |
| `warn` | Partial load failure | `successful_count`, `failed_count`, `failed_change_ids` |
| `warn` | Filter returned zero results | `filter_text`, `total_count` |
| `debug` | Conflict list focused | `focused_index`, `focused_type`, `focused_id` |
| `debug` | Change expanded/collapsed | `change_id`, `file_count` |
| `debug` | Filter activated/cleared | `filter_text_length` |
| `debug` | Resolved visibility toggled | `new_mode` |
| `debug` | Hard refresh triggered | `was_error_state` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press `R` to retry" |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline error: "Rate limited. Retry in Ns." |
| Server error (500) | API returns 5xx | Inline error with generic message. `R` retries |
| Not implemented (501) | API returns 501 | "Conflicts endpoint not available. Backend may need updating." |
| Permission denied (403) | API returns 403 | Inline error: "Permission denied." |
| Partial load failure | Some per-change requests fail | Successfully loaded changes displayed; failed changes show inline error |
| Change not found (404) | API returns 404 | "Change not found" in muted text on that row |
| Terminal resize while scrolled | `useOnResize` fires | Column widths recalculate; focused row stays visible; expanded state preserved |
| Terminal resize during filter | `useOnResize` fires | Filter stays; results re-rendered |
| SSE disconnect | Status bar shows disconnected | Unaffected (REST-based) |
| Malformed API response | JSON parse error | Error state with generic message |
| React error boundary triggered | Error boundary catches | Error screen per app-shell |
| Very large conflict set (100+ changes) | Slow initial load | Loading progress: "Loading conflicts… (42/100 changes)" |

### Failure Modes

- **Total fetch failure**: Error state shown. Tab bar remains interactive. `R` retries
- **Partial fetch failure**: Successful changes render; failed changes show inline error
- **501 Not Implemented**: Clear message guides user; expected during development
- **Memory pressure**: 500 changes × 1000 files theoretical max; typical repos have <10 conflicted changes
- **Stale data after resolution**: Data stale until `R` pressed; no auto-refresh for this view

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

### Terminal Snapshot Tests

1. **`repo-conflicts-initial-load`** — Navigate to repo, Conflicts tab at 120×40. Assert header, change rows, focus highlight
2. **`repo-conflicts-empty-state`** — Zero conflicts at 120×40. Assert "No conflicts. All clear! ✓"
3. **`repo-conflicts-loading-state`** — Slow API at 120×40. Assert "Loading…" spinner
4. **`repo-conflicts-error-state`** — Failing API at 120×40. Assert error + "Press `R` to retry"
5. **`repo-conflicts-501-error`** — 501 response. Assert "Conflicts endpoint not available" message
6. **`repo-conflicts-focused-change-row`** — Assert first change row highlighted
7. **`repo-conflicts-expanded-change`** — Enter on change. Assert `▾` indicator, file rows visible
8. **`repo-conflicts-collapsed-change`** — Enter twice. Assert `▸` indicator, files hidden
9. **`repo-conflicts-resolved-files-hidden`** — Default mode. Assert only `✗` files visible
10. **`repo-conflicts-resolved-files-visible`** — Press `h`. Assert `✓` files with strikethrough
11. **`repo-conflicts-all-resolved`** — All resolved, hide mode. Assert "All conflicts resolved" message
12. **`repo-conflicts-filter-active`** — Press `/`. Assert filter input with placeholder
13. **`repo-conflicts-filter-results`** — Type "parser". Assert filtered results
14. **`repo-conflicts-filter-no-results`** — Type nonexistent. Assert "No matching conflicts"
15. **`repo-conflicts-multiple-expanded`** — Two expanded changes. Assert both with file lists
16. **`repo-conflicts-header-icon-warning`** — Unresolved conflicts. Assert `⚠` in warning color
17. **`repo-conflicts-header-icon-success`** — All resolved shown. Assert `✓` in success color
18. **`repo-conflicts-partial-load-failure`** — One change fails. Assert others render, failed shows error
19. **`repo-conflicts-single-conflict`** — One change, one file. Assert single expandable row

### Keyboard Interaction Tests

20. **`repo-conflicts-j-moves-down`** — `j` moves focus down
21. **`repo-conflicts-k-moves-up`** — `j` then `k` returns focus
22. **`repo-conflicts-k-at-top-no-wrap`** — `k` at top stays
23. **`repo-conflicts-j-at-bottom-no-wrap`** — `j` at bottom stays
24. **`repo-conflicts-down-arrow-moves-down`** — Down arrow same as `j`
25. **`repo-conflicts-up-arrow-moves-up`** — Up arrow same as `k`
26. **`repo-conflicts-enter-expands-change`** — Enter expands with `▾` and file rows
27. **`repo-conflicts-enter-collapses-change`** — Enter collapses with `▸`
28. **`repo-conflicts-j-into-file-rows`** — `j` after expand enters file rows
29. **`repo-conflicts-k-from-file-to-change`** — `k` from first file returns to change
30. **`repo-conflicts-enter-on-file-opens-diff`** — Enter on file pushes diff view
31. **`repo-conflicts-d-on-file-opens-diff`** — `d` on file opens diff
32. **`repo-conflicts-v-on-change-opens-detail`** — `v` pushes change detail
33. **`repo-conflicts-v-on-file-row-no-op`** — `v` on file row is no-op
34. **`repo-conflicts-d-on-change-row-no-op`** — `d` on change row is no-op
35. **`repo-conflicts-slash-activates-filter`** — `/` focuses filter input
36. **`repo-conflicts-filter-narrows-list`** — Filter narrows to matching paths
37. **`repo-conflicts-filter-case-insensitive`** — Case-insensitive matching
38. **`repo-conflicts-esc-clears-filter`** — Esc clears filter, restores list
39. **`repo-conflicts-h-toggles-resolved`** — `h` toggles resolved visibility
40. **`repo-conflicts-G-jumps-to-bottom`** — `G` focuses last row
41. **`repo-conflicts-gg-jumps-to-top`** — `g g` focuses first row
42. **`repo-conflicts-ctrl-d-page-down`** — Ctrl+D pages down
43. **`repo-conflicts-ctrl-u-page-up`** — Ctrl+U pages up
44. **`repo-conflicts-x-expands-all`** — `x` expands all changes
45. **`repo-conflicts-z-collapses-all`** — `z` collapses all changes
46. **`repo-conflicts-R-refreshes-list`** — `R` re-fetches from API
47. **`repo-conflicts-R-on-error-retries`** — `R` in error state retries
48. **`repo-conflicts-collapse-with-file-focused`** — Collapse moves focus to parent change
49. **`repo-conflicts-j-in-filter-types-j`** — `j` in filter types, not navigates
50. **`repo-conflicts-enter-during-loading`** — Enter during load is no-op
51. **`repo-conflicts-rapid-j-presses`** — 10 rapid `j` presses move focus 10 rows
52. **`repo-conflicts-expand-during-filter`** — Expand shows only matching files

### Responsive Tests

53. **`repo-conflicts-80x24-layout`** — 80×24: change ID + count only; file: icon + path
54. **`repo-conflicts-80x24-file-path-truncation`** — Long paths truncated `…/filename.ext`
55. **`repo-conflicts-80x24-filter`** — Filter at full width
56. **`repo-conflicts-120x40-layout`** — 120×40: all standard columns
57. **`repo-conflicts-120x40-all-columns`** — Snapshot all columns visible
58. **`repo-conflicts-200x60-layout`** — 200×60: expanded with timestamp, resolution
59. **`repo-conflicts-resize-120-to-80`** — Columns collapse on shrink
60. **`repo-conflicts-resize-80-to-120`** — Columns appear on grow
61. **`repo-conflicts-resize-preserves-focus`** — Focus preserved on resize
62. **`repo-conflicts-resize-preserves-expanded`** — Expanded state preserved on resize
63. **`repo-conflicts-resize-during-filter`** — Filter persists through resize

### Integration Tests

64. **`repo-conflicts-auth-expiry`** — 401 → app-shell auth error
65. **`repo-conflicts-rate-limit-429`** — 429 → "Rate limited" inline
66. **`repo-conflicts-network-error`** — Timeout → error + retry hint
67. **`repo-conflicts-server-error-500`** — 500 → error + retry hint
68. **`repo-conflicts-403-permission`** — 403 → "Permission denied"
69. **`repo-conflicts-partial-failure-recovery`** — Partial success renders; `R` retries all
70. **`repo-conflicts-diff-then-q-returns`** — Back from diff preserves focus/expanded state
71. **`repo-conflicts-change-detail-then-q-returns`** — Back from change preserves focus
72. **`repo-conflicts-tab-switch-and-back`** — Tab switch re-fetches, resets expanded state
73. **`repo-conflicts-help-overlay-includes-conflicts`** — `?` shows Conflicts keybinding group
74. **`repo-conflicts-status-bar-hints`** — Status bar shows conflict-specific hints
75. **`repo-conflicts-deep-link`** — `codeplane tui --screen repo --repo owner/repo --tab conflicts` works
