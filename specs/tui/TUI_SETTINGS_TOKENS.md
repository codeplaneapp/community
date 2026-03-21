# TUI_SETTINGS_TOKENS

Specification for TUI_SETTINGS_TOKENS.

## High-Level User POV

The Tokens screen is a tab within the TUI settings screen, accessible by navigating to Settings and selecting the Tokens tab (tab `4`). This is where a terminal-native developer manages their personal access tokens — the credentials used to authenticate CLI tools, scripts, CI integrations, and other API consumers against the Codeplane API.

When the Tokens tab loads, the user sees a vertically scrollable list of all personal access tokens registered to their account, ordered newest first. Each token entry occupies two lines: the first line shows the token's human-readable name in bold (e.g., "CI Pipeline", "Local Dev") alongside a muted monospace identifier showing the last eight characters of the token hash prefixed with `••••` (e.g., `••••a1b2c3d4`), which helps the user correlate tokens with values they have stored elsewhere. The second line shows the token's scopes rendered as space-separated bracketed badges in the primary color (e.g., `[read:repository]  [write:user]`) and a relative timestamp on the right (e.g., "Created 3 days ago"). The focused token entry is highlighted with reverse-video styling, and the user navigates the list with `j`/`k` or arrow keys.

If the user has no tokens, the list is replaced with an empty-state message centered in the content area: "No personal access tokens. Press `a` to create your first token." The empty state includes a brief explanation: "Tokens authenticate API requests from CLI tools, scripts, and integrations."

To create a new token, the user presses `a`. This opens a multi-field inline form at the top of the content area. The first field is a text input labeled "Token Name" with placeholder text "e.g., CI Pipeline, Local Dev". After entering a name, the user presses `Tab` to move to the second field: a multi-select scope picker labeled "Scopes". The scope picker displays the available scopes as a vertical checklist: `all`, `read:repository`, `write:repository`, `read:organization`, `write:organization`, `read:user`, `write:user`, `read:admin`, `write:admin`, `admin`. The user toggles individual scopes on or off with `Space` and navigates within the checklist using `j`/`k`. At least one scope must be selected before submission is possible. The user submits the form with `Ctrl+S` or navigates to and presses `Enter` on the "Create Token" button.

While the API request is in flight, the button text changes to "Creating…" with a spinner. On success, the form is replaced with a one-time token reveal panel. This is the critical moment in the flow: the panel displays the newly generated token string (`codeplane_...`) in a monospace highlighted box with a prominent warning: "This token will only be shown once. Copy it now." The token string is rendered in full, not truncated, inside a bordered box with the `success` color border. Below the token, the panel shows the token name and selected scopes for confirmation. The user dismisses the reveal panel by pressing `Enter` or `Esc`, which closes the panel and shows the new token at the top of the token list (where only the last eight characters are visible, as the full token is no longer retrievable). On failure, an inline error message appears below the relevant field.

To delete a token, the user focuses the token they want to revoke and presses `d` or `Delete`. A confirmation prompt replaces the status bar at the bottom of the screen: `Revoke token "CI Pipeline"? This cannot be undone. [y/N]`. The token identifier (`••••a1b2c3d4`) is shown on the line above the prompt for visual confirmation. Pressing `y` sends the delete request. On success, the token row is removed from the list and a transient status bar message shows "Token revoked" for 3 seconds. On failure, the confirmation prompt is replaced with an error message. Pressing `n` or `Esc` dismisses the confirmation prompt without action.

At minimum terminal size (80×24), token entries compress to a single line showing only the name (truncated with `…`) and the token identifier. Scopes and timestamp are hidden. At standard size (120×40), both lines render fully. At large terminals (200×60+), additional padding is added and exact UTC timestamps are displayed alongside relative timestamps.

## Acceptance Criteria

### Definition of Done

