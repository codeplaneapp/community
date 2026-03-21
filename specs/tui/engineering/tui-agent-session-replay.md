# Engineering Specification: TUI Agent Session Replay Screen

**Ticket:** `tui-agent-session-replay`
**Status:** Not started
**Test file:** `e2e/tui/agents.test.ts` (94 new tests appended inside `TUI_AGENT_SESSION_REPLAY` describe block)
**Dependencies:** `tui-agent-data-hooks`, `tui-agent-message-block`, `tui-agent-screen-registry`, `tui-agent-e2e-scaffolding`, `tui-agent-session-list`

---

## 1. Overview

The Agent Session Replay screen is a read-only transcript viewer for completed, failed, and timed_out agent sessions. It renders the full message history as a scrollable document with vim-style navigation, collapsible tool blocks, full-text search, clipboard copy via OSC 52, and responsive layout across three breakpoints.

The replay screen is distinct from the live chat screen (`AgentChatScreen`). It is pushed when a user selects a session whose status is `completed`, `failed`, or `timed_out` from the agent session list, or navigates via deep-link. Active and pending sessions redirect to the live chat screen via `navigation.replace()`.

---

## 2. Implementation Plan

8 vertical steps. Each produces a testable artifact. Steps 1–3 are foundation components; steps 4–8 are feature layers on the main screen.

### Step 1: ToolBlock Component

**File:** `apps/tui/src/screens/Agents/components/ToolBlock.tsx`

Replace the existing empty stub. Reference impl: `specs/tui/apps/tui/src/screens/Agents/components/ToolBlock.tsx`.

**Interface:**

```typescript
interface ToolBlockBaseProps {
  toolName: string;
  expanded: boolean;
  onToggle: () => void;
  breakpoint: Breakpoint;
}

interface ToolBlockCallProps extends ToolBlockBaseProps {
  variant: "call";
  input: string;
}

interface ToolBlockResultProps extends ToolBlockBaseProps {
  variant: "result";
  output: string;
  isError: boolean;
}

export type ToolBlockProps = ToolBlockCallProps | ToolBlockResultProps;
```

**Rendering rules:**

| State | Breakpoint | Render |
|-------|-----------|--------|
| Collapsed | minimum | `▶ {toolName}` — no summary |
| Collapsed | standard | `▶ {toolName} — {summary60ch…}` |
| Collapsed | large | `▶ {toolName} — {summary120ch}` |
| Expanded | any | `▼ {toolName}` + `<code filetype="json">{input}</code>` + result via `<markdown>` or `<text fg={error}>` |

For `result` variant, a status prefix precedes the expand indicator:
- Success: `✓` in `COLORS.success`
- Error: `✗` in `COLORS.error`

**Truncation:**

| Content | Threshold | Behavior |
|---------|-----------|----------|
| Tool name | 50 chars | Slice + `…` |
| Summary (standard) | 60 chars | Via `generateSummary()` |
| Summary (large) | 120 chars | Via `generateSummary()` |
| Summary (minimum) | Hidden | `generateSummary()` returns `null` |
| Tool input/output | 64KB | Append `"\n… (truncated — content exceeds 64KB)"` |

**16-color fallback:** When `COLOR_TIER === "ansi16"`, indicators fall back to ASCII (`>`, `v`, `+`, `x`).

**OpenTUI components:** `<box>`, `<text>`, `<code filetype="json">`, `<markdown>`.

Wrapped with `React.memo()`.

**Dependencies:** `../types.js`, `./colors.js`, `../utils/generateSummary.js`, `../../../theme/syntaxStyle.js`.

---

### Step 2: MessageBlock Component

**File:** `apps/tui/src/screens/Agents/components/MessageBlock.tsx`

Replace existing empty stub. Reference: `specs/tui/apps/tui/src/screens/Agents/components/MessageBlock.tsx`.

**Interface:**

```typescript
export interface MessageBlockProps {
  message: AgentMessage;
  breakpoint: Breakpoint;
  showSeparator?: boolean;       // default: true
  expandedToolIds?: Set<string>;
  onToggleToolExpand?: (toolId: string) => void;
}
```

**Role labels by breakpoint:**

