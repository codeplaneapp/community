# REPO_LFS_BATCH

Specification for REPO_LFS_BATCH.

## High-Level User POV

When working with large files—binaries, media assets, datasets, trained models, or build artifacts—developers need a way to store and retrieve these objects without bloating repository history. Codeplane's LFS Batch endpoint is the core mechanism that makes this possible. It is the gateway through which every LFS-aware client negotiates how to upload and download large objects for a given repository.

From a user's perspective, the LFS batch interaction is largely invisible. When a user pushes a commit that includes LFS-tracked files, their jj or git LFS client automatically contacts the Codeplane server's batch endpoint, declares which objects it needs to upload, and receives back time-limited signed URLs for each object. The client then uploads each file directly to those URLs. Conversely, when a user clones or fetches a repository, the client declares which objects it needs to download, and the batch endpoint responds with signed download URLs for each available object.

The experience should be seamless: large files just work. If a file has already been uploaded, the server tells the client it already exists and skips the redundant transfer. If a file is missing from the blob store, the server communicates this clearly so the client can respond appropriately. The user never has to manually construct URLs, manage tokens, or worry about storage locations.

This feature is critical for teams working with media-heavy repositories, machine learning pipelines, game development assets, and any workflow where binary artifacts live alongside source code. It brings Codeplane into parity with established LFS hosting expectations while maintaining Codeplane's jj-native and self-hosted-first philosophy.

## Acceptance Criteria

### Core Functionality

- [ ] The batch endpoint accepts a JSON body with an `operation` field (either `"upload"` or `"download"`) and an `objects` array containing one or more `{ oid, size }` entries.
- [ ] For `upload` operations, the endpoint returns a signed upload URL for each object that does not already exist in storage.
- [ ] For `upload` operations, the endpoint returns `exists: true` (without an upload URL) for objects that already exist in storage with a valid blob.
- [ ] For `download` operations, the endpoint returns a signed download URL and `exists: true` for each object that exists in both the database and blob store.
- [ ] For `download` operations, the endpoint returns `exists: false` (without a download URL) for objects missing from the database or blob store.
- [ ] Signed URLs are time-limited (default 5 minutes) and cryptographically verified.
- [ ] The response is an array of `LFSBatchObjectResponse` objects, one per requested object, preserving request order.

### Input Validation

- [ ] The `operation` field must be exactly `"upload"` or `"download"` (case-insensitive after trimming). Any other value returns HTTP 400.
- [ ] The `objects` array must be non-empty. An empty array or missing `objects` field returns HTTP 400.
- [ ] Each object `oid` must be a valid SHA-256 hex string: exactly 64 characters, consisting only of `[0-9a-f]`. Leading/trailing whitespace is trimmed. Uppercase hex letters are lowercased. Invalid OIDs return HTTP 422 (validation failed).
- [ ] Each object `size` must be a positive integer (> 0). Zero or negative sizes return HTTP 422.
- [ ] The request body must be valid JSON. Malformed JSON returns HTTP 400.
- [ ] Missing request body returns HTTP 400.

### Boundary Constraints

- [ ] OID length must be exactly 64 characters after trimming. 63 characters or 65 characters must be rejected.
- [ ] OID characters outside `[0-9a-f]` (after lowercasing) must be rejected—including `g-z`, uppercase-only without lowercasing, special characters, and Unicode.
- [ ] There is no server-enforced maximum on the number of objects in a single batch request, but excessively large batches may be constrained by request body size limits and rate limiting.
- [ ] The `size` field is a numeric type. Non-numeric values should result in a parsing or validation error.
- [ ] Signed URLs must not be usable after their expiry timestamp.
- [ ] Signed URLs must not be usable if the HMAC token is tampered with.

### Edge Cases

- [ ] Duplicate OIDs in the same batch request: each occurrence is processed independently and returns a response entry.
- [ ] Object exists in database but blob is missing from storage: for uploads, a new upload URL is generated. For downloads, `exists: false` is returned.
- [ ] Object does not exist in database but a blob exists at the expected path: treated as non-existent for downloads. For uploads, a signed URL is returned.
- [ ] Concurrent upload requests for the same OID: the confirm step handles uniqueness conflicts gracefully.
- [ ] Repository does not exist: returns HTTP 404.
- [ ] Owner does not exist: returns HTTP 404.
- [ ] Empty owner or repo path segments (whitespace only): returns HTTP 400.

### Definition of Done

