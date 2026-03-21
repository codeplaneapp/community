# TUI_HEADER_BAR

Specification for TUI_HEADER_BAR.

## High-Level User POV

The header bar is the persistent top-of-screen chrome that orients the user within the Codeplane TUI at all times. It occupies a single row at the very top of the terminal and is visible on every screen — it is never hidden, scrolled away, or replaced by content.

The header bar is divided into three zones. On the left, a breadcrumb trail shows where the user is in the navigation stack. A user who navigates from the Dashboard into a repository, then into its Issues list, and then into issue #42, sees `Dashboard › acme/widget › Issues › #42` rendered as a path that makes the stack depth immediately clear. Each `›` separator visually segments the hierarchy. The breadcrumb updates instantly on every screen push and pop — there is no transition delay.

In the center of the header bar, the current repository context is displayed when the user is operating within a repository scope. This shows the owner and repository name (e.g., `acme/widget`) and remains visible even as the user drills into sub-screens like Issues, Landings, or Workflows that belong to that repository. When the user is on a screen that has no repository context — the Dashboard, the global Search, or Settings — the center zone is empty.

On the right side, two indicators provide persistent system awareness. A connection status indicator shows whether the TUI is connected to the API server — a solid green dot for connected, a hollow red dot for disconnected. Next to it, an unread notification badge shows the count of unread notifications as a number in brackets (e.g., `[3]`). This badge updates in real-time via SSE streaming and disappears entirely when the count is zero, keeping the header clean.

The header bar consumes exactly one row of terminal height. At minimum terminal width (80 columns), the breadcrumb truncates from the left, replacing earlier segments with `…` so the current screen name always remains visible. At standard width (120+ columns) the full breadcrumb is shown. At large widths (200+ columns) the header has comfortable spacing between all three zones.

The header bar is not interactive in the traditional sense — the user does not focus it or tab into it. It is a read-only status display that responds to navigation actions and data events happening elsewhere in the application. The `q` key pops the navigation stack (reflected immediately in the breadcrumb), and `g`-prefixed go-to keybindings jump to named screens (updating the breadcrumb accordingly). The header bar is the user's compass: always visible, always current, and always accurate.

## Acceptance Criteria

### Definition of Done

- [ ] The header bar renders as a single-row `<box>` at the top of every TUI screen, consuming exactly 1 row of terminal height.
- [ ] The header bar is always visible — it is never obscured by modals, overlays, or scrollable content.
- [ ] The breadcrumb trail on the left accurately reflects the current navigation stack at all times.
- [ ] The repository context in the center displays `owner/repo` when the user is in a repository scope, and is empty otherwise.
- [ ] The connection status indicator on the right shows connected (green `●`) or disconnected (red `○`) state.
- [ ] The notification badge on the right displays the unread count in brackets (e.g., `[3]`) when count > 0 and is hidden when count is 0.
- [ ] The notification badge updates in real-time via SSE streaming without requiring manual refresh.

### Breadcrumb Behavior

- [ ] Breadcrumb segments are separated by ` › ` (space, right-pointing single angle quotation mark U+203A, space).
- [ ] Each segment corresponds to one entry in the navigation stack.
- [ ] The current (deepest) segment is rendered in the `primary` color (ANSI blue 33).
- [ ] Parent segments are rendered in `muted` color (ANSI gray 245).
- [ ] When the navigation stack changes (push or pop), the breadcrumb updates synchronously within the same render frame.
- [ ] Maximum breadcrumb string length before truncation: terminal width minus 40 characters (reserving space for center and right zones).
- [ ] Truncation replaces the leftmost segments with `… › ` so the current segment and its immediate parent are always visible.
- [ ] A single-segment breadcrumb (root screen) never truncates.
- [ ] Breadcrumb segment text is derived from screen display names, not internal route identifiers.
- [ ] Repository names in breadcrumb segments truncate with `…` if the `owner/repo` string exceeds 30 characters.

### Connection Status Indicator

- [ ] Connected state: green `●` (U+25CF) using `success` color token (ANSI 34).
- [ ] Disconnected state: red `○` (U+25CB) using `error` color token (ANSI 196).
- [ ] Status transitions happen within 1 second of actual connection state change.
- [ ] On initial load before first successful API call, the indicator shows disconnected state.
- [ ] Once connected, the indicator remains green unless a network failure or auth error occurs.

### Notification Badge

