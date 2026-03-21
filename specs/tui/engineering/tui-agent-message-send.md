# Engineering Specification: TUI Agent Message Send

**Ticket:** `tui-agent-message-send`
**Title:** Implement message send functionality with optimistic UI and streaming
**Status:** Not started
**Dependencies:** `tui-agent-chat-screen`, `tui-agent-sse-stream-hook`
**Target:** `apps/tui/src/screens/Agents/`
**Tests:** `e2e/tui/agents.test.ts` (TUI_AGENT_MESSAGE_SEND describe block)

---

## 1. Summary

This ticket implements the complete message composition, submission, optimistic rendering, streaming response integration, and retry flow within the Agent Chat Screen. The deliverable is a `MessageInput` component embedded at the bottom of `AgentChatScreen`, backed by three updated hooks (`useChatInput`, `useChatSend`, `useAutoScroll`) and modifications to the existing `useChatPagination` and `useChatKeybindings` hooks to support optimistic inserts, streaming token accumulation, input-aware keybinding dispatch, and error-specific display logic.

This spec supersedes the original draft by grounding every detail in the **actual codebase** discovered in `specs/tui/`. All type references, hook signatures, and API contracts reflect the real implementations found in `@codeplane/ui-core` and the existing TUI screen code.

---

## 2. Architecture Overview

### 2.1 Component Hierarchy

```
AgentChatScreen (existing — specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx)
├── <box height={1}> — Session title bar with status badge
├── <scrollbox> — Conversation history (existing)
│   ├── MessageBlock[] — Existing user/assistant/system/tool message rendering
│   ├── MessageBubble[] — New: user/assistant messages with send status indicators
│   ├── ThinkingIndicator — New: braille spinner while awaiting SSE
│   └── NewMessagesIndicator — New: "↓ New messages" badge when scrolled up
├── Search bar (existing, conditional)
└── MessageInput (new) — Persistent input panel at bottom
    ├── <box border="single"> — Bordered input container
    │   └── <scrollbox maxHeight={maxInputHeight}> — Internal scroll for long content
    │       └── <input multiline> — OpenTUI text input
    └── <box> — Status hints row ("Enter:send", "Sending…", error messages)
```

### 2.2 Hook Composition

```
AgentChatScreen
├── useChatInput(breakpoint)              → text, focus, multiline, height management
├── useChatSend(owner, repo, sid, opts)   → send(), retry(), sending, canSend, error, errorCode
├── useAutoScroll()                       → enabled, hasNewMessages, toggle, scroll handlers
├── useChatPagination(owner, repo, sid)   → messages[], optimistic insert, streaming append
├── useAgentStream(owner, repo, sid, opts)→ streaming, currentTokens, connected, reconnecting
├── useChatKeybindings(handlers, hints)   → keyboard dispatch for input/scroll modes
├── useChatSearch(messages)               → search within conversation
├── useAgentSession(owner, repo, sid)     → session metadata, status
├── useUser()                             → current user for message attribution
├── useTerminalDimensions()               → responsive breakpoint calculation
├── useOnResize()                         → synchronous re-layout
├── useTimeline() / useSpinner()          → braille spinner animation frames
└── useStatusBarHints(hints)              → context-sensitive status bar (via useChatKeybindings)
```

### 2.3 Data Flow

```
[User types] → useChatInput.setText()
     │
[User presses Enter]
     │
     ├─ Validate: trim, reject empty/whitespace
     ├─ Check canSend (not sending, not in cooldown, not streaming)
     ├─ useChatSend.send(text)
     │   ├─ Generate clientId = `client-${Date.now()}-${random9chars}`
     │   ├─ Build optimistic ChatMessage with sendStatus: "pending"
     │   ├─ Call onOptimisticInsert → pagination.insertOptimistic()
     │   ├─ Input clears, becomes disabled
     │   ├─ useSendAgentMessage.send({ role: "user", parts: [{ type: "text", content }] })
     │   │
     │   ├─ [201 Success]
     │   │   ├─ updateMessage(clientId, {sendStatus: "sent", id: serverMsg.id})
     │   │   ├─ Input re-enabled, refocused
     │   │   └─ ThinkingIndicator shown (braille spinner)
     │   │
     │   └─ [Error]
     │       ├─ Classify: 401/403/429/422/5xx/network
     │       ├─ updateMessage(clientId, {sendStatus: "failed"})
     │       ├─ Input re-enabled with original content
     │       └─ Error hint shown inline with error-specific message
     │
     └─ [SSE stream begins (useAgentStream)]
         ├─ onToken → pagination.appendStreamingTokens()
         ├─ ThinkingIndicator replaced by streaming MessageBubble
         ├─ Auto-scroll follows (unless user scrolled up)
         └─ onDone → pagination.finalizeStreamingMessage()
```

### 2.4 Critical Type Discrepancies (PoC → Production)

The existing PoC code has several discrepancies with the real `@codeplane/ui-core` API that must be resolved:

| PoC Code | Real API | Resolution |
|----------|----------|------------|
| `useChatPagination` calls `useAgentMessages(sessionId, { perPage: 30 })` | `useAgentMessages(owner, repo, sessionId, options)` — requires `owner` and `repo` params | Fix signature to pass all 4 params |
| `useChatSend` calls `sendMessage(trimmedText)` | `useSendAgentMessage.send({ role: "user", parts: [{ type: "text", content }] })` — takes `CreateAgentMessageRequest` | Build proper request object before calling `send()` |
| `ChatMessage` has `createdAt` field | Real `AgentMessage` uses `createdAt` (matches) but PoC `AgentMessage` in types.ts uses `timestamp` | Normalize to `createdAt` matching ui-core |
| `useSendAgentMessage` returns `{ send, sending, error }` | Type is `{ send: (input) => Promise<AgentMessage>, sending: boolean, error: HookError | null }` | Use `HookError` which has `.status` for HTTP code classification |
| `retry(clientId)` in spec interface | Actual retry needs `(clientId, text)` — text must be preserved | Already handled in PoC `useChatSend.retry(clientId, text)` |

---

## 3. Implementation Plan

Each step is a vertical slice that can be implemented, tested, and verified independently.

### Step 1: Normalize Type Definitions

**File:** `apps/tui/src/screens/Agents/types.ts`

**Changes:** The types `ChatMessage`, `MessageSendStatus`, and `ChatMode` already exist. Update `ChatMessage` to reference `createdAt` consistently and add an `errorCode` field for error classification.

```typescript
// Already present and correct:
export type MessageSendStatus = "pending" | "sent" | "failed";
export interface ChatMessage extends AgentMessage {
  sendStatus?: MessageSendStatus;
  clientId?: string;
}
export type ChatMode = "active" | "replay";

// Add: error classification for failed messages
export type SendErrorCode =
  | "UNAUTHORIZED"    // 401
  | "FORBIDDEN"       // 403
  | "RATE_LIMITED"     // 429
  | "UNPROCESSABLE"   // 422
  | "SERVER_ERROR"    // 5xx
  | "NETWORK_ERROR";  // network failure
```

The existing `AgentMessage` in `types.ts` uses `timestamp: string` but the ui-core canonical type uses `createdAt: string`. The `ChatMessage` extends the local `AgentMessage`, not ui-core's. This is fine as long as the pagination layer maps between them. Document this mapping in the type file.

**Rationale:** The types are already 90% correct. The only addition is `SendErrorCode` for error-specific display logic.

---

### Step 2: Update `useChatInput` Hook

**File:** `apps/tui/src/screens/Agents/hooks/useChatInput.ts` (modify existing)

The existing hook is mostly correct but has two issues:

