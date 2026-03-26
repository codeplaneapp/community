# Research Findings for `tui-dashboard-repos-list`

## 1. Directory Structure Context

Based on exploration of the repository, here is the state of the relevant areas for implementing the Recent Repositories panel:

- **`apps/tui/src/screens/Dashboard/`**: Does not currently exist. This directory will need to be created as part of this implementation ticket. Since `DashboardPanel.tsx` and `useDashboardFocus.ts` are listed as dependencies in the spec, we will need to create stub versions of them as outlined in the *Productionization Notes*.
- **`packages/ui-core/` & `apps/ui/src/`**: These shared/web directories were not found in the monorepo root. This confirms we must rely on stubbed versions of data hooks (like `useRepos()`) and allow E2E tests to fail naturally if the backend integration isn't present.
- **`context/opentui/`**: This contains the underlying OpenTUI framework. Specifically, the React reconciler and related hooks/components are located in `context/opentui/packages/react/src/`.

## 2. Existing TUI Infrastructure (`apps/tui/src/`)

The `apps/tui/src/` directory contains a robust, established set of utilities and hooks that we must integrate with, exactly matching the engineering specification:

### Custom React Hooks
Found in `apps/tui/src/hooks/`:
- `useLayout.ts`: Provides `breakpoint`, `contentHeight`, and `width` for responsive column layout calculations.
- `useTheme.ts`: Provides semantic color tokens (`primary`, `muted`, `success`, `error`).
- `useNavigation.ts`: Provides the `push` function for screen transitions.
- `useScreenKeybindings.ts`: Essential for registering keyboard interactions (j/k navigation, filter activation, etc.).
- `useScreenLoading.ts` & `usePaginationLoading.ts`: Handle loading states, error boundaries, and scroll-triggered pagination indicators.

### Shared Components
Found in `apps/tui/src/components/`:
- `SkeletonList.tsx`: Ready to be used for the `isLoading` state of the repos list.
- `PaginationIndicator.tsx`: Ready to be rendered at the bottom of the list when fetching next pages.

### Text Utilities
Found in `apps/tui/src/util/truncate.ts`:
- `truncateText(text: string, maxWidth: number)`: Returns a string truncated with `…` to fit strictly within `maxWidth`. This is critical for enforcing the layout constraints of columns (e.g., `nameWidth`, `descriptionWidth`) in `RepoRow.tsx`.

## 3. OpenTUI Foundation (`context/opentui/`)

The OpenTUI library provides the core terminal building blocks via React bindings:
- Components such as `<box>`, `<text>`, `<input>`, and `<scrollbox>` are globally available in the TUI reconciler environment.
- OpenTUI's `use-keyboard`, `use-terminal-dimensions`, and `use-resize` hooks are abstracted by the app-level `apps/tui/src/hooks/` (e.g., `useScreenKeybindings`, `useLayout`). It's best to consume the `apps/tui` wrappers rather than importing raw OpenTUI hooks directly.

## 4. Implementation Readiness

All required local patterns and utilities are accounted for. The implementation can proceed perfectly against the spec by creating the `Dashboard` screen directory, importing the established theme/layout hooks, leveraging `truncateText` for column constraints, and stubbing the missing data hooks (`useRepos`) and container dependencies (`DashboardPanel`) as required.