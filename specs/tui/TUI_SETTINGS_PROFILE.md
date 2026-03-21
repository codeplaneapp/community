# TUI_SETTINGS_PROFILE

Specification for TUI_SETTINGS_PROFILE.

## High-Level User POV

The Settings Profile screen is the primary place where a Codeplane terminal user views and edits their personal profile information. It lives under the Settings tab navigation as the first (default) tab, accessible via `g s` (go-to settings) from any screen, or by navigating to Settings from the command palette with `:settings` or `:settings profile`. When the settings screen opens, the Profile tab is selected by default.

The breadcrumb updates to show "Settings > Profile" in the header bar. The screen renders as a single-column form layout within the content area between the header and status bars. At the top, a read-only profile summary section displays the user's username (not editable — displayed as a dimmed `@username` label), account creation date, and admin status badge (if applicable). This summary provides context but is not part of the editable form.

Below the summary, the editable form fields are arranged in a vertical stack. There are four fields: Display Name, Bio, Avatar URL, and Email. The Display Name is a single-line `<input>` that accepts the user's preferred display name. The Bio is a multi-line `<input>` (rendered as a textarea-style scrollable input) for a short biography. The Avatar URL is a single-line `<input>` for a URL pointing to the user's avatar image (since the TUI cannot render images, this URL is shown as text and a note reminds the user that the avatar will be visible on the web UI). The Email field is a single-line `<input>` showing the user's primary email address.

When the screen loads, all fields are pre-populated with the current profile data fetched from the API. The Display Name field receives initial focus. Navigation between fields uses `Tab` (forward) and `Shift+Tab` (backward). The tab order is: Display Name → Bio → Avatar URL → Email → Save → Cancel. The currently focused field is highlighted with a `primary` color (blue, ANSI 33) border and a `▸` indicator in the left margin. Unfocused fields display a `border` color (ANSI 240) border.

The Bio field behaves as a multi-line text area. It scrolls vertically when content exceeds the visible height. The user types freely, and line breaks are preserved. At minimum terminal size, the Bio field is 3 lines tall; at standard size, 6 lines; at large size, 10 lines.

Saving is triggered by `Ctrl+S` from any field, or by pressing `Enter` on the "Save" button. Only fields that differ from the original fetched values are included in the PATCH request. During submission, the Save button changes to "Saving…" and all inputs become disabled. On success, a green "Profile updated" confirmation message appears at the top of the form for 3 seconds, and the form data is refreshed with the server response. On failure, the form remains editable with a red error banner at the top.

Cancellation is triggered by pressing `Esc` or selecting the Cancel button. If the form has unsaved changes (dirty state), a confirmation dialog asks "Discard unsaved changes? [y/N]". If the form is clean, pressing `Esc` navigates back in the stack (or switches focus to the settings tab bar if the profile tab is the root settings view).

The profile form is optimized for quick edits. The most common operation — updating the display name — is a three-keystroke flow: navigate to settings, type the new name, press `Ctrl+S`. The form does not require any context beyond the authenticated user's token.

At minimum terminal size (80×24), the form collapses to a compact single-column layout with abbreviated field labels ("Name:", "Bio:", "Avatar:", "Email:") and the Bio field reduced to 3 lines. At standard size (120×40), full field labels are shown ("Display Name:", "Bio:", "Avatar URL:", "Email:") with comfortable spacing. At large size (200×60+), additional vertical padding and wider input fields provide a spacious editing experience.

## Acceptance Criteria

### Definition of Done

