# TUI_AGENT_SESSION_CREATE

Specification for TUI_AGENT_SESSION_CREATE.

## High-Level User POV

The Agent Session Create feature provides the form experience for creating a new agent session in the Codeplane TUI. It is invoked by pressing `n` from the Agent Session List screen or by typing "New Agent Session" in the command palette. Session creation is a focused, lightweight interaction that captures a session title and immediately launches the user into the chat interface — there is no multi-field form, no selectors, and no configuration beyond naming the session. The goal is to eliminate friction between "I want to ask the agent something" and "I am talking to the agent."

There are three entry points for creating a new agent session. The most common is pressing `n` from the agent session list screen, which opens an inline title input directly within the list view. The second is using the command palette (`:`) and typing "new agent session" or "create agent session," which opens a small modal overlay with a title input. The third is the `g a` go-to keybinding followed by `n` — navigating to agents and immediately creating. All three entry points require an active repository context because agent sessions are scoped to a repository.

When the user presses `n` from the agent session list, the list dims slightly and a single-line text input appears inline between the toolbar and the list rows. The input is pre-focused with the placeholder "Session title…" in muted text and a bordered box in primary color. The user types a title — for example, "Fix auth timeout in login flow" — and presses `Enter` to create the session. A brief "Creating…" indicator replaces the input, and on success the TUI immediately pushes the agent chat screen for the newly created session with the input pre-focused so the user can begin typing their first message. The entire flow from pressing `n` to being in the chat screen takes under two seconds.

When the user creates a session via the command palette, a modal overlay appears centered on the screen with a title "New Agent Session," a single-line text input with the same "Session title…" placeholder, and two buttons: "Create" and "Cancel." The user types a title, presses `Enter` or `Ctrl+S` to submit, or presses `Esc` to cancel. On success, the TUI navigates to the new session's chat screen just as with the inline flow.

Validation is minimal but strict: the title must not be empty or whitespace-only, and it must not exceed 255 characters. If the user presses `Enter` with an empty input, nothing happens — the cursor stays in the input. If the user types beyond 255 characters, the input stops accepting characters. Duplicate titles are allowed — sessions are identified by UUID, not title.

On failure, the TUI shows an inline error message below the input in red text. If the failure is a 403 (insufficient permissions), the error reads "Insufficient permissions to create agent sessions." If the failure is a 429 (rate limit), the error reads "Rate limited. Retry in {n}s." If the failure is a network error or server 500, the error reads "Failed to create session. Press Enter to retry." The input retains the user's text so they can retry without retyping. Pressing `Esc` at any point cancels the creation and returns focus to the list (inline mode) or dismisses the modal (palette mode).

At the minimum terminal size (80×24), the inline input occupies a single row within the list area. At standard size (120×40), the input has comfortable horizontal padding and the placeholder text is fully visible. At large sizes (200×60+), the input renders with generous spacing. The command palette modal adapts its width to the terminal size (60% at standard, 90% at minimum). Terminal resize during session creation preserves the input text and focus state.

## Acceptance Criteria

### Definition of Done
- [ ] New agent session creation is available via `n` keybinding from the agent session list screen
- [ ] New agent session creation is available via command palette with "New Agent Session" / "Create Agent Session" entries
- [ ] Both inline and modal creation flows submit to `POST /api/repos/:owner/:repo/agent/sessions` with `{ title: string }` via `useCreateAgentSession()` from `@codeplane/ui-core`
- [ ] On successful creation (201), the TUI pushes the agent chat screen for the new session with the input pre-focused
- [ ] The breadcrumb updates correctly through the flow: "… > Agent Sessions" → "… > Agent Sessions" (inline input visible) → "… > Agents > {title}" (chat screen)
- [ ] Repository context is required; creation is blocked without one

