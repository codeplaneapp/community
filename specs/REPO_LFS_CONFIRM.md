# REPO_LFS_CONFIRM

Specification for REPO_LFS_CONFIRM.

## High-Level User POV

After a user pushes large files to a Codeplane repository, their LFS client completes a two-phase upload process. In the first phase, the client requests a signed upload URL from the batch endpoint. In the second phase, the client uploads the actual file data directly to that signed URL, bypassing the API server entirely for efficient transfer. But at this point, the server only has a blob sitting in storage with no corresponding database record — it does not yet "know" the object is part of the repository.

The confirm step closes this gap. Once the client finishes uploading the blob, it calls the confirm endpoint with the object's SHA-256 identifier and declared size. The server verifies that the blob actually landed in storage, then registers the object in the repository's metadata. From this moment forward, the object appears in the repository's LFS object list, can be downloaded by collaborators, and is tracked as part of the repository's storage usage.

For the end user, this entire flow is invisible. Their jj or git LFS client handles the batch → upload → confirm sequence automatically during `jj git push` or `git push`. The confirm step is the handshake that tells the server "yes, I actually uploaded that blob" so the repository's state is consistent. Without it, uploaded blobs would be orphaned storage with no metadata — discoverable by nobody, downloadable by nobody, and invisible in the UI.

This feature is also designed to be safe under concurrency. If two clients or CI jobs simultaneously upload and confirm the same object (same SHA-256 content hash), the server handles the race gracefully. The first confirm creates the record; the second confirm returns the existing record without error. The user never sees a conflict.

For users interacting with the API directly — scripts, custom transfer agents, or the Codeplane CLI's generic `api` command — the confirm endpoint is the explicit step they must call after uploading a blob to finalize the LFS object registration.

## Acceptance Criteria

### Core Functionality

- [ ] The confirm endpoint accepts a JSON body with `oid` (SHA-256 hex string) and `size` (positive integer).
- [ ] The endpoint verifies the blob exists at the expected storage path (`repos/{repository_id}/lfs/{oid}`) before creating a database record.
- [ ] On success, the endpoint creates an `lfs_objects` database record associating the OID with the repository and returns HTTP 201 with the object metadata.
- [ ] The response body includes `id`, `repository_id`, `oid`, `size`, and `created_at`.
- [ ] If the object already exists in the database (concurrent upload / re-confirm), the endpoint returns HTTP 201 with the existing record instead of failing.
- [ ] After a successful confirm, the object is visible via the LFS object list endpoint.
- [ ] After a successful confirm, a subsequent batch download request for the same OID returns `exists: true` with a download URL.

### Input Validation

- [ ] The `oid` field must be a valid SHA-256 hex string: exactly 64 characters after trimming, consisting only of `[0-9a-f]` (case-insensitive input; server lowercases). Invalid OIDs return HTTP 422 (validation failed).
- [ ] The `size` field must be a positive integer (> 0). Zero or negative sizes return HTTP 422.
- [ ] The request body must be valid JSON. Malformed JSON returns HTTP 400 with message `"invalid request body"`.
- [ ] Missing request body returns HTTP 400.
- [ ] Missing `oid` or `size` fields in the JSON body return HTTP 422.

### Boundary Constraints

- [ ] OID length must be exactly 64 characters after trimming. 63 characters must be rejected with HTTP 422. 65 characters must be rejected with HTTP 422.
- [ ] OID characters outside `[0-9a-f]` (after lowercasing) must be rejected — including `g-z`, special characters, spaces within the string, and Unicode.
- [ ] Whitespace-only OID (e.g., 64 spaces) must be rejected with HTTP 422 after trimming produces an empty string.
- [ ] `size` = 1 (minimum valid) must be accepted.
- [ ] `size` = `Number.MAX_SAFE_INTEGER` (9007199254740991) must be accepted without overflow.
- [ ] The `oid` is trimmed of leading/trailing whitespace before validation.
- [ ] The `oid` is lowercased before storage, so `"ABC123..."` and `"abc123..."` refer to the same object.

### Blob Verification

