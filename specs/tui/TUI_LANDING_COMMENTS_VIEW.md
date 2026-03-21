# TUI_LANDING_COMMENTS_VIEW

Specification for TUI_LANDING_COMMENTS_VIEW.

## High-Level User POV

The landing comments view is the section of the landing request detail screen where a developer reads, navigates, and participates in the code review conversation. Unlike issue comments, landing request comments are diff-aware: each comment is either a general discussion comment (no file/line context) or an inline comment anchored to a specific file path and line number. The comments view presents both types in a unified, chronological timeline that lets the developer follow the full review conversation without switching between the diff viewer and a separate discussion tab.

The comments section occupies a dedicated tab or region within the landing request detail view, introduced by a `─── Comments (N) ───` separator where N reflects the total server-side comment count. General comments render as full blocks: the author's `@username` in bold primary color, a relative timestamp in muted text, and the comment body rendered as markdown. Inline comments render with an additional context line above the body: a file path and line number displayed as `📄 path/to/file.ts:42 (right)` in a distinct accent color, giving the developer immediate spatial context for where in the diff the feedback applies. When multiple inline comments target the same file, they are visually grouped but remain in strict chronological order within the overall timeline.

The developer navigates comments using `n` (next comment) and `p` (previous comment) to jump between comments. The currently focused comment is highlighted with a left-side vertical accent bar in primary color. Standard `j/k` scrolling moves through the full content area. For inline comments, pressing `Enter` on a focused inline comment navigates the developer to the diff viewer positioned at the referenced file and line — a quick way to see the code being discussed. Pressing `q` from the diff returns to the comments view with focus preserved.

The comment list supports page-based pagination: the first 30 comments load when the comments section mounts. As the developer scrolls past 80% of loaded content, the next page loads automatically. A "Loading more…" indicator appears during fetch. A hard cap of 500 comments prevents memory issues, with a notice when the cap is reached.

Composing a new comment is initiated by pressing `c` for a general comment. The inline comment textarea opens at the bottom of the comments section (same pattern as issue comment creation). The developer writes markdown, presses `Ctrl+S` to submit, and sees an optimistic update immediately. For inline comments on specific diff lines, the developer initiates from the diff viewer (handled by TUI_DIFF_INLINE_COMMENTS), not from this view — but the resulting comments appear in this timeline.

At the minimum 80×24 terminal size, inline comment file paths truncate from the left, timestamps use short format, and comment bodies wrap tightly. At 120×40 standard size, full file paths and medium timestamps are shown. At 200×60+, generous spacing and full timestamps provide a comfortable reading experience. The comments view adapts fluidly to terminal resize, preserving the developer's scroll position and focused comment across layout changes.

## Acceptance Criteria

### Comment rendering
- [ ] Comments render chronologically (oldest first) below a `─── Comments (N) ───` separator where N is the total comment count from the landing request data.
- [ ] Each comment displays `@username` (from `author.login`) in `primary` color (ANSI 33) with `BOLD` attribute.
- [ ] Each comment displays a relative timestamp in `muted` color (ANSI 245) next to the username.
- [ ] Comment bodies render using the `<markdown>` component with full markdown support: headings, lists, code blocks (syntax highlighted), bold, italic, links, blockquotes.
- [ ] Code blocks within comments render with `<code>` syntax highlighting inside the `<markdown>` component.
- [ ] Links in comment bodies render as underlined text with the URL shown inline in `muted` color.
- [ ] Comments are visually separated by a blank line (1-row gap between comment blocks).
- [ ] An "edited" indicator appears in `muted` color next to the timestamp when `updated_at` differs from `created_at`.
- [ ] Comments authored by the current user show a subtle `(you)` suffix after the username in `muted` color.

### Inline comment rendering (diff-aware)
- [ ] Comments with `path !== ""` and `line > 0` are rendered as inline comments with a file context header.
- [ ] The file context header renders as `📄 {path}:{line} ({side})` in `primary` color above the comment body.
- [ ] The `side` value is displayed as-is: "left", "right", or "both".
- [ ] Comments with `path === ""` and `line === 0` are rendered as general comments without a file context header.
- [ ] File paths that exceed the available width are truncated from the left with `…` prefix.
- [ ] Pressing `Enter` on a focused inline comment navigates to the diff viewer at the referenced file and line.
- [ ] General comments (no file/line) do not respond to `Enter` with diff navigation.

