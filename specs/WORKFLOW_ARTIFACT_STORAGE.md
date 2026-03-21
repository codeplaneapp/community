# WORKFLOW_ARTIFACT_STORAGE

Specification for WORKFLOW_ARTIFACT_STORAGE.

## High-Level User POV

## User POV

Workflow runs in Codeplane produce build outputs — compiled binaries, test coverage reports, bundled archives, container image manifests, benchmark results, documentation snapshots, and any other file a workflow step explicitly publishes. The Workflow Artifact Storage feature is the foundation that makes these outputs durable, discoverable, downloadable, and manageable across every Codeplane surface.

From a user's perspective, artifacts are the tangible outputs of CI/CD automation. When a workflow step calls `ctx.artifacts.upload('dist/bundle.zip', './dist/bundle.zip')`, the file is persisted in Codeplane's built-in blob store with a unique identity tied to the workflow run. The upload follows a two-phase lifecycle: first, the artifact record is created in `pending` status while the file bytes stream to the blob store; once the upload completes, the system confirms the artifact, transitioning it to `ready` status. This two-phase approach ensures that partially uploaded files are never served to users, and that downstream automation (such as artifact-triggered workflows) only fires on confirmed, complete uploads.

Once an artifact reaches `ready` status, it becomes visible across every Codeplane client. On the web UI, the workflow run detail page shows an Artifacts tab listing every artifact the run produced — name, size, content type, upload status, expiration countdown, and whether the artifact has been attached to a release. In the CLI, `codeplane artifact list <runId>` renders the same data in table or JSON format. In the TUI, pressing `a` on a workflow run opens a full-screen artifacts view with vim-style navigation, filtering, and sorting. In VS Code and Neovim, artifact metadata is accessible through the workflow run detail integration.

Downloading an artifact is direct and fast. The system generates a short-lived, HMAC-signed download URL that streams raw bytes to the user's browser or local filesystem. There is no intermediate packaging, no zip wrapping, and no re-encoding — whatever the workflow uploaded is exactly what the user receives, byte-for-byte, with the original content type preserved. From the CLI, `codeplane artifact download <runId> <name>` fetches the artifact to disk with automatic temp-file-then-rename to prevent partial downloads from corrupting the destination. From the TUI, pressing `D` delegates to the same CLI flow. From the web, clicking the download button triggers a browser save-as dialog via the signed URL.

Artifacts are ephemeral by default. Each artifact is created with an expiration timestamp, and a background cleanup scheduler periodically sweeps expired artifacts — deleting both the database record and the backing blob from storage. This automatic lifecycle prevents unbounded storage growth. Users who need to preserve an artifact beyond its expiration can attach it to a release, which promotes the artifact to a release asset with its own lifecycle guarantees.

Users with write access to a repository can also delete artifacts manually, immediately reclaiming storage rather than waiting for automatic expiration. Deletion is permanent and irreversible. Artifacts attached to a release cannot be deleted directly — the user must detach the artifact from the release first, reinforcing the principle that release assets are a stable product surface.

The artifact system also powers multi-stage workflow pipelines. When an artifact upload is confirmed, the system evaluates all active workflow definitions in the repository for matching `on.workflow_artifact` triggers. This enables declarative pipeline composition — for example, a build workflow produces `dist/bundle.zip`, which triggers a deploy workflow, which triggers a smoke-test workflow — all without manual intervention or monolithic workflow definitions. Each stage is an independent workflow connected by artifact triggers, and each stage only fires when the upstream stage actually produces the expected output.

For workflow authors, the TypeScript SDK provides a clean `ctx.artifacts` interface that handles upload/download transparently within workflow step execution. The blob store, signed URLs, two-phase confirmation, and trigger dispatch are all invisible to the workflow author — they simply call `upload()` and `download()` and the platform handles everything else.

This feature is the storage and lifecycle foundation that supports three adjacent features: WORKFLOW_ARTIFACT_LIST (browsing artifacts), WORKFLOW_ARTIFACT_DOWNLOAD (retrieving artifacts), and WORKFLOW_ARTIFACT_DELETE (removing artifacts). Without robust artifact storage, none of those downstream capabilities exist.

## Acceptance Criteria

## Acceptance Criteria

### Definition of Done

- [ ] Workflow steps can upload artifacts via `ctx.artifacts.upload(name, path, options?)` during execution
- [ ] Artifact records are created in `pending` status with a generated blob storage key in the format `repos/{repo_id}/runs/{run_id}/artifacts/{artifact_id}/{name}`
- [ ] Artifact file bytes are written to the local filesystem blob store under `CODEPLANE_DATA_DIR/blobs/`
- [ ] After successful blob upload, the artifact status transitions to `ready` via the confirmation endpoint and `confirmed_at` is set
- [ ] Artifacts in `ready` status are visible and downloadable across all client surfaces (API, Web, CLI, TUI)
- [ ] Artifacts in `pending` status are visible in listings but cannot be downloaded (409 Conflict)
- [ ] Artifacts in `expired` status are visible in listings but cannot be downloaded (410 Gone)
- [ ] The background cleanup scheduler prunes expired artifacts every 5 minutes (configurable), deleting both database records and backing blobs, in batches of up to 100 per sweep
- [ ] Artifacts can be attached to releases via `attachWorkflowArtifactToRelease`, setting `release_tag`, `release_asset_name`, and `release_attached_at`
- [ ] Release-attached artifacts cannot be deleted without first detaching from the release
- [ ] When an artifact is confirmed (`pending` → `ready`), the system evaluates all active workflow definitions for matching `on.workflow_artifact` triggers and dispatches new runs for matches
- [ ] Signed download URLs use HMAC-SHA256 over `key:expiresAt` with a 5-minute default expiry window
- [ ] Signed upload URLs use the same HMAC-SHA256 scheme for secure blob upload
- [ ] The `gcs_key` (internal blob storage path) is never exposed in any API response
- [ ] The blob store prevents path traversal by normalizing `..` sequences in storage keys
- [ ] The CLI `artifact list`, `artifact download`, and `artifact delete` commands operate against the artifact storage system
- [ ] The web UI workflow run detail page has a functional Artifacts tab showing all artifacts for the run
- [ ] The TUI artifacts view is fully navigable with keyboard shortcuts

### Artifact Record Constraints

- `name`: 1–255 characters. Allowed characters: alphanumeric, hyphens, underscores, dots, forward slashes. No null bytes, no `..` sequences, no leading/trailing whitespace. Case-sensitive. Unique per run (unique constraint on `workflow_run_id` + `name`)
- `size`: Non-negative bigint representing bytes. Must handle 0 bytes through 5 GB (5,368,709,120 bytes) for upload. Database field supports up to int64 max.
- `content_type`: Valid MIME type string, 1–255 characters
- `status`: Exactly one of `pending`, `ready`, `expired`. No other values permitted.
- `gcs_key`: Internal blob path, auto-generated. Format: `repos/{repo_id}/runs/{run_id}/artifacts/{artifact_id}/{name}`. Never exposed in API.
- `expires_at`: ISO 8601 timestamp. Must be in the future at creation time. Null means no expiration (not currently supported — all artifacts require an expiration).
- `confirmed_at`: Null when `pending`, ISO 8601 timestamp when `ready`
- `release_tag`: Null or valid release tag string (1–255 characters)
- `release_asset_name`: Null or valid asset name string (1–255 characters)
- `release_attached_at`: Null or ISO 8601 timestamp
- `created_at`, `updated_at`: ISO 8601 timestamps, always present, auto-managed by database

