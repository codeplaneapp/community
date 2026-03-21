import type { Sql } from "postgres";

import {
  internal,
  notFound,
  badRequest,
  forbidden,
} from "../lib/errors";

import {
  getBillingAccountByOwner,
  upsertBillingAccount,
  getCreditBalance,
  upsertCreditBalance,
  insertCreditLedgerEntry,
  listCreditLedgerByAccount,
  countCreditLedgerByAccount,
  getCreditLedgerByIdempotencyKey,
  listAllActiveBillingAccounts,
  incrementUsageCounter,
  getUsageCounterByMetric,
  listBillingUsageCountersByOwnerAndPeriod,
  listBillingEntitlementsByAccount,
  type GetBillingAccountByOwnerRow,
  type GetCreditBalanceRow,
  type InsertCreditLedgerEntryRow,
  type ListCreditLedgerByAccountRow,
  type IncrementUsageCounterRow,
  type GetUsageCounterByMetricRow,
} from "../db/billing_sql";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Monthly free credit grant in cents ($10.00) */
const MONTHLY_GRANT_CENTS = 1000;

/** Free CI minutes per month (not credit-deducted) */
const FREE_CI_MINUTES = 2000;

/** Metered resource keys */
export const MetricKeys = {
  WORKSPACE_COMPUTE_MINUTES: "workspace_compute_minutes",
  LLM_TOKENS: "llm_tokens",
  CI_MINUTES: "ci_minutes",
  SYNC_OPERATIONS: "sync_operations",
  STORAGE_GB_HOURS: "storage_gb_hours",
} as const;

export type MetricKey = (typeof MetricKeys)[keyof typeof MetricKeys];

/** Credit ledger categories */
export const CreditCategories = {
  MONTHLY_GRANT: "monthly_grant",
  PURCHASE: "purchase",
  DEDUCTION: "deduction",
  REFUND: "refund",
  GIFT: "gift",
  EXPIRATION: "expiration",
  ADJUSTMENT: "adjustment",
} as const;

export type CreditCategory = (typeof CreditCategories)[keyof typeof CreditCategories];

