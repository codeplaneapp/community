# WORKFLOW_STEP_RUN_SCRIPT

Specification for WORKFLOW_STEP_RUN_SCRIPT.

## High-Level User POV

As a workflow author, I need to run shell scripts as workflow steps so that I can execute arbitrary build, test, and deployment commands within my CI/CD pipelines. The `run` field in a workflow step lets me specify a shell script (bash by default) that executes in the workspace context with access to environment variables, secrets, and the repository checkout.

## Acceptance Criteria

1. A workflow step with a `run` field executes the provided script in a shell process.
2. The script runs in the workspace directory with the repository checked out.
3. Environment variables from `env` (step, job, and workflow level) are merged and available.
4. Secrets referenced via `${{ secrets.NAME }}` are injected as environment variables.
5. The step exits with the script's exit code; non-zero fails the step unless `continue-on-error: true`.
6. stdout and stderr are captured and streamed to the workflow run log in real time via SSE.
7. The `shell` field allows overriding the default shell (bash) with sh, zsh, or a custom shell command.
8. The `working-directory` field allows overriding the default working directory.
9. Multi-line scripts are supported via YAML block scalars.
10. The step respects `timeout-minutes` and is killed with SIGTERM then SIGKILL if exceeded.
11. The step respects `if` conditional expressions for skipping execution.
12. Inline expressions `${{ ... }}` in the script body are interpolated before execution.

## Design

The workflow engine's step executor detects a `run` field and delegates to the script runner subsystem. The script content is written to a temporary file in the workspace, made executable, and invoked via the configured shell (default: `bash -e {0}`). The process is spawned with merged environment variables (workflow env < job env < step env, plus built-in context variables like CODEPLANE_REPOSITORY, CODEPLANE_REF, CODEPLANE_WORKSPACE). stdout/stderr are piped through the log service which persists lines to the run log store and emits them over the SSE event stream for real-time UI consumption. The step runner monitors the child process for exit code and timeout, updating step status to `success`, `failure`, or `cancelled` accordingly. The temporary script file is cleaned up after execution. This runs inside the container sandbox when workspaces are available, or directly on the runner host in bare-runner mode.

## Permissions & Security

The script executes with the permissions of the workflow runner process within the container sandbox. Repository secrets are only injected if the workflow trigger context has read access to secrets (e.g., not available for forked-repo landing request triggers unless explicitly configured). Admin-level workflow settings control whether `run` steps can access the network, mount volumes, or escalate privileges. The sandbox boundary enforced by the workspace container prevents script breakout.

## Telemetry & Product Analytics

Each script step execution emits structured telemetry: `workflow.step.run.start` (with step name, job name, run ID, shell), `workflow.step.run.complete` (with exit code, duration_ms, log line count, status). Timeout kills emit `workflow.step.run.timeout`. These events feed into the workflow run event stream and are available via the workflow run events SSE endpoint. Aggregate metrics (step duration histograms, failure rates by repository) are exported for monitoring dashboards.

## Observability

Script step logs are streamed in real time via the workflow run log SSE endpoint (`GET /api/repos/:owner/:repo/workflows/runs/:runId/logs`). Each log line includes a timestamp, stream identifier (stdout/stderr), and step reference. The workflow run detail API returns step-level status, duration, and exit code. Failed steps surface the last N lines of output in the run summary. The admin health dashboard includes runner utilization and step queue depth. Structured log entries from the workflow engine include correlation IDs linking run, job, and step for distributed tracing.

## Verification

1. Unit tests: script runner correctly writes temp file, invokes shell, captures exit code, and cleans up.
2. Unit tests: environment variable merging precedence (step > job > workflow) is correct.
3. Unit tests: timeout enforcement kills process and marks step as cancelled/failed.
4. Unit tests: `continue-on-error: true` marks step as success even on non-zero exit.
5. Unit tests: expression interpolation in script body resolves context variables and secrets.
6. Integration tests: end-to-end workflow dispatch with a `run` step produces expected log output and run status.
7. Integration tests: SSE log stream delivers lines in real time during step execution.
8. Integration tests: multi-step workflow with sequential `run` steps executes in order and short-circuits on failure.
9. E2E tests: CLI `workflow run` dispatches a workflow with script steps and `workflow logs` streams output.
10. E2E tests: web UI workflow run detail page shows step logs, status badges, and duration for script steps.