- [ ] The Tokens tab (tab `4`) is accessible within the Settings screen and renders the token management surface
- [ ] Token list is fetched via `useTokens()` from `@codeplane/ui-core`, which calls `GET /api/user/tokens`
- [ ] Tokens are displayed in a `<scrollbox>` ordered by `id` descending (newest first, matching API response order)
- [ ] Each token entry shows: name (bold), token identifier `••••{token_last_eight}` (monospace, muted), scope badges (bracketed, primary color), and relative timestamp
- [ ] Scope badges render each scope as `[scope_name]` in the primary color, space-separated
- [ ] Empty state renders centered message with call-to-action when token list is empty
- [ ] `a` keybinding opens the create token form at the top of the content area
- [ ] Create form has two fields: Token Name (`<input>`, max 255 characters) and Scopes (multi-select checklist)
- [ ] Token Name field shows character counter when length exceeds 230 characters (e.g., "245/255")
- [ ] Scopes checklist displays all valid scopes: `all`, `read:repository`, `write:repository`, `read:organization`, `write:organization`, `read:user`, `write:user`, `read:admin`, `write:admin`, `admin`
- [ ] Scopes are toggled with `Space` key; checked scopes show `[✓]`, unchecked show `[ ]`
- [ ] Admin-only scopes (`admin`, `read:admin`, `write:admin`) are displayed but marked with a `(admin)` suffix in muted text
- [ ] Form submission via `Ctrl+S` or `Enter` on the submit button calls `POST /api/user/tokens` with `{ name, scopes }`
- [ ] Form submission is disabled (button shows "Create Token" in muted color) until name is non-empty AND at least one scope is selected
- [ ] During submission, button shows "Creating…" with spinner; all fields and buttons are non-interactive
- [ ] On `201 Created`: form is replaced by token reveal panel showing the full token string
- [ ] Token reveal panel displays the full `codeplane_*` token in a bordered monospace box with `success` color border
- [ ] Token reveal panel shows warning: "This token will only be shown once. Copy it now."
- [ ] Token reveal panel shows the token name and selected scopes for confirmation
- [ ] Dismissing the reveal panel (`Enter` or `Esc`) transitions to the token list with the new token at the top
- [ ] After dismissing the reveal panel, the full token string is no longer held in memory (zeroed)
- [ ] On `422 Unprocessable`: field-level error beneath the relevant field (name or scopes)
- [ ] On `403 Forbidden` (non-admin requesting admin scopes): inline error "Insufficient privileges for requested scopes. Admin scopes require admin access."
- [ ] On network/5xx error: inline error "Failed to create token. Check your connection and try again."
- [ ] `Esc` cancels the create flow, clears the form, and returns focus to the token list
- [ ] `d` or `Delete` on a focused token shows a confirmation prompt in the status bar area
- [ ] Confirmation prompt shows: token identifier on one line, then `Revoke token "<name>"? This cannot be undone. [y/N]`
- [ ] `y` sends `DELETE /api/user/tokens/:id`; during request, prompt shows "Revoking…"
- [ ] On `204 No Content`: token removed from list, cursor repositioned, status bar shows "Token revoked" for 3 seconds
- [ ] On `404 Not Found` (already deleted): token removed from list, status bar shows "Token was already revoked"
- [ ] On error: prompt replaced with "Failed to revoke token. Press `R` to retry."
- [ ] `n` or `Esc` dismisses confirmation prompt without action
- [ ] `R` triggers a hard refresh of the token list from the API
- [ ] Loading state shows centered spinner with "Loading tokens…"
- [ ] API fetch errors show inline error with "Press `R` to retry" hint
- [ ] Auth errors (401) propagate to the app-shell-level auth error screen
- [ ] Rate limit errors (429) display retry-after period inline
- [ ] Optimistic delete: token row visually removed immediately, restored on API failure
- [ ] Token list re-renders correctly after create or delete without full page re-fetch

### Truncation and Boundary Constraints

- Token `name`: truncated with `…` when exceeding: 30ch at minimum, 50ch at standard, 70ch at large
- Token identifier `••••{last_eight}`: exactly 12 characters. Never truncated
- Scope badges: hidden at minimum size; at standard+ sizes, overflow scopes replaced with `+N more`
- Token reveal panel: token string is 50 characters total (`codeplane_` + 40 hex). Always fits 80-column minimum
- Create form Token Name input: max 255 characters enforced client-side with character counter
- Scope checklist: exactly 10 items. No scrolling needed
- Confirmation prompt token name: truncated at 40 characters with `…`

