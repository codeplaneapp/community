import type { HookError as CoreHookError } from "@codeplane/ui-core/src/types/errors.js";

// ---- Domain models (match API response shapes) ----

export interface WorkflowDefinition {
  id: number;
  repository_id: number;
  name: string;
  path: string;
  config: unknown; // WorkflowTriggerConfig — opaque to hooks, parsed by screens
  is_active: boolean;
  created_at: string; // ISO 8601
  updated_at: string;
}

export interface WorkflowRun {
  id: number;
  repository_id: number;
  workflow_definition_id: number;
  status: WorkflowRunStatus;
  trigger_event: string;
  trigger_ref: string;
  trigger_commit_sha: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Enriched fields from v2 endpoint:
  workflow_name?: string;
  workflow_path?: string;
}

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "success"
  | "failure"
  | "cancelled"
  | "error";

export const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set([
  "success",
  "failure",
  "cancelled",
  "error",
]);

export interface WorkflowRunNode {
  id: string;
  step_id: number;
  name: string;
  position: number;
  status: string;
  iteration: number;
  started_at: string | null;
  completed_at: string | null;
  duration: string;
  duration_seconds: number;
}

export interface WorkflowRunDetailResponse {
  run: WorkflowRun;
  workflow: {
    id: number;
    name: string;
    path: string;
  };
  nodes: WorkflowRunNode[];
  mermaid: string;
  plan_xml: string;
}

export interface WorkflowArtifact {
  id: number;
  repository_id: number;
  workflow_run_id: number;
  name: string;
  size: number;
  content_type: string;
  status: "pending" | "ready";
  gcs_key: string;
  confirmed_at: string | null;
  expires_at: string | null;
  release_tag: string | null;
  release_asset_name: string | null;
  release_attached_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCache {
  id: number;
  repository_id: number;
  workflow_run_id: number | null;
  bookmark_name: string;
  cache_key: string;
  cache_version: string;
  object_key: string;
  object_size_bytes: number;
  compression: string;
  status: "pending" | "finalized";
  hit_count: number;
  last_hit_at: string | null;
  finalized_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCacheStats {
  total_count: number;
  total_size_bytes: number;
}

export interface WorkflowRunResult {
  workflow_definition_id: number;
  workflow_run_id: number;
  steps: Array<{ step_id: string; task_id: string }>;
}

// ---- Hook return types ----

export type HookError = CoreHookError;

export interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: HookError | null;
  refetch: () => void;
}

export interface PaginatedQueryResult<T> {
  data: T[];
  loading: boolean;
  error: HookError | null;
  loadMore: () => void;
  hasMore: boolean;
  totalCount: number;
  refetch: () => void;
}

export interface MutationResult<TInput, TOutput = void> {
  execute: (input: TInput) => Promise<TOutput>;
  loading: boolean;
  error: HookError | null;
  reset: () => void;
}

export interface RepoIdentifier {
  owner: string;
  repo: string;
}

// ---- Filter types ----

export interface WorkflowRunFilters {
  state?: string;           // Server-side filter: queued, running, success, failure, cancelled, finished
  definition_id?: number;   // Filter by specific workflow definition
  page?: number;            // Page number (1-based)
  per_page?: number;        // Items per page (default 30, max 100)
}

export interface WorkflowCacheFilters {
  bookmark?: string;
  key?: string;
  page?: number;
  per_page?: number;
}

export const MAX_DEFINITIONS = 300;
export const MAX_RUNS = 500;
export const MAX_ARTIFACTS = 200;
export const MAX_CACHES = 500;
