# TUI_SETTINGS_EMAILS

Specification for TUI_SETTINGS_EMAILS.

## High-Level User POV

The Settings Emails screen is where a Codeplane terminal user manages the email addresses associated with their account. It lives under the Settings tab navigation as the second tab, accessible via `g s` followed by pressing `2` (or `Tab` to cycle to Emails), or directly from the command palette with `:settings emails`. When the settings screen opens, the Profile tab is selected by default; the user switches to Emails by pressing `2` or cycling with `Tab`.

The breadcrumb updates to show "Settings > Emails" in the header bar. The screen renders as two vertically stacked sections within the content area between the header and status bars: an "Add email" form section at the top, and a scrollable email list below.

The add email section is a compact inline form. It contains a single-line `<input>` for the email address with placeholder text `name@example.com`, a toggle for "Set as primary" (rendered as `[x]` when checked, `[ ]` when unchecked), and an "Add" action button. The form is always visible above the email list. When the user has reached the maximum of 10 email addresses, the input is disabled and a muted message reads "Maximum of 10 email addresses reached." Client-side validation checks that the input is non-empty, contains `@`, and is between 3 and 254 characters before submission. Validation errors appear inline below the input in red (ANSI 196) text.

Below the form, the email list displays all email addresses on the account in a scrollable `<scrollbox>`. Each email row shows: the email address, a `[Primary]` badge in primary color (ANSI 33) if applicable, a `[Verified]` badge in green (ANSI 34) or `[Unverified]` badge in yellow/warning (ANSI 178), and the date added in muted text (ANSI 245). The primary email is always sorted first, followed by remaining emails sorted by creation date ascending.

The email list is keyboard-navigable. The user moves between rows with `j`/`k` (or arrow keys). The focused row is highlighted with reverse video or a primary-color left border indicator (`▸`). From a focused row, the user can perform contextual actions via single-key shortcuts shown in the status bar hints: `d` to delete (opens confirmation), `v` to send a verification email (for unverified rows), and `p` to set as primary (for verified, non-primary rows). Actions that don't apply to the focused row are ignored silently.

Deleting an email requires confirmation. When the user presses `d` on a non-primary email row, an inline confirmation prompt appears: "Remove {email}? [y/N]". Pressing `y` confirms the deletion; any other key cancels. The primary email cannot be deleted.

Setting an email as primary is performed via an add/upsert operation with `is_primary: true`. When the user presses `p` on a verified, non-primary row, the list immediately re-sorts with the new primary at the top, and a status bar confirmation reads "Primary email updated" in green for 3 seconds.

Sending a verification email is triggered by pressing `v` on an unverified row. The row shows a brief "Sending…" indicator, then on success displays "Verification sent" in green text for 3 seconds. After sending, the `v` action enters a 15-second cooldown for that row. Note: the verification endpoint currently returns 501 (not yet implemented).

At minimum terminal size (80×24), the email list collapses to show only the email address (truncated at 40 chars), primary badge, and verification badge — the date is hidden. At standard size (120×40), each row shows the full email address (up to 60 chars), badges, and date. At large size (200×60+), email addresses display up to 100 characters with additional padding.

## Acceptance Criteria

### Definition of Done