### Edge Cases

- User with zero tokens sees empty state on initial load and after revoking their last token
- User with 100+ tokens receives all tokens in a single response (no pagination required per API contract)
- Token names containing Unicode, emoji, or special characters are displayed verbatim
- Rapid `d` then `y` keystrokes correctly handle the revoke flow (state machine prevents double-delete)
- Pressing `a` while the create form is already open is a no-op
- Pressing `d` while a revoke confirmation is already visible for another token replaces the previous confirmation
- Pressing `a` while a revoke confirmation is visible dismisses the confirmation and opens the create form
- Terminal resize during create form adjusts form width without losing input content or scope selections
- Token reveal panel cannot be accidentally dismissed by stray keystrokes — only `Enter` or `Esc` dismiss it
- Non-admin user selecting admin scopes receives a 403 with clear error messaging
- Creating a token with `all` scope and another scope simultaneously is accepted (server normalizes)

## Design

### Screen Layout

The Tokens screen follows the standard Settings tab pattern. The header shows breadcrumb "Settings > Tokens", a tab bar offers `[1 Profile] [2 Emails] [3 SSH Keys] [4 Tokens] [5 Notifs] ...`, and the content area renders the token list or create form.

Token list entries use two lines at standard+ sizes: line 1 has the name (bold) and identifier (`••••` + last 8, monospace muted) right-aligned; line 2 has scope badges `[scope]` in primary color and a relative timestamp right-aligned. At minimum size (80×24), entries collapse to one line with name + identifier only.

### Key Components

- **Token list**: `<scrollbox>` containing `<box>` rows with reverse-video focus highlighting
- **Create form**: bordered `<box>` with `<input>` for name and a vertical checklist of scopes using `[✓]`/`[ ]` toggles
- **Token reveal panel**: bordered `<box>` with `success` border containing `<code>` for the full token string, warning text in `warning` color
- **Revoke confirmation**: replaces status bar with identifier line + prompt `Revoke token "<name>"? This cannot be undone. [y/N]`
- **Empty state**: centered text block with explanation and `a` keybinding hint

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `j` / `Down` | Token list | Move focus down |
| `k` / `Up` | Token list | Move focus up |
| `G` | Token list | Jump to last token |
| `g g` | Token list | Jump to first token |
| `Ctrl+D` / `Ctrl+U` | Token list | Page down / up |
| `a` | Token list / empty state | Open create form |
| `d` / `Delete` | Token list (focused) | Initiate revoke |
| `Enter` | Token list (focused) | Open token detail |
| `R` | Token list | Hard refresh |
| `Tab` / `Shift+Tab` | Create form | Navigate fields |
| `j` / `k` | Scope checklist | Navigate scopes |
| `Space` | Scope checklist | Toggle scope |
| `Ctrl+S` | Create form | Submit |
| `Enter` | Submit button / Reveal panel | Submit / Dismiss |
| `Esc` | Create form / Reveal / Confirm | Cancel / Dismiss |
| `y` | Revoke confirmation | Confirm |
| `n` | Revoke confirmation | Cancel |

### Terminal Resize

