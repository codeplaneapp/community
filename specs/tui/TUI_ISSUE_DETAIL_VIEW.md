# TUI_ISSUE_DETAIL_VIEW

Specification for TUI_ISSUE_DETAIL_VIEW.

## High-Level User POV

The issue detail view is the screen a developer sees after selecting an issue from the issue list or navigating directly via the command palette (`:issue 42`) or deep link (`codeplane tui --screen issues --repo owner/repo --issue 42`). It is a single, vertically scrollable screen that shows everything about an issue: its title, state, metadata, body, timeline of events, and comments — all rendered in a dense, keyboard-navigable layout optimized for reading and acting on issues without leaving the terminal.

The screen opens with the issue title prominently displayed at the top in bold text, followed by a state badge — a colored pill showing "open" in green or "closed" in red. Immediately below the title line, a metadata row shows the author's username, creation timestamp, and comment count. Below the metadata, a second row displays assigned labels as colored inline badges (using each label's hex color mapped to the nearest ANSI 256 value) and the list of assignees as linked usernames. If a milestone is attached, it appears at the end of the metadata block.

The body of the issue is rendered using OpenTUI's `<markdown>` component, supporting headings, lists, code blocks with syntax highlighting, bold, italic, links (shown as underlined text with the URL visible), and blockquotes. For issues with long bodies, the content is fully scrollable. An empty body shows "No description provided." in muted text.

Below the body, a horizontal separator introduces the comments and timeline section. Comments are rendered chronologically, each showing the commenter's username, a relative timestamp, and the comment body (also rendered as markdown). Between comments, timeline events — such as label additions, assignee changes, state transitions, and cross-references — are rendered as compact single-line entries with a muted icon and description. The comment/timeline section is paginated: the first page of 30 items loads on screen open, and additional pages load as the user scrolls toward the bottom.

Navigation within the detail view uses `j/k` to scroll the content vertically. The user can jump between comments with `n` (next comment) and `p` (previous comment), skipping over timeline events for fast reading. Pressing `c` opens the comment creation form — a `<textarea>` that appears at the bottom of the screen. `e` opens the issue edit form (title, body, labels, assignees, milestone). `o` toggles the issue open/closed, applying the change optimistically and showing a brief confirmation. `q` pops back to the issue list.

At the minimum 80x24 terminal size, the metadata row collapses to show only the state badge and author. Labels and assignees move to a second line or are hidden behind a "show more" toggle (`m`). At 120x40, the full metadata row is visible. At 200x60, wider content renders with more generous padding and longer timestamps.

The breadcrumb in the header bar shows the full navigation path: `Dashboard > owner/repo > Issues > #42`. The status bar shows context-sensitive keybinding hints for the detail view.

## Acceptance Criteria

### Screen lifecycle
- [ ] The issue detail view is pushed onto the navigation stack when the user presses `Enter` on an issue in the issue list.
- [ ] The issue detail view is pushed when the user navigates via the command palette (`:issue N` or `:issue owner/repo#N`).
- [ ] The issue detail view is pushed when the TUI launches with `--screen issues --repo owner/repo --issue N`.
- [ ] Pressing `q` pops the issue detail view and returns to the previous screen (issue list or wherever the user came from).
- [ ] The breadcrumb displays `… > Issues > #N` where N is the issue number.
- [ ] The screen title in the navigation stack entry is `Issue #N: <truncated title>` (title truncated to 40 characters).

### Issue header
- [ ] The issue title renders in bold text, full width, wrapping to multiple lines if necessary.
- [ ] The issue title is never truncated on the detail screen — it wraps within the available width.
- [ ] The state badge renders immediately after or below the title: `[open]` in `success` color (ANSI 34) or `[closed]` in `error` color (ANSI 196).
- [ ] The state badge uses square brackets and text, not background color, for accessibility on 16-color terminals.
- [ ] If the issue is closed, the `closed_at` timestamp is displayed next to the state badge in `muted` color.

### Metadata row
- [ ] The author's username renders as `@username` in `primary` color (ANSI 33).
- [ ] The creation timestamp renders as a relative time in `muted` color (ANSI 245): "just now", "5m ago", "2h ago", "3d ago", "Jan 15, 2025".
- [ ] The comment count renders as `N comments` in `muted` color, or `No comments` if zero.
- [ ] The `updated_at` timestamp renders when different from `created_at`, as "updated 2h ago" in `muted` color.

### Labels
- [ ] Each label renders as `[label-name]` with text color derived from the label's hex `color` field mapped to the nearest ANSI 256 color.
- [ ] Labels are displayed inline, separated by a single space.
- [ ] When labels exceed the available width, they wrap to the next line.
- [ ] An issue with no labels shows nothing in the label row (the row is omitted, not "No labels").
- [ ] Labels that contain special characters or Unicode render correctly without terminal corruption.
- [ ] Label names are truncated at 30 characters with `…` if they exceed that length.

### Assignees
- [ ] Each assignee renders as `@username` in `primary` color (ANSI 33), separated by commas.
- [ ] An issue with no assignees shows nothing in the assignee row (the row is omitted).
- [ ] Assignee list truncates at 5 names with `+N more` suffix at minimum terminal width.

### Milestone
- [ ] If a milestone is associated, it renders as `Milestone: milestone-name` in `muted` color.
- [ ] If no milestone, the milestone row is omitted.

