# Research Findings: TUI Agent Session List Screen

Based on exploring the codebase across `apps/tui/`, `packages/ui-core/`, and `context/opentui/`, I have identified the following critical components, hooks, APIs, and patterns required to implement the `TUI_AGENT_SESSION_LIST` feature.

## 1. UI Core Data Hooks & Types (`packages/ui-core`)

### `AgentSession` Data Model
Located in `packages/ui-core/src/types/agents.ts`.
The wire types returned by the Codeplane API match what we need for the screen:
```typescript
export type AgentSessionStatus =
  | "active"
  | "completed"
  | "failed"
  | "timed_out"
  | "pending";

export interface AgentSession {
  id: string;
  repositoryId: string;
  userId: string;
  workflowRunId: string | null;
  title: string;
  status: AgentSessionStatus;
  startedAt: string | null;    // ISO-8601 or null
  finishedAt: string | null;   // ISO-8601 or null
  createdAt: string;           // ISO-8601
  updatedAt: string;           // ISO-8601
  messageCount?: number;       // present when using list-with-count endpoint
}
```

### `useAgentSessions` Hook
Located in `packages/ui-core/src/hooks/agents/useAgentSessions.ts`.
This hook uses `usePaginatedQuery` under the hood. It exposes pagination parameters matching the required interface.
```typescript
export function useAgentSessions(
  owner: string,
  repo: string,
  options?: AgentSessionsOptions,
): {
  sessions: AgentSession[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
}
```

### `useDeleteAgentSession` Hook
Located in `packages/ui-core/src/hooks/agents/useDeleteAgentSession.ts`.
The delete hook follows a callback pattern that enables optimistic UI updates and revert mechanisms:
```typescript
export interface DeleteAgentSessionCallbacks {
  onOptimistic?: (sessionId: string) => void;
  onRevert?: (sessionId: string) => void;
  onError?: (error: HookError, sessionId: string) => void;
  onSettled?: (sessionId: string) => void;
}

export function useDeleteAgentSession(
  owner: string,
  repo: string,
  callbacks?: DeleteAgentSessionCallbacks,
): {
  mutate: (sessionId: string) => Promise<void>;
  isLoading: boolean;
  error: HookError | null;
}
```

## 2. OpenTUI Capabilities (`@opentui/react`)

The `@opentui/react` primitives are available and functioning. These must be used strictly following the established interfaces found across the codebase (e.g. `apps/tui/src/verify-imports.ts`, `apps/tui/src/screens/Agents/components/MessageBlock.tsx`).

### Hooks
- **`useTerminalDimensions()`**: Returns `{ width: number, height: number }`.
- **`useKeyboard(handler, options?)`**: Binds key events. The handler receives an event with `name`, `shift`, `ctrl` properties, and a `stopPropagation()` method. Options include `release: boolean`.
- **`useOnResize()`**: Will trigger recalculation logic when terminal size changes (useful for column widths).

### Components
Available intrinsic layout and display elements: `<box>`, `<scrollbox>`, `<text>`, `<input>`, `<select>`, `<code>`, `<diff>`, `<markdown>`.

## 3. Existing TUI Code (`apps/tui/src/screens/Agents/`)

### Types (`types.ts`)
The current types file already defines `MessageRole`, `MessagePart`, `AgentMessage`, and exports `Breakpoint`. We can safely append the new display types needed for the Session List without disrupting the existing chat screens:
- `SessionStatusFilter`
- `StatusIconConfig`
- `SessionListColumn`

### Main Screen (`AgentSessionListScreen.tsx`)
The file currently exists as a placeholder block:
```tsx
import React from "react";

export function AgentSessionListScreen() {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Sessions</text>
      <text fg="gray">Not yet implemented.</text>
    </box>
  );
}
```
It is ready to be completely replaced with the complete implementation from the specification.

## 4. Synthesis and Implementation Path

1. **Data Formatting Utilities**: I have verified the data model shapes. The pure formatting utilities for durations, message counts, and timestamps can be built independently of OpenTUI or React.
2. **Filtering State Machine**: The client-side filter and search custom hook can operate cleanly over the `AgentSession[]` array returned by `useAgentSessions`.
3. **Keybindings Hook**: Based on the context found, we will inject `@opentui/react`'s `useKeyboard` into `useSessionListKeybindings` allowing a decoupled testable structure.
4. **Column Responsiveness**: The terminal width dictates the view layout breakpoint via `getSessionListColumns` and `useTerminalDimensions`.
5. **API Contract Verification**: The existing hooks handle rate-limits and permissions via Codeplane UI core types (`HookError`), and map cleanly back into the error management matrix specified in the requirements.