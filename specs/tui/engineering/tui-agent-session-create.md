# TUI Agent Session Create — Engineering Specification

## `tui-agent-session-create`

**Ticket:** Implement agent session creation (inline + modal)  
**Dependencies:** `tui-agent-data-hooks`, `tui-agent-session-list`, `tui-agent-screen-registry`, `tui-agent-e2e-scaffolding`  
**Status:** Not started

---

## Implementation Plan

This plan is organized as vertical slices. Each step produces a testable increment. Steps 1–3 are foundational (types, hooks, utilities). Steps 4–5 are the two UI components. Step 6 wires everything into the session list and command palette. Step 7 writes the full E2E test suite.

### Step 1: Types and Constants

**File:** `apps/tui/src/screens/Agents/types.ts`

Add session-create–specific types to the existing types file.

```typescript
// Add to existing types.ts

/** State machine for the inline create input */
export type InlineCreateState =
  | "hidden"
  | "editing"
  | "submitting"
  | "error";

/** Props for the inline session create component */
export interface InlineSessionCreateProps {
  owner: string;
  repo: string;
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
  breakpoint: Breakpoint;
  terminalWidth: number;
}

/** Props for the modal session create component */
export interface AgentSessionCreateModalProps {
  owner: string;
  repo: string;
  visible: boolean;
  onCreated: (sessionId: string) => void;
  onDismiss: () => void;
  breakpoint: Breakpoint;
  terminalWidth: number;
  terminalHeight: number;
}

/** Error classification for create failures */
export type CreateErrorType =
  | "auth"
  | "permission"
  | "rate_limit"
  | "validation"
  | "server"
  | "network";
```

**Rationale:** Centralizing types in the existing `types.ts` keeps all Agent domain types co-located. The `InlineCreateState` union drives the state machine in the inline component. `CreateErrorType` maps directly to the telemetry event properties and the error-handling switch.

---

### Step 2: Error Classification Utility

**File:** `apps/tui/src/screens/Agents/utils/classifyCreateError.ts`

```typescript
import type { CreateErrorType } from "../types.js";

interface ClassifiedError {
  type: CreateErrorType;
  message: string;
  retryAfterSeconds?: number;
}

/**
 * Classify an API error from useCreateAgentSession into a user-facing
 * error type and message string.
 */
export function classifyCreateError(error: unknown): ClassifiedError {
  if (error && typeof error === "object" && "code" in error) {
    const apiError = error as { code: number; message?: string; headers?: Record<string, string> };
    switch (apiError.code) {
      case 400:
        return {
          type: "validation",
          message: apiError.message ?? "Invalid session title.",
        };
      case 401:
        return { type: "auth", message: "Session expired. Run `codeplane auth login` to re-authenticate." };
      case 403:
        return { type: "permission", message: "Insufficient permissions to create agent sessions." };
      case 409:
        return {
          type: "validation",
          message: apiError.message ?? "Conflict creating session.",
        };
      case 429: {
        const retryAfter = apiError.headers?.["retry-after"];
        const seconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
        const display = seconds && !isNaN(seconds) ? `${seconds}s` : "a few seconds";
        return {
          type: "rate_limit",
          message: `Rate limited. Retry in ${display}.`,
          retryAfterSeconds: seconds && !isNaN(seconds) ? seconds : undefined,
        };
      }
      default:
        return { type: "server", message: "Failed to create session. Press Enter to retry." };
    }
  }

  if (error instanceof Error && error.message.includes("fetch")) {
    return { type: "network", message: "Failed to create session. Press Enter to retry." };
  }
  return { type: "network", message: "Failed to create session. Press Enter to retry." };
}
```

**Rationale:** Extracting error classification into a pure function makes it testable in isolation and shared between inline and modal components.

---

### Step 3: Responsive Layout Utility

**File:** `apps/tui/src/screens/Agents/utils/createLayoutConfig.ts`

