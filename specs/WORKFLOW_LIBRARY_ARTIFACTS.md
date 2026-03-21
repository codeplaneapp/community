# WORKFLOW_LIBRARY_ARTIFACTS

Specification for WORKFLOW_LIBRARY_ARTIFACTS.

## High-Level User POV

When you author workflows in Codeplane using TypeScript, you often need to pass files between tasks or preserve build outputs for later consumption. The workflow library artifact helpers give you a simple, first-class way to do this directly from your workflow code — no manual HTTP calls, no blob-store plumbing, no signing tokens yourself.

Inside any workflow task, you access `ctx.artifacts` to upload a file from the runner's filesystem into Codeplane's artifact store, or download a previously uploaded artifact back to disk. When you call `ctx.artifacts.upload("dist.tar.gz", "./dist/bundle.tar.gz")`, the helper handles streaming the file, recording its size and content type, confirming the upload with the server, and returning a metadata record you can inspect. When you call `ctx.artifacts.download("dist.tar.gz", "./tmp/bundle.tar.gz")`, the helper fetches the artifact from the store and writes it to the path you specify, returning the same metadata shape so you always know what you got.

These helpers are automatically available on the workflow context when you use `createSmithers` to define your workflow. You do not need to import a separate client or configure credentials — the runtime injects the right artifact client before your workflow executes. If you accidentally try to call artifact helpers outside a running workflow (for example, in a standalone script or a misconfigured test), the helpers fail immediately with a clear error message instead of silently doing nothing.

The artifact helpers integrate naturally with the rest of the Codeplane workflow system. Uploaded artifacts appear in the run's artifact list in the web UI, CLI, and TUI. They can trigger downstream workflows via `on.workflowArtifact()` triggers. They can be attached to releases. They follow the same naming rules, size limits, and expiration policies as all Codeplane artifacts. The library helpers are simply the TypeScript-native way to interact with this system from inside your workflow code.

This feature is valuable because it eliminates the gap between "workflow logic" and "artifact management." Instead of shelling out to curl, writing custom upload scripts, or manually constructing API calls, you use typed, async helpers that integrate with Codeplane's artifact lifecycle — upload confirmation, expiration, trigger evaluation, and release attachment — automatically.

## Acceptance Criteria

### Definition of Done

- [ ] The `@codeplane-ai/workflow` package exports `createWorkflowArtifactHelpers`, `WorkflowArtifactClient`, `WorkflowArtifactRecord`, `WorkflowArtifactUploadOptions`, and `CodeplaneWorkflowCtx`
- [ ] `createSmithers()` returns a `smithers()` function whose build callback receives `ctx.artifacts` as a fully wired `WorkflowArtifactClient`
- [ ] `ctx.artifacts.upload(name, path, options?)` streams a file from the runner filesystem to the artifact store, confirms the upload, and returns a `WorkflowArtifactRecord`
- [ ] `ctx.artifacts.download(name, path)` fetches a previously uploaded artifact from the artifact store to the specified path and returns a `WorkflowArtifactRecord`
- [ ] Both `upload` and `download` are async and return `Promise<WorkflowArtifactRecord>`
- [ ] Calling artifact helpers when no runtime client is installed throws a descriptive, synchronous error
- [ ] The runtime artifact client is injectable and retrievable via `setWorkflowArtifactClient` / `getWorkflowArtifactClient` using a Symbol-keyed global
- [ ] Documentation covers usage examples, error handling, and content-type override

### Artifact Name Constraints

