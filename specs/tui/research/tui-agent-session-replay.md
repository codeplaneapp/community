# Research Findings: TUI Agent Session Replay Screen

## 1. Existing TUI Patterns (`apps/tui/`)

### `AgentSessionReplayScreen.tsx`
- The file currently contains a minimal stub implementation:
  ```tsx
  import React from "react";
  import { useNavigation } from "../../hooks/useNavigation.js";

  export function AgentSessionReplayScreen() {
    const { current } = useNavigation();
    const sessionId = current.params?.sessionId ?? "(unknown)";

    return (
      <box flexDirection="column" padding={1}>
        <text bold>Agent Session Replay</text>
        <text fg="gray">Session: {sessionId}</text>
        <text fg="gray">Not yet implemented.</text>
      </box>
    );
  }
  ```
- It accesses the `sessionId` via `current.params?.sessionId`. It will need to be completely rewritten to accommodate the extensive layout, fetching, and search logic described in the spec.

### Component Progress (`MessageBlock.tsx` & `ToolBlock.tsx`)
- Contrary to the engineering spec which suggested `MessageBlock.tsx` and `ToolBlock.tsx` were `export {};` stubs, **substantial implementations already exist** in the repository.
- **`MessageBlock.tsx`**: Uses `useTerminalDimensions`, renders `text` parts via `<markdown>` and `tool_call`/`tool_result` parts via `<ToolBlock>`. Handles padding breakpoints via a configuration dictionary (`PADDING_CONFIG`) and correctly styles role labels (`user`, `assistant`, `system`, `tool`). Includes an animated braille spinner for streaming.
- **`ToolBlock.tsx`**: Includes truncation logic (`MAX_CONTENT_BYTES = 64KB`), handles expanded and collapsed view states, and uses Unicode vs. ASCII indicators based on color tier capabilities. Expects `variant="call"` or `variant="result"`.

### Types (`types.ts`)
- Contains robust type definitions, including `AgentMessage`, `MessageRole` (`"user" | "assistant" | "system" | "tool"`), and `MessagePart` unions.

## 2. Shared Data Hooks (`packages/ui-core/`)

### `useAgentSession.ts`
- Exports the `useAgentSession(owner, repo, sessionId)` hook.
- Fetches the metadata from `/api/repos/${owner}/${repo}/agent/sessions/${sessionId}` via an `AbortController` and `useAPIClient`.
- Returns `{ session, isLoading, error, refetch }`. Automatically parses network/response errors into a typed `HookError`.

### `useAgentMessages.ts`
- Exports the `useAgentMessages(owner, repo, sessionId, options)` hook.
- Wraps an internal `usePaginatedQuery` hook to load messages from `/api/repos/${owner}/${repo}/agent/sessions/${sessionId}/messages`.
- Supports an `autoPaginate` flag (crucial for loading the full transcript for replay) and handles a running total count.
- Coerces raw parts and parts indexes into the `AgentMessage` struct.
- Returns `{ messages, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.

## 3. OpenTUI Context & Architecture
- OpenTUI components (`<box>`, `<text>`, `<markdown>`, `<code filetype="json">`) are successfully referenced across the codebase.
- `useTerminalDimensions` is heavily utilized to adjust layouts, matching the required breakpoint system (`minimum`, `standard`, `large`).
- Keyboard bindings in OpenTUI applications are typically handled via `useKeyboard()` or bespoke navigation contexts, which will be essential for satisfying the "vim-style" interaction specs (`j`, `k`, `]`, `[`, `x`, `/`).

## 4. Web UI Patterns (`apps/ui/`)
- The `apps/ui/` directory does not exist in the current workspace snapshot. Therefore, exact 1:1 behavioral mirroring will rely entirely on the provided Engineering Spec and the shared behaviors codified in `@codeplane/ui-core` hooks.