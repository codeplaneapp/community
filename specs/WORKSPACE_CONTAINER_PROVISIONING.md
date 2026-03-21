# WORKSPACE_CONTAINER_PROVISIONING

Specification for WORKSPACE_CONTAINER_PROVISIONING.

## High-Level User POV

When a Codeplane user creates or resumes a workspace, the system must provision a real, running container environment that the user can connect to over SSH. Container provisioning is the invisible-but-critical bridge between "I want a workspace" and "I have a working development environment." Without it, every workspace is just a database row — provisioning is what makes workspaces real.

From the user's perspective, provisioning happens automatically and transparently. When a user creates a workspace through any Codeplane surface — web UI, TUI, CLI, desktop app, or editor integration — they see a brief "starting" status that transitions to "running" within seconds to a couple of minutes depending on whether the workspace image is already cached locally. Once the status flips to "running," the workspace is SSH-accessible and ready for development work. The user never interacts with Docker, Podman, or container internals directly; Codeplane handles image pulling, container creation, health checking, port mapping, and cleanup behind the scenes.

When a user resumes a previously suspended workspace, provisioning ensures the existing container starts back up and becomes healthy before reporting it as available. If the container is damaged or unrecoverable, Codeplane automatically reprovisions a fresh container so the user does not get stuck in a broken state. This self-healing behavior means users can trust that "running" always means "actually accessible."

Provisioning also supports the agent-driven workflow. When the CLI's `workspace issue` command creates a workspace to execute an AI agent against a repository issue, provisioning must complete reliably and predictably so the automation pipeline can continue without manual intervention. A provisioning failure in this flow blocks agent execution entirely, making reliability critical.

The provisioning system respects resource constraints of the host. Workspace containers are created with configurable memory and CPU limits, and idle workspaces are automatically suspended to reclaim resources. If the container runtime itself is unavailable — Docker or Podman is not installed or not running — the system reports this clearly instead of silently failing, guiding the user to install or start the appropriate runtime.

## Acceptance Criteria

### Definition of Done

- Container provisioning successfully creates a running, SSH-accessible container from the default workspace image (`ghcr.io/codeplane-ai/workspace:latest`) or a user-specified image.
- The container runtime (Docker or Podman) is auto-detected at startup; if neither is available, all workspace operations fail gracefully with a clear error directing the user to install one.
- Provisioning includes image pull (best-effort for already-cached images), container creation with labels/env/ports/volumes, health check polling, and port mapping resolution.
- A provisioned container has SSH (port 22) exposed and accessible, verified by a health check before reporting the workspace as "running."
- If a workspace container is stopped and a resume is requested, provisioning starts the existing container; if that fails, it reprovisions a fresh container transparently.
- Zombie detection marks workspaces stuck in "pending"/"starting" for more than 5 minutes without a container ID as "failed," preventing resource leaks.
- Provisioning failures produce structured error messages with enough detail to diagnose the root cause (e.g., runtime unavailable, disk full, image pull timeout).
- All provisioned containers carry Codeplane-specific labels (`tech.codeplane.workspace=true`, `tech.codeplane.workspace.id`, `tech.codeplane.workspace.repo`) for tracking and cleanup.
- The feature works identically whether the backing runtime is Docker or Podman.

### Functional Constraints

- **Container runtime auto-detection**: Docker is preferred if both Docker and Podman are available. Detection occurs at server startup via `docker info` / `podman info` with a 10-second timeout per probe.
- **Default image**: `ghcr.io/codeplane-ai/workspace:latest`. The image must include an SSH server, jj, git, curl, wget, jq, build-essential, Bun, and a developer user account.
- **Image pull**: Attempted before every container creation. Pull timeout is 10 minutes (600,000ms). Pull failure is swallowed (the image may already be cached locally); container creation proceeds.
- **Container name format**: `{namePrefix}-{8-char-hex-random-suffix}`. Default namePrefix is `codeplane-workspace`. Names must be unique per host.
- **Label contract**:
  - `tech.codeplane.workspace=true` (always)
  - `tech.codeplane.workspace.name={containerName}` (always)
  - `tech.codeplane.workspace.id={workspace_uuid}` (from caller)
  - `tech.codeplane.workspace.repo={owner}/{repo}` (from caller)