### Issue body
- [ ] The issue body is rendered using `<markdown>` with full markdown support: headings, lists, code blocks (syntax highlighted), bold, italic, links, blockquotes, horizontal rules, and tables.
- [ ] Code blocks render with `<code>` syntax highlighting inside the `<markdown>` component.
- [ ] Links render as underlined text; the URL is shown inline in `muted` color.
- [ ] An empty or null body renders "No description provided." in `muted` italic text.
- [ ] The body is contained within a `<scrollbox>` and scrollable independently when focused.
- [ ] Body text wraps at the available width — no horizontal scrolling.
- [ ] Maximum body rendering length: 100,000 characters. Bodies exceeding this show a truncation notice: "Body truncated. View full issue on web."

### Comments and timeline
- [ ] Comments render chronologically (oldest first) below a `─── Comments ───` separator.
- [ ] Each comment shows: `@username` in `primary` color, relative timestamp in `muted` color, then the comment body rendered as `<markdown>`.
- [ ] Comments are visually separated by a blank line.
- [ ] Timeline events (label added/removed, assignee added/removed, state changed, milestone changed, referenced) render as single-line entries in `muted` color with an icon prefix.
- [ ] Timeline event icons: `+` (added), `-` (removed), `→` (state change), `↗` (referenced), `◆` (milestone).
- [ ] Timeline event format: `icon @actor action detail — timestamp`.
- [ ] The first page of 30 items (comments + events interleaved) loads on screen open.
- [ ] Additional pages load via cursor-based pagination when the user scrolls past 80% of loaded content.
- [ ] A "Loading more…" indicator appears at the bottom during pagination fetch.
- [ ] The comment/timeline section shows "No comments yet. Press c to add one." in `muted` text when the issue has zero comments and zero timeline events.

### Dependencies
- [ ] If the issue has dependencies, a "Dependencies" section renders between the body and comments.
- [ ] Dependencies show as a list: `Depends on #N: title` for each dependency.
- [ ] Dependents show as a list: `Blocks #N: title` for each dependent.
- [ ] Pressing `Enter` on a dependency navigates to that issue's detail view.
- [ ] If no dependencies exist, the dependencies section is omitted.

### Data loading
- [ ] The issue detail data loads from `useIssue(owner, repo, number)` on mount.
- [ ] Comments load from `useIssueComments(owner, repo, number)` on mount.
- [ ] Timeline events load from `useIssueEvents(owner, repo, number)` on mount.
- [ ] Dependencies load from `useIssueDependencies(owner, repo, number)` on mount.
- [ ] All four requests fire concurrently.
- [ ] A full-screen loading spinner with "Loading issue #N…" appears during the initial fetch.
- [ ] If the issue fetch fails with 404, the screen shows "Issue #N not found" in `error` color with "Press q to go back".
- [ ] If the issue fetch fails with a network error, the screen shows "Failed to load issue" in `error` color with "Press R to retry".
- [ ] Comment and timeline fetch failures show inline errors within their sections, not full-screen errors.
- [ ] Successful issue data is cached for 30 seconds; re-navigating within that window shows cached data instantly.

### Boundary constraints
- [ ] Issue title: no max length (wraps freely), but the screen always renders the state badge.
- [ ] Issue body: rendered up to 100,000 characters; truncated with notice beyond that.
- [ ] Comment body: rendered up to 50,000 characters per comment; truncated with notice beyond that.
- [ ] Label name: truncated at 30 characters with `…`.
- [ ] Username: truncated at 39 characters (GitHub max) with `…`.
- [ ] Maximum 500 comments+events loaded (memory cap); shows "Showing 500 of N items" notice.
- [ ] Relative timestamps switch to absolute dates for items older than 30 days: "Jan 15, 2025".
- [ ] Scrollbox content height: virtualized rendering for issues with 100+ comments.

### Responsive behavior
- [ ] 80x24: compact layout — title wraps, metadata on multiple lines, labels collapsed behind `m` toggle, comments use minimal padding.
- [ ] 120x40: standard layout — full metadata row, labels inline, comfortable comment spacing.
- [ ] 200x60: expanded layout — wider content area, more context visible, full timestamps.
- [ ] Below 80x24: "Terminal too small" message replaces the screen.
- [ ] Resize triggers synchronous re-layout; scroll position preserved.
- [ ] Content width never exceeds terminal width minus 2 (for borders).

### Performance
- [ ] First render with cached data within 50ms.
- [ ] First render with fetch shows spinner within 200ms.
- [ ] Scrolling at 60fps for issues with up to 500 comments.
- [ ] Comment pagination fetch completes within 2 seconds on standard connections.
- [ ] Keyboard input response within 16ms.

## Design

### Layout structure

At standard terminal size (120x40), after subtracting header (1 row) and status bar (1 row), the content area is 38 rows x 120 columns:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Fix memory leak in SSE reconnection handler                                                               [open]   │
│ @alice · opened 2h ago · updated 30m ago · 5 comments                                                              │
│ [bug] [priority:high]                                              Assignees: @bob, @carol                          │
│ Milestone: v2.1                                                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                      │
│ ## Problem                                                                                                           │
│                                                                                                                      │
│ The SSE reconnection handler leaks memory when the connection drops and reconnects rapidly. Each                     │
│ reconnection allocates a new event listener without cleaning up the previous one.                                    │
│                                                                                                                      │
│ ```typescript                                                                                                        │
│ // Leaking listener here                                                                                             │
│ eventSource.addEventListener('message', handler)                                                                     │
│ ```                                                                                                                  │
│                                                                                                                      │
├──────────────── Dependencies ────────────────────────────────────────────────────────────────────────────────────────┤
│ Depends on #38: Refactor SSE connection manager                                                                      │
│ Blocks #45: Release v2.1                                                                                             │
├──────────────── Comments (5) ────────────────────────────────────────────────────────────────────────────────────────┤
│ + @dave added label bug — 2h ago                                                                                     │
│                                                                                                                      │
│ @bob · 1h ago                                                                                                        │
│ I can reproduce this. The EventSource object is never closed before creating a new one.                              │
│                                                                                                                      │
│ → @alice changed state open → closed — 30m ago                                                                       │
│                                                                                                                      │
│ @carol · 25m ago                                                                                                     │
│ Fixed in change abc123. The cleanup function now calls `eventSource.close()` before reconnecting.                    │
│                                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

