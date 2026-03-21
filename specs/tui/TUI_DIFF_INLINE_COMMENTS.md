# TUI_DIFF_INLINE_COMMENTS

Specification for TUI_DIFF_INLINE_COMMENTS.

## High-Level User POV

Inline comments bring the code review conversation directly into the diff viewer. When a developer opens a landing request diff, existing review comments appear anchored to the exact lines they reference — right below the diff line, indented and framed with a primary-colored left border. Each comment block shows the author's `@username` in bold primary color, a relative timestamp in muted text, and the comment body rendered as full markdown. The developer sees the conversation in context, not in a separate tab.

The developer initiates a new inline comment by positioning the cursor on any diff line and pressing `c`. A comment creation form slides in below the focused line: a one-line context header showing the file path, line number, and side (left for deletions, right for additions, both for context lines), followed by a multi-line markdown textarea. The developer types their review feedback, presses `Ctrl+S` to submit, and sees the comment appear immediately via optimistic rendering — `@username · ⏳ just now` — before the server response finalizes it with a real timestamp. Pressing `Esc` cancels the form; if the developer has typed content, a discard confirmation prompt appears to prevent accidental loss.

Only landing request diffs support inline comments. When viewing a change diff (not associated with a landing request), the `c` key is a silent no-op — no form opens, no status bar message appears. This makes the feature entirely invisible and non-distracting outside of the code review workflow.

Existing comments are loaded from the API when the diff screen mounts for a landing request. Comments are grouped by file path and line number, then rendered inline below their referenced line in the diff output. When multiple comments exist on the same line, they stack vertically in chronological order. The developer navigates between inline comments using `n` (next comment) and `p` (previous comment), which scroll the diff viewport to bring the next or previous comment into view and highlight it with a brighter left border. This lets the developer efficiently walk through all review feedback across the entire diff without manual scrolling.

At the minimum 80×24 terminal size, inline comment bodies wrap tightly, timestamps use short format (`2h`), and the textarea is 5 rows tall. At standard 120×40, comments display with comfortable padding, medium timestamps (`2h ago`), and an 8-row textarea. At large 200×60+, full timestamps (`2 hours ago`), generous spacing between comment blocks, and a 12-row textarea give the developer a spacious review experience. Terminal resize during comment composition preserves all typed content, cursor position, and the pre-populated context header.

The comment form includes a live character counter when the body exceeds 40,000 characters, warning the developer as they approach the 50,000-character limit. Empty or whitespace-only submissions are rejected client-side with an inline validation message. The form enforces single-instance — only one comment form can be open at a time. If the developer presses `c` on a different line while a form is already open, the existing form must be cancelled (with confirmation if it has content) before a new one opens.

When an inline comment references a line that is inside a collapsed hunk, that hunk is automatically expanded to reveal the comment. Comments are never hidden behind collapsed hunks.

## Acceptance Criteria

### Comment rendering (existing comments)
- [ ] When the diff screen is opened for a landing request, existing inline comments are fetched via `useLandingComments(owner, repo, number)`
- [ ] Comments with `path !== ""` and `line > 0` are rendered inline below the corresponding diff line in the main content area
- [ ] Comments are positioned below the line matching their `path`, `line`, and `side` combination
- [ ] For `side === "right"`, the comment is anchored below the addition line with that line number
- [ ] For `side === "left"`, the comment is anchored below the deletion line with that line number
- [ ] For `side === "both"`, the comment is anchored below the context line with that line number
- [ ] Multiple comments on the same line stack vertically in chronological order (oldest first)
- [ ] Each comment block renders: `@username` in `primary` color (ANSI 33) with `BOLD` attribute, a relative timestamp in `muted` color (ANSI 245), and the comment body via the `<markdown>` component
- [ ] Each comment block has a left border in `primary` color (ANSI 33) using `│` characters
- [ ] Comment blocks are indented 2 characters from the left edge of the diff content area (past the line number gutter)
- [ ] A 1-row gap separates multiple comment blocks on the same line
- [ ] A 1-row gap separates the last comment block from the next diff line
- [ ] Comments with `path === ""` or `line === 0` are NOT rendered inline in the diff — they are general comments shown in TUI_LANDING_COMMENTS_VIEW
- [ ] An `(edited)` indicator appears in `muted` color next to the timestamp when `updated_at` differs from `created_at`
- [ ] Comments authored by the current user show a `(you)` suffix after the username in `muted` color
- [ ] Comment bodies render with full markdown support: headings, lists, code blocks (syntax highlighted), bold, italic, links, blockquotes
- [ ] Code blocks within comment markdown render with `<code>` syntax highlighting
- [ ] Links in comment markdown render as underlined text with the URL inline in `muted` color

### Comment navigation
- [ ] `n` moves focus to the next inline comment in the diff (across all files, ordered by file position then chronological within same line)
- [ ] `p` moves focus to the previous inline comment in the diff
- [ ] The focused comment is indicated by a brighter left border: `primary` color (ANSI 33) with `BOLD` attribute, vs non-focused comments using regular `primary` weight
- [ ] When `n`/`p` navigates to a comment not currently visible, the scrollbox scrolls to bring the focused comment into view with at least 2 lines of context above it
- [ ] `n` on the last comment in the diff is a no-op — focus stays on the last comment
- [ ] `p` on the first comment in the diff is a no-op — focus stays on the first comment
- [ ] If there are zero inline comments, `n` and `p` are no-ops
- [ ] If there is exactly one inline comment, `n` and `p` are no-ops (focus stays on the single comment)
- [ ] `n`/`p` navigation crosses file boundaries — the next comment may be in a different file
- [ ] The status bar shows "Comment N of M" when a comment is focused, where N is the 1-based index and M is the total inline comment count
- [ ] When navigating to a comment in a different file, the file tree sidebar focus follows (same behavior as `]`/`[` file navigation)
- [ ] Comment focus is cleared when the developer scrolls away with `j`/`k` or uses file navigation (`]`/`[`)