### Focus and navigation
- [ ] The currently focused comment is indicated by a left-side vertical accent bar (`│`) in `primary` color (ANSI 33).
- [ ] `n` moves focus to the next comment in the list.
- [ ] `p` moves focus to the previous comment in the list.
- [ ] `n` on the last comment does not wrap — focus stays on the last comment.
- [ ] `p` on the first comment does not wrap — focus stays on the first comment.
- [ ] When focus moves to a comment not currently visible in the viewport, the scrollbox scrolls to bring the focused comment into view.
- [ ] If there are zero comments, `n` and `p` are no-ops.
- [ ] If there is exactly one comment, `n` and `p` are no-ops.
- [ ] `j/k` scrolling traverses all items within the scrollbox.
- [ ] `G` scrolls to the bottom of the comment list; `g g` scrolls to the top of the entire landing detail view.

### Empty state
- [ ] When the landing request has zero comments, the section shows "No comments yet. Press c to add one." in `muted` text.
- [ ] The `─── Comments (0) ───` separator still renders above the empty state message.

### Pagination
- [ ] The first page of 30 comments loads on comments section mount.
- [ ] Additional pages load via page-based pagination when the user scrolls past 80% of loaded content.
- [ ] A "Loading more…" indicator in `muted` text appears at bottom during fetch.
- [ ] Pagination requests are deduplicated — rapid scrolling does not trigger multiple concurrent fetches.
- [ ] End-of-list detection: when the API returns fewer items than page size, pagination stops.
- [ ] Maximum 500 total comments loaded in memory. Cap warning in `warning` color.
- [ ] Newly loaded pages append seamlessly; scroll position preserved.

### Comment creation (general)
- [ ] Pressing `c` opens a comment creation textarea at bottom of comments section.
- [ ] Textarea is pre-focused immediately on open.
- [ ] Multi-line markdown input: `Enter` inserts a newline.
- [ ] `Ctrl+S` submits with `{ body: trimmedContent, path: "", line: 0, side: "" }`.
- [ ] Empty/whitespace-only body shows validation error; API not called.
- [ ] On success (201), textarea closes, optimistic finalized, scroll jumps to new comment.
- [ ] `Esc` on empty closes immediately; on non-empty shows discard confirmation.
- [ ] Only one textarea at a time. Unavailable when unauthenticated or read-only.

### Optimistic UI
- [ ] On submission, comment optimistically appended with `⏳ just now`.
- [ ] On success, replaced with server data. On error, removed with recovery flow.
- [ ] Comment count updates optimistically (+1 on submit, reverted on error).

### Boundary constraints
- [ ] Comment body rendering: truncated at 50,000 chars with notice.
- [ ] Author username: truncated at 39 chars with `…`.
- [ ] File path: truncated from left at `terminal_width - 20` with `…` prefix.
- [ ] Relative timestamps with defined format ranges.
- [ ] Comment count displays server-side total from X-Total-Count header.
- [ ] Scrollbox virtualization for 100+ comments.
- [ ] Textarea supports up to 10,000 lines.

### Responsive behavior
- [ ] 80×24: compact timestamps, truncated paths, 5-row textarea.
- [ ] 120×40: medium timestamps, full paths, 8-row textarea.
- [ ] 200×60+: full timestamps, generous spacing, 12-row textarea.
- [ ] Below 80×24: "Terminal too small" message.
- [ ] Resize preserves focus, scroll position, and textarea content.

### Performance
- [ ] First render within 50ms. Scrolling at 60fps. n/p within 16ms. Pagination within 2s. Textarea opens within 50ms. Keystroke latency <16ms.

## Design

### Layout structure

The comments section is embedded within the landing request detail view, positioned as a tab or scrollable section below the landing body, change stack, reviews, and checks sections.