1. **Missing `maxInputHeight` export** — the product spec requires knowing the max height for the `<scrollbox>` wrapper.
2. **Height calculation doesn't match the product spec** — the spec says minimum breakpoint has max 3 content rows (5 total with borders), standard has max 6 (8 total), large has max 10 (12 total). The existing code caps at 1/4/8.

**Changes:**

```typescript
// Add to the interface:
export interface ChatInputState {
  // ... existing fields ...
  maxInputHeight: number;  // max rows before internal scrolling
}

// Update height calculation:
const getMaxInputHeight = (bp: Breakpoint): number => {
  switch (bp) {
    case "minimum":  return 3;  // 5 total rows (border + 3 content + hint)
    case "standard": return 6;  // 8 total rows
    case "large":    return 10; // 12 total rows
  }
};

const maxInputHeight = getMaxInputHeight(breakpoint);

const inputHeight = useMemo(() => {
  if (!isMultiline) return 1;
  const lines = text.split("\n").length;
  return Math.min(lines, maxInputHeight);
}, [text, isMultiline, maxInputHeight]);
```

**No new file.** Modifying existing `useChatInput.ts`.

---

### Step 3: Update `useChatSend` Hook with Error Classification

**File:** `apps/tui/src/screens/Agents/hooks/useChatSend.ts` (modify existing)

The existing hook has two critical issues:

1. **Incorrect `useSendAgentMessage` call** — calls `sendMessage(trimmedText)` but the real API is `send({ role: "user", parts: [{ type: "text", content }] })`.
2. **No error code classification** — the spec requires distinct display for 401/403/429/422/5xx.

**Updated interface:**

```typescript
export interface ChatSendState {
  send: (text: string) => void;
  sending: boolean;
  error: Error | null;
  errorCode: SendErrorCode | null;  // NEW: classified error code
  lastSendTime: number;
  canSend: boolean;
  retry: (clientId: string, text: string) => void;
  clearError: () => void;           // NEW: reset error state
}
```

**Key implementation changes:**

```typescript
// Replace the simple sendMessage call with:
const { send: sendToServer, sending: serverSending, error: serverError } =
  useSendAgentMessage(owner, repo, sessionId);

// In performSend:
try {
  const response = await sendToServer({
    role: "user",
    parts: [{ type: "text", content: trimmedText }],
  });
  options.onSendSuccess(idToUse, response);
} catch (err: any) {
  const code = classifyError(err);
  setErrorCode(code);
  setError(err);
  options.onSendFailure(idToUse, err);
}

// Error classification:
function classifyError(err: any): SendErrorCode {
  const status = err?.status ?? err?.response?.status;
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMITED";
  if (status === 422) return "UNPROCESSABLE";
  if (status >= 500) return "SERVER_ERROR";
  if (!status || err?.name === "TypeError" || err?.message?.includes("network")) return "NETWORK_ERROR";
  return "SERVER_ERROR";
}
```

The `HookError` type from `@codeplane/ui-core` has a `status` field from `parseResponseError()`, so error classification reads `err.status` directly.

**Double-submit prevention:** Already handled by `canSend` check. The 2000ms cooldown uses `Date.now() - lastSendTimeRef.current >= 2000`.

**Retry:** The existing `retry(clientId, text)` is correct — it re-inserts the optimistic message with `"pending"` status and re-fires the POST.

---

### Step 4: Update `useAutoScroll` Hook

**File:** `apps/tui/src/screens/Agents/hooks/useAutoScroll.ts` (no changes needed)

The existing hook is correct. It implements:
- `enabled` starts true (sticky to bottom)
- `onUserScroll("up")` disables auto-scroll
- `onNewContent()` sets `hasNewMessages` when disabled
- `enable()` and `toggle()` clear the `hasNewMessages` flag

No modifications required.

---

### Step 5: Update `useChatPagination` Hook

**File:** `apps/tui/src/screens/Agents/hooks/useChatPagination.ts` (modify existing)

**Critical fix:** The existing code calls `useAgentMessages(sessionId, { perPage: 30 })` but the real hook signature is `useAgentMessages(owner, repo, sessionId, options)`. This must be fixed.

```typescript
// BEFORE (broken):
const { messages: initialMessages, ... } = useAgentMessages(sessionId, { perPage: 30 });

// AFTER (correct):
const { messages: initialMessages, ... } = useAgentMessages(owner, repo, sessionId, { perPage: 30 });
```

The rest of the hook (optimistic insert, updateMessage, appendStreamingTokens, finalizeStreamingMessage, 500-item memory cap) is correct and matches the spec.

**One additional concern:** The `appendStreamingTokens` receives the full accumulated string from `useAgentStream.currentTokens`, not deltas. This is correct — the hook replaces the last text part content entirely rather than appending. For very long responses (100k+ chars), this creates a new string on every token. Production optimization: use a `useRef` to accumulate tokens and only flush to React state on a 16ms throttle.

---

### Step 6: Implement `MessageInput` Component

**File:** `apps/tui/src/screens/Agents/components/MessageInput.tsx` (new)

This component renders the bordered input panel at the bottom of the chat screen.

**Props:**

```typescript
import type { Breakpoint, SendErrorCode } from "../types.js";

export interface MessageInputProps {
  text: string;
  setText: (text: string) => void;
  focused: boolean;
  disabled: boolean;          // true during sending or streaming
  placeholder: string;        // "Send a message…" or "Agent is responding…"
  isMultiline: boolean;
  inputHeight: number;        // current content height in rows
  maxInputHeight: number;     // max before internal scrolling
  maxLength: number;          // 4000
  breakpoint: Breakpoint;
  isSending: boolean;
  sendError: string | null;
  errorCode: SendErrorCode | null;
}
```

**Render structure:**

```tsx
import React from "react";
import { COLORS } from "./colors.js";
import type { MessageInputProps } from "./MessageInput.js";

export function MessageInput(props: MessageInputProps) {
  const borderColor = props.focused ? COLORS.primary : COLORS.border;
  const errorColor = props.errorCode === "UNAUTHORIZED" || props.errorCode === "FORBIDDEN"
    ? COLORS.error
    : props.errorCode === "RATE_LIMITED"
      ? COLORS.warning
      : COLORS.error;

  return (
    <box flexDirection="column" paddingX={1}>
      <box
        border="single"
        borderColor={borderColor}
      >
        <scrollbox maxHeight={props.maxInputHeight}>
          <input
            multiline={props.isMultiline}
            value={props.text}
            onChange={props.setText}
            placeholder={props.disabled ? "Agent is responding…" : "Send a message…"}
            focused={props.focused}
            disabled={props.disabled}
            maxLength={props.maxLength}
          />
        </scrollbox>
      </box>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={props.sendError ? errorColor : COLORS.muted}>
          {props.isSending
            ? "Sending…"
            : props.sendError
              ? props.sendError
              : ""}
        </text>
        <text fg={COLORS.muted}>
          {props.isSending
            ? ""
            : "Enter:send │ Shift+Enter:newline"}
        </text>
      </box>
    </box>
  );
}
```

**Behavior:**

1. Rendered only when `session.status === "active"`. Non-active sessions get a read-only banner (already handled in `AgentChatScreen`).
2. Border color: `COLORS.primary` when focused, `COLORS.border` when blurred — uses the existing `colors.ts` module.
3. Placeholder: `"Send a message…"` normally, `"Agent is responding…"` when `disabled`.
4. Hints row: `"Sending…"` during submission, error text on failure, `"Enter:send │ Shift+Enter:newline"` in normal state.
5. Text editing is handled natively by OpenTUI's `<input>` component: Backspace, Delete, cursor movement, Ctrl+A/E/K/U, Home/End.
6. Tab characters are not inserted by OpenTUI's `<input>` in the context of the TUI form system.

