import { createHmac } from "crypto";
import type { Sql } from "postgres";
import { Result } from "better-result";

import {
  claimDueWebhookDeliveries,
  listWebhooksByIDs,
  updateWebhookDeliveryResult,
  updateWebhookDeliveryRetry,
  listRecentWebhookDeliveryStatuses,
  setWebhookActive,
  createWebhookDelivery,
  listActiveWebhooksByRepo,
  type ClaimDueWebhookDeliveriesRow,
  type ListWebhooksByIDsRow,
} from "../db/webhooks_sql";

// ---------------------------------------------------------------------------
// Constants — match Go's webhook package
// ---------------------------------------------------------------------------

const CODEPLANE_USER_AGENT = "Codeplane-Hookshot/1.0";
const CODEPLANE_SIGNATURE_HEADER = "X-Codeplane-Signature-256";
const MAX_FAILURE_STREAK = 10;
const MAX_RESPONSE_BODY_BYTES = 10 * 1024; // 10KB — per spec
const DEFAULT_POLL_INTERVAL_MS = 10_000; // 10 seconds
const DEFAULT_CLAIM_LIMIT = 10;

/**
 * Retry schedule for failed webhook deliveries.
 * Matches the spec: 1m, 5m, 30m, 2h. Max 5 attempts total
 * (first attempt + 4 retries, but we only schedule retries for attempts 1-4).
 */
const RETRY_SCHEDULE_MS = [
  1 * 60 * 1000, // 1 minute
  5 * 60 * 1000, // 5 minutes
  30 * 60 * 1000, // 30 minutes
  2 * 60 * 60 * 1000, // 2 hours
];

const MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Types — match Go's webhook.Task, DeliveryRequest, DeliveryResult
// ---------------------------------------------------------------------------

/** A claimed delivery joined with its webhook config. */
export interface WebhookTask {
  delivery: ClaimDueWebhookDeliveriesRow;
  webhook: ListWebhooksByIDsRow;
}

export interface DeliveryRequest {
  url: string;
  secret: string;
  eventType: string;
  deliveryId: string;
  payload: string;
}

export interface DeliveryResult {
  statusCode: number;
  responseBody: string;
  error: Error | null;
  skipRetry: boolean;
  disabled: boolean;
}

// ---------------------------------------------------------------------------
// SecretCodec — re-use from webhook.ts
// ---------------------------------------------------------------------------

export interface SecretCodec {
  encryptString(plaintext: string): Promise<string>;
  decryptString(ciphertext: string): Promise<string>;
}

export class NoopSecretCodec implements SecretCodec {
  async encryptString(plaintext: string): Promise<string> {
    return plaintext;
  }
  async decryptString(ciphertext: string): Promise<string> {
    return ciphertext;
  }
}

// ---------------------------------------------------------------------------
// HMAC signature — matches Go's signPayload
// ---------------------------------------------------------------------------

function signPayload(secret: string, payload: string): string {
  const mac = createHmac("sha256", secret);
  mac.update(payload);
  return "sha256=" + mac.digest("hex");
}

// ---------------------------------------------------------------------------
// Retry logic — matches Go's CalculateNextRetry
// ---------------------------------------------------------------------------

function calculateNextRetry(
  attempt: number,
  now: Date,
): { nextRetryAt: Date; shouldRetry: true } | { shouldRetry: false } {
  // attempt is the number of attempts already made (after incrementing).
  // We allow retries for attempts 1 through MAX_ATTEMPTS-1 (4 retries).
  const index = attempt - 1;
  if (index < 0 || index >= RETRY_SCHEDULE_MS.length) {
    return { shouldRetry: false };
  }
  const delayMs = RETRY_SCHEDULE_MS[index]!;
  const nextRetryAt = new Date(now.getTime() + delayMs);
  return { nextRetryAt, shouldRetry: true };
}

// ---------------------------------------------------------------------------
// Auto-disable — matches Go's shouldDisableWebhook
// ---------------------------------------------------------------------------