- [ ] If the blob does not exist at the expected storage path, the endpoint returns HTTP 400 with message `"blob does not exist"`.
- [ ] The endpoint must not create a database record when the blob is missing — no orphaned metadata.
- [ ] The blob existence check uses the storage key pattern `repos/{repository_id}/lfs/{oid}`.

### Idempotency and Concurrency

- [ ] Confirming an already-confirmed object (same OID, same repository) returns HTTP 201 with the original record. It does not return an error.
- [ ] If two concurrent confirm requests race for the same OID, one creates the record and the other returns the existing record. Neither fails with a 500.
- [ ] The database unique constraint on `(repository_id, oid)` is the mechanism that prevents duplicate records.

### Edge Cases

- [ ] Confirming an object for a non-existent repository returns HTTP 404.
- [ ] Confirming an object for a non-existent owner returns HTTP 404.
- [ ] Empty owner or repo path segments (whitespace only) return HTTP 400.
- [ ] Confirming with a valid OID but a `size` that differs from the actual blob size still succeeds — the server stores the client-declared size.
- [ ] Extra fields in the JSON body beyond `oid` and `size` are ignored.

### Definition of Done

- [ ] All acceptance criteria above pass in automated tests.
- [ ] The confirm endpoint is registered and reachable at `POST /api/repos/:owner/:repo/lfs/confirm`.
- [ ] The end-to-end flow works: batch (upload) → PUT blob to signed URL → confirm → batch (download) → GET blob from signed URL → verify content matches.
- [ ] Permission checks enforce write access. Unauthenticated requests receive HTTP 401. Insufficient permissions receive HTTP 403.
- [ ] Telemetry events fire for confirm operations.
- [ ] Structured logs capture request metadata.
- [ ] Prometheus metrics track confirm request volume, latency, and error rates.
- [ ] Documentation for the LFS confirm endpoint is accurate and consistent with the implemented behavior.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/lfs/confirm`

**Path Parameters:**
- `owner` — repository owner username or organization name
- `repo` — repository name

**Request Headers:**
- `Content-Type: application/json` (enforced by mutation middleware)
- `Authorization: Bearer <token>` or session cookie (required)

**Request Body:**

```json
{
  "oid": "<64-char lowercase hex SHA-256>",
  "size": 1048576
}
```

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `oid` | string | Exactly 64 hex chars `[0-9a-fA-F]`, trimmed and lowercased | SHA-256 content hash of the uploaded blob |
| `size` | number | Positive integer (> 0) | Declared file size in bytes |

**Success Response (HTTP 201 Created):**

```json
{
  "id": 42,
  "repository_id": 7,
  "oid": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  "size": 1048576,
  "created_at": "2026-03-22T14:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique database ID of the LFS object record |
| `repository_id` | number | ID of the repository this object belongs to |
| `oid` | string | Normalized (lowercased) SHA-256 hex string |
| `size` | number | Object size in bytes |
| `created_at` | string | ISO 8601 timestamp of when the record was created |

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Malformed JSON body | `{ "message": "invalid request body" }` |
| 400 | Blob does not exist in storage | `{ "message": "blob does not exist" }` |
| 400 | Empty owner or repo path segment | `{ "message": "owner is required" }` or `{ "message": "repository name is required" }` |
| 401 | No authentication provided | `{ "message": "authentication required" }` |
| 403 | Authenticated user lacks write access | `{ "message": "permission denied" }` |
| 404 | Repository or owner not found | `{ "message": "repository not found" }` |
| 422 | Invalid OID format | `{ "message": "Validation Failed", "errors": [{ "resource": "LFSObject", "field": "oid", "code": "invalid" }] }` |
| 422 | Invalid size (≤ 0) | `{ "message": "Validation Failed", "errors": [{ "resource": "LFSObject", "field": "size", "code": "invalid" }] }` |
| 500 | Internal error persisting object | `{ "message": "failed to persist lfs object" }` |

### SDK Shape

The `LFSService` in `@codeplane/sdk` exposes:

```typescript
class LFSService {
  async confirmUpload(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    input: LFSConfirmUploadInput
  ): Promise<LFSObjectResponse>;
}
```

Where:

```typescript
interface LFSConfirmUploadInput {
  oid: string;
  size: number;
}

interface LFSObjectResponse {
  id: number;
  repository_id: number;
  oid: string;
  size: number;
  created_at: string;
}
```

**Service behavior:**
1. Resolves the repository by owner/name (throws 404 if not found).
2. Checks write access for the actor (throws 401 if no actor, 403 if insufficient permission).
3. Validates and normalizes the OID (trims, lowercases, verifies 64-char hex).
4. Validates size > 0.
5. Constructs the blob storage key: `repos/{repository_id}/lfs/{oid}`.
6. Checks that the blob exists via `BlobStore.exists()` (throws 400 if missing).
7. Inserts a row into `lfs_objects` (repository_id, oid, size, gcs_path).
8. If insert fails due to unique constraint violation (23505), fetches and returns the existing record.
9. If insert fails for other reasons, throws 500.
10. Returns the mapped `LFSObjectResponse`.

### CLI Command

No dedicated LFS confirm CLI subcommand. The confirm endpoint is accessible via the generic API command:

```bash
codeplane api /api/repos/myorg/myrepo/lfs/confirm \
  --method POST \
  -f oid=abc123def456abc123def456abc123def456abc123def456abc123def456abc1 \
  -f size=1048576
```

When the CLI acts as a jj/git LFS custom transfer adapter, the confirm call is issued automatically as part of the upload transfer lifecycle.

### Interaction with Batch Endpoint

The confirm endpoint is step 3 of the LFS two-phase upload flow:

1. **Batch** (`POST /lfs/batch`, `operation: "upload"`): Client declares objects to upload. Server returns signed upload URLs.
2. **Upload**: Client PUTs blob data directly to each signed URL.
3. **Confirm** (`POST /lfs/confirm`): Client sends `{ oid, size }`. Server verifies blob is in storage, persists metadata, returns the object record.

The confirm step is only needed for uploads. Downloads do not involve a confirm call.

### Documentation

The following documentation should be maintained:

- **LFS Guide (`docs/guides/git-lfs.mdx`)**: The "Confirm Upload" section should show the correct endpoint (`POST /api/repos/:owner/:repo/lfs/confirm`), the exact request/response format, and note that the OID must be a raw 64-character hex string (not `sha256:`-prefixed).
- **LFS API Reference**: A dedicated endpoint reference documenting the confirm endpoint, all error codes, and the relationship to the batch upload flow.
- **LFS Troubleshooting**: A section for "Confirm fails with 'blob does not exist'" explaining that the blob must be uploaded to the signed URL before confirming, and that signed URLs expire after 5 minutes.

**Documentation accuracy note**: The current `docs/guides/git-lfs.mdx` shows `"oid": "sha256:abc123..."` in the confirm example, but the actual API expects a raw 64-character hex string without a `sha256:` prefix. Documentation should be corrected.

## Permissions & Security

### Authorization Roles

| Role | Access | HTTP Response |
|------|--------|---------------|
| Repository owner (personal) | ✅ Full access | 201 |
| Organization owner | ✅ Full access | 201 |
| Team member (admin) | ✅ Allowed | 201 |
| Team member (write) | ✅ Allowed | 201 |
| Team member (read-only) | ❌ Insufficient permission | 403 |
| Collaborator (admin) | ✅ Allowed | 201 |
| Collaborator (write) | ✅ Allowed | 201 |
| Collaborator (read-only) | ❌ Insufficient permission | 403 |
| Authenticated user (no relationship) | ❌ Insufficient permission | 403 |
| Anonymous / unauthenticated | ❌ Not authenticated | 401 |

**Note:** Unlike the batch download endpoint, the confirm endpoint never allows anonymous access — even on public repositories. Uploading objects inherently requires authentication and write access.

### Rate Limiting

- The confirm endpoint is subject to the global rate-limiting middleware applied to all API routes.
- Recommended per-repository rate limit: **120 confirm requests per minute per authenticated user per repository**. This accommodates batch pushes with many LFS objects while preventing abuse.
- Confirm requests that fail validation (400/422) should still count toward the rate limit to prevent probing attacks.

### Security Constraints

- **Authentication enforcement**: The route handler checks for authentication before parsing the body. Unauthenticated requests are rejected immediately with 401 — no body parsing, no repo resolution, no service call.
- **Write permission verification**: After authentication, write access is verified against the repository's permission model (owner, org owner, team permission, collaborator permission).
- **OID validation as injection prevention**: Strict 64-character lowercase hex validation prevents path traversal, null bytes, or other injection vectors from reaching the blob storage layer.
- **Path traversal protection**: The blob store key construction (`repos/{id}/lfs/{oid}`) combined with the blob store's `..` sanitization prevents directory traversal attacks.
- **No PII in request or response**: The confirm endpoint deals only with content hashes, sizes, and repository IDs. No user-identifiable content is stored or returned beyond the `repository_id` and the auto-generated `id`.
- **Size field is client-declared**: The server does not verify that the declared `size` matches the actual blob size. This is consistent with the Git LFS specification, but means the `size` field should not be treated as authoritative for billing/quota enforcement without a separate verification step.

### Data Privacy Constraints

- The `oid` is a SHA-256 content hash. It reveals nothing about the file's contents beyond its hash, which is public in the LFS pointer file anyway.
- The `gcs_path` (internal storage key) is not exposed in the API response.
- Confirm responses do not include the actor's identity or other users' information.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|-----------|---------|------------|
| `LFSUploadConfirmed` | Successful confirm (HTTP 201, new record created) | `repo_id`, `owner`, `repo_name`, `actor_id`, `oid`, `size`, `is_duplicate: false` |
| `LFSUploadConfirmDuplicate` | Successful confirm that returned an existing record (idempotent re-confirm) | `repo_id`, `owner`, `repo_name`, `actor_id`, `oid`, `size`, `is_duplicate: true` |
| `LFSConfirmBlobMissing` | Confirm rejected because blob not in storage | `repo_id`, `owner`, `repo_name`, `actor_id`, `oid`, `size` |
| `LFSConfirmValidationFailed` | Confirm rejected due to invalid OID or size | `error_field`, `error_code`, `owner`, `repo_name`, `actor_id` |
| `LFSConfirmPermissionDenied` | Confirm rejected due to insufficient permissions | `repo_id`, `owner`, `repo_name`, `actor_id` |
| `LFSConfirmUnauthenticated` | Confirm rejected due to missing authentication | `owner`, `repo_name` |

### Funnel Metrics

- **Batch-to-confirm conversion rate**: Percentage of `LFSBatchUploadURLsGenerated` events that are followed by a corresponding `LFSUploadConfirmed` event for the same OID within the signed URL expiry window. Target: > 95%. A low rate indicates clients failing to upload blobs or failing to call confirm.
- **Confirm success rate**: Percentage of confirm requests that return HTTP 201 (including duplicates) vs. error responses. Target: > 98%.
- **Blob-missing rate**: Percentage of confirm requests that fail with "blob does not exist". A rising rate may indicate signed URL expiry issues, client bugs, or storage failures.
- **Duplicate confirm rate**: Percentage of confirms that are idempotent re-confirms (returned existing record). A high rate may indicate client retry storms or misconfigured CI.
- **Time from batch to confirm (p50/p95/p99)**: Measures how long uploads take. Useful for understanding client and network performance.

### Success Indicators

- Batch-to-confirm conversion rate > 95%.
- < 0.5% of confirm requests result in "blob does not exist" errors.
- < 0.1% of confirm requests result in 5xx errors.
- Average confirm latency < 100ms (the operation is a blob existence check + one DB insert).
- Duplicate confirm rate < 10% (some duplicates are expected from retries; too many suggest a problem).

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|----------|-------|------------------|-------------|
| Confirm request received | `info` | `owner`, `repo`, `oid`, `size`, `actor_id`, `request_id` | Entry log for every confirm request |
| Confirm request completed | `info` | `owner`, `repo`, `oid`, `size`, `actor_id`, `is_duplicate`, `duration_ms`, `request_id` | Summary log after successful confirm |
| Confirm blob missing | `warn` | `owner`, `repo`, `oid`, `size`, `actor_id`, `blob_key`, `request_id` | Blob not found in storage |
| Confirm validation failed | `warn` | `error_field`, `error_code`, `owner`, `repo`, `request_id` | Input validation rejection |
| Confirm permission denied | `warn` | `owner`, `repo`, `actor_id`, `request_id` | Authorization failure |
| Confirm unauthenticated | `warn` | `owner`, `repo`, `request_id` | No auth provided |
| Confirm duplicate detected | `info` | `owner`, `repo`, `oid`, `actor_id`, `request_id` | Unique constraint violation handled gracefully |
| Confirm DB insert failed | `error` | `owner`, `repo`, `oid`, `error`, `stack`, `request_id` | Non-unique-violation database error |
| Confirm internal error | `error` | `owner`, `repo`, `oid`, `error`, `stack`, `request_id` | Unhandled exception |
| Repository not found | `warn` | `owner`, `repo`, `request_id` | 404 on repo resolution |
| Blob existence check error | `error` | `blob_key`, `error`, `request_id` | Unexpected blob store error (not just "not found") |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_lfs_confirm_requests_total` | Counter | `status_code` | Total confirm requests by HTTP status |
| `codeplane_lfs_confirm_duration_seconds` | Histogram | | Request processing duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5) |
| `codeplane_lfs_confirm_created_total` | Counter | `is_duplicate` | Successful confirms, labeled by whether a new record was created or an existing one returned |
| `codeplane_lfs_confirm_errors_total` | Counter | `error_type` | Errors by type (`validation`, `auth`, `permission`, `not_found`, `blob_missing`, `internal`) |
| `codeplane_lfs_confirm_blob_check_duration_seconds` | Histogram | | Duration of the blob existence check (buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5) |
| `codeplane_lfs_confirm_db_insert_duration_seconds` | Histogram | | Duration of the database insert (buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5) |
| `codeplane_lfs_confirm_object_size_bytes` | Histogram | | Declared object sizes (buckets: 1KB, 10KB, 100KB, 1MB, 10MB, 100MB, 1GB, 5GB) |

### Alerts

#### Alert: LFS Confirm High Error Rate
**Condition:** `rate(codeplane_lfs_confirm_errors_total{error_type="internal"}[5m]) > 0.05`
**Severity:** Critical

**Runbook:**
1. Check server logs for `lfs_confirm_internal_error` or `lfs_confirm_db_insert_failed` entries with stack traces.
2. Verify database connectivity: check PostgreSQL/PGLite connection pool health. Run `SELECT 1` or equivalent health check.
3. Check for lock contention or deadlocks on the `lfs_objects` table: inspect `pg_stat_activity` for blocked queries.
4. Check disk space on the database volume. Full disks cause insert failures.
5. If errors correlate with unique constraint violations that are not being caught, check the `isUniqueViolation` helper for Postgres error code matching (should match code `23505`).
6. Verify the `createLFSObject` SQL query is syntactically correct and the table schema matches.
7. If errors are transient, check for database restarts or failovers in the timeframe.
8. Restart the server if internal state appears corrupted. Verify recovery with a test confirm request.

#### Alert: LFS Confirm High Blob-Missing Rate
**Condition:** `rate(codeplane_lfs_confirm_errors_total{error_type="blob_missing"}[15m]) / rate(codeplane_lfs_confirm_requests_total[15m]) > 0.1`
**Severity:** Warning

**Runbook:**
1. Check if signed upload URLs are expiring before clients finish uploading. Review `codeplane_lfs_batch_duration_seconds` and network conditions.
2. Verify blob storage health: check filesystem mount, disk space, and I/O error rates.
3. Check if blob storage permissions prevent the server from reading uploaded blobs.
4. Review recent changes to the blob key format (`repos/{id}/lfs/{oid}`) — a mismatch between batch-generated keys and confirm-checked keys would cause all confirms to fail.
5. Check for clock skew if signed URL expiry is involved.
6. If a specific client or CI system is responsible, check its LFS transfer agent configuration.
7. Consider increasing the signed URL expiry from 5 minutes if uploads are timing out on slow connections.

#### Alert: LFS Confirm High Latency
**Condition:** `histogram_quantile(0.95, rate(codeplane_lfs_confirm_duration_seconds_bucket[5m])) > 1`
**Severity:** Warning

**Runbook:**
1. Check `codeplane_lfs_confirm_blob_check_duration_seconds` — if blob existence checks are slow, investigate storage I/O.
2. Check `codeplane_lfs_confirm_db_insert_duration_seconds` — if DB inserts are slow, investigate database load and lock contention.
3. Check filesystem cache hit rates (the blob existence check reads the filesystem).
4. Check for concurrent bulk uploads creating I/O contention.
5. Verify that the `lfs_objects(repository_id, oid)` unique index exists — missing indexes cause slow inserts and lookups.
6. If latency correlates with high duplicate confirm rate, the fallback `getLFSObjectByOID` query after unique violation may be slow.

#### Alert: LFS Confirm Duplicate Spike
**Condition:** `rate(codeplane_lfs_confirm_created_total{is_duplicate="true"}[5m]) / rate(codeplane_lfs_confirm_created_total[5m]) > 0.5`
**Severity:** Info

**Runbook:**
1. Check if a specific client or CI pipeline is retrying confirm requests aggressively.
2. Verify client-side LFS configuration — some clients may not be caching confirm results.
3. Check for webhook or automation loops that re-trigger LFS uploads.
4. If the spike is one-time and correlated with a large bulk import, it is likely benign.
5. No immediate action required unless it is sustained and impacting performance.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Visible Behavior | Recovery |
|-----------|-------------|----------------------|----------|
| Malformed JSON body | 400 | "invalid request body" | Client fixes request format |
| Blob not uploaded yet | 400 | "blob does not exist" | Client uploads blob to signed URL first, then retries confirm |
| Empty owner path segment | 400 | "owner is required" | Client provides correct owner |
| Empty repo path segment | 400 | "repository name is required" | Client provides correct repo name |
| No authentication | 401 | "authentication required" | Client provides token or session cookie |
| Insufficient permissions | 403 | "permission denied" | User requests write access from repo owner |
| Repository not found | 404 | "repository not found" | Client verifies owner/repo spelling |
| Invalid OID format | 422 | "Validation Failed" with field=oid | Client provides valid 64-char hex SHA-256 |
| Invalid size (≤ 0) | 422 | "Validation Failed" with field=size | Client provides positive integer |
| DB insert failure | 500 | "failed to persist lfs object" | Server-side investigation required |
| Blob store read error | 500 | Internal server error | Server-side investigation of storage health |

## Verification

### API Integration Tests

#### Happy Path Tests

- [ ] **Confirm after successful upload**: Batch (upload) → PUT blob to signed URL → Confirm with same `{ oid, size }` → Verify HTTP 201 with `id`, `repository_id`, `oid`, `size`, `created_at`.
- [ ] **Confirmed object appears in list**: Confirm an object → GET `/lfs/objects` → Verify the confirmed object appears in the list.
- [ ] **Confirmed object is downloadable via batch**: Confirm an object → Batch (download) for same OID → Verify `exists: true` and `download_url` is present.
- [ ] **Confirm returns correct OID (lowercased)**: Confirm with uppercase OID `"ABC123..."` → Verify response `oid` is `"abc123..."`.
- [ ] **Confirm returns correct size**: Confirm with `size: 42` → Verify response `size` is `42`.
- [ ] **Confirm returns ISO 8601 created_at**: Verify `created_at` matches ISO 8601 format.
- [ ] **Confirm returns numeric id and repository_id**: Verify both are numbers (not strings).

#### Idempotency Tests

- [ ] **Duplicate confirm returns existing record**: Confirm object A → Confirm object A again → Verify HTTP 201 both times with same `id` and `created_at`.
- [ ] **Duplicate confirm does not create second record**: Confirm twice → GET `/lfs/objects` → Verify only one entry for the OID.
- [ ] **Concurrent confirms for same OID**: Launch two confirm requests simultaneously for the same OID → Verify both return HTTP 201 and the same `id`.

#### OID Validation Tests

- [ ] **Valid 64-char lowercase hex OID**: HTTP 201 (with blob present).
- [ ] **Valid 64-char uppercase hex OID**: HTTP 201 (normalized to lowercase).
- [ ] **Valid 64-char mixed-case hex OID**: HTTP 201.
- [ ] **OID with leading whitespace**: Accepted (trimmed) → HTTP 201 (with blob present).
- [ ] **OID with trailing whitespace**: Accepted (trimmed) → HTTP 201 (with blob present).
- [ ] **63-char hex OID (one too short)**: HTTP 422 with field=oid.
- [ ] **65-char hex OID (one too long)**: HTTP 422 with field=oid.
- [ ] **Empty OID `""`**: HTTP 422.
- [ ] **Whitespace-only OID `"   "`**: HTTP 422 (after trim, empty).
- [ ] **OID with non-hex char `g`**: HTTP 422.
- [ ] **OID with non-hex char `z`**: HTTP 422.
- [ ] **OID with special characters `!@#$`**: HTTP 422.
- [ ] **OID with Unicode characters**: HTTP 422.
- [ ] **OID with embedded spaces**: HTTP 422 (64 chars but contains spaces).
- [ ] **OID with null byte**: HTTP 422.
- [ ] **Maximum valid OID (all `f`s)**: HTTP 201 (with blob present) — `"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"`.
- [ ] **Minimum valid OID (all `0`s)**: HTTP 201 (with blob present) — `"0000000000000000000000000000000000000000000000000000000000000000"`.

#### Size Validation Tests

- [ ] **Size = 1** (minimum valid): HTTP 201 (with blob present).
- [ ] **Size = 5368709120** (5 GB): HTTP 201 (with blob present).
- [ ] **Size = 9007199254740991** (Number.MAX_SAFE_INTEGER): HTTP 201 (with blob present).
- [ ] **Size = 0**: HTTP 422 with field=size.
- [ ] **Size = -1**: HTTP 422 with field=size.
- [ ] **Size = -100**: HTTP 422.
- [ ] **Size = 0.5** (fractional): Verify behavior — should either truncate to 0 (→ 422) or reject.

#### Blob Verification Tests

- [ ] **Confirm without uploading blob first**: Batch (upload) to get key, skip the PUT, call confirm → HTTP 400 `"blob does not exist"`.
- [ ] **Confirm after blob is deleted from storage**: Upload blob, delete it from storage directly, call confirm → HTTP 400 `"blob does not exist"`.
- [ ] **Confirm with correct OID after blob uploaded to different key**: Upload blob to key for OID-A, confirm with OID-B → HTTP 400 (blob B doesn't exist).

#### Auth and Permission Tests

- [ ] **Confirm without authentication**: HTTP 401 `"authentication required"`.
- [ ] **Confirm with invalid/expired token**: HTTP 401.
- [ ] **Confirm as repo owner**: HTTP 201.
- [ ] **Confirm as org owner of org repo**: HTTP 201.
- [ ] **Confirm as write collaborator**: HTTP 201.
- [ ] **Confirm as admin collaborator**: HTTP 201.
- [ ] **Confirm as read-only collaborator**: HTTP 403 `"permission denied"`.
- [ ] **Confirm as write team member**: HTTP 201.
- [ ] **Confirm as read-only team member**: HTTP 403.
- [ ] **Confirm as authenticated user with no relationship to repo**: HTTP 403.
- [ ] **Confirm on public repo without auth**: HTTP 401 (confirm always requires auth, even on public repos).
- [ ] **Confirm on public repo as read-only collaborator**: HTTP 403 (read is not enough; write required).

#### Error Response Format Tests

- [ ] **400 errors include `message` field**: Verify JSON structure `{ "message": "..." }`.
- [ ] **401 errors include `message` field**: Verify `{ "message": "authentication required" }`.
- [ ] **403 errors include `message` field**: Verify `{ "message": "permission denied" }`.
- [ ] **404 errors include `message` field**: Verify `{ "message": "repository not found" }`.
- [ ] **422 errors include structured validation errors**: Verify `{ "message": "Validation Failed", "errors": [...] }`.

#### Repository Resolution Tests

- [ ] **Confirm on non-existent repository**: HTTP 404.
- [ ] **Confirm on non-existent owner**: HTTP 404.
- [ ] **Confirm with empty owner (whitespace)**: HTTP 400.
- [ ] **Confirm with empty repo name (whitespace)**: HTTP 400.
- [ ] **Confirm with case-insensitive owner/repo**: Verify `"MyOrg"/"MyRepo"` resolves the same as `"myorg"/"myrepo"`.

#### Body Parsing Tests

- [ ] **Malformed JSON body**: HTTP 400 `"invalid request body"`.
- [ ] **Empty request body**: HTTP 400.
- [ ] **Body with only `oid` (missing `size`)**: HTTP 422.
- [ ] **Body with only `size` (missing `oid`)**: HTTP 422.
- [ ] **Body with extra fields (`oid`, `size`, `foo`)**: Accepted — extra fields ignored.
- [ ] **Body where `oid` is a number instead of string**: HTTP 422 or 400.
- [ ] **Body where `size` is a string instead of number**: Verify behavior.

### CLI E2E Tests

- [ ] **CLI confirm via `codeplane api`**: `codeplane api /api/repos/owner/repo/lfs/confirm --method POST -f oid=<valid> -f size=1234` → Verify exit 0 and valid JSON response with `id`, `oid`, `size`, `created_at`.
- [ ] **CLI confirm without auth**: `codeplane api ... --token ""` → Verify non-zero exit code and error message.
- [ ] **CLI confirm with invalid OID**: Verify non-zero exit and 422 error.
- [ ] **CLI confirm with non-existent repo**: Verify non-zero exit and 404 error.
- [ ] **CLI confirm when blob is missing**: Verify non-zero exit and 400 error.

### End-to-End Flow Tests

- [ ] **Full upload lifecycle**: Create repo → Batch (upload, 1 object) → PUT blob content to signed URL → Confirm → Batch (download, same OID) → GET blob from signed download URL → Verify downloaded content matches uploaded content byte-for-byte.
- [ ] **Multi-object upload lifecycle**: Batch (upload, 3 objects) → PUT all 3 blobs → Confirm all 3 → List objects → Verify all 3 appear. Batch (download, all 3) → Verify all have `exists: true` with download URLs.
- [ ] **Confirm then delete then re-upload**: Confirm object → Delete object → Batch (upload, same OID) → Upload blob → Confirm again → Verify new record created.
- [ ] **Cross-user confirm isolation**: User A confirms object on repo X. User B (no access to repo X) tries to confirm on repo X → HTTP 403. User B confirms different object on repo Y (their own repo) → HTTP 201. Verify repo X has 1 object, repo Y has 1 object.
- [ ] **Public repo confirm requires auth**: Create public repo → Unauthenticated confirm → HTTP 401. Authenticated confirm with write access → HTTP 201.
- [ ] **Confirm after signed URL expiry**: Batch (upload) → Wait > 5 minutes (or mock expiry) → Verify signed URL is expired → Re-batch (upload) → Upload to new URL → Confirm → HTTP 201.
- [ ] **Idempotent re-confirm after server restart**: Confirm object → Restart server → Confirm same object again → HTTP 201 with same `id`.

### Playwright (Web UI) Tests

- [ ] **Confirmed LFS object appears in repository settings LFS tab**: Upload and confirm an LFS object via API → Navigate to repository settings → LFS Objects tab → Verify the object appears in the table with correct OID (truncated) and size.
- [ ] **Multiple confirmed objects paginate correctly**: Confirm 35 LFS objects → Navigate to LFS tab → Verify first page shows 30 → Click next → Verify 5 on second page.
