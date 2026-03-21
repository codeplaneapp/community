# TUI_WIKI_DETAIL_VIEW

Specification for TUI_WIKI_DETAIL_VIEW.

## High-Level User POV

The wiki detail view is the screen a developer sees after selecting a wiki page from the wiki list or navigating directly via the command palette (`:wiki getting-started`) or deep link (`codeplane tui --screen wiki --repo owner/repo --slug getting-started`). It is a single, vertically scrollable screen that shows a wiki page's full content — its title, author, timestamps, and markdown body — all rendered in a dense, keyboard-navigable layout optimized for reading documentation without leaving the terminal.

The screen opens with the wiki page title prominently displayed at the top in bold text. Immediately below the title line, a metadata row shows the author's username, creation timestamp, and last-updated timestamp. The slug is displayed in muted text next to the title as a compact reference identifier, making it easy to reference the page in CLI commands or links.

The body of the wiki page is rendered using OpenTUI's `<markdown>` component, supporting headings, lists, code blocks with syntax highlighting, bold, italic, links (shown as underlined text with the URL visible), blockquotes, tables, and horizontal rules. The body occupies the full remaining content area and is scrollable via `<scrollbox>`. An empty body shows "This page has no content." in muted text.

Navigation within the detail view uses `j/k` to scroll the content vertically. Pressing `e` opens the wiki page edit form — a full-screen form with title, slug, and body textarea fields. Pressing `d` prompts for deletion confirmation. `q` pops back to the wiki list. The user can navigate to the next or previous wiki page in the list order with `]` and `[` respectively, allowing rapid browsing through documentation without returning to the list.

At the minimum 80×24 terminal size, the metadata row collapses to show only the author and a compact timestamp. The slug display is hidden. At 120×40, the full metadata row is visible with both timestamps and the slug. At 200×60, wider content renders with more generous padding and full timestamps.

The breadcrumb in the header bar shows the full navigation path: `Dashboard > owner/repo > Wiki > page-title`. The status bar shows context-sensitive keybinding hints for the detail view.

## Acceptance Criteria

### Screen lifecycle
- [ ] The wiki detail view is pushed onto the navigation stack when the user presses `Enter` on a wiki page in the wiki list.
- [ ] The wiki detail view is pushed when the user navigates via the command palette (`:wiki <slug>` or `:wiki owner/repo/<slug>`).
- [ ] The wiki detail view is pushed when the TUI launches with `--screen wiki --repo owner/repo --slug <slug>`.
- [ ] Pressing `q` pops the wiki detail view and returns to the previous screen (wiki list or wherever the user came from).
- [ ] The breadcrumb displays `… > Wiki > <page-title>` where page-title is truncated to 30 characters with `…` if necessary.
- [ ] The screen title in the navigation stack entry is `Wiki: <truncated title>` (title truncated to 40 characters).

### Page header
- [ ] The wiki page title renders in bold text, full width, wrapping to multiple lines if necessary.
- [ ] The wiki page title is never truncated on the detail screen — it wraps within the available width.
- [ ] The slug renders in `muted` color (ANSI 245) next to or below the title as `/<slug>`.
- [ ] At compact terminal size (80×24), the slug display is hidden.

### Metadata row
- [ ] The author's username renders as `@username` in `primary` color (ANSI 33).
- [ ] The creation timestamp renders as a relative time in `muted` color (ANSI 245): "just now", "5m ago", "2h ago", "3d ago", "Jan 15, 2025".
- [ ] The `updated_at` timestamp renders when different from `created_at`, as "updated 2h ago" in `muted` color.
- [ ] Relative timestamps switch to absolute dates for items older than 30 days: "Jan 15, 2025".

### Page body
- [ ] The wiki body is rendered using `<markdown>` with full markdown support: headings, lists, code blocks (syntax highlighted), bold, italic, links, blockquotes, horizontal rules, and tables.
- [ ] Code blocks render with `<code>` syntax highlighting inside the `<markdown>` component.
- [ ] Links render as underlined text; the URL is shown inline in `muted` color.
- [ ] An empty or null body renders "This page has no content." in `muted` italic text.
- [ ] The body is contained within a `<scrollbox>` and scrollable.
- [ ] Body text wraps at the available width — no horizontal scrolling.
- [ ] Maximum body rendering length: 100,000 characters. Bodies exceeding this show a truncation notice: "Content truncated. View full page on web."

