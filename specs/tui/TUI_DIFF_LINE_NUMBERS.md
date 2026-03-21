# TUI_DIFF_LINE_NUMBERS

Specification for TUI_DIFF_LINE_NUMBERS.

## High-Level User POV

Line numbers are a critical navigational aid in the Codeplane TUI diff viewer. They appear in a left-hand gutter alongside every diff line, providing the developer with an immediate visual anchor to the original file positions. In unified view, a single gutter column displays line numbers corresponding to the file: addition lines show the new file line number, deletion lines show the old file line number, and context lines show the new file line number. In split view, each pane has its own gutter — the left pane shows old file line numbers and the right pane shows new file line numbers — giving the developer a clear two-column frame of reference for comparing before and after states.

The gutter renders in muted color (ANSI 245) to remain legible without competing with the diff content. Numbers are right-aligned within the gutter column, with one character of left padding separating them from the pane border. Each line additionally shows a sign indicator: addition lines display a `+` in green (ANSI 34) and deletion lines display a `-` in red (ANSI 196). These signs appear between the line number and the code content, reinforcing the visual semantics already conveyed by background coloring — this is especially important on terminals that fall back to 16 colors, where background tints may be indistinguishable.

The gutter width adapts to the magnitude of line numbers in the diff. At minimum terminal size (80×24), a 4-character gutter accommodates line numbers up to 9,999. At standard size (120×40), a 5-character gutter supports files up to 99,999 lines. At large terminal size (200×60+), a 6-character gutter handles files exceeding 100,000 lines. If a file's actual line numbers exceed the gutter's display capacity, numbers are truncated from the left with the most-significant digits dropped — the gutter never grows beyond its size-tier allocation, preserving the developer's code-reading space. The gutter width is recalculated whenever the diff data changes or the terminal is resized.

Line numbers are always visible when the `<diff>` component has `showLineNumbers={true}` (the default for the Codeplane diff screen). There is no user-facing toggle to hide line numbers — they are considered a baseline UX requirement for code review.

In split view, empty padding lines — inserted to keep the two panes visually aligned when one side has additions that the other lacks — do not display a line number. The gutter cell for these lines is blank, drawing only the gutter background color. This prevents visual clutter and makes it clear that the blank line is structural padding, not a real file line.

Hunk headers (the `@@ -N,M +N,M @@` lines) do not display line numbers. They serve as section dividers and the line number sequence resumes on the first real content line after the header. When a hunk is collapsed, the summary line ("⋯ N lines hidden") also does not display a line number.

Wrapped lines (when the code content exceeds the pane width and wraps to the next visual row) display the line number only on the first visual row of the logical line. Continuation rows show an empty gutter, maintaining alignment without repeating the number.

The gutter background uses contextual coloring that mirrors the diff line type: addition lines have a slightly darker green gutter background, deletion lines have a slightly darker red gutter background, and context lines use the default gutter background. This subtle color banding helps the developer track line types even when scrolling rapidly.

## Acceptance Criteria

### Line number display — unified view
- [ ] Line numbers are rendered in the left gutter of the unified diff view
- [ ] Addition lines display the new file line number
- [ ] Deletion lines display the old file line number
- [ ] Context lines display the new file line number
- [ ] Line numbers are right-aligned within the gutter column
- [ ] Gutter has 1 character of left padding between the pane border and the rightmost digit
- [ ] Line numbers render in muted color (ANSI 245 / `#888888`)
- [ ] Addition lines show a `+` sign after the line number in green (ANSI 34)
- [ ] Deletion lines show a `-` sign after the line number in red (ANSI 196)
- [ ] Context lines show no sign indicator (blank sign area)
- [ ] The `<diff>` component is configured with `showLineNumbers={true}`
- [ ] Line numbering is correct across multiple hunks: each hunk resumes at the correct `oldStart`/`newStart` offset