### Signed URL Constraints

- Signing secret: `CODEPLANE_BLOB_SIGNING_SECRET` environment variable, falling back to `codeplane-local-dev-secret` for development
- Token: HMAC-SHA256 of `{key}:{expiresAt}` using the signing secret, hex-encoded
- Upload URL format: `/api/blobs/upload/{encodeURIComponent(key)}?token={token}&expires={expiresAt}`
- Download URL format: `/api/blobs/download/{encodeURIComponent(key)}?token={token}&expires={expiresAt}`
- Default expiry: 5 minutes (300,000 ms)
- Expired tokens are rejected with HTTP 403
- Tampered tokens are rejected with HTTP 403
- Tokens are single-use-intent but not cryptographically single-use (repeated use within expiry window is allowed)

### Blob Store Constraints

- Storage root: `process.env.CODEPLANE_DATA_DIR ?? './data'` + `/blobs/`
- Path traversal prevention: All `..` sequences in keys are replaced with `_`
- Parent directories are created automatically on write (`mkdir -p` equivalent)
- Delete is idempotent: deleting a non-existent blob succeeds silently (no ENOENT error)
- Maximum artifact upload size: 5 GB
- Zero-byte artifacts are permitted

### Cleanup Scheduler Constraints

- Artifact sweep interval: 300,000 ms (5 minutes), configurable via `artifactIntervalMs`
- Batch size per sweep: 100 artifacts, configurable via `artifactBatchSize`
- Sweep order: `expires_at ASC, id ASC` (oldest expired first)
- Both workflow artifacts and issue artifacts are swept in the same job
- Blob deletion failures are non-fatal: database record is still deleted, blob orphan is logged as a warning
- Release-attached artifacts are subject to expiration sweep (the prune query does not exempt them — if the artifact has expired, it is pruned regardless of release attachment)

### Edge Cases

- Artifact upload interrupted before confirmation: record remains in `pending` status until expiration sweep cleans it up
- Artifact whose blob has been manually deleted from filesystem: download returns 404 from blob endpoint; the signed URL was valid but the data is gone
- Artifact name with path separators (e.g., `dist/app/bundle.js`): treated as a flat name, not a directory hierarchy. The blob key includes it as-is.
- Artifact name with URL-special characters (`%`, `+`, `#`, `?`, `&`): percent-encoded in URLs, stored as-is in database
- Artifact name with Unicode characters: percent-encoded in URLs, stored as UTF-8 in database
- Two artifacts with the same name on different runs: fully independent records and blobs
- Duplicate artifact name on the same run: creation fails with unique constraint violation
- Artifact creation during concurrent run: each artifact gets its own unique ID and blob path
- Blob store disk full (`ENOSPC`): upload fails, artifact record stays `pending`, cleanup sweep eventually removes it
- Signing secret rotation: existing signed URLs issued before rotation become invalid; new URLs use the new secret. All server instances must share the same secret.
- Clock skew between server instances: signed URL validation depends on `Date.now()`, so clock skew > expiry window causes all tokens to fail
- Artifact confirmed but trigger dispatch fails: artifact stays `ready`, missed trigger is not automatically retried
- Run with 200+ artifacts: all artifacts stored and listable; TUI caps display at 200 with footer message
- Artifact size exactly at 5 GB boundary: upload must succeed
- Artifact size at 5 GB + 1 byte: upload must be rejected with a clear error
- Empty content type string: rejected with 400
- Content type longer than 255 characters: rejected with 400
- Blob store not configured: artifact creation succeeds in database but upload/download operations are unavailable; workspace/preview features degrade gracefully

## Design

## Design

### System Architecture Overview

The artifact storage system spans four layers:

1. **Blob Store** — Local filesystem storage with HMAC-signed URLs (`packages/sdk/src/lib/blob.ts`)
2. **Database Layer** — Artifact records with lifecycle state tracking (`packages/sdk/src/db/workflow_artifacts_sql.ts`)
3. **Service Layer** — Business logic for creation, confirmation, download, deletion, cleanup, and trigger dispatch (`packages/sdk/src/services/workflow.ts`, `packages/sdk/src/services/cleanup.ts`)
4. **Client Surfaces** — API routes, CLI commands, web components, TUI screens, workflow SDK (`apps/server`, `apps/cli`, `apps/ui`, `apps/tui`, `packages/workflow`)

### API Shape

#### Artifact Creation (Internal — Workflow Execution Context)

Artifact creation is initiated by workflow steps during execution, not by direct user API calls. The workflow execution engine:
1. Calls `createWorkflowArtifact()` with repository ID, run ID, name, size, content type, and expiration timestamp
2. Receives the created record (status: `pending`) with the generated `gcs_key`
3. Generates a signed upload URL via `blobStore.generateUploadURL(gcsKey, contentType, expiryMs)`
4. Uploads file bytes to the signed URL
5. Calls `confirmWorkflowArtifactUpload()` to transition status to `ready`
6. Confirmation triggers `onArtifactConfirmed()` for downstream workflow dispatch

#### Artifact List

**`GET /api/repos/:owner/:repo/actions/runs/:id/artifacts`**

Returns all artifacts for a workflow run, ordered by `created_at DESC, id DESC`.

Response: `{ artifacts: WorkflowArtifactRecord[] }` — each record includes `id`, `repository_id`, `workflow_run_id`, `name`, `size`, `content_type`, `status`, `confirmed_at`, `expires_at`, `release_tag`, `release_asset_name`, `release_attached_at`, `created_at`, `updated_at`. The `gcs_key` field is stripped from the response.

#### Artifact Download

**`GET /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name/download`**

Returns artifact metadata plus a signed `download_url` for artifacts in `ready` status.

Error states: 409 for `pending`, 410 for `expired`, 404 for not found.

#### Blob Download

**`GET /api/blobs/download/:key`**

Streams raw artifact bytes with `Content-Type`, `Content-Disposition: attachment`, and `Content-Length` headers. Validates HMAC token and expiry.

#### Blob Upload

**`PUT /api/blobs/upload/:key`**

Accepts raw bytes for blob storage. Validates HMAC token and expiry. Used by the workflow execution engine during artifact creation.

#### Artifact Delete

**`DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name`**

Deletes artifact record and backing blob. Returns 204 on success. Returns 409 if attached to a release.

#### Release Attachment

**Internal service call**: `attachWorkflowArtifactToRelease(sql, { releaseTag, releaseAssetName, workflowRunId, name })`