| Role | minimum | standard+ | Color | No-color |
|------|---------|-----------|-------|----------|
| user | `Y:` | `You` | primary (ANSI 33) | `[YOU]` |
| assistant | `A:` | `Agent` | success (ANSI 34) | `[AGENT]` |
| system | `System` | `System` | muted (ANSI 245) | `[SYS]` |
| tool | (empty) | (empty) | — | `[TOOL]` |

**Padding:** 0ch (minimum), 2ch (standard), 4ch (large).

**Timestamps:** Hidden at minimum. Relative short at standard (`3m`). Verbose at large (`3 minutes ago`). Via `formatTimestamp()`.

**Separator:** `─` chars in `COLORS.border`, spanning `width - paddingLeft - paddingRight`.

**Part dispatch:**
- `text` → `<markdown content={part.content} />`
- `tool_call` → `<ToolBlock variant="call" />`
- `tool_result` → `<ToolBlock variant="result" />`
- Unknown → `<code>{JSON.stringify(part)}</code>` with `⚠` indicator

**Message-level truncation:** Content > 100KB → truncated with `"Content truncated. Full message is {N}KB."` indicator.

**Streaming:** For `assistant` + `streaming: true`, braille spinner precedes label; last text part gets `streaming={true}` on `<markdown>`.

Wrapped with `React.memo()`.

---

### Step 3: SessionSummary Component + Supporting Utilities

**New file:** `apps/tui/src/screens/Agents/components/SessionSummary.tsx`

```typescript
export interface SessionSummaryProps {
  status: "completed" | "failed" | "timed_out" | "active" | "pending";
  messageCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  workflowRunId: string | null;
  breakpoint: Breakpoint;
  onWorkflowNavigate?: (runId: string) => void;
  workflowLinkFocused?: boolean;
}
```

**Status icons:** `✓` completed/green, `✗` failed/red, `⏱` timed_out/yellow.

**Duration:** Via `formatDuration(startedAt, finishedAt)`. Null timestamps → `"—"`.

**Responsive labels:** minimum abbreviates (`6 msgs`, `1m42s`). Standard+ uses full (`Messages: 6`, `Duration: 1m 42s`).

**Workflow link:** Primary color, `inverse` when focused, `underline` otherwise. `[Enter]` hint in muted.

#### Supporting utility files (all new):

| File | Purpose |
|------|---------|
| `apps/tui/src/screens/Agents/utils/formatDuration.ts` | ISO timestamps → `"Xm Ys"` / `"Xh Ym"` / `"—"` |
| `apps/tui/src/screens/Agents/utils/generateSummary.ts` | Breakpoint-aware one-line summary (null/60ch/120ch) |
| `apps/tui/src/screens/Agents/utils/truncateTitle.ts` | Grapheme-aware title truncation via `Intl.Segmenter` |
| `apps/tui/src/screens/Agents/utils/extractTextContent.ts` | Plain text from message parts for clipboard/search |
| `apps/tui/src/screens/Agents/components/colors.ts` | Color palette with truecolor/ansi256/ansi16 tiers |

See reference implementations in `specs/tui/apps/tui/src/screens/Agents/` for exact source.

**Barrel export update** in `apps/tui/src/screens/Agents/components/index.ts`:
```typescript
export { MessageBlock } from "./MessageBlock.js";
export { ToolBlock } from "./ToolBlock.js";
export { SessionSummary } from "./SessionSummary.js";
export { COLORS, COLOR_TIER } from "./colors.js";
```

---

### Step 4: AgentSessionReplayScreen — Core Layout & Data Loading

**File:** `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx`

Params read from `useNavigation().current.params`: `owner`, `repo`, `sessionId`, optional `sessionTitle`.

**Data fetching:**

1. `useAgentSession(owner, repo, sessionId)` → `GET /api/repos/:owner/:repo/agent/sessions/:id`
2. `useAgentMessages(owner, repo, sessionId, { autoPaginate: true })` → pages of 50 until `hasMore === false`

**Active session redirect:** If `session.status` is `active` or `pending`, call `replace(ScreenName.AgentChat, ...)`.

**Loading/error states:**

| Condition | Render |
|-----------|--------|
| Session loading | `"Loading session…"` centered in primary |
| Session 404 | `"Session not found. Press q to go back."` in error |
| Session 401 | `"Session expired. Run \`codeplane auth login\` to re-authenticate."` |
| Messages 5xx / timeout | `"Failed to load messages. Press R to retry."` |
| Messages 429 | Inline `"Rate limited"` indicator, auto-resume after `Retry-After` |
| Messages loading | `"Loading messages…"` footer below rendered messages |