- [ ] All acceptance criteria above pass in automated tests.
- [ ] Upload and download operations work end-to-end: batch → signed URL → blob transfer → confirm (for uploads).
- [ ] Permission checks enforce read access for downloads and write access for uploads.
- [ ] The endpoint is registered and reachable at `POST /api/repos/:owner/:repo/lfs/batch`.
- [ ] Telemetry events fire for batch operations.
- [ ] Structured logs capture request metadata for debugging.
- [ ] Prometheus metrics track batch request volume, latency, and error rates.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/lfs/batch`

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <token>` or session cookie (required for uploads; optional for downloads on public repos)

**Request Body:**

```json
{
  "operation": "upload" | "download",
  "objects": [
    {
      "oid": "<64-char lowercase hex SHA-256>",
      "size": "<positive integer>"
    }
  ]
}
```

**Success Response (HTTP 200):**

```json
[
  {
    "oid": "abc123...",
    "size": 1048576,
    "exists": false,
    "upload_url": "/api/blobs/upload/repos%2F42%2Flfs%2Fabc123...?token=...&expires=..."
  },
  {
    "oid": "def456...",
    "size": 2097152,
    "exists": true
  }
]
```

For upload operations, each entry includes:
- `oid`: the requested object identifier, echoed back
- `size`: the size (from existing record if known, otherwise from request)
- `exists`: `true` if the blob already exists and no upload is needed; `false` otherwise
- `upload_url`: present only when `exists` is `false`; a time-limited signed URL for the client to PUT the blob data

For download operations, each entry includes:
- `oid`: the requested object identifier
- `size`: the stored object size
- `exists`: `true` if the blob is available; `false` otherwise
- `download_url`: present only when `exists` is `true`; a time-limited signed URL for the client to GET the blob data

**Error Responses:**

| Status | Condition |
|--------|----------|
| 400 | Invalid JSON body, missing/invalid `operation`, empty `objects` array |
| 401 | Upload operation without authentication |
| 403 | Insufficient permission (read for download, write for upload) |
| 404 | Repository or owner not found |
| 422 | Invalid OID format or invalid size on any object in the batch |

### SDK Shape

The `LFSService` in `@codeplane/sdk` exposes:

```typescript
class LFSService {
  async batch(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    input: LFSBatchInput
  ): Promise<LFSBatchObjectResponse[]>;
}
```

Where:
```typescript
interface LFSBatchInput {
  operation: string;
  objects: LFSObjectInput[];
}

interface LFSObjectInput {
  oid: string;
  size: number;
}

interface LFSBatchObjectResponse {
  oid: string;
  size: number;
  exists: boolean;
  upload_url?: string;
  download_url?: string;
}
```

### CLI Command

No dedicated LFS CLI subcommand. The batch endpoint is accessible via the generic API command:

```bash
codeplane api /api/repos/:owner/:repo/lfs/batch \
  --method POST \
  --json '{"operation":"upload","objects":[{"oid":"<sha256>","size":1234}]}'
```

The CLI also acts as a jj/git LFS custom transfer adapter when configured as the LFS remote.

### Interaction with Confirm Endpoint

The batch endpoint is the first step in a two-phase upload flow:

1. **Batch** (`POST /lfs/batch`): Client declares objects to upload. Server returns signed URLs.
2. **Upload**: Client PUTs blob data to each signed URL.
3. **Confirm** (`POST /lfs/confirm`): Client confirms each upload. Server verifies blob existence and creates the database record.

### Documentation

- **LFS Quickstart Guide**: How to configure jj/git LFS to use a Codeplane repository as the LFS remote, including `.lfsconfig` setup and authentication.
- **LFS API Reference**: Full endpoint documentation for the batch, confirm, list, and delete endpoints, with request/response examples.
- **LFS Storage Limits**: Documentation of any storage quotas tied to billing, and how LFS object sizes factor into storage calculations.
- **LFS Troubleshooting**: Common error messages (expired URLs, permission denied, invalid OID), their causes, and resolution steps.

## Permissions & Security

### Authorization Roles

| Operation | Required Permission | Anonymous (Public Repo) | Anonymous (Private Repo) |
|-----------|-------------------|------------------------|-------------------------|
| `download` | Read | ✅ Allowed | ❌ Forbidden (403) |
| `upload` | Write | ❌ Unauthorized (401) | ❌ Unauthorized (401) |