At minimum terminal size (80x24):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Fix memory leak in SSE reconnection                                         │
│ handler                                                          [open]     │
│ @alice · 2h ago · 5 comments                              m:metadata        │
├──────────────────────────────────────────────────────────────────────────────┤
│ ## Problem                                                                   │
│                                                                              │
│ The SSE reconnection handler leaks memory when the                           │
│ connection drops and reconnects rapidly...                                   │
│                                                                              │
├──────────── Comments (5) ───────────────────────────────────────────────────┤
│ @bob · 1h ago                                                                │
│ I can reproduce this. The EventSource object is                              │
│ never closed before creating a new one.                                      │
│                                                                              │
│ @carol · 25m ago                                                             │
│ Fixed in change abc123.                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component tree

```jsx
<box flexDirection="column" width="100%" height="100%">
  {/* Issue header */}
  <box flexDirection="column" paddingX={1} gap={0}>
    <box flexDirection="row" justifyContent="space-between">
      <text attributes={BOLD} wrap="wrap">{issue.title}</text>
      <text fg={issue.state === "open" ? ANSI_SUCCESS : ANSI_ERROR} attributes={BOLD}>[{issue.state}]</text>
    </box>
    <box flexDirection="row" gap={2}>
      <text fg={ANSI_PRIMARY}>@{issue.author.login}</text>
      <text fg={ANSI_MUTED}>opened {relativeTime(issue.created_at)}</text>
      {issue.updated_at !== issue.created_at && <text fg={ANSI_MUTED}>updated {relativeTime(issue.updated_at)}</text>}
      <text fg={ANSI_MUTED}>{issue.comment_count} comments</text>
    </box>
    {issue.labels.length > 0 && (
      <box flexDirection="row" gap={1} wrap="wrap">
        {issue.labels.map(label => <text key={label.id} fg={nearestAnsi256(label.color)}>[{truncate(label.name, 30)}]</text>)}
      </box>
    )}
    <box flexDirection="row" justifyContent="space-between">
      {issue.assignees.length > 0 && (
        <box flexDirection="row"><text fg={ANSI_MUTED}>Assignees: </text>{issue.assignees.map((a, i) => <text key={a.id} fg={ANSI_PRIMARY}>@{a.login}{i < issue.assignees.length - 1 ? ", " : ""}</text>)}</box>
      )}
      {issue.milestone_id && <text fg={ANSI_MUTED}>Milestone: {milestone.name}</text>}
    </box>
  </box>
  <scrollbox flexGrow={1} paddingX={1}>
    <box flexDirection="column" gap={1}>
      {issue.body ? <markdown content={truncateBody(issue.body, 100000)} /> : <text fg={ANSI_MUTED} attributes={ITALIC}>No description provided.</text>}
    </box>
    {(dependencies.length > 0 || dependents.length > 0) && (
      <box flexDirection="column">
        <text fg={ANSI_BORDER}>──── Dependencies ────</text>
        {dependencies.map(dep => <DependencyRow key={dep.number} issue={dep} type="depends_on" focused={dep.number === focusedDep} />)}
        {dependents.map(dep => <DependencyRow key={dep.number} issue={dep} type="blocks" focused={dep.number === focusedDep} />)}
      </box>
    )}
    <text fg={ANSI_BORDER}>──── Comments ({issue.comment_count}) ────</text>
    {timelineItems.length === 0 ? <text fg={ANSI_MUTED}>No comments yet. Press c to add one.</text> : timelineItems.map(item => item.type === "comment" ? <CommentBlock key={item.id} comment={item} focused={item.id === focusedCommentId} /> : <TimelineEvent key={item.id} event={item} />)}
    {loadingMore && <text fg={ANSI_MUTED}>Loading more…</text>}
  </scrollbox>
</box>
```

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `j` / `Down` | Detail view | Scroll down |
| `k` / `Up` | Detail view | Scroll up |
| `G` | Detail view | Jump to bottom of content |
| `g g` | Detail view | Jump to top of content |
| `Ctrl+D` | Detail view | Page down |
| `Ctrl+U` | Detail view | Page up |
| `n` | Detail view | Jump to next comment (skip timeline events) |
| `p` | Detail view | Jump to previous comment (skip timeline events) |
| `c` | Detail view | Open comment creation textarea |
| `e` | Detail view (with write access) | Open issue edit form |
| `o` | Detail view (with write access) | Toggle issue open/closed |
| `l` | Detail view (with write access) | Open label picker |
| `a` | Detail view (with write access) | Open assignee picker |
| `m` | Detail view (80x24) | Toggle expanded metadata display |
| `Enter` | Dependency focused | Navigate to dependency issue detail |
| `R` | Error state | Retry failed data fetch |
| `q` | Detail view | Pop back to previous screen |
| `Esc` | Overlay open | Close overlay |
| `Ctrl+S` | Comment textarea | Submit comment |
| `Esc` | Comment textarea | Cancel comment (with confirmation if content entered) |
| `?` | Detail view | Show help overlay with all keybindings |
| `:` | Detail view | Open command palette |