At standard terminal size (120×40):
```
├──────────────── Comments (8) ────────────────────────────────────────────────────────────────────┤
│ │ @alice · 3h ago                                                                                │
│ │ I think the approach looks good overall.                                                        │
│                                                                                                  │
│   @bob · 2h ago                                                                                  │
│   📄 src/components/Header.tsx:42 (right)                                                        │
│   This should use `useMemo` to avoid re-renders.                                                 │
│                                                                                                  │
│   @carol · 1h ago (you)                                                                          │
│   Good catch on the memo. Fixed in the latest change.                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The `│` accent bar on the left indicates the focused comment.

### Component tree (OpenTUI)

Comments separator: `<text fg={ANSI_BORDER}>` with `─── Comments (N) ───` centered.

Comment list: `<scrollbox>` containing `<box flexDirection="column">` with `LandingCommentBlock` components.

LandingCommentBlock: `<box flexDirection="column">` with accent bar, username+timestamp row, optional `📄 path:line (side)` file context in primary color, `<markdown content={body}>` body.

Optimistic comment: Same structure with `⏳ just now` timestamp.

Textarea panel: Conditional `<box>` with separator, error display, bordered `<input multiline>` inside `<scrollbox>`, and discard confirmation.

### Keybindings

**Comment list focused:** `n` (next comment), `p` (previous), `j/k` (scroll), `G` (bottom), `g g` (top), `Ctrl+D/U` (page down/up), `Enter` (go to diff for inline comment), `c` (compose), `?` (help), `:` (palette), `q` (back).

**Textarea open:** `Ctrl+S` (submit), `Esc` (cancel/discard), `Enter` (newline), arrow keys, Home/End, `Ctrl+K/U` (kill line), `?` (help), `Ctrl+C` (quit).

**Discard confirmation:** `y` (discard), `n`/`Esc` (keep editing).

### Status bar hints
List: `n/p:comments │ Enter:go to diff │ c:comment │ ?:help`
Textarea: `Ctrl+S:submit │ Esc:cancel`

### Terminal resize behavior

| Size | Textarea | Timestamps | File Paths | Padding |
|------|----------|------------|------------|---------|
| 80×24 | 5 rows | "2h" | Truncated left, max 40 chars | marginTop=1 |
| 120×40 | 8 rows | "2h ago" | Full | marginTop=1 |
| 200×60+ | 12 rows | "2 hours ago" | Full + spacing | marginTop=2 |

Resize triggers synchronous re-layout via `useOnResize()`. Focus, cursor, content preserved.

### Data hooks consumed

| Hook | Source | Purpose |
|------|--------|--------|
| `useLandingComments(owner, repo, number)` | `@codeplane/ui-core` | Paginated comments |
| `useCreateLandingComment(owner, repo, number)` | `@codeplane/ui-core` | POST mutation |
| `useLanding(owner, repo, number)` | `@codeplane/ui-core` | Landing context |
| `useUser()` | `@codeplane/ui-core` | Current user for author detection |
| `useKeyboard()` | `@opentui/react` | Key handlers |
| `useTerminalDimensions()` | `@opentui/react` | Responsive sizing |
| `useOnResize()` | `@opentui/react` | Resize handler |
| `useStatusBarHints()` | local TUI | Status bar updates |

### API endpoints

`GET /api/repos/:owner/:repo/landings/:number/comments?page=N&per_page=30` — page-based pagination with X-Total-Count header.

`POST /api/repos/:owner/:repo/landings/:number/comments` — body: `{ body, path, line, side }`. Returns 201 with LandingCommentResponse.

Response shape: `{ id, landing_request_id, author: { id, login }, path, line, side, body, created_at, updated_at }`.

## Permissions & Security

### Authorization
- Comment list visible to any user with read access to the repository. Users without access see 404 from parent landing detail.
- Comment creation requires authentication AND write access (server-enforced via `requireWriteAccess()`). Stricter than issue comments.
- `c` keybinding visible for authenticated users with write access. Hidden for unauthenticated and read-only users.
- Unauthenticated: "Sign in to comment. Run `codeplane auth login`." Read-only: "Write access required to comment on landing requests."
- Server 403 → "Permission denied. You cannot comment on this landing request."

### Token-based auth
- Token from CLI keychain or `CODEPLANE_TOKEN` env var. Injected as `Authorization: token <token>`.
- 401 → "Session expired. Run `codeplane auth login` to re-authenticate." No retry.

### Rate limiting
- Server-side rate limiting on creation. 429 → "Rate limit exceeded." Textarea preserved, manual retry.
- Pagination naturally rate-limited by scroll. Requests deduplicated. Max ~17 requests per session.

### Input safety
- Body sent as-is; server sanitizes. ANSI escapes escaped by `<markdown>`. No PII beyond usernames.
- File paths from inline comments are repository content references, not user PII.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landing_comments.rendered` | Section renders | owner, repo, landing_number, comment_count, inline_count, general_count, terminal dims, layout |
| `tui.landing_comments.comment_navigated` | n/p pressed | direction, from/to IDs, position, total, is_inline |
| `tui.landing_comments.scrolled` | Scroll past 50% | scroll_depth_percent, items loaded/visible |
| `tui.landing_comments.pagination_triggered` | Scroll past 80% | page_number, items_loaded_before |
| `tui.landing_comments.pagination_completed` | Fetch completes | page, items after, duration, new count |
| `tui.landing_comments.items_capped` | 500 cap reached | total server items, loaded |
| `tui.landing_comments.empty_state_shown` | 0 comments | owner, repo, landing_number |
| `tui.landing_comments.inline_comment_navigated` | Enter on inline | comment_id, path, line, side |
| `tui.landing_comments.textarea_opened` | c pressed | owner, repo, landing_number, state, count, dims |
| `tui.landing_comments.submitted` | Ctrl+S | body_length, line_count, time_to_submit_ms, formatting flags |
| `tui.landing_comments.succeeded` | 201 response | comment_id, response_ms, total_duration |
| `tui.landing_comments.failed` | Non-2xx/network | error_code, message, body_length, retry_count |
| `tui.landing_comments.cancelled` | Esc | was_empty, body_length, time_open_ms |
| `tui.landing_comments.discard_confirmed` | y at prompt | body_length, time_open_ms |
| `tui.landing_comments.validation_error` | Empty body | owner, repo, landing_number |
| `tui.landing_comments.optimistic_reverted` | Revert needed | error_code |

