# TUI Notification Mark Read - Codebase Research

## 1. Current State of the Codebase

The `apps/tui/src/screens/Notifications` directory and its associated files (`NotificationListScreen.tsx`, `NotificationRow.tsx`, `useNotificationActions.ts`) do not currently exist in the repository. They will need to be created from scratch as part of this ticket.

Similarly, `BaseScreen` and `ScrollableList` abstractions referenced in the engineering spec are not present under those exact names in `apps/tui/src/`. You will need to build the layout using standard `@opentui/react` primitives (`<box>`, `<scrollbox>`, `<text>`) or adapt existing screen patterns (such as those found in the `Agents` screen implementations).

## 2. Optimistic Updates (`useOptimisticMutation`)

The codebase already has a robust utility for handling optimistic UI updates: `apps/tui/src/hooks/useOptimisticMutation.ts`.

### Key details:
- It accepts `onOptimistic`, `mutate`, `onRevert`, and `onSuccess` callbacks.
- It integrates automatically with the `useLoading` hook to register mutations and display revert errors via the status bar.
- Crucially for this ticket, **mutations are not canceled on unmount**. This fulfills the requirement that a `q` pop (navigation away from the screen) should let the mutation complete in the background.
- You will wrap `useMarkNotificationRead` and `useMarkAllNotificationsRead` inside this hook to power the `r` and `R` keys.

## 3. Keybindings (`useScreenKeybindings`)

Keybindings are managed centrally via a prioritization stack.
**Location:** `apps/tui/src/hooks/useScreenKeybindings.ts`

### Pattern:
```typescript
useScreenKeybindings([
  {
    key: "r",
    description: "Mark read",
    group: "Actions",
    handler: handleMarkRead,
    when: () => !isSearchFocused // Evaluated at dispatch time
  },
  {
    key: "R",
    description: "Mark all read",
    group: "Actions",
    handler: handleMarkAllRead,
    when: () => !isSearchFocused
  }
]);
```
- Note the `when` property: This is the correct way to implement the input focus guards (e.g., "check if search input is focused (if so, no-op)") as specified in the PRD.

## 4. Status Bar Hints & Overrides

To implement the transient success/error messages (e.g., "Marked read", "Failed: {reason}") in the status bar:
**Location:** `apps/tui/src/providers/KeybindingProvider.tsx` and `apps/tui/src/hooks/useStatusBarHints.ts`

### Pattern:
`useStatusBarHints()` returns an `overrideHints` function:
```typescript
const { overrideHints } = useStatusBarHints();

// Usage to temporarily show a message:
const cleanup = overrideHints([{ keys: "✓", label: "Marked read", order: 1 }]);
setTimeout(cleanup, 3000);
```
- Use `useLayout().breakpoint` (from `apps/tui/src/hooks/useLayout.ts`) to determine the exact string length (Minimum vs Standard vs Large) as specified.

## 5. Global Badge Integrations

The global notification badges are currently hardcoded with placeholders and must be wired up.

### `apps/tui/src/components/HeaderBar.tsx`:
Lines 11-12:
```typescript
  const connectionState = "connected"; // placeholder
  const unreadCount = 0; // placeholder
```

### `apps/tui/src/components/StatusBar.tsx`:
Lines 45-46:
```typescript
  const syncState = "connected"; // placeholder
  const syncColor = theme[statusToToken(syncState)];
```

You will need to replace `unreadCount = 0` by consuming the shared `useNotifications()` cache or context so that optimistic decrements automatically trickle up to these global shells.

## 6. Data Hooks (`ui-core`)

The `@codeplane/ui-core` data layer is located in the monorepo at `specs/tui/packages/ui-core/`. However, `useMarkNotificationRead` and `useMarkAllNotificationsRead` are not currently exported there. You will need to scaffold these React Query / SWR hooks in the `@codeplane/sdk` or `ui-core` package, ensuring they expose the cache manipulation functions needed for `onOptimistic` and `onRevert`.

## 7. End-to-End Tests

The TUI tests use `@microsoft/tui-test`. The target file `e2e/tui/notifications.test.ts` does not exist yet. You will create it to house the snapshot validations (SNAP-MARKREAD-001 through 015), keyboard interaction tests (KEY-MARKREAD-001 through 025), and responsive/integration verifications.