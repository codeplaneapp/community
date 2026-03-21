# Implementation Plan: Shared Test Helpers for Workspace E2E Tests

**Ticket**: `tui-workspace-e2e-helpers`

## Overview
This implementation plan details the steps to create shared test helpers for workspace E2E tests, including workspace test fixtures, terminal navigation helpers, SSE simulation, and row assertion utilities. It directly addresses the constraints and findings from the research phase, primarily using the `Workspace` type from `@codeplane/ui-core` and creating the missing `SSEProvider.tsx`.

## 1. Create Workspace Test Helpers & Fixtures
**File:** `e2e/tui/helpers/workspaces.ts`

- Create the file and directory `e2e/tui/helpers/`.
- Import `Workspace` from `@codeplane/ui-core` (replacing the spec's reference to `WorkspaceResponse`).
- Import `launchTUI`, `TUITestInstance`, and `LaunchTUIOptions` from `../helpers.js`.
- Define deterministic `WORKSPACE_IDS` and `FIXTURE_DEFAULTS`.
- Implement `WORKSPACE_FIXTURES` matching the `Workspace` type for `running`, `suspended`, `starting`, `failed`, `pending`, and `stopped` statuses.
- Implement `createWorkspaceFixture()` builder for custom test variations.
- Implement the navigation wrapper `launchTUIWithWorkspaceContext()` to launch the TUI with a specified repo context and workspace screen.
- Implement `waitForStatusTransition()` to poll `terminal.snapshot()` for specific transition text within given timeouts.
- Implement the SSE helper payload constructors: `createWorkspaceStatusEvent()` and `createSessionStatusEvent()`.
- Implement `createSSEInjectionFile()` which generates a temporary JSONL file and returns `filePath`, `writeEvent(s)`, and `cleanup` methods.
- Implement `launchTUIWithSSEInjection()` which combines `createSSEInjectionFile` and `launchTUIWithWorkspaceContext` using `CODEPLANE_SSE_INJECT_FILE` in the `env`.
- Implement string utilities: `stripAnsi()` and `hasReverseVideo()`.
- Implement `assertWorkspaceRow()` which fetches a specific terminal line, strips ANSI, and validates `WorkspaceRowExpectation` matching.

## 2. Create the SSE Provider with Test Injection Capabilities
**File:** `apps/tui/src/providers/SSEProvider.tsx`
**File:** `apps/tui/src/providers/index.ts` (modify)
**File:** `apps/tui/src/index.tsx` (modify)

- Since `SSEProvider.tsx` does not exist, create it from scratch to wrap children in a React Context.
- **Test Injection Logic:** Include a `useEffect` that checks for `process.env.NODE_ENV === "test"` and `process.env.CODEPLANE_SSE_INJECT_FILE`.
  - If the environment variable is present, use Node's `fs.watch` (or a `setInterval` file reader) to listen for new lines in the specified file.
  - Parse JSON lines and dispatch them as SSE events to the application.
- **Production Logic:** If not in test mode, fallback to standard `@codeplane/ui-core/src/sse/createSSEReader.ts` (or standard `EventSource` setup as defined by the application architecture).
- Update `apps/tui/src/providers/index.ts` to export `SSEProvider`.
- Update `apps/tui/src/index.tsx` to include `<SSEProvider>` in the provider stack.

## 3. Create Barrel Export for E2E Helpers
**File:** `e2e/tui/helpers/index.ts`

- Create the file and export everything from `workspaces.ts`:
  ```typescript
  export * from "./workspaces.js";
  ```

## 4. Implement Unit Tests for Workspace Helpers
**File:** `e2e/tui/helpers/__tests__/workspaces.test.ts`

- Create the directory and file.
- Import `describe`, `test`, `expect` from `bun:test`.
- Implement all unit tests for the helpers as specified in the engineering spec:
  - **Fixture Tests** (e.g., uniqueness, specific field correctness).
  - **SSE Event Construction Tests** (wire format correctness).
  - **SSE Injection File Tests** (temp file creation, read/write, cleanup).
  - **assertWorkspaceRow and String Utility Tests** (ANSI stripping, reverse video matching, throwing on mismatch).

## 5. Implement Workspace E2E Integration Tests
**File:** `e2e/tui/workspaces.test.ts`

- Create the integration test file which exercises the newly built helpers against a real TUI instance.
- Import `launchTUIWithWorkspaceContext`, `waitForStatusTransition`, `launchTUIWithSSEInjection`, etc.
- Port the `HELPER-INT-` tests from the engineering spec to validate that the helpers successfully interact with the TUI.
  - Ensure tests like `HELPER-INT-001` through `HELPER-INT-006` are present.
  - As noted, if the workspace screens themselves are unimplemented in the backend/TUI, these integration tests will fail, which is intended behavior.

## 6. Verification and Formatting
- Run `bun run check` / `tsc` locally to ensure no TypeScript compilation errors exist between `@codeplane/ui-core` types and the new helper functions.
- Ensure `node:fs`, `node:path`, and `node:os` are properly imported using the `node:` protocol prefix.
- Verify all new `.ts` and `.tsx` files adhere to standard formatting configurations (Prettier/ESLint).
- Ensure modifications to the test suites are staged accurately.