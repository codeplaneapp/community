# LANDING_PREVIEW_CREATE

Specification for LANDING_PREVIEW_CREATE.

## High-Level User POV

When a developer opens a Landing Request, they often want reviewers and stakeholders to see a live, running version of the proposed changes — not just a diff. Codeplane's Landing Request Preview feature makes this effortless: with a single click in the web UI, a command in the CLI, or through automatic configuration, a preview environment spins up from the Landing Request's changes and produces a live URL anyone on the team can visit.

The experience works like this: a repository author adds a `.codeplane/preview.ts` file to their project that describes how the project should be built and served. When someone creates or views a Landing Request and triggers a preview, Codeplane provisions a containerized environment, checks out the Landing Request's changes, runs the install and start commands from the preview configuration, and produces a unique URL. That URL is displayed directly on the Landing Request detail page, in CLI output, and in the TUI, so reviewers can immediately interact with the running application.

If no `.codeplane/preview.ts` file exists, users can still trigger a preview manually by specifying the port, install command, and start command at creation time. This is useful for ad-hoc experimentation or repositories that haven't yet adopted the convention.

Previews are scoped to a single Landing Request. Each Landing Request can have at most one active preview at a time. If a preview already exists and is running, requesting creation again simply returns the existing preview. If the existing preview was suspended due to inactivity, creating it again wakes it up. This idempotent behavior means users never have to worry about accidentally creating duplicate environments.

The preview URL is stable for the lifetime of the Landing Request. In a self-hosted deployment, the URL points to a localhost port mapped from the container. In a cloud deployment, the URL uses a subdomain pattern that encodes the Landing Request number and repository name. Either way, clicking the link takes the user directly to the running preview.

This feature is especially valuable for front-end changes, documentation updates, API demos, and any change where "seeing it live" is faster and more effective than reading a diff. It brings the review experience closer to the actual user experience of the software being changed.

## Acceptance Criteria

### Definition of Done

- A user with write access to a repository can create a preview environment for an open Landing Request.
- The preview environment runs the Landing Request's code changes in an isolated container.
- A unique, stable preview URL is generated and returned to the user.
- The preview URL is accessible by anyone who can view the Landing Request.
- The preview status and URL are visible on the Landing Request detail page in all clients (web, CLI, TUI).
- Creating a preview for a Landing Request that already has an active preview returns the existing preview (idempotent).
- Creating a preview for a Landing Request that has a suspended preview wakes it and returns it.
- The feature degrades gracefully when no container runtime is available.

### Functional Constraints

- [ ] Only one preview environment may exist per Landing Request at any time.
- [ ] Previews can only be created for Landing Requests in `open` or `draft` state. Attempting to create a preview for a `closed` or `merged` Landing Request must return an error.
- [ ] The Landing Request must exist; creating a preview for a non-existent LR number must return a 404.
- [ ] The repository must exist; creating a preview for a non-existent owner/repo must return a 404.
- [ ] If a container runtime (Docker or Podman) is unavailable, the creation request must return a clear error indicating that preview environments require a container runtime.
- [ ] If no `config` is provided in the request body and no `.codeplane/preview.ts` exists, the service falls back to sensible defaults (`port: 3000`, `start: "npm start"`).
- [ ] If `config` is provided, its `start` field is required (non-empty string). The `port`, `install`, and `env` fields are optional.
- [ ] The `port` field, if provided, must be a valid integer between 1 and 65535.
- [ ] The `install` command string, if provided, must not exceed 4096 characters.
- [ ] The `start` command string must not exceed 4096 characters.
- [ ] The `env` map, if provided, must not contain more than 64 key-value pairs.
- [ ] Each `env` key must be a valid environment variable name: alphanumeric and underscores, starting with a letter or underscore, max 256 characters.
- [ ] Each `env` value must not exceed 8192 characters.
- [ ] The `env` map must not contain keys that conflict with Codeplane-injected variables: `CODEPLANE_PREVIEW`, `CODEPLANE_REPO_OWNER`, `CODEPLANE_REPO_NAME`, `CODEPLANE_LR_NUMBER`, `PORT`.
- [ ] The response must include: `id`, `repository_id`, `lr_number`, `status`, `url`, `container_id`, `container_port`, `host_port`, `last_accessed_at`, `created_at`.
- [ ] The initial `status` in the response must be `"running"` on successful creation (after container + startup command have been initiated).
- [ ] An empty request body is valid and treated as "use defaults or `.codeplane/preview.ts`".
- [ ] A malformed JSON request body must return a 400 error with a descriptive message.
- [ ] The Landing Request number in the URL path must be a positive integer. Zero, negative numbers, and non-numeric values must return 400.

