# Research Document: TUI_NOTIFICATION_BADGE (tui-notification-badge-feature)

## 1. Existing AppShell Layout Components

The newly created badge components need to be injected into the `HeaderBar` and `StatusBar` layout components. Both use OpenTUI's flexible box layout (`flexDirection="row"`).

### **`apps/tui/src/components/HeaderBar.tsx`**
*   **Current state**: The `HeaderBar` contains a placeholder for `unreadCount` at line 11 (`const unreadCount = 0; // placeholder`) and renders it manually at line 41 (`{unreadCount > 0 && <text fg={theme.primary}> {unreadCount}</text>}`).
*   **Injection Point**: Lines 38-42. 
    ```tsx
    <box>
      <text fg={connectionColor}> ●</text>
      {unreadCount > 0 && <text fg={theme.primary}> {unreadCount}</text>}
    </box>
    ```
*   **Action**: The hardcoded `unreadCount` logic needs to be removed. `HeaderBadge` should be imported and injected inside this `<box>` right next to the connection status (`●`).

### **`apps/tui/src/components/StatusBar.tsx`**
*   **Current state**: The `StatusBar` defines its right-most box for help text at lines 66-70.
*   **Injection Point**: Lines 66-70.
    ```tsx
    <box>
      <text fg={theme.muted}>  </text>
      <text fg={theme.primary}>?</text>
      <text fg={theme.muted}> help</text>
    </box>
    ```
*   **Action**: `StatusBarBadge` needs to be imported and securely placed at the beginning of this right-aligned `<box>`, just before the `?:help` text element. A leading/trailing spacing mechanism should ensure it complies with the "max 6 characters" visual constraint.

## 2. Dependencies & Theme Tokens

The new badges require specific theme tokens and data hooks to render as specified:
*   **Theme Hook**: Available at `apps/tui/src/hooks/useTheme.ts`.
    *   `useTheme()` returns an object with semantic colors.
    *   The `warning` color (ANSI 178) should be mapped from `theme.warning`.
    *   The `primary` color (ANSI 33) should be mapped from `theme.primary`.
    *   The `muted` color (ANSI 245) should be mapped from `theme.muted`.
*   **Text Attributes**: Bold text can be styled utilizing `TextAttributes.BOLD` available from `apps/tui/src/theme/tokens.ts` (`import { TextAttributes } from "../theme/tokens.js"`).
*   **Data Hook**: `useNotifications()` from `@codeplane/ui-core`. *(Note: Current monorepo structure does not explicitly expose `packages/ui-core` on disk. Various spec reviews note that the TUI currently relies on a mock layer and `APIClientProvider` is stubbed out. The implementer should follow the exact import path specified by the spec `import { useNotifications } from "@codeplane/ui-core";` or align with the existing local stub strategy as instructed by previous scaffolding tickets.)*
*   **SSE Context Validation**: The TUI includes `apps/tui/src/providers/SSEProvider.tsx`. As per current implementation, the `SSEProvider` provides a stub connection (often returning `null`). However, the components must assume it handles reconnects gracefully without dropping local state.

## 3. End-to-End Test Targets

### **`e2e/tui/app-shell.test.ts`**
*   **Current State**: Exists and contains ~5,439 lines of E2E tests utilizing `@microsoft/tui-test`. It includes suites like "Responsive layout E2E" and "Theme Token Application".
*   **Action**: The 12 `SNAP-NB-***` tests and 5 `RESIZE-NB-***` tests detailed in the spec must be appended to this file. Helper functions like `launchTUI()` and `terminal.snapshot()` from `e2e/tui/helpers.ts` are heavily used in this file and can be mirrored for the new badge layout tests.

### **`e2e/tui/notifications.test.ts`**
*   **Current State**: Does not currently exist in the codebase.
*   **Action**: This file needs to be scaffolded to include the 7 `KEY-NB-***`, 7 `SSE-NB-***`, 9 `EDGE-NB-***`, and 3 `INT-NB-***` tests outlined by the engineering specification. It will require imports from `@microsoft/tui-test` and local test helpers (e.g., `launchTUI`).

## 4. Scaffold Paths to Create
The following paths do not exist and must be created:
*   `apps/tui/src/components/NotificationBadge/HeaderBadge.tsx`
*   `apps/tui/src/components/NotificationBadge/StatusBarBadge.tsx`
*   `e2e/tui/notifications.test.ts`