- [ ] Artifact names must be between 1 and 255 characters inclusive
- [ ] Allowed characters: alphanumeric (`a-z`, `A-Z`, `0-9`), hyphens (`-`), underscores (`_`), dots (`.`), forward slashes (`/`)
- [ ] Names are case-sensitive
- [ ] Names must not contain `..` sequences (path traversal prevention)
- [ ] Names must not have leading or trailing whitespace
- [ ] Names must be unique within a single workflow run (compound uniqueness on `workflow_run_id + name`)
- [ ] Attempting to upload with a duplicate name within the same run must return a clear conflict error
- [ ] Attempting to upload with an empty string name must return a validation error
- [ ] Attempting to upload with a name exceeding 255 characters must return a validation error
- [ ] Attempting to upload with disallowed characters (e.g., `<`, `>`, `|`, `\`, `:`, `*`, `?`, `"`) must return a validation error

### File Path Constraints

- [ ] The `path` argument to `upload` must reference an existing readable file on the runner filesystem
- [ ] If the file does not exist, `upload` must reject with a clear filesystem error
- [ ] If the file is empty (0 bytes), `upload` must succeed and record `size: 0`
- [ ] The `path` argument to `download` specifies the destination; parent directories must exist or the call must fail with a clear error
- [ ] If the download destination already exists, it must be overwritten
- [ ] Maximum artifact file size is 5 GB; uploads exceeding this limit must be rejected with a size-limit error

### Upload Options

- [ ] `contentType` is optional; when omitted, the runtime should auto-detect based on file extension or default to `application/octet-stream`
- [ ] When `contentType` is provided, it must be used as-is without modification
- [ ] `contentType` must be a valid MIME type string

### Return Value Shape

- [ ] `WorkflowArtifactRecord.id` is optional (may be undefined for certain runtimes) and is a number when present
- [ ] `WorkflowArtifactRecord.name` always matches the name passed to `upload` or `download`
- [ ] `WorkflowArtifactRecord.size` is the file size in bytes (non-negative integer)
- [ ] `WorkflowArtifactRecord.contentType` is the resolved MIME type string
- [ ] `WorkflowArtifactRecord.expiresAt` is an optional ISO 8601 timestamp string

### Context Integration

- [ ] `CodeplaneWorkflowCtx` extends `SmithersCtx` with an `artifacts` property typed as `WorkflowArtifactClient`
- [ ] The `artifacts` property is always present on the context within a `smithers()` build function — never `undefined`
- [ ] Each workflow build invocation gets a fresh set of artifact helpers (not shared across concurrent runs)

### Error Behavior

- [ ] Error messages from missing runtime client must include the method name (`upload` or `download`) and a note about runtime availability
- [ ] Network/transport errors from the underlying client must propagate without wrapping
- [ ] Type errors (wrong argument types) must be caught at compile time by TypeScript

## Design

### SDK Shape

The `@codeplane-ai/workflow` package provides the following public API surface for artifact helpers:

#### Types

```typescript
type WorkflowArtifactRecord = {
  id?: number;
  name: string;
  size: number;
  contentType: string;
  expiresAt?: string;
};

type WorkflowArtifactUploadOptions = {
  contentType?: string;
};

type WorkflowArtifactClient = {
  upload(
    name: string,
    path: string,
    options?: WorkflowArtifactUploadOptions,
  ): Promise<WorkflowArtifactRecord>;
  download(name: string, path: string): Promise<WorkflowArtifactRecord>;
};

type CodeplaneWorkflowCtx<Schema = Record<string, unknown>> = SmithersCtx<Schema> & {
  artifacts: WorkflowArtifactClient;
};
```

#### Factory Function

`createWorkflowArtifactHelpers()` — returns a `WorkflowArtifactClient` that delegates to the globally registered runtime client. Throws if no client is registered at call time.

#### Global Registration

`setWorkflowArtifactClient(client?: WorkflowArtifactClient)` — called by the workflow runner before executing any workflow. Passing `undefined` clears the registration.

`getWorkflowArtifactClient()` — retrieves the currently registered client, or `undefined` if none is set.

#### createSmithers Integration

When a workflow author calls `createSmithers(schemas)`, the returned `smithers()` function automatically injects `ctx.artifacts` into the build callback's context. The author does not need to call `createWorkflowArtifactHelpers()` manually.

### Workflow Authoring Examples

**Basic upload:**

```typescript
import { createSmithers, on } from "@codeplane-ai/workflow";
import { z } from "zod";

const { Workflow, Task, smithers } = createSmithers({
  buildOutput: z.object({ artifactName: z.string() }),
});

export default smithers((ctx) => (
  <Workflow name="build" triggers={[on.push()]}>
    <Task id="compile" output="buildOutput">
      {async () => {
        // ... build steps ...
        const record = await ctx.artifacts.upload(
          "dist.tar.gz",
          "./dist/bundle.tar.gz",
          { contentType: "application/gzip" }
        );
        return { artifactName: record.name };
      }}
    </Task>
  </Workflow>
));
```

**Download from a previous run or within the same run:**

```typescript
<Task id="deploy" needs={["compile"]}>
  {async () => {
    const record = await ctx.artifacts.download("dist.tar.gz", "./tmp/bundle.tar.gz");
    console.log(`Downloaded ${record.name}: ${record.size} bytes`);
    // ... deploy steps ...
  }}
</Task>
```

**Upload with auto-detected content type:**

```typescript
await ctx.artifacts.upload("coverage.html", "./coverage/index.html");
// contentType auto-detected as "text/html"
```

**Error handling:**

```typescript
try {
  await ctx.artifacts.upload("report.pdf", "./nonexistent.pdf");
} catch (err) {
  console.error("Upload failed:", err.message);
  // "ENOENT: no such file or directory, open './nonexistent.pdf'"
}
```

### CLI Command

The existing `codeplane artifact list` and `codeplane artifact download` commands already provide CLI-side access to artifacts produced by the library helpers. No new CLI commands are required for this feature. Artifacts uploaded via `ctx.artifacts.upload()` inside a workflow are immediately visible through the existing CLI artifact commands.

### Web UI Design

No new web UI surfaces are required for this feature. Artifacts uploaded by the library helpers appear in the existing workflow run artifact list alongside artifacts uploaded through any other mechanism. The web UI treats all artifacts identically regardless of how they were uploaded.

### TUI UI

No new TUI screens are required. Artifacts appear in existing workflow run views.

### Documentation

The following end-user documentation must be written:

**Workflow Authoring Guide — Artifacts Section:**

- Explain that `ctx.artifacts` is automatically available in any `smithers()` build function
- Document `upload(name, path, options?)` with parameter descriptions and return value
- Document `download(name, path)` with parameter descriptions and return value
- Provide examples: basic upload, upload with content-type override, download, error handling
- Document naming rules (allowed characters, length, uniqueness per run)
- Document size limits (5 GB maximum)
- Document expiration behavior (30-day default)
- Explain that uploads trigger `on.workflowArtifact()` downstream workflows
- Explain the "unavailable in this runtime" error and when it occurs

**API Reference — Type Documentation:**

- `WorkflowArtifactRecord` fields and their meanings
- `WorkflowArtifactUploadOptions` fields
- `WorkflowArtifactClient` methods
- `CodeplaneWorkflowCtx` relationship to `SmithersCtx`

**Migration / Adoption Note:**

- If users are currently using raw HTTP calls to upload artifacts, explain how to migrate to `ctx.artifacts.upload()`

## Permissions & Security

### Authorization Model

The artifact library helpers execute within the workflow runner's security context. The runner itself is authenticated to the Codeplane API using a workflow-scoped token. Permissions for artifact operations are therefore governed by the runner's token scope, not by individual user roles at call time.

| Operation | Required Runner Scope | Notes |
|-----------|----------------------|-------|
| `upload` | Write to repository artifacts | Runner must have artifact-write scope for the repository |
| `download` | Read from repository artifacts | Runner must have artifact-read scope for the repository |

End-user roles that determine who can **trigger** the workflow (and thus indirectly invoke artifact helpers):

| Role | Can Trigger Workflow | Effect on Artifacts |
|------|---------------------|-------------------|
| Owner | Yes | Full artifact access via runner |
| Admin | Yes | Full artifact access via runner |
| Member (Write) | Yes | Full artifact access via runner |
| Read | No (cannot dispatch) | N/A |
| Anonymous | No | N/A |

### Rate Limiting

- Artifact uploads within a single workflow run: no per-call rate limit (bounded by run duration and concurrency limits)
- Total artifact storage per repository: governed by repository quota (not enforced by the library itself)
- Artifact helper calls do not bypass server-side rate limits — the underlying HTTP calls to the artifact API are subject to standard API rate limiting

### Data Privacy

- Artifact contents are stored in the blob store using repository-scoped paths; they are not accessible across repositories
- Artifact names may appear in logs, telemetry, and error messages — authors should not use PII in artifact names
- The `contentType` value is logged and stored as metadata — it should not contain sensitive information
- File contents are never logged by the artifact helpers; only metadata (name, size, content type) is recorded
- The `setWorkflowArtifactClient` / `getWorkflowArtifactClient` global state is process-scoped; concurrent workflows in the same process share the client (runner implementations must handle isolation)

### Sandbox Boundary

- Artifact helpers operate within the workflow runner's sandbox. The `path` argument to `upload` and `download` resolves within the runner's filesystem namespace
- The runner must not allow artifact helper paths to escape the sandbox (e.g., via symlink traversal)
- Artifact name validation (`..` rejection) provides defense-in-depth against path traversal in the blob store layer

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowArtifactLibraryUploadStarted` | `ctx.artifacts.upload()` called | `repositoryId`, `workflowRunId`, `artifactName`, `fileSizeBytes`, `contentType`, `hasContentTypeOverride` |
| `WorkflowArtifactLibraryUploadCompleted` | Upload succeeds and artifact confirmed | `repositoryId`, `workflowRunId`, `artifactId`, `artifactName`, `fileSizeBytes`, `contentType`, `durationMs` |
| `WorkflowArtifactLibraryUploadFailed` | Upload rejects | `repositoryId`, `workflowRunId`, `artifactName`, `errorType` (`validation`, `filesystem`, `network`, `quota`, `conflict`), `errorMessage` |
| `WorkflowArtifactLibraryDownloadStarted` | `ctx.artifacts.download()` called | `repositoryId`, `workflowRunId`, `artifactName` |
| `WorkflowArtifactLibraryDownloadCompleted` | Download writes file successfully | `repositoryId`, `workflowRunId`, `artifactId`, `artifactName`, `fileSizeBytes`, `contentType`, `durationMs` |
| `WorkflowArtifactLibraryDownloadFailed` | Download rejects | `repositoryId`, `workflowRunId`, `artifactName`, `errorType` (`not_found`, `expired`, `network`, `filesystem`), `errorMessage` |
| `WorkflowArtifactLibraryClientMissing` | Helper called with no runtime client | `method` (`upload` or `download`), `artifactName` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Library adoption rate | % of workflow runs that call `ctx.artifacts.upload()` at least once | Increasing quarter-over-quarter |
| Upload success rate | `UploadCompleted / UploadStarted` | > 98% |
| Download success rate | `DownloadCompleted / DownloadStarted` | > 98% |
| Upload P95 duration | 95th percentile of `durationMs` on `UploadCompleted` events | < 30s for files under 100 MB |
| Download P95 duration | 95th percentile of `durationMs` on `DownloadCompleted` events | < 30s for files under 100 MB |
| Error distribution | Breakdown of `errorType` across failed events | Validation errors < 5%, network errors < 2% |
| Client-missing error rate | `ClientMissing` events per day | Trending toward 0 |

### Success Indicators

- Workflow authors use `ctx.artifacts` instead of custom shell-based upload scripts
- Artifact-triggered downstream workflows increase as authors discover the integration
- Client-missing errors approach zero as documentation improves
- Upload/download success rates remain above 98%

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Upload initiated | `info` | `artifactName`, `filePath`, `fileSizeBytes`, `contentType`, `workflowRunId` | Log before streaming begins |
| Upload confirmed | `info` | `artifactId`, `artifactName`, `fileSizeBytes`, `durationMs`, `workflowRunId` | Log after server confirms |
| Upload failed | `error` | `artifactName`, `filePath`, `errorType`, `errorMessage`, `workflowRunId` | Include root cause |
| Download initiated | `info` | `artifactName`, `destPath`, `workflowRunId` | Log before fetch begins |
| Download completed | `info` | `artifactId`, `artifactName`, `fileSizeBytes`, `durationMs`, `workflowRunId` | Log after file written |
| Download failed | `error` | `artifactName`, `destPath`, `errorType`, `errorMessage`, `workflowRunId` | Include root cause |
| Runtime client missing | `error` | `method`, `artifactName` | Indicates misconfigured runner |
| Runtime client set | `debug` | `hasClient` (boolean) | Log when `setWorkflowArtifactClient` is called |
| Runtime client cleared | `debug` | — | Log when client is set to `undefined` |

**Log Rules:**
- Never log file contents or full file paths outside the sandbox root
- Always include `workflowRunId` for correlation
- Use structured JSON logging format
- Artifact names are safe to log (validated against PII guidance in docs)

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_artifact_library_uploads_total` | Counter | `repository_id`, `status` (`started`, `completed`, `failed`), `error_type` | Total upload operations |
| `codeplane_workflow_artifact_library_downloads_total` | Counter | `repository_id`, `status` (`started`, `completed`, `failed`), `error_type` | Total download operations |
| `codeplane_workflow_artifact_library_upload_duration_seconds` | Histogram | `repository_id` | Upload duration (buckets: 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300) |
| `codeplane_workflow_artifact_library_download_duration_seconds` | Histogram | `repository_id` | Download duration (buckets: 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300) |
| `codeplane_workflow_artifact_library_upload_bytes_total` | Counter | `repository_id` | Total bytes uploaded through library helpers |
| `codeplane_workflow_artifact_library_download_bytes_total` | Counter | `repository_id` | Total bytes downloaded through library helpers |
| `codeplane_workflow_artifact_library_client_missing_total` | Counter | `method` | Count of calls with no runtime client |
| `codeplane_workflow_artifact_library_validation_errors_total` | Counter | `repository_id`, `field` (`name`, `path`, `content_type`, `size`) | Validation failures by field |

### Alerts

#### Alert: High Artifact Library Upload Failure Rate

**Condition:** `rate(codeplane_workflow_artifact_library_uploads_total{status="failed"}[5m]) / rate(codeplane_workflow_artifact_library_uploads_total{status="started"}[5m]) > 0.1`

**Severity:** Warning (> 10%), Critical (> 25%)

**Runbook:**
1. Check the `error_type` label breakdown to identify the dominant failure mode
2. If `error_type=network`: check blob store connectivity, inspect runner network egress, verify API server health via `/health`
3. If `error_type=quota`: check repository storage quotas, verify billing status, check `codeplane_workflow_artifact_storage_bytes` gauge
4. If `error_type=validation`: check recent workflow deployments for name/size constraint violations; review structured logs for `artifactName` patterns
5. If `error_type=conflict`: check for concurrent runs uploading artifacts with identical names; review workflow definitions
6. Correlate with `codeplane_workflow_artifact_library_upload_duration_seconds` for timeout-related failures

#### Alert: High Artifact Library Download Failure Rate

**Condition:** `rate(codeplane_workflow_artifact_library_downloads_total{status="failed"}[5m]) / rate(codeplane_workflow_artifact_library_downloads_total{status="started"}[5m]) > 0.1`

**Severity:** Warning (> 10%), Critical (> 25%)

**Runbook:**
1. Check the `error_type` label breakdown
2. If `error_type=not_found`: verify that referenced artifacts exist and have not been pruned; check if upstream upload tasks actually completed
3. If `error_type=expired`: check artifact expiration policies; verify that workflow authors are aware of 30-day default
4. If `error_type=network`: check blob store read path, verify signed URL generation, inspect API server health
5. If `error_type=filesystem`: check runner disk space, verify download path permissions
6. Cross-reference with workflow run logs for the failing `workflowRunId` values

#### Alert: Runtime Client Missing Errors

**Condition:** `rate(codeplane_workflow_artifact_library_client_missing_total[5m]) > 0`

**Severity:** Critical

**Runbook:**
1. This indicates the workflow runner is not injecting the artifact client before executing workflows
2. Check runner startup logs for `setWorkflowArtifactClient` calls
3. Verify runner version is compatible with the current `@codeplane-ai/workflow` package version
4. Check if the runner process is forking/spawning workers without propagating the global client
5. If in test environment, ensure test setup calls `setWorkflowArtifactClient(mockClient)` before invoking workflow build functions

#### Alert: Artifact Upload Latency Spike

**Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_artifact_library_upload_duration_seconds_bucket[5m])) > 60`

**Severity:** Warning

**Runbook:**
1. Check blob store latency metrics for storage write path
2. Check network throughput between runner and API server
3. Check `codeplane_workflow_artifact_library_upload_bytes_total` rate for unusual spikes in upload volume
4. Verify API server is not under resource pressure (CPU, memory, connection limits)
5. Check if large artifacts (> 1 GB) are dominating the P95; this may be expected behavior

### Error Cases and Failure Modes

| Error | Cause | Observable Signal | User Impact |
|-------|-------|-------------------|-------------|
| `artifacts.upload is unavailable in this runtime` | No runtime client registered | `client_missing_total` counter | Workflow task fails immediately |
| `artifacts.download is unavailable in this runtime` | No runtime client registered | `client_missing_total` counter | Workflow task fails immediately |
| File not found on upload | `path` argument points to nonexistent file | `uploads_total{status="failed", error_type="filesystem"}` | Task fails with ENOENT |
| Artifact name conflict | Duplicate name in same run | `uploads_total{status="failed", error_type="conflict"}` | Task fails with 409 |
| Artifact name validation failure | Invalid characters, length, or `..` | `validation_errors_total` | Task fails with validation message |
| Size limit exceeded | File > 5 GB | `uploads_total{status="failed", error_type="quota"}` | Task fails with size error |
| Artifact not found on download | Name does not match any artifact in run | `downloads_total{status="failed", error_type="not_found"}` | Task fails with 404 |
| Artifact expired on download | Artifact past `expiresAt` | `downloads_total{status="failed", error_type="expired"}` | Task fails with 410 |
| Blob store unavailable | Storage backend down | `uploads_total{status="failed", error_type="network"}` | Task fails with network error |
| Disk full on download | Runner filesystem at capacity | `downloads_total{status="failed", error_type="filesystem"}` | Task fails with ENOSPC |

## Verification

### SDK Unit / Integration Tests

- [ ] **Upload delegates to runtime client**: Create mock client, register with `setWorkflowArtifactClient`, call `createWorkflowArtifactHelpers().upload("test.txt", "/path", { contentType: "text/plain" })`, verify mock receives exact arguments and return value is forwarded
- [ ] **Download delegates to runtime client**: Same pattern — register mock, call `download("test.txt", "/dest")`, verify delegation and return
- [ ] **Upload without content-type option delegates correctly**: Call `upload("test.txt", "/path")` without options, verify mock receives `undefined` for options
- [ ] **Upload with empty options object**: Call `upload("test.txt", "/path", {})`, verify mock receives `{}` for options
- [ ] **Upload fails closed when no client**: Call `setWorkflowArtifactClient(undefined)`, call `createWorkflowArtifactHelpers().upload(...)`, verify it throws with message containing `"artifacts.upload is unavailable in this runtime"`
- [ ] **Download fails closed when no client**: Same pattern — verify throw with `"artifacts.download is unavailable in this runtime"`
- [ ] **Error message includes method name**: Verify upload error says "upload" and download error says "download"
- [ ] **Client can be replaced**: Register client A, register client B, verify helpers delegate to client B
- [ ] **Client can be cleared and re-set**: Register client, clear with `undefined`, verify failure, re-register new client, verify success
- [ ] **Fresh helpers per invocation**: Call `createWorkflowArtifactHelpers()` twice, register different clients between calls, verify each helper set delegates to the client active at call time (not creation time)
- [ ] **createSmithers injects artifacts on context**: Call `createSmithers({})`, invoke `smithers((ctx) => ...)`, verify `ctx.artifacts` is a `WorkflowArtifactClient` with `upload` and `download` methods
- [ ] **Context artifacts are usable (not undefined)**: Inside `smithers()` build function, verify `typeof ctx.artifacts.upload === 'function'` and `typeof ctx.artifacts.download === 'function'`
- [ ] **Type safety**: Verify TypeScript compilation fails if `ctx.artifacts` is used with wrong argument types (compile-time test)

### Artifact Name Validation Tests (API-level)

- [ ] **Valid simple name**: Upload with name `"build-output.zip"` — succeeds
- [ ] **Valid name with path separator**: Upload with name `"dist/bundle.js"` — succeeds
- [ ] **Valid name with dots**: Upload with name `"v1.0.0-rc.1.tar.gz"` — succeeds
- [ ] **Valid name with underscores**: Upload with name `"test_report_2026.html"` — succeeds
- [ ] **Valid single-character name**: Upload with name `"a"` — succeeds
- [ ] **Valid 255-character name**: Upload with name of exactly 255 valid characters — succeeds
- [ ] **Empty name rejected**: Upload with name `""` — returns validation error
- [ ] **256-character name rejected**: Upload with name of 256 characters — returns validation error
- [ ] **1000-character name rejected**: Upload with name of 1000 characters — returns validation error
- [ ] **Path traversal rejected**: Upload with name `"../../etc/passwd"` — returns validation error
- [ ] **Embedded path traversal rejected**: Upload with name `"a/../b"` — returns validation error
- [ ] **Special characters rejected**: Upload with name containing `<` — returns validation error
- [ ] **Pipe character rejected**: Upload with name containing `|` — returns validation error
- [ ] **Backslash rejected**: Upload with name containing `\` — returns validation error
- [ ] **Colon rejected**: Upload with name containing `:` — returns validation error
- [ ] **Asterisk rejected**: Upload with name containing `*` — returns validation error
- [ ] **Question mark rejected**: Upload with name containing `?` — returns validation error
- [ ] **Double quote rejected**: Upload with name containing `"` — returns validation error
- [ ] **Leading whitespace rejected**: Upload with name `" test.txt"` — returns validation error
- [ ] **Trailing whitespace rejected**: Upload with name `"test.txt "` — returns validation error
- [ ] **Tab character rejected**: Upload with name `"test\ttxt"` — returns validation error
- [ ] **Newline rejected**: Upload with name `"test\n.txt"` — returns validation error
- [ ] **Null byte rejected**: Upload with name containing `\0` — returns validation error