### Edge Cases

- [ ] If the container creation succeeds but the startup command fails, the preview is still created with `"running"` status (the container is alive; the dev server may take time to start). A warning is logged server-side.
- [ ] If a preview is in `"failed"` or `"stopped"` state, a new creation request replaces it with a fresh container.
- [ ] Concurrent creation requests for the same Landing Request must not produce duplicate containers. The second request should return the already-created preview.
- [ ] Creating a preview immediately after deleting one for the same LR must succeed cleanly (no stale state).
- [ ] Owner and repo path parameters containing only whitespace must return 400.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/landings/:number/preview`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or organization name |
| `repo` | string | Repository name |
| `number` | integer | Landing Request number (positive integer) |

**Request Body (optional JSON):**
```json
{
  "port": 3000,
  "install": "bun install",
  "start": "bun run dev",
  "env": {
    "NODE_ENV": "preview",
    "DATABASE_URL": "sqlite:memory"
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `port` | integer | No | 3000 | Port the preview application listens on inside the container (1–65535) |
| `install` | string | No | — | Shell command to run before the start command (e.g., dependency installation) |
| `start` | string | No | `"npm start"` | Shell command to start the preview server |
| `env` | object | No | — | Additional environment variables injected into the container |

**Success Response: `201 Created`**
```json
{
  "id": "42:7",
  "repository_id": 42,
  "lr_number": 7,
  "status": "running",
  "url": "http://localhost:49321",
  "container_id": "codeplane-preview-lr7-a1b2c3",
  "container_port": 3000,
  "host_port": 49321,
  "last_accessed_at": "2026-03-22T14:30:00.000Z",
  "created_at": "2026-03-22T14:30:00.000Z"
}
```

**Idempotent Response (existing active preview): `200 OK`**
Same shape as above, returning the existing preview's current state.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or invalid owner/repo | `{ "message": "owner and repo are required" }` |
| 400 | Invalid LR number | `{ "message": "valid landing request number is required" }` |
| 400 | Invalid port number | `{ "message": "port must be an integer between 1 and 65535" }` |
| 400 | Malformed JSON body | `{ "message": "invalid request body" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 404 | Landing Request not found | `{ "message": "landing request not found" }` |
| 409 | LR is closed/merged | `{ "message": "cannot create preview for a closed or merged landing request" }` |
| 500 | Container runtime unavailable | `{ "message": "sandbox client unavailable — preview environments require a container runtime" }` |
| 500 | Container creation failure | `{ "message": "create preview container: <detail>" }` |

### SDK Shape

The `PreviewService` in `@codeplane/sdk` exposes:

```typescript
createPreview(input: CreatePreviewInput): Promise<PreviewResponse>
```

Where `CreatePreviewInput` contains `repositoryId`, `lrNumber`, `repoOwner`, `repoName`, and an optional `config` with `port`, `install`, `start`, and `env`.

The SDK also exports `PreviewConfig`, `PreviewResponse`, `PreviewStatus`, and `CreatePreviewInput` types for consumers.

### CLI Command

**Command:** `codeplane preview create`

**Usage:**
```
codeplane preview create [--repo <owner/repo>] [--lr <number>] [options]
```

**Flags:**
| Flag | Short | Description |
|------|-------|-------------|
| `--repo` | `-R` | Repository in `owner/repo` format (defaults to current repo context) |
| `--lr` | `-l` | Landing Request number (required) |
| `--port` | `-p` | Port the preview listens on (default: 3000) |
| `--install` | | Install command to run before start |
| `--start` | `-s` | Start command for the preview server |
| `--env` | `-e` | Environment variable in `KEY=VALUE` format (repeatable) |
| `--json` | | Output raw JSON response |

**Example:**
```bash
# Create with defaults (uses .codeplane/preview.ts)
codeplane preview create --lr 7

# Create with explicit config
codeplane preview create --lr 7 --port 8080 --install "bun install" --start "bun run dev"

# With environment variables
codeplane preview create --lr 7 --start "bun run dev" -e NODE_ENV=preview -e DEBUG=true
```

**Output (human-readable):**
```
✓ Preview created for landing request #7
  Status: running
  URL:    http://localhost:49321
```

**Output (JSON):**
Full `PreviewResponse` JSON object.

### Web UI Design

**Location:** Landing Request detail page, in a "Preview" section or sidebar panel.

**Trigger:** A "Create Preview" button displayed when no preview exists for the current Landing Request.

**Button States:**
- **No preview exists:** Primary "Create Preview" button is shown. Clicking it sends the POST request with no body (uses `.codeplane/preview.ts` defaults).
- **Preview is starting:** Button changes to a spinner with "Starting preview…" text. Disabled.
- **Preview is running:** The button area transforms into a preview status card showing the preview URL as a clickable link, the status badge ("Running"), and a small "Open in new tab" icon.
- **Preview is suspended:** The status card shows "Suspended" badge with a "Wake Preview" button that triggers creation (which idempotently wakes it).

**Advanced creation (optional):** An expandable "Configure" section below the button allows the user to override `port`, `install`, `start`, and add `env` entries before creating. This is collapsed by default and only needed when overriding `.codeplane/preview.ts`.

**Error display:** If creation fails, a toast notification displays the error message. The button returns to its default "Create Preview" state.

### TUI UI

**Location:** Landing Request detail screen.

**Display:** After the diff and review sections, a "Preview" section shows:
- If no preview: `[p] Create Preview` keybinding hint.
- If running: `Preview: http://localhost:49321 (running)` with the URL rendered as a clickable terminal hyperlink (OSC 8).
- If starting: `Preview: starting…` with a spinner.
- If suspended: `Preview: suspended — press [p] to wake`.

Pressing `p` on the detail screen triggers preview creation.

### Documentation

The following end-user documentation should be written:

1. **Guide: "Preview Environments for Landing Requests"** — What preview environments are and why they're useful. How to add a `.codeplane/preview.ts` file. Step-by-step walkthroughs of creating a preview from web UI and CLI. How preview URLs work. Preview lifecycle: creation → running → idle suspension → wake → deletion.

2. **Reference: `.codeplane/preview.ts` Configuration** — Full `PreviewConfig` schema with descriptions. Example configurations for common frameworks (Next.js, Vite, SvelteKit). How environment variables are injected. Relationship between `definePreview()` and the container runtime.

3. **CLI Reference: `codeplane preview create`** — Full flag documentation with examples. Expected output formats (human and JSON).

## Permissions & Security

### Authorization

| Role | Can Create Preview? |
|------|-------------------|
| Repository Owner | ✅ Yes |
| Repository Admin | ✅ Yes |
| Repository Write (Member) | ✅ Yes |
| Repository Read | ❌ No — returns 403 |
| Anonymous / Unauthenticated | ❌ No — returns 401 |

The user must be authenticated (via session cookie, PAT, or OAuth token) and must have write-level access to the repository.

### Rate Limiting

- **Per-user rate limit:** Maximum 10 preview creation requests per minute per user. Exceeding this returns `429 Too Many Requests`.
- **Per-repository rate limit:** Maximum 20 preview creation requests per minute per repository. This prevents automated tooling from overwhelming a single repository's preview capacity.
- **Global concurrency limit:** A configurable maximum number of concurrent preview containers across all repositories (default: 50 for CE). Exceeding this returns `503 Service Unavailable` with a clear message.

### Data Privacy

- Environment variables provided in the request body may contain sensitive values. They must not be logged at INFO level or below. They may be logged at DEBUG level only if debug logging is explicitly enabled.
- The `env` field in the `PreviewResponse` is intentionally omitted — environment variables are write-only and not returned in API responses.
- Preview container logs may contain application output that includes PII. Access to preview containers is scoped to users with write access to the repository.
- Preview URLs in CE mode are localhost-only and not externally accessible. In cloud mode, preview URLs are public by default — documentation must clearly state this.

### Sandbox Boundary

- Preview containers run with restricted privileges (no `--privileged` flag).
- Container resource limits (CPU, memory) are applied via the container sandbox client.
- Container labels identify the preview for audit and cleanup.
- Containers are isolated from each other and from the host filesystem (no bind mounts to sensitive host paths).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LandingPreviewCreated` | Preview container successfully created | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `port`, `has_custom_config` (bool), `has_install_step` (bool), `has_env_vars` (bool), `env_var_count`, `duration_ms` (time from request to response) |
| `LandingPreviewCreateFailed` | Preview creation failed | `repository_id`, `lr_number`, `error_type` (e.g., "no_runtime", "container_failed", "validation_error"), `error_message` |
| `LandingPreviewCreateIdempotent` | Request returned existing active preview | `repository_id`, `lr_number`, `existing_status` ("running" or "starting") |
| `LandingPreviewWokenViaCreate` | Create request woke a suspended preview | `repository_id`, `lr_number`, `suspended_duration_ms` |

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| Preview creation success rate | `LandingPreviewCreated` / (`LandingPreviewCreated` + `LandingPreviewCreateFailed`) | > 95% |
| Time to preview ready | P50 and P95 of `duration_ms` on `LandingPreviewCreated` | P50 < 30s, P95 < 120s |
| Preview adoption rate | Unique repositories with at least one `LandingPreviewCreated` event / total active repositories | Trending up month-over-month |
| Preview-to-land conversion | Landing Requests that had a preview created and were subsequently merged / total LRs with previews | Higher than LRs without previews |
| Custom config usage | `LandingPreviewCreated` where `has_custom_config=true` / total | Informational — no target |

## Observability

### Logging

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Preview creation started | INFO | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `port`, `has_config` | Emitted when the service begins processing a create request |
| Container created | INFO | `repository_id`, `lr_number`, `container_id`, `host_port`, `container_port` | Emitted after the container sandbox returns a running container |
| Startup command initiated | DEBUG | `repository_id`, `lr_number`, `container_id`, `command_length` | Emitted when the install+start command is exec'd. Command content not logged (may contain secrets). |
| Startup command warning | WARN | `repository_id`, `lr_number`, `container_id`, `error` | Emitted when the startup command fails or times out (non-fatal) |
| Preview creation failed | ERROR | `repository_id`, `lr_number`, `error_type`, `error_message` | Emitted on any creation failure |
| Idempotent return | DEBUG | `repository_id`, `lr_number`, `existing_status` | Emitted when returning an existing preview |
| Suspended preview woken | INFO | `repository_id`, `lr_number`, `container_id` | Emitted when a create request triggers a wake |
| Request validation failed | WARN | `owner`, `repo`, `number`, `reason` | Emitted on 400-class validation errors |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_preview_create_total` | Counter | `status` ("success", "failed", "idempotent", "woken") | Total preview creation requests by outcome |
| `codeplane_preview_create_duration_seconds` | Histogram | `status` | Time from request receipt to response, bucketed: 1s, 5s, 15s, 30s, 60s, 120s |
| `codeplane_preview_active_count` | Gauge | `status` ("running", "starting", "suspended") | Current number of active previews by status |
| `codeplane_preview_container_create_duration_seconds` | Histogram | — | Time spent in the container sandbox `createVM` call |
| `codeplane_preview_create_errors_total` | Counter | `error_type` ("no_runtime", "container_failed", "validation", "internal") | Preview creation errors by category |

### Alerts

#### Alert: `PreviewCreateHighFailureRate`
**Condition:** `rate(codeplane_preview_create_errors_total[5m]) / rate(codeplane_preview_create_total[5m]) > 0.20` for 5 minutes.
**Severity:** Warning

**Runbook:**
1. Check `codeplane_preview_create_errors_total` by `error_type` label to identify the dominant failure category.
2. If `error_type="no_runtime"`: The container runtime (Docker/Podman) is unavailable. SSH into the host and run `docker info` or `podman info`. Check if the Docker daemon is running (`systemctl status docker`). Check disk space (`df -h`).
3. If `error_type="container_failed"`: Inspect container logs: `docker logs $(docker ps -aq --filter label=tech.codeplane.preview -l)`. Check resource limits — the host may be out of memory or CPU. Check `docker system df` for disk pressure.
4. If `error_type="validation"`: Review recent API request logs for patterns of malformed input. This may indicate a client bug — check recent client deployments.
5. If `error_type="internal"`: Check server error logs for stack traces. Escalate if not resolvable.

#### Alert: `PreviewCreateSlowP95`
**Condition:** `histogram_quantile(0.95, rate(codeplane_preview_create_duration_seconds_bucket[10m])) > 120` for 10 minutes.
**Severity:** Warning

**Runbook:**
1. Check `codeplane_preview_container_create_duration_seconds` to determine if the bottleneck is container creation.
2. If container creation is slow: Check Docker image pull times (`docker images` — is the workspace image cached?). Check host CPU/memory utilization. Check if the container runtime is under heavy load (`docker stats`).
3. If container creation is fast but overall duration is slow: The startup command exec may be hanging. Check for `startup command warning` logs. Review recent `.codeplane/preview.ts` configurations for long-running install steps.
4. Consider increasing the container startup timeout or scaling the host.

#### Alert: `PreviewConcurrencyLimitReached`
**Condition:** `codeplane_preview_active_count{status="running"} >= <configured_max>` for 5 minutes.
**Severity:** Warning

**Runbook:**
1. Check `codeplane_preview_active_count` by status. If many previews are running, this is expected under heavy use.
2. Identify long-running previews: Check `last_accessed_at` timestamps via the admin API (`GET /api/admin/previews`). Previews that haven't been accessed recently may have failed idle-suspension.
3. Manually suspend or delete stale previews if needed.
4. Consider increasing the concurrency limit or reducing the idle timeout.

### Error Cases and Failure Modes

| Failure Mode | Detection | User Impact | Recovery |
|--------------|-----------|-------------|----------|
| Container runtime unavailable | `sandbox` is null at service init | 500 error on create | Install Docker/Podman and restart server |
| Container creation timeout | `createVM` exceeds timeout | 500 error on create | Check host resources, Docker daemon health |
| Docker image not available | `createVM` fails with image pull error | 500 error on create | Pull the workspace image manually: `docker pull ghcr.io/codeplane-ai/workspace:latest` |
| Port conflict on host | Host port already in use | Container starts but proxy fails | Retry — uses random port assignment (hostPort: 0), conflict is transient |
| Startup command hangs | Exec times out after 60s | Preview created but app not running | User's issue — check `.codeplane/preview.ts` start command |
| Out of disk space | Container creation or exec fails | 500 error | Clean up old containers: `docker system prune` |
| Out of memory | Container OOM-killed | Preview shows "failed" status on next status check | Reduce container memory limits or add host memory |

## Verification

### API Integration Tests

| # | Test | Method | Input | Expected |
|---|------|--------|-------|----------|
| 1 | Create preview with default config | POST `/api/repos/:owner/:repo/landings/:number/preview` with empty body | — | 201, response contains `status: "running"`, valid `url`, `container_port: 3000` |
| 2 | Create preview with explicit config | POST with `{ "port": 8080, "install": "npm ci", "start": "npm run dev" }` | Valid config | 201, `container_port: 8080` |
| 3 | Create preview with env vars | POST with `{ "start": "npm start", "env": { "NODE_ENV": "preview" } }` | Valid env | 201 |
| 4 | Idempotent create — returns existing running preview | POST twice for same LR | First 201, second 200 | Both responses have same `id` and `container_id` |
| 5 | Idempotent create — wakes suspended preview | Suspend existing preview, then POST | — | 200, `status: "running"` |
| 6 | Create replaces stopped preview | Create, delete, create again | — | Two 201 responses with different `container_id` values |
| 7 | Create replaces failed preview | Simulate failed preview, then POST | — | 201 with new `container_id` |
| 8 | Missing owner returns 400 | POST `/api/repos//myrepo/landings/1/preview` | — | 400, `"owner and repo are required"` |
| 9 | Missing repo returns 400 | POST `/api/repos/alice//landings/1/preview` | — | 400, `"owner and repo are required"` |
| 10 | Whitespace-only owner returns 400 | POST with owner=" " | — | 400 |
| 11 | Invalid LR number (zero) returns 400 | POST with number=0 | — | 400, `"valid landing request number is required"` |
| 12 | Invalid LR number (negative) returns 400 | POST with number=-1 | — | 400 |
| 13 | Invalid LR number (non-numeric) returns 400 | POST with number="abc" | — | 400 |
| 14 | Invalid port (0) returns 400 | POST with `{ "port": 0, "start": "npm start" }` | — | 400 |
| 15 | Invalid port (65536) returns 400 | POST with `{ "port": 65536, "start": "npm start" }` | — | 400 |
| 16 | Invalid port (negative) returns 400 | POST with `{ "port": -1, "start": "npm start" }` | — | 400 |
| 17 | Invalid port (non-integer) returns 400 | POST with `{ "port": 3000.5, "start": "npm start" }` | — | 400 |
| 18 | Valid port at minimum (1) succeeds | POST with `{ "port": 1, "start": "npm start" }` | — | 201 |
| 19 | Valid port at maximum (65535) succeeds | POST with `{ "port": 65535, "start": "npm start" }` | — | 201 |
| 20 | Install command at max length (4096 chars) succeeds | POST with `install` of 4096 chars | — | 201 |
| 21 | Install command exceeding max length (4097 chars) returns 400 | POST with `install` of 4097 chars | — | 400 |
| 22 | Start command at max length (4096 chars) succeeds | POST with `start` of 4096 chars | — | 201 |
| 23 | Start command exceeding max length (4097 chars) returns 400 | POST with `start` of 4097 chars | — | 400 |
| 24 | Env map with 64 entries succeeds | POST with 64 env vars | — | 201 |
| 25 | Env map with 65 entries returns 400 | POST with 65 env vars | — | 400 |
| 26 | Env key with max length (256 chars) succeeds | POST with valid 256-char env key | — | 201 |
| 27 | Env key exceeding max length (257 chars) returns 400 | POST with 257-char env key | — | 400 |
| 28 | Env value with max length (8192 chars) succeeds | POST with 8192-char env value | — | 201 |
| 29 | Env value exceeding max length (8193 chars) returns 400 | POST with 8193-char env value | — | 400 |
| 30 | Reserved env key (CODEPLANE_PREVIEW) returns 400 | POST with `{ "start": "npm start", "env": { "CODEPLANE_PREVIEW": "x" } }` | — | 400 |
| 31 | Reserved env key (PORT) returns 400 | POST with `{ "start": "npm start", "env": { "PORT": "9999" } }` | — | 400 |
| 32 | Malformed JSON body returns 400 | POST with `{invalid json` | — | 400 |
| 33 | Non-existent repository returns 404 | POST to valid path but non-existent repo | — | 404 |
| 34 | Non-existent Landing Request returns 404 | POST to valid repo but non-existent LR number | — | 404 |
| 35 | Closed Landing Request returns 409 | POST for a LR in "closed" state | — | 409 |
| 36 | Merged Landing Request returns 409 | POST for a LR in "merged" state | — | 409 |
| 37 | Unauthenticated request returns 401 | POST without auth header/cookie | — | 401 |
| 38 | Read-only user returns 403 | POST with a read-only user token | — | 403 |
| 39 | No container runtime returns 500 | POST when sandbox is null | — | 500 with descriptive message |
| 40 | Response contains all required fields | POST valid request | — | Response has: `id`, `repository_id`, `lr_number`, `status`, `url`, `container_id`, `container_port`, `host_port`, `last_accessed_at`, `created_at` |
| 41 | `created_at` is valid ISO 8601 timestamp | POST valid request | — | Parseable ISO 8601 string |
| 42 | `last_accessed_at` equals `created_at` on fresh creation | POST valid request | — | Both timestamps identical |
| 43 | `url` contains host_port for CE mode | POST valid request in CE mode | — | `url` matches `http://localhost:{host_port}` |
| 44 | Draft Landing Request allows preview creation | POST for a LR in "draft" state | — | 201 |

### CLI Integration Tests

| # | Test | Command | Expected |
|---|------|---------|----------|
| 45 | CLI create preview with defaults | `codeplane preview create --lr 7` | Exit 0, output contains "Preview created" and a URL |
| 46 | CLI create preview with config | `codeplane preview create --lr 7 --port 8080 --start "bun run dev"` | Exit 0, output contains port 8080 |
| 47 | CLI create preview with env vars | `codeplane preview create --lr 7 --start "bun dev" -e NODE_ENV=preview -e FOO=bar` | Exit 0 |
| 48 | CLI create preview JSON output | `codeplane preview create --lr 7 --json` | Exit 0, valid JSON matching `PreviewResponse` schema |
| 49 | CLI create preview — missing LR flag | `codeplane preview create` | Exit non-zero, error message about required --lr flag |
| 50 | CLI create preview — invalid LR number | `codeplane preview create --lr abc` | Exit non-zero, error message |
| 51 | CLI create preview — unauthenticated | `codeplane preview create --lr 7` (no auth) | Exit non-zero, authentication error |

### Playwright E2E Tests (Web UI)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 52 | Create preview button visible on open LR | Navigate to LR detail page | "Create Preview" button is visible |
| 53 | Create preview button not visible on closed LR | Navigate to closed LR detail page | No "Create Preview" button |
| 54 | Click create preview triggers creation | Click "Create Preview" button | Button shows spinner, then transforms to preview URL card with "Running" badge |
| 55 | Preview URL is a clickable link | After preview creation | URL element is an `<a>` tag with valid `href` |
| 56 | Idempotent click does not create duplicate | Click "Create Preview" twice rapidly | Only one preview container is created |
| 57 | Error toast on creation failure | Trigger creation with no container runtime | Toast notification with error message appears |
| 58 | Advanced config panel expands and submits | Click "Configure", fill in port/start/install, click Create | Preview created with custom config values |

### TUI Integration Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 59 | Preview section shows on LR detail | Open LR detail screen | "Preview" section visible with `[p] Create Preview` hint |
| 60 | Press `p` creates preview | Press `p` on LR detail screen | Screen updates to show preview URL and "running" status |
| 61 | Preview URL rendered after creation | Create preview via `p` key | URL displayed in preview section |

### Cross-Cutting Tests

| # | Test | Description | Expected |
|---|------|-------------|----------|
| 62 | Concurrent API requests for same LR | Send 5 simultaneous POST requests | Exactly 1 container created; all responses share the same `container_id` |
| 63 | Create → Delete → Create cycle | Full lifecycle | Second create gets a new `container_id`, first container is fully cleaned up |
| 64 | Rate limit enforcement | Send 11 requests in under 1 minute from one user | 11th request returns 429 |
