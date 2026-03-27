# Research Document: TUI Issue Close/Reopen Implementation Context

## 1. `apps/tui/` Patterns and Context

### 1.1 Optimistic Mutations and Loading
- **`useOptimisticMutation` Pattern**: Found in `apps/tui/src/hooks/useOptimisticMutation.ts`. It registers mutations via `useLoading().registerMutation`, and on success/failure calls `completeMutation`/`failMutation`. It intentionally avoids using an `AbortController` because background mutations should complete even if the user navigates away. The specification mentions not using this directly for the close/reopen feature since it needs finer lifecycle controls, but the pattern to mimic is clearly defined here.
- **Loading Provider**: `apps/tui/src/providers/LoadingProvider.tsx` provides the `LoadingContext`. It maintains maps of screen loading states and `activeMutations`, as well as a `statusBarError`. Calling `failMutation` automatically displays an error in the status bar for a 5000ms duration.
- **`useLoading` Hook**: Exposes the context (`apps/tui/src/hooks/useLoading.ts`). We can use its `registerMutation`, `completeMutation`, and `failMutation` functions directly when writing the custom `useIssueCloseReopen` hook.

### 1.2 Layout, Status Bar, and Keybindings
- **`useLayout`**: `apps/tui/src/hooks/useLayout.ts` wraps OpenTUI's `useTerminalDimensions` and returns responsive `width`, `height`, `breakpoint`, `contentHeight`, etc.
- **Status Bar**: `apps/tui/src/components/StatusBar.tsx` accesses the current terminal dimensions using `useLayout()` and renders `statusBarError` in red (`theme.error`), truncating it right up to `width - STATUS_BAR_ERROR_PADDING`. It also dynamically displays hints mapped from `useStatusBarHints()`.
- **Keybindings**: `apps/tui/src/hooks/useScreenKeybindings.ts` accepts an array of `KeyHandler` objects (e.g., `{ key: "x", description: "close/reopen", group: "Actions", handler: ... }`) and pushes a `PRIORITY.SCREEN` scope, which automatically maps keybinding descriptions to status bar hints.

### 1.3 Telemetry and Logging
- **Logger**: `apps/tui/src/lib/logger.ts` exports a structured logger (`error`, `warn`, `info`, `debug`) outputting to `stderr` depending on the `CODEPLANE_TUI_LOG_LEVEL` environment variable.
- **Telemetry**: `apps/tui/src/lib/telemetry.ts` exposes an `emit(name: string, properties: Record<string, any>)` function which currently serializes telemetry events as JSON to `stderr` when `CODEPLANE_TUI_DEBUG=true`.

## 2. `context/opentui/` Component APIs

The `@opentui/react` renderer provides a robust set of UI components tailored for terminal layouts, natively matching web-like DOM structures (reference from `context/opentui/packages/react/README.md`):
- **Layout & Display**: `<box>` (flex container), `<scrollbox>` (scrollable container), `<text>` (text element which accepts inner typography modifiers like `<span>` and `<strong>`).
- **Hooks**: 
  - `useKeyboard(handler, options?)` for low-level keystroke handling (though the TUI abstracts this via `useScreenKeybindings`).
  - `useTerminalDimensions()` returns dynamic `{ width, height }` objects for terminal metrics, updating synchronously on resize.
  - `useOnResize(callback)` for side-effects during terminal resize events.
- **Styling**: OpenTUI styling supports classic CSS-like props directly on components (e.g., `flexDirection="column"`, `fg="red"`, `backgroundColor="blue"`) or within an inline `style={{ ... }}` prop.

## 3. `packages/ui-core/` Data Hooks

- The engineering spec refers to `@codeplane/ui-core` which actually maps via the TUI's `package.json` to the workspace package (`@codeplane/sdk` inside `packages/sdk`).
- Although hook definitions specifically described in the spec (e.g., `useUpdateIssue`, `useIssue`, `useIssues`) are part of upcoming/pending ticket merges (referenced in `specs/`), their APIs conform to a `{ mutate: (issueNumber: number, patch: { state: string }) => Promise<void> }` pattern. The implementation logic relies heavily on throwing raw HTTP `Response` objects on non-2xx status codes which need to be processed manually by the `classifyError` utility inside the `useIssueCloseReopen` hook.

## 4. `apps/ui/src/` Web UI Patterns

- A scan of the workspace shows the `apps/ui/` directory does not currently exist. Any behavioral parity should derive directly from the `tui-issue-close-reopen` specification and OpenTUI patterns without explicitly mirroring unseen web components.