### File Size and Content Tests (API-level)

- [ ] **Zero-byte file upload**: Upload empty file — succeeds with `size: 0`
- [ ] **1-byte file upload**: Upload single-byte file — succeeds with `size: 1`
- [ ] **100 MB file upload**: Upload 100 MB file — succeeds within reasonable duration
- [ ] **5 GB file upload (maximum)**: Upload exactly 5 GB file — succeeds
- [ ] **5 GB + 1 byte file rejected**: Upload 5,000,000,001 byte file — returns size limit error
- [ ] **Binary content preserved**: Upload binary file, download, verify byte-for-byte match
- [ ] **Text content preserved**: Upload text file, download, verify content matches
- [ ] **Content-type override**: Upload with `{ contentType: "application/json" }`, verify record has `contentType: "application/json"`
- [ ] **Content-type auto-detection**: Upload `.html` file without contentType option, verify record has `contentType: "text/html"` or appropriate detected type

### Duplicate and Conflict Tests (API-level)

- [ ] **Duplicate name in same run rejected**: Upload `"a.txt"` twice in same run — second upload returns conflict error
- [ ] **Same name in different runs allowed**: Upload `"a.txt"` in run 1 and run 2 — both succeed
- [ ] **Case-sensitive names are distinct**: Upload `"A.txt"` and `"a.txt"` in same run — both succeed