- **Environment variables injected**: At minimum `CODEPLANE_REPO_OWNER` and `CODEPLANE_REPO_NAME` are set from the repository context.
- **SSH port**: Port 22 inside the container is always exposed. If not explicitly mapped in config, it is auto-mapped to a random host port.
- **Health check**: Default command is `ss -tlnp | grep -q ':22' || exit 1`. Interval: 5 seconds. Retries: 10. Start period: 5 seconds. Custom health check commands can be provided via configuration.
- **Health check timeout**: Default 120 seconds. If the container does not become healthy within this window, provisioning fails.
- **Unhealthy container**: If the health check reports "unhealthy" (rather than just timing out), provisioning immediately fails with a descriptive error referencing `docker logs`.
- **Resource limits**: Optional `memoryLimit` (e.g., "2g") and `cpuLimit` (e.g., "2.0") are passed to `--memory` and `--cpus` respectively. No defaults enforced; if omitted, the container uses host defaults.
- **Volume mounts**: Optional. Each mount specifies source, target, and optional read-only flag.
- **Working directory**: Optional override passed via `--workdir`.
- **Container ID**: The full 64-character SHA returned by `docker run` is stored as the workspace's `freestyle_vm_id`.

### Edge Cases

- **Runtime not installed**: Both `docker info` and `podman info` fail. The `ContainerSandboxClient.create()` throws with a message directing the user to install Docker or Podman, including documentation links.
- **Runtime installed but not running**: `docker info` returns non-zero exit code (e.g., Docker daemon not started). Same behavior as "not installed" — clear error with remediation instructions.
- **Image pull fails and image not cached locally**: `docker run` fails because the image doesn't exist. Provisioning fails with `"failed to create container: ..."` including the stderr from the container runtime.
- **Image pull slow (first-time)**: Pull can take up to 10 minutes. During this time the workspace remains in "starting" status. If it exceeds 10 minutes, the pull times out but container creation may still proceed if the image was partially cached.
- **Disk full on host**: Container creation fails with an I/O error from the runtime. The error message from stderr is propagated.
- **Port conflict**: If the random host port is already in use, Docker/Podman retries automatically. If all auto-assigned ports fail, the container creation error is propagated.
- **Container starts but SSH never becomes available**: Health check polling times out after 120 seconds. The container is left running (caller is responsible for cleanup). Error: `"container {vmId} did not become healthy within 120s"`.
- **Container becomes unhealthy**: Provisioning fails immediately with `"container {vmId} became unhealthy — check container logs with: docker logs {vmId}"`.
- **Container creation succeeds but DB update fails**: Orphaned container. The stale/zombie detection mechanism will eventually mark the workspace as failed, but the container itself must be cleaned up manually or by a future sweep.
- **Concurrent provisioning for same workspace**: The service layer's `findOrCreatePrimaryWorkspace` and idempotent workspace reuse prevents this at a higher level, but if two provisions race, the second will find the workspace already has a VM ID and skip provisioning.
- **Podman rootless mode**: Port mapping behavior may differ. The `resolvePortMappings` method parses the standard Docker inspect JSON format, which Podman also emits in rootless mode.
- **Container name collision**: Extremely unlikely (8-character hex suffix = 4 billion possibilities) but if it occurs, `docker run` fails and the error is propagated.
- **Healthcheck command injection**: The health check command is a constant string unless overridden via `CreateContainerConfig.healthcheckCmd`. Config-level overrides are only available programmatically, not from user input.
- **Maximum label value length**: Docker labels have no practical length limit, but container names (used in labels) are capped at 128 characters by Docker.
- **Empty environment variables**: An env var with an empty value (e.g., `CODEPLANE_REPO_OWNER=""`) is passed as `-e KEY=` which Docker accepts.

## Design

### API Shape

Container provisioning is not exposed as a direct API endpoint. It is an internal service operation triggered by:

1. **`POST /api/repos/:owner/:repo/workspaces`** — creates a workspace, which triggers provisioning.
2. **`POST /api/repos/:owner/:repo/workspaces/:id/resume`** — resumes a suspended workspace, which triggers container start (and reprovision if start fails).
3. **`POST /api/repos/:owner/:repo/workspace/sessions`** — creates a session, which calls `ensureWorkspaceRunning()` and may trigger provisioning if the workspace has no container.

The provisioning result is reflected in the workspace response:

```json
{
  "id": "uuid",
  "status": "running",
  "freestyle_vm_id": "64-char-container-sha",
  "ssh_host": "{vmId}@localhost"
}
```

**Error responses originating from provisioning**:

| HTTP Status | Condition | Message Pattern |
|---|---|---|
| 500 | No container runtime | `"sandbox client unavailable"` |
| 500 | Container creation failed | `"create sandbox container: failed to create container: {stderr}"` |
| 500 | Health check timeout | `"create sandbox container: container {vmId} did not become healthy within 120s"` |
| 500 | Unhealthy container | `"create sandbox container: container {vmId} became unhealthy — check container logs with: docker logs {vmId}"` |

