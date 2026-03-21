# AGENT_DOCK_UI

Specification for AGENT_DOCK_UI.

## High-Level User POV

The Agent Dock is a persistent, dockable panel at the bottom of the Codeplane web application that gives developers instant access to AI agent conversations without leaving the repository workbench. It sits alongside the Terminal Dock as a core shell component — always available on repository-scoped pages — and lets developers seamlessly switch between browsing code, reviewing landing requests, and chatting with an AI agent that understands their repository context.

When a developer clicks "New Agent Session" from the dock bar or invokes the agent command from the command palette, Codeplane creates a new agent session scoped to the current repository. The developer types a message — a question about the codebase, a request to investigate an issue, a prompt to generate code — and the agent responds in real time. Tokens stream in progressively, appearing word by word with proper markdown formatting, code syntax highlighting, and collapsible tool-call blocks that show exactly what the agent is doing behind the scenes. The developer can continue browsing the repository, reviewing diffs, or working in the Terminal Dock while the agent works, glancing back at the Agent Dock to check progress.

The Agent Dock supports multiple concurrent session tabs. Each tab represents an independent agent conversation with its own history and lifecycle. Developers can name sessions, switch between them, close completed ones, and replay past conversations to review what an agent did and why. Active sessions show a pulsing indicator while the agent is responding. Completed sessions transition to a read-only replay mode where the full conversation is browsable but the input area is replaced with a "Session completed" banner.

The dock panel can be resized vertically by dragging its top edge, collapsed to a compact session tab bar, or fully hidden. Its state — open/collapsed/hidden, height, active tab — persists across page navigations within the same repository. When a developer navigates to a different repository, the dock scopes to that repository's agent sessions. The Agent Dock and Terminal Dock can be open simultaneously; the developer might have an agent investigating an issue in one dock while running tests in the terminal in the other, or vice versa.

For agent-assisted workflows, the Agent Dock is the conversational counterpart to the Terminal Dock's hands-on-keyboard experience. A developer might ask the agent to investigate a bug, watch it read files and analyze code via tool calls, then flip to the Terminal Dock to manually verify the agent's findings. The two docks share the workspace infrastructure but serve fundamentally different interaction modes — one is conversational and asynchronous, the other is imperative and real-time.

The Agent Dock is gated behind the `agents` feature flag. When the feature flag is disabled, the dock bar is hidden and the command palette omits agent-related commands. This ensures the UI degrades gracefully in environments where agent functionality is not enabled or where the server-side agent streaming endpoint is not yet implemented.

## Acceptance Criteria

### Definition of Done