### Line number display — split view
- [ ] The left pane gutter shows old file line numbers
- [ ] The right pane gutter shows new file line numbers
- [ ] Both gutters render in muted color (ANSI 245)
- [ ] Both gutters are right-aligned with 1-character left padding
- [ ] Empty alignment padding lines display a blank gutter (no line number)
- [ ] Empty alignment padding lines are tracked via `hideLineNumbers` set on the `LineNumberRenderable`
- [ ] Addition sign (`+`) appears only in the right pane gutter
- [ ] Deletion sign (`-`) appears only in the left pane gutter
- [ ] Context lines show their respective line numbers in both panes without signs
- [ ] Line numbers remain synchronized with scroll position when `syncScroll` is enabled

### Gutter width tiers
- [ ] At terminal width < 120 columns (minimum tier): gutter is 4 characters wide
- [ ] At terminal width 120–199 columns (standard tier): gutter is 5 characters wide
- [ ] At terminal width ≥ 200 columns (large tier): gutter is 6 characters wide
- [ ] Gutter width recalculates on terminal resize
- [ ] Gutter width recalculates when diff data changes (new file loaded, whitespace toggle)
- [ ] If the maximum line number in the file exceeds the gutter capacity, digits are truncated from the left (most-significant digits dropped)
- [ ] Gutter never exceeds its size-tier allocation regardless of line number magnitude

### Hunk headers and collapsed hunks
- [ ] Hunk header lines (`@@ ... @@`) do not display a line number
- [ ] Collapsed hunk summary lines ("⋯ N lines hidden") do not display a line number
- [ ] After a collapsed hunk, the next expanded hunk resumes at the correct line number

### Wrapped lines
- [ ] When code content wraps to the next visual row, only the first visual row of a logical line displays the line number
- [ ] Continuation rows of a wrapped line display an empty gutter cell
- [ ] The `lineSources` array from the `CodeRenderable` is used to determine first-visual-row status

### Gutter background coloring
- [ ] Addition line gutters have a green-tinted background (derived from `addedLineNumberBg` / darkened `addedBg`)
- [ ] Deletion line gutters have a red-tinted background (derived from `removedLineNumberBg` / darkened `removedBg`)
- [ ] Context line gutters use the default gutter background color (`lineNumberBg`)
- [ ] In split view, empty padding line gutters use the default gutter background color

### Boundary constraints
- [ ] Line numbers up to 9,999 display correctly in the 4-character gutter (minimum tier)
- [ ] Line numbers up to 99,999 display correctly in the 5-character gutter (standard tier)
- [ ] Line numbers up to 999,999 display correctly in the 6-character gutter (large tier)
- [ ] A diff with 0 hunks (empty patch) renders no gutter at all
- [ ] A diff with a single line correctly shows line number `1`
- [ ] Line numbers are never negative
- [ ] The `lineNumbers` map correctly handles hunk gaps (non-contiguous line ranges)
- [ ] The maximum sign width (`+` or `-`) is computed once per diff build and does not change per line

### Edge cases
- [ ] Terminal resize during diff render: gutter width recalculates synchronously; line numbers remain correct
- [ ] Terminal resize from standard → minimum tier while in split view: auto-switches to unified mode; gutter adjusts from 5 to 4 characters
- [ ] Rapid scrolling (`j` × 50): gutter re-renders on every frame without flicker; line numbers stay aligned with content
- [ ] File with > 100,000 lines: gutter displays correctly in large tier; truncates in smaller tiers
- [ ] Diff containing only deletions: all lines show old file line numbers with `-` signs
- [ ] Diff containing only additions: all lines show new file line numbers with `+` signs
- [ ] Diff with interleaved additions and deletions in the same hunk: line numbers track `oldLineNum` and `newLineNum` independently and correctly
- [ ] Terminal with no color support: `+` and `-` signs remain visible as ASCII characters; line numbers are still displayed
- [ ] Large hunk (>500 lines) with virtual scrolling: line numbers are computed for the visible window only, not pre-rendered for all lines

## Design

### Screen layout — unified view with line numbers

