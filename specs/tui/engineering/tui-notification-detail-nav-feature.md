# Engineering Specification: TUI_NOTIFICATION_DETAIL_NAV

## 1. Overview

This specification details the implementation of source-type routing from the TUI Notification List. When a user selects a notification, the TUI will use denormalized context fields to synchronously navigate to the notification's source resource (e.g., Issue Detail, Landing Detail, Workflow Run Detail). It includes a fallback API resolution path for legacy notifications, optimistic "mark as read" behavior, and complete state preservation upon return.

## 2. Implementation Plan

### Phase 1: SDK and UI-Core Data Layer Updates

**1. Update Notification Types (`packages/sdk/src/types/notification.ts`)**
- Add denormalized navigation fields to `NotificationResponse` (and related DTOs):
  - `repo_owner?: string | null`
  - `repo_name?: string | null`
  - `resource_number?: number | null`
- Add `NotificationSourceResolveResponse` type for the fallback API endpoint:
  ```typescript
  export interface NotificationSourceResolveResponse {
    screen: string;
    repo_owner: string | null;
    repo_name: string | null;
    resource_number: number | null;
  }
  ```

**2. Extend `useNotifications` Hook (`packages/ui-core/src/hooks/useNotifications.ts`)**
- Add `markRead(id: number)` to the hook payload.
- Implement optimistic local cache updates within `markRead`:
  - Find the notification in the infinite query cache pages.
  - Set `status = 'read'`.
  - Decrement the global `unreadCount`.
- Execute `PATCH /api/notifications/:id` with `{ status: 'read' }`.
- If the request fails (non-404, non-429), revert the optimistic update.
- If the request returns 404, remove the notification from the cache entirely.

**3. Create Resolution Hook (`packages/ui-core/src/hooks/useNotificationSourceResolve.ts`)**
- Implement an imperative function `resolveSource(notificationId: number, signal?: AbortSignal)` that fetches `GET /api/notifications/:id/source`.
- Handle standard error transformations (404 -> `NotFoundError`, 403 -> `AccessDeniedError`, etc.) to be consumed by the TUI layer.

### Phase 2: Screen Routing and Navigation Logic

**1. Create Routing Mapper (`apps/tui/src/utils/notification-routing.ts`)**
- Create a pure function mapping `source_type` and fields to screen push parameters.
  ```typescript
  export function getNavigationTarget(notif: NotificationResponse): { screen: ScreenName, params: any } | null {
    // Guards
    if (!notif.source_id) throw new Error("NULL_SOURCE_ID");

    const repo = notif.repo_owner && notif.repo_name ? `${notif.repo_owner}/${notif.repo_name}` : undefined;

    switch (notif.source_type) {
      case 'issue':
      case 'issue_comment':
        if (!repo || notif.resource_number == null) return null; // Needs resolution
        return { screen: 'IssueDetail', params: { repo, number: String(notif.resource_number) } };
      case 'landing_request':
      case 'lr_review':
      case 'lr_comment':
        if (!repo || notif.resource_number == null) return null; // Needs resolution
        return { screen: 'LandingDetail', params: { repo, number: String(notif.resource_number) } };
      case 'workflow_run':
        if (!repo) return null; // Needs resolution
        return { screen: 'WorkflowRunDetail', params: { repo, runId: String(notif.source_id) } };
      case 'workspace':
        return { screen: 'WorkspaceDetail', params: { workspaceId: String(notif.source_id) } };
      default:
        throw new Error("UNKNOWN_SOURCE_TYPE");
    }
  }
  ```

### Phase 3: Notification Screen Updates

**1. Local State Additions (`apps/tui/src/screens/NotificationScreen.tsx`)**
- Add state to track resolution:
  ```typescript
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  ```

**2. The Navigation Action (`onSelect` handler)**
- Guard: If `isLoading` or `resolvingId` is active, no-op.
- Guard: Check `source_id` != null. If null, flash "Cannot navigate — source not found".
- Guard: Check `source_type`. If unmapped, flash "Unknown notification type".
- Optimistic Read: If `status === 'unread'`, call `markRead(notif.id)`.
- Attempt synchronous routing via `getNavigationTarget`.
  - If it returns a target, push it immediately: `push(target.screen, target.params)`.
  - If it returns `null` (missing fields), initiate fallback resolution.

**3. Fallback Resolution Execution**
- Create new `AbortController`, store in `abortControllerRef`.
- `setResolvingId(notif.id)`.
- `setHints` on status bar to show "Resolving… (Esc to cancel)".
- Call `resolveSource(notif.id, signal)` with a 10s timeout.
- On success: `push(res.screen, { repo: ..., number: ... })`.
- On error (catch):
  - AbortError: Silent (cancelled by user).
  - 404: `flash("Source resource not found.", "warning")`.
  - 403: `flash("You no longer have access to this resource.", "warning")`.
  - 429: `flash("Rate limited. Retry in ...", "warning")`.
  - Timeout: `flash("Navigation timed out. Press Enter to retry.", "error")`.