### Download Tests (API-level)

- [ ] **Download existing artifact**: Upload `"test.txt"`, download `"test.txt"` — succeeds, file contents match
- [ ] **Download nonexistent artifact**: Download `"nonexistent.txt"` — returns 404 / not-found error
- [ ] **Download expired artifact**: Upload artifact, wait for expiration (or mock), download — returns 410 / expired error
- [ ] **Download pending artifact**: Upload artifact but do not confirm, attempt download — returns appropriate error (409 or 404)
- [ ] **Downloaded file overwrites existing**: Create file at destination, download artifact to same path — file is replaced with artifact contents

### End-to-End: Workflow Runtime Integration

- [ ] **E2E: Upload artifact from workflow task**: Define workflow with task that calls `ctx.artifacts.upload("output.txt", filePath)`, run workflow, verify artifact appears in run's artifact list via API
- [ ] **E2E: Download artifact from workflow task**: Define workflow with two tasks — first uploads, second downloads — run workflow, verify second task completes successfully and has correct file contents
- [ ] **E2E: Upload triggers downstream workflow**: Define workflow A that uploads `"dist.zip"`, define workflow B with `on.workflowArtifact({ workflows: ["A"] })`, run workflow A, verify workflow B is triggered automatically
- [ ] **E2E: Artifact visible in CLI after library upload**: Run workflow that uploads artifact via `ctx.artifacts.upload`, then run `codeplane artifact list <runId>`, verify artifact appears with correct name, size, and content type
- [ ] **E2E: Artifact downloadable via CLI after library upload**: Run workflow that uploads, then run `codeplane artifact download <runId> <name>`, verify file contents match
- [ ] **E2E: Artifact visible in web UI after library upload**: Run workflow that uploads, navigate to workflow run detail in web UI, verify artifact appears in artifact list
- [ ] **E2E: Workflow task failure on client-missing**: Run workflow in misconfigured runner (no artifact client), verify task fails with descriptive error and run is marked as failed

