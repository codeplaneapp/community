# TUI_ISSUE_COMMENT_LIST

Specification for TUI_ISSUE_COMMENT_LIST.

## High-Level User POV

The issue comment list is the section of the issue detail view where the developer reads, navigates, and interacts with the chronological record of discussion on an issue. It occupies the lower portion of the issue detail screen, below the issue body and any dependencies section, and is introduced by a `─── Comments (N) ───` separator that shows the total comment count. Within this section, comments and timeline events are rendered in strict chronological order, oldest first, giving the developer a complete conversational thread without leaving the terminal.

Each comment renders as a visually distinct block: the commenter's username displayed as `@username` in bold primary color, a relative timestamp in muted text, and the comment body rendered as full markdown — supporting headings, lists, code blocks with syntax highlighting, bold, italic, links, and blockquotes. Between comments, timeline events — label additions, assignee changes, state transitions, milestone updates, and cross-references — appear as compact single-line entries in muted color with a descriptive icon prefix. The visual contrast between full comment blocks and single-line timeline entries makes it effortless to scan through a long issue history.

The developer navigates the comment list using `n` (next comment) and `p` (previous comment) to jump between comments, skipping over timeline events for fast reading. The currently focused comment is highlighted with a left-side vertical accent bar in primary color, making it visually prominent within the scrollable content. Standard `j/k` scrolling moves through the entire content area including timeline events, while `n/p` provides comment-specific jump navigation.

The comment list supports cursor-based pagination: the first 30 items (comments + timeline events interleaved) load when the issue detail screen opens. As the developer scrolls toward the bottom — past 80% of loaded content — the next page loads automatically. A "Loading more…" indicator appears at the bottom during fetch. For issues with extensive history, a hard cap of 500 items prevents memory issues, with a notice showing "Showing 500 of N items" when the cap is reached.

At the minimum 80×24 terminal size, comments render with minimal padding and shortened timestamps. At 120×40, comments have comfortable spacing with relative timestamps. At 200×60, the layout expands with generous padding and full-length timestamps. The comment list adapts fluidly to terminal resize, preserving the developer's scroll position and focused comment across layout changes.

The focused comment also serves as the anchor for context-sensitive actions: the developer can see edit (`e`) and delete (`x`) indicators on comments they authored. The comment list section has its own error boundary — if comment rendering fails, the issue header and body remain visible while the comment section shows an inline error with a retry option.

## Acceptance Criteria

### Comment rendering
- [ ] Comments render chronologically (oldest first) below a `─── Comments (N) ───` separator where N is the total comment count from the issue data.
- [ ] Each comment displays `@username` in `primary` color (ANSI 33) with `BOLD` attribute.
- [ ] Each comment displays a relative timestamp in `muted` color (ANSI 245) next to the username.
- [ ] Comment bodies render using the `<markdown>` component with full markdown support: headings, lists, code blocks (syntax highlighted), bold, italic, links, blockquotes, horizontal rules, and tables.
- [ ] Code blocks within comments render with `<code>` syntax highlighting inside the `<markdown>` component.
- [ ] Links in comment bodies render as underlined text with the URL shown inline in `muted` color.
- [ ] Comments are visually separated by a blank line (1-row gap between comment blocks).
- [ ] An "edited" indicator appears in `muted` color next to the timestamp when `updated_at` differs from `created_at` on a comment.
- [ ] Comments authored by the current user show a subtle `(you)` suffix after the username in `muted` color.

### Timeline event rendering
- [ ] Timeline events render as single-line entries in `muted` color, visually distinct from full comment blocks.
- [ ] Timeline event icon mapping: `+` (label/assignee added), `-` (label/assignee removed), `→` (state change), `↗` (referenced), `◆` (milestone change).
- [ ] Timeline event format: `icon @actor action detail — timestamp`.
- [ ] Timeline events render inline with comments in strict chronological order (sorted by `created_at`).
- [ ] Timeline events are skipped when navigating with `n/p`; only comments receive focus.

### Focus and navigation
- [ ] The currently focused comment is indicated by a left-side vertical accent bar (`│`) in `primary` color (ANSI 33).
- [ ] `n` moves focus to the next comment in the list, skipping timeline events.
- [ ] `p` moves focus to the previous comment in the list, skipping timeline events.
- [ ] `n` on the last comment does not wrap — focus stays on the last comment.
- [ ] `p` on the first comment does not wrap — focus stays on the first comment.
- [ ] When focus moves to a comment not currently visible in the viewport, the scrollbox scrolls to bring the focused comment into view.
- [ ] If there are zero comments (only timeline events or empty), `n` and `p` are no-ops.
- [ ] If there is exactly one comment, `n` and `p` are no-ops (focus stays on the single comment).
- [ ] `j/k` scrolling traverses all items (comments and timeline events) within the scrollbox.
- [ ] `G` scrolls to the bottom of the comment list; `g g` scrolls to the top of the entire issue detail view.