- [ ] The Emails tab renders as the second tab (number `2`) within the Settings screen
- [ ] The breadcrumb reads "Settings > Emails" when the Emails tab is active
- [ ] The screen is reachable via `g s` then `2`, `:settings emails`, or `:settings` then `Tab` to cycle
- [ ] Tab number `2` selects the Emails tab when Settings screen has focus
- [ ] The add email form section is visible at the top with an `<input>`, primary toggle, and Add button
- [ ] The email list is fetched from `GET /api/user/emails` via `useUserEmails()` hook on tab activation
- [ ] The email list is sorted: primary first, then by `created_at` ascending
- [ ] Each email row displays: email address, `[Primary]` badge (if applicable), `[Verified]` or `[Unverified]` badge, date added
- [ ] Primary badge uses primary color (ANSI 33); verified badge uses green (ANSI 34); unverified badge uses warning color (ANSI 178)
- [ ] Date is formatted as abbreviated month + day + year (e.g., `Jan 15, 2025`) in muted color (ANSI 245)
- [ ] The focused email row is highlighted with reverse video or `▸` prefix and primary color
- [ ] `j`/`k` and arrow keys navigate between email rows
- [ ] `a` moves focus to the add email input from the list
- [ ] `d` on a non-primary row triggers inline delete confirmation
- [ ] `d` on the primary row is silently ignored; the status bar briefly shows "Cannot delete primary email"
- [ ] `v` on an unverified row triggers verification email send
- [ ] `v` on a verified row is silently ignored
- [ ] `p` on a verified, non-primary row sets that email as primary
- [ ] `p` on the primary row or an unverified row is silently ignored
- [ ] Delete confirmation shows "Remove {email}? [y/N]" inline below the focused row
- [ ] Pressing `y` in delete confirmation executes `DELETE /api/user/emails/:id`
- [ ] Pressing `n`, `N`, or `Esc` in delete confirmation cancels
- [ ] Successful delete removes the row from the list and advances focus
- [ ] Successful add clears the input and appends the new email to the list
- [ ] Successful primary change re-sorts the list with new primary first
- [ ] Verification send shows "Verification sent" confirmation for 3 seconds
- [ ] Verification send enters 15-second cooldown per row after success
- [ ] The "Set as primary" toggle is rendered as `[ ]` / `[x]` and toggled with `Space` when focused
- [ ] Client-side validation: non-empty, contains `@`, length 3–254 characters
- [ ] Client-side validation error shown in red (ANSI 196) below the input
- [ ] At maximum 10 emails, the input is disabled with message "Maximum of 10 email addresses reached."
- [ ] A loading spinner is shown while the email list is initially fetching
- [ ] An empty list shows "No email addresses configured." with hint "Press a to add"
- [ ] Error on list fetch shows "Failed to load emails. Press R to retry."
- [ ] The Add button shows "Adding…" and input is disabled during submission
- [ ] On add failure, the form remains filled so the user can retry without retyping
- [ ] On add success, a green "Email added" confirmation appears for 3 seconds
- [ ] All actions provide immediate optimistic feedback with revert on server error
- [ ] The screen is fully operable with keyboard only — no mouse required

### Keyboard Interactions

- [ ] `j`/`Down`: Move focus to next email row
- [ ] `k`/`Up`: Move focus to previous email row
- [ ] `G`: Jump to last email row
- [ ] `g g`: Jump to first email row
- [ ] `Ctrl+D`: Page down
- [ ] `Ctrl+U`: Page up
- [ ] `a`: Focus add email input
- [ ] `d`: Delete focused non-primary email (with confirmation)
- [ ] `v`: Send verification for unverified email
- [ ] `p`: Set verified non-primary as primary
- [ ] `y`/`n`/`Esc`: Confirm/cancel delete
- [ ] `Enter`/`Ctrl+S`: Submit add form
- [ ] `Space`: Toggle primary checkbox
- [ ] `Tab`/`Shift+Tab`: Cycle focus
- [ ] `/`: Filter emails
- [ ] `R`: Retry failed operation
- [ ] `1`–`7`: Switch settings tabs
- [ ] `?`: Help overlay
- [ ] `:`: Command palette

### Truncation and Boundary Constraints

- [ ] Email input: max 254 chars; scrolls horizontally
- [ ] Email display: truncated with `…` at 40/60/100 chars by terminal size
- [ ] Minimum 20 chars before truncation applies
- [ ] Badges never truncated: `[Primary]` (9ch), `[Verified]` (10ch), `[Unverified]` (12ch)
- [ ] Date: `Jan 15, 2025` (12ch); hidden at minimum width
- [ ] Max 10 emails per user; no virtual scrolling needed
- [ ] Error/success messages truncated at terminal width minus 4 with `…`

### Edge Cases

