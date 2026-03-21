# TUI_SETTINGS_CONNECTED_ACCOUNTS

Specification for TUI_SETTINGS_CONNECTED_ACCOUNTS.

## High-Level User POV

The Connected Accounts tab is the sixth tab within the Settings screen, accessible via `g s` followed by pressing `6`, or directly via `:settings connections` from the command palette. It shows the terminal user every external identity provider currently linked to their Codeplane account. When the tab opens, the breadcrumb updates to "Settings > Connections" and the tab bar highlights `[6:Connections]` as the active tab.

The screen renders as a vertical list of connected account rows within a `<scrollbox>`. Each row displays the provider name in title case (e.g., "GitHub"), the external user ID from that provider, and the connection date formatted as `YYYY-MM-DD`. The rows are sorted by account ID ascending, matching insertion order. The currently focused row is highlighted with reverse video and a `▸` cursor indicator in the left margin. The user navigates the list with `j`/`k` (or arrow keys) and can select an account with `Enter` to view its details, or press `d` to initiate disconnection.

When the user presses `d` on a focused account, a confirmation prompt appears as a centered modal overlay: "Disconnect GitHub? This will remove the link to external account {provider_user_id}. [y/N]". Pressing `y` sends the `DELETE /api/user/connections/:id` request. During the request, the prompt updates to "Disconnecting…" with all input disabled. On success, the modal closes, a green "Disconnected GitHub" confirmation appears at the top of the list for 3 seconds, and the list re-fetches to reflect the removal. If the account was the last one, the list transitions to the empty state.

Codeplane protects the user from locking themselves out. If the account being disconnected is the user's only authentication method (no SSH keys and no other connected providers), the `d` key on that row is disabled and the status bar shows "Cannot disconnect: only auth method" in warning color (ANSI 178). The row itself displays a `🔒` lock indicator next to the Disconnect hint.

When the user has no connected accounts — for example, if they authenticated solely via SSH key — the screen displays an empty state: a centered message "No connected accounts" in muted text, with a note below it: "Connect a provider via `codeplane auth login --github`" explaining how to link an account from the CLI, since the TUI does not perform OAuth browser flows.

The screen also supports viewing account details. Pressing `Enter` on a focused row opens a detail panel below the list (or replaces the list at minimum terminal size) showing the full provider name, external user ID (untruncated), connection date, and last updated date. The detail view includes a `[Disconnect]` action button that triggers the same confirmation flow as `d` from the list. Pressing `q` or `Esc` from the detail view returns to the list.

At minimum terminal size (80×24), the list collapses to show only provider name and a truncated external ID. The detail panel replaces the list view entirely. At standard size (120×40), the list shows provider name, full external ID, and connection date in a three-column layout. At large size (200×60+), additional spacing and the last-updated column become visible.

The status bar shows context-sensitive keybinding hints: `j/k:navigate  d:disconnect  Enter:details  ?:help` when the list is focused, and `y:confirm  n/Esc:cancel` when the disconnect confirmation is active.

## Acceptance Criteria

### Definition of Done