**Layout (pseudocode):**
```
<box column>
  <header> breadcrumb + REPLAY badge </header>
  <box row flexGrow={1}>
    <scrollbox ref={scrollRef} paddingX={bp padding}>
      {messages.length === 0 && allLoaded → empty state}
      {messages.map → <MessageBlock />}
      {allLoaded && messages.length > 0 → <SessionSummary />}
      {hasMore → loading indicator}
    </scrollbox>
    {breakpoint === "large" → <sidebar width={25}>}
  </box>
  {searchActive → <search overlay>}
  <status bar> keybinding hints + position indicator </status bar>
</box>
```

**Large breakpoint sidebar (200×60+):** Session Info (status, messages, duration, start/end) + Legend (color-coded role labels).

---

### Step 5: Keyboard Navigation & Position Tracking

**File:** Same as Step 4.

**State:**
```typescript
const [scrollOffset, setScrollOffset] = useState(0);
const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
const [searchActive, setSearchActive] = useState(false);
const [searchQuery, setSearchQuery] = useState("");
const [matchIndex, setMatchIndex] = useState(0);
const [matchCount, setMatchCount] = useState(0);
const [toolExpandState, setToolExpandState] = useState<Set<string>>(new Set());
const [workflowLinkFocused, setWorkflowLinkFocused] = useState(false);
```

**Keyboard handler via `useKeyboard()` from `@opentui/react`:**

When `searchActive`, only `Escape`/`n`/`N` handled; other keys captured by `<input>` (Priority 1).

When transcript focused:

| Key | Action |
|-----|--------|
| `j` / `ArrowDown` | `scrollRef.current?.scrollDown(1)` |
| `k` / `ArrowUp` | `scrollRef.current?.scrollUp(1)` |
| `G` | `scrollRef.current?.scrollToEnd()` |
| `g g` | `scrollRef.current?.scrollTo(0)` (via go-to mode) |
| `Ctrl+d` | Page down (half viewport) |
| `Ctrl+u` | Page up (half viewport) |
| `]` | Next message (no-op at last) |
| `[` | Previous message (no-op at first) |
| `x` | Toggle nearest tool block in viewport |
| `X` | Toggle all tools (expand if any collapsed, else collapse all) |
| `/` | Open search |
| `y` | Copy current message via OSC 52 |
| `Enter` | Navigate to workflow if link focused, else no-op |
| `R` | Retry fetch (only when error state) |
| `q` / `Escape` | Pop screen |

**Position indicator:** `"Message N of M"` at standard+, `"N/M"` at minimum. Updates on scroll past message boundaries and on `]`/`[` jumps.

**Tool toggling:**
- `x`: Find nearest tool block ID in viewport, toggle its membership in the `Set<string>`
- `X`: If any ID missing from set → add all (expand). If all present → clear set (collapse)

**Clipboard (`y`):** Extract text via `extractTextContent()`, base64 encode, write `\x1b]52;c;{base64}\x07` to stdout. Show 2s status hint.

---

### Step 6: Search Overlay

**File:** Same as Step 4.

Search operates on full text of all messages including tool inputs/outputs regardless of expand state.

**Match computation:** Case-insensitive substring search across `extractPartText()` for every part of every message.

```typescript
interface SearchMatch {
  messageIndex: number;
  charOffset: number;
  length: number;
}
```

**Navigation:** `n` → next match (wrapping), `N` → previous. Match count display: `"3/12"` or `"0/0"`.

**Overlay:** Absolute positioned above status bar. `/` prefix + `<input>` + match count.

**Esc chain:** Search open → close search. No search → pop screen.

---

### Step 7: Screen Registry & Navigation Integration

**Modified files:** Screen registry, deep-link parser, session list screen.

**Registry entry:**
```typescript
[ScreenName.AgentSessionReplay]: {
  component: AgentSessionReplayScreen,
  requiresRepo: true,
  params: ["sessionId"],
  breadcrumb: (params) => `Session: ${truncateTitle(params.sessionTitle ?? params.sessionId?.slice(0, 8), 40).text}`,
}
```