- [ ] Terminal resize preserves focus, scroll position, and all state
- [ ] Network errors show inline error with retry hint; form input preserved
- [ ] 401 shows "Session expired" message
- [ ] 409 shows duplicate conflict error
- [ ] 422 shows validation error with red input border
- [ ] 429 shows rate limit with retry-after countdown
- [ ] 501 on verify shows "not yet available" message
- [ ] Single email user: `d` inert, no "Set primary" available
- [ ] Zero emails: empty state with add form functional
- [ ] Max 10 emails: input disabled with message
- [ ] Duplicate email on same account: upsert, no error
- [ ] International characters, `+` aliases, mixed-case: displayed correctly
- [ ] Rapid keypresses: in-flight guards and 100ms debounce prevent duplicates
- [ ] 15-second cooldown on verification send
- [ ] SSE disconnect has no impact (REST-only operations)

## Design

### Layout Structure

The Emails tab uses a vertical flexbox layout within the Settings screen content area. Two sections: add email form at top, scrollable email list below. Column headers (EMAIL, PRIMARY, VERIFIED, ADDED) are shown at standard+ sizes.

At 120×40: Full table with email (60ch), badges, date. Add form with input + toggle + Add button.
At 80×24: Compact — email (40ch) + badges only, date hidden. Single-line form.
At 200×60+: Spacious — email (100ch), extra padding, full labels.

### Component Tree

Uses `<box>` for layout, `<scrollbox>` for the email list, `<input>` for add-email form and filter, `<text>` for labels, badges, table rows, and confirmation prompts. The add form is rendered persistently above the list. Delete confirmation is inline below the focused row. Filter input appears at the bottom when activated.

### Keybinding Reference

| Key | Context | Action |
|-----|---------|--------|
| `j`/`Down` | Email list | Next row |
| `k`/`Up` | Email list | Previous row |
| `G` | Email list | Last row |
| `g g` | Email list | First row |
| `Ctrl+D`/`Ctrl+U` | Email list | Page down/up |
| `a` | Email list | Focus add input |
| `d` | Non-primary row | Delete confirmation |
| `v` | Unverified row | Send verification |
| `p` | Verified non-primary row | Set primary |
| `/` | Email list | Activate filter |
| `Tab`/`Shift+Tab` | Form | Cycle focus: input → toggle → Add → list |
| `Enter`/`Ctrl+S` | Form | Submit add |
| `Space` | Toggle focused | Toggle checkbox |
| `Esc` | Various | Cancel/back |
| `y`/`n` | Delete confirm | Confirm/cancel |
| `R` | Error state | Retry |

### Responsive Column Layout

| Breakpoint | Email Col | Date | Primary Label | Add Button |
|------------|----------|------|---------------|------------|
| 80×24 | 40ch+`…` | Hidden | "Primary" | "[Add]" |
| 120×40 | 60ch+`…` | Visible | "Set as primary" | "[Add]" |
| 200×60+ | 100ch+`…` | Visible+padding | "Set as primary" | "[Add email]" |

### Data Hooks

- `useUserEmails()` — Fetch user emails (`GET /api/user/emails`). Returns `{ data: EmailResponse[], isLoading, error, refetch }`. Sorted primary-first, then by `created_at` ascending.
- `useAddEmail()` — Add email (`POST /api/user/emails`). Accepts `{ email: string, is_primary: boolean }`. Returns `EmailResponse`. Invalidates cache.
- `useDeleteEmail()` — Delete email (`DELETE /api/user/emails/:id`). Returns void. Invalidates cache.
- `useSendVerification()` — Send verification (`POST /api/user/emails/:id/verify`). Returns void.
- `useUser()` — Current user context and auth status.
- `useKeyboard` — Register keybinding handlers.
- `useTerminalDimensions` — Terminal size for responsive layout.
- `useOnResize` — Trigger re-layout on resize.

### API Shape

| Action | Method | Endpoint | Body | Status |
|--------|--------|----------|------|--------|
| List | GET | `/api/user/emails` | — | 200 |
| Add | POST | `/api/user/emails` | `{ email, is_primary? }` | 201 |
| Delete | DELETE | `/api/user/emails/:id` | — | 204 |
| Verify | POST | `/api/user/emails/:id/verify` | — | 204 (currently 501) |