### SDK Shape

**ContainerSandboxClient** (`@codeplane/sdk`):

```typescript
class ContainerSandboxClient {
  static async create(sshProxyHost?: string): Promise<ContainerSandboxClient>;
  static withRuntime(runtime: ContainerRuntime, sshProxyHost?: string): ContainerSandboxClient;

  async createVM(config?: CreateContainerConfig): Promise<CreateContainerResult>;
  async suspendVM(vmId: string): Promise<{ vmId: string; suspendedAt: string }>;
  async startVM(vmId: string, healthcheckTimeoutSecs?: number): Promise<{ vmId: string; ports: PortMapping[] }>;
  async deleteVM(vmId: string, removeVolumes?: boolean): Promise<void>;
  async forkVM(sourceVmId: string): Promise<never>; // Always throws — CE limitation
  async exec(vmId: string, command: string | string[], options?: ExecOptions): Promise<ExecResult>;
  async writeFile(vmId: string, path: string, content: string): Promise<void>;
  async getVM(vmId: string): Promise<ContainerStatus>;
  async getSSHConnectionInfo(vmId: string, username?: string): Promise<SSHConnectionInfo>;
  async listContainers(): Promise<ContainerStatus[]>;
  getRuntime(): ContainerRuntime;
}
```

**Key Types**:

```typescript
type ContainerRuntime = "docker" | "podman";
type ContainerState = "creating" | "running" | "stopped" | "removing" | "not_found";

interface CreateContainerConfig {
  image?: string;              // Default: ghcr.io/codeplane-ai/workspace:latest
  namePrefix?: string;         // Default: codeplane-workspace
  env?: Record<string, string>;
  ports?: PortMapping[];
  volumes?: VolumeMount[];
  workdir?: string;
  command?: string[];
  memoryLimit?: string;        // e.g. "2g"
  cpuLimit?: string;           // e.g. "2.0"
  labels?: Record<string, string>;
  sshPort?: number;            // Default: 22
  healthcheckCmd?: string;
  healthcheckIntervalSecs?: number;  // Default: 5
  healthcheckTimeoutSecs?: number;   // Default: 120
}

interface CreateContainerResult {
  vmId: string;         // Full 64-char container SHA
  name: string;         // Container name
  ports: PortMapping[]; // Resolved port mappings
}

interface ContainerStatus {
  vmId: string;
  name: string;
  state: ContainerState;
  running: boolean;
  health?: string;
  ports: PortMapping[];
  createdAt?: string;
  startedAt?: string;
}
```

### CLI Command

Container provisioning is triggered implicitly by workspace CLI commands:

```
codeplane workspace create [--name <name>] [--snapshot <id>] [--repo <OWNER/REPO>]
codeplane workspace ssh [id] [--repo <OWNER/REPO>]
codeplane workspace issue <number> [--repo <OWNER/REPO>]
```

When provisioning is in progress, the CLI outputs:
- Human-readable: `Creating workspace...` followed by workspace details once running.
- JSON (`--json`): Immediate response with `"status": "starting"` or `"status": "running"`.

When provisioning fails:
- Human-readable: Error message with remediation hint (e.g., "Ensure Docker or Podman is installed and running").
- JSON: `{ "error": "...", "code": 500 }`.
- Exit code: 1.

### TUI UI

The TUI does not directly expose provisioning configuration. Provisioning status is communicated through:

- **Workspace list**: Status badge transitions from `[starting]` (yellow) to `[running]` (green) via SSE.
- **Workspace detail**: Overview tab shows VM ID once provisioned. Status badge updates in real-time.
- **Create form**: After submission, shows "Provisioning workspace…" with braille spinner.

If provisioning fails:
- Status badge shows `[failed]` in red.
- Error message displayed in status bar: `"Provisioning failed: {reason}"`.
- User can retry by creating a new workspace.

### Web UI Design

The web UI communicates provisioning through:

- **Workspace list**: Status column shows "Starting" with a spinner animation that transitions to "Running" with a green indicator via SSE.
- **Workspace detail**: Shows container ID in the metadata section once provisioned. Status badge updates in real-time.
- **Create flow**: After submit, a provisioning progress indicator appears. On success, navigates to detail or refreshes list. On failure, shows error banner with retry option.

### Documentation

End-user documentation for container provisioning should cover:

- **Prerequisites guide**: How to install Docker or Podman, verify it's running (`docker info`), and configure Codeplane to detect it.
- **Workspace image reference**: What's included in the default workspace image (Ubuntu 24.04, git, jj, Bun, SSH server, developer user), and how to use custom images.
- **Provisioning lifecycle**: What happens when a workspace is created (image pull → container run → health check → ready), with expected timelines.
- **Troubleshooting provisioning failures**: Common errors and fixes — "sandbox client unavailable" (install/start Docker), "did not become healthy" (check container logs, disk space), "image pull failed" (check network, registry auth).
- **Resource management**: How memory/CPU limits work, what the default idle timeout is (30 min), and how auto-suspend conserves host resources.
- **Self-hosting guide section**: Container runtime requirements for self-hosted Codeplane, including Docker CE 20.10+ or Podman 3.0+ recommendations.

## Permissions & Security

### Authorization

- **Owner / Admin**: Full access to trigger provisioning via workspace create, resume, and session create.
- **Member (Write)**: Can trigger provisioning for their own workspaces. Cannot provision workspaces on behalf of other users.
- **Read-Only**: Cannot trigger provisioning. Any operation that would create or start a container returns HTTP 403.
- **Anonymous / Unauthenticated**: Cannot trigger provisioning. Returns HTTP 401.

### Rate Limiting

- **Per-user workspace creation**: Maximum 10 provisioning-triggering requests per minute (workspace create + resume combined).
- **Per-repository**: Maximum 30 provisioning-triggering requests per minute across all users.
- **Global**: Subject to the server-wide rate limiting middleware.
- **HTTP 429** with `Retry-After` header when limits are exceeded.
- **Container runtime operations are not separately rate-limited** — rate limiting is applied at the API layer, not the container sandbox layer.

### Data Privacy Constraints

- **Container labels**: Workspace ID and repository owner/name are stored as container labels visible to anyone with Docker access on the host. Self-hosting administrators should secure Docker socket access.
- **Environment variables**: `CODEPLANE_REPO_OWNER` and `CODEPLANE_REPO_NAME` are injected into every workspace container. These are not sensitive, but any additional secrets (e.g., API keys, tokens) injected via workspace bootstrap should be treated as ephemeral and not persisted in container images.
- **Container IDs**: The full 64-character container SHA is stored in the database and returned in API responses. This is an implementation detail, not PII, but it reveals infrastructure information.
- **SSH access tokens**: Generated as part of provisioning-adjacent flows. Stored as SHA-256 hashes. Plaintext returned exactly once with 5-minute TTL. Never logged.
- **Container filesystem**: Workspace containers have access to the full cloned repository. Workspace deletion removes the container and its volumes, but container filesystem content is not cryptographically erased.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|---|---|---|
| `workspace.container.provisioned` | Container successfully created and healthy | `workspace_id`, `repository_id`, `user_id`, `container_runtime` ("docker" | "podman"), `image`, `provisioning_duration_ms`, `health_check_duration_ms`, `image_pull_attempted`, `client` ("api" | "cli" | "tui" | "web" | "desktop"), `has_resource_limits`, `memory_limit`, `cpu_limit` |
| `workspace.container.provision_failed` | Container creation or health check failed | `workspace_id`, `repository_id`, `user_id`, `container_runtime`, `error_type` ("runtime_unavailable" | "image_pull_failed" | "create_failed" | "health_timeout" | "unhealthy"), `error_message`, `duration_ms`, `client` |
| `workspace.container.started` | Existing stopped container successfully started (resume) | `workspace_id`, `container_id`, `start_duration_ms`, `health_check_duration_ms` |
| `workspace.container.start_failed` | Existing container failed to start, reprovision triggered | `workspace_id`, `container_id`, `error_message`, `will_reprovision` |
| `workspace.container.reprovisioned` | Fresh container created after start failure | `workspace_id`, `old_container_id`, `new_container_id`, `reprovision_duration_ms` |
| `workspace.container.deleted` | Container removed | `workspace_id`, `container_id`, `volumes_removed` |
| `workspace.runtime.detected` | Container runtime auto-detected at startup | `runtime` ("docker" | "podman"), `detection_duration_ms` |
| `workspace.runtime.unavailable` | No container runtime found at startup | `docker_error`, `podman_error` |
| `workspace.zombie.detected` | Stale pending workspace marked as failed | `workspace_id`, `repository_id`, `age_seconds`, `original_status` |

### Funnel Metrics & Success Indicators

