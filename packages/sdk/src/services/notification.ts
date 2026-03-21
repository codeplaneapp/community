import type { Sql } from "postgres";
import { Result } from "better-result";

import {
  type APIError,
  badRequest,
  internal,
  notFound,
} from "../lib/errors";

import {
  listNotificationsByUser,
  countNotificationsByUser,
  markNotificationRead,
  markAllNotificationsRead,
  listNotificationsAfterID,
  createNotification,
  notifyUser,
} from "../db/notifications_sql";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface NotificationListResult {
  items: NotificationResponse[];
  total: number;
}

export interface CreateNotificationInput {
  userId: string;
  sourceType: string;
  sourceId: string | null;
  subject: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 50;

// ---------------------------------------------------------------------------
// NotificationService — matches Go's notification service layer
// ---------------------------------------------------------------------------

export class NotificationService {
  constructor(private readonly sql: Sql) {}

  /**
   * List notifications for a user with pagination.
   * Matches Go's ListNotifications handler.
   */
  async listNotifications(
    userId: number,
    page: number,
    perPage: number
  ): Promise<Result<NotificationListResult, APIError>> {
    if (userId <= 0) {
      return Result.err(badRequest("invalid user id"));
    }

    const p = normalizePagination(page, perPage);
    const offset = (p.page - 1) * p.perPage;

    const totalRow = await countNotificationsByUser(this.sql, {
      userId: String(userId),
    });
    const total = totalRow ? Number(totalRow.count) : 0;

    const rows = await listNotificationsByUser(this.sql, {
      userId: String(userId),
      pageOffset: String(offset),
      pageSize: String(p.perPage),
    });

    const items: NotificationResponse[] = rows.map(mapNotificationRow);

    return Result.ok({ items, total });
  }

  /**
   * List notifications after a given ID (for SSE replay).
   * Matches Go's notification stream replay logic.
   */
  async listNotificationsAfterID(
    userId: number,
    afterId: number,
    limit: number
  ): Promise<Result<NotificationResponse[], APIError>> {
    if (userId <= 0) {
      return Result.err(badRequest("invalid user id"));
    }

    const maxResults = Math.min(Math.max(limit, 1), 1000);
    const rows = await listNotificationsAfterID(this.sql, {
      userId: String(userId),
      afterId: String(afterId),
      maxResults: String(maxResults),
    });

    return Result.ok(rows.map(mapNotificationRow));
  }

  /**
   * Mark a single notification as read.
   * Matches Go's MarkNotificationRead.
   */
  async markRead(
    userId: number,
    notificationId: number
  ): Promise<Result<void, APIError>> {
    if (userId <= 0) {
      return Result.err(badRequest("invalid user id"));
    }
    if (notificationId <= 0) {
      return Result.err(badRequest("invalid notification id"));
    }

    await markNotificationRead(this.sql, {
      id: String(notificationId),
      userId: String(userId),
    });

    return Result.ok(undefined);
  }

  /**
   * Mark all unread notifications as read for a user.
   * Matches Go's MarkAllNotificationsRead.
   */
  async markAllRead(
    userId: number
  ): Promise<Result<void, APIError>> {
    if (userId <= 0) {
      return Result.err(badRequest("invalid user id"));
    }

    await markAllNotificationsRead(this.sql, {
      userId: String(userId),
    });

    return Result.ok(undefined);
  }

  /**
   * Create a notification and optionally send PG NOTIFY.
   * Matches Go's CreateNotification + NotifyUser pattern.
   */
  async create(
    input: CreateNotificationInput
  ): Promise<Result<NotificationResponse, APIError>> {
    if (!input.userId || Number(input.userId) <= 0) {
      return Result.err(badRequest("invalid user id"));
    }
    if (!input.subject.trim()) {
      return Result.err(badRequest("notification subject is required"));
    }

    const row = await createNotification(this.sql, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      subject: input.subject,
      body: input.body,
    });
    if (!row) {
      return Result.err(internal("failed to create notification"));
    }

    const notification = mapNotificationRow(row);

    // Send PG NOTIFY for real-time SSE delivery (best-effort)
    try {
      await notifyUser(this.sql, {
        userId: input.userId,
        payload: JSON.stringify({
          id: notification.id,
          subject: notification.subject,
          source_type: notification.source_type,
        }),
      });
    } catch {
      // Non-fatal: notification delivery via PG LISTEN is best-effort
    }

    return Result.ok(notification);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePagination(
  page: number,
  perPage: number
): { page: number; perPage: number } {
  if (page < 1) page = 1;
  if (perPage < 1) perPage = DEFAULT_PER_PAGE;
  if (perPage > MAX_PER_PAGE) perPage = MAX_PER_PAGE;
  return { page, perPage };
}

function toISO(d: Date | string): string {
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function mapNotificationRow(r: {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string | null;
  subject: string;
  body: string;
  status: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): NotificationResponse {
  return {
    id: Number(r.id),
    user_id: Number(r.userId),
    source_type: r.sourceType,
    source_id: r.sourceId ? Number(r.sourceId) : null,
    subject: r.subject,
    body: r.body,
    status: r.status,
    read_at: r.readAt ? toISO(r.readAt) : null,
    created_at: toISO(r.createdAt),
    updated_at: toISO(r.updatedAt),
  };
}