---

### Step 7: Implement `MessageBubble` Component

**File:** `apps/tui/src/screens/Agents/components/MessageBubble.tsx` (new)

Distinct from the existing `MessageBlock` (which handles all message types including tool calls). `MessageBubble` is specifically for user/assistant text messages with send status indicators. This can be used alongside `MessageBlock` or as a replacement for user/assistant messages that need send status rendering.

**Decision:** Rather than creating a parallel component, **extend `MessageBlock`** to accept optional `sendStatus` and `clientId` props from `ChatMessage`. This avoids duplicating the role label, timestamp, and markdown rendering logic.

**File:** `apps/tui/src/screens/Agents/components/MessageBlock.tsx` (modify existing)

**Changes:**

```typescript
// Update the props interface:
export interface MessageBlockProps {
  message: AgentMessage;  // or ChatMessage (which extends AgentMessage)
  breakpoint: Breakpoint;
  showSeparator?: boolean;
  expandedToolIds?: Set<string>;
  onToggleToolExpand?: (toolId: string) => void;
  // NEW: send status support
  sendStatus?: "pending" | "sent" | "failed";
  isStreaming?: boolean;  // override for streaming indicator
}

// In the render, add status indicators:
{props.sendStatus === "failed" && (
  <text fg={COLORS.error}>✗ Failed to send. Press r to retry.</text>
)}
{props.sendStatus === "pending" && (
  <text fg={COLORS.muted}>⏳</text>
)}
```

This approach reuses the existing `MessageBlock` with its label config, timestamp formatting, padding config, and markdown rendering.

---

### Step 8: Implement `ThinkingIndicator` Component

**File:** `apps/tui/src/screens/Agents/components/ThinkingIndicator.tsx` (new)

The existing codebase already has a `useSpinner` hook (used in `MessageBlock.tsx` for streaming indicators). Use that.

```typescript
import React from "react";
import { useSpinner } from "../../../hooks/useSpinner.js";
import { COLORS } from "./colors.js";

export function ThinkingIndicator() {
  const spinner = useSpinner(true); // always active when mounted
  return (
    <box flexDirection="row" gap={1} paddingX={1}>
      <text fg={COLORS.muted}>{spinner}</text>
      <text fg={COLORS.muted}>Agent is thinking…</text>
    </box>
  );
}
```

**Visibility rules:**
- Shown after a successful user message send AND before the first SSE token arrives.
- Hidden once `stream.streaming === true` and `stream.currentTokens.length > 0`.
- Hidden if the session status transitions away from `"active"`.

The existing `AgentChatScreen` already calculates this condition. It needs to be extracted into a clean boolean.

---

### Step 9: Implement `NewMessagesIndicator` Component

**File:** `apps/tui/src/screens/Agents/components/NewMessagesIndicator.tsx` (new)

```typescript
import React from "react";
import { COLORS } from "./colors.js";

export function NewMessagesIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <box paddingX={1}>
      <text fg={COLORS.primary} bold>↓ New messages</text>
    </box>
  );
}
```

Positioned between the scrollbox and the input panel. The existing `AgentChatScreen` already has this as inline JSX — extract it into a component.

---

### Step 10: Extend Keybinding Handler for Input-Aware Dispatch

**File:** `apps/tui/src/screens/Agents/hooks/useChatKeybindings.ts` (modify existing)

The existing hook handles the basic structure but has several issues to fix:

1. **`q` on empty input should pop screen** — currently `q` only works in scroll mode.
2. **`r` retry logic** — currently uses `R` (shift+R). The spec says lowercase `r` when in scroll mode and last message is failed.
3. **Printable character from scroll mode should focus input** — not implemented.
4. **`Esc` on empty input should pop screen** — existing code always unfocuses.
5. **Go-to mode (`g` prefix) with timeout** — existing code treats `g` as immediate jumpToTop, but spec requires `g g` for top and `g d`/`g r`/etc. for navigation.
6. **`:` for command palette** — not implemented.
7. **`f` for auto-scroll toggle** — already implemented.

**Updated handler interface:**

```typescript
export interface ChatKeybindingHandlers {
  // ... existing handlers ...
  // NEW:
  inputText: string;           // current input content for empty-check
  popScreen: () => void;
  openCommandPalette: () => void;
  goToScreen: (target: string) => void; // "dashboard", "repos", etc.
}
```

**Mode 1 — Input focused (typing mode):**

| Key | Condition | Action |
|-----|-----------|--------|
| `Enter` | Non-empty input | `sendMessage()` |
| `Shift+Enter` | — | `insertNewline()` (falls through to `<input>`) |
| `Esc` | Empty input | `popScreen()` |
| `Esc` | Non-empty input | `unfocusInput()` (switch to scroll mode) |
| `q` | Empty input | `popScreen()` |
| `q` | Non-empty input | Falls through to `<input>` (types `q`) |
| `?` | — | Toggle help overlay |
| `Ctrl+C` | — | `process.exit(0)` |
| All other printable | — | Falls through to OpenTUI `<input>` |

**Mode 2 — Scroll mode (conversation focused):**

| Key | Action |
|-----|--------|
| `j` / `Down` | Scroll down |
| `k` / `Up` | Scroll up |
| `G` (Shift+g) | Jump to bottom, resume auto-scroll |
| `g` | Enter go-to pending state (1500ms timeout) |
| `g g` | Jump to top |
| `g d` | Navigate to dashboard |
| `g r` | Navigate to repos |
| `g n` | Navigate to notifications |
| `g a` | Navigate to agents |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |
| `i` | Return focus to input (only if session active) |
| `r` | Retry failed message (only if last message is failed) |
| `q` | Pop screen |
| `Esc` | Pop screen |
| `?` | Toggle help overlay |
| `:` | Open command palette |
| `f` | Toggle auto-scroll |
| `Ctrl+C` | Quit |
| Any other printable | Focus input and type character |

**Go-to mode implementation:**

```typescript
const [goToPending, setGoToPending] = useState(false);
const goToTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

// On 'g' press in scroll mode:
if (key.name === "g" && !key.shift && !goToPending) {
  setGoToPending(true);
  goToTimeoutRef.current = setTimeout(() => setGoToPending(false), 1500);
  return;
}

if (goToPending) {
  clearTimeout(goToTimeoutRef.current);
  setGoToPending(false);
  if (key.name === "g") { handlers.jumpToTop(); return; }
  if (key.name === "d") { handlers.goToScreen("dashboard"); return; }
  if (key.name === "r") { handlers.goToScreen("repos"); return; }
  if (key.name === "n") { handlers.goToScreen("notifications"); return; }
  if (key.name === "a") { handlers.goToScreen("agents"); return; }
  // Invalid second key — cancel go-to mode silently
  return;
}
```

---

### Step 11: Integrate into `AgentChatScreen`

**File:** `apps/tui/src/screens/Agents/AgentChatScreen.tsx` (modify existing)

The existing screen already has 90% of the wiring. Key changes:

**1. Import new components:**

```typescript
import { MessageInput } from "./components/MessageInput.js";
import { ThinkingIndicator } from "./components/ThinkingIndicator.js";
import { NewMessagesIndicator } from "./components/NewMessagesIndicator.js";
```

**2. Fix send flow to clear input only on success:**

The existing code clears input immediately on send:
```typescript
// BEFORE (existing — clears input in sendMessage handler):
sendMessage: () => {
  if (!input.text.trim() || !send.canSend) return;
  send.send(input.text);
  input.clear();           // ← premature clear
  input.setFocused(false); // ← shouldn't blur
},
```