- 80×24–119×39: Single-line entries (name + identifier only), create form 90% width, scope checklist 2-column
- 120×40–199×59: Two-line entries, create form 70% centered, scope checklist single column with descriptions
- 200×60+: Two-line entries with padding, create form 60% centered, exact UTC timestamps
- Resize preserves scroll position, focus index, form input values, and scope selections
- Token reveal panel always fits (50-char token < 80-col minimum)

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useTokens()` | `@codeplane/ui-core` | Fetch token list via `GET /api/user/tokens` |
| `useCreateToken()` | `@codeplane/ui-core` | Mutation for `POST /api/user/tokens` |
| `useDeleteToken()` | `@codeplane/ui-core` | Mutation for `DELETE /api/user/tokens/:id` |
| `useUser()` | `@codeplane/ui-core` | Current user for admin status |
| `useKeyboard()` | `@opentui/react` | Keyboard event handling |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size for responsive layout |
| `useOnResize()` | `@opentui/react` | Resize event handler |

### State Machine

`loading` → `list` / `error` → `creating` → `create_submitting` → `revealing` → `list`; `list` → `confirming_revoke` → `revoke_submitting` → `list`; `error` → `loading` (retry with `R`)

## Permissions & Security

### Authorization Roles

| Operation | Required Auth | Behavior on Insufficient Auth |
|-----------|--------------|-------------------------------|
| View token list | Authenticated (any scope) | 401 → app-shell auth error screen |
| Create token | Authenticated (write scope) | 403 → inline error "Write access required. Your token may be read-only." |
| Create token with admin scopes | Authenticated + admin user | 403 → inline error "Insufficient privileges for requested scopes. Admin scopes require admin access." |
| Revoke token | Authenticated (write scope) | 403 → inline error "Write access required. Your token may be read-only." |

### Token-Based Auth

- The TUI authenticates using a token stored by `codeplane auth login` in the CLI keychain/config
- Fallback: `CODEPLANE_TOKEN` environment variable
- The TUI does not implement any OAuth browser flow
- All API requests include the token via `Authorization: Bearer <token>` header
- Token expiration during a session results in a 401, triggering the app-shell auth error screen

### Rate Limiting

| Operation | Limit | TUI Behavior on 429 |
|-----------|-------|---------------------|
| List tokens (`GET`) | ~60 req/min per user | Inline message: "Rate limited. Retry in {retry_after}s." |
| Create token (`POST`) | 10 req/min per user | Inline message: "Too many requests. Wait {retry_after}s." |
| Revoke token (`DELETE`) | 30 req/min per user | Confirmation area: "Rate limited. Retry in {retry_after}s." |

### Security Notes

- Full token value shown only once during reveal panel, then zeroed from memory
- Token hashes never sent to client — only `token_last_eight` displayed
- Token names may contain PII; rendered but never logged
- The TUI does not cache token data to disk — in-memory only
- Admin scopes visible to all users but server-enforced (non-admin gets 403)
- Client-side debounce prevents duplicate mutation requests
- Raw token value never written to any log, temporary file, or debug output
- Clipboard access unavailable in terminal; user must manually select and copy

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.settings.tokens.opened` | User views Tokens tab | `user_id`, `token_count`, `client: "tui"`, `terminal_columns`, `terminal_rows` |
| `tui.settings.tokens.listed` | Token list fetched | `user_id`, `token_count`, `client: "tui"` |
| `tui.settings.tokens.create_form_opened` | User presses `a` | `user_id`, `client: "tui"` |
| `tui.settings.tokens.create_form_cancelled` | User presses `Esc` on form | `user_id`, `name_entered` (bool), `scopes_selected_count` |
| `tui.settings.tokens.create.submitted` | Form submitted | `user_id`, `scope_count`, `scopes`, `name_length` |
| `tui.settings.tokens.create.succeeded` | 201 response | `user_id`, `token_id`, `scope_count`, `scopes`, `name_length`, `duration_ms` |
| `tui.settings.tokens.create.failed` | Create fails | `user_id`, `failure_reason`, `duration_ms` |
| `tui.settings.tokens.reveal_dismissed` | Reveal panel dismissed | `user_id`, `token_id`, `dismiss_key`, `time_on_reveal_ms` |
| `tui.settings.tokens.revoke.confirmed` | User presses `y` | `user_id`, `token_id`, `time_to_confirm_ms` |
| `tui.settings.tokens.revoke.succeeded` | 204 response | `user_id`, `token_id`, `remaining_token_count`, `duration_ms` |
| `tui.settings.tokens.revoke.failed` | Revoke fails | `user_id`, `token_id`, `error_reason`, `duration_ms` |
| `tui.settings.tokens.revoke.cancelled` | User presses `n`/`Esc` | `user_id`, `token_id` |

### Common Properties on All Events

`user_id` (pseudonymized), `client: "tui"`, `session_id`, `timestamp` (ISO 8601), `tui_version`, `terminal_type` (from `TERM`), `request_id`, `terminal_size` (`"{cols}x{rows}"`)