Sets `release_tag`, `release_asset_name`, and `release_attached_at` on the artifact record.

### SDK Shape

#### Workflow Authoring SDK (`packages/workflow/src/artifacts.ts`)

```typescript
interface WorkflowArtifactClient {
  upload(name: string, path: string, options?: { contentType?: string }): Promise<WorkflowArtifactRecord>;
  download(name: string, path: string): Promise<WorkflowArtifactRecord>;
}
```

- `setWorkflowArtifactClient(client)` — Register the platform-provided artifact client globally
- `getWorkflowArtifactClient()` — Retrieve the registered client (throws if unavailable)
- `createWorkflowArtifactHelpers()` — Factory that creates a delegating client
- `CodeplaneWorkflowCtx<Schema>` — Extended context type with `ctx.artifacts` field

Workflow authors use `ctx.artifacts.upload()` and `ctx.artifacts.download()` — the SDK handles all blob store interaction, signed URLs, and confirmation transparently.

#### Database Layer (`packages/sdk/src/db/workflow_artifacts_sql.ts`)

Operations:
- `createWorkflowArtifact(sql, args)` — Insert with status `pending`, auto-generate `gcs_key`
- `confirmWorkflowArtifactUpload(sql, args)` — Transition to `ready`, set `confirmed_at`
- `listWorkflowArtifactsByRun(sql, args)` — List all artifacts for a run
- `getWorkflowArtifactByName(sql, args)` — Lookup by run ID + name
- `deleteWorkflowArtifact(sql, args)` — Delete by run ID + name
- `deleteWorkflowArtifactByID(sql, args)` — Delete by artifact ID
- `pruneExpiredWorkflowArtifacts(sql, args)` — Batch delete expired artifacts
- `attachWorkflowArtifactToRelease(sql, args)` — Set release metadata
- `getWorkflowDefinitionNameByRunID(sql, args)` — Resolve source workflow name for trigger dispatch

### CLI Commands

**`codeplane artifact list <runId>`** — List artifacts for a workflow run (table or JSON output)

**`codeplane artifact download <runId> <name>`** — Download artifact to local filesystem
- `--output <path>` for custom destination
- Uses temp-file-then-rename pattern for atomicity
- Streams via `pipeline(Readable.fromWeb(response.body), writeStream)`

**`codeplane artifact delete <runId> <name>`** — Delete artifact with confirmation prompt
- `--yes` to skip confirmation
- Requires write access

All commands support `--repo <OWNER/REPO>` and `--json` output mode.

### Web UI Design

**Artifacts Tab** on workflow run detail page:
- Header: "Artifacts (N)" with total combined size
- Filter toolbar: Status dropdown (All/Ready/Pending/Expired), search input, sort controls
- Table columns: Status dot (green/yellow/gray), Name, Content Type, Size (human-readable), Expires (relative countdown), Release (tag badge), Created (relative)
- Row actions: Download button (ready only), Delete button (write-access, not release-attached)
- Detail drawer: Click name → side drawer with full metadata
- Empty state: "No artifacts for this run. Artifacts are produced by workflow steps using the artifacts API."
- Loading/error states with skeleton shimmer and retry button

**Confirmation Dialogs:**
- Delete: Modal with artifact name and size, Cancel/Delete buttons, spinner during API call
- Download: Toast notification "Download started: {name}"

### TUI UI

Full-screen artifacts view reached by `a` key on workflow run detail:
- Title: "Artifacts (N)" + total size
- Filter toolbar: `/` search, `f` status filter, `s` sort
- Vim navigation: `j`/`k`, `G`/`gg`, `Ctrl+D`/`Ctrl+U`
- Status icons: `●` green (ready), `◎` yellow (pending), `○` gray (expired)
- Actions: `Enter` detail overlay, `D` download, `x` delete with confirmation
- `q` pop screen
- Responsive: 80×24, 120×40, 200×60+ breakpoints
- Memory cap: 200 artifacts with footer message

### Workflow Artifact Triggers

Workflow definitions can declare `on.workflow_artifact` triggers:

```typescript
import { Workflow, Task, on } from "@codeplane/workflow";

export default (
  <Workflow
    name="deploy"
    triggers={[on.workflowArtifact({ workflows: ["build"], names: ["dist/*.zip"] })]}
  >
    <Task name="deploy" run="./deploy.sh" />
  </Workflow>
);
```

Filter options: `workflows` (case-insensitive glob), `names` (case-sensitive glob), both optional (omitted = match all), AND semantics when both specified.

Triggered runs inherit source run's ref and commit SHA, with trigger metadata showing artifact name and source workflow.

### Documentation

1. **Workflow Artifacts Overview** — What artifacts are, the two-phase lifecycle (pending → ready → expired), relationship to releases, storage and expiration model
2. **Uploading Artifacts from Workflows** — TypeScript SDK usage (`ctx.artifacts.upload()`), content type specification, size limits, naming conventions
3. **Downloading Artifacts from Workflows** — TypeScript SDK usage (`ctx.artifacts.download()`), when to use (multi-stage pipelines)
4. **Viewing Artifacts (Web/CLI/TUI)** — Navigation to artifacts tab/view, column meanings, filter/sort/search usage across all surfaces
5. **Downloading Artifacts (Web/CLI/TUI)** — Download flows per surface, output path customization, handling expired/pending states
6. **Deleting Artifacts** — Permissions, confirmation, release-attached constraint, CLI `--yes` flag for automation
7. **Artifact Expiration and Cleanup** — How automatic expiration works, cleanup scheduler timing, release-attached artifact behavior
8. **Artifact-Triggered Workflows** — `on.workflowArtifact` trigger configuration, glob patterns, multi-stage pipeline examples, chain depth considerations
9. **CLI Reference: `artifact` command group** — Full command reference for `list`, `download`, `delete`
10. **API Reference: Artifact Endpoints** — Full endpoint documentation for list, download metadata, blob download/upload, delete
11. **Troubleshooting: Artifacts** — Expired artifacts, pending uploads, signed URL expiry, partial downloads, permission denied, storage full, orphaned blobs

## Permissions & Security

## Permissions & Security

### Authorization Roles

| Action | Anonymous (Public Repo) | Anonymous (Private Repo) | Read-Only | Member (Write) | Admin | Owner |
|--------|------------------------|-------------------------|-----------|----------------|-------|-------|
| List artifacts | ✅ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| View artifact detail metadata | ✅ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Download artifact (obtain signed URL) | ✅ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Delete artifact | ❌ (401) | ❌ (404) | ❌ (403) | ✅ | ✅ | ✅ |
| Upload artifact (workflow execution) | N/A (system context) | N/A (system context) | N/A | N/A | N/A | N/A |
| Confirm artifact upload | N/A (system context) | N/A (system context) | N/A | N/A | N/A | N/A |
| Attach artifact to release | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Author workflow with artifact trigger | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