### Status bar hints

`j/k:scroll  n/p:comment  c:comment  e:edit  o:close  q:back`

### Terminal resize behavior

| Width x Height | Layout | Metadata | Labels | Timestamps | Comments |
|----------------|--------|----------|--------|-----------|----------|
| 80x24 – 119x39 | Compact | Author + state only; `m` toggles full | Hidden (toggle with `m`) | Compact ("2h") | Minimal padding |
| 120x40 – 199x59 | Standard | Full row: author, timestamps, comments | Inline | Compact ("2h ago") | Standard spacing |
| 200x60+ | Expanded | Full row with extra padding | Inline with descriptions | Full ("2 hours ago") | Generous spacing |

### Data hooks consumed

| Hook | Source | Data |
|------|--------|------|
| `useIssue(owner, repo, number)` | `@codeplane/ui-core` | `{ issue: IssueResponse, loading, error, refetch }` |
| `useIssueComments(owner, repo, number)` | `@codeplane/ui-core` | `{ items: IssueCommentResponse[], totalCount, loading, error, loadMore }` |
| `useIssueEvents(owner, repo, number)` | `@codeplane/ui-core` | `{ items: IssueEventResponse[], totalCount, loading, error, loadMore }` |
| `useIssueDependencies(owner, repo, number)` | `@codeplane/ui-core` | `{ dependencies: IssueSummary[], dependents: IssueSummary[], loading, error }` |
| `useUpdateIssue(owner, repo, number)` | `@codeplane/ui-core` | `{ mutate, loading, error }` |
| `useCreateIssueComment(owner, repo, number)` | `@codeplane/ui-core` | `{ mutate, loading, error }` |
| `useLabels(owner, repo)` | `@codeplane/ui-core` | `{ items: LabelSummary[], loading, error }` |
| `useCollaborators(owner, repo)` | `@codeplane/ui-core` | `{ items: UserSummary[], loading, error }` |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler |
| `useNavigation()` | local TUI | `{ push, pop, goTo }` |
| `useStatusBarHints()` | local TUI | Detail view keybinding hints |

### API endpoints consumed

| Endpoint | Hook |
|----------|------|
| `GET /api/repos/:owner/:repo/issues/:number` | `useIssue()` |
| `GET /api/repos/:owner/:repo/issues/:number/comments?page=N&per_page=30` | `useIssueComments()` |
| `GET /api/repos/:owner/:repo/issues/:number/events?page=N&per_page=30` | `useIssueEvents()` |
| `GET /api/repos/:owner/:repo/issues/:number/dependencies` | `useIssueDependencies()` |
| `PATCH /api/repos/:owner/:repo/issues/:number` | `useUpdateIssue()` |
| `POST /api/repos/:owner/:repo/issues/:number/comments` | `useCreateIssueComment()` |
| `GET /api/repos/:owner/:repo/labels` | `useLabels()` |
| `GET /api/repos/:owner/:repo/collaborators` | `useCollaborators()` |

### Optimistic UI

- **Close/reopen**: State badge changes immediately; reverts on server error with inline error toast.
- **Add comment**: New comment appends to the list immediately with a pending indicator; replaced with server response on success; removed with error toast on failure.
- **Label add/remove**: Labels update inline immediately; revert on server error.
- **Assignee add/remove**: Assignee list updates inline immediately; revert on server error.

## Permissions & Security

### Authorization
- The issue detail view requires read access to the repository. Users without repository access will see a 404 error (server-side enforcement, not client-side gating).
- Write actions (`e` edit, `o` close/reopen, `c` comment, `l` labels, `a` assignees) are available only to users with write access to the repository (repository owner, organization owner with appropriate role, team member with write permission, or collaborator).
- The TUI does not render keybinding hints for write actions (`e`, `o`, `l`, `a`) when the user lacks write access. The `c` comment key is visible to all authenticated users (any authenticated user can comment on a public repo issue; private repo access is server-enforced).
- If a write action is attempted without permission, the server returns 403 and the TUI shows "Permission denied" in `error` color as an inline toast that auto-dismisses after 3 seconds.
- Comment editing and deletion are restricted to the comment author or repository admin. The TUI shows an `x` (delete) and `e` (edit) indicator on comments authored by the current user.

### Token-based auth
- The TUI authenticates via token stored in CLI keychain (from `codeplane auth login`) or `CODEPLANE_TOKEN` environment variable.
- The issue detail view does not handle, store, or display the authentication token. It is injected by the `<APIClientProvider>`.
- A 401 response during any issue detail API call triggers the auth error display: "Session expired. Run `codeplane auth login` to re-authenticate." in `error` color.
- The TUI does not retry 401s; the user must re-authenticate via CLI.

### Rate limiting
- The issue detail view makes 4 concurrent API requests on mount (issue + comments + events + dependencies). This burst is within standard API rate limits.
- Pagination requests are user-driven (scroll-triggered), providing natural rate limiting.
- Write actions (comment, edit, close/reopen) are debounced: the TUI disables the action key while a mutation is in flight (the submit button shows a spinner).
- The label picker and assignee picker fetch their data lazily (on first open, not on mount) to reduce initial request count.