### Empty state
- [ ] When the issue has zero comments and zero timeline events, the comment section shows "No comments yet. Press c to add one." in `muted` text.
- [ ] The `─── Comments (0) ───` separator still renders above the empty state message.
- [ ] When the issue has zero comments but has timeline events, timeline events render without the "No comments" message.

### Pagination
- [ ] The first page of 30 items (comments + events interleaved chronologically) loads on issue detail screen mount.
- [ ] Additional pages load via cursor-based pagination when the user scrolls past 80% of loaded content in the scrollbox.
- [ ] A "Loading more…" indicator in `muted` text appears at the bottom of the list during pagination fetch.
- [ ] Pagination requests are deduplicated — rapid scrolling past 80% does not trigger multiple concurrent page fetches.
- [ ] End-of-list detection: when the API returns fewer items than the page size, pagination stops and no further fetch triggers.
- [ ] Maximum 500 total items (comments + events) loaded in memory. When capped, a warning in `warning` color (ANSI 178) shows "Showing 500 of N items. View full history on web."
- [ ] Newly loaded pages append seamlessly below existing items; scroll position is preserved.

### Boundary constraints
- [ ] Comment body: rendered up to 50,000 characters per comment. Bodies exceeding 50,000 chars are truncated with a notice: "Comment truncated. View full comment on web." in `muted` text.
- [ ] Commenter username: truncated at 39 characters with `…`.
- [ ] Relative timestamps: "just now" (<60s), "1m ago" (60–119s), "Nm ago" (2–59m), "1h ago" (60–119m), "Nh ago" (2–23h), "1d ago" (24–47h), "Nd ago" (2–30d). Absolute date "Jan 15, 2025" for items older than 30 days.
- [ ] Timeline event description: truncated at 80 characters with `…` at minimum terminal width.
- [ ] Comment count in separator: displays actual server-side `comment_count` from the issue, not the count of loaded items.
- [ ] Scrollbox virtualization: for issues with 100+ comments, the scrollbox virtualizes rendering to maintain 60fps scrolling.

### Comment author actions
- [ ] Comments authored by the current user display subtle inline indicators: `[edit]` and `[delete]` in `muted` color after the timestamp.
- [ ] These indicators are informational only within the comment list; actual edit/delete is handled by TUI_ISSUE_COMMENT_CREATE (separate feature).
- [ ] Comments not authored by the current user do not show edit/delete indicators.
- [ ] Repository admins see the `[delete]` indicator on all comments.

### Optimistic UI
- [ ] When a new comment is created (by TUI_ISSUE_COMMENT_CREATE), it appears immediately at the bottom of the comment list with a pending visual indicator (pulsing or muted-then-normal transition).
- [ ] If the server confirms the comment (201), the pending indicator is removed and the comment renders with its server-assigned ID and timestamp.
- [ ] If the server rejects the comment (4xx/5xx), the optimistic comment is removed from the list, an error toast appears in `error` color for 3 seconds, and the textarea is re-opened with the original content preserved.
- [ ] The comment count in the `─── Comments (N) ───` separator updates optimistically to N+1 on creation and reverts on failure.

### Responsive behavior
- [ ] 80×24 – 119×39 (compact): comments use minimal vertical padding (0 gap between username row and body), timestamps show short form ("2h"), comment body markdown simplified (code blocks without syntax highlighting if terminal is very narrow).
- [ ] 120×40 – 199×59 (standard): comments have 1-row gap between blocks, timestamps show "2h ago" form, full markdown rendering.
- [ ] 200×60+ (expanded): comments have generous padding, timestamps show "2 hours ago" form, wider content area.
- [ ] Terminal resize triggers synchronous re-layout of comment blocks; focused comment scroll position is preserved.
- [ ] Content width never exceeds terminal width minus 2 (for container borders).

### Performance
- [ ] First render of comments section (with data already fetched) within 50ms.
- [ ] Scrolling at 60fps for issues with up to 500 loaded items.
- [ ] `n/p` comment jump responds within 16ms (one frame).
- [ ] Pagination fetch completes within 2 seconds on standard connections.

## Design

### Layout structure

The comment list section is embedded within the issue detail view's `<scrollbox>`, positioned below the issue body and dependencies sections.

At standard terminal size (120×40):

