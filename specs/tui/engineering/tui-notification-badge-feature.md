# Engineering Specification: TUI_NOTIFICATION_BADGE

## High-Level User POV

The notification badge is a persistent, real-time unread notification counter present in both the header bar and the status bar on every TUI screen. The header badge renders compactly as `[N]` (or `[99+]`) in warning yellow, completely hiding itself when no unread notifications remain. The status bar badge acts as an ever-present anchor, rendering a diamond symbol (`◆ N`) in primary blue, or a muted diamond (`◆`) when empty.

The badge is non-interactive but dynamic. Powered by Server-Sent Events (SSE), the count increments in real-time as notifications arrive, triggering a 2-second bold pulse in the status bar to subtly capture the user's attention. Optimistic updates decrease the count immediately when marking items read, and network resilience guarantees that during a disconnect, the last known count is securely retained rather than deceivingly cleared to 0.

## Implementation Plan

### 1. Component Implementation
Create two new specialized component files for the badges inside `apps/tui/src/components/NotificationBadge/`.

**`apps/tui/src/components/NotificationBadge/HeaderBadge.tsx`**
*   **Data Hook:** Call `useNotifications()` from `@codeplane/ui-core` to retrieve `unreadCount`.
*   **Logic:**
    *   Handle boundary constraints: treat `unreadCount < 0`, `null`, or `undefined` strictly as `0`.
    *   If `unreadCount <= 0`, return `null` (hiding the component from the header layout entirely).
    *   Determine the display string: if `unreadCount > 99`, display `"99+"`, otherwise output `unreadCount` directly.
*   **Render:**
    *   Wrap in OpenTUI's `<box flexShrink={0}>` (if structurally necessary inside the flex container).
    *   Use OpenTUI's `<text>` component.
    *   Apply the `warning` semantic color token (ANSI 178) from `useTheme()`.
    *   Render the format `[{displayCount}]` with a leading space ` ` to ensure proper spacing against the connection status indicator.

**`apps/tui/src/components/NotificationBadge/StatusBarBadge.tsx`**
*   **Data Hook:** Call `useNotifications()` from `@codeplane/ui-core` to retrieve `unreadCount`.
*   **Pulse State Management:**
    *   Keep a React `useRef` to track `prevUnreadCount`.
    *   Maintain boolean state: `const [isBoldPulseActive, setIsBoldPulseActive] = useState(false)`.
    *   Implement a `useEffect` hook with `unreadCount` as a dependency:
        *   If `unreadCount > prevUnreadCount.current` (count increased), set `isBoldPulseActive(true)`.
        *   Clear any previously scheduled timeout.
        *   Set a new timeout for 2000ms to revert `isBoldPulseActive` back to `false`.
        *   Sync `prevUnreadCount.current = unreadCount`.
        *   Return a cleanup function to explicitly clear the timeout on unmount, avoiding memory leaks.
*   **Render:**
    *   Determine the `displayCount` similar to the header (cap at `"99+"`).
    *   If `unreadCount > 0`: Render `<text>` utilizing the `primary` color token (ANSI 33). Pass the `BOLD` attribute if `isBoldPulseActive` evaluates to true. Output text `◆ {displayCount}`.
    *   If `unreadCount <= 0`: Render `<text>` using the `muted` color token (ANSI 245) with no text attributes. Output text `◆`.
    *   Ensure the outer container uses `flexShrink={0}` so the badge doesn't collapse at smaller terminal widths.

### 2. AppShell Layout Integration
Inject the newly created components into the top-level layout.

**`apps/tui/src/components/AppShell/HeaderBar.tsx`**
*   Locate the right-side alignment box (`<box flexShrink={0} justifyContent="flex-end">`).
*   Import `<HeaderBadge />`.
*   Append it cleanly to the right of the connection status component (`●` or `○`).

**`apps/tui/src/components/AppShell/StatusBar.tsx`**
*   Locate the right section of the status bar.
*   Import `<StatusBarBadge />`.
*   Prepend it securely to the left of the `?:help` text element, ensuring the flex layout allocates max 6 characters.

