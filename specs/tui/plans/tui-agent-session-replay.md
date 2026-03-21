# Implementation Plan: TUI Agent Session Replay Screen

**Ticket**: `tui-agent-session-replay`
**Target**: Codeplane TUI

This implementation plan outlines the step-by-step approach to fully implement the read-only transcript viewer for completed, failed, and timed_out agent sessions, strictly following the engineering specification and the OpenTUI architecture.

## Step 1: Update Existing Component Implementations

**Goal**: Extend the existing `MessageBlock` and `ToolBlock` components to fully support the replay requirements, such as expand/collapse state injection, search highlighting, and focus tracking.

1. **`apps/tui/src/screens/Agents/components/ToolBlock.tsx`**
   - Update props to accept `expanded: boolean`, `onToggle: () => void`, and `focused?: boolean`.
   - Ensure the truncation logic correctly handles up to 64KB limitations.
   - Style the focus state (e.g., using inverse video or an outline if `focused` is true).
2. **`apps/tui/src/screens/Agents/components/MessageBlock.tsx`**
   - Add read-only rendering support for historical interactions.

## Step 2-5: Implement Data Fetching, Layout, and Routing

- Implement data fetching hooks using `@codeplane/ui-core` to load the completed agent sessions.
- Build the static transcript renderer using OpenTUI's `<scrollbox>` and flex layouts to display the chat history.
- Connect global keybindings using `useKeyboard` for Vim-style (j/k) scrolling, search overlays, and interaction triggers.
- Update `apps/tui/src/screens/Agents/index.tsx` to route active ones to `AgentChat` and inactive ones to `AgentSessionReplay`.

## Step 6: E2E Test Suite Scaffold & Integration

**Goal**: Provide 100% test coverage matching the spec using `@microsoft/tui-test`.

1. **`e2e/tui/agents.test.ts`**
   - Append the 94 new tests defined in the engineering spec within `describe("TUI_AGENT_SESSION_REPLAY", ...)`.
   - Ensure snapshots run successfully (e.g. `expect(terminal.snapshot()).toMatchSnapshot()`).
   - Include sections for: Terminal Snapshots, Keyboard Interaction, Responsive Layout, Integration, and Edge Cases.

## Step 7: Final QA & Validation

- Validate that all SSE aborts and `AbortController` cancelations correctly fire when hitting `q` mid-load.
- Ensure `OSC 52` gracefully degrades if the user terminal lacks support.
- Test performance limits by passing a mocked 500-message session and checking `<scrollbox>` scroll lag.
- Use `bun test e2e/tui/agents.test.ts` to confirm correct alignment to golden files.