# Research Findings for TUI Ticket: `tui-repo-jj-hooks`

Based on an investigation of the codebase, here are the findings relevant to implementing the jj-native data hooks for the TUI.

## 1. Directory State (`apps/tui/src/hooks/data/`)

**Finding:** The `apps/tui/src/hooks/data/` directory does **not** currently exist.

**Impact:** This confirms the assumption in the spec that the prerequisite ticket (`tui-repo-data-hooks`) has not yet been merged or shipped. In accordance with **Step 7: Productionize** of the implementation plan, the initial infrastructure will need to be created. This includes:
- Creating the `apps/tui/src/hooks/data/` directory.
- Adding `useTUIFetch.ts` as the base fetch wrapper.
- Adding `types.ts` for base data types.

## 2. Backend Ground Truth (`apps/server/src/routes/jj.ts`)

**Finding:** The Hono API definitions in `apps/server/src/routes/jj.ts` exactly match the API contracts described in the specification.

- **Wire Types:** The server defines `ChangeResponse`, `ChangeConflictResponse`, and `OperationResponse` in `snake_case` exactly as anticipated. 
- **Pagination:** Uses `parsePagination(c)` which extracts `cursor` and `limit` from query parameters, capping `limit` at 100 and defaulting to 30. The response shape is confirmed as `CursorResponse<T> { items: T[], next_cursor: string }`.
- **Endpoint Status:** All relevant endpoints (e.g., `GET /api/repos/:owner/:repo/changes`, `GET /api/repos/:owner/:repo/changes/:change_id/conflicts`, and `GET /api/repos/:owner/:repo/operations`) currently return `501 Not Implemented` via `notImplementedErr("...")` and `writeError()`. Tests that make network requests to these endpoints will legitimately fail, as the spec states.

## 3. TUI Context Providers (`apps/tui/src/providers/APIClientProvider.tsx`)

**Finding:** The `APIClientProvider` is functional and provides exactly what is needed for `useTUIFetch`.

- It exposes a `useAPIClient()` hook.
- The underlying context yields an `APIClient` interface with `baseUrl: string` and `token: string`.
- It acts as a lightweight stub replacing `@codeplane/ui-core`'s data hooks layer.

## 4. Error Handling Types (`apps/tui/src/loading/types.ts`)

**Finding:** The `LoadingError` type is defined and provides a rigid structure for propagating API errors to the UI.

- Shape: `{ type: "network" | "timeout" | "http_error" | "auth_error" | "rate_limited", httpStatus?: number, summary: string }`.
- Adapters mapping 401s to `auth_error` and 501s to `http_error` (to be implemented in `useTUIFetch.ts`) will cleanly align with this type.

## 5. E2E Test Helpers (`e2e/tui/helpers.ts`)

**Finding:** The `@microsoft/tui-test` orchestration helpers exist and are fully featured.

- `launchTUI()` provides a real PTY and handles dimensions, environments, and mocked server setup.
- `TERMINAL_SIZES` is exported for snapshot testing at 80x24, 120x40, and 200x60.
- **Missing:** The tab navigation helpers (`navigateToChangesTab`, `navigateToConflictsTab`, `navigateToOperationLog`) proposed in the spec do not exist in `e2e/tui/helpers.ts`. They must be appended to this file during implementation as outlined in the spec's test helpers section.

## Conclusion
All architectural assumptions made in the engineering specification are accurate and reflect the current state of the repository. The implementation can proceed exactly according to the step-by-step plan, starting with creating the missing `hooks/data` structure before moving on to the jj-native `useCursorPagination` primitive and specific endpoints.