- [ ] Badge format: `[N]` where N is the unread notification count.
- [ ] Badge uses `warning` color token (ANSI 178) when count > 0.
- [ ] Badge is completely hidden (no brackets, no space) when count is 0.
- [ ] Badge updates when SSE notification events arrive, without any user action.
- [ ] Maximum displayed count: `99+` for counts exceeding 99.
- [ ] Badge is positioned to the right of the connection status indicator with a single space separator.

### Terminal Size Edge Cases

- [ ] At exactly 80 columns: breadcrumb truncates aggressively; center repo context is hidden; right zone shows only connection indicator and badge.
- [ ] At 79 columns or fewer (width < 80): the TUI shows a "terminal too small" message instead of rendering the header bar.
- [ ] At 120+ columns: full breadcrumb, center context, and right zone all display without truncation.
- [ ] At 200+ columns: layout remains left/center/right aligned with no stretching or visual artifacts.
- [ ] On terminal resize, the header bar re-renders immediately with the new width constraints.
- [ ] Vertical resize does not affect the header bar (it always occupies exactly 1 row).

### Color and Rendering Edge Cases

- [ ] On 16-color terminals (no ANSI 256 support), colors degrade gracefully: blue for primary, default for muted, green for connected, red for disconnected, yellow for badge.
- [ ] The header bar background uses the default terminal background (no explicit background color set).
- [ ] Unicode characters (`›`, `●`, `○`) render correctly in terminals supporting UTF-8.
- [ ] The header bar never wraps to a second line regardless of content length — all content is truncated to fit within one row.

### Rapid Input and Timing

- [ ] Rapid `q` keypresses (popping multiple screens quickly) produce correct intermediate breadcrumb states with no flickering or stale segments.
- [ ] Rapid `g`-prefixed navigation does not cause breadcrumb rendering glitches or race conditions.
- [ ] SSE reconnection after disconnect updates the connection indicator without requiring user interaction.

## Design

### Layout Structure

The header bar is a single `<box>` element with `flexDirection="row"` occupying the full terminal width and exactly 1 row of height. It is the first child of the root layout container.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Dashboard › acme/widget › Issues › #42                  acme/widget                                    ● [3] ? help │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```tsx
<box flexDirection="row" height={1} width="100%">
  {/* Left zone: breadcrumb */}
  <box flexGrow={1} flexShrink={1}>
    <text>
      {truncatedBreadcrumb.map((segment, i) => (
        <>
          {i > 0 && <span color="border"> › </span>}
          <span color={i === segments.length - 1 ? "primary" : "muted"}>
            {segment.label}
          </span>
        </>
      ))}
    </text>
  </box>

  {/* Center zone: repo context */}
  <box flexShrink={0} justifyContent="center">
    {repoContext && (
      <text color="muted">{repoContext}</text>
    )}
  </box>

  {/* Right zone: status indicators */}
  <box flexShrink={0} justifyContent="flex-end">
    <text>
      <span color={connected ? "success" : "error"}>
        {connected ? "●" : "○"}
      </span>
      {unreadCount > 0 && (
        <span color="warning">
          {" "}[{unreadCount > 99 ? "99+" : unreadCount}]
        </span>
      )}
    </text>
  </box>