- [ ] The Agent Dock is rendered as a persistent shell component in the web application layout, positioned as a sibling to the Terminal Dock below the main content area
- [ ] The dock is visible on all repository-scoped routes (`/:owner/:repo/*`) when the `agents` feature flag is enabled and the user is authenticated with at least read access to the repository
- [ ] Clicking "New Agent Session" (or pressing the keyboard shortcut) creates an agent session via `POST /api/repos/:owner/:repo/agent/sessions` and opens a chat tab
- [ ] The session title defaults to a truncation of the first user message (first 60 characters) if no explicit title is provided during creation
- [ ] The chat tab displays a message input area at the bottom and a scrollable message history above it
- [ ] User messages appear with a "You" role label and a distinct accent color; agent messages appear with an "Agent" role label and default text styling
- [ ] Agent responses stream token-by-token via SSE from `GET /api/repos/:owner/:repo/agent/sessions/:id/stream` when the server supports it
- [ ] When SSE streaming is not available (501 response), the dock falls back to polling `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` every 2 seconds during active sessions
- [ ] Messages are sent via `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with `role: "user"` and `parts: [{ type: "text", content: "..." }]`
- [ ] Sending a user message triggers server-side agent dispatch (the server handles this automatically when a user-role message is appended)
- [ ] Tool call parts render as collapsible blocks showing the tool name, a truncated argument preview, and an expand/collapse toggle
- [ ] Tool result parts render as collapsible blocks showing a success/failure indicator and a truncated output preview
- [ ] Markdown in agent messages is rendered with syntax-highlighted code blocks, inline code, bold, italic, lists, links, and blockquotes
- [ ] Multiple agent session tabs are supported; each tab maps to one agent session
- [ ] The dock panel can be resized vertically by dragging its top edge (minimum height: 200px, maximum height: 70% of viewport)
- [ ] The dock panel can be collapsed to a compact tab bar (showing session tab headers and the "New Agent Session" button but hiding the chat viewport)
- [ ] The dock panel can be fully hidden via a close button or keyboard shortcut
- [ ] Dock state (open/collapsed/hidden, panel height, active tab index) persists in `localStorage` and is restored on page navigation
- [ ] Each session tab displays a status indicator: green pulsing dot for active/streaming, green solid dot for active/idle, checkmark for completed, red × for failed, yellow clock for timed out, gray circle for pending
- [ ] Tab status indicators update in real time via SSE subscription (or polling fallback)
- [ ] Individual session tabs can be closed; closing a tab does not delete the session — it only removes it from the dock view
- [ ] A "Delete Session" option is available via right-click context menu or keyboard shortcut on a tab, which permanently deletes the session via `DELETE /api/repos/:owner/:repo/agent/sessions/:id` after confirmation
- [ ] Completed, failed, and timed-out sessions display in replay mode: the message input is replaced with a status banner, and the conversation is read-only
- [ ] The dock is hidden on non-repository routes (e.g., user settings, global search, admin)
- [ ] The dock is hidden when the `agents` feature flag is disabled
- [ ] The dock is hidden for unauthenticated users
- [ ] All SSE connections for agent status are properly cleaned up when navigating away from the repository
- [ ] Post-logout, the dock is immediately hidden and all streaming connections are severed

### Input Constraints

- [ ] Session titles are optional, user-assignable strings: 1–255 characters; leading/trailing whitespace is trimmed; empty titles fall back to auto-generated from first message or "Untitled session"
- [ ] Session titles may contain any Unicode characters including emoji; no character type restrictions beyond length
- [ ] Message input: maximum 4,000 characters per message; attempting to send a longer message shows an inline character count warning and the send action is disabled
- [ ] Message input: minimum 1 non-whitespace character; whitespace-only messages are rejected client-side
- [ ] Maximum concurrent tabs per dock: 20; attempting to open a 21st tab shows an informational toast directing the user to close an existing tab
- [ ] Panel height range: 200px to 70% of viewport height; values outside this range are clamped
- [ ] Panel height is stored as a pixel value in `localStorage` key `codeplane:agent-dock:height`
- [ ] Dock visibility state is stored in `localStorage` key `codeplane:agent-dock:state` with values `open`, `collapsed`, or `hidden`
- [ ] Active tab ID is stored in `localStorage` key `codeplane:agent-dock:active-tab`
- [ ] Tab name (renamed by user) maximum: 64 characters; alphanumeric, spaces, hyphens, underscores, and Unicode letters allowed; leading/trailing whitespace trimmed

### Edge Cases

- [ ] If the session creation API returns 500 (server error), the dock shows an inline error in the tab area with a "Retry" button
- [ ] If the SSE stream endpoint returns 501 (CE limitation), the dock transparently falls back to polling without any user-visible error
- [ ] If the SSE connection drops during active streaming, the tab shows a subtle "Reconnecting…" indicator and attempts exponential backoff reconnection (1s initial, 30s max, 20 attempts max)
- [ ] If polling mode detects no new messages for 5 consecutive polls after the user sent a message, the status transitions from "streaming" to "idle" with a "No response yet" indicator
- [ ] If the user navigates between repositories, existing dock state for the previous repository is preserved in memory and restored on return during the same browser session
- [ ] If the browser tab is backgrounded and foregrounded, the dock checks session status and reconnects SSE/polling for sessions that are still active
- [ ] If multiple agent sessions are open, sending a message in one does not affect the others
- [ ] If a session is deleted externally (via CLI or API) while the tab is open, the tab shows a "Session not found" banner and the tab can be closed
- [ ] If the user sends a message while the agent is still streaming a response, the send is rejected client-side with a tooltip "Wait for the agent to finish responding"
- [ ] If a session times out while the user is chatting, the input disables, a "Session timed out" banner appears, and the session transitions to replay mode
- [ ] If the message history exceeds 500 messages in memory, older messages are virtualized and a "Load earlier messages" link appears at the top of the chat area
- [ ] Pasting text longer than 4,000 characters into the message input truncates at 4,000 characters and shows a warning "Message truncated to 4,000 characters"
- [ ] Empty session (zero messages): shows "Send a message to start the conversation." centered placeholder
- [ ] Agent returns empty response (0 tokens): shows "Agent returned an empty response." in muted text
- [ ] Session with null or empty title: displayed as "Untitled session" in muted italic
- [ ] The dock handles viewport width < 600px by expanding to full width and collapsing the tab list to a dropdown selector
- [ ] Rapid tab switching does not cause message flash or duplicate renders
- [ ] Creating a new session while offline queues the creation and retries when network returns, showing a "Waiting for connection…" state
- [ ] `localStorage` quota exceeded: dock falls back to in-memory state with no crash; a `debug`-level console warning is emitted

## Design

### Web UI Design

#### Component Architecture

The Agent Dock consists of these SolidJS components:

- **`AgentDock`** — Root shell component mounted in the application layout below the main content `<Outlet>`, as a sibling to `TerminalDock`. Manages dock state (open/collapsed/hidden), panel height, and tab collection. Conditionally renders based on `agents` feature flag and route context.
- **`AgentDockBar`** — Compact header bar always visible when the dock is not fully hidden. Contains the session tab strip, "New Agent Session" button (`+` icon with label), dock controls (collapse/expand, close), and an indicator showing the number of active sessions.
- **`AgentSessionTab`** — Individual tab header in the tab strip. Shows session title (truncated), status indicator (colored icon), and close button (`×`). Supports right-click context menu for "Rename", "Delete", and "Open in Full Page". Active tab is visually distinguished with a bottom border accent.
- **`AgentChatPanel`** — The resizable content area below the dock bar. Contains the active session's chat viewport and message input. A drag handle at the top edge enables vertical resizing.
- **`AgentMessageList`** — Scrollable container for the conversation history. Virtualizes messages beyond the 500-message memory cap. Supports sticky auto-scroll with "↓ New messages" jump indicator.
- **`AgentMessageBlock`** — Renders a single message. User messages show the "You" label in accent color. Agent messages show the "Agent" label in success color with a streaming spinner during active responses. Timestamps render as relative text ("3m ago").
- **`AgentToolCallBlock`** — Collapsible block within an agent message for tool call parts. Shows tool name and truncated arguments. Expandable to show full JSON arguments.
- **`AgentToolResultBlock`** — Collapsible block within an agent message for tool result parts. Shows success (✓ green) or error (✗ red) indicator with truncated output. Expandable to show full output.
- **`AgentMessageInput`** — Message composition area at the bottom of the chat panel. Single-line by default, expands to multi-line (up to 6 lines) with Shift+Enter. Shows character count approaching the 4,000 limit. Disabled during agent streaming with "Agent is responding…" placeholder.
- **`AgentStatusOverlay`** — Transparent overlay shown during connection, reconnection, or error states. Appears on top of the chat area.
- **`AgentSessionCreateModal`** — Modal dialog for creating a new session with an optional title. Launched from the "New Agent Session" button or command palette.

#### Layout Integration

The Agent Dock is mounted as a sibling of the main content area and Terminal Dock inside the application layout:

```
┌──────────────────────────────────────────┐
│  Sidebar  │     Main Content Area        │
│           │  (router <Outlet>)            │
│           │                               │
│           ├───────────────────────────────┤
│           │  Terminal Dock (if open)       │
│           ├───────────────────────────────┤
│           │  Agent Dock                    │
│           │  ┌───────────────────────────┐│
│           │  │ Session1 │ Session2 │ [+] ││
│           │  ├───────────────────────────┤│
│           │  │  You:                     ││
│           │  │  Fix the auth timeout bug ││
│           │  │                           ││
│           │  │  ⠋ Agent:                 ││
│           │  │  I'll investigate...      ││
│           │  ├───────────────────────────┤│
│           │  │  [Type a message...]  Send ││
│           │  └───────────────────────────┘│
└──────────────────────────────────────────┘
```

When both docks are open, they stack vertically. The combined height of both docks must not exceed 80% of the viewport; if it would, the most recently resized dock's height is clamped.

When collapsed, only the `AgentDockBar` is visible (single row). When hidden, no Agent Dock elements render.

#### Message Rendering

Agent messages are rendered as markdown with the following capabilities:

- **Code blocks**: Syntax-highlighted using the Codeplane code theme; language label shown in top-right corner; copy button on hover
- **Inline code**: Monospace with subtle background
- **Bold, italic, strikethrough**: Standard markdown formatting
- **Lists**: Ordered and unordered, with proper indentation
- **Links**: Clickable, opening in a new tab; repo-internal links open within Codeplane
- **Blockquotes**: Left-border accent with indented content
- **Tables**: Rendered as formatted tables with header row styling

Tool call blocks render within the message flow:

```
🔧 read_file("src/auth.ts")                    ▸
```

When expanded:

```
🔧 read_file                                    ▾
  Arguments:
    { "path": "src/auth.ts", "lines": [1, 100] }