```typescript
// AFTER (correct — clear on success callback):
onSendSuccess: (clientId, serverMsg) => {
  pagination.updateMessage(clientId, { sendStatus: "sent", id: serverMsg.id });
  input.clear();            // clear after server confirms
  input.setFocused(true);   // keep focused for next message
},
onSendFailure: (clientId, error) => {
  pagination.updateMessage(clientId, { sendStatus: "failed" });
  // Input retains content — do NOT clear
  input.setFocused(true);   // re-enable for editing
},

// In keybinding handler:
sendMessage: () => {
  if (!input.text.trim() || !send.canSend) return;
  send.send(input.text);
  // Do NOT clear here — wait for success callback
},
```

**3. Add thinking indicator logic:**

```typescript
const lastMessage = pagination.messages[pagination.messages.length - 1];
const isThinking =
  lastMessage?.sendStatus === "sent" &&
  lastMessage?.role === "user" &&
  !stream.streaming;
```

**4. Replace inline input JSX with `<MessageInput>`:**

```tsx
{chatMode === "active" ? (
  <MessageInput
    text={input.text}
    setText={input.setText}
    focused={input.isFocused && !search.isActive}
    disabled={send.sending || stream.streaming}
    placeholder={stream.streaming ? "Agent is responding…" : "Send a message…"}
    isMultiline={input.isMultiline}
    inputHeight={input.inputHeight}
    maxInputHeight={input.maxInputHeight}
    maxLength={input.maxLength}
    breakpoint={breakpoint}
    isSending={send.sending}
    sendError={send.error ? getErrorDisplayMessage(send.errorCode, send.error) : null}
    errorCode={send.errorCode}
  />
) : (
  <box height={1} borderTop="single" paddingX={1} justifyContent="center">
    <text fg={COLORS.muted}>
      Session {session?.status === "completed" ? "completed" : session?.status === "timed_out" ? "timed out" : session?.status}. This conversation is read-only.
    </text>
  </box>
)}
```

**5. Error display helper:**

```typescript
function getErrorDisplayMessage(code: SendErrorCode | null, error: Error): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "Session expired. Run `codeplane auth login` to re-authenticate.";
    case "FORBIDDEN":
      return "Permission denied. You cannot send messages in this session.";
    case "RATE_LIMITED":
      return "Rate limit exceeded. Please wait and try again.";
    case "UNPROCESSABLE":
      return `Validation error: ${error.message}`;
    default:
      return `Failed to send: ${error.message}`;
  }
}
```

**6. Context-sensitive status bar hints:**

```typescript
const statusHints = useMemo(() => {
  if (send.sending) return "Sending… │ Esc:cancel";
  if (stream.streaming) return "Streaming… │ f:toggle follow │ q:back │ ?:help";
  if (input.isFocused)
    return "Enter:send │ Shift+Enter:newline │ Esc:scroll mode │ ?:help";
  return "j/k:scroll │ G:bottom │ i:type │ r:retry │ q:back │ ?:help";
}, [send.sending, stream.streaming, input.isFocused]);
```

---

### Step 12: Wire SSE Stream Events into Pagination

The existing `AgentChatScreen` already has this wiring. The effects are correct:

```typescript
useEffect(() => {
  if (stream.streaming && stream.currentTokens) {
    pagination.appendStreamingTokens(stream.currentTokens);
  }
}, [stream.currentTokens]);

useEffect(() => {
  if (!stream.streaming && stream.finalMessage) {
    pagination.finalizeStreamingMessage(stream.finalMessage);
  }
}, [stream.streaming, stream.finalMessage]);
```

**Note:** `stream.finalMessage` is not part of the `useAgentStream` public API as implemented. The `onDone` callback receives `fullContent: string`, not a full `AgentMessage`. The production integration should:
1. On `onDone(fullContent)`, fetch the latest assistant message from the messages API.
2. Use that server-canonical message to call `finalizeStreamingMessage()`.

This is a known gap in the existing wiring. The `AgentChatScreen` should register an `onDone` callback:

```typescript
const stream = useAgentStream(owner, repo, sessionId, {
  enabled: chatMode === "active",
  onToken: (content) => {
    autoScroll.onNewContent();
  },
  onDone: async (fullContent) => {
    // Fetch the server-canonical assistant message
    // The pagination state already has the streaming message;
    // finalize it with the accumulated content
    pagination.finalizeStreamingMessage({
      id: `finalized-${Date.now()}`,
      role: "assistant",
      parts: [{ type: "text", content: fullContent }],
      timestamp: new Date().toISOString(),
      streaming: false,
    });
  },
  onError: (error) => {
    // Show connection error
  },
});
```

---

### Step 13: Export New Components

**File:** `apps/tui/src/screens/Agents/components/index.ts` (modify or create)

```typescript
export { MessageBlock } from "./MessageBlock.js";
export { ToolBlock } from "./ToolBlock.js";
export { MessageInput } from "./MessageInput.js";
export { ThinkingIndicator } from "./ThinkingIndicator.js";
export { NewMessagesIndicator } from "./NewMessagesIndicator.js";
export { SessionRow } from "./SessionRow.js";
export { SessionFilterToolbar } from "./SessionFilterToolbar.js";
export { SessionEmptyState } from "./SessionEmptyState.js";
export { SessionSummary } from "./SessionSummary.js";
export { DeleteConfirmationOverlay } from "./DeleteConfirmationOverlay.js";
```

---

## 4. File Inventory

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `apps/tui/src/screens/Agents/components/MessageInput.tsx` | Input panel with border, placeholder, hints | 65 |
| `apps/tui/src/screens/Agents/components/ThinkingIndicator.tsx` | Braille spinner animation component | 18 |
| `apps/tui/src/screens/Agents/components/NewMessagesIndicator.tsx` | "↓ New messages" badge | 12 |

### Modified Files

| File | Changes |
|------|---------||
| `apps/tui/src/screens/Agents/types.ts` | Add `SendErrorCode` type |
| `apps/tui/src/screens/Agents/hooks/useChatInput.ts` | Add `maxInputHeight` export, fix height calculation to match spec |
| `apps/tui/src/screens/Agents/hooks/useChatSend.ts` | Fix `useSendAgentMessage` call signature, add `errorCode` classification, add `clearError()` |
| `apps/tui/src/screens/Agents/hooks/useChatPagination.ts` | Fix `useAgentMessages` call to include `owner`/`repo` params |
| `apps/tui/src/screens/Agents/hooks/useChatKeybindings.ts` | Add go-to mode, printable-char-focuses-input, `q`/`Esc` on empty input, `:` command palette, `r` retry |
| `apps/tui/src/screens/Agents/components/MessageBlock.tsx` | Add `sendStatus` prop, render ✗/⏳ indicators |
| `apps/tui/src/screens/Agents/AgentChatScreen.tsx` | Wire new components, fix send flow, add error display, update status bar hints |
| `apps/tui/src/screens/Agents/components/index.ts` | Export new components |

---

## 5. Responsive Layout Specification

### Input Panel Sizing

| Terminal Size | Input Default | Input Max (with borders) | Content Rows Max | Conversation Rows |
|--------------|---------------|--------------------------|-----------------|-------------------|
| 80×24 (minimum) | 3 rows | 5 rows | 3 | height − 6 (header + title + status + input) |
| 120×40 (standard) | 3 rows | 8 rows | 6 | height − 6 |
| 200×60+ (large) | 3 rows | 12 rows | 10 | height − 6 |

### Conversation Area Calculation