</box>
```

### Responsive Behavior

| Terminal Width | Left Zone (Breadcrumb) | Center Zone (Repo) | Right Zone (Status) |
|---|---|---|---|
| 80–99 | Truncated from left with `…` | Hidden | Connection + badge |
| 100–119 | Truncated if > width - 40 chars | Shown if fits | Connection + badge |
| 120–199 | Full breadcrumb | Shown | Connection + badge |
| 200+ | Full breadcrumb with comfortable spacing | Shown | Connection + badge |

At minimum width, the right zone is always allocated first (it has `flexShrink={0}`), then the center zone is conditionally rendered, and the left zone fills the remaining space with truncation as needed.

### Keybindings

The header bar itself does not register any keybindings. It is a passive display component. However, it reacts to the following keybindings handled by the app shell:

| Key | Effect on Header Bar |
|-----|---------------------|
| `q` | Pops navigation stack → breadcrumb updates to show previous screen |
| `Esc` | If no modal open, pops stack → breadcrumb updates |
| `g d`, `g i`, `g l`, etc. | Pushes new screen → breadcrumb updates with new segment |
| `:` | Opens command palette → header bar remains visible behind overlay |
| `?` | Opens help overlay → header bar remains visible behind overlay |

### Data Hooks

The header bar consumes the following data:

1. **Navigation stack** — from the app-shell's navigation context (a React context providing the current screen stack as an array of `{ id: string, label: string, repoContext?: string }` objects).

2. **`useNotifications()`** — from `@codeplane/ui-core` — provides `unreadCount: number` which is updated via SSE streaming. The header bar reads only the count, not the full notification list.

3. **Connection status** — from the SSE context provider. The `<SSEProvider>` exposes a `connected: boolean` state via React context. The header bar subscribes to this context to show the connection indicator.

4. **`useTerminalDimensions()`** — from `@opentui/react` — provides `{ width, height }` for responsive layout decisions (truncation thresholds, center zone visibility).

5. **`useUser()`** — from `@codeplane/ui-core` — may be used to display the authenticated username in future iterations, but is not required for the initial header bar implementation.

### Screen-Specific Breadcrumb Labels

| Screen | Breadcrumb Label |
|--------|------------------|
| Dashboard | `Dashboard` |
| Repository list | `Repositories` |
| Repository overview | `{owner}/{repo}` |
| Issues list | `Issues` |
| Issue detail | `#{number}` |
| Landings list | `Landings` |
| Landing detail | `!{number}` |
| Workspaces | `Workspaces` |
| Workspace detail | `{workspace-name}` |
| Workflows | `Workflows` |
| Workflow run detail | `Run #{number}` |
| Search | `Search` |
| Notifications | `Notifications` |
| Agents | `Agents` |
| Agent session | `Session {id}` |
| Settings | `Settings` |
| Organizations | `Organizations` |
| Organization detail | `{org-name}` |
| Sync | `Sync` |
| Wiki | `Wiki` |
| Wiki page | `{page-title}` |

### Visual States

**State 1: Root screen (Dashboard), connected, no notifications**
```
Dashboard                                                                                              ●
```

**State 2: Deep navigation, connected, 3 notifications**
```
Dashboard › acme/widget › Issues › #42                        acme/widget                          ● [3]
```

**State 3: Deep navigation, disconnected, 150 notifications**
```
Dashboard › acme/widget › Landings › !7                       acme/widget                        ○ [99+]
```

**State 4: Truncated breadcrumb at 80 columns, connected, 1 notification**
```
… › Issues › #42                                                                              ● [1]
```

**State 5: Non-repo screen, connected, no notifications**
```
Dashboard › Settings                                                                               ●
```

## Permissions & Security

### Authorization

- The header bar itself does not enforce authorization. It renders data provided by the navigation context and data hooks.
- The notification count requires a valid authentication token. If the token is expired or missing, `useNotifications()` returns 0 and the SSE connection shows disconnected status.
- The connection status indicator reflects whether the API client can successfully communicate — a 401 response results in disconnected state and triggers the auth error screen (handled by the app shell, not the header bar).
- All authenticated roles (user, org member, org admin) see the same header bar. There are no role-gated header bar elements.

### Token-Based Auth

- The TUI uses token-based authentication read from the CLI keychain or `CODEPLANE_TOKEN` environment variable.
- The header bar does not handle authentication flows. If the token is invalid, the app shell redirects to an auth error screen; the header bar simply shows disconnected state until that redirect occurs.
- No sensitive data (tokens, passwords, secrets) is ever displayed in the header bar.

### Rate Limiting