### Success Indicators

| Metric | Target |
|--------|--------|
| TUI token adoption (% users viewing tab) | Increasing over time |
| Create success rate | > 85% |
| Create form completion rate | > 60% |
| Reveal dwell time (median) | 5–30 seconds |
| Revoke completion rate | > 95% |
| Revoke confirmation rate | 50–80% (healthy caution) |
| Time to confirm revoke (median) | 1–5 seconds |
| Error recovery rate | > 50% |

## Observability

### TUI-Side Logging

| Log Point | Level | Structured Fields |
|-----------|-------|-------------------|
| Tokens tab mounted | DEBUG | `user_id`, `terminal_size` |
| Token list fetch started | DEBUG | `user_id`, `request_id` |
| Token list fetch succeeded | INFO | `user_id`, `token_count`, `request_id`, `duration_ms` |
| Token list fetch failed | ERROR | `user_id`, `request_id`, `status_code`, `error_message` |
| Create form opened | DEBUG | `user_id` |
| Create request sent | DEBUG | `user_id`, `request_id`, `name_length`, `scope_count` |
| Create succeeded | INFO | `user_id`, `request_id`, `token_id`, `scope_count`, `duration_ms` |
| Create failed | WARN | `user_id`, `request_id`, `status_code`, `error_reason` |
| Token reveal shown | DEBUG | `user_id`, `token_id` |
| Token reveal dismissed | DEBUG | `user_id`, `token_id`, `dwell_time_ms` |
| Token secret zeroed | DEBUG | `user_id`, `token_id` |
| Revoke confirmation shown | DEBUG | `user_id`, `token_id` |
| Revoke request sent | DEBUG | `user_id`, `request_id`, `token_id` |
| Revoke succeeded | INFO | `user_id`, `request_id`, `token_id`, `duration_ms` |
| Revoke failed | WARN | `user_id`, `request_id`, `token_id`, `status_code`, `error_reason` |
| Terminal resize during form | DEBUG | `user_id`, `old_size`, `new_size`, `form_state` |
| Auth error intercepted | WARN | `user_id`, `request_id`, `endpoint` |
| Rate limit hit | WARN | `user_id`, `request_id`, `endpoint`, `retry_after` |

**Rules**: NEVER log token names, token values, or token_last_eight identifiers (credential metadata). Only log token IDs and counts.

### Error Cases Specific to TUI

| Error Case | Recovery |
|------------|----------|
| Terminal resize during create form | Re-layout without losing input values or scope selections |
| Terminal resize during revoke confirmation | Reflow text; prompt remains active |
| Terminal resize during token reveal | Re-layout panel; token string fits 80-col minimum |
| Network timeout on create (>10s) | Inline error; form remains populated |
| Network timeout on revoke (>10s) | Error in confirmation area; `y` to retry |
| Rapid key input during loading | Ignored; state machine prevents invalid transitions |
| Token list unexpected shape | Error state with retry hint; log at ERROR |
| Form submit with stale auth | 401 → app-shell auth error screen |
| Tab switch during in-flight API call | Abort request; clean up state |
| Reveal panel interrupted by terminal close | Token lost; user creates new one (by design) |

### Failure Modes

| Mode | User Experience |
|------|----------------|
| API unreachable | Error with "Press `R` to retry" |
| Slow network (>2s) | Spinner visible; completes when response arrives |
| Memory pressure (100+ tokens) | Smooth virtual scrolling via `<scrollbox>` |

## Verification

### E2E Tests (`e2e/tui/settings.test.ts`)

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Token List Display (7 tests)

1. **renders token list with name, identifier, scopes, and timestamp** — Snapshot at 120x40
2. **renders tokens ordered newest first** — Assert first token is most recent
3. **renders empty state when user has no tokens** — Snapshot at 120x40, assert "No personal access tokens"
4. **displays loading spinner while fetching** — Assert "Loading tokens…"
5. **displays error state when fetch fails** — Assert "Press `R` to retry"
6. **displays multiple scope badges per token** — Assert `[read:repository]` and `[write:repository]`
7. **token identifier shows bullet prefix and last eight chars** — Assert `••••a1b2c3d4` pattern