- **Provisioning success rate**: `workspace.container.provisioned` / (`workspace.container.provisioned` + `workspace.container.provision_failed`). Target: >98%.
- **Provisioning p50/p95/p99 latency**: Histogram of `provisioning_duration_ms`. Targets: p50 < 15s, p95 < 45s, p99 < 90s.
- **Health check p50/p95/p99 latency**: Histogram of `health_check_duration_ms`. Target: p95 < 30s.
- **Resume success rate**: `workspace.container.started` / (`workspace.container.started` + `workspace.container.start_failed`). Target: >95%.
- **Reprovision rate**: `workspace.container.reprovisioned` / total resume attempts. A high rate indicates container instability.
- **Zombie rate**: `workspace.zombie.detected` per hour. Target: <1/hour under normal load.
- **Runtime availability**: `workspace.runtime.unavailable` should be 0 in production.

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|---|---|---|
| `info` | Container runtime detected | `{ runtime, detection_duration_ms }` |
| `info` | Container provisioning started | `{ workspace_id, repository_id, user_id, image, name_prefix, container_runtime }` |
| `info` | Image pull started | `{ image, workspace_id }` |
| `info` | Image pull completed/skipped | `{ image, workspace_id, duration_ms, skipped: boolean }` |
| `info` | Container created, waiting for health | `{ workspace_id, container_id, container_name }` |
| `info` | Container healthy and ready | `{ workspace_id, container_id, total_provisioning_ms, health_check_ms }` |
| `info` | Container started (resume) | `{ workspace_id, container_id, start_duration_ms }` |
| `info` | Container deleted | `{ workspace_id, container_id, volumes_removed }` |
| `warn` | Image pull failed (continuing with cached) | `{ image, workspace_id, error }` |
| `warn` | Container start failed, reprovisioning | `{ workspace_id, container_id, error, action: "reprovision" }` |
| `warn` | Zombie workspace detected | `{ workspace_id, repository_id, age_seconds, original_status }` |
| `error` | Container runtime not available | `{ docker_error, podman_error }` |
| `error` | Container creation failed | `{ workspace_id, container_runtime, stderr, exit_code, command_summary }` |
| `error` | Health check timeout | `{ workspace_id, container_id, timeout_secs, last_health_status }` |
| `error` | Container became unhealthy | `{ workspace_id, container_id, health_status }` |
| `error` | Container deletion failed | `{ workspace_id, container_id, error }` |
| `error` | Port mapping resolution failed | `{ container_id, error }` |
| `debug` | Docker/Podman command executed | `{ command_summary, exit_code, duration_ms }` |
| `debug` | Health check poll iteration | `{ container_id, poll_number, health_status, elapsed_ms }` |
| `debug` | Port mappings resolved | `{ container_id, mappings: [{ hostPort, containerPort, protocol }] }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workspace_container_provisions_total` | Counter | `status` ("success" | "failed"), `runtime` ("docker" | "podman"), `error_type` | Total container provisioning attempts |
| `codeplane_workspace_container_provisioning_duration_seconds` | Histogram | `status` ("success" | "failed"), `runtime` | Time from provision start to container ready (buckets: 5, 10, 15, 30, 45, 60, 90, 120, 180, 300) |
| `codeplane_workspace_container_health_check_duration_seconds` | Histogram | `status` ("healthy" | "timeout" | "unhealthy") | Time from container start to healthy (buckets: 2, 5, 10, 15, 30, 60, 120) |
| `codeplane_workspace_container_image_pull_duration_seconds` | Histogram | `status` ("success" | "skipped" | "failed") | Image pull duration |
| `codeplane_workspace_containers_active` | Gauge | `state` ("running" | "stopped"), `runtime` | Current count of managed containers |
| `codeplane_workspace_container_starts_total` | Counter | `status` ("success" | "failed"), `type` ("provision" | "resume" | "reprovision") | Total container start attempts by type |
| `codeplane_workspace_container_deletions_total` | Counter | `status` ("success" | "failed") | Total container deletion attempts |
| `codeplane_workspace_zombie_detections_total` | Counter | — | Total zombie workspaces detected and failed |
| `codeplane_workspace_runtime_detection_duration_seconds` | Histogram | `runtime` ("docker" | "podman" | "none") | Startup runtime detection time |
| `codeplane_workspace_container_command_duration_seconds` | Histogram | `command` ("run" | "start" | "stop" | "rm" | "inspect" | "pull" | "exec") | Container runtime command execution time |

### Alerts