```typescript
import type { Breakpoint } from "../types.js";

export interface CreateLayoutConfig {
  inlinePaddingX: number;
  modalWidthPercent: number;
  modalHeight: number;
  truncatePlaceholder: boolean;
}

export function getCreateLayoutConfig(breakpoint: Breakpoint): CreateLayoutConfig {
  switch (breakpoint) {
    case "minimum":
      return { inlinePaddingX: 2, modalWidthPercent: 90, modalHeight: 7, truncatePlaceholder: true };
    case "standard":
      return { inlinePaddingX: 4, modalWidthPercent: 60, modalHeight: 9, truncatePlaceholder: false };
    case "large":
      return { inlinePaddingX: 8, modalWidthPercent: 50, modalHeight: 11, truncatePlaceholder: false };
  }
}

export function computeModalWidth(terminalWidth: number, percent: number): number {
  return Math.min(Math.floor(terminalWidth * percent / 100), terminalWidth - 4);
}
```

---

### Step 4: Inline Session Create Component

**File:** `apps/tui/src/screens/Agents/components/InlineSessionCreate.tsx`

```typescript
import React, { useState, useCallback, useRef } from "react";
import { useCreateAgentSession } from "@codeplane/ui-core";
import { useKeyboard } from "@opentui/react";
import type { InlineSessionCreateProps, InlineCreateState } from "../types.js";
import { classifyCreateError } from "../utils/classifyCreateError.js";
import { getCreateLayoutConfig } from "../utils/createLayoutConfig.js";

const MAX_TITLE_LENGTH = 255;
const MIN_CREATING_DISPLAY_MS = 100;
const PLACEHOLDER = "Session title…";

export function InlineSessionCreate({
  owner, repo, onCreated, onCancel, breakpoint, terminalWidth,
}: InlineSessionCreateProps): React.ReactElement {
  const [title, setTitle] = useState("");
  const [state, setState] = useState<InlineCreateState>("editing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const creatingStartRef = useRef<number>(0);

  const { mutate } = useCreateAgentSession(owner, repo);
  const layout = getCreateLayoutConfig(breakpoint);

  const isTitleValid = useCallback((t: string) => t.trim().length > 0, []);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    if (!isTitleValid(title)) return;

    submittingRef.current = true;
    setState("submitting");
    setErrorMessage(null);
    creatingStartRef.current = Date.now();

    try {
      const session = await mutate({ title: title.trim() });

      const elapsed = Date.now() - creatingStartRef.current;
      if (elapsed < MIN_CREATING_DISPLAY_MS) {
        await new Promise(r => setTimeout(r, MIN_CREATING_DISPLAY_MS - elapsed));
      }

      if (!session?.id) {
        setState("error");
        setErrorMessage("Failed to create session.");
        submittingRef.current = false;
        return;
      }

      onCreated(session.id);
    } catch (err) {
      const classified = classifyCreateError(err);
      setState("error");
      setErrorMessage(classified.message);
      submittingRef.current = false;
    }
  }, [title, mutate, isTitleValid, onCreated]);

  const handleChange = useCallback((newValue: string) => {
    const graphemes = Array.from(newValue);
    if (graphemes.length > MAX_TITLE_LENGTH) {
      setTitle(graphemes.slice(0, MAX_TITLE_LENGTH).join(""));
    } else {
      setTitle(newValue);
    }
  }, []);

  useKeyboard((key) => {
    if (state === "submitting") return;
    if (key === "enter" || key === "return") { handleSubmit(); return true; }
    if (key === "escape") { onCancel(); return true; }
  });

  const displayPlaceholder = layout.truncatePlaceholder
    ? truncateWithEllipsis(PLACEHOLDER, terminalWidth - layout.inlinePaddingX * 2 - 4)
    : PLACEHOLDER;

  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="column" paddingX={layout.inlinePaddingX} paddingY={1} border="single" borderColor="primary">
        <text bold color="primary">New Session</text>
        {state === "submitting" ? (
          <text color="muted" italic>Creating…</text>
        ) : (
          <input value={title} onChange={handleChange} maxLength={MAX_TITLE_LENGTH}
            placeholder={displayPlaceholder} focused={true} disabled={state === "submitting"} />
        )}
        {state === "error" && errorMessage && <text color="error">⚠ {errorMessage}</text>}
      </box>
    </box>
  );
}

function truncateWithEllipsis(text: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}
```

**Key design decisions:**

