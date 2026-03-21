# TUI_DIFF_SCROLL_SYNC

Specification for TUI_DIFF_SCROLL_SYNC.

## High-Level User POV

When a developer is reviewing code changes in split (side-by-side) diff mode, both panes scroll together. As the developer presses `j` to move down or `k` to move up, the old file content on the left and the new file content on the right advance in lockstep. The developer never loses their place: whatever line is visible at the top of the left pane has its corresponding line visible at the top of the right pane. This is the same mental model as a side-by-side diff in a desktop diff tool — the two panes stay vertically aligned so that additions, deletions, and context lines are always presented at the same vertical position.

Scroll synchronization is on by default in split mode and cannot be toggled independently — it is an intrinsic property of the split view. When the developer toggles to unified mode with `t`, scroll sync is not relevant (there is only one column). When they switch back to split mode, scroll sync resumes automatically.

The synchronization is hunk-aware. Within a hunk, if there are three lines added on the right side with no corresponding deletions on the left side, the left pane shows three blank filler lines at the same vertical positions. This keeps the context lines above and below the hunk aligned across both panes. The developer sees the old version and the new version at the same conceptual position in the file — they never have to mentally re-align panes after scrolling past a hunk with unequal additions and deletions.

All scroll operations participate in synchronization: single-line scroll (`j`/`k`/`Down`/`Up`), page scroll (`Ctrl+D`/`Ctrl+U`), jump-to-end (`G`), jump-to-top (`g g`), file navigation (`]`/`[`), and mouse scroll (when the terminal supports mouse events). After any of these operations, the left and right panes are at the same vertical scroll offset, measured in rendered lines (including filler lines). Horizontal scroll is also synchronized: if the left pane scrolls right to reveal a long line, the right pane scrolls by the same horizontal offset.

At minimum terminal size (80×24), split view is unavailable, so scroll sync does not apply. At standard size (120×40), split view is available and scroll sync keeps the narrow panes aligned. At large size (200×60+), scroll sync works identically but across wider panes with more visible content per row.