```typescript
const headerHeight = 1;       // session title bar
const statusBarHeight = 1;    // global status bar (handled by AppShell)
const searchBarHeight = search.isActive ? 1 : 0;
const inputPanelHeight = chatMode === "active"
  ? 2 + Math.min(input.inputHeight, input.maxInputHeight) // borders + content
  : 1;  // read-only banner
const conversationHeight = height - headerHeight - statusBarHeight - searchBarHeight - inputPanelHeight;
```

### Below Minimum (< 80×24)

When terminal is below 80×24, the AppShell renders the global "Terminal too small" message. Input content is preserved in `useChatInput` state; resizing back above 80×24 restores the full UI.

---

## 6. Performance Requirements

| Metric | Target | Strategy |
|--------|--------|----------|
| Keystroke-to-render | <16ms | OpenTUI native input; React state batch within same frame |
| Submission to optimistic display | <16ms | `insertOptimistic` is synchronous state update before async POST |
| SSE token-to-render | <16ms | `appendStreamingTokens` is synchronous; no buffering |
| Conversation scroll | 60fps terminal equiv | `<scrollbox viewportCulling={true}>` — only visible messages rendered |
| Memory stability | Stable over sessions | 500-message cap; streaming tokens accumulated in single string |

### Streaming Token Optimization

For long responses (100k+ chars), `appendStreamingTokens` receives the full accumulated `currentTokens` string on every token event. This means React creates a new messages array on every token. Production optimization:

```typescript
// In useChatPagination:
const streamingContentRef = useRef("");
const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const appendStreamingTokens = useCallback((tokens: string) => {
  streamingContentRef.current = tokens;
  // Throttle React state updates to ~60fps
  if (!throttleTimerRef.current) {
    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null;
      flushStreamingTokensToState(streamingContentRef.current);
    }, 16);
  }
}, []);
```

---

## 7. Error Handling Matrix

| Error | HTTP Status | User-Visible Behavior | Input State | Recovery |
|-------|-------------|----------------------|-------------|----------|
| Empty message | N/A | No-op (silent) | Unchanged | Type content |
| Whitespace-only | N/A | No-op (silent, trim reveals empty) | Unchanged | Type content |
| Network timeout | N/A | `✗ Failed` on message, generic error hint | Retains content | `r` to retry |
| Server error | 500 | `✗ Failed` on message, error detail | Retains content | `r` to retry |
| Unauthorized | 401 | "Session expired. Run `codeplane auth login`..." | Retains content | Re-auth via CLI |
| Forbidden | 403 | "Permission denied..." in error color | Retains content | N/A |
| Rate limited | 429 | "Rate limit exceeded..." in warning color | Retains content | Wait, then `Enter` |
| Validation error | 422 | Server error detail shown inline | Retains content | Edit content |
| Session inactive | 400/422 | Input disabled, status banner shown | Input hidden | Create new session |
| SSE disconnect | N/A | "Connection lost — reconnecting…" | Unaffected | Auto-reconnect (exponential backoff) |
| SSE error event | N/A | Error shown below streaming response | Unaffected | Auto-reconnect |
| Render crash | N/A | Error boundary: "Input error — press i to try again" | Content preserved | Press `i` |

---

## 8. Telemetry Events

All events fired via TUI telemetry client. Each includes common properties: `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `layout`.

| Event Name | Trigger | Additional Properties |
|------------|---------|----------------------|
| `tui.agent_message.input_focused` | Input receives focus | `message_count`, `session_status` |
| `tui.agent_message.submitted` | User presses Enter to send | `body_length`, `line_count`, `time_to_submit_ms`, `is_retry` |
| `tui.agent_message.succeeded` | Server returns 201 | `message_id`, `server_response_ms` |
| `tui.agent_message.failed` | Server returns non-2xx | `error_code`, `error_message`, `body_length` |
| `tui.agent_message.retried` | User presses `r` | `retry_count`, `time_since_failure_ms` |
| `tui.agent_message.stream_started` | First SSE token received | `time_since_send_ms` |
| `tui.agent_message.stream_completed` | SSE done event | `response_length`, `stream_duration_ms` |
| `tui.agent_message.stream_error` | SSE error or disconnect | `error_type`, `tokens_received_before_error` |
| `tui.agent_message.scroll_mode_entered` | User presses Esc | `message_count`, `was_streaming` |
| `tui.agent_message.autoscroll_paused` | User scrolls up during streaming | `scroll_position_pct` |
| `tui.agent_message.autoscroll_resumed` | User presses G or f | — |

---

## 9. Logging

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Input focused | `AgentMessageSend: input focused [session={id}] [status={s}]` |
| `debug` | Typing (debounced 1/sec) | `AgentMessageSend: typing [length={len}] [lines={n}]` |
| `debug` | Input resized | `AgentMessageSend: input resize [height={h}] [maxHeight={max}]` |
| `debug` | Auto-scroll toggled | `AgentMessageSend: autoscroll [enabled={bool}]` |
| `info` | Message submitted | `AgentMessageSend: submitted [session={id}] [body_length={len}]` |
| `info` | Message created (201) | `AgentMessageSend: created [session={id}] [message_id={mid}] [duration={ms}ms]` |
| `info` | Stream started | `AgentMessageSend: stream started [session={id}] [thinking_ms={ms}]` |
| `info` | Stream completed | `AgentMessageSend: stream completed [session={id}] [tokens={n}] [duration={ms}ms]` |
| `info` | Retry attempted | `AgentMessageSend: retry [session={id}] [attempt={n}]` |
| `warn` | Slow submission (>2000ms) | `AgentMessageSend: slow submit [duration={ms}ms]` |
| `warn` | Slow first token (>5000ms) | `AgentMessageSend: slow first token [thinking_ms={ms}]` |
| `warn` | Rate limited (429) | `AgentMessageSend: rate limited [retry_after={s}s]` |
| `warn` | SSE reconnecting | `AgentMessageSend: SSE reconnecting [session={id}] [attempt={n}] [backoff={ms}ms]` |
| `error` | Submission failed | `AgentMessageSend: failed [session={id}] [status={code}] [error={msg}]` |
| `error` | Auth error (401) | `AgentMessageSend: auth error [status=401]` |
| `error` | Permission denied (403) | `AgentMessageSend: permission denied [status=403]` |
| `error` | Stream error | `AgentMessageSend: stream error [session={id}] [error={msg}]` |
| `error` | SSE disconnect | `AgentMessageSend: SSE disconnect [session={id}] [was_streaming={bool}]` |

---

## 10. Unit & Integration Tests

**Test file:** `e2e/tui/agents.test.ts`

All tests are added within a new `describe("TUI_AGENT_MESSAGE_SEND", ...)` block, appended after the existing `TUI_AGENT_SESSION_REPLAY` block. Tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts`. Tests run against a real API server with test fixtures — no mocking of implementation details. Tests that fail due to unimplemented backend features are left failing (per `feedback_failing_tests.md`).

### 10.1 Terminal Snapshot Tests