1. **State machine over booleans**: `InlineCreateState` is a union type preventing impossible states (e.g., submitting AND error simultaneously).
2. **`submittingRef` for double-submit prevention**: A ref is synchronous — checked immediately before `setState` render cycle completes.
3. **Minimum "Creating…" display**: 100ms minimum via `Date.now()` comparison to prevent visual flicker.
4. **Grapheme-aware max length**: `Array.from(newValue)` splits on code points. See Productionization for `Intl.Segmenter` upgrade.
5. **Input delegation**: OpenTUI `<input>` handles Backspace, Delete, Left/Right, Home/Ctrl+A, End/Ctrl+E, Ctrl+K, Ctrl+U natively.

---

### Step 5: Modal Session Create Component

**File:** `apps/tui/src/screens/Agents/AgentSessionCreateModal.tsx`

```typescript
import React, { useState, useCallback, useRef } from "react";
import { useCreateAgentSession } from "@codeplane/ui-core";
import { useKeyboard } from "@opentui/react";
import type { AgentSessionCreateModalProps, InlineCreateState } from "./types.js";
import { classifyCreateError } from "./utils/classifyCreateError.js";
import { getCreateLayoutConfig, computeModalWidth } from "./utils/createLayoutConfig.js";

const MAX_TITLE_LENGTH = 255;
const MIN_CREATING_DISPLAY_MS = 100;
const PLACEHOLDER = "Session title…";
const FOCUS_COUNT = 3; // Input (0) → Create (1) → Cancel (2)

export function AgentSessionCreateModal({
  owner, repo, visible, onCreated, onDismiss, breakpoint, terminalWidth, terminalHeight,
}: AgentSessionCreateModalProps): React.ReactElement | null {
  const [title, setTitle] = useState("");
  const [state, setState] = useState<InlineCreateState>("editing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const submittingRef = useRef(false);
  const creatingStartRef = useRef<number>(0);

  const { mutate } = useCreateAgentSession(owner, repo);
  const layout = getCreateLayoutConfig(breakpoint);
  const modalWidth = computeModalWidth(terminalWidth, layout.modalWidthPercent);

  const isTitleValid = useCallback((t: string) => t.trim().length > 0, []);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    if (!isTitleValid(title)) return;

    submittingRef.current = true;
    setState("submitting");
    setErrorMessage(null);
    creatingStartRef.current = Date.now();

    try {
      const session = await mutate({ title: title.trim() });
      const elapsed = Date.now() - creatingStartRef.current;
      if (elapsed < MIN_CREATING_DISPLAY_MS) {
        await new Promise(r => setTimeout(r, MIN_CREATING_DISPLAY_MS - elapsed));
      }
      if (!session?.id) {
        setState("error");
        setErrorMessage("Failed to create session.");
        submittingRef.current = false;
        return;
      }
      onCreated(session.id);
    } catch (err) {
      const classified = classifyCreateError(err);
      setState("error");
      setErrorMessage(classified.message);
      submittingRef.current = false;
    }
  }, [title, mutate, isTitleValid, onCreated]);

  const handleChange = useCallback((newValue: string) => {
    const graphemes = Array.from(newValue);
    setTitle(graphemes.length > MAX_TITLE_LENGTH
      ? graphemes.slice(0, MAX_TITLE_LENGTH).join("")
      : newValue);
  }, []);

  useKeyboard((key) => {
    if (!visible) return;
    if (state === "submitting") return;

    if (key === "tab") { setFocusIndex(p => (p + 1) % FOCUS_COUNT); return true; }
    if (key === "shift+tab") { setFocusIndex(p => (p - 1 + FOCUS_COUNT) % FOCUS_COUNT); return true; }
    if (key === "escape") { onDismiss(); return true; }
    if (key === "ctrl+s") { handleSubmit(); return true; }

    if (key === "enter" || key === "return") {
      if (focusIndex === 0) { handleSubmit(); return true; }
      if (focusIndex === 1) { handleSubmit(); return true; }
      if (focusIndex === 2) { onDismiss(); return true; }
    }
  });

  if (!visible) return null;

  return (
    <box position="absolute" top="center" left="center" width={modalWidth}
      height={layout.modalHeight} border="single" borderColor="border" backgroundColor="surface" zIndex={10}>
      <box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <text bold>New Agent Session</text>
        <box flexDirection="column">
          <text color="muted">Title:</text>
          <input value={title} onChange={handleChange} maxLength={MAX_TITLE_LENGTH}
            placeholder={PLACEHOLDER} focused={focusIndex === 0} disabled={state === "submitting"} />
          {state === "error" && errorMessage && <text color="error">⚠ {errorMessage}</text>}
        </box>
        <box flexDirection="row" gap={2}>
          <button focused={focusIndex === 1} onPress={handleSubmit} disabled={state === "submitting"}>
            {state === "submitting" ? "Creating…" : "Create"}
          </button>
          <button focused={focusIndex === 2} onPress={onDismiss}>Cancel</button>
        </box>
      </box>
    </box>
  );
}
```

