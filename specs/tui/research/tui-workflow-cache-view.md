# Research Document: `tui-workflow-cache-view`

## 1. Context and Findings

Based on a thorough exploration of the Codeplane TUI codebase, the current state of the application differs from the idealized state assumed by the engineering specification. Several dependencies are marked as `Implemented` in the spec but have not yet been merged or scaffolded into the repository. 

### Absent Code
- **Target Directory:** The `apps/tui/src/screens/Workflows/` directory does not yet exist. The placeholder `WorkflowCacheViewScreen.tsx` and its barrel exports must be created from scratch.
- **Data Hooks:** The shared `workflow-types.ts`, `useWorkflowCaches.ts`, and `useWorkflowActions.ts` are not present in `apps/tui/src/hooks/`.
- **Components:** The `Modal.tsx` component is missing from `apps/tui/src/components/`. Any overlay/modal implementations will either need to recreate this layout manually (via absolute positioning, as outlined in the spec's `CacheDeleteOverlay` snippet) or implement `Modal.tsx` first.
- **E2E Tests:** `e2e/tui/workflows.test.ts` is not present, meaning the entire suite of 115 tests will need a new file to house them.

## 2. Existing Dependencies & Patterns

Despite the missing workflow-specific scaffolding, the core OpenTUI wrapper utilities and structural hooks are present and match the spec's design patterns perfectly. 

### Layout & Responsive Sizing (`useLayout.ts`)
- **Location:** `apps/tui/src/hooks/useLayout.ts`
- **Details:** Provides a `LayoutContext` object containing `width`, `height`, `contentHeight`, and `breakpoint`. The `breakpoint` value is a union of `"minimum" | "standard" | "large"` (or `null`), which acts as the cornerstone for responsive column truncation in `CacheStatsBanner` and `CacheRow`.

### State UI Components
- **Loading:** `apps/tui/src/components/FullScreenLoading.tsx` expects `spinnerFrame: string` and `label: string` props.
- **Error:** `apps/tui/src/components/FullScreenError.tsx` takes `screenLabel: string` and an `error: LoadingError` object, rendering a centered error state that supports retry hints.

### Spinner Animation (`useSpinner.ts`)
- **Location:** `apps/tui/src/hooks/useSpinner.ts`
- **Details:** Driven by OpenTUI's `Timeline` engine rather than `setInterval()`. Exposes `useSpinner(active: boolean)` which returns the synchronized ASCII or Braille frame (e.g., `"⠋"` or `"-"`). It natively handles Unicode feature detection.

### Keybindings (`useScreenKeybindings.ts`)
- **Location:** `apps/tui/src/hooks/useScreenKeybindings.ts`
- **Details:** Exposes the `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])` hook. It pushes keybindings into the context with `PRIORITY.SCREEN` scope on mount and automatically formats status bar hints for the global `StatusBarHintsContext`. 

### Text Utilities (`util/text.ts`)
- **Location:** `apps/tui/src/util/text.ts`
- **Details:** Exposes `truncateRight` and `fitWidth`. These functions safely truncate strings to an exact `maxWidth` and append an ellipsis (`"…"`) without overflowing terminal columns, which is essential for ensuring `CacheRow` fits exactly within the `width` provided by `useLayout()`.

## 3. Implementation Blueprint

1. **Prerequisite Scaffold:** Ensure `apps/tui/src/hooks/workflow-types.ts` is created containing the definitions for `WorkflowCache`, `WorkflowCacheStats`, `RepoIdentifier`, and API response types.
2. **Component Architecture:** 
   - Build out the local state hooks inside `apps/tui/src/screens/Workflows/hooks/`: `useCacheSort.ts`, `useCacheFilters.ts`, `useCacheDelete.ts`, and the orchestrator `useCacheViewState.ts`.
   - Implement the presentational components in `apps/tui/src/screens/Workflows/components/`: `CacheStatsBanner.tsx`, `CacheFilterBar.tsx`, `CacheRow.tsx`, `CacheDetailPanel.tsx`, and `CacheDeleteOverlay.tsx`.
3. **Screen Orchestration:** Combine these into `WorkflowCacheViewScreen.tsx`. Ensure that it handles Esc-priority correctly (Dismiss filters -> Close Modal -> Collapse expanded items -> Pop screen navigation).
4. **Telemetry & E2E:** Build out `e2e/tui/workflows.test.ts` mapped with `@microsoft/tui-test` helpers to handle the 115 test cases identified in the spec.