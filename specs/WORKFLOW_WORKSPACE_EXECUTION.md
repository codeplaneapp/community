# WORKFLOW_WORKSPACE_EXECUTION

Specification for WORKFLOW_WORKSPACE_EXECUTION.

## High-Level User POV

When a Codeplane workflow runs, each job needs a place to execute its steps — a sandboxed environment with the right tools, packages, and repository code checked out. Workflow Workspace Execution is the feature that provisions on-demand workspace containers for each workflow job, runs the job's steps inside that container, and tears the container down when the job completes.

Today, workflow tasks are created with a `runs-on` field and a `freestyleVmId` that starts as null. Workflow Workspace Execution closes this gap: when a workflow runner picks up a task, it reads the repository's workspace configuration (from `.codeplane/workspace.ts` or the job-level `runs-on` directive), provisions a workspace container matching that specification, clones the repository at the trigger ref, executes steps sequentially inside the container, streams logs back to the platform, and collects exit codes. When the job finishes — whether it succeeds, fails, or is cancelled — the container is cleaned up.

From the user's perspective, this means workflows "just work" out of the box. A user pushes a change, their workflow triggers, and they can watch each job spin up its environment, run commands, and report results — all without maintaining external CI runners or configuring third-party execution infrastructure. The user configures what tools and packages they need through a familiar TypeScript DSL in `.codeplane/workspace.ts`, or they can specify `runs-on` labels in their workflow definitions. Repository secrets and variables are automatically injected as environment variables. Artifacts produced during the run are uploaded and available for download. Cache entries scoped to the current bookmark accelerate subsequent runs.

For teams running Codeplane self-hosted, this means the Codeplane server itself acts as its own CI runner, provisioning containers via Docker or Podman on the host machine. There is no need to register external runners for basic workflows. For teams on Codeplane Cloud, the same workflow definitions execute on Firecracker microVMs with stronger isolation guarantees.

The experience is designed so that users interact with workflows through the web UI, CLI, or TUI exactly as before — dispatching workflows, watching runs, streaming logs, downloading artifacts — but now the execution backend is built into the platform rather than being a missing piece that requires external infrastructure.

## Acceptance Criteria

- A workflow task with `runs-on: "workspace"` (or `runs-on: "codeplane"`) must provision a new container workspace for the job before executing any steps.
- A workflow task with `runs-on: "workspace"` and a `.codeplane/workspace.ts` present in the repository must apply the workspace configuration (tools, packages, install command, services, env, user) to the provisioned container.
- If `.codeplane/workspace.ts` is absent and `runs-on: "workspace"`, the default workspace image (`ghcr.io/codeplane-ai/workspace:latest`) must be used with no additional customization.
- The repository must be cloned into the workspace container at the trigger ref and commit SHA specified in the workflow run before any steps execute.
- Repository secrets must be injected as environment variables into the container. Secret names must be uppercased and prefixed with `CODEPLANE_SECRET_`.
- Repository variables must be injected as environment variables into the container. Variable names must be uppercased and prefixed with `CODEPLANE_VAR_`.
- Each step in the job must execute sequentially in the container via shell command execution.
- Step output (stdout and stderr) must be streamed to the workflow log storage system in real time, not buffered until completion.
- Each step must respect its configured timeout. If no timeout is specified, a default timeout of 600 seconds (10 minutes) applies. Maximum allowed step timeout is 3600 seconds (1 hour).
- If a step fails (non-zero exit code) and `continueOnFail` is not set, the job must stop, mark the remaining steps as skipped, and mark the task and step as failed.
- If a step fails and `continueOnFail` is true, execution must continue to the next step and the job's final status must reflect the worst step outcome.
- When a job completes (success or failure), the container must be deleted within 60 seconds.
- When a job is cancelled via the cancel API, the currently executing step must be terminated, remaining steps marked as cancelled, and the container deleted.
- The `freestyleVmId` field on the workflow task must be updated with the container ID once provisioning completes.
- If container provisioning fails (Docker/Podman unavailable, image pull failure, healthcheck timeout), the task must be marked as failed with a clear error message in the workflow logs.
- If the container runtime (Docker/Podman) is not available on the host, the task must fail immediately with an actionable error message rather than hanging.
- Container resource limits (memory, CPU) must be configurable per-job via `runs-on` options. Default limits: 2GB memory, 2 CPU cores.
- A maximum of 10 concurrent workflow workspace containers per repository must be enforced to prevent resource exhaustion.
- A maximum of 50 concurrent workflow workspace containers per Codeplane instance must be enforced as a global limit.
- Container names must follow the pattern `codeplane-wfrun-{run_id_prefix}-{job_name_slug}-{random_suffix}` and must not exceed 63 characters (Docker name limit).
- Job names containing characters outside `[a-zA-Z0-9_-]` must have those characters replaced with `-` in the container name slug.
- Empty or whitespace-only step commands must be rejected at dispatch time with a 400 error.
- Workflow dispatch with `runs-on` values other than `"workspace"`, `"codeplane"`, or registered runner labels must return a 400 error explaining the unrecognized execution target.
- The agent token generated for the workflow run must be available inside the container as the `CODEPLANE_AGENT_TOKEN` environment variable.
- The workflow run ID must be available inside the container as `CODEPLANE_WORKFLOW_RUN_ID`.
- The repository owner, name, and default bookmark must be available as `CODEPLANE_REPO_OWNER`, `CODEPLANE_REPO_NAME`, and `CODEPLANE_DEFAULT_BOOKMARK`.
- Cache restore operations must execute before step commands when cache descriptors are present on the job.
- Cache save operations must execute after all steps complete successfully when cache descriptors are present.
- Artifact upload operations initiated by steps must be tracked against the workflow run and stored via the existing artifact storage system.
- If the Codeplane server process is stopped (SIGTERM/SIGINT) while workflow containers are running, all running containers must be stopped and cleaned up as part of graceful shutdown.
- Workflow workspace execution must not interfere with user-created workspaces. Workflow containers must be labeled distinctly (`tech.codeplane.workflow-run=true`) from interactive workspaces.