If the user is scrolled deep into a long file and toggles between unified and split modes, the scroll position is preserved. The line that was at the top of the viewport in unified mode will be at the top of both panes in split mode, and vice versa. This preservation is based on logical line index (within the diff's hunk structure), not pixel offset, so terminal resizes do not cause scroll position drift.

When the developer navigates to the next or previous file with `]`/`[`, both panes scroll to the top of the target file simultaneously. When the developer collapses or expands a hunk with `z`/`x`, both panes update together so that the collapsed summary line appears at the same vertical position in both panes. When the developer toggles whitespace visibility with `w` and the diff is re-fetched, both panes re-render with the new diff data starting from the same scroll position.

In the rare case where the OpenTUI `<diff>` component's `syncScroll` mechanism fails (e.g., due to a rendering bug), the panes scroll independently. The developer can re-synchronize the panes by navigating to a file boundary with `]` or `[`, which resets both panes to the top of the target file, or by pressing `g g` to jump to the top.

## Acceptance Criteria

### Core synchronization behavior
- [ ] `syncScroll` prop is set to `true` on the `<diff>` component when `view="split"`
- [ ] `syncScroll` prop is set to `false` (or omitted) on the `<diff>` component when `view="unified"`
- [ ] Vertical scroll position is identical in both panes after every scroll operation
- [ ] Horizontal scroll position is identical in both panes after every scroll operation
- [ ] Scroll synchronization has zero visible lag between panes (both update in the same render frame)

### Keyboard-driven vertical scroll
- [ ] `j` / `Down` scrolls both panes down by exactly one rendered line simultaneously
- [ ] `k` / `Up` scrolls both panes up by exactly one rendered line simultaneously
- [ ] `Ctrl+D` pages both panes down by half the visible content height simultaneously
- [ ] `Ctrl+U` pages both panes up by half the visible content height simultaneously
- [ ] `G` jumps both panes to the last rendered line of the current file
- [ ] `g g` jumps both panes to the first rendered line of the current file (line 1)
- [ ] Rapid `j`/`k` keypresses (held key, key repeat) are processed sequentially with no debouncing — each keypress scrolls one line in both panes
- [ ] Key repeat at terminal-native rates (typically 30–50 events/second) does not cause desynchronization between panes

### Keyboard-driven horizontal scroll
- [ ] When line content extends beyond pane width (in `wrapMode: "none"`), horizontal scroll is synchronized between panes
- [ ] Left/right arrow keys (when horizontal scroll is available) scroll both panes horizontally by the same offset
- [ ] Horizontal scroll position is independent of vertical scroll position — both axes are synchronized separately

### Mouse scroll
- [ ] Mouse scroll events in the left pane scroll the right pane by the same offset (when terminal supports mouse events)
- [ ] Mouse scroll events in the right pane scroll the left pane by the same offset
- [ ] Mouse scroll synchronization is processed via OpenTUI's `onMouseEvent` handler on the `<diff>` component
- [ ] Mouse scroll is additive — it does not replace keyboard scroll state

### Hunk-aware alignment
- [ ] Context lines (unchanged lines) appear at the same vertical position in both panes
- [ ] Addition-only blocks in the right pane have corresponding blank filler lines in the left pane
- [ ] Deletion-only blocks in the left pane have corresponding blank filler lines in the right pane
- [ ] Mixed add/delete hunks align: deletions in the left pane and additions in the right pane start at the same vertical position
- [ ] Filler lines are rendered with subtle dark gray background (ANSI 236) to distinguish them from empty source lines
- [ ] Filler lines have no line numbers in their gutter (blank gutter space)
- [ ] Hunk headers (`@@` lines) appear at the same vertical position in both panes, rendered in cyan (ANSI 37)
- [ ] After scrolling past a hunk with unequal additions/deletions, context lines below the hunk are vertically re-aligned

### File navigation synchronization
- [ ] `]` (next file) scrolls both panes to the top of the next file simultaneously
- [ ] `[` (previous file) scrolls both panes to the top of the previous file simultaneously
- [ ] File navigation wrapping (`]` on last file → first file) scrolls both panes together
- [ ] After file navigation, both panes are at scroll position 0 (top) of the new file

### Hunk collapse/expand synchronization
- [ ] Collapsing a hunk with `z` collapses it in both panes simultaneously
- [ ] The collapsed summary line (`⋯ N lines hidden`) appears at the same vertical position in both panes
- [ ] Expanding a hunk with `Enter` or `x` expands it in both panes simultaneously
- [ ] Collapse-all (`Z`) and expand-all (`X`) operations affect both panes identically
- [ ] Scroll position is preserved after hunk collapse/expand — the line at the viewport top stays at the viewport top

### View mode toggle scroll preservation
- [ ] When toggling from split to unified (`t`), the logical line at the top of the split viewport becomes the top line in unified view
- [ ] When toggling from unified to split (`t`), the logical line at the top of unified view becomes the top line in both split panes
- [ ] Scroll position preservation uses logical line index (hunk-relative), not pixel offset
- [ ] Scroll preservation works correctly after terminal resize between toggles

### Integration with whitespace toggle
- [ ] After `w` (whitespace toggle) triggers a diff re-fetch, both panes re-render starting from the preserved scroll position
- [ ] If the re-fetched diff has fewer lines (whitespace-only changes removed), scroll position clamps to the new maximum without desynchronization

### Boundary constraints
- [ ] Scroll offset is clamped: minimum 0, maximum = total rendered lines − visible height (never negative, never past end)
- [ ] At scroll offset 0 (top), both panes show the first line; `k`/`Up` is a no-op
- [ ] At maximum scroll offset (bottom), both panes show the last line; `j`/`Down` is a no-op
- [ ] Page scroll (`Ctrl+D`/`Ctrl+U`) clamps at boundaries — does not overshoot top or bottom
- [ ] Files with 0 lines (empty files): scroll position is 0, scroll operations are no-ops, both panes show "Empty file" message
- [ ] Files with 1 line: scroll position is 0, scroll operations are no-ops
- [ ] Maximum rendered line count per file: 1,000,000 lines (no practical limit, but virtual scrolling renders only the visible window ± buffer)
- [ ] Virtual scroll buffer: 50 lines above and below the visible window are pre-rendered in both panes for smooth scrolling
- [ ] Filler lines count toward total rendered line height

### Performance constraints
- [ ] Scroll operations complete in under 16ms (60fps target) for files up to 10,000 lines
- [ ] No visible jank or flicker during rapid scrolling (held `j`/`k`)
- [ ] Scroll synchronization does not double the cost of a single-pane scroll — both panes update in the same render pass via the `syncScroll` prop on the native `<diff>` component
- [ ] Memory usage does not increase linearly with scroll depth — virtual scrolling is used

### Edge cases
- [ ] Split view at exactly 120 columns with sidebar visible: panes are narrow (~44 chars each) but scroll sync works correctly
- [ ] Split view at 200+ columns: scroll sync works identically to standard width
- [ ] Terminal resize during scroll animation: scroll position recalculates synchronously, no desynchronization
- [ ] Binary files in split mode: no scroll content, scroll operations are no-ops
- [ ] File with only additions (new file): left pane entirely filler, right pane has content; scroll operates on combined height
- [ ] File with only deletions (deleted file): right pane entirely filler, left pane has content; scroll operates on combined height
- [ ] Diff with 500+ files: scroll sync operates per-file; file navigation resets scroll to top of target file in both panes
- [ ] Hunk with 1,000+ lines: virtual scrolling applies to both panes simultaneously
- [ ] Collapsed hunk followed by expanded hunk: filler lines in collapsed region do not affect alignment in expanded region below
- [ ] All hunks collapsed: both panes show only summary lines; scroll sync operates on summary lines
- [ ] `syncScroll` failure recovery: if panes desynchronize, `]`/`[` or `g g` re-synchronizes by resetting scroll position

## Design

### Layout structure (split mode with scroll sync)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Changes > abc12345 > Diff                                       ● 3 notifs  │
├──────────────────────────┬──────────────────────────────────────┬─────────────────────────────────────────────┤
│ File Tree                │ Old (before)                        │ New (after)                                 │
│                          │                                      │                                             │
│ M app.ts      +5 -2      │  10│ import { config }               │  10│ import { config }                      │
│ A utils.ts    +12        │  11│ const val = 1                   │  11│ const val = computeValue()             │
│ D old.ts      -30        │  12│ return val                      │  12│ const extra = validate(val)            │
│                          │     │ ░░░░░░░░░░░░ (filler)          │  13│ return val                             │
│                          │                                      │                                             │
│        (25%)             │           (37.5%)                     │              (37.5%)                        │
├──────────────────────────┴──────────────────────────────────────┴─────────────────────────────────────────────┤
│ j/k:scroll  Ctrl+D/U:page  G/gg:jump                    │ File 1/4 │ ws:visible │ SPLIT │ ?help             │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Filler line alignment

Filler lines (ANSI 236 dark gray background, no line number) are inserted in the opposite pane to maintain vertical alignment:
- Addition-only block: filler in left pane, content in right pane
- Deletion-only block: filler in right pane, content in left pane
- Mixed hunk: deletions and additions start at same row; shorter side gets filler below

### Component structure

```tsx
<box flexDirection="column" width="100%" height="100%">
  <box flexDirection="row" flexGrow={1}>
    {sidebarVisible && (
      <box width="25%" borderRight="single" borderColor="#585858" flexDirection="column">
        <text bold>Files ({fileCount})</text>
        <scrollbox flexGrow={1}>
          {/* file tree entries */}
        </scrollbox>
      </box>
    )}
    <box flexGrow={1} flexDirection="column">
      <scrollbox flexGrow={1}>
        {files.map(file => (
          <box key={file.path} flexDirection="column">
            <box borderBottom="single" borderColor="#585858">
              <text bold>{file.path}</text>
              <text color="#8a8a8a">+{file.additions} -{file.deletions}</text>
            </box>
            <diff
              diff={file.patch}
              view="split"
              filetype={file.language}
              showLineNumbers={true}
              syncScroll={true}
              wrapMode={wrapMode}
              addedBg="#1a4d1a"
              removedBg="#4d1a1a"
              addedSignColor="#22c55e"
              removedSignColor="#ef4444"
              lineNumberFg="#888888"
              contextBg="transparent"
              addedLineNumberBg="#1a4d1a"
              removedLineNumberBg="#4d1a1a"
            />
          </box>
        ))}
      </scrollbox>
    </box>
  </box>
</box>
```

### Keybinding reference

| Key | Context | Scroll sync behavior |
|-----|---------|---------------------|
| `j` / `Down` | Split view, main content | Scrolls both panes down one line |
| `k` / `Up` | Split view, main content | Scrolls both panes up one line |
| `Ctrl+D` | Split view | Pages both panes down by half visible height |
| `Ctrl+U` | Split view | Pages both panes up by half visible height |
| `G` | Split view | Jumps both panes to bottom of current file |
| `g g` | Split view | Jumps both panes to top of current file |
| `]` | Split view | Scrolls both panes to top of next file |
| `[` | Split view | Scrolls both panes to top of previous file |
| `z` | Split view, hunk focused | Collapses hunk in both panes |
| `Z` | Split view | Collapses all hunks in both panes |
| `x` / `X` | Split view | Expands hunks in both panes |
| `t` | Diff screen | Toggle view mode; scroll position preserved |
| `w` | Diff screen | Whitespace toggle; both panes re-render at preserved position |
| Mouse scroll | Left or right pane | Syncs scroll offset to the other pane |

### Responsive behavior

| Terminal size | Behavior |
|---------------|----------|
| < 80×24 | Unsupported; "terminal too small" |
| 80×24 – 119×39 | Split unavailable; scroll sync N/A |
| 120×40 – 199×59 | Split available; sync active; ~44 chars/pane with sidebar |
| 200×60+ | Split available; sync active; wide panes |

On resize: below 120 cols auto-reverts to unified with scroll preserved; above 120 panes resize proportionally with sync maintained.

### Data hooks consumed

| Hook | Source | Purpose |
|------|--------|---------|
| `useChangeDiff(owner, repo, change_id, opts?)` | `@codeplane/ui-core` | Fetches diff data for change diffs |
| `useLandingDiff(owner, repo, number, opts?)` | `@codeplane/ui-core` | Fetches diff data for landing request diffs |
| `useTerminalDimensions()` | `@opentui/react` | Determines split view availability (width ≥ 120) |
| `useOnResize()` | `@opentui/react` | Handles resize-triggered auto-revert and scroll recalculation |
| `useKeyboard()` | `@opentui/react` | Binds scroll keybindings |

## Permissions & Security

Scroll synchronization is purely client-side rendering behavior. No API calls are made when scrolling — the diff data is already fetched and cached. No specific authorization role is required beyond the repository read access inherited from the diff screen entry point.

- **Authorization**: Same as TUI_DIFF_SCREEN — the user must have read access to the repository (or landing request) being diffed. No additional permissions for scroll sync.
- **Token usage**: The token stored by `codeplane auth login` (or `CODEPLANE_TOKEN` env var) is used only for the initial diff data fetch. Scroll operations never transmit the token.
- **Rate limiting**: Not applicable — scroll sync is a local rendering operation. The only rate-limited operation is the initial diff fetch and the whitespace toggle re-fetch, which are governed by the API's standard rate limits (not specific to scroll sync).
- **Input validation**: Scroll offsets are clamped integers (0 to max). No user-supplied string input is processed during scroll operations. The `syncScroll` prop accepts only a boolean literal.

## Telemetry & Product Analytics

### Business events

| Event name | Trigger | Key properties |
|-----------|---------|----------------|
| `tui.diff.split_view_scrolled` | User scrolls in split view (batched after 500ms inactivity) | `scroll_method` (keyboard_line \| keyboard_page \| keyboard_jump \| mouse), `direction` (up \| down), `lines_scrolled`, `terminal_width`, `terminal_height`, `sidebar_visible`, `file_index`, `total_files`, `session_id`, `diff_source` (change \| landing) |
| `tui.diff.scroll_sync_active` | Split view is entered via `t` toggle | `terminal_width`, `terminal_height`, `sidebar_visible`, `file_count`, `total_diff_lines`, `session_id`, `diff_source` |
| `tui.diff.scroll_position_preserved` | Scroll position preserved across view toggle | `from_mode`, `to_mode`, `line_index`, `trigger` (keypress \| resize), `session_id` |
| `tui.diff.scroll_resync` | User re-synchronizes desynchronized panes via `g g` or `]`/`[` | `resync_method` (jump_top \| file_nav), `session_id` |

### Event batching

Scroll events (`tui.diff.split_view_scrolled`) are batched: a single event is emitted after 500ms of scroll inactivity, aggregating total lines scrolled, direction, and method.

### Success indicators

- **Adoption**: > 60% of split view sessions use scroll (> 10 lines scrolled)
- **Engagement**: Average lines scrolled per split view session correlates with diff size
- **Retention**: > 50% of split view users return to split view in subsequent sessions
- **Quality**: < 1% of sessions emit `tui.diff.scroll_resync` (desynchronization is rare)
- **Performance**: p99 scroll latency < 16ms (measured client-side)

## Observability

### Logging

| Level | Log key | When | Properties |
|-------|---------|------|------------|
| `debug` | `diff.scroll.sync.applied` | Each scroll operation in split mode | `direction`, `offset`, `method`, `pane_count` |
| `debug` | `diff.scroll.position.preserved` | Scroll position preserved across view toggle | `from_mode`, `to_mode`, `line_index` |
| `debug` | `diff.scroll.position.clamped` | Scroll offset clamped at boundary | `requested_offset`, `clamped_to`, `max_offset` |
| `info` | `diff.scroll.sync.activated` | Split view entered with syncScroll=true | `terminal_width`, `file_count` |
| `info` | `diff.scroll.sync.deactivated` | Split view exited | `trigger` (keypress \| resize), `terminal_width` |
| `warn` | `diff.scroll.sync.desynchronized` | Panes at different offsets (should not happen) | `left_offset`, `right_offset`, `expected_offset` |
| `warn` | `diff.scroll.sync.recovery` | Panes re-synchronized via navigation | `method`, `previous_left`, `previous_right` |
| `error` | `diff.scroll.render.failed` | Scroll render throws | `error_message`, `stack`, `scroll_offset`, `file_index` |

### Failure modes and recovery

| Failure mode | Detection | User impact | Recovery |
|-------------|-----------|-------------|----------|
| `syncScroll` prop ignored by OpenTUI | Panes at different offsets | Panes scroll independently | `g g` or `]`/`[` re-synchronizes; warn log emitted |
| Resize during scroll | `useOnResize` fires mid-scroll | Momentary visual stutter | Synchronous re-layout; scroll recalculates from logical line index |
| Auto-revert to unified (resize < 120) | Width check | Split view disappears | Status bar flash; user presses `t` when terminal is wide enough |
| Diff re-fetch during scroll (whitespace toggle) | `w` pressed while scrolled | Brief loading state | Scroll position preserved; clamps if new diff is shorter |
| SSE disconnect | Connection status change | No impact on scroll sync (local operation) | No recovery needed |
| Very large diff (10,000+ lines) | Line count threshold | Potential scroll jank | Virtual scrolling limits rendered lines to visible window ± 50 line buffer |
| Diff component error boundary | React error boundary catches throw | Error screen | User presses `R` to retry |
| Terminal emulator scroll buffer interference | Scroll events not reaching TUI | Scroll may not work | User disables terminal scrollback or uses compatible terminal |

## Verification

Test file: `e2e/tui/diff.test.ts`. All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing — never skipped.

### Snapshot tests (SNAP-SYNC-001 through SNAP-SYNC-010)

- SNAP-SYNC-001: Split view both panes at scroll top (120×40) — context lines aligned
- SNAP-SYNC-002: Split view scrolled to middle of file (120×40) — both panes same range
- SNAP-SYNC-003: Split view scrolled to bottom (120×40) — both panes at last lines
- SNAP-SYNC-004: Addition-only hunk with filler lines in left pane (120×40)
- SNAP-SYNC-005: Deletion-only hunk with filler lines in right pane (120×40)
- SNAP-SYNC-006: Mixed add/delete hunk alignment check (120×40)
- SNAP-SYNC-007: Split view at 200×60 with wider panes — same alignment
- SNAP-SYNC-008: Collapsed hunk summary line at same position in both panes (120×40)
- SNAP-SYNC-009: Split view with sidebar hidden — 50/50 pane split (120×40)
- SNAP-SYNC-010: Split view after `Ctrl+D` page-down — half-page alignment (120×40)

### Keyboard interaction tests (KEY-SYNC-001 through KEY-SYNC-018)

- KEY-SYNC-001: `j` ×5 from top → both panes at line 6+
- KEY-SYNC-002: `k` ×3 from line 10 → both panes at line 7
- KEY-SYNC-003: `j` at bottom → no-op, both stay at bottom
- KEY-SYNC-004: `k` at top → no-op, both stay at top
- KEY-SYNC-005: `Ctrl+D` from top → both panes down half visible height
- KEY-SYNC-006: `Ctrl+U` after `Ctrl+D` → both panes back to original
- KEY-SYNC-007: `G` from top → both panes at bottom
- KEY-SYNC-008: `g g` after `G` → both panes at top
- KEY-SYNC-009: `]` in file 1 → both panes at top of file 2
- KEY-SYNC-010: `[` in file 2 → both panes at top of file 1
- KEY-SYNC-011: `t` to unified, scroll, `t` to split → position preserved
- KEY-SYNC-012: `z` on hunk → both panes collapse at same position
- KEY-SYNC-013: `x` after `z` → both panes expand, position preserved
- KEY-SYNC-014: `w` while scrolled → both panes re-render at preserved position
- KEY-SYNC-015: Rapid `j` ×20 in <1s → both panes at line 21, no desync
- KEY-SYNC-016: `Ctrl+D` near bottom → both panes clamp at bottom
- KEY-SYNC-017: `g g` → `G` → `g g` round-trip → identical state
- KEY-SYNC-018: `Ctrl+B` then `j` ×5 → sidebar hidden, wider panes, scrolled 5 lines synced

### Responsive tests (RSP-SYNC-001 through RSP-SYNC-010)

- RSP-SYNC-001: 80×24 — split rejected, scroll sync N/A
- RSP-SYNC-002: 120×40 — scroll sync works, ~44 chars/pane
- RSP-SYNC-003: 200×60 — scroll sync works, ~74 chars/pane
- RSP-SYNC-004: 120→80 resize while scrolled → auto-revert, position preserved
- RSP-SYNC-005: 80→120 resize while unified → stays unified, no auto-switch
- RSP-SYNC-006: 120→200 resize while scrolled → panes widen, position preserved
- RSP-SYNC-007: 200→120 resize while scrolled → panes narrow, position preserved
- RSP-SYNC-008: 120×40 sidebar hidden → 50/50 panes, sync works
- RSP-SYNC-009: 119×40 — split rejected
- RSP-SYNC-010: 120×24 minimal height — sync works, half-page ~10 lines

### Integration tests (INT-SYNC-001 through INT-SYNC-007)

- INT-SYNC-001: Scroll sync with syntax highlighting — colors preserved
- INT-SYNC-002: Scroll sync with line numbers — gutters aligned, filler blanks
- INT-SYNC-003: Scroll sync with whitespace toggle — re-render at position
- INT-SYNC-004: Scroll sync with hunk collapse/expand — offset adjusts
- INT-SYNC-005: Scroll sync with inline comments (landing diff) — comments in right pane
- INT-SYNC-006: Scroll sync persists across file navigation cycle
- INT-SYNC-007: `syncScroll={false}` in unified mode — single column, no sync

### Edge case tests (EDGE-SYNC-001 through EDGE-SYNC-010)

- EDGE-SYNC-001: File with only additions — left pane entirely filler
- EDGE-SYNC-002: File with only deletions — right pane entirely filler
- EDGE-SYNC-003: Single-line diff — scroll is no-op
- EDGE-SYNC-004: Empty diff — scroll is no-op
- EDGE-SYNC-005: Binary file — scroll is no-op
- EDGE-SYNC-006: Very large hunk (1,000 lines) — virtual scrolling, sync maintained
- EDGE-SYNC-007: 500-file diff, navigate to file 250 — both panes at top of file 250
- EDGE-SYNC-008: Concurrent resize + scroll keypress — both processed, sync maintained
- EDGE-SYNC-009: `Ctrl+D` on file shorter than half-page — clamp at bottom
- EDGE-SYNC-010: Scroll after all hunks collapsed — summary lines only, sync maintained