### Title Input Behavior
- [ ] Title input is a single-line `<input>` pre-focused on open with "Session title…" placeholder in `muted` color
- [ ] Input border is `primary` color when focused, `border` color when blurred
- [ ] Standard text editing keys: `Backspace`, `Delete`, `Left`, `Right`, `Home`/`Ctrl+A`, `End`/`Ctrl+E`, `Ctrl+K` (kill to end), `Ctrl+U` (kill to start)
- [ ] Title max length: 255 characters enforced at input time (input stops accepting characters beyond 255)
- [ ] Title min length: 1 non-whitespace character (empty or whitespace-only titles are rejected client-side)
- [ ] `Enter` on non-empty input submits; `Enter` on empty input is a no-op
- [ ] `Esc` cancels creation and returns to previous state (list or palette)
- [ ] Rapid key input is buffered and processed in order; no keystrokes are dropped
- [ ] Pasted content (bracketed paste mode) is accepted and inserted at cursor, truncated at 255 characters
- [ ] Tab characters are not inserted (reserved for form navigation)

### Inline Creation Mode (from session list)
- [ ] Pressing `n` from the agent session list opens an inline input between the toolbar and the list rows
- [ ] The list rows dim to 50% opacity (muted) while the input is active
- [ ] The inline input has a single-line box border in `primary` color
- [ ] `Enter` submits; input text changes to "Creating…" in `muted` italic while submission is in flight
- [ ] On success: input disappears, chat screen is pushed
- [ ] On failure: error message appears below the input in `error` color; input retains text for retry
- [ ] `Esc` cancels: input disappears, list refocuses at previously focused row
- [ ] `n` while the inline input is already visible is ignored
- [ ] List keyboard navigation (`j`, `k`, `G`, etc.) is disabled while the inline input is active
- [ ] Search (`/`) is disabled while the inline input is active
- [ ] Delete (`d`) and filter (`f`) are disabled while the inline input is active

### Modal Creation Mode (from command palette)
- [ ] Command palette entry "New Agent Session" is available when a repository context is active
- [ ] Command palette entry is hidden when no repository context is set
- [ ] Selecting the entry opens a centered modal overlay with title "New Agent Session"
- [ ] Modal contains: title text, single-line input (pre-focused), "Create" button, "Cancel" button
- [ ] `Enter` or `Ctrl+S` submits from the input
- [ ] `Enter` on the "Create" button submits
- [ ] `Enter` on the "Cancel" button or `Esc` dismisses the modal
- [ ] Tab order: Input → Create → Cancel → Input
- [ ] On success: modal dismisses, agent session list is pushed (if not already on it), then chat screen is pushed
- [ ] On failure: error displayed within the modal below the input
- [ ] Focus is trapped within the modal (no global keybindings except `Ctrl+C` and `?`)

### Submission Lifecycle
- [ ] On submit, form becomes non-interactive (input disabled, submit button shows "Creating…")
- [ ] Double-submit prevention: `Enter` while submission is in flight is ignored
- [ ] On success (201 Created): optimistic navigation to chat screen with `push("agent-chat", { repo: { owner, name }, sessionId: newSession.id })`
- [ ] On 400 (validation error): inline error with server message; input re-enables
- [ ] On 401 (auth error): auth error screen pushed ("Session expired. Run `codeplane auth login` to re-authenticate.")
- [ ] On 403 (no write access): inline error "Insufficient permissions to create agent sessions."; input re-enables
- [ ] On 409 (conflict): inline error with server message; input re-enables
- [ ] On 429 (rate limited): inline error "Rate limited. Retry in {Retry-After}s."; input re-enables
- [ ] On 500/network error: inline error "Failed to create session. Press Enter to retry."; input re-enables with text preserved
- [ ] On success, the newly created session should appear at the top of the session list if the user navigates back

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39 (minimum): Inline input uses full content width minus 4ch (2ch padding each side). Modal uses 90% terminal width, 7 rows tall (title + input + error + buttons + borders). Placeholder truncated to fit
- [ ] 120×40 – 199×59 (standard): Inline input uses full content width minus 8ch (4ch padding each side). Modal uses 60% terminal width, 9 rows tall. Full placeholder visible
- [ ] 200×60+ (large): Inline input uses full content width minus 16ch. Modal uses 50% terminal width, 11 rows tall with extra padding
- [ ] Terminal resize during creation: layout recalculates synchronously; input text, cursor position, and focus preserved; error messages re-wrap