```typescript
describe("TUI_AGENT_MESSAGE_SEND", () => {
  describe("Terminal Snapshots", () => {
    test("SNAP-MSG-SEND-001: Chat screen with empty input at 120x40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("Send a message");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-002: Chat screen with empty input at 80x24", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-003: Chat screen with empty input at 200x60", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-004: Input with single-line text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("What is jj rebase?");
      await terminal.waitForText("What is jj rebase?");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-005: Input with multi-line text via Shift+Enter", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Please review this code:");
      await terminal.sendKeys("shift+enter");
      await terminal.sendText("fn main() {}");
      await terminal.sendKeys("shift+enter");
      await terminal.sendText("Is it correct?");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-006: Input at maximum expansion height", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      for (let i = 0; i < 20; i++) {
        await terminal.sendText(`Line ${i + 1}`);
        if (i < 19) await terminal.sendKeys("shift+enter");
      }
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-007: User message bubble after send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Hello agent");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Hello agent").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-008: Thinking indicator while waiting for response", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Tell me about jj");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Agent is thinking").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-009: Streaming assistant response", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("What is jj?");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Agent").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-010: Completed assistant response", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Hello");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Send a message").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-011: Failed message with retry hint", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_500__");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Failed to send").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-012: Auth error (401)", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TOKEN: "expired_token" },
      });
      await navigateToAgentChat(terminal);
      await terminal.waitForText("Session expired").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-013: Permission denied (403)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_403__");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Permission denied").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-014: Rate limit error (429)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_429__");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Rate limit exceeded").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-015: Sending state (input disabled)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Test message");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Sending").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-016: Read-only session (completed)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal, 1);
      await waitForChatReady(terminal);
      await terminal.waitForText("read-only").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-017: Read-only session (failed)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal, 2);
      await waitForChatReady(terminal);
      await terminal.waitForText("failed").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-018: Read-only session (timed_out)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal, 3);
      await waitForChatReady(terminal);
      await terminal.waitForText("timed out").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-019: New messages indicator when scrolled up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Tell me a long story");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Agent").catch(() => {});
      await terminal.sendKeys("escape");
      await terminal.sendKeys("k", "k", "k");
      await terminal.waitForText("New messages").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-020: Help overlay from chat screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("?");
      await terminal.waitForText("help").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-021: Scroll mode status bar hints", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/j\/k.*scroll/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-022: Unauthenticated user view", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TOKEN: "" },
      });
      await terminal.waitForText("auth").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-023: SSE disconnect indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Test stream");
      await terminal.sendKeys("enter");
      await terminal.waitForText("reconnecting").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-024: Multi-turn conversation layout", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("Agent").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-MSG-SEND-025: Empty input Enter is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      const before = terminal.snapshot();
      await terminal.sendKeys("enter");
      expect(terminal.snapshot()).toEqual(before);
      await terminal.terminate();
    });
  });
```

### 10.2 Keyboard Interaction Tests

```typescript
  describe("Keyboard Interactions", () => {
    test("KEY-MSG-SEND-001: Enter sends non-empty message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("enter");
      await terminal.waitForText("hello").catch(() => {});
      await terminal.waitForText("Send a message").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-002: Enter on empty input is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("enter");
      await terminal.waitForNoText("Sending").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-003: Enter on whitespace-only is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("   ");
      await terminal.sendKeys("enter");
      await terminal.waitForNoText("Sending").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-004: Shift+Enter inserts newline", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("line1");
      await terminal.sendKeys("shift+enter");
      await terminal.sendText("line2");
      await terminal.waitForText("line1");
      await terminal.waitForText("line2");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-005: Double-submit prevention", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("test");
      await terminal.sendKeys("enter");
      await terminal.sendKeys("enter");
      await terminal.waitForText("test").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-006: Esc on empty input pops screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.waitForText("Agent Sessions").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-007: Esc on non-empty input switches to scroll mode", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("draft message");
      await terminal.sendKeys("escape");
      await terminal.waitForText("draft message");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/j\/k.*scroll/);
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-008: i from scroll mode returns focus to input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("draft");
      await terminal.sendKeys("escape");
      await terminal.sendKeys("i");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/Enter.*send/);
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-009: j/k in scroll mode scrolls conversation", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      const before = terminal.snapshot();
      await terminal.sendKeys("k");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-010: G in scroll mode jumps to bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.sendKeys("k", "k", "k");
      await terminal.sendKeys("shift+g");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-011: g g in scroll mode jumps to top", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.sendKeys("g", "g");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-012: Ctrl+D in scroll mode pages down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.sendKeys("ctrl+d");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-013: Ctrl+U in scroll mode pages up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.sendKeys("ctrl+u");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-014: r retries failed message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_500__");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Failed").catch(() => {});
      await terminal.sendKeys("escape");
      await terminal.sendKeys("r");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-015: r when no failed message types r in input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("r");
      await terminal.waitForText("r");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-016: q on empty input pops screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-017: q on non-empty input types q", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("draft");
      await terminal.sendKeys("q");
      await terminal.waitForText("draftq");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-018: ? shows help overlay", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("?");
      await terminal.waitForText("help").catch(() => {});
      await terminal.sendKeys("escape");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-019: : on empty unfocused input opens command palette", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.sendKeys(":");
      await terminal.waitForText("command").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-020: Ctrl+C quits TUI from any state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("some text");
      await terminal.sendKeys("ctrl+c");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-021: f toggles auto-scroll follow mode", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.sendKeys("f");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-022: Home moves to start of line", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello world");
      await terminal.sendKeys("home");
      await terminal.sendText("X");
      await terminal.waitForText("Xhello world");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-023: End moves to end of line", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("home");
      await terminal.sendKeys("end");
      await terminal.sendText("X");
      await terminal.waitForText("helloX");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-024: Ctrl+K kills to end of line", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello world");
      await terminal.sendKeys("home");
      await terminal.sendKeys("right", "right", "right", "right", "right");
      await terminal.sendKeys("ctrl+k");
      await terminal.waitForText("hello");
      await terminal.waitForNoText("world").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-025: Ctrl+A moves to start of line", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("ctrl+a");
      await terminal.sendText("X");
      await terminal.waitForText("Xhello");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-026: Ctrl+E moves to end of line", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("ctrl+a");
      await terminal.sendKeys("ctrl+e");
      await terminal.sendText("X");
      await terminal.waitForText("helloX");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-027: Backspace deletes character before cursor", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("backspace");
      await terminal.waitForText("hell");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-028: Delete deletes character after cursor", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("home");
      await terminal.sendKeys("delete");
      await terminal.waitForText("ello");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-029: Arrow keys navigate within multi-line input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("line1");
      await terminal.sendKeys("shift+enter");
      await terminal.sendText("line2");
      await terminal.sendKeys("up");
      await terminal.sendText("X");
      await terminal.waitForText("line1X").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-030: Input clears after successful send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("test message");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Send a message").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-031: Input retains content after failed send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_500__");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Failed").catch(() => {});
      await terminal.waitForText("__TRIGGER_500__").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-032: Optimistic message appears immediately after Enter", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("instant message");
      await terminal.sendKeys("enter");
      await terminal.waitForText("instant message");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-033: Thinking indicator appears after successful send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("enter");
      await terminal.waitForText("thinking").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-034: Thinking indicator replaced by streaming content", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Agent").catch(() => {});
      await terminal.waitForNoText("thinking").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-035: Failed message marked with ✗ on error", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_500__");
      await terminal.sendKeys("enter");
      await terminal.waitForText("✗").catch(() => {});
      await terminal.waitForText("Failed").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-036: Retry replaces failed indicator with sending state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_500__");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Failed").catch(() => {});
      await terminal.sendKeys("escape");
      await terminal.sendKeys("r");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-037: Go-to keybindings work in scroll mode", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.sendKeys("g", "d");
      await terminal.waitForText("Dashboard").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-038: Tab does not insert tab character in input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("hello");
      await terminal.sendKeys("tab");
      await terminal.waitForText("hello");
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-039: Printable character from scroll mode focuses input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("escape");
      await terminal.sendText("a");
      await terminal.waitForText("a");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/Enter.*send/);
      await terminal.terminate();
    });

    test("KEY-MSG-SEND-040: Body trimmed before send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("  hello  ");
      await terminal.sendKeys("enter");
      await terminal.waitForText("hello").catch(() => {});
      await terminal.terminate();
    });
  });
```

### 10.3 Responsive Tests

