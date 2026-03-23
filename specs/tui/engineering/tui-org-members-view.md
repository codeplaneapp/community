# Engineering Specification: Organization Members View (TUI_ORG_MEMBERS_VIEW)

## Overview
This document outlines the engineering specification and implementation plan for the Codeplane TUI Organization Members View. This screen allows organization members to view the roster, filter by role, search by name, and (for owners) add or remove members. The implementation adheres to the React 19 + OpenTUI architecture, utilizing the shared `@codeplane/ui-core` data layer.

## Dependencies
- `tui-org-overview`
- `tui-managed-list-with-actions`
- `tui-org-data-hooks`
- `tui-org-context-provider`

## Implementation Plan

### Step 1: Data Hooks & Types Validation
Ensure the following types and hooks from `@codeplane/ui-core` are available and correctly typed:
- `OrgMember` interface: `{ id: number; username: string; display_name: string; avatar_url: string; role: "owner" | "member" }`.
- `useOrgMembers(orgName)`: Returns paginated members, total count, loading/error states, and `loadMore()`.
- `useOrgRole(orgName)`: Returns viewer's role (`"owner" | "member" | null`).
- `useAddOrgMember(orgName)`: Exposes `mutate({ username, role })`.
- `useRemoveOrgMember(orgName)`: Exposes `mutate(username)`.

### Step 2: Screen Scaffolding & Routing
1. Create `apps/tui/src/screens/organizations/OrgMembersScreen.tsx`.
2. Update `apps/tui/src/navigation/screenRegistry.ts` to include `OrgMembers: { component: OrgMembersScreen, requiresRepo: false }`.
3. Add deep-link and command palette routing (`:members`) to navigate to `OrgMembers` with the `org` param.
4. Register keybindings in `OrgOverviewScreen` to push `OrgMembers` onto the stack when `m` is pressed.

### Step 3: Layout & Responsive Components
1. **Toolbar Component**: Create a localized toolbar rendering the Role Filter state (`All`, `Owners`, `Members`) and an OpenTUI `<input>` for the search term.
2. **Responsive Row Component**: Create `OrgMemberRow.tsx` that leverages `useTerminalDimensions()`.
   - **< 80x24**: Handled by app-shell (terminal too small).
   - **80x24 - 119x39**: Show role badge (8ch, colored using `useTheme().warning` or `useTheme().muted`) and username (truncated).
   - **120x40 - 199x59**: Include display name (30ch).
   - **200x60+**: Expanded widths for username (30ch) and display name (50ch).
3. **ScrollableList**: Integrate the global `ScrollableList` component to render `OrgMemberRow`s. Hook up the `onFetchMore` callback to the `loadMore()` function from `useOrgMembers()`. Implement a hardcap at 500 loaded items.

### Step 4: State Management & Client-Side Filtering
1. Track local state in `OrgMembersScreen`:
   - `roleFilter`: `"All" | "Owners" | "Members"` (default: `"All"`).
   - `searchQuery`: `string` (default: `""`).
   - `isSearchFocused`: `boolean` (default: `false`).
2. Create a derived `filteredMembers` array applying `searchQuery` (substring match on `username` and `display_name`, case-insensitive) and `roleFilter` to the items returned by `useOrgMembers()`.

### Step 5: Modals / Overlays
Create two new components using the global `ModalSystem`:
1. **AddMemberOverlay.tsx**:
   - Only render if `viewerRole === "owner"`.
   - Input for username (max 39ch).
   - Role toggle (`m`/`o` key events mapped to Member/Owner).
   - Handles submission via `useAddOrgMember()`, handling 409, 404, and 422 errors inline.
2. **RemoveMemberOverlay.tsx**:
   - Only render if `viewerRole === "owner"`.
   - Accepts `targetMember` as a prop.
   - Enforces last-owner protection (if filtering locally for owners yields count === 1 and target is owner, show status bar error instead of modal).
   - Listens for `y`/`n`/`Esc` keys to confirm or cancel via `useRemoveOrgMember()`.