**Key security rules:**
- Artifact uploads and confirmations run under system/workflow-execution context, not user identity. The `userId` on artifact-triggered dispatch is empty string.
- Private repository existence must not be leaked: return 404 (not 403) to users without access.
- Signed download URLs do not re-check repository permissions — the 5-minute URL window is the security boundary. Once issued, the URL works for anyone who possesses it until expiry.
- Signed URLs must never be logged in full in server access logs. Log only the blob key, not the token or expires parameters.
- The `gcs_key` (internal storage path) must never appear in any API response, error message, or client-visible log.
- Bearer tokens and session cookies are never logged or included in error responses.
- Deletion is auditable: the server logs user ID, repository, run ID, and artifact name for every successful deletion.

### Rate Limiting

| Endpoint | Authenticated Limit | Anonymous Limit | Window |
|----------|-------------------|-----------------|--------|
| List artifacts (`GET .../artifacts`) | 300 req/min per user | 60 req/min per IP | Sliding |
| Download metadata (`GET .../artifacts/:name/download`) | 60 req/min per user | 30 req/min per IP | Sliding |
| Blob download (`GET /api/blobs/download/:key`) | 120 req/min per IP | 120 req/min per IP | Sliding |
| Blob upload (`PUT /api/blobs/upload/:key`) | 60 req/min per IP | N/A (system only) | Sliding |
| Delete artifact (`DELETE .../artifacts/:name`) | 30 req/min per user | N/A (auth required) | Sliding |

Rate limit responses return HTTP 429 with `Retry-After` header. The delete rate limit is intentionally lower because deletion is destructive and low-frequency.

### Data Privacy Constraints

- Artifact content may contain PII, secrets, or proprietary code. Signed download URLs must not be included in any server-side logs, analytics events, or error reports.
- Expired artifact blobs are hard-deleted from the filesystem by the cleanup scheduler. Once deleted, the data is unrecoverable.
- Artifact metadata (name, size, content type, timestamps) is retained in the database even after blob deletion until the artifact record itself is pruned.
- Audit logs record who listed, downloaded, or deleted artifacts (user ID, repo, run ID, artifact name) but must not log full response payloads or artifact content.
- The blob signing secret (`CODEPLANE_BLOB_SIGNING_SECRET`) is a server-side secret that must not be exposed to clients or logged.
- Artifact names are not treated as PII but may contain project-specific identifiers that are visible to anyone with read access to the repository.

## Telemetry & Product Analytics

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowArtifactCreated` | Artifact record created (pending status) | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `content_type`, `expires_at`, `codeplane_version` |
| `WorkflowArtifactConfirmed` | Artifact upload confirmed (pending → ready) | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `content_type`, `upload_duration_ms`, `codeplane_version` |
| `WorkflowArtifactDownloadRequested` | User requests download metadata | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `content_type`, `client` (web/cli/tui/api), `user_id` |
| `WorkflowArtifactDownloadCompleted` | Blob download endpoint serves full response | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `duration_ms`, `client_ip_hash` |
| `WorkflowArtifactDownloadFailed` | Download returns error | `repository_id`, `workflow_run_id`, `artifact_name`, `error_code` (404/409/410/403), `error_reason`, `client` |
| `WorkflowArtifactDeleteCompleted` | Artifact successfully deleted (204) | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `artifact_status`, `blob_deleted`, `duration_ms`, `client`, `user_id` |
| `WorkflowArtifactDeleteFailed` | Deletion returned error | `repository_id`, `workflow_run_id`, `artifact_name`, `error_code` (400/403/404/409), `error_reason`, `client`, `user_id` |
| `WorkflowArtifactExpired` | Artifact pruned by cleanup scheduler | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `age_hours`, `had_release_tag` |
| `WorkflowArtifactAttachedToRelease` | Artifact attached to a release | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `release_tag`, `release_asset_name` |
| `WorkflowArtifactListViewed` | Artifact list loaded on any surface | `repository_id`, `workflow_run_id`, `artifact_count`, `total_size_bytes`, `ready_count`, `pending_count`, `expired_count`, `client` (web/cli/tui/api), `response_time_ms` |
| `WorkflowTriggeredByArtifact` | Workflow run created from artifact confirmation | `repository_id`, `workflow_definition_id`, `workflow_run_id`, `source_workflow_run_id`, `source_workflow_name`, `artifact_name`, `trigger_ref`, `trigger_commit_sha`, `matched_definitions_count` |

### Common Properties (All Events)

- `timestamp`, `codeplane_version`, `server_instance_id`
- For user-initiated events: `user_id`, `session_id`, `client_type`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Artifact creation success rate (created → confirmed) | > 95% | High failure rate indicates upload infrastructure issues |
| Artifact list load success rate | > 99% | Core data path; failures indicate service issues |
| P95 list endpoint latency | < 200ms | Small dataset per run; should be fast |
| Download conversion rate (requested → completed) | > 95% | Failures should be rare for ready artifacts |
| Expired artifact download attempts (410 / total downloads) | < 5% | Users should not routinely hit expired artifacts |
| Pending artifact download attempts (409 / total downloads) | < 2% | Pending artifacts should confirm quickly |
| Delete success rate (confirmed → completed) | > 95% | Most deletions should succeed |
| Artifact view adoption (% of run detail visits that open Artifacts tab) | > 20% | Feature is discoverable and useful |
| Cleanup sweep success rate | > 99% | Background job must be reliable |
| Time from confirmation to trigger dispatch | < 500ms P99 | Tight feedback loops for pipeline automation |
| Repositories with ≥1 artifact trigger | > 5% within 90 days | Adoption of pipeline composition |
| Average artifacts per run | 1–10 | Healthy usage; >>50 suggests misconfiguration |
| Storage utilization growth rate | < 10% week-over-week | Cleanup is keeping pace with creation |

## Observability

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Artifact record created (pending) | `request_id`, `repository_id`, `workflow_run_id`, `artifact_name`, `artifact_size`, `content_type`, `expires_at` |
| `info` | Artifact upload confirmed (ready) | `request_id`, `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `upload_duration_ms` |
| `info` | Artifact list returned successfully | `request_id`, `run_id`, `repo_id`, `artifact_count`, `total_size_bytes`, `response_time_ms` |
| `info` | Artifact download metadata served | `request_id`, `repo_id`, `run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `signed_url_expires_at` |
| `info` | Blob download started | `blob_key`, `request_id`, `content_length` |
| `info` | Blob download completed | `blob_key`, `request_id`, `bytes_sent`, `duration_ms` |
| `info` | Blob upload completed | `blob_key`, `request_id`, `bytes_received`, `duration_ms` |
| `info` | Artifact deleted successfully | `request_id`, `run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `artifact_status`, `blob_deleted`, `response_time_ms`, `repo_id`, `user_id` |
| `info` | Artifact trigger dispatch started | `repository_id`, `source_workflow_run_id`, `source_workflow_name`, `artifact_name`, `trigger_ref`, `trigger_commit_sha` |
| `info` | Artifact trigger dispatch completed | `repository_id`, `artifact_name`, `source_workflow_name`, `runs_created_count`, `definitions_evaluated_count`, `dispatch_duration_ms` |
| `info` | Cleanup sweep: N expired artifacts deleted | `job`, `workflow_artifact_count`, `issue_artifact_count`, `blob_errors` |
| `warn` | Artifact list for non-existent run (404) | `request_id`, `run_id`, `repo_id`, `user_id` |
| `warn` | Artifact download blocked (409 pending / 410 expired) | `request_id`, `repo_id`, `run_id`, `artifact_name`, `error_code`, `error_reason` |
| `warn` | Artifact delete blocked by release (409) | `request_id`, `run_id`, `artifact_name`, `release_tag`, `repo_id`, `user_id` |
| `warn` | Artifact delete denied — insufficient permissions (403) | `request_id`, `run_id`, `artifact_name`, `repo_id`, `user_id`, `user_role` |
| `warn` | Blob deletion failed after DB record removed (orphan) | `request_id`, `run_id`, `artifact_id`, `blob_key_prefix` (first 20 chars), `error_message` |
| `warn` | Blob download token invalid or expired | `blob_key_prefix` (first 20 chars), `request_id`, `reason` |
| `warn` | Slow query (>500ms) | `request_id`, `run_id`, `repo_id`, `artifact_count`, `response_time_ms` |
| `warn` | Rate limited request (429) | `request_id`, `user_id`, `ip`, `endpoint`, `retry_after_seconds` |
| `warn` | Trigger dispatch failed | `repository_id`, `source_workflow_run_id`, `artifact_name`, `error_message` |
| `error` | Database query failure | `request_id`, `run_id`, `repo_id`, `operation`, `error_message`, `error_code` |
| `error` | Blob I/O failure (read or write) | `blob_key`, `request_id`, `operation`, `error_message` |
| `error` | Unexpected exception in handler | `request_id`, `run_id`, `repo_id`, `error_message`, `stack_trace` |
| `error` | Cleanup sweep failed | `job`, `error_message`, `stack_trace` |