- `finally`: `setResolvingId(null)`, clear controller, reset standard hints.

**4. Keyboard and Focus Cancellations**
- Add `Esc` to screen keybindings (conditional on `resolvingId !== null`): calls `abortControllerRef.current?.abort()`.
- Pass an `onFocusChange` prop to `<ScrollableList>` (or intercept `j`/`k`). If focus changes while `resolvingId` is active, trigger `abort()`.
- Screen unmount (`q`) inherently drops the state, but we should return a cleanup function in a `useEffect` that aborts any active controller.

### Phase 4: UI Polish and Spinner

**1. Row Rendering (`apps/tui/src/screens/NotificationScreen.tsx` or `NotificationRow.tsx`)**
- Add `isResolving` boolean to the row render payload.
- Create a `useResolutionSpinner(isResolving)` hook using OpenTUI's `useTimeline` to cycle frames `['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']` at 80ms, but *only* starting after a 200ms delay.
- In the 2ch unread indicator column:
  ```tsx
  <text width={2} color="muted">
    {isResolving && spinnerVisible ? spinnerFrame : notif.status === 'unread' ? '●' : ' '}
  </text>
  ```
- Ensure the row correctly unbolds text if it was optimistically marked read.

**2. List State Preservation**
- State preservation requires zero additional code if `<ScrollableList>` correctly derives initial scroll position/focus from component state that lives higher than the screen component or relies on React's standard context preservation during a stack `push`/`pop` (the router hides the component but keeps it mounted/cached in the stack).

## 3. Unit & Integration Tests

Create `e2e/tui/notifications.test.ts` focusing entirely on the user flows and terminal snapshots.

### Test Data Configuration
Setup HTTP mocks/handlers for:
- Enriched notifications (issue, landing, workflow_run, workspace).
- Legacy notification requiring fallback.
- Edge case notifications (null source_id, unknown source_type).
- Resolution API endpoints returning 200, 404, 403, 429, timeout.
- Mark read PATCH endpoint.

### Terminal Snapshot Tests
- **SNAP-DETAILNAV-001**: `Enter` on enriched issue notification -> verify `Issue Detail` screen and breadcrumbs.
- **SNAP-DETAILNAV-002**: `Enter` on enriched landing notification -> verify `Landing Detail` screen and breadcrumbs.
- **SNAP-DETAILNAV-003**: `Enter` on enriched workflow notification -> verify `Workflow Run Detail` and breadcrumbs.
- **SNAP-DETAILNAV-004**: `Enter` on workspace notification -> verify `Workspace Detail` screen and breadcrumbs.
- **SNAP-DETAILNAV-005**: Null source_id -> assert status bar "Cannot navigate — source not found".
- **SNAP-DETAILNAV-006**: Unknown source_type -> assert status bar "Unknown notification type".
- **SNAP-DETAILNAV-007**: Return from detail -> assert previously unread notification is normal weight with no dot.
- **SNAP-DETAILNAV-008**: Return with Unread filter -> assert navigated notification removed from list and focus advanced.
- **SNAP-DETAILNAV-009**: Resolving state (fallback) -> mock 500ms delay, assert status bar "Resolving… (Esc to cancel)", assert row spinner visible.
- **SNAP-DETAILNAV-010**: Timeout state -> mock 10s delay, assert "Navigation timed out. Press Enter to retry." in status bar.

### Keyboard Interaction Tests
- **KEY-DETAILNAV-001** to **007**: Verify routing matrix works without network calls (enriched data path).
- **KEY-DETAILNAV-010**: Unread notification marked read optimistically on `Enter`.
- **KEY-DETAILNAV-013**: `Esc` during resolution cancels API call and restores standard status bar.
- **KEY-DETAILNAV-014**: `j` during resolution cancels API call and moves focus down.
- **KEY-DETAILNAV-021**: `q` on target detail screen pops back to notification list.
- **KEY-DETAILNAV-022**: State preservation on return (scroll position, focus, search query maintained).
- **KEY-DETAILNAV-025**: Triage loop `Enter` -> `q` -> `j` -> `Enter` marks multiple notifications as read successively.

### Integration Tests
- **INT-DETAILNAV-005**: Legacy resolution API hit; assert screen pushed successfully when 200 returned.
- **INT-DETAILNAV-008**: Mark-read 500 failure; assert optimistic update reverts silently on return.
- **INT-DETAILNAV-012**: Resolution 404; assert target stays on list and shows "Source resource not found." in status bar.
- **INT-DETAILNAV-013**: Resolution 403; assert status bar "You no longer have access...".
- **INT-DETAILNAV-017**: Unread badge in header decrements immediately upon `Enter`.

### Edge Case Tests
- **EDGE-DETAILNAV-002**: Push max stack depth (32) and assert "Navigation stack full" error status.
- **EDGE-DETAILNAV-004**: Rapid `Enter` -> `q` -> `Enter` on same item handles correctly (no double mark read call).
- **EDGE-DETAILNAV-009**: Rapid `Enter` -> `Esc` cycle -> verifies clean aborts without memory leaks or frozen spinner.