### Truncation & Boundary Constraints
- [ ] Title max server length: 255 characters (truncated at input time, not on submit)
- [ ] Placeholder text: truncated with `…` at minimum breakpoint if wider than input
- [ ] Error message text: displayed fully; wraps within the input container width
- [ ] Inline "Creating…" text: 10 characters, always fits

### Edge Cases
- [ ] Title with only whitespace (spaces, tabs, newlines): rejected client-side, `Enter` is a no-op
- [ ] Title at exactly 255 characters: accepted and submitted
- [ ] Title at 256 characters: 256th character is not inserted
- [ ] Unicode/emoji in title: accepted, truncation respects grapheme clusters, character count uses grapheme count not byte count
- [ ] Create session while offline: network error shown inline, text preserved for retry when online
- [ ] Create session returns unexpected status code (e.g., 502, 504): treated as server error, generic error message
- [ ] Rapid `n` then `Esc` then `n`: each cycle cleanly opens and closes the inline input
- [ ] `n` pressed while a previous create submission is in flight: ignored
- [ ] Terminal resize below 80×24 during input: "Terminal too small" shown; resize back above 80×24 restores input with text
- [ ] Session creation fails then succeeds on retry: first error clears, navigation proceeds
- [ ] No-color terminal (`NO_COLOR=1`): input border uses reverse video instead of color; error uses bold or reverse video
- [ ] Very fast successful creation (<100ms round-trip): no visual flicker of "Creating…" state (minimum 100ms display)
- [ ] Server returns empty session ID: treated as error, "Failed to create session" shown
- [ ] Ctrl+C during creation: quits TUI immediately (creation may or may not complete server-side)

## Design

### Inline Creation Layout (from agent session list)

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Agent Sessions   🔔 3 │ ●  │
├──────────────────────────────────────────────────────────────┤
│ Agent Sessions (12)                              / search    │
│ Filter: All │ Active │ Completed │ Failed                    │
├──────────────────────────────────────────────────────────────┤
│ ┌─ New Session ──────────────────────────────────────────┐   │
│ │ Fix auth timeout in login flow█                        │   │
│ └────────────────────────────────────────────────────────┘   │
│ ░ Fix authentication bug in login flow       12 msg      3m  │
│ ░ Refactor database queries for perf          8 msg      1h  │
│ ░ Add unit tests for user service             24 msg     2d  │
│ ░ …                                                          │
├──────────────────────────────────────────────────────────────┤
│ Status: Enter:create  Esc:cancel                    ?:help   │
└──────────────────────────────────────────────────────────────┘
```

(░ represents dimmed list rows while the inline input is active)

### Inline Creation Error State

```
│ ┌─ New Session ──────────────────────────────────────────┐   │
│ │ Fix auth timeout in login flow█                        │   │
│ └────────────────────────────────────────────────────────┘   │
│ ⚠ Failed to create session. Press Enter to retry.            │
```

### Modal Creation Layout (from command palette)

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Agent Sessions   🔔 3 │ ●  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│     ┌─── New Agent Session ──────────────────────────┐       │
│     │                                                │       │
│     │  Title:                                        │       │
│     │  ┌────────────────────────────────────────────┐│       │
│     │  │ Session title…                             ││       │
│     │  └────────────────────────────────────────────┘│       │
│     │                                                │       │
│     │    [ Create ]    [ Cancel ]                     │       │
│     │                                                │       │
│     └────────────────────────────────────────────────┘       │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Status: Enter:create  Tab:next  Esc:cancel          ?:help   │
└──────────────────────────────────────────────────────────────┘
```

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, inline input wrapper, modal overlay, button row
- `<text>` — Labels ("New Session", "New Agent Session", "Title:"), error messages, placeholder text, "Creating…" state
- `<input>` — Single-line text input with maxLength=255, placeholder="Session title…", focus management

### Component Tree — Inline Mode