### 3. Data Flow Validation
*   **Optimistic Execution:** Validated by `useNotifications` implementation; UI immediately reflects minus-count adjustments on `markRead` or zeroed-out state on `markAllRead` without waiting for round-trips.
*   **Stale Retention Check:** Verify the `<SSEProvider>` or `useNotifications` state handles connectivity drops passively. It should not overwrite or nullify the active `unreadCount` metric just because the SSE connection transitioned to an offline state.

## Unit & Integration Tests

Utilizing `@microsoft/tui-test`, enact the full gamut of expected terminal behaviors. Implement these explicitly mapped 43 tests.

### File: `e2e/tui/app-shell.test.ts`
Contains structural rendering tests and responsive layout verifications targeting `HeaderBadge` and `StatusBarBadge` placement.

**Terminal Snapshot Tests (12)**
*   `SNAP-NB-001`: Header bar badge renders with unread count at 120x40
*   `SNAP-NB-002`: Header bar badge hidden when count is zero at 120x40
*   `SNAP-NB-003`: Header bar badge shows 99+ for large counts at 120x40
*   `SNAP-NB-004`: Status bar badge renders with unread count at 120x40
*   `SNAP-NB-005`: Status bar badge renders muted diamond when count is zero at 120x40
*   `SNAP-NB-006`: Status bar badge shows 99+ for large counts at 120x40
*   `SNAP-NB-007`: Header bar badge renders at 80x24 minimum
*   `SNAP-NB-008`: Status bar badge renders at 80x24 minimum
*   `SNAP-NB-009`: Both badges render at 200x60 large terminal
*   `SNAP-NB-010`: Header bar badge position relative to connection indicator
*   `SNAP-NB-011`: Status bar badge position relative to help hint
*   `SNAP-NB-012`: Both badges show consistent count

**Responsive / Resize Tests (5)**
*   `RESIZE-NB-001`: Badges adapt when terminal resizes from 120x40 to 80x24
*   `RESIZE-NB-002`: Badges adapt when terminal resizes from 80x24 to 200x60
*   `RESIZE-NB-003`: Badges survive rapid resize
*   `RESIZE-NB-004`: Badges disappear below minimum terminal size
*   `RESIZE-NB-005`: Badges restore after resize back above minimum

### File: `e2e/tui/notifications.test.ts`
Contains SSE stream updates, keyboard bindings, and boundary handling verifications.

**Keyboard Interaction Tests (7)**
*   `KEY-NB-001`: Mark single notification read decrements both badges
*   `KEY-NB-002`: Mark all notifications read zeroes both badges
*   `KEY-NB-003`: Navigate to notifications with g n (badge remains visible)
*   `KEY-NB-004`: Badge persists across screen navigations
*   `KEY-NB-005`: Mark read on already-read notification does not change badge
*   `KEY-NB-006`: Rapid r presses on same notification only decrements once
*   `KEY-NB-007`: Mark all read when already at zero is a no-op

**SSE Real-Time Update Tests (7)**
*   `SSE-NB-001`: New notification updates both badges in real-time
*   `SSE-NB-002`: Multiple SSE notifications increment badge correctly
*   `SSE-NB-003`: SSE disconnect retains last known count
*   `SSE-NB-004`: SSE reconnect updates with missed events
*   `SSE-NB-005`: Bold pulse on new notification via SSE
*   `SSE-NB-006`: Bold pulse resets on rapid successive notifications
*   `SSE-NB-007`: Cross-client mark-read updates badge via SSE

**Edge Case Tests (9)**
*   `EDGE-NB-001`: Badges render without auth token
*   `EDGE-NB-002`: Badges render on every screen
*   `EDGE-NB-003`: Badge handles count of exactly 99
*   `EDGE-NB-004`: Badge handles count of exactly 100
*   `EDGE-NB-005`: Badge handles count of 1
*   `EDGE-NB-006`: Optimistic revert on mark-read failure
*   `EDGE-NB-007`: Bold pulse does not trigger on mark-read (count decrease)
*   `EDGE-NB-008`: Badges on all screens during SSE disconnect
*   `EDGE-NB-009`: Header bar badge and connection indicator coexist

**Integration Tests (3)**
*   `INT-NB-001`: Badge integrates with notification list mark-read
*   `INT-NB-002`: Badge integrates with mark-all-read then new SSE arrival
*   `INT-NB-003`: Badge consistent after session with mixed operations
