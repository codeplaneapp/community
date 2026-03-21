Not LGTM.

1) @codeplane/ui-core usage is not implementation-safe yet.
- The plan says to import `usePaginatedQuery` and `useMutation` from `@codeplane/ui-core`, but those primitives are not publicly exported from `packages/ui-core/src/index.ts`.
- `apps/tui/package.json` does not currently depend on `@codeplane/ui-core`, so this plan is missing a required dependency/wiring step.
- `useAPIClient` requires provider wiring, but the plan does not include integrating API client provider(s) in `apps/tui/src/index.tsx` (currently just a bootstrap stub).

2) Hook contract mapping is underspecified and internally inconsistent.
- The plan says to “alias or map” ui-core errors to TUI `HookError`, but ui-core `HookError` (`ApiError | NetworkError`) does not match required shape `{ status, message, retryable }`; aliasing is incorrect.
- The plan promises rollback behavior for optimistic mutations, but ui-core `useMutation` `onOptimistic` does not return a rollback function. This is a contract mismatch unless a custom wrapper is explicitly designed.
- The plan does not explicitly require `response.ok` checks + `parseResponseError` in all query/mutation wrappers, so non-2xx responses may be treated as success if `client.request()` is used naively.
- `usePaginatedQuery` internally calls `parseResponse([], new Headers())`; parsers for object payloads (`{ workflows }`, `{ runs }`) must be explicitly defensive. The plan does not call this out and risks runtime errors.

3) Keyboard interaction alignment with TUI design is not correct.
- The engineering-test flow inherited by this plan uses `Ctrl+R` for refetch/retry, while the TUI design/workflow specs define uppercase `R` for retry in error state.
- The plan does not reconcile workflow keyboard behavior with required design priorities (`Esc` context chain, `g g`, `Ctrl+D/U`, status-hint consistency).

4) E2E test step is not feasible as written in current repo state.
- `e2e/tui/helpers.ts` `launchTUI()` is a stub that throws immediately, so adding `e2e/tui/workflows.test.ts` “exactly as spec” will fail due harness incompleteness, not backend behavior.
- Deep-link support used by the planned tests is not implemented for workflows/caches in `apps/tui/src/navigation/deepLinks.ts` (default path returns “deep-link not yet implemented”).
- Workflow screens are placeholders; the plan does not include the minimum screen/harness prerequisites needed for keyboard-driven assertions.

5) Path targeting is mostly correct but incomplete.
- The proposed new hook files are correctly scoped to `apps/tui/src/hooks/` and tests to `e2e/tui/`.
- However, required companion updates (dependency declaration, provider/app wiring, deep-link readiness, and runnable E2E harness) are missing, so the plan is not production-implementable end-to-end.