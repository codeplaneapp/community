# Implementation Plan: TUI Agent Session List Screen

**Ticket:** `tui-agent-session-list`  
**Feature:** `TUI_AGENT_SESSION_LIST`

This document outlines the step-by-step implementation plan for the Codeplane TUI Agent Session List screen, using React 19, OpenTUI, and `@codeplane/ui-core`. It includes the creation of utility functions, custom React hooks, presentational components, the main screen, and full end-to-end test suites.

---

## Step 1: Core Types and Formatting Utilities

All utilities should be pure functions with no React or OpenTUI dependencies.

### 1.1 Extend `apps/tui/src/screens/Agents/types.ts`
Append the following display types without modifying existing types:
- `SessionStatusFilter` (`"all" | "active" | "completed" | "failed" | "timed_out"`)
- `STATUS_FILTER_CYCLE` and `STATUS_FILTER_LABELS` constants.
- `StatusIconConfig` (icon, fallback, color, bold properties).
- `SessionListColumn` (field, width, visible properties).
- Ensure `Breakpoint` is properly exported if not already present.

### 1.2 Implement Utility Functions
Create the following files in `apps/tui/src/screens/Agents/utils/`:
- **`sessionStatusIcon.ts`**: Map `AgentSessionStatus` to `StatusIconConfig` (e.g., `active` -> `●`/`[A]`, `completed` -> `✓`/`[C]`).
- **`formatDuration.ts`**: Calculate `startedAt` to `finishedAt` duration, returning a formatted string (`Xs`, `Xm Ys`, `Xh Ym`).
- **`formatMessageCount.ts`**: Format count, rendering `9999+` for large numbers.
- **`formatTotalCount.ts`**: Format overall list count.
- **`truncateTitle.ts`**: Use `Intl.Segmenter` to safely truncate strings with grapheme awareness and add an ellipsis. Handle null/empty titles by returning a muted fallback.
- **`formatTimestamp.ts`**: Format the creation timestamp, sensitive to layout breakpoint context.
- **`sessionListColumns.ts`**: Implement `getSessionListColumns(breakpoint, width)` to determine which columns are visible based on terminal width (`minimum`, `standard`, `large`).

---

## Step 2: Custom React Hooks

Create custom hooks to separate logic from presentation components in `apps/tui/src/screens/Agents/hooks/`.

### 2.1 `useSessionFilter.ts`
Implement the client-side filtering and search state machine.
- Inputs: `sessions` (`AgentSession[]`)
- State: `activeFilter`, `searchQuery`, `isSearchFocused`
- Returns: memoized `filteredSessions`, state values, action callbacks (`cycleFilter`, `setSearchQuery`, etc.), and `emptyReason` (`none`, `zero_sessions`, `filter_empty`, `search_empty`).

### 2.2 `useSessionListSSE.ts`
Implement a stub hook for SSE status updates.
- Inputs: `repoId`, `onSessionUpdate` callback.
- Implementation: Empty for now. Once `tui-sse-provider` ships, it will use `useSSEChannel('agent_session_${repoId}', handler)`.

### 2.3 `useSessionListKeybindings.ts`
Implement the keybinding dispatcher.
- Inputs: `actions` object with all executable behaviors (`moveFocusDown`, `deleteSession`, etc.), and `statusBarHints`.
- Implementation: Stub using standard React `useEffect` for now. Comment out the `@opentui/react` `useKeyboard` hook import/usage, preparing it for activation when the TUI foundation scaffold is fully ready.

---

## Step 3: Presentational Components

Create stateless OpenTUI components in `apps/tui/src/screens/Agents/components/`.

### 3.1 `SessionRow.tsx`
- Renders an `<box flexDirection="row">` representing a single session.
- Uses utility functions to format duration, icon, title, and timestamp.
- Props: `session`, `focused`, `selected`, `columns`, `breakpoint`, `useTextFallback`.
- Uses the `focused` prop to determine if the row should apply reverse video or active styling.

