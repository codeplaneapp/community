/**
 * Feature flags service for Codeplane.
 *
 * Controls which features are enabled/disabled, user-level beta access,
 * and plan-based feature gating (free vs paid).
 *
 * In Community Edition all features are enabled by default (no plan
 * restrictions). The Cloud version overrides the provider to restrict
 * features based on subscription plans.
 *
 * Matches Go's internal/config/FeatureFlagsConfig + routes/flags.go pattern.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Predefined feature flag names.
 * Keep in sync with Go's FeatureFlagsConfig and the UI store.
 */
export type FeatureFlagName =
  | "workspaces"
  | "agents"
  | "preview"
  | "sync"
  | "billing"
  | "readout_dashboard"
  | "landing_queue"
  | "tool_skills"
  | "tool_policies"
  | "repo_snapshots"
  | "integrations"
  | "session_replay"
  | "secrets_manager"
  | "web_editor"
  | "client_error_reporting"
  | "client_metrics";

/**
 * Plan tiers for feature gating. CE always behaves as "enterprise"
 * (everything enabled). Cloud restricts based on subscription.
 */
export type PlanTier = "free" | "pro" | "enterprise";

/**
 * A single flag definition: static boolean or plan-gated.
 */
export interface FlagDefinition {
  /** Whether the flag is enabled by default (when no plan check applies). */
  enabled: boolean;
  /** If set, the flag is only enabled for these plan tiers. */
  plans?: PlanTier[];
  /** If set, the flag is enabled only for these user IDs (beta access). */
  betaUserIds?: number[];
}

/**
 * Full flag configuration map.
 */
export type FlagConfig = Record<FeatureFlagName, FlagDefinition>;

/**
 * Pluggable provider interface so the Cloud version can swap in
 * DB-backed or LaunchDarkly-backed flag evaluation.
 */
export interface FeatureFlagProvider {
  /** Load/reload all flag definitions. */
  loadFeatureFlags(): Promise<FlagConfig>;
  /** Resolve a user's plan tier (used for plan-gated flags). */
  getUserPlan?(userId: number): Promise<PlanTier>;
}

// ---------------------------------------------------------------------------
// Default CE configuration — everything enabled
// ---------------------------------------------------------------------------

const CE_DEFAULTS: FlagConfig = {
  workspaces:              { enabled: true },
  agents:                  { enabled: true },
  preview:                 { enabled: true },
  sync:                    { enabled: true },
  billing:                 { enabled: true },
  readout_dashboard:       { enabled: true },
  landing_queue:           { enabled: true },
  tool_skills:             { enabled: true },
  tool_policies:           { enabled: true },
  repo_snapshots:          { enabled: true },
  integrations:            { enabled: true },
  session_replay:          { enabled: true },
  secrets_manager:         { enabled: true },
  web_editor:              { enabled: true },
  client_error_reporting:  { enabled: true },
  client_metrics:          { enabled: true },
};

// ---------------------------------------------------------------------------
// Default (in-memory) provider — reads from env or falls back to CE defaults
// ---------------------------------------------------------------------------

/**
 * Default CE provider: all flags enabled, overridable via
 * CODEPLANE_FEATURE_FLAGS_<FLAG_NAME> environment variables (set to "false"
 * to disable).
 */
export class DefaultFeatureFlagProvider implements FeatureFlagProvider {
  async loadFeatureFlags(): Promise<FlagConfig> {
    const config = { ...CE_DEFAULTS };

    for (const key of Object.keys(config) as FeatureFlagName[]) {
      const envKey = `CODEPLANE_FEATURE_FLAGS_${key.toUpperCase()}`;
      const envVal = process.env[envKey];
      if (envVal !== undefined) {
        config[key] = { ...config[key], enabled: envVal !== "false" && envVal !== "0" };
      }
    }

    return config;
  }
}

// ---------------------------------------------------------------------------
// FeatureFlagService
// ---------------------------------------------------------------------------

export class FeatureFlagService {
  private flags: FlagConfig;
  private provider: FeatureFlagProvider;

  constructor(provider?: FeatureFlagProvider) {
    this.provider = provider ?? new DefaultFeatureFlagProvider();
    // Start with CE defaults; loadFeatureFlags() will refresh.
    this.flags = { ...CE_DEFAULTS };
  }

  // -----------------------------------------------------------------------
  // Core API
  // -----------------------------------------------------------------------

  /**
   * Load (or reload) feature flags from the provider.
   * Call at startup and whenever flag config may have changed.
   */
  async loadFeatureFlags(): Promise<void> {
    this.flags = await this.provider.loadFeatureFlags();
  }

  /**
   * Check whether a flag is enabled, optionally for a specific user.
   *
   * Evaluation order:
   *   1. If the flag has a betaUserIds list and userId is in it -> true
   *   2. If the flag has a plans list, resolve the user's plan and check membership
   *   3. Fall back to the flag's static `enabled` value
   */
  async isEnabled(flagName: FeatureFlagName, userId?: number): Promise<boolean> {
    const def = this.flags[flagName];
    if (!def) return false;

    // Beta user override
    if (userId !== undefined && def.betaUserIds && def.betaUserIds.includes(userId)) {
      return true;
    }

    // Plan-gated check
    if (userId !== undefined && def.plans && def.plans.length > 0) {
      if (this.provider.getUserPlan) {
        const plan = await this.provider.getUserPlan(userId);
        return def.plans.includes(plan);
      }
      // No plan resolver available — fall through to static value
    }

    return def.enabled;
  }

  /**
   * Synchronous check for flags that have no plan/beta gating.
   * Useful in hot paths where async is unacceptable.
   */
  isEnabledSync(flagName: FeatureFlagName): boolean {
    const def = this.flags[flagName];
    return def ? def.enabled : false;
  }

  /**
   * Return all current flag values as a flat boolean map.
   * Matches the shape of Go's GET /api/feature-flags response.
   */
  getAllFlags(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [key, def] of Object.entries(this.flags)) {
      result[key] = def.enabled;
    }
    return result;
  }

  /**
   * Return the raw flag config (for debugging / admin endpoints).
   */
  getFlagConfig(): FlagConfig {
    return { ...this.flags };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: FeatureFlagService | null = null;

/**
 * Get or create the global FeatureFlagService singleton.
 * Pass a custom provider to override the default CE provider.
 */
export function getFeatureFlagService(provider?: FeatureFlagProvider): FeatureFlagService {
  if (!_instance) {
    _instance = new FeatureFlagService(provider);
  }
  return _instance;
}

/**
 * Create a fresh FeatureFlagService (replaces the singleton).
 * Useful in tests or when swapping providers at startup.
 */
export function createFeatureFlagService(provider?: FeatureFlagProvider): FeatureFlagService {
  _instance = new FeatureFlagService(provider);
  return _instance;
}
