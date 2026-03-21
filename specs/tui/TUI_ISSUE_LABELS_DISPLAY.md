# TUI_ISSUE_LABELS_DISPLAY

Specification for TUI_ISSUE_LABELS_DISPLAY.

## High-Level User POV

Labels are the visual shorthand a terminal developer uses to scan, categorize, and filter issues at a glance. The TUI_ISSUE_LABELS_DISPLAY feature governs how repository labels render across every issue-related surface in the Codeplane TUI — the issue list rows, the issue detail header, the issue create and edit forms, the label filter overlay, and the label picker modals. It is not a standalone screen; it is a cross-cutting rendering concern that ensures labels look correct, readable, and consistent everywhere they appear.

When a developer opens the issue list at 120×40, each issue row includes inline label badges rendered as bracketed text — for example, `[bug]` or `[priority:high]`. Each badge's text color is derived from the label's hex color field (`#RRGGBB`) mapped to the nearest color the terminal can display. On a truecolor terminal, the exact hex value is used. On a 256-color terminal, the nearest ANSI 256 palette index is selected. On a 16-color terminal, the closest basic ANSI color is used. The mapping is automatic and invisible to the user — labels always appear colored. If a label has a very dark color that would be invisible on a dark background, the TUI applies a minimum luminance floor to ensure readability.

In the issue list, labels appear after the issue title in a compact inline layout. When there are more labels than the available column width can fit, the excess labels are collapsed into a `+N` overflow indicator — for example, `[bug] [ui] +2`. The user can see all labels by opening the issue detail view, where labels render inline with wrapping across multiple lines. Label names longer than the display limit are truncated with an ellipsis (`…`).

In the issue detail view, labels sit in their own metadata row below the author line. Each label renders as `[label-name]` with the mapped color. Labels wrap naturally across lines when they exceed the available width. If the issue has no labels, the label row is omitted entirely — no "No labels" placeholder clutters the screen.

In the issue create and edit forms, the labels field presents a multi-select picker. When the picker opens, it shows a scrollable list of all repository labels, each prefixed with a colored bullet (`●`) matching the label's color. The user navigates with `j`/`k`, toggles selection with `Space`, filters with a fuzzy-search input, and confirms with `Enter`. Selected labels appear as colored badges in the form field summary.

In the label filter overlay on the issue list, labels are similarly rendered with colored `●` prefixes and checkboxes. The overlay supports multi-select with AND logic — selecting "bug" and "ui" shows only issues that have both labels.

On no-color terminals (when `NO_COLOR=1` is set), label badges render as plain `[label-name]` text without color, and the bullet prefix in pickers renders as a plain `●` in the default foreground color. The label system degrades gracefully and never produces invisible or garbled text.

## Acceptance Criteria

### Definition of Done

- [ ] Labels render as `[label-name]` badges with foreground text color mapped from the label's hex `color` field
- [ ] Color mapping supports three tiers: truecolor (direct hex), ANSI 256 (nearest palette index), ANSI 16 (nearest basic color)
- [ ] Color tier is detected at startup via `COLORTERM` environment variable and `TERM` capability, consistent with `TUI_THEME_AND_COLOR_TOKENS`
- [ ] Labels appear in the issue list row, issue detail metadata section, issue create form, issue edit form, label filter overlay, and label picker modals
- [ ] In the issue list row, labels appear inline after the title, space-separated, within the allocated label column width
- [ ] In the issue list, label badges that exceed the column width are collapsed to a `+N` overflow indicator (e.g., `[bug] +3`)
- [ ] In the issue detail view, labels render inline with natural line wrapping when they exceed the available width
- [ ] In the issue detail view, if the issue has zero labels, the label row is omitted (no placeholder text)
- [ ] In the issue create/edit forms, the label picker shows all repository labels from `useLabels()` with colored `●` prefixes
- [ ] In the label filter overlay, labels show colored `●` prefixes with `[✓]`/`[ ]` checkboxes for multi-select
- [ ] Label names are truncated with `…` at the contextual maximum: 12 characters in list row badges, 30 characters in detail view badges, 40 characters in picker lists (standard), 30 characters in picker lists (minimum terminal)
- [ ] The `+N` overflow indicator uses `muted` color (ANSI 245)
- [ ] Label badge brackets `[` and `]` render in `muted` color; the label name text renders in the mapped label color
- [ ] A minimum luminance floor is applied to mapped colors: labels with hex colors whose relative luminance is below 0.15 against a dark background are brightened to ensure readability
- [ ] Invalid hex color values (malformed, empty, or non-hex characters) fall back to `muted` color (ANSI 245) with a `warn`-level log
- [ ] Colors are resolved to `RGBA` objects from `@opentui/core` via the `ThemeProvider` context and OpenTUI's `RGBA.fromHex()` utility
- [ ] No label-related component uses hardcoded ANSI escape sequences — all colors flow through OpenTUI's color props (`fg`, `bg`)
- [ ] Label rendering is safe: label names are rendered as plain `<text>` content with no escape code injection
- [ ] The `NO_COLOR=1` environment variable disables all label coloring; badges render as plain `[label-name]` in default foreground