**Critical rules:** Never log signed URL tokens. Never log full `gcs_key` in warn/error — use `blob_key_prefix` (first 20 chars). All logs include `request_id` for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_artifact_created_total` | Counter | `repo_id`, `status` (pending) | Total artifacts created |
| `codeplane_workflow_artifact_confirmed_total` | Counter | `repo_id` | Total artifacts confirmed (ready) |
| `codeplane_workflow_artifact_list_total` | Counter | `status` (200/400/401/403/404/429/500), `repo_id` | Total list requests |
| `codeplane_workflow_artifact_list_duration_seconds` | Histogram | `status` | List request duration. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5 |
| `codeplane_workflow_artifact_list_count` | Histogram | — | Artifacts returned per list. Buckets: 0, 1, 5, 10, 25, 50, 100, 200 |
| `codeplane_artifact_download_requests_total` | Counter | `status` (200/400/404/409/410), `repo_id` | Total download metadata requests |
| `codeplane_artifact_download_bytes_total` | Counter | `repo_id` | Total bytes served via blob downloads |
| `codeplane_artifact_download_duration_seconds` | Histogram | `status`, `size_bucket` (small<1MB/medium<100MB/large>100MB) | Download metadata latency |
| `codeplane_blob_download_duration_seconds` | Histogram | `status` | Blob download latency (time to full response) |
| `codeplane_blob_upload_duration_seconds` | Histogram | `status` | Blob upload latency |
| `codeplane_blob_upload_bytes_total` | Counter | — | Total bytes uploaded |
| `codeplane_artifact_download_active` | Gauge | — | In-progress blob downloads |
| `codeplane_workflow_artifact_delete_total` | Counter | `status` (204/400/401/403/404/409/429/500), `repo_id` | Total delete requests |
| `codeplane_workflow_artifact_delete_duration_seconds` | Histogram | `status` | Delete request duration |
| `codeplane_workflow_artifact_delete_blob_errors_total` | Counter | `error_type` (not_found/io_error/timeout) | Blob deletion errors (non-fatal) |
| `codeplane_workflow_artifact_cleanup_pruned_total` | Counter | `type` (workflow/issue) | Artifacts pruned per sweep |
| `codeplane_workflow_artifact_cleanup_blob_errors_total` | Counter | — | Blob deletion errors during cleanup |
| `codeplane_workflow_artifact_cleanup_duration_seconds` | Histogram | — | Cleanup sweep duration |
| `codeplane_workflow_artifact_storage_bytes` | Gauge | `repo_id` | Total artifact storage bytes per repo (updated on create/delete/cleanup) |
| `codeplane_workflow_artifact_trigger_dispatch_total` | Counter | `status` (success/error/no_match) | Total trigger dispatch attempts |
| `codeplane_workflow_artifact_trigger_runs_created_total` | Counter | — | Runs created via artifact triggers |
| `codeplane_workflow_artifact_trigger_dispatch_duration_seconds` | Histogram | — | Dispatch latency |
| `codeplane_signed_url_generation_duration_seconds` | Histogram | — | Time to generate signed URLs |

### Alerts and Runbooks

**Alert: `WorkflowArtifactStorageErrorRateHigh`**
- **Condition:** `(rate(codeplane_workflow_artifact_list_total{status="500"}[5m]) + rate(codeplane_artifact_download_requests_total{status="500"}[5m]) + rate(codeplane_workflow_artifact_delete_total{status="500"}[5m])) / (rate(codeplane_workflow_artifact_list_total[5m]) + rate(codeplane_artifact_download_requests_total[5m]) + rate(codeplane_workflow_artifact_delete_total[5m])) > 0.05` for 5 minutes
- **Severity:** P2
- **Runbook:**
  1. Check server logs filtered by `level=error` and artifact-related operations for the last 15 minutes
  2. Verify database connectivity: run `SELECT 1` against the primary database
  3. Check database connection pool utilization via `codeplane_db_pool_active_connections`
  4. Check if the `workflow_artifacts` table has excessive row counts: `SELECT COUNT(*) FROM workflow_artifacts`
  5. Verify blob store filesystem health: `df -h` on data directory, check for ENOSPC
  6. If database is healthy, check for recent deployments that may have introduced a regression
  7. Escalate to workflows team if unresolved after 15 minutes

**Alert: `WorkflowArtifactDownloadLatencyHigh`**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_blob_download_duration_seconds_bucket[5m])) > 30` for 10 minutes
- **Severity:** P3
- **Runbook:**
  1. Check `codeplane_artifact_download_active` gauge for concurrent download count
  2. Check disk I/O utilization on the blob store filesystem
  3. Check `codeplane_blob_download_bytes_histogram` for shift toward large artifacts
  4. Check network throughput between server and clients
  5. If single repository dominates, check for automated download loops