**Key design decisions:**

1. **Focus trapping**: Tab/Shift+Tab cycle through 3 elements via modular arithmetic. All Tab events consumed — never propagate globally.
2. **`visible` guard**: Returns `null` when hidden, preventing stale keyboard handler registration.
3. **Shared submission logic**: Identical state machine and error classification as inline mode.
4. **Modal stacking**: `zIndex={10}` + `position="absolute"` + centering via OpenTUI layout engine.

---

### Step 6: Integration — Wiring into Session List and Command Palette

#### 6a. Update `AgentSessionListScreen.tsx`

**File:** `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`

**Changes:**

```typescript
// Add to imports:
import { InlineSessionCreate } from "./components/InlineSessionCreate.js";
import { useNavigation } from "../../hooks/useNavigation.js";

// Add to local state:
const [showInlineCreate, setShowInlineCreate] = useState(false);
const nav = useNavigation();

// Replace handleCreate:
const handleCreate = useCallback(() => {
  if (showInlineCreate) return;
  setShowInlineCreate(true);
}, [showInlineCreate]);

// Add new handlers:
const handleCreateSuccess = useCallback((sessionId: string) => {
  setShowInlineCreate(false);
  nav.push("AgentChat", { owner, repo, sessionId });
}, [owner, repo, nav]);

const handleCreateCancel = useCallback(() => {
  setShowInlineCreate(false);
}, []);
```

**Render changes** — between toolbar and scrollbox:

```tsx
{showInlineCreate && (
  <InlineSessionCreate
    owner={owner} repo={repo}
    onCreated={handleCreateSuccess}
    onCancel={handleCreateCancel}
    breakpoint={breakpoint} terminalWidth={width}
  />
)}

<scrollbox flexGrow={1} opacity={showInlineCreate ? 0.5 : 1.0}>
  {/* existing session rows */}
</scrollbox>
```

**Keybinding guard** — pass `isInlineCreateActive: showInlineCreate` to `useSessionListKeybindings`. When true, `j`, `k`, `G`, `gg`, `Ctrl+D`, `Ctrl+U`, `n`, `d`, `r`, `f`, `/`, `Space` are all no-ops.

#### 6b. Screen Registry

**File:** `apps/tui/src/router/screens.ts`

```typescript
// Add to SCREEN_IDS:
AgentChat: "AgentChat",

// Add to screenRegistry:
[SCREEN_IDS.AgentChat]: {
  component: PlaceholderScreen,
  title: "Agent Chat",
  requiresRepo: true,
},
```

#### 6c. Command Palette Registration

**File:** `apps/tui/src/commands/agentCommands.ts` (new)

```typescript
import type { CommandEntry } from "@codeplane/ui-core";

export const agentCommands: CommandEntry[] = [
  {
    id: "agent.session.create",
    title: "New Agent Session",
    aliases: ["Create Agent Session"],
    category: "Agents",
    requiresRepo: true,
    requiresWriteAccess: true,
    action: (context) => {
      const { owner, repo } = context.repoContext!;
      context.openModal("agent-session-create", { owner, repo });
    },
  },
];
```

#### 6d. Export Updates

**File:** `apps/tui/src/screens/Agents/components/index.ts` — add `export { InlineSessionCreate } from "./InlineSessionCreate.js";`

**File:** `apps/tui/src/screens/Agents/index.ts` — add `export { AgentSessionCreateModal } from "./AgentSessionCreateModal.js";`

#### 6e. Update `useSessionListKeybindings`

**File:** `apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts`

