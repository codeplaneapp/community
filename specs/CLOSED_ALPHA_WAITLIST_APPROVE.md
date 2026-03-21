# CLOSED_ALPHA_WAITLIST_APPROVE

Specification for CLOSED_ALPHA_WAITLIST_APPROVE.

## High-Level User POV

As a Codeplane administrator, I need to approve users from the closed-alpha waitlist so they can access the platform. I navigate to the admin panel's waitlist section, review pending applications, and approve individual users. Upon approval, the user's account transitions from waitlisted to active, they receive a notification, and they can immediately begin using Codeplane. I can also bulk-approve multiple users and search/filter the waitlist by email, username, or signup date.

## Acceptance Criteria

1. Admin can view paginated list of waitlisted users at GET /api/admin/waitlist with filters for status (pending/approved/rejected), search by email/username, and sort by signup date.
2. Admin can approve a single user via POST /api/admin/waitlist/:userId/approve, which transitions the user from 'waitlisted' to 'active' status.
3. Admin can bulk-approve multiple users via POST /api/admin/waitlist/bulk-approve with a list of user IDs.
4. Approved users can immediately authenticate and access all Community Edition features.
5. A notification is sent to the user's verified email upon approval.
6. The waitlist entry records the approving admin's ID and approval timestamp.
7. Attempting to approve an already-approved user returns a 409 Conflict.
8. Non-admin users receive 403 Forbidden when accessing waitlist endpoints.
9. The admin UI waitlist view reflects approval state changes in real-time via SSE.
10. CLI command `codeplane admin waitlist approve <userId>` provides equivalent functionality.

## Design

The waitlist approval flow touches three layers:

**Service layer** (`packages/sdk/src/services/admin.ts`): The AdminService exposes `approveWaitlistUser(userId, adminId)` and `bulkApproveWaitlistUsers(userIds, adminId)`. These methods update the user's `alpha_status` field from 'waitlisted' to 'active', set `approved_at` and `approved_by` columns, and emit a `waitlist.approved` event via the SSE manager. The service validates that the user exists and is currently in 'waitlisted' status before proceeding.

**Route layer** (`apps/server/src/routes/admin.ts`): Mounts `POST /api/admin/waitlist/:userId/approve` and `POST /api/admin/waitlist/bulk-approve` behind the existing admin auth middleware. The route handler deserializes the request, calls the AdminService, and returns the updated user record(s). The `GET /api/admin/waitlist` endpoint supports `?status=`, `?search=`, `?page=`, `?per_page=`, and `?sort=` query parameters.

**Client surfaces**: The admin web UI (`apps/ui/src/routes/admin/waitlist.tsx`) renders a filterable/searchable table with approve/reject actions per row and a bulk-approve toolbar action. The CLI (`apps/cli/src/commands/admin/waitlist.ts`) provides `list`, `approve`, and `bulk-approve` subcommands.

**Notification**: On approval, the notification service creates an in-app notification for the user and, if email is verified, dispatches an approval email via the existing email transport.

**Database**: The existing `users` table's `alpha_status` enum column is used. An `approved_at` timestamp and `approved_by` foreign key to users are added if not already present.

## Permissions & Security

- Only users with the `admin` role can access any `/api/admin/waitlist/*` endpoint.
- The admin auth middleware (`requireAdmin`) gates all waitlist management routes.
- Non-admin authenticated users receive 403 Forbidden.
- Unauthenticated requests receive 401 Unauthorized.
- The approving admin's identity is recorded on the waitlist entry for audit purposes.
- PAT-based access is permitted for admin users (enabling CLI and automation use cases).
- Deploy keys and OAuth2 application tokens cannot access admin endpoints.

## Telemetry & Product Analytics

- `waitlist.user.approved` event: emitted on each successful approval with fields `userId`, `adminId`, `approvedAt`, `waitDurationMs` (time from signup to approval).
- `waitlist.bulk_approve` event: emitted on bulk approval with fields `adminId`, `userCount`, `approvedAt`.
- `waitlist.approve.failed` event: emitted on approval failure with fields `userId`, `adminId`, `reason` (e.g., 'already_approved', 'user_not_found').
- Aggregate metrics: total waitlist size, approval rate (approvals per day), average wait duration, and conversion rate (approved users who complete first login within 7 days).

## Observability

- Structured log entries at INFO level for each approval: `{event: 'waitlist_approved', userId, adminId, waitDurationMs}`.
- Structured log entries at WARN level for failed approvals: `{event: 'waitlist_approve_failed', userId, adminId, reason}`.
- Health endpoint includes waitlist queue depth as a gauge metric.
- SSE manager emits `waitlist.approved` events to admin-subscribed channels for real-time UI updates.
- Error responses include request IDs for correlation.
- Database query latency for waitlist operations is tracked via the existing query instrumentation in the SDK.

## Verification

1. **Unit tests** (`packages/sdk/src/services/__tests__/admin.test.ts`): Test `approveWaitlistUser` transitions status correctly, rejects already-approved users with appropriate error, records admin ID and timestamp, and emits the correct SSE event.
2. **Unit tests for bulk**: Test `bulkApproveWaitlistUsers` handles mixed valid/invalid IDs, returns partial success results, and emits events for each approved user.
3. **Route integration tests** (`apps/server/src/routes/__tests__/admin.test.ts`): Test HTTP status codes (200 on success, 409 on duplicate, 404 on missing user, 403 for non-admin, 401 for unauthenticated). Test query parameter filtering and pagination on the list endpoint.
4. **CLI integration tests** (`apps/cli/src/commands/admin/__tests__/waitlist.test.ts`): Test that `admin waitlist approve <userId>` calls the correct API endpoint and displays the result.
5. **E2E test** (`e2e/waitlist-approval.test.ts`): Full flow — create a waitlisted user, approve via admin API, verify the user can now authenticate and access repositories.
6. **Notification test**: Verify that approval triggers both an in-app notification and an email dispatch to the approved user.
7. **Idempotency test**: Verify that approving an already-approved user returns 409 and does not duplicate notifications.
