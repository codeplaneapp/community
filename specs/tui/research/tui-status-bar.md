# TUI StatusBar Research Findings

## 1. Current State of StatusBar (`apps/tui/src/components/StatusBar.tsx`)

The existing `StatusBar` component is a partial implementation that renders a single OpenTUI `<box>` with three sections:

- **Left**: Keybinding hints mapped from `useStatusBarHints()` and error message from `useLoading().statusBarError`.
- **Center**: Hardcoded `syncState = "connected"` and an auth confirmation flash logic.
- **Right**: Hardcoded `?:help` text.

The component is currently utilizing several existing hooks:
- `useLayout()`: provides `width` and `breakpoint` (which can be `"minimum"`, `"standard"`, or `"large"`).
- `useTheme()`: provides access to the semantic theme colors.
- `useAuth()`: provides `status`, `user`, and `tokenSource`.
- `useLoading()`: provides `statusBarError` and `currentScreenLoading`.
- `useStatusBarHints()`: provides the array of registered hints.

## 2. Dependencies and Utilities Available

### OpenTUI Components & Hooks
- **`<box>`**: Layout primitive used for flexbox rows/columns.
- **`<text>`**: Renders styled text; supports `fg`, `bg`, and `attributes` properties.

### Existing Custom Hooks
- **`useSpinner(active: boolean)`** (`apps/tui/src/hooks/useSpinner.ts`): Returns the current frame of an animated braille or ASCII spinner. Controlled by OpenTUI's `Timeline` engine. Safe to call, returns an empty string when `active` is false.
- **`useLayout()`** (`apps/tui/src/hooks/useLayout.ts`): Returns an object containing `{ width, height, breakpoint }` where `breakpoint` is `"minimum"`, `"standard"`, `"large"`, or `null`.
- **`useTheme()`** (`apps/tui/src/hooks/useTheme.ts`): Returns the current color token object containing keys like `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`.
- **`useAuth()`** (`apps/tui/src/hooks/useAuth.ts`): Returns `{ status, user, tokenSource }`.
- **`useLoading()`** (`apps/tui/src/hooks/useLoading.ts`): Returns `{ statusBarError, currentScreenLoading }`.
- **`useStatusBarHints()`** (`apps/tui/src/hooks/useStatusBarHints.ts`): Returns `{ hints }` where `hints` is an array of `StatusBarHint` objects (with `keys` and `label`).

### Utilities
- **`TextAttributes`** (`apps/tui/src/theme/tokens.ts`): Contains bitmasks for styling, such as `TextAttributes.BOLD`.
- **`truncateRight`** (`apps/tui/src/util/text.ts`): Truncates text to a specified maximum width, adding an ellipsis (`…`) if necessary.
- **`logger`** (`apps/tui/src/lib/logger.ts`): Exposes `.error()`, `.warn()`, `.info()`, and `.debug()` for logging events to stderr.
- **`emit`** (`apps/tui/src/lib/telemetry.ts`): Exposes telemetry event emission, used for tracking UI and performance metrics.

### Navigation
- **`goToBindings`** (`apps/tui/src/navigation/goToBindings.ts`): Exported constant array defining the go-to keys and their target screens. This can be used by the new `getGoToHints` utility to build keybinding hints.

## 3. Implementation Targets

According to the engineering spec, the `StatusBar` component should be refactored into modular hooks and sub-components:

### Hooks to be created in `apps/tui/src/hooks/`
1. **`useSyncState.ts`**: Will manage the daemon sync status (`connected`, `syncing`, `conflict`, `disconnected`). Should emit `tui.status_bar.sync_state_changed`.
2. **`useNotificationCount.ts`**: Will manage the unread notification count and the temporary "flash" state when the count increases. Should emit `tui.status_bar.notification_received`.
3. **`useSSEConnectionState.ts`**: Will manage the SSE connection status, acting as a stub for now. Should emit `tui.status_bar.sse_disconnect` and `tui.status_bar.sse_reconnect`.

### Sub-components to be created in `apps/tui/src/components/`
1. **`SyncStatusIndicator.tsx`**: Will render the central sync status icon (`●`, `▲`, or the spinner) and label depending on the terminal breakpoint. 
2. **`NotificationBadge.tsx`**: Will render the notification count (`◆ N`) and handle the `TextAttributes.BOLD` flashing state. If the count exceeds 99, it should render `99+`.
3. **`StatusBarErrorBoundary.tsx`**: A React ErrorBoundary to catch failures specifically in the `StatusBar` to prevent full app crashes.

### Refactoring `StatusBar.tsx`
The component needs a full rewrite to utilize a 3-section layout (`justifyContent="space-between"`) using a single `height={1}` `box`:
- The root box requires `backgroundColor={theme.surface}` and `borderColor={theme.border}` with `border={["top"]}`.
- **Left Box**: Handles the dynamic calculation and truncation of visible hints (`computeVisibleHints`).
- **Center Box**: Handles the `SyncStatusIndicator`.
- **Right Box**: Handles the `NotificationBadge` and `?:help` text.

## 4. Testing Context (`e2e/tui/app-shell.test.ts`)

The E2E test file for the App Shell includes extensive snapshot and interaction tests using `@microsoft/tui-test`. New tests covering the `TUI_STATUS_BAR` scenarios must be appended to this file. The `launchTUI()` and other testing helpers (e.g., terminal resizing, retrieving text from lines) are already available and utilized throughout the codebase.

Helper functions to extract the status bar line from the bottom of the terminal will need to be added to the test suite:
```typescript
function getStatusBarLine(terminal: TUITestInstance): string {
  return terminal.getLine(terminal.rows - 1);
}
```

## 5. Next Steps

1. Create the necessary hooks and the `getGoToHints` utility.
2. Create the internal rendering components for the status indicator and notification badge.
3. Implement the `StatusBarErrorBoundary`.
4. Refactor `StatusBar.tsx` per the design and specifications.
5. Adjust `AppShell.tsx` and barrel exports.
6. Append the required E2E tests into `e2e/tui/app-shell.test.ts`.