### 3.2 `SessionFilterToolbar.tsx`
- Renders an `<box flexDirection="row">` spanning `100%` width.
- Left side: Iterates over `STATUS_FILTER_CYCLE` rendering active/inactive status filters.
- Right side: An `<input>` field for search input, reacting to `isSearchFocused`.

### 3.3 `DeleteConfirmationOverlay.tsx`
- Renders a centered `<box position="absolute">` acting as a modal overlay.
- Displays the session title to be deleted, and a warning if the session is still `active`.

### 3.4 `SessionEmptyState.tsx`
- Renders a centered message depending on the `emptyReason` prop (e.g., "No agent sessions yet.", "No active sessions.").

### 3.5 Barrel Export `index.ts`
- Update `apps/tui/src/screens/Agents/components/index.ts` to export all new components.

---

## Step 4: Main Screen Component Orchestration

Replace the placeholder inside `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` with the complete orchestration logic.

### Responsibilities:
- **Data fetching:** Use `@codeplane/ui-core` hooks `useAgentSessions` and `useDeleteAgentSession`.
- **Terminal dimensions:** Use the temporary hardcoded stub `width = 120`, `height = 40` (to be replaced with `useTerminalDimensions()` when shipped).
- **State Management:** Track `focusIndex`, `selectedIds`, `deleteTarget`, and `flashMessage`.
- **Event Handlers:** Build the navigation and action handlers (`handleOpen`, `handleReplay`, `handleDeleteConfirm`).
- **Pagination:** Check `handleScrollNearEnd` against `hasMore` and load additional pages up to the 500 cap.
- **View Layout:** Conditionally render the Error state, Loading state, Empty State, or the main `<scrollbox>` with `SessionRow` components based on fetching state and filtered list availability.

---

## Step 5: Screen Registration and Telemetry Hooks

### 5.1 Registration
If applicable, append the agent list screen to the internal navigation routes.
- Location: `apps/tui/src/navigation/screenRegistry.ts` (or similar file based on the TUI foundation).
- Define `breadcrumb: "Agent Sessions"` and `deepLinkAlias: "agents"`.

### 5.2 Telemetry and Logging Stubs
Add fire-and-forget console logs or NO-OP telemetry calls matching the Product Spec (e.g., `tui.agents.session_list.view`) throughout `AgentSessionListScreen` event handlers. Log levels should respect `CODEPLANE_LOG_LEVEL`.

---

## Step 6: End-to-End Tests

Modify the E2E testing layer for the Agent list. Tests must run using `@microsoft/tui-test` and expect real API execution (failing tests are expected and should be committed).

### 6.1 Extend Helpers
Edit `e2e/tui/helpers.ts`:
- Add `navigateToAgents(terminal)` to simulate sending `g`, `a` keys and waiting for "Agent Sessions" text.
- Add `waitForSessionListReady(terminal)` to wait for "Loading" text to disappear.

### 6.2 Test File Modification
Edit `e2e/tui/agents.test.ts`:
- Create a new `describe("TUI_AGENT_SESSION_LIST", () => { ... })` block.
- Stub out the 121 explicitly requested test cases categorized into:
  - **Terminal Snapshot Tests** (28 tests)
  - **Keyboard Interaction Tests** (42 tests)
  - **Responsive Tests** (14 tests)
  - **Integration Tests** (22 tests)
  - **Edge Case Tests** (15 tests)
- Each test must instantiate `launchTUI`, interact via `sendKeys()`, and assert via `expect(terminal.snapshot()).toMatchSnapshot()` or `waitForText()`.

---

## Productionization Criteria
Throughout development, strictly adhere to established OpenTUI constraints (e.g., `<text>` components over bare strings). Any components missing from the React OpenTUI bindings should use safe, stable stub behaviors (like the dimension hardcoding) with clear TODOs noting the respective foundation ticket blocker (e.g., `tui-foundation-scaffold`, `tui-sse-provider`).