Permission is resolved through the following hierarchy:
1. **Repository owner** (personal or org owner): full access (read + write)
2. **Organization owner**: full access to all org repos
3. **Team member**: highest team permission (`admin`, `write`, or `read`) for team-linked repos
4. **Collaborator**: explicit collaborator permission (`admin`, `write`, or `read`)
5. **Public repo visitor**: read-only access for download operations

Write access requires being the repo owner, org owner, a team member with `write` or `admin`, or a collaborator with `write` or `admin`.

### Rate Limiting

- The batch endpoint is subject to the global rate-limiting middleware applied to all API routes.
- Additional per-repository rate limiting should be considered: 60 batch requests per minute per authenticated user per repository; 10 per minute for unauthenticated download requests.

### Security Constraints

- **Signed URL integrity**: Upload and download URLs are signed with HMAC-SHA256 using a server-side secret (`CODEPLANE_BLOB_SIGNING_SECRET`). Tampered tokens are rejected.
- **Signed URL expiry**: URLs expire after 5 minutes by default. Expired URLs are rejected.
- **Path traversal protection**: Blob keys are sanitized to prevent `..` traversal in filesystem paths.
- **OID validation**: Strict SHA-256 hex validation prevents injection of malicious key strings into blob paths.
- **No PII in URLs**: Signed URLs contain only the blob key (repository ID + OID), HMAC token, and expiry timestamp.
- **No PII in responses**: The batch response contains only object metadata (OID, size, existence, URLs).
- **Upload authentication**: All upload operations require authentication. Unauthenticated upload attempts receive 401 before any processing occurs.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|-----------|---------|------------|
| `LFSBatchRequested` | Every batch request processed | `operation`, `object_count`, `repo_id`, `owner`, `repo_name`, `actor_id` (nullable), `has_auth` |
| `LFSBatchUploadURLsGenerated` | Upload batch completes with at least one new URL | `urls_generated`, `objects_already_existed`, `repo_id`, `actor_id` |
| `LFSBatchDownloadURLsGenerated` | Download batch completes with at least one URL | `urls_generated`, `objects_missing`, `repo_id`, `actor_id` (nullable) |
| `LFSBatchValidationFailed` | Request rejected due to validation error | `error_code`, `error_field`, `repo_id`, `actor_id` (nullable) |
| `LFSBatchPermissionDenied` | Request rejected due to insufficient permissions | `operation`, `repo_id`, `actor_id` (nullable), `repo_is_public` |

### Funnel Metrics

- **Upload completion rate**: Percentage of `LFSBatchUploadURLsGenerated` events followed by corresponding `LFSConfirmUpload` events within the URL expiry window. A low rate indicates clients failing to complete uploads.
- **Download success rate**: Percentage of `LFSBatchDownloadURLsGenerated` events where the blob was successfully served.
- **Batch size distribution**: Histogram of `object_count` per batch request.
- **LFS adoption rate**: Number of unique repositories with at least one `LFSBatchRequested` event per week.
- **Error rate by type**: Breakdown of 400/401/403/404/422 responses.

### Success Indicators

- Upload completion rate > 95% indicates healthy client-server interaction.
- < 1% of batch requests result in 5xx errors.
- Average batch response latency < 200ms for batches of ≤ 100 objects.
- Growing LFS adoption rate week-over-week in active repositories.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|----------|-------|------------------|-------------|
| Batch request received | `info` | `operation`, `object_count`, `owner`, `repo`, `actor_id`, `request_id` | Entry log for every batch request |
| Batch request completed | `info` | `operation`, `object_count`, `urls_generated`, `existing_count`, `missing_count`, `duration_ms`, `request_id` | Summary log after processing |
| Batch validation failed | `warn` | `error`, `field`, `owner`, `repo`, `request_id` | Input validation rejection |
| Batch permission denied | `warn` | `operation`, `owner`, `repo`, `actor_id`, `request_id` | Authorization failure |
| Repository not found | `warn` | `owner`, `repo`, `request_id` | 404 on repo resolution |
| Blob existence check failed | `error` | `oid`, `repo_id`, `blob_key`, `error`, `request_id` | Unexpected blob store error |
| Signed URL generated | `debug` | `oid`, `operation`, `blob_key`, `expiry_ms`, `request_id` | Per-object URL generation |
| Batch internal error | `error` | `error`, `stack`, `owner`, `repo`, `operation`, `request_id` | Unhandled exception |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_lfs_batch_requests_total` | Counter | `operation`, `status_code` | Total batch requests |
| `codeplane_lfs_batch_duration_seconds` | Histogram | `operation` | Request processing duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_lfs_batch_objects_total` | Counter | `operation`, `result` | Objects processed (`url_generated`, `exists`, `missing`) |
| `codeplane_lfs_batch_objects_per_request` | Histogram | `operation` | Objects per batch (buckets: 1, 5, 10, 25, 50, 100, 250, 500) |
| `codeplane_lfs_batch_errors_total` | Counter | `error_type` | Errors by type (`validation`, `auth`, `permission`, `not_found`, `internal`) |
| `codeplane_lfs_signed_url_generation_duration_seconds` | Histogram | `operation` | Time to generate signed URLs |
| `codeplane_lfs_blob_exists_check_duration_seconds` | Histogram | | Blob existence check duration |