## Design

### API Shape

No new API endpoints are required. Workflow Workspace Execution is an internal execution backend that operates behind the existing workflow API surface:

- `POST /api/repos/:owner/:repo/workflows/:id/dispatches` — triggers a workflow; if jobs specify `runs-on: "workspace"`, the execution backend provisions containers.
- `GET /api/repos/:owner/:repo/runs/:id/logs` — SSE log stream now includes container provisioning logs as structured log entries (step 0, "Environment Setup").
- `GET /api/repos/:owner/:repo/workflows/runs/:id` — run detail now includes `execution_environment` field per step:
  ```json
  {
    "execution_environment": {
      "type": "workspace",
      "container_id": "abc123...",
      "image": "ghcr.io/codeplane-ai/workspace:latest",
      "status": "running | completed | failed | cleaned_up"
    }
  }
  ```
- `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel` — cancellation now triggers container cleanup.
- `GET /api/repos/:owner/:repo/workflows/runs/:id/events` — SSE event stream emits new event types:
  - `workspace.provisioning` — container is being created
  - `workspace.ready` — container is healthy and repo is cloned
  - `workspace.step_start` — a step is beginning execution
  - `workspace.step_complete` — a step finished (includes exit code)
  - `workspace.cleanup` — container is being removed

### SDK Shape

The SDK gains a `WorkflowExecutor` service that orchestrates the workspace lifecycle for a workflow task:

```typescript
interface WorkflowExecutorService {
  executeTask(task: WorkflowTask): Promise<TaskExecutionResult>;
  cancelTask(taskId: string): Promise<void>;
  cleanupOrphanedContainers(): Promise<number>;
}

interface TaskExecutionResult {
  status: "success" | "failure" | "cancelled";
  steps: StepResult[];
  containerUsed: {
    id: string;
    image: string;
    provisionDurationMs: number;
    totalDurationMs: number;
  };
}

interface StepResult {
  name: string;
  exitCode: number;
  durationMs: number;
  logCount: number;
  status: "success" | "failure" | "skipped" | "cancelled";
}
```

### Workflow Definition Shape

The existing workflow definition `jobs` config supports workspace execution via `runs-on`:

