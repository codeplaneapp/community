# Implementation Plan: Notification List Screen Scaffold

## Phase 1: Types and Scaffolding
1. **Create Directory**: Create `apps/tui/src/screens/Notifications/` directory.
2. **Implement Types (`apps/tui/src/screens/Notifications/types.ts`)**:
   - Define all exported types from the specification (`NotificationSourceType`, `NotificationReason`, `NotificationItem`, `NotificationFilter`, `NotificationColumnVisibility`).
   - Implement `formatRelativeTime(isoString: string): string` to format timestamps exactly as specified (`just now`, `Nm ago`, `Nh ago`, `Nd ago`, `MMM DD`, `MMM DD YYYY`).
   - Implement `getColumnVisibility(width: number): NotificationColumnVisibility` to return column visibility flags based on terminal width breakpoints (minimum, standard, large).
   - Implement `getSourceIcon(type: NotificationSourceType): { icon: string; color: string }` using the specified unicode characters and theme color tokens.
3. **Create Barrel Export (`apps/tui/src/screens/Notifications/index.ts`)**:
   - Export `NotificationListScreen` and types for clean imports.

## Phase 2: NotificationRow Component
4. **Implement `NotificationRow.tsx` (`apps/tui/src/screens/Notifications/NotificationRow.tsx`)**:
   - Define Props: `{ item: NotificationItem; focused: boolean; selected: boolean; columns: NotificationColumnVisibility; width: number }`.
   - Construct layout using OpenTUI `<box>` and `<text>` components.
   - Render Segments: Unread dot (2ch) + Source icon (2ch, colored via `getSourceIcon`) + Subject (flex width, bold if unread).
   - Render conditional columns (Body preview, Repo name, Reason) depending on `columns` visibility mapping.
   - Render Timestamp (8ch) using `formatRelativeTime`.
   - Implement visual states for `focused` (reverse video) and `selected` (prepended `✓`).

## Phase 3: NotificationListScreen Component
5. **Implement `NotificationListScreen.tsx` (`apps/tui/src/screens/Notifications/NotificationListScreen.tsx`)**:
   - Define Props: `ScreenComponentProps`.
   - Setup local state: `filter` ("all" | "unread"), `searchQuery` (string), `searchActive` (boolean), `focusedIndex` (number), `selectedIds` (Set<string>).
   - Create a hardcoded empty array `const notifications: NotificationItem[] = []` for initial UI testing since the data hook is deferred.
   - Retrieve layout and theming via OpenTUI hooks (`useTerminalDimensions`, `useBreakpoint`, `useTheme`).
   - Setup keybindings via `useScreenKeybindings`: `j`/`k`/`Enter`/`G`/`gg`/`Ctrl+D`/`Ctrl+U` for navigation, `a`/`u` for toggling filters, `/` for search (using `when: () => !searchActive` to prevent conflicts), `Space` for selection, and `R` for retry.
   - **Render Layout**:
     - Title row: "Notifications (N unread)" or "Notifications (all read)".
     - Filter toolbar: "[All] [Unread] /search..." reflecting active filter states visually.
     - List Area: Use `<scrollbox>` wrapping mapped `NotificationRow` components. 
     - Empty State: Show centered "No notifications" + "You're all caught up!" in muted text if the list is empty.
     - Loading/Error State integration: Utilize existing components `<SkeletonList>`, `<FullScreenLoading>`, and `<FullScreenError>` conditionally.

## Phase 4: Screen Registry Wiring
6. **Update Screen Registry (`apps/tui/src/router/registry.ts`)**:
   - Import `NotificationListScreen`.
   - Replace `PlaceholderScreen` with `NotificationListScreen` in the `[ScreenName.Notifications]` entry.
   - Ensure `requiresRepo: false` and `requiresOrg: false` remain intact.
7. **Update Barrels (`apps/tui/src/screens/index.ts`)**:
   - Add `export * from "./Notifications";` to expose the new directory.

## Phase 5: E2E Test Scaffold
8. **Create Test File (`e2e/tui/notifications.test.ts`)**:
   - Scaffold 33 tests across 12 `describe` blocks as mandated by the spec:
     - File structure (4 tests)
     - Type exports (4 tests)
     - Component exports (2 tests)
     - Screen registry (3 tests)
     - TypeScript compilation (1 test)
     - Timestamp formatting (4 tests)
     - Column visibility (3 tests)
     - Source icon mapping (2 tests)
     - Go-to navigation (2 tests)
     - Layout rendering breakpoints (4 tests)
     - Filter toolbar (3 tests)
     - Keyboard navigation (1 test)
   - Use `@microsoft/tui-test` and `bunEval` to validate state, exports, and UI rendering.