### Keyboard Interactions

- [ ] `l` (lowercase L) in the issue detail view opens the label picker to add/remove labels (write access required)
- [ ] `L` (uppercase L) in the issue list opens the label filter overlay for client-side filtering
- [ ] In the label picker / filter overlay: `j`/`k`/`Down`/`Up` navigate the label list
- [ ] In the label picker / filter overlay: `Space` toggles selection on the focused label
- [ ] In the label picker / filter overlay: `Enter` confirms selections and closes the overlay
- [ ] In the label picker / filter overlay: `Esc` cancels and closes the overlay without applying changes
- [ ] In the label picker / filter overlay: typing characters activates fuzzy search to narrow the label list
- [ ] In the label picker / filter overlay: `Backspace` removes characters from the fuzzy search input
- [ ] In the label picker / filter overlay: `g g` jumps to the first label; `G` jumps to the last label
- [ ] In the issue create/edit form label selector: `Enter` opens the label picker overlay; selected labels shown in the field summary as colored badges
- [ ] Label color rendering requires no keyboard interaction — it is purely visual

### Responsive Behavior

- [ ] **80×24 – 119×39 (minimum):** Labels are hidden in the issue list row. In the detail view, labels collapse behind an `m` toggle. Label picker overlays use 90% terminal width. Picker items show label name only. Badge truncation at 20ch.
- [ ] **120×40 – 199×59 (standard):** Labels visible in list rows within a 20-character column. Detail view shows labels inline. Picker overlays use 60% terminal width. Badge truncation in list at 12ch; in detail at 30ch.
- [ ] **200×60+ (large):** Labels visible in list rows within a 30-character column. Detail view shows labels inline with full names. Picker overlays use 50% terminal width with descriptions. Badge truncation in list at 15ch; in detail at 30ch.
- [ ] Terminal resize triggers synchronous re-layout of all label badges

### Truncation & Boundary Constraints

- [ ] Label name maximum length: 255 characters (server-enforced); client truncates for display only
- [ ] List row badge: label name truncated at 12ch (standard), 15ch (large) with `…` suffix
- [ ] Detail view badge: label name truncated at 30ch with `…` suffix
- [ ] Picker list item: label name truncated at 40ch (standard), 30ch (minimum) with `…` suffix
- [ ] Label column in issue list: 20ch (standard), 30ch (large), hidden (minimum)
- [ ] Maximum selectable labels in picker: 10 (matching API constraint)
- [ ] Maximum labels rendered in picker list: 100 items visible
- [ ] Unicode in label names: truncation respects grapheme cluster boundaries
- [ ] Empty label name (defensive): renders as `[?]` in `warning` color

### Edge Cases

- [ ] Issue has zero labels: no label badges in list row, no label row in detail view
- [ ] Issue has 20+ labels: list row shows as many as fit plus `+N`; detail view wraps all labels
- [ ] Label hex color `#000000`: brightened to meet minimum luminance floor for readability
- [ ] Label with invalid color (`#ZZZZZZ`, empty, null): falls back to `muted` color
- [ ] Label name containing special characters: rendered safely as plain text
- [ ] Label name containing emoji or wide Unicode: truncation accounts for display width
- [ ] Repository has zero labels: picker shows "No labels defined" message
- [ ] Repository has 500+ labels: picker scrolls, search narrows effectively
- [ ] Rapid `Space` presses in picker: each press toggles deterministically
- [ ] `NO_COLOR=1`: all label colors disabled
- [ ] 16-color terminal: labels map to basic ANSI colors
- [ ] Network error loading labels: picker shows error with retry option