```json
{
  "on": { "push": { "bookmarks": ["main"] } },
  "jobs": {
    "test": {
      "runs-on": "workspace",
      "steps": [
        { "run": "bun install" },
        { "run": "bun test" }
      ]
    }
  }
}
```

### CLI Command

No new CLI commands. Existing commands gain awareness:

- `codeplane run logs <run-id>` — now streams container provisioning and step execution logs seamlessly.
- `codeplane run view <run-id>` — shows execution environment info per step.
- `codeplane run watch <run-id>` — real-time display includes workspace provisioning status indicators.
- `codeplane workflow dispatch <workflow> --ref <bookmark>` — works unchanged; workspace provisioning is transparent.

### Web UI Design

The existing workflow run detail page gains:

1. **Environment indicator**: Each job card shows an icon and label indicating the execution environment (e.g., "Workspace Container" with a container icon). Clicking the indicator expands to show image name, container ID (truncated), provision time, and resource limits.

2. **Provisioning phase in log timeline**: Before step 1 logs, a collapsible "Environment Setup" section appears showing container image pull progress, healthcheck status, repository clone output, and cache restore output.

3. **Step execution timeline**: Each step shows a start timestamp, duration, and exit code badge (green checkmark for 0, red X for non-zero). The currently executing step shows a spinner animation.

4. **Cleanup indicator**: After the last step, a "Cleanup" entry shows container teardown status.

5. **Resource usage summary** (if available from container stats): Peak memory usage and CPU time per job, shown in the job summary card.

### TUI UI

The TUI workflow run detail screen gains:

1. An "Environment" section showing the container image and status.
2. Step logs stream in real time with ANSI color preservation.
3. A status bar showing current step number, elapsed time, and container state.

### Documentation

The following end-user documentation must be written:

1. **Guide: "Running Workflows in Workspaces"** — explains how to set `runs-on: "workspace"` in workflow definitions, how `.codeplane/workspace.ts` customizes the execution environment, and how secrets/variables are injected.

2. **Guide: "Configuring Workflow Execution Environments"** — covers the workspace template DSL (`defineWorkspace`), tool installation, package management, service configuration, and resource limits.

3. **Reference: "Workflow Environment Variables"** — documents all `CODEPLANE_*` environment variables available inside workflow containers.

4. **Guide: "Workflow Caching"** — explains how cache restore/save integrates with workspace execution, including bookmark-scoped cache isolation.

5. **Guide: "Troubleshooting Workflow Execution"** — covers common failure modes (Docker not available, image pull failures, timeout errors, resource exhaustion) with resolution steps.

6. **FAQ entry: "What's the difference between a workflow workspace and an interactive workspace?"** — clarifies that workflow workspaces are ephemeral, automatically provisioned/destroyed, and distinct from user-created interactive workspaces.

## Permissions & Security

### Authorization

| Action | Owner | Admin | Member (Write) | Member (Read) | Anonymous |
|--------|-------|-------|-----------------|----------------|----------|
| Dispatch workflow (triggers workspace execution) | ✅ | ✅ | ✅ | ❌ | ❌ |
| View workflow run logs (including workspace logs) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cancel workflow run (triggers container cleanup) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Rerun workflow (provisions new workspace) | ✅ | ✅ | ✅ | ❌ | ❌ |
| View execution environment details | ✅ | ✅ | ✅ | ✅ | ❌ |
| Configure global container limits (admin) | ✅ (instance admin) | ❌ | ❌ | ❌ | ❌ |

### Rate Limiting

- Workflow dispatch: maximum 30 dispatches per repository per hour.
- Concurrent workspace containers per repository: maximum 10.
- Concurrent workspace containers per Codeplane instance: maximum 50.
- Container provisioning retries: maximum 3 attempts with exponential backoff (2s, 4s, 8s).

### Data Privacy

- Repository secrets are injected as environment variables and must never appear in workflow logs. The log streaming pipeline must redact any string that matches a known secret value.
- Agent tokens are short-lived (24-hour expiry) and hash-stored in the database.
- Container filesystem is destroyed on cleanup; no persistent state from workflow runs is retained outside of explicitly uploaded artifacts and cache entries.
- Container names must not contain sensitive information (no secret values, no full user emails).
- Workspace containers run in the same network namespace as the host by default. Administrators should be advised to use Docker network isolation if running untrusted workflow code.