### Step 6: Keybindings & Integration
Use `useScreen()` to register the following context-sensitive keybindings:
- `j`/`k`, `Down`/`Up`, `G`, `g g`, `Ctrl+D`, `Ctrl+U`: Standard list navigation.
- `/`: Set `isSearchFocused` to true (focuses OpenTUI input).
- `f`: Cycle `roleFilter` state.
- `a`: Open `AddMemberOverlay` (if owner).
- `r`: Open `RemoveMemberOverlay` for currently focused item (if owner).
- `Esc`: Close overlays -> blur search -> pop screen (priority queue).
- `q`: Pop screen.
- `R`: Trigger retry on error state.

## Unit & Integration Tests

All tests will be implemented in `e2e/tui/organizations.test.ts` using `@microsoft/tui-test` and real data fixtures.

### Terminal Snapshot Tests
- **SNAP-ORGMEM-001**: List at 120x40 with populated members (full layout, badges, focus highlight).
- **SNAP-ORGMEM-002**: List at 80x24 (minimum size, display name hidden).
- **SNAP-ORGMEM-003**: List at 200x60 (large size, expanded columns).
- **SNAP-ORGMEM-004**: Empty state rendering.
- **SNAP-ORGMEM-005**: Loading state (braille spinner).
- **SNAP-ORGMEM-006**: Error state (with 'Press R to retry').
- **SNAP-ORGMEM-007**: Permission denied state (403 viewer).
- **SNAP-ORGMEM-012/013/014**: Toolbar rendering "All", "Owners", and "Members" respectively.
- **SNAP-ORGMEM-023**: Add member overlay visible at 120x40.
- **SNAP-ORGMEM-025**: Remove member confirmation overlay visible.

### Keyboard Interaction Tests
- **KEY-ORGMEM-001-004**: Verify `j`/`k` navigation updates focus highlights.
- **KEY-ORGMEM-009-012**: Verify `/` focuses search, typing filters the list, and `Esc` clears focus.
- **KEY-ORGMEM-022-024**: Verify `f` toggles the role filter state and updates the list inline.
- **KEY-ORGMEM-027-030**: Verify `a` opens add member flow, accepts typing, role selection via Tab/keys, and submits on Enter.
- **KEY-ORGMEM-031**: Verify `a` does nothing when viewer is not an owner.
- **KEY-ORGMEM-034-036**: Verify `r` opens removal flow, `y` confirms, and `n` cancels.
- **KEY-ORGMEM-038**: Verify `r` on the last remaining owner aborts and shows a status bar message.
- **KEY-ORGMEM-039**: Verify `q` pops the screen back to org overview.

### Responsive Tests
- **RESP-ORGMEM-007-008**: Resize from 80x24 to 120x40 (display name column appears dynamically) and vice versa.
- **RESP-ORGMEM-012**: Resize terminal with add member overlay open; verify modal re-centers and adjusts width (90% at min, 50% at std).

### Integration Tests
- **INT-ORGMEM-005**: Verify scrolling past 80% triggers pagination, fetching the next page of members.
- **INT-ORGMEM-006**: Verify pagination stops at 500 total loaded members.
- **INT-ORGMEM-010**: End-to-end add member flow: successful submit refreshes list and displays the new member.
- **INT-ORGMEM-011/012/013**: Handle 409 (already member), 404 (not found), and 422 (invalid role) on add member submit, displaying inline errors.
- **INT-ORGMEM-014**: End-to-end remove member flow: successful removal decrements count and drops the row.

### Edge Case Tests
- **EDGE-ORGMEM-002**: Render long usernames correctly truncated at minimum widths.
- **EDGE-ORGMEM-004**: Handle members with empty string display names gracefully (no "null" fallback).
- **EDGE-ORGMEM-010**: Verify `f` filtering on 100+ items only filters the currently loaded page items synchronously.
- **EDGE-ORGMEM-014**: Rapid `r` presses only open a single confirmation dialog instance.