**Alert: `WorkflowArtifactOrphanedBlobSpike`**
- **Condition:** `increase(codeplane_artifact_download_errors_total{error_type="blob_missing"}[1h]) > 10`
- **Severity:** P1 (Critical)
- **Runbook:**
  1. Artifact records reference blob keys that no longer exist on disk — data loss may have occurred
  2. Check cleanup scheduler logs for recent `sweepExpiredArtifacts` runs — verify not deleting non-expired artifacts
  3. Check if blob store data directory was manually modified, moved, or corrupted
  4. Check filesystem for recent ENOSPC errors causing incomplete blob writes
  5. For immediate mitigation: mark affected records as `expired` so users see clear status rather than confusing 404
  6. File incident to investigate root cause of data loss

**Alert: `WorkflowArtifactCleanupFailure`**
- **Condition:** `increase(codeplane_workflow_artifact_cleanup_blob_errors_total[15m]) > 20`
- **Severity:** P3
- **Runbook:**
  1. Database records are being pruned but backing blobs are failing to delete, creating orphaned storage
  2. Check disk I/O metrics and filesystem mount health on blob store data directory
  3. Check for ENOSPC, ENOENT, or EACCES errors in server logs
  4. Verify blob store data directory permissions have not changed
  5. Orphaned blobs waste storage but do not affect functionality
  6. Run manual reconciliation if orphan count exceeds 100

**Alert: `WorkflowArtifactSignedURLClockSkew`**
- **Condition:** `increase(codeplane_artifact_download_errors_total{error_type="token_invalid"}[5m]) > 5`
- **Severity:** P1 (Critical)
- **Runbook:**
  1. Signed URL validation depends on `Date.now()` matching between URL generation and verification
  2. Check NTP sync status on all server instances: `timedatectl status` or `ntpq -p`
  3. If multiple server instances exist, verify they share the same `CODEPLANE_BLOB_SIGNING_SECRET`
  4. Check if any recent deployment changed the signing secret without coordinated restart
  5. Immediate mitigation: restart all server instances to ensure consistent secret loading

**Alert: `WorkflowArtifactUploadConfirmationStalled`**
- **Condition:** `(codeplane_workflow_artifact_created_total - codeplane_workflow_artifact_confirmed_total) > 50` sustained for 15 minutes
- **Severity:** P2
- **Runbook:**
  1. Large gap between created and confirmed artifacts indicates upload pipeline stalling
  2. Check workflow execution engine logs for upload failures
  3. Check blob store disk space and I/O health
  4. Check for network issues between workflow runners and blob upload endpoint
  5. Pending artifacts will be cleaned up by expiration sweep, but stalling blocks artifact-triggered workflows

**Alert: `WorkflowArtifactTriggerDispatchErrorRate`**
- **Condition:** `rate(codeplane_workflow_artifact_trigger_dispatch_total{status="error"}[5m]) / rate(codeplane_workflow_artifact_trigger_dispatch_total[5m]) > 0.05`
- **Severity:** P2
- **Runbook:**
  1. Check error volume and affected repositories via counter labels
  2. Search logs for dispatch failures with artifact_name and source_workflow_name
  3. Common causes: DB connection pool exhaustion, config parsing errors, source run deleted before dispatch
  4. If isolated to one repo, inspect workflow definitions for malformed configs
  5. If systemic, check DB health, server memory, restart workflow service

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Invalid run ID (non-numeric) | 400 | Return error JSON | Client-side validation |
| Run not found | 404 | Return error JSON | User navigates to valid run |
| Repository not found or no access | 404 | Same 404 (no info leak) | User checks permissions |
| Authentication missing/expired | 401 | Return error JSON | Client redirects to login |
| Insufficient permissions (read-only delete) | 403 | Return error JSON | User requests write access |
| Artifact not found | 404 | Return error JSON | Check name, run ID |
| Artifact pending (download) | 409 | Return error JSON | Wait for confirmation |
| Artifact expired (download) | 410 | Return error JSON | Re-run workflow |
| Artifact attached to release (delete) | 409 | Return error JSON | Detach from release first |
| Signed URL expired | 403 | From blob endpoint | Re-request download metadata |
| Signed URL tampered | 403 | From blob endpoint | Use legitimate URL |
| Blob not found on disk | 404 | From blob endpoint | Alert triggers investigation |
| Disk full (upload) | 500 | Upload fails | Expand storage |
| Disk full (download read) | 500 | Read fails | Expand storage |
| File descriptor exhaustion | 500 | EMFILE | Increase ulimit |
| Database connection failure | 500 | Log error, return 500 | Auto-reconnect; alert fires |
| Rate limited | 429 | Return with Retry-After | Respect header, retry later |
| Signing secret mismatch across instances | 403 on all downloads | All signed URLs invalid | Restart all instances with consistent secret |
| Cleanup scheduler crash | No visible user impact | Artifacts accumulate | Alert fires, restart process |

## Verification

## Verification

### API Integration Tests (`e2e/api/workflow-artifact-storage.test.ts`)

#### Artifact Creation and Confirmation
- **API-STORE-001**: Create artifact via workflow execution context — verify record created with status `pending` and auto-generated `gcs_key`
- **API-STORE-002**: Confirm artifact upload — verify status transitions to `ready` and `confirmed_at` is set
- **API-STORE-003**: Confirm non-existent artifact — verify returns null/not-found
- **API-STORE-004**: Confirm already-confirmed artifact — verify idempotent (confirmed_at uses COALESCE, not overwritten)
- **API-STORE-005**: Create artifact with duplicate name on same run — verify unique constraint violation (database error)
- **API-STORE-006**: Create artifact with duplicate name on different run — verify success (names are unique per run, not globally)
- **API-STORE-007**: Create artifact with minimum-length name (1 character) — verify success
- **API-STORE-008**: Create artifact with maximum-length name (255 characters) — verify success
- **API-STORE-009**: Create artifact with name exceeding 255 characters — verify rejection
- **API-STORE-010**: Create artifact with name containing path separators (`dist/app/bundle.js`) — verify success, stored as flat name
- **API-STORE-011**: Create artifact with name containing `..` — verify path traversal prevention (normalized in blob key)
- **API-STORE-012**: Create artifact with Unicode name (`レポート.pdf`) — verify success
- **API-STORE-013**: Create artifact with URL-special characters (`build+output#v2.tar.gz`) — verify success
- **API-STORE-014**: Create artifact with zero size — verify success
- **API-STORE-015**: Create artifact with 5 GB size — verify success
- **API-STORE-016**: Create artifact with size > 5 GB — verify rejection
- **API-STORE-017**: Create artifact with valid MIME content type — verify stored correctly
- **API-STORE-018**: Create artifact with empty content type — verify rejection
- **API-STORE-019**: Create artifact with content type exceeding 255 characters — verify rejection
- **API-STORE-020**: Verify `gcs_key` format matches `repos/{repo_id}/runs/{run_id}/artifacts/{artifact_id}/{name}`