## Telemetry & Product Analytics

### Business Events

| Event | Properties |
|-------|------------|
| `WorkflowWorkspaceProvisioned` | `repository_id`, `workflow_run_id`, `job_name`, `image`, `provision_duration_ms`, `workspace_config_source` ("file" | "default"), `container_runtime` ("docker" | "podman") |
| `WorkflowWorkspaceStepExecuted` | `repository_id`, `workflow_run_id`, `job_name`, `step_index`, `step_command_hash`, `exit_code`, `duration_ms`, `timed_out` (boolean) |
| `WorkflowWorkspaceCompleted` | `repository_id`, `workflow_run_id`, `job_name`, `status` ("success" | "failure" | "cancelled"), `total_duration_ms`, `step_count`, `steps_succeeded`, `steps_failed`, `cache_hit` (boolean) |
| `WorkflowWorkspaceProvisionFailed` | `repository_id`, `workflow_run_id`, `job_name`, `error_category` ("runtime_unavailable" | "image_pull_failed" | "healthcheck_timeout" | "resource_limit"), `error_message` |
| `WorkflowWorkspaceCleanedUp` | `repository_id`, `workflow_run_id`, `job_name`, `cleanup_duration_ms`, `was_orphaned` (boolean) |
| `WorkflowWorkspaceConcurrencyLimitHit` | `repository_id`, `scope` ("repository" | "instance"), `current_count`, `limit` |

### Funnel Metrics

