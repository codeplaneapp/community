import { Hono } from "hono";
import {
  getUser,
  badRequest,
  unauthorized,
  writeError,
  writeJSON,
  writeRouteError,
  type SSEEvent,
  formatSSEEvent,
  sseResponse,
  sseStreamWithInitial,
} from "@jjhub/sdk";
import { Result } from "better-result";
import { getServices } from "../services";

/** Lazily resolve the notification service from the registry on each request. */
function service() {
  return getServices().notification;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/notifications (SSE endpoint)
// Streams real-time notifications via PostgreSQL LISTEN/NOTIFY.
// Mirrors Go's NotificationStream handler in internal/routes/notifications.go.
//
// Channel: user_notifications_{userId}
// Supports Last-Event-ID header for reconnection replay.
// Sends keep-alive comments every 15 seconds.
app.get("/api/notifications", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const sse = getServices().sse;
  const channel = `user_notifications_${user.id}`;

  // Parse Last-Event-ID header for reconnection replay
  const initialEvents: SSEEvent[] = [];
  const lastEventIDRaw = c.req.header("Last-Event-ID");
  if (lastEventIDRaw) {
    const lastEventID = parseInt(lastEventIDRaw, 10);
    if (!isNaN(lastEventID) && lastEventID > 0) {
      const result = await service().listNotificationsAfterID(
        user.id,
        lastEventID,
        1000,
      );
      if (Result.isOk(result)) {
        for (const notif of result.value) {
          initialEvents.push({
            id: String(notif.id),
            type: "notification",
            data: JSON.stringify(notif),
          });
        }
      }
    }
  }

  // Subscribe to the user's notification channel
  const liveStream = sse.subscribe(channel, {
    eventType: "notification",
  });

  // Combine replay events with live stream
  const stream =
    initialEvents.length > 0
      ? sseStreamWithInitial(initialEvents, liveStream)
      : liveStream;

  return sseResponse(stream);
});

// GET /api/notifications/list
app.get("/api/notifications/list", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);

  const result = await service().listNotifications(user.id, page, perPage);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  c.header("X-Total-Count", String(result.value.total));
  return writeJSON(c, 200, result.value.items);
});

// PATCH /api/notifications/:id
app.patch("/api/notifications/:id", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  const notifId = parseInt(id, 10);
  if (isNaN(notifId) || notifId <= 0) {
    return writeError(c, badRequest("invalid notification id"));
  }

  const result = await service().markRead(user.id, notifId);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return c.body(null, 204);
});

// PUT /api/notifications/mark-read
app.put("/api/notifications/mark-read", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const result = await service().markAllRead(user.id);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return c.body(null, 204);
});

export default app;