```
├──────────────── Comments (5) ─────────────────────────────────────────────────────────────────────────────────────────┤
│ + @dave added label bug — 2h ago                                                                                     │
│                                                                                                                       │
│ │ @bob · 1h ago                                                                                                       │
│ │ I can reproduce this. The EventSource object is never closed before creating a new one.                             │
│                                                                                                                       │
│ → @alice changed state open → closed — 45m ago                                                                       │
│                                                                                                                       │
│   @carol · 30m ago · edited · [edit] [delete]                                                                         │
│   Fixed in change abc123.                                                                                             │
│                                                                                                                       │
│   @alice · 15m ago (you)                                                                                              │
│   Closing this. The fix resolves the leak.                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The `│` accent bar on the left side of a comment block indicates the currently focused comment.

### Component tree

```jsx
{/* Comments separator */}
<text fg={ANSI_BORDER}>
  {"─".repeat(separatorPadding)}
  {" Comments (" + issue.comment_count + ") "}
  {"─".repeat(remainingWidth)}
</text>

{/* Interleaved comments + timeline events */}
{timelineItems.length === 0 && issue.comment_count === 0 ? (
  <text fg={ANSI_MUTED}>No comments yet. Press c to add one.</text>
) : (
  timelineItems.map(item =>
    item.type === "comment" ? (
      <CommentBlock key={`comment-${item.id}`} comment={item} focused={item.id === focusedCommentId} isAuthor={item.user_id === currentUser.id} isAdmin={userPermission === "admin"} layout={layout} />
    ) : (
      <TimelineEvent key={`event-${item.id}`} event={item} layout={layout} />
    )
  )
)}

{loadingMore && <text fg={ANSI_MUTED}>Loading more…</text>}
{itemsCapped && <text fg={ANSI_WARNING}>Showing {MAX_ITEMS} of {totalItems} items. View full history on web.</text>}
```

### CommentBlock sub-component

```jsx
<box flexDirection="column" gap={0} marginTop={layout === "expanded" ? 2 : 1}>
  <box flexDirection="row">
    <text fg={focused ? ANSI_PRIMARY : ANSI_TRANSPARENT}>│</text>
    <box flexDirection="column" gap={0} paddingLeft={1} flexGrow={1}>
      <box flexDirection="row" gap={2}>
        <text fg={ANSI_PRIMARY} attributes={BOLD}>@{truncate(comment.commenter, 39)}</text>
        <text fg={ANSI_MUTED}>{formatTimestamp(comment.created_at, layout)}</text>
        {comment.updated_at !== comment.created_at && <text fg={ANSI_MUTED}>edited</text>}
        {comment.user_id === currentUser.id && <text fg={ANSI_MUTED}>(you)</text>}
        {(isAuthor || isAdmin) && (
          <box flexDirection="row" gap={1}>
            {isAuthor && <text fg={ANSI_MUTED}>[edit]</text>}
            <text fg={ANSI_MUTED}>[delete]</text>
          </box>
        )}
      </box>
      <markdown content={truncateBody(comment.body, 50000)} />
      {comment.body.length > 50000 && <text fg={ANSI_MUTED}>Comment truncated. View full comment on web.</text>}
    </box>
  </box>
</box>
```

### TimelineEvent sub-component

```jsx
<box flexDirection="row" gap={1} marginTop={0} paddingLeft={2}>
  <text fg={ANSI_MUTED}>{eventIcon(event.type)}</text>
  <text fg={ANSI_PRIMARY}>@{truncate(event.actor, 39)}</text>
  <text fg={ANSI_MUTED}>{truncate(eventDescription(event), layout === "compact" ? 80 : undefined)} — {formatTimestamp(event.created_at, layout)}</text>