- The notification count SSE stream is a single persistent connection, not repeated polling. It does not contribute to API rate limiting.
- The header bar makes no direct API calls. All data arrives via shared hooks and context providers.
- If the API returns a 429 rate limit response on the notification endpoint, the SSE reconnection backoff handles it (1s → 2s → 4s → 8s → 30s max).

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.header_bar.rendered` | First render of the header bar after TUI launch | `terminal_width`, `terminal_height`, `color_support` (16/256/truecolor) |
| `tui.header_bar.breadcrumb_truncated` | Breadcrumb is truncated due to terminal width | `terminal_width`, `stack_depth`, `truncated_segments_count` |
| `tui.header_bar.connection_lost` | Connection status transitions from connected to disconnected | `duration_connected_ms`, `screen_at_disconnect` |
| `tui.header_bar.connection_restored` | Connection status transitions from disconnected to connected | `duration_disconnected_ms`, `reconnect_attempts` |
| `tui.notification_badge.updated` | Notification badge count changes | `previous_count`, `new_count`, `source` (`sse` or `initial_fetch`) |

### Success Indicators

- **Header bar visibility rate**: The header bar should be rendered on 100% of TUI screen states. Any state where it is missing indicates a rendering bug.
- **Breadcrumb accuracy**: Breadcrumb segments should match the navigation stack at all times. Telemetry can sample and verify `stack_depth` matches `rendered_segments_count`.
- **Connection uptime**: `tui.header_bar.connection_lost` events should be rare. High frequency indicates network instability or server issues.
- **Notification freshness**: The time between a server-side notification event and the badge update should be under 2 seconds (SSE latency).
- **Truncation frequency**: High rates of `tui.header_bar.breadcrumb_truncated` events may indicate users are on small terminals and the truncation logic needs refinement or the navigation hierarchy needs flattening.

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------- |
| `debug` | Navigation stack change | `{ action: "push" | "pop", screen: string, stackDepth: number }` |
| `debug` | Breadcrumb render | `{ segments: string[], truncated: boolean, terminalWidth: number }` |
| `info` | Connection status change | `{ connected: boolean, previousState: boolean }` |
| `info` | Notification count update | `{ count: number, source: "sse" | "initial" }` |
| `warn` | SSE reconnection attempt | `{ attempt: number, backoffMs: number }` |
| `error` | SSE connection failure (after max retries) | `{ lastError: string, totalAttempts: number }` |
| `error` | Notification fetch failure | `{ statusCode: number, errorMessage: string }` |

### Error Cases and Recovery

| Error Case | Behavior | Recovery |
|------------|----------|---------|
| SSE connection drops mid-session | Connection indicator turns red (`○`). Badge retains last known count. Auto-reconnect with exponential backoff. | Automatic. SSE provider reconnects and re-fetches missed events. Badge updates once reconnected. |
| Terminal resize during render | OpenTUI handles resize events. `useTerminalDimensions()` triggers re-render. Header bar recalculates truncation. | Automatic. No user action needed. |
| Terminal resize below 80x24 | App shell takes over and shows "terminal too small" message. Header bar is not rendered. | User resizes terminal back to ≥ 80x24. |
| Auth token expired (401) | Connection indicator shows disconnected. App shell shows auth error screen. Header bar remains visible but stale. | User runs `codeplane auth login` externally and restarts TUI. |
| Notification API returns 500 | Badge shows last known count. Error logged. Retry on next SSE reconnection cycle. | Automatic retry via SSE backoff. |
| Navigation stack corrupted (empty) | Header bar renders with a single "Codeplane" root segment as fallback. Error logged. | Automatic fallback. User can press `g d` to navigate to Dashboard and reset state. |
| Unicode rendering failure | If the terminal does not support UTF-8, the `›` separator and `●`/`○` indicators may render as `?` or boxes. | No runtime recovery — UTF-8 is a hard requirement of OpenTUI. User must use a UTF-8 capable terminal. |

### Health Checks

- The header bar's connection indicator serves as a user-visible health check for the API connection.
- If the connection indicator remains red for more than 30 seconds after launch, the status bar (separate component) should show a "Cannot connect to server" message.

## Verification

### Test File

All tests for TUI_HEADER_BAR are located in `e2e/tui/app-shell.test.ts` as the header bar is part of the TUI_APP_SHELL feature group.

### Terminal Snapshot Tests

- **"header bar renders on initial launch at 120x40"** — Launch TUI at 120x40, wait for initial render, assert snapshot of row 0 matches expected header bar layout, assert row 0 contains "Dashboard" and "●" (connected indicator).
- **"header bar renders on initial launch at 80x24"** — Launch TUI at 80x24, wait for initial render, assert snapshot of row 0 shows header bar within 80 columns, assert row 0 contains "Dashboard", assert no text wraps to row 1.
- **"header bar renders on initial launch at 200x60"** — Launch TUI at 200x60, wait for initial render, assert snapshot of row 0 matches expected wide header layout, assert row 0 contains "Dashboard" with proper spacing.
- **"header bar shows breadcrumb after navigating to repository"** — Launch TUI at 120x40, navigate to a repository, assert row 0 contains "Dashboard › {owner}/{repo}", assert current segment is rendered in primary color.
- **"header bar shows deep breadcrumb trail"** — Launch TUI at 120x40, navigate Dashboard → repo → Issues → Issue #1, assert row 0 contains "Dashboard › {owner}/{repo} › Issues › #1".
- **"header bar truncates breadcrumb at 80 columns"** — Launch TUI at 80x24, navigate Dashboard → repo → Issues → Issue #1, assert row 0 starts with "…", assert row 0 contains "Issues › #1", assert row 0 does not exceed 80 characters.
- **"header bar shows repo context in center zone at 120 columns"** — Launch TUI at 120x40, navigate to a repository, assert row 0 contains the repo name approximately centered.
- **"header bar hides center repo context at 80 columns"** — Launch TUI at 80x24, navigate to a repository, assert center repo context does not appear as a separate centered element.
- **"header bar shows notification badge with count"** — Launch TUI at 120x40 with 3 unread notifications in test fixtures, assert row 0 contains "[3]" in warning color.
- **"header bar hides notification badge when count is zero"** — Launch TUI at 120x40 with 0 unread notifications, assert row 0 does not contain "[" or "]".
- **"header bar caps notification badge at 99+"** — Launch TUI at 120x40 with 150 unread notifications, assert row 0 contains "[99+]" and does not contain "[150]".
- **"header bar shows connected indicator when API is reachable"** — Launch TUI at 120x40 against running test server, wait for fetch, assert row 0 contains "●".
- **"header bar shows disconnected indicator when API is unreachable"** — Launch TUI at 120x40 against unreachable server, wait for timeout, assert row 0 contains "○".

### Keyboard Interaction Tests

- **"pressing q updates breadcrumb by popping navigation stack"** — Launch at 120x40, navigate Dashboard → repo → Issues, assert breadcrumb, press "q", assert "Issues" removed from breadcrumb.
- **"pressing q on root screen does not crash header bar"** — Launch at 120x40 on Dashboard, press "q", assert TUI exits cleanly with no error output.
- **"go-to keybinding g d updates breadcrumb to Dashboard"** — Launch at 120x40, navigate to repo, press "g" then "d", assert row 0 contains "Dashboard" and no repo name.
- **"go-to keybinding g n updates breadcrumb to Notifications"** — Launch at 120x40, press "g" then "n", assert row 0 contains "Notifications".
- **"go-to keybinding g s updates breadcrumb to Search"** — Launch at 120x40, press "g" then "s", assert row 0 contains "Search".
- **"rapid q presses produce correct breadcrumb states"** — Launch at 120x40, navigate 4 levels deep, press "q" three times rapidly within 100ms, wait 50ms, assert row 0 contains only "Dashboard".
- **"command palette overlay does not hide header bar"** — Launch at 120x40, press ":", assert row 0 still contains "Dashboard".
- **"help overlay does not hide header bar"** — Launch at 120x40, press "?", assert row 0 still contains "Dashboard".

### Responsive / Resize Tests

- **"header bar adapts when terminal resizes from 120 to 80 columns"** — Launch at 120x40, navigate 4 levels deep, assert full breadcrumb, resize to 80x24, assert truncated breadcrumb with "…" fitting within 80 columns.
- **"header bar adapts when terminal resizes from 80 to 120 columns"** — Launch at 80x24, navigate 4 levels deep, assert truncated breadcrumb, resize to 120x40, assert full breadcrumb without "…".
- **"header bar adapts when terminal resizes from 120 to 200 columns"** — Launch at 120x40, navigate to repo, resize to 200x60, assert correct wide layout via snapshot.
- **"terminal resize below 80 columns hides header bar"** — Launch at 120x40, assert header bar present, resize to 60x20, assert "terminal too small" message and no header bar.
- **"terminal resize back above 80 columns restores header bar"** — Launch at 120x40, resize to 60x20, resize back to 120x40, assert header bar restored with "Dashboard".

### SSE / Real-Time Tests

- **"notification badge updates when SSE event arrives"** — Launch at 120x40 with 0 notifications, trigger server-side notification, wait up to 5s, assert row 0 contains "[1]".
- **"connection indicator updates on SSE disconnect"** — Launch at 120x40, assert "●", stop test server, wait up to 5s, assert "○".
- **"connection indicator recovers on SSE reconnect"** — Launch at 120x40, stop server, wait for disconnect, restart server, wait up to 35s, assert "●".

### Edge Case Tests

- **"header bar renders fallback when navigation stack is empty"** — Launch at 120x40 with empty navigation stack, assert row 0 contains "Codeplane" as fallback.
- **"header bar handles very long repository names"** — Launch at 120x40, navigate to repo with very long name, assert truncated with "…" and fits within terminal width.
- **"header bar does not flicker during rapid navigation"** — Launch at 120x40, rapidly navigate g+n, g+s, g+d, assert final state is "Dashboard" with no snapshot artifacts.
- **"header bar maintains layout integrity with all zones populated"** — Launch at 120x40, navigate to repo with notifications and connected, assert snapshot shows all three zones without overlap.
