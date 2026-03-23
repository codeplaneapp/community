# Implementation Plan: `tui-workflow-screen-scaffold`

This document outlines the step-by-step implementation for scaffolding the Workflows screen directory, placeholder components, screen registry entries, deep-link navigation, and the corresponding end-to-end tests for the Codeplane TUI.

## 1. Update Screen Enums
**File:** `apps/tui/src/router/types.ts`

Add four new `ScreenName` entries grouped with the existing workflow screens under `// Repo-scoped screens`:
```typescript
// Workflow screens
Workflows = "Workflows", // Existing
WorkflowRunList = "WorkflowRunList",
WorkflowRunDetail = "WorkflowRunDetail", // Existing
WorkflowLogViewer = "WorkflowLogViewer",
WorkflowArtifacts = "WorkflowArtifacts",
WorkflowCaches = "WorkflowCaches",
```

## 2. Scaffold Workflow Screens Directory & Placeholders
**Directory:** `apps/tui/src/screens/Workflows/`

Create the following file structure with OpenTUI placeholder components. Each component must follow the established `<box>` and `<text>` pattern from the spec, extracting and displaying routing params.

*   **`WorkflowListScreen.tsx`**:
    Renders `<text bold>Workflows</text>` and `"This screen is not yet implemented."`.
*   **`WorkflowRunListScreen.tsx`**:
    Renders `<text bold>Workflow Runs</text>` and the unimplemented message.
*   **`WorkflowRunDetailScreen.tsx`**:
    Extracts `entry.params.runId`. Renders `<text bold>{runId ? \`Workflow Run #${runId}\` : "Workflow Run Detail"}</text>` and the unimplemented message.
*   **`WorkflowLogViewer.tsx`**:
    Renders `<text bold>Workflow Log Viewer</text>` and the unimplemented message.
*   **`WorkflowArtifactsView.tsx`**:
    Renders `<text bold>Workflow Artifacts</text>` and the unimplemented message.
*   **`WorkflowCacheView.tsx`**:
    Renders `<text bold>Workflow Caches</text>` and the unimplemented message.
*   **`index.ts`** (Barrel export):
    ```typescript
    export { WorkflowListScreen } from "./WorkflowListScreen.js";
    export { WorkflowRunListScreen } from "./WorkflowRunListScreen.js";
    export { WorkflowRunDetailScreen } from "./WorkflowRunDetailScreen.js";
    export { WorkflowLogViewer } from "./WorkflowLogViewer.js";
    export { WorkflowArtifactsView } from "./WorkflowArtifactsView.js";
    export { WorkflowCacheView } from "./WorkflowCacheView.js";
    ```

## 3. Update the Main Screen Barrel Export
**File:** `apps/tui/src/screens/index.ts`

Update the currently empty export to expose the new Workflows directory:
```typescript
/**
 * Screen components for the TUI application.
 */
export * from "./Workflows/index.js";
```

## 4. Register Screens in the Router
**File:** `apps/tui/src/router/registry.ts`

Import the new components from `../screens/Workflows/index.js`.
Replace the `Workflows` and `WorkflowRunDetail` generic placeholders, and append the 4 new definitions to the `screenRegistry` object. 

Ensure properties are strictly set:
*   `requiresRepo: true` for all six.
*   `requiresOrg: false` for all six.
*   **Breadcrumb Logic**:
    *   `Workflows`: `() => "Workflows"`
    *   `WorkflowRunList`: `(p) => p.workflowName ? \`\${p.workflowName} Runs\` : "Runs"`
    *   `WorkflowRunDetail`: `(p) => (p.runId ? \`Run #\${p.runId}\` : "Run")`
    *   `WorkflowLogViewer`: `(p) => (p.stepName ? \`Logs: \${p.stepName}\` : "Logs")`
    *   `WorkflowArtifacts`: `() => "Artifacts"`
    *   `WorkflowCaches`: `() => "Caches"`

## 5. Wire Deep-Link Parsing
**File:** `apps/tui/src/navigation/deepLinks.ts`

1.  **Add string mappings in `resolveScreenName()`**:
    ```typescript
    "workflow-runs": ScreenName.WorkflowRunList,
    "workflow-run": ScreenName.WorkflowRunDetail,
    "workflow-run-detail": ScreenName.WorkflowRunDetail,
    "workflow-log": ScreenName.WorkflowLogViewer,
    "workflow-logs": ScreenName.WorkflowLogViewer,
    "workflow-artifacts": ScreenName.WorkflowArtifacts,
    "workflow-caches": ScreenName.WorkflowCaches,
    ```
2.  **Add to `requiresRepo` array in `buildInitialStack()`**:
    Ensure `ScreenName.WorkflowRunList`, `ScreenName.WorkflowLogViewer`, `ScreenName.WorkflowArtifacts`, and `ScreenName.WorkflowCaches` are present in the `.includes(...)` check alongside `Workflows` and `WorkflowRunDetail` so missing `--repo` errors throw properly for CLI invocations.

## 6. Write End-to-End Tests
**File:** `e2e/tui/workflows.test.ts`

Create a new test file utilizing `@microsoft/tui-test` via `launchTUI`. Include the exact test suites defined in the engineering spec:
1.  **Directory structure and file scaffold:** Assert `existsSync` on all 6 new TSX files + `index.ts` in `TUI_SRC/screens/Workflows/`.
2.  **Screen registry validation:** Assert the enum properties evaluate correctly, verify component maps to the correct names vs `PlaceholderScreen`, and confirm properties like `requiresRepo === true`.
3.  **Breadcrumb labels:** Test unit behaviors of `breadcrumbLabel` functions directly from `screenRegistry`.
4.  **Deep-link argument parsing:** Verify `buildInitialStack` returns expected top stack entries and appropriate errors if `--repo` is omitted.
5.  **Go-to binding definition:** Confirm `goToBindings` includes `f` pointing to `Workflows` and `executeGoTo` works as expected or gracefully errors without repo context.
6.  **Placeholder screen rendering (E2E):** Launch actual TUI instances against `--screen workflows`, `--screen workflow-runs`, etc., using `launchTUI`. Ensure snapshots contain "not yet implemented", handle parameter extraction correctly, and honor sizing (e.g., standard, minimum, large constraints).
7.  **Go-to mode E2E:** Drive keystrokes via `tui.sendKeys("g", "f")` from a context with and without a repo.
8.  **Breadcrumb rendering E2E:** Verify the breadcrumb strings are printed in the header by asserting `tui.getLine(0)` includes the correct path elements.

*(Note: Tests will be left failing if upstream dependencies like an API server stub or full go-to `useTimeline` hook aren't wired up. They serve as behavior documentation.)*