#### Signed URL Generation and Validation
- **API-STORE-021**: Generate upload signed URL — verify format `/api/blobs/upload/{key}?token={token}&expires={expires}`
- **API-STORE-022**: Generate download signed URL — verify format `/api/blobs/download/{key}?token={token}&expires={expires}`
- **API-STORE-023**: Verify signed URL token is HMAC-SHA256 of `key:expiresAt`
- **API-STORE-024**: Use valid signed download URL within expiry — verify 200 with correct content
- **API-STORE-025**: Use signed download URL after 5-minute expiry — verify 403
- **API-STORE-026**: Use signed download URL with tampered token — verify 403
- **API-STORE-027**: Use signed download URL with tampered expires parameter — verify 403
- **API-STORE-028**: Use valid signed upload URL — verify blob written to filesystem
- **API-STORE-029**: Use signed upload URL after expiry — verify 403
- **API-STORE-030**: Concurrent use of same signed download URL within expiry — verify both succeed

#### Blob Store Operations
- **API-STORE-031**: Put blob — verify file written to correct filesystem path under `CODEPLANE_DATA_DIR/blobs/`
- **API-STORE-032**: Get blob — verify correct content returned
- **API-STORE-033**: Get non-existent blob — verify `BlobNotFoundError` thrown
- **API-STORE-034**: Delete blob — verify file removed from filesystem
- **API-STORE-035**: Delete non-existent blob — verify no error (idempotent)
- **API-STORE-036**: Blob exists check — verify true for existing blob, false for non-existent
- **API-STORE-037**: Blob stat — verify correct size returned
- **API-STORE-038**: Blob stat for non-existent blob — verify `BlobNotFoundError`
- **API-STORE-039**: Put blob with path traversal attempt (`../../../etc/passwd`) — verify normalized, no directory escape
- **API-STORE-040**: Put blob — verify parent directories created automatically

#### Artifact List (via API)
- **API-STORE-041**: List artifacts for run with multiple artifacts — verify response shape, correct count, all fields present
- **API-STORE-042**: List artifacts for run with zero artifacts — verify `{ artifacts: [] }` with 200
- **API-STORE-043**: List artifacts ordering — verify `created_at DESC, id DESC`
- **API-STORE-044**: List includes all status types (pending, ready, expired) — verify correct values
- **API-STORE-045**: List includes release attachment fields — verify `release_tag`, `release_asset_name`, `release_attached_at`
- **API-STORE-046**: Response does NOT include `gcs_key` field
- **API-STORE-047**: Run with 200 artifacts — verify all 200 returned
- **API-STORE-048**: Run with 201 artifacts — verify all 201 returned (no server cap)
- **API-STORE-049**: Invalid run ID (string "abc") — verify 400
- **API-STORE-050**: Non-existent run ID — verify 404
- **API-STORE-051**: Public repo as anonymous user — verify 200
- **API-STORE-052**: Private repo as anonymous user — verify 404
- **API-STORE-053**: Private repo as read-only collaborator — verify 200

#### Artifact Download (via API)
- **API-STORE-054**: Download ready artifact — verify 200 with `download_url`
- **API-STORE-055**: Follow download URL — verify raw bytes match original upload
- **API-STORE-056**: Download response `Content-Type` matches stored content type
- **API-STORE-057**: Download response `Content-Disposition: attachment; filename="{name}"`
- **API-STORE-058**: Download response `Content-Length` matches stored size
- **API-STORE-059**: Download pending artifact — verify 409
- **API-STORE-060**: Download expired artifact — verify 410
- **API-STORE-061**: Download non-existent artifact — verify 404
- **API-STORE-062**: Download zero-byte artifact — verify 200 with empty body
- **API-STORE-063**: Download large artifact (150 MB) — verify all bytes match
- **API-STORE-064**: Download maximum-size artifact (5 GB) — verify success (extended timeout)
- **API-STORE-065**: Artifact name with special characters — verify correct URL encoding resolution

#### Artifact Delete (via API)
- **API-STORE-066**: Delete ready artifact — verify 204
- **API-STORE-067**: Delete artifact — verify no longer in list
- **API-STORE-068**: Delete artifact — verify backing blob removed from filesystem
- **API-STORE-069**: Delete pending artifact — verify 204 (allowed)
- **API-STORE-070**: Delete expired artifact — verify 204 (allowed)
- **API-STORE-071**: Delete release-attached artifact — verify 409
- **API-STORE-072**: Delete same artifact twice — first 204, second 404
- **API-STORE-073**: Delete as write user — verify 204
- **API-STORE-074**: Delete as read-only user — verify 403
- **API-STORE-075**: Delete as anonymous on public repo — verify 401
- **API-STORE-076**: Delete then download — verify download returns 404
- **API-STORE-077**: Concurrent deletes of same artifact — exactly one 204, other 404

#### Release Attachment
- **API-STORE-078**: Attach artifact to release — verify `release_tag`, `release_asset_name`, `release_attached_at` set
- **API-STORE-079**: Attach non-existent artifact — verify null/not-found
- **API-STORE-080**: Attached artifact appears in list with release fields populated
- **API-STORE-081**: Attached artifact download works identically to unattached

#### Cleanup Scheduler
- **API-STORE-082**: Create artifact with short expiry — verify cleanup sweep prunes it after expiry
- **API-STORE-083**: Verify cleanup deletes both database record and backing blob
- **API-STORE-084**: Verify cleanup handles blob deletion failure gracefully (logs warning, record still deleted)
- **API-STORE-085**: Verify cleanup processes in batch size of 100 (create 150 expired, verify only 100 pruned per sweep)
- **API-STORE-086**: Verify cleanup processes oldest expired first (`expires_at ASC, id ASC`)
- **API-STORE-087**: Non-expired artifacts are not pruned by cleanup
- **API-STORE-088**: Cleanup handles issue artifacts alongside workflow artifacts

#### Artifact Triggers
- **API-STORE-089**: Confirm artifact with matching `workflow_artifact` trigger — verify new run created
- **API-STORE-090**: Confirm artifact with no matching triggers — verify no runs created
- **API-STORE-091**: Wildcard trigger (no filters) — verify run for any artifact
- **API-STORE-092**: Workflow name filter — verify only matching source workflows trigger
- **API-STORE-093**: Artifact name glob filter — verify only matching names trigger
- **API-STORE-094**: Both filters (AND semantics) — verify both must match
- **API-STORE-095**: Case-insensitive workflow matching — verify
- **API-STORE-096**: Case-sensitive artifact name matching — verify
- **API-STORE-097**: Multiple artifacts from same run — verify independent dispatch per artifact
- **API-STORE-098**: Triggered run metadata includes type=workflow_artifact, action=ready, artifactName, sourceWorkflow
- **API-STORE-099**: Dispatch failure does not affect artifact status (stays ready)
- **API-STORE-100**: Pending artifact (not confirmed) does NOT trigger workflows

#### Rate Limiting
- **API-STORE-101**: List endpoint — 301st request in 1 minute returns 429 with Retry-After
- **API-STORE-102**: Download endpoint — 61st request in 1 minute returns 429
- **API-STORE-103**: Delete endpoint — 31st request in 1 minute returns 429

### CLI Integration Tests (`e2e/cli/artifact-storage.test.ts`)