Add `isInlineCreateActive: boolean` to the options interface. When true, the dispatcher early-returns for all list navigation and action keys, letting them propagate to the `<input>` component.

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `apps/tui/src/screens/Agents/components/InlineSessionCreate.tsx` | Inline create input component |
| `apps/tui/src/screens/Agents/AgentSessionCreateModal.tsx` | Modal create overlay component |
| `apps/tui/src/screens/Agents/utils/classifyCreateError.ts` | Error classification utility |
| `apps/tui/src/screens/Agents/utils/createLayoutConfig.ts` | Responsive layout config utility |
| `apps/tui/src/commands/agentCommands.ts` | Command palette entries for agents |

### Modified Files

| File | Change |
|------|--------|
| `apps/tui/src/screens/Agents/types.ts` | Add `InlineCreateState`, `CreateErrorType`, prop interfaces |
| `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` | Add inline create integration, dim list, keybinding guards |
| `apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts` | Add `isInlineCreateActive` guard |
| `apps/tui/src/screens/Agents/components/index.ts` | Export `InlineSessionCreate` |
| `apps/tui/src/screens/Agents/index.ts` | Export `AgentSessionCreateModal` |
| `apps/tui/src/router/screens.ts` | Add `AgentChat` screen ID |
| `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx` | Replace stub or remove |
| `e2e/tui/agents.test.ts` | Add 78 tests for `TUI_AGENT_SESSION_CREATE` |

---

## Data Flow

### Inline Mode Sequence

```
User presses `n` on session list
  → setShowInlineCreate(true)
  → InlineSessionCreate renders (focused)
  → List rows dim to 50% opacity
  → Status bar: "Enter:create  Esc:cancel"
  → j/k/d/r/f/n disabled
  ↓
User types title → handleChange enforces 255-char max
  ↓
User presses Enter
  → Validate: title.trim().length > 0 (else no-op)
  → submittingRef.current = true (lock)
  → setState("submitting") → "Creating…"
  → mutate({ title }) → POST /api/repos/:owner/:repo/agent/sessions
  ↓
API 201 { id, title, status }
  → Enforce ≥100ms "Creating…" display
  → Validate session.id non-empty
  → onCreated(session.id)
  → setShowInlineCreate(false)
  → nav.push("AgentChat", { owner, repo, sessionId })
```

### Modal Mode Sequence

```
Command palette → "New Agent Session"
  → context.openModal("agent-session-create", { owner, repo })
  → Modal renders (visible=true, focusIndex=0)
  → Focus trapped: Tab cycles Input→Create→Cancel
  ↓
User types title, Enter or Ctrl+S
  → Same submit flow as inline
  ↓
API 201 → onCreated(session.id)
  → If not on session list: push("Agents", { owner, repo }) first
  → push("AgentChat", { owner, repo, sessionId })
```

### Error Recovery

```
API 4xx/5xx or network error
  → classifyCreateError(err) → { type, message }
  → 401: push auth error screen
  → Else: setState("error"), setErrorMessage(message)
  → submittingRef.current = false (unlock)
  → Input retains title text
  → Enter retries / Esc cancels
```

---

## Unit & Integration Tests

### Test File: `e2e/tui/agents.test.ts`

All 78 tests appended as `describe("TUI_AGENT_SESSION_CREATE", ...)`. Uses `launchTUI` from `e2e/tui/helpers.ts`. **All tests left failing if backend unimplemented — never skipped or commented out.**

### Terminal Snapshot Tests (14)

| ID | Description | Size |
|----|-------------|------|
| SNAP-CREATE-001 | Inline input with placeholder, list dimmed | 120×40 |
| SNAP-CREATE-002 | Compact inline input, minimal padding | 80×24 |
| SNAP-CREATE-003 | Generous spacing, full placeholder | 200×60 |
| SNAP-CREATE-004 | User-typed title visible, cursor at end | 120×40 |
| SNAP-CREATE-005 | "Creating…" muted italic state | 120×40 |
| SNAP-CREATE-006 | Red error below input, title preserved | 120×40 |
| SNAP-CREATE-007 | Centered modal with title/input/buttons | 120×40 |
| SNAP-CREATE-008 | 90% width compact modal | 80×24 |
| SNAP-CREATE-009 | 50% width generous modal | 200×60 |
| SNAP-CREATE-010 | Modal error between input and buttons | 120×40 |
| SNAP-CREATE-011 | Modal "Creating…" on button, input disabled | 120×40 |
| SNAP-CREATE-012 | Status bar: "Enter:create Esc:cancel" | 120×40 |
| SNAP-CREATE-013 | Status bar: "Enter:create Tab:next Esc:cancel" | 120×40 |
| SNAP-CREATE-014 | NO_COLOR: reverse video border, bold error | 120×40 |