#### `WorkspaceContainerProvisioningFailureRateHigh`
**Condition**: `rate(codeplane_workspace_container_provisions_total{status="failed"}[5m]) / rate(codeplane_workspace_container_provisions_total[5m]) > 0.1`
**Severity**: Critical
**Runbook**:
1. Check `codeplane_workspace_container_provisions_total` by `error_type` label. Identify the dominant failure mode.
2. If `error_type="runtime_unavailable"`: The container runtime is down. Run `docker info` or `podman info` on the host. Check `systemctl status docker`. Restart Docker if needed: `sudo systemctl restart docker`. After Docker restarts, the Codeplane server must be restarted to reinitialize the sandbox client.
3. If `error_type="create_failed"`: Check host disk space (`df -h`), memory (`free -m`), and container count (`docker ps -a | wc -l`). Prune stopped containers: `docker container prune`. Prune unused images: `docker image prune`.
4. If `error_type="health_timeout"`: Containers are starting but SSH is not becoming available. Check recent container logs: `docker logs $(docker ps -a --filter label=tech.codeplane.workspace=true --format '{{.ID}}' | head -1)`. Check if the workspace image SSH server configuration is correct.
5. If `error_type="unhealthy"`: The container starts but its health check fails. Pull the latest workspace image and verify manually: `docker run --rm -it ghcr.io/codeplane-ai/workspace:latest ss -tlnp`.
6. Check application logs: `grep "Container creation failed\|Health check timeout\|became unhealthy" /var/log/codeplane/server.log | tail -20`.

#### `WorkspaceContainerProvisioningLatencyHigh`
**Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_container_provisioning_duration_seconds_bucket[5m])) > 60`
**Severity**: Warning
**Runbook**:
1. Check `codeplane_workspace_container_image_pull_duration_seconds` — slow image pulls are the most common cause of high provisioning latency.
2. If image pull is slow: Verify network connectivity to the container registry. Check if the image is already cached: `docker images ghcr.io/codeplane-ai/workspace`. Pre-pull the image: `docker pull ghcr.io/codeplane-ai/workspace:latest`.
3. Check host I/O: `iostat -x 1 5`. High I/O wait indicates disk bottleneck.
4. Check container count on host: `docker ps | wc -l`. If high, idle workspace suspension may not be working. Check `codeplane_workspace_containers_active` gauge.
5. Check `codeplane_workspace_container_health_check_duration_seconds` — if health checks are slow, the SSH server inside containers may be slow to start. Check container resource limits.

#### `WorkspaceContainerRuntimeUnavailable`
**Condition**: `increase(codeplane_workspace_container_provisions_total{error_type="runtime_unavailable"}[5m]) > 0`
**Severity**: Critical
**Runbook**:
1. The container sandbox client detected no runtime. All workspace operations are blocked.
2. SSH to the host and verify Docker: `docker info`. If it fails, check: `systemctl status docker`, `journalctl -u docker -n 50`.
3. If Docker was manually stopped, restart it: `sudo systemctl start docker`.
4. If Docker crashed, check for OOM kills: `dmesg | grep -i oom | tail -10`.
5. After Docker is restored, restart the Codeplane server process to reinitialize the sandbox client.
6. Verify recovery: `curl -s http://localhost:3000/api/health` should return healthy.

#### `WorkspaceContainerHealthCheckTimeoutSpike`
**Condition**: `rate(codeplane_workspace_container_health_check_duration_seconds_count{status="timeout"}[10m]) > 2`
**Severity**: Warning
**Runbook**:
1. Containers are being created but SSH is not starting within 120 seconds.
2. Check if the workspace image was recently updated: `docker inspect ghcr.io/codeplane-ai/workspace:latest --format '{{.Created}}'`.
3. Manually start a container and check SSH: `docker run --rm -d --name test-ws ghcr.io/codeplane-ai/workspace:latest && sleep 10 && docker exec test-ws ss -tlnp && docker rm -f test-ws`.
4. If SSH is not listening, the image may be broken. Roll back to a known-good image tag.
5. Check host resource pressure — containers may be CPU/memory starved.

#### `WorkspaceZombieRateHigh`
**Condition**: `rate(codeplane_workspace_zombie_detections_total[1h]) > 5`
**Severity**: Warning
**Runbook**:
1. Zombie workspaces indicate provisioning starts (DB record created) but never completes (no container ID stored).
2. Check if the sandbox client is functional: look for recent `workspace.container.provisioned` events in logs.
3. Check database health — writes to the workspace table may be failing after provisioning succeeds.
4. Check for orphaned containers: `docker ps -a --filter label=tech.codeplane.workspace=true --format '{{.ID}} {{.Names}} {{.Status}}'` — if containers exist but DB records show no VM ID, the DB update is failing.
5. Review recent Codeplane server error logs for DB connection errors.