### Page navigation
- [ ] Pressing `]` navigates to the next wiki page in list order (by `updated_at` descending).
- [ ] Pressing `[` navigates to the previous wiki page in list order.
- [ ] When at the last page, `]` shows a brief "Last page" indicator in the status bar.
- [ ] When at the first page, `[` shows a brief "First page" indicator in the status bar.
- [ ] Page navigation fetches the adjacent page data and replaces the current detail view content.

### Edit form
- [ ] Pressing `e` opens the wiki page edit form overlay.
- [ ] The edit form contains three fields: title (`<input>`), slug (`<input>`), and body (`<textarea>`).
- [ ] The title field is pre-populated with the current title.
- [ ] The slug field is pre-populated with the current slug.
- [ ] The body field is pre-populated with the current body content.
- [ ] `Tab` / `Shift+Tab` navigates between form fields.
- [ ] `Ctrl+S` submits the edit form from any field.
- [ ] `Esc` cancels the edit form. If any field has been modified, a confirmation dialog appears: "Discard changes? [y/n]".
- [ ] On successful submission, the detail view refreshes with the updated page data.
- [ ] On submission failure, the form remains open with an inline error message in `error` color.
- [ ] The slug field validates that the slug contains only lowercase alphanumeric characters and hyphens.
- [ ] The title field is required; submitting with an empty title shows a validation error.

### Delete action
- [ ] Pressing `d` shows a confirmation dialog: "Delete wiki page '<title>'? This cannot be undone. [y/n]".
- [ ] Confirming deletion sends the DELETE request and pops back to the wiki list on success.
- [ ] Canceling deletion dismisses the dialog and returns focus to the detail view.
- [ ] On deletion failure, the dialog shows an inline error message and remains open.

### Data loading
- [ ] The wiki page data loads from `useWikiPage(owner, repo, slug)` on mount.
- [ ] A full-screen loading spinner with "Loading wiki page…" appears during the initial fetch.
- [ ] If the wiki page fetch fails with 404, the screen shows "Wiki page not found" in `error` color with "Press q to go back".
- [ ] If the wiki page fetch fails with a network error, the screen shows "Failed to load wiki page" in `error` color with "Press R to retry".
- [ ] Successful wiki page data is cached for 30 seconds; re-navigating within that window shows cached data instantly.

### Boundary constraints
- [ ] Wiki page title: no max length (wraps freely).
- [ ] Wiki page body: rendered up to 100,000 characters; truncated with notice beyond that.
- [ ] Slug: truncated at 80 characters with `…` on display.
- [ ] Username: truncated at 39 characters with `…`.
- [ ] Scrollbox content height: virtualized rendering for pages with extremely long bodies (10,000+ lines).

### Responsive behavior
- [ ] 80×24: compact layout — title wraps, metadata on single condensed line (author only + compact timestamp), slug hidden, body uses minimal padding.
- [ ] 120×40: standard layout — full metadata row with both timestamps and slug visible, comfortable body spacing.
- [ ] 200×60: expanded layout — wider content area, more context visible, full timestamps ("2 hours ago" instead of "2h ago").
- [ ] Below 80×24: "Terminal too small" message replaces the screen.
- [ ] Resize triggers synchronous re-layout; scroll position preserved.
- [ ] Content width never exceeds terminal width minus 2 (for borders).

### Performance
- [ ] First render with cached data within 50ms.
- [ ] First render with fetch shows spinner within 200ms.
- [ ] Scrolling at 60fps for pages with large bodies.
- [ ] Keyboard input response within 16ms.

## Design

### Layout structure

At standard terminal size (120×40), after subtracting header (1 row) and status bar (1 row), the content area is 38 rows × 120 columns:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Getting Started with Codeplane                                                                          /getting-started │
│ @alice · created 3d ago · updated 2h ago                                                                           │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                      │
│ # Welcome to Codeplane                                                                                               │
│                                                                                                                      │
│ This guide will walk you through setting up your first repository and                                                │
│ configuring your development environment.                                                                            │
│                                                                                                                      │
│ ## Prerequisites                                                                                                     │
│                                                                                                                      │
│ - Install jj: `curl -fsSL https://jj.dev/install.sh | sh`                                                           │
│ - Install the Codeplane CLI: `bun install -g @codeplane/cli`                                                        │
│                                                                                                                      │
│ ## Quick Start                                                                                                       │
│                                                                                                                      │
│ ```bash                                                                                                              │
│ codeplane repo create my-project                                                                                     │
│ cd my-project                                                                                                        │
│ jj init                                                                                                              │
│ ```                                                                                                                  │
│                                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

