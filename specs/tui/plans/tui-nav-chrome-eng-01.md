# Implementation Plan: `tui-nav-chrome-eng-01`

This implementation plan outlines the steps to build the stack-based navigation system for the Codeplane TUI, completely aligning the codebase with the `tui-nav-chrome-eng-01` engineering specification and addressing gaps identified in the research findings.

## 1. Type Definitions & Enums
**Target:** `apps/tui/src/router/types.ts`

- Replace existing string-based screen types with a comprehensive `ScreenName` string enum containing all 31 TUI screens (e.g., `Dashboard`, `RepoList`, `IssueDetail`, `IssueCreate`, `AgentChat`, etc.).
- Update the `ScreenEntry` interface to include `id`, `screen` (of type `ScreenName`), `params`, `breadcrumb`, and `scrollPosition`.
- Define the `NavigationContext` interface strictly as specified, adding missing properties like `canGoBack`, `repoContext`, and `orgContext`.
- Add the `ScreenDefinition` interface containing `component`, `requiresRepo`, `requiresOrg`, and `breadcrumbLabel`.
- Add the `ScreenComponentProps` interface containing `entry` and `params`.
- Ensure `MAX_STACK_DEPTH = 32` and `DEFAULT_ROOT_SCREEN = ScreenName.Dashboard` are defined and exported.

## 2. Placeholder Screen
**Target:** `apps/tui/src/screens/PlaceholderScreen.tsx`

- Refactor the component signature to accept `ScreenComponentProps` instead of a custom parameter object.
- Extract the screen name cleanly from `entry.screen` rather than an injected `__screenId`.
- Update the UI to render the screen name in bold, followed by the "This screen is not yet implemented." text.
- Render a formatted list of all key-value pairs from the `params` object under a "Params:" header.

## 3. Screen Registry Migration
**Target:** `apps/tui/src/router/registry.ts`

- Create this new file to replace the existing `apps/tui/src/navigation/screenRegistry.ts`.
- Export a `screenRegistry` object of type `Record<ScreenName, ScreenDefinition>`.
- Add an entry for every one of the 31 `ScreenName` enum values.
- Assign `PlaceholderScreen` to the `component` property for all entries.
- Accurately configure `requiresRepo` and `requiresOrg` booleans based on the screen scope (e.g., `Issues` requires repo, `OrgTeamDetail` requires org).
- Implement custom `breadcrumbLabel` functions for each entry that cleanly interpolate `params` (e.g., `#${params.number}` for `IssueDetail`).
- Implement the critical import-time assertion block at the bottom of the file to verify that every `ScreenName` value has a corresponding entry in the registry, throwing an error if any are missing.

## 4. Navigation Provider & Hooks Refactor
**Target:** `apps/tui/src/providers/NavigationProvider.tsx`

- Refactor the context to use the newly defined `NavigationContext` type.
- Introduce a scroll position cache using `useRef<Map<string, number>>(new Map())`.
- Add helper functions `extractRepoContext` and `extractOrgContext` to traverse the stack and extract inherited context params.
- Update `push` to:
  - Inherit repo or org context from parent screens if the target screen requires it but lacks the params.
  - Silently ignore exact duplicate pushes (matching `ScreenName` and identical `params`).
  - Enforce `MAX_STACK_DEPTH` by slicing oldest entries off the bottom of the stack.
- Update `pop` to remove the popped screen's ID from the scroll cache.
- Update `replace` to remove the old top screen's ID from the scroll cache.
- Update `reset` to clear the scroll cache entirely via `scrollCacheRef.current.clear()`.
- Export the `useNavigation` hook directly from this file (migrating it out of `apps/tui/src/hooks/useNavigation.ts`).
- Export a new `useScrollPositionCache` hook that exposes `saveScrollPosition` and `getScrollPosition` interacting with the provider's ref.

## 5. Screen Router
**Target:** `apps/tui/src/router/ScreenRouter.tsx`

- Update imports to consume the new `apps/tui/src/router/registry.ts` and types.
- Retrieve `currentScreen` via `useNavigation()`.
- Map the `currentScreen.screen` string to the registry `ScreenDefinition`.
- Add a fallback render block that catches unknown screens (to prevent crashes) with a prompt to press `q` to go back.
- Render the resolved component strictly passing `<Component {...props} />` where `props` matches `ScreenComponentProps` (`entry` and `params`).

## 6. Barrel Exports & Cleanup
**Target:** `apps/tui/src/router/index.ts` & `apps/tui/src/providers/index.ts`

- Create `apps/tui/src/router/index.ts` to cleanly export `ScreenRouter`, `screenRegistry`, and all types/constants from `types.ts`.
- Create/Update `apps/tui/src/providers/index.ts` to export `NavigationProvider`, `useNavigation`, `useScrollPositionCache`, and `NavigationProviderProps`.
- Delete deprecated files: `apps/tui/src/navigation/screenRegistry.ts` and `apps/tui/src/hooks/useNavigation.ts`.
- Update any lingering internal imports to consume from the new barrel files.

## 7. End-to-End Tests
**Target:** `e2e/tui/app-shell.test.ts`

- Refactor and extend the existing tests to fulfill the precise `describe` blocks requested in the specification:
  - **Navigation stack (`NAV-001` - `NAV-008`):** Verify root defaults, push, pop, replace, reset, and duplicate logic.
  - **Breadcrumb rendering (`NAV-BREAD-001` - `NAV-BREAD-004`):** Ensure proper visual structure (`›` separator) and param interpolation.
  - **Stack constraints (`NAV-STACK-001` - `NAV-STACK-002`):** Verify max depth limits and safety on popping a single-entry stack.
  - **Context inheritance (`NAV-CTX-001` - `NAV-CTX-002`):** Validate top-down repo/org parameter inheritance.
  - **Placeholder screen (`NAV-PH-001` - `NAV-PH-003`):** Confirm screen names, params, and fallback messages are rendered accurately.
  - **Snapshot tests (`SNAP-NAV-001` - `SNAP-NAV-004`):** Capture structural baseline snapshots at 80x24 and 120x40 dimensions.
  - **Deep-link launch (`NAV-DEEP-001` - `NAV-DEEP-002`):** Verify CLI flags map to initial stack states (leave these failing if the backend implementation is incomplete).
  - **Registry completeness (`NAV-REG-001` - `NAV-REG-003`):** Add the structural assertions checking that all `ScreenName` mappings exist and contain expected functional properties.
- Ensure all test assertions rely on keyboard interaction and terminal text/snapshot matching via `@microsoft/tui-test`, without mocking the `NavigationProvider` internals.