**Deep-link:** `codeplane tui --screen agent-replay --repo owner/repo --session-id {id}` pre-populates stack: `[Dashboard, RepoOverview, Agents, AgentSessionReplay]`.

**Session list routing:** `handleSelect` checks status — completed/failed/timed_out → push replay; active/pending → push chat.

---

### Step 8: Telemetry & Observability

**File:** Same as Step 4.

**Telemetry events** via `useAnalytics()`:

| Event | Trigger |
|-------|---------|
| `tui.agent_replay.view` | Mount + data loaded |
| `tui.agent_replay.scroll` | Scroll (10% sampled) |
| `tui.agent_replay.message_jump` | `]`/`[` |
| `tui.agent_replay.tool_expand` | `x` |
| `tui.agent_replay.tool_expand_all` | `X` |
| `tui.agent_replay.search` | Search initiated |
| `tui.agent_replay.copy` | `y` |
| `tui.agent_replay.workflow_navigate` | Enter on link |
| `tui.agent_replay.error` | API failure |
| `tui.agent_replay.exit` | Unmount |

**Logging** to stderr via structured logger. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

| Level | Events |
|-------|--------|
| `debug` | mount, session loaded, page loaded, jump, toggle, search, copy |
| `info` | all messages loaded (ready), workflow navigation |
| `warn` | fetch failed, rate limited, slow load >5s, content truncated, malformed part |
| `error` | auth error, session not found, render error |

---

## 3. File Inventory

### New Files

| File | Purpose |
|------|---------|
| `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx` | Main replay screen |
| `apps/tui/src/screens/Agents/components/SessionSummary.tsx` | Summary block |
| `apps/tui/src/screens/Agents/components/colors.ts` | Color palette with tier detection |
| `apps/tui/src/screens/Agents/utils/formatDuration.ts` | Duration formatting |
| `apps/tui/src/screens/Agents/utils/generateSummary.ts` | Tool summary truncation |
| `apps/tui/src/screens/Agents/utils/truncateTitle.ts` | Grapheme-aware title truncation |
| `apps/tui/src/screens/Agents/utils/extractTextContent.ts` | Text extraction for clipboard/search |

### Modified Files

| File | Change |
|------|---------|
| `apps/tui/src/screens/Agents/components/MessageBlock.tsx` | Replace stub |
| `apps/tui/src/screens/Agents/components/ToolBlock.tsx` | Replace stub |
| `apps/tui/src/screens/Agents/components/index.ts` | Add exports |
| Screen registry file | Add `AgentSessionReplay` entry |
| Deep-link parser | Add `agent-replay` screen |
| Session list screen | Route terminal sessions to replay |

### Test Files

| File | Change |
|------|---------|
| `e2e/tui/agents.test.ts` | Append 94 tests in `TUI_AGENT_SESSION_REPLAY` block |

---

## 4. Data Flow

```
Enter on completed session → push(AgentSessionReplay)
  → useAgentSession() → GET /sessions/:id
    → 200: render header + REPLAY badge
    → 404: "Session not found."
    → 401: auth error screen
  → [active/pending] → replace(AgentChat)
  → useAgentMessages({ autoPaginate: true })
    → GET /messages?page=1 → render page 1
    → GET /messages?page=2 → append
    → ... until hasMore=false
    → 429 → pause, Retry-After, resume
    → 5xx → error with R-to-retry
  → allLoaded → render SessionSummary
```

---

## 5. Edge Cases & Boundary Handling

