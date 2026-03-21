import { createHmac, timingSafeEqual } from "crypto";
import type { Sql } from "postgres";
import { Result, TaggedError } from "better-result";

import {
  APIError,
  internal,
  notFound,
  badRequest,
  forbidden,
  unauthorized,
  validationFailed,
} from "../lib/errors";
import type { AuthUser } from "../lib/context";

import {
  createWebhook,
  getRepoWebhookByOwnerAndRepo,
  listRepoWebhooksByOwnerAndRepo,
  updateRepoWebhookByOwnerAndRepo,
  deleteRepoWebhookByOwnerAndRepoQuery,
  countWebhooksByRepo,
  createWebhookDelivery,
  listWebhookDeliveriesForRepo,
  type CreateWebhookRow,
  type GetRepoWebhookByOwnerAndRepoRow,
  type ListRepoWebhooksByOwnerAndRepoRow,
  type UpdateRepoWebhookByOwnerAndRepoRow,
  type ListWebhookDeliveriesForRepoRow,
} from "../db/webhooks_sql";

import {
  getRepoByOwnerAndLowerName,
  isOrgOwnerForRepoUser,
  getHighestTeamPermissionForRepoUser,
  getCollaboratorPermissionForRepoUser,
  type GetRepoByOwnerAndLowerNameRow,
} from "../db/repos_sql";

// ---------------------------------------------------------------------------
// Types — matching Go's CreateWebhookInput, UpdateWebhookInput
// ---------------------------------------------------------------------------

export interface CreateWebhookInput {
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
}

export interface UpdateWebhookInput {
  url?: string;
  secret?: string;
  events?: string[];
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Webhook row type — unified shape returned by the service
// ---------------------------------------------------------------------------

export interface WebhookRow {
  id: string;
  repositoryId: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  lastDeliveryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// SecretCodec interface — matches Go's webhook.SecretCodec
// ---------------------------------------------------------------------------

export interface SecretCodec {
  encryptString(plaintext: string): Promise<string>;
  decryptString(ciphertext: string): Promise<string>;
}

/** NoopSecretCodec leaves strings unchanged (useful in tests / CE). */
export class NoopSecretCodec implements SecretCodec {
  async encryptString(plaintext: string): Promise<string> {
    return plaintext;
  }
  async decryptString(ciphertext: string): Promise<string> {
    return ciphertext;
  }
}

// ---------------------------------------------------------------------------
// Constants — match Go's webhook service constants
// ---------------------------------------------------------------------------

const redactedWebhookSecret = "********";
const maxWebhooksPerRepo = 20;

// ---------------------------------------------------------------------------
// HMAC signature — matches Go's webhook.signPayload / VerifyPayloadSignature
// ---------------------------------------------------------------------------

export function signPayload(secret: string, payload: Uint8Array): string {
  const mac = createHmac("sha256", secret);
  mac.update(payload);
  return "sha256=" + mac.digest("hex");
}

export function verifyPayloadSignature(
  secret: string,
  payload: Uint8Array,
  signature: string,
): boolean {
  if (secret.trim() === "") return false;

  const sig = signature.trim();
  if (sig === "" || !sig.startsWith("sha256=")) return false;

  const providedHex = sig.slice("sha256=".length).trim();
  // SHA-256 produces 32 bytes = 64 hex chars
  if (providedHex.length !== 64) return false;

  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return false;
  }
  if (provided.length !== 32) return false;

  const mac = createHmac("sha256", secret);
  mac.update(payload);
  const expected = mac.digest();