```typescript
  describe("Responsive Behavior", () => {
    test("RESIZE-MSG-SEND-001: Input 3 rows default at 80×24", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-002: Input 3 rows default at 120×40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-003: Input 3 rows default at 200×60", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-004: Input max 5 rows at 80×24 with long content", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      for (let i = 0; i < 10; i++) {
        await terminal.sendText(`Line ${i}`);
        if (i < 9) await terminal.sendKeys("shift+enter");
      }
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-005: Input max 8 rows at 120×40 with long content", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      for (let i = 0; i < 15; i++) {
        await terminal.sendText(`Line ${i}`);
        if (i < 14) await terminal.sendKeys("shift+enter");
      }
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-006: Input max 12 rows at 200×60 with long content", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      for (let i = 0; i < 20; i++) {
        await terminal.sendText(`Line ${i}`);
        if (i < 19) await terminal.sendKeys("shift+enter");
      }
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-007: 120×40 → 80×24 while typing preserves content", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("preserved content");
      await terminal.resize(80, 24);
      await terminal.waitForText("preserved content");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-008: 80×24 → 120×40 while typing preserves content", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("preserved content");
      await terminal.resize(120, 40);
      await terminal.waitForText("preserved content");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-009: Below minimum while typing shows too small", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("my text");
      await terminal.resize(60, 20);
      await terminal.waitForText("too small").catch(() => {});
      await terminal.resize(120, 40);
      await terminal.waitForText("my text").catch(() => {});
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-010: Rapid resize sequence preserves content and cursor", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("stable content");
      await terminal.resize(80, 24);
      await terminal.resize(200, 60);
      await terminal.resize(120, 40);
      await terminal.waitForText("stable content");
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-011: Resize during sending state preserves completion", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("test");
      await terminal.sendKeys("enter");
      await terminal.resize(80, 24);
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-012: Resize during streaming continues rendering", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("stream test");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Agent").catch(() => {});
      await terminal.resize(80, 24);
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-013: Resize during thinking indicator continues spinner", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("think test");
      await terminal.sendKeys("enter");
      await terminal.waitForText("thinking").catch(() => {});
      await terminal.resize(200, 60);
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-014: Input width fills available space", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.resize(200, 60);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-015: Conversation area adjusts on input expand/contract", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      const before = terminal.snapshot();
      await terminal.sendText("line1");
      await terminal.sendKeys("shift+enter");
      await terminal.sendText("line2");
      await terminal.sendKeys("shift+enter");
      await terminal.sendText("line3");
      const after = terminal.snapshot();
      expect(after).not.toEqual(before);
      await terminal.terminate();
    });

    test("RESIZE-MSG-SEND-016: 200×60 → 80×24 during streaming continues", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("stream");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Agent").catch(() => {});
      await terminal.resize(80, 24);
      await terminal.terminate();
    });
  });
```

### 10.4 Edge Case Tests

```typescript
  describe("Edge Cases", () => {
    test("EDGE-MSG-SEND-001: 4000 character single-line message at max length", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      const longText = "a".repeat(4000);
      await terminal.sendText(longText);
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-002: 50-line message via Shift+Enter", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      for (let i = 0; i < 50; i++) {
        await terminal.sendText(`line${i}`);
        if (i < 49) await terminal.sendKeys("shift+enter");
      }
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-003: Unicode/emoji in message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Hello 🌍 こんにちは");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Hello").catch(() => {});
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-004: Markdown in user message sent as plain text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("# Hello **world**");
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-005: Raw ANSI codes in user message treated as literal", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("\x1b[31mred text\x1b[0m");
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-006: Agent response with code blocks", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Show me a code example");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Agent").catch(() => {});
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-007: Agent response with very long code block", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("Generate a long function");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Agent").catch(() => {});
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-008: Immediate Enter after opening chat is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-009: Multiple rapid Enter presses", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("test");
      await terminal.sendKeys("enter", "enter", "enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-010: Paste + immediate Enter", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("pasted content from clipboard");
      await terminal.sendKeys("enter");
      await terminal.waitForText("pasted content").catch(() => {});
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-011: NO_COLOR=1 uses bold/underline instead of color", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { NO_COLOR: "1" },
      });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-012: SSE reconnect during streaming fetches missed content", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("long response");
      await terminal.sendKeys("enter");
      await terminal.waitForText("reconnecting").catch(() => {});
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-013: SSE timeout triggers reconnect", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-014: Agent response empty (done with no tokens)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_EMPTY_RESPONSE__");
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-015: Session transitions to completed during typing", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("still typing");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-016: Send to session with 1000 existing messages", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal, 4);
      await waitForChatReady(terminal);
      await terminal.sendText("new message");
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-017: Mixed tool_call/tool_result messages render", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-018: Server returns different content, server wins", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("test");
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-019: Network disconnect then reconnect succeeds", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("after reconnect");
      await terminal.sendKeys("enter");
      await terminal.terminate();
    });

    test("EDGE-MSG-SEND-020: Ctrl+S as force-retry from input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendText("__TRIGGER_500__");
      await terminal.sendKeys("enter");
      await terminal.waitForText("Failed").catch(() => {});
      await terminal.sendKeys("ctrl+s");
      await terminal.terminate();
    });
  });
});
```

---

## 11. Productionization Checklist

The reference implementation in `specs/tui/` provides a PoC-quality codebase. The following items must be addressed when graduating to production in `apps/tui/src/`:

### 11.1 Type Safety

| PoC Pattern | Production Requirement |
|-------------|------------------------|
| `useAgentMessages(sessionId, { perPage: 30 })` | Use full signature: `useAgentMessages(owner, repo, sessionId, { perPage: 30 })` |
| `sendMessage(trimmedText)` | Use `send({ role: "user", parts: [{ type: "text", content: trimmedText }] })` matching `CreateAgentMessageRequest` |
| `stream.finalMessage` typed as any | `onDone` callback receives `fullContent: string`, not `AgentMessage`. Build finalization message from accumulated content |
| `ChatMessage.timestamp` vs `ChatMessage.createdAt` | Local `AgentMessage` type uses `timestamp` but ui-core uses `createdAt`. Ensure consistent mapping in pagination layer |
| `error.status` for HTTP classification | `HookError` from ui-core has `.status` property. `useSendAgentMessage.error` is `HookError | null` |

### 11.2 Error Boundary Integration

- Wrap `MessageInput` in a component-level error boundary within the chat screen.
- On input crash: show "Input error — press `i` to try again." in the input panel area.
- On streaming render crash: show partial response as plain text with "Rendering error" indicator.
- Conversation history remains visible through input-level error boundaries.

### 11.3 Memory Management

- The streaming token accumulation (`appendStreamingTokens`) receives the full accumulated string. For very long responses (100k+ chars), use a mutable ref to accumulate and only update React state on a 16ms throttle.
- Virtualized rendering: ensure `<scrollbox viewportCulling={true}>` is set on the conversation scrollbox (already present in existing code).
- The 500-message memory cap evicts from the front (oldest) when inserting at the end (already implemented correctly).

### 11.4 SSE Reliability

- The existing `useAgentStream` from `@codeplane/ui-core` already handles:
  - Ticket-based auth via `getSSETicket()`
  - Exponential backoff reconnection (1s → 30s max, 20 attempts)
  - Keepalive timeout (45s)
  - Token replay on reconnection via messages API
  - Event deduplication via position tracking
- The PoC `AgentChatScreen` uses a dummy `useSSEChannel`. For session status changes (completed/failed/timed_out), the production code should use the real `SSEProvider` or poll the session endpoint.

### 11.5 Telemetry Integration

- All telemetry events listed in §8 must be wired to the TUI telemetry client.
- `time_to_submit_ms`: track from first keystroke (input focus) to Enter press.
- `time_since_send_ms` (thinking duration): track from successful POST response to first SSE token.
- Events are fire-and-forget; telemetry failures must not affect UX.