- [ ] The Connections tab renders as the sixth tab within the Settings screen
- [ ] The breadcrumb reads "Settings > Connections" when the Connections tab is active
- [ ] The screen is reachable via `g s` then `6`, `:settings`, or `:settings connections` from the command palette
- [ ] Tab number `6` selects the Connections tab when Settings screen has focus
- [ ] The connected accounts list fetches data from `GET /api/user/connections` via `useConnectedAccounts()` hook
- [ ] Each connected account row displays: provider name (title-cased), external user ID, and connection date
- [ ] Rows are sorted by `id` ascending (insertion order)
- [ ] The focused row is highlighted with reverse video and a `▸` indicator in the left margin
- [ ] `j`/`k` and arrow keys navigate the list
- [ ] `Enter` on a focused row opens the detail view for that account
- [ ] `d` on a focused row initiates the disconnect confirmation flow
- [ ] The disconnect confirmation dialog renders as a centered modal overlay with "Disconnect {Provider}? [y/N]" prompt
- [ ] `y` in the confirmation dialog sends `DELETE /api/user/connections/:id`
- [ ] `n`, `N`, or `Esc` in the confirmation dialog cancels and returns to the list
- [ ] On successful disconnect (204), a green "Disconnected {Provider}" message appears for 3 seconds
- [ ] On successful disconnect, the list re-fetches and the removed account is no longer shown
- [ ] If the user has only one connected account and zero SSH keys, the `d` key is disabled with a warning message
- [ ] The disabled disconnect state shows "Cannot disconnect: only auth method" in the status bar
- [ ] The disabled disconnect row displays a `🔒` indicator
- [ ] When the user has zero connected accounts, an empty state is shown: "No connected accounts"
- [ ] The empty state includes a hint: "Connect a provider via `codeplane auth login --github`"
- [ ] A loading spinner is shown while data is initially fetching
- [ ] An error state with retry hint is shown if the initial data fetch fails
- [ ] The detail view shows provider name, external user ID, connection date, and last updated date
- [ ] The detail view includes a `[Disconnect]` button that triggers the same confirmation flow
- [ ] `q` or `Esc` from the detail view returns to the list

### Keyboard Interactions

- [ ] `j` / `Down`: Move focus to the next account row
- [ ] `k` / `Up`: Move focus to the previous account row
- [ ] `Enter`: Open detail view for the focused account
- [ ] `d`: Initiate disconnect confirmation for the focused account (if not last-auth-method protected)
- [ ] `y`: In the confirmation dialog, confirm disconnect
- [ ] `n` / `N` / `Esc`: In the confirmation dialog, cancel and return to list
- [ ] `G`: Jump to the last account in the list
- [ ] `g g`: Jump to the first account in the list
- [ ] `q`: From list, navigate back (pop settings screen). From detail view, return to list
- [ ] `Esc`: Close any open overlay/dialog. From detail view, return to list. From list, navigate back
- [ ] `R`: After a load or disconnect error, retry the operation
- [ ] `1`–`7`: Switch between settings tabs (Connections is `6`)
- [ ] `?`: Toggle help overlay showing connections-screen keybindings
- [ ] `:`: Open command palette
- [ ] `Ctrl+C`: Quit TUI (global binding)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the global router
- [ ] 80×24 – 119×39 (minimum): Two-column list (Provider, External ID truncated to 20 chars with `…`). Connection date hidden. Detail view replaces list entirely. Modal uses 90% width
- [ ] 120×40 – 199×59 (standard): Three-column list (Provider, External ID full, Connected date). Detail view renders below the list in a split layout. Modal uses 60% width
- [ ] 200×60+ (large): Four-column list (Provider, External ID, Connected, Updated). Wider gutters. Detail view renders inline below the list with expanded spacing

### Truncation and Boundary Constraints

- [ ] Provider name: maximum 50 characters; title-cased for display (e.g., `"github"` → `"GitHub"`)
- [ ] External user ID: maximum 255 characters; shown in full in detail view; truncated at 20 characters with `…` at minimum terminal width, full at standard+ width
- [ ] Connection date: formatted as `YYYY-MM-DD` (10 characters, never truncated)
- [ ] Last updated date: formatted as `YYYY-MM-DD` (10 characters, never truncated)
- [ ] Provider column: 10 characters wide minimum (accommodates "GitHub" and future provider names)
- [ ] External ID column: flexible width, fills remaining horizontal space minus other columns
- [ ] Maximum expected connected accounts: 10 (bounded by supported provider set); no pagination needed
- [ ] Empty list renders as empty state, not a blank screen
- [ ] Error messages: truncated at terminal width minus 4 characters with `…`
- [ ] Confirmation dialog provider name: never truncated (max 50 chars fits in any supported terminal width)
- [ ] Confirmation dialog external ID: truncated at dialog width minus 20 characters with `…`
- [ ] Unknown provider names: displayed in title case with no icon (text-only rendering)

### Edge Cases

