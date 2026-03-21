# TUI_AGENT_SESSION_REPLAY

Specification for TUI_AGENT_SESSION_REPLAY.

## High-Level User POV

Agent Session Replay is a read-only playback mode for completed agent sessions in the Codeplane TUI. When a terminal developer wants to review what an agent did — what it was asked, what it reasoned through, what tools it invoked, and what results it produced — they open a completed session in replay mode rather than the live chat interface. The replay screen presents the full conversation transcript as a scrollable, non-editable document, making it easy to audit agent behavior, extract useful code snippets, and understand the reasoning chain that led to a particular outcome.

The replay screen is reached from the agent session list. When the user navigates to the session list (via `g a` or `:agents` in the command palette) and presses Enter on a session whose status is "completed", "failed", or "timed_out", the TUI pushes the replay screen instead of the live chat screen. The breadcrumb updates to read "Dashboard > owner/repo > Agents > Session: {title}". A "REPLAY" badge in primary color appears in the header next to the session title, making it immediately obvious that this is a historical view, not a live interaction.

The replay screen is a full-height scrollable document that renders the complete message history of the session. Each message is rendered as a visual block: user messages appear right-aligned with a "You" label in primary color, assistant messages appear left-aligned with an "Agent" label in success color, system messages appear centered with a "System" label in muted color, and tool interactions appear as collapsible blocks with a "Tool" label in warning color. The message content within each block is rendered using OpenTUI's `<markdown>` component, so code blocks have syntax highlighting, lists are properly formatted, and inline formatting is preserved.

Tool call blocks deserve special attention because they are the most information-dense part of an agent session. Each tool call renders as a collapsible section showing the tool name (e.g., "bash", "read_file", "edit_file") in bold, the input parameters in a `<code>` block, and the tool result below it. Tool blocks start collapsed by default — the user sees the tool name and a one-line summary — and can expand any block by pressing Enter or `x` while it is focused. Pressing `x` with Shift (`X`) expands or collapses all tool blocks at once. This keeps the default view scannable while allowing deep inspection when needed.

Navigation within the replay is vim-style: `j`/`k` scroll line-by-line through the message content, `Ctrl+D`/`Ctrl+U` page through, and `G`/`g g` jump to bottom/top. Because the content is a linear document rather than a list, there is no per-item focus cursor — the scroll position is the primary navigation state. However, the user can jump between messages using `]` (next message) and `[` (previous message), which scrolls the viewport to align the next/previous message header at the top of the screen. The status bar shows the current position indicator: "Message 3 of 12" updates as the user scrolls.

Search within the replay transcript is available via `/`, which opens a search input at the bottom of the content area. The search operates on the full text of all messages (including tool inputs and outputs when expanded). Matches are highlighted and navigable with `n`/`N`. This is particularly useful for finding specific file paths, error messages, or code patterns within long agent sessions.

At the bottom of the replay content, after the last message, a session summary block renders showing: session status (completed/failed/timed_out) with appropriate color coding, total message count, session duration (from `started_at` to `finished_at`), and — if linked to a workflow run — a link to the workflow run that the user can navigate to by pressing Enter.

The replay screen adapts to terminal size. At 80×24, message blocks use the full width with minimal padding, tool blocks show only the tool name in collapsed state (no summary), and the position indicator is abbreviated. At 120×40, message blocks have 2-character left padding for role labels, tool blocks show a one-line summary when collapsed, and timestamps appear on each message. At 200×60+, message blocks have generous padding, tool blocks show multi-line summaries when collapsed, and a sidebar appears showing a message-type legend and session metadata.

## Acceptance Criteria

### Definition of Done

