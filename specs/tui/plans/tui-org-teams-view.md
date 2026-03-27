# Implementation Plan: TUI Organization Teams View

This document outlines the step-by-step implementation plan for the Codeplane TUI Organization Teams View, based on the engineering specification and context research.

## Phase 1: Domain Types & SDK Updates

**1. Create Organization Types**
*   **File:** `packages/sdk/src/types/organization.ts`
*   **Action:** Create file and export the `Team` interface.
    ```typescript
    export interface Team {
      id: number;
      name: string;
      description: string;
      permission: "read" | "write" | "admin";
      createdAt: string;
      memberCount?: number;
    }
    ```

**2. Export Types**
*   **File:** `packages/sdk/src/index.ts`
*   **Action:** Add `export * from './types/organization';`.

**3. Refactor Existing Service**
*   **File:** `packages/sdk/src/services/org.ts`
*   **Action:** Remove the local, unexported `Team` interface and import it from `../types/organization` instead.

## Phase 2: TUI Data Hooks

*Note: Pending full `@codeplane/ui-core` integration, these hooks will be created locally in the TUI app.*

**1. Create `useOrgTeams` Hook**
*   **File:** `apps/tui/src/hooks/useOrgTeams.ts`
*   **Action:** Implement a hook that calls `GET /api/orgs/:org/teams` using the API client. 
    *   Handle cursor/page-based pagination (cap at 500 items).
    *   Return state: `{ teams: Team[], total: number, isLoading: boolean, error: Error | null, fetchMore: () => void, refetch: () => void }`.

**2. Create `useOrgRole` Hook**
*   **File:** `apps/tui/src/hooks/useOrgRole.ts`
*   **Action:** Implement a hook that calls `GET /api/orgs/:org/members/me`.
    *   Return state: `{ role: "owner" | "member" | null, isLoading: boolean }`.

## Phase 3: Routing & Navigation

**1. Update Screen Types**
*   **File:** `apps/tui/src/router/types.ts`
*   **Action:**
    *   Add `OrgTeams` and `OrgTeamCreate` to the `ScreenName` enum.
    *   Add parameter definitions for both screens in the `ScreenParams` interface: `{ org: string }`.

**2. Update Screen Registry**
*   **File:** `apps/tui/src/router/registry.ts`
*   **Action:**
    *   Import `OrgTeamsScreen`.
    *   Map `ScreenName.OrgTeams` to `OrgTeamsScreen`.
    *   Map `ScreenName.OrgTeamCreate` to `PlaceholderScreen` (stubbed for future implementation).

## Phase 4: Screen Component Implementation

**1. Create OrgTeamsScreen**
*   **File:** `apps/tui/src/screens/organizations/OrgTeamsScreen.tsx`
*   **Action:** Implement the main screen component.
    *   **State:** Use `useState` for `focusedId`, `filterText`, and `filterActive`.
    *   **Data Hooks:** Invoke `useOrgTeams(params.org)` and `useOrgRole(params.org)`.
    *   **Layout:** Use `useLayout()` and `getBreakpoint()` from `apps/tui/src/hooks/` to manage column widths based on terminal size (`80x24`, `120x40`, `200x60`). Use a text truncation utility for names/descriptions.
    *   **Keybindings:** Use `useScreenKeybindings()`:
        *   `j`/`k`/`Down`/`Up`: Update `focusedId`.
        *   `Enter`: Push `ScreenName.OrgTeamDetail` with `{ org: params.org, team: focusedTeam.name }`.
        *   `/`: Toggle `filterActive` and focus input.
        *   `Esc`: Clear filter or `pop()` screen.
        *   `c`: Push `ScreenName.OrgTeamCreate` if `role === "owner"`.
        *   `R`: Trigger `refetch()` on error.
        *   `q`: Call `pop()`.
        *   `g g`, `G`, `Ctrl+D`, `Ctrl+U`: Pass through to the `<scrollbox>` ref.
    *   **Status Bar:** Use `useStatusBarHints()` to dynamically show hints. Include `[c] Create` only if `role === "owner"`.
    *   **Render:**
        *   Header with title "Teams (N)" and `/ filter` hint.
        *   OpenTUI `<input>` for filtering if `filterActive` is true.
        *   OpenTUI `<scrollbox>` containing the team list.
        *   Highlight focused row with `theme.primary` background.
        *   Color-code permissions: `read` (success), `write` (warning), `admin` (error).
        *   Handle loading (braille spinner), error, and empty states based on role.

**2. Connect Entry Point**
*   **File:** `apps/tui/src/screens/organizations/OrgOverviewScreen.tsx`
*   **Action:** Update the overview screen to handle the `t` keypress or selecting the "Teams" tab by calling `push(ScreenName.OrgTeams, { org: params.org })`.

## Phase 5: End-to-End Testing

**1. Create Test Suite**
*   **File:** `e2e/tui/organizations.test.ts`
*   **Action:** Implement a comprehensive suite using `@microsoft/tui-test` covering the 68 specified test cases.
    *   **Snapshot Tests (14):** Test initial load layouts, empty states (owner vs member), loading states, error states, filter UI changes, and dynamic status bar hints.
    *   **Keyboard Interaction (27):** Test list navigation bounds, action navigation (`Enter`), filter input/clearing, role-gated creation (`c`), error retries (`R`), and pagination scrolling.
    *   **Responsive (12):** Mock terminal dimensions and verify layout breakpoint shifts and text truncations. Test resize events to ensure focus and state are maintained.
    *   **Integration (15):** Mock API edge cases (401, 403, 404, 429, 500), pagination limits (500 item cap), state persistence when navigating away and back, and resilience to malformed data (empty descriptions, unicode characters).