#### `WorkspaceActiveContainerCountHigh`
**Condition**: `codeplane_workspace_containers_active{state="running"} > 50`
**Severity**: Warning
**Runbook**:
1. More than 50 running workspace containers on a single host may cause resource contention.
2. Verify idle timeout is functioning: check `codeplane_workspace_containers_active{state="running"}` vs `codeplane_workspace_containers_active{state="stopped"}`. If stopped count is low, auto-suspend may be broken.
3. Check the cleanup scheduler: `grep "cleanup scheduler" /var/log/codeplane/server.log | tail -10`.
4. Manually list old running containers: `docker ps --filter label=tech.codeplane.workspace=true --format '{{.ID}} {{.RunningFor}}'`.
5. If needed, manually suspend idle workspaces or increase host resources.

### Error Cases and Failure Modes

| Error Case | Detection | Impact | Recovery |
|---|---|---|---|
| Container runtime not installed | `runtime_unavailable` error at startup | All workspace operations blocked | Install Docker/Podman, restart server |
| Container runtime stopped mid-operation | `create_failed` or `start_failed` errors | Current and future operations fail | Restart runtime, restart server |
| Image registry unreachable | Image pull fails (swallowed) | First provision on clean host fails | Fix network, or manually pull image |
| Disk full | Container creation fails with I/O error | All new provisions fail | Free disk, prune containers/images |
| OOM on host | Containers killed by kernel OOM | Running workspaces terminated | Reduce container memory limits or add host memory |
| Health check timeout | Container created but SSH never ready | Single workspace stuck, then zombie | Automatic zombie detection within 5 min; user retries |
| Unhealthy container | Health check reports unhealthy | Single workspace fails immediately | User retries; check workspace image |
| DB write fails after container created | Orphaned container with no DB record | Container resource leak | Orphan cleanup sweep or manual `docker rm` |
| Concurrent provision race | Two containers for same workspace | Extra resource use | Second provision detects existing VM ID, skips |
| Container name collision | `docker run` fails (extremely rare) | Single provision fails | Automatic retry with new random suffix |
| Port exhaustion on host | No free ephemeral ports | All new provisions fail | Reduce running containers, check for port leaks |

## Verification

### API Integration Tests

- **`WORKSPACE_CONTAINER_PROVISIONING > creates a container when workspace is created`**: POST to create workspace → response has `status` equal to `"running"` or `"starting"`, and `freestyle_vm_id` is a non-empty string after status transitions to `"running"`.
- **`WORKSPACE_CONTAINER_PROVISIONING > container has SSH port accessible after provisioning`**: Create workspace, get SSH info, verify the SSH host and port are returned and the port is a valid number > 0.
- **`WORKSPACE_CONTAINER_PROVISIONING > container has required labels`**: Create workspace, inspect the container via Docker CLI, verify labels `tech.codeplane.workspace=true`, `tech.codeplane.workspace.id={workspace_id}`, `tech.codeplane.workspace.repo={owner}/{repo}` are present.
- **`WORKSPACE_CONTAINER_PROVISIONING > container has environment variables injected`**: Create workspace, exec into container, verify `CODEPLANE_REPO_OWNER` and `CODEPLANE_REPO_NAME` are set correctly.
- **`WORKSPACE_CONTAINER_PROVISIONING > container health check passes`**: Create workspace, inspect container health status, verify it reports "healthy."
- **`WORKSPACE_CONTAINER_PROVISIONING > container SSH is accessible`**: Create workspace, get SSH connection info, attempt SSH connection to the container host:port, verify connection succeeds.
- **`WORKSPACE_CONTAINER_PROVISIONING > suspended workspace resumes with container start`**: Create workspace, suspend it, resume it, verify status returns to "running" and `freestyle_vm_id` is the same container ID.
- **`WORKSPACE_CONTAINER_PROVISIONING > failed container start triggers reprovision`**: Create workspace, suspend it, corrupt the container (docker rm the container), resume it, verify a new `freestyle_vm_id` is assigned and status is "running."
- **`WORKSPACE_CONTAINER_PROVISIONING > zombie workspace is detected and failed`**: Create workspace but prevent provisioning from completing (e.g., inject delay), wait >5 minutes, trigger a new workspace creation for same user/repo, verify the stale workspace is marked "failed."
- **`WORKSPACE_CONTAINER_PROVISIONING > returns 500 when no container runtime is available`**: With sandbox client set to null, POST to create workspace returns 500 with `"sandbox client unavailable"`.
- **`WORKSPACE_CONTAINER_PROVISIONING > provisioning failure returns structured error`**: With a deliberately broken image name, POST to create workspace returns 500 with error message containing the failure reason.
- **`WORKSPACE_CONTAINER_PROVISIONING > container is deleted when workspace is deleted`**: Create workspace, delete it, verify the container no longer exists (`docker inspect` returns not found).
- **`WORKSPACE_CONTAINER_PROVISIONING > container volumes are removed on deletion`**: Create workspace with volumes, delete it with volume removal, verify volumes are cleaned up.
- **`WORKSPACE_CONTAINER_PROVISIONING > idempotent creation reuses existing container`**: Create workspace, note container ID, create workspace again for same user/repo, verify the same container ID is returned.
- **`WORKSPACE_CONTAINER_PROVISIONING > workspace status stream reports provisioning transitions`**: Subscribe to SSE stream, create workspace, verify events show transition from `"starting"` to `"running"`.
- **`WORKSPACE_CONTAINER_PROVISIONING > container name follows expected format`**: Create workspace, inspect container, verify name matches `codeplane-workspace-[a-f0-9]{8}`.
- **`WORKSPACE_CONTAINER_PROVISIONING > custom resource limits are applied`**: Create workspace with memory and CPU limits configured, inspect container, verify `--memory` and `--cpus` constraints are set.
- **`WORKSPACE_CONTAINER_PROVISIONING > container SSH port 22 is always exposed`**: Create workspace without explicit port config, inspect container, verify port 22/tcp is in the port mappings.
- **`WORKSPACE_CONTAINER_PROVISIONING > workspace image contains required tools`**: Create workspace, exec `jj --version`, `git --version`, `bun --version`, `ssh -V` inside the container, verify all return success.
- **`WORKSPACE_CONTAINER_PROVISIONING > maximum health check timeout (120s) is respected`**: Create workspace with a deliberately slow-to-start image, verify provisioning fails after approximately 120 seconds, not before 100 seconds.
- **`WORKSPACE_CONTAINER_PROVISIONING > health check interval is 5 seconds`**: Create workspace, monitor docker inspect calls (or health check log entries), verify interval between checks is approximately 5 seconds.