- [ ] The Agent Session Replay screen renders as a full-screen scrollable view between header and status bars
- [ ] The screen is reachable by pressing Enter on a completed/failed/timed_out session in the agent session list
- [ ] The screen is reachable via deep-link `codeplane tui --screen agent-replay --repo owner/repo --session-id {id}`
- [ ] The breadcrumb reads "Dashboard > owner/repo > Agents > Session: {title}"
- [ ] A "REPLAY" badge renders in primary color next to the session title in the header
- [ ] The session title is truncated to 40 characters with `…` in the breadcrumb
- [ ] Pressing `q` pops the screen and returns to the agent session list
- [ ] Messages are fetched via `useAgentMessages(sessionId)` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with cursor-based pagination
- [ ] All messages load on mount (paginating through all pages automatically for completed sessions)
- [ ] The session metadata is fetched via `useAgentSession(owner, repo, sessionId)` from `@codeplane/ui-core`

### Message Rendering

- [ ] User messages render with "You" label in primary color (ANSI 33), right-aligned content block
- [ ] Assistant messages render with "Agent" label in success color (ANSI 34), left-aligned content block
- [ ] System messages render with "System" label in muted color (ANSI 245), center-aligned content block
- [ ] Tool messages render with "Tool" label in warning color (ANSI 178), left-aligned collapsible block
- [ ] Message content renders via `<markdown>` component with full formatting support
- [ ] Code blocks within messages render via `<code>` component with syntax highlighting
- [ ] Each message block has a visual separator (horizontal line) between it and the next message
- [ ] Message timestamps render on each message at standard+ terminal sizes

### Tool Call Rendering

- [ ] Tool call blocks show tool name in bold (e.g., "bash", "read_file", "edit_file")
- [ ] Tool call blocks start collapsed by default
- [ ] Collapsed tool blocks show: tool name + one-line summary (first 60 characters of input, truncated with `…`)
- [ ] Expanded tool blocks show: tool name, full input parameters in `<code>` block, tool result in `<markdown>` or `<code>` block
- [ ] Enter or `x` on a focused tool block toggles its expand/collapse state
- [ ] `X` (Shift+x) expands all tool blocks if any are collapsed, or collapses all if all are expanded
- [ ] Tool input parameters render with syntax highlighting (JSON format)
- [ ] Tool results that are error responses render with error color styling

### Session Summary Block

- [ ] Session summary renders after the last message
- [ ] Summary shows session status with color: "completed" (green), "failed" (red), "timed_out" (yellow)
- [ ] Summary shows total message count
- [ ] Summary shows session duration (formatted as "Xm Ys" or "Xh Ym")
- [ ] If linked to a workflow run, summary shows "Linked workflow: Run #{id}" as a navigable link
- [ ] Enter on workflow link navigates to workflow run detail screen

### Position Tracking

- [ ] Status bar shows "Message N of M" indicator
- [ ] Position indicator updates as the user scrolls through messages
- [ ] Position indicator abbreviated to "N/M" at 80×24

### Keyboard Interactions

- [ ] `j` / `Down`: Scroll down one line
- [ ] `k` / `Up`: Scroll up one line
- [ ] `G`: Jump to bottom (last message / session summary)
- [ ] `g g`: Jump to top (first message)
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `]`: Jump to next message header
- [ ] `[`: Jump to previous message header
- [ ] `x`: Toggle expand/collapse on focused tool block
- [ ] `X`: Toggle expand/collapse all tool blocks
- [ ] `/`: Open search input
- [ ] `n` / `N`: Next / previous search match
- [ ] `Esc`: Close search → pop screen (priority chain)
- [ ] `q`: Pop screen (return to session list)
- [ ] `y`: Copy focused message content to clipboard (if terminal supports OSC 52)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Full-width message blocks, no padding, collapsed tool blocks show tool name only, position indicator abbreviated, no timestamps on messages
- [ ] 120×40 – 199×59: 2ch left padding for role labels, collapsed tool blocks show tool name + summary, full position indicator, timestamps on each message
- [ ] 200×60+: 4ch left padding, multi-line tool summaries, message-type legend sidebar (right side, 20ch), session metadata panel below legend

### Edge Cases — Terminal

- [ ] Terminal resize does not lose scroll position or message state
- [ ] Below 80×24 shows "terminal too small" but loaded data is preserved
- [ ] No-color terminals: role labels use text prefixes [YOU], [AGENT], [SYS], [TOOL] instead of color
- [ ] 16-color terminals: closest ANSI colors used for role labels