  return timingSafeEqual(expected, provided);
}

// ---------------------------------------------------------------------------
// Delivery retry — matches Go's webhook.CalculateNextRetry
// ---------------------------------------------------------------------------

const retrySchedule = [1_000, 10_000, 60_000]; // 1s, 10s, 60s (ms)

/**
 * Calculate the next retry timestamp for a failed delivery attempt.
 * Returns null when retries are exhausted (attempt >= schedule length).
 * Matches Go's CalculateNextRetry.
 */
export function calculateNextRetry(
  attempt: number,
  now: Date,
): Date | null {
  if (attempt < 1 || attempt > retrySchedule.length) return null;
  return new Date(now.getTime() + retrySchedule[attempt - 1]!);
}

// ---------------------------------------------------------------------------
// Auto-disable — matches Go's shouldDisableWebhook
// ---------------------------------------------------------------------------

const maxFailureStreak = 10;

/**
 * Returns true when a webhook should be auto-disabled due to consecutive failures.
 * Expects `recentStatuses` ordered newest-first (most recent delivery first).
 * Matches Go's shouldDisableWebhook.
 */
export function shouldDisableWebhook(recentStatuses: string[]): boolean {
  if (recentStatuses.length < maxFailureStreak) return false;
  for (let i = 0; i < maxFailureStreak; i++) {
    if (recentStatuses[i] !== "failed") return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Permission helpers — matches Go's webhook service permission pattern
// ---------------------------------------------------------------------------

async function resolveRepoByOwnerAndName(
  sql: Sql,
  owner: string,
  repo: string,
): Promise<GetRepoByOwnerAndLowerNameRow> {
  const lowerOwner = owner.trim().toLowerCase();
  const lowerRepo = repo.trim().toLowerCase();
  if (lowerOwner === "") {
    throw badRequest("owner is required");
  }
  if (lowerRepo === "") {
    throw badRequest("repository name is required");
  }

  const repository = await getRepoByOwnerAndLowerName(sql, {
    owner: lowerOwner,
    lowerName: lowerRepo,
  });
  if (!repository) {
    throw notFound("repository not found");
  }
  return repository;
}

async function isRepoAdmin(
  sql: Sql,
  repository: GetRepoByOwnerAndLowerNameRow,
  userId: string,
): Promise<boolean> {
  // Repo owner is always admin
  if (repository.userId !== null && repository.userId === userId) {
    return true;
  }

  // Check org ownership
  if (repository.orgId !== null) {
    const orgOwnerResult = await isOrgOwnerForRepoUser(sql, {
      repositoryId: repository.id,
      userId,
    });
    if (orgOwnerResult?.exists) {
      return true;
    }

    const teamResult = await getHighestTeamPermissionForRepoUser(sql, {
      repositoryId: repository.id,
      userId,
    });
    // The sqlc generated type uses an empty string property name for COALESCE result
    const teamPerm = teamResult ? ((teamResult as any)[""] ?? "") : "";
    if (teamPerm === "admin") {
      return true;
    }
  }

  const collabResult = await getCollaboratorPermissionForRepoUser(sql, {
    repositoryId: repository.id,
    userId,
  });
  const collabPerm = collabResult?.permission ?? "";
  return collabPerm === "admin";
}

async function requireAdminAccess(
  sql: Sql,
  repository: GetRepoByOwnerAndLowerNameRow,
  actor: AuthUser | undefined,
): Promise<void> {
  if (!actor) {
    throw unauthorized("authentication required");
  }
  const admin = await isRepoAdmin(sql, repository, String(actor.id));
  if (!admin) {
    throw forbidden("permission denied");
  }
}

// ---------------------------------------------------------------------------
// Row helpers — redact / decrypt secrets
// ---------------------------------------------------------------------------

function redactSecret(
  hook: ListRepoWebhooksByOwnerAndRepoRow,
): ListRepoWebhooksByOwnerAndRepoRow {
  if (hook.secret === "") return hook;
  return { ...hook, secret: redactedWebhookSecret };
}

async function decryptWebhookSecret(
  codec: SecretCodec,
  hook: GetRepoWebhookByOwnerAndRepoRow | CreateWebhookRow | UpdateRepoWebhookByOwnerAndRepoRow,
): Promise<typeof hook> {
  try {
    const secret = await codec.decryptString(hook.secret);
    return { ...hook, secret };
  } catch {
    throw internal("failed to decrypt webhook secret");
  }
}

// ---------------------------------------------------------------------------
// Pagination — matches Go's normalizeWebhookPage
// ---------------------------------------------------------------------------

function normalizeWebhookPage(
  page: number,
  perPage: number,
): { size: number; offset: number } {
  let resolvedPage = page;
  if (resolvedPage < 1) resolvedPage = 1;
  let resolvedPerPage = perPage;
  if (resolvedPerPage < 1 || resolvedPerPage > 30) resolvedPerPage = 30;
  const offset = (resolvedPage - 1) * resolvedPerPage;
  return { size: resolvedPerPage, offset };
}

// ---------------------------------------------------------------------------
// WebhookService — matches Go's WebhookService 1:1
// ---------------------------------------------------------------------------

export class WebhookService {
  private sql: Sql;
  private secretCodec: SecretCodec;

  constructor(sql: Sql, codec?: SecretCodec) {
    this.sql = sql;
    this.secretCodec = codec ?? new NoopSecretCodec();
  }

  async listWebhooks(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
  ): Promise<ListRepoWebhooksByOwnerAndRepoRow[]> {
    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireAdminAccess(this.sql, repository, actor);

    const hooks = await listRepoWebhooksByOwnerAndRepo(this.sql, {
      owner,
      repo,
    });

    return hooks.map(redactSecret);
  }

  async getWebhook(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    webhookId: number,
  ): Promise<GetRepoWebhookByOwnerAndRepoRow> {
    if (webhookId <= 0) {
      throw badRequest("invalid webhook id");
    }

    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireAdminAccess(this.sql, repository, actor);

    const hook = await getRepoWebhookByOwnerAndRepo(this.sql, {
      webhookId: String(webhookId),
      owner,
      repo,
    });
    if (!hook) {
      throw notFound("webhook not found");
    }
    return await decryptWebhookSecret(this.secretCodec, hook) as GetRepoWebhookByOwnerAndRepoRow;
  }

  async createWebhook(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    req: CreateWebhookInput,
  ): Promise<CreateWebhookRow> {
    if (!actor) {
      throw unauthorized("authentication required");
    }

    const url = req.url.trim();
    if (url === "") {
      throw validationFailed({
        resource: "Webhook",
        field: "url",
        code: "missing_field",
      });
    }
    if (!url.startsWith("https://")) {
      throw validationFailed({
        resource: "Webhook",
        field: "url",
        code: "invalid",
      });
    }

    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireAdminAccess(this.sql, repository, actor);

    const webhookCountResult = await countWebhooksByRepo(this.sql, {
      repositoryId: repository.id,
    });
    const webhookCount = webhookCountResult
      ? parseInt(webhookCountResult.count, 10)
      : 0;
    if (webhookCount >= maxWebhooksPerRepo) {
      throw validationFailed({
        resource: "Webhook",
        field: "repository_id",
        code: "invalid",
      });
    }

    const events = req.events ?? [];

    let encryptedSecret: string;
    try {
      encryptedSecret = await this.secretCodec.encryptString(req.secret);
    } catch {
      throw internal("failed to encrypt webhook secret");
    }

    const created = await createWebhook(this.sql, {
      repositoryId: repository.id,
      url,
      secret: encryptedSecret,
      events,
      isActive: req.is_active,
    });
    if (!created) {
      throw internal("failed to create webhook");
    }
    return await decryptWebhookSecret(this.secretCodec, created) as CreateWebhookRow;
  }

  async updateWebhook(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    webhookId: number,
    req: UpdateWebhookInput,
  ): Promise<UpdateRepoWebhookByOwnerAndRepoRow> {
    if (!actor) {
      throw unauthorized("authentication required");
    }
    if (webhookId <= 0) {
      throw badRequest("invalid webhook id");
    }

    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireAdminAccess(this.sql, repository, actor);

    const current = await getRepoWebhookByOwnerAndRepo(this.sql, {
      webhookId: String(webhookId),
      owner,
      repo,
    });
    if (!current) {
      throw notFound("webhook not found");
    }

    let url = current.url;
    if (req.url !== undefined) {
      url = req.url.trim();
      if (url === "") {
        throw validationFailed({
          resource: "Webhook",
          field: "url",
          code: "missing_field",
        });
      }
      if (!url.startsWith("https://")) {
        throw validationFailed({
          resource: "Webhook",
          field: "url",
          code: "invalid",
        });
      }
    }

    let secret = current.secret;
    if (req.secret !== undefined) {
      try {
        secret = await this.secretCodec.encryptString(req.secret);
      } catch {
        throw internal("failed to encrypt webhook secret");
      }
    }

    let events = current.events;
    if (req.events !== undefined) {
      events = req.events;
    }

    let isActive = current.isActive;
    if (req.is_active !== undefined) {
      isActive = req.is_active;
    }

    const updated = await updateRepoWebhookByOwnerAndRepo(this.sql, {
      webhookId: String(webhookId),
      owner,
      repo,
      url,
      secret,
      events,
      isActive,
    });
    if (!updated) {
      throw notFound("webhook not found");
    }
    return await decryptWebhookSecret(this.secretCodec, updated) as UpdateRepoWebhookByOwnerAndRepoRow;
  }

  async deleteWebhook(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    webhookId: number,
  ): Promise<void> {
    if (!actor) {
      throw unauthorized("authentication required");
    }
    if (webhookId <= 0) {
      throw badRequest("invalid webhook id");
    }

    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireAdminAccess(this.sql, repository, actor);

    // deleteRepoWebhookByOwnerAndRepo is an :execrows query — run manually
    const result = await this.sql.unsafe(deleteRepoWebhookByOwnerAndRepoQuery, [
      String(webhookId),
      owner,
      repo,
    ]);
    const rowsAffected = result.count;
    if (rowsAffected === 0) {
      throw notFound("webhook not found");
    }
  }

  async testWebhook(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    webhookId: number,
  ): Promise<void> {
    if (!actor) {
      throw unauthorized("authentication required");
    }
    if (webhookId <= 0) {
      throw badRequest("invalid webhook id");
    }

    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireAdminAccess(this.sql, repository, actor);

    const hook = await getRepoWebhookByOwnerAndRepo(this.sql, {
      webhookId: String(webhookId),
      owner,
      repo,
    });
    if (!hook) {
      throw notFound("webhook not found");
    }

    const payload = JSON.stringify({ event: "ping" });
    const delivery = await createWebhookDelivery(this.sql, {
      webhookId: hook.id,
      eventType: "ping",
      payload,
      status: "pending",
    });
    if (!delivery) {
      throw internal("failed to create ping delivery");
    }
  }

  async verifyInboundWebhookSignature(
    owner: string,
    repo: string,
    webhookId: number,
    payload: Uint8Array,
    signature: string,
  ): Promise<void> {
    if (webhookId <= 0) {
      throw badRequest("invalid webhook id");
    }
    if (signature.trim() === "") {
      throw unauthorized("missing webhook signature");
    }

    await resolveRepoByOwnerAndName(this.sql, owner, repo);

    const hook = await getRepoWebhookByOwnerAndRepo(this.sql, {
      webhookId: String(webhookId),
      owner,
      repo,
    });
    if (!hook) {
      throw notFound("webhook not found");
    }

    const decrypted = await decryptWebhookSecret(
      this.secretCodec,
      hook,
    ) as GetRepoWebhookByOwnerAndRepoRow;

    if (!verifyPayloadSignature(decrypted.secret, payload, signature)) {
      throw unauthorized("invalid webhook signature");
    }
  }

  async listWebhookDeliveries(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    webhookId: number,
    page: number,
    perPage: number,
  ): Promise<ListWebhookDeliveriesForRepoRow[]> {
    if (webhookId <= 0) {
      throw badRequest("invalid webhook id");
    }

    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireAdminAccess(this.sql, repository, actor);

    // Confirm the webhook belongs to this repo (returns 404 if not).
    const hook = await getRepoWebhookByOwnerAndRepo(this.sql, {
      webhookId: String(webhookId),
      owner,
      repo,
    });
    if (!hook) {
      throw notFound("webhook not found");
    }

    const { size, offset } = normalizeWebhookPage(page, perPage);
    const deliveries = await listWebhookDeliveriesForRepo(this.sql, {
      webhookId: String(webhookId),
      owner,
      repo,
      pageOffset: String(offset),
      pageSize: String(size),
    });
    return deliveries;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWebhookService(
  sql: Sql,
  codec?: SecretCodec,
): WebhookService {
  return new WebhookService(sql, codec);
}