```
┌─────────────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Changes > abc12345 > Diff    ● 3 notifs   │
├───────────────┬─────────────────────────────────────────────────────┤
│ File Tree     │  app.ts                                            │
│               │  @@ -10,5 +10,8 @@ function setup()                │
│ M app.ts +5-2 │  10  │ import { config } from "./config"           │
│ A utils.ts +12│  11 -│ const val = 1                               │
│ D old.ts   -30│  11 +│ const val = computeValue()                  │
│               │  12 +│ const extra = validate(val)                  │
│               │  13  │ return val                                   │
│               │  14  │                                              │
│   (25%)       │              (75%)                                  │
├───────────────┴─────────────────────────────────────────────────────┤
│ t:view  w:ws  ]/[:files  x/z:hunks  │ File 1/4 │ ws:visible │ ?   │
└─────────────────────────────────────────────────────────────────────┘
```

#### Gutter anatomy (unified view)

```
┌─────┬──┬────────────────────────────────┐
│ num │sg│ code content                    │
├─────┼──┼────────────────────────────────┤
│  10 │  │ import { config } from "./co…  │  context: newLineNum=10, no sign
│  11 │ -│ const val = 1                  │  deletion: oldLineNum=11, red "-"
│  11 │ +│ const val = computeValue()     │  addition: newLineNum=11, green "+"
│  12 │ +│ const extra = validate(val)    │  addition: newLineNum=12, green "+"
│  13 │  │ return val                     │  context: newLineNum=13, no sign
└─────┴──┴────────────────────────────────┘
```

#### Gutter anatomy (split view)

```
┌─────┬──┬───────────────┐┌─────┬──┬───────────────┐
│ num │sg│ old content    ││ num │sg│ new content    │
├─────┼──┼───────────────┤├─────┼──┼───────────────┤
│  10 │  │ import { co…  ││  10 │  │ import { co…  │  context
│  11 │ -│ const val = 1 ││     │  │               │  deletion (right padding blank)
│     │  │               ││  11 │ +│ const val = …│  addition (left padding blank)
│  12 │  │ return val    ││  12 │  │ return val    │  context
└─────┴──┴───────────────┘└─────┴──┴───────────────┘
```

### Gutter width tiers

| Terminal width | Gutter chars | Max displayable line number | `minWidth` prop |
|----------------|-------------|----------------------------|------------------|
| 80–119 | 4 | 9,999 | 3 |
| 120–199 | 5 | 99,999 | 4 |
| 200+ | 6 | 999,999 | 5 |

The gutter character count includes: 1 left padding + N digits + `paddingRight` (1 char). The sign column is separate and adds 2 additional characters (`maxAfterWidth`).

### Component structure

```tsx
{files.map(file => (
  <box key={file.path} flexDirection="column">
    <box borderBottom="single">
      <text bold>{file.path}</text>
      <text color="muted">+{file.additions} -{file.deletions}</text>
    </box>
    {file.is_binary ? (
      <text color="muted">Binary file changed</text>
    ) : (
      <diff
        diff={file.patch}
        view={viewMode}
        filetype={file.language}
        showLineNumbers={true}
        syncScroll={viewMode === "split"}
        lineNumberFg="#888888"
        lineNumberBg="transparent"
        addedBg="#1a4d1a"
        removedBg="#4d1a1a"
        addedSignColor="#22c55e"
        removedSignColor="#ef4444"
        addedLineNumberBg="#143d14"
        removedLineNumberBg="#3d1414"
      />
    )}
  </box>
))}
```

### Keybindings

Line numbers do not introduce new keybindings. They are a passive visual element rendered by the `<diff>` component. All existing diff screen keybindings apply:

| Key | Interaction with line numbers |
|-----|-------------------------------|
| `j` / `Down` | Scrolls content and gutter in lockstep |
| `k` / `Up` | Scrolls content and gutter in lockstep |
| `G` | Gutter scrolls to show last file line number |
| `g g` | Gutter scrolls to show first file line number |
| `Ctrl+D` / `Ctrl+U` | Gutter pages with content |
| `t` | Gutter switches between single (unified) and dual (split) layout |
| `]` / `[` | Gutter resets to first line number of the target file |
| `z` / `Z` | Collapsed hunks suppress gutter; expanded hunks restore gutter |
| `x` / `X` | Expanding hunks restores gutter line numbers |
| `w` | Re-fetched diff recalculates all line number mappings |