### Comment creation form
- [ ] Pressing `c` on a focused diff line opens a comment creation form below that line
- [ ] The form is only available when viewing a landing request diff — `c` is a no-op on change diffs
- [ ] The form is only available to authenticated users with write access to the repository
- [ ] For unauthenticated users, `c` shows a status bar message: "Sign in to comment. Run `codeplane auth login`."
- [ ] For read-only users, `c` shows a status bar message: "Write access required to comment."
- [ ] The form has a context header showing: `📄 {path}:{line} ({side})` in `primary` color
- [ ] The `side` value is determined by the focused line type: `"right"` for addition lines, `"left"` for deletion lines, `"both"` for context lines
- [ ] The `path` in the context header is the file path of the currently displayed file
- [ ] The `line` in the context header is the line number of the focused diff line (from the appropriate side gutter)
- [ ] The form has a multi-line `<input multiline>` textarea for the comment body
- [ ] The textarea is pre-focused immediately when the form opens
- [ ] `Enter` inserts a newline in the textarea (does not submit)
- [ ] `Ctrl+S` submits the comment
- [ ] `Esc` closes the form — if the textarea is empty, it closes immediately; if non-empty, a discard confirmation prompt appears
- [ ] The discard confirmation prompt: "Discard comment? (y/n)" — `y` discards and closes, `n` or `Esc` returns to editing
- [ ] Only one comment form can be open at a time
- [ ] Pressing `c` while a form is already open triggers the discard flow for the existing form before opening a new one on the new line
- [ ] The textarea supports standard text editing: arrow keys, Home/End, `Ctrl+K` (kill to end of line), `Ctrl+U` (kill to beginning of line), Backspace, Delete
- [ ] A character counter appears in `muted` color when the body exceeds 40,000 characters: `40,123 / 50,000`
- [ ] Input beyond 50,000 characters is rejected (no further characters inserted)
- [ ] The status bar changes to: `Ctrl+S:submit │ Esc:cancel` while the form is open
- [ ] All other diff keybindings (`j/k`, `]`/`[`, `t`, `w`, `z`, `x`, `Tab`, `n`, `p`) are disabled while the form is open, except `Ctrl+C` (quit) and `?` (help)

### Comment submission and optimistic UI
- [ ] On `Ctrl+S`, the comment body is trimmed of leading/trailing whitespace
- [ ] If the trimmed body is empty, a validation error appears below the textarea in `error` color (ANSI 196): "Comment cannot be empty." — the form remains open
- [ ] On valid submission, the form closes and an optimistic comment block appears below the line: `@{current_user} · ⏳ just now` with the typed body
- [ ] The API request is sent via `useCreateLandingComment(owner, repo, number)` with `{ body: trimmedBody, path, line, side }`
- [ ] On success (201 response), the optimistic comment is replaced with the server response data (real `id`, `created_at`, `updated_at`)
- [ ] On failure (non-2xx or network error), the optimistic comment is removed and an error message appears in `error` color in the status bar: the server error message or "Failed to submit comment. Press c to try again."
- [ ] On failure, the comment body content is preserved in memory — pressing `c` on the same line reopens the form pre-populated with the failed content
- [ ] Double-submit prevention: `Ctrl+S` is disabled after the first submit until the API response is received
- [ ] A `⏳` spinner indicator appears in the status bar during submission: "Submitting comment…"
- [ ] Server 403 response: "Permission denied. You cannot comment on this landing request."
- [ ] Server 429 response: "Rate limit exceeded. Try again later." — form content preserved
- [ ] Server 401 response: "Session expired. Run `codeplane auth login` to re-authenticate."

### Collapsed hunk interaction
- [ ] When an inline comment references a line inside a collapsed hunk, that hunk is automatically expanded
- [ ] Hunks with inline comments cannot be collapsed via `z` or `Z` — pressing `z` on a hunk that contains commented lines is a no-op with status bar message: "Cannot collapse hunk with inline comments"
- [ ] `Z` (collapse all hunks in file) skips hunks that contain inline comments
- [ ] Pressing `c` on a visible line inside an expanded hunk works normally
- [ ] When a new comment is submitted on a line within a hunk, that hunk becomes un-collapsible

### Diff view mode interaction
- [ ] In unified view, comments appear below the referenced line spanning the full content width
- [ ] In split view, comments anchored to `side === "left"` appear below the line in the left pane
- [ ] In split view, comments anchored to `side === "right"` appear below the line in the right pane
- [ ] In split view, comments anchored to `side === "both"` appear spanning both panes
- [ ] When toggling from split to unified view (`t`), comment positions adjust to the unified layout
- [ ] When toggling from unified to split view (`t`), comment positions adjust to the split layout
- [ ] Comment navigation (`n`/`p`) works identically in both view modes

### Boundary constraints
- [ ] Comment body rendering: truncated at 50,000 characters with `…` and "(View full comment)" notice in `muted` text
- [ ] Comment body input: hard cap at 50,000 characters — no further input accepted
- [ ] Character counter: appears at 40,000+ characters in `muted` color, switches to `warning` color (ANSI 178) at 45,000+, switches to `error` color (ANSI 196) at 49,000+
- [ ] Author username display: max 39 characters, truncated with `…`
- [ ] File path in context header: truncated from the left with `…` prefix at `terminal_width - 30` characters
- [ ] Line number display: up to 6 digits supported
- [ ] Maximum 500 inline comments loaded per landing diff — beyond this, a notice in `warning` color: "Showing 500 of N comments. View all in Comments tab."
- [ ] Textarea height: 5 rows at 80×24, 8 rows at 120×40, 12 rows at 200×60+
- [ ] Textarea width: fills available content width minus 4 characters (2 for indent, 2 for border)
- [ ] Textarea maximum input lines: 10,000 lines
- [ ] Relative timestamps: "just now" (<1m), "Nm" (1–59m), "Nh" (1–23h), "Nd" (1–29d), "YYYY-MM-DD" (30d+)
- [ ] At 80×24, timestamps use short format: "2h". At 120×40: "2h ago". At 200×60+: "2 hours ago"
- [ ] Comment count in `n`/`p` navigation ("Comment N of M"): max display is "Comment 500 of 500"
- [ ] Scrollbox must handle interleaved diff lines and comment blocks — total virtual height may exceed 100,000 lines for large diffs with many comments