EmailResponse: `{ id: number, email: string, is_activated: boolean, is_primary: boolean, created_at: string }`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Self) | Authenticated (Other) | Admin |
|--------|-----------|----------------------|----------------------|-------|
| View emails tab | Not allowed | Allowed | Not allowed | Via admin API |
| List own emails | Not allowed | Allowed | Not allowed | Via admin API |
| Add email | Not allowed | Allowed | Not allowed | Not allowed |
| Delete email | Not allowed | Allowed | Not allowed | Not allowed |
| Send verification | Not allowed | Allowed | Not allowed | Not allowed |
| Set primary | Not allowed | Allowed | Not allowed | Not allowed |

- User ID is always derived from the authenticated token — never from user input. This eliminates IDOR by design.
- The TUI reads its auth token from the CLI keychain (stored by `codeplane auth login`) or the `CODEPLANE_TOKEN` environment variable.
- If the token is expired or invalid, the API returns 401 and the TUI displays: "Session expired. Run `codeplane auth login` to re-authenticate."
- The TUI does not implement any OAuth browser flow. Authentication is fully delegated to the CLI.
- Organization admins have no visibility into member email addresses through this surface.

### Rate Limiting

| Endpoint | Limit | Scope | TUI Behavior on 429 |
|----------|-------|-------|---------------------|
| `GET /api/user/emails` | 5,000/hour | Per user | Show error with retry hint |
| `POST /api/user/emails` | 10/minute | Per user | Show "Rate limit exceeded. Try again in {N} seconds." inline |
| `DELETE /api/user/emails/:id` | 10/10 minutes | Per user | Show rate limit message, revert optimistic delete |
| `POST /api/user/emails/:id/verify` | 3/15 minutes | Per user | Show "Verification rate limited. Try again in {N} minutes." |

All rate-limited responses include `Retry-After` header. No automatic retry; user must press `R` after timer expires.

### Input Sanitization & Data Privacy