## Design

### Label Badge Component

The core rendering primitive is a `<LabelBadge>` component used across all surfaces:

```jsx
<box flexDirection="row" gap={0}>
  <text fg={ANSI_MUTED}>[</text>
  <text fg={resolveColor(label.color)}>{truncate(label.name, maxLen)}</text>
  <text fg={ANSI_MUTED}>]</text>
</box>
```

The `resolveColor(hexColor)` function: (1) Validates hex string, (2) Converts to `RGBA` via `RGBA.fromHex()`, (3) Applies luminance floor if below 0.15, (4) On truecolor: returns RGBA directly, (5) On ANSI 256: maps to nearest palette index, (6) On ANSI 16: maps to nearest basic color, (7) On no-color: returns undefined, (8) On invalid input: returns muted token color.

### Issue List Row — Labels Column

```jsx
{breakpoint !== "minimum" && (
  <box width={labelColumnWidth} flexDirection="row" gap={1}>
    {visibleLabels.map(label => (
      <LabelBadge key={label.id} label={label} maxLen={breakpoint === "large" ? 15 : 12} />
    ))}
    {overflowCount > 0 && <text fg={ANSI_MUTED}>+{overflowCount}</text>}
  </box>
)}
```

Overflow algorithm: Calculate available width (20ch standard, 30ch large). For each label, compute rendered width = min(name.length, maxLen) + 2 (brackets) + 1 (gap). Add labels left-to-right until next would exceed remaining width minus 3 (reserved for `+N`).

### Issue Detail View — Labels Row

```jsx
{issue.labels.length > 0 && (
  <box flexDirection="row" gap={1} wrap="wrap" paddingX={1}>
    {issue.labels.map(label => (
      <LabelBadge key={label.id} label={label} maxLen={30} />
    ))}
  </box>
)}
```

No overflow indicator — all labels render with line wrapping.

### Label Picker Overlay

Centered modal with `borderStyle="single"`, `borderColor={ANSI_PRIMARY}`, `backgroundColor={ANSI_SURFACE}`. Contains: search input (max 60ch), scrollable label list with `[✓]`/`[ ]` checkboxes and colored `●` prefixes, footer with cap indicator and keybinding hints.

Picker dimensions: 90%/60%/50% width at minimum/standard/large breakpoints, 60% height at all sizes. Label descriptions shown only at large breakpoint.

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `L` | Issue list (list focused) | Open label filter overlay |
| `l` | Issue detail (write access) | Open label picker |
| `j`/`Down` | Picker/filter overlay | Next label |
| `k`/`Up` | Picker/filter overlay | Previous label |
| `Space` | Picker/filter overlay | Toggle selection |
| `Enter` | Picker/filter overlay | Confirm and close |
| `Esc` | Picker/filter overlay | Cancel and close |
| `g g` | Picker/filter overlay | First label |
| `G` | Picker/filter overlay | Last label |
| `R` | Picker (error state) | Retry loading |
| Typing | Picker/filter overlay | Fuzzy search |
| `Backspace` | Picker (search active) | Remove search character |

### Responsive Resize

On resize: breakpoint recalculates, issue list columns appear/disappear, badge truncation limits update, overflow counts recalculate, open picker overlays re-center/resize, selection and search state preserved, focused label preserved.

