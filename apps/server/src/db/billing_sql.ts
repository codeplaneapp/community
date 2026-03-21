import { Sql } from "postgres";

export const getBillingAccountByOwnerQuery = `-- name: GetBillingAccountByOwner :one
SELECT id, owner_type, owner_id, stripe_customer_id, stripe_customer_email, stripe_customer_name, created_at, updated_at
FROM billing_accounts
WHERE owner_type = $1
  AND owner_id = $2`;

export interface GetBillingAccountByOwnerArgs {
    ownerType: string;
    ownerId: string;
}

export interface GetBillingAccountByOwnerRow {
    id: string;
    ownerType: string;
    ownerId: string;
    stripeCustomerId: string;
    stripeCustomerEmail: string;
    stripeCustomerName: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getBillingAccountByOwner(sql: Sql, args: GetBillingAccountByOwnerArgs): Promise<GetBillingAccountByOwnerRow | null> {
    const rows = await sql.unsafe(getBillingAccountByOwnerQuery, [args.ownerType, args.ownerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        ownerType: row[1],
        ownerId: row[2],
        stripeCustomerId: row[3],
        stripeCustomerEmail: row[4],
        stripeCustomerName: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const getBillingAccountByStripeCustomerIDQuery = `-- name: GetBillingAccountByStripeCustomerID :one
SELECT id, owner_type, owner_id, stripe_customer_id, stripe_customer_email, stripe_customer_name, created_at, updated_at
FROM billing_accounts
WHERE stripe_customer_id = $1`;

export interface GetBillingAccountByStripeCustomerIDArgs {
    stripeCustomerId: string;
}

export interface GetBillingAccountByStripeCustomerIDRow {
    id: string;
    ownerType: string;
    ownerId: string;
    stripeCustomerId: string;
    stripeCustomerEmail: string;
    stripeCustomerName: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getBillingAccountByStripeCustomerID(sql: Sql, args: GetBillingAccountByStripeCustomerIDArgs): Promise<GetBillingAccountByStripeCustomerIDRow | null> {
    const rows = await sql.unsafe(getBillingAccountByStripeCustomerIDQuery, [args.stripeCustomerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        ownerType: row[1],
        ownerId: row[2],
        stripeCustomerId: row[3],
        stripeCustomerEmail: row[4],
        stripeCustomerName: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const upsertBillingAccountQuery = `-- name: UpsertBillingAccount :one
INSERT INTO billing_accounts (
    owner_type,
    owner_id,
    stripe_customer_id,
    stripe_customer_email,
    stripe_customer_name
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
ON CONFLICT (owner_type, owner_id) DO UPDATE
SET stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_customer_email = EXCLUDED.stripe_customer_email,
    stripe_customer_name = EXCLUDED.stripe_customer_name,
    updated_at = NOW()
RETURNING id, owner_type, owner_id, stripe_customer_id, stripe_customer_email, stripe_customer_name, created_at, updated_at`;

export interface UpsertBillingAccountArgs {
    ownerType: string;
    ownerId: string;
    stripeCustomerId: string;
    stripeCustomerEmail: string;
    stripeCustomerName: string;
}

export interface UpsertBillingAccountRow {
    id: string;
    ownerType: string;
    ownerId: string;
    stripeCustomerId: string;
    stripeCustomerEmail: string;
    stripeCustomerName: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertBillingAccount(sql: Sql, args: UpsertBillingAccountArgs): Promise<UpsertBillingAccountRow | null> {
    const rows = await sql.unsafe(upsertBillingAccountQuery, [args.ownerType, args.ownerId, args.stripeCustomerId, args.stripeCustomerEmail, args.stripeCustomerName]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        ownerType: row[1],
        ownerId: row[2],
        stripeCustomerId: row[3],
        stripeCustomerEmail: row[4],
        stripeCustomerName: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const upsertBillingSubscriptionQuery = `-- name: UpsertBillingSubscription :one
INSERT INTO billing_subscriptions (
    billing_account_id,
    stripe_subscription_id,
    stripe_price_id,
    plan_key,
    billing_interval,
    status,
    quantity,
    trial_end,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    raw_payload
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10,
    $11,
    $12,
    $13
)
ON CONFLICT (stripe_subscription_id) DO UPDATE
SET billing_account_id = EXCLUDED.billing_account_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    plan_key = EXCLUDED.plan_key,
    billing_interval = EXCLUDED.billing_interval,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    trial_end = EXCLUDED.trial_end,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    canceled_at = EXCLUDED.canceled_at,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = NOW()
RETURNING id, billing_account_id, stripe_subscription_id, stripe_price_id, plan_key, billing_interval, status, quantity, trial_end, current_period_start, current_period_end, cancel_at_period_end, canceled_at, raw_payload, created_at, updated_at`;

export interface UpsertBillingSubscriptionArgs {
    billingAccountId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    planKey: string;
    billingInterval: string;
    status: string;
    quantity: string;
    trialEnd: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    rawPayload: any;
}

export interface UpsertBillingSubscriptionRow {
    id: string;
    billingAccountId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    planKey: string;
    billingInterval: string;
    status: string;
    quantity: string;
    trialEnd: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    rawPayload: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertBillingSubscription(sql: Sql, args: UpsertBillingSubscriptionArgs): Promise<UpsertBillingSubscriptionRow | null> {
    const rows = await sql.unsafe(upsertBillingSubscriptionQuery, [args.billingAccountId, args.stripeSubscriptionId, args.stripePriceId, args.planKey, args.billingInterval, args.status, args.quantity, args.trialEnd, args.currentPeriodStart, args.currentPeriodEnd, args.cancelAtPeriodEnd, args.canceledAt, args.rawPayload]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        billingAccountId: row[1],
        stripeSubscriptionId: row[2],
        stripePriceId: row[3],
        planKey: row[4],
        billingInterval: row[5],
        status: row[6],
        quantity: row[7],
        trialEnd: row[8],
        currentPeriodStart: row[9],
        currentPeriodEnd: row[10],
        cancelAtPeriodEnd: row[11],
        canceledAt: row[12],
        rawPayload: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    };
}

export const getLatestBillingSubscriptionByAccountQuery = `-- name: GetLatestBillingSubscriptionByAccount :one
SELECT id, billing_account_id, stripe_subscription_id, stripe_price_id, plan_key, billing_interval, status, quantity, trial_end, current_period_start, current_period_end, cancel_at_period_end, canceled_at, raw_payload, created_at, updated_at
FROM billing_subscriptions
WHERE billing_account_id = $1
ORDER BY updated_at DESC, id DESC
LIMIT 1`;

export interface GetLatestBillingSubscriptionByAccountArgs {
    billingAccountId: string;
}

export interface GetLatestBillingSubscriptionByAccountRow {
    id: string;
    billingAccountId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    planKey: string;
    billingInterval: string;
    status: string;
    quantity: string;
    trialEnd: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    rawPayload: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLatestBillingSubscriptionByAccount(sql: Sql, args: GetLatestBillingSubscriptionByAccountArgs): Promise<GetLatestBillingSubscriptionByAccountRow | null> {
    const rows = await sql.unsafe(getLatestBillingSubscriptionByAccountQuery, [args.billingAccountId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        billingAccountId: row[1],
        stripeSubscriptionId: row[2],
        stripePriceId: row[3],
        planKey: row[4],
        billingInterval: row[5],
        status: row[6],
        quantity: row[7],
        trialEnd: row[8],
        currentPeriodStart: row[9],
        currentPeriodEnd: row[10],
        cancelAtPeriodEnd: row[11],
        canceledAt: row[12],
        rawPayload: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    };
}

export const listBillingSubscriptionsByAccountQuery = `-- name: ListBillingSubscriptionsByAccount :many
SELECT id, billing_account_id, stripe_subscription_id, stripe_price_id, plan_key, billing_interval, status, quantity, trial_end, current_period_start, current_period_end, cancel_at_period_end, canceled_at, raw_payload, created_at, updated_at
FROM billing_subscriptions
WHERE billing_account_id = $1
ORDER BY updated_at DESC, id DESC`;

export interface ListBillingSubscriptionsByAccountArgs {
    billingAccountId: string;
}

export interface ListBillingSubscriptionsByAccountRow {
    id: string;
    billingAccountId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    planKey: string;
    billingInterval: string;
    status: string;
    quantity: string;
    trialEnd: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    rawPayload: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function listBillingSubscriptionsByAccount(sql: Sql, args: ListBillingSubscriptionsByAccountArgs): Promise<ListBillingSubscriptionsByAccountRow[]> {
    return (await sql.unsafe(listBillingSubscriptionsByAccountQuery, [args.billingAccountId]).values()).map(row => ({
        id: row[0],
        billingAccountId: row[1],
        stripeSubscriptionId: row[2],
        stripePriceId: row[3],
        planKey: row[4],
        billingInterval: row[5],
        status: row[6],
        quantity: row[7],
        trialEnd: row[8],
        currentPeriodStart: row[9],
        currentPeriodEnd: row[10],
        cancelAtPeriodEnd: row[11],
        canceledAt: row[12],
        rawPayload: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    }));
}

export const deactivateBillingEntitlementsByAccountQuery = `-- name: DeactivateBillingEntitlementsByAccount :exec
UPDATE billing_entitlements
SET active = FALSE,
    last_synced_at = NOW(),
    updated_at = NOW()
WHERE billing_account_id = $1`;

export interface DeactivateBillingEntitlementsByAccountArgs {
    billingAccountId: string;
}

export async function deactivateBillingEntitlementsByAccount(sql: Sql, args: DeactivateBillingEntitlementsByAccountArgs): Promise<void> {
    await sql.unsafe(deactivateBillingEntitlementsByAccountQuery, [args.billingAccountId]);
}

export const upsertBillingEntitlementQuery = `-- name: UpsertBillingEntitlement :one
INSERT INTO billing_entitlements (
    billing_account_id,
    feature_key,
    active,
    last_synced_at
)
VALUES (
    $1,
    $2,
    $3,
    $4
)
ON CONFLICT (billing_account_id, feature_key) DO UPDATE
SET active = EXCLUDED.active,
    last_synced_at = EXCLUDED.last_synced_at,
    updated_at = NOW()
RETURNING id, billing_account_id, feature_key, active, last_synced_at, created_at, updated_at`;

export interface UpsertBillingEntitlementArgs {
    billingAccountId: string;
    featureKey: string;
    active: boolean;
    lastSyncedAt: Date;
}

export interface UpsertBillingEntitlementRow {
    id: string;
    billingAccountId: string;
    featureKey: string;
    active: boolean;
    lastSyncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertBillingEntitlement(sql: Sql, args: UpsertBillingEntitlementArgs): Promise<UpsertBillingEntitlementRow | null> {
    const rows = await sql.unsafe(upsertBillingEntitlementQuery, [args.billingAccountId, args.featureKey, args.active, args.lastSyncedAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        billingAccountId: row[1],
        featureKey: row[2],
        active: row[3],
        lastSyncedAt: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const listBillingEntitlementsByAccountQuery = `-- name: ListBillingEntitlementsByAccount :many
SELECT id, billing_account_id, feature_key, active, last_synced_at, created_at, updated_at
FROM billing_entitlements
WHERE billing_account_id = $1
ORDER BY feature_key ASC`;

export interface ListBillingEntitlementsByAccountArgs {
    billingAccountId: string;
}

export interface ListBillingEntitlementsByAccountRow {
    id: string;
    billingAccountId: string;
    featureKey: string;
    active: boolean;
    lastSyncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function listBillingEntitlementsByAccount(sql: Sql, args: ListBillingEntitlementsByAccountArgs): Promise<ListBillingEntitlementsByAccountRow[]> {
    return (await sql.unsafe(listBillingEntitlementsByAccountQuery, [args.billingAccountId]).values()).map(row => ({
        id: row[0],
        billingAccountId: row[1],
        featureKey: row[2],
        active: row[3],
        lastSyncedAt: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const upsertBillingUsageCounterQuery = `-- name: UpsertBillingUsageCounter :one
INSERT INTO billing_usage_counters (
    owner_type,
    owner_id,
    metric_key,
    period_start,
    period_end,
    included_quantity,
    consumed_quantity,
    overage_quantity,
    last_reported_meter_event_id,
    last_synced_at
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10
)
ON CONFLICT (owner_type, owner_id, metric_key, period_start, period_end) DO UPDATE
SET included_quantity = EXCLUDED.included_quantity,
    consumed_quantity = EXCLUDED.consumed_quantity,
    overage_quantity = EXCLUDED.overage_quantity,
    last_reported_meter_event_id = EXCLUDED.last_reported_meter_event_id,
    last_synced_at = EXCLUDED.last_synced_at,
    updated_at = NOW()
RETURNING id, owner_type, owner_id, metric_key, period_start, period_end, included_quantity, consumed_quantity, overage_quantity, last_reported_meter_event_id, last_synced_at, created_at, updated_at`;

export interface UpsertBillingUsageCounterArgs {
    ownerType: string;
    ownerId: string;
    metricKey: string;
    periodStart: Date;
    periodEnd: Date;
    includedQuantity: string;
    consumedQuantity: string;
    overageQuantity: string;
    lastReportedMeterEventId: string;
    lastSyncedAt: Date;
}

export interface UpsertBillingUsageCounterRow {
    id: string;
    ownerType: string;
    ownerId: string;
    metricKey: string;
    periodStart: Date;
    periodEnd: Date;
    includedQuantity: string;
    consumedQuantity: string;
    overageQuantity: string;
    lastReportedMeterEventId: string;
    lastSyncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertBillingUsageCounter(sql: Sql, args: UpsertBillingUsageCounterArgs): Promise<UpsertBillingUsageCounterRow | null> {
    const rows = await sql.unsafe(upsertBillingUsageCounterQuery, [args.ownerType, args.ownerId, args.metricKey, args.periodStart, args.periodEnd, args.includedQuantity, args.consumedQuantity, args.overageQuantity, args.lastReportedMeterEventId, args.lastSyncedAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        ownerType: row[1],
        ownerId: row[2],
        metricKey: row[3],
        periodStart: row[4],
        periodEnd: row[5],
        includedQuantity: row[6],
        consumedQuantity: row[7],
        overageQuantity: row[8],
        lastReportedMeterEventId: row[9],
        lastSyncedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const listBillingUsageCountersByOwnerAndPeriodQuery = `-- name: ListBillingUsageCountersByOwnerAndPeriod :many
SELECT id, owner_type, owner_id, metric_key, period_start, period_end, included_quantity, consumed_quantity, overage_quantity, last_reported_meter_event_id, last_synced_at, created_at, updated_at
FROM billing_usage_counters
WHERE owner_type = $1
  AND owner_id = $2
  AND period_start = $3
  AND period_end = $4
ORDER BY metric_key ASC`;

export interface ListBillingUsageCountersByOwnerAndPeriodArgs {
    ownerType: string;
    ownerId: string;
    periodStart: Date;
    periodEnd: Date;
}

export interface ListBillingUsageCountersByOwnerAndPeriodRow {
    id: string;
    ownerType: string;
    ownerId: string;
    metricKey: string;
    periodStart: Date;
    periodEnd: Date;
    includedQuantity: string;
    consumedQuantity: string;
    overageQuantity: string;
    lastReportedMeterEventId: string;
    lastSyncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function listBillingUsageCountersByOwnerAndPeriod(sql: Sql, args: ListBillingUsageCountersByOwnerAndPeriodArgs): Promise<ListBillingUsageCountersByOwnerAndPeriodRow[]> {
    return (await sql.unsafe(listBillingUsageCountersByOwnerAndPeriodQuery, [args.ownerType, args.ownerId, args.periodStart, args.periodEnd]).values()).map(row => ({
        id: row[0],
        ownerType: row[1],
        ownerId: row[2],
        metricKey: row[3],
        periodStart: row[4],
        periodEnd: row[5],
        includedQuantity: row[6],
        consumedQuantity: row[7],
        overageQuantity: row[8],
        lastReportedMeterEventId: row[9],
        lastSyncedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    }));
}

export const countPrivateReposByOwnerQuery = `-- name: CountPrivateReposByOwner :one
SELECT COUNT(*)::bigint
FROM repositories r
WHERE NOT r.is_public
  AND (
    ($1::text = 'user' AND r.user_id = $2::bigint)
    OR
    ($1::text = 'org' AND r.org_id = $2::bigint)
  )`;

export interface CountPrivateReposByOwnerArgs {
    ownerType: string;
    ownerId: string;
}

export interface CountPrivateReposByOwnerRow {
    : string;
}

export async function countPrivateReposByOwner(sql: Sql, args: CountPrivateReposByOwnerArgs): Promise<CountPrivateReposByOwnerRow | null> {
    const rows = await sql.unsafe(countPrivateReposByOwnerQuery, [args.ownerType, args.ownerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        : row[0]
    };
}

export const sumStorageBytesByOwnerQuery = `-- name: SumStorageBytesByOwner :one
WITH owned_repos AS (
    SELECT id
    FROM repositories
    WHERE (
        $1::text = 'user'
        AND user_id = $2::bigint
    )
    OR (
        $1::text = 'org'
        AND org_id = $2::bigint
    )
)
SELECT (
    COALESCE((
        SELECT SUM(lo.size)
        FROM lfs_objects lo
        WHERE lo.repository_id IN (SELECT id FROM owned_repos)
    ), 0)
    + COALESCE((
        SELECT SUM(wa.size)
        FROM workflow_artifacts wa
        WHERE wa.repository_id IN (SELECT id FROM owned_repos)
          AND wa.status = 'ready'
    ), 0)
    + COALESCE((
        SELECT SUM(wc.object_size_bytes)
        FROM workflow_caches wc
        WHERE wc.repository_id IN (SELECT id FROM owned_repos)
          AND wc.status = 'finalized'
    ), 0)
)::bigint`;

export interface SumStorageBytesByOwnerArgs {
    ownerType: string;
    ownerId: string;
}

export interface SumStorageBytesByOwnerRow {
    : string;
}

export async function sumStorageBytesByOwner(sql: Sql, args: SumStorageBytesByOwnerArgs): Promise<SumStorageBytesByOwnerRow | null> {
    const rows = await sql.unsafe(sumStorageBytesByOwnerQuery, [args.ownerType, args.ownerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        : row[0]
    };
}

export const sumWorkflowMinutesByOwnerQuery = `-- name: SumWorkflowMinutesByOwner :one
WITH owned_repos AS (
    SELECT id
    FROM repositories
    WHERE (
        $3::text = 'user'
        AND user_id = $4::bigint
    )
    OR (
        $3::text = 'org'
        AND org_id = $4::bigint
    )
)
SELECT COALESCE(SUM(
    GREATEST(
        CEIL(EXTRACT(EPOCH FROM (COALESCE(wr.completed_at, NOW()) - wr.started_at)) / 60.0),
        0
    )
), 0)::bigint
FROM workflow_runs wr
WHERE wr.repository_id IN (SELECT id FROM owned_repos)
  AND wr.created_at >= $1
  AND wr.created_at < $2
  AND wr.started_at IS NOT NULL`;

export interface SumWorkflowMinutesByOwnerArgs {
    periodStart: Date;
    periodEnd: Date;
    ownerType: string;
    ownerId: string;
}

export interface SumWorkflowMinutesByOwnerRow {
    : string;
}

export async function sumWorkflowMinutesByOwner(sql: Sql, args: SumWorkflowMinutesByOwnerArgs): Promise<SumWorkflowMinutesByOwnerRow | null> {
    const rows = await sql.unsafe(sumWorkflowMinutesByOwnerQuery, [args.periodStart, args.periodEnd, args.ownerType, args.ownerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        : row[0]
    };
}

export const countAgentRunsByOwnerQuery = `-- name: CountAgentRunsByOwner :one
WITH owned_repos AS (
    SELECT id
    FROM repositories
    WHERE (
        $3::text = 'user'
        AND user_id = $4::bigint
    )
    OR (
        $3::text = 'org'
        AND org_id = $4::bigint
    )
)
SELECT COUNT(*)::bigint
FROM workflow_runs wr
WHERE wr.repository_id IN (SELECT id FROM owned_repos)
  AND wr.trigger_event = 'agent_message'
  AND wr.created_at >= $1
  AND wr.created_at < $2`;

export interface CountAgentRunsByOwnerArgs {
    periodStart: Date;
    periodEnd: Date;
    ownerType: string;
    ownerId: string;
}

export interface CountAgentRunsByOwnerRow {
    : string;
}

export async function countAgentRunsByOwner(sql: Sql, args: CountAgentRunsByOwnerArgs): Promise<CountAgentRunsByOwnerRow | null> {
    const rows = await sql.unsafe(countAgentRunsByOwnerQuery, [args.periodStart, args.periodEnd, args.ownerType, args.ownerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        : row[0]
    };
}

export const getCreditBalanceQuery = `-- name: GetCreditBalance :one

SELECT billing_account_id, balance_cents, last_grant_at, updated_at
FROM billing_credit_balances
WHERE billing_account_id = $1`;

export interface GetCreditBalanceArgs {
    billingAccountId: string;
}

export interface GetCreditBalanceRow {
    billingAccountId: string;
    balanceCents: string;
    lastGrantAt: Date | null;
    updatedAt: Date;
}

export async function getCreditBalance(sql: Sql, args: GetCreditBalanceArgs): Promise<GetCreditBalanceRow | null> {
    const rows = await sql.unsafe(getCreditBalanceQuery, [args.billingAccountId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        billingAccountId: row[0],
        balanceCents: row[1],
        lastGrantAt: row[2],
        updatedAt: row[3]
    };
}

export const upsertCreditBalanceQuery = `-- name: UpsertCreditBalance :one
INSERT INTO billing_credit_balances (billing_account_id, balance_cents, last_grant_at, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (billing_account_id) DO UPDATE
SET balance_cents = EXCLUDED.balance_cents,
    last_grant_at = EXCLUDED.last_grant_at,
    updated_at = NOW()
RETURNING billing_account_id, balance_cents, last_grant_at, updated_at`;

export interface UpsertCreditBalanceArgs {
    billingAccountId: string;
    balanceCents: string;
    lastGrantAt: Date | null;
}

export interface UpsertCreditBalanceRow {
    billingAccountId: string;
    balanceCents: string;
    lastGrantAt: Date | null;
    updatedAt: Date;
}

export async function upsertCreditBalance(sql: Sql, args: UpsertCreditBalanceArgs): Promise<UpsertCreditBalanceRow | null> {
    const rows = await sql.unsafe(upsertCreditBalanceQuery, [args.billingAccountId, args.balanceCents, args.lastGrantAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        billingAccountId: row[0],
        balanceCents: row[1],
        lastGrantAt: row[2],
        updatedAt: row[3]
    };
}

export const insertCreditLedgerEntryQuery = `-- name: InsertCreditLedgerEntry :one
INSERT INTO billing_credit_ledger (
    billing_account_id,
    amount_cents,
    balance_after_cents,
    reason,
    category,
    metric_key,
    idempotency_key
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7
)
RETURNING id, billing_account_id, amount_cents, balance_after_cents, reason, category, metric_key, idempotency_key, created_at`;

export interface InsertCreditLedgerEntryArgs {
    billingAccountId: string;
    amountCents: string;
    balanceAfterCents: string;
    reason: string;
    category: string;
    metricKey: string;
    idempotencyKey: string;
}

export interface InsertCreditLedgerEntryRow {
    id: string;
    billingAccountId: string;
    amountCents: string;
    balanceAfterCents: string;
    reason: string;
    category: string;
    metricKey: string;
    idempotencyKey: string;
    createdAt: Date;
}

export async function insertCreditLedgerEntry(sql: Sql, args: InsertCreditLedgerEntryArgs): Promise<InsertCreditLedgerEntryRow | null> {
    const rows = await sql.unsafe(insertCreditLedgerEntryQuery, [args.billingAccountId, args.amountCents, args.balanceAfterCents, args.reason, args.category, args.metricKey, args.idempotencyKey]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        billingAccountId: row[1],
        amountCents: row[2],
        balanceAfterCents: row[3],
        reason: row[4],
        category: row[5],
        metricKey: row[6],
        idempotencyKey: row[7],
        createdAt: row[8]
    };
}

export const listCreditLedgerByAccountQuery = `-- name: ListCreditLedgerByAccount :many
SELECT id, billing_account_id, amount_cents, balance_after_cents, reason, category, metric_key, idempotency_key, created_at
FROM billing_credit_ledger
WHERE billing_account_id = $1
ORDER BY created_at DESC
LIMIT $3::bigint
OFFSET $2::bigint`;

export interface ListCreditLedgerByAccountArgs {
    billingAccountId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListCreditLedgerByAccountRow {
    id: string;
    billingAccountId: string;
    amountCents: string;
    balanceAfterCents: string;
    reason: string;
    category: string;
    metricKey: string;
    idempotencyKey: string;
    createdAt: Date;
}

export async function listCreditLedgerByAccount(sql: Sql, args: ListCreditLedgerByAccountArgs): Promise<ListCreditLedgerByAccountRow[]> {
    return (await sql.unsafe(listCreditLedgerByAccountQuery, [args.billingAccountId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        billingAccountId: row[1],
        amountCents: row[2],
        balanceAfterCents: row[3],
        reason: row[4],
        category: row[5],
        metricKey: row[6],
        idempotencyKey: row[7],
        createdAt: row[8]
    }));
}

export const countCreditLedgerByAccountQuery = `-- name: CountCreditLedgerByAccount :one
SELECT COUNT(*)::bigint
FROM billing_credit_ledger
WHERE billing_account_id = $1`;

export interface CountCreditLedgerByAccountArgs {
    billingAccountId: string;
}

export interface CountCreditLedgerByAccountRow {
    : string;
}

export async function countCreditLedgerByAccount(sql: Sql, args: CountCreditLedgerByAccountArgs): Promise<CountCreditLedgerByAccountRow | null> {
    const rows = await sql.unsafe(countCreditLedgerByAccountQuery, [args.billingAccountId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        : row[0]
    };
}

export const getCreditLedgerByIdempotencyKeyQuery = `-- name: GetCreditLedgerByIdempotencyKey :one
SELECT id, billing_account_id, amount_cents, balance_after_cents, reason, category, metric_key, idempotency_key, created_at
FROM billing_credit_ledger
WHERE billing_account_id = $1
  AND idempotency_key = $2
  AND idempotency_key != ''`;

export interface GetCreditLedgerByIdempotencyKeyArgs {
    billingAccountId: string;
    idempotencyKey: string;
}

export interface GetCreditLedgerByIdempotencyKeyRow {
    id: string;
    billingAccountId: string;
    amountCents: string;
    balanceAfterCents: string;
    reason: string;
    category: string;
    metricKey: string;
    idempotencyKey: string;
    createdAt: Date;
}

export async function getCreditLedgerByIdempotencyKey(sql: Sql, args: GetCreditLedgerByIdempotencyKeyArgs): Promise<GetCreditLedgerByIdempotencyKeyRow | null> {
    const rows = await sql.unsafe(getCreditLedgerByIdempotencyKeyQuery, [args.billingAccountId, args.idempotencyKey]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        billingAccountId: row[1],
        amountCents: row[2],
        balanceAfterCents: row[3],
        reason: row[4],
        category: row[5],
        metricKey: row[6],
        idempotencyKey: row[7],
        createdAt: row[8]
    };
}

export const listAllActiveBillingAccountsQuery = `-- name: ListAllActiveBillingAccounts :many
SELECT id, owner_type, owner_id, stripe_customer_id, stripe_customer_email, stripe_customer_name, created_at, updated_at
FROM billing_accounts
ORDER BY id ASC`;

export interface ListAllActiveBillingAccountsRow {
    id: string;
    ownerType: string;
    ownerId: string;
    stripeCustomerId: string;
    stripeCustomerEmail: string;
    stripeCustomerName: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listAllActiveBillingAccounts(sql: Sql): Promise<ListAllActiveBillingAccountsRow[]> {
    return (await sql.unsafe(listAllActiveBillingAccountsQuery, []).values()).map(row => ({
        id: row[0],
        ownerType: row[1],
        ownerId: row[2],
        stripeCustomerId: row[3],
        stripeCustomerEmail: row[4],
        stripeCustomerName: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const getUsageCounterByMetricQuery = `-- name: GetUsageCounterByMetric :one
SELECT id, owner_type, owner_id, metric_key, period_start, period_end, included_quantity, consumed_quantity, overage_quantity, last_reported_meter_event_id, last_synced_at, created_at, updated_at
FROM billing_usage_counters
WHERE owner_type = $1
  AND owner_id = $2
  AND metric_key = $3
  AND period_start = $4
  AND period_end = $5`;

export interface GetUsageCounterByMetricArgs {
    ownerType: string;
    ownerId: string;
    metricKey: string;
    periodStart: Date;
    periodEnd: Date;
}

export interface GetUsageCounterByMetricRow {
    id: string;
    ownerType: string;
    ownerId: string;
    metricKey: string;
    periodStart: Date;
    periodEnd: Date;
    includedQuantity: string;
    consumedQuantity: string;
    overageQuantity: string;
    lastReportedMeterEventId: string;
    lastSyncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function getUsageCounterByMetric(sql: Sql, args: GetUsageCounterByMetricArgs): Promise<GetUsageCounterByMetricRow | null> {
    const rows = await sql.unsafe(getUsageCounterByMetricQuery, [args.ownerType, args.ownerId, args.metricKey, args.periodStart, args.periodEnd]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        ownerType: row[1],
        ownerId: row[2],
        metricKey: row[3],
        periodStart: row[4],
        periodEnd: row[5],
        includedQuantity: row[6],
        consumedQuantity: row[7],
        overageQuantity: row[8],
        lastReportedMeterEventId: row[9],
        lastSyncedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const incrementUsageCounterQuery = `-- name: IncrementUsageCounter :one
INSERT INTO billing_usage_counters (
    owner_type,
    owner_id,
    metric_key,
    period_start,
    period_end,
    included_quantity,
    consumed_quantity,
    overage_quantity,
    last_reported_meter_event_id,
    last_synced_at
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    0,
    '',
    NOW()
)
ON CONFLICT (owner_type, owner_id, metric_key, period_start, period_end) DO UPDATE
SET consumed_quantity = billing_usage_counters.consumed_quantity + $7,
    updated_at = NOW()
RETURNING id, owner_type, owner_id, metric_key, period_start, period_end, included_quantity, consumed_quantity, overage_quantity, last_reported_meter_event_id, last_synced_at, created_at, updated_at`;

export interface IncrementUsageCounterArgs {
    ownerType: string;
    ownerId: string;
    metricKey: string;
    periodStart: Date;
    periodEnd: Date;
    includedQuantity: string;
    consumedQuantity: string;
}

export interface IncrementUsageCounterRow {
    id: string;
    ownerType: string;
    ownerId: string;
    metricKey: string;
    periodStart: Date;
    periodEnd: Date;
    includedQuantity: string;
    consumedQuantity: string;
    overageQuantity: string;
    lastReportedMeterEventId: string;
    lastSyncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function incrementUsageCounter(sql: Sql, args: IncrementUsageCounterArgs): Promise<IncrementUsageCounterRow | null> {
    const rows = await sql.unsafe(incrementUsageCounterQuery, [args.ownerType, args.ownerId, args.metricKey, args.periodStart, args.periodEnd, args.includedQuantity, args.consumedQuantity]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        ownerType: row[1],
        ownerId: row[2],
        metricKey: row[3],
        periodStart: row[4],
        periodEnd: row[5],
        includedQuantity: row[6],
        consumedQuantity: row[7],
        overageQuantity: row[8],
        lastReportedMeterEventId: row[9],
        lastSyncedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