1. **Provisioning success rate**: `WorkflowWorkspaceProvisioned / (WorkflowWorkspaceProvisioned + WorkflowWorkspaceProvisionFailed)` — target ≥ 99%.
2. **Median provision time**: p50 of `provision_duration_ms` — target ≤ 30 seconds.
3. **Step success rate**: percentage of steps with `exit_code = 0` — informational, no target (user code dependent).
4. **Cache hit rate**: percentage of jobs with `cache_hit = true` — target ≥ 60% for repositories with cache configured.
5. **Cleanup completeness**: `WorkflowWorkspaceCleanedUp / WorkflowWorkspaceCompleted` — target = 100%.
6. **Concurrency limit hit frequency**: rate of `WorkflowWorkspaceConcurrencyLimitHit` events — should trend toward 0.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-----------|
| Container provisioning started | `info` | `workflow_run_id`, `job_name`, `image`, `container_runtime` |
| Container provisioning completed | `info` | `workflow_run_id`, `job_name`, `container_id`, `provision_duration_ms` |
| Container provisioning failed | `error` | `workflow_run_id`, `job_name`, `error`, `image`, `container_runtime` |
| Repository clone started | `info` | `workflow_run_id`, `job_name`, `container_id`, `ref`, `commit_sha` |
| Repository clone completed | `info` | `workflow_run_id`, `job_name`, `container_id`, `clone_duration_ms` |
| Step execution started | `info` | `workflow_run_id`, `job_name`, `step_index`, `step_name`, `container_id` |
| Step execution completed | `info` | `workflow_run_id`, `job_name`, `step_index`, `exit_code`, `duration_ms` |
| Step execution timed out | `warn` | `workflow_run_id`, `job_name`, `step_index`, `timeout_ms`, `container_id` |
| Secret redaction applied | `debug` | `workflow_run_id`, `redacted_count` |
| Cache restore started | `info` | `workflow_run_id`, `job_name`, `cache_key` |
| Cache restore hit/miss | `info` | `workflow_run_id`, `job_name`, `cache_key`, `hit` (boolean) |
| Cache save completed | `info` | `workflow_run_id`, `job_name`, `cache_key`, `size_bytes` |
| Container cleanup started | `info` | `workflow_run_id`, `job_name`, `container_id` |
| Container cleanup completed | `info` | `workflow_run_id`, `container_id`, `cleanup_duration_ms` |
| Container cleanup failed | `error` | `workflow_run_id`, `container_id`, `error` |
| Orphaned container detected | `warn` | `container_id`, `container_name`, `age_seconds` |
| Concurrency limit reached | `warn` | `scope` ("repository" | "instance"), `current_count`, `limit`, `repository_id` |
| Graceful shutdown: containers stopped | `info` | `container_count`, `shutdown_duration_ms` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_workspace_provisions_total` | counter | `repository_id`, `status` ("success" | "failure"), `runtime` | Total workspace provisions |
| `codeplane_workflow_workspace_provision_duration_seconds` | histogram | `repository_id`, `runtime` | Time to provision a workspace (buckets: 5, 10, 15, 30, 60, 120) |
| `codeplane_workflow_workspace_active_containers` | gauge | `repository_id` | Currently running workflow workspace containers |
| `codeplane_workflow_workspace_active_containers_total` | gauge | — | Total currently running workflow workspace containers (instance-wide) |
| `codeplane_workflow_workspace_step_duration_seconds` | histogram | `repository_id`, `status` | Step execution duration (buckets: 1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600) |
| `codeplane_workflow_workspace_step_exits_total` | counter | `repository_id`, `exit_code_class` | Step exit code distribution |
| `codeplane_workflow_workspace_cleanup_duration_seconds` | histogram | — | Container cleanup duration (buckets: 1, 5, 10, 30, 60) |
| `codeplane_workflow_workspace_cleanup_failures_total` | counter | — | Failed container cleanups |
| `codeplane_workflow_workspace_orphaned_containers_total` | counter | — | Orphaned containers detected and cleaned |
| `codeplane_workflow_workspace_concurrency_limit_hits_total` | counter | `scope` | Times concurrency limit was reached |
| `codeplane_workflow_workspace_clone_duration_seconds` | histogram | `repository_id` | Repository clone duration |
| `codeplane_workflow_workspace_cache_operations_total` | counter | `repository_id`, `operation`, `result` | Cache operation outcomes |

### Alerts

#### Alert: `WorkflowWorkspaceProvisionFailureRateHigh`
- **Condition**: `rate(codeplane_workflow_workspace_provisions_total{status="failure"}[15m]) / rate(codeplane_workflow_workspace_provisions_total[15m]) > 0.1`
- **Severity**: Critical
- **Runbook**:
  1. Check if Docker/Podman daemon is running on the host: `docker info` or `podman info`.
  2. Check if the workspace image can be pulled: `docker pull ghcr.io/codeplane-ai/workspace:latest`.
  3. Check host disk space: `df -h` — container provisioning requires at least 2GB free.
  4. Check host memory: `free -h` — each container needs its configured memory limit.
  5. Check container runtime logs: `journalctl -u docker` or `/var/log/containers/`.
  6. Check if the healthcheck timeout is too aggressive: inspect recent failed containers with `docker logs <container_id>`.
  7. If the image registry is unreachable, check network connectivity and DNS resolution.

#### Alert: `WorkflowWorkspaceProvisionSlow`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workflow_workspace_provision_duration_seconds_bucket[15m])) > 60`
- **Severity**: Warning
- **Runbook**:
  1. Check if the workspace image is cached locally: `docker images | grep codeplane-ai/workspace`.
  2. If not cached, pre-pull the image: `docker pull ghcr.io/codeplane-ai/workspace:latest`.
  3. Check host I/O performance: `iostat -x 1 5` — slow disk can delay container startup.
  4. Check if too many containers are starting concurrently — review `codeplane_workflow_workspace_active_containers_total`.
  5. Consider reducing the healthcheck start period if the container is consistently healthy before the timeout.

#### Alert: `WorkflowWorkspaceContainerLeaks`
- **Condition**: `codeplane_workflow_workspace_orphaned_containers_total increase over 1h > 5`
- **Severity**: Warning
- **Runbook**:
  1. List orphaned containers: `docker ps -a --filter label=tech.codeplane.workflow-run=true --format '{{.ID}} {{.Names}} {{.Status}}'`.
  2. Check if the Codeplane server process crashed or was killed without graceful shutdown.
  3. Manually clean up orphaned containers: `docker rm -f <container_id>`.
  4. Verify the cleanup scheduler is running: check server logs for `cleanup scheduler` entries.
  5. If leaks persist, check for race conditions between container provisioning and task cancellation.