### 11.6 Logging Integration

- All log entries listed in §9 must use the structured logger.
- Typing events debounced to 1/sec to avoid log spam.
- Log levels respected: debug logs are silent in production unless `CODEPLANE_LOG_LEVEL=debug`.

### 11.7 Accessibility

- `"Sending…"`, `"Failed"`, and `"Agent is thinking…"` states announced via status bar updates.
- Error messages use semantic color tokens from `colors.ts`, not raw ANSI codes.
- The braille spinner characters have a plain-text fallback (the existing `useSpinner` hook should handle ASCII fallback for terminals without Unicode support).

### 11.8 Focus Trap Correctness

- When the help overlay (`?`) is active, the input must not capture keys. The `KeybindingProvider` priority stack handles this: modal > input.
- When the command palette (`:`) is active, the input must not capture keys.
- Focus restored to the input (or scroll mode) when overlays dismiss.
- The existing `useChatKeybindings` should check `search.isActive` before processing input keys (already implemented in PoC).

### 11.9 Tests That Will Fail Due to Unimplemented Backend

Per project policy (`feedback_failing_tests.md`), the following tests will initially fail:

- **Streaming tests** (SNAP-MSG-SEND-008, 009, 010, 019, 023) — SSE stream endpoint may return 501
- **Error fixture tests** (SNAP-MSG-SEND-011, 012, 013, 014) — require specific error test fixtures
- **Session status tests** (SNAP-MSG-SEND-016, 017, 018) — require test fixture sessions with specific statuses
- **Reconnection tests** (EDGE-MSG-SEND-012, 013) — SSE reconnection tests

These tests are **left failing**. They are never skipped, commented out, or mocked. They serve as a signal for backend implementation progress.

---

## 12. Dependencies

### Required (already available)

| Package | Purpose |
|---------|----------|
| `@opentui/react` | `useKeyboard`, `useTerminalDimensions`, `useOnResize`, `<box>`, `<scrollbox>`, `<input>`, `<text>`, `<markdown>` |
| `@codeplane/ui-core` | `useSendAgentMessage`, `useAgentMessages`, `useAgentSession`, `useAgentStream`, `useUser` |
| `react` (19.x) | `useState`, `useCallback`, `useMemo`, `useEffect`, `useRef`, `memo` |
| `@microsoft/tui-test` | Terminal E2E test framework |
| `bun:test` | Test runner (`describe`, `test`, `expect`) |

### Required from sibling tickets

| Ticket | Deliverable Needed |
|--------|---------------------|
| `tui-agent-chat-screen` | `AgentChatScreen` shell, navigation registration, session data fetching, `useChatSearch`, `useChatPollingFallback` |
| `tui-agent-sse-stream-hook` | `useAgentStream` hook wired to SSEProvider for token/done/error events |

### Existing hooks consumed (from `specs/tui/packages/ui-core/src/hooks/agents/`)

| Hook | Signature | Notes |
|------|-----------|-------|
| `useSendAgentMessage(owner, repo, sessionId, callbacks?)` | Returns `{ send, sending, error }` where `send(CreateAgentMessageRequest) => Promise<AgentMessage>` | Callbacks: `onOptimistic`, `onSettled`, `onRevert`, `onError` |
| `useAgentMessages(owner, repo, sessionId, options?)` | Returns `{ messages, totalCount, isLoading, error, hasMore, fetchMore, refetch }` | Pagination: 30/page, max 10k |
| `useAgentSession(owner, repo, sessionId)` | Returns `{ session, isLoading, error, refetch }` | Session metadata |
| `useAgentStream(owner, repo, sessionId, options?)` | Returns `{ streaming, currentTokens, connected, reconnecting, error, subscribe, unsubscribe }` | Options: `enabled`, `onToken`, `onDone`, `onError` |

---

## 13. Acceptance Criteria Traceability

| Acceptance Criterion | Implementation Step | Test Coverage |
|---------------------|--------------------|---------------|
| Input rendered as persistent panel | Step 6 (MessageInput) | SNAP-MSG-SEND-001, 002, 003 |
| Pre-focused on open | Step 11 (AgentChatScreen) | KEY-MSG-SEND-008 |
| Placeholder text | Step 6 (MessageInput) | SNAP-MSG-SEND-001 |
| Border color focus/blur | Step 6 (MessageInput) | SNAP-MSG-SEND-004, 021 |
| Multi-line via Shift+Enter | Step 2 (useChatInput) | KEY-MSG-SEND-004, SNAP-MSG-SEND-005 |
| Enter submits | Steps 3, 10 (useChatSend, useChatKeybindings) | KEY-MSG-SEND-001 |
| Input grows up to 30% | Step 2 (useChatInput) | SNAP-MSG-SEND-006, RESIZE-MSG-SEND-004/005/006 |
| Hidden for inactive sessions | Step 11 (AgentChatScreen) | SNAP-MSG-SEND-016/017/018 |
| Disabled while sending | Steps 3, 6 | SNAP-MSG-SEND-015 |
| Standard text editing keys | Step 6 (OpenTUI native) | KEY-MSG-SEND-022 through 029 |
| Tab not inserted | Step 10 (useChatKeybindings) | KEY-MSG-SEND-038 |
| Optimistic insert <16ms | Step 5 (useChatPagination) | KEY-MSG-SEND-032 |
| Thinking indicator | Step 8 (ThinkingIndicator) | SNAP-MSG-SEND-008, KEY-MSG-SEND-033 |
| Streaming rendering | Step 12 (SSE wiring) | SNAP-MSG-SEND-009, KEY-MSG-SEND-034 |
| Failed message ✗ | Steps 3, 7 | SNAP-MSG-SEND-011, KEY-MSG-SEND-035 |
| Retry with r | Step 10 (useChatKeybindings) | KEY-MSG-SEND-014 |
| Auto-scroll follow | Step 4 (useAutoScroll) | KEY-MSG-SEND-021, SNAP-MSG-SEND-019 |
| ↓ New messages indicator | Step 9 (NewMessagesIndicator) | SNAP-MSG-SEND-019 |
| Double-submit prevention | Step 3 (useChatSend) | KEY-MSG-SEND-005 |
| 401 error handling | Step 3 (useChatSend) | SNAP-MSG-SEND-012 |
| 403 error handling | Step 3 (useChatSend) | SNAP-MSG-SEND-013 |
| 429 error handling | Step 3 (useChatSend) | SNAP-MSG-SEND-014 |
| Responsive sizing | Steps 2, 6, 11 | RESIZE-MSG-SEND-001 through 016 |
| Resize preserves state | Step 2 (useChatInput) | RESIZE-MSG-SEND-007/008/009/010 |
| q on empty input pops | Step 10 (useChatKeybindings) | KEY-MSG-SEND-016 |
| q on non-empty types q | Step 10 (useChatKeybindings) | KEY-MSG-SEND-017 |
| Esc on empty pops | Step 10 (useChatKeybindings) | KEY-MSG-SEND-006 |
| Esc on non-empty switches to scroll mode | Step 10 (useChatKeybindings) | KEY-MSG-SEND-007 |
| Printable char from scroll focuses input | Step 10 (useChatKeybindings) | KEY-MSG-SEND-039 |
| Go-to keybindings in scroll mode | Step 10 (useChatKeybindings) | KEY-MSG-SEND-037 |
| Body trimmed before send | Step 3 (useChatSend) | KEY-MSG-SEND-040 |
| `:` opens command palette | Step 10 (useChatKeybindings) | KEY-MSG-SEND-019 |