### Edge cases
- [ ] Terminal resize while comment form is open: form re-layouts within new dimensions, textarea content and cursor position preserved
- [ ] Terminal resize during comment submission (optimistic phase): layout adjusts, optimistic comment re-renders at new width
- [ ] Terminal resize below 80×24 while form is open: "Terminal too small" message shown, form content preserved in memory — resize back restores form
- [ ] Rapid `c` presses: second `c` triggers discard flow for first form, does not open two forms
- [ ] `c` pressed on a hunk header line (`@@` line): comment anchored to the first content line after the hunk header
- [ ] `c` pressed on a "Binary file changed" notice: no-op
- [ ] `c` pressed on a "File too large to display" notice: no-op
- [ ] `c` pressed on a collapsed hunk summary (`⋯ N lines hidden`): no-op — developer must expand the hunk first
- [ ] `c` pressed on a file header line (filename separator): no-op
- [ ] `c` pressed on an existing comment block: opens a new comment on the same line the existing comment references (stacks below)
- [ ] SSE disconnect during comment submission: optimistic comment remains visible, status bar shows "Comment may not have been saved. Press R to refresh."
- [ ] API returns a comment referencing a line number that no longer exists in the diff (e.g., force-pushed): comment renders at the end of the file with a notice in `warning` color: "Line {N} not found in current diff"
- [ ] API returns a comment referencing a file path not in the diff: comment is not rendered inline (it will appear in TUI_LANDING_COMMENTS_VIEW)
- [ ] Whitespace toggle (`w`) while comments are displayed: comments remain anchored to their original line numbers, but diff lines may shift — comments that can no longer find their anchor line render at file end with a "Line not found" notice
- [ ] View toggle (`t`) while comment form is open: form closes with content preserved in memory — status bar: "Comment form closed. Press c to reopen."
- [ ] File navigation (`]`/`[`) with comments: inline comments are visible as part of each file's diff section
- [ ] Concurrent comment submission and screen pop (`q`): submission completes in background; no error shown
- [ ] Comment with only code blocks: renders correctly via `<markdown>` with syntax-highlighted `<code>` blocks
- [ ] Comment containing raw ANSI escape sequences: sequences are escaped by the `<markdown>` component, displayed as literal text
- [ ] `Ctrl+C` while comment form is open: TUI quits immediately, draft is lost (documented behavior)
- [ ] Landing request with 0 inline comments: `n`/`p` are no-ops, `c` works normally, no comment blocks rendered
- [ ] `NO_COLOR` environment variable set: comment borders use `|` ASCII fallback, bold removed, primary color replaced with underline
- [ ] 16-color terminal: primary color falls back to default blue (ANSI 4), muted falls back to default (no color attribute)

## Design

### Inline comment rendering layout

At standard terminal size (120×40), an inline comment below a diff line:

```
│ 42│+ const value = computeValue()                                        │
│   │  ┃ @alice · 3h ago                                                   │
│   │  ┃ This should be memoized to avoid re-computation on every render.  │
│   │                                                                      │
│ 43│+ const extra = validate(value)                                       │
│   │  ┃ @bob · 2h ago (edited)                                            │
│   │  ┃ Agreed with Alice. Also consider using `useMemo` here.            │
│   │                                                                      │
│   │  ┃ @carol · 1h ago (you)                                             │
│   │  ┃ Fixed in the latest change. Added memo wrapper.                   │
│   │                                                                      │
│ 44│  return value                                                        │
```

The `┃` (heavy vertical bar) is the comment left border in `primary` color. Bold `┃` indicates the focused comment during `n`/`p` navigation.

### Comment creation form layout

When `c` is pressed on line 42:

```
│ 42│+ const value = computeValue()                                        │
│   ├──────────────────────────────────────────────────────────────────────┤
│   │ 📄 src/components/Header.tsx:42 (right)                              │
│   │ ┌────────────────────────────────────────────────────────────────┐   │
│   │ │ This should use useMemo to avoid re-renders on every          │   │
│   │ │ state change. The current implementation recalculates on      │   │
│   │ │ every render cycle.                                           │   │
│   │ │                                                               │   │
│   │ │                                                               │   │
│   │ └────────────────────────────────────────────────────────────────┘   │
│   │                                            Ctrl+S:submit │ Esc:cancel│
│   ├──────────────────────────────────────────────────────────────────────┤
│ 43│+ const extra = validate(value)                                       │
```

### Minimum size layout (80×24)

```
│42│+ const value = computeValue()           │
│  │ ┃ @alice · 2h                           │
│  │ ┃ This should be memoized to avoid…     │
│  │                                         │
│43│+ const extra = validate(value)          │
```

Comment form at 80×24:

```
│42│+ const value = computeValue()           │
│  ├─────────────────────────────────────────┤
│  │ 📄 …/Header.tsx:42 (right)             │
│  │ ┌───────────────────────────────────┐   │
│  │ │ This should use useMemo.          │   │
│  │ │                                   │   │
│  │ │                                   │   │
│  │ └───────────────────────────────────┘   │
│  │               Ctrl+S:submit │ Esc:cancel│
│  ├─────────────────────────────────────────┤
│43│+ const extra = validate(value)          │
```

### Large terminal layout (200×60+)

```
│   42 │+ const value = computeValue()                                                                                                           │
│      │   ┃ @alice · 3 hours ago                                                                                                                │
│      │   ┃                                                                                                                                     │
│      │   ┃ This should be memoized to avoid re-computation on every render. The current                                                        │
│      │   ┃ implementation will recalculate the value on every state change, which could                                                        │
│      │   ┃ become a performance bottleneck with complex computations.                                                                          │
│      │                                                                                                                                         │
│   43 │+ const extra = validate(value)                                                                                                          │
```

### Split view comment rendering

In split view, comments anchored to `side === "right"` appear in the right pane:

```
│ Old (before)           │ New (after)                │
│ 10│ import { config }  │ 10│ import { config }      │
│ 11│ const val = 1      │ 11│ const val = compute()  │
│                        │    ┃ @alice · 2h ago        │
│                        │    ┃ Why this change?       │
│ 12│ return val         │ 13│ return val             │
```

### Component structure

```tsx
{/* Inline comment block — rendered after a diff line */}
{lineComments.map((comment, idx) => (
  <box
    key={comment.id}
    flexDirection="column"
    paddingLeft={2}
    marginTop={idx === 0 ? 0 : 1}
  >
    <box flexDirection="row">
      <text
        color="primary"
        bold={comment.id === focusedCommentId}
      >
        ┃{" "}
      </text>
      <text color="primary" bold>@{truncate(comment.author.login, 39)}</text>
      <text color="muted"> · {relativeTime(comment.created_at, breakpoint)}</text>
      {comment.updated_at !== comment.created_at && (
        <text color="muted"> (edited)</text>
      )}
      {comment.author.id === currentUser.id && (
        <text color="muted"> (you)</text>
      )}
    </box>
    <box flexDirection="row">
      <text
        color="primary"
        bold={comment.id === focusedCommentId}
      >
        ┃{" "}
      </text>
      <markdown>{truncateBody(comment.body, 50000)}</markdown>
    </box>
  </box>
))}

{/* Comment creation form — rendered below focused line when active */}
{commentFormOpen && commentFormLine === lineNumber && (
  <box flexDirection="column" borderTop="single" borderBottom="single" paddingLeft={2}>
    <text color="primary">
      📄 {truncatePathLeft(commentFormPath, termWidth - 30)}:{commentFormLine} ({commentFormSide})
    </text>
    <box border="single" marginTop={1}>
      <scrollbox height={textareaHeight}>
        <input
          multiline
          value={commentBody}
          onChange={setCommentBody}
          maxLength={50000}
          autoFocus
        />
      </scrollbox>
    </box>
    {validationError && (
      <text color="error">{validationError}</text>
    )}
    {commentBody.length > 40000 && (
      <text color={charCountColor(commentBody.length)}>
        {commentBody.length.toLocaleString()} / 50,000
      </text>
    )}
    <text color="muted">Ctrl+S:submit │ Esc:cancel</text>
  </box>
)}
```

