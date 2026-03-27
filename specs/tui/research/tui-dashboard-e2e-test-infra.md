# Research Findings: Codeplane TUI Dashboard E2E Test Infrastructure

This document provides comprehensive context from the Codeplane repository to support the implementation of the `tui-dashboard-e2e-test-infra` ticket. The goal of this ticket is to set up robust end-to-end test infrastructure for the TUI Dashboard screen.

## 1. Existing Test Infrastructure (`e2e/tui/helpers.ts`)

The shared TUI testing utilities already export a robust foundation for interacting with the TUI process. Key exports include:

*   **`launchTUI(options?: LaunchTUIOptions): Promise<TUITestInstance>`**
    Spawns a fresh TUI process using a real PTY via `@microsoft/tui-test`. It provides isolated config directories, deterministic environment variables (`TERM=xterm-256color`, `COLORTERM=truecolor`), and returns a controller instance.
*   **`TUITestInstance` Interface**
    The controller for test assertions and interactions:
    *   `sendKeys(...keys: string[])`: Simulates human key presses (e.g., `"Enter"`, `"j"`, `"ctrl+c"`).
    *   `sendText(text: string)`: Sends literal text input.
    *   `waitForText(text: string)` / `waitForNoText(text: string)`: Blocks until text appears/disappears from the buffer.
    *   `snapshot()`: Returns the full viewable terminal buffer as a string (used with `expect(...).toMatchSnapshot()`).
    *   `getLine(lineNumber: number)`: Returns a specific row.
    *   `resize(cols: number, rows: number)`: Triggers a `SIGWINCH` resize.
    *   `terminate()`: Cleans up the PTY and background processes.
*   **`TERMINAL_SIZES`**
    Standard breakpoints matching the design spec:
    *   `minimum`: 80x24
    *   `standard`: 120x40
    *   `large`: 200x60
*   **`createMockAPIEnv(options)`**
    Generates environment variables (`CODEPLANE_API_URL`, `CODEPLANE_TOKEN`) pointing the TUI at a mock API or local daemon for deterministic data.
*   **`resolveKey(key)`**
    Translates human-readable keys (like `"Escape"`, `"Tab"`, `"ArrowUp"`) into the exact enums `@microsoft/tui-test` expects.

## 2. Established TUI Test Patterns (`e2e/tui/agents.test.ts`)

An investigation of `agents.test.ts` reveals the canonical pattern for testing TUI screens. This structure should be closely replicated for the Dashboard:

1.  **Fixture Interfaces:** Test-local interfaces (e.g., `AgentSessionFixture`) that match the API JSON shapes, completely decoupled from actual server-side types.
2.  **Inline Fixture Data:** Hardcoded arrays of mocked responses representing realistic states, edge cases (unicode, extremely long titles), and empty states.
3.  **Screen-Specific Helpers:** Functions composing multiple interactions, like `navigateToAgents(terminal)` or `createSession(terminal, title)`.
4.  **Organized Describe Blocks:** Tests are grouped semantically:
    *   `Terminal Snapshot Tests`
    *   `Keyboard Interaction Tests`
    *   `Responsive Tests`
    *   `Integration Tests`
    *   `Edge Case Tests`
5.  **Test ID Prefixes:** Every test string starts with a unique ID (e.g., `SNAP-AGENT-LIST-001`) to trace back to PRD requirements.
6.  **Cleanup Hooks:** Using `afterEach` to reliably call `await terminal.terminate()`.

## 3. Data Types (`packages/sdk/src/services/user.ts`)

To build accurate Dashboard fixtures, we must align with the exact JSON shapes returned by the `@codeplane/sdk` and API layer. The relevant types found in the SDK source are:

*   **`UserProfile`**
    ```typescript
    { id: number, username: string, display_name: string, email: string, bio: string, avatar_url: string, is_admin: boolean, created_at: string, updated_at: string }
    ```
*   **`RepoSummary`**
    ```typescript
    { id: number, owner: string, full_name: string, name: string, description: string, is_public: boolean, num_stars: number, default_bookmark: string, created_at: string, updated_at: string }
    ```
*   **`OrgSummary`**
    ```typescript
    { id: number, name: string, description: string, visibility: string, website: string, location: string }
    ```
*   **`ActivitySummary`**
    ```typescript
    { id: number, event_type: string, action: string, actor_username: string, target_type: string, target_name: string, summary: string, created_at: string }
    ```

*Note: Timestamps in test fixtures should be hardcoded strings (e.g., `"2026-03-20T14:30:00Z"`) rather than `new Date().toISOString()` to ensure snapshots remain deterministic.* 

## 4. TUI Application State (`apps/tui/src/router/registry.ts`)

The dashboard screen (`ScreenName.Dashboard`) is currently registered to the `PlaceholderScreen` component in the application router. The router configuration (`requiresRepo: false`, `requiresOrg: false`, `breadcrumbLabel: () => "Dashboard"`) dictates how the global layout renders the breadcrumbs and what parameters are mandated. The test scaffold must recognize that the underlying implementation (the panels themselves) does not yet exist. Tests validating panel focus or populated lists are *expected to fail* at this stage of the ticket lifecycle.

## 5. OpenTUI Hook Precedents (`context/opentui/packages/react`)

When writing complex, responsive interactions for the TUI, the underlying UI primitives heavily utilize OpenTUI custom hooks:

*   **`useTerminalDimensions()`**: Returns `{ width, height }` of the current terminal instance. This will be required when asserting responsive layouts (e.g., transitioning between the 80x24 single-column minimum and the 120x40 multi-panel grid).
*   **`useOnResize(callback)`**: Subscribes to terminal resize events (`SIGWINCH`) to synchronously recalculate layout.
*   **`useKeyboard(handler, options?)`**: The standard event handler for all vim-style keybindings (like `j`, `k`, `h`, `l`, `Tab`, `Shift+Tab`).

## Summary

Implementing the `tui-dashboard-e2e-test-infra` ticket will involve creating robust, standalone TypeScript types for the required data, mocking out a diverse set of repositories, orgs, and activity feeds to test all edge cases, and constructing specific test helpers to simulate a user cycling focus between the four dashboard panels. Following the exact structure laid out in `agents.test.ts` and leveraging the shared `TUITestInstance` utilities will fulfill the requirements effectively.