### Data sensitivity
- Issue titles, bodies, and comments are user-generated content displayed as-is. No XSS vector exists in the terminal context.
- Private repository issue content is protected by server-side access control; the TUI trusts the API response.
- No PII beyond usernames and issue content is rendered.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.issue_detail.viewed` | Issue detail screen renders with data loaded | `owner`, `repo`, `issue_number`, `issue_state`, `comment_count`, `label_count`, `assignee_count`, `has_milestone`, `has_dependencies`, `body_length`, `terminal_width`, `terminal_height` |
| `tui.issue_detail.comment_navigated` | User presses `n` or `p` to jump between comments | `direction` ("next" or "prev"), `comment_position`, `total_comments` |
| `tui.issue_detail.scrolled` | User scrolls to bottom 20% of content | `scroll_depth_percent`, `total_items_loaded` |
| `tui.issue_detail.comment_created` | User submits a new comment | `owner`, `repo`, `issue_number`, `comment_body_length`, `time_to_submit_ms` |
| `tui.issue_detail.state_toggled` | User presses `o` to close/reopen | `owner`, `repo`, `issue_number`, `from_state`, `to_state` |
| `tui.issue_detail.edit_opened` | User presses `e` to open edit form | `owner`, `repo`, `issue_number`, `fields_changed` |
| `tui.issue_detail.edit_submitted` | User submits the edit form | `owner`, `repo`, `issue_number`, `fields_changed`, `time_to_submit_ms` |
| `tui.issue_detail.label_changed` | User adds or removes a label | `owner`, `repo`, `issue_number`, `action` ("add" or "remove"), `label_name` |
| `tui.issue_detail.assignee_changed` | User adds or removes an assignee | `owner`, `repo`, `issue_number`, `action` ("add" or "remove"), `assignee_login` |
| `tui.issue_detail.dependency_navigated` | User presses Enter on a dependency | `owner`, `repo`, `from_issue`, `to_issue`, `dependency_type` ("depends_on" or "blocks") |
| `tui.issue_detail.pagination` | User scrolls to trigger pagination load | `page_number`, `items_loaded_total`, `load_duration_ms` |
| `tui.issue_detail.data_load_time` | All initial data loads complete | `issue_ms`, `comments_ms`, `events_ms`, `dependencies_ms`, `total_ms` |
| `tui.issue_detail.retry` | User presses `R` to retry a failed fetch | `error_type`, `retry_count` |
| `tui.issue_detail.metadata_toggled` | User presses `m` at compact size | `expanded` (boolean) |

### Common event properties

All issue detail events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `layout`: `"compact"` | `"standard"` | `"expanded"`

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Issue detail render rate | 100% of navigations | Every navigation to issue detail renders without crash |
| Data load success rate | > 98% | At least 98% of issue detail views load the issue without error |
| Mean time to interactive | < 1.5 seconds | From navigation to all data rendered |
| Comment creation rate | > 15% of views | At least 15% of issue detail views result in a comment |
| Write action usage | > 25% of views | At least 25% of views involve a write action (comment, edit, close, label, assignee) |
| Comment navigation usage | > 30% of views with 3+ comments | At least 30% of views with multiple comments use `n`/`p` navigation |
| Scroll depth > 50% | > 60% of views | At least 60% of views scroll past the body into comments |
| Dependency navigation rate | > 40% of views with dependencies | At least 40% of views with dependencies click into a dependency |

## Observability

### Logging requirements

| Log level | Event | Message format |
|-----------|-------|----------------|
| `debug` | Detail view mounted | `IssueDetail: mounted [owner={o}] [repo={r}] [number={n}] [width={w}] [height={h}]` |
| `debug` | Issue data loaded | `IssueDetail: issue loaded [number={n}] [state={s}] [comments={c}] [duration={ms}ms]` |
| `debug` | Comments loaded | `IssueDetail: comments loaded [number={n}] [page={p}] [count={c}] [duration={ms}ms]` |
| `debug` | Events loaded | `IssueDetail: events loaded [number={n}] [page={p}] [count={c}] [duration={ms}ms]` |
| `debug` | Dependencies loaded | `IssueDetail: dependencies loaded [number={n}] [deps={d}] [dependents={t}] [duration={ms}ms]` |
| `debug` | Comment navigation | `IssueDetail: comment nav [direction={n|p}] [target_id={id}]` |
| `debug` | Scroll position | `IssueDetail: scroll [position={pct}%] [items_visible={n}]` |
| `info` | Issue detail fully loaded | `IssueDetail: ready [number={n}] [total_ms={ms}]` |
| `info` | Comment created | `IssueDetail: comment created [number={n}] [comment_id={id}]` |
| `info` | Issue state changed | `IssueDetail: state changed [number={n}] [from={old}] [to={new}]` |
| `info` | Issue edited | `IssueDetail: edited [number={n}] [fields={list}]` |
| `info` | Label changed | `IssueDetail: label changed [number={n}] [action={add|remove}] [label={name}]` |
| `info` | Navigation to dependency | `IssueDetail: dependency navigated [from={n}] [to={m}] [type={type}]` |
| `warn` | Slow data load | `IssueDetail: slow load [endpoint={ep}] [duration={ms}ms]` (>2000ms) |
| `warn` | Body truncated | `IssueDetail: body truncated [number={n}] [original_length={len}]` |
| `warn` | Items capped | `IssueDetail: items capped at {MAX_ITEMS} [total={n}]` |
| `error` | Issue not found | `IssueDetail: 404 [owner={o}] [repo={r}] [number={n}]` |
| `error` | Auth error | `IssueDetail: auth error [status=401]` |
| `error` | Permission denied | `IssueDetail: permission denied [action={action}] [status=403]` |
| `error` | Fetch failed | `IssueDetail: fetch failed [endpoint={ep}] [status={code}] [error={msg}]` |
| `error` | Render error | `IssueDetail: render error [component={name}] [error={msg}]` |
| `error` | Optimistic revert | `IssueDetail: optimistic revert [action={action}] [error={msg}]` |

### Error cases specific to TUI

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during issue data load | Layout re-renders; data populates into new layout when ready | Independent operations; no coordination needed |
| Terminal resize collapses metadata | Labels and assignees hidden behind `m` toggle; title rewraps | User presses `m` to expand metadata |
| SSE disconnect while on issue detail | Status bar shows disconnected; issue detail is REST-based, unaffected | SSE provider handles reconnection |
| Auth token expires while viewing | Next API call (comment, edit, paginate) fails with 401; inline error shown | User re-authenticates via CLI |
| Network timeout on issue fetch | Full-screen error with retry hint after 10-second timeout | User presses `R` to retry |
| Network timeout on comment pagination | Inline "Failed to load" at bottom of list with retry | User scrolls again or presses `R` |
| Issue deleted while viewing | Next API interaction returns 404; screen shows "Issue no longer exists" | User presses `q` to go back |
| Rapid `n`/`p` comment jumping | Synchronous focus movement; debounced scroll animations | No debounce needed on focus, only scroll |
| Very long issue body (100k+ chars) | Truncated at 100,000 chars with notice | User views full issue on web |
| Very long comment body (50k+ chars) | Truncated at 50,000 chars with notice | User views full comment on web |
| Malformed markdown in body/comments | `<markdown>` renders best-effort; falls back to plain text | No user action needed |
| Label with very long name | Truncated at 30 chars with `…` | Full name visible in label picker |
| Unicode/emoji in issue content | Rendered by terminal; width calculated using Unicode width | No action needed |
| Comment creation fails (server error) | Optimistic comment removed; error toast shown; textarea content preserved | User can retry with `Ctrl+S` |
| State toggle fails (server error) | State badge reverts to original; error toast shown | User can retry with `o` |
| Terminal has no color support | State badges use bold/underline instead of color; labels show as `[name]` without color | Detected by TUI_THEME_AND_COLOR_TOKENS |
| Server returns empty comments page | Treated as end-of-list; pagination stops | Normal behavior |
| Concurrent edits from web UI | Next API call picks up server state; no real-time sync on detail view | User presses `R` to refresh |

### Failure modes and recovery

- **Issue detail component crash**: Caught by the global error boundary. Shows error screen with "Press `r` to restart". Navigation state preserved; TUI restarts at the last screen.
- **Comment section crash**: Each section (header, body, dependencies, comments) is rendered within the same scrollbox but the comments section is wrapped in an error boundary. A crashed comment section shows "Comment rendering error — press R to retry" while the issue header and body remain visible.
- **Markdown rendering crash**: The `<markdown>` component has internal error handling. Malformed markdown falls back to plain-text rendering.
- **All API requests fail simultaneously**: Full-screen error with retry. Go-to mode and command palette remain available.
- **Extremely slow network**: Loading spinner shown; user can navigate away via `q`, go-to mode, or command palette.
- **Memory pressure from large issue**: Virtualized rendering for 100+ comments caps DOM nodes. Maximum 500 items loaded.

## Verification

### Terminal snapshot tests

```
SNAP-ISSUE-DET-001: Issue detail renders at 120x40 with all sections
  → Navigate to issue #42 with title, labels, assignees, milestone, body, and 5 comments
  → Assert full content area matches snapshot: header, metadata, body, comments section

