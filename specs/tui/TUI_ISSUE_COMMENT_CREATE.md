# TUI_ISSUE_COMMENT_CREATE

Specification for TUI_ISSUE_COMMENT_CREATE.

## High-Level User POV

When a developer is reading an issue in the terminal and wants to respond, they press `c` to open the comment creation form. The form appears as an inline panel at the bottom of the issue detail view, pushing the existing content upward rather than navigating to a new screen. This keeps the issue context visible above while the user composes their response — a pattern that mirrors how developers think about commenting: read the conversation, then respond in-place.

The comment textarea occupies the lower portion of the content area, separated from the comments section above by a thin horizontal rule. The textarea is pre-focused, so the user can begin typing immediately. A label "New comment" appears above the textarea in bold, and a keybinding hint strip below it reads `Ctrl+S:submit │ Esc:cancel`. The textarea supports multi-line input: `Enter` inserts a newline, and the content is free-form markdown. As the user types, the textarea grows within its allocated space, and a scrollbox wraps it so that long comments remain scrollable without overflowing the terminal.

The user writes their comment in plain markdown. There is no live preview — the terminal input model favors fast, keyboard-driven writing over visual formatting. Markdown will be rendered when the comment appears in the timeline after submission. Code blocks, links, bold, italic, and lists are all supported in the plain-text input and will render correctly once posted.

Pressing `Ctrl+S` submits the comment. The textarea content is sent to the server, and the TUI applies an optimistic update: the new comment immediately appears at the bottom of the comment timeline with a subtle pending indicator (a muted `⏳` prefix on the timestamp). The textarea closes and the scroll position jumps to the newly appended comment so the user can see their contribution in context. If the server confirms success, the pending indicator is replaced with the server-assigned timestamp and the comment ID is updated. If the server returns an error, the optimistic comment is removed from the timeline, an inline error toast appears ("Failed to post comment. Press `c` to retry."), and the textarea reopens with the original content preserved so the user does not lose their work.

Pressing `Esc` cancels the comment. If the textarea is empty, it closes immediately and focus returns to the issue detail scroll position. If the textarea contains text, a confirmation prompt appears inline below the textarea: "Discard comment? (y/n)". Pressing `y` discards the draft and closes the textarea. Pressing `n` or `Esc` again returns focus to the textarea, preserving the content.

At the minimum terminal size (80×24), the textarea occupies approximately 5 rows of the 22-row content area (after header and status bar), leaving 17 rows for the issue content above. At standard size (120×40), the textarea takes 8 rows. At large sizes (200×60+), the textarea expands to 12 rows. The issue content above scrolls independently of the textarea — the two areas do not fight for scroll focus. Only one has keyboard focus at a time: when the textarea is open, it captures all input except `Ctrl+S`, `Esc`, and global bindings (`?`, `Ctrl+C`).

The status bar updates while the textarea is active to show `Ctrl+S:submit │ Esc:cancel` instead of the normal issue detail keybinding hints. When the textarea closes (submit or cancel), the status bar reverts to the issue detail hints.

## Acceptance Criteria

### Activation and lifecycle
- [ ] Pressing `c` on the issue detail view opens the comment creation textarea at the bottom of the content area.
- [ ] The textarea is pre-focused immediately on open — no additional keypress is needed to start typing.
- [ ] The comment panel is an inline panel within the issue detail view, not a new screen pushed onto the navigation stack.
- [ ] The breadcrumb does not change when the textarea opens.
- [ ] Only one comment textarea can be open at a time. Pressing `c` while the textarea is already open is a no-op.
- [ ] The textarea is not available when the user is unauthenticated; pressing `c` shows "Sign in to comment" as an inline toast.

