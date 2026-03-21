# Research Findings: Workspace E2E Helpers

## 1. Type Interfaces (`WorkspaceResponse` vs `Workspace`)
The engineering specification references `WorkspaceResponse` from `@codeplane/sdk`. However, exploring the monorepo reveals that the `packages/sdk/` package is not present in the workspace. Instead, the relevant types are defined in `packages/ui-core/src/types/workspaces.ts` under the interface name `Workspace`.

- **Available Status Types:** 
  - `WorkspaceStatus`: `"pending" | "starting" | "running" | "suspended" | "stopped" | "failed"`
  - `WorkspaceSessionStatus`: `"running" | "stopped" | "failed"`
- **Fields Required:** `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`.

*Correction for Implementation:* Test fixtures should import `Workspace` from `"@codeplane/ui-core"` instead of `WorkspaceResponse` from `"@codeplane/sdk"`.

## 2. Base Test Infrastructure
The base test infrastructure is located at `e2e/tui/helpers.ts` and accurately provides the `launchTUI` and `TUITestInstance` exports referenced by the spec.
- `LaunchTUIOptions` supports `cols`, `rows`, `env`, `args`, and `launchTimeoutMs`.
- `TUITestInstance` includes the methods: `waitForText`, `waitForNoText`, `snapshot`, `getLine`, `sendKeys`, `terminate`, `resize`.
- These existing primitives align perfectly with the requirements for `launchTUIWithWorkspaceContext()`, `waitForStatusTransition()`, and `assertWorkspaceRow()`.

## 3. SSE Provider & Injection State
The specification instructs modifying `apps/tui/src/providers/SSEProvider.tsx` to add `CODEPLANE_SSE_INJECT_FILE` reading capabilities.
- **Current File State:** `apps/tui/src/providers/` currently only contains `index.ts` and `NavigationProvider.tsx`. `SSEProvider.tsx` does not yet exist.
- **Architecture context:** `apps/tui/src/index.tsx` is mostly a stub but documents the planned provider stack: `AppContext → ErrorBoundary → Auth → API → SSE → Nav → Theme → Keys → Shell`.
- **SSE implementation details:** Actual SSE parsing in the application is managed by `packages/ui-core/src/sse/createSSEReader.ts`, which utilizes `fetch` + `eventsource-parser` instead of the browser `EventSource` API (for Bun and custom header support). 
- *Implementation impact:* Implementing the injection will require creating `SSEProvider.tsx` if it's missing, and writing a file watcher loop that mimics `createSSEReader.ts`'s `onEvent` emissions when `CODEPLANE_SSE_INJECT_FILE` is defined.

## 4. Test Suite Location
- The directory `e2e/tui/helpers/` does not exist and will need to be created for `workspaces.ts` and `__tests__/workspaces.test.ts`.
- `e2e/tui/workspaces.test.ts` does not yet exist and will need to be created to contain the E2E integration tests outlined in the spec.

## 5. ANSI Parsing and Formatting
The spec mandates stripping ANSI codes using `\x1b\[[0-9;]*[a-zA-Z]`. `e2e/tui/helpers.ts` preserves ANSI codes natively by reading the `proc.stdout` stream without filtering (`buffer += new TextDecoder().decode(value)`). 
This confirms the spec's design for `stripAnsi()` and `hasReverseVideo()` (checking for `\x1b[7m`) will function flawlessly when inspecting lines from `TUITestInstance.getLine(lineNumber)` and `TUITestInstance.snapshot()`.