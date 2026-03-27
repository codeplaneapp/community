# Research: TUI_NOTIFICATION_DETAIL_NAV

## 1. Context and Existing Code

### `NotificationResponse` Type
The engineering specification identifies `packages/sdk/src/types/notification.ts` as the target for `NotificationResponse` type updates. However, the `NotificationResponse` interface currently lives in `packages/sdk/src/services/notification.ts` (lines 24-36):
```typescript
export interface NotificationResponse {
  id: number;
  user_id: number;
  source_type: string;
  source_id: number | null;
  subject: string;
  body: string;
  status: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}
```
**Action**: This interface needs to be updated with the denormalized fields (`repo_owner`, `repo_name`, `resource_number`) as well as adding the `NotificationSourceResolveResponse` type.

### `@codeplane/ui-core` Data Layer
The specification requires adding hooks to `packages/ui-core/src/hooks/`.
- Currently, `packages/ui-core/` does not exist in the root `packages/` workspace directory. There is a scaffolded `specs/tui/packages/ui-core/` directory, but the hooks `useNotifications.ts` and `useNotificationSourceResolve.ts` do not exist yet.
- **Action**: We will need to create the new `useNotifications` and `useNotificationSourceResolve` hooks per the provided design specifications, or verify if the `ui-core` package is intended to be merged first.

### TUI Screens and Routing
- **Notification Screen**: `apps/tui/src/screens/NotificationScreen.tsx` does not exist. Only `PlaceholderScreen.tsx` exists in `apps/tui/src/screens/`. The notification screen itself must be scaffolded as part of this or a preceding ticket.
- **Notification Routing**: The spec asks to create `apps/tui/src/utils/notification-routing.ts`. Note that the existing utility directory in `apps/tui/src/` is named `util/`, not `utils/`. It is recommended to use `apps/tui/src/util/notification-routing.ts` to adhere to codebase conventions.

### Server Routing
- The server route for notifications is located at `apps/server/src/routes/notifications.ts`.
- The `GET /api/notifications/:id/source` endpoint referenced in the specification (Phase 1.3) does not yet exist and will need to be implemented on the backend to support the legacy notification fallback resolution, or the hook will need to handle a mocked/fallback response until the API is available.

### E2E Tests
- The file `e2e/tui/notifications.test.ts` does not exist and will need to be created. Other E2E tests in the workspace (like `e2e/tui/agents.test.ts` and `e2e/tui/repository.test.ts`) use `@microsoft/tui-test`.

## 2. Implementation Readiness Assessment
1. **Types**: The notification types are found in the `services` directory, not `types`.
2. **Missing Infrastructure**: Most target files (hooks, TUI screens) need to be created from scratch. Ensure that dependent PRs (like the initial notification list layout) are merged, or expand the scope of this ticket to scaffold the base components.
3. **Directory Names**: Follow the `apps/tui/src/util` convention instead of creating a new `utils` folder.