- [ ] Terminal resize while list is displayed: Layout recalculates, column widths adjust, focus position preserved
- [ ] Terminal resize while confirmation dialog is open: Dialog repositions to center; confirmation state preserved
- [ ] Terminal resize while detail view is open: Layout recalculates; at minimum size, detail replaces list; at standard+, detail renders below list
- [ ] Disconnect during network disconnect: Red error banner with "Network error. Press R to retry."
- [ ] 401 on list fetch (token expired): "Session expired. Run `codeplane auth login` to re-authenticate."
- [ ] 401 on disconnect (token expired): "Session expired. Run `codeplane auth login` to re-authenticate."
- [ ] 409 on disconnect (last auth method): Dialog shows "Cannot disconnect: this is your only authentication method. Add an SSH key or connect another provider first." Dialog remains open
- [ ] 404 on disconnect (already removed): "Already disconnected." message; dialog closes; list re-fetches
- [ ] 429 on disconnect (rate limit): "Rate limit exceeded. Try again in {retry-after} seconds."
- [ ] 500+ on disconnect (server error): "Server error" with request ID shown in error banner
- [ ] 500 on list fetch: Full-screen error with "Failed to load connected accounts. Press R to retry."
- [ ] User with zero connected accounts sees empty state — not an error, not a blank screen
- [ ] User with one connected account and one SSH key: disconnect is allowed
- [ ] User with one connected account and zero SSH keys: disconnect is disabled at the UI level
- [ ] User with multiple connected accounts and zero SSH keys: disconnect is allowed on any one
- [ ] Provider user ID with Unicode characters: rendered correctly; wide characters consume 2 columns
- [ ] Very long provider user ID (255 characters): scrolls horizontally in detail view; truncated in list view at minimum size
- [ ] Rapid `d` keypresses on the same row: only one confirmation dialog opens
- [ ] Pressing `d` while confirmation dialog is already open: keypress ignored
- [ ] Disconnect confirmation while list has only one account: on success, list transitions to empty state
- [ ] Re-entering the Connections tab after a disconnect on the same session: fresh data loaded, not stale cache
- [ ] Focus is on the first row when the tab loads; if the list is empty, focus is on the empty state container
- [ ] `j`/`k` at list boundaries: focus does not wrap (stays on first/last item)
- [ ] Navigating to Connections tab with stale cache from another tab: re-fetches on tab activation

## Design

### Layout Structure

The Connections tab uses a vertical flexbox layout within the Settings screen content area. At standard (120×40) size:

```
┌──────────────────────────────────────────────────────────┐
│ Header: Settings > Connections                            │
├──────────────────────────────────────────────────────────┤
│ [1:Profile] [2:Emails] [3:SSH Keys] [4:Tokens] ...       │
│ ... [5:Notifications] [6:Connections]                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  PROVIDER     EXTERNAL ID              CONNECTED         │
│  ─────────────────────────────────────────────────       │
│  ▸ GitHub     12345678                 2025-03-10        │
│    Linear     user_abcdef123           2025-06-15        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:navigate  d:disconnect  Enter:details  ?:help│
└──────────────────────────────────────────────────────────┘
```

At minimum (80×24):

```
┌──────────────────────────────────────────────────────────┐
│ Settings > Connections                                    │
├──────────────────────────────────────────────────────────┤
│ [1:Prof] [2:Email] [3:SSH] [4:Tok] [5:Notif] [6:Conn]   │
├──────────────────────────────────────────────────────────┤
│  PROVIDER     EXTERNAL ID                                │
│  ────────────────────────────                            │
│  ▸ GitHub     12345678                                   │
│    Linear     user_abcdef12345678…                       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ j/k:nav d:disconnect Enter:detail                        │
└──────────────────────────────────────────────────────────┘
```

Detail view at standard size (below list):

