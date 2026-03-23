# Research Findings: TUI Workflows Scaffold

## 1. Screen Router Definitions (`apps/tui/src/router/types.ts`)
- The `ScreenName` enum currently contains two workflow-related entries under `// Repo-scoped screens`:
  - `Workflows = "Workflows"`
  - `WorkflowRunDetail = "WorkflowRunDetail"`
- Four new entries need to be added to complete the specification:
  - `WorkflowRunList = "WorkflowRunList"`
  - `WorkflowLogViewer = "WorkflowLogViewer"`
  - `WorkflowArtifacts = "WorkflowArtifacts"`
  - `WorkflowCaches = "WorkflowCaches"`

## 2. Screen Registry (`apps/tui/src/router/registry.ts`)
- `Workflows` and `WorkflowRunDetail` currently map to a generic `PlaceholderScreen` component.
- The file contains a strict validation check at the end:
  ```typescript
  const missingScreens = Object.values(ScreenName).filter(
    (name) => !(name in screenRegistry),
  );
  if (missingScreens.length > 0) {
    throw new Error(`Screen registry is missing entries for: ${missingScreens.join(", ")}`)
  }
  ```
  This enforces that any new screen added to the `ScreenName` enum must be mapped in the registry in the same commit.

## 3. Deep Link Parsing (`apps/tui/src/navigation/deepLinks.ts`)
- `resolveScreenName(input: string)` has an existing mapping for `workflows: ScreenName.Workflows`.
- It needs new mappings:
  - `"workflow-runs"` -> `WorkflowRunList`
  - `"workflow-run"` -> `WorkflowRunDetail`
  - `"workflow-run-detail"` -> `WorkflowRunDetail`
  - `"workflow-log"` -> `WorkflowLogViewer`
  - `"workflow-logs"` -> `WorkflowLogViewer`
  - `"workflow-artifacts"` -> `WorkflowArtifacts`
  - `"workflow-caches"` -> `WorkflowCaches`
- The `requiresRepo` array in `buildInitialStack` explicitly lists `ScreenName.Workflows` and `ScreenName.WorkflowRunDetail`. The 4 new enum values must also be added to this array to ensure the CLI `--repo` flag is enforced correctly.

## 4. Go-To Navigation (`apps/tui/src/navigation/goToBindings.ts`)
- The binding for `g f` is already defined as:
  `{ key: "f", screen: ScreenName.Workflows, requiresRepo: true, description: "Workflows" }`
- `executeGoTo` is implemented to check `binding.requiresRepo` and reset the stack correctly. This aligns with the specification expectations and shouldn't require modification, although E2E tests will verify its behavior.

## 5. Screen Barrel Export (`apps/tui/src/screens/index.ts`)
- Currently mostly empty: `export {};`.
- It needs to be updated to re-export the new directory: `export * from "./Workflows/index.js";`.

## 6. Placeholder Screen Reference (`apps/tui/src/screens/PlaceholderScreen.tsx`)
- The existing `PlaceholderScreen` renders `<box flexDirection="column">` containing `<text bold>{entry.screen}</text>` and `<text color="gray">This screen is not yet implemented.</text>`, followed by parsed params.
- We can cleanly replicate this DOM structure for the 6 new workflow placeholder screens by copying this component structure and overriding the title text dynamically per screen requirements.

## 7. E2E Test Helpers (`e2e/tui/helpers.ts`)
- The helpers provide `launchTUI`, `TERMINAL_SIZES`, `TUI_SRC`, and `TUITestInstance` exports which the new `workflows.test.ts` file needs to orchestrate its assertions.
- Terminal sizes provided: `minimum: { width: 80, height: 24 }`, `standard: { width: 120, height: 40 }`, and `large: { width: 200, height: 60 }`.
- No `workflows.test.ts` file exists currently, meaning it must be scaffolded entirely as per the engineering specification.