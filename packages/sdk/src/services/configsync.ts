/**
 * Config-as-code sync service for JJHub Community Edition.
 *
 * Reconciles .jjhub/ configuration files (config.yml, labels.yml,
 * webhooks.yml, protected-bookmarks.yml) when pushed to the default bookmark.
 * Committed config wins: the database is updated to match what's in the repo.
 *
 * Mirrors the Go implementation in internal/configsync/ as closely as possible,
 * adapted for the TypeScript/postgres/jj-CLI stack.
 */

import { Result } from "better-result";
import type { Sql } from "postgres";
import * as yaml from "js-yaml";

import type { RepoHostService } from "./repohost";
import type { SecretCodec } from "./webhook";

import {
  getRepoByID,
  updateRepoConfigState,
  type GetRepoByIDRow,
  type UpdateRepoConfigStateArgs,
} from "../db/repos_sql";

import {
  listAllProtectedBookmarksByRepo,
  upsertProtectedBookmark,
  deleteProtectedBookmarkByPatternQuery,
  type ListAllProtectedBookmarksByRepoRow,
  type UpsertProtectedBookmarkArgs,
  type DeleteProtectedBookmarkByPatternArgs,
} from "../db/protected_bookmarks_sql";

import {
  listAllLabelsByRepo,
  createLabel,
  updateLabel,
  deleteLabel,
  countIssueLabelsByLabel,
  type ListAllLabelsByRepoRow,
  type CreateLabelArgs,
  type UpdateLabelArgs,
  type DeleteLabelArgs,
} from "../db/labels_sql";

import {
  listWebhooksByRepo,
  createWebhook,
  updateWebhookByID,
  deleteWebhookByID,
  type ListWebhooksByRepoRow,
  type CreateWebhookArgs,
  type UpdateWebhookByIDArgs,
  type DeleteWebhookByIDArgs,
} from "../db/webhooks_sql";

import {
  getSecretValueByName,
} from "../db/secrets_sql";

import {
  insertAuditLog,
} from "../db/audit_log_sql";

// ---------------------------------------------------------------------------
// File path constants — matching Go's configsync/types.go
// ---------------------------------------------------------------------------

const CONFIG_FILE_PATH = ".jjhub/config.yml";
const PROTECTED_BOOKMARKS_FILE_PATH = ".jjhub/protected-bookmarks.yml";
const LABELS_FILE_PATH = ".jjhub/labels.yml";
const WEBHOOKS_FILE_PATH = ".jjhub/webhooks.yml";

// ---------------------------------------------------------------------------
// Validation regexes — matching Go's parser.go
// ---------------------------------------------------------------------------

const CONFIG_REPO_TOPIC_REGEX = /^[a-z0-9][a-z0-9-]{0,34}$/;
const SECRET_REF_PATTERN = /^\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}$/;

// ---------------------------------------------------------------------------
// Input / Output types — matching Go's configsync/types.go
// ---------------------------------------------------------------------------

export interface SyncInput {
  repositoryId: string;
  commitSHA: string;
  trigger: string;
  dryRun: boolean;
  actorId?: string | null;
  actorName: string;
  ipAddress: string;
}

export interface SyncResult {
  dryRun: boolean;
  filesProcessed: string[];
  changes: ConfigChange[];
  warnings: SyncWarning[];
}

export interface ConfigChange {
  configType: string;
  identifier: string;
  action: string;
  before?: any;
  after?: any;
}