SNAP-ISSUE-DET-002: Issue detail renders at 80x24 compact layout
  → Navigate to issue #42 at 80x24
  → Assert compact metadata (author + state only), wrapped title, no inline labels

SNAP-ISSUE-DET-003: Issue detail renders at 200x60 expanded layout
  → Navigate to issue #42 at 200x60
  → Assert expanded layout with full timestamps, generous padding

SNAP-ISSUE-DET-004: Open issue state badge
  → Navigate to open issue
  → Assert [open] badge in green (ANSI 34)

SNAP-ISSUE-DET-005: Closed issue state badge
  → Navigate to closed issue
  → Assert [closed] badge in red (ANSI 196) with closed_at timestamp

SNAP-ISSUE-DET-006: Issue with no body
  → Navigate to issue with empty body
  → Assert "No description provided." in muted italic text

SNAP-ISSUE-DET-007: Issue with labels
  → Navigate to issue with 3 labels (bug, priority:high, frontend)
  → Assert labels render as colored inline badges with correct ANSI colors

SNAP-ISSUE-DET-008: Issue with no labels or assignees
  → Navigate to issue with no labels, no assignees, no milestone
  → Assert label, assignee, and milestone rows are omitted (not empty rows)

SNAP-ISSUE-DET-009: Issue with assignees
  → Navigate to issue with 3 assignees
  → Assert assignees render as @user1, @user2, @user3 in primary color

SNAP-ISSUE-DET-010: Issue with milestone
  → Navigate to issue with milestone "v2.1"
  → Assert "Milestone: v2.1" in muted color

SNAP-ISSUE-DET-011: Comment rendering
  → Navigate to issue with 3 comments
  → Assert each comment shows @username, relative timestamp, and markdown body

SNAP-ISSUE-DET-012: Timeline event rendering
  → Navigate to issue with label-added and state-changed events
  → Assert timeline events render as compact single-line entries with icons

