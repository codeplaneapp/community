# Research Findings: `tui-repo-conflicts-view`

## 1. Dependency Status: `tui-repo-screen-scaffold`
- **Status:** **Not Implemented.**
- **Findings:** The directory `apps/tui/src/screens/Repository/tabs/` does not exist. `apps/tui/src/screens/` currently only contains `Agents/`, `PlaceholderScreen.tsx`, and `index.ts`. 
- **Implication:** As mentioned in the spec's *Productionization Checklist*, we can still develop `ConflictsTab` in isolation or alongside a placeholder `RepoOverviewScreen`. However, the tab configuration (`apps/tui/src/screens/Repository/tabs/index.ts`) will need to be created or we will have to wait for the scaffold ticket to be completed before full integration.

## 2. Dependency Status: `tui-repo-jj-hooks`
- **Status:** **Not Implemented.**
- **Findings:** There are no hooks matching `useRepoConflicts` in `apps/tui/src/hooks/` and the `apps/tui/src/hooks/data/` directory does not exist yet. Additionally, there is no `packages/ui-core/` directory present in the workspace, and `apps/tui/package.json` does not declare `@codeplane/ui-core` as a dependency.
- **Implication:** Following the spec, a temporary stub must be created at `apps/tui/src/hooks/data/useRepoConflicts.stub.ts` to return mock data for development. This stub will be replaced once the actual backend integration ticket is completed.

## 3. Router configuration (`apps/tui/src/router/types.ts`)
- **Findings:** The `ScreenName` enum contains 26 screens, including `ScreenName.DiffView` and `ScreenName.RepoOverview`. 
- **Missing Screens:** `ScreenName.ChangeDetail` does **not** exist in the router. 
- **Implication:** When handling the `v` keybinding on a change row (which intends to open a change detail view), we should implement the specified fallback: log a warning and potentially display an inline informational message saying "Change detail view not yet available" (or simply treat it as a no-op).

## 4. Text Truncation Utilities
- **Status:** **Available.**
- **Findings:** `apps/tui/src/util/truncate.ts` is fully implemented and exports `truncateText(text, maxWidth)` and `truncateLeft(text, maxWidth)`. 
- **Implication:** `truncateLeft` appends the `…` ellipsis at the beginning and preserves the end of the string, which perfectly matches the requirement for rendering the right-hand side of file paths in `FileRow.tsx`.

## 5. End-to-End Testing (`e2e/tui/`)
- **Status:** Test helpers are available, but the repository test file is missing.
- **Findings:** `e2e/tui/helpers.ts` exists and exposes `launchTUI`, `TUITestInstance`, and `createMockAPIEnv` which are required by the spec. However, `e2e/tui/repository.test.ts` does not exist.
- **Implication:** We will need to scaffold the entire `e2e/tui/repository.test.ts` file, importing helpers from `./helpers.ts`, and implementing all 75 terminal snapshot, keyboard interaction, and responsive tests as detailed in the spec.

## 6. OpenTUI Components & Hooks
- **Status:** **Available.**
- **Findings:** `apps/tui/package.json` relies on `@opentui/react` and `@opentui/core` (`v0.1.90`). `context/opentui/packages/react/src/hooks/` reveals availability of `use-keyboard.ts`, `use-resize.ts`, and `use-terminal-dimensions.ts` (often re-exported internally in the app through `apps/tui/src/hooks/`). 
- **Implication:** We can safely use `<box>`, `<text>`, `<scrollbox>`, and `<input>` as native JSX components. The standard TUI hooks `useTheme`, `useLayout`, and `useScreenKeybindings` are also available in `apps/tui/src/hooks/` and should be utilized for theming, viewport breakpoints, and keyboard input binding respectively.

## 7. Next Steps
Based on these findings, development can proceed by:
1. Scaffolding the `apps/tui/src/screens/Repository/tabs/` directory.
2. Implementing the types (`conflicts-types.ts`) and data processing logic (`useConflictRows.ts`).
3. Building the temporary `useRepoConflicts.stub.ts` to unblock component development.
4. Building the UI components (`ConflictsHeader.tsx`, `ChangeRow.tsx`, `FileRow.tsx`, and `ConflictsTab.tsx`).
5. Creating `e2e/tui/repository.test.ts` and porting the provided test fixtures.