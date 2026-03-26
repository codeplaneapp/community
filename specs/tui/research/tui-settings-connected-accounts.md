# Research: TUI Settings Connected Accounts

This document outlines the relevant codebase context, patterns, and existing structures required to implement the `tui-settings-connected-accounts` engineering specification.

## 1. Data Layer Patterns (`@codeplane/ui-core`)

The application relies on a shared `@codeplane/ui-core` package (located under `packages/ui-core/` or `specs/tui/packages/ui-core/` depending on workspace mapping) for data access.

*   **Data Fetching (Queries):** Existing hooks like `useIssues` (`specs/tui/packages/ui-core/src/hooks/issues/useIssues.ts`) rely on `useAPIClient()` from `../../client/context.js`. 
    *   For `useConnectedAccounts` (`GET /api/user/connections`) and `useSSHKeys` (`GET /api/user/keys`), you will need to implement a query mechanism. If the response is paginated, wrap `usePaginatedQuery` (`specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`). If unpaginated, construct a simple `useEffect`/`useState` pattern fetching the endpoint.
    *   `d`: Trigger disconnect validation (check `isLastAuthMethod`). If valid, set `showConfirmDialog(true)`.
    *   `y`: If dialog is open, execute `disconnectHook.mutate(focusedAccount.id)`.
    *   `n` / `Esc`: Close detail view or confirmation dialog.

## 5. End-to-End Tests (`e2e/tui/settings.test.ts`)

*   All tests must be placed in `e2e/tui/settings.test.ts` using the `@microsoft/tui-test` framework.
*   You will need to construct test cases for:
    1.  **Terminal Snapshots:** Rendering at 120x40, 80x24, and 200x60 breakpoints. Validating empty state rendering and the absolute positioning of the confirmation modal.
    2.  **Keyboard Interactions:** Simulating `j/k` navigation bounds, `Enter` to open details, and the `d -> y` disconnect flow.
    3.  **Error States:** Mocking API responses to return `409` (last-auth-method) or `429` (rate limit) during the DELETE operation and verifying the inline error messages and flash messages appear correctly.