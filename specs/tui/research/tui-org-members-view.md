# Research Report: Organization Members View (TUI_ORG_MEMBERS_VIEW)

This document provides codebase research context for implementing the `tui-org-members-view` ticket.

## 1. Data Hooks (`useOrgData.ts`)

The engineering specification references hooks imported from `@codeplane/ui-core`: `useOrgMembers`, `useOrgRole`, `useAddOrgMember`, and `useRemoveOrgMember`. 

**Findings:**
- There is no `@codeplane/ui-core` package in the workspace (only `@codeplane/sdk`).
- The file `apps/tui/src/hooks/useOrgData.ts` does **not** currently exist.
- You will need to implement these hooks either by scaffolding `apps/tui/src/hooks/useOrgData.ts` and consuming `@codeplane/sdk` endpoints or by mocking the implementation if the SDK methods are not yet available. 
- Related specification for these hooks can be found in `specs/tui/engineering/tui-org-data-hooks.md`.

## 2. Global Components (`ScrollableList` & `ModalSystem`)

The spec mentions integrating `ScrollableList` and `ModalSystem` components.

**Findings:**
- **`ScrollableList`**: Does not exist in `apps/tui/src/components/`. A previous ticket spec (`tui/research/tui-settings-ssh-keys.md`) established that if `ScrollableList` is missing, you should build it using standard OpenTUI primitives: a `<scrollbox>` wrapping a `<box flexDirection="column">` and implement `j/k` keyboard navigation manually using `useScreenKeybindings`.
- **Pagination Support**: You can leverage the existing `usePaginationLoading` hook (`apps/tui/src/hooks/usePaginationLoading.ts`) and the `<PaginationIndicator>` component (`apps/tui/src/components/PaginationIndicator.tsx`) at the bottom of the list for loading more members.
- **`ModalSystem`**: Does not exist by that name. The TUI uses an `OverlayLayer` (`apps/tui/src/components/OverlayLayer.tsx`) backed by `useOverlay()` (`apps/tui/src/hooks/useOverlay.ts`). However, this system currently only supports predefined overlay types (`help`, `command-palette`, `confirm`). For `AddMemberOverlay` and `RemoveMemberOverlay`, you must either extend `OverlayContextType` and `OverlayLayer`, or implement them as localized absolutely-positioned `<box>` elements directly within `OrgMembersScreen.tsx`.

## 3. Screen Navigation & Routing

**Findings:**
- The `apps/tui/src/screens/organizations/` directory does not currently exist.
- In `apps/tui/src/router/types.ts`, `ScreenName.OrgOverview` is defined, but `ScreenName.OrgMembers` is **missing** from the enum.
- In `apps/tui/src/router/registry.ts`, `OrgOverview` is currently mapped to `PlaceholderScreen`. `OrgMembers` must be added to the registry with `{ component: OrgMembersScreen, requiresRepo: false, requiresOrg: true }`.

## 4. Testing

**Findings:**
- The E2E test file `organizations.test.ts` does not exist in the active `e2e/tui/` directory.
- There is an empty or spec version at `specs/tui/e2e/tui/organizations.test.ts`. You will need to create the actual file in `e2e/tui/organizations.test.ts` to implement the `SNAP-ORGMEM`, `KEY-ORGMEM`, and `RESP-ORGMEM` assertions.

## Recommended Action Plan
1. Add `OrgMembers` to `ScreenName` in `apps/tui/src/router/types.ts`.
2. Scaffold `apps/tui/src/hooks/useOrgData.ts` with the required member/role/mutation hooks (using `useOptimisticMutation` or basic query wrappers depending on your existing codebase pattern).
3. Create `apps/tui/src/screens/organizations/OrgMembersScreen.tsx` containing the custom list handling (`<scrollbox>`, `j/k` traversal via `useScreenKeybindings`) and local overlays.
4. Register the new screen in `apps/tui/src/router/registry.ts`.
5. Write the specified tests in `e2e/tui/organizations.test.ts` using `@microsoft/tui-test`.