### Responsive behavior

| Terminal size | Gutter width | Gutter behavior |
|---------------|-------------|------------------|
| 80×24 (minimum) | 4 chars | Single gutter (unified only). Narrower gutter preserves maximum code width. Sign column remains 2 chars. Total gutter footprint: 6 chars. |
| 120×40 (standard) | 5 chars | Single gutter in unified; dual gutters in split (each 5 chars). Total gutter footprint: 7 chars unified, 14 chars split. |
| 200×60 (large) | 6 chars | Single or dual gutters. Wider gutter handles large files. Total gutter footprint: 8 chars unified, 16 chars split. |
| Resize 120→80 | 5→4 chars | Gutter narrows synchronously. If in split view, auto-switches to unified. |
| Resize 80→120 | 4→5 chars | Gutter widens synchronously. View mode preserved. |

### Data hooks consumed

| Hook | Source | Purpose for line numbers |
|------|--------|---------------------------|
| `useChangeDiff(owner, repo, change_id)` | `@codeplane/ui-core` | Provides `FileDiffItem[]` with `patch` field; patch is parsed into hunks with `oldStart`/`newStart` used to seed line number maps |
| `useLandingDiff(owner, repo, number, opts)` | `@codeplane/ui-core` | Same as above for landing request diffs |
| `useTerminalDimensions()` | `@opentui/react` | Returns `{ columns, rows }`; used to select gutter width tier |
| `useOnResize()` | `@opentui/react` | Triggers gutter width recalculation on terminal resize |

### State management

Line numbers do not introduce new state beyond what the `<diff>` component manages internally:

- `lineNumbers: Map<number, number>` — maps visual line index to actual file line number (computed during `buildUnifiedView()` / `buildSplitView()`)
- `hideLineNumbers: Set<number>` — set of visual line indices where the gutter should be blank (padding lines in split view)
- `lineSigns: Map<number, LineSign>` — maps visual line index to `+` / `-` sign metadata
- `lineColors: Map<number, LineColorConfig>` — maps visual line index to gutter/content background colors

These maps are recomputed whenever the diff data changes, the view mode toggles, or the whitespace mode toggles.

## Permissions & Security

### Authorization

Line numbers are a rendering concern and do not require any additional authorization beyond access to the diff data itself:

| Action | Required role | Behavior when unauthorized |
|--------|--------------|----------------------------|
| View diff with line numbers | Repository read access | 404 "Repository not found" — no diff or line numbers rendered |
| View landing diff with line numbers | Repository read access | 404 "Repository not found" |
| View private repo diff | Repository member or collaborator | 404 "Repository not found" |

Line numbers do not expose any information beyond what the diff content itself contains. The line number values are derived entirely from the hunk headers (`@@ -oldStart,oldCount +newStart,newCount @@`) in the patch data returned by the API.

### Token-based authentication

- No change from the parent diff screen's auth model
- The TUI authenticates via `Bearer` token (from CLI keychain or `CODEPLANE_TOKEN`)
- 401 responses prevent the diff from loading entirely — line numbers are never rendered for unauthenticated users

### Rate limiting

- Line numbers add no additional API requests
- All rate limiting is governed by the diff fetch endpoints (`GET /api/repos/:owner/:repo/changes/:change_id/diff` and `GET /api/repos/:owner/:repo/landings/:number/diff`)
- Whitespace toggle re-fetches (which recalculate line numbers) are debounced at 300ms

### Input sanitization

- Line numbers are derived from integer arithmetic on hunk headers — no user input involved
- Line number values are converted to strings via `.toString()` and rendered through `buffer.drawText()` — no injection vector
- Sign characters (`+`, `-`) are hardcoded string literals, not derived from user or API input

## Telemetry & Product Analytics

### Key business events