| Scenario | Detection | Behavior |
|----------|-----------|----------|
| 0 messages | `messages.length === 0 && allLoaded` | `"This session has no messages."` centered |
| Message > 100KB | byte length check | Truncate + `"Content truncated. Full message is {N}KB."` |
| Tool content > 64KB | `content.length > 65536` | Truncate + `"… (truncated — content exceeds 64KB)"` |
| 500 messages | 10 pages auto-paginated | All rendered; windowing if >50MB |
| Null timestamps | field check | Duration `"—"` |
| Title 255 chars | `truncateTitle(title, 40)` | 39 graphemes + `…` |
| Malformed part | type not recognized | `⚠` + raw JSON in `<code>` |
| Unicode content | `Intl.Segmenter` | Grapheme-aware truncation |
| Empty parts | `parts.length === 0` | Blank block with role label |
| Active session via deep-link | status check | Redirect to chat |
| Terminal < 80×24 | Router gate | "Terminal too small"; data preserved |
| Resize during load | `useOnResize` | Layout re-renders; fetch continues |
| `q` during loading | keypress | AbortController cancels fetches |
| Rapid j/k/]/[/x | sequential | One action per keypress, no debounce |
| OSC 52 unsupported | terminal ignores | Silent; hint "Copy not supported" 2s |
| No-color terminal | `NO_COLOR=1` | Labels: `[YOU]`, `[AGENT]`, `[SYS]`, `[TOOL]` |
| 16-color terminal | `COLOR_TIER === "ansi16"` | ASCII indicators, closest colors |
| Rate limited pagination | 429 | Pause, indicator, auto-resume |
| Partial page failure | some pages 5xx | Show loaded + gap indicator + R-to-retry |

---

## 6. Responsive Behavior Matrix

| Aspect | 80×24 (minimum) | 120×40 (standard) | 200×60+ (large) |
|--------|-----------------|-------------------|------------------|
| Padding | 0ch | 2ch | 4ch |
| Role labels | Abbreviated | Full | Full |
| Timestamps | Hidden | Relative short | Relative verbose |
| Tool summary | Hidden | 60ch | 120ch |
| Position | `N/M` | `Message N of M` | `Message N of M` |
| Sidebar | Hidden | Hidden | 25ch |
| Summary labels | Abbreviated | Full | Full |
| Separator | Full width | Width − 4ch | Width − 8ch |

Resize: synchronous re-layout, scroll position preserved (clamped), all state preserved.

---

## 7. Unmount & Cleanup

1. Cancel in-flight fetches via AbortController
2. Fire `tui.agent_replay.exit` telemetry
3. Deregister keyboard handler
4. Parent session list retains scroll/focus state

---

## 8. Productionization Checklist

1. **Memory:** Monitor at 500 messages. If >50MB, implement content windowing (render ±5 viewports).
2. **AbortController:** `useAgentMessages` must accept AbortSignal for mid-pagination cancel. Extend `@codeplane/ui-core` if needed.
3. **OSC 52:** Check `TERM_PROGRAM` against known-support list (iTerm2, WezTerm, kitty, Alacritty). Show appropriate hint.
4. **Rate limit:** Extract `Retry-After`, pause, resume automatically. Log at warn.
5. **Snapshot stability:** Regenerate golden files on layout changes. CI fails on stale files.
6. **Performance budget:** First paint <200ms, full 50-message load <3s, scroll <16ms/frame.
7. **Error boundary:** App-level catches render errors → `"Press r to restart"`.
8. **Stale data:** Returning from workflow detail preserves cached data. Only refetch on explicit `R`.

---

## 9. Unit & Integration Tests

### Test File: `e2e/tui/agents.test.ts`

94 tests in `describe("TUI_AGENT_SESSION_REPLAY", ...)`. Tests **never** skipped or commented out. Run via `bun test e2e/tui/agents.test.ts`.

### Terminal Snapshot Tests (22)

| ID | Description | Size |
|----|-------------|------|
| SNAP-REPLAY-001 | Mixed message types full layout | 120×40 |
| SNAP-REPLAY-002 | Compact layout, no padding/timestamps | 80×24 |
| SNAP-REPLAY-003 | Layout with metadata sidebar | 200×60 |
| SNAP-REPLAY-004 | REPLAY badge in header | 120×40 |
| SNAP-REPLAY-005 | User message "You" label | 120×40 |
| SNAP-REPLAY-006 | Assistant message "Agent" label | 120×40 |
| SNAP-REPLAY-007 | System message muted label | 120×40 |
| SNAP-REPLAY-008 | Tool block collapsed ▶ | 120×40 |
| SNAP-REPLAY-009 | Tool block expanded ▼ | 120×40 |
| SNAP-REPLAY-010 | Tool error result styling | 120×40 |
| SNAP-REPLAY-011 | Summary completed ✓ green | 120×40 |
| SNAP-REPLAY-012 | Summary failed ✗ red | 120×40 |
| SNAP-REPLAY-013 | Summary timed_out ⏱ yellow | 120×40 |
| SNAP-REPLAY-014 | Summary with workflow link | 120×40 |
| SNAP-REPLAY-015 | Empty session message | 120×40 |
| SNAP-REPLAY-016 | Loading state | 120×40 |
| SNAP-REPLAY-017 | Error 404 state | 120×40 |
| SNAP-REPLAY-018 | Search overlay with count | 120×40 |
| SNAP-REPLAY-019 | Search highlight | 120×40 |
| SNAP-REPLAY-020 | Position indicator in status bar | 120×40 |
| SNAP-REPLAY-021 | Breadcrumb truncated title | 120×40 |
| SNAP-REPLAY-022 | No-color [YOU]/[AGENT] prefixes | 120×40 |

Each test launches via deep-link `--screen agent-replay --repo acme/api --session-id {fixture}`, waits for expected text, then calls `expect(terminal.snapshot()).toMatchSnapshot()`.

### Keyboard Interaction Tests (32)

| ID | Description |
|----|-------------|
| KEY-REPLAY-001 | j scrolls down one line |
| KEY-REPLAY-002 | k scrolls up one line |
| KEY-REPLAY-003 | Down arrow scrolls down |
| KEY-REPLAY-004 | Up arrow scrolls up |
| KEY-REPLAY-005 | G jumps to bottom (summary visible) |
| KEY-REPLAY-006 | g g jumps to top (message 1) |
| KEY-REPLAY-007 | Ctrl+D pages down |
| KEY-REPLAY-008 | Ctrl+U pages up |
| KEY-REPLAY-009 | ] jumps to next message |
| KEY-REPLAY-010 | [ jumps to previous message |
| KEY-REPLAY-011 | ] at last message is no-op |
| KEY-REPLAY-012 | [ at first message is no-op |
| KEY-REPLAY-013 | x expands collapsed tool |
| KEY-REPLAY-014 | x collapses expanded tool |
| KEY-REPLAY-015 | X expands all when some collapsed |
| KEY-REPLAY-016 | X collapses all when all expanded |
| KEY-REPLAY-017 | / opens search input |
| KEY-REPLAY-018 | Typing in search shows match count |
| KEY-REPLAY-019 | n jumps to next match |
| KEY-REPLAY-020 | N jumps to previous match |
| KEY-REPLAY-021 | Esc in search closes search |
| KEY-REPLAY-022 | Esc without search pops screen |
| KEY-REPLAY-023 | q pops screen |
| KEY-REPLAY-024 | y copies via OSC 52 |
| KEY-REPLAY-025 | Enter on workflow link navigates |
| KEY-REPLAY-026 | Enter on non-link is no-op |
| KEY-REPLAY-027 | Rapid j×20 scrolls without crash |
| KEY-REPLAY-028 | Rapid ]×3 jumps sequentially |
| KEY-REPLAY-029 | j/k/]/[ captured as text in search |
| KEY-REPLAY-030 | Search is case-insensitive |
| KEY-REPLAY-031 | No matches shows 0/0 |
| KEY-REPLAY-032 | Position updates on scroll/jump |

### Responsive Tests (12)

| ID | Description |
|----|-------------|
| RESP-REPLAY-001 | 80×24 no padding |
| RESP-REPLAY-002 | 80×24 timestamps hidden |
| RESP-REPLAY-003 | 80×24 tool name only |
| RESP-REPLAY-004 | 80×24 position abbreviated |
| RESP-REPLAY-005 | 120×40 2ch padding |
| RESP-REPLAY-006 | 120×40 relative timestamps |
| RESP-REPLAY-007 | 120×40 60ch tool summary |
| RESP-REPLAY-008 | 200×60 sidebar visible |
| RESP-REPLAY-009 | 200×60 4ch padding |
| RESP-REPLAY-010 | Resize 120→80: timestamps gone, scroll preserved |
| RESP-REPLAY-011 | Resize 80→200: sidebar appears, scroll preserved |
| RESP-REPLAY-012 | Resize during search: input adjusts, matches preserved |

### Integration Tests (16)

| ID | Description |
|----|-------------|
| INT-REPLAY-001 | 401 on session fetch → auth error |
| INT-REPLAY-002 | 401 on message fetch → auth error |
| INT-REPLAY-003 | 404 → "Session not found." |
| INT-REPLAY-004 | 500 → error with R-to-retry |
| INT-REPLAY-005 | 429 → pauses, resumes, completes |
| INT-REPLAY-006 | Auto-pagination loads 100 messages |
| INT-REPLAY-007 | Deep-link launches directly |
| INT-REPLAY-008 | Return to list preserves focus |
| INT-REPLAY-009 | Workflow link navigates away |
| INT-REPLAY-010 | Return from workflow preserves scroll |
| INT-REPLAY-011 | Active session → chat redirect |
| INT-REPLAY-012 | Pending session → chat redirect |
| INT-REPLAY-013 | 0 messages → empty state |
| INT-REPLAY-014 | Null timestamps → "—" |
| INT-REPLAY-015 | R retries failed fetch |
| INT-REPLAY-016 | 30s timeout → error state |

### Edge Case Tests (12)

| ID | Description |
|----|-------------|
| EDGE-REPLAY-001 | 255-char title truncated |
| EDGE-REPLAY-002 | 100KB message not truncated |
| EDGE-REPLAY-003 | >100KB message truncated |
| EDGE-REPLAY-004 | 64KB tool input rendered |
| EDGE-REPLAY-005 | >64KB tool input truncated |
| EDGE-REPLAY-006 | Unicode/emoji preserved |
| EDGE-REPLAY-007 | Malformed part → ⚠ + JSON |
| EDGE-REPLAY-008 | 500 messages paginated |
| EDGE-REPLAY-009 | Concurrent resize + scroll |
| EDGE-REPLAY-010 | q during loading → clean unmount |
| EDGE-REPLAY-011 | Empty content → blank + label |
| EDGE-REPLAY-012 | OSC 52 unsupported → silent fail |

All test implementations match the source in `specs/tui/e2e/tui/agents.test.ts` lines 1704–2828. Each test launches a fresh TUI instance via `launchTUI()`, asserts via `waitForText`, `snapshot`, `getLine`, `toMatchSnapshot`, and terminates.

### Golden Files (22)

Stored in `e2e/tui/__snapshots__/`:

`agent-replay-120x40-mixed-messages`, `agent-replay-80x24-compact`, `agent-replay-200x60-with-sidebar`, `agent-replay-header-badge`, `agent-replay-user-message`, `agent-replay-assistant-message`, `agent-replay-system-message`, `agent-replay-tool-collapsed`, `agent-replay-tool-expanded`, `agent-replay-tool-error`, `agent-replay-summary-completed`, `agent-replay-summary-failed`, `agent-replay-summary-timed-out`, `agent-replay-summary-workflow-link`, `agent-replay-empty-session`, `agent-replay-loading`, `agent-replay-error-404`, `agent-replay-search-overlay`, `agent-replay-search-highlight`, `agent-replay-position-indicator`, `agent-replay-breadcrumb-truncated`, `agent-replay-no-color`.

---

## 10. Dependency Map

```
tui-agent-e2e-scaffolding
  └─ provides: e2e/tui/helpers.ts, agents.test.ts skeleton

tui-agent-data-hooks
  └─ provides: useAgentSession, useAgentMessages from @codeplane/ui-core

tui-agent-message-block (Steps 1–2 of this spec)
  └─ provides: MessageBlock, ToolBlock
  └─ depends on: types.ts, colors.ts, formatTimestamp.ts, generateSummary.ts

tui-agent-screen-registry
  └─ provides: ScreenName.AgentSessionReplay entry

tui-agent-session-list
  └─ provides: session list with Enter→replay routing

tui-agent-session-replay (THIS TICKET)
  └─ provides: AgentSessionReplayScreen + SessionSummary + utilities
  └─ depends on: all above
```

If `tui-agent-data-hooks` not yet implemented, hooks import but API calls 404. Tests left failing.

---

## 11. Open Questions

1. **Content windowing:** Should `<scrollbox>` virtualize for 500-message sessions? Decision: implement if memory >50MB.
2. **Search across collapsed tools:** Yes — search all content regardless of expand state; only highlight visible matches.
3. **OSC 52 detection:** No reliable pre-detection. Send sequence, show appropriate hint based on `TERM_PROGRAM`.
4. **Abort in autoPaginate:** May require `@codeplane/ui-core` extension to accept AbortSignal.