### Edge Cases — Data Boundaries

- [ ] Session IDs: UUID format (36 characters max)
- [ ] Session titles: max 255 characters, truncated to 40 in breadcrumb with `…`
- [ ] Message content: up to 100KB per message rendered without truncation
- [ ] Messages exceeding 100KB: truncated with "Content truncated. Full message is {N}KB." indicator
- [ ] Tool input/output: up to 64KB each, truncated with indicator if exceeded
- [ ] Total message count: up to 500 messages per session (auto-paginated on load)
- [ ] Sessions with 0 messages: "This session has no messages." centered message
- [ ] Session with null `started_at` or `finished_at`: duration shows "—"
- [ ] Malformed message parts: rendered as raw JSON in `<code>` block with warning indicator
- [ ] Unicode in message content: preserved, grapheme-aware truncation
- [ ] Empty message content: rendered as blank block with role label

### Edge Cases — Rapid Input

- [ ] Rapid j/k scrolls one line per keypress without debounce
- [ ] Rapid `]`/`[` jumps are sequential, one message per keypress
- [ ] Rapid `x` toggles are sequential
- [ ] q during initial message loading unmounts cleanly and cancels in-flight fetches
- [ ] Navigation away via go-to keybindings cancels in-flight fetches

## Design

### Layout Structure

The screen is composed of: (1) header bar with breadcrumb and REPLAY badge, (2) scrollable message transcript with role-labeled message blocks and collapsible tool blocks, (3) session summary block at the bottom, (4) optional metadata sidebar at 200×60+, (5) optional search overlay, (6) status bar with keybindings and position indicator.