</box>
```

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `n` | Issue detail / comment list | Jump focus to next comment (skip timeline events) |
| `p` | Issue detail / comment list | Jump focus to previous comment (skip timeline events) |
| `j` / `Down` | Issue detail / comment list | Scroll content down (all items) |
| `k` / `Up` | Issue detail / comment list | Scroll content up (all items) |
| `G` | Issue detail / comment list | Jump to bottom of comment list |
| `g g` | Issue detail | Jump to top of entire issue detail view |
| `Ctrl+D` | Issue detail / comment list | Page down within scrollbox |
| `Ctrl+U` | Issue detail / comment list | Page up within scrollbox |
| `c` | Issue detail | Open comment creation textarea (handled by TUI_ISSUE_COMMENT_CREATE) |

### Terminal resize behavior

| Width × Height | Timestamp format | Comment padding | Accent bar | Edit/delete indicators |
|----------------|------------------|----------------|------------|----------------------|
| 80×24 – 119×39 | Short: "2h" | marginTop={1}, gap={0} | Visible | Hidden (insufficient width) |
| 120×40 – 199×59 | Medium: "2h ago" | marginTop={1}, gap={0} | Visible | Visible after timestamp |
| 200×60+ | Full: "2 hours ago" | marginTop={2}, gap={0} | Visible | Visible with spacing |

### Data hooks consumed

| Hook | Source | Data |
|------|--------|------|
| `useIssueComments(owner, repo, number)` | `@codeplane/ui-core` | `{ items: IssueCommentResponse[], totalCount, loading, error, loadMore, hasMore }` |
| `useIssueEvents(owner, repo, number)` | `@codeplane/ui-core` | `{ items: IssueEventResponse[], totalCount, loading, error, loadMore, hasMore }` |
| `useUser()` | `@codeplane/ui-core` | `{ user: UserResponse }` (current user for author detection) |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler for `n`, `p` navigation |

### API endpoints consumed

| Endpoint | Hook | Pagination |
|----------|------|------------|
| `GET /api/repos/:owner/:repo/issues/:number/comments?cursor=X&limit=30` | `useIssueComments()` | Cursor-based |
| `GET /api/repos/:owner/:repo/issues/:number/events?cursor=X&limit=30` | `useIssueEvents()` | Cursor-based |

### Timeline item interleaving logic

Comments and timeline events are fetched from separate endpoints and merged client-side:

1. Both `useIssueComments()` and `useIssueEvents()` return items sorted by `created_at ASC`.
2. The merged timeline is built by interleaving both arrays by `created_at` timestamp, breaking ties by placing events before comments.
3. Each item in the merged timeline has a `type` discriminator: `"comment"` or `"event"`.
4. Pagination for each source is independent; `loadMore` triggers whichever source has the earlier next-cursor.

## Permissions & Security

### Authorization
- The comment list is visible to any user with read access to the repository. Users without access see a 404 from the parent issue detail view — the comment list is never rendered independently.
- Comment body content is rendered as-is. No XSS vector exists in the terminal context; raw ANSI escape codes in comment bodies are escaped by the `<markdown>` component, not interpreted.
- The `(you)` suffix and `[edit]`/`[delete]` indicators are based on comparing `comment.user_id` with the current authenticated user's ID. This comparison is client-side; actual edit/delete authorization is server-enforced.
- Repository admins (owner, org owner with admin role) see `[delete]` on all comments — the TUI trusts the user's permission level from the API client context.
- Private repository comments are protected by server-side access control; the TUI displays whatever the API returns.

### Token-based auth
- Authentication is handled by the `<APIClientProvider>` wrapping the TUI. The comment list does not handle, store, or display the authentication token.
- A 401 response during comment pagination triggers the global auth error: "Session expired. Run `codeplane auth login` to re-authenticate." in `error` color.
- The TUI does not retry 401 responses; the user must re-authenticate via CLI.

### Rate limiting
- Comment pagination is user-driven (scroll-triggered at 80% threshold), providing natural rate limiting.
- Pagination requests are deduplicated — the `loadMore` function is gated by a loading flag; concurrent invocations are ignored.
- The maximum of 500 items in memory caps the total number of pagination requests to ⌈500 / 30⌉ ≈ 17 requests per issue view session.
- No background polling or SSE is used for comment updates; the comment list is purely REST-driven.

### Data sensitivity
- Issue comments are user-generated content displayed as-is. No PII beyond usernames and comment content is rendered.
- The `user_id` field is used for author comparison but is never displayed to the user.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.issue_comment_list.rendered` | Comment section renders with data loaded | `owner`, `repo`, `issue_number`, `comment_count`, `event_count`, `total_items`, `terminal_width`, `terminal_height`, `layout` |
| `tui.issue_comment_list.comment_navigated` | User presses `n` or `p` to jump between comments | `direction` ("next" or "prev"), `from_comment_id`, `to_comment_id`, `comment_position`, `total_comments` |
| `tui.issue_comment_list.scrolled` | User scrolls past 50% of loaded content | `scroll_depth_percent`, `total_items_loaded`, `items_visible` |
| `tui.issue_comment_list.pagination_triggered` | Pagination fetch begins (scroll past 80%) | `page_number`, `items_loaded_before`, `source` ("comments" or "events") |
| `tui.issue_comment_list.pagination_completed` | Pagination fetch completes | `page_number`, `items_loaded_after`, `load_duration_ms`, `new_items_count` |
| `tui.issue_comment_list.items_capped` | 500-item cap reached | `total_server_items`, `items_loaded` |
| `tui.issue_comment_list.empty_state_shown` | "No comments yet" empty state rendered | `owner`, `repo`, `issue_number`, `event_count` |
| `tui.issue_comment_list.comment_truncated` | A comment body exceeds 50k chars and is truncated | `comment_id`, `original_length` |
| `tui.issue_comment_list.error` | Comment or event fetch fails | `error_type`, `status_code`, `endpoint`, `retry_count` |

### Common event properties

