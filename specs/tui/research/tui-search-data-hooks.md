# Research Findings for TUI Search Data Hooks

## 1. API Client Integration
- The HTTP client is available via `useAPIClient()` exported from `@codeplane/ui-core/src/client/index.js`.
- `const client = useAPIClient()` provides an instance with a `request(url: string, init?: RequestInit)` method.
- The `APIClientProvider` wraps the TUI root. If `useAPIClient` is called outside its context, it throws an error. 
- Passing an `AbortController.signal` into `client.request` is standard practice and fully supported for handling cancellations.

## 2. Error Handling
- The file `packages/ui-core/src/types/errors.ts` exports the standard error primitives:
  - `ApiError`: Captures `status`, `code`, `detail`, and `fieldErrors`.
  - `NetworkError`: Indicates connection failures (`NETWORK_ERROR`).
  - `HookError`: A union type (`ApiError | NetworkError`) which acts as the generic error type returned by hooks.
- `parseResponseError(response: Response): Promise<ApiError>` is the standard utility for mapping non-2xx `Response` objects into an `ApiError`. It parses the JSON payload to extract `message` and `errors` safely.

## 3. Existing TUI Hook Patterns
- An inspection of `apps/tui/src/hooks/` (e.g., `useWorkflowActions.ts`, `useQuery.ts`) confirms the architecture:
  - Hooks import `useAPIClient` and `parseResponseError` / `NetworkError` directly from `@codeplane/ui-core/src/...`.
  - Types are typically aggregated or redefined in localized typing files (e.g., `workflow-types.ts` aliases `HookError` directly from UI core).
  - Managing complex React states (`useState`, `useEffect`, `useCallback`, `useRef`) inside the hooks and handling pagination flows inline is the established norm for TUI-specific view models.

## 4. End-to-End Testing (`e2e/tui/`)
- Test files use `bun:test` (`describe`, `test`, `expect`).
- TUI test orchestration relies heavily on `import { launchTUI } from "./helpers.js";`.
- The `launchTUI` function returns a `TUITestInstance` which exposes keyboard and layout primitives:
  - `terminal.sendKeys("g", "s")`
  - `terminal.sendText("search query")`
  - `terminal.waitForText(/Repositories \(\d+\)/)`
  - `terminal.resize(80, 24)`
  - `terminal.snapshot()`
- The tests operate against the real daemon or test server environment; no HTTP/API mocking occurs at this layer. Network errors due to unimplemented backend routes are an acceptable state for these tests per the project's philosophy.

## 5. UI/TUI Component Parity
- The paths `apps/ui/src/` and `context/opentui/` were not found in the repository root for the current environment. Therefore, OpenTUI component consumption will strictly follow the provided specification documentation (e.g., `<box>`, `<text>`, `<scrollbox>`, `<input>`) and standard React 19 methodologies.