- [ ] The Profile tab renders as the default (first) tab within the Settings screen
- [ ] The breadcrumb reads "Settings > Profile" when the Profile tab is active
- [ ] The screen is reachable via `g s` (go-to settings), `:settings`, or `:settings profile` from the command palette
- [ ] Tab number `1` selects the Profile tab when Settings screen has focus
- [ ] A read-only profile summary section displays `@username`, account creation date, and admin badge (if applicable)
- [ ] Username is not editable and is displayed with `muted` color (ANSI 245)
- [ ] Four editable fields are present: Display Name, Bio, Avatar URL, Email
- [ ] All fields are pre-populated with data from `GET /api/user` via `useUser()` hook
- [ ] Display Name field receives initial focus when the Profile tab is selected
- [ ] Tab order cycles: Display Name → Bio → Avatar URL → Email → Save → Cancel
- [ ] `Ctrl+S` submits the form from any field
- [ ] Only modified fields are included in the `PATCH /api/user` request payload
- [ ] On successful save, a green "Profile updated" confirmation appears for 3 seconds
- [ ] On successful save, form data is refreshed from the server response
- [ ] On save failure, a red error banner appears at the top with the error message
- [ ] `Esc` triggers cancellation with dirty-check if unsaved changes exist
- [ ] The discard confirmation dialog renders "Discard unsaved changes? [y/N]" in a centered modal overlay
- [ ] A loading spinner is shown while profile data is initially fetching
- [ ] The Save button shows "Saving…" and all inputs are disabled during submission
- [ ] Optimistic UI: save button disables immediately on submission, reverts if server returns error
- [ ] Form state is preserved across settings tab switches (switching to Emails tab and back retains unsaved edits)
- [ ] The `updated_at` timestamp on the server is refreshed on every successful save, regardless of whether field values actually changed

### Keyboard Interactions

- [ ] `Tab`: Move focus to the next form field
- [ ] `Shift+Tab`: Move focus to the previous form field
- [ ] `Ctrl+S`: Submit the form from any field position
- [ ] `Enter`: When on Save button, submit. When on Cancel button, trigger cancel flow
- [ ] `Esc`: If discard dialog is open, close it. If form is dirty, show discard dialog. If form is clean, navigate back / to settings tab bar
- [ ] `y`: In the discard confirmation dialog, confirm discard
- [ ] `n` / `N` / `Esc`: In the discard confirmation dialog, return to form
- [ ] `j` / `Down`: Within the Bio field, move cursor down a line
- [ ] `k` / `Up`: Within the Bio field, move cursor up a line
- [ ] `R`: After a save error, retry the save operation
- [ ] `Ctrl+C`: Quit TUI (global binding, overrides form)
- [ ] `?`: Toggle help overlay showing profile-screen keybindings
- [ ] `1`–`7`: Switch between settings tabs (Profile is `1`)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the global router
- [ ] 80×24 – 119×39 (minimum): Single-column layout. Abbreviated field labels ("Name:", "Bio:", "Avatar:", "Email:"). Bio field is 3 lines tall. Input fields span full content width minus label. Avatar URL note hidden
- [ ] 120×40 – 199×59 (standard): Single-column layout. Full field labels ("Display Name:", "Bio:", "Avatar URL:", "Email:"). Bio field is 6 lines tall. Avatar URL note shown below field in muted text
- [ ] 200×60+ (large): Single-column layout with wider gutters. Bio field is 10 lines tall. All metadata and notes fully visible

### Truncation and Boundary Constraints

- [ ] Display Name: maximum 255 characters; input scrolls horizontally beyond visible width
- [ ] Bio: maximum 2,000 characters; textarea scrolls vertically; character count shown as `{current}/{max}` in muted text below the field
- [ ] Avatar URL: maximum 2,048 characters; input scrolls horizontally; validated as HTTP/HTTPS URL on the server (non-empty values only)
- [ ] Email: maximum 254 characters (RFC 5321); input scrolls horizontally
- [ ] Username display: truncated at 39 characters with `…` (though usernames are typically short)
- [ ] Creation date: formatted as `YYYY-MM-DD` (10 characters, never truncated)
- [ ] Error messages: truncated at terminal width minus 4 characters with `…`
- [ ] Confirmation message: truncated at terminal width minus 4 characters with `…`
- [ ] Field labels: minimum 7 characters wide at 80-col, 14 characters at 120-col+
- [ ] Display name leading/trailing whitespace is trimmed server-side before storage
- [ ] Avatar URL leading/trailing whitespace is trimmed server-side before storage
- [ ] Bio is stored as-is (whitespace is not trimmed) to preserve intentional formatting