### CLI E2E Tests

- **`codeplane workspace create > provisions container and returns running workspace`**: `codeplane workspace create --name cli-test --repo owner/repo --json` returns JSON with `status: "running"` and non-empty `freestyle_vm_id`.
- **`codeplane workspace ssh > connects to provisioned container`**: `codeplane workspace create --name ssh-test --repo owner/repo` then `codeplane workspace ssh --repo owner/repo` establishes SSH session (verify with a simple command execution).
- **`codeplane workspace create > shows clear error when no runtime`**: With Docker/Podman stopped, `codeplane workspace create --repo owner/repo` exits with code 1 and error message mentioning "sandbox client unavailable" or "container runtime."
- **`codeplane workspace issue > provisions workspace and runs agent`**: `codeplane workspace issue 1 --repo owner/repo --json` creates a workspace, shows provisioning progress, and reports workspace ID.
- **`codeplane workspace create > human-readable output shows provisioning status`**: `codeplane workspace create --name human-test --repo owner/repo` outputs "Creating workspace..." and then workspace details.
- **`codeplane workspace view > shows container ID after provisioning`**: Create workspace, then `codeplane workspace view <id> --repo owner/repo --json` includes `freestyle_vm_id`.

### TUI E2E Tests

- **`TUI_WORKSPACE > status transitions from starting to running`**: Create workspace from TUI, verify status badge transitions from `[starting]` (yellow) to `[running]` (green) within 120 seconds.
- **`TUI_WORKSPACE > provisioning failure shows error in status bar`**: With sandbox unavailable, create workspace from TUI, verify `[failed]` status badge (red) and error message in status bar.
- **`TUI_WORKSPACE > SSH info becomes available after provisioning`**: Create workspace from TUI, navigate to SSH tab, verify SSH command is displayed once status is "running."
- **`TUI_WORKSPACE > workspace detail shows VM ID`**: Create workspace, navigate to detail overview tab, verify container ID is displayed.

### Web UI Playwright Tests

- **`Workspace Provisioning UI > status badge transitions from Starting to Running`**: Create workspace via web UI, observe status badge, verify it transitions to "Running" with green indicator within 120 seconds.
- **`Workspace Provisioning UI > provisioning error displays error banner`**: With sandbox unavailable, create workspace, verify error banner displays with meaningful message.
- **`Workspace Provisioning UI > SSH connection info appears after provisioning`**: Create workspace, navigate to workspace detail, verify SSH command and connection info are displayed once running.
- **`Workspace Provisioning UI > SSE stream updates status in real-time`**: Create workspace, verify status updates arrive via SSE without page refresh (check network tab for SSE events).
- **`Workspace Provisioning UI > resume from suspended shows provisioning indicator`**: Suspend a workspace, click resume, verify provisioning/starting indicator appears and transitions to running.