All comment list events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `layout`: `"compact"` | `"standard"` | `"expanded"`

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Comment section render rate | 100% | Every issue detail view successfully renders the comment section |
| Data load success rate | > 98% | At least 98% of comment list loads succeed without error |
| Comment navigation usage (`n`/`p`) | > 30% of views with 3+ comments | At least 30% of views with multiple comments use jump navigation |
| Scroll depth > 50% | > 60% of views with comments | At least 60% of views scroll past halfway through the comment list |
| Pagination trigger rate | > 50% of views with 30+ items | At least 50% of views with more than one page trigger pagination |
| Items capped rate | < 5% of views | Less than 5% of views hit the 500-item memory cap |
| Comment truncation rate | < 1% of comments | Less than 1% of comments trigger the 50k-char truncation |
| Mean time to load first page | < 800ms | First comment page renders within 800ms of issue detail mount |

## Observability

### Logging requirements

| Log level | Event | Message format |
|-----------|-------|----------------|
| `debug` | Comment list mounted | `CommentList: mounted [owner={o}] [repo={r}] [issue={n}]` |
| `debug` | Comments loaded | `CommentList: comments loaded [issue={n}] [page={p}] [count={c}] [duration={ms}ms]` |
| `debug` | Events loaded | `CommentList: events loaded [issue={n}] [page={p}] [count={c}] [duration={ms}ms]` |
| `debug` | Timeline merge completed | `CommentList: timeline merged [comments={c}] [events={e}] [total={t}]` |
| `debug` | Comment navigation | `CommentList: nav [direction={n|p}] [from={id}] [to={id}] [position={pos}]` |
| `debug` | Scroll position | `CommentList: scroll [position={pct}%] [items_visible={n}] [items_total={t}]` |
| `debug` | Focus changed | `CommentList: focus [comment_id={id}] [position={pos}]` |
| `info` | Comment section rendered | `CommentList: rendered [issue={n}] [comments={c}] [events={e}] [total_ms={ms}]` |
| `info` | Pagination triggered | `CommentList: pagination [issue={n}] [page={p}] [source={comments|events}]` |
| `info` | Items capped | `CommentList: capped [issue={n}] [loaded={500}] [total={n}]` |
| `warn` | Slow pagination | `CommentList: slow pagination [issue={n}] [page={p}] [duration={ms}ms]` (>2000ms) |
| `warn` | Comment body truncated | `CommentList: body truncated [comment_id={id}] [original_length={len}]` |
| `warn` | Large timeline merge | `CommentList: large merge [comments={c}] [events={e}] [merge_ms={ms}]` (>100ms) |
| `error` | Comments fetch failed | `CommentList: fetch failed [endpoint={ep}] [status={code}] [error={msg}]` |
| `error` | Events fetch failed | `CommentList: events fetch failed [endpoint={ep}] [status={code}] [error={msg}]` |
| `error` | Render error | `CommentList: render error [component={name}] [error={msg}]` |
| `error` | Optimistic revert | `CommentList: optimistic revert [action={add}] [error={msg}]` |

### Error cases specific to TUI

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during comment pagination | Layout re-renders; pagination continues; new items render into updated layout | Independent operations; no coordination needed |
| Terminal resize during `n/p` navigation | Focused comment ID preserved; scroll position adjusted for new layout | Automatic; no user action needed |
| SSE disconnect while viewing comments | Status bar shows disconnected; comment list is REST-based, unaffected | SSE provider handles reconnection |
| Auth token expires during pagination | Pagination request returns 401; inline error shown in comment section | User re-authenticates via CLI |
| Network timeout on comment pagination | "Failed to load more comments" in `error` color at bottom of list with retry hint | User scrolls again to trigger retry, or presses `R` |
| Server returns empty page (premature end) | Treated as end-of-list; pagination stops | Normal behavior |
| Malformed markdown in comment body | `<markdown>` renders best-effort; falls back to plain text for the affected comment | No user action needed |
| Comment body with raw ANSI escape codes | Escaped by `<markdown>` component, not interpreted as terminal sequences | No action needed |
| Unicode/emoji in comment body | Rendered by terminal with width calculated using Unicode grapheme cluster width | No action needed |
| Rapid `n/p` key repeats | Synchronous focus movement; scroll animation debounced at 16ms | No user action needed |
| Comment created optimistically then rejected | Comment removed from list; error toast shown; textarea re-opens with content | User can retry submission |
| 500+ comments trigger memory cap | Loading stops at 500; notice shown | User views full history on web |
| Both comments and events endpoints fail | Comment section shows "Failed to load comments and timeline" with retry | User presses `R` to retry |
| Comments load but events endpoint fails | Comments render without timeline events; inline warning shows "Timeline events unavailable" | Degraded but functional |
| Events load but comments endpoint fails | Timeline events render; comment section shows "Failed to load comments" with retry | User presses `R` to retry comments |
| Server returns duplicate items across pages | Items deduplicated by `(type, id)` tuple; duplicates silently dropped | Transparent to user |

