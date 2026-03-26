# Implementation Plan: Organization Members View (TUI_ORG_MEMBERS_VIEW)

This plan details the steps required to implement the Organization Members View in the Codeplane TUI, based on the engineering specification and codebase research.

## Step 1: Update Navigation and Routing Types
**Target Files:**
- `apps/tui/src/router/types.ts`
- `apps/tui/src/router/registry.ts`

**Actions:**
1. Open `apps/tui/src/router/types.ts` and add `OrgMembers` to the `ScreenName` enum.
2. Open `apps/tui/src/router/registry.ts` and register the new screen:
   ```typescript
   [ScreenName.OrgMembers]: {
     component: OrgMembersScreen,
     requiresRepo: false,
     requiresOrg: true
   }
   ```
3. Ensure deep-link and command palette routing (`:members`) support passing the `org` parameter to the `OrgMembers` screen.
4. Update `OrgOverviewScreen` (if it exists) to push `ScreenName.OrgMembers` onto the stack when `m` is pressed.

## Step 2: Implement Data Hooks
**Target File:**
- `apps/tui/src/hooks/useOrgData.ts` (New File)

**Actions:**
1. Scaffold the file and define the `OrgMember` interface:
   `{ id: number; username: string; display_name: string; avatar_url: string; role: "owner" | "member" }`
2. Implement `useOrgMembers(orgName: string)`: Return paginated members, total count, loading/error states, and a `loadMore()` function. Hook into `@codeplane/sdk` endpoints or use appropriate query wrappers.
3. Implement `useOrgRole(orgName: string)`: Return the current viewer's role (`"owner" | "member" | null`).
4. Implement `useAddOrgMember(orgName: string)`: Expose a mutation function `mutate({ username, role })` to add a user.
5. Implement `useRemoveOrgMember(orgName: string)`: Expose a mutation function `mutate(username)` to remove a user.

## Step 3: Scaffold the Screen and Responsive Rows
**Target File:**
- `apps/tui/src/screens/organizations/OrgMembersScreen.tsx` (New File)

**Actions:**
1. **State Management**: Initialize local state using `useState` for `roleFilter` (`"All" | "Owners" | "Members"`), `searchQuery` (`string`), and `isSearchFocused` (`boolean`).
2. **Data Fetching**: Consume `useOrgMembers` and `useOrgRole`. Create a derived `filteredMembers` array applying `searchQuery` (case-insensitive substring match) and `roleFilter` to the fetched members locally.
3. **Toolbar Component**: Create an inline `<box>` rendering the active Role Filter and an OpenTUI `<input>` for the search term.
4. **Responsive Row Component**: Create a local `OrgMemberRow` component inside the file. Use `useTerminalDimensions()` to adjust layout:
   - `< 80x24`: Handled by global app shell (terminal too small).
   - `80x24 - 119x39`: Show role badge (8ch, colored warning/muted) and truncated username.
   - `120x40 - 199x59`: Show display name (30ch).
   - `200x60+`: Expanded widths for username (30ch) and display name (50ch).
5. **List Component**: Since `ScrollableList` does not exist globally, build the list manually using an OpenTUI `<scrollbox>` wrapping a `<box flexDirection="column">`.
   - Map over `filteredMembers` and render `OrgMemberRow`.
   - Track `focusedIndex` via state.
   - Use `usePaginationLoading` and `<PaginationIndicator>` at the bottom of the list. Hook up `loadMore()` limiting to a max of 500 items.

## Step 4: Implement Overlays (Modals)
**Target File:**
- `apps/tui/src/screens/organizations/OrgMembersScreen.tsx`

**Actions:**
1. Since `ModalSystem` is not available, implement overlays as localized, absolutely-positioned `<box>` elements that render over the main content based on state (`activeOverlay: "none" | "add" | "remove"`).
2. **AddMemberOverlay**:
   - Render only if `viewerRole === "owner"` and `activeOverlay === "add"`.
   - Contain an `<input>` for username (max 39ch).
   - Display a role toggle (Member/Owner).
   - Call `useAddOrgMember` on submit, handling 409, 404, and 422 errors with inline text.
3. **RemoveMemberOverlay**:
   - Render only if `viewerRole === "owner"` and `activeOverlay === "remove"`.
   - Accept the currently focused `targetMember`.
   - Enforce last-owner protection (if target is the only owner, show a status bar error message instead of opening the overlay).
   - Prompt confirmation (`y`/`n`/`Esc`) and call `useRemoveOrgMember` on `y`.

## Step 5: Keybindings Integration
**Target File:**
- `apps/tui/src/screens/organizations/OrgMembersScreen.tsx`

**Actions:**
1. Use `useScreenKeybindings` to register the following context-sensitive inputs based on the current active overlay/focus:
   - **List Navigation**: `j`/`k`, `Down`/`Up`, `G`, `g g`, `Ctrl+D`, `Ctrl+U` to update `focusedIndex`.
   - **Search**: `/` sets `isSearchFocused` to true.
   - **Filter**: `f` cycles `roleFilter` state.
   - **Overlays**: 
     - `a` opens Add Member overlay (if owner).
     - `r` opens Remove Member overlay for focused item (if owner).
   - **Dismissal**: `Esc` prioritizes closing overlays -> blurring search -> popping screen.
   - **Back/Quit**: `q` pops the screen.
   - **Retry**: `R` triggers a data refetch on error state.

## Step 6: End-to-End Testing
**Target File:**
- `e2e/tui/organizations.test.ts` (New File)

**Actions:**
1. Scaffold the file using `@microsoft/tui-test`.
2. Implement **Terminal Snapshot Tests** (`SNAP-ORGMEM-001` through `025`) covering standard/minimum/large layouts, empty/loading/error states, permission denied, toolbar states, and overlay visibility.
3. Implement **Keyboard Interaction Tests** (`KEY-ORGMEM-001` through `039`) validating `j/k` traversal, `/` search, `f` filtering, `a` add flow, `r` remove flow, last-owner protection, and `q`/`Esc` dismissal logic.
4. Implement **Responsive Tests** (`RESP-ORGMEM-007` through `012`) verifying column appearance at 120x40 and overlay recentering.
5. Implement **Integration Tests** (`INT-ORGMEM-005` through `014`) validating scroll-to-end pagination, max limits, and end-to-end add/remove mutation flows (including 409/404/422 handling).
6. Implement **Edge Case Tests** (`EDGE-ORGMEM-002` through `014`) validating long username truncation, empty display names, synchronous client filtering, and rapid keypress handling.