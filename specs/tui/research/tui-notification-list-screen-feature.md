# Research: TUI_NOTIFICATION_LIST_SCREEN

## Current Implementation State

Based on codebase analysis, the TUI is still heavily stubbed and scaffolded with placeholder screens and mock data providers. Specifically, for the notification features:
- **Screens**: The `apps/tui/src/screens/notifications/` directory and required files (`NotificationListScreen.tsx`, `NotificationRow.tsx`) do not exist yet.
- **Tests**: The `e2e/tui/notifications.test.ts` file does not exist yet.
- **Routing**: In `apps/tui/src/router/registry.ts`, the `[ScreenName.Notifications]` entry is currently mapped to `PlaceholderScreen`.

## Key Architectural Patterns & Existing Files

### 1. Data Access & Hooks
The specification requires `useNotifications()` and `useSSEChannel()`, which are conceptually part of `@codeplane/ui-core`. However, the TUI codebase uses a mock API client provider (`apps/tui/src/providers/APIClientProvider.tsx`) and an incomplete SSE provider (`apps/tui/src/providers/SSEProvider.tsx`). 
- Previous architecture tickets mention `apps/tui/src/hooks/useNotificationsAdapter.ts` and `apps/tui/src/hooks/useNotificationStream.ts` as adapters bridging TUI and core. If these hooks are not implemented yet, local mock adapters must be introduced for this screen.
- SSE connections typically use a localized stub in earlier phases (e.g., `const useSSEChannel = (channel: string, callback: (event: any) => void) => {};` seen in agent chats).

### 2. Navigation
Screens interact with navigation via the `useNavigation` hook (`apps/tui/src/providers/NavigationProvider.tsx`). To push a user to a detail screen when they press `Enter` on a notification, `push()` is called passing the target screen enum and required parameters.

### 3. Keybindings
The TUI handles keyboard interactions centrally. Screen-specific keybindings should utilize the `useScreenKeybindings` hook located at `apps/tui/src/hooks/useScreenKeybindings.ts`. This hook makes it straightforward to define bounds logic and optimistic actions for inputs like `j`, `k`, `r`, `R`, `Esc`, etc.

### 4. Layout & Breakpoints
The TUI relies on native `OpenTUI` components (`<box>`, `<scrollbox>`, `<text>`, `<input>`) combined with responsive utility hooks found in `apps/tui/src/hooks/`:
- `useBreakpoint.ts` / `useResponsiveValue.ts` — Critical for determining the `minimum` (80x24), `standard` (120x40), and `large` (200x60) environments to drive truncation or display variations for `NotificationRow.tsx`.
- The terminal size logic conforms exactly to the dimensions defined in `design.md`.

### 5. E2E Testing Infrastructure
All snapshot and keyboard interaction testing happens via `@microsoft/tui-test`. The `e2e/tui/helpers.ts` file exports essential constants and helpers:
- `launchTUI()` to spawn test instances.
- `TERMINAL_SIZES` mapping constants (`minimum`, `standard`, `large`) required for `SNAP-NOTIF` scaling tests.
- `createMockAPIEnv` to set mock responses during isolated execution.

## Recommended Implementation Path

1. **Scaffold the Screen**: Create `NotificationListScreen.tsx` and `NotificationRow.tsx` in `apps/tui/src/screens/notifications/`.
2. **Update Registry**: Modify `apps/tui/src/router/registry.ts` to point `ScreenName.Notifications` to the newly created component instead of `PlaceholderScreen`.
3. **Wire Hooks (or Stub)**: Check if `useNotifications` exists in an adapter hook. If missing, stub it locally based on the returned interface requirements (returning `{ data, fetchMore, isLoading, isError, markRead, markAllRead }`).
4. **Build the Layout**: Implement truncation helpers natively and structure the column visibilities bounded by `useBreakpoint()`.
5. **Write E2E Suite**: Set up `e2e/tui/notifications.test.ts` utilizing `launchTUI` from helpers and stub key tests matching the expected `SNAP-NOTIF`, `KEY-NOTIF`, `RESP-NOTIF`, and `INT-NOTIF` specifications.