### Text input
- [ ] The textarea accepts multi-line input. `Enter` inserts a newline.
- [ ] Standard text editing keys are supported: `Backspace`, `Delete`, `Left`, `Right`, `Up`, `Down`, `Home`/`Ctrl+A`, `End`/`Ctrl+E`, `Ctrl+K` (kill to end of line), `Ctrl+U` (kill to start of line).
- [ ] The textarea wraps text at the available terminal width minus 2 (for borders).
- [ ] The textarea scrolls vertically when content exceeds the visible area.
- [ ] There is no hard character limit on comment body input. The server enforces any maximum.
- [ ] Tab characters are not inserted (Tab is reserved for form navigation in the broader TUI); the textarea does not use Tab.
- [ ] Pasted content (terminal paste, bracketed paste mode) is accepted and inserted at the cursor position.
- [ ] Rapid key input is buffered and processed in order; no keystrokes are dropped.

### Submission
- [ ] `Ctrl+S` submits the comment body to `POST /api/repos/:owner/:repo/issues/:number/comments` with `{ body: trimmedContent }`.
- [ ] Submitting with an empty or whitespace-only body shows an inline validation error below the textarea: "⚠ Comment cannot be empty" in `error` color. The API is not called.
- [ ] On submission, the textarea becomes non-interactive (greyed out) and a "Posting…" indicator replaces the submit hint in the keybinding strip.
- [ ] Double-submit prevention: `Ctrl+S` while a submission is in flight is ignored.
- [ ] On successful submission (2xx), the textarea closes, the optimistic comment is finalized with server data, and scroll position jumps to the new comment.
- [ ] On server error (4xx except 401/403/422, 5xx, network error), the optimistic comment is removed, the textarea reopens with the original content, and an error toast appears: "Failed to post comment. Press `c` to retry." in `error` color, auto-dismissing after 5 seconds.
- [ ] On 401 error, the textarea closes and the auth error is shown: "Session expired. Run `codeplane auth login` to re-authenticate."
- [ ] On 403 error, the textarea closes and "Permission denied. You cannot comment on this issue." is shown in `error` color.
- [ ] On 422 validation error from the server, the textarea remains open with the content preserved and the server error message is shown inline.
- [ ] On 429 rate limit, the textarea remains open with the content preserved and "Rate limit exceeded. Please wait and try again." is shown.

### Cancellation
- [ ] `Esc` on an empty textarea closes it immediately without confirmation.
- [ ] `Esc` on a non-empty textarea shows an inline confirmation: "Discard comment? (y/n)" below the textarea.
- [ ] Pressing `y` at the discard confirmation closes the textarea and discards the content.
- [ ] Pressing `n` or `Esc` at the discard confirmation returns focus to the textarea with content preserved.
- [ ] Any other key at the discard confirmation is ignored.
- [ ] On discard, the textarea content is not recoverable. There is no draft persistence.

### Optimistic UI
- [ ] On submission, the comment is optimistically appended to the comment timeline immediately.
- [ ] The optimistic comment shows `@currentUser`, the body rendered as `<markdown>`, and a pending timestamp indicator (`⏳ just now`).
- [ ] On server success, the pending indicator is replaced with the server-assigned `created_at` timestamp and the optimistic ID is replaced with the server-assigned ID.
- [ ] On server error, the optimistic comment is removed from the timeline and the error recovery flow begins.
- [ ] The issue's `comment_count` in the header updates optimistically (+1 on submit, reverted on error).

### Focus management
- [ ] When the textarea is open, it captures all keyboard input except: `Ctrl+S` (submit), `Esc` (cancel/discard), `?` (help overlay), `Ctrl+C` (quit TUI).
- [ ] `j`, `k`, `n`, `p`, `q`, `e`, `o`, `l`, `a`, and all other issue detail keybindings are inactive while the textarea is focused.
- [ ] When the textarea closes (submit or cancel), focus returns to the issue detail scrollbox at the scroll position where it was before the textarea opened (for cancel) or at the new comment position (for submit).
- [ ] If the user presses `?` while the textarea is open, the help overlay shows comment-specific keybindings.
- [ ] Global keybindings `:` (command palette) are disabled while the textarea is focused.