```
┌──────────────────────────────────────────────────────────┐
│ Header: Settings > Connections > GitHub                   │
├──────────────────────────────────────────────────────────┤
│ [1:Profile] [2:Emails] [3:SSH Keys] [4:Tokens] ...       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Provider:       GitHub                                  │
│  External ID:    12345678                                │
│  Connected:      2025-03-10                              │
│  Last Updated:   2025-03-10                              │
│                                                          │
│                              [Disconnect]                │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Status: d:disconnect  q:back  ?:help                     │
└──────────────────────────────────────────────────────────┘
```

Disconnect confirmation dialog:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Disconnect GitHub?                       │  │
│  │                                                    │  │
│  │  This will remove the link to external account     │  │
│  │  12345678. You will no longer be able to sign in   │  │
│  │  using GitHub unless you reconnect it.             │  │
│  │                                                    │  │
│  │  Continue? [y/N]                                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Empty state:

```
┌──────────────────────────────────────────────────────────┐
│ Header: Settings > Connections                            │
├──────────────────────────────────────────────────────────┤
│ [1:Profile] [2:Emails] [3:SSH Keys] [4:Tokens] ...       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│              No connected accounts                       │
│                                                          │
│     Connect a provider via `codeplane auth login         │
│     --github` from the terminal.                         │
│                                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Status: ?:help                                           │
└──────────────────────────────────────────────────────────┘
```

### Component Tree

```jsx
<box flexDirection="column" height="100%">
  {/* Settings tab bar */}
  <box flexDirection="row" borderBottom="single">
    <text>[1:Profile]</text>
    <text>[2:Emails]</text>
    <text>[3:SSH Keys]</text>
    <text>[4:Tokens]</text>
    <text>[5:Notifications]</text>
    <text bold={activeTab === 'connections'} color="primary">[6:Connections]</text>
  </box>

  {/* Connections content */}
  {isLoading ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text>Loading connected accounts…</text>
    </box>
  ) : error ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text color="error">Failed to load connected accounts. Press R to retry.</text>
    </box>
  ) : accounts.length === 0 ? (
    <box justifyContent="center" alignItems="center" flexGrow={1} flexDirection="column" gap={1}>
      <text color="muted">No connected accounts</text>
      <text color="muted">Connect a provider via `codeplane auth login --github`</text>
    </box>
  ) : (
    <scrollbox flexGrow={1}>
      <box flexDirection="column">
        {/* Column headers */}
        <box flexDirection="row" borderBottom="single">
          <text bold width={providerColWidth}>PROVIDER</text>
          <text bold width={externalIdColWidth}>EXTERNAL ID</text>
          {showConnectedCol && <text bold width={dateColWidth}>CONNECTED</text>}
          {showUpdatedCol && <text bold width={dateColWidth}>UPDATED</text>}
        </box>

        {/* Account rows */}
        {accounts.map((account, index) => (
          <box
            key={account.id}
            flexDirection="row"
            backgroundColor={index === focusedIndex ? 'primary' : undefined}
          >
            <text width={2}>
              {index === focusedIndex ? '▸' : ' '}
            </text>
            <text width={providerColWidth} color={index === focusedIndex ? undefined : 'primary'}>
              {titleCase(account.provider)}
            </text>
            <text width={externalIdColWidth} color="muted">
              {truncate(account.provider_user_id, externalIdMaxLen)}
            </text>
            {showConnectedCol && (
              <text width={dateColWidth} color="muted">
                {formatDate(account.created_at)}
              </text>
            )}
            {showUpdatedCol && (
              <text width={dateColWidth} color="muted">
                {formatDate(account.updated_at)}
              </text>
            )}
            {isLastAuthMethod(account) && <text color="warning">🔒</text>}
          </box>
        ))}
      </box>
    </scrollbox>
  )}

  {/* Disconnect confirmation modal */}
  {showConfirmDialog && (
    <box
      position="absolute"
      top="center"
      left="center"
      width={dialogWidth}
      border="single"
      borderColor="warning"
      flexDirection="column"
      padding={1}
      gap={1}
    >
      <text bold>Disconnect {titleCase(selectedAccount.provider)}?</text>
      <text color="muted">
        This will remove the link to external account{' '}
        {truncate(selectedAccount.provider_user_id, dialogIdMaxLen)}.
        You will no longer be able to sign in using{' '}
        {titleCase(selectedAccount.provider)} unless you reconnect it.
      </text>
      <text>
        {isDisconnecting ? 'Disconnecting…' : 'Continue? [y/N]'}
      </text>
    </box>
  )}

  {/* Detail view */}
  {showDetail && (
    <box flexDirection="column" gap={1} padding={1} borderTop="single">
      <box flexDirection="row" gap={1}>
        <text bold width={16}>Provider:</text>
        <text color="primary">{titleCase(selectedAccount.provider)}</text>
      </box>
      <box flexDirection="row" gap={1}>
        <text bold width={16}>External ID:</text>
        <text>{selectedAccount.provider_user_id}</text>
      </box>
      <box flexDirection="row" gap={1}>
        <text bold width={16}>Connected:</text>
        <text color="muted">{formatDate(selectedAccount.created_at)}</text>
      </box>
      <box flexDirection="row" gap={1}>
        <text bold width={16}>Last Updated:</text>
        <text color="muted">{formatDate(selectedAccount.updated_at)}</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end">
        <text bold color={isLastAuthMethod(selectedAccount) ? 'muted' : 'error'}>
          {isLastAuthMethod(selectedAccount) ? '[Disconnect] 🔒' : '[Disconnect]'}
        </text>
      </box>
    </box>
  )}
</box>
```

