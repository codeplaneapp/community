# TUI_HEADER_BAR — Research & Context Findings

This document details the existing codebase context and prerequisites required to implement the `TUI_HEADER_BAR` feature in the Codeplane TUI. The research is based on the current state of the repository, specifically analyzing `apps/tui/src` components, providers, hooks, and existing tests in `e2e/tui/app-shell.test.ts`.

## 1. Current State of `HeaderBar`

The `apps/tui/src/components/HeaderBar.tsx` currently has a basic structural implementation but relies heavily on stubs and placeholders:
- **Breadcrumb Trail:** It successfully reads from `nav.stack` (using `useNavigation`) and formats it using the `truncateBreadcrumb` utility. It correctly splits the segments by `' › '` to color the current segment with bold text.
- **Repository Context:** Displays the `owner/repo` string when available, conditionally hidden when the layout breakpoint is `"minimum"`.
- **Connection Status:** Currently hardcoded to `"connected"` and strictly uses the `theme.success` color. It uses a filled circle `●` as the static indicator symbol.
- **Notification Badge:** The `unreadCount` is strictly hardcoded to `0`.
- **Telemetry:** Not currently emitting any analytics or lifecycle events on render, truncation, or status change.

## 2. SSE Provider (`SSEProvider.tsx`)

The current `apps/tui/src/providers/SSEProvider.tsx` is completely stubbed out:
```tsx
import { createContext, useContext } from "react";

export interface SSEEvent {
  type: string;
  data: any;
}

const SSEContext = createContext<null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  return <SSEContext.Provider value={null}>{children}</SSEContext.Provider>;
}

export function useSSE(channel: string) {
  return null;
}
```
**Implementation Need:** As per the spec, the full SSE implementation (which handles `EventSource` ticket-based auth) will be a separate ticket. However, this ticket requires defining the **interface contract** for `connectionState` and `unreadNotificationCount`. These should be derived from `useAuth().status` as a bridge implementation:
- `status === "authenticated"` -> `connectionState: "connected"`
- `status === "offline" | "unauthenticated" | "expired"` -> `connectionState: "disconnected"`
- `status === "loading"` -> `connectionState: "connecting"`

## 3. Data Flow & Hooks

### `useAuth()` (`apps/tui/src/hooks/useAuth.ts`)
This hook wraps `AuthContext` and provides `status` (`"loading" | "authenticated" | "unauthenticated" | "expired" | "offline"`). This is essential for the fallback `connectionState` logic in the `SSEProvider`.

### Breadcrumb & Text Utilities (`apps/tui/src/util/text.ts`)
- `truncateBreadcrumb(segments, maxWidth)`: Handles array of segments and fits them into the allotted width by appending an ellipsis (`…`) from the left-most parent paths. The current segment is always preserved.
- `truncateRight(text, maxWidth)`: Available and fully suited for truncating repository context strings that exceed 30 characters (e.g., `'very-long-org/really-long-re…'`).

### Telemetry (`apps/tui/src/lib/telemetry.ts`)
The telemetry library provides an `emit(name: string, properties: Record<string, any>)` function. We need to implement the following events in `HeaderBar`:
- `tui.header_bar.rendered`
- `tui.header_bar.breadcrumb_truncated`
- `tui.header_bar.connection_lost`
- `tui.header_bar.connection_restored`
- `tui.notification_badge.updated`

### Hook Exports (`apps/tui/src/hooks/index.ts`)
The `hooks` barrel file exists and successfully exports hooks like `useTheme`, `useLayout`, etc. We will need to append an export for `useHeaderBar` once created.

## 4. Testing Infrastructure (`e2e/tui/app-shell.test.ts`)

The E2E tests are implemented using `@microsoft/tui-test`. Looking at `e2e/tui/app-shell.test.ts`, there are extensive suites for layout breakpoints, color detection, and theme application, but **no test groups for `TUI_HEADER_BAR`** exist yet.

The framework supports commands like `launchTUI()`, `terminal.waitForText()`, `terminal.sendKeys()`, `terminal.resize()`, and `terminal.snapshot()`. The specific test cases listed in the engineering spec (Breadcrumb rendering, Repository context, Connection status indicator, Notification badge, Keyboard interaction, Responsive resize, SSE real-time, Edge cases, and Unit tests) will be cleanly appended to this file.

## 5. Architectural Map for Implementation

1. **Modify `SSEProvider.tsx`:** Expand `SSEContext` to pass `{ connectionState, unreadNotificationCount }`. Use `useAuth` to map the `status` string to a mock `ConnectionState`.
2. **Create `useHeaderBar.ts`:** Aggregate state from `useNavigation`, `useLayout`, `useTheme`, and `useSSE`. Calculate responsive widths, formatting for badges (`[99+]`), color semantics based on state (`success` vs `warning` vs `error`), and unicode icons (`●` and `○`). Add logic for repository name truncation > 30 characters.
3. **Update `HeaderBar.tsx`:** Call `useHeaderBar()`. Add `useEffect` hooks linked to telemetry `emit()` calls for render tracking, truncation states, and connection drops.
4. **Update `hooks/index.ts`:** Export the new `useHeaderBar`.
5. **Write tests:** Append the missing `TUI_HEADER_BAR` E2E test sections exactly as outlined in the spec into `e2e/tui/app-shell.test.ts`.

This confirms all dependencies (`@opentui/react`, `@codeplane/ui-core` via stubs, `useAuth`, text utilities) are present and ready for the `TUI_HEADER_BAR` refactor to proceed smoothly.