### Keyboard Interaction Tests (28)

| ID | Description |
|----|-------------|
| KEY-CREATE-001 | `n` from list opens inline input |
| KEY-CREATE-002 | Typing updates title text |
| KEY-CREATE-003 | Enter on non-empty submits |
| KEY-CREATE-004 | Enter on empty is no-op |
| KEY-CREATE-005 | Esc cancels, returns focus to list |
| KEY-CREATE-006 | Esc restores previously focused row |
| KEY-CREATE-007 | `n` while input open is ignored |
| KEY-CREATE-008 | j/k type into input, don't move list |
| KEY-CREATE-009 | `/` types into input, doesn't open search |
| KEY-CREATE-010 | `d` types into input, no delete overlay |
| KEY-CREATE-011 | `f` types into input, no filter cycle |
| KEY-CREATE-012 | Success navigates to chat screen |
| KEY-CREATE-013 | Failure shows error, retains text |
| KEY-CREATE-014 | Enter retry re-submits same title |
| KEY-CREATE-015 | Backspace deletes last char |
| KEY-CREATE-016 | Ctrl+A/Home moves cursor to start |
| KEY-CREATE-017 | Ctrl+E/End moves cursor to end |
| KEY-CREATE-018 | Ctrl+K kills to end of line |
| KEY-CREATE-019 | Ctrl+U kills to start of line |
| KEY-CREATE-020 | Command palette opens modal |
| KEY-CREATE-021 | Enter in modal input submits |
| KEY-CREATE-022 | Esc in modal dismisses |
| KEY-CREATE-023 | Tab cycles Input→Create→Cancel→Input |
| KEY-CREATE-024 | Shift+Tab cycles backward |
| KEY-CREATE-025 | Ctrl+S submits from any element |
| KEY-CREATE-026 | Enter on Cancel dismisses |
| KEY-CREATE-027 | Enter on Create submits |
| KEY-CREATE-028 | Rapid 30 chars in 500ms all captured |

### Responsive Tests (10)

| ID | Description |
|----|-------------|
| RESP-CREATE-001 | 80×24 inline: width = available - 4ch |
| RESP-CREATE-002 | 120×40 inline: width = available - 8ch |
| RESP-CREATE-003 | 200×60 inline: width = available - 16ch |
| RESP-CREATE-004 | 80×24 modal: 90% width |
| RESP-CREATE-005 | 120×40 modal: 60% width |
| RESP-CREATE-006 | 200×60 modal: 50% width |
| RESP-CREATE-007 | Resize 120→80 during inline: text preserved |
| RESP-CREATE-008 | Resize 80→120 during modal: width expands |
| RESP-CREATE-009 | Resize below 80×24: "too small"; back restores |
| RESP-CREATE-010 | Resize during "Creating…": continues normally |

### Integration Tests (16)

| ID | Description |
|----|-------------|
| INT-CREATE-001 | Success → chat screen with correct session ID |
| INT-CREATE-002 | Chat after create has empty pre-focused input |
| INT-CREATE-003 | Back from chat → list shows new session at top |
| INT-CREATE-004 | 401 → auth error screen pushed |
| INT-CREATE-005 | 403 → "Insufficient permissions" inline |
| INT-CREATE-006 | 429 → "Rate limited. Retry in Ns." |
| INT-CREATE-007 | 500 → "Failed to create session" with retry |
| INT-CREATE-008 | Network timeout → error after 30s, text preserved |
| INT-CREATE-009 | 400 → inline error with server message |
| INT-CREATE-010 | Double-submit: rapid Enter×3 creates one session |
| INT-CREATE-011 | Create then q in chat → list shows session |
| INT-CREATE-012 | Palette entry hidden without repo context |
| INT-CREATE-013 | `n` no-op without repo context |
| INT-CREATE-014 | `n` hidden from status bar for read-only users |
| INT-CREATE-015 | Modal create navigates through list to chat |
| INT-CREATE-016 | 255-char title accepted and created |