### Edge Cases

- [ ] Terminal resize while form is open: Layout recalculates, Bio height adjusts, field focus and input content preserved
- [ ] Terminal resize while discard dialog is open: Dialog repositions; confirmation state preserved
- [ ] Save during network disconnect: Red error banner with "Network error. Press R to retry."
- [ ] 401 on save (token expired): "Session expired. Run `codeplane auth login` to re-authenticate."
- [ ] 422 on save (validation error): Server validation message shown, offending field highlighted with red (ANSI 196) border
- [ ] 429 on save (rate limit): "Rate limit exceeded. Try again in {retry-after} seconds."
- [ ] 500+ on save (server error): "Server error" with request ID shown
- [ ] Initial profile fetch fails: Full-screen error with "Failed to load profile. Press R to retry."
- [ ] Empty display name is allowed (server trims to empty string, falls back to username in display contexts)
- [ ] Display name consisting only of whitespace is trimmed to empty string server-side (equivalent to clearing)
- [ ] Avatar URL with invalid format (non-HTTP/HTTPS, e.g. `ftp://`, `not-a-url`): Server returns 422; field highlighted red
- [ ] Avatar URL with valid HTTPS but no image extension (e.g. `https://example.com/avatar`): Accepted by server
- [ ] Unicode characters in display name and bio: Rendered correctly; wide characters (CJK, emoji) consume 2 columns
- [ ] Very long bio text: Textarea scrolls; no performance degradation up to 2,000 characters
- [ ] Rapid Tab presses: Processed sequentially, no focus skip
- [ ] Submitting with no changes: No PATCH request sent; "No changes to save" message shown in muted text for 2 seconds
- [ ] Form opened immediately after a previous save: Fresh data loaded, not stale cache
- [ ] Concurrent updates from another client (web/CLI): Last write wins; TUI refreshes from server response on next save or tab revisit
- [ ] Display name of exactly 255 characters: Accepted
- [ ] Display name of 256 characters: Server returns 422 validation error
- [ ] Bio of exactly 2,000 characters: Accepted; character counter shows `2000/2000`
- [ ] Bio exceeding 2,000 characters: Client-side character counter shows red; server returns 422
- [ ] Avatar URL of exactly 2,048 characters (valid HTTPS): Accepted
- [ ] Avatar URL of 2,049 characters: Server returns 422 validation error
- [ ] Email field changes are accepted in PATCH body but do NOT update the primary email (routed through email management flow)
- [ ] HTML tags in display name/bio are stored as literal text (no interpretation in terminal)
- [ ] NUL bytes (`\0`) in any field: Server returns 400 error

## Design

### Layout Structure

The Profile tab uses a vertical flexbox layout within the Settings screen content area. At standard (120×40) size:

```
┌──────────────────────────────────────────────────────────┐
│ Header: Settings > Profile                               │
├──────────────────────────────────────────────────────────┤
│ [1:Profile] [2:Emails] [3:SSH Keys] [4:Tokens] ...      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  @username              Member since 2025-01-15          │
│                                                          │
│  ▸ Display Name: [William Cory                        ]  │
│                                                          │
│    Bio:          ┌────────────────────────────────────┐  │
│                  │ Open source developer. Building    │  │
│                  │ tools for the terminal.            │  │
│                  │                                    │  │
│                  │                                    │  │
│                  │                                    │  │
│                  └────────────────────────────────────┘  │
│                  42/2000                                  │
│                                                          │
│    Avatar URL:   [https://example.com/avatar.png      ]  │
│                  ℹ Avatar is displayed on the web UI     │
│                                                          │
│    Email:        [william@example.com                 ]  │
│                                                          │
│                                    [Save]  [Cancel]      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Status: Tab:next Ctrl+S:save Esc:back ?:help             │
└──────────────────────────────────────────────────────────┘
```

At minimum (80×24):