function shouldDisableWebhook(recentStatuses: string[]): boolean {
  if (recentStatuses.length < MAX_FAILURE_STREAK) {
    return false;
  }
  for (let i = 0; i < MAX_FAILURE_STREAK; i++) {
    if (recentStatuses[i] !== "failed") {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Deliver — HTTP POST to webhook URL, matches Go's Deliver
// ---------------------------------------------------------------------------

async function deliver(
  req: DeliveryRequest,
  signal?: AbortSignal,
): Promise<DeliveryResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": CODEPLANE_USER_AGENT,
    "X-Codeplane-Event": req.eventType,
    "X-Codeplane-Delivery": req.deliveryId,
  };

  if (req.secret !== "") {
    headers[CODEPLANE_SIGNATURE_HEADER] = signPayload(req.secret, req.payload);
  }

  try {
    const resp = await fetch(req.url, {
      method: "POST",
      headers,
      body: req.payload,
      signal: signal ?? AbortSignal.timeout(10_000),
    });

    const rawBody = await resp.text();
    const responseBody = rawBody.slice(0, MAX_RESPONSE_BODY_BYTES);

    return {
      statusCode: resp.status,
      responseBody,
      error: null,
      skipRetry: false,
      disabled: false,
    };
  } catch (err) {
    return {
      statusCode: 0,
      responseBody: err instanceof Error ? err.message : String(err),
      error: err instanceof Error ? err : new Error(String(err)),
      skipRetry: false,
      disabled: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Queue operations — matches Go's PollQueue + UpdateTaskStatus
// ---------------------------------------------------------------------------

async function pollQueue(
  sql: Sql,
  limit: number,
): Promise<Result<WebhookTask[], Error>> {
  try {
    const deliveries = await claimDueWebhookDeliveries(sql, {
      claimLimit: String(limit),
    });

    if (deliveries.length === 0) {
      return Result.ok([]);
    }

    // Collect unique webhook IDs
    const seenWebhookIds = new Set<string>();
    const webhookIds: string[] = [];
    for (const d of deliveries) {
      if (!seenWebhookIds.has(d.webhookId)) {
        seenWebhookIds.add(d.webhookId);
        webhookIds.push(d.webhookId);
      }
    }

    const webhooks = await listWebhooksByIDs(sql, { ids: webhookIds });

    const webhooksByID = new Map<string, ListWebhooksByIDsRow>();
    for (const w of webhooks) {
      webhooksByID.set(w.id, w);
    }

    const tasks: WebhookTask[] = [];
    for (const d of deliveries) {
      const webhook = webhooksByID.get(d.webhookId);
      if (!webhook) {
        return Result.err(
          new Error(
            `resolve webhook ${d.webhookId} for delivery ${d.id}: not found`,
          ),
        );
      }
      tasks.push({ delivery: d, webhook });
    }

    return Result.ok(tasks);
  } catch (err) {
    return Result.err(
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

async function updateTaskStatus(
  sql: Sql,
  task: WebhookTask,
  result: DeliveryResult,
  now: Date,
): Promise<void> {
  const responseStatus =
    result.statusCode > 0 ? result.statusCode : null;

  // Success path
  if (result.error === null && result.statusCode >= 200 && result.statusCode < 300) {
    await updateWebhookDeliveryResult(sql, {
      id: task.delivery.id,
      status: "success",
      responseStatus,
      responseBody: result.responseBody,
    });
    return;
  }

  // Retry path — only if not explicitly skipping
  if (!result.skipRetry) {
    const retryResult = calculateNextRetry(task.delivery.attempts, now);
    if (retryResult.shouldRetry) {
      await updateWebhookDeliveryRetry(sql, {
        id: task.delivery.id,
        status: "pending",
        responseStatus,
        responseBody: result.responseBody,
        nextRetryAt: retryResult.nextRetryAt,
      });
      return;
    }
  }

  // Terminal failure
  await updateWebhookDeliveryResult(sql, {
    id: task.delivery.id,
    status: "failed",
    responseStatus,
    responseBody: result.responseBody,
  });

  // If already disabled, skip auto-disable check
  if (result.disabled) {
    return;
  }

  // Auto-disable check — matches Go's shouldDisableWebhook
  const webhookId = task.webhook.id || task.delivery.webhookId;
  const recentRows = await listRecentWebhookDeliveryStatuses(sql, {
    webhookId,
  });
  const recentStatuses = recentRows.map((r) => r.status);
  if (shouldDisableWebhook(recentStatuses)) {
    await setWebhookActive(sql, {
      id: webhookId,
      isActive: false,
    });
  }
}

// ---------------------------------------------------------------------------
// WebhookWorker — matches Go's Worker struct
// ---------------------------------------------------------------------------

export interface WebhookWorkerOptions {
  /** Poll interval in milliseconds. Default: 10000 (10s). */
  pollIntervalMs?: number;
  /** Max deliveries to claim per poll. Default: 10. */
  claimLimit?: number;
  /** Secret codec for decrypting webhook secrets. Default: NoopSecretCodec. */
  secretCodec?: SecretCodec;
  /** Logger function. Default: console.log. */
  logger?: (level: "info" | "error" | "warn", msg: string, data?: Record<string, unknown>) => void;
}

export class WebhookWorker {
  private sql: Sql;
  private secretCodec: SecretCodec;
  private pollIntervalMs: number;
  private claimLimit: number;
  private abortController: AbortController | null = null;
  private running = false;
  private logger: (level: "info" | "error" | "warn", msg: string, data?: Record<string, unknown>) => void;

  constructor(sql: Sql, opts?: WebhookWorkerOptions) {
    this.sql = sql;
    this.secretCodec = opts?.secretCodec ?? new NoopSecretCodec();
    this.pollIntervalMs = opts?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.claimLimit = opts?.claimLimit ?? DEFAULT_CLAIM_LIMIT;
    this.logger = opts?.logger ?? ((level, msg, data) => {
      if (data) {
        console[level === "error" ? "error" : "log"](`[webhook-worker] ${msg}`, data);
      } else {
        console[level === "error" ? "error" : "log"](`[webhook-worker] ${msg}`);
      }
    });
  }

  /**
   * Start the background polling loop.
   * Runs until stop() is called or the process exits.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    this.logger("info", "webhook worker started");
    this.loop(this.abortController.signal);
  }

  /** Stop the background polling loop. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
    this.logger("info", "webhook worker stopped");
  }

  /** Whether the worker is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Run a single poll cycle. Exposed for testing.
   * Claims due deliveries and processes each one.
   */
  async pollOnce(): Promise<Result<number, Error>> {
    const result = await pollQueue(this.sql, this.claimLimit);
    if (result.isErr()) {
      return Result.err(result.error);
    }

    const tasks = result.value;

    for (const task of tasks) {
      // Skip inactive webhooks — mark as terminal failure
      if (!task.webhook.isActive) {
        try {
          await updateTaskStatus(this.sql, task, {
            statusCode: 0,
            responseBody: "webhook disabled",
            error: new Error("webhook disabled"),
            skipRetry: true,
            disabled: true,
          }, new Date());
        } catch (err) {
          this.logger("error", "failed to mark disabled webhook delivery", {
            deliveryId: task.delivery.id,
            webhookId: task.webhook.id,
            error: String(err),
          });
        }
        continue;
      }

      await this.processTask(task);
    }

    return Result.ok(tasks.length);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const result = await this.pollOnce();
        if (result.isErr()) {
          this.logger("error", "webhook worker poll error", {
            error: result.error.message,
          });
        }
      } catch (err) {
        this.logger("error", "webhook worker unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Wait for poll interval or abort
      if (!signal.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, this.pollIntervalMs);
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          signal.addEventListener("abort", onAbort, { once: true });
        });
      }
    }
  }

  private async processTask(task: WebhookTask): Promise<void> {
    // Decrypt the webhook secret
    let decryptedSecret: string;
    try {
      decryptedSecret = await this.secretCodec.decryptString(task.webhook.secret);
    } catch (err) {
      try {
        await updateTaskStatus(this.sql, task, {
          statusCode: 0,
          responseBody: `failed to decrypt webhook secret: ${err instanceof Error ? err.message : String(err)}`,
          error: err instanceof Error ? err : new Error(String(err)),
          skipRetry: true,
          disabled: false,
        }, new Date());
      } catch (updateErr) {
        this.logger("error", "failed to mark webhook delivery failed after decrypt error", {
          deliveryId: task.delivery.id,
          webhookId: task.webhook.id,
          error: String(updateErr),
        });
      }
      return;
    }

    const payload =
      typeof task.delivery.payload === "string"
        ? task.delivery.payload
        : JSON.stringify(task.delivery.payload);

    const req: DeliveryRequest = {
      url: task.webhook.url,
      secret: decryptedSecret,
      eventType: task.delivery.eventType,
      deliveryId: task.delivery.id,
      payload,
    };

    const result = await deliver(req);

    try {
      await updateTaskStatus(this.sql, task, result, new Date());
    } catch (updateErr) {
      this.logger("error", "failed to update webhook delivery status", {
        deliveryId: task.delivery.id,
        webhookId: task.webhook.id,
        error: String(updateErr),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatch — creates delivery records when events happen
// ---------------------------------------------------------------------------

/**
 * Dispatch a webhook event to all active webhooks for a repository.
 * Creates a pending delivery record for each matching webhook.
 *
 * Matches the Go pattern: find all active webhooks for the repo whose
 * events list includes the given eventType (or has an empty events list,
 * meaning "all events"), then create a delivery record for each.
 *
 * @param sql - Database connection
 * @param repoId - Repository ID
 * @param eventType - Event type (e.g. "push", "issues", "landing_request")
 * @param payload - JSON-serializable event payload
 * @returns Result with the number of deliveries created, or an error
 */
export async function dispatchWebhookEvent(
  sql: Sql,
  repoId: string,
  eventType: string,
  payload: unknown,
): Promise<Result<number, Error>> {
  try {
    const webhooks = await listActiveWebhooksByRepo(sql, {
      repositoryId: repoId,
    });

    let created = 0;
    const payloadJson = JSON.stringify(payload);

    for (const webhook of webhooks) {
      // Match if the webhook subscribes to this event type,
      // or if events list is empty (subscribes to all events).
      if (
        webhook.events.length > 0 &&
        !webhook.events.includes(eventType)
      ) {
        continue;
      }

      const delivery = await createWebhookDelivery(sql, {
        webhookId: webhook.id,
        eventType,
        payload: payloadJson,
        status: "pending",
      });

      if (delivery) {
        created++;
      }
    }

    return Result.ok(created);
  } catch (err) {
    return Result.err(
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWebhookWorker(
  sql: Sql,
  opts?: WebhookWorkerOptions,
): WebhookWorker {
  return new WebhookWorker(sql, opts);
}