#### Token List Navigation (4 tests)

8. **j/k navigates between entries** — Snapshot focused states
9. **G jumps to last, g g jumps to first** — Assert focus positions
10. **Ctrl+D and Ctrl+U page through long lists** — Assert scroll position changes
11. **Down/Up arrows work as j/k aliases** — Assert focus moves

#### Create Token Flow (17 tests)

12. **a opens create form** — Snapshot at 120x40, assert labels and buttons
13. **Esc closes create form** — Assert form gone, focus returns to list
14. **Tab navigates between fields** — Assert focus: name → scopes → button
15. **Space toggles scope selection** — Assert `[ ]` ↔ `[✓]`
16. **j/k navigates scope checklist** — Assert focus moves between scopes
17. **Ctrl+S submits and shows reveal panel** — Assert "codeplane_" visible, snapshot
18. **Enter on submit button creates token** — Assert reveal panel visible
19. **Enter dismisses reveal panel** — Assert token in list, snapshot
20. **Esc dismisses reveal panel** — Assert token in list
21. **create form shows error for missing name** — Assert validation error
22. **create form shows error for no scopes** — Assert validation error
23. **create form shows error for forbidden admin scopes (403)** — Assert privileges error
24. **create form disables submit when incomplete** — Assert muted button states
25. **create form shows character counter near limit** — Assert "240/255"
26. **a is no-op when form already open** — Assert no duplication
27. **scope checklist shows all 10 scopes** — Assert each scope name present
28. **admin scopes show (admin) suffix** — Assert "(admin)" on admin scopes only

#### Revoke Token Flow (7 tests)

29. **d shows revoke confirmation** — Snapshot, assert "Revoke token", "[y/N]"
30. **y confirms and removes token** — Assert token gone, "Token revoked"
31. **n cancels revoke** — Assert token still in list
32. **Esc cancels revoke** — Assert token still in list
33. **revoking last token shows empty state** — Assert "No personal access tokens"
34. **revoke handles 404 gracefully** — Assert "Token was already revoked"
35. **revoke shows error on server failure** — Assert error, token restored

#### Refresh (2 tests)

36. **R refreshes token list** — Assert fresh data
37. **R retries after error** — Assert recovery

#### Responsive Layout (8 tests)

38. **single-line entries at 80x24** — Snapshot, scopes/timestamp hidden
39. **two-line entries at 120x40** — Snapshot, all visible
40. **expanded layout at 200x60** — Snapshot, UTC timestamps
41. **create form adjusts on resize** — Assert width change, values preserved
42. **revoke confirmation reflows on resize** — Assert prompt functional
43. **reveal panel adjusts on resize** — Assert token visible at 80x24
44. **resize 120→80 hides scope badges** — Assert hidden
45. **resize 80→120 shows scope badges** — Assert visible

#### Tab Navigation (2 tests)

46. **Tab/Shift+Tab cycles settings tabs** — Assert tab switching
47. **number key 4 activates Tokens tab** — Assert direct access

#### Auth and Error Handling (5 tests)

48. **401 navigates to auth error screen** — Assert "codeplane auth login"
49. **403 on create shows write access error** — Assert inline error
50. **403 on admin scopes shows privileges error** — Assert inline error
51. **429 on list shows rate limit** — Assert retry time
52. **429 on create shows rate limit** — Assert retry time

#### Edge Cases (10 tests)

53. **Unicode and emoji token names** — Snapshot at 120x40
54. **long token name truncated** — Assert `…` at each breakpoint
55. **rapid d→y handles correctly** — Assert exactly one delete request
56. **d while confirmation shown replaces it** — Assert second token's info
57. **a while confirmation shown opens form** — Assert confirmation dismissed
58. **create form retains values on error** — Assert name and scopes preserved
59. **reveal panel only dismisses on Enter/Esc** — Assert other keys ignored
60. **token with all scope shows single badge** — Assert `[all]`
61. **multiple scopes as space-separated badges** — Assert all visible
62. **help overlay shows tokens keybindings** — Assert Actions, Navigation, Form groups