### Boundary constraints
- [ ] Comment body: no client-side character limit. Server-side limit is enforced; server 422 error is displayed inline.
- [ ] Comment body for rendering after submission: truncated at 50,000 characters per existing TUI_ISSUE_COMMENT_LIST spec.
- [ ] Textarea scrollbox supports up to 10,000 lines of content without performance degradation.
- [ ] Empty or whitespace-only body is rejected client-side before API call.
- [ ] Body is trimmed (leading/trailing whitespace removed) before submission.

### Responsive behavior
- [ ] At 80×24: textarea height = 5 rows. Issue content above reduced to ~15 rows.
- [ ] At 120×40: textarea height = 8 rows.
- [ ] At 200×60+: textarea height = 12 rows.
- [ ] Below 80×24: "Terminal too small" message; textarea is not rendered.
- [ ] Terminal resize while the textarea is open recalculates layout synchronously. Textarea content and cursor position are preserved.
- [ ] Textarea width always fills the available content width minus 2 (for borders).

### Performance
- [ ] Textarea opens within 50ms of `c` keypress.
- [ ] Keystroke-to-render latency within the textarea: <16ms.
- [ ] Submission round-trip: optimistic comment appears within 16ms; server confirmation within 2 seconds at p95.
- [ ] Textarea close (cancel or submit) within 16ms.

## Design

### Layout structure

When the textarea is open at standard size (120×40), the issue detail view splits vertically: the upper portion shows the scrollable issue content (header, body, comments), and the lower portion shows the comment creation panel with a bordered textarea, "New comment" label, and keybinding hints. A horizontal separator divides the two regions.

At minimum size (80×24), the textarea occupies 5 rows. At standard (120×40), 8 rows. At large (200×60+), 12 rows.

### Component tree (OpenTUI)

The comment creation panel is rendered conditionally within the issue detail view:

```jsx
<box flexDirection="column" width="100%" height="100%">
  <scrollbox flexGrow={1} paddingX={1}>
    {/* existing issue detail content */}
  </scrollbox>

  {isComposing && (
    <box flexDirection="column" paddingX={1}>
      <text fg={ANSI_BORDER}>{'─'.repeat(contentWidth)}</text>
      {commentError && <text fg={ANSI_ERROR}>⚠ {commentError}</text>}
      <box flexDirection="column" border="single" fg={ANSI_PRIMARY}>
        <text bold fg={ANSI_PRIMARY}>New comment</text>
        <scrollbox height={textareaHeight}>
          <input multiline value={commentBody} onChange={setCommentBody}
            placeholder="Write a comment... (markdown supported)"
            focused={true} disabled={isSubmitting} />
        </scrollbox>
      </box>
      {showDiscardConfirm && <text fg={ANSI_WARNING}>Discard comment? (y/n)</text>}
    </box>
  )}
</box>
```

Optimistic comment in timeline:
```jsx
<box flexDirection="column" gap={0} marginTop={1}>
  <box flexDirection="row" gap={2}>
    <text fg={ANSI_PRIMARY} attributes={BOLD}>@{currentUser.login}</text>
    <text fg={ANSI_MUTED}>{isPending ? "⏳ just now" : relativeTime(comment.created_at)}</text>
  </box>
  <markdown content={comment.body} />
</box>
```

### Keybindings

**When textarea is closed:** `c` opens comment creation textarea.

**When textarea is open:** `Ctrl+S` (submit), `Esc` (cancel/discard), `Enter` (newline), `Backspace`/`Delete` (delete), `Left`/`Right`/`Up`/`Down` (cursor movement), `Home`/`Ctrl+A` (start of line), `End`/`Ctrl+E` (end of line), `Ctrl+K` (kill to end), `Ctrl+U` (kill to start), `?` (help overlay), `Ctrl+C` (quit TUI).

**When discard confirmation shown:** `y` (discard), `n` or `Esc` (return to textarea).

### Status bar hints (while textarea is open)
`Ctrl+S:submit │ Esc:cancel` — replaces normal issue detail hints.

### Terminal resize behavior

| Width × Height | Textarea Height | Issue Content Rows |
|----------------|-----------------|-------------------|
| 80×24 – 119×39 | 5 rows | height - 10 |
| 120×40 – 199×59 | 8 rows | height - 12 |
| 200×60+ | 12 rows | height - 16 |