Focused row uses reverse video via `backgroundColor="primary"`. List column headers use bold text with a single-line border separator. The disconnect confirmation dialog uses a `warning` (ANSI 178) border. Success messages use `success` color (ANSI 34). Error messages use `error` color (ANSI 196). Muted metadata uses `muted` color (ANSI 245).

### Keybinding Reference

| Key | Context | Action |
|-----|---------|--------|
| `j` / `Down` | List focused | Move focus to next row |
| `k` / `Up` | List focused | Move focus to previous row |
| `Enter` | List focused | Open detail view for focused account |
| `d` | List focused (not last-auth-method) | Open disconnect confirmation dialog |
| `d` | List focused (last-auth-method) | No action; status bar shows warning |
| `d` | Detail view (not last-auth-method) | Open disconnect confirmation dialog |
| `y` | Confirmation dialog | Confirm disconnect |
| `n` / `N` | Confirmation dialog | Cancel, close dialog |
| `Esc` | Confirmation dialog | Cancel, close dialog |
| `Esc` | Detail view | Return to list |
| `Esc` | List (no overlay) | Navigate back |
| `q` | Detail view | Return to list |
| `q` | List (no overlay) | Navigate back (pop settings screen) |
| `G` | List focused | Jump to last row |
| `g g` | List focused | Jump to first row |
| `R` | After error | Retry failed operation |
| `1`–`7` | Settings tab bar | Switch settings tab |
| `Tab` / `Shift+Tab` | Settings screen | Cycle between settings tabs |
| `?` | Any | Toggle help overlay |
| `:` | Any | Open command palette |

### Responsive Column Layout

| Breakpoint | Columns Shown | External ID Max | Dialog Width | Detail Layout |
|------------|--------------|-----------------|--------------|---------------|
| 80×24 | Provider, External ID | 20 chars + `…` | 90% of width | Replaces list entirely |
| 120×40 | Provider, External ID, Connected | Full (255 chars) | 60% of width | Below list in split |
| 200×60+ | Provider, External ID, Connected, Updated | Full (255 chars) | 50% of width | Below list with spacing |

### Data Hooks

- `useConnectedAccounts()` — Fetch the authenticated user's connected accounts (`GET /api/user/connections`). Returns `ConnectedAccountResponse[]` with `id`, `provider`, `provider_user_id`, `created_at`, `updated_at`. Sorted by `id` ascending
- `useDisconnectAccount()` — Submit a disconnect request (`DELETE /api/user/connections/:id`). Returns void on success. Invalidates `useConnectedAccounts()` cache on success
- `useSSHKeys()` — Fetch the authenticated user's SSH keys (`GET /api/user/keys`). Used for the last-auth-method guard check (count of SSH keys)
- `useTerminalDimensions()` — Current terminal size for responsive layout calculations
- `useOnResize(callback)` — Trigger re-layout on terminal resize
- `useKeyboard(handler)` — Register keybinding handler for list navigation and disconnect flow

