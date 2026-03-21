Rejecting this plan. It is not yet implementation-safe.

1. Data-access contract mismatch: the design/spec says TUI search should consume shared `@codeplane/ui-core` search hooks, but this plan bypasses that and hand-rolls endpoint calls in TUI. If that deviation is intentional, it must be explicit and justified, or the shared hook must be added first.
2. Missing runtime prerequisite: `useSearchTabs` depends on `useAPIClient()` from `@codeplane/ui-core`, but the app bootstrap plan does not include wiring/validating the corresponding provider path for this ticket. This can cause immediate runtime failure when the screen uses the hook.
3. Race-condition gaps in Step 2: `fetchMore`/`retryTab` are keyed off raw `query` instead of the last dispatched query; and there is no request-version guard to prevent stale responses overwriting newer query results.
4. Error typing is underspecified/incorrect: the plan says `HookError` but also describes storing generic `Error`. This breaks the `ApiError | NetworkError` contract and weakens UI error handling.
5. Keyboard behavior is not aligned tightly enough with spec: `Ctrl+U` behavior is context-sensitive (input clears, results list pages up), but the plan tests it as a single global behavior. Required `/`, `Esc` by focus context, `Enter` by focus context, and full list-nav key coverage are incomplete.
6. Scope mismatch: ticket is “search data hooks adapter,” but the plan’s Step 4 requires broad screen-level navigation/responsive assertions without including explicit SearchScreen implementation steps (including `useKeyboard`, `useTerminalDimensions`, `useOnResize` integration).
7. E2E plan is not reproducible as written: no fixture strategy for partial failures/rate limits/retry; no defined mechanism to assert “intermediate network fetches avoided”; and snapshot IDs/counts are inconsistent (`SNAP-SEARCH-001`..`004` for only three declared sizes).
8. Tooling commands are inaccurate for this workspace: `bun run lint`/`prettier` are not defined in current package scripts, so Step 5 is not executable as written.
9. Validation strategy is weak for a data hook: missing deterministic hook-level tests for debounce, abort, pagination cap, and stale-response prevention (E2E-only is insufficient here).

What is good: file targeting is correct (`apps/tui/src/...` and `e2e/tui/...`).