Resize triggers synchronous re-layout via `useOnResize()`. Content and cursor preserved.

### Data hooks consumed

| Hook | Source | Purpose |
|------|--------|--------|
| `useCreateIssueComment(owner, repo, number)` | `@codeplane/ui-core` | Mutation: `POST /api/repos/:owner/:repo/issues/:number/comments` |
| `useIssueComments(owner, repo, number)` | `@codeplane/ui-core` | Read: items array for optimistic append |
| `useUser()` | `@codeplane/ui-core` | Read: currentUser.login for optimistic comment |
| `useKeyboard()` | `@opentui/react` | Textarea keybinding handlers |
| `useTerminalDimensions()` | `@opentui/react` | Responsive textarea sizing |
| `useOnResize()` | `@opentui/react` | Re-layout on terminal resize |
| `useStatusBarHints()` | local TUI | Updates status bar for comment mode |

### API endpoint

`POST /api/repos/:owner/:repo/issues/:number/comments` with body `{ body: string }` returns `201: IssueCommentResponse { id, issue_id, user_id, commenter, body, type, created_at, updated_at }`.

### Optimistic UI flow

1. User presses Ctrl+S → client validates body not empty
2. Textarea becomes non-interactive → optimistic comment appended with pending indicator
3. POST request fires
4. Success: replace optimistic with server response, update comment_count
5. Failure: remove optimistic, revert count, reopen textarea with content, show error toast

## Permissions & Security

### Authorization
- Comment creation requires authentication. Any authenticated user can comment on issues in public repositories. For private repositories, read access is required (server-enforced).
- The `c` keybinding is visible in status bar hints for all authenticated users. Hidden for unauthenticated sessions.
- Unauthenticated users pressing `c` see an inline toast: "Sign in to comment. Run `codeplane auth login`." No textarea opens.
- Repository write access is NOT required to comment — comments are a lower-privilege action.
- Server returns 403 if user lacks permission (banned, private repo without access). TUI shows "Permission denied. You cannot comment on this issue."

### Token-based auth
- TUI authenticates via token from CLI keychain (`codeplane auth login`) or `CODEPLANE_TOKEN` environment variable.
- Token injected by `<APIClientProvider>` as `Authorization: token <token>` on the POST request.
- 401 response triggers: "Session expired. Run `codeplane auth login` to re-authenticate."
- TUI does not retry 401s; user must re-authenticate via CLI.

### Rate limiting
- Comment creation subject to server-side rate limiting.
- 429 response shows: "Rate limit exceeded. Please wait and try again." with `Retry-After` value if present.
- Textarea remains open with content preserved on 429.
- No auto-retry. User manually retries with `Ctrl+S`.