### Edge Case Tests (10)

| ID | Description |
|----|-------------|
| EDGE-CREATE-001 | Only spaces → Enter is no-op |
| EDGE-CREATE-002 | Only tabs → not inserted, Enter no-op |
| EDGE-CREATE-003 | Exactly 255 chars → accepted and submitted |
| EDGE-CREATE-004 | 256th char → not inserted |
| EDGE-CREATE-005 | Unicode/emoji → rendered and submitted correctly |
| EDGE-CREATE-006 | Rapid n→Esc→n→Esc 5× → no leaked state |
| EDGE-CREATE-007 | Fail then retry succeeds → error clears, navigates |
| EDGE-CREATE-008 | Ctrl+C during "Creating…" → TUI quits |
| EDGE-CREATE-009 | Paste 500 chars → truncated to 255 |
| EDGE-CREATE-010 | "Creating…" minimum 100ms display time |

### Test Implementation Pattern

Each test follows this structure using `e2e/tui/helpers.ts`:

```typescript
test("KEY-CREATE-001: n from session list opens inline create input", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await terminal.waitForText("Agent Sessions");
  await terminal.waitForNoText("Loading");
  await terminal.sendKeys("n");
  await terminal.waitForText("New Session");
  await terminal.waitForText("Session title");
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

All 78 tests run against a real API server with test fixtures — no mocking of implementation details.

---

## Productionization Notes

### Grapheme Cluster Handling

Replace `Array.from(value)` with `Intl.Segmenter` for full grapheme cluster support:

```typescript
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = [...segmenter.segment(value)];
if (graphemes.length > MAX_TITLE_LENGTH) {
  setTitle(graphemes.slice(0, MAX_TITLE_LENGTH).map(s => s.segment).join(""));
}
```

Bun supports `Intl.Segmenter` natively. Add unit tests for flag emoji, ZWJ families, and combining marks.

### Authentication Error Propagation

Currently catches 401 and sets local error state. In production, propagate to `AuthProvider`:

```typescript
if (classified.type === "auth") {
  authContext.handleExpiry(); // pushes auth error screen globally
  return;
}
```

Requires `AuthProvider` to expose `handleExpiry()` (part of `tui-auth-provider` ticket).

### Telemetry Integration

When `@codeplane/ui-core` telemetry client ships, add event fires at state transitions:
- `tui.agents.create.opened` — on `setShowInlineCreate(true)` or modal visible
- `tui.agents.create.submitted` — on `handleSubmit` entry
- `tui.agents.create.succeeded` — on successful `mutate` return
- `tui.agents.create.failed` — on catch
- `tui.agents.create.cancelled` — on Esc handler

No structural changes needed — add calls to existing transition points.

### Logging

When TUI logger ships (`apps/tui/src/lib/logger.ts`), add structured logs per the observability spec:
- `debug`: input opened, input changed, validation rejected
- `info`: submitting, created, navigated, cancelled
- `warn`: failed, rate limited, permission denied
- `error`: auth error, render error, unexpected response

Logs to stderr via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### NO_COLOR Support

Detect `NO_COLOR` or `TERM=dumb` in `ThemeProvider`. Components reference semantic tokens (`"primary"`, `"error"`) — the provider maps to reverse video / bold fallbacks. No component-level changes needed.

### OpenTUI Input Shims

If `<input>` doesn't yet support `maxLength`, `placeholder`, or `disabled`:
1. `maxLength` — already enforced in `handleChange` (done)
2. `placeholder` — render `<text color="muted">` overlay when `value === ""`
3. `disabled` — ignore keyboard events via state guard, render with muted styling

Remove shims when OpenTUI adds native support.

---

## Dependency Graph

```
tui-agent-e2e-scaffolding
  ↓
tui-agent-data-hooks (useCreateAgentSession)
  ↓
tui-agent-screen-registry (AgentChat screen ID)
  ↓
tui-agent-session-list (inline create integration point)
  ↓
tui-agent-session-create (this ticket)
  → InlineSessionCreate
  → AgentSessionCreateModal
  → classifyCreateError
  → createLayoutConfig
  → agentCommands
  → 78 E2E tests
```