At standard terminal (120×40):
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Agents > Session: Fix login bug   REPLAY   ● 3    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You                                                           2m ago        │
│  ──────────────────────────────────────────────────────────────────────       │
│  Can you fix the login timeout issue in src/auth.ts? The session              │
│  expires after 5 minutes but should be 30.                                    │
│                                                                              │
│  Agent                                                         2m ago        │
│  ──────────────────────────────────────────────────────────────────────       │
│  I'll investigate the login timeout configuration. Let me start by            │
│  reading the auth configuration file.                                         │
│                                                                              │
│  Tool: read_file — src/auth/config.ts …                           ▶          │
│                                                                              │
│  ═══════════════════ Session Complete ═══════════════════                     │
│  Status: ✓ completed │ Messages: 6 │ Duration: 1m 42s                        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ j/k:scroll [/]:msg x:expand /:search q:back         Message 3 of 6          │
└──────────────────────────────────────────────────────────────────────────────┘
```

At 80×24: Breadcrumb truncates from left. No padding on message blocks. Timestamps hidden. Tool blocks show tool name only (no summary). Position indicator abbreviated to "N/M". Session summary uses abbreviated labels ("6 msgs" instead of "Messages: 6").

At 200×60+: 4ch left padding on message blocks. Multi-line tool summaries when collapsed. 20ch metadata sidebar on right with session info (status, messages, duration, started/finished times) and role legend. Full timestamps ("2 minutes ago").

### Components Used

- `<box>` — Layout containers for message blocks, role headers, tool blocks, sidebar, summary
- `<scrollbox>` — Primary transcript viewer with scroll tracking for position indicator
- `<text>` — Role labels, timestamps, separators, position indicator, status badges, REPLAY badge
- `<markdown>` — Message content rendering with formatting, code blocks, lists, links
- `<code>` — Tool input parameters (JSON syntax highlighting), tool results, malformed message fallback
- `<input>` — Search input overlay (focused via `/`)

### MessageBlock Component

Each message renders as a vertical `<box>` with: (1) role label row (`<text bold color={roleColor}>`) with optional timestamp, (2) horizontal separator (`─` characters in border color), (3) message parts rendered by type — text parts via `<markdown>`, tool_call parts via ToolBlock, tool_result parts via `<code>` or `<markdown>`. Role colors: user=primary (ANSI 33), assistant=success (ANSI 34), system=muted (ANSI 245), tool=warning (ANSI 178). Padding varies by breakpoint: 0ch (minimum), 2ch (standard), 4ch (large).

### ToolBlock Component

Collapsible `<box>` with: collapsed header showing tool name in bold warning color + summary text (60ch truncated) + expand indicator (▶ collapsed, ▼ expanded). When expanded: tool input in `<code language="json">`, tool result in `<markdown>` (or `<text color="error">` for error results). Toggle via `x` key or `Enter`.

### SessionSummary Component

Centered `<box>` with: double-line border (═ characters), status icon + status text with semantic color (✓ completed/green, ✗ failed/red, ⏱ timed_out/yellow), message count, duration. Optional workflow run link in primary color. Abbreviated at minimum breakpoint.

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Scroll down one line | Transcript focused |
| `k` / `Up` | Scroll up one line | Transcript focused |
| `G` | Jump to bottom | Transcript focused |
| `g g` | Jump to top | Transcript focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | Transcript focused |
| `]` | Jump to next message header | Transcript focused |
| `[` | Jump to previous message header | Transcript focused |
| `x` | Toggle expand/collapse tool block | Tool block in viewport |
| `X` | Toggle expand/collapse all tool blocks | Any screen state |
| `/` | Open search input | Transcript focused |
| `n` / `N` | Next / previous search match | Search active |
| `Esc` | Close search → pop screen | Priority chain |
| `y` | Copy focused message to clipboard (OSC 52) | Message in viewport |
| `q` | Pop screen | Not in search input |

### Responsive Behavior

| Breakpoint | Padding | Tool Summary | Timestamps | Sidebar | Position |
|-----------|---------|-------------|------------|---------|----------|
| 80×24 min | 0ch | hidden | hidden | hidden | "N/M" |
| 120×40 std | 2ch | 60ch one-line | relative | hidden | "Message N of M" |
| 200×60 lg | 4ch | multi-line | relative | 20ch metadata | "Message N of M" |

Resize triggers synchronous re-layout. Scroll position preserved. Tool expand/collapse states preserved. Search state preserved.

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useAgentSession(owner, repo, sessionId)` | `@codeplane/ui-core` | Session metadata (title, status, timestamps, workflow link). `GET /api/repos/:owner/:repo/agent/sessions/:id` |
| `useAgentMessages(owner, repo, sessionId)` | `@codeplane/ui-core` | Paginated message list with auto-pagination for completed sessions. `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size for responsive layout |
| `useOnResize()` | `@opentui/react` | Re-layout on resize |
| `useKeyboard()` | `@opentui/react` | Keyboard input handling |
| `useNavigation()` | TUI navigation | Stack-based push/pop |
| `useStatusBarHints()` | TUI navigation | Context-sensitive keybinding hints |
| `useRepoContext()` | TUI navigation | Repository owner/repo context |

### API Endpoints Consumed

- `GET /api/repos/:owner/:repo/agent/sessions/:id` — Session metadata (title, status, started_at, finished_at, workflow_run_id)
- `GET /api/repos/:owner/:repo/agent/sessions/:id/messages?page=N&per_page=50` — Paginated message list
- Messages are auto-paginated: all pages fetched sequentially on mount for completed sessions

### Navigation

- `Enter` on workflow run link → `push("workflow-run-detail", { repo, runId: session.workflowRunId })`
- `q` → `pop()`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only (repo) | Write (repo) | Admin |
|--------|-----------|-------------------|--------------|-------|
| View agent session replay (public repo) | ❌ | ✅ | ✅ | ✅ |
| View agent session replay (private repo) | ❌ | ✅ | ✅ | ✅ |

- The Agent Session Replay screen requires authentication. Unauthenticated users see "Run `codeplane auth login` to authenticate."
- Agent sessions are scoped to a repository. The user must have at least read access to the repository
- The session must belong to the repository indicated in the URL path — cross-repo session access is rejected by the server
- Session content may include file paths, code snippets, and shell command outputs from the agent's execution — these are already visible to users with repository read access
- Navigating to a linked workflow run requires the same repository read access (same repo scope)

### Token-based Auth

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen ("Session expired. Run `codeplane auth login` to re-authenticate.")

### Rate Limiting

- `GET /api/repos/:owner/:repo/agent/sessions/:id`: 120 req/min per user (session metadata)
- `GET /api/repos/:owner/:repo/agent/sessions/:id/messages`: 120 req/min per user (message pagination)
- 429 responses show inline "Rate limited. Retry in {Retry-After}s." in the status bar
- Rate limit during auto-pagination: pause pagination, show "Rate limited" indicator, resume after Retry-After period
- No manual retry required for rate-limited pagination — resumes automatically

### Data Sensitivity

- Message content may contain code, file paths, shell commands, and their outputs — these reflect agent actions within the repository scope
- Tool results may contain file contents or command outputs — already visible to repository readers
- No secrets should appear in agent messages (agent runtime strips environment variables), but the TUI does not attempt to redact content
- Clipboard copy (`y`) sends content via OSC 52 escape sequence — terminal emulator handles security

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.agent_replay.view` | Screen mounted, initial data loaded | `repo`, `session_id`, `session_status`, `message_count`, `session_duration_ms`, `has_workflow_link`, `load_time_ms`, `terminal_width`, `terminal_height`, `breakpoint`, `entry_method` ("session_list", "deeplink") |
| `tui.agent_replay.scroll` | User scrolls (sampled at 10%) | `repo`, `session_id`, `scroll_position_pct`, `current_message_index`, `total_messages`, `direction` ("up", "down") |
| `tui.agent_replay.message_jump` | `]` or `[` pressed | `repo`, `session_id`, `from_message`, `to_message`, `direction` ("next", "prev"), `message_role` |
| `tui.agent_replay.tool_expand` | `x` pressed on tool block | `repo`, `session_id`, `tool_name`, `message_index`, `was_expanded` |
| `tui.agent_replay.tool_expand_all` | `X` pressed | `repo`, `session_id`, `tool_count`, `new_state` ("expanded", "collapsed") |
| `tui.agent_replay.search` | Search initiated | `repo`, `session_id`, `query_length`, `match_count`, `total_messages` |
| `tui.agent_replay.search_navigate` | `n`/`N` pressed | `repo`, `session_id`, `direction`, `current_match`, `total_matches` |
| `tui.agent_replay.copy` | `y` pressed | `repo`, `session_id`, `message_role`, `content_length`, `osc52_supported` |
| `tui.agent_replay.workflow_navigate` | Enter on workflow link | `repo`, `session_id`, `workflow_run_id` |
| `tui.agent_replay.error` | API failure | `repo`, `session_id`, `error_type`, `http_status`, `request_type` ("session", "messages") |
| `tui.agent_replay.exit` | Screen unmounted | `repo`, `session_id`, `viewing_duration_ms`, `messages_scrolled_pct`, `tools_expanded_count`, `search_used` |

### Common Properties (all events)

`session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% of attempts successfully render |
| Full transcript load | >95% of sessions fully paginate within 5s |
| Tool block expansion rate | >30% of sessions include at least one tool expand |
| Search usage | >10% of replay sessions use search |
| Message jump usage (`]`/`[`) | >40% of sessions with >5 messages |
| Workflow link navigation | >20% of sessions with workflow links |
| Clipboard copy usage | >5% of sessions |
| Time spent in replay | Median >30s (indicates actual reading, not accidental entry) |
| Error rate | <2% |
| Load time (P95) | <3s for sessions with up to 100 messages |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `AgentReplay: mounted [session_id={id}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Session loaded | `AgentReplay: session loaded [id={id}] [status={status}] [title_length={n}]` |
| `debug` | Messages page loaded | `AgentReplay: messages page [session_id={id}] [page={n}] [count={c}] [duration={ms}ms]` |
| `debug` | All messages loaded | `AgentReplay: all messages loaded [session_id={id}] [total={n}] [pages={p}] [total_ms={ms}]` |
| `debug` | Message jump | `AgentReplay: message jump [session_id={id}] [from={f}] [to={t}] [direction={d}]` |
| `debug` | Tool toggle | `AgentReplay: tool toggle [session_id={id}] [tool={name}] [expanded={bool}]` |
| `debug` | Search executed | `AgentReplay: search [session_id={id}] [query_length={n}] [matches={m}]` |
| `debug` | Copy triggered | `AgentReplay: copy [session_id={id}] [role={role}] [length={n}]` |
| `info` | Fully loaded | `AgentReplay: ready [session_id={id}] [messages={n}] [total_ms={ms}]` |
| `info` | Navigated to workflow | `AgentReplay: workflow nav [session_id={id}] [run_id={rid}]` |
| `warn` | Fetch failed | `AgentReplay: fetch failed [session_id={id}] [status={code}] [request={type}]` |
| `warn` | Rate limited | `AgentReplay: rate limited [session_id={id}] [retry_after={s}] [page={n}]` |
| `warn` | Slow load (>5s) | `AgentReplay: slow load [session_id={id}] [total_ms={ms}] [message_count={n}]` |
| `warn` | Message content truncated | `AgentReplay: content truncated [session_id={id}] [message_id={mid}] [size={kb}KB]` |
| `warn` | Malformed message part | `AgentReplay: malformed part [session_id={id}] [message_id={mid}] [part_type={t}]` |
| `error` | Auth error | `AgentReplay: auth error [session_id={id}] [status=401]` |
| `error` | Session not found | `AgentReplay: session not found [session_id={id}] [status=404]` |
| `error` | Render error | `AgentReplay: render error [session_id={id}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Session not found (404) | `GET /sessions/:id` returns 404 | Error state: "Session not found." with `q` to go back | User navigates back |
| Auth expiry (401) | Any API call returns 401 | Auth error screen pushed | Re-auth via CLI (`codeplane auth login`) |
| Message fetch failed | `GET /messages` returns 5xx | Error state: "Failed to load messages. Press R to retry." | User presses `R` to retry |
| Rate limited during pagination | `GET /messages` returns 429 | Pause pagination, show "Rate limited" indicator, auto-resume after Retry-After | Automatic |
| Resize during message load | `useOnResize` fires while fetching | Layout re-renders; fetch continues | Independent; layout adjusts on completion |
| Resize while scrolled | `useOnResize` fires with scroll offset | Columns recalculate; scroll position preserved | Synchronous re-layout |
| Terminal too small | Terminal < 80×24 | "Terminal too small" message; loaded data preserved in memory | Resize terminal |
| Malformed message part | Part type/content doesn't match expected schema | Rendered as raw JSON in `<code>` block with ⚠ indicator | Graceful degradation |
| Message exceeds 100KB | Content length check | Truncated with "Content truncated" indicator | User views full content via CLI |
| Clipboard copy fails | OSC 52 not supported by terminal | No visible error (silent failure); status bar shows "Copy not supported" for 2s | Terminal limitation |
| Network timeout (30s) | Fetch promise timeout | Loading → error state with "Press R to retry" | User retries |
| Concurrent resize + scroll | Both events in same frame | Resize processed first, then scroll position adjusted | Deterministic ordering |

### Failure Modes

- Component crash → global error boundary → "Press r to restart"
- All API fails → error state displayed; `q` and go-to keys still work for navigation away
- Partial message load (some pages succeed, some fail) → display loaded messages with "Some messages failed to load. Press R to retry." at the gap point
- Slow network → loading spinner shown; user can navigate away via go-to or command palette
- Session status is "active" or "running" → redirect to live chat screen (`TUI_AGENT_CHAT_SCREEN`) instead of replay

## Verification

### Test File: `e2e/tui/agents.test.ts`

All 94 tests left failing if backend is unimplemented — never skipped or commented out.

### Terminal Snapshot Tests (22 tests)

- SNAP-REPLAY-001: Replay screen at 120×40 with mixed message types — full layout with role labels, separators, content
- SNAP-REPLAY-002: Replay screen at 80×24 minimum — compact layout, no padding, no timestamps
- SNAP-REPLAY-003: Replay screen at 200×60 large — full layout with metadata sidebar
- SNAP-REPLAY-004: REPLAY badge in header bar
- SNAP-REPLAY-005: User message block with "You" label in primary color
- SNAP-REPLAY-006: Assistant message block with "Agent" label in success color
- SNAP-REPLAY-007: System message block with "System" label in muted color
- SNAP-REPLAY-008: Tool block collapsed — tool name + summary + ▶ indicator
- SNAP-REPLAY-009: Tool block expanded — tool name + input code + result
- SNAP-REPLAY-010: Tool block with error result — error color styling
- SNAP-REPLAY-011: Session summary block — completed status (green)
- SNAP-REPLAY-012: Session summary block — failed status (red)
- SNAP-REPLAY-013: Session summary block — timed_out status (yellow)
- SNAP-REPLAY-014: Session summary with workflow link
- SNAP-REPLAY-015: Empty session — "This session has no messages."
- SNAP-REPLAY-016: Loading state — "Loading session…"
- SNAP-REPLAY-017: Error state — "Session not found."
- SNAP-REPLAY-018: Search overlay with match count
- SNAP-REPLAY-019: Search highlight on matching text
- SNAP-REPLAY-020: Position indicator "Message 3 of 6" in status bar
- SNAP-REPLAY-021: Breadcrumb with truncated session title
- SNAP-REPLAY-022: No-color terminal — text prefix role labels [YOU], [AGENT], [SYS], [TOOL]

### Keyboard Interaction Tests (32 tests)

- KEY-REPLAY-001: j scrolls down one line
- KEY-REPLAY-002: k scrolls up one line
- KEY-REPLAY-003: Down arrow scrolls down one line
- KEY-REPLAY-004: Up arrow scrolls up one line
- KEY-REPLAY-005: G jumps to bottom (session summary visible)
- KEY-REPLAY-006: g g jumps to top (first message visible)
- KEY-REPLAY-007: Ctrl+D pages down
- KEY-REPLAY-008: Ctrl+U pages up
- KEY-REPLAY-009: ] jumps to next message header
- KEY-REPLAY-010: [ jumps to previous message header
- KEY-REPLAY-011: ] at last message is no-op
- KEY-REPLAY-012: [ at first message is no-op
- KEY-REPLAY-013: x expands collapsed tool block
- KEY-REPLAY-014: x collapses expanded tool block
- KEY-REPLAY-015: X expands all tool blocks when some are collapsed
- KEY-REPLAY-016: X collapses all tool blocks when all are expanded
- KEY-REPLAY-017: / opens search input
- KEY-REPLAY-018: Typing in search input filters content and shows match count
- KEY-REPLAY-019: n jumps to next search match
- KEY-REPLAY-020: N jumps to previous search match
- KEY-REPLAY-021: Esc in search closes search and returns focus to transcript
- KEY-REPLAY-022: Esc with no search active pops screen
- KEY-REPLAY-023: q pops screen
- KEY-REPLAY-024: y copies current message content (OSC 52)
- KEY-REPLAY-025: Enter on workflow link in summary navigates to workflow run detail
- KEY-REPLAY-026: Enter on non-link content is no-op
- KEY-REPLAY-027: Rapid j presses (20× sequential) — each scrolls one line
- KEY-REPLAY-028: Rapid ] presses jump through messages sequentially
- KEY-REPLAY-029: Keys j/k/]/[ do not trigger while search input focused
- KEY-REPLAY-030: Search is case-insensitive
- KEY-REPLAY-031: Search with no matches shows "0/0"
- KEY-REPLAY-032: Position indicator updates on scroll and message jump

### Responsive Tests (12 tests)

- RESP-REPLAY-001: 80×24 — no padding on message blocks
- RESP-REPLAY-002: 80×24 — timestamps hidden
- RESP-REPLAY-003: 80×24 — tool summary hidden (tool name only)
- RESP-REPLAY-004: 80×24 — position indicator abbreviated "N/M"
- RESP-REPLAY-005: 120×40 — 2ch padding on message blocks
- RESP-REPLAY-006: 120×40 — timestamps shown as relative time
- RESP-REPLAY-007: 120×40 — tool summary shown (one-line, 60ch)
- RESP-REPLAY-008: 200×60 — metadata sidebar visible
- RESP-REPLAY-009: 200×60 — 4ch padding on message blocks
- RESP-REPLAY-010: Resize from 120×40 to 80×24 — timestamps disappear, padding reduces, scroll preserved
- RESP-REPLAY-011: Resize from 80×24 to 200×60 — sidebar appears, padding increases, scroll preserved
- RESP-REPLAY-012: Resize during search — search input width adjusts, matches preserved

### Integration Tests (16 tests)

- INT-REPLAY-001: Auth expiry (401) during session fetch — auth error screen shown
- INT-REPLAY-002: Auth expiry (401) during message fetch — auth error screen shown
- INT-REPLAY-003: Session not found (404) — error state with "Session not found."
- INT-REPLAY-004: Server error (500) on message fetch — error state with retry
- INT-REPLAY-005: Rate limited (429) during message pagination — pauses, resumes after Retry-After
- INT-REPLAY-006: Auto-pagination loads all messages across multiple pages
- INT-REPLAY-007: Deep link `--screen agent-replay --session-id {id}` launches directly
- INT-REPLAY-008: Navigation from session list preserves list scroll/focus on return
- INT-REPLAY-009: Enter on workflow link navigates to workflow run detail
- INT-REPLAY-010: Return from workflow run detail preserves replay scroll position
- INT-REPLAY-011: Active session redirects to live chat screen
- INT-REPLAY-012: Running session redirects to live chat screen
- INT-REPLAY-013: Session with 0 messages shows empty state
- INT-REPLAY-014: Session with null started_at shows "—" for duration
- INT-REPLAY-015: R retries failed message fetch
- INT-REPLAY-016: Network timeout (30s) during fetch — error state shown

### Edge Case Tests (12 tests)

- EDGE-REPLAY-001: Session title at 255 characters — truncated in breadcrumb
- EDGE-REPLAY-002: Message content at 100KB — rendered without truncation
- EDGE-REPLAY-003: Message content exceeding 100KB — truncated with indicator
- EDGE-REPLAY-004: Tool input at 64KB — rendered in code block
- EDGE-REPLAY-005: Tool input exceeding 64KB — truncated with indicator
- EDGE-REPLAY-006: Unicode/emoji in message content — preserved
- EDGE-REPLAY-007: Malformed message part — rendered as raw JSON with warning
- EDGE-REPLAY-008: 500 messages in session — all auto-paginated and rendered
- EDGE-REPLAY-009: Concurrent resize + j scroll
- EDGE-REPLAY-010: q during initial loading — clean unmount, fetches cancelled
- EDGE-REPLAY-011: Session with empty message content — blank block with role label
- EDGE-REPLAY-012: Clipboard copy on terminal without OSC 52 — silent failure with status bar hint

### Terminal Snapshot Golden Files (22)

- agent-replay-120x40-mixed-messages
- agent-replay-80x24-compact
- agent-replay-200x60-with-sidebar
- agent-replay-header-badge
- agent-replay-user-message
- agent-replay-assistant-message
- agent-replay-system-message
- agent-replay-tool-collapsed
- agent-replay-tool-expanded
- agent-replay-tool-error
- agent-replay-summary-completed
- agent-replay-summary-failed
- agent-replay-summary-timed-out
- agent-replay-summary-workflow-link
- agent-replay-empty-session
- agent-replay-loading
- agent-replay-error-404
- agent-replay-search-overlay
- agent-replay-search-highlight
- agent-replay-position-indicator
- agent-replay-breadcrumb-truncated
- agent-replay-no-color