### Failure modes and recovery

- **Comment section crash**: Caught by the comment section error boundary. Issue header and body remain visible. Comment section shows "Comment rendering error — press R to retry" in `error` color.
- **Single comment render crash**: Individual comment bodies that fail to render via `<markdown>` fall back to plain text. Other comments are unaffected.
- **Timeline merge failure**: If the merge of comments and events produces an error, the section falls back to showing comments only (events omitted) with a warning.
- **All API requests fail simultaneously**: Comment section shows inline error. The issue header and body (from `useIssue()`) may still be visible if that request succeeded. Go-to mode and command palette remain available.
- **Memory pressure from large issue**: Virtualized rendering for 100+ comments caps DOM nodes. The 500-item hard limit prevents unbounded growth.

## Verification

### Terminal snapshot tests

```
SNAP-COMMENT-LIST-001: Comment list renders with 3 comments at 120x40
  → Navigate to issue with 3 comments, no timeline events
  → Assert comment section with separator, 3 comment blocks with @username, timestamp, body

SNAP-COMMENT-LIST-002: Comment list renders with interleaved timeline events at 120x40
  → Navigate to issue with 2 comments and 3 timeline events
  → Assert chronological interleaving, comments as blocks, events as single lines

SNAP-COMMENT-LIST-003: Comment list at 80x24 compact layout
  → Navigate to issue with 3 comments at 80x24
  → Assert compact timestamps, minimal padding, wrapped comment bodies

SNAP-COMMENT-LIST-004: Comment list at 200x60 expanded layout
  → Navigate to issue with 3 comments at 200x60
  → Assert full timestamps, generous padding, wide content area

SNAP-COMMENT-LIST-005: Focused comment with accent bar
  → Navigate to issue with 3 comments → Press n
  → Assert first comment has left-side │ accent bar in primary color

SNAP-COMMENT-LIST-006: Empty comments state
  → Navigate to issue with 0 comments and 0 events
  → Assert "No comments yet. Press c to add one." in muted text

SNAP-COMMENT-LIST-007: Zero comments but has timeline events
  → Navigate to issue with 0 comments and 2 timeline events
  → Assert timeline events render, no "No comments" message

SNAP-COMMENT-LIST-008: Comment separator with count
  → Navigate to issue with 5 comments
  → Assert separator reads "─── Comments (5) ───"

SNAP-COMMENT-LIST-009: Comment with markdown body (code block, list, bold)
  → Navigate to issue with comment containing markdown
  → Assert syntax-highlighted code block, bullet list, bold text rendered

SNAP-COMMENT-LIST-010: Comment with "edited" indicator
  → Navigate to issue with comment where updated_at differs from created_at
  → Assert "edited" text appears after timestamp in muted color

SNAP-COMMENT-LIST-011: Comment authored by current user shows "(you)"
  → Navigate to issue with comment from the current authenticated user
  → Assert "(you)" suffix in muted color after username

SNAP-COMMENT-LIST-012: Comment with edit/delete indicators for author
  → Navigate to issue where current user authored a comment at 120x40
  → Assert [edit] and [delete] indicators in muted color

SNAP-COMMENT-LIST-013: Admin sees delete indicator on other users' comments
  → Navigate as admin to issue with comments from other users
  → Assert [delete] indicator on all comments

SNAP-COMMENT-LIST-014: Edit/delete indicators hidden at 80x24
  → Navigate as comment author to issue at 80x24
  → Assert [edit] and [delete] indicators not rendered (insufficient width)

SNAP-COMMENT-LIST-015: Timeline event icons
  → Navigate to issue with label-added (+), assignee-removed (-), state-changed (→), referenced (↗), milestone (◆) events
  → Assert each event renders with correct icon prefix

SNAP-COMMENT-LIST-016: Loading more indicator
  → Navigate to issue with 50 comments → Scroll past 80%
  → Assert "Loading more…" indicator at bottom of list

SNAP-COMMENT-LIST-017: Items capped notice
  → Navigate to issue with 600+ items → Load until 500-item cap
  → Assert "Showing 500 of N items. View full history on web." in warning color

SNAP-COMMENT-LIST-018: Optimistic comment with pending indicator
  → Create a comment (mock slow API response)
  → Assert new comment appears at bottom with pending visual style

SNAP-COMMENT-LIST-019: Comment body truncation notice
  → Navigate to issue with comment body exceeding 50,000 characters
  → Assert truncated body with "Comment truncated. View full comment on web."

SNAP-COMMENT-LIST-020: Comment error state (comments failed, issue loaded)
  → Mock comment API returning 500, issue API returns 200
  → Assert issue header/body visible, comment section shows error with retry hint

SNAP-COMMENT-LIST-021: Long username truncation
  → Navigate to issue with comment from user with 45-character username
  → Assert username truncated at 39 characters with …

SNAP-COMMENT-LIST-022: Relative vs absolute timestamps
  → Navigate to issue with comments from 5 minutes ago and 60 days ago
  → Assert "5m ago" for recent, "Jan 20, 2026" for old comment

SNAP-COMMENT-LIST-023: Timeline event description truncation at 80x24
  → Navigate to issue with long timeline event description at 80x24
  → Assert description truncated at 80 characters with …
```

