# TUI_LOADING_STATES

Specification for TUI_LOADING_STATES.

## High-Level User POV

When a terminal user interacts with the Codeplane TUI, every transition that requires fetching data from the API is accompanied by a clear, predictable loading indicator. The TUI never shows a blank content area — if data is not yet available, the user always sees feedback that something is happening.

There are three tiers of loading experience, each designed for a different interaction context:

**Full-screen loading.** When the user navigates to a new screen — pushes an issue detail, opens a repository, or arrives at the dashboard — and the screen's data is not yet available, they see a centered spinner with a label describing what is loading (e.g., "Loading issues…", "Loading repository…"). The header bar and status bar remain stable during this transition; only the content area between them displays the spinner. The spinner uses animated braille characters (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) cycling at 80ms intervals, rendered in the `primary` color. On terminals without Unicode support (`TERM=dumb` or `NO_COLOR=1`), the spinner falls back to ASCII characters (`|/-\`). The user can press `q` to navigate back (pop the screen) at any time during loading, and `Ctrl+C` always exits immediately. If the fetch fails, the loading spinner is replaced by an inline error message with a retry hint.

**Inline list loading.** When the user scrolls to the bottom of a list — issues, landing requests, notifications, repositories, workflow runs — and more pages are available, a "Loading more…" indicator appears at the bottom of the scrollbox. The indicator is a single row showing the braille spinner followed by "Loading more…" in `muted` color. The user can continue to scroll up through already-loaded items while the next page loads. When the new page arrives, the items are appended below the indicator, the indicator disappears, and the scroll position is preserved. If the pagination fetch fails, the indicator is replaced with "Failed to load — R to retry" in `error` color.

**Action loading.** When the user performs a mutation — submitting a form, closing an issue, marking a notification as read, canceling a workflow run — the button or action target shows inline loading feedback. Submit buttons display a spinner followed by "Saving…" in place of their normal label. Action keybindings (like `c` to close an issue) cause the affected list row to show a spinner next to the item title until the operation completes. Optimistic UI is applied: the local state updates immediately (e.g., issue appears as closed), and if the server rejects the mutation, the state reverts with a visible error message in the status bar. The user is never blocked from navigating away during an action — the mutation continues in the background and the result is reflected when the user returns.

**Skeleton rendering.** For screens that have a predictable structure — list views, detail views with known sections — the TUI renders a skeleton layout before data arrives. Skeleton rows in list views display placeholder lines using `muted` color block characters (`▓▓▓▓▓▓▓▓`) of varying widths to suggest content shape. Detail view skeletons show section headers with placeholder body text. Skeletons transition seamlessly to real content when data arrives, with no visible flicker. Skeleton rendering is a progressive enhancement: it is shown instead of the full-screen spinner when the screen layout is known in advance.

All loading indicators are non-blocking. The user can always press `q` to go back, `?` for help, `:` to open the command palette, or use go-to keybindings (`g d`, `g r`, etc.) even while loading is in progress. Loading is canceled automatically when the user navigates away from a screen.

## Acceptance Criteria

### Definition of Done