### Input safety
- Comment body sent as-is to server. Server-side sanitization handles injection.
- No HTML rendering in TUI. ANSI escape codes in comment body escaped during post-submission rendering.
- No PII beyond username displayed in optimistic comment.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.issue_comment.textarea_opened` | User presses `c` | `owner`, `repo`, `issue_number`, `issue_state`, `existing_comment_count`, `terminal_width`, `terminal_height`, `layout` |
| `tui.issue_comment.submitted` | User presses `Ctrl+S` | `owner`, `repo`, `issue_number`, `body_length`, `line_count`, `time_to_submit_ms`, `has_code_block`, `has_markdown_formatting` |
| `tui.issue_comment.succeeded` | Server returns 2xx | `owner`, `repo`, `issue_number`, `comment_id`, `server_response_ms`, `total_duration_ms` |
| `tui.issue_comment.failed` | Server returns non-2xx or network error | `owner`, `repo`, `issue_number`, `error_code`, `error_message`, `body_length`, `retry_count` |
| `tui.issue_comment.cancelled` | User cancels via Esc | `owner`, `repo`, `issue_number`, `was_empty`, `body_length`, `time_open_ms` |
| `tui.issue_comment.discard_confirmed` | User confirms discard (y) | `owner`, `repo`, `issue_number`, `body_length`, `time_open_ms` |
| `tui.issue_comment.discard_cancelled` | User cancels discard (n) | `owner`, `repo`, `issue_number`, `body_length` |
| `tui.issue_comment.validation_error` | Empty body rejected | `owner`, `repo`, `issue_number` |
| `tui.issue_comment.optimistic_reverted` | Optimistic comment removed | `owner`, `repo`, `issue_number`, `error_code` |

### Common event properties
All events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `color_mode` ("truecolor" | "256" | "16"), `layout` ("compact" | "standard" | "expanded").

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Comment completion rate | > 75% | % of textarea_opened → succeeded |
| Comment abandonment with content | < 20% | % of textarea_opened → discard_confirmed |
| Submission error rate | < 2% | % of submitted → failed |
| Time to submit (median) | < 45 seconds | From open to successful submission |
| Optimistic revert rate | < 1% | % of submissions requiring revert |
| Retry rate after failure | > 60% | % of users retrying after failure |
| Mean body length | > 50 chars | Indicates substantive comments |

## Observability

### Logging requirements

| Log level | Event | Message format |
|-----------|-------|----------------|
| `debug` | Textarea opened | `IssueCommentCreate: opened [owner={o}] [repo={r}] [number={n}] [width={w}] [height={h}]` |
| `debug` | Content changed | `IssueCommentCreate: typing [length={len}] [lines={n}]` (debounced 1/sec) |
| `debug` | Textarea resized | `IssueCommentCreate: resize [textarea_height={h}] [width={w}]` |
| `info` | Comment submitted | `IssueCommentCreate: submitted [owner={o}] [repo={r}] [number={n}] [body_length={len}]` |
| `info` | Comment created | `IssueCommentCreate: created [owner={o}] [repo={r}] [number={n}] [comment_id={id}] [duration={ms}ms]` |
| `info` | Cancelled (empty) | `IssueCommentCreate: cancelled [owner={o}] [repo={r}] [number={n}] [was_empty=true]` |
| `info` | Discarded | `IssueCommentCreate: discarded [owner={o}] [repo={r}] [number={n}] [body_length={len}] [time_open={ms}ms]` |
| `warn` | Slow submission | `IssueCommentCreate: slow submit [duration={ms}ms]` (>2000ms) |
| `warn` | Rate limited | `IssueCommentCreate: rate limited [retry_after={s}s]` |
| `error` | Submission failed | `IssueCommentCreate: failed [status={code}] [error={msg}]` |
| `error` | Auth error | `IssueCommentCreate: auth error [status=401]` |
| `error` | Permission denied | `IssueCommentCreate: permission denied [status=403]` |
| `error` | Optimistic revert | `IssueCommentCreate: optimistic revert [error={msg}]` |
| `error` | Render error | `IssueCommentCreate: render error [component={name}] [error={msg}]` |

### Error cases specific to TUI

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize while textarea open | Layout recalculates synchronously; content/cursor preserved | Automatic |
| Terminal resize below 80×24 while composing | "Terminal too small" shown; content preserved in memory | Resize back above 80×24 restores textarea |
| Resize during submission in flight | Layout adjusts; submission continues; "Posting…" preserved | Automatic |
| SSE disconnect while composing | Status bar shows disconnected; REST-based comment unaffected | SSE reconnects independently |
| Auth token expires while composing | Next Ctrl+S fails with 401; auth error shown; content preserved | Re-authenticate via CLI |
| Network timeout during submission | Fails after 10s timeout; optimistic reverted; textarea reopens | Retry with Ctrl+S |
| Server 500 during submission | Optimistic reverted; error toast; textarea reopens | Retry with Ctrl+S |
| Rapid Ctrl+S during submission | Double-submit prevented; additional presses are no-ops | First submission completes normally |
| Issue deleted while composing | Submission returns 404; "Issue no longer exists" shown | Press q to go back |
| Very long comment (100k+ chars) | Server may return 413/422; error displayed inline | User shortens content |
| Ctrl+C while composing | TUI quits immediately; draft lost | Relaunch TUI |
| Terminal has no color support | Borders use ASCII; errors use bold/underline | Detected by TUI_THEME_AND_COLOR_TOKENS |

### Failure modes and recovery
- **Textarea component crash**: Wrapped in error boundary within issue detail. Shows "Comment input error — press c to try again." Issue content above remains visible.
- **Optimistic update inconsistency**: Server response replaces optimistic comment. No error shown.
- **Network disconnect during typing**: No immediate effect. Submission fails on Ctrl+S. Error directs user to check connection.
- **Memory pressure from very long comment**: Textarea scrollbox uses virtualized line rendering for 1000+ lines.

## Verification

### Terminal snapshot tests

```
SNAP-COMMENT-CREATE-001: Comment textarea renders at 120x40
  → On issue detail, press c
  → Assert textarea panel with "New comment" label, border, empty input, status bar shows "Ctrl+S:submit │ Esc:cancel"

