# TUI Navigation Chrome Engineering Research Findings

Based on a comprehensive review of the `apps/tui/` directory, here is the current state of the navigation stack implementation compared to the `tui-nav-chrome-eng-01` specification:

## 1. Type Definitions & Enums
**File:** `apps/tui/src/router/types.ts`
- **Current State:** The file exists and defines `MAX_STACK_DEPTH = 32`, `DEFAULT_ROOT_SCREEN = "Dashboard"`, `ScreenEntry`, and `NavigationContextType`.
- **Gaps vs Spec:** 
  - Screens are currently typed as `string` instead of using a unified `ScreenName` enum.
  - The `ScreenName` enum exists but is misplaced in `apps/tui/src/navigation/screenRegistry.ts`.
  - `NavigationContextType` is used instead of the specified `NavigationContext` name.
  - Missing `ScreenDefinition` and `ScreenComponentProps` interfaces completely.
  - Missing `repoContext` and `orgContext` on the context type.

## 2. Screen Registry
**File:** `apps/tui/src/navigation/screenRegistry.ts` (Expected: `apps/tui/src/router/registry.ts`)
- **Current State:** The registry exists but is in the `navigation/` directory. It defines a `ScreenName` enum with 20 items and a `screenRegistry` object.
- **Gaps vs Spec:**
  - **Location:** Needs to be moved to `apps/tui/src/router/registry.ts`.
  - **Completeness:** The `ScreenName` enum only has 20 screens instead of the 31 required by the spec (missing specific Create/Edit views, e.g., `IssueCreate`, `IssueEdit`, `LandingCreate`, `WorkspaceCreate`, etc.).
  - **Interface Mismatch:** The current `ScreenDefinition` interface defines `params: string[]` instead of `requiresOrg: boolean` and uses a different structure for the `breadcrumb` property (string | function instead of strictly a function `breadcrumbLabel`).
  - Missing the import-time registry completeness check required by the spec.

## 3. Navigation Provider
**File:** `apps/tui/src/providers/NavigationProvider.tsx`
- **Current State:** Implements basic stack operations (`push`, `pop`, `replace`, `reset`) with React context, maintaining `MAX_STACK_DEPTH` and doing some duplicate prevention via a custom `screenEntriesEqual` function.
- **Gaps vs Spec:**
  - Lacks repo and org context inheritance logic when pushing dependent screens.
  - Missing the `scrollPositionCache` (Map with `useRef`) and the `useScrollPositionCache` hook export.
  - Derived state for `repoContext` and `orgContext` needs to be added.
  - The hook `useNavigation` is currently in `apps/tui/src/hooks/useNavigation.ts` instead of being exported from the provider file as requested.

## 4. Screen Router
**File:** `apps/tui/src/router/ScreenRouter.tsx`
- **Current State:** Consumes `useNavigation`, looks up the current screen in the registry, and renders the component.
- **Gaps vs Spec:**
  - Currently imports the registry from the incorrect `navigation/` path.
  - Renders the component without passing the required `ScreenComponentProps` (`entry` and `params`). Spec requires: `<Component {...props} />` where `props: ScreenComponentProps`.

## 5. Placeholder Screen
**File:** `apps/tui/src/screens/PlaceholderScreen.tsx`
- **Current State:** Exists and renders a placeholder box with a "Screen not yet implemented" message.
- **Gaps vs Spec:**
  - Accepts a `params` object directly via `PlaceholderScreenProps` and derives screen name from a magic `__screenId` param.
  - Needs to be refactored to accept `ScreenComponentProps` (`{ entry, params }`) and pull the screen name cleanly from `entry.screen`.

## 6. End-to-End Tests
**File:** `e2e/tui/app-shell.test.ts`
- **Current State:** Contains extensive existing test coverage for navigation (`NAV-*`), the registry (`REG-*`), layout hooks (`HOOK-LAY-*`), and theme resolution. 
- **Gaps vs Spec:** The spec outlines specific test cases (e.g., `NAV-001` through `NAV-008`, `NAV-BREAD-*`, `NAV-STACK-*`, `NAV-CTX-*`, `NAV-PH-*`, etc.). Some of these overlap with existing tests (like `NAV-KEY-002`), but the existing file will need to be aligned or appended with the specific assertions requested, notably around context inheritance and breadcrumb rendering formats.

## Summary
The foundational routing structure is present but built on an earlier iteration of the design. A significant refactor is required to consolidate types into `router/types.ts`, move the registry to `router/registry.ts` with all 31 screens, update the Provider to support context inheritance and scroll caching, and strictly enforce the `ScreenComponentProps` contract across `ScreenRouter` and `PlaceholderScreen`.