### Alerts

#### Alert: LFS Batch High Error Rate
**Condition:** `rate(codeplane_lfs_batch_errors_total{error_type="internal"}[5m]) > 0.1`
**Severity:** Critical
**Runbook:**
1. Check server logs for `lfs_batch_internal_error` entries with stack traces.
2. Verify blob store connectivity: check filesystem mount or GCS health.
3. Verify database connectivity: check PostgreSQL/PGLite connection pool.
4. Check for disk space exhaustion on the blob store volume.
5. If blob store operations timeout, check I/O wait metrics.
6. If DB queries fail, check for lock contention on `lfs_objects`.
7. Restart server if state is corrupted. Verify recovery with test batch request.

#### Alert: LFS Batch High Latency
**Condition:** `histogram_quantile(0.95, rate(codeplane_lfs_batch_duration_seconds_bucket[5m])) > 2`
**Severity:** Warning
**Runbook:**
1. Check `codeplane_lfs_batch_objects_per_request` for unusually large batches.
2. Check DB query latency for `getLFSObjectByOID` (runs per-object in loop).
3. Check blob store `exists()` call latency.
4. If latency correlates with batch size, consider parallel processing.
5. Check for missing indexes on `lfs_objects(repository_id, oid)`.
6. Check I/O metrics and filesystem cache hit rates.

#### Alert: LFS Batch Permission Denial Spike
**Condition:** `rate(codeplane_lfs_batch_errors_total{error_type="permission"}[15m]) > 5`
**Severity:** Warning
**Runbook:**
1. Check logs for repositories and actors involved.
2. Check for CI systems using tokens with insufficient scope.
3. Check if repo visibility changed from public to private.
4. Verify collaborator/team permission resolution.
5. If correlated with a deploy, check for permission logic regressions.

#### Alert: LFS Signed URL Expiry Errors
**Condition:** Sustained increase in blob endpoint 403s from expired tokens.
**Severity:** Warning
**Runbook:**
1. Check if 5-minute expiry is too short for large uploads on slow connections.
2. Check for clock skew in multi-instance deployments.
3. Consider increasing `signedURLExpiryMs`.
4. Verify NTP synchronization across instances.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Recovery |
|-----------|-------------|----------|
| Malformed JSON body | 400 | Client fixes request format |
| Invalid operation | 400 | Client uses "upload" or "download" |
| Empty objects array | 400 | Client includes at least one object |
| Invalid OID format | 422 | Client provides valid SHA-256 hex |
| Invalid size (≤ 0) | 422 | Client provides positive integer |
| No auth for upload | 401 | Client authenticates |
| Insufficient permissions | 403 | User requests access |
| Repo not found | 404 | Client uses correct owner/repo |
| DB connection failure | 500 | Investigate DB health |
| Blob store failure | 500 | Investigate blob store health |
| Signed URL generation failure | 500 | Check signing secret config |

## Verification

### API Integration Tests

#### Happy Path Tests

- [ ] **Upload batch with single new object**: POST batch with `operation: "upload"` and one valid `{ oid, size }`. Verify response has one entry with `exists: false` and valid `upload_url`.
- [ ] **Upload batch with multiple new objects**: POST batch with 5 objects. Verify 5 entries each with `upload_url` and `exists: false`.
- [ ] **Upload batch with already-existing object**: Upload end-to-end (batch → PUT → confirm), re-request batch for same OID. Verify `exists: true`, no `upload_url`.
- [ ] **Upload batch with mix of new and existing**: One existing OID + one new OID. Verify correct `exists` and `upload_url` per entry.
- [ ] **Download batch with existing object**: After upload+confirm, POST download batch. Verify `exists: true` and valid `download_url`.
- [ ] **Download batch with missing object**: POST download for never-uploaded OID. Verify `exists: false`, no `download_url`.
- [ ] **Download on public repo without auth**: Public repo with uploaded object, request without auth. Verify HTTP 200.
- [ ] **Upload then download round-trip**: Upload via signed URL, confirm, download via signed URL, verify content matches.
- [ ] **Signed URL works for upload**: PUT blob to returned `upload_url`. Verify blob stored.
- [ ] **Signed URL works for download**: GET blob from returned `download_url`. Verify correct data.