### Data Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useLabels(owner, repo)` | `@codeplane/ui-core` | All repo labels for pickers |
| `useIssueLabels(owner, repo, number)` | `@codeplane/ui-core` | Labels on a specific issue |
| `useUpdateIssue(owner, repo, number)` | `@codeplane/ui-core` | Mutate issue labels (PATCH) |
| `useAddIssueLabels(owner, repo, number)` | `@codeplane/ui-core` | Add labels (POST) |
| `useRemoveIssueLabel(owner, repo, number, name)` | `@codeplane/ui-core` | Remove label (DELETE) |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useKeyboard()` | `@opentui/react` | Keyboard events |

### Optimistic UI

Add label: badge appears immediately, reverts on error with 3s toast. Remove label: badge disappears immediately, reverts on error. Filter overlay: purely client-side, no optimistic concerns.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View labels on issues (public repo) | ✅ | ✅ | ✅ | ✅ |
| View labels on issues (private repo) | ❌ | ✅ | ✅ | ✅ |
| Open label filter overlay | ✅ (public) | ✅ | ✅ | ✅ |
| Add/remove labels on an issue | ❌ | ❌ | ✅ | ✅ |
| View label picker (detail view `l`) | ❌ | ❌ | ✅ | ✅ |

- Label display is a read operation — any user who can view the issue can see its labels.
- The `l` keybinding for the label picker in the detail view is only shown in status bar hints when the user has write access.
- If a user without write access presses `l`, the TUI shows "Permission denied" as a status bar flash in `error` color for 3 seconds.
- The label filter overlay (`L` on issue list) is available to all users who can view the issue list — it is a client-side filtering operation.

### Token-based Auth

- Authentication token is injected by `<APIClientProvider>` — label components never access or display the token.
- `GET /api/repos/:owner/:repo/labels` respects repository visibility (public vs. private).
- `POST /api/repos/:owner/:repo/issues/:number/labels` requires write access; 403 triggers optimistic revert and error display.
- 401 on any label-related request triggers the global auth error screen.

### Rate Limiting

- `GET /api/repos/:owner/:repo/labels` shares the 300 req/min rate limit for repository read endpoints.
- Label picker data is fetched lazily (on first open) and cached for the session.
- `POST` and `DELETE` label operations share the 60 req/min write rate limit.
- 429 responses display "Rate limited. Retry in {Retry-After}s." inline.

### Input Sanitization

- Label names rendered as plain `<text>` — no terminal escape injection vector.
- Hex color values validated before `RGBA.fromHex()` — malformed values fall back to muted.
- Fuzzy search input is client-side only; never sent to the API.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.labels.displayed` | Issue list row renders with ≥1 label | `repo`, `issue_number`, `label_count`, `overflow_count`, `breakpoint`, `terminal_width` |
| `tui.labels.detail_displayed` | Issue detail renders with ≥1 label | `repo`, `issue_number`, `label_count`, `lines_wrapped`, `breakpoint` |
| `tui.labels.picker_opened` | Label picker overlay opens | `repo`, `issue_number`, `available_label_count`, `current_label_count`, `breakpoint` |
| `tui.labels.picker_applied` | Picker selections confirmed | `repo`, `issue_number`, `added_count`, `removed_count`, `final_count`, `used_search` |
| `tui.labels.picker_cancelled` | Picker dismissed with Esc | `repo`, `issue_number`, `had_pending_changes` |
| `tui.labels.filter_opened` | Filter overlay opens (issue list `L`) | `repo`, `available_label_count`, `breakpoint` |
| `tui.labels.filter_applied` | Filter selections confirmed | `repo`, `selected_count`, `matched_issue_count`, `total_loaded_count`, `used_search` |
| `tui.labels.filter_cancelled` | Filter dismissed with Esc | `repo`, `had_pending_changes` |
| `tui.labels.color_fallback` | Invalid color triggered fallback | `repo`, `label_id`, `raw_color`, `fallback_reason` |
| `tui.labels.add_error` | Server error on label add | `repo`, `issue_number`, `label_name`, `http_status`, `error_type` |
| `tui.labels.remove_error` | Server error on label remove | `repo`, `issue_number`, `label_name`, `http_status`, `error_type` |
| `tui.labels.picker_search` | User types in picker search | `repo`, `query_length`, `match_count`, `total_count` |

### Common Properties (all events)