### Navigation Context

The Connections tab is tab `6` within the Settings screen. It is accessible via:
- `g s` then pressing `6`
- `:settings connections` from the command palette
- Pressing `6` when the settings tab bar is active
- `Tab` / `Shift+Tab` to cycle to the Connections tab

On disconnect, the `useConnectedAccounts()` cache is invalidated so that re-entering the tab shows fresh data. On back/escape from the Connections tab, the user returns to the previous screen in the navigation stack.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| Anonymous (no token) | Cannot access Settings. Redirect to auth error: "Run `codeplane auth login` to authenticate." |
| Authenticated user | Full access to view own connected accounts and disconnect them |
| Admin | Full access to own connected accounts (admin panel for other users is web-only) |

The Connections screen only allows viewing and managing the authenticated user's own connected accounts. There is no mechanism to view or modify another user's connected accounts from the TUI. The user ID is derived from the authenticated session context, never from user input. No IDOR risk exists because the API resolves the user from the Bearer token, not from URL parameters.

### Token Handling

- Auth via stored token from `codeplane auth login` or `CODEPLANE_TOKEN` environment variable
- Bearer token sent in `Authorization` header for `GET /api/user/connections` and `DELETE /api/user/connections/:id`
- 401 on any request shows "Session expired. Run `codeplane auth login` to re-authenticate."
- No OAuth browser flow from TUI; connecting a new provider is delegated to CLI (`codeplane auth login --github`)
- Disconnecting is fully supported in the TUI (no browser required)

### Rate Limiting

- `GET /api/user/connections` is subject to the standard API rate limit (5,000 requests/hour per user)
- `DELETE /api/user/connections/:id` is subject to the standard rate limit plus a stricter burst limit (10 DELETE requests/minute per user)
- 429 responses display "Rate limit exceeded. Try again in {retry-after} seconds."
- No automatic retry on rate limit; user must wait and press `R` after the timer expires
- Connected accounts data is cached in `useConnectedAccounts()` hook; subsequent tab visits use cached data unless explicitly invalidated by a disconnect operation

### Data Privacy