- [ ] Full-screen loading spinner is displayed in the content area when a screen's data hook returns a loading state
- [ ] Full-screen spinner uses braille animation frames (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) cycling at 80ms intervals
- [ ] Full-screen spinner is rendered in `primary` color (ANSI 33)
- [ ] Full-screen spinner includes a context-specific label describing what is loading (e.g., "Loading issues…", "Loading repository…")
- [ ] The loading label is always an ellipsis-terminated present participle (e.g., "Loading …", never "Please wait" or "Fetching")
- [ ] Header bar and status bar remain stable and fully functional during full-screen loading
- [ ] Skeleton rendering is displayed for list views and detail views when the screen layout is deterministic
- [ ] Skeleton list rows use `muted` color block characters (`▓`) at randomized widths (40%–90% of available width) to suggest content shape
- [ ] Skeleton detail sections show section headers with placeholder body blocks
- [ ] Skeletons transition to real content without visible flicker (no intermediate blank frame)
- [ ] Inline "Loading more…" indicator appears at the bottom of scrollbox lists when paginating
- [ ] Inline loading indicator shows braille spinner + "Loading more…" text in `muted` color
- [ ] The user can continue scrolling through loaded items while pagination fetch is in progress
- [ ] New paginated items appear below the loading indicator; indicator disappears on completion
- [ ] Scroll position is preserved when new paginated items are appended
- [ ] Action buttons display a spinner + "Saving…" label during form submissions
- [ ] Action keybindings show an inline spinner on the affected list row during mutations
- [ ] Optimistic UI is applied for mutations: local state updates immediately, reverts on server error
- [ ] When optimistic UI reverts, a red error message is displayed in the status bar for 5 seconds
- [ ] Loading is canceled automatically when the user navigates away from the screen (unmount cancels in-flight fetches)
- [ ] All global keybindings (`q`, `?`, `:`, `Ctrl+C`, `g` prefix) remain active during loading states
- [ ] `q` during full-screen loading pops the screen and cancels the in-flight request
- [ ] `R` retries a failed request from inline error states (full-screen error, pagination error)
- [ ] Multiple concurrent loading states are supported (e.g., screen loading + notification badge SSE update)

### Terminal Edge Cases