### Keybinding reference

| Key | Context | Action |
|-----|---------|--------|
| `c` | Main content, landing diff, on a diff line | Open comment creation form below focused line |
| `c` | Main content, change diff | No-op (silent) |
| `c` | Comment form already open | Trigger discard flow for existing form |
| `n` | Main content (no form open) | Navigate to next inline comment |
| `p` | Main content (no form open) | Navigate to previous inline comment |
| `Ctrl+S` | Comment form open | Submit comment |
| `Esc` | Comment form open, empty body | Close form immediately |
| `Esc` | Comment form open, non-empty body | Show discard confirmation |
| `y` | Discard confirmation visible | Discard and close form |
| `n` (at confirmation) | Discard confirmation visible | Cancel discard, return to editing |
| `Esc` | Discard confirmation visible | Cancel discard, return to editing |
| `Enter` | Comment form textarea | Insert newline |
| Arrow keys | Comment form textarea | Move cursor |
| `Home` / `End` | Comment form textarea | Move to start/end of line |
| `Ctrl+K` | Comment form textarea | Kill text to end of line |
| `Ctrl+U` | Comment form textarea | Kill text to beginning of line |
| `Backspace` | Comment form textarea | Delete character before cursor |
| `Delete` | Comment form textarea | Delete character after cursor |
| `?` | Comment form open | Toggle help overlay |
| `Ctrl+C` | Comment form open | Quit TUI immediately |

### Focus model

- Comment form open: focus is trapped in the textarea. All diff navigation keys (`j/k`, `]`/`[`, `t`, `w`, `z`, `x`, `Tab`, `G`, `gg`, `Ctrl+D`, `Ctrl+U`, `n`, `p`) are disabled
- Comment form closed: `n`/`p` activate comment navigation mode. `j`/`k` and `]`/`[` clear comment focus
- Comment navigation overlays the standard diff scrolling — the developer can switch between comment-walking (`n`/`p`) and free scrolling (`j`/`k`) at any time

### Status bar states

| State | Status bar hints |
|-------|------------------|
| Default (diff, no comments focused) | `t:view  w:ws  ]/[:files  c:comment  n/p:comments  ?:help` |
| Comment focused | `n/p:comments (N of M)  c:reply  ]/[:files  ?:help` |
| Comment form open | `Ctrl+S:submit │ Esc:cancel` |
| Submitting | `⏳ Submitting comment…` |
| Change diff (no comments) | `t:view  w:ws  ]/[:files  ?:help` (no `c` hint) |

### Responsive behavior

| Terminal size | Textarea rows | Timestamp format | Path truncation | Comment body wrap | Spacing |
|---------------|---------------|------------------|-----------------|-------------------|---------|
| 80×24 – 119×39 | 5 | "2h" | Truncated left at 40 chars with `…` | Tight wrap at content width | marginTop=0 between comments |
| 120×40 – 199×59 | 8 | "2h ago" | Full path | Standard wrap | marginTop=1 between comments |
| 200×60+ | 12 | "2 hours ago" | Full path with extra padding | Generous wrap with blank line after body | marginTop=2 between comments |

Resize triggers synchronous re-layout via `useOnResize()`. Comment form content, cursor position, and focused comment ID are preserved across resize.

### Data hooks consumed

| Hook | Source | API endpoint | Purpose |
|------|--------|-------------|---------|
| `useLandingComments(owner, repo, number)` | `@codeplane/ui-core` | `GET /api/repos/:owner/:repo/landings/:number/comments` | Fetch existing inline comments |
| `useCreateLandingComment(owner, repo, number)` | `@codeplane/ui-core` | `POST /api/repos/:owner/:repo/landings/:number/comments` | Submit a new inline comment |
| `useLanding(owner, repo, number)` | `@codeplane/ui-core` | `GET /api/repos/:owner/:repo/landings/:number` | Landing context (for permissions, state) |
| `useUser()` | `@codeplane/ui-core` | `GET /api/user` | Current user for `(you)` indicator and author attribution |
| `useKeyboard()` | `@opentui/react` | — | Register keybindings |
| `useTerminalDimensions()` | `@opentui/react` | — | Responsive breakpoint calculation |
| `useOnResize()` | `@opentui/react` | — | Re-layout on resize |
| `useStatusBarHints()` | local TUI | — | Update status bar context hints |

### API details

**Fetch comments:** `GET /api/repos/:owner/:repo/landings/:number/comments?page=N&per_page=30`
- Page-based pagination with `X-Total-Count` header
- Response: `LandingCommentResponse[]`
- Filter inline comments client-side: `path !== "" && line > 0`

**Create comment:** `POST /api/repos/:owner/:repo/landings/:number/comments`
- Body: `{ body: string, path: string, line: number, side: "left" | "right" | "both" }`
- Returns: `201` with `LandingCommentResponse`
- Response shape: `{ id, landing_request_id, author: { id, login }, path, line, side, body, created_at, updated_at }`

### State management

- `inlineComments`: `LandingCommentResponse[]` — loaded from API, filtered to `path !== "" && line > 0`
- `commentsByFileLine`: `Map<string, LandingCommentResponse[]>` — grouped by `${path}:${line}:${side}` key, sorted chronologically
- `focusedCommentId`: `number | null` — currently focused comment for `n`/`p` navigation
- `focusedCommentIndex`: `number` — 0-based index into the flat ordered comment list
- `commentFormOpen`: `boolean` — whether the creation form is visible
- `commentFormLine`: `number` — line number the form is attached to
- `commentFormPath`: `string` — file path the form is attached to
- `commentFormSide`: `"left" | "right" | "both"` — determined from focused line type
- `commentBody`: `string` — current textarea content
- `commentSubmitting`: `boolean` — submission in progress
- `optimisticComment`: `LandingCommentResponse | null` — temporary optimistic entry
- `failedCommentBody`: `Map<string, string>` — preserved content on failure, keyed by `${path}:${line}:${side}`
- `discardConfirmVisible`: `boolean` — discard prompt state