### CLI Integration Tests

- [ ] **CLI list shows library-uploaded artifacts**: Upload artifact via library in workflow, `codeplane artifact list <runId>` — shows artifact with name, size, content type, status
- [ ] **CLI download retrieves library-uploaded artifact**: `codeplane artifact download <runId> <name> --output ./out.txt` — file written successfully, contents match original
- [ ] **CLI list JSON output format**: `codeplane artifact list <runId> --json` — returns valid JSON array with correct schema

### API Integration Tests

- [ ] **GET /api/repos/:owner/:repo/actions/runs/:id/artifacts**: Returns artifact list including library-uploaded artifacts with correct metadata
- [ ] **GET /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name/download**: Returns download URL or streams file for library-uploaded artifact
- [ ] **DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name**: Deletes library-uploaded artifact (requires write access)
- [ ] **GET artifacts for run with no artifacts**: Returns empty list `{ artifacts: [] }`
- [ ] **GET artifacts for nonexistent run**: Returns 404
- [ ] **DELETE artifact with read-only access**: Returns 403

### Playwright (Web UI) E2E Tests

- [ ] **Artifact tab shows library-uploaded artifacts**: Navigate to workflow run detail, verify artifacts tab/section displays artifact name, size, content type, and status
- [ ] **Download button works for ready artifact**: Click download button, verify file download initiates
- [ ] **Expired artifact shows expired status**: Verify expired artifacts display appropriate status indicator
- [ ] **Empty artifact list state**: Navigate to run with no artifacts, verify empty state message is displayed