`session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_tier` (truecolor/ansi256/ansi16/nocolor), `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Label display correctness (no color fallbacks) | >99% of displayed events |
| Label filter usage | >10% of issue list views |
| Label picker usage (detail view) | >5% of issue detail views |
| Label picker completion rate (applied/opened) | >70% |
| Color fallback rate | <1% |
| Label add/remove error rate | <2% |
| Picker search adoption | >20% of picker opens |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Badge rendered | `Labels: rendered [repo={r}] [issue={n}] [count={c}] [overflow={o}] [breakpoint={bp}]` |
| `debug` | Color resolved | `Labels: color resolved [label={name}] [hex={hex}] [tier={tier}] [index={idx}]` |
| `debug` | Picker opened | `Labels: picker opened [repo={r}] [available={n}] [current={c}]` |
| `debug` | Picker search | `Labels: picker search [repo={r}] [query={q}] [matches={m}]` |
| `info` | Labels added | `Labels: added [repo={r}] [issue={n}] [labels={names}] [count={c}]` |
| `info` | Labels removed | `Labels: removed [repo={r}] [issue={n}] [labels={names}] [count={c}]` |
| `info` | Filter applied | `Labels: filter applied [repo={r}] [selected={names}] [matched={m}]` |
| `warn` | Invalid color | `Labels: invalid color [repo={r}] [label={name}] [color={raw}] [reason={reason}]` |
| `warn` | Fetch failed | `Labels: fetch failed [repo={r}] [status={code}] [error={msg}]` |
| `warn` | Mutation failed | `Labels: mutation failed [repo={r}] [issue={n}] [action={add|remove}] [label={name}] [status={code}]` |
| `warn` | Picker cap | `Labels: picker cap [repo={r}] [total={n}] [cap=100]` |
| `error` | Auth error | `Labels: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `Labels: permission denied [repo={r}] [issue={n}] [action={add|remove}]` |
| `error` | Render error | `Labels: render error [repo={r}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during label picker | Picker re-centers/resizes; selection preserved | Synchronous re-layout |
| Resize causing breakpoint change | Label column appears/disappears; truncation recalculates | Synchronous re-layout |
| SSE disconnect | Label display unaffected (REST-based) | Independent |
| Auth expiry during mutation | Optimistic revert; global auth error screen | Re-auth via CLI |
| Network timeout fetching labels | Picker shows loading → error with "Press R to retry" | User presses R |
| 403 on label add/remove | Optimistic revert; "Permission denied" flash | Informational |
| 429 rate limit | Inline rate limit message | User waits and retries |
| Invalid hex color at render | Falls back to muted; logs warning | Automatic |
| Label with null/empty name | Renders as `[?]` in warning color | Automatic |
| Zero labels in repo | Picker shows message; toggle/select no-ops | Esc to close |
| Component crash | Global error boundary; "Press r to restart" | User restarts |
| Rapid Space presses | Sequential processing; no race | Built-in event ordering |

### Failure Modes

- Label fetch error → picker shows inline error; list/detail render without labels (or cached data)
- Color resolution crash → caught in `resolveColor()`; returns muted fallback; never propagates
- Label mutation error → optimistic revert, inline toast, user retries
- All label API fails → labels omitted; other issue fields still render

## Verification

### Test File: `e2e/tui/issues.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### Terminal Snapshot Tests (22 tests)