## Permissions & Security

### Authorization

| Action | Required role | Behavior when unauthorized |
|--------|--------------|---------------------------|
| View inline comments | Repository read access | Comments not loaded; 404 from parent landing detail |
| Create inline comment | Repository write access + authenticated | `c` key shows status bar message; form does not open |
| Navigate comments (`n`/`p`) | Repository read access | Works if comments loaded |

- Comment creation requires both authentication AND write access — server-enforced via `requireWriteAccess()`
- The `c` key is visible in status bar hints only for authenticated users with write access
- Unauthenticated users: `c` → status bar: "Sign in to comment. Run `codeplane auth login`."
- Read-only users: `c` → status bar: "Write access required to comment."
- Server 403 → status bar: "Permission denied. You cannot comment on this landing request."

### Token-based authentication

- Token from CLI keychain (`codeplane auth login`) or `CODEPLANE_TOKEN` environment variable
- Injected as `Authorization: token <token>` on all API requests via the shared API client
- 401 response → "Session expired. Run `codeplane auth login` to re-authenticate." No automatic retry, no browser flow
- Token is never displayed in the TUI interface or logged at any level

### Rate limiting

- Comment creation: subject to write rate limit (1,000 requests per hour per authenticated user)
- 429 response: status bar shows "Rate limit exceeded. Try again later." — form content is preserved, developer can retry manually
- Comment fetching: subject to standard API rate limit (5,000 requests per hour)
- Pagination naturally rate-limited by scroll behavior; requests are deduplicated
- No client-side rate limiting beyond double-submit prevention

### Input safety