All events include: session_id, timestamp (ISO 8601), terminal_width, terminal_height, color_mode, layout.

### Success indicators

| Metric | Target |
|--------|--------|
| Render rate | 100% |
| Data load success | > 98% |
| n/p usage (3+ comments) | > 25% |
| Inline → diff navigation | > 40% |
| Scroll depth > 50% | > 55% |
| Comment completion rate | > 70% |
| Abandonment with content | < 25% |
| Submission error rate | < 2% |
| Time to submit (median) | < 60s |
| Optimistic revert rate | < 1% |
| Mean body length | > 40 chars |
| Items capped rate | < 3% |
| First page load | < 800ms |

## Observability

### Logging requirements

| Level | Event | Format |
|-------|-------|--------|
| debug | Mounted | `LandingComments: mounted [owner={o}] [repo={r}] [landing={n}]` |
| debug | Loaded | `LandingComments: loaded [landing={n}] [page={p}] [count={c}] [duration={ms}ms]` |
| debug | Navigation | `LandingComments: nav [direction={n|p}] [from={id}] [to={id}]` |
| debug | Scroll | `LandingComments: scroll [position={pct}%] [items_visible={n}]` |
| debug | Focus | `LandingComments: focus [comment_id={id}] [is_inline={bool}]` |
| debug | Textarea opened | `LandingComments: textarea opened [width={w}] [height={h}]` |
| debug | Typing | `LandingComments: typing [length={len}]` (debounced 1/sec) |
| info | Rendered | `LandingComments: rendered [landing={n}] [total={c}] [inline={i}] [general={g}]` |
| info | Pagination | `LandingComments: pagination [landing={n}] [page={p}]` |
| info | Capped | `LandingComments: capped [landing={n}] [loaded=500] [total={n}]` |
| info | Submitted | `LandingComments: submitted [body_length={len}]` |
| info | Created | `LandingComments: created [comment_id={id}] [duration={ms}ms]` |
| info | Diff nav | `LandingComments: diff nav [comment_id={id}] [path={p}] [line={l}]` |
| warn | Slow pagination | `LandingComments: slow pagination [duration={ms}ms]` (>2000ms) |
| warn | Body truncated | `LandingComments: body truncated [comment_id={id}] [length={len}]` |
| warn | Rate limited | `LandingComments: rate limited [retry_after={s}s]` |
| error | Fetch failed | `LandingComments: fetch failed [status={code}] [error={msg}]` |
| error | Submit failed | `LandingComments: failed [status={code}] [error={msg}]` |
| error | Auth error | `LandingComments: auth error [status=401]` |
| error | Permission denied | `LandingComments: permission denied [status=403]` |
| error | Optimistic revert | `LandingComments: optimistic revert [error={msg}]` |
| error | Render error | `LandingComments: render error [component={name}] [error={msg}]` |