- SNAP-LABELS-001: Issue list row with 1 label badge at 120×40 — colored `[bug]` after title
- SNAP-LABELS-002: Issue list row with 3 labels at 120×40 — `[bug] [ui] [docs]` inline
- SNAP-LABELS-003: Issue list row with 5 labels at 120×40 — `[bug] [ui] +3` overflow
- SNAP-LABELS-004: Issue list row with labels at 200×60 — wider column, more labels visible
- SNAP-LABELS-005: Issue list row at 80×24 — no labels column visible
- SNAP-LABELS-006: Issue detail with 1 label — `[bug]` in metadata section
- SNAP-LABELS-007: Issue detail with 6 labels wrapping to 2 lines
- SNAP-LABELS-008: Issue detail with zero labels — label row omitted
- SNAP-LABELS-009: Label picker overlay at 120×40 — centered, bordered, colored bullets
- SNAP-LABELS-010: Label picker overlay at 80×24 — 90% width, no descriptions
- SNAP-LABELS-011: Label picker overlay at 200×60 — 50% width, descriptions visible
- SNAP-LABELS-012: Label picker with 3 selected labels — `[✓]` checkboxes
- SNAP-LABELS-013: Label picker with fuzzy search active — filtered list
- SNAP-LABELS-014: Label picker empty repo — "No labels defined" message
- SNAP-LABELS-015: Label filter overlay with 2 selected
- SNAP-LABELS-016: Label badge with dark color (#000000) — brightened
- SNAP-LABELS-017: Label badge with bright color (#FFFF00) — rendered as-is
- SNAP-LABELS-018: Label badge with invalid color — muted fallback
- SNAP-LABELS-019: Label badge truncation — ellipsis visible
- SNAP-LABELS-020: `+N` overflow indicator in muted color
- SNAP-LABELS-021: Issue create form label field with selected labels
- SNAP-LABELS-022: `NO_COLOR=1` rendering — plain text badges

### Keyboard Interaction Tests (20 tests)

- KEY-LABELS-001: `L` opens label filter overlay from issue list
- KEY-LABELS-002: `l` opens label picker from issue detail
- KEY-LABELS-003: `l` without write access shows "Permission denied"
- KEY-LABELS-004: `j`/`k` navigation within picker
- KEY-LABELS-005: `Down`/`Up` navigation (arrow keys)
- KEY-LABELS-006: `Space` toggles selected → deselected
- KEY-LABELS-007: `Space` toggles deselected → selected
- KEY-LABELS-008: `Enter` confirms and closes picker
- KEY-LABELS-009: `Esc` cancels without applying
- KEY-LABELS-010: Typing activates fuzzy search
- KEY-LABELS-011: `Backspace` removes search characters
- KEY-LABELS-012: `g g` jumps to first label
- KEY-LABELS-013: `G` jumps to last label
- KEY-LABELS-014: `R` retries after fetch error
- KEY-LABELS-015: `Space` at max selection (10) prevents additional
- KEY-LABELS-016: `Space` in empty picker is no-op
- KEY-LABELS-017: Rapid `Space` presses toggle deterministically
- KEY-LABELS-018: Confirm with labels added → optimistic badge appears
- KEY-LABELS-019: Confirm with labels removed → badge disappears
- KEY-LABELS-020: `L` → select → Enter → list filters to matches

### Responsive Tests (12 tests)

- RESP-LABELS-001: Labels hidden at 80×24, visible at 120×40
- RESP-LABELS-002: Resize 120→80 — column disappears
- RESP-LABELS-003: Resize 80→120 — column appears with badges
- RESP-LABELS-004: Column width 20ch→30ch on resize to 200×60
- RESP-LABELS-005: Truncation changes on resize (12ch→15ch)
- RESP-LABELS-006: Overflow recalculates on resize
- RESP-LABELS-007: Picker resizes 60%→90% when terminal shrinks
- RESP-LABELS-008: Picker descriptions shown/hidden by breakpoint
- RESP-LABELS-009: Resize while picker open — re-centers, selections preserved
- RESP-LABELS-010: Detail view labels wrap/unwrap on resize
- RESP-LABELS-011: Create form label field re-renders on resize
- RESP-LABELS-012: Focus preserved through resize in picker

### Integration Tests (16 tests)

- INT-LABELS-001: Labels fetched and rendered in issue list
- INT-LABELS-002: Labels fetched and rendered in issue detail
- INT-LABELS-003: Picker loads labels from API on first open
- INT-LABELS-004: Picker caches labels across opens
- INT-LABELS-005: Add label sends POST
- INT-LABELS-006: Remove label sends DELETE
- INT-LABELS-007: Optimistic add reverts on 403
- INT-LABELS-008: Optimistic add reverts on 500
- INT-LABELS-009: Optimistic remove reverts on error
- INT-LABELS-010: 401 triggers auth error screen
- INT-LABELS-011: 429 shows rate limit message
- INT-LABELS-012: Filter overlay filters client-side (AND logic)
- INT-LABELS-013: Two labels selected → only issues with both shown
- INT-LABELS-014: Clear filter → all issues restored
- INT-LABELS-015: Color mapping consistent across list and detail
- INT-LABELS-016: Null/empty description renders without crash

### Edge Case Tests (14 tests)

- EDGE-LABELS-001: 255-char label name truncated correctly
- EDGE-LABELS-002: Emoji label — grapheme-aware truncation
- EDGE-LABELS-003: CJK wide chars — display width calculated
- EDGE-LABELS-004: #000000 color — luminance floor applied
- EDGE-LABELS-005: Color without # prefix — handled
- EDGE-LABELS-006: #ZZZZZZ color — muted fallback
- EDGE-LABELS-007: Empty color string — muted fallback
- EDGE-LABELS-008: 50 labels — detail wraps, list overflows
- EDGE-LABELS-009: 500 labels — picker shows 100, search works
- EDGE-LABELS-010: Concurrent resize + picker navigation
- EDGE-LABELS-011: Rapid open/close cycles
- EDGE-LABELS-012: Whitespace-only label name → `[?]`
- EDGE-LABELS-013: Duplicate label names different colors
- EDGE-LABELS-014: Network disconnect mid-mutation

All 84 tests left failing if backend is unimplemented — never skipped or commented out.