- Email input trimmed of whitespace before submission
- Server performs format validation and case-insensitive duplicate detection via `lower_email`
- Terminal rendering is inherently safe from XSS
- Email addresses are PII: never logged (only IDs and counts), not included in telemetry events
- API never returns `lower_email`, `user_id`, or `updated_at` fields
- All email API responses include `Cache-Control: no-store`
- Verification tokens never displayed in TUI (browser-only flow)

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.settings.emails.opened` | User navigates to Emails tab | `user_id`, `client` ("tui"), `terminal_columns`, `terminal_rows`, `email_count` |
| `tui.settings.emails.listed` | Email list fetched successfully | `user_id`, `email_count`, `verified_count`, `has_primary`, `client` |
| `tui.settings.emails.add.submitted` | User submits add form | `user_id`, `is_primary`, `client` |
| `tui.settings.emails.add.succeeded` | POST returns 201 | `user_id`, `is_primary`, `email_count_after`, `duration_ms`, `client` |
| `tui.settings.emails.add.failed` | POST returns 4xx/5xx | `user_id`, `error_status`, `error_reason`, `duration_ms`, `client` |
| `tui.settings.emails.add.validation_failed` | Client-side validation rejects | `user_id`, `reason` (empty/no_at/too_short/too_long), `client` |
| `tui.settings.emails.delete.confirmed` | User confirms deletion with `y` | `user_id`, `was_verified`, `client` |
| `tui.settings.emails.delete.succeeded` | DELETE returns 204 | `user_id`, `was_verified`, `email_count_after`, `duration_ms`, `client` |
| `tui.settings.emails.delete.failed` | DELETE returns 4xx/5xx | `user_id`, `error_status`, `error_reason`, `duration_ms`, `client` |
| `tui.settings.emails.delete.cancelled` | User cancels with `n`/`Esc` | `user_id`, `client` |
| `tui.settings.emails.verify.requested` | User presses `v` | `user_id`, `client` |
| `tui.settings.emails.verify.succeeded` | Verify returns 204 | `user_id`, `duration_ms`, `client` |
| `tui.settings.emails.verify.failed` | Verify returns 4xx/5xx | `user_id`, `error_status`, `error_reason`, `client` |
| `tui.settings.emails.primary.changed` | Set-primary succeeds | `user_id`, `email_count`, `duration_ms`, `client` |
| `tui.settings.emails.filter.used` | User uses `/` to filter | `user_id`, `filter_length`, `result_count`, `client` |
| `tui.settings.emails.load_failed` | Initial GET fails | `user_id`, `error_code`, `error_message`, `client` |
| `tui.settings.emails.max_reached` | User sees max limit message | `user_id`, `email_count`, `client` |

All events include: `session_id`, `timestamp` (ISO 8601 UTC), `tui_version`, `terminal_type` (from `TERM` env var).

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Email settings visit rate | ≥10% of TUI users within 30 days | Discoverability |
| Add email success rate | ≥90% of add attempts succeed | Form usability |
| Verification request rate | ≥60% of new emails trigger verify within 5 min | Flow discoverability |
| Delete cancellation rate | <50% of confirmations cancelled | Confirmation UX calibration |
| Error recovery rate | ≥80% of errors result in successful retry | Error message effectiveness |
| Load success rate | >99% of list loads succeed first attempt | API reliability |
| Time to add email | <15s median from tab activation to success | Form efficiency |
| TUI vs. web email operations | Track share by client | TUI adoption |

## Observability

### Logging Requirements

| Level | Event | Details |
|-------|-------|---------|
| `debug` | Emails tab opened | `{ action: "emails_tab_opened", emailCount }` |
| `debug` | Email list fetched | `{ action: "emails_listed", count, verifiedCount, responseTimeMs }` |
| `info` | Email added | `{ action: "email_added", emailId, isPrimary, responseTimeMs }` — NO email address |
| `info` | Email deleted | `{ action: "email_deleted", emailId, responseTimeMs }` — NO email address |
| `info` | Verification requested | `{ action: "verification_requested", emailId, responseTimeMs }` — NO email address |
| `info` | Primary changed | `{ action: "primary_changed", emailId, responseTimeMs }` — NO email address |
| `warn` | Add validation error | `{ action: "email_add_validation", errorType, inputLength }` |
| `warn` | API error (4xx) | `{ action: "email_api_error", endpoint, status, errorReason }` |
| `error` | Server error (5xx) | `{ action: "email_server_error", endpoint, status, requestId }` |
| `warn` | Rate limited (429) | `{ action: "email_rate_limited", endpoint, retryAfter }` |
| `warn` | Token expired (401) | `{ action: "email_auth_expired" }` |
| `debug` | Focus changed | `{ action: "focus_changed", from, to, rowIndex }` |
| `debug` | Delete confirmation | `{ action: "delete_confirm_shown", emailId }` / `{ action: "delete_confirm_cancelled", emailId }` |
| `debug` | Terminal resize | `{ action: "resize", oldCols, oldRows, newCols, newRows }` |
| `debug` | Verify cooldown active | `{ action: "verify_cooldown", emailId, remainingSeconds }` |
| `error` | Render error | `{ action: "emails_render_error", error }` |

**Rules**: NEVER log email addresses at any level (PII). Only log email IDs and counts. All entries include `session_id`.

### Error Cases Specific to TUI

| Error Case | Behavior | Recovery |
|------------|----------|---------|
| Terminal resize during form input | Input value preserved, layout reflows | Automatic |
| Terminal resize during delete confirmation | Prompt re-renders at new width | User can still press `y`/`n` |
| Terminal resize below 80×24 | "Terminal too small" from app shell | Resize back to 80×24+ |
| Auth token expired mid-session | 401 inline error shown | Run `codeplane auth login` |
| API 500 on list fetch | Error with retry hint | Press `R` |
| API 500 on add | Form retains input; error inline | Retry submission |
| API 500 on delete | Optimistic delete reverts | Retry `d` → `y` |
| API 501 on verify | "Not yet available" message | No recovery; feature pending |
| API 429 rate limit | Cooldown with Retry-After | Wait and press `R` |
| Network timeout | Error message shown | Press `R` or retry action |
| React error boundary | Error with restart hint | Press `R` to re-mount |
| Focus lost after action | Auto-refocus first row | Automatic |
| SSE disconnect | No impact (REST-only) | N/A |

### Failure Modes and Degradation

| Failure | Impact | Degradation |
|---------|--------|-------------|
| API unreachable | Cannot load/act | Cached data if available; error banner for fresh loads |
| Token expired | All calls 401 | Auth error; action keys disabled |
| Empty list | No rows | Empty state; add form functional |
| Rapid key input | Potential duplicate calls | 100ms debounce + in-flight guards |
| Terminal too small | Cannot render | App shell "too small" message |
| Long session | Stale cache | Invalidated on every mutation |
| Memory | Bounded at 10 items | No growth concerns |
| Terminal disconnect during mutation | Server may complete | Next load reflects actual state |

## Verification

### Test File: `e2e/tui/settings.test.ts`

All tests target `TUI_SETTINGS_EMAILS` using `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped). Total: 90 tests.

#### Snapshot Tests (16)

1. `TUI_SETTINGS_EMAILS — emails tab renders with email list at 120x40`
2. `TUI_SETTINGS_EMAILS — emails tab renders at 80x24 minimum size`
3. `TUI_SETTINGS_EMAILS — emails tab renders at 200x60 large size`
4. `TUI_SETTINGS_EMAILS — add email form renders with input placeholder and toggle`
5. `TUI_SETTINGS_EMAILS — empty email list renders empty state`
6. `TUI_SETTINGS_EMAILS — loading state renders spinner`
7. `TUI_SETTINGS_EMAILS — error state renders with retry hint`
8. `TUI_SETTINGS_EMAILS — primary email row is highlighted with badge`
9. `TUI_SETTINGS_EMAILS — verified badge renders in green`
10. `TUI_SETTINGS_EMAILS — unverified badge renders in yellow`
11. `TUI_SETTINGS_EMAILS — delete confirmation prompt renders inline`
12. `TUI_SETTINGS_EMAILS — client-side validation error renders below input`
13. `TUI_SETTINGS_EMAILS — max emails message renders when at limit`
14. `TUI_SETTINGS_EMAILS — status bar shows keybinding hints`
15. `TUI_SETTINGS_EMAILS — breadcrumb reads Settings > Emails`
16. `TUI_SETTINGS_EMAILS — Emails tab is selected in tab bar`

#### Keyboard Interaction Tests (30)

17. `TUI_SETTINGS_EMAILS — j moves focus to next email row`
18. `TUI_SETTINGS_EMAILS — k moves focus to previous email row`
19. `TUI_SETTINGS_EMAILS — G jumps to last email`
20. `TUI_SETTINGS_EMAILS — g g jumps to first email`
21. `TUI_SETTINGS_EMAILS — a focuses add-email input`
22. `TUI_SETTINGS_EMAILS — Esc returns focus from input to list`
23. `TUI_SETTINGS_EMAILS — Enter submits add-email form`
24. `TUI_SETTINGS_EMAILS — Ctrl+S submits add-email form`
25. `TUI_SETTINGS_EMAILS — d then y deletes non-primary email`
26. `TUI_SETTINGS_EMAILS — d then n cancels delete`
27. `TUI_SETTINGS_EMAILS — d then Esc cancels delete`
28. `TUI_SETTINGS_EMAILS — d on primary email is inert`
29. `TUI_SETTINGS_EMAILS — v on unverified email sends verification`
30. `TUI_SETTINGS_EMAILS — v on verified email is inert`
31. `TUI_SETTINGS_EMAILS — v enters 15-second cooldown after success`
32. `TUI_SETTINGS_EMAILS — p sets verified non-primary as primary`
33. `TUI_SETTINGS_EMAILS — p on primary email is inert`
34. `TUI_SETTINGS_EMAILS — p on unverified email is inert`
35. `TUI_SETTINGS_EMAILS — Tab cycles focus through form and list`
36. `TUI_SETTINGS_EMAILS — Shift+Tab cycles backward`
37. `TUI_SETTINGS_EMAILS — Space toggles primary checkbox`
38. `TUI_SETTINGS_EMAILS — R retries after load error`
39. `TUI_SETTINGS_EMAILS — / activates filter mode`
40. `TUI_SETTINGS_EMAILS — Esc clears filter`
41. `TUI_SETTINGS_EMAILS — add email with set-as-primary toggle`
42. `TUI_SETTINGS_EMAILS — add duplicate email owned by same user upserts`
43. `TUI_SETTINGS_EMAILS — add email owned by another user shows 409 conflict`
44. `TUI_SETTINGS_EMAILS — Ctrl+D pages down`
45. `TUI_SETTINGS_EMAILS — Ctrl+U pages up`
46. `TUI_SETTINGS_EMAILS — tab number 2 selects Emails tab`

#### Responsive Tests (8)

47. `TUI_SETTINGS_EMAILS — date column hidden at 80x24`
48. `TUI_SETTINGS_EMAILS — date column visible at 120x40`
49. `TUI_SETTINGS_EMAILS — resize 120x40 to 80x24 hides date column`
50. `TUI_SETTINGS_EMAILS — resize 80x24 to 120x40 shows date column`
51. `TUI_SETTINGS_EMAILS — email truncation adapts to terminal width`
52. `TUI_SETTINGS_EMAILS — delete confirmation adapts to width`
53. `TUI_SETTINGS_EMAILS — add form layout at 200x60`
54. `TUI_SETTINGS_EMAILS — resize below 80x24 shows too-small message`

#### Error Handling Tests (12)

55. `TUI_SETTINGS_EMAILS — 401 on list load shows session expired`
56. `TUI_SETTINGS_EMAILS — 401 on add shows session expired`
57. `TUI_SETTINGS_EMAILS — 409 on add shows duplicate conflict error`
58. `TUI_SETTINGS_EMAILS — 422 on add shows validation error with red input`
59. `TUI_SETTINGS_EMAILS — 429 on add shows rate limit message`
60. `TUI_SETTINGS_EMAILS — 429 on delete shows rate limit and reverts`
61. `TUI_SETTINGS_EMAILS — 500 on add shows server error and preserves input`
62. `TUI_SETTINGS_EMAILS — 500 on list load shows retry hint`
63. `TUI_SETTINGS_EMAILS — 500 on delete reverts optimistic removal`
64. `TUI_SETTINGS_EMAILS — 501 on verify shows not implemented message`
65. `TUI_SETTINGS_EMAILS — network timeout on add preserves input`
66. `TUI_SETTINGS_EMAILS — auth expired disables all actions`

#### Edge Case Tests (12)

67. `TUI_SETTINGS_EMAILS — single email user cannot delete`
68. `TUI_SETTINGS_EMAILS — email with + alias displays correctly`
69. `TUI_SETTINGS_EMAILS — mixed-case email preserves casing`
70. `TUI_SETTINGS_EMAILS — rapid d then y does not double-delete`
71. `TUI_SETTINGS_EMAILS — whitespace-only input shows validation error`
72. `TUI_SETTINGS_EMAILS — input exceeding 254 chars shows validation error`
73. `TUI_SETTINGS_EMAILS — input missing @ shows validation error`
74. `TUI_SETTINGS_EMAILS — form retains value on server error`
75. `TUI_SETTINGS_EMAILS — help overlay shows emails-specific keybindings`
76. `TUI_SETTINGS_EMAILS — focus moves to previous row when last row deleted`
77. `TUI_SETTINGS_EMAILS — focus returns to input after successful add`
78. `TUI_SETTINGS_EMAILS — rate limited verify shows cooldown message`

#### Integration Tests (12)

79. `TUI_SETTINGS_EMAILS — e2e email list loads from API on tab open`
80. `TUI_SETTINGS_EMAILS — e2e add email calls POST and refreshes list`
81. `TUI_SETTINGS_EMAILS — e2e add email as primary flow`
82. `TUI_SETTINGS_EMAILS — e2e delete email calls DELETE and updates list`
83. `TUI_SETTINGS_EMAILS — e2e delete with confirmation cancel`
84. `TUI_SETTINGS_EMAILS — e2e verify email calls POST verify endpoint`
85. `TUI_SETTINGS_EMAILS — e2e set primary re-sorts list`
86. `TUI_SETTINGS_EMAILS — e2e optimistic add reverts on server error`
87. `TUI_SETTINGS_EMAILS — e2e optimistic delete reverts on server error`
88. `TUI_SETTINGS_EMAILS — e2e navigate to emails via g s then 2`
89. `TUI_SETTINGS_EMAILS — e2e navigate to emails via command palette`
90. `TUI_SETTINGS_EMAILS — e2e full lifecycle: add, set primary, delete old`