- **CLI-STORE-001**: `artifact list <runId>` — table output with correct columns (name, status, size, content type, expires, release, created)
- **CLI-STORE-002**: `artifact list <runId> --json` — JSON matches API response shape
- **CLI-STORE-003**: `artifact list <runId> --json .artifacts[].name` — field filtering returns array of names
- **CLI-STORE-004**: `artifact list` with repo inferred from working directory — verify success
- **CLI-STORE-005**: `artifact list` with non-existent run — verify error message
- **CLI-STORE-006**: `artifact list` with no auth — verify auth error
- **CLI-STORE-007**: `artifact list` for run with zero artifacts — verify empty table with message
- **CLI-STORE-008**: `artifact download <runId> <name>` — default output path (current dir + artifact name)
- **CLI-STORE-009**: `artifact download <runId> <name> --output /tmp/custom.bin` — custom output path
- **CLI-STORE-010**: `artifact download` — content integrity (SHA-256 hash matches original)
- **CLI-STORE-011**: `artifact download` — nested output path creation
- **CLI-STORE-012**: `artifact download` — pending artifact error message
- **CLI-STORE-013**: `artifact download` — expired artifact error message
- **CLI-STORE-014**: `artifact download` — not found error message
- **CLI-STORE-015**: `artifact download --json` — structured JSON output
- **CLI-STORE-016**: `artifact delete <runId> <name> --yes` — verify success message
- **CLI-STORE-017**: `artifact delete <runId> <name> --yes --json` — verify JSON output
- **CLI-STORE-018**: `artifact delete` interactive confirmation — pipe "y\n", verify deletion
- **CLI-STORE-019**: `artifact delete` interactive cancellation — pipe "n\n", verify abort
- **CLI-STORE-020**: `artifact delete` non-interactive without `--yes` — verify error
- **CLI-STORE-021**: `artifact delete` release-attached artifact — verify error message
- **CLI-STORE-022**: `artifact list` then `artifact delete` then `artifact list` — verify artifact gone
- **CLI-STORE-023**: `artifact list` then `artifact download` — round-trip works
- **CLI-STORE-024**: Table shows human-readable sizes (B, KB, MB, GB)
- **CLI-STORE-025**: Table shows relative timestamps

### Web UI Playwright Tests (`e2e/web/workflow-artifact-storage.test.ts`)

- **WEB-STORE-001**: Navigate to run detail → Artifacts tab → verify table renders with artifacts
- **WEB-STORE-002**: Header shows "Artifacts (N)" with correct count
- **WEB-STORE-003**: Header shows total combined size in human-readable format
- **WEB-STORE-004**: Ready artifact has green status dot
- **WEB-STORE-005**: Pending artifact has yellow status dot
- **WEB-STORE-006**: Expired artifact has gray dot and "expired" label
- **WEB-STORE-007**: Release-attached artifact shows release badge
- **WEB-STORE-008**: Click artifact name opens detail drawer with full metadata
- **WEB-STORE-009**: Empty run shows empty state message
- **WEB-STORE-010**: Loading state shows skeleton shimmer
- **WEB-STORE-011**: Error state shows error with retry button; retry re-fetches
- **WEB-STORE-012**: Status filter dropdown filters client-side
- **WEB-STORE-013**: Search input filters by name
- **WEB-STORE-014**: Column header click toggles sort
- **WEB-STORE-015**: Download button visible and enabled on ready artifact
- **WEB-STORE-016**: Download button disabled with tooltip on pending artifact
- **WEB-STORE-017**: Download button disabled with tooltip on expired artifact
- **WEB-STORE-018**: Click download triggers browser download (intercept download event)
- **WEB-STORE-019**: Toast notification on download start
- **WEB-STORE-020**: Delete button visible for write-access user, not visible for read-only
- **WEB-STORE-021**: Delete button disabled with tooltip for release-attached artifact
- **WEB-STORE-022**: Click delete opens confirmation dialog with artifact name and size
- **WEB-STORE-023**: Cancel closes dialog without deletion
- **WEB-STORE-024**: Confirm delete — artifact row removed, count and size update, toast shown
- **WEB-STORE-025**: Delete error (409 release-attached) — error shown in dialog, row unchanged
- **WEB-STORE-026**: Size column shows human-readable format (0 B, KB, MB, GB, TB)
- **WEB-STORE-027**: Expiration column shows relative countdown
- **WEB-STORE-028**: Tab preserves state when switching away and back
- **WEB-STORE-029**: Long artifact name truncated with ellipsis
- **WEB-STORE-030**: Multiple sequential deletes — each succeeds independently

### TUI Integration Tests (`e2e/tui/workflow-artifact-storage.test.ts`)

- **TUI-STORE-001**: Navigate to run → `a` → artifacts view renders with list
- **TUI-STORE-002**: Title shows "Artifacts (N)" + total size
- **TUI-STORE-003**: `j`/`k` navigation between rows
- **TUI-STORE-004**: `Enter` opens detail overlay
- **TUI-STORE-005**: `/` search focuses input, narrows list
- **TUI-STORE-006**: `f` cycles status filters
- **TUI-STORE-007**: `s` cycles sort options
- **TUI-STORE-008**: `q` pops screen
- **TUI-STORE-009**: Status icons ●/◎/○ render correctly with colors
- **TUI-STORE-010**: `D` on ready artifact — status bar shows downloading message, success after completion
- **TUI-STORE-011**: `D` on pending artifact — status bar shows warning
- **TUI-STORE-012**: `D` on expired artifact — status bar shows error
- **TUI-STORE-013**: `x` on artifact — confirmation overlay appears
- **TUI-STORE-014**: `Enter` in confirmation — artifact deleted, row removed
- **TUI-STORE-015**: `Esc` in confirmation — overlay closes, no deletion
- **TUI-STORE-016**: `x` on release-attached artifact — status bar shows "Attached to release" warning
- **TUI-STORE-017**: Empty state for zero artifacts
- **TUI-STORE-018**: 200 artifact cap with footer message
- **TUI-STORE-019**: Responsive layout at 80×24, 120×40, 200×60
- **TUI-STORE-020**: Network error → error state with retry prompt; `R` retries
- **TUI-STORE-021**: Filter + search compose correctly
- **TUI-STORE-022**: Focus moves to next artifact after deletion
- **TUI-STORE-023**: Resize between breakpoints preserves focus

### Artifact Trigger Pipeline Tests (`e2e/api/workflow-artifact-trigger-pipeline.test.ts`)

- **PIPE-STORE-001**: Full pipeline — push triggers build, build produces artifact, artifact triggers deploy
- **PIPE-STORE-002**: Non-matching artifact — build produces wrong artifact, deploy does NOT run
- **PIPE-STORE-003**: Fan-out — one artifact triggers three downstream workflows
- **PIPE-STORE-004**: Chain — A→artifact→B→artifact→C, all three run in sequence
- **PIPE-STORE-005**: Artifact trigger with glob pattern `dist/*.zip` — matching and non-matching names tested

All tests must be left failing if the backend is not yet implemented — never skipped or commented out.