SNAP-COMMENT-CREATE-002: Comment textarea renders at 80x24
  → On issue detail at 80×24, press c
  → Assert textarea with 5-row height, issue content compressed above

SNAP-COMMENT-CREATE-003: Comment textarea renders at 200x60
  → On issue detail at 200×60, press c
  → Assert textarea with 12-row height, generous spacing

SNAP-COMMENT-CREATE-004: Textarea with multi-line markdown content
  → Press c, type multi-line comment with code block
  → Assert text renders with correct wrapping and cursor

SNAP-COMMENT-CREATE-005: Empty body validation error
  → Press c, Ctrl+S on empty textarea
  → Assert "⚠ Comment cannot be empty" in error color, textarea still open

SNAP-COMMENT-CREATE-006: Discard confirmation prompt
  → Press c, type "draft", Esc
  → Assert "Discard comment? (y/n)" with textarea content visible

SNAP-COMMENT-CREATE-007: Submitting state
  → Press c, type comment, Ctrl+S
  → Assert disabled textarea, "Posting…" in status bar

SNAP-COMMENT-CREATE-008: Optimistic comment in timeline
  → Submit successfully
  → Assert new comment with @currentUser and "⏳ just now", textarea closed

SNAP-COMMENT-CREATE-009: Error toast after failed submission
  → Submit, API 500
  → Assert error toast, optimistic removed, textarea reopened with content

SNAP-COMMENT-CREATE-010: Auth error (401)
  → Submit, API 401
  → Assert "Session expired" message, textarea closed

SNAP-COMMENT-CREATE-011: Permission denied (403)
  → Submit, API 403
  → Assert "Permission denied" message

SNAP-COMMENT-CREATE-012: Unauthenticated user presses c
  → No auth token, press c
  → Assert "Sign in to comment" toast, no textarea

SNAP-COMMENT-CREATE-013: Help overlay while composing
  → Press c, then ?
  → Assert help overlay with comment-specific keybindings

SNAP-COMMENT-CREATE-014: Rate limit error (429)
  → Submit, API 429 with Retry-After
  → Assert rate limit message, textarea open with content

SNAP-COMMENT-CREATE-015: Comment count updated optimistically
  → Issue shows "5 comments" → submit → Assert "6 comments"