- `provider_user_id` is displayed only to the owning user in the TUI
- Encrypted tokens (`access_token_encrypted`, `refresh_token_encrypted`) are never sent to the client
- `expires_at` and `profile_data` are excluded from API responses
- No connected account data is persisted by the TUI beyond the React component tree lifetime
- Server logs must not include `provider_user_id` at INFO level or below

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.settings.connections.viewed` | Connections tab rendered with data | `terminal_width`, `terminal_height`, `account_count`, `providers[]` |
| `tui.settings.connections.empty_state_viewed` | Connections tab rendered with zero accounts | `terminal_width`, `terminal_height` |
| `tui.settings.connections.detail_viewed` | User pressed Enter on an account row | `provider`, `terminal_width`, `terminal_height` |
| `tui.settings.connections.disconnect_initiated` | User pressed `d` on an account row | `provider`, `account_id` |
| `tui.settings.connections.disconnect_confirmed` | User pressed `y` in confirmation dialog | `provider`, `account_id`, `duration_ms` |
| `tui.settings.connections.disconnect_cancelled` | User pressed `n`/`Esc` in confirmation dialog | `provider`, `account_id`, `duration_ms` |
| `tui.settings.connections.disconnect_succeeded` | DELETE returned 204 | `provider`, `account_id`, `remaining_account_count`, `remaining_ssh_key_count`, `duration_ms` |
| `tui.settings.connections.disconnect_failed` | DELETE returned non-204 | `provider`, `account_id`, `error_code`, `error_message`, `duration_ms` |
| `tui.settings.connections.disconnect_blocked` | User pressed `d` on a last-auth-method account | `provider`, `account_id` |
| `tui.settings.connections.load_failed` | GET request fails | `error_code`, `error_message` |
| `tui.settings.connections.load_retried` | User pressed `R` after a load error | (none) |

### Success Indicators

- View rate: ≥3% of TUI sessions navigate to the Connections tab (indicates discoverability)
- Disconnect completion rate: >80% of disconnect initiations (pressing `d`) result in confirmed disconnect
- Disconnect cancellation rate: 15-25% is healthy (confirmation dialog serves as safety net)
- Last-auth-method block rate: tracked to inform UX improvements (too high = users don't understand the guard)
- Load success rate: >99% of tab views load data successfully on first attempt
- Empty state → CLI connect rate: qualitative indicator (tracked but not expected to be high since TUI cannot perform OAuth)
- Error recovery rate: >75% of load/disconnect failures result in successful retry within the same session

## Observability

### Logging

| Level | Event | Details |
|-------|-------|--------|
| `info` | Connections tab opened | `terminal_dimensions` |
| `info` | Connected accounts loaded | `account_count`, `response_time_ms` |
| `info` | Disconnect confirmed | `account_id`, `provider` |
| `info` | Disconnect succeeded | `account_id`, `provider`, `response_time_ms` |
| `warn` | Disconnect failed (4xx) | `status_code`, `error_body`, `account_id` |
| `error` | Disconnect failed (5xx) | `status_code`, `error_body`, `request_id`, `account_id` |
| `warn` | Disconnect blocked (last auth method) | `account_id`, `provider` |
| `warn` | Token expired (401) | (none) |
| `warn` | Rate limited (429) | `retry_after` |
| `warn` | Connected accounts load failed | `status_code`, `error_body` |
| `debug` | Focus changed in list | `from_index`, `to_index`, `provider` |
| `debug` | Detail view opened | `account_id`, `provider` |
| `debug` | Detail view closed | `account_id` |
| `debug` | Terminal resize during connections tab | `old_dimensions`, `new_dimensions` |
| `info` | Disconnect cancelled | `account_id`, `provider` |

### Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Network timeout on load | Full-screen error: "Failed to load connected accounts" | Press `R` to retry |
| Network timeout on disconnect | Error banner with retry hint | Press `R` to retry |
| 401 Unauthorized (load) | "Session expired. Run `codeplane auth login` to re-authenticate." | Re-authenticate via CLI, relaunch TUI |
| 401 Unauthorized (disconnect) | "Session expired. Run `codeplane auth login` to re-authenticate." | Re-authenticate via CLI, relaunch TUI |
| 404 on disconnect (already removed) | "Already disconnected." message; dialog closes; list re-fetches | Benign; no user action needed |
| 409 on disconnect (last auth method) | Inline error in dialog: "Cannot disconnect: only authentication method" | Add SSH key or connect another provider via CLI first |
| 429 Rate Limited | "Rate limit exceeded. Try again in {N} seconds." | Wait and press `R` |
| 500+ Server Error | "Server error" with request ID | Press `R` to retry |
| SSE disconnect during list view | No impact (connected accounts uses REST, not SSE) | N/A |
| Resize below 80×24 during list | "Terminal too small" message; list state preserved in memory | Resize back to 80×24+ |
| Resize during confirmation dialog | Dialog repositions to center; confirmation state preserved | Continue interaction |
| Token missing at startup | Settings screen shows auth error instead of tabs | Run `codeplane auth login` |

### Failure Modes

- Disconnect is atomic via a single `DELETE /api/user/connections/:id`; no partial operation state possible
- Network disconnection during disconnect: If the request reached the server, the account is removed. The TUI may show an error, but the account is disconnected. The next list re-fetch will reflect the change
- The last-auth-method guard is checked server-side (409 response); the TUI also performs a client-side pre-check via `useSSHKeys()` to disable the `d` key, but the server guard is authoritative
- Long-running session: `useConnectedAccounts()` cache is invalidated on disconnect; stale data risk is minimal
- Memory: Connected accounts list is small (max ~10 items); no memory growth concerns
- Concurrent disconnect requests from TUI: the confirmation dialog disables further input during the request; only one request is sent

## Verification

### Terminal Snapshot Tests

- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders account list at 120x40 with GitHub connected`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders account list at 80x24 minimum size with truncated external ID`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders account list at 200x60 large size with all four columns`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders focused first row with reverse video and cursor indicator`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders focused second row after pressing j`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders column headers (PROVIDER, EXTERNAL ID, CONNECTED)`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders empty state when user has zero connected accounts`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders empty state CLI hint text`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders disconnect confirmation dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders disconnect confirmation dialog with provider name and external ID`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders disconnecting state in confirmation dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders green success message after disconnect`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders detail view for selected account at standard size`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders detail view replacing list at minimum size`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders lock indicator on last-auth-method account`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders disabled disconnect warning in status bar for last-auth-method`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders loading spinner during initial data fetch`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders error state when load fails`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders auth error when no token present`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders breadcrumb as Settings > Connections`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders Connections tab as selected in tab bar`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders multiple connected accounts sorted by id ascending`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders provider name in title case`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders 409 conflict error in disconnect dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders rate limit error message`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders detail view disconnect button as disabled for last-auth-method`