```jsx
<box flexDirection="column" width="100%">
  <box
    flexDirection="column"
    paddingX={inlinePadding}
    paddingY={1}
    border="single"
    borderColor="primary"
  >
    <text bold color="primary">New Session</text>
    <input
      value={title}
      onChange={setTitle}
      maxLength={255}
      placeholder="Session title…"
      focused={true}
      disabled={submitting}
    />
    {submitting && <text color="muted" italic>Creating…</text>}
    {error && <text color="error">⚠ {error}</text>}
  </box>
</box>
```

### Component Tree — Modal Mode

```jsx
<box
  position="absolute"
  top="center"
  left="center"
  width={modalWidth}
  height={modalHeight}
  border="single"
  borderColor="border"
  backgroundColor="surface"
  zIndex={10}
>
  <box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
    <text bold>New Agent Session</text>
    <box flexDirection="column">
      <text color="muted">Title:</text>
      <input
        value={title}
        onChange={setTitle}
        maxLength={255}
        placeholder="Session title…"
        focused={focusIndex === 0}
        disabled={submitting}
      />
      {error && <text color="error">⚠ {error}</text>}
    </box>
    <box flexDirection="row" gap={2}>
      <button focused={focusIndex === 1} onPress={handleCreate} disabled={submitting}>
        {submitting ? "Creating…" : "Create"}
      </button>
      <button focused={focusIndex === 2} onPress={handleCancel}>Cancel</button>
    </box>
  </box>
</box>
```

### Keybindings

#### Inline Mode

| Key | Action | Condition |
|-----|--------|-----------|
| Printable chars | Insert into title input | Input focused |
| `Backspace` / `Delete` | Delete character | Input focused |
| `Left` / `Right` | Move cursor | Input focused |
| `Home` / `Ctrl+A` | Cursor to start | Input focused |
| `End` / `Ctrl+E` | Cursor to end | Input focused |
| `Ctrl+K` | Kill to end of line | Input focused |
| `Ctrl+U` | Kill to start of line | Input focused |
| `Enter` | Submit title (create session) | Title non-empty, not submitting |
| `Enter` | No-op | Title empty |
| `Esc` | Cancel creation, return to list | Always |
| `Ctrl+C` | Quit TUI | Always |
| `?` | Help overlay | Always |

#### Modal Mode

| Key | Action | Condition |
|-----|--------|-----------|
| Printable chars | Insert into title input | Input focused |
| `Backspace` / `Delete` | Delete character | Input focused |
| `Left` / `Right` | Move cursor | Input focused |
| `Home` / `Ctrl+A` | Cursor to start | Input focused |
| `End` / `Ctrl+E` | Cursor to end | Input focused |
| `Ctrl+K` | Kill to end of line | Input focused |
| `Ctrl+U` | Kill to start of line | Input focused |
| `Enter` | Submit (input focused, non-empty) or activate button (button focused) | Not submitting |
| `Ctrl+S` | Submit from any focused element | Title non-empty, not submitting |
| `Tab` | Next focusable: Input → Create → Cancel → Input | Always |
| `Shift+Tab` | Previous focusable | Always |
| `Esc` | Dismiss modal | Always |
| `Ctrl+C` | Quit TUI | Always |
| `?` | Help overlay | Always |

### Responsive Behavior

| Breakpoint | Inline Padding | Modal Width | Modal Height | Notes |
|-----------|---------------|-------------|-------------|-------|
| 80×24 min | 2ch each side | 90% of terminal | 7 rows | Placeholder may truncate |
| 120×40 std | 4ch each side | 60% of terminal | 9 rows | Full placeholder visible |
| 200×60 lg | 8ch each side | 50% of terminal | 11 rows | Generous spacing |