```

### Keyboard interaction tests

```
KEY-COMMENT-CREATE-001: c opens textarea → type "hello" → Assert in textarea
KEY-COMMENT-CREATE-002: Multi-line input → "line1" Enter "line2" → Assert "line1\nline2"
KEY-COMMENT-CREATE-003: Ctrl+S submits → Assert POST fired, textarea closes on success
KEY-COMMENT-CREATE-004: Ctrl+S on empty → validation error, no API call
KEY-COMMENT-CREATE-005: Ctrl+S on whitespace-only → validation error, no API call
KEY-COMMENT-CREATE-006: Esc on empty → closes immediately, no confirmation
KEY-COMMENT-CREATE-007: Esc on non-empty → "Discard comment? (y/n)" shown
KEY-COMMENT-CREATE-008: y at discard → textarea closed, content discarded
KEY-COMMENT-CREATE-009: n at discard → returns to textarea with content
KEY-COMMENT-CREATE-010: Esc at discard → returns to textarea with content
KEY-COMMENT-CREATE-011: c while open → no-op, single textarea
KEY-COMMENT-CREATE-012: Detail keys disabled → j, k, q, n, p, e, o all no-ops while composing
KEY-COMMENT-CREATE-013: Ctrl+C quits from textarea
KEY-COMMENT-CREATE-014: ? shows help, Esc closes overlay, textarea still active
KEY-COMMENT-CREATE-015: Double submit prevention → only one API call
KEY-COMMENT-CREATE-016: Text editing keys (Home, End, Ctrl+K, Ctrl+U)
KEY-COMMENT-CREATE-017: Backspace and Delete
KEY-COMMENT-CREATE-018: Arrow keys navigate within textarea (Up, Down, Left, Right)
KEY-COMMENT-CREATE-019: Focus returns to same scroll position after cancel
KEY-COMMENT-CREATE-020: Focus jumps to new comment after submit
KEY-COMMENT-CREATE-021: Textarea reopens with content after server error
KEY-COMMENT-CREATE-022: Submit trims whitespace → "  hello  " becomes "hello"
KEY-COMMENT-CREATE-023: Optimistic comment reverted on error
KEY-COMMENT-CREATE-024: Comment count reverted on error (6→5)
KEY-COMMENT-CREATE-025: Optimistic finalized with server data (⏳ replaced)
```

### Responsive tests

```
RESIZE-COMMENT-CREATE-001: Textarea height 5 rows at 80×24
RESIZE-COMMENT-CREATE-002: Textarea height 8 rows at 120×40
RESIZE-COMMENT-CREATE-003: Textarea height 12 rows at 200×60
RESIZE-COMMENT-CREATE-004: 120×40→80×24 while composing → height shrinks, content preserved
RESIZE-COMMENT-CREATE-005: 80×24→120×40 while composing → height grows, content preserved
RESIZE-COMMENT-CREATE-006: Below minimum while composing → "too small", resize back restores
RESIZE-COMMENT-CREATE-007: Rapid resize sequence → clean layout, content preserved
RESIZE-COMMENT-CREATE-008: Resize during submission → "Posting…" preserved, completes normally
RESIZE-COMMENT-CREATE-009: Textarea width fills available space at each breakpoint
RESIZE-COMMENT-CREATE-010: Issue content area adjusts when textarea opens at each size
```

### Edge case tests

```
EDGE-COMMENT-CREATE-001: 10k+ character single-line comment → wraps, no perf degradation
EDGE-COMMENT-CREATE-002: 1000+ line comment → scrollbox handles, scroll works
EDGE-COMMENT-CREATE-003: Unicode/emoji in comment → renders correctly
EDGE-COMMENT-CREATE-004: Markdown code block in comment → plain text in textarea, rendered after submit
EDGE-COMMENT-CREATE-005: Raw ANSI codes in comment → treated as literal text
EDGE-COMMENT-CREATE-006: Immediate Esc after c → closes (was empty)
EDGE-COMMENT-CREATE-007: Whitespace-only treated as empty for discard (no confirmation)
EDGE-COMMENT-CREATE-008: Comment on issue with 500 existing comments → appends as 501
EDGE-COMMENT-CREATE-009: Multiple rapid c presses → only one textarea opens
EDGE-COMMENT-CREATE-010: Paste + immediate submit → processes correctly
EDGE-COMMENT-CREATE-011: NO_COLOR=1 → bold/underline instead of color
EDGE-COMMENT-CREATE-012: Boundary issue numbers (1, 2147483647)
EDGE-COMMENT-CREATE-013: Network disconnect then reconnect → submit succeeds
EDGE-COMMENT-CREATE-014: Server returns different body → rendered with server's body
EDGE-COMMENT-CREATE-015: Ctrl+S immediately after error recovery → resubmission works
```
