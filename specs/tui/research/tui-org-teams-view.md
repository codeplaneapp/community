# Context Research: TUI Organization Teams View

This document compiles the codebase context necessary for implementing the `tui-org-teams-view`.

## 1. Types & Data Hooks (`@codeplane/sdk` & `@codeplane/ui-core`)

*   **`Team` Interface**: Currently, `Team` is defined as a local internal interface inside `packages/sdk/src/services/org.ts` but is not exported publicly. The `packages/sdk/src/types/organization.ts` file does not exist yet. The existing `Team` interface will need to be properly typed, extracted, and exported through `packages/sdk/src/index.ts`.
*   **`@codeplane/ui-core` Reality**: The `@codeplane/ui-core` package is currently missing or intentionally mocked in the TUI application (`apps/tui/src/providers/APIClientProvider.tsx:3`). Data hooks such as `useOrgTeams` and `useOrgRole` will likely need to be implemented within `apps/tui/src/hooks/` as local adapter hooks pending the full `ui-core` implementation. 

## 2. Screen & Navigation (`apps/tui/src/router`)

*   **Screen Definitions**: The `ScreenName` enum in `apps/tui/src/router/types.ts` currently defines `OrgOverview`, `OrgTeamDetail`, and `OrgSettings`. It **does not** define `OrgTeams` or `OrgTeamCreate`. These enum values must be added.
*   **Screen Registry**: In `apps/tui/src/router/registry.ts`, existing organization screens are mapped to `PlaceholderScreen`. You will need to add the registry definitions for `ScreenName.OrgTeams` and map it to your new `OrgTeamsScreen` component.
*   **Directory Structure**: The directory `apps/tui/src/screens/organizations` has not been scaffolded yet. You will need to create this directory to house `OrgTeamsScreen.tsx` and related subcomponents.

## 3. Available TUI Hooks (`apps/tui/src/hooks/`)

Your implementation plan relies on standard patterns. The following existing TUI hooks should be utilized to fulfill the spec:
*   **Layout**: `useLayout.ts` and `useBreakpoint.ts` are available to manage the `80x24`, `120x40`, and `200x60+` responsive constraints.
*   **Interactions**: `useScreenKeybindings.ts` is ready to handle list traversal (`j/k`, `Enter`), search intercepts (`/`), and role-gated creation (`c`).
*   **Chrome**: `useStatusBarHints.ts` must be used to dynamically reflect the presence of the `c:create` shortcut if the `role === "owner"`.
*   **Loading**: `usePaginationLoading.ts`, `useScreenLoading.ts`, and `useSpinner.ts` are available for the data states.

## 4. End-to-End Tests (`e2e/tui`)

*   **Test File**: The file `e2e/tui/organizations.test.ts` does not yet exist. It will need to be created to implement the 68 tests (Snapshot, Keyboard, Responsive, and Integration) defined in the spec, utilizing the `@microsoft/tui-test` framework.