# TUI_DIFF_SPLIT_VIEW

Specification for TUI_DIFF_SPLIT_VIEW.

## High-Level User POV

As a terminal-native developer reviewing landing requests, I need a side-by-side split diff view so I can compare old and new versions of files simultaneously, making it easier to understand changes in context without scrolling between additions and deletions in unified mode.

## Acceptance Criteria

1. Press `t` in diff view to toggle between unified and split view modes
2. Split view renders two synchronized panes: left (deletions/old) and right (additions/new)
3. Line numbers displayed on both sides independently
4. Scroll synchronization: j/k scrolls both panes together
5. Color coding: red background (ANSI 52) with red text (ANSI 196) for deletions on left; green background (ANSI 22) with green text (ANSI 34) for additions on right
6. Context lines appear identically on both sides
7. Hunk headers (cyan ANSI 37) span full width across both panes
8. `[` and `]` navigate between files in split mode
9. `x` expands all hunks, `z` collapses all hunks in split mode
10. `w` toggles whitespace visibility in split mode
11. At minimum terminal width (80 cols), split view is unavailable — `t` shows a 'Terminal too narrow for split view' message and stays in unified mode
12. At standard width (120+ cols), each pane gets ~50% width with a vertical separator
13. At large width (200+ cols), panes show more context columns
14. Focused file in file tree sidebar highlights correctly in split mode
15. `Ctrl+B` toggles sidebar, and split panes resize to fill available space

## Design

## Layout

Split diff view divides the content area into two equal panes separated by a single-character vertical border (│ U+2502):

```
┌──────────┬─────────────────────┬─────────────────────┐
│ File     │ Old (deletions)     │ New (additions)      │
│ Tree     │ Line# │ Content     │ Line# │ Content      │
│ (25%)    │       │             │       │              │
└──────────┴─────────────────────┴─────────────────────┘
```

### Component Structure

- `<DiffSplitView>` — top-level component wrapping left and right `<scrollbox>` panes
- `<DiffPane side="old|new">` — renders one side of the diff with line numbers and content
- `<DiffHunkHeader>` — spans both panes, showing hunk range info in cyan
- `<DiffSyncController>` — manages scroll synchronization state between panes via shared offset ref

### Scroll Synchronization

Both panes share a `scrollOffset` ref. When `j`/`k` is pressed, the controller updates the shared offset and both `<scrollbox>` components re-render at the new position. Blank filler lines are inserted on whichever side has fewer lines in a hunk to keep corresponding context lines aligned.

### Mode State

Diff view mode (`unified` | `split`) is stored in component state, toggled by `t` keypress. The parent `<DiffViewer>` conditionally renders `<DiffUnifiedView>` or `<DiffSplitView>` based on this state. Mode preference persists for the session but resets to unified on TUI restart.

### Responsive Behavior

- `< 100 cols available` (after sidebar): split mode disabled, show inline warning
- `100–159 cols`: each pane gets 50% with 4-digit line numbers + content
- `160+ cols`: each pane gets 50% with 6-digit line numbers + expanded content

### Data Flow

Reuses the same diff data from `@codeplane/ui-core` hooks. The `parseDiffHunks()` utility splits unified diff hunks into paired left/right line arrays with alignment padding. No additional API calls needed.

## Permissions & Security

No additional permissions required. Split diff view operates on the same diff data already fetched for unified view. Read access to the repository (which is already required to view diffs) is sufficient.

## Telemetry & Product Analytics

- Track `tui.diff.mode_toggle` event with `{from: 'unified'|'split', to: 'unified'|'split'}` to understand split view adoption
- Track `tui.diff.split_view_blocked` when user attempts split at insufficient terminal width
- Include `terminal_width` dimension on diff view render events to understand sizing distribution

## Observability

- Log warning when split view is requested but terminal width is insufficient (includes actual width)
- Performance metric: `diff_split_render_ms` measuring time to render split view panes (should be < 50ms per design spec)
- Memory metric: track additional memory from duplicated pane scroll state to ensure stability in long sessions

## Verification

## E2E Tests (e2e/tui/diff.test.ts)

1. **TUI_DIFF_SPLIT_VIEW_TOGGLE**: Open diff view → press `t` → verify split layout renders with two panes and vertical separator → press `t` again → verify unified view restores
2. **TUI_DIFF_SPLIT_VIEW_COLORS**: In split mode → verify left pane shows red-highlighted deletions and right pane shows green-highlighted additions via terminal snapshot
3. **TUI_DIFF_SPLIT_VIEW_LINE_NUMBERS**: In split mode → verify both panes display independent line numbers matching the old and new file respectively
4. **TUI_DIFF_SPLIT_VIEW_SCROLL_SYNC**: In split mode with long diff → press `j` multiple times → verify both panes scroll together (snapshot at multiple scroll positions)
5. **TUI_DIFF_SPLIT_VIEW_ALIGNMENT**: In split mode with unequal hunks → verify filler lines are inserted to keep context lines aligned
6. **TUI_DIFF_SPLIT_VIEW_FILE_NAV**: In split mode → press `]` → verify next file renders in split mode → press `[` → verify previous file
7. **TUI_DIFF_SPLIT_VIEW_HUNK_EXPAND_COLLAPSE**: In split mode → press `z` to collapse → verify hunks collapsed → press `x` to expand → verify hunks expanded
8. **TUI_DIFF_SPLIT_VIEW_WHITESPACE**: In split mode → press `w` → verify whitespace characters shown/hidden
9. **TUI_DIFF_SPLIT_VIEW_MIN_WIDTH**: Set terminal to 80x24 → open diff → press `t` → verify warning message appears and view stays unified
10. **TUI_DIFF_SPLIT_VIEW_SIDEBAR_TOGGLE**: In split mode → press `Ctrl+B` → verify panes resize to fill space vacated by sidebar
11. **TUI_DIFF_SPLIT_VIEW_HUNK_HEADER**: In split mode → verify hunk headers span full width across both panes in cyan
