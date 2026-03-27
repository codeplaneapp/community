# Research Findings for `tui-issue-list-filters`

## 1. `apps/tui/` Context
- **Screens Structure**: Screens are generally located in `apps/tui/src/screens/`. The `IssuesScreen` itself does not yet exist. The `PlaceholderScreen.tsx` currently serves as the stub for unimplemented screens.
- **Layout and Theme**: 
  - `apps/tui/src/hooks/useLayout.ts` provides responsive breakpoints (`minimum`, `standard`, `large`), current width/height, and `sidebarVisible` state. It's built on top of OpenTUI's `useTerminalDimensions`.
  - `apps/tui/src/theme/tokens.ts` (along with `useTheme.ts`) handles semantic token mapping (e.g., `primary`, `muted`, `surface`, `border`, `error`, `success`, `warning`). Theme values resolve to `RGBA` color instances compatible with `@opentui/core`. Text attributes are exposed via the `TextAttributes` constant (e.g., `TextAttributes.BOLD`, `TextAttributes.REVERSE`).
- **Shared Components**: `apps/tui/src/components/` holds several utility components like `PaginationIndicator.tsx`, `SkeletonList.tsx`, `OverlayLayer.tsx`, `StatusBar.tsx`, and `HeaderBar.tsx`.
- **Utils**: Text formatting tools, like `truncateRight`, are located in `apps/tui/src/util/text.ts` and `apps/tui/src/util/truncate.ts`.

## 2. `packages/ui-core/` Context
- The `ui-core` package is currently placed at `specs/tui/packages/ui-core/` in the repository, rather than at the root `packages/` directory. 
- **Relevant Data Hooks** (`specs/tui/packages/ui-core/src/hooks/issues/`):
  - `useIssues(owner, repo, options)`: Returns paginated `issues`, `isLoading`, `error`, `hasMore`, `fetchMore`, `refetch`, `totalCount`. It accepts `state`, `perPage`, and `enabled` in its options.
  - `useRepoLabels(owner, repo, options)`: Returns `labels` using a similar paginated API signature.
  - `useRepoMilestones(owner, repo, options)`: Returns `milestones`.
- **Types** (`specs/tui/packages/ui-core/src/types/issues.ts`): Defines types like `Issue`, `IssueState` (`"open" | "closed"`), `Label`, and `Milestone`, which map directly to our component props and filtering logic.

## 3. `context/opentui/` Context
- The OpenTUI React Reconciler (`context/opentui/packages/react/src/components/index.ts`) exposes foundational primitives usable directly in JSX.
- **Available Intrinsic Elements**: `<box>`, `<text>`, `<code>`, `<diff>`, `<markdown>`, `<input>`, `<select>`, `<textarea>`, `<scrollbox>`, `<ascii-font>`, `<tab-select>`, and `<line-number>`.
- Keyboard input should use OpenTUI's native keyboard hooks or the wrappers `useScreenKeybindings` / `useGlobalKeybindings` found in `apps/tui/src/hooks/`.

## 4. `apps/ui/src/` Context
- The directory `apps/ui/` does not currently exist in the repository structure. Web UI reference patterns are therefore not available.

## Implementation Strategy Path
- Create the required file skeleton under `apps/tui/src/screens/Issues/` (`filter-types.ts`, `useIssueFilters.ts`, `FilterToolbar.tsx`, `FilterPicker.tsx`, `extractAssignees.ts`, `IssuesScreen.tsx`).
- Substitute `PlaceholderScreen` with `IssuesScreen` inside the router registry (`apps/tui/src/router/registry.ts`).
- Implement the layout using `<box>` and `<scrollbox>` from OpenTUI alongside the custom TUI primitives. Filter styling should utilize semantic references via `useTheme()`.