#### OID Validation Tests

- [ ] **Valid 64-char hex OID**: accepted.
- [ ] **Uppercase hex OID**: accepted (lowercased).
- [ ] **OID with leading/trailing whitespace**: accepted (trimmed).
- [ ] **63-char OID (too short)**: HTTP 422.
- [ ] **65-char OID (too long)**: HTTP 422.
- [ ] **OID with non-hex char 'g'**: HTTP 422.
- [ ] **OID with special characters**: HTTP 422.
- [ ] **OID with Unicode**: HTTP 422.
- [ ] **Empty OID string**: HTTP 422.
- [ ] **Whitespace-only OID**: HTTP 422.

#### Size Validation Tests

- [ ] **Size = 1** (minimum valid): accepted.
- [ ] **Size = 5368709120** (5 GB): accepted.
- [ ] **Size = 0**: HTTP 422.
- [ ] **Size = -1**: HTTP 422.
- [ ] **Size = Number.MAX_SAFE_INTEGER**: accepted.

#### Operation Validation Tests

- [ ] **"upload"**: accepted.
- [ ] **"download"**: accepted.
- [ ] **"UPLOAD" (uppercase)**: accepted.
- [ ] **"  upload  " (whitespace)**: accepted.
- [ ] **"delete"**: HTTP 400.
- [ ] **"" (empty)**: HTTP 400.
- [ ] **Missing operation field**: HTTP 400.

#### Objects Array Tests

- [ ] **Empty array `[]`**: HTTP 400.
- [ ] **Missing objects field**: HTTP 400.
- [ ] **Single object**: accepted.
- [ ] **100 objects**: all processed.
- [ ] **Duplicate OIDs**: both processed and returned.

#### Auth and Permission Tests

- [ ] **Upload without auth**: HTTP 401.
- [ ] **Upload with write-access PAT**: HTTP 200.
- [ ] **Upload with read-only collaborator**: HTTP 403.
- [ ] **Upload as repo owner**: HTTP 200.
- [ ] **Upload as org owner**: HTTP 200.
- [ ] **Upload as write team member**: HTTP 200.
- [ ] **Upload as read-only team member**: HTTP 403.
- [ ] **Upload as admin collaborator**: HTTP 200.
- [ ] **Download from public repo without auth**: HTTP 200.
- [ ] **Download from private repo without auth**: HTTP 403.
- [ ] **Download from private repo with read collaborator**: HTTP 200.

#### Error Response Tests

- [ ] **Malformed JSON body**: HTTP 400.
- [ ] **Non-existent repository**: HTTP 404.
- [ ] **Non-existent owner**: HTTP 404.
- [ ] **Empty owner string**: HTTP 400.
- [ ] **Empty repo name string**: HTTP 400.

#### Edge Case Tests

- [ ] **Object in DB but blob missing (upload)**: `exists: false` with `upload_url`.
- [ ] **Object in DB but blob missing (download)**: `exists: false`, no URL.
- [ ] **Concurrent batch requests for same OID**: consistent results.
- [ ] **Batch after signed URL expires**: new batch generates fresh URL.

### CLI E2E Tests

- [ ] **CLI batch upload via `codeplane api`**: Verify exit 0 and valid JSON.
- [ ] **CLI batch download via `codeplane api`**: Verify response structure.
- [ ] **CLI batch without auth**: Verify non-zero exit for upload.
- [ ] **CLI batch with invalid repo**: Verify error response.

### End-to-End Flow Tests

- [ ] **Full upload lifecycle**: Create repo → batch (upload) → PUT blob → confirm → batch (download) → GET blob → verify content.
- [ ] **Idempotent re-upload**: Upload+confirm → batch same OID → `exists: true`, no URL.
- [ ] **Multi-object mixed batch**: Upload 3, confirm 2, download all 3. Verify 2 exist, 1 missing.
- [ ] **Cross-user download on public repo**: User A uploads, User B downloads without permissions. Verify success.
- [ ] **Private repo isolation**: User A uploads, User B (no perms) downloads. Verify HTTP 403.