- [ ] At minimum terminal size (80×24), the full-screen spinner and label are vertically and horizontally centered in the content area (22 usable rows)
- [ ] At minimum terminal size, skeleton rows are truncated to fit within 80 columns with no horizontal overflow
- [ ] At minimum terminal size, the inline pagination indicator fits on a single row within the scrollbox
- [ ] If the terminal is resized during full-screen loading, the spinner re-centers at the new dimensions without restarting the fetch
- [ ] If the terminal is resized during skeleton rendering, skeleton row widths recalculate to match the new terminal width
- [ ] On terminals without color support (`TERM=dumb` or `NO_COLOR=1`), the spinner uses ASCII characters (`|/-\`) at 120ms intervals
- [ ] On terminals without color support, skeleton rows use dash characters (`----`) instead of block characters
- [ ] On terminals without color support, loading state text uses plain text without ANSI escape sequences
- [ ] Rapid key input during loading is buffered and processed; `Ctrl+C` is always processed immediately regardless of input queue depth
- [ ] If the API returns data before the first spinner frame renders (sub-80ms response), the spinner is never shown — content renders directly

### Boundary Constraints

- [ ] Loading labels are capped at `terminal_width - 6` characters (spinner + space + label + padding); longer labels are truncated with ellipsis
- [ ] Skeleton list views render a maximum of `visible_rows` placeholder rows (no off-screen skeleton rendering)
- [ ] Skeleton row placeholder widths are deterministic per row index (seeded by index, not random per render) to prevent flicker on re-render
- [ ] Inline pagination indicator text ("Loading more…" or error text) is capped at `terminal_width - 4` characters
- [ ] Action loading spinner ("Saving…") replaces button text in-place without changing the button's rendered width; if the button was narrower than "⠋ Saving…" (10 chars), the button width expands to fit
- [ ] Optimistic UI revert error messages in the status bar are capped at `terminal_width - 20` characters (leaving room for other status bar elements)
- [ ] The error message format for failed fetches is: `✗ {error_summary}` where `error_summary` is the HTTP status text or network error description, truncated to 60 characters
- [ ] Retry hint format is always: `R retry` — displayed in the status bar keybinding hints area when a retriable error is showing
- [ ] The full-screen loading spinner does not block for more than 30 seconds; after 30 seconds, it transitions to an error state with "Request timed out" and a retry prompt

## Design

### Full-Screen Loading Layout

```
┌─────────────────────────────────────────────────┐
│ Dashboard › acme/widget › Issues   acme/widget  │
├─────────────────────────────────────────────────┤
│                                                 │
│                                                 │
│                                                 │
│                                                 │
│               ⠋ Loading issues…                 │
│                                                 │
│                                                 │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ q back                              ● [3] ? help│
└─────────────────────────────────────────────────┘
```

**OpenTUI component tree (full-screen loading):**

```tsx
<box flexDirection="column" width="100%" height="100%">
  <HeaderBar />
  <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
    <text>
      <text color="primary">{spinnerFrame}</text>
      <text> {loadingLabel}</text>
    </text>
  </box>
  <StatusBar hints={["q back"]} />
</box>
```

### Skeleton List Loading Layout

```
┌─────────────────────────────────────────────────┐
│ Dashboard › Repositories               ● [3] ?  │
├─────────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   ▓▓▓▓▓▓   ▓▓▓▓▓   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓         ▓▓▓▓▓▓   ▓▓▓▓▓   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓      ▓▓▓▓▓▓   ▓▓▓▓▓   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓              ▓▓▓▓▓▓   ▓▓▓▓▓   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓     ▓▓▓▓▓▓   ▓▓▓▓▓   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓            ▓▓▓▓▓▓   ▓▓▓▓▓   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓       ▓▓▓▓▓▓   ▓▓▓▓▓   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓        ▓▓▓▓▓▓   ▓▓▓▓▓   │
│                                                 │
├─────────────────────────────────────────────────┤
│ q back │ / search                    ● [3] ? help│
└─────────────────────────────────────────────────┘
```

**OpenTUI component tree (skeleton list):**

```tsx
<box flexDirection="column" width="100%" height="100%">
  <HeaderBar />
  <scrollbox flexGrow={1}>
    <box flexDirection="column">
      {skeletonRows.map((row, i) => (
        <box key={i} flexDirection="row" height={1} paddingX={1}>
          <text color="muted">{"▓".repeat(row.titleWidth)}</text>
          <box flexGrow={1} />
          <text color="muted">{"▓".repeat(row.metaWidth)}</text>
          <text>  </text>
          <text color="muted">{"▓".repeat(row.statusWidth)}</text>
        </box>
      ))}
    </box>
  </scrollbox>
  <StatusBar hints={["q back", "/ search"]} />
</box>
```

### Inline Pagination Loading

```
│  ● Fix login page CSS          open    2h ago   │
│  ● Add dark mode support       open    1d ago   │
│  ● Refactor auth module        open    5d ago   │
│  ⠋ Loading more…                                │
```

```tsx
<scrollbox flexGrow={1} onScrollEnd={handleLoadMore}>
  <box flexDirection="column">
    {items.map((item) => (
      <ListRow key={item.id} item={item} focused={item.id === focusedId} />
    ))}
    {paginationStatus === "loading" && (
      <box height={1} paddingX={1}>
        <text color="muted">
          <text color="primary">{spinnerFrame}</text>
          <text> Loading more…</text>
        </text>
      </box>
    )}
    {paginationStatus === "error" && (
      <box height={1} paddingX={1}>
        <text color="error">✗ Failed to load — R to retry</text>
      </box>
    )}
  </box>
</scrollbox>
```

### Action Loading (Button)

```tsx
<box flexDirection="row" gap={2}>
  {isSubmitting ? (
    <text><text color="primary">{spinnerFrame}</text><text> Saving…</text></text>
  ) : (
    <button onPress={handleSubmit}>Submit</button>
  )}
  <button onPress={handleCancel}>Cancel</button>
</box>
```

### Full-Screen Error (After Loading Failure)

```
│              ✗ Failed to load issues             │
│         Internal Server Error (500)             │
```

```tsx
<box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
  <text bold color="error">✗ Failed to load {screenLabel}</text>
  <text />
  <text color="muted">{errorSummary}</text>
</box>
```

### Keybindings

| Context | Key | Action |
|---------|-----|--------|
| Full-screen loading | `q` | Pop screen and cancel in-flight fetch |
| Full-screen loading | `Ctrl+C` | Quit TUI immediately |
| Full-screen loading | `?` | Toggle help overlay |
| Full-screen loading | `:` | Open command palette |
| Full-screen loading | `g` + key | Go-to navigation (push new screen, cancel current load) |
| Full-screen error | `q` | Pop screen (go back) |
| Full-screen error | `R` | Retry the failed request |
| Full-screen error | `Ctrl+C` | Quit TUI immediately |
| Full-screen error | `?` | Toggle help overlay |
| Full-screen error | `:` | Open command palette |
| Pagination error | `R` | Retry loading the next page |
| Action loading | All keys | Normal behavior — user is never blocked by action loading |

### Terminal Resize Behavior

- **Full-screen spinner**: Re-centers at new dimensions. In-flight fetch is not restarted.
- **Skeleton rendering**: Row widths recalculated. Row count adjusts to fill new content area height.
- **Inline pagination indicator**: Re-renders at new width.
- **Full-screen error**: Error text re-centers at new dimensions.
- **Minimum size (80×24)**: All loading states fit comfortably.
- **Sub-minimum (< 80×24)**: Handled by global responsive layout, not loading states.

### Data Hooks

| Hook / Function | Source | Purpose |
|----------------|--------|----------|
| `useRepos()` | `@codeplane/ui-core` | Repository list; exposes `isLoading`, `error`, `data`, `fetchMore` |
| `useIssues()` | `@codeplane/ui-core` | Issue list; exposes `isLoading`, `error`, `data`, `fetchMore` |
| `useLandings()` | `@codeplane/ui-core` | Landing request list; exposes `isLoading`, `error`, `data`, `fetchMore` |
| `useNotifications()` | `@codeplane/ui-core` | Notification inbox; exposes `isLoading`, `error`, `data`, `fetchMore` |
| `useSearch()` | `@codeplane/ui-core` | Search results; exposes `isLoading`, `error`, `data` |
| `useUser()` | `@codeplane/ui-core` | User profile; exposes `isLoading`, `error`, `data` |
| `useWorkflows()` | `@codeplane/ui-core` | Workflow list; exposes `isLoading`, `error`, `data`, `fetchMore` |
| `useTerminalDimensions()` | `@opentui/react` | Current terminal width/height for centering and skeleton sizing |
| `useOnResize()` | `@opentui/react` | Re-render loading states on terminal resize |
| `useTimeline()` | `@opentui/react` | Spinner animation frame cycling |
| `useKeyboard()` | `@opentui/react` | Handle `R` retry, `q` back, `Ctrl+C` quit during loading states |

### Shared Spinner Hook

A `useSpinner(active: boolean)` hook drives all spinner animations using `useTimeline()`. Returns the current frame character (braille or ASCII depending on terminal). Pauses when `active` is `false`. All spinners on screen share the same frame via context (synchronized).

### Loading State Context Provider

A `<LoadingProvider>` wraps screen content areas providing `registerLoading`, `unregisterLoading`, `registerMutation`, `completeMutation`, `spinnerFrame`, and `isScreenLoading`.

## Permissions & Security

### Authorization

- **No specific role requirement**: Loading states are a presentation concern and do not require any authorization role. The underlying data hooks enforce authorization; loading states simply reflect the data hook's state.
- **Token-based auth**: The TUI uses token-based authentication. Loading states display while API requests authenticated with the stored token are in-flight. If a request returns 401 during loading, the loading state transitions to an error state with auth remediation messaging (handled by the global error boundary, not loading states).

### Rate Limiting

- **Pagination requests** are subject to the standard API rate limit. If rate-limited (HTTP 429), the pagination loading indicator transitions to an error state showing "Rate limited — try again later" with `R` retry.
- **Retry debouncing**: The `R` retry keybinding is debounced at 1 second. Pressing `R` multiple times within 1 second triggers only one retry request.
- **Automatic pagination** does not trigger on rapid scroll: only fires when user is within 80% of scrollbox content height, and no pagination request is initiated if one is already in-flight.
- **No retry loops**: All retries are user-initiated. The TUI never automatically retries a failed request.

### Token Handling

- Loading states do not access, display, or log the auth token. They only consume the `isLoading`, `error`, and `data` fields from data hooks.
- Error messages displayed during loading failures never include request headers, tokens, or internal server details. Only the HTTP status text or a generic network error description is shown.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.loading.screen_started` | Full-screen loading spinner becomes visible | `{ screen, label, terminal_width, terminal_height, timestamp }` |
| `tui.loading.screen_completed` | Full-screen loading completes (data arrived) | `{ screen, label, duration_ms, source: "api"\|"cache" }` |
| `tui.loading.screen_failed` | Full-screen loading results in error | `{ screen, label, duration_ms, error_type, http_status? }` |
| `tui.loading.screen_cancelled` | User navigated away during full-screen loading | `{ screen, label, duration_ms, cancel_method: "back"\|"goto"\|"command_palette" }` |
| `tui.loading.skeleton_shown` | Skeleton rendering displayed instead of spinner | `{ screen, skeleton_type: "list"\|"detail", row_count }` |
| `tui.loading.pagination_started` | Inline pagination loading begins | `{ screen, page_number, items_loaded }` |
| `tui.loading.pagination_completed` | Pagination page loaded successfully | `{ screen, page_number, items_loaded, new_items, duration_ms }` |
| `tui.loading.pagination_failed` | Pagination fetch failed | `{ screen, page_number, duration_ms, error_type, http_status? }` |
| `tui.loading.action_started` | Action mutation begins | `{ screen, action, entity_type }` |
| `tui.loading.action_completed` | Action mutation succeeds | `{ screen, action, entity_type, duration_ms, optimistic: bool }` |
| `tui.loading.action_failed` | Action mutation fails (including optimistic revert) | `{ screen, action, entity_type, duration_ms, error_type, http_status?, reverted: bool }` |
| `tui.loading.retry` | User pressed R to retry | `{ screen, retry_context: "screen"\|"pagination", attempt_number }` |
| `tui.loading.timeout` | Loading state exceeded 30-second timeout | `{ screen, label, timeout_ms: 30000 }` |

### Event Properties (Common)

- `screen`: Screen identifier (e.g., `"issues"`, `"repository"`, `"dashboard"`)
- `label`: Loading label text (e.g., `"Loading issues…"`)
- `duration_ms`: Time from loading start to completion/failure/cancellation
- `terminal_width`, `terminal_height`: Terminal dimensions at event time
- `error_type`: One of `"network"`, `"timeout"`, `"http_error"`, `"auth_error"`, `"rate_limited"`
- `http_status`: HTTP status code when applicable

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Screen load time (p50) | < 300ms | Median time from navigation to content rendered |
| Screen load time (p95) | < 1500ms | 95th percentile screen load time |
| Screen load failure rate | < 2% | Percentage of screen loads that result in error |
| Pagination load time (p50) | < 200ms | Median time for loading the next page |
| Pagination failure rate | < 1% | Percentage of pagination requests that fail |
| Action mutation time (p50) | < 500ms | Median time for action mutations |
| Optimistic revert rate | < 3% | Percentage of optimistic mutations that revert |
| Skeleton usage rate | > 80% | Percentage of screen loads that display skeleton instead of spinner |
| Loading cancellation rate | Informational | Percentage of screen loads cancelled by user navigation |
| Retry success rate | > 70% | Percentage of user retries that succeed |
| Timeout rate | < 0.5% | Percentage of screen loads that hit the 30-second timeout |

## Observability

### Logging

| Level | Event | Message Format |
|-------|-------|----------------|
| `debug` | Screen loading started | `loading: screen {screen} started, label="{label}"` |
| `debug` | Screen loading completed | `loading: screen {screen} completed in {duration_ms}ms` |
| `debug` | Skeleton rendered | `loading: skeleton rendered for {screen}, type={skeleton_type}, rows={row_count}` |
| `debug` | Pagination started | `loading: pagination for {screen}, page={page_number}` |
| `debug` | Pagination completed | `loading: pagination for {screen} completed, {new_items} new items in {duration_ms}ms` |
| `debug` | Action mutation started | `loading: action {action} started on {entity_type}` |
| `info` | Action mutation completed | `loading: action {action} completed on {entity_type} in {duration_ms}ms` |
| `warn` | Screen loading failed | `loading: screen {screen} failed: {error_type} {http_status?} — {error_message}` |
| `warn` | Pagination failed | `loading: pagination for {screen} failed: {error_type} {http_status?}` |
| `warn` | Action mutation failed | `loading: action {action} failed on {entity_type}: {error_type} — reverting optimistic update` |
| `warn` | Loading timeout | `loading: screen {screen} timed out after 30000ms` |
| `warn` | Rate limited | `loading: {screen} rate limited (HTTP 429), retry available` |
| `error` | Optimistic revert error | `loading: optimistic revert failed for {action} on {entity_type}: {error_message}` |

Logs are written to `stderr` and are not displayed in the TUI interface. They can be captured with `codeplane tui 2>tui.log`.

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| API request timeout (30s) | `AbortController` timeout | Transition to full-screen error with "Request timed out" and `R retry` |
| HTTP 500 / server error | Response status >= 500 | Transition to full-screen error with status text and `R retry` |
| HTTP 401 / auth error | Response status 401 | Defer to global error boundary: "Session expired. Run `codeplane auth login`" |
| HTTP 429 / rate limited | Response status 429 | Show "Rate limited — try again later" with `R retry` |
| Network unreachable | `fetch()` throws `TypeError` | Transition to full-screen error with "Network error" and `R retry` |
| DNS resolution failure | `fetch()` throws | Same as network unreachable |
| SSE disconnect during screen load | SSE connection drops | No impact on screen loading (SSE is independent). Status bar shows disconnect indicator |
| Terminal resize during loading | Resize event | Re-render at new dimensions. In-flight fetch continues uninterrupted |
| Terminal resize during skeleton | Resize event | Recalculate skeleton widths and row count for new dimensions |
| User navigates away during loading | Screen unmount | Cancel in-flight fetch via `AbortController`. No error displayed |
| Pagination request while previous is in-flight | Scroll-to-end fires again | Ignored — no duplicate request initiated |
| Optimistic mutation conflict | Server returns 409 | Revert local state, show conflict error in status bar |
| Rapid retry presses | Multiple `R` within 1s | Debounced — only first press triggers request |
| Empty response from API | Response body is empty or `null` | Treat as error: "No data returned" with `R retry` |
| Malformed API response | JSON parse error | Treat as error: "Invalid response" with `R retry` |

### Failure Modes

- **Cascading timeout**: If the API server is unreachable, all screen loads will time out at 30 seconds. Each screen load is independent; timing out on one screen does not affect other screens.
- **Memory stability**: Loading states are cleaned up on screen unmount. Skeleton rows are not kept in memory after real data arrives. Cancelled fetches do not leak promises or state updates.
- **Spinner CPU usage**: The spinner animation uses `useTimeline()` driven by the renderer's frame callback. When no spinner is visible, no animation frames are requested. Multiple concurrent spinners share the same frame context.
- **Optimistic revert race**: If the user navigates away before an optimistic revert completes, the revert error is logged but no status bar message is displayed.

## Verification

### Test File

`e2e/tui/app-shell.test.ts` — tests for `TUI_LOADING_STATES` within the app shell test suite.

### Terminal Snapshot Tests

```
TEST: "full-screen loading spinner renders centered with label"
  - Launch TUI and navigate to a screen with delayed API response (500ms)
  - Capture terminal snapshot during loading
  - Assert snapshot shows spinner character and loading label centered in content area
  - Assert header bar and status bar are rendered normally
  - Sizes: 80x24, 120x40, 200x60

TEST: "full-screen loading spinner uses primary color"
  - Launch TUI and navigate to a screen with delayed API response
  - Capture terminal snapshot during loading
  - Assert spinner character is rendered with ANSI color 33 (primary/blue)
  - Assert loading label text uses default foreground color

TEST: "skeleton list renders placeholder rows with muted block characters"
  - Launch TUI and navigate to a list screen (e.g., issues) with delayed API response
  - Capture terminal snapshot during skeleton phase
  - Assert skeleton rows are visible with ▓ block characters in muted color
  - Assert skeleton rows have varying widths (not all identical)
  - Assert number of skeleton rows does not exceed visible content area height
  - Sizes: 80x24, 120x40, 200x60

TEST: "skeleton detail renders section headers with placeholder blocks"
  - Launch TUI and navigate to a detail screen (e.g., issue detail) with delayed API response
  - Capture terminal snapshot during skeleton phase
  - Assert section header text is visible (e.g., "Description", "Comments")
  - Assert placeholder blocks appear under section headers
  - Sizes: 80x24, 120x40, 200x60

TEST: "skeleton transitions to real content without flicker"
  - Launch TUI and navigate to a list screen with delayed API response
  - Capture terminal snapshot during skeleton phase
  - Wait for API response
  - Capture terminal snapshot after data arrives
  - Assert no blank frame exists between skeleton and real content

TEST: "inline pagination loading indicator at list bottom"
  - Launch TUI, navigate to a list screen, load first page
  - Scroll to bottom of list to trigger pagination
  - Capture terminal snapshot while pagination is loading
  - Assert "Loading more…" indicator appears at the bottom of the list with spinner
  - Sizes: 80x24, 120x40, 200x60

TEST: "pagination error indicator shows retry hint"
  - Launch TUI, navigate to a list screen, load first page
  - Configure API to return 500 for next page
  - Scroll to bottom of list to trigger pagination
  - Wait for pagination error
  - Capture terminal snapshot
  - Assert "Failed to load — R to retry" appears in error color at list bottom

TEST: "action loading shows spinner on submit button"
  - Launch TUI, navigate to a form screen (e.g., issue create)
  - Fill out form and trigger submit
  - Capture terminal snapshot while mutation is in flight
  - Assert submit button shows spinner + "Saving…" text
  - Assert cancel button remains visible and interactive

TEST: "action loading shows spinner on list row during mutation"
  - Launch TUI, navigate to issue list
  - Trigger close action on focused issue
  - Capture terminal snapshot while mutation is in flight
  - Assert spinner appears next to the issue title in the focused row

TEST: "full-screen error renders after failed load"
  - Launch TUI and navigate to a screen with API returning 500
  - Capture terminal snapshot
  - Assert error icon (✗) and "Failed to load" message are visible
  - Assert error summary text (e.g., "Internal Server Error (500)") is visible
  - Assert status bar shows "R retry" hint
  - Sizes: 80x24, 120x40, 200x60

TEST: "optimistic revert shows error in status bar"
  - Launch TUI, navigate to issue list
  - Trigger close action on an issue (optimistic update applied)
  - API returns error for close mutation
  - Capture terminal snapshot after revert
  - Assert issue appears in original state (reopened)
  - Assert status bar shows error message in red

TEST: "loading screen shows context-specific label"
  - Navigate to issues screen → assert label is "Loading issues…"
  - Navigate to repository screen → assert label is "Loading repository…"
  - Navigate to notifications screen → assert label is "Loading notifications…"
  - Navigate to workflows screen → assert label is "Loading workflows…"

TEST: "no-color terminal uses ASCII spinner"
  - Set NO_COLOR=1
  - Launch TUI and navigate to a screen with delayed API response
  - Capture terminal snapshot during loading
  - Assert spinner uses ASCII characters (|, /, -, \) not braille characters

TEST: "loading timeout transitions to error after 30 seconds"
  - Launch TUI and navigate to a screen with API that never responds
  - Wait 30 seconds
  - Capture terminal snapshot
  - Assert error screen shows "Request timed out"
  - Assert "R retry" hint is visible
```

### Keyboard Interaction Tests

```
TEST: "q pops screen during full-screen loading"
  - Launch TUI and navigate to a screen with delayed API response
  - Send 'q' keypress during loading
  - Assert previous screen is restored
  - Assert in-flight fetch is canceled

TEST: "Ctrl+C exits TUI during full-screen loading"
  - Launch TUI and navigate to a screen with delayed API response
  - Send Ctrl+C during loading
  - Assert TUI process exits with code 0

TEST: "R retries from full-screen error"
  - Launch TUI and navigate to a screen with API returning 500
  - Wait for error screen
  - Configure API to succeed on next request
  - Send 'R' keypress
  - Assert loading spinner appears (retry in progress)
  - Assert screen loads successfully with data

TEST: "R retries from pagination error"
  - Navigate to list, scroll to bottom with failing pagination API
  - Wait for pagination error
  - Configure API to succeed on next request
  - Send 'R' keypress
  - Assert pagination loading indicator reappears
  - Assert new items load successfully

TEST: "R retry is debounced during full-screen error"
  - Navigate to a screen with API returning 500
  - Wait for error screen
  - Send 'R' 'R' 'R' rapidly (within 200ms)
  - Assert only one retry request is made to the API

TEST: "? opens help overlay during full-screen loading"
  - Navigate to a screen with delayed API response
  - Send '?' keypress during loading
  - Assert help overlay appears
  - Send Esc to close
  - Assert loading state is still active

TEST: ": opens command palette during full-screen loading"
  - Navigate to a screen with delayed API response
  - Send ':' keypress during loading
  - Assert command palette overlay appears
  - Send Esc to close
  - Assert loading state is still active

TEST: "go-to keybinding during loading navigates away"
  - Navigate to a screen with delayed API response
  - Send 'g' 'n' (go-to notifications) during loading
  - Assert in-flight fetch is canceled
  - Assert notifications screen begins loading

TEST: "user can scroll through loaded items during pagination loading"
  - Navigate to list, load first page, scroll to bottom to trigger pagination
  - During pagination, send 'k' to scroll up
  - Assert focus moves up through already-loaded items
  - Assert pagination continues in background

TEST: "user can navigate away during action loading"
  - Trigger form submission (action loading in progress)
  - Send 'q' keypress to navigate back
  - Assert previous screen is restored
  - Assert mutation continues in background (not canceled)

TEST: "Ctrl+C exits TUI during action loading"
  - Trigger form submission
  - Send Ctrl+C during action loading
  - Assert TUI process exits with code 0

TEST: "fast API response skips spinner (content renders directly)"
  - Configure API to respond in < 50ms
  - Navigate to a new screen
  - Capture terminal snapshots at each frame
  - Assert no frame contains the loading spinner — content renders directly
```

### Responsive Tests

```
TEST: "full-screen loading layout at 80x24"
  - Launch TUI at 80×24 and navigate to screen with delayed API
  - Capture snapshot during loading
  - Assert spinner + label are centered in 78-column × 22-row content area
  - Assert header bar is row 1, status bar is row 24

TEST: "full-screen loading layout at 120x40"
  - Launch TUI at 120×40 and navigate to screen with delayed API
  - Capture snapshot during loading
  - Assert spinner + label are centered in 118-column × 38-row content area

TEST: "full-screen loading layout at 200x60"
  - Launch TUI at 200×60 and navigate to screen with delayed API
  - Capture snapshot during loading
  - Assert spinner + label are centered in 198-column × 58-row content area

TEST: "skeleton list adapts row widths at 80x24"
  - Launch TUI at 80×24 and navigate to list screen with delayed API
  - Capture snapshot during skeleton
  - Assert skeleton row block widths are proportional to 80-column width
  - Assert no horizontal overflow

TEST: "skeleton list adapts row widths at 200x60"
  - Launch TUI at 200×60 and navigate to list screen with delayed API
  - Capture snapshot during skeleton
  - Assert skeleton row block widths are proportional to 200-column width
  - Assert skeleton rows fill more of the available width

TEST: "resize during full-screen loading re-centers spinner"
  - Launch TUI at 120×40 and navigate to screen with delayed API
  - Resize terminal to 80×24 during loading
  - Capture snapshot
  - Assert spinner is re-centered at new dimensions
  - Assert fetch was not restarted

TEST: "resize during skeleton recalculates row widths"
  - Launch TUI at 120×40 and navigate to list screen with delayed API
  - Capture skeleton snapshot at 120×40
  - Resize terminal to 80×24
  - Capture skeleton snapshot at 80×24
  - Assert skeleton row widths changed proportionally
  - Assert number of visible skeleton rows adjusted to new height

TEST: "resize during full-screen error re-centers error text"
  - Launch TUI at 120×40 and navigate to screen with API error
  - Resize terminal to 80×24
  - Capture snapshot
  - Assert error text is re-centered at new dimensions

TEST: "pagination indicator renders correctly at 80x24"
  - Launch TUI at 80×24, load list, scroll to trigger pagination
  - Capture snapshot during pagination loading
  - Assert "Loading more…" indicator fits on single row within 80 columns

TEST: "action loading button at minimum terminal width"
  - Launch TUI at 80×24, navigate to form
  - Trigger submit
  - Capture snapshot
  - Assert "Saving…" button fits within available width
```