- Comment body is sent as-is to the server; server is responsible for sanitization and storage
- ANSI escape sequences in comment bodies are escaped by the `<markdown>` component — they render as literal text, not terminal control codes
- File paths from API responses are displayed as-is but never executed or interpolated into shell commands
- No PII beyond author usernames, which are already public in the repository context

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.diff.inline_comments.loaded` | Inline comments fetched for landing diff | `owner`, `repo`, `landing_number`, `inline_count`, `general_count`, `files_with_comments`, `terminal_width`, `terminal_height` |
| `tui.diff.inline_comments.comment_focused` | `n`/`p` navigation to a comment | `direction` (next|prev), `comment_id`, `from_comment_id`, `position` (N of M), `file_path`, `line`, `side`, `crossed_file_boundary` |
| `tui.diff.inline_comments.form_opened` | `c` pressed to open form | `file_path`, `line`, `side`, `existing_comments_on_line`, `terminal_width`, `terminal_height`, `had_preserved_content` |
| `tui.diff.inline_comments.form_cancelled` | `Esc` dismissed form | `body_length`, `was_empty`, `time_open_ms`, `was_discard_confirmed` |
| `tui.diff.inline_comments.submitted` | `Ctrl+S` pressed | `body_length`, `line_count`, `has_code_blocks`, `has_markdown_formatting`, `time_to_submit_ms`, `file_path`, `line`, `side` |
| `tui.diff.inline_comments.succeeded` | Server 201 response | `comment_id`, `response_ms`, `total_duration_ms` |
| `tui.diff.inline_comments.failed` | Non-2xx or network error | `error_code`, `error_message`, `body_length`, `file_path`, `line` |
| `tui.diff.inline_comments.optimistic_reverted` | Optimistic comment rolled back | `error_code`, `body_length` |
| `tui.diff.inline_comments.validation_error` | Empty body submitted | `file_path`, `line` |
| `tui.diff.inline_comments.noop_change_diff` | `c` pressed on non-landing diff | `diff_source` (change) |
| `tui.diff.inline_comments.noop_unauthorized` | `c` pressed without permission | `reason` (unauthenticated|read_only) |
| `tui.diff.inline_comments.discard_confirmed` | `y` at discard prompt | `body_length`, `time_open_ms` |
| `tui.diff.inline_comments.nav_noop` | `n`/`p` with 0 or 1 comments | `reason` (no_comments|single_comment|at_boundary), `total_comments` |
| `tui.diff.inline_comments.session_summary` | Diff screen closed | `comments_viewed`, `comments_created`, `comments_cancelled`, `nav_count`, `form_opens`, `total_inline_comments`, `session_duration_ms` |

### Common properties (all events)

| Property | Description |
|----------|-------------|
| `session_id` | Unique TUI session identifier |
| `terminal_width` | Current terminal column count |
| `terminal_height` | Current terminal row count |
| `timestamp` | ISO 8601 event timestamp |
| `user_id` | Authenticated user identifier (if authenticated) |
| `view_mode` | Current diff view mode (unified|split) |
| `diff_source` | Whether this is a change or landing diff |

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Comment load success rate | > 98% | Percentage of landing diff views that successfully load inline comments |
| Inline comment creation rate | > 5% of landing diff sessions | Sessions that result in at least one inline comment |
| Comment completion rate | > 70% | Percentage of opened forms that result in a submitted comment |
| Form abandonment with content | < 25% | Forms discarded after typing content |
| n/p navigation adoption | > 30% of sessions with 2+ comments | Sessions where `n` or `p` is used at least once |
| Submission error rate | < 2% | Percentage of submissions that fail (non-2xx) |
| Time to submit (median) | < 90s | From form open to Ctrl+S |
| Optimistic revert rate | < 1% | Percentage of optimistic comments that are reverted |
| Mean comment body length | > 30 characters | Indicates meaningful review feedback |
| Comments-per-session (with creation) | 1.5–3.0 | Average comments per session for sessions with at least 1 comment |

## Observability

### Logging requirements

| Level | Event | Format | When |
|-------|-------|--------|------|
| `debug` | Comments mount | `DiffInlineComments: mounted [landing={n}]` | Component mounts for landing diff |
| `debug` | Comments loaded | `DiffInlineComments: loaded [landing={n}] [total={t}] [inline={i}] [general={g}] [duration={ms}ms]` | API response received |
| `debug` | Comment focused | `DiffInlineComments: focused [comment_id={id}] [position={n}/{m}] [file={path}]` | `n`/`p` navigation |
| `debug` | Form opened | `DiffInlineComments: form opened [path={p}] [line={l}] [side={s}]` | `c` pressed |
| `debug` | Typing | `DiffInlineComments: typing [length={len}]` (debounced 1/sec) | Keystroke in textarea |
| `debug` | Form closed | `DiffInlineComments: form closed [reason={cancel|submit|discard}]` | Form dismissed |
| `info` | Comments rendered | `DiffInlineComments: rendered [landing={n}] [inline={i}] [files={f}]` | First render with data |
| `info` | Comment submitted | `DiffInlineComments: submitted [path={p}] [line={l}] [side={s}] [body_length={len}]` | `Ctrl+S` pressed with valid content |
| `info` | Comment created | `DiffInlineComments: created [comment_id={id}] [duration={ms}ms]` | Server 201 response |
| `info` | Comment noop | `DiffInlineComments: noop [reason={change_diff|unauthenticated|read_only}]` | `c` pressed but denied |
| `warn` | Body truncated | `DiffInlineComments: body truncated [comment_id={id}] [length={len}]` | Existing comment body > 50,000 chars |
| `warn` | Line not found | `DiffInlineComments: line not found [comment_id={id}] [path={p}] [line={l}]` | Comment references non-existent line |
| `warn` | Comments capped | `DiffInlineComments: capped [loaded=500] [total={n}]` | 500-comment cap reached |
| `warn` | Rate limited | `DiffInlineComments: rate limited [status=429]` | Server 429 response |
| `warn` | Slow load | `DiffInlineComments: slow load [duration={ms}ms]` | Comment fetch > 2,000ms |
| `error` | Fetch failed | `DiffInlineComments: fetch failed [status={code}] [error={msg}]` | Non-2xx on comment list fetch |
| `error` | Submit failed | `DiffInlineComments: submit failed [status={code}] [error={msg}]` | Non-2xx on comment creation |
| `error` | Auth error | `DiffInlineComments: auth error [status=401]` | Token expired |
| `error` | Permission denied | `DiffInlineComments: permission denied [status=403]` | Write access denied |
| `error` | Optimistic revert | `DiffInlineComments: optimistic revert [error={msg}]` | Server rejected optimistic comment |
| `error` | Render error | `DiffInlineComments: render error [component={name}] [error={msg}]` | React error boundary caught an error |

Logs output to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### TUI-specific error cases

| Error case | Behavior | Recovery |
|------------|----------|---------|
| Terminal resize while form is open | Form re-layouts, textarea content and cursor preserved | Automatic |
| Terminal resize during optimistic display | Optimistic comment re-renders at new width | Automatic |
| Terminal resize below 80×24 while form is open | "Terminal too small" shown; form content in memory | Resize back restores form |
| SSE disconnect during submission | Optimistic comment displayed; status bar warning shown | Press `R` to refresh comment list |
| Auth expires during form input | `Ctrl+S` fails with 401; form content preserved | Re-auth via CLI, retry `Ctrl+S` |
| Auth expires during comment fetch | 401 inline error on diff screen | Re-auth via CLI |
| Network timeout on comment fetch | Inline comments not rendered; diff still usable | Comments load on next navigation to this diff |
| Network timeout on submission | Optimistic reverted; textarea reopens with content | Retry `Ctrl+S` |
| Server 500 on comment fetch | Comments not rendered; status bar shows error | Press `R` to retry |
| Server 500 on submission | Optimistic reverted; form reopens with content | Retry `Ctrl+S` |
| Rapid `n`/`p` presses | Processed sequentially; debounced at 16ms frame boundary | Automatic |
| Rapid `c` presses | Second press triggers discard of first form | User confirms/cancels discard |
| Double `Ctrl+S` | Second press is no-op while submission in progress | Automatic (double-submit prevention) |
| `Ctrl+C` while form open | TUI quits; draft is lost | Relaunch TUI |
| Landing deleted while composing | `Ctrl+S` → 404; form content preserved | Navigate away with `q` |
| Very long comment body (49,999 chars) | Character counter visible; submission proceeds normally | Normal operation |
| Comment body at exactly 50,000 chars | Accepted (at limit); counter shows `50,000 / 50,000` in error color | Normal operation |
| 16-color terminal fallback | Primary → ANSI 4 (blue), muted → no color, error → ANSI 1 (red) | Automatic detection |
| `NO_COLOR` environment variable | `│` border instead of `┃`, no color attributes, underline for emphasis | Automatic |
| Concurrent resize and `n`/`p` | Scroll target recalculated post-resize | Automatic |

### Failure modes and degradation

| Failure | Impact | Degradation |
|---------|--------|-------------|
| Comment fetch fails | No inline comments displayed in diff | Diff viewer fully functional without comments; warning shown |
| Single comment render error | One comment missing | Error boundary catches; other comments render normally |
| Comment form crashes | Cannot create comments | Error boundary; "Press c to try again." Status bar error |
| Markdown rendering failure for comment body | Comment body unreadable | Falls back to plain text rendering of the raw body |
| `useLandingComments` hook throws | No comments loaded | Caught by error boundary; diff operates normally without comments |
| Memory pressure from many comments | Slow scrolling | 500-comment cap prevents runaway; virtualized rendering for large comment counts |
| Optimistic comment fails to finalize | Ghost comment visible | Reverted automatically; error notification in status bar |

## Verification

Test file: `e2e/tui/diff.test.ts`

### Snapshot tests — visual states (25 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| SNAP-INLINE-001 | `renders inline comment below diff line at 120x40` | Snapshot of a single inline comment block below an addition line with author, timestamp, body, and primary-colored left border |
| SNAP-INLINE-002 | `renders inline comment at 80x24 compact layout` | Snapshot at minimum size: tight wrap, short timestamp ("2h"), truncated path |
| SNAP-INLINE-003 | `renders inline comment at 200x60 expanded layout` | Snapshot at large size: generous spacing, full timestamp ("2 hours ago"), blank line after body |
| SNAP-INLINE-004 | `renders multiple comments on same line` | Snapshot showing 3 stacked comments on the same diff line in chronological order |
| SNAP-INLINE-005 | `renders comments across multiple files` | Snapshot showing inline comments in two different file sections of the diff |
| SNAP-INLINE-006 | `renders focused comment with bold border` | Snapshot showing the focused comment during `n`/`p` navigation with bold `┃` border |
| SNAP-INLINE-007 | `renders comment with edited indicator` | Snapshot showing `(edited)` in muted color next to timestamp |
| SNAP-INLINE-008 | `renders comment with (you) suffix` | Snapshot showing `(you)` after username for current user's comment |
| SNAP-INLINE-009 | `renders comment with markdown body` | Snapshot of a comment containing headings, code blocks, bold text, and links |
| SNAP-INLINE-010 | `renders comment creation form at 120x40` | Snapshot of the form with context header, 8-row textarea, and submit/cancel hints |
| SNAP-INLINE-011 | `renders comment creation form at 80x24` | Snapshot of the form with truncated path, 5-row textarea |
| SNAP-INLINE-012 | `renders comment creation form at 200x60` | Snapshot of the form with full path, 12-row textarea, generous padding |
| SNAP-INLINE-013 | `renders validation error on empty submit` | Snapshot showing "Comment cannot be empty." in error color below textarea |
| SNAP-INLINE-014 | `renders discard confirmation prompt` | Snapshot showing "Discard comment? (y/n)" overlay |
| SNAP-INLINE-015 | `renders optimistic comment` | Snapshot showing a comment with `⏳ just now` timestamp after submission |
| SNAP-INLINE-016 | `renders character counter at 40k+ chars` | Snapshot showing `40,123 / 50,000` counter in muted color |
| SNAP-INLINE-017 | `renders character counter at 49k+ chars in error color` | Snapshot showing counter in error color near the limit |
| SNAP-INLINE-018 | `renders status bar with comment count` | Snapshot showing "Comment 3 of 8" in status bar during navigation |
| SNAP-INLINE-019 | `renders status bar for change diff without c hint` | Snapshot of status bar on change diff — no `c:comment` hint visible |
| SNAP-INLINE-020 | `renders submitting state in status bar` | Snapshot showing "⏳ Submitting comment…" during API call |
| SNAP-INLINE-021 | `renders comment in split view right pane` | Snapshot of an inline comment in the right pane of split view for `side === "right"` |
| SNAP-INLINE-022 | `renders comment in split view left pane` | Snapshot of an inline comment in the left pane for `side === "left"` |
| SNAP-INLINE-023 | `renders line-not-found warning` | Snapshot of a comment at file end with "Line N not found in current diff" notice |
| SNAP-INLINE-024 | `renders 500-comment cap notice` | Snapshot showing "Showing 500 of N comments. View all in Comments tab." warning |
| SNAP-INLINE-025 | `renders diff with no inline comments` | Snapshot of a landing diff with zero inline comments — clean diff, no comment blocks |

### Keyboard interaction tests (35 tests)

| Test ID | Test name | Key sequence | Expected state change |
|---------|-----------|-------------|----------------------|
| KEY-INLINE-001 | `c opens comment form on landing diff` | `c` (on addition line) | Form appears below focused line with `side === "right"`, path and line pre-populated |
| KEY-INLINE-002 | `c is no-op on change diff` | `c` (on change diff) | No form, no state change, no status bar message |
| KEY-INLINE-003 | `c shows auth message when unauthenticated` | `c` (unauthenticated) | Status bar: "Sign in to comment…" |
| KEY-INLINE-004 | `c shows permission message for read-only user` | `c` (read-only) | Status bar: "Write access required…" |
| KEY-INLINE-005 | `Ctrl+S submits comment` | `c`, type body, `Ctrl+S` | Form closes, optimistic comment appears, API call made |
| KEY-INLINE-006 | `Ctrl+S rejects empty body` | `c`, `Ctrl+S` | Validation error shown, form stays open |
| KEY-INLINE-007 | `Ctrl+S rejects whitespace-only body` | `c`, type spaces, `Ctrl+S` | Validation error shown, form stays open |
| KEY-INLINE-008 | `Esc closes empty form immediately` | `c`, `Esc` | Form closes, no confirmation |
| KEY-INLINE-009 | `Esc on non-empty form shows discard confirmation` | `c`, type body, `Esc` | Discard prompt appears |
| KEY-INLINE-010 | `y at discard confirmation discards` | `c`, type body, `Esc`, `y` | Form closes, content discarded |
| KEY-INLINE-011 | `n at discard confirmation returns to editing` | `c`, type body, `Esc`, `n` | Discard prompt dismissed, textarea refocused |
| KEY-INLINE-012 | `Esc at discard confirmation returns to editing` | `c`, type body, `Esc`, `Esc` | Discard prompt dismissed, textarea refocused |
| KEY-INLINE-013 | `Enter inserts newline in textarea` | `c`, `Enter` | Newline inserted, form stays open |
| KEY-INLINE-014 | `n navigates to next inline comment` | `n` | Focus moves to next comment, scrollbox scrolls to reveal |
| KEY-INLINE-015 | `p navigates to previous inline comment` | `p` | Focus moves to previous comment, scrollbox scrolls to reveal |
| KEY-INLINE-016 | `n at last comment is no-op` | Navigate to last comment, `n` | Focus stays on last comment |
| KEY-INLINE-017 | `p at first comment is no-op` | `p` on first comment | Focus stays on first comment |
| KEY-INLINE-018 | `n/p with zero comments are no-ops` | `n`, `p` | No state change |
| KEY-INLINE-019 | `n/p with single comment are no-ops` | `n`, `p` (1 comment) | Focus stays on single comment |
| KEY-INLINE-020 | `n crosses file boundary` | `n` (last comment in file 1, comments exist in file 2) | Focus moves to first comment in file 2, content scrolls |
| KEY-INLINE-021 | `j/k clears comment focus` | `n` (focus comment), `j` | Comment focus cleared, status bar returns to default |
| KEY-INLINE-022 | `]/[ clears comment focus` | `n` (focus comment), `]` | Comment focus cleared, file navigation proceeds |
| KEY-INLINE-023 | `diff keys disabled while form open` | `c`, `j` | No scroll; `j` typed into textarea |
| KEY-INLINE-024 | `t disabled while form open` | `c`, `t` | No view toggle; `t` typed into textarea |
| KEY-INLINE-025 | `Ctrl+C quits while form open` | `c`, `Ctrl+C` | TUI exits |
| KEY-INLINE-026 | `? shows help while form open` | `c`, `?` | Help overlay shown |
| KEY-INLINE-027 | `c on deletion line sets side to left` | `c` (on deletion line) | Form context header shows `(left)` |
| KEY-INLINE-028 | `c on context line sets side to both` | `c` (on context line) | Form context header shows `(both)` |
| KEY-INLINE-029 | `c on hunk header anchors to first content line` | `c` (on `@@` line) | Form opens below with line number of first content line |
| KEY-INLINE-030 | `c on binary notice is no-op` | `c` (on "Binary file changed") | No form opens |
| KEY-INLINE-031 | `c on collapsed hunk is no-op` | `c` (on "⋯ N lines hidden") | No form opens |
| KEY-INLINE-032 | `double Ctrl+S prevented` | `c`, type, `Ctrl+S`, `Ctrl+S` | Second submit ignored; only one API call |
| KEY-INLINE-033 | `failed submission preserves body for retry` | `c`, type, `Ctrl+S` (server error), `c` (same line) | Form reopens with previous content |
| KEY-INLINE-034 | `z on hunk with comments is no-op` | `z` (on hunk containing inline comments) | Hunk stays expanded; status bar message shown |
| KEY-INLINE-035 | `c on existing comment opens new form on same line` | `c` (cursor on comment block) | New form opens below existing comment, anchored to same line |

### Responsive resize tests (12 tests)

| Test ID | Test name | Terminal size | Expected behavior |
|---------|-----------|--------------|-------------------|
| RSP-INLINE-001 | `comment renders at 80x24` | 80×24 | Tight wrap, short timestamp, truncated path |
| RSP-INLINE-002 | `comment renders at 120x40` | 120×40 | Standard layout, medium timestamp, full path |
| RSP-INLINE-003 | `comment renders at 200x60` | 200×60 | Generous spacing, full timestamp, blank line after body |
| RSP-INLINE-004 | `textarea height 5 rows at 80x24` | 80×24 | Form textarea is 5 rows tall |
| RSP-INLINE-005 | `textarea height 8 rows at 120x40` | 120×40 | Form textarea is 8 rows tall |
| RSP-INLINE-006 | `textarea height 12 rows at 200x60` | 200×60 | Form textarea is 12 rows tall |
| RSP-INLINE-007 | `resize during form preserves content` | 120→80 | Textarea content and cursor unchanged; height adjusts to 5 rows |
| RSP-INLINE-008 | `resize during form preserves cursor` | 80→120 | Cursor position maintained; height adjusts to 8 rows |
| RSP-INLINE-009 | `resize below 80x24 during form` | 120→60×20 | "Terminal too small" shown; content in memory; resize back restores |
| RSP-INLINE-010 | `resize preserves focused comment` | 120→80 | Focused comment ID unchanged; scroll position adjusted |
| RSP-INLINE-011 | `resize during optimistic display` | 120→200 | Optimistic comment re-renders at new width |
| RSP-INLINE-012 | `path truncation changes on resize` | 200→80 | File path in context header re-truncates with `…` prefix |

### Data loading and integration tests (15 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| INT-INLINE-001 | `loads inline comments for landing diff` | Opening landing diff fetches comments and renders inline comments at correct line positions |
| INT-INLINE-002 | `does not fetch comments for change diff` | Opening change diff does not call the comments API |
| INT-INLINE-003 | `filters general comments from inline rendering` | Comments with `path === ""` and `line === 0` are not rendered in the diff |
| INT-INLINE-004 | `creates comment via API` | `Ctrl+S` sends POST with `{ body, path, line, side }` and receives 201 |
| INT-INLINE-005 | `optimistic comment replaced by server response` | After 201, optimistic entry replaced with server data (real id, timestamps) |
| INT-INLINE-006 | `optimistic comment reverted on error` | Server 500 → optimistic removed, error shown, body preserved |
| INT-INLINE-007 | `401 on comment creation shows auth error` | Server 401 → status bar shows auth re-login message |
| INT-INLINE-008 | `403 on comment creation shows permission error` | Server 403 → status bar shows permission denied message |
| INT-INLINE-009 | `429 on comment creation shows rate limit` | Server 429 → status bar shows rate limit message; form content preserved |
| INT-INLINE-010 | `comments grouped by file and line` | Multiple comments on different lines render at correct positions |
| INT-INLINE-011 | `comments on same line stack chronologically` | Two comments on line 42 render oldest-first |
| INT-INLINE-012 | `whitespace toggle preserves comments` | Pressing `w` re-fetches diff but comments remain (fetched separately) |
| INT-INLINE-013 | `comment references non-existent line` | Comment on line 999 in a 50-line file renders at file end with warning |
| INT-INLINE-014 | `comment references non-existent file` | Comment with unknown path is not rendered inline |
| INT-INLINE-015 | `500-comment cap applied` | Landing with 600 inline comments loads only 500 with cap notice |

### Edge case tests (20 tests)

| Test ID | Test name | Description |
|---------|-----------|-------------|
| EDGE-INLINE-001 | `form preserved on view toggle (t)` | Pressing `t` while form open closes form with content preserved; status bar message shown |
| EDGE-INLINE-002 | `rapid c presses handled` | Two rapid `c` presses: first opens form, second triggers discard flow |
| EDGE-INLINE-003 | `c on file header is no-op` | Pressing `c` on a file name separator line does nothing |
| EDGE-INLINE-004 | `c on file-too-large notice is no-op` | Pressing `c` on "File too large to display" does nothing |
| EDGE-INLINE-005 | `comment with ANSI escapes renders safely` | Comment body with `\x1b[31m` renders as literal text |
| EDGE-INLINE-006 | `comment with only code blocks renders` | Comment body containing only fenced code block renders with syntax highlighting |
| EDGE-INLINE-007 | `50,000 char comment body truncated` | Comment with exactly 50,001 chars shows truncation notice |
| EDGE-INLINE-008 | `long username truncated at 39 chars` | Username with 45 characters truncated with `…` |
| EDGE-INLINE-009 | `hunk with comments cannot be collapsed` | `z` on hunk containing comments → no-op with status bar message |
| EDGE-INLINE-010 | `Z skips hunks with comments` | `Z` collapses all hunks except those containing inline comments |
| EDGE-INLINE-011 | `collapsed hunk auto-expands for comment` | Loading comments on a collapsed hunk auto-expands it |
| EDGE-INLINE-012 | `n/p across file boundary updates sidebar` | `n` navigating to comment in next file updates file tree highlight |
| EDGE-INLINE-013 | `concurrent resize and n/p navigation` | Resize during comment navigation preserves focus and recalculates scroll |
| EDGE-INLINE-014 | `NO_COLOR mode rendering` | Comments use `|` border, no color attributes |
| EDGE-INLINE-015 | `16-color terminal fallback` | Primary → ANSI 4, muted → no attribute |
| EDGE-INLINE-016 | `form at character limit` | Typing at exactly 50,000 chars accepted; 50,001st char rejected |
| EDGE-INLINE-017 | `Ctrl+C during form open quits TUI` | TUI exits; draft lost |
| EDGE-INLINE-018 | `landing deleted during composition` | `Ctrl+S` → 404; form content preserved; `q` to navigate away |
| EDGE-INLINE-019 | `split view comment in left pane` | Comment with `side === "left"` renders in the left pane only |
| EDGE-INLINE-020 | `split view comment spanning both panes` | Comment with `side === "both"` renders spanning both panes |

**Total: 107 verification items. All tests left failing if backends are unimplemented — never skipped.**