### Keyboard interaction tests

```
KEY-COMMENT-LIST-001: n jumps to next comment (skips events)
  → Issue with: event, comment1, event, comment2 → n → Assert focused on comment1 → n → Assert focused on comment2

KEY-COMMENT-LIST-002: p jumps to previous comment (skips events)
  → Issue with comment1, event, comment2 → focus on comment2 → p → Assert focused on comment1

KEY-COMMENT-LIST-003: n on last comment stays (no wrap)
  → Issue with 2 comments → n n n → Assert focused on second comment

KEY-COMMENT-LIST-004: p on first comment stays (no wrap)
  → Issue with 2 comments → n → p p → Assert focused on first comment

KEY-COMMENT-LIST-005: n/p no-ops with zero comments
  → Issue with 0 comments, 2 events → n → Assert no focus change → p → Assert no focus change

KEY-COMMENT-LIST-006: n/p no-ops with exactly one comment
  → Issue with 1 comment → n → Assert focus stays on single comment → p → Assert same

KEY-COMMENT-LIST-007: j/k scrolls through all items including events
  → Issue with event, comment, event, comment → j j j j → Assert scrolled through all items

KEY-COMMENT-LIST-008: G scrolls to bottom of comment list
  → Issue with 20 comments → G → Assert scrolled to bottom, last comments visible

KEY-COMMENT-LIST-009: n scrolls focused comment into viewport
  → Issue with 30 comments → n (15 times) → Assert viewport scrolled to show comment 15

KEY-COMMENT-LIST-010: Ctrl+D pages down within comment list
  → Issue with 40 comments → Ctrl+D → Assert paged down approximately one screen height

KEY-COMMENT-LIST-011: Ctrl+U pages up within comment list
  → Issue with 40 comments → Ctrl+D Ctrl+D → Ctrl+U → Assert paged up one screen height

KEY-COMMENT-LIST-012: Rapid n key presses (10 in 200ms)
  → Issue with 15 comments → Rapid n×10 → Assert focus on comment 10, no dropped inputs

KEY-COMMENT-LIST-013: Rapid p key presses (10 in 200ms)
  → Issue with 15 comments → n×14 → Rapid p×10 → Assert focus on comment 5, no dropped inputs

KEY-COMMENT-LIST-014: n triggers pagination when approaching end
  → Issue with 35 comments (page 1 = 30) → n×25 → Assert scrolled past 80% → Assert page 2 loads

KEY-COMMENT-LIST-015: Scroll past 80% triggers pagination
  → Issue with 50 comments → Scroll with j until past 80% → Assert pagination fetch begins → Assert new comments append
```

### Responsive resize tests

```
RESIZE-COMMENT-LIST-001: 120x40 → 80x24 collapses timestamps
  → Assert "2h ago" timestamps → Resize to 80x24 → Assert "2h" compact timestamps

RESIZE-COMMENT-LIST-002: 80x24 → 120x40 expands timestamps
  → Assert "2h" timestamps → Resize to 120x40 → Assert "2h ago" timestamps

RESIZE-COMMENT-LIST-003: 120x40 → 200x60 expands to full timestamps
  → Assert "2h ago" → Resize to 200x60 → Assert "2 hours ago"

RESIZE-COMMENT-LIST-004: Focused comment preserved through resize
  → Focus on comment 5 → Resize 120x40 → 80x24 → Assert comment 5 still focused and visible

RESIZE-COMMENT-LIST-005: Comment body re-wraps on width change
  → Long comment body at 200 cols (2 lines) → Resize to 80 (5 lines) → Assert clean rewrap

RESIZE-COMMENT-LIST-006: Edit/delete indicators hidden at compact size
  → At 120x40 assert [edit] [delete] visible → Resize to 80x24 → Assert indicators hidden

RESIZE-COMMENT-LIST-007: Rapid resize (120→80→200→100→150) produces clean layout
  → Issue with 10 comments → Resize rapidly through 5 sizes → Assert clean layout at final 150x45

RESIZE-COMMENT-LIST-008: Timeline events re-truncate on width change
  → Long event description at 200 cols (full) → Resize to 80 → Assert truncated at 80 chars with …
```

### Data loading and pagination tests