At minimum terminal size (80×24):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Getting Started with Codeplane                                               │
│ @alice · 3d ago                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ # Welcome to Codeplane                                                       │
│                                                                              │
│ This guide will walk you through setting up                                  │
│ your first repository and configuring your                                   │
│ development environment.                                                     │
│                                                                              │
│ ## Prerequisites                                                             │
│                                                                              │
│ - Install jj: `curl -fsSL https://jj.dev/…`                                 │
│ - Install the Codeplane CLI                                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component tree

```jsx
<box flexDirection="column" width="100%" height="100%">
  {/* Page header */}
  <box flexDirection="column" paddingX={1} gap={0}>
    <box flexDirection="row" justifyContent="space-between">
      <text attributes={BOLD} wrap="wrap">{page.title}</text>
      {layout !== "compact" && <text fg={ANSI_MUTED}>/{page.slug}</text>}
    </box>
    <box flexDirection="row" gap={2}>
      <text fg={ANSI_PRIMARY}>@{page.author.login}</text>
      <text fg={ANSI_MUTED}>created {relativeTime(page.created_at)}</text>
      {page.updated_at !== page.created_at && layout !== "compact" && (
        <text fg={ANSI_MUTED}>updated {relativeTime(page.updated_at)}</text>
      )}
    </box>
  </box>
  <text fg={ANSI_BORDER}>{"─".repeat(width - 2)}</text>
  <scrollbox flexGrow={1} paddingX={1}>
    <box flexDirection="column" gap={1}>
      {page.body
        ? <markdown content={truncateBody(page.body, 100000)} />
        : <text fg={ANSI_MUTED} attributes={ITALIC}>This page has no content.</text>
      }
      {bodyTruncated && (
        <text fg={ANSI_WARNING}>Content truncated. View full page on web.</text>
      )}
    </box>
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
| `]` | Detail view | Navigate to next wiki page in list order |
| `[` | Detail view | Navigate to previous wiki page in list order |
| `e` | Detail view (with write access) | Open wiki page edit form |
| `d` | Detail view (with write access) | Prompt for wiki page deletion |
| `y` | Delete confirmation dialog | Confirm deletion |
| `n` | Delete confirmation dialog | Cancel deletion |
| `R` | Error state | Retry failed data fetch |
| `q` | Detail view | Pop back to previous screen |
| `Esc` | Overlay open | Close overlay / cancel form |
| `Ctrl+S` | Edit form | Submit edit form |
| `Tab` | Edit form | Next form field |
| `Shift+Tab` | Edit form | Previous form field |
| `?` | Detail view | Show help overlay with all keybindings |
| `:` | Detail view | Open command palette |

### Status bar hints

`j/k:scroll  [/]:prev/next  e:edit  d:delete  q:back`

### Terminal resize behavior

| Width × Height | Layout | Metadata | Slug | Timestamps | Body |
|----------------|--------|----------|------|-----------|------|
| 80×24 – 119×39 | Compact | Author only | Hidden | Compact ("3d") | Minimal padding |
| 120×40 – 199×59 | Standard | Full row: author, both timestamps | Visible | Compact ("3d ago") | Standard spacing |
| 200×60+ | Expanded | Full row with extra padding | Visible | Full ("3 days ago") | Generous spacing |

### Data hooks consumed

| Hook | Source | Data |
|------|--------|------|
| `useWikiPage(owner, repo, slug)` | `@codeplane/ui-core` | `{ page: WikiPageResponse, loading, error, refetch }` |
| `useUpdateWikiPage(owner, repo, slug)` | `@codeplane/ui-core` | `{ mutate, loading, error }` |
| `useDeleteWikiPage(owner, repo, slug)` | `@codeplane/ui-core` | `{ mutate, loading, error }` |
| `useWikiPages(owner, repo)` | `@codeplane/ui-core` | `{ items: WikiPageResponse[], totalCount }` — used for `[`/`]` navigation ordering |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler |
| `useNavigation()` | local TUI | `{ push, pop, goTo }` |
| `useStatusBarHints()` | local TUI | Detail view keybinding hints |

### API endpoints consumed

| Endpoint | Hook |
|----------|------|
| `GET /api/repos/:owner/:repo/wiki/:slug` | `useWikiPage()` |
| `PATCH /api/repos/:owner/:repo/wiki/:slug` | `useUpdateWikiPage()` |
| `DELETE /api/repos/:owner/:repo/wiki/:slug` | `useDeleteWikiPage()` |
| `GET /api/repos/:owner/:repo/wiki` | `useWikiPages()` |

### Optimistic UI

- **Edit page**: Title and body update immediately in the detail view; reverts on server error with inline error toast.
- **Delete page**: Navigation pops to wiki list immediately; if deletion fails, the wiki list refetches and the page reappears with an error toast.

## Permissions & Security

### Authorization
- The wiki detail view requires read access to the repository. Users without repository access will see a 404 error (server-side enforcement, not client-side gating).
- Write actions (`e` edit, `d` delete) are available only to users with write access to the repository (repository owner, organization owner with appropriate role, team member with write permission, or collaborator).
- The TUI does not render keybinding hints for write actions (`e`, `d`) when the user lacks write access. The status bar omits `e:edit` and `d:delete` for read-only users.
- If a write action is attempted without permission, the server returns 403 and the TUI shows "Permission denied" in `error` color as an inline toast that auto-dismisses after 3 seconds.

### Token-based auth
- The TUI authenticates via token stored in CLI keychain (from `codeplane auth login`) or `CODEPLANE_TOKEN` environment variable.
- The wiki detail view does not handle, store, or display the authentication token. It is injected by the `<APIClientProvider>`.
- A 401 response during any wiki detail API call triggers the auth error display: "Session expired. Run `codeplane auth login` to re-authenticate." in `error` color.
- The TUI does not retry 401s; the user must re-authenticate via CLI.

### Rate limiting
- The wiki detail view makes 1 API request on mount (the wiki page fetch). This is minimal and well within rate limits.
- Page navigation (`[`/`]`) fires individual page fetches which are user-driven, providing natural rate limiting.
- Write actions (edit, delete) are debounced: the TUI disables the action key while a mutation is in flight (the submit button shows a spinner).
- The wiki list data used for `[`/`]` navigation is fetched lazily on first use of the navigation keys, not on mount, to reduce initial request count.

### Data sensitivity
- Wiki page titles and bodies are user-generated content displayed as-is. No XSS vector exists in the terminal context.
- Private repository wiki content is protected by server-side access control; the TUI trusts the API response.
- No PII beyond usernames and wiki content is rendered.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.wiki_detail.viewed` | Wiki detail screen renders with data loaded | `owner`, `repo`, `slug`, `title_length`, `body_length`, `author_login`, `created_at`, `updated_at`, `terminal_width`, `terminal_height` |
| `tui.wiki_detail.scrolled` | User scrolls past 50% of content | `scroll_depth_percent`, `body_length`, `terminal_height` |
| `tui.wiki_detail.page_navigated` | User presses `[` or `]` to browse pages | `direction` ("next" or "prev"), `from_slug`, `to_slug` |
| `tui.wiki_detail.edit_opened` | User presses `e` to open edit form | `owner`, `repo`, `slug` |
| `tui.wiki_detail.edit_submitted` | User submits the edit form | `owner`, `repo`, `slug`, `fields_changed` (array of "title", "slug", "body"), `time_to_submit_ms` |
| `tui.wiki_detail.edit_cancelled` | User cancels the edit form | `owner`, `repo`, `slug`, `had_changes` (boolean) |
| `tui.wiki_detail.delete_prompted` | User presses `d` to start deletion | `owner`, `repo`, `slug` |
| `tui.wiki_detail.delete_confirmed` | User confirms deletion | `owner`, `repo`, `slug` |
| `tui.wiki_detail.delete_cancelled` | User cancels deletion | `owner`, `repo`, `slug` |
| `tui.wiki_detail.data_load_time` | Page data load completes | `page_ms`, `slug`, `body_length` |
| `tui.wiki_detail.retry` | User presses `R` to retry a failed fetch | `error_type`, `retry_count` |

### Common event properties

All wiki detail events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `layout`: `"compact"` | `"standard"` | `"expanded"`

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Wiki detail render rate | 100% of navigations | Every navigation to wiki detail renders without crash |
| Data load success rate | > 98% | At least 98% of wiki detail views load the page without error |
| Mean time to interactive | < 1.0 seconds | From navigation to body rendered |
| Edit action usage | > 10% of views | At least 10% of wiki detail views result in an edit form open |
| Edit completion rate | > 70% of edit opens | At least 70% of edit form opens result in a successful submission |
| Page navigation usage | > 20% of views | At least 20% of views use `[`/`]` to browse pages |
| Scroll depth > 50% | > 50% of views | At least 50% of views scroll past the midpoint of the body |
| Delete usage | < 5% of views | Deletion is a rare action — less than 5% of views |

## Observability

### Logging requirements

| Log level | Event | Message format |
|-----------|-------|----------------|
| `debug` | Detail view mounted | `WikiDetail: mounted [owner={o}] [repo={r}] [slug={s}] [width={w}] [height={h}]` |
| `debug` | Page data loaded | `WikiDetail: page loaded [slug={s}] [title_len={t}] [body_len={b}] [duration={ms}ms]` |
| `debug` | Scroll position | `WikiDetail: scroll [position={pct}%]` |
| `debug` | Page navigation | `WikiDetail: page nav [direction={n|p}] [from={slug}] [to={slug}]` |
| `info` | Wiki detail fully loaded | `WikiDetail: ready [slug={s}] [total_ms={ms}]` |
| `info` | Page edited | `WikiDetail: edited [slug={s}] [fields={list}]` |
| `info` | Page deleted | `WikiDetail: deleted [slug={s}]` |
| `warn` | Slow data load | `WikiDetail: slow load [slug={s}] [duration={ms}ms]` (>2000ms) |
| `warn` | Body truncated | `WikiDetail: body truncated [slug={s}] [original_length={len}]` |
| `error` | Page not found | `WikiDetail: 404 [owner={o}] [repo={r}] [slug={s}]` |
| `error` | Auth error | `WikiDetail: auth error [status=401]` |
| `error` | Permission denied | `WikiDetail: permission denied [action={action}] [status=403]` |
| `error` | Fetch failed | `WikiDetail: fetch failed [slug={s}] [status={code}] [error={msg}]` |
| `error` | Render error | `WikiDetail: render error [component={name}] [error={msg}]` |
| `error` | Optimistic revert | `WikiDetail: optimistic revert [action={action}] [error={msg}]` |
| `error` | Edit submission failed | `WikiDetail: edit failed [slug={s}] [status={code}] [error={msg}]` |
| `error` | Delete failed | `WikiDetail: delete failed [slug={s}] [status={code}] [error={msg}]` |

### Error cases specific to TUI

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during page load | Layout re-renders; data populates into new layout when ready | Independent operations; no coordination needed |
| Terminal resize during edit form | Edit form re-renders with new dimensions; textarea content preserved | No action needed |
| SSE disconnect while on wiki detail | Status bar shows disconnected; wiki detail is REST-based, unaffected | SSE provider handles reconnection |
| Auth token expires while viewing | Next API call (edit, delete) fails with 401; inline error shown | User re-authenticates via CLI |
| Network timeout on page fetch | Full-screen error with retry hint after 10-second timeout | User presses `R` to retry |
| Page deleted by another user while viewing | Next interaction (edit, navigate) returns 404; screen shows "Wiki page no longer exists" | User presses `q` to go back |
| Slug conflict during edit | Edit form shows "A page with this slug already exists" in error color | User changes slug and resubmits |
| Very long page body (100k+ chars) | Truncated at 100,000 chars with notice | User views full page on web |
| Malformed markdown in body | `<markdown>` renders best-effort; falls back to plain text | No user action needed |
| Unicode/emoji in page content | Rendered by terminal; width calculated using Unicode width | No action needed |
| Edit form submission fails (server error) | Form remains open with error message; user content preserved | User can retry with `Ctrl+S` |
| Delete fails (server error) | Confirmation dialog shows error; page remains visible | User can retry `d` |
| Terminal has no color support | Metadata uses bold/underline instead of color | Detected by TUI_THEME_AND_COLOR_TOKENS |
| Rapid `[`/`]` page navigation | Debounced at 200ms; intermediate fetches cancelled | Latest navigation wins |
| Edit form open during terminal resize below 80×24 | Edit form dismissed; "Terminal too small" shown; unsaved content lost | User resizes terminal back |
| Concurrent edit from web UI | Next refetch picks up server state; no real-time sync | User presses `R` to refresh |

### Failure modes and recovery

- **Wiki detail component crash**: Caught by the global error boundary. Shows error screen with "Press `r` to restart". Navigation state preserved; TUI restarts at the last screen.
- **Markdown rendering crash**: The `<markdown>` component has internal error handling. Malformed markdown falls back to plain-text rendering.
- **Edit form crash**: Edit form is wrapped in a section-level error boundary. Shows "Edit form error — press Esc to close" while the page content remains visible behind the overlay.
- **All API requests fail**: Full-screen error with retry. Go-to mode and command palette remain available.
- **Extremely slow network**: Loading spinner shown; user can navigate away via `q`, go-to mode, or command palette.
- **Memory pressure from large page**: Virtualized rendering for pages with 10,000+ lines of content.

## Verification

### Terminal snapshot tests

```
SNAP-WIKI-DET-001: Wiki detail renders at 120x40 with all sections
  → Navigate to wiki page "getting-started" with title, author, timestamps, and markdown body
  → Assert full content area matches snapshot: header, metadata, body

SNAP-WIKI-DET-002: Wiki detail renders at 80x24 compact layout
  → Navigate to wiki page at 80x24
  → Assert compact metadata (author only + compact timestamp), slug hidden, wrapped title

SNAP-WIKI-DET-003: Wiki detail renders at 200x60 expanded layout
  → Navigate to wiki page at 200x60
  → Assert expanded layout with full timestamps, generous padding, slug visible

SNAP-WIKI-DET-004: Wiki page with code blocks and headings
  → Navigate to wiki page with body containing H1, H2, code block (bash), bullet list
  → Assert markdown renders correctly with syntax highlighting in code blocks

SNAP-WIKI-DET-005: Wiki page with empty body
  → Navigate to wiki page with empty body
  → Assert "This page has no content." in muted italic text

SNAP-WIKI-DET-006: Wiki page with long title wrapping
  → Navigate to wiki page with 200-character title
  → Assert title wraps across multiple lines, slug still visible at standard size

SNAP-WIKI-DET-007: Slug display at standard size
  → Navigate to wiki page "getting-started" at 120x40
  → Assert "/getting-started" displayed in muted color after title

SNAP-WIKI-DET-008: Slug hidden at compact size
  → Navigate to wiki page at 80x24
  → Assert slug not visible

SNAP-WIKI-DET-009: Loading state
  → Navigate to wiki page with slow API response
  → Assert full-screen "Loading wiki page…" spinner

SNAP-WIKI-DET-010: 404 error state
  → Navigate to non-existent wiki page slug "nonexistent"
  → Assert "Wiki page not found" in error color with "Press q to go back"

SNAP-WIKI-DET-011: Network error state
  → Navigate to wiki page with API returning 500
  → Assert "Failed to load wiki page" in error color with "Press R to retry"

SNAP-WIKI-DET-012: Edit form overlay
  → Press e on wiki detail
  → Assert edit form overlay with Title, Slug, Body fields pre-populated

SNAP-WIKI-DET-013: Delete confirmation dialog
  → Press d on wiki detail
  → Assert confirmation dialog with page title and y/n prompt

SNAP-WIKI-DET-014: Breadcrumb display
  → Navigate to wiki page "getting-started" in owner/repo
  → Assert breadcrumb shows "… > Wiki > Getting Started with Codeplane"

SNAP-WIKI-DET-015: Status bar keybinding hints
  → Navigate to wiki detail
  → Assert status bar shows "j/k:scroll  [/]:prev/next  e:edit  d:delete  q:back"

SNAP-WIKI-DET-016: Status bar hints for read-only user
  → Navigate to wiki detail without write access
  → Assert status bar shows "j/k:scroll  [/]:prev/next  q:back" (no e:edit or d:delete)

SNAP-WIKI-DET-017: Markdown with tables
  → Navigate to wiki page with body containing a markdown table
  → Assert table renders with box-drawing characters and aligned columns

SNAP-WIKI-DET-018: Markdown with links
  → Navigate to wiki page with body containing [link text](url)
  → Assert links render as underlined text with URL in muted color

SNAP-WIKI-DET-019: Body truncation notice
  → Navigate to wiki page with body > 100,000 characters
  → Assert truncation notice "Content truncated. View full page on web." in warning color

SNAP-WIKI-DET-020: Metadata with both timestamps
  → Navigate to wiki page where updated_at ≠ created_at
  → Assert both "created Xd ago" and "updated Xh ago" visible at standard size
```

### Keyboard interaction tests

```
KEY-WIKI-DET-001: j/k scrolls content
  → Navigate to wiki page with long body → j j j → Assert content scrolled down → k → Assert scrolled up

KEY-WIKI-DET-002: G jumps to bottom
  → Navigate to wiki page with long body → G → Assert scroll at bottom of content

KEY-WIKI-DET-003: g g jumps to top
  → Navigate to wiki page → scroll down → g g → Assert scroll at top

KEY-WIKI-DET-004: Ctrl+D and Ctrl+U page scroll
  → Navigate to wiki page → Ctrl+D → Assert scrolled down one page → Ctrl+U → Assert scrolled back up

KEY-WIKI-DET-005: ] navigates to next wiki page
  → Navigate to wiki page → ] → Assert content replaced with next page → Assert title and body changed

KEY-WIKI-DET-006: [ navigates to previous wiki page
  → Navigate to wiki page → ] → [ → Assert content returns to original page

KEY-WIKI-DET-007: ] at last page shows indicator
  → Navigate to last wiki page in list → ] → Assert "Last page" indicator in status bar → Assert content unchanged

KEY-WIKI-DET-008: [ at first page shows indicator
  → Navigate to first wiki page in list → [ → Assert "First page" indicator in status bar → Assert content unchanged

KEY-WIKI-DET-009: e opens edit form
  → Press e → Assert edit form overlay visible → Assert title field focused → Assert fields pre-populated

KEY-WIKI-DET-010: Ctrl+S submits edit form
  → Press e → Modify title → Ctrl+S → Assert form closes → Assert detail view shows updated title

KEY-WIKI-DET-011: Esc cancels empty edit form
  → Press e → Esc (no changes) → Assert form closed without confirmation

KEY-WIKI-DET-012: Esc on modified edit form shows confirmation
  → Press e → Modify title → Esc → Assert "Discard changes?" confirmation → y → Assert form closed

KEY-WIKI-DET-013: Esc on modified edit form with n keeps form open
  → Press e → Modify title → Esc → Assert confirmation → n → Assert form still open with changes intact

KEY-WIKI-DET-014: Tab navigates edit form fields
  → Press e → Assert title focused → Tab → Assert slug focused → Tab → Assert body focused → Shift+Tab → Assert slug focused

KEY-WIKI-DET-015: d opens delete confirmation
  → Press d → Assert confirmation dialog with page title

KEY-WIKI-DET-016: y confirms deletion
  → Press d → y → Assert navigation pops to wiki list

KEY-WIKI-DET-017: n cancels deletion
  → Press d → n → Assert dialog dismissed → Assert detail view still visible

KEY-WIKI-DET-018: R retries failed fetch
  → Navigate to wiki page with API failing → Assert error → R → Assert loading spinner → Assert data loads

KEY-WIKI-DET-019: q pops back to wiki list
  → Navigate to wiki page from list → q → Assert wiki list is current screen

KEY-WIKI-DET-020: ? shows help overlay
  → Press ? → Assert help overlay showing all keybindings → Esc → Assert overlay closed

KEY-WIKI-DET-021: : opens command palette
  → Press : → Assert command palette modal

KEY-WIKI-DET-022: Edit form slug validation
  → Press e → Set slug to "INVALID SLUG!" → Ctrl+S → Assert validation error on slug field

KEY-WIKI-DET-023: Edit form empty title validation
  → Press e → Clear title → Ctrl+S → Assert validation error on title field

KEY-WIKI-DET-024: Edit submission with optimistic rollback
  → Press e → Modify title → Ctrl+S → Mock API 500 → Assert title reverts → Assert error toast → Assert form reopens
```

### Responsive resize tests

```
RESIZE-WIKI-DET-001: 120x40 → 80x24 hides slug and collapses metadata
  → Assert full metadata with slug → Resize to 80x24 → Assert slug hidden, compact metadata

RESIZE-WIKI-DET-002: 80x24 → 120x40 reveals slug and expands metadata
  → Assert compact → Resize to 120x40 → Assert slug visible, both timestamps shown

RESIZE-WIKI-DET-003: 120x40 → 200x60 expands layout
  → Resize → Assert wider content, full timestamps, generous padding

RESIZE-WIKI-DET-004: Scroll position preserved through resize
  → Scroll to middle of body → Resize → Assert same content still visible

RESIZE-WIKI-DET-005: Title rewraps on resize
  → Long title at 120 wide (2 lines) → Resize to 80 (3 lines) → Assert clean rewrap

RESIZE-WIKI-DET-006: Rapid resize without artifacts
  → 120x40 → 80x24 → 200x60 → 100x30 → 150x45 → Assert clean layout at 150x45

RESIZE-WIKI-DET-007: Edit form adapts to resize
  → Open edit form → Resize → Assert form dimensions adjust, textarea content preserved

RESIZE-WIKI-DET-008: Below minimum shows too-small message
  → Resize to 60x20 → Assert "Terminal too small" message

RESIZE-WIKI-DET-009: Edit form at compact size
  → Resize to 80x24 → Press e → Assert edit form uses 90% width instead of 80%
```

### Data loading tests

```
DATA-WIKI-DET-001: Page data loads on mount
  → Navigate to wiki page → Assert GET /api/repos/:owner/:repo/wiki/:slug called

DATA-WIKI-DET-002: Data cached on re-navigation
  → Load wiki detail → q back → re-navigate within 30s → Assert no loading spinner

DATA-WIKI-DET-003: 404 handling
  → Navigate to non-existent slug → Assert 404 screen

DATA-WIKI-DET-004: 401 auth error
  → Expired token → Navigate to wiki page → Assert "Session expired" message

DATA-WIKI-DET-005: Edit updates detail view
  → Edit title and body → Submit → Assert detail view reflects new title and body

DATA-WIKI-DET-006: Delete navigates to list
  → Delete page → Assert navigation stack pops to wiki list → Assert deleted page absent from list

DATA-WIKI-DET-007: Slug conflict on edit
  → Edit slug to existing page's slug → Submit → Assert "A page with this slug already exists" error

DATA-WIKI-DET-008: Page navigation loads correct data
  → Press ] → Assert new page slug visible → Assert new page body rendered

DATA-WIKI-DET-009: Optimistic edit persists on success
  → Edit title → API returns 200 → Assert updated title shown

DATA-WIKI-DET-010: Optimistic delete rollback on failure
  → Press d → y → API returns 500 → Assert navigation returns to detail view → Assert error toast
```

### Edge case tests

```
EDGE-WIKI-DET-001: Wiki page with extremely long title (500+ chars) → wraps correctly, no overflow
EDGE-WIKI-DET-002: Wiki page body with 100k+ characters → truncated with notice
EDGE-WIKI-DET-003: Unicode/emoji in title and body → no terminal corruption
EDGE-WIKI-DET-004: Null/undefined body field → shows "This page has no content." (not "null" or "undefined")
EDGE-WIKI-DET-005: Body with only whitespace → treated as empty, shows "This page has no content."
EDGE-WIKI-DET-006: Slug with maximum length (80+ chars) → truncated with … on display
EDGE-WIKI-DET-007: Rapid j/k key repeats → smooth scrolling without dropped frames
EDGE-WIKI-DET-008: Concurrent resize + edit form → form re-renders, content preserved
EDGE-WIKI-DET-009: Markdown with deeply nested lists (10+ levels) → renders without crash, truncated nesting
EDGE-WIKI-DET-010: Body with raw ANSI escape codes → escaped, not interpreted
EDGE-WIKI-DET-011: Wiki page with special characters in slug (already sanitized by API) → renders correctly
EDGE-WIKI-DET-012: Page title containing markdown syntax → rendered as plain text in header (not interpreted)
EDGE-WIKI-DET-013: Write actions disabled for read-only users → e, d keys are no-ops; hints hidden from status bar
EDGE-WIKI-DET-014: Relative timestamp edge cases → "just now" (<60s), "1m ago" (60s), "59m ago", "1h ago", "23h ago", "1d ago", "30d ago", "Jan 15, 2025" (>30d)
EDGE-WIKI-DET-015: Page navigation with only 1 page in wiki → both [ and ] show boundary indicator
EDGE-WIKI-DET-016: Edit form with body containing backticks and markdown → textarea preserves raw content
```