SNAP-ISSUE-DET-013: Interleaved comments and timeline events
  → Navigate to issue with mixed comments and events in chronological order
  → Assert correct interleaving and visual distinction between comments and events

SNAP-ISSUE-DET-014: Dependencies section
  → Navigate to issue with 2 dependencies and 1 dependent
  → Assert dependencies section shows "Depends on #38: title" and "Blocks #45: title"

SNAP-ISSUE-DET-015: No dependencies section when none exist
  → Navigate to issue with no dependencies
  → Assert no dependencies section rendered

SNAP-ISSUE-DET-016: Empty comments state
  → Navigate to issue with 0 comments and 0 events
  → Assert "No comments yet. Press c to add one." in muted text

SNAP-ISSUE-DET-017: Loading state
  → Navigate to issue with slow API response
  → Assert full-screen "Loading issue #42…" spinner

SNAP-ISSUE-DET-018: 404 error state
  → Navigate to non-existent issue #999
  → Assert "Issue #999 not found" in error color with "Press q to go back"

SNAP-ISSUE-DET-019: Network error state
  → Navigate to issue with API returning 500
  → Assert "Failed to load issue" in error color with "Press R to retry"

SNAP-ISSUE-DET-020: Comment creation textarea
  → Press c on issue detail
  → Assert textarea appears at bottom of screen with submit hint (Ctrl+S)

SNAP-ISSUE-DET-021: Markdown body rendering
  → Navigate to issue with body containing headings, code block, list, bold, links
  → Assert markdown renders correctly with syntax highlighting in code blocks

SNAP-ISSUE-DET-022: Long title wrapping
  → Navigate to issue with 200-character title
  → Assert title wraps across multiple lines, state badge still visible

SNAP-ISSUE-DET-023: Breadcrumb display
  → Navigate to issue #42 in owner/repo
  → Assert breadcrumb shows "… > Issues > #42"

SNAP-ISSUE-DET-024: Status bar keybinding hints
  → Navigate to issue detail
  → Assert status bar shows "j/k:scroll  n/p:comment  c:comment  e:edit  o:close  q:back"

SNAP-ISSUE-DET-025: Metadata toggle at 80x24
  → Navigate at 80x24 → Assert compact metadata → Press m → Assert expanded with labels and assignees
```

### Keyboard interaction tests

```
KEY-ISSUE-DET-001: j/k scrolls content
  → Navigate to issue with long body → j j j → Assert content scrolled down → k → Assert scrolled up

KEY-ISSUE-DET-002: G jumps to bottom
  → Navigate to issue with comments → G → Assert scroll at bottom of content

KEY-ISSUE-DET-003: g g jumps to top
  → Navigate to issue → scroll down → g g → Assert scroll at top

KEY-ISSUE-DET-004: Ctrl+D and Ctrl+U page scroll
  → Navigate to issue → Ctrl+D → Assert scrolled down one page → Ctrl+U → Assert scrolled back up

KEY-ISSUE-DET-005: n jumps to next comment
  → Navigate to issue with 3 comments and 2 events → n → Assert focused on first comment → n → Assert focused on second comment (skipping events)

KEY-ISSUE-DET-006: p jumps to previous comment
  → Navigate to issue → n n → p → Assert focused on first comment

KEY-ISSUE-DET-007: n wraps or stops at last comment
  → Navigate to issue with 2 comments → n n n → Assert focused on last comment (no wrap)

KEY-ISSUE-DET-008: p stops at first comment
  → Navigate to issue → n → p p → Assert focused on first comment (no wrap)

KEY-ISSUE-DET-009: c opens comment textarea
  → Press c → Assert textarea visible → Assert cursor in textarea → Type "test" → Assert "test" in input

KEY-ISSUE-DET-010: Ctrl+S submits comment
  → Press c → Type "Great fix!" → Ctrl+S → Assert comment appears in list → Assert textarea closed

KEY-ISSUE-DET-011: Esc cancels empty comment
  → Press c → Esc → Assert textarea closed without confirmation

KEY-ISSUE-DET-012: Esc on non-empty comment shows confirmation
  → Press c → Type "draft" → Esc → Assert confirmation dialog → Confirm → Assert textarea closed

KEY-ISSUE-DET-013: o toggles issue state (open → closed)
  → Navigate to open issue → o → Assert state badge changes to [closed] immediately

KEY-ISSUE-DET-014: o toggles issue state (closed → open)
  → Navigate to closed issue → o → Assert state badge changes to [open] immediately

KEY-ISSUE-DET-015: e opens edit form
  → Navigate to issue → e → Assert edit form overlay with title, body, labels, assignees, milestone fields

KEY-ISSUE-DET-016: q pops back to issue list
  → Navigate to issue from list → q → Assert issue list is current screen

KEY-ISSUE-DET-017: R retries failed fetch
  → Navigate to issue with API failing → Assert error → R → Assert loading spinner → Assert data loads

KEY-ISSUE-DET-018: Enter on dependency navigates to issue
  → Navigate to issue with dependency #38 → Focus dependency → Enter → Assert issue #38 detail view

KEY-ISSUE-DET-019: l opens label picker
  → Press l → Assert label picker overlay with available labels → Select label → Assert label added to issue

KEY-ISSUE-DET-020: a opens assignee picker
  → Press a → Assert assignee picker overlay with collaborators → Select user → Assert assignee added

KEY-ISSUE-DET-021: ? shows help overlay
  → Press ? → Assert help overlay showing all keybindings → Esc → Assert overlay closed

KEY-ISSUE-DET-022: : opens command palette
  → Press : → Assert command palette modal