/** Owner types */
export type OwnerType = "user" | "org";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface BillingAccountResponse {
  id: string;
  owner_type: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreditBalanceResponse {
  billing_account_id: string;
  balance_cents: number;
  last_grant_at: Date | null;
  updated_at: Date;
}

export interface CreditLedgerEntryResponse {
  id: string;
  billing_account_id: string;
  amount_cents: number;
  balance_after_cents: number;
  reason: string;
  category: string;
  metric_key: string;
  created_at: Date;
}

export interface UsageResponse {
  metric_key: string;
  included_quantity: number;
  consumed_quantity: number;
  overage_quantity: number;
  period_start: Date;
  period_end: Date;
}

export interface QuotaCheckResult {
  allowed: boolean;
  balance_cents: number;
  reason?: string;
}

export interface GrantResult {
  accounts_processed: number;
  accounts_granted: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the start of the current month (UTC) */
function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Get the end of the current month (UTC) = start of next month */
function currentPeriodEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Format a date as YYYY-MM for idempotency keys */
function periodKeyStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ---------------------------------------------------------------------------
// BillingService
// ---------------------------------------------------------------------------

export class BillingService {
  private sql: Sql;
  private billingEnabled: boolean;

  constructor(sql: Sql, opts?: { billingEnabled?: boolean }) {
    this.sql = sql;
    // Default: billing is disabled (CE mode). Cloud sets this to true.
    this.billingEnabled = opts?.billingEnabled ?? false;
  }

  /** Whether billing enforcement is active */
  isBillingEnabled(): boolean {
    return this.billingEnabled;
  }

  // -------------------------------------------------------------------------
  // Account management
  // -------------------------------------------------------------------------

  /**
   * Create a billing account for a user or org.
   * Called during signup. If the account already exists, returns the existing one.
   */
  async createBillingAccount(
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<BillingAccountResponse> {
    const account = await upsertBillingAccount(this.sql, {
      ownerType,
      ownerId,
      // CE doesn't use Stripe; provide placeholder values
      stripeCustomerId: `local_${ownerType}_${ownerId}`,
      stripeCustomerEmail: "",
      stripeCustomerName: "",
    });

    if (!account) {
      throw internal("failed to create billing account");
    }

    // Initialize credit balance if it doesn't exist
    const existingBalance = await getCreditBalance(this.sql, {
      billingAccountId: account.id,
    });

    if (!existingBalance) {
      await upsertCreditBalance(this.sql, {
        billingAccountId: account.id,
        balanceCents: String(MONTHLY_GRANT_CENTS),
        lastGrantAt: new Date(),
      });

      // Record the initial grant in the ledger
      await insertCreditLedgerEntry(this.sql, {
        billingAccountId: account.id,
        amountCents: String(MONTHLY_GRANT_CENTS),
        balanceAfterCents: String(MONTHLY_GRANT_CENTS),
        reason: "Initial credit grant",
        category: CreditCategories.MONTHLY_GRANT,
        metricKey: "",
        idempotencyKey: `initial_grant_${account.id}`,
      });
    }

    return {
      id: account.id,
      owner_type: account.ownerType,
      owner_id: account.ownerId,
      created_at: account.createdAt,
      updated_at: account.updatedAt,
    };
  }

  /**
   * Get the billing account for an owner.
   * Returns null if no account exists.
   */
  async getBillingAccount(
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<BillingAccountResponse | null> {
    const account = await getBillingAccountByOwner(this.sql, {
      ownerType,
      ownerId,
    });
    if (!account) return null;
    return {
      id: account.id,
      owner_type: account.ownerType,
      owner_id: account.ownerId,
      created_at: account.createdAt,
      updated_at: account.updatedAt,
    };
  }

  /**
   * Resolve the billing account for an owner, throwing 404 if not found.
   */
  private async requireBillingAccount(
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<GetBillingAccountByOwnerRow> {
    const account = await getBillingAccountByOwner(this.sql, {
      ownerType,
      ownerId,
    });
    if (!account) {
      throw notFound("billing account not found");
    }
    return account;
  }

  // -------------------------------------------------------------------------
  // Credit management
  // -------------------------------------------------------------------------

  /**
   * Get the current credit balance for an account.
   */
  async getBalance(
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<CreditBalanceResponse> {
    const account = await this.requireBillingAccount(ownerType, ownerId);

    const balance = await getCreditBalance(this.sql, {
      billingAccountId: account.id,
    });

    if (!balance) {
      // No balance row yet, return zero
      return {
        billing_account_id: account.id,
        balance_cents: 0,
        last_grant_at: null,
        updated_at: new Date(),
      };
    }

    return {
      billing_account_id: balance.billingAccountId,
      balance_cents: parseInt(balance.balanceCents, 10),
      last_grant_at: balance.lastGrantAt,
      updated_at: balance.updatedAt,
    };
  }

  /**
   * Deduct credits from an account.
   * Returns the new balance. Throws if insufficient credits (when billing is enabled).
   */
  async deductCredits(
    ownerType: OwnerType,
    ownerId: string,
    amountCents: number,
    reason: string,
    opts?: { metricKey?: string; idempotencyKey?: string },
  ): Promise<CreditBalanceResponse> {
    if (amountCents <= 0) {
      throw badRequest("deduction amount must be positive");
    }

    const account = await this.requireBillingAccount(ownerType, ownerId);

    // If idempotency key provided, check for duplicate
    if (opts?.idempotencyKey) {
      const existing = await getCreditLedgerByIdempotencyKey(this.sql, {
        billingAccountId: account.id,
        idempotencyKey: opts.idempotencyKey,
      });
      if (existing) {
        // Already processed, return current balance
        const currentBalance = await getCreditBalance(this.sql, {
          billingAccountId: account.id,
        });
        return {
          billing_account_id: account.id,
          balance_cents: currentBalance ? parseInt(currentBalance.balanceCents, 10) : 0,
          last_grant_at: currentBalance?.lastGrantAt ?? null,
          updated_at: currentBalance?.updatedAt ?? new Date(),
        };
      }
    }

    const currentBalance = await getCreditBalance(this.sql, {
      billingAccountId: account.id,
    });
    const currentCents = currentBalance ? parseInt(currentBalance.balanceCents, 10) : 0;
    const newBalance = currentCents - amountCents;

    // Allow negative balance (usage tracking) but enforce in quota checks
    const updatedBalance = await upsertCreditBalance(this.sql, {
      billingAccountId: account.id,
      balanceCents: String(newBalance),
      lastGrantAt: currentBalance?.lastGrantAt ?? null,
    });

    if (!updatedBalance) {
      throw internal("failed to update credit balance");
    }

    await insertCreditLedgerEntry(this.sql, {
      billingAccountId: account.id,
      amountCents: String(-amountCents),
      balanceAfterCents: String(newBalance),
      reason,
      category: CreditCategories.DEDUCTION,
      metricKey: opts?.metricKey ?? "",
      idempotencyKey: opts?.idempotencyKey ?? "",
    });

    return {
      billing_account_id: account.id,
      balance_cents: newBalance,
      last_grant_at: updatedBalance.lastGrantAt,
      updated_at: updatedBalance.updatedAt,
    };
  }

  /**
   * Add credits to an account (purchase, refund, gift, etc.).
   */
  async addCredits(
    ownerType: OwnerType,
    ownerId: string,
    amountCents: number,
    reason: string,
    category: CreditCategory = CreditCategories.PURCHASE,
    opts?: { idempotencyKey?: string },
  ): Promise<CreditBalanceResponse> {
    if (amountCents <= 0) {
      throw badRequest("credit amount must be positive");
    }

    const account = await this.requireBillingAccount(ownerType, ownerId);

    // If idempotency key provided, check for duplicate
    if (opts?.idempotencyKey) {
      const existing = await getCreditLedgerByIdempotencyKey(this.sql, {
        billingAccountId: account.id,
        idempotencyKey: opts.idempotencyKey,
      });
      if (existing) {
        const currentBalance = await getCreditBalance(this.sql, {
          billingAccountId: account.id,
        });
        return {
          billing_account_id: account.id,
          balance_cents: currentBalance ? parseInt(currentBalance.balanceCents, 10) : 0,
          last_grant_at: currentBalance?.lastGrantAt ?? null,
          updated_at: currentBalance?.updatedAt ?? new Date(),
        };
      }
    }

    const currentBalance = await getCreditBalance(this.sql, {
      billingAccountId: account.id,
    });
    const currentCents = currentBalance ? parseInt(currentBalance.balanceCents, 10) : 0;
    const newBalance = currentCents + amountCents;

    const isGrant = category === CreditCategories.MONTHLY_GRANT;

    const updatedBalance = await upsertCreditBalance(this.sql, {
      billingAccountId: account.id,
      balanceCents: String(newBalance),
      lastGrantAt: isGrant ? new Date() : (currentBalance?.lastGrantAt ?? null),
    });

    if (!updatedBalance) {
      throw internal("failed to update credit balance");
    }

    await insertCreditLedgerEntry(this.sql, {
      billingAccountId: account.id,
      amountCents: String(amountCents),
      balanceAfterCents: String(newBalance),
      reason,
      category,
      metricKey: "",
      idempotencyKey: opts?.idempotencyKey ?? "",
    });

    return {
      billing_account_id: account.id,
      balance_cents: newBalance,
      last_grant_at: updatedBalance.lastGrantAt,
      updated_at: updatedBalance.updatedAt,
    };
  }

  /**
   * List credit ledger entries for an account (paginated).
   */
  async listCreditLedger(
    ownerType: OwnerType,
    ownerId: string,
    page: number = 1,
    perPage: number = 30,
  ): Promise<{ items: CreditLedgerEntryResponse[]; total: number }> {
    const account = await this.requireBillingAccount(ownerType, ownerId);

    const resolvedPage = Math.max(1, page);
    const resolvedPerPage = Math.min(Math.max(1, perPage), 100);
    const offset = (resolvedPage - 1) * resolvedPerPage;

    const [entries, countResult] = await Promise.all([
      listCreditLedgerByAccount(this.sql, {
        billingAccountId: account.id,
        pageSize: String(resolvedPerPage),
        pageOffset: String(offset),
      }),
      countCreditLedgerByAccount(this.sql, {
        billingAccountId: account.id,
      }),
    ]);

    const total = countResult ? parseInt(countResult.value, 10) : 0;

    return {
      items: entries.map(mapLedgerEntry),
      total,
    };
  }

  // -------------------------------------------------------------------------
  // Usage tracking
  // -------------------------------------------------------------------------

  /**
   * Record a usage event for a metered resource.
   * Increments the usage counter for the current billing period.
   */
  async recordUsage(
    ownerType: OwnerType,
    ownerId: string,
    metricKey: MetricKey,
    quantity: number,
  ): Promise<UsageResponse> {
    if (quantity <= 0) {
      throw badRequest("quantity must be positive");
    }

    const periodStart = currentPeriodStart();
    const periodEnd = currentPeriodEnd();

    // Determine included quantity based on metric
    let includedQuantity = "0";
    if (metricKey === MetricKeys.CI_MINUTES) {
      includedQuantity = String(FREE_CI_MINUTES);
    }

    const counter = await incrementUsageCounter(this.sql, {
      ownerType,
      ownerId,
      metricKey,
      periodStart,
      periodEnd,
      includedQuantity,
      consumedQuantity: String(quantity),
    });

    if (!counter) {
      throw internal("failed to record usage");
    }

    return mapUsageCounter(counter);
  }

  /**
   * Get usage for a specific metric in the current period.
   */
  async getUsage(
    ownerType: OwnerType,
    ownerId: string,
    metricKey: MetricKey,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<UsageResponse | null> {
    const pStart = periodStart ?? currentPeriodStart();
    const pEnd = periodEnd ?? currentPeriodEnd();

    const counter = await getUsageCounterByMetric(this.sql, {
      ownerType,
      ownerId,
      metricKey,
      periodStart: pStart,
      periodEnd: pEnd,
    });

    if (!counter) return null;
    return mapUsageCounter(counter);
  }

  /**
   * Get all usage counters for the current period.
   */
  async getAllUsage(
    ownerType: OwnerType,
    ownerId: string,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<UsageResponse[]> {
    const pStart = periodStart ?? currentPeriodStart();
    const pEnd = periodEnd ?? currentPeriodEnd();

    const counters = await listBillingUsageCountersByOwnerAndPeriod(this.sql, {
      ownerType,
      ownerId,
      periodStart: pStart,
      periodEnd: pEnd,
    });

    return counters.map((c) => ({
      metric_key: c.metricKey,
      included_quantity: parseInt(c.includedQuantity, 10),
      consumed_quantity: parseInt(c.consumedQuantity, 10),
      overage_quantity: parseInt(c.overageQuantity, 10),
      period_start: c.periodStart,
      period_end: c.periodEnd,
    }));
  }

  // -------------------------------------------------------------------------
  // Quota enforcement
  // -------------------------------------------------------------------------

  /**
   * Check if an owner has sufficient credits for an operation.
   *
   * For CE (billing disabled), always returns { allowed: true }.
   * For Cloud, checks credit balance > 0.
   *
   * Usage:
   *   - Before workspace create: checkQuota(ownerType, ownerId, "workspace_compute_minutes")
   *   - Before agent session: checkQuota(ownerType, ownerId, "llm_tokens")
   *   - Before sync: checkQuota(ownerType, ownerId, "sync_operations")
   */
  async checkQuota(
    ownerType: OwnerType,
    ownerId: string,
    metricKey: MetricKey,
  ): Promise<QuotaCheckResult> {
    // CE mode: all operations allowed
    if (!this.billingEnabled) {
      return { allowed: true, balance_cents: 0 };
    }

    const account = await getBillingAccountByOwner(this.sql, {
      ownerType,
      ownerId,
    });

    if (!account) {
      return {
        allowed: false,
        balance_cents: 0,
        reason: "no billing account found",
      };
    }

    // For CI minutes, check if within free tier first
    if (metricKey === MetricKeys.CI_MINUTES) {
      const periodStart = currentPeriodStart();
      const periodEnd = currentPeriodEnd();
      const usage = await getUsageCounterByMetric(this.sql, {
        ownerType,
        ownerId,
        metricKey,
        periodStart,
        periodEnd,
      });

      if (usage) {
        const consumed = parseInt(usage.consumedQuantity, 10);
        const included = parseInt(usage.includedQuantity, 10);
        if (consumed < included) {
          // Still within free tier
          return { allowed: true, balance_cents: 0 };
        }
      } else {
        // No usage yet, within free tier
        return { allowed: true, balance_cents: 0 };
      }
    }

    // Check credit balance
    const balance = await getCreditBalance(this.sql, {
      billingAccountId: account.id,
    });

    const balanceCents = balance ? parseInt(balance.balanceCents, 10) : 0;

    if (balanceCents <= 0) {
      return {
        allowed: false,
        balance_cents: balanceCents,
        reason: `insufficient credits for ${metricKey}`,
      };
    }

    return { allowed: true, balance_cents: balanceCents };
  }

  // -------------------------------------------------------------------------
  // Monthly grant
  // -------------------------------------------------------------------------

  /**
   * Grant monthly credits to all active billing accounts.
   * Uses an idempotency key per account per month to prevent double-grants.
   * Should be called by a cron/background job on the 1st of each month.
   */
  async grantMonthlyCredits(): Promise<GrantResult> {
    const accounts = await listAllActiveBillingAccounts(this.sql);

    const result: GrantResult = {
      accounts_processed: accounts.length,
      accounts_granted: 0,
      errors: [],
    };

    const periodKey = periodKeyStr(new Date());

    for (const account of accounts) {
      try {
        const idempotencyKey = `monthly_grant_${account.id}_${periodKey}`;

        // Check if already granted this month
        const existing = await getCreditLedgerByIdempotencyKey(this.sql, {
          billingAccountId: account.id,
          idempotencyKey,
        });

        if (existing) {
          // Already granted
          continue;
        }

        const currentBalance = await getCreditBalance(this.sql, {
          billingAccountId: account.id,
        });
        const currentCents = currentBalance
          ? parseInt(currentBalance.balanceCents, 10)
          : 0;
        const newBalance = currentCents + MONTHLY_GRANT_CENTS;

        await upsertCreditBalance(this.sql, {
          billingAccountId: account.id,
          balanceCents: String(newBalance),
          lastGrantAt: new Date(),
        });

        await insertCreditLedgerEntry(this.sql, {
          billingAccountId: account.id,
          amountCents: String(MONTHLY_GRANT_CENTS),
          balanceAfterCents: String(newBalance),
          reason: `Monthly credit grant (${periodKey})`,
          category: CreditCategories.MONTHLY_GRANT,
          metricKey: "",
          idempotencyKey,
        });

        result.accounts_granted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`account ${account.id}: ${msg}`);
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Entitlements (read-only check)
  // -------------------------------------------------------------------------

  /**
   * Check if a feature is entitled for an owner.
   * For CE (billing disabled), all features are entitled.
   */
  async hasEntitlement(
    ownerType: OwnerType,
    ownerId: string,
    featureKey: string,
  ): Promise<boolean> {
    if (!this.billingEnabled) {
      return true;
    }

    const account = await getBillingAccountByOwner(this.sql, {
      ownerType,
      ownerId,
    });
    if (!account) return false;

    const entitlements = await listBillingEntitlementsByAccount(this.sql, {
      billingAccountId: account.id,
    });

    return entitlements.some((e) => e.featureKey === featureKey && e.active);
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapLedgerEntry(
  row: InsertCreditLedgerEntryRow | ListCreditLedgerByAccountRow,
): CreditLedgerEntryResponse {
  return {
    id: row.id,
    billing_account_id: row.billingAccountId,
    amount_cents: parseInt(row.amountCents, 10),
    balance_after_cents: parseInt(row.balanceAfterCents, 10),
    reason: row.reason,
    category: row.category,
    metric_key: row.metricKey,
    created_at: row.createdAt,
  };
}

function mapUsageCounter(
  counter: IncrementUsageCounterRow | GetUsageCounterByMetricRow,
): UsageResponse {
  return {
    metric_key: counter.metricKey,
    included_quantity: parseInt(counter.includedQuantity, 10),
    consumed_quantity: parseInt(counter.consumedQuantity, 10),
    overage_quantity: parseInt(counter.overageQuantity, 10),
    period_start: counter.periodStart,
    period_end: counter.periodEnd,
  };
}

// ---------------------------------------------------------------------------
// Middleware helper
// ---------------------------------------------------------------------------

/**
 * Create a quota enforcement function suitable for use as Hono middleware.
 *
 * Usage in route:
 *   const enforceQuota = createQuotaEnforcer(billingService);
 *   app.post("/api/workspaces", enforceQuota("workspace_compute_minutes"), handler);
 *
 * For CE, the enforcer is a no-op passthrough.
 */
export function createQuotaEnforcer(billing: BillingService) {
  return (metricKey: MetricKey) => {
    return async (c: any, next: () => Promise<void>) => {
      // CE: billing disabled, skip enforcement
      if (!billing.isBillingEnabled()) {
        return next();
      }

      // Determine owner from auth context
      const user = c.get("user");
      if (!user) {
        // No auth, let the auth middleware handle it
        return next();
      }

      const result = await billing.checkQuota("user", String(user.id), metricKey);
      if (!result.allowed) {
        return c.json(
          {
            message: result.reason ?? "quota exceeded",
            errors: [
              {
                resource: "Billing",
                field: "credits",
                code: "insufficient_credits",
              },
            ],
          },
          402,
        );
      }

      return next();
    };
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBillingService(
  sql: Sql,
  opts?: { billingEnabled?: boolean },
): BillingService {
  return new BillingService(sql, opts);
}