export interface SyncWarning {
  configType: string;
  identifier: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Parsed config types — matching Go's configsync/types.go
// ---------------------------------------------------------------------------

export interface ParsedConfig {
  configFilePresent: boolean;
  config: ConfigFile;
  protectedBookmarksFilePresent: boolean;
  protectedBookmarks: ProtectedBookmarkRule[];
  labelsFilePresent: boolean;
  labels: LabelDefinition[];
  webhooksFilePresent: boolean;
  webhooks: WebhookDefinition[];
}

export interface ConfigFile {
  repository?: RepositorySettings;
  workspace?: WorkspaceSettings;
  landing_queue?: LandingQueueSettings;
}

export interface RepositorySettings {
  description?: string;
  topics?: string[];
  visibility?: string;
  mirror?: MirrorSettings;
}

export interface MirrorSettings {
  enabled?: boolean;
  destination?: string;
}

export interface WorkspaceSettings {
  idle_timeout_seconds?: number;
  persistence?: string;
  dependencies?: string[];
}

export interface LandingQueueSettings {
  mode?: string;
  required_checks?: string[];
}

export interface ProtectedBookmarkRule {
  pattern: string;
  require_review: boolean;
  required_approvals: number;
  required_checks: string[];
  dismiss_stale_reviews: boolean;
  restrict_push_teams: string[];
}

export interface LabelDefinition {
  name: string;
  color: string;
  description: string;
}

export interface WebhookDefinition {
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Raw YAML shapes — matching Go's parser.go raw types
// ---------------------------------------------------------------------------

interface RawProtectedBookmarksFile {
  protected_bookmarks?: RawProtectedBookmarkRule[];
}

interface RawProtectedBookmarkRule {
  pattern?: string;
  require_review?: boolean;
  required_approvals?: number;
  required_checks?: string[];
  dismiss_stale_reviews?: boolean;
  restrict_push?: { teams?: string[] };
}

interface RawLabelsFile {
  labels?: RawLabelDefinition[];
}

interface RawLabelDefinition {
  name?: string;
  color?: string;
  description?: string;
}

interface RawWebhooksFile {
  webhooks?: RawWebhookDefinition[];
}

interface RawWebhookDefinition {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Internal snapshot — matching Go's repoConfigSnapshot
// ---------------------------------------------------------------------------

interface RepoConfigSnapshot {
  description: string;
  isPublic: boolean;
  topics: string[];
  isMirror: boolean;
  mirrorDestination: string;
  workspaceIdleTimeoutSecs: number;
  workspacePersistence: string;
  workspaceDependencies: string[];
  landingQueueMode: string;
  landingQueueRequiredChecks: string[];
}

// ---------------------------------------------------------------------------
// Sync plan — matching Go's syncPlan
// ---------------------------------------------------------------------------

interface SyncPlan {
  repoUpdate: UpdateRepoConfigStateArgs | null;
  bookmarksUpsert: UpsertProtectedBookmarkArgs[];
  bookmarksDelete: DeleteProtectedBookmarkByPatternArgs[];
  labelsCreate: CreateLabelArgs[];
  labelsUpdate: UpdateLabelArgs[];
  labelsDelete: DeleteLabelArgs[];
  webhooksCreate: CreateWebhookArgs[];
  webhooksUpdate: UpdateWebhookByIDArgs[];
  webhooksDelete: DeleteWebhookByIDArgs[];
  changes: ConfigChange[];
  warnings: SyncWarning[];
}

// ---------------------------------------------------------------------------
// Parser — matching Go's ParseConfigFiles and sub-parsers
// ---------------------------------------------------------------------------

export function parseConfigFiles(files: Map<string, string>): Result<ParsedConfig, Error> {
  const parsed: ParsedConfig = {
    configFilePresent: false,
    config: {},
    protectedBookmarksFilePresent: false,
    protectedBookmarks: [],
    labelsFilePresent: false,
    labels: [],
    webhooksFilePresent: false,
    webhooks: [],
  };

  const configContent = files.get(CONFIG_FILE_PATH);
  if (configContent !== undefined) {
    const cfgResult = parseConfigFile(configContent);
    if (Result.isError(cfgResult)) return cfgResult;
    parsed.configFilePresent = true;
    parsed.config = cfgResult.value;
  }

  const bookmarksContent = files.get(PROTECTED_BOOKMARKS_FILE_PATH);
  if (bookmarksContent !== undefined) {
    const rulesResult = parseProtectedBookmarksFile(bookmarksContent);
    if (Result.isError(rulesResult)) return rulesResult;
    parsed.protectedBookmarksFilePresent = true;
    parsed.protectedBookmarks = rulesResult.value;
  }

  const labelsContent = files.get(LABELS_FILE_PATH);
  if (labelsContent !== undefined) {
    const labelsResult = parseLabelsFile(labelsContent);
    if (Result.isError(labelsResult)) return labelsResult;
    parsed.labelsFilePresent = true;
    parsed.labels = labelsResult.value;
  }

  const webhooksContent = files.get(WEBHOOKS_FILE_PATH);
  if (webhooksContent !== undefined) {
    const webhooksResult = parseWebhooksFile(webhooksContent);
    if (Result.isError(webhooksResult)) return webhooksResult;
    parsed.webhooksFilePresent = true;
    parsed.webhooks = webhooksResult.value;
  }

  return Result.ok(parsed);
}

function decodeYAMLStrict<T>(filePath: string, content: string): Result<T, Error> {
  const trimmed = content.trim();
  if (trimmed === "") {
    return Result.ok({} as T);
  }
  try {
    const parsed = yaml.load(trimmed, {
      schema: yaml.DEFAULT_SCHEMA,
      filename: filePath,
    });
    if (parsed === null || parsed === undefined) {
      return Result.ok({} as T);
    }
    return Result.ok(parsed as T);
  } catch (err) {
    return Result.err(new Error(`${filePath}: ${err instanceof Error ? err.message : String(err)}`));
  }
}

function parseConfigFile(content: string): Result<ConfigFile, Error> {
  const decoded = decodeYAMLStrict<ConfigFile>(CONFIG_FILE_PATH, content);
  if (Result.isError(decoded)) return decoded;
  const cfg = decoded.value;

  if (cfg.repository) {
    if (cfg.repository.visibility !== undefined) {
      const visibility = cfg.repository.visibility.trim().toLowerCase();
      if (visibility !== "public" && visibility !== "private") {
        return Result.err(new Error(`${CONFIG_FILE_PATH}: repository.visibility must be public or private`));
      }
      cfg.repository.visibility = visibility;
    }

    if (cfg.repository.topics !== undefined) {
      const topicsResult = normalizeOptionalTopics(cfg.repository.topics);
      if (Result.isError(topicsResult)) {
        return Result.err(new Error(`${CONFIG_FILE_PATH}: ${topicsResult.error.message}`));
      }
      cfg.repository.topics = topicsResult.value;
    }

    if (cfg.repository.mirror) {
      if (cfg.repository.mirror.enabled === undefined) {
        return Result.err(new Error(`${CONFIG_FILE_PATH}: repository.mirror.enabled is required when repository.mirror is present`));
      }
      if (!cfg.repository.mirror.enabled) {
        if (cfg.repository.mirror.destination !== undefined && cfg.repository.mirror.destination.trim() !== "") {
          return Result.err(new Error(`${CONFIG_FILE_PATH}: repository.mirror.destination must be omitted when repository.mirror.enabled is false`));
        }
      } else {
        if (cfg.repository.mirror.destination === undefined || cfg.repository.mirror.destination.trim() === "") {
          return Result.err(new Error(`${CONFIG_FILE_PATH}: repository.mirror.destination is required when repository.mirror.enabled is true`));
        }
        const destination = cfg.repository.mirror.destination.trim();
        try {
          new URL(destination);
        } catch {
          return Result.err(new Error(`${CONFIG_FILE_PATH}: repository.mirror.destination must be a valid URL`));
        }
        cfg.repository.mirror.destination = destination;
      }
    }
  }

  if (cfg.workspace) {
    if (cfg.workspace.idle_timeout_seconds !== undefined && cfg.workspace.idle_timeout_seconds <= 0) {
      return Result.err(new Error(`${CONFIG_FILE_PATH}: workspace.idle_timeout_seconds must be positive`));
    }
    if (cfg.workspace.persistence !== undefined) {
      const persistence = cfg.workspace.persistence.trim().toLowerCase();
      if (persistence !== "persistent" && persistence !== "ephemeral") {
        return Result.err(new Error(`${CONFIG_FILE_PATH}: workspace.persistence must be persistent or ephemeral`));
      }
      cfg.workspace.persistence = persistence;
    }
    if (cfg.workspace.dependencies !== undefined) {
      const depsResult = normalizeOptionalTrimmedList(cfg.workspace.dependencies, false);
      if (Result.isError(depsResult)) {
        return Result.err(new Error(`${CONFIG_FILE_PATH}: workspace.dependencies: ${depsResult.error.message}`));
      }
      cfg.workspace.dependencies = depsResult.value;
    }
  }

  if (cfg.landing_queue) {
    if (cfg.landing_queue.mode !== undefined) {
      const mode = cfg.landing_queue.mode.trim().toLowerCase();
      if (mode !== "serialized" && mode !== "parallel") {
        return Result.err(new Error(`${CONFIG_FILE_PATH}: landing_queue.mode must be serialized or parallel`));
      }
      cfg.landing_queue.mode = mode;
    }
    if (cfg.landing_queue.required_checks !== undefined) {
      const checksResult = normalizeOptionalTrimmedList(cfg.landing_queue.required_checks, false);
      if (Result.isError(checksResult)) {
        return Result.err(new Error(`${CONFIG_FILE_PATH}: landing_queue.required_checks: ${checksResult.error.message}`));
      }
      cfg.landing_queue.required_checks = checksResult.value;
    }
  }

  return Result.ok(cfg);
}

function parseProtectedBookmarksFile(content: string): Result<ProtectedBookmarkRule[], Error> {
  if (content.trim() === "") {
    return Result.ok([]);
  }

  const decoded = decodeYAMLStrict<RawProtectedBookmarksFile>(PROTECTED_BOOKMARKS_FILE_PATH, content);
  if (Result.isError(decoded)) return decoded;
  const raw = decoded.value;

  if (!raw.protected_bookmarks) {
    return Result.err(new Error(`${PROTECTED_BOOKMARKS_FILE_PATH}: protected_bookmarks is required`));
  }

  const rules: ProtectedBookmarkRule[] = [];
  const seen = new Set<string>();

  for (const candidate of raw.protected_bookmarks) {
    const pattern = (candidate.pattern ?? "").trim();
    if (pattern === "") {
      return Result.err(new Error(`${PROTECTED_BOOKMARKS_FILE_PATH}: protected_bookmarks.pattern is required`));
    }

    // Validate glob pattern (basic check — Go uses path.Match)
    try {
      // A simple validation: if the pattern contains invalid characters we reject it.
      // The minimatch library could be used here, but for now we do a basic check.
      if (pattern.includes("[") && !pattern.includes("]")) {
        throw new Error("unclosed bracket");
      }
    } catch {
      return Result.err(new Error(`${PROTECTED_BOOKMARKS_FILE_PATH}: protected_bookmarks.pattern "${pattern}" is invalid`));
    }

    if (seen.has(pattern)) {
      return Result.err(new Error(`${PROTECTED_BOOKMARKS_FILE_PATH}: duplicate protected bookmark pattern "${pattern}"`));
    }
    seen.add(pattern);

    const requireReview = candidate.require_review ?? true;
    const requiredApprovals = candidate.required_approvals ?? 1;
    if (requiredApprovals < 0) {
      return Result.err(new Error(`${PROTECTED_BOOKMARKS_FILE_PATH}: protected_bookmarks.required_approvals must be >= 0`));
    }

    const checksResult = normalizeOptionalTrimmedList(candidate.required_checks ?? [], false);
    if (Result.isError(checksResult)) {
      return Result.err(new Error(`${PROTECTED_BOOKMARKS_FILE_PATH}: protected_bookmarks.required_checks: ${checksResult.error.message}`));
    }

    const dismissStaleReviews = candidate.dismiss_stale_reviews ?? false;

    let restrictPushTeams: string[] = [];
    if (candidate.restrict_push?.teams) {
      const teamsResult = normalizeOptionalTrimmedList(candidate.restrict_push.teams, false);
      if (Result.isError(teamsResult)) {
        return Result.err(new Error(`${PROTECTED_BOOKMARKS_FILE_PATH}: protected_bookmarks.restrict_push.teams: ${teamsResult.error.message}`));
      }
      restrictPushTeams = teamsResult.value;
    }

    rules.push({
      pattern,
      require_review: requireReview,
      required_approvals: requiredApprovals,
      required_checks: checksResult.value.length > 0 ? checksResult.value : [],
      dismiss_stale_reviews: dismissStaleReviews,
      restrict_push_teams: restrictPushTeams,
    });
  }

  rules.sort((a, b) => a.pattern.localeCompare(b.pattern));
  return Result.ok(rules);
}

function parseLabelsFile(content: string): Result<LabelDefinition[], Error> {
  if (content.trim() === "") {
    return Result.ok([]);
  }

  const decoded = decodeYAMLStrict<RawLabelsFile>(LABELS_FILE_PATH, content);
  if (Result.isError(decoded)) return decoded;
  const raw = decoded.value;

  if (!raw.labels) {
    return Result.err(new Error(`${LABELS_FILE_PATH}: labels is required`));
  }

  const labels: LabelDefinition[] = [];
  const seen = new Set<string>();

  for (const label of raw.labels) {
    const name = (label.name ?? "").trim();
    if (name === "") {
      return Result.err(new Error(`${LABELS_FILE_PATH}: labels.name is required`));
    }
    if (name.length > 255) {
      return Result.err(new Error(`${LABELS_FILE_PATH}: labels.name is invalid`));
    }
    if (seen.has(name)) {
      return Result.err(new Error(`${LABELS_FILE_PATH}: duplicate label "${name}"`));
    }
    seen.add(name);

    const colorResult = normalizeLabelColor(label.color ?? "");
    if (Result.isError(colorResult)) {
      return Result.err(new Error(`${LABELS_FILE_PATH}: ${colorResult.error.message}`));
    }

    labels.push({
      name,
      color: colorResult.value,
      description: label.description ?? "",
    });
  }

  labels.sort((a, b) => a.name.localeCompare(b.name));
  return Result.ok(labels);
}

function parseWebhooksFile(content: string): Result<WebhookDefinition[], Error> {
  if (content.trim() === "") {
    return Result.ok([]);
  }

  const decoded = decodeYAMLStrict<RawWebhooksFile>(WEBHOOKS_FILE_PATH, content);
  if (Result.isError(decoded)) return decoded;
  const raw = decoded.value;

  if (!raw.webhooks) {
    return Result.err(new Error(`${WEBHOOKS_FILE_PATH}: webhooks is required`));
  }

  const webhooks: WebhookDefinition[] = [];
  const seen = new Set<string>();

  for (const hook of raw.webhooks) {
    const urlValue = (hook.url ?? "").trim();
    if (urlValue === "") {
      return Result.err(new Error(`${WEBHOOKS_FILE_PATH}: webhooks.url is required`));
    }
    if (!urlValue.toLowerCase().startsWith("https://")) {
      return Result.err(new Error(`${WEBHOOKS_FILE_PATH}: webhooks.url must use https`));
    }
    try {
      new URL(urlValue);
    } catch {
      return Result.err(new Error(`${WEBHOOKS_FILE_PATH}: webhooks.url must be a valid URL`));
    }
    if (seen.has(urlValue)) {
      return Result.err(new Error(`${WEBHOOKS_FILE_PATH}: duplicate webhook url "${urlValue}"`));
    }
    seen.add(urlValue);

    const eventsResult = normalizeOptionalTrimmedList(hook.events ?? [], true);
    if (Result.isError(eventsResult)) {
      return Result.err(new Error(`${WEBHOOKS_FILE_PATH}: webhooks.events: ${eventsResult.error.message}`));
    }
    if (eventsResult.value.length === 0) {
      return Result.err(new Error(`${WEBHOOKS_FILE_PATH}: webhooks.events must contain at least one event`));
    }

    let secretRef = "";
    if (hook.secret !== undefined) {
      secretRef = hook.secret.trim();
      if (secretRef !== "" && !SECRET_REF_PATTERN.test(secretRef)) {
        return Result.err(new Error(`${WEBHOOKS_FILE_PATH}: webhooks.secret must use \${{ secrets.NAME }} syntax`));
      }
    }

    const active = hook.active ?? true;

    webhooks.push({
      url: urlValue,
      events: eventsResult.value,
      secret: secretRef,
      active,
    });
  }

  webhooks.sort((a, b) => a.url.localeCompare(b.url));
  return Result.ok(webhooks);
}

// ---------------------------------------------------------------------------
// Normalization helpers — matching Go's parser helpers
// ---------------------------------------------------------------------------

function normalizeOptionalTopics(topics: string[]): Result<string[], Error> {
  if (topics.length === 0) {
    return Result.ok([]);
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const topic of topics) {
    const candidate = topic.trim().toLowerCase();
    if (!CONFIG_REPO_TOPIC_REGEX.test(candidate)) {
      return Result.err(new Error(`repository.topics contains invalid topic "${topic}"`));
    }
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }
  normalized.sort();
  return Result.ok(normalized);
}

function normalizeOptionalTrimmedList(
  values: string[],
  lower: boolean,
): Result<string[], Error> {
  if (values.length === 0) {
    return Result.ok([]);
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    let candidate = value.trim();
    if (lower) {
      candidate = candidate.toLowerCase();
    }
    if (candidate === "") {
      return Result.err(new Error("values must not contain blanks"));
    }
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }
  normalized.sort();
  return Result.ok(normalized);
}

function normalizeLabelColor(raw: string): Result<string, Error> {
  let color = raw.trim().toLowerCase();
  if (color === "") {
    return Result.err(new Error("labels.color is required"));
  }
  color = color.replace(/^#/, "");
  if (color.length !== 6) {
    return Result.err(new Error("labels.color is invalid"));
  }
  for (const ch of color) {
    if (!((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f"))) {
      return Result.err(new Error("labels.color is invalid"));
    }
  }
  return Result.ok("#" + color);
}

// ---------------------------------------------------------------------------
// ConfigSyncService — matching Go's configsync/service.go
// ---------------------------------------------------------------------------

export class ConfigSyncService {
  private sql: Sql;
  private repoHost: RepoHostService;
  private secretCodec: SecretCodec;

  constructor(sql: Sql, repoHost: RepoHostService, secretCodec?: SecretCodec) {
    this.sql = sql;
    this.repoHost = repoHost;
    // Default to NoopSecretCodec if none provided
    this.secretCodec = secretCodec ?? {
      async encryptString(plaintext: string) { return plaintext; },
      async decryptString(ciphertext: string) { return ciphertext; },
    };
  }

  /**
   * Load and parse .jjhub/ config files from a specific commit/change.
   * Matches Go's Service.LoadParsedConfigFromCommit.
   */
  async loadParsedConfigFromCommit(
    repositoryId: string,
    owner: string,
    repoName: string,
    commitSHA: string,
  ): Promise<Result<ParsedConfig, Error>> {
    if (!repositoryId || repositoryId === "0") {
      return Result.err(new Error("repository id must be positive"));
    }
    if (commitSHA.trim() === "") {
      return Result.err(new Error("commit sha is required"));
    }

    // List files under .jjhub/ at the given revision
    const listResult = await this.repoHost.getChangeFiles(owner, repoName, commitSHA);
    if (Result.isError(listResult)) {
      return Result.err(new Error(`list .jjhub files: ${listResult.error.message}`));
    }

    // We need to check which config files exist at this revision.
    // getChangeFiles returns changed files; instead we need to attempt
    // reading each known config file directly.
    const files = new Map<string, string>();
    const knownPaths = [
      CONFIG_FILE_PATH,
      PROTECTED_BOOKMARKS_FILE_PATH,
      LABELS_FILE_PATH,
      WEBHOOKS_FILE_PATH,
    ];

    for (const filePath of knownPaths) {
      const fileResult = await this.repoHost.getFileAtChange(
        owner,
        repoName,
        commitSHA,
        filePath,
      );
      if (Result.isError(fileResult)) {
        // File not found is expected — skip silently
        if (fileResult.error.message.includes("not found")) {
          continue;
        }
        return Result.err(new Error(`read ${filePath}: ${fileResult.error.message}`));
      }
      files.set(filePath, fileResult.value.content);
    }

    return parseConfigFiles(files);
  }

  /**
   * Full sync flow: load config from commit, build plan, apply.
   * Matches Go's Service.SyncFromCommit.
   */
  async syncFromCommit(
    input: SyncInput,
    owner: string,
    repoName: string,
  ): Promise<Result<SyncResult, Error>> {
    const parsedResult = await this.loadParsedConfigFromCommit(
      input.repositoryId,
      owner,
      repoName,
      input.commitSHA,
    );
    if (Result.isError(parsedResult)) {
      await this.logFailure(input, parsedResult.error, "");
      return parsedResult;
    }
    return this.syncParsedConfig(input, parsedResult.value);
  }

  /**
   * Sync from an already-parsed config. Builds a plan, optionally applies it.
   * Matches Go's Service.SyncParsedConfig.
   */
  async syncParsedConfig(
    input: SyncInput,
    parsed: ParsedConfig,
  ): Promise<Result<SyncResult, Error>> {
    const result: SyncResult = {
      dryRun: input.dryRun,
      filesProcessed: filesProcessed(parsed),
      changes: [],
      warnings: [],
    };

    // Load the repository
    const repository = await getRepoByID(this.sql, { id: input.repositoryId });
    if (!repository) {
      const err = new Error("load repository: not found");
      await this.logFailure(input, err, "");
      return Result.err(err);
    }

    // Build plan
    const planResult = await this.buildPlan(repository, parsed);
    if (Result.isError(planResult)) {
      await this.logFailure(input, planResult.error, repository.name);
      return planResult;
    }
    const plan = planResult.value;

    result.changes = plan.changes;
    result.warnings = plan.warnings;

    if (input.dryRun || plan.changes.length === 0) {
      await this.logAuditEvents(input, repository.name, result);
      return Result.ok(result);
    }

    // Apply the plan (using sql transactions via BEGIN)
    try {
      await this.sql.begin(async (tx) => {
        await applyPlan(tx, plan);
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.logFailure(input, error, repository.name);
      return Result.err(new Error(`apply config sync: ${error.message}`));
    }

    await this.logAuditEvents(input, repository.name, result);
    return Result.ok(result);
  }

  /**
   * Build a reconciliation plan by comparing parsed config with DB state.
   * Matches Go's Service.buildPlan.
   */
  private async buildPlan(
    repository: GetRepoByIDRow,
    parsed: ParsedConfig,
  ): Promise<Result<SyncPlan, Error>> {
    const plan: SyncPlan = {
      repoUpdate: null,
      bookmarksUpsert: [],
      bookmarksDelete: [],
      labelsCreate: [],
      labelsUpdate: [],
      labelsDelete: [],
      webhooksCreate: [],
      webhooksUpdate: [],
      webhooksDelete: [],
      changes: [],
      warnings: [],
    };

    // Config file -> repo settings
    if (parsed.configFilePresent) {
      const { update, changes } = buildRepoUpdate(repository, parsed.config);
      plan.repoUpdate = update;
      plan.changes.push(...changes);
    }

    // Protected bookmarks
    if (parsed.protectedBookmarksFilePresent) {
      const current = await listAllProtectedBookmarksByRepo(this.sql, {
        repositoryId: repository.id,
      });
      const { upsert, deletes, changes } = buildProtectedBookmarkChanges(
        repository.id,
        current,
        parsed.protectedBookmarks,
      );
      plan.bookmarksUpsert = upsert;
      plan.bookmarksDelete = deletes;
      plan.changes.push(...changes);
    }

    // Labels
    if (parsed.labelsFilePresent) {
      const current = await listAllLabelsByRepo(this.sql, {
        repositoryId: repository.id,
      });
      const labelResult = await this.buildLabelChanges(
        repository.id,
        current,
        parsed.labels,
      );
      if (Result.isError(labelResult)) return labelResult;
      const { create, update, del, changes, warnings } = labelResult.value;
      plan.labelsCreate = create;
      plan.labelsUpdate = update;
      plan.labelsDelete = del;
      plan.changes.push(...changes);
      plan.warnings.push(...warnings);
    }

    // Webhooks
    if (parsed.webhooksFilePresent) {
      const current = await listWebhooksByRepo(this.sql, {
        repositoryId: repository.id,
      });
      const webhookResult = await this.buildWebhookChanges(
        repository.id,
        current,
        parsed.webhooks,
      );
      if (Result.isError(webhookResult)) return webhookResult;
      const { create, update, del, changes } = webhookResult.value;
      plan.webhooksCreate = create;
      plan.webhooksUpdate = update;
      plan.webhooksDelete = del;
      plan.changes.push(...changes);
    }

    return Result.ok(plan);
  }

  /**
   * Build label changes: create, update, or delete labels to match desired state.
   * Labels attached to issues are not deleted (warning emitted instead).
   * Matches Go's Service.buildLabelChanges.
   */
  private async buildLabelChanges(
    repositoryId: string,
    current: ListAllLabelsByRepoRow[],
    desired: LabelDefinition[],
  ): Promise<Result<{
    create: CreateLabelArgs[];
    update: UpdateLabelArgs[];
    del: DeleteLabelArgs[];
    changes: ConfigChange[];
    warnings: SyncWarning[];
  }, Error>> {
    const currentByName = new Map<string, ListAllLabelsByRepoRow>();
    for (const label of current) {
      currentByName.set(label.name, label);
    }

    const creates: CreateLabelArgs[] = [];
    const updates: UpdateLabelArgs[] = [];
    const changes: ConfigChange[] = [];

    for (const label of desired) {
      const existing = currentByName.get(label.name);
      if (existing && existing.color === label.color && existing.description === label.description) {
        currentByName.delete(label.name);
        continue;
      }
      if (existing) {
        updates.push({
          repositoryId,
          id: existing.id,
          name: label.name,
          color: label.color,
          description: label.description,
        });
        changes.push({
          configType: "labels",
          identifier: label.name,
          action: "update",
          before: labelState(existing),
          after: labelDefinitionState(label),
        });
        currentByName.delete(label.name);
        continue;
      }

      creates.push({
        repositoryId,
        name: label.name,
        color: label.color,
        description: label.description,
      });
      changes.push({
        configType: "labels",
        identifier: label.name,
        action: "create",
        after: labelDefinitionState(label),
      });
    }

    const deletes: DeleteLabelArgs[] = [];
    const warnings: SyncWarning[] = [];
    for (const [name, label] of currentByName) {
      const refCountRow = await countIssueLabelsByLabel(this.sql, { labelId: label.id });
      const refCount = refCountRow ? Number(refCountRow.count) : 0;
      if (refCount > 0) {
        warnings.push({
          configType: "labels",
          identifier: name,
          message: "label is still attached to issues and was left in place",
        });
        continue;
      }
      deletes.push({
        repositoryId,
        id: label.id,
      });
      changes.push({
        configType: "labels",
        identifier: name,
        action: "delete",
        before: labelState(label),
      });
    }

    return Result.ok({ create: creates, update: updates, del: deletes, changes, warnings });
  }

  /**
   * Build webhook changes: create, update, or delete webhooks to match desired state.
   * Resolves ${{ secrets.NAME }} references against repository secrets.
   * Matches Go's Service.buildWebhookChanges.
   */
  private async buildWebhookChanges(
    repositoryId: string,
    current: ListWebhooksByRepoRow[],
    desired: WebhookDefinition[],
  ): Promise<Result<{
    create: CreateWebhookArgs[];
    update: UpdateWebhookByIDArgs[];
    del: DeleteWebhookByIDArgs[];
    changes: ConfigChange[];
  }, Error>> {
    const currentByURL = new Map<string, ListWebhooksByRepoRow>();
    for (const hook of current) {
      currentByURL.set(hook.url, hook);
    }

    const creates: CreateWebhookArgs[] = [];
    const updates: UpdateWebhookByIDArgs[] = [];
    const changes: ConfigChange[] = [];

    for (const hook of desired) {
      // Resolve secret reference
      const resolvedSecretResult = await this.resolveSecretReference(repositoryId, hook.secret);
      if (Result.isError(resolvedSecretResult)) return resolvedSecretResult;
      const resolvedSecret = resolvedSecretResult.value;

      let encryptedSecret: string;
      try {
        encryptedSecret = await this.secretCodec.encryptString(resolvedSecret);
      } catch (err) {
        return Result.err(new Error(`encrypt webhook secret for ${hook.url}: ${err instanceof Error ? err.message : String(err)}`));
      }

      const existing = currentByURL.get(hook.url);
      if (existing) {
        let existingDecryptedSecret: string;
        try {
          existingDecryptedSecret = await this.secretCodec.decryptString(existing.secret);
        } catch (err) {
          return Result.err(new Error(`decrypt existing webhook secret for ${hook.url}: ${err instanceof Error ? err.message : String(err)}`));
        }

        if (
          existingDecryptedSecret === resolvedSecret &&
          existing.isActive === hook.active &&
          arraysEqual(existing.events, hook.events)
        ) {
          currentByURL.delete(hook.url);
          continue;
        }

        updates.push({
          repositoryId,
          id: existing.id,
          url: hook.url,
          secret: encryptedSecret,
          events: hook.events,
          isActive: hook.active,
        });
        changes.push({
          configType: "webhooks",
          identifier: hook.url,
          action: "update",
          before: webhookState(existing),
          after: webhookDefinitionState(hook),
        });
        currentByURL.delete(hook.url);
        continue;
      }

      creates.push({
        repositoryId,
        url: hook.url,
        secret: encryptedSecret,
        events: hook.events,
        isActive: hook.active,
      });
      changes.push({
        configType: "webhooks",
        identifier: hook.url,
        action: "create",
        after: webhookDefinitionState(hook),
      });
    }

    const deletes: DeleteWebhookByIDArgs[] = [];
    for (const [urlValue, hook] of currentByURL) {
      deletes.push({
        repositoryId,
        id: hook.id,
      });
      changes.push({
        configType: "webhooks",
        identifier: urlValue,
        action: "delete",
        before: webhookState(hook),
      });
    }

    return Result.ok({ create: creates, update: updates, del: deletes, changes });
  }

  /**
   * Resolve a ${{ secrets.NAME }} reference to the actual secret value.
   * Matches Go's Service.resolveSecretReference.
   */
  private async resolveSecretReference(
    repositoryId: string,
    expression: string,
  ): Promise<Result<string, Error>> {
    if (expression.trim() === "") {
      return Result.ok("");
    }

    const matches = SECRET_REF_PATTERN.exec(expression);
    if (!matches || matches.length !== 2) {
      return Result.err(new Error(`webhook secret reference "${expression}" is invalid`));
    }

    const secretName = matches[1]!;
    const secretRow = await getSecretValueByName(this.sql, {
      repositoryId,
      name: secretName,
    });
    if (!secretRow) {
      return Result.err(new Error(`resolve repository secret ${secretName}: not found`));
    }

    try {
      const decrypted = await this.secretCodec.decryptString(secretRow.valueEncrypted.toString());
      return Result.ok(decrypted);
    } catch (err) {
      return Result.err(new Error(`resolve repository secret ${secretName}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  /**
   * Log audit events for all changes in a sync result.
   * Matches Go's Service.logAuditEvents.
   */
  private async logAuditEvents(
    input: SyncInput,
    repoName: string,
    result: SyncResult,
  ): Promise<void> {
    if (result.changes.length === 0) return;

    const actorName = input.actorName.trim() || "system";
    const action = input.dryRun ? "dry_run" : "apply";

    for (const change of result.changes) {
      try {
        await insertAuditLog(this.sql, {
          eventType: "config.sync",
          actorId: input.actorId ?? null,
          actorName,
          targetType: change.configType,
          targetId: input.repositoryId,
          targetName: repoName,
          action,
          metadata: {
            commit_sha: input.commitSHA,
            triggered_by: input.trigger,
            identifier: change.identifier,
            change_action: change.action,
            before: change.before,
            after: change.after,
            files_processed: result.filesProcessed,
          },
          ipAddress: input.ipAddress,
        });
      } catch {
        // Audit logging failures should not block the sync
      }
    }
  }

  /**
   * Log a sync failure as an audit event.
   * Matches Go's Service.logFailure.
   */
  private async logFailure(
    input: SyncInput,
    err: Error,
    repoName: string,
  ): Promise<void> {
    const actorName = input.actorName.trim() || "system";

    try {
      await insertAuditLog(this.sql, {
        eventType: "config.sync",
        actorId: input.actorId ?? null,
        actorName,
        targetType: "repository",
        targetId: input.repositoryId || null,
        targetName: repoName,
        action: "failed",
        metadata: {
          commit_sha: input.commitSHA,
          triggered_by: input.trigger,
          error: err.message,
        },
        ipAddress: input.ipAddress,
      });
    } catch {
      // Audit logging failures should not block error propagation
    }
  }
}

// ---------------------------------------------------------------------------
// Plan building helpers — matching Go's buildRepoUpdate etc.
// ---------------------------------------------------------------------------

function buildRepoUpdate(
  repository: GetRepoByIDRow,
  cfg: ConfigFile,
): { update: UpdateRepoConfigStateArgs | null; changes: ConfigChange[] } {
  const current = repoConfigSnapshotFromRepository(repository);
  const desired = { ...current, topics: [...current.topics], workspaceDependencies: [...current.workspaceDependencies], landingQueueRequiredChecks: [...current.landingQueueRequiredChecks] };
  const changes: ConfigChange[] = [];

  if (cfg.repository) {
    if (cfg.repository.description !== undefined && desired.description !== cfg.repository.description) {
      changes.push({
        configType: "config",
        identifier: "repository.description",
        action: "update",
        before: desired.description,
        after: cfg.repository.description,
      });
      desired.description = cfg.repository.description;
    }

    if (cfg.repository.visibility !== undefined) {
      const isPublic = cfg.repository.visibility === "public";
      if (desired.isPublic !== isPublic) {
        changes.push({
          configType: "config",
          identifier: "repository.visibility",
          action: "update",
          before: visibilityLabel(desired.isPublic),
          after: cfg.repository.visibility,
        });
        desired.isPublic = isPublic;
      }
    }

    if (cfg.repository.topics !== undefined && !arraysEqual(desired.topics, cfg.repository.topics)) {
      changes.push({
        configType: "config",
        identifier: "repository.topics",
        action: "update",
        before: desired.topics,
        after: cfg.repository.topics,
      });
      desired.topics = [...cfg.repository.topics];
    }

    if (cfg.repository.mirror) {
      let updatedMirrorEnabled = desired.isMirror;
      let updatedMirrorDestination = desired.mirrorDestination;
      if (cfg.repository.mirror.enabled !== undefined) {
        updatedMirrorEnabled = cfg.repository.mirror.enabled;
        if (!updatedMirrorEnabled) {
          updatedMirrorDestination = "";
        }
      }
      if (cfg.repository.mirror.destination !== undefined) {
        updatedMirrorDestination = cfg.repository.mirror.destination;
      }
      if (desired.isMirror !== updatedMirrorEnabled || desired.mirrorDestination !== updatedMirrorDestination) {
        changes.push({
          configType: "config",
          identifier: "repository.mirror",
          action: "update",
          before: {
            enabled: desired.isMirror,
            destination: desired.mirrorDestination,
          },
          after: {
            enabled: updatedMirrorEnabled,
            destination: updatedMirrorDestination,
          },
        });
        desired.isMirror = updatedMirrorEnabled;
        desired.mirrorDestination = updatedMirrorDestination;
      }
    }
  }

  if (cfg.workspace) {
    if (cfg.workspace.idle_timeout_seconds !== undefined && desired.workspaceIdleTimeoutSecs !== cfg.workspace.idle_timeout_seconds) {
      changes.push({
        configType: "config",
        identifier: "workspace.idle_timeout_seconds",
        action: "update",
        before: desired.workspaceIdleTimeoutSecs,
        after: cfg.workspace.idle_timeout_seconds,
      });
      desired.workspaceIdleTimeoutSecs = cfg.workspace.idle_timeout_seconds;
    }
    if (cfg.workspace.persistence !== undefined && desired.workspacePersistence !== cfg.workspace.persistence) {
      changes.push({
        configType: "config",
        identifier: "workspace.persistence",
        action: "update",
        before: desired.workspacePersistence,
        after: cfg.workspace.persistence,
      });
      desired.workspacePersistence = cfg.workspace.persistence;
    }
    if (cfg.workspace.dependencies !== undefined && !arraysEqual(desired.workspaceDependencies, cfg.workspace.dependencies)) {
      changes.push({
        configType: "config",
        identifier: "workspace.dependencies",
        action: "update",
        before: desired.workspaceDependencies,
        after: cfg.workspace.dependencies,
      });
      desired.workspaceDependencies = [...cfg.workspace.dependencies];
    }
  }

  if (cfg.landing_queue) {
    if (cfg.landing_queue.mode !== undefined && desired.landingQueueMode !== cfg.landing_queue.mode) {
      changes.push({
        configType: "config",
        identifier: "landing_queue.mode",
        action: "update",
        before: desired.landingQueueMode,
        after: cfg.landing_queue.mode,
      });
      desired.landingQueueMode = cfg.landing_queue.mode;
    }
    if (cfg.landing_queue.required_checks !== undefined && !arraysEqual(desired.landingQueueRequiredChecks, cfg.landing_queue.required_checks)) {
      changes.push({
        configType: "config",
        identifier: "landing_queue.required_checks",
        action: "update",
        before: desired.landingQueueRequiredChecks,
        after: cfg.landing_queue.required_checks,
      });
      desired.landingQueueRequiredChecks = [...cfg.landing_queue.required_checks];
    }
  }

  if (changes.length === 0) {
    return { update: null, changes: [] };
  }

  return {
    update: {
      id: repository.id,
      description: desired.description,
      isPublic: desired.isPublic,
      topics: desired.topics,
      isMirror: desired.isMirror,
      mirrorDestination: desired.mirrorDestination,
      workspaceIdleTimeoutSecs: desired.workspaceIdleTimeoutSecs,
      workspacePersistence: desired.workspacePersistence,
      workspaceDependencies: desired.workspaceDependencies,
      landingQueueMode: desired.landingQueueMode,
      landingQueueRequiredChecks: desired.landingQueueRequiredChecks,
    },
    changes,
  };
}

function buildProtectedBookmarkChanges(
  repositoryId: string,
  current: ListAllProtectedBookmarksByRepoRow[],
  desired: ProtectedBookmarkRule[],
): {
  upsert: UpsertProtectedBookmarkArgs[];
  deletes: DeleteProtectedBookmarkByPatternArgs[];
  changes: ConfigChange[];
} {
  const currentByPattern = new Map<string, ListAllProtectedBookmarksByRepoRow>();
  for (const bookmark of current) {
    currentByPattern.set(bookmark.pattern, bookmark);
  }

  const upsert: UpsertProtectedBookmarkArgs[] = [];
  const changes: ConfigChange[] = [];

  for (const bookmark of desired) {
    const existing = currentByPattern.get(bookmark.pattern);
    if (existing && protectedBookmarkEqual(existing, bookmark)) {
      currentByPattern.delete(bookmark.pattern);
      continue;
    }

    upsert.push({
      repositoryId,
      pattern: bookmark.pattern,
      requireReview: bookmark.require_review,
      requiredApprovals: String(bookmark.required_approvals),
      requiredChecks: bookmark.required_checks,
      requireStatusChecks: false,
      requiredStatusContexts: [],
      dismissStaleReviews: bookmark.dismiss_stale_reviews,
      restrictPushTeams: bookmark.restrict_push_teams,
    });

    const action = existing ? "update" : "create";
    const before = existing ? protectedBookmarkDbState(existing) : undefined;
    changes.push({
      configType: "protected_bookmarks",
      identifier: bookmark.pattern,
      action,
      before,
      after: protectedBookmarkRuleState(bookmark),
    });
    if (existing) {
      currentByPattern.delete(bookmark.pattern);
    }
  }

  const deletes: DeleteProtectedBookmarkByPatternArgs[] = [];
  for (const [pattern, bookmark] of currentByPattern) {
    deletes.push({
      repositoryId,
      pattern,
    });
    changes.push({
      configType: "protected_bookmarks",
      identifier: pattern,
      action: "delete",
      before: protectedBookmarkDbState(bookmark),
    });
  }

  return { upsert, deletes, changes };
}

// ---------------------------------------------------------------------------
// Plan application — matching Go's applyPlan
// ---------------------------------------------------------------------------

async function applyPlan(sql: Sql, plan: SyncPlan): Promise<void> {
  if (plan.repoUpdate) {
    const updated = await updateRepoConfigState(sql, plan.repoUpdate);
    if (!updated) {
      throw new Error("update repository config: repository not found");
    }
  }

  for (const arg of plan.bookmarksUpsert) {
    const result = await upsertProtectedBookmark(sql, arg);
    if (!result) {
      throw new Error(`upsert protected bookmark ${arg.pattern}: failed`);
    }
  }
  for (const arg of plan.bookmarksDelete) {
    await sql.unsafe(deleteProtectedBookmarkByPatternQuery, [arg.repositoryId, arg.pattern]);
  }

  for (const arg of plan.labelsCreate) {
    const result = await createLabel(sql, arg);
    if (!result) {
      throw new Error(`create label ${arg.name}: failed`);
    }
  }
  for (const arg of plan.labelsUpdate) {
    const result = await updateLabel(sql, arg);
    if (!result) {
      throw new Error(`update label ${arg.name}: failed`);
    }
  }
  for (const arg of plan.labelsDelete) {
    await deleteLabel(sql, arg);
  }

  for (const arg of plan.webhooksCreate) {
    const result = await createWebhook(sql, arg);
    if (!result) {
      throw new Error(`create webhook ${arg.url}: failed`);
    }
  }
  for (const arg of plan.webhooksUpdate) {
    const result = await updateWebhookByID(sql, arg);
    if (!result) {
      throw new Error(`update webhook ${arg.url}: failed`);
    }
  }
  for (const arg of plan.webhooksDelete) {
    await deleteWebhookByID(sql, arg);
  }
}

// ---------------------------------------------------------------------------
// State snapshot helpers — matching Go's helper functions
// ---------------------------------------------------------------------------

function repoConfigSnapshotFromRepository(repository: GetRepoByIDRow): RepoConfigSnapshot {
  return {
    description: repository.description,
    isPublic: repository.isPublic,
    topics: [...(repository.topics ?? [])],
    isMirror: repository.isMirror,
    mirrorDestination: repository.mirrorDestination,
    workspaceIdleTimeoutSecs: repository.workspaceIdleTimeoutSecs,
    workspacePersistence: repository.workspacePersistence,
    workspaceDependencies: [...(repository.workspaceDependencies ?? [])],
    landingQueueMode: repository.landingQueueMode,
    landingQueueRequiredChecks: [...(repository.landingQueueRequiredChecks ?? [])],
  };
}

function protectedBookmarkEqual(
  current: ListAllProtectedBookmarksByRepoRow,
  desired: ProtectedBookmarkRule,
): boolean {
  return (
    current.requireReview === desired.require_review &&
    String(current.requiredApprovals) === String(desired.required_approvals) &&
    current.dismissStaleReviews === desired.dismiss_stale_reviews &&
    arraysEqual(current.requiredChecks, desired.required_checks) &&
    arraysEqual(current.restrictPushTeams, desired.restrict_push_teams)
  );
}

function visibilityLabel(isPublic: boolean): string {
  return isPublic ? "public" : "private";
}

function filesProcessed(parsed: ParsedConfig): string[] {
  const result: string[] = [];
  if (parsed.configFilePresent) result.push(CONFIG_FILE_PATH);
  if (parsed.protectedBookmarksFilePresent) result.push(PROTECTED_BOOKMARKS_FILE_PATH);
  if (parsed.labelsFilePresent) result.push(LABELS_FILE_PATH);
  if (parsed.webhooksFilePresent) result.push(WEBHOOKS_FILE_PATH);
  return result;
}

function protectedBookmarkDbState(bookmark: ListAllProtectedBookmarksByRepoRow): Record<string, any> {
  return {
    require_review: bookmark.requireReview,
    required_approvals: Number(bookmark.requiredApprovals),
    required_checks: [...(bookmark.requiredChecks ?? [])],
    dismiss_stale_reviews: bookmark.dismissStaleReviews,
    restrict_push_teams: [...(bookmark.restrictPushTeams ?? [])],
  };
}

function protectedBookmarkRuleState(bookmark: ProtectedBookmarkRule): Record<string, any> {
  return {
    require_review: bookmark.require_review,
    required_approvals: bookmark.required_approvals,
    required_checks: [...bookmark.required_checks],
    dismiss_stale_reviews: bookmark.dismiss_stale_reviews,
    restrict_push_teams: [...bookmark.restrict_push_teams],
  };
}

function labelState(label: ListAllLabelsByRepoRow): Record<string, any> {
  return {
    color: label.color,
    description: label.description,
  };
}

function labelDefinitionState(label: LabelDefinition): Record<string, any> {
  return {
    color: label.color,
    description: label.description,
  };
}

function webhookState(webhookRecord: ListWebhooksByRepoRow): Record<string, any> {
  return {
    events: [...(webhookRecord.events ?? [])],
    active: webhookRecord.isActive,
    has_secret: webhookRecord.secret.trim() !== "",
  };
}

function webhookDefinitionState(webhookDef: WebhookDefinition): Record<string, any> {
  return {
    events: [...webhookDef.events],
    active: webhookDef.active,
    secret_ref: webhookDef.secret,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createConfigSyncService(
  sql: Sql,
  repoHost: RepoHostService,
  secretCodec?: SecretCodec,
): ConfigSyncService {
  return new ConfigSyncService(sql, repoHost, secretCodec);
}