```
DATA-COMMENT-LIST-001: Comments and events load concurrently on mount
  → Assert GET /comments and GET /events requests fire in same frame

DATA-COMMENT-LIST-002: Timeline items merge in chronological order
  → Comments at t1, t3, t5 + Events at t2, t4 → Assert rendered as t1, t2, t3, t4, t5

DATA-COMMENT-LIST-003: Pagination loads next page at 80% scroll depth
  → Issue with 50 comments → Scroll to 80% → Assert page 2 request fired → Assert items appended

DATA-COMMENT-LIST-004: Pagination deduplication (no concurrent requests)
  → Scroll rapidly past 80% multiple times → Assert only one pagination request in flight

DATA-COMMENT-LIST-005: Pagination stops when server returns fewer than page size
  → Issue with 45 comments → Load page 1 (30) → Load page 2 (15) → Scroll → Assert no page 3 request

DATA-COMMENT-LIST-006: 500-item cap stops pagination
  → Issue with 600 comments+events → Load pages until 500 → Assert pagination stops → Assert cap notice

DATA-COMMENT-LIST-007: Empty comments page treated as end-of-list
  → Server returns empty page → Assert pagination stops, no error

DATA-COMMENT-LIST-008: 401 during pagination shows auth error
  → Load page 1 successfully → Token expires → Scroll to paginate → Assert auth error displayed

DATA-COMMENT-LIST-009: 500 during pagination shows inline error
  → Load page 1 → Server returns 500 on page 2 → Assert "Failed to load more comments" inline

DATA-COMMENT-LIST-010: Comments load but events fail (degraded mode)
  → Mock events endpoint returning 500 → Assert comments render → Assert "Timeline events unavailable" warning

DATA-COMMENT-LIST-011: Events load but comments fail
  → Mock comments endpoint returning 500 → Assert events render → Assert "Failed to load comments" error with retry

DATA-COMMENT-LIST-012: Optimistic comment persists on server success
  → Create comment → API returns 201 → Assert comment in list with server ID, pending indicator removed

DATA-COMMENT-LIST-013: Optimistic comment reverts on server failure
  → Create comment → API returns 500 → Assert comment removed → Assert error toast → Assert comment count reverts

DATA-COMMENT-LIST-014: Duplicate items across pages deduplicated
  → Page 1 and page 2 return overlapping item → Assert item appears only once

DATA-COMMENT-LIST-015: Comment count in separator matches issue.comment_count
  → Issue with comment_count=5, 3 comments loaded so far → Assert separator shows "Comments (5)" not "Comments (3)"
```

### Edge case tests

```
EDGE-COMMENT-LIST-001: Comment body with 50k+ characters → truncated with notice
EDGE-COMMENT-LIST-002: Comment body with 0 characters (empty string) → renders with empty body, username and timestamp still visible
EDGE-COMMENT-LIST-003: Unicode/emoji in comment body → no terminal corruption, correct width calculation
EDGE-COMMENT-LIST-004: Comment body with raw ANSI escape codes → escaped, not interpreted as terminal sequences
EDGE-COMMENT-LIST-005: Comment body with deeply nested markdown lists (10+ levels) → renders without crash, nesting truncated
EDGE-COMMENT-LIST-006: Comment body containing only whitespace → renders as empty body
EDGE-COMMENT-LIST-007: Comment body with extremely long single line (10k+ chars) → wraps correctly at terminal width
EDGE-COMMENT-LIST-008: Commenter username at exactly 39 characters → renders without truncation
EDGE-COMMENT-LIST-009: Commenter username at 40+ characters → truncated at 39 with …
EDGE-COMMENT-LIST-010: Issue with 1 comment and 0 events → single comment renders, no empty state message
EDGE-COMMENT-LIST-011: Issue with 0 comments and 0 events → empty state message shown
EDGE-COMMENT-LIST-012: Issue with 0 comments and 5 events → events render, no "No comments" message
EDGE-COMMENT-LIST-013: Comment with created_at in the future → rendered without crash, shows "just now"
EDGE-COMMENT-LIST-014: Timeline event with unknown type → renders as generic event with `?` icon
EDGE-COMMENT-LIST-015: Comments and events with identical timestamps → events sort before comments (stable sort)
EDGE-COMMENT-LIST-016: Terminal with NO_COLOR environment variable → accent bars and indicators render with bold/underline instead of color
EDGE-COMMENT-LIST-017: Terminal with 16-color support only → all color tokens fall back to nearest 16-color equivalent
EDGE-COMMENT-LIST-018: Concurrent resize + n/p navigation → focus preserved, scroll position adjusted
EDGE-COMMENT-LIST-019: Comment section error boundary triggers → issue header and body remain visible, error message in comment section
EDGE-COMMENT-LIST-020: Issue deleted while scrolling through comments → next pagination returns 404, shows "Issue no longer exists"
```
