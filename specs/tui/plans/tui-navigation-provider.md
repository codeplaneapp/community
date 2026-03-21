# Implementation Plan: `tui-navigation-provider`

This document outlines the step-by-step implementation plan for the `tui-navigation-provider` ticket, which establishes the core stack-based routing infrastructure for the Codeplane TUI.

## Phase 1: Type Definitions and Utilities

**Goal:** Define the data structures, context shape, constants, and helper functions required by the navigation system.

1. **Create `apps/tui/src/router/types.ts`:**
   - Define the `ScreenEntry` interface with `id: string`, `screen: string`, and `params?: Record<string, string>`.
   - Define the `NavigationContextType` interface with methods `push`, `pop`, `replace`, `reset`, `canPop()`, and properties `readonly stack: readonly ScreenEntry[]`, `readonly current: ScreenEntry`.
   - Define the `NavigationProviderProps` interface accepting `initialScreen`, `initialParams`, `initialStack`, and `children`.
   - Export constants: `MAX_STACK_DEPTH = 32` and `DEFAULT_ROOT_SCREEN = "Dashboard"`.
   - Implement and export the `screenEntriesEqual(a, b)` pure function to deep-compare `screen` and `params` while ignoring the generated `id`.

2. **Create `apps/tui/src/router/index.ts`:**
   - Export all types, constants, and the `screenEntriesEqual` helper from `types.ts` as a barrel file.

## Phase 2: React Context and Provider Component

**Goal:** Implement the headless state management layer that powers the navigation stack.

1. **Create `apps/tui/src/providers/NavigationProvider.tsx`:**
   - Import necessary React hooks (`createContext`, `useState`, `useCallback`, `useMemo`) and the types/constants from `../router/types`.
   - Create and export `NavigationContext` initialized to `null`.
   - Implement the `NavigationProvider` component.
   - Initialize the `stack` state using a lazy initializer function that respects `initialStack` (capped at `MAX_STACK_DEPTH`) or falls back to a single root entry based on `initialScreen` and `initialParams`. Generate a `crypto.randomUUID()` for the initial entry's `id`.
   - Implement `push(screen, params)` wrapped in `useCallback`. Ensure it deduplicates consecutive identical entries using `screenEntriesEqual`. Implement silent overflow handling by dropping the oldest entry (`index 0`) if the length exceeds `MAX_STACK_DEPTH`.
   - Implement `pop()` wrapped in `useCallback`. Ensure it's a no-op if `stack.length <= 1`.
   - Implement `replace(screen, params)` wrapped in `useCallback`. It should pop the current top entry and push a new one with a fresh `id`.
   - Implement `reset(screen, params)` wrapped in `useCallback`. It clears the stack and sets a single new root entry.
   - Derive `current` as `stack[stack.length - 1]`.
   - Implement `canPop()` wrapped in `useCallback` returning `stack.length > 1`.
   - Memoize the context value object using `useMemo` with dependencies on `stack` and `current`.
   - Render `<NavigationContext.Provider value={contextValue}>{children}</NavigationContext.Provider>`.

2. **Create/Update `apps/tui/src/providers/index.ts`:**
   - Export `NavigationProvider` and `NavigationContext` from the newly created file.

## Phase 3: Consumer Hook

**Goal:** Provide a safe and typed way for screens and components to interact with the navigation stack.

1. **Create `apps/tui/src/hooks/useNavigation.ts`:**
   - Import `useContext` and `NavigationContext`.
   - Implement the `useNavigation` hook.
   - Add an explicit check: if the context is `null`, throw a descriptive `Error` instructing the developer that `useNavigation` must be used within a `NavigationProvider` hierarchy.
   - Return the context value.

2. **Create/Update `apps/tui/src/hooks/index.ts`:**
   - Export `useNavigation` from the newly created file.

## Phase 4: End-to-End Testing

**Goal:** Verify the behavior of the navigation provider through simulated terminal interactions and snapshots.

1. **Update `e2e/tui/app-shell.test.ts`:**
   - Import `launchTUI` from `./helpers`.
   - Implement terminal snapshot tests to verify the initial render (`NAV-SNAP-001`), deep-link pre-population (`NAV-SNAP-002`), and UI truncation at minimum dimensions (`NAV-SNAP-003`). *Note: These tests rely on the downstream `HeaderBar` reading the stack, simulating real integration.*
   - Implement keyboard interaction tests to verify `push` (`NAV-KEY-001`), `pop` (`NAV-KEY-002`), quitting on root (`NAV-KEY-003`), `replace` (`NAV-KEY-004`), and `reset` via go-to shortcuts (`NAV-KEY-005`).
   - Add edge case and stress tests verifying deduplication (`NAV-KEY-006`), rapid sequential pops (`NAV-KEY-007`), walking back a deep-linked stack (`NAV-KEY-008`), and silent overflow beyond `MAX_STACK_DEPTH` (`NAV-INT-003`).

*Note on testing methodology: The NavigationProvider is a headless data layer. E2E tests will technically be validating its integration with the overarching TUI shell (AppShell, HeaderBar, and ScreenRouter). Any backend-dependent screens that fail to load data should be left failing as per the project guidelines, focusing validation on the correct routing and stack manipulation behavior.*