Line numbers are a passive visual element and do not generate their own telemetry events. They contribute to existing diff screen events:

| Event | Line-number-relevant properties |
|-------|---------------------------------|
| `tui.diff.viewed` | `view_mode` (determines single vs. dual gutter layout) |
| `tui.diff.view_toggled` | `from_mode`, `to_mode` (gutter layout change) |
| `tui.diff.session_duration` | General engagement metric — readable line numbers contribute to session quality |

### Potential future events (not currently emitted)

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.diff.line_number.gutter_truncated` | A line number exceeds gutter capacity and is truncated | `max_line_number`, `gutter_width`, `terminal_width` |

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Diff screen usability satisfaction | No regression from baseline | Line numbers should not reduce perceived diff readability |
| Gutter truncation rate | < 0.1% of diff sessions | Extremely rare for real-world files to exceed gutter capacity |
| Unified → split toggle rate | > 20% of sessions (unchanged) | Dual-gutter split view adoption indicates line numbers are useful in both modes |

## Observability

### Logging requirements

| Level | Event | Format | When |
|-------|-------|--------|------|
| `debug` | `diff.gutter.tier_selected` | `{terminal_width, tier: "minimum"|"standard"|"large", gutter_chars}` | Gutter width tier determined at diff mount or terminal resize |
| `debug` | `diff.gutter.recalculated` | `{max_line_number, gutter_width, file_path}` | Gutter width recalculated for new diff data |
| `warn` | `diff.gutter.truncated` | `{max_line_number, gutter_width, file_path}` | A line number exceeds gutter display capacity |
| `debug` | `diff.line_numbers.built` | `{view_mode, line_count, sign_count, hidden_count}` | Line number maps computed after diff build |

### TUI-specific error cases

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during gutter render | Gutter width recalculates synchronously via `useOnResize()`. `LineNumberRenderable` calls `yogaNode.markDirty()` and triggers re-layout. No visual glitch | Automatic |
| Terminal resize below 80 columns | "Terminal too small" message displayed. No diff or gutter rendered | User resizes terminal |
| Diff data arrives with negative `oldStart` or `newStart` | Line numbers clamp to 1 (minimum). `warn` log emitted | Automatic clamping |
| `parsePatch()` fails on malformed hunk header | File-level parse error displayed. No gutter rendered for that file. Other files unaffected | File-level; non-recoverable |
| Extremely large file (>100k lines) in small terminal | Gutter truncates most-significant digits. `warn` log emitted. Numbers still right-aligned within available space | Automatic degradation |
| Virtual scrolling active (>500 line hunk) | `GutterRenderable.renderSelf()` only draws lines in the visible window (`startLine` to `startLine + height`). Line number map covers all logical lines but rendering is windowed | Automatic; no performance issue |
| Scroll position changes between frames | `GutterRenderable` detects `scrollY` change and re-renders gutter to match new visible range | Automatic (scroll-change detection in `renderSelf`) |

### Failure modes and degradation

| Failure | Impact | Degradation |
|---------|--------|-------------|
| `showLineNumbers` set to `false` | No gutter rendered | Gutter hidden; code content gets full width. Not an error — intentional for non-diff contexts |
| Line number map is empty (0 hunks) | No gutter content | Gutter area is blank background. File header still renders |
| Terminal lacks 256-color support | Gutter background coloring invisible | Line numbers and signs still render as plain text. `+`/`-` signs are always readable |
| Terminal lacks Unicode support | No impact — line numbers are ASCII digits | No degradation |
| `lineInfo.lineSources` is null | Gutter renders nothing | Early return in `GutterRenderable.refreshFrameBuffer()`. Logged as `debug` |

## Verification

Test file: `e2e/tui/diff.test.ts`

### Snapshot tests — line number visual states (15 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| SNAP-LN-001 | `renders line numbers in unified view at 120x40` | Snapshot of unified diff with line numbers in muted color, right-aligned in 5-char gutter. Addition lines show green `+`, deletion lines show red `-`, context lines show no sign |
| SNAP-LN-002 | `renders line numbers in unified view at 80x24` | Snapshot at minimum size with 4-char gutter. Numbers still right-aligned and muted. Gutter is narrower |
| SNAP-LN-003 | `renders line numbers in unified view at 200x60` | Snapshot at large size with 6-char gutter. Extra gutter width visible |
| SNAP-LN-004 | `renders dual line numbers in split view at 120x40` | Snapshot of split diff with old file numbers in left pane gutter and new file numbers in right pane gutter |
| SNAP-LN-005 | `renders dual line numbers in split view at 200x60` | Snapshot of split diff at large size with wider dual gutters |
| SNAP-LN-006 | `renders blank gutter for padding lines in split view` | Snapshot showing empty gutter cells on alignment padding lines in split mode |
| SNAP-LN-007 | `renders gutter background coloring for additions` | Snapshot verifying green-tinted gutter background on addition lines |
| SNAP-LN-008 | `renders gutter background coloring for deletions` | Snapshot verifying red-tinted gutter background on deletion lines |
| SNAP-LN-009 | `renders no line number on hunk headers` | Snapshot showing hunk header in cyan with blank gutter cell |
| SNAP-LN-010 | `renders no line number on collapsed hunk summary` | Snapshot of collapsed hunk "⋯ N lines hidden" with blank gutter |
| SNAP-LN-011 | `renders continuation line with blank gutter for wrapped text` | Snapshot of a long line that wraps — first row shows line number, second row shows blank gutter |
| SNAP-LN-012 | `renders correct line numbers across multiple hunks` | Snapshot of a diff with 3+ hunks showing correct line number continuity with gaps between hunks |
| SNAP-LN-013 | `renders addition-only diff with sequential new line numbers` | Snapshot of a new file where all lines are additions, showing sequential new file line numbers |
| SNAP-LN-014 | `renders deletion-only diff with sequential old line numbers` | Snapshot of a deleted file where all lines are deletions, showing sequential old file line numbers |
| SNAP-LN-015 | `renders line numbers for single-line diff` | Snapshot of a diff with exactly one changed line, showing line number `1` |

### Keyboard interaction tests — line number behavior (13 tests)

| Test ID | Test name | Key sequence | Expected state change |
|---------|-----------|-------------|----------------------|
| KEY-LN-001 | `j scrolls gutter with content` | `j` × 5 | Gutter line numbers advance by 5 lines, staying aligned with code content |
| KEY-LN-002 | `k scrolls gutter up with content` | `j` × 10, `k` × 3 | Gutter scrolls back 3 lines, numbers re-align |
| KEY-LN-003 | `G shows last file line number in gutter` | `G` | Gutter displays the final line number of the last file |
| KEY-LN-004 | `gg shows first line number in gutter` | `G`, `g`, `g` | Gutter displays line number starting from the first hunk |
| KEY-LN-005 | `Ctrl+D pages gutter with content` | `Ctrl+D` | Gutter advances by half visible height worth of line numbers |
| KEY-LN-006 | `t toggle switches gutter layout` | `t` (at 120+ cols) | Single gutter → dual gutters (split). Line numbers redistribute to old/new sides |
| KEY-LN-007 | `t toggle back restores single gutter` | `t`, `t` | Dual gutters → single gutter (unified). Line numbers recombined |
| KEY-LN-008 | `] resets gutter to next file first line` | `]` | Gutter shows line numbers starting from the first hunk of the next file |
| KEY-LN-009 | `[ resets gutter to previous file first line` | Navigate to file 3, `[` | Gutter shows line numbers starting from the first hunk of file 2 |
| KEY-LN-010 | `z hides gutter for collapsed hunk` | `z` | Collapsed hunk summary line has blank gutter; remaining lines renumber correctly |
| KEY-LN-011 | `x restores gutter for expanded hunks` | `z`, `x` | All hunks expanded; gutter line numbers fully restored |
| KEY-LN-012 | `w recalculates line numbers after whitespace toggle` | `w` | After re-fetch with `ignore_whitespace=true`, line numbers reflect the filtered diff's hunk starts |
| KEY-LN-013 | `rapid j presses keep gutter aligned` | `j` × 30 (rapid) | After rapid scrolling, gutter line numbers are exactly aligned with code content on every visible row |

### Responsive tests — gutter width at different terminal sizes (10 tests)

| Test ID | Test name | Terminal size | Expected behavior |
|---------|-----------|--------------|-------------------|
| RSP-LN-001 | `4-char gutter at 80x24` | 80×24 | Line number gutter occupies 4 characters. Right-aligned numbers. Sign column 2 chars. Total gutter: 6 chars |
| RSP-LN-002 | `5-char gutter at 120x40` | 120×40 | Line number gutter occupies 5 characters. Total gutter: 7 chars |
| RSP-LN-003 | `6-char gutter at 200x60` | 200×60 | Line number gutter occupies 6 characters. Total gutter: 8 chars |
| RSP-LN-004 | `gutter narrows on resize 120 to 80` | 120→80 | Gutter shrinks from 5 to 4 chars synchronously. Line numbers re-render |
| RSP-LN-005 | `gutter widens on resize 80 to 120` | 80→120 | Gutter grows from 4 to 5 chars synchronously. Line numbers re-render |
| RSP-LN-006 | `gutter widens on resize 120 to 200` | 120→200 | Gutter grows from 5 to 6 chars synchronously |
| RSP-LN-007 | `split view dual gutters at 120x40` | 120×40 | Two 5-char gutters (one per pane). Each pane has its own gutter with independent line numbers |
| RSP-LN-008 | `split to unified gutter transition on resize below 120` | Start split at 120, resize to 80 | Dual gutters collapse to single 4-char gutter as view auto-switches to unified |
| RSP-LN-009 | `line numbers correct after resize` | 120→80→120 | After double resize, line numbers are recalculated and correct for the final terminal size |
| RSP-LN-010 | `gutter truncates oversized line numbers` | 80×24, file with line 100,000 | Line number truncated to rightmost 3 digits. `warn` log emitted |

### Data integration tests (5 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| INT-LN-001 | `line numbers derived from hunk oldStart/newStart` | Diff with `@@ -15,3 +20,5 @@` shows deletion lines starting at 15, addition lines starting at 20, context lines at 20 |
| INT-LN-002 | `line numbers span multiple hunks correctly` | Diff with two hunks: first at lines 10-15, second at lines 50-55. Gap between hunks reflected in line numbers |
| INT-LN-003 | `whitespace toggle recalculates line numbers` | Toggle whitespace off → re-fetch returns different hunk starts → line numbers update to new values |
| INT-LN-004 | `line numbers correct for renamed file` | Renamed file diff shows old file line numbers on deletions, new file line numbers on additions |
| INT-LN-005 | `line numbers correct across file navigation` | Navigate from file 1 to file 2 via `]` — line numbers reset to file 2's hunk starts |

### Edge case tests (8 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| EDGE-LN-001 | `empty diff renders no gutter` | Diff with empty patch shows no gutter column |
| EDGE-LN-002 | `single-line addition shows line 1` | New file with one line shows `1 +` in gutter |
| EDGE-LN-003 | `deletion-only file shows old line numbers` | Deleted file shows sequential old line numbers with `-` signs |
| EDGE-LN-004 | `interleaved adds and deletes track independently` | Hunk with alternating `+`/`-` lines: old numbers increment on `-`, new numbers increment on `+` |
| EDGE-LN-005 | `hunk starting at line 1` | First hunk with `oldStart=1, newStart=1` shows line numbers starting at 1 |
| EDGE-LN-006 | `very large line numbers in small terminal` | File with lines >10,000 at 80×24: numbers truncated but right-aligned; no layout overflow |
| EDGE-LN-007 | `wrapped line shows number only on first row` | Line exceeding pane width wraps. Line number on row 1 only; row 2 gutter blank |
| EDGE-LN-008 | `split view padding lines have no number` | Padding lines in split view (alignment empties) show blank gutter, no number, no sign |