Resize triggers synchronous re-layout via `useOnResize()`. Input text, cursor position, and focus index preserved. Error messages re-wrap to new width.

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useCreateAgentSession()` | `@codeplane/ui-core` | Mutation for `POST /api/repos/:owner/:repo/agent/sessions`. Returns `{ mutate: (title: string) => Promise<AgentSession>, isLoading: boolean, error: Error \| null }` |
| `useRepoContext()` | Local TUI routing | Provides `owner` and `repo` for API calls |
| `useNavigation()` | Local TUI routing | `push()` for navigating to chat screen |
| `useKeyboard()` | `@opentui/react` | Registers keybinding handlers |
| `useTerminalDimensions()` | `@opentui/react` | Returns `{ columns, rows }` for responsive layout |
| `useOnResize()` | `@opentui/react` | Triggers re-render on terminal resize |

### API Endpoints Consumed

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| `POST` | `/api/repos/:owner/:repo/agent/sessions` | `{ title: string }` | `201 Created` → `AgentSession { id, title, status, created_at, … }` |

### Navigation Flow

1. **Inline mode**: `n` on session list → inline input → `Enter` → `push("agent-chat", { repo: { owner, name }, sessionId: newSession.id })`
2. **Modal mode**: Command palette → "New Agent Session" → modal → `Enter` → if not on session list: `push("agent-sessions", { repo })` then `push("agent-chat", { repo, sessionId })`. If already on session list: `push("agent-chat", { repo, sessionId })`
3. **Cancel**: `Esc` → dismiss input/modal → return to previous state
4. **Back from chat**: `q` on chat screen → pops to session list → new session visible in list

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (repo read) | Authenticated (repo write) |
|--------|-----------|---------------------------|----------------------------|
| See "n" keybinding / palette entry | ❌ | ❌ | ✅ |
| Open create input/modal | ❌ | ❌ | ✅ |
| Submit session creation | ❌ | ❌ | ✅ |

- Session creation requires authentication and write access to the repository
- The `n` keybinding and "New Agent Session" command palette entry are only shown to users with write access. Read-only users see neither the keybinding hint in the status bar nor the palette entry
- The API endpoint `POST /api/repos/:owner/:repo/agent/sessions` enforces repository access and write permission server-side
- 403 responses are handled gracefully with an inline error message; the user is not redirected or logged out
- 401 responses (expired/invalid token) redirect to the auth error screen
- There is no cross-repository session creation; the repository is determined by the current repo context

### Token-based Auth
- Token loaded from CLI keychain (stored by `codeplane auth login`) or `CODEPLANE_TOKEN` environment variable at TUI bootstrap
- Passed as `Authorization: token <token>` on the POST request via the `@codeplane/ui-core` API client
- Token is never displayed, logged, or included in error messages
- No interactive login flow in the TUI; auth failures require CLI re-authentication

### Rate Limiting
- `POST /api/repos/:owner/:repo/agent/sessions`: 60 req/min (shared session creation limit)
- 429 responses show "Rate limited. Retry in {Retry-After}s." inline below the input
- No auto-retry on rate limit; user waits and retries manually
- The `Retry-After` value from the response header is displayed if present; otherwise "a few seconds" is shown
- Rapid `Enter` presses during rate limit cooldown are no-ops (double-submit prevention handles this)

### Data Sensitivity
- Session titles may contain repository-specific context (file names, function names, issue references) — these are repo-scoped data
- Session titles are transmitted in the POST body and stored server-side; they are not logged client-side at levels above `debug`
- No PII beyond what the user already has access to in the repository context

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.agents.create.opened` | Create input or modal shown | `entry_point` ("keybinding" \| "command_palette"), `mode` ("inline" \| "modal"), `terminal_width`, `terminal_height`, `breakpoint`, `repo_owner`, `repo_name` |
| `tui.agents.create.submitted` | User presses Enter to create | `title_length`, `mode`, `entry_point`, `input_time_ms` (time from open to submit), `repo_owner`, `repo_name` |
| `tui.agents.create.succeeded` | API returns 201 | `session_id`, `title_length`, `mode`, `entry_point`, `round_trip_ms`, `repo_owner`, `repo_name` |
| `tui.agents.create.failed` | API returns non-2xx or network error | `error_type` ("auth" \| "permission" \| "rate_limit" \| "validation" \| "server" \| "network"), `http_status`, `mode`, `entry_point`, `title_length`, `repo_owner`, `repo_name` |
| `tui.agents.create.cancelled` | User presses Esc | `had_title` (boolean), `title_length`, `mode`, `entry_point`, `input_time_ms`, `repo_owner`, `repo_name` |
| `tui.agents.create.retried` | User retries after failure | `previous_error_type`, `retry_success`, `retry_round_trip_ms`, `repo_owner`, `repo_name` |
| `tui.agents.create.validation_rejected` | User presses Enter on empty input | `mode`, `repo_owner`, `repo_name` |

