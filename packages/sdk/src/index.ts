// @jjhub/sdk — JJHub TypeScript SDK
//
// This package is the core of JJHub Community Edition.
// It provides type-safe access to all JJHub operations:
// auth, repos, issues, landings, workflows, workspaces, and more.
//
// The Hono server (apps/server) is a thin HTTP wrapper around this SDK.
// The CLI can also import this SDK directly for local operations.

// Database
export { initDb, initDbSync, getDb, closeDb, getDbMode } from "./lib/db";
export { getAuthInfoByTokenHash } from "./db/users_sql";
export {
  getAuthSessionBySessionKey,
  updateAccessTokenLastUsed,
} from "./db/auth_sql";

// Errors
export { APIError, type FieldError } from "./lib/errors";
export {
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  internal,
  validationFailed,
  unsupportedMediaType,
  writeError,
  writeJSON,
  writeRouteError,
} from "./lib/errors";

// Blob storage
export { type BlobStore, getBlobStore, createBlobStore } from "./lib/blob";

// Context
export {
  type AuthUser,
  type AuthInfo,
  AUTH_INFO_KEY,
  USER_KEY,
  getAuthInfo,
  getUser,
} from "./lib/context";

// Pagination
export {
  parsePagination,
  cursorToPage,
  setPaginationHeaders,
  parseInt64Param,
  requireStringParam,
  repoOwnerAndName,
} from "./lib/pagination";

// Services
export { createAuthService } from "./services/auth";
export { UserService } from "./services/user";
export { RepoService } from "./services/repo";
export { IssueService } from "./services/issue";
export { LabelService } from "./services/label";
export { MilestoneService } from "./services/milestone";
export { LandingService } from "./services/landing";
export { OrgService } from "./services/org";
export { WikiService } from "./services/wiki";
export { SearchService } from "./services/search";
export { WebhookService } from "./services/webhook";
export {
  WebhookWorker,
  createWebhookWorker,
  dispatchWebhookEvent,
} from "./services/webhook-worker";
export type { WebhookWorkerOptions, WebhookTask } from "./services/webhook-worker";
export { WorkflowService } from "./services/workflow";
export { NotificationService } from "./services/notification";
export { NotificationFanoutService, parseMentions } from "./services/notification-fanout";
export type {
  IssueAssignedEvent,
  IssueCommentedEvent,
  LRReviewedEvent,
  LRCommentedEvent,
  LRChangesPushedEvent,
  WorkspaceStatusChangedEvent,
  WorkspaceSharedEvent,
  WorkflowRunCompletedEvent,
} from "./services/notification-fanout";
export { SecretService } from "./services/secret";
export { ReleaseService } from "./services/release";
export { OAuth2Service } from "./services/oauth2";
export { LFSService } from "./services/lfs";
export {
  ConfigSyncService,
  createConfigSyncService,
  parseConfigFiles,
} from "./services/configsync";
export type {
  SyncInput as ConfigSyncInput,
  SyncResult as ConfigSyncResult,
  ConfigChange,
  SyncWarning as ConfigSyncWarning,
  ParsedConfig,
  ConfigFile,
  ProtectedBookmarkRule,
  LabelDefinition as ConfigLabelDefinition,
  WebhookDefinition as ConfigWebhookDefinition,
} from "./services/configsync";
export {
  RepoHostService,
  getRepoHostService,
  createRepoHostService,
} from "./services/repohost";
export type {
  Bookmark,
  CreateBookmarkRequest as RepoHostCreateBookmarkRequest,
  Change,
  ChangeDiff,
  FileDiffItem,
  ChangeFile,
  ChangeConflict,
  FileContent,
  Operation as RepoHostOperation,
} from "./services/repohost";
export { SSHServer, createSSHServer } from "./services/ssh-server";
export type { SSHServerConfig } from "./services/ssh-server";
export { WorkspaceService } from "./services/workspace";
export type {
  WorkspaceResponse,
  WorkspaceSessionResponse,
  WorkspaceSSHConnectionInfo,
  WorkspaceSnapshotResponse,
  CreateWorkspaceInput,
  ForkWorkspaceInput,
  CreateWorkspaceSnapshotInput,
  CreateWorkspaceSessionInput,
} from "./services/workspace";
export { PreviewService } from "./services/preview";
export type {
  PreviewStatus,
  PreviewConfig,
  PreviewResponse,
  CreatePreviewInput,
} from "./services/preview";
export { ContainerSandboxClient } from "./services/container-sandbox";
export type {
  ContainerRuntime,
  ContainerState,
  PortMapping as ContainerPortMapping,
  VolumeMount,
  CreateContainerConfig,
  CreateContainerResult,
  ContainerStatus,
  ExecResult,
  SSHConnectionInfo,
} from "./services/container-sandbox";

// SSE (Server-Sent Events backed by PostgreSQL LISTEN/NOTIFY)
export {
  SSEManager,
  formatSSEEvent,
  validateChannel,
  sseHeaders,
  sseResponse,
  sseStaticResponse,
  sseStreamWithInitial,
} from "./services/sse";
export type { SSEEvent } from "./services/sse";

// Cleanup (background workers)
export { CleanupScheduler } from "./services/cleanup";
export type {
  CleanupSchedulerConfig,
  SweepResult,
} from "./services/cleanup";

// Sync (local-first daemon mode)
export { SyncService, createSyncService } from "./services/sync";
export type {
  SyncStatus,
  SyncState,
  ShapeSubscription,
  SyncServiceConfig,
} from "./services/sync";
export { SyncQueue } from "./services/sync-queue";
export type {
  SyncQueueStatus,
  SyncQueueItem,
  FlushResult,
  RemoteCaller,
} from "./services/sync-queue";
export { IdRemapService } from "./services/id-remap";
export type {
  RemapResourceType,
  IdRemapEntry,
} from "./services/id-remap";

// Auto-push (private branch sync for daemon)
export { AutoPushService, createAutoPushService } from "./services/auto-push";
export type {
  AutoPushConfig,
  AutoPushEventType,
  AutoPushEvent,
} from "./services/auto-push";

// Billing & metering
export {
  BillingService,
  createBillingService,
  createQuotaEnforcer,
  MetricKeys,
  CreditCategories,
} from "./services/billing";
export type {
  MetricKey,
  CreditCategory,
  OwnerType as BillingOwnerType,
  BillingAccountResponse,
  CreditBalanceResponse,
  CreditLedgerEntryResponse,
  UsageResponse,
  QuotaCheckResult,
  GrantResult,
} from "./services/billing";

// Issue Pipeline (automated Research → Plan → Implement → Review → Land)
export {
  IssuePipelineService,
  createIssuePipelineTriggerHandler,
  PIPELINE_STEPS,
  DEFAULT_TRIGGER_LABEL,
} from "./services/issue-pipeline";
export type {
  PipelineStep,
  PipelineStepStatus,
  PipelineStepState,
  PipelineStatus,
  IssuePipelineConfig,
  IssuePipelineEvent,
  IssuePipelineTriggerHandler,
} from "./services/issue-pipeline";

// Feature flags
export {
  FeatureFlagService,
  getFeatureFlagService,
  createFeatureFlagService,
  DefaultFeatureFlagProvider,
} from "./services/feature-flags";
export type {
  FeatureFlagName,
  PlanTier,
  FlagDefinition,
  FlagConfig,
  FeatureFlagProvider,
} from "./services/feature-flags";
