# TUI RepoList Screen Research Findings

## 1. Current State of the Codebase

### Screen Navigation and Registry
- **Router Registry**: `apps/tui/src/router/registry.ts` exists and maps all screen definitions. `ScreenName.RepoList` is currently mapped to `PlaceholderScreen`. This file will need to be updated to import and use the new `RepoListScreen`.
- **Go-To Mode Bindings**: `apps/tui/src/navigation/goToBindings.ts` defines the global `g` hotkeys (e.g., `g r` for repositories). The interface `GoToBinding` expects a `ScreenName` and `requiresRepo`. To support the `g g` jump-to-top interaction described in the PRD, the interface will either need to be modified to handle an `action` type or a local `g g` chord detector with a timeout will need to be implemented within `RepoListScreen.tsx`.
- **Keybindings Provider**: `apps/tui/src/providers/KeybindingProvider.tsx` sets up contextual bindings correctly via `useKeyboard`. All specific hotkeys described in the spec (`j`, `k`, `/`, `o`, `v`, `w`, `c`, `s`) can be attached at the screen level using `useScreenKeybindings`.

### Application UI Components
- The repository already has standard layout primitives via OpenTUI (`<box>`, `<scrollbox>`, `<text>`, `<input>`) and several pre-built TUI components found in `apps/tui/src/components/`.
- Relevant utility components available for reuse:
  - `FullScreenLoading.tsx`
  - `FullScreenError.tsx`
  - `PaginationIndicator.tsx`
  - `StatusBar.tsx` (reads descriptions automatically from bindings via `useScreenKeybindings` to display hints)

### Shared Hooks Dependency (`@codeplane/ui-core`)
- The `packages/ui-core` directory does not currently exist. 
- **Critical Action**: As dictated by the PRD's "Productionization Path", the `useRepos` data hook is a known unmet dependency (`tui-repo-data-hooks` ticket). Code referencing it in `useRepoListData.ts` must use dynamic imports alongside `@ts-expect-error` annotations so the project compiles successfully until the dependency is resolved. Do not try to mock or stub out a fake provider; follow the PRD strictly.

## 2. OpenTUI & Terminal Constraints
- **OpenTUI Core**: The UI renders entirely based on React reconciler primitives (`context/opentui/packages/react/`).
- **Formatting Tools**: Pure formatting strings must be tightly controlled due to fixed column widths. The planned `apps/tui/src/screens/RepoList/format.ts` handles truncation (`fitWidth`, `truncateText`), preventing layout shifting.
- **Responsive Bounds**: Components use the `useLayout()` hook to retrieve standard boundaries (`large`, `standard`, `minimum`). The `useColumnLayout.ts` specification will directly leverage this to collapse columns when terminal dimensions drop below 120 columns or to 80x24.

## 3. Recommended Implementation Roadmap
1. **Data Types & Format Utilities**: Establish `types.ts`, `useColumnLayout.ts`, and `format.ts` first, as they are pure logic.
2. **Test File Setup**: Introduce `e2e/tui/repo-list-format.test.ts` early to write pure functional tests for truncating/formatting without invoking terminal snapshots.
3. **Hooks & State**: Build `useRepoFilters.ts` (client-side substring/filter) and `useRepoListData.ts` (with `@ts-expect-error` imports to the non-existent API client).
4. **React Components**: Layer `RepoRow.tsx`, `ColumnHeaders.tsx`, and `FilterToolbar.tsx`.
5. **Screen Composition**: Combine them into `RepoListScreen.tsx`, registering keybindings for sorting (`o`), visibility (`v`), star toggling (`s`), etc.
6. **Wiring & Routing**: Swap `PlaceholderScreen` to `RepoListScreen` in `apps/tui/src/router/registry.ts`.
7. **E2E Terminal Tests**: Implement keyboard interactions and snapshot coverage in `e2e/tui/repository.test.ts` using `@microsoft/tui-test`.