```
┌──────────────────────────────────────────────────────────┐
│ Settings > Profile                                       │
├──────────────────────────────────────────────────────────┤
│ [1:Profile] [2:Emails] [3:SSH] [4:Tok] ...               │
├──────────────────────────────────────────────────────────┤
│  @username          Member since 2025-01-15              │
│ ▸ Name:   [William Cory                    ]            │
│   Bio:    ┌────────────────────────────────┐            │
│           │ Open source developer.         │            │
│           │ Building tools for terminal.   │            │
│           └────────────────────────────────┘            │
│           42/2000                                        │
│   Avatar: [https://example.com/avatar.png  ]            │
│   Email:  [william@example.com             ]            │
│                              [Save] [Cancel]            │
├──────────────────────────────────────────────────────────┤
│ Tab:next Ctrl+S:save Esc:back                            │
└──────────────────────────────────────────────────────────┘
```

### Discard Confirmation Dialog

Centered modal overlay with warning (ANSI 178) border:
```
┌────────────────────────────────┐
│  Discard unsaved changes?      │
│                                │
│          [y] Yes   [n] No      │
└────────────────────────────────┘
```
Width: 60% at standard size, 90% at minimum. Focus trapped within dialog.

### Error Banner

Red error banner at top of form content:
```
┌──────────────────────────────────────────────────────────┐
│ ✗ Invalid avatar URL. Press R to retry.                  │
└──────────────────────────────────────────────────────────┘
```
Uses error color (ANSI 196). Persists until field edit, `R` retry, or navigation.

### Success Confirmation

Green confirmation at top of form content:
```
┌──────────────────────────────────────────────────────────┐
│ ✓ Profile updated                                        │
└──────────────────────────────────────────────────────────┘
```
Uses success color (ANSI 34). Auto-dismisses after 3 seconds.

### Component Tree

Uses OpenTUI: `<box>` for layout, `<input>` for single-line fields, `<input multiline>` for bio, `<text>` for labels and read-only content, `<scrollbox>` for form body. Focused field indicated by `▸` prefix and primary (ANSI 33) border. Unfocused fields use border color (ANSI 240). Validation errors use red (ANSI 196) borders. Discard dialog uses `<box position="absolute">` with warning (ANSI 178) border.

### Keybinding Reference

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Form (no overlay) | Next field |
| `Shift+Tab` | Form (no overlay) | Previous field |
| `Ctrl+S` | Form (no overlay) | Submit modified fields |
| `Enter` | Save button focused | Submit |
| `Enter` | Cancel button focused | Cancel flow |
| `Esc` | Discard dialog open | Close dialog, return to form |
| `Esc` | Form (dirty) | Show discard dialog |
| `Esc` | Form (clean) | Navigate back |
| `y` | Discard dialog | Confirm discard |
| `n` / `Esc` | Discard dialog | Return to form |
| `R` | After save/load error | Retry operation |
| `1`–`7` | Settings tab bar | Switch settings tab |
| `?` | Any | Toggle help overlay |
| `:` | Any | Open command palette |
| `j` / `Down` | Bio field focused | Move cursor down |
| `k` / `Up` | Bio field focused | Move cursor up |
| `Ctrl+C` | Any | Quit TUI (global) |

### Responsive Column Layout

| Breakpoint | Bio Height | Label Width | Avatar Note | Input Width |
|------------|-----------|-------------|-------------|-------------|
| 80×24 | 3 lines | 7ch (abbrev) | Hidden | Full - label - 2 |
| 120×40 | 6 lines | 14ch (full) | Visible | Full - label - 4 |
| 200×60+ | 10 lines | 14ch (full) | Visible | 80% of content |

### Data Hooks

- `useUser()` — Fetch authenticated user profile (`GET /api/user`). Returns `UserProfile` with `id`, `username`, `display_name`, `email`, `bio`, `avatar_url`, `is_admin`, `created_at`, `updated_at`. Caches result; invalidated on save.
- `useUpdateUser()` — Submit profile changes (`PATCH /api/user`). Accepts partial `{ display_name?, bio?, avatar_url?, email? }`. Returns updated `UserProfile`. Invalidates `useUser()` cache.
- `useTerminalDimensions()` — Current terminal size for responsive layout
- `useOnResize(callback)` — Re-layout on terminal resize
- `useKeyboard(handler)` — Keybinding handler for form navigation

### API Contract

`GET /api/user` → 200: UserProfile | 401: auth error
`PATCH /api/user` → 200: UserProfile | 401: auth error | 422: validation error | 429: rate limit | 500: server error

### Navigation Context

Profile tab is default within Settings screen, reachable via `g s`, `:settings`, or `:settings profile`. On save, `useUser()` cache is invalidated. On cancel/back, returns to previous screen in navigation stack.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| Anonymous (no token) | Cannot access Settings. Redirect to auth error: "Run `codeplane auth login` to authenticate." |
| Authenticated user | Full access to view and edit own profile |
| Admin | Full access to own profile (admin panel for other users' profiles is web-only) |

The profile screen only allows editing the authenticated user's own profile. There is no mechanism to edit another user's profile from the TUI.

### Token Handling

- Auth via stored token from `codeplane auth login` or `CODEPLANE_TOKEN` environment variable
- Bearer token sent in `Authorization` header for `GET /api/user` and `PATCH /api/user`
- 401 on any request shows "Session expired. Run `codeplane auth login` to re-authenticate."
- No OAuth browser flow from TUI; authentication is fully delegated to CLI
- Token is read once at TUI startup; if it expires mid-session, the next API call will surface the 401 error

### Rate Limiting

- `PATCH /api/user` is subject to the standard API rate limit (60 requests/minute per user)
- `GET /api/user` is subject to the standard API rate limit
- 429 responses display "Rate limit exceeded. Try again in {retry-after} seconds."
- No automatic retry on rate limit; user must press `R` after the timer expires
- Profile data is cached in the `useUser()` hook; subsequent tab visits use cached data unless explicitly invalidated

### Input Sanitization

- Display name, bio, avatar URL, and email are sent as-is to the server; the server performs trimming and validation
- Avatar URL is validated server-side as a valid HTTP/HTTPS URL with non-empty host; 422 returned for `ftp://`, bare strings, etc.
- No client-side HTML stripping (terminal has no HTML interpreter; XSS is not applicable)
- Bio content supports arbitrary Unicode text including newlines
- NUL bytes (`\0`) in any field are rejected by the server with a 400 error
- Maximum request body size: 64 KB; larger payloads return 413 or 400

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.settings.profile.viewed` | Profile tab rendered with data | `terminal_width`, `terminal_height`, `has_display_name`, `has_bio`, `has_avatar_url`, `is_admin` |
| `tui.settings.profile.saved` | Successful PATCH response | `fields_changed[]`, `duration_ms`, `display_name_changed`, `bio_changed`, `avatar_url_changed`, `email_changed`, `terminal_width`, `terminal_height` |
| `tui.settings.profile.save_failed` | PATCH request fails | `error_code`, `error_message`, `fields_changed[]`, `duration_ms` |
| `tui.settings.profile.cancelled` | User cancels form | `had_changes`, `fields_modified[]`, `duration_ms` |
| `tui.settings.profile.discard_confirmed` | User confirms discard | `fields_modified[]`, `duration_ms` |
| `tui.settings.profile.discard_aborted` | User aborts discard | (none) |
| `tui.settings.profile.load_failed` | Initial GET request fails | `error_code`, `error_message` |
| `tui.settings.profile.validation_error` | Server returns 422 | `field`, `error_code` |
| `tui.settings.profile.no_changes_submitted` | User presses save with no changes | `duration_ms` |
| `tui.settings.profile.retry` | User presses R to retry after error | `retry_target` (`load` or `save`), `previous_error_code` |

### Success Indicators

- Save completion rate: >85% of profile views with edits result in successful save
- Time to save: <10s median for display-name-only edits, <30s for multi-field edits
- Error recovery rate: >75% of save failures result in successful retry within the same session
- Feature adoption: ratio of `profile.viewed` to total TUI sessions (indicates settings engagement)
- Discard rate: <20% of forms with changes are discarded
- Load success rate: >99% of profile views load successfully on first attempt

## Observability

### Logging

| Level | Event | Details |
|-------|-------|--------|
| `info` | Profile tab opened | `terminal_dimensions` |
| `info` | Profile data loaded | `user_id`, `response_time_ms` |
| `info` | Save submitted | `fields_changed[]`, `payload_size_bytes` |
| `info` | Save succeeded | `response_time_ms` |
| `warn` | Save failed (4xx) | `status_code`, `error_body` |
| `error` | Save failed (5xx) | `status_code`, `error_body`, `request_id` |
| `warn` | Token expired (401) | (none) |
| `warn` | Rate limited (429) | `retry_after` |
| `warn` | Profile load failed | `status_code`, `error_body` |
| `debug` | Field focus changed | `from_field`, `to_field` |
| `debug` | Dirty state changed | `is_dirty`, `modified_fields[]` |
| `debug` | Terminal resize during form | `old_dimensions`, `new_dimensions` |
| `info` | Discard confirmed | `modified_fields[]` |
| `info` | Retry triggered | `retry_target`, `attempt_number` |

### Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Network timeout on load | Full-screen error: "Failed to load profile. Press R to retry." | Press `R` to retry |
| Network timeout on save | Error banner: "Network error. Press R to retry." | Press `R` to retry |
| 401 Unauthorized | "Session expired. Run `codeplane auth login` to re-authenticate." | Re-authenticate via CLI, relaunch TUI |
| 422 Validation (avatar_url) | "Invalid avatar URL" shown; avatar_url field highlighted red (ANSI 196) | Correct URL and resubmit |
| 422 Validation (display_name) | "Display name too long" shown; display_name field highlighted red | Shorten and resubmit |
| 422 Validation (bio) | "Bio too long" shown; bio field highlighted red | Shorten and resubmit |
| 422 Validation (other) | Server message shown; offending field highlighted red | Correct input and resubmit |
| 429 Rate Limited | "Rate limit exceeded. Try again in {N} seconds." | Wait and press `R` |
| 500+ Server Error | "Server error" with request ID | Press `R` to retry |
| SSE disconnect during save | No impact (profile save is REST, not SSE) | N/A |
| Resize below 80×24 during form | "Terminal too small" message; form state preserved in memory | Resize back to 80×24+ |
| Resize during discard dialog | Dialog repositions to center; state preserved | Continue interaction |
| Token missing at startup | Settings screen shows auth error instead of form | Run `codeplane auth login` |
| 400 Malformed JSON | "Invalid request" error banner | Should not occur from TUI form; bug if triggered |
| 413 Body too large | "Request too large" error banner | Should not occur given field limits; bug if triggered |

### Failure Modes

- Profile save is atomic via a single `PATCH /api/user`; no partial save state possible
- Network disconnection during save: If the request reached the server, the update is applied. The TUI may show an error, but the profile is updated. The next load will reflect the change
- Long-running session: `useUser()` cache is invalidated on save; stale data risk is minimal
- Memory: Form state is lightweight (4 string fields, each bounded); no memory growth concerns
- Terminal disconnect during save: Server completes request; no cleanup needed client-side
- Concurrent edits from web/CLI: Last write wins; no conflict detection; TUI refreshes from server response on next save

## Verification

### Terminal Snapshot Tests

- [ ] `TUI_SETTINGS_PROFILE — renders profile form at 120x40 with all fields pre-populated`
- [ ] `TUI_SETTINGS_PROFILE — renders profile form at 80x24 minimum size with abbreviated labels`
- [ ] `TUI_SETTINGS_PROFILE — renders profile form at 200x60 large size with expanded bio`
- [ ] `TUI_SETTINGS_PROFILE — renders focused display name field with primary color border`
- [ ] `TUI_SETTINGS_PROFILE — renders focused bio field after Tab`
- [ ] `TUI_SETTINGS_PROFILE — renders focused avatar url field after two Tabs`
- [ ] `TUI_SETTINGS_PROFILE — renders focused email field after three Tabs`
- [ ] `TUI_SETTINGS_PROFILE — renders focused save button after four Tabs`
- [ ] `TUI_SETTINGS_PROFILE — renders read-only username and member-since in summary`
- [ ] `TUI_SETTINGS_PROFILE — renders admin badge for admin users`
- [ ] `TUI_SETTINGS_PROFILE — does not render admin badge for non-admin users`
- [ ] `TUI_SETTINGS_PROFILE — renders bio character count below bio field`
- [ ] `TUI_SETTINGS_PROFILE — renders bio character count in red when over 2000`
- [ ] `TUI_SETTINGS_PROFILE — renders avatar URL info note at standard size`
- [ ] `TUI_SETTINGS_PROFILE — hides avatar URL info note at minimum size`
- [ ] `TUI_SETTINGS_PROFILE — renders discard confirmation dialog with warning border`
- [ ] `TUI_SETTINGS_PROFILE — renders error banner on save failure`
- [ ] `TUI_SETTINGS_PROFILE — renders green success message after save`
- [ ] `TUI_SETTINGS_PROFILE — renders saving state on save button`
- [ ] `TUI_SETTINGS_PROFILE — renders loading spinner during initial data fetch`
- [ ] `TUI_SETTINGS_PROFILE — renders auth error when no token present`
- [ ] `TUI_SETTINGS_PROFILE — renders full-screen error when profile load fails`
- [ ] `TUI_SETTINGS_PROFILE — renders validation error with red field border on avatar_url`
- [ ] `TUI_SETTINGS_PROFILE — renders validation error with red field border on display_name`
- [ ] `TUI_SETTINGS_PROFILE — renders breadcrumb as Settings > Profile`
- [ ] `TUI_SETTINGS_PROFILE — renders Profile tab as selected in tab bar`
- [ ] `TUI_SETTINGS_PROFILE — renders no-changes message when save pressed with no edits`
- [ ] `TUI_SETTINGS_PROFILE — renders rate limit message with countdown`
- [ ] `TUI_SETTINGS_PROFILE — renders all inputs disabled during save submission`

### Keyboard Interaction Tests

- [ ] `TUI_SETTINGS_PROFILE — Tab cycles through all form fields in order`
- [ ] `TUI_SETTINGS_PROFILE — Shift+Tab cycles backward through fields`
- [ ] `TUI_SETTINGS_PROFILE — display name field is focused by default on load`
- [ ] `TUI_SETTINGS_PROFILE — Ctrl+S from display name field submits form`
- [ ] `TUI_SETTINGS_PROFILE — Ctrl+S from bio field submits form`
- [ ] `TUI_SETTINGS_PROFILE — Ctrl+S from avatar url field submits form`
- [ ] `TUI_SETTINGS_PROFILE — Ctrl+S from email field submits form`
- [ ] `TUI_SETTINGS_PROFILE — Enter on save button submits form`
- [ ] `TUI_SETTINGS_PROFILE — Enter on cancel button triggers cancel flow`
- [ ] `TUI_SETTINGS_PROFILE — Esc with no changes navigates back`
- [ ] `TUI_SETTINGS_PROFILE — Esc with changes shows discard dialog`
- [ ] `TUI_SETTINGS_PROFILE — y in discard dialog discards and navigates back`
- [ ] `TUI_SETTINGS_PROFILE — n in discard dialog returns to form`
- [ ] `TUI_SETTINGS_PROFILE — Esc in discard dialog returns to form`
- [ ] `TUI_SETTINGS_PROFILE — R after save error retries save`
- [ ] `TUI_SETTINGS_PROFILE — R after load error retries load`
- [ ] `TUI_SETTINGS_PROFILE — only modified fields included in PATCH payload`
- [ ] `TUI_SETTINGS_PROFILE — Ctrl+S with no changes shows no-changes message`
- [ ] `TUI_SETTINGS_PROFILE — typing in display name field updates value`
- [ ] `TUI_SETTINGS_PROFILE — typing in bio field updates value and character count`
- [ ] `TUI_SETTINGS_PROFILE — typing in avatar url field updates value`
- [ ] `TUI_SETTINGS_PROFILE — typing in email field updates value`
- [ ] `TUI_SETTINGS_PROFILE — tab number 1 selects profile tab`
- [ ] `TUI_SETTINGS_PROFILE — ? toggles help overlay`
- [ ] `TUI_SETTINGS_PROFILE — j/k navigation within bio field moves cursor`
- [ ] `TUI_SETTINGS_PROFILE — Tab wraps from Cancel back to Display Name`
- [ ] `TUI_SETTINGS_PROFILE — Shift+Tab wraps from Display Name to Cancel`

### Responsive Resize Tests

- [ ] `TUI_SETTINGS_PROFILE — resize from 120x40 to 80x24 preserves form state and adjusts bio height`
- [ ] `TUI_SETTINGS_PROFILE — resize from 80x24 to 200x60 expands layout and bio height`
- [ ] `TUI_SETTINGS_PROFILE — resize from 120x40 to 80x24 abbreviates field labels`
- [ ] `TUI_SETTINGS_PROFILE — resize from 80x24 to 120x40 restores full field labels`
- [ ] `TUI_SETTINGS_PROFILE — resize during discard dialog repositions dialog`
- [ ] `TUI_SETTINGS_PROFILE — resize below 80x24 shows too-small message`
- [ ] `TUI_SETTINGS_PROFILE — resize from below 80x24 back to 120x40 restores form with preserved state`

### Error Handling Tests

- [ ] `TUI_SETTINGS_PROFILE — 401 on load shows session expired message`
- [ ] `TUI_SETTINGS_PROFILE — 401 on save shows session expired message`
- [ ] `TUI_SETTINGS_PROFILE — 422 on save highlights invalid field with red border`
- [ ] `TUI_SETTINGS_PROFILE — 422 avatar_url validation shows specific error`
- [ ] `TUI_SETTINGS_PROFILE — 422 display_name validation shows specific error`
- [ ] `TUI_SETTINGS_PROFILE — 422 bio validation shows specific error`
- [ ] `TUI_SETTINGS_PROFILE — 429 on save shows rate limit message with countdown`
- [ ] `TUI_SETTINGS_PROFILE — 500 on save shows server error with request ID`
- [ ] `TUI_SETTINGS_PROFILE — network timeout on save shows retry hint`
- [ ] `TUI_SETTINGS_PROFILE — network timeout on load shows retry hint`
- [ ] `TUI_SETTINGS_PROFILE — successful save refreshes form data from response`
- [ ] `TUI_SETTINGS_PROFILE — successful save invalidates useUser cache`

### Integration Tests

- [ ] `TUI_SETTINGS_PROFILE — e2e update display name flow`
- [ ] `TUI_SETTINGS_PROFILE — e2e update bio flow`
- [ ] `TUI_SETTINGS_PROFILE — e2e update avatar url flow`
- [ ] `TUI_SETTINGS_PROFILE — e2e update email flow`
- [ ] `TUI_SETTINGS_PROFILE — e2e update multiple fields at once`
- [ ] `TUI_SETTINGS_PROFILE — e2e cancel without changes`
- [ ] `TUI_SETTINGS_PROFILE — e2e cancel with changes and confirm discard`
- [ ] `TUI_SETTINGS_PROFILE — e2e cancel with changes and abort discard`
- [ ] `TUI_SETTINGS_PROFILE — e2e navigate to profile via g s`
- [ ] `TUI_SETTINGS_PROFILE — e2e navigate to profile via command palette`
- [ ] `TUI_SETTINGS_PROFILE — e2e save with invalid avatar url and correct`
- [ ] `TUI_SETTINGS_PROFILE — e2e save with display name at 255 character boundary`
- [ ] `TUI_SETTINGS_PROFILE — e2e save with bio at 2000 character boundary`
- [ ] `TUI_SETTINGS_PROFILE — e2e save empty display name clears to username fallback`
- [ ] `TUI_SETTINGS_PROFILE — e2e form preserves state across settings tab switch`