### Common Properties (all events)
- `session_id` (analytics session), `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`, `repo_owner`, `repo_name`

### Success Indicators

| Metric | Target |
|--------|--------|
| Create completion rate (opened → succeeded) | >75% |
| Abandonment rate (opened → cancelled with title) | <15% |
| Error rate (submitted → failed) | <2% |
| Retry success rate (failed → retried → succeeded) | >80% |
| Time from open to submit (median) | <10s |
| Time from submit to chat screen (p95) | <2s |
| Keybinding vs palette entry split | >80% keybinding |
| Inline vs modal mode split | >90% inline |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Create input opened | `AgentSessionCreate: opened [mode={inline\|modal}] [entry_point={keybinding\|palette}] [width={w}] [height={h}]` |
| `debug` | Title input changed | `AgentSessionCreate: input [length={n}]` |
| `debug` | Validation rejected | `AgentSessionCreate: validation rejected [reason={empty\|whitespace}]` |
| `info` | Submission started | `AgentSessionCreate: submitting [title_length={n}] [mode={mode}]` |
| `info` | Session created | `AgentSessionCreate: created [session_id={id}] [title_length={n}] [duration={ms}ms]` |
| `info` | Navigated to chat | `AgentSessionCreate: navigated [session_id={id}]` |
| `info` | Cancelled | `AgentSessionCreate: cancelled [had_title={bool}] [mode={mode}]` |
| `warn` | Create failed | `AgentSessionCreate: failed [status={code}] [error={msg}] [mode={mode}]` |
| `warn` | Rate limited | `AgentSessionCreate: rate limited [retry_after={s}]` |
| `warn` | Permission denied | `AgentSessionCreate: permission denied [status=403]` |
| `error` | Auth error | `AgentSessionCreate: auth error [status=401]` |
| `error` | Render error | `AgentSessionCreate: render error [error={msg}]` |
| `error` | Unexpected response | `AgentSessionCreate: unexpected response [status={code}] [body_preview={first_100_chars}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Resize during input | `useOnResize` fires while input is active | Layout recalculates; input text and cursor preserved | Synchronous re-layout |
| Resize during submission | `useOnResize` fires while `submitting=true` | Layout recalculates; "Creating…" state preserved; submission continues | Independent; layout adjusts on completion |
| Resize below 80×24 during input | Terminal dimensions drop below minimum | "Terminal too small" message shown; input state preserved in memory | Resize back above 80×24 restores input with text |
| Auth expiry during submit | 401 from POST | Auth error screen pushed; input state lost | Re-auth via CLI (`codeplane auth login`) |
| Network timeout (30s) | Fetch promise timeout | "Creating…" → error "Failed to create session. Press Enter to retry." | User retries with same title |
| Network disconnect before submit | No connectivity detected | Submission fails immediately with network error | Retry when connectivity returns |
| SSE disconnect (unrelated) | SSE context reports disconnection | Status bar updates; creation flow unaffected (uses REST) | Independent |
| Rate limit (429) | POST returns 429 | Inline error with countdown; input retains text | User waits and retries |
| Permission denied (403) | POST returns 403 | Inline error "Insufficient permissions"; input retains text | User needs write access |
| Validation error (400) | POST returns 400 | Inline error with server message; input retains text | User corrects title |
| Server error (500/502/503/504) | POST returns 5xx | Generic error "Failed to create session. Press Enter to retry." | User retries |
| Empty session ID in response | 201 with null/empty `id` | Treated as error; "Failed to create session" | User retries |
| No repo context | `useRepoContext()` returns null | `n` keybinding is no-op; palette entry hidden | User selects a repo first |
| No color support | `TERM`/`COLORTERM` detection | Input border uses reverse video; errors use bold text | Theme detection at startup |
| Rapid `n` → `Esc` → `n` cycling | State machine transitions | Each cycle cleanly opens/closes; no leaked state | State machine handles transitions |
| `Ctrl+C` during submission | Process signal | TUI quits immediately; server may or may not process the create | Server-side: session may exist as orphan; no client cleanup |
| Modal + resize to minimum | Modal exceeds 90% limit at 80×24 | Modal width capped at `columns - 4`; content truncates | Resize back expands modal |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- POST fails → inline error; `Esc` still works to cancel; `q` and go-to keys still work for navigation
- Auth failure → auth error screen pushed; user re-authenticates via CLI
- Repeated failures → error persists; user can cancel via `Esc` at any time
- Server unreachable → network error after 30s timeout; retry available

## Verification

### Test File: `e2e/tui/agents.test.ts`

### Terminal Snapshot Tests (14 tests)

- SNAP-CREATE-001: Inline create input at 120×40 — bordered input with placeholder "Session title…", list dimmed below
- SNAP-CREATE-002: Inline create input at 80×24 — compact input, list dimmed, minimal padding
- SNAP-CREATE-003: Inline create input at 200×60 — generous spacing, full placeholder visible
- SNAP-CREATE-004: Inline create input with title text — user-typed title visible, cursor at end
- SNAP-CREATE-005: Inline create "Creating…" state — input replaced with muted italic "Creating…"
- SNAP-CREATE-006: Inline create error state — red error message below input, title text preserved
- SNAP-CREATE-007: Modal create at 120×40 — centered modal, title "New Agent Session", input focused, Create/Cancel buttons
- SNAP-CREATE-008: Modal create at 80×24 — 90% width modal, compact layout
- SNAP-CREATE-009: Modal create at 200×60 — 50% width modal, generous padding
- SNAP-CREATE-010: Modal create with error — error text between input and buttons
- SNAP-CREATE-011: Modal create "Creating…" state — Create button shows "Creating…", input disabled
- SNAP-CREATE-012: Status bar keybinding hints during inline create — "Enter:create  Esc:cancel"
- SNAP-CREATE-013: Status bar keybinding hints during modal create — "Enter:create  Tab:next  Esc:cancel"
- SNAP-CREATE-014: No-color terminal inline input — reverse video border, bold error text

### Keyboard Interaction Tests (28 tests)

- KEY-CREATE-001: `n` from session list opens inline create input
- KEY-CREATE-002: Typing in inline input updates title text
- KEY-CREATE-003: `Enter` on non-empty inline input creates session
- KEY-CREATE-004: `Enter` on empty inline input is no-op (cursor stays, no API call)
- KEY-CREATE-005: `Esc` from inline input cancels and returns focus to list
- KEY-CREATE-006: `Esc` from inline input restores previously focused list row
- KEY-CREATE-007: `n` while inline input is already open is ignored
- KEY-CREATE-008: `j` / `k` while inline input is active do not move list focus (they type into input)
- KEY-CREATE-009: `/` while inline input is active types `/` into input (does not open search)
- KEY-CREATE-010: `d` while inline input is active types `d` into input (does not trigger delete)
- KEY-CREATE-011: `f` while inline input is active types `f` into input (does not cycle filter)
- KEY-CREATE-012: Successful create navigates to agent chat screen
- KEY-CREATE-013: Failed create shows error, input retains text
- KEY-CREATE-014: `Enter` retry after failure re-submits with same title
- KEY-CREATE-015: `Backspace` deletes last character in inline input
- KEY-CREATE-016: `Ctrl+A` / `Home` moves cursor to start
- KEY-CREATE-017: `Ctrl+E` / `End` moves cursor to end
- KEY-CREATE-018: `Ctrl+K` kills from cursor to end
- KEY-CREATE-019: `Ctrl+U` kills from cursor to start
- KEY-CREATE-020: Command palette "New Agent Session" opens modal
- KEY-CREATE-021: `Enter` in modal input creates session
- KEY-CREATE-022: `Esc` in modal dismisses without creating
- KEY-CREATE-023: `Tab` in modal cycles Input → Create → Cancel → Input
- KEY-CREATE-024: `Shift+Tab` in modal cycles backward
- KEY-CREATE-025: `Ctrl+S` in modal submits from any focused element
- KEY-CREATE-026: `Enter` on Cancel button in modal dismisses modal
- KEY-CREATE-027: `Enter` on Create button in modal submits
- KEY-CREATE-028: Rapid typing (30 characters in 500ms) — all characters captured in order

### Responsive Tests (10 tests)

- RESP-CREATE-001: 80×24 inline input width fills available space minus 4ch padding
- RESP-CREATE-002: 120×40 inline input width fills available space minus 8ch padding
- RESP-CREATE-003: 200×60 inline input width fills available space minus 16ch padding
- RESP-CREATE-004: 80×24 modal uses 90% terminal width
- RESP-CREATE-005: 120×40 modal uses 60% terminal width
- RESP-CREATE-006: 200×60 modal uses 50% terminal width
- RESP-CREATE-007: Resize from 120×40 to 80×24 during inline input — text preserved, padding adjusts
- RESP-CREATE-008: Resize from 80×24 to 120×40 during modal — modal width expands, text preserved
- RESP-CREATE-009: Resize below 80×24 during input — "Terminal too small" shown; resize back restores input
- RESP-CREATE-010: Resize during "Creating…" state — submission continues, layout adjusts

### Integration Tests (16 tests)

- INT-CREATE-001: Successful session creation → navigates to chat screen with correct session ID
- INT-CREATE-002: Chat screen after create has input pre-focused and empty
- INT-CREATE-003: Back navigation from chat → session list shows new session at top
- INT-CREATE-004: Auth expiry (401) during create → auth error screen pushed
- INT-CREATE-005: Permission denied (403) during create → inline "Insufficient permissions" error
- INT-CREATE-006: Rate limit (429) during create → inline error with retry-after countdown
- INT-CREATE-007: Server error (500) during create → inline error with retry hint
- INT-CREATE-008: Network timeout during create → error after 30s, text preserved
- INT-CREATE-009: Validation error (400) during create → inline error with server message
- INT-CREATE-010: Double-submit prevention — rapid `Enter` × 3 only creates one session
- INT-CREATE-011: Create followed by immediate `q` in chat → session list shows new session
- INT-CREATE-012: Command palette "New Agent Session" hidden when no repo context
- INT-CREATE-013: `n` keybinding is no-op when no repo context
- INT-CREATE-014: `n` keybinding hidden from status bar for read-only users
- INT-CREATE-015: Modal create → success → navigates through session list to chat
- INT-CREATE-016: Session title with 255 characters accepted and created successfully

### Edge Case Tests (10 tests)

- EDGE-CREATE-001: Title with only spaces — `Enter` is no-op
- EDGE-CREATE-002: Title with only tabs — `Enter` is no-op
- EDGE-CREATE-003: Title at exactly 255 chars — accepted, submitted, session created
- EDGE-CREATE-004: Type 256th character — not inserted, title stays at 255
- EDGE-CREATE-005: Unicode/emoji in title — rendered correctly, submitted correctly
- EDGE-CREATE-006: Rapid `n` → `Esc` → `n` → `Esc` cycling (5×) — no leaked state
- EDGE-CREATE-007: Create fails then retry succeeds — error clears, navigates to chat
- EDGE-CREATE-008: `Ctrl+C` during "Creating…" state — TUI quits
- EDGE-CREATE-009: Paste 500-char string — truncated to 255 at input, only 255 submitted
- EDGE-CREATE-010: "Creating…" minimum display time — at least 100ms visible even on fast response

All 78 tests left failing if backend is unimplemented — never skipped or commented out.