### Keyboard Interaction Tests

- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — j moves focus to next account row`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — k moves focus to previous account row`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — Down arrow moves focus to next account row`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — Up arrow moves focus to previous account row`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — first row is focused by default on load`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — Enter opens detail view for focused account`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — q from detail view returns to list`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — Esc from detail view returns to list`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — d opens disconnect confirmation dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — y in confirmation dialog confirms disconnect`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — n in confirmation dialog cancels disconnect`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — Esc in confirmation dialog cancels disconnect`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — d on last-auth-method account does not open dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — d on last-auth-method account shows warning in status bar`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — G jumps to last row in list`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — g g jumps to first row in list`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — j at last row does not wrap to first`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — k at first row does not wrap to last`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — R after load error retries load`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — R after disconnect error retries disconnect`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — tab number 6 selects connections tab`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — ? toggles help overlay`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — d from detail view opens confirmation dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — rapid d presses open only one dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — d while dialog is open is ignored`

### Responsive Resize Tests

- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize from 120x40 to 80x24 hides connected date column`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize from 80x24 to 120x40 shows connected date column`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize from 120x40 to 200x60 shows updated date column`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize from 200x60 to 80x24 truncates external ID`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize preserves focused row index`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize during confirmation dialog repositions dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize below 80x24 shows too-small message`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize from minimum to standard with detail view open transitions to split layout`

### Error Handling Tests

- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — 401 on load shows session expired message`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — 401 on disconnect shows session expired message`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — 404 on disconnect shows already-disconnected message and refreshes list`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — 409 on disconnect shows last-auth-method error in dialog`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — 429 on disconnect shows rate limit message with countdown`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — 500 on disconnect shows server error with request ID`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — 500 on load shows retry hint`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — network timeout on load shows error with retry`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — network timeout on disconnect shows error with retry`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — successful disconnect invalidates useConnectedAccounts cache`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — successful disconnect of last account transitions to empty state`

### Integration Tests

- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e view connected accounts list`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e disconnect a connected account`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e disconnect and verify list updates`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e view detail for connected account`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e disconnect from detail view`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e navigate to connections via g s then 6`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e navigate to connections via command palette`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e last-auth-method guard prevents disconnect`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e empty state for user with no connected accounts`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e disconnect cancel flow preserves account`
- [ ] `TUI_SETTINGS_CONNECTED_ACCOUNTS — e2e multiple accounts displayed in correct order`

All tests target `e2e/tui/settings.test.ts` using `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out. Tests run against a real API server with test fixtures, not mocks.