#### Alert: `WorkflowWorkspaceCleanupFailures`
- **Condition**: `rate(codeplane_workflow_workspace_cleanup_failures_total[15m]) > 0`
- **Severity**: Warning
- **Runbook**:
  1. Check Docker daemon responsiveness: `docker ps` — if this hangs, the daemon may be overloaded.
  2. Check for containers in "removing" state: `docker ps -a --filter status=removing`.
  3. Force-remove stuck containers: `docker rm -f <container_id>`.
  4. If the container runtime is systemd-managed, check its status: `systemctl status docker`.
  5. Review Codeplane server error logs for the specific cleanup failure message.

#### Alert: `WorkflowWorkspaceConcurrencyNearLimit`
- **Condition**: `codeplane_workflow_workspace_active_containers_total > 40` (80% of the default 50 limit)
- **Severity**: Warning
- **Runbook**:
  1. Review which repositories are consuming the most containers: query by `repository_id` label.
  2. Check if any workflow runs are stuck — containers should be short-lived.
  3. Cancel long-running or stuck workflow runs via the API or admin UI.
  4. Consider increasing the instance-level limit if the host has sufficient resources.
  5. Consider implementing per-repository limits if one repository is consuming disproportionate resources.

#### Alert: `WorkflowWorkspaceStepTimeoutsHigh`
- **Condition**: `rate(codeplane_workflow_workspace_step_exits_total{exit_code_class="timeout"}[1h]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Identify which repositories and steps are timing out from the logs.
  2. Check if the default timeout (600s) is too low for the workload — users may need to increase step timeouts.
  3. Check container resource usage — steps may be timing out due to memory or CPU starvation.
  4. Verify network connectivity inside containers — steps that download dependencies may time out if network is slow.

### Error Cases and Failure Modes

| Failure Mode | Behavior | User-Visible Message |
|---|---|---|
| Docker/Podman not installed or not running | Task fails immediately | "Workflow execution requires Docker or Podman. Neither container runtime was found on this Codeplane instance." |
| Image pull fails (network error) | Retry up to 3 times, then fail | "Failed to pull workspace image `{image}`. Check network connectivity and image registry access." |
| Image pull fails (image not found) | Task fails immediately | "Workspace image `{image}` not found. Verify the image name and tag." |
| Container healthcheck timeout | Task fails after timeout | "Workspace container failed to become healthy within {timeout}s. Check the workspace configuration." |
| Repository clone fails | Task fails | "Failed to clone repository at ref `{ref}`. Verify the ref exists." |
| Step timeout | Step marked failed, subsequent steps skipped (unless continueOnFail) | "Step `{name}` timed out after {timeout}s." |
| Step OOM kill | Step marked failed, container may need restart | "Step `{name}` was killed due to memory exhaustion. Consider increasing the memory limit." |
| Concurrency limit reached (repository) | Task queued, retried after existing container exits | "Workflow execution queued: repository has reached the maximum of {limit} concurrent workflow containers." |
| Concurrency limit reached (instance) | Task queued, retried after existing container exits | "Workflow execution queued: this Codeplane instance has reached the maximum of {limit} concurrent workflow containers." |
| Container cleanup fails | Logged as error, orphan cleanup will retry | (Not user-visible; cleanup is best-effort) |
| Server shutdown during execution | Containers stopped, tasks marked cancelled | "Workflow run was cancelled due to server shutdown." |
| Disk space exhaustion on host | Container provisioning fails | "Insufficient disk space to create workspace container. Free disk space on the host." |

## Verification

### API Integration Tests

1. **Dispatch workflow with `runs-on: workspace` creates container and executes steps successfully**: dispatch a workflow with a single job containing `runs-on: "workspace"` and one step `echo hello`, verify the run completes with status "success" and logs contain "hello".

2. **Dispatch workflow with `runs-on: codeplane` is treated as workspace execution**: verify `"codeplane"` is accepted as an alias for `"workspace"`.

3. **Dispatch workflow with unknown `runs-on` value returns 400**: dispatch with `runs-on: "nonexistent-runner"`, verify 400 response with descriptive error.

4. **Multi-step job executes steps sequentially**: dispatch a job with 3 steps that write to files (`echo 1 > /tmp/a`, `echo 2 > /tmp/b`, `cat /tmp/a /tmp/b > /tmp/c`), verify the final step produces correct output.

5. **Step failure stops subsequent steps**: dispatch a job with steps [exit 0, exit 1, echo "should not run"], verify step 3 is marked "skipped" and the run status is "failure".

6. **Step failure with continueOnFail continues execution**: dispatch a job with steps [exit 1 (continueOnFail: true), echo "still running"], verify step 2 runs and the run reports "failure" overall.

7. **Step timeout terminates execution**: dispatch a job with a step `sleep 999` and timeout of 5 seconds, verify the step is marked failed with a timeout indicator.

8. **Maximum step timeout (3600s) is accepted**: dispatch a job with a step timeout of 3600, verify it is accepted without error.

9. **Step timeout exceeding 3600s is rejected**: dispatch a job with a step timeout of 3601, verify 400 response.

10. **Empty step command is rejected at dispatch**: dispatch a job with a step `{ "run": "" }`, verify 400 response.

11. **Whitespace-only step command is rejected at dispatch**: dispatch a job with a step `{ "run": "   " }`, verify 400 response.

12. **Repository secrets are injected as environment variables**: create a secret `MY_SECRET=hunter2`, dispatch a job with step `echo $CODEPLANE_SECRET_MY_SECRET`, verify logs contain "hunter2" but the log storage redacts it to `***`.

13. **Repository variables are injected as environment variables**: create a variable `MY_VAR=hello`, dispatch a job with step `echo $CODEPLANE_VAR_MY_VAR`, verify logs contain "hello".

14. **Agent token is available in container**: dispatch a job with step `test -n "$CODEPLANE_AGENT_TOKEN"`, verify step succeeds (exit code 0).

15. **Workflow run ID is available in container**: dispatch a job with step `echo $CODEPLANE_WORKFLOW_RUN_ID`, verify logs contain the actual run ID.

16. **Repository owner/name/bookmark are available**: dispatch a job with step `echo $CODEPLANE_REPO_OWNER $CODEPLANE_REPO_NAME $CODEPLANE_DEFAULT_BOOKMARK`, verify correct values.

17. **Cancel running workflow cleans up container**: dispatch a long-running job, cancel it via API, verify the run status becomes "cancelled" and the container is removed.

18. **Rerun workflow provisions a new container**: rerun a completed workflow, verify a new container is provisioned (different container ID).

19. **Container is cleaned up after successful completion**: dispatch a simple job, wait for completion, verify the container no longer exists (Docker inspect returns not found).

20. **Container is cleaned up after failure**: dispatch a failing job, wait for completion, verify container cleanup.

21. **Concurrent jobs in same workflow get separate containers**: dispatch a workflow with 2 independent jobs, verify each gets its own container ID.

22. **Repository concurrency limit is enforced**: configure limit of 2, dispatch 3 concurrent jobs for the same repo, verify 2 run immediately and 1 is queued.

23. **Instance concurrency limit is enforced**: configure limit of 3, dispatch 4 concurrent jobs across different repos, verify 3 run and 1 is queued.

24. **Queued job starts when a container slot opens**: dispatch jobs to fill the concurrency limit, wait for one to complete, verify the queued job starts.

25. **Log streaming includes provisioning phase**: connect to log SSE before dispatching, verify log entries for "Environment Setup" appear before step 1 logs.

26. **Log streaming includes step markers**: verify SSE log stream includes step start/complete events with step indices.

27. **Run detail includes execution environment info**: GET run detail after completion, verify `execution_environment` is populated per step.

28. **Event stream emits workspace lifecycle events**: connect to event SSE, dispatch a job, verify events `workspace.provisioning`, `workspace.ready`, `workspace.step_start`, `workspace.step_complete`, `workspace.cleanup` appear.

29. **`.codeplane/workspace.ts` config is applied**: create a repo with `.codeplane/workspace.ts` that installs `jq`, dispatch a job with step `jq --version`, verify it succeeds.

30. **Default workspace image works without config file**: dispatch a job in a repo without `.codeplane/workspace.ts`, verify the default image is used and basic commands work.

31. **Container resource limits are applied**: dispatch a job with memory limit "512m", run `cat /sys/fs/cgroup/memory.max` (or equivalent), verify the limit is applied.

32. **Container labels distinguish workflow containers from user workspaces**: dispatch a job, inspect the container, verify label `tech.codeplane.workflow-run=true` is present.

33. **Workflow task `freestyleVmId` is updated with container ID**: dispatch a job, query the task record, verify `freestyleVmId` is set to the container ID.

34. **Cache restore executes before steps**: dispatch a job with cache config and a pre-populated cache, verify the cache is restored before step 1 (check file existence in step 1).

35. **Cache save executes after successful completion**: dispatch a job that produces cache-worthy output, verify cache entry is created after completion.

36. **Cache is not saved after failed run**: dispatch a failing job with cache config, verify no new cache entry is created.

37. **Orphaned container cleanup works**: create a container with workflow labels but no associated task, trigger cleanup, verify the container is removed.

38. **Graceful shutdown cleans up running containers**: start a long-running workflow job, send SIGTERM to the server, verify the container is stopped.

### CLI E2E Tests

39. **`codeplane workflow dispatch` triggers workspace execution**: dispatch a workflow with workspace runs-on via CLI, verify output shows run ID and status transitions.

40. **`codeplane run logs` streams workspace provisioning and step logs**: dispatch a workflow, run `run logs`, verify provisioning logs and step output appear in order.

41. **`codeplane run view` shows execution environment**: dispatch a workflow, run `run view`, verify execution environment info is displayed.

42. **`codeplane run watch` shows real-time workspace status**: dispatch a workflow, run `run watch`, verify status indicators update as provisioning → running → completed.

43. **`codeplane run cancel` cleans up workspace container**: dispatch a long-running workflow, cancel via CLI, verify cancellation succeeds and container is cleaned up.

### Playwright (Web UI) E2E Tests

44. **Workflow run detail page shows environment setup section**: dispatch a workflow, navigate to run detail, verify "Environment Setup" collapsible section appears in the log timeline.

45. **Workflow run detail page shows execution environment indicator**: verify job card displays "Workspace Container" label with correct image name.

46. **Workflow run log stream updates in real time**: dispatch a multi-step workflow, observe the run detail page, verify logs for each step appear progressively.

47. **Step status badges show correct states**: verify each step shows spinner (running), green check (success), or red X (failure) appropriately.

48. **Cancelled run shows cleanup status**: cancel a running workflow from the UI, verify the cleanup indicator appears.

49. **Failed provisioning shows actionable error**: dispatch a workflow when Docker is unavailable (simulated), verify the UI shows a clear error message in the environment setup section.

### Boundary & Edge Case Tests

50. **Job name with special characters is slugified correctly**: dispatch a job named `build & deploy (prod)`, verify the container name uses slug `build---deploy--prod-` and does not exceed 63 characters.

51. **Job name that would produce a container name exceeding 63 characters is truncated**: dispatch a job with a 60-character name, verify the container name is truncated to 63 characters.

52. **Maximum number of steps per job (100) is accepted**: dispatch a job with 100 steps, verify all execute.

53. **More than 100 steps per job is rejected**: dispatch a job with 101 steps, verify 400 response.

54. **Step command with maximum length (65536 characters) is accepted**: dispatch a job with a step command of exactly 65536 characters (a long echo), verify it is accepted.

55. **Step command exceeding maximum length is rejected**: dispatch a job with a step command of 65537 characters, verify 400 response.

56. **Workflow with both workspace and non-workspace jobs works**: dispatch a workflow where job A uses `runs-on: "workspace"` and job B uses a different runner, verify job A provisions a container and job B follows its own execution path.

57. **Rapid sequential dispatches for the same workflow each get independent containers**: dispatch the same workflow 3 times rapidly, verify 3 separate containers are created.

58. **Container cleanup succeeds even if Docker daemon is slow**: simulate a slow Docker stop (container with trap), verify cleanup completes within the 60-second window.