KEY-ISSUE-DET-023: m toggles metadata at compact size
  → Resize to 80x24 → m → Assert labels and assignees visible → m → Assert collapsed

KEY-ISSUE-DET-024: Comment creation with optimistic rollback
  → Press c → Type "test" → Ctrl+S → Mock API 500 → Assert comment removed → Assert error toast → Assert textarea reopens with "test"

KEY-ISSUE-DET-025: State toggle with optimistic rollback
  → Press o on open issue → Mock API 500 → Assert state reverts to [open] → Assert error toast
```

### Responsive resize tests

```
RESIZE-ISSUE-DET-001: 120x40 → 80x24 collapses metadata
  → Assert full metadata → Resize to 80x24 → Assert compact metadata (author + state only)

RESIZE-ISSUE-DET-002: 80x24 → 120x40 expands metadata
  → Assert compact → Resize to 120x40 → Assert full metadata with labels and assignees

RESIZE-ISSUE-DET-003: 120x40 → 200x60 expands layout
  → Resize → Assert wider content, full timestamps, generous padding

RESIZE-ISSUE-DET-004: Scroll position preserved through resize
  → Scroll to comment section → Resize → Assert comment section still visible

RESIZE-ISSUE-DET-005: Title rewraps on resize
  → Long title at 120 wide (2 lines) → Resize to 80 (3 lines) → Assert clean rewrap

RESIZE-ISSUE-DET-006: Rapid resize without artifacts
  → 120x40 → 80x24 → 200x60 → 100x30 → 150x45 → Assert clean layout at 150x45

RESIZE-ISSUE-DET-007: Comment textarea adapts to width
  → Open comment textarea → Resize → Assert textarea width adjusts without content loss

RESIZE-ISSUE-DET-008: Below minimum shows too-small message
  → Resize to 60x20 → Assert "Terminal too small" message
```

### Data loading and pagination tests

```
DATA-ISSUE-DET-001: All data loads concurrently
  → Assert 4 API requests (issue, comments, events, dependencies) fire in same frame

DATA-ISSUE-DET-002: Comment pagination on scroll
  → Issue with 50 comments → Scroll past 80% → Assert page 2 loads and appends

DATA-ISSUE-DET-003: Pagination stops at 500 cap
  → Issue with 600 comments+events → Scroll repeatedly → Assert stops at 500 with notice

DATA-ISSUE-DET-004: Data cached on re-navigation
  → Load issue detail → q back → re-navigate → Assert no loading spinner

DATA-ISSUE-DET-005: Issue 404 handling
  → Navigate to non-existent issue → Assert 404 screen

DATA-ISSUE-DET-006: 401 auth error
  → Expired token → Navigate to issue → Assert "Session expired" message

DATA-ISSUE-DET-007: Comments fetch fails independently
  → Issue loads but comments return 500 → Assert issue header and body visible → Assert comments section shows error

DATA-ISSUE-DET-008: Interleaved timeline items ordered chronologically
  → Issue with comments at t1, t3 and events at t2, t4 → Assert rendered in order t1, t2, t3, t4

DATA-ISSUE-DET-009: Optimistic state change persists on success
  → Press o → API returns 200 → Assert state badge remains changed

DATA-ISSUE-DET-010: Optimistic comment persists on success
  → Create comment → API returns 201 → Assert comment in list with server-assigned ID
```

### Edge case tests

```
EDGE-ISSUE-DET-001: Issue with extremely long title (500+ chars) → wraps correctly, no overflow
EDGE-ISSUE-DET-002: Issue body with 100k+ characters → truncated with notice
EDGE-ISSUE-DET-003: Comment with 50k+ characters → truncated with notice
EDGE-ISSUE-DET-004: Unicode/emoji in title, body, labels, comments → no terminal corruption
EDGE-ISSUE-DET-005: Issue with 20+ labels → wraps to multiple lines at standard size; collapsed at compact
EDGE-ISSUE-DET-006: Issue with 10+ assignees → truncated at 5 with "+5 more" at minimum width
EDGE-ISSUE-DET-007: Label with 40-character name → truncated at 30 with …
EDGE-ISSUE-DET-008: Null/undefined body field → shows "No description provided." (not "null")
EDGE-ISSUE-DET-009: Null milestone_id → milestone row omitted
EDGE-ISSUE-DET-010: Issue with 0 comments → empty state message
EDGE-ISSUE-DET-011: Issue with 1 comment → renders correctly, n/p navigation disabled
EDGE-ISSUE-DET-012: Rapid j/k key repeats → smooth scrolling without dropped frames
EDGE-ISSUE-DET-013: Concurrent resize + comment creation → textarea resizes, content preserved
EDGE-ISSUE-DET-014: Comment body with raw ANSI escape codes → escaped, not interpreted
EDGE-ISSUE-DET-015: Issue number at boundary (0, 1, 2147483647) → renders correctly
EDGE-ISSUE-DET-016: Relative timestamp edge cases → "just now" (<60s), "1m ago" (60s), "59m ago", "1h ago", "23h ago", "1d ago", "30d ago", "Jan 15, 2025" (>30d)
EDGE-ISSUE-DET-017: Write actions disabled for read-only users → e, o, l, a keys are no-ops; hints hidden from status bar
EDGE-ISSUE-DET-018: Markdown with deeply nested lists (10+ levels) → renders without crash, truncated nesting
EDGE-ISSUE-DET-019: Body with only whitespace → treated as empty, shows "No description provided."
EDGE-ISSUE-DET-020: Issue with circular dependencies → renders without infinite loop
```