### TUI-specific error cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during pagination | Layout re-renders; pagination continues | Automatic |
| Resize during n/p | Focus preserved; scroll adjusted | Automatic |
| Resize while composing | Content/cursor preserved | Automatic |
| Resize below 80×24 while composing | "Too small"; content in memory | Resize back restores |
| SSE disconnect | REST unaffected; status bar shows disconnected | SSE reconnects |
| Auth expires during pagination | 401 inline error | Re-auth via CLI |
| Auth expires while composing | Ctrl+S fails 401; content preserved | Re-auth via CLI |
| Network timeout on pagination | Error with retry hint | Scroll or press R |
| Network timeout on submit | Optimistic reverted; textarea reopens | Retry Ctrl+S |
| Server 500 on fetch | Error with retry | Press R |
| Rapid n/p repeats | Synchronous; debounced at 16ms | Automatic |
| Rapid Ctrl+S | Double-submit prevented | First completes |
| Landing deleted | 404; "no longer exists" | Press q |
| Very long comment | Server 413/422 inline | Shorten content |
| Ctrl+C while composing | TUI quits; draft lost | Relaunch |
| No color support | ASCII borders; bold/underline | Auto-detected |

### Failure modes
- Comment section crash: Error boundary preserves landing header/body. Shows retry prompt.
- Single comment crash: Falls back to plain text; others unaffected.
- Textarea crash: Error boundary; shows "press c to try again."
- All API failures: Inline error; go-to mode and palette remain available.
- Memory pressure: Virtualized rendering + 500-item cap.

## Verification

### Terminal snapshot tests (37 tests)

SNAP-LANDING-COMMENTS-001 through SNAP-LANDING-COMMENTS-037 covering: general comments at 120x40, mixed general+inline comments, compact layout (80x24), expanded layout (200x60), focused comment accent bar, empty state, separator count, inline file context header, file path truncation, markdown body rendering, edited indicator, (you) suffix, loading more indicator, items capped notice, body truncation, textarea at all breakpoints, multi-line textarea, empty body validation, discard confirmation, submitting state, optimistic comment, error toast, auth error, permission denied, unauthenticated, read-only, help overlay, rate limit, optimistic count, fetch error state, long username, relative/absolute timestamps, same-file inline comments, status bar hints, side display variants.

### Keyboard interaction tests (42 tests)

KEY-LANDING-COMMENTS-001 through KEY-LANDING-COMMENTS-042 covering: n/p navigation, no-wrap at ends, no-ops with 0/1 comments, j/k scrolling, G to bottom, Enter on inline → diff navigation, Enter on general no-op, q from diff preserves focus, c opens textarea, multi-line input, Ctrl+S submit, empty/whitespace validation, Esc cancel flows, discard confirmation (y/n/Esc), single textarea enforcement, disabled keys while composing, Ctrl+C quit, help overlay, double-submit prevention, text editing keys, backspace/delete, arrow navigation, focus restoration on cancel/submit, server error recovery, whitespace trimming, optimistic revert/finalization, rapid n/p, scroll-triggered pagination.

### Responsive resize tests (18 tests)

RESIZE-LANDING-COMMENTS-001 through RESIZE-LANDING-COMMENTS-018 covering: timestamp formats at each breakpoint, collapse/expand on resize, focused comment preservation, body re-wrap, rapid resize, textarea height at each size, composing during resize, below-minimum recovery, resize during submission, file path truncation changes, textarea width filling, content area adjustment.

### Data loading and pagination tests (15 tests)

DATA-LANDING-COMMENTS-001 through DATA-LANDING-COMMENTS-015 covering: mount load, chronological order, 80% pagination trigger, deduplication, end-of-list detection, 500-item cap, empty page handling, 401 during pagination, 500 during pagination, optimistic persist/revert, duplicate dedup, X-Total-Count in separator, inline comment path/line/side from API, general comment no file context.

### Edge case tests (33 tests)

EDGE-LANDING-COMMENTS-001 through EDGE-LANDING-COMMENTS-033 covering: 50k+ char truncation, empty body, unicode/emoji, ANSI escapes, nested markdown, username truncation, single comment, zero comments, future timestamp, long file path, line=0 with path, path="" with line>0, 10k single line, 1000+ line textarea, markdown code blocks, immediate Esc, whitespace-only discard, 500+ comments, rapid c presses, paste+submit, NO_COLOR, boundary landing numbers, disconnect/reconnect, server body override, error recovery resubmit, 16-color fallback, concurrent resize+nav, error boundary, landing deletion, same-file comments, side="both", invalid side value.

**Total: 145 verification items. All tests left failing if backends are unimplemented — never skipped.**