```

Tool result blocks:

```
✓ Result: 245 lines read                        ▸
```

Or on error:

```
✗ Error: File not found                         ▸
```

#### Streaming UX

During active agent streaming:
1. A braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ cycling at 80ms) appears next to the "Agent" role label
2. Tokens append incrementally to the current agent message
3. Markdown formatting is applied progressively — headings, code blocks, and lists render as soon as their syntax completes
4. Auto-scroll follows new content (when enabled)
5. The message input is disabled and dimmed with "Agent is responding…" placeholder
6. The tab's status indicator shows a pulsing green dot

When streaming completes:
1. The spinner disappears
2. The message input re-enables
3. The tab's status indicator becomes a solid green dot (active, idle)

#### Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|  
| `Ctrl+Shift+A` | Toggle Agent Dock open/hidden | Global (repo pages) |
| `Ctrl+Shift+N` | New agent session | Global (repo pages) |
| `Ctrl+W` | Close active session tab | Agent Dock focused |
| `Ctrl+Tab` | Switch to next session tab | Agent Dock focused |
| `Ctrl+Shift+Tab` | Switch to previous session tab | Agent Dock focused |
| `Enter` | Send message (single-line mode) | Message input focused |
| `Ctrl+Enter` | Send message (multi-line mode) | Message input focused |
| `Shift+Enter` | Insert newline / expand to multi-line | Message input focused |
| `Escape` | Unfocus input → unfocus dock → hide dock | Agent Dock (cascading) |
| `Ctrl+Shift+C` | Copy selection from chat | Chat area focused |
| `Home` | Scroll to oldest message | Chat area focused |
| `End` | Scroll to newest message (re-enable auto-scroll) | Chat area focused |

#### Command Palette Entries

| Command | ID | Category | Context |
|---------|----|----------|---------|  
| "Agent: New Session" | `agent.newSession` | Action | Repo scope, authenticated |
| "Agent: Toggle Dock" | `agent.toggleDock` | Toggle | Repo scope |
| "Agent: Close Session Tab" | `agent.closeTab` | Action | Active session tab |
| "Agent: Close All Session Tabs" | `agent.closeAllTabs` | Action | Any session tabs open |
| "Agent: Focus Chat Input" | `agent.focusInput` | Action | Dock open, active session |
| "Agent: Open Session List" | `agent.sessionList` | Navigation | Repo scope |
| "Agent: Rename Session" | `agent.renameSession` | Action | Active session tab |
| "Agent: Delete Session" | `agent.deleteSession` | Action | Active session tab (with confirmation) |

#### Theme Integration

The Agent Dock uses theme tokens from the Codeplane design system:

- Dock background: `--color-surface-low`
- Chat background: `--color-surface-lowest`
- User message label: `--color-accent-primary`
- Agent message label: `--color-success`
- System message: `--color-text-muted` (italic)
- Tool call icon: `--color-warning`
- Tool result success: `--color-success`
- Tool result error: `--color-error`
- Streaming spinner: `--color-accent-primary`
- Input border: `--color-border-default`; focused: `--color-accent-primary`
- Disabled input: `--color-surface-low` background, `--color-text-muted` text

The dock theme updates when the user switches between light and dark mode.

#### Responsive Behavior

- **Width < 600px**: Dock expands to full viewport width; tab strip collapses to a dropdown selector; message input is single-line only; tool blocks always collapsed; timestamps hidden
- **Width 600–1024px**: Standard layout; maximum 5 visible tab headers before horizontal scroll; multi-line input up to 3 lines; tool argument preview truncated at 60 characters
- **Width > 1024px**: Extended layout; maximum 8 visible tab headers before horizontal scroll; multi-line input up to 6 lines; tool argument preview truncated at 120 characters; timestamps shown as relative ("3 minutes ago")

#### Error States

| State | Display |
|-------|---------|  
| Agent service unavailable (500) | Toast: "Agent sessions are temporarily unavailable" — dock bar shows disabled "New Agent Session" button with tooltip |
| Session creation failed | Tab shows inline error with message and "Retry" button |
| SSE not implemented (501) | Transparent fallback to polling; no user-visible error |
| SSE connection dropped | Subtle pulsing indicator on affected tab; "Reconnecting…" text in status area |
| Message send failed | Failed message marked with red indicator; "Retry" link on the message |
| Session not found (deleted externally) | Chat area shows "Session not found" banner; tab can be closed |
| Session timed out | Input disables; "Session timed out" banner replaces input |
| Network offline | All tabs show "Offline" overlay; auto-reconnect when network returns |
| Rate limited (429) | Toast: "Too many requests, try again shortly"; send button temporarily disabled |

#### Accessibility

- The dock bar and tabs are fully keyboard-navigable (Tab/Shift+Tab, Enter/Space to activate)
- Message content is semantically structured with ARIA roles (`role="log"` for message list, `role="status"` for streaming indicator)
- Status indicators use both color and icon shape (dot, checkmark, ×, clock) for color-blind accessibility
- The dock resize handle has an ARIA label ("Resize agent dock panel") and is keyboard-operable (arrow keys adjust height by 20px increments)
- Focus management: opening the dock focuses the message input; closing returns focus to the previously focused element
- Screen readers announce new agent messages as they arrive via `aria-live="polite"` on the message list
- Tool call blocks are announced with their name and status when expanded/collapsed

### API Shape

The Agent Dock consumes the following existing API endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|  
| `POST` | `/api/repos/:owner/:repo/agent/sessions` | Create a new agent session |
| `GET` | `/api/repos/:owner/:repo/agent/sessions` | List sessions for the repository |
| `GET` | `/api/repos/:owner/:repo/agent/sessions/:id` | Get a single session |
| `DELETE` | `/api/repos/:owner/:repo/agent/sessions/:id` | Delete a session |
| `POST` | `/api/repos/:owner/:repo/agent/sessions/:id/messages` | Append a message to a session |
| `GET` | `/api/repos/:owner/:repo/agent/sessions/:id/messages` | List messages in a session |
| `GET` | `/api/repos/:owner/:repo/agent/sessions/:id/stream` | SSE stream for session events (501 in CE) |

No new API endpoints are required for the Agent Dock UI. The dock is a purely client-side shell component that consumes the existing agent API surface.

### UI-Core Hooks

```typescript
function useAgentDock(): {
  state: 'open' | 'collapsed' | 'hidden';
  height: number;
  tabs: AgentDockTab[];
  activeTabId: string | null;
  open: () => void;
  collapse: () => void;
  hide: () => void;
  setHeight: (px: number) => void;
  newSession: (title?: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  deleteSession: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
}

interface AgentDockTab {
  id: string;             // client-side tab identifier
  sessionId: string;      // server-side session ID
  name: string;           // display name (title or "Untitled session")
  status: 'pending' | 'active' | 'streaming' | 'completed' | 'failed' | 'timed_out';
  messageCount: number;
  createdAt: string;      // ISO 8601
}

function useAgentChat(sessionId: string): {
  messages: AgentMessage[];
  isStreaming: boolean;
  connectionMode: 'sse' | 'polling' | 'disconnected';
  sendMessage: (content: string) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  loadEarlierMessages: () => Promise<void>;
  hasEarlierMessages: boolean;
  error: string | null;
}
```

### Documentation

1. **"Using the Agent Dock"** — End-user guide covering: how to open/close the dock, create and manage agent sessions, keyboard shortcuts, resize behavior, and how agent sessions relate to repository context.
2. **"Agent Dock Keyboard Shortcuts"** — Quick-reference table of all agent-dock-specific shortcuts.
3. **"Chatting with Agents"** — Guide covering: sending messages, reading streaming responses, understanding tool calls and tool results, retry on failure, and replay mode for completed sessions.
4. **"Agent Sessions FAQ"** — Common questions: "What is an agent session?", "Why did my session time out?", "Can I have multiple sessions?", "What tools can the agent use?", "Why is the agent not responding?", "What happens to my sessions when I close the dock?".
5. **"Troubleshooting Agent Connections"** — Guide for common errors: SSE unavailable, session creation failures, message send failures, network disconnections, streaming interruptions.

## Permissions & Security

### Authorization Roles

| Role | Can See Dock | Can Create Sessions | Can Send Messages | Can Delete Sessions | Notes |
|------|-------------|--------------------|--------------------|---------------------|-------|
| Repository Owner | ✅ | ✅ | ✅ (own sessions) | ✅ (own sessions) | Full access |
| Repository Admin | ✅ | ✅ | ✅ (own sessions) | ✅ (own sessions) | Full access |
| Organization Member with Write | ✅ | ✅ | ✅ (own sessions) | ✅ (own sessions) | Must have write permission on the repo |
| Repository Collaborator (Write) | ✅ | ✅ | ✅ (own sessions) | ✅ (own sessions) | Explicit collaborator grant |
| Repository Collaborator (Read-Only) | ✅ | ✅ | ✅ (own sessions) | ✅ (own sessions) | Read-only users can still create agent sessions to ask questions about the repo |
| Anonymous / Unauthenticated | ❌ | ❌ | ❌ | ❌ | Dock is hidden; login required |
| Deploy Key | ❌ | ❌ | ❌ | ❌ | Deploy keys are for git transport, not agent sessions |

### Cross-User Isolation

- Users can only see and interact with their own agent sessions in the dock
- Attempting to access another user's session via the API returns 404 (not 403) to prevent enumeration
- A user cannot see another user's session tabs, even if they share the same repository
- Admin users can only manage their own sessions through the dock; admin-level session management is available through the admin console

### Rate Limiting

- **Session creation ("New Agent Session")**: Maximum 10 session creation requests per user per repository per 10-minute window
- **Message send**: Maximum 30 messages per user per session per minute; maximum 120 messages per user globally per minute
- **Message list / session list**: Standard platform rate limit (5,000 requests/hour/user)
- **SSE connections**: Maximum 10 concurrent SSE connections per user; 10,000 total active SSE connections server-wide
- **Polling fallback**: Maximum 30 poll requests per minute per session per user (enforced client-side by the 2-second poll interval)
- **Session deletion**: Maximum 30 deletions per user per minute (to prevent batch-scripted mass deletion)

### Data Privacy & PII

- Agent messages may contain repository code, which should be treated as the same sensitivity level as the repository itself
- Session IDs (UUIDs) are exposed in the DOM and localStorage but are not PII and are not guessable
- Message content is stored server-side and subject to the same data retention policies as other repository-scoped data
- The dock does not log, cache, or persist message content in localStorage — only session metadata (ID, title, status) is stored client-side
- Post-logout, all SSE/polling connections are severed and dock tab state is cleared from memory; localStorage keys for dock geometry (height, visibility) remain for UX continuity but contain no sensitive data
- User-generated message content is never included in telemetry events; only metadata (message length, session ID) is tracked

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `AgentDockOpened` | User opens the dock (from hidden or collapsed state) | `user_id`, `repository_id`, `owner`, `repo`, `trigger` (keyboard/button/palette), `existing_tab_count` |
| `AgentDockCollapsed` | User collapses the dock to tab bar | `user_id`, `repository_id`, `active_tab_count` |
| `AgentDockHidden` | User fully hides the dock | `user_id`, `repository_id`, `active_tab_count` |
| `AgentSessionTabOpened` | New agent session tab created and session ready | `user_id`, `repository_id`, `session_id`, `tab_index`, `has_explicit_title`, `creation_duration_ms`, `trigger` (keyboard/button/palette) |
| `AgentSessionTabOpenFailed` | Agent session tab creation failed | `user_id`, `repository_id`, `error_type` (server_error/rate_limited/network_error), `trigger` |
| `AgentSessionTabClosed` | User closes a session tab (does not delete) | `user_id`, `repository_id`, `session_id`, `tab_duration_seconds`, `message_count`, `was_last_tab` |
| `AgentSessionDeleted` | User permanently deletes a session | `user_id`, `repository_id`, `session_id`, `session_status`, `message_count`, `session_age_seconds` |
| `AgentSessionTabSwitched` | User switches active session tab | `user_id`, `repository_id`, `from_session_id`, `to_session_id`, `trigger` (click/keyboard) |
| `AgentSessionTabRenamed` | User renames a session tab | `user_id`, `repository_id`, `session_id`, `name_length` |
| `AgentMessageSent` | User sends a message | `user_id`, `repository_id`, `session_id`, `message_length`, `is_first_message`, `message_index` |
| `AgentMessageSendFailed` | Message send failed | `user_id`, `repository_id`, `session_id`, `error_type` (network/rate_limited/session_ended/server_error), `message_length` |
| `AgentMessageSendRetried` | User retries a failed message | `user_id`, `repository_id`, `session_id`, `retry_attempt` |
| `AgentResponseReceived` | Agent finishes streaming a complete response | `user_id`, `repository_id`, `session_id`, `response_duration_ms`, `response_token_count`, `tool_call_count`, `connection_mode` (sse/polling) |
| `AgentStreamReconnected` | SSE or polling reconnects after dropout | `user_id`, `repository_id`, `session_id`, `disconnect_duration_ms`, `reconnect_attempt_number`, `connection_mode` |
| `AgentSessionCompleted` | Session transitions to completed state | `user_id`, `repository_id`, `session_id`, `total_messages`, `total_duration_seconds`, `tool_calls_total` |
| `AgentSessionTimedOut` | Session transitions to timed_out state | `user_id`, `repository_id`, `session_id`, `total_messages`, `last_activity_seconds_ago` |
| `AgentToolCallExpanded` | User expands a tool call block to inspect arguments | `user_id`, `repository_id`, `session_id`, `tool_name` |
| `AgentDockResized` | User changes dock panel height | `user_id`, `repository_id`, `new_height_px`, `viewport_height_px`, `height_ratio` |
| `AgentPollingFallbackActivated` | SSE returned 501, falling back to polling | `user_id`, `repository_id`, `session_id` |
| `AgentReplayEntered` | User opens a completed session in replay mode | `user_id`, `repository_id`, `session_id`, `session_age_seconds`, `message_count` |

### Properties Attached to All Events

- `timestamp` (ISO 8601)
- `client` (always `"web"`)
- `deployment_mode` (`server` / `daemon` / `desktop`)
- `feature_flag_agents` (boolean)
- `connection_mode` (`sse` / `polling` / `none`)

### Funnel Metrics & Success Indicators

1. **Dock Activation Rate**: Percentage of authenticated repo-page visits where the Agent Dock is opened at least once. Target: >20% of agent-eligible users within 30 days of feature launch.
2. **Session Creation Success Rate**: `AgentSessionTabOpened / (AgentSessionTabOpened + AgentSessionTabOpenFailed)`. Target: ≥99%.
3. **Message Send Success Rate**: `AgentMessageSent / (AgentMessageSent + AgentMessageSendFailed)`. Target: ≥99.5%.
4. **Time to First Response Token**: Duration from user message send to first agent token received. Target: P50 < 3s, P95 < 10s, P99 < 20s.
5. **Conversation Depth**: Average messages per session. Higher values indicate engaged, productive sessions. Target: median ≥4 messages per session.
6. **Session Completion Rate**: Percentage of sessions that reach `completed` status (vs. `failed` or `timed_out`). Target: ≥90%.
7. **Multi-Session Usage**: Percentage of dock sessions with ≥2 concurrent session tabs. Higher = power-user adoption.
8. **Dock Persistence**: Percentage of users who keep the dock open across page navigations (vs. opening/closing per page). Higher = better workflow integration.
9. **Polling Fallback Rate**: Percentage of sessions using polling vs. SSE. Target: decrease over time as SSE implementation matures.
10. **Tool Call Inspection Rate**: Percentage of tool call blocks that are expanded by users. Indicates transparency/trust engagement.
11. **Replay Usage**: Percentage of completed sessions that are revisited in replay mode. Indicates value of conversation history.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|  
| Agent dock mounted in layout | `debug` | `user_id`, `repository_id`, `feature_flag_agents` |
| Agent dock opened | `info` | `user_id`, `repository_id`, `trigger`, `existing_tabs` |
| New agent session tab creation started | `info` | `user_id`, `repository_id`, `has_title` |
| Agent session created for dock | `info` | `user_id`, `repository_id`, `session_id`, `title_length`, `creation_duration_ms` |
| Agent session creation failed | `warn` | `user_id`, `repository_id`, `error_message`, `error_type` |
| Agent message sent | `info` | `user_id`, `repository_id`, `session_id`, `message_length`, `message_index` |
| Agent message send failed | `warn` | `user_id`, `repository_id`, `session_id`, `error_message`, `error_type`, `message_length` |
| Agent SSE stream opened | `debug` | `user_id`, `repository_id`, `session_id` |
| Agent SSE stream returned 501 — polling fallback | `info` | `user_id`, `repository_id`, `session_id` |
| Agent SSE stream dropped | `warn` | `user_id`, `repository_id`, `session_id`, `reconnect_attempt` |
| Agent SSE stream reconnected | `info` | `user_id`, `repository_id`, `session_id`, `disconnect_duration_ms` |
| Agent polling cycle completed | `debug` | `user_id`, `repository_id`, `session_id`, `new_message_count`, `poll_duration_ms` |
| Agent response streaming started | `info` | `user_id`, `repository_id`, `session_id`, `trigger_message_id` |
| Agent response streaming completed | `info` | `user_id`, `repository_id`, `session_id`, `response_duration_ms`, `token_count_estimate`, `tool_call_count` |
| Agent session status changed | `info` | `user_id`, `repository_id`, `session_id`, `old_status`, `new_status` |
| Agent session deleted via dock | `info` | `user_id`, `repository_id`, `session_id` |
| Agent session tab closed (not deleted) | `debug` | `user_id`, `repository_id`, `session_id`, `tab_duration_seconds` |
| Agent dock unmounted (navigation away) | `debug` | `user_id`, `repository_id`, `active_tabs_cleaned`, `sse_connections_closed` |
| Agent dock resized | `debug` | `user_id`, `repository_id`, `new_height`, `viewport_height` |
| Agent tab renamed | `debug` | `user_id`, `repository_id`, `session_id`, `new_name_length` |

**Critical rule**: Raw message content is **never** logged at any level. Only metadata (length, role, session ID) is logged.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|  
| `codeplane_agent_dock_open_total` | Counter | `trigger` (keyboard/button/palette) | Total dock open events |
| `codeplane_agent_session_created_total` | Counter | `status` (success/failed), `trigger` | Total agent session creation attempts via dock |
| `codeplane_agent_session_creation_duration_seconds` | Histogram | `status` | Time from "New Session" to session ready (buckets: 0.1, 0.25, 0.5, 1, 2, 3, 5, 10) |
| `codeplane_agent_message_sent_total` | Counter | `status` (success/failed) | Total messages sent via dock |
| `codeplane_agent_message_send_duration_seconds` | Histogram | `status` | API call duration for message send (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2, 5) |
| `codeplane_agent_response_duration_seconds` | Histogram | `connection_mode` (sse/polling) | Duration from user message to complete agent response (buckets: 1, 2, 5, 10, 15, 30, 60, 120, 300) |
| `codeplane_agent_dock_tabs_active` | Gauge | — | Currently open agent dock tabs across all users |
| `codeplane_agent_sse_connections_active` | Gauge | — | Active SSE connections for agent streams |
| `codeplane_agent_polling_sessions_active` | Gauge | — | Active polling-mode sessions (SSE unavailable) |
| `codeplane_agent_stream_reconnection_total` | Counter | `connection_mode` | Total SSE/polling reconnection attempts |
| `codeplane_agent_session_deleted_total` | Counter | — | Total sessions deleted via dock |
| `codeplane_agent_errors_total` | Counter | `error_type` (session_create_failed/message_send_failed/sse_dropped/polling_failed/session_not_found) | Categorized error counter |
| `codeplane_agent_tool_calls_total` | Counter | `tool_name` | Tool calls observed in agent responses (for tool usage analytics) |

### Alerts & Runbooks

#### Alert: `AgentSessionCreationHighErrorRate`
- **Condition**: `rate(codeplane_agent_session_created_total{status="failed"}[5m]) / rate(codeplane_agent_session_created_total[5m]) > 0.05`
- **Severity**: Warning (>5%), Critical (>20%)
- **Runbook**:
  1. Check `codeplane_agent_errors_total{error_type="session_create_failed"}` for rate and trend.
  2. Inspect agent route handler logs for error messages — filter by `agent session creation failed`.
  3. Check database connectivity — session creation writes to the `agent_sessions` table.
  4. Verify the agent service stub has not been accidentally broken (currently stubs return `{}`; failures here indicate the route layer itself is failing).
  5. Check for rate limiting — `429` responses from the session creation endpoint would appear as failures.
  6. Verify request body validation — malformed titles could cause `400` errors at scale if a client bug ships.
  7. Escalate to backend team if errors persist after confirming infrastructure health.

#### Alert: `AgentMessageSendHighErrorRate`
- **Condition**: `rate(codeplane_agent_message_sent_total{status="failed"}[5m]) / rate(codeplane_agent_message_sent_total[5m]) > 0.02`
- **Severity**: Warning (>2%), Critical (>10%)
- **Runbook**:
  1. Check `codeplane_agent_errors_total{error_type="message_send_failed"}` for dominant error type.
  2. Inspect server logs for message append failures — filter by `agent message send failed`.
  3. Check if failures correlate with session status — messages to completed/timed_out sessions should return clear errors, not 500s.
  4. Verify `dispatchAgentRun` is not throwing — this is called after every user message and failures there would surface as message send failures.
  5. Check database lock contention on `lockAgentSessionForAppend` — high contention could cause timeouts.
  6. Check rate limiting — users sending too many messages in quick succession.

#### Alert: `AgentSSEConnectionDropRate`
- **Condition**: `rate(codeplane_agent_stream_reconnection_total[5m]) > 0.5` (more than 0.5 reconnections/sec sustained over 5 min)
- **Severity**: Warning
- **Runbook**:
  1. Check if SSE endpoint is returning 501 — if so, this is expected CE behavior and the alert threshold should be adjusted.
  2. Check network stability between clients and server (load balancer logs, proxy timeout settings).
  3. Verify SSE keep-alive interval is shorter than any intermediate proxy timeout (recommend 15s keep-alive).
  4. Check `codeplane_agent_sse_connections_active` for connection saturation approaching global limit.
  5. Check PostgreSQL LISTEN/NOTIFY health if SSE is backed by database notifications.
  6. If mostly polling mode, reconnections may be normal — check `codeplane_agent_polling_sessions_active`.

#### Alert: `AgentResponseLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_agent_response_duration_seconds_bucket[5m])) > 30`
- **Severity**: Warning (>30s P95), Critical (>120s P95)
- **Runbook**:
  1. Check if this is an agent backend issue (slow model inference) vs. a transport issue (slow SSE/polling delivery).
  2. Compare `codeplane_agent_response_duration_seconds` across `connection_mode` labels — if polling is significantly slower, the 2s poll interval may be causing perceived latency.
  3. Check agent dispatch logs — is `dispatchAgentRun` actually invoking the agent backend?
  4. Check tool call count in responses — sessions with many tool calls (>10) naturally take longer.
  5. If this is a systemic backend issue, consider queueing with user-visible progress.

#### Alert: `AgentDockActiveTabsHigh`
- **Condition**: `codeplane_agent_dock_tabs_active > 1000` for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check for automation or bots creating sessions without closing tabs.
  2. Review per-user tab counts to identify outliers.
  3. Verify stale session cleanup is running (sessions that time out should have their status updated).
  4. If legitimate organic growth, monitor server-side resource usage for the agent API endpoints.

### Error Cases & Failure Modes

| Error Case | User Impact | Recovery |
|------------|-------------|----------|
| Agent feature flag disabled | Dock is invisible; no agent functionality | Admin enables feature flag; dock appears on next page load |
| Session creation rate limited (429) | "New Agent Session" blocked temporarily | Toast: "Too many sessions created, try again shortly"; auto-retry after cooldown |
| Session creation server error (500) | Tab shows inline error | Retry button; user can try again |
| Message send rate limited (429) | Send button disabled temporarily | Toast with cooldown timer; input remains populated |
| Message send server error (500) | Failed message indicator on the message | Retry link on the message; message content preserved |
| Message send to ended session (4xx) | Error toast; input disables | Session transitions to replay mode |
| SSE endpoint returns 501 | No visible impact; polling starts | Fully transparent to user |
| SSE connection dropped | Subtle reconnection indicator | Auto-reconnect with backoff; messages poll as fallback |
| Polling fails repeatedly | "Connection lost" banner in chat | Auto-retry; manual "Retry" button after max attempts |
| Network offline | All tabs show "Offline" overlay | Auto-reconnect when network returns |
| Session deleted externally | "Session not found" banner | User closes the orphaned tab |
| Session times out | Input disables; timeout banner | Session enters replay mode; user can start new session |
| localStorage quota exceeded | Dock state not persisted | Graceful fallback to defaults; no crash |

## Verification

### API Integration Tests (Agent Session & Message Lifecycle via Dock Flow)

| # | Test Name | Expected Result |
|---|-----------|-----------------|  
| 1 | Create session with title "Fix auth bug" | 201, session returned with title "Fix auth bug", status pending/active |
| 2 | Create session with empty title | 201, session returned with empty/null title (dock assigns "Untitled session" client-side) |
| 3 | Create session with 255-character title (max valid) | 201, title preserved exactly |
| 4 | Create session with 256-character title (exceeds max) | 400 or title truncated to 255 |
| 5 | Create session with title containing emoji (🚀🐛💡) | 201, title preserved with emoji |
| 6 | Create session with title containing HTML tags | 201, title stored as-is (no HTML sanitization needed server-side; client renders as text) |
| 7 | Create session with title that is only whitespace | 201, title trimmed to empty; treated as untitled |
| 8 | Create session without auth | 401 |
| 9 | Create session on nonexistent repo | 404 |
| 10 | Create session with invalid JSON body | 400, "invalid request body" |
| 11 | Create session with missing title field | 201, title defaults to empty/untitled |
| 12 | List sessions for repo with 0 sessions | 200, empty array, X-Total-Count: 0 |
| 13 | List sessions for repo with 5 sessions | 200, 5 items, X-Total-Count: 5 |
| 14 | List sessions with page=1, per_page=2 | 200, 2 items returned, X-Total-Count reflects total |
| 15 | List sessions with page=2, per_page=2 (total=5) | 200, 2 items (items 3-4), correct total |
| 16 | List sessions with per_page=51 (exceeds max) | 200, clamped to 50 items max |
| 17 | List sessions with per_page=0 | 200, uses default (30) or returns empty |
| 18 | List sessions without auth | 401 |
| 19 | Get session by ID | 200, full session object |
| 20 | Get session with nonexistent ID | 404 |
| 21 | Get session with empty ID | 400, "session id is required" |
| 22 | Get session belonging to another user | 404 (not 403) |
| 23 | Delete session by ID | 204, no content |
| 24 | Delete nonexistent session (idempotent) | 204 |
| 25 | Delete session without auth | 401 |
| 26 | Delete session belonging to another user | 404 (not 403) |
| 27 | Append user message with text part | 201, message returned with role "user" |
| 28 | Append user message with empty parts array | 400, "parts are required" |
| 29 | Append user message with invalid role "admin" | 400, "invalid role" |
| 30 | Append message with role "assistant" | 201 (allowed for agent backend usage) |
| 31 | Append message with role "system" | 201 |
| 32 | Append message with role "tool" | 201 |
| 33 | Append message with invalid part type "image" | 400, "invalid part type" |
| 34 | Append message with text part as bare string | 201, content normalized to `{ value: "..." }` |
| 35 | Append message with tool_call part as string (invalid) | 400, "part content must be an object for tool_call" |
| 36 | Append message with tool_result part as string (invalid) | 400, "part content must be an object for tool_result" |
| 37 | Append message with null part content | 400, "part content is required" |
| 38 | Append message with 4000-character text (max valid) | 201, content preserved |
| 39 | Append message with 4001-character text (exceeds max) | 400 or accepted (server may not enforce; client enforces) |
| 40 | Append message to nonexistent session | 404 |
| 41 | Append message without auth | 401 |
| 42 | Append user message triggers dispatchAgentRun | 201, dispatch called (verify via mock/spy in test) |
| 43 | Append assistant message does NOT trigger dispatch | 201, dispatch NOT called |
| 44 | List messages for session with 0 messages | 200, empty array |
| 45 | List messages with pagination (page=1, per_page=10) | 200, correct page of messages |
| 46 | List messages with per_page=51 (exceeds max) | 200, clamped to 50 |
| 47 | List messages without auth | 401 |
| 48 | SSE stream endpoint returns 501 in CE | 501, `{ "message": "SSE streaming not implemented in Community Edition" }` |
| 49 | SSE stream endpoint for nonexistent session | 404 or 501 (currently 501 for all) |
| 50 | Concurrent session creation (5 sessions rapidly) | All 5 created successfully, unique IDs |
| 51 | Concurrent message sends to same session (5 messages) | All 5 appended in order, no duplicates |
| 52 | Session response schema validation | All required fields present with correct types |

### Web UI (Playwright) E2E Tests

| # | Test Name | Expected Result |
|---|-----------|-----------------|  
| 53 | Agent dock bar is visible on repository page when logged in and agents flag enabled | Dock bar element present in DOM |
| 54 | Agent dock bar is NOT visible when agents feature flag is disabled | Dock bar absent |
| 55 | Agent dock bar is NOT visible on non-repo pages (user settings, admin) | Dock bar absent |
| 56 | Agent dock bar is NOT visible for unauthenticated users | Dock bar absent |
| 57 | "New Agent Session" button creates a session tab | Tab appears with "Untitled session" or title, status indicator visible |
| 58 | "New Agent Session" via command palette creates a session tab | Open palette → select "Agent: New Session" → tab appears |
| 59 | "New Agent Session" via Ctrl+Shift+N keyboard shortcut | New tab appears |
| 60 | Session tab shows correct status indicator (pending → active) | Status icon transitions appropriately |
| 61 | Chat area shows "Send a message to start the conversation." for empty session | Placeholder text visible |
| 62 | Typing a message and pressing Enter sends the message | Message appears in chat history with "You" label |
| 63 | Sent message appears immediately in chat (optimistic rendering) | Message visible before API response |
| 64 | Message input disables during agent streaming with "Agent is responding…" | Input dimmed, placeholder text changes |
| 65 | Agent response appears with "Agent" label and markdown formatting | Response rendered with proper formatting |
| 66 | Code blocks in agent response have syntax highlighting and copy button | Syntax colors applied; copy button visible on hover |
| 67 | Tool call block renders with tool name and is collapsible | Block shows tool name; click toggles expand/collapse |
| 68 | Tool result block renders with success/failure indicator | ✓ or ✗ icon with appropriate color |
| 69 | Multiple tabs can be created (up to 20) | 20 tabs created, all visible in tab strip |
| 70 | 21st tab creation shows informational toast | Toast: "Maximum tabs reached. Close a tab to open a new session." |
| 71 | Clicking a tab switches the active session chat | Active tab highlighted, chat content changes |
| 72 | Closing a tab via × button removes it from dock (session NOT deleted) | Tab removed; session still accessible via session list |
| 73 | Closing last tab shows "No active sessions" empty state in collapsed dock | Empty state message visible |
| 74 | Deleting a session via right-click → "Delete Session" shows confirmation | Confirmation dialog appears |
| 75 | Confirming session deletion removes tab and deletes session | Tab removed; `DELETE` API called |
| 76 | Cancelling session deletion keeps tab | Tab remains; no API call |
| 77 | Dock can be collapsed by clicking collapse button | Dock collapses to tab bar only |
| 78 | Dock can be expanded by clicking expand button | Dock expands to show chat panel |
| 79 | Dock can be hidden by clicking close button | Dock disappears entirely |
| 80 | Dock can be toggled via Ctrl+Shift+A keyboard shortcut | Dock toggles between open and hidden |
| 81 | Dock height persists after page navigation within repo | Navigate away and back; height is restored |
| 82 | Dock open/collapsed/hidden state persists after page navigation | Navigate away and back; state is restored |
| 83 | Dock resize by dragging top edge changes height | Panel height adjusts, min=200px enforced |
| 84 | Dock resize does not exceed 70% viewport height | Dragging beyond 70% clamps to maximum |
| 85 | Completed session shows in replay mode (no input, "Session completed" banner) | Input area replaced with status banner; messages are read-only |
| 86 | Failed session shows "Session failed" banner | Red banner visible, input disabled |
| 87 | Timed-out session shows "Session timed out" banner | Yellow banner visible, input disabled |
| 88 | Tab rename via double-click on tab name | Inline editor appears, new name saved |
| 89 | Tab rename with empty string falls back to "Untitled session" | Tab shows "Untitled session" |
| 90 | Tab rename with 64-character name (max valid) | Name saved and displayed |
| 91 | Tab rename with 65-character name (exceeds max) | Name truncated to 64 characters |
| 92 | Post-logout dock is hidden and streaming connections severed | After logout, dock disappears; no console errors |
| 93 | Navigating to different repo scopes dock to new repo context | Tabs from previous repo hidden; new repo context active |
| 94 | Returning to previous repo restores previous dock state | Previous tabs reappear |
| 95 | Keyboard shortcut Ctrl+Tab switches session tabs | Active tab changes to next |
| 96 | Keyboard shortcut Ctrl+Shift+Tab switches to previous tab | Active tab changes to previous |
| 97 | Keyboard shortcut Ctrl+W closes active session tab | Tab closed |
| 98 | Shift+Enter in message input inserts newline (multi-line mode) | Input expands, newline inserted |
| 99 | Message with 4000 characters (max valid) can be sent | Message sent successfully |
| 100 | Message with 4001 characters shows character limit warning | Warning text visible, send disabled |
| 101 | Whitespace-only message cannot be sent | Send button disabled; no API call |
| 102 | Agent dock renders correctly in dark mode | Theme colors match dark palette |
| 103 | Agent dock renders correctly in light mode | Theme colors match light palette |
| 104 | Dock is accessible via keyboard navigation only (no mouse) | All dock controls reachable via Tab key |
| 105 | Multiple browser tabs with same repo show independent dock state | Each tab has its own dock state |
| 106 | Chat area auto-scrolls during streaming | New content scrolls into view |
| 107 | User scroll-up pauses auto-scroll; "↓ New messages" indicator appears | Indicator visible; clicking it jumps to latest |
| 108 | SSE reconnection after network disruption | Simulate disconnect → reconnect → messages continue |
| 109 | Polling fallback activates when SSE returns 501 | Messages still appear (with slight delay); no error shown to user |
| 110 | Failed message shows retry indicator | Red indicator on message; retry link clickable |
| 111 | Retrying failed message re-sends to API | Message retried; on success, error indicator removed |
| 112 | Session status badge updates in real time (external status change) | Status change via API → tab indicator updates |
| 113 | Dock width < 600px: tab strip collapses to dropdown | Dropdown selector visible instead of tab strip |
| 114 | "Load earlier messages" appears when message count exceeds 500 | Link visible at top of chat; clicking loads older messages |

### CLI E2E Tests (Cross-Surface Validation)

| # | Test Name | Expected Result |
|---|-----------|-----------------|  
| 115 | `codeplane agent session run "Fix bug" --repo owner/repo` creates session visible in web UI dock | Session created via CLI → web dock can open it as a tab |
| 116 | `codeplane agent session chat <id> "Follow up"` sends message visible in web UI dock chat | Message appears in dock chat history |
| 117 | `codeplane agent session list --repo owner/repo --json` returns sessions matching dock state | JSON output matches sessions available in dock |
| 118 | Session deleted via `codeplane agent session view <id>` then DELETE → dock shows "Session not found" | Dock tab for deleted session shows appropriate state |

### TUI Cross-Surface Validation

| # | Test Name | Expected Result |
|---|-----------|-----------------|  
| 119 | Session created in web dock is listed in TUI Agent Session List | TUI `g a` screen shows the session |
| 120 | Message sent via TUI Agent Chat appears in web dock replay | Web dock shows the message in conversation history |

### Boundary & Stress Tests

| # | Test Name | Expected Result |
|---|-----------|-----------------|  
| 121 | 20 concurrent session tabs all functional | All 20 tabs visible, all switchable, chat content loads correctly |
| 122 | Rapid tab open/close cycle (10 tabs in 5 seconds) | All sessions created, tabs removed cleanly, no orphan state |
| 123 | Dock state persists through 50 page navigations | localStorage read/write remains consistent |
| 124 | Polling mode session survives 10 minutes with active agent | Messages continue arriving via polling |
| 125 | Session with 500 messages loads correctly | Messages load with pagination; "Load earlier" works |
| 126 | Session with 501 messages triggers memory cap | Only 500 in memory; earlier messages loaded on demand |
| 127 | Message with exactly 4000 characters sends successfully | 201 response, message fully preserved |
| 128 | Message with 4001 characters rejected client-side | Send disabled, character count warning shown |
| 129 | Session title with exactly 255 characters accepted | Title saved and displayed (truncated in tab UI) |
| 130 | Session title with 256 characters rejected or truncated | 400 or truncated to 255 |
| 131 | Tab name with exactly 64 characters accepted | Name saved |
| 132 | Tab name with 65 characters truncated to 64 | Name truncated client-side |
| 133 | Dock panel at minimum height (200px) renders chat | Chat area visible with at least 2 messages; input visible |
| 134 | Dock panel at maximum height (70% viewport) renders correctly | Layout does not overflow; main content still visible |
| 135 | LocalStorage quota exceeded gracefully handled | Dock falls back to defaults, no crash, no console errors |
| 136 | 10 concurrent SSE connections for different sessions | All connections active (or all fall back to polling) |
| 137 | 30 rapid poll requests do not trigger server rate limiting | All polls return 200 |
| 138 | Sending 30 messages in 1 minute (rate limit boundary) | All messages sent successfully |
| 139 | Sending 31 messages in 1 minute (exceeds rate limit) | 429 response on 31st; error toast shown |
| 140 | Agent response with 50 tool calls renders all blocks | All 50 blocks visible and collapsible |
| 141 | Agent response with 10,000-character code block | Code block rendered with syntax highlighting, scrollable |
| 142 | Agent response with deeply nested markdown (5 levels of lists) | Rendered correctly with proper indentation |
