# WORKFLOW_CLI_DISPATCH

Specification for WORKFLOW_CLI_DISPATCH.

## High-Level User POV

When a developer is working in their terminal and wants to trigger a workflow, they should be able to do so with a single CLI command without needing to open the web UI or remember obscure numeric IDs. The `codeplane workflow dispatch` command lets users kick off any dispatchable workflow by its human-readable name, file path, or numeric ID, and optionally supply typed inputs that the workflow expects.

A typical interaction looks like this: a developer has a workflow called "deploy" that accepts an environment input. From their terminal, they run `codeplane workflow dispatch deploy --input environment=staging --ref release/v2` and the workflow begins executing immediately. The CLI confirms dispatch success and optionally follows the run with live-streamed status updates. If the developer mistypes the workflow name, the CLI suggests close matches rather than presenting a cryptic error. If the workflow requires inputs that weren't provided, the CLI tells the user exactly which inputs are missing and what types they should be.

This feature makes Codeplane's workflow system fully operational from the CLI, enabling scriptable CI/CD triggers, agent-driven automation pipelines, and quick manual dispatches from day-to-day terminal workflows. It is especially valuable for teams that use Codeplane's local-first daemon mode or work primarily from editors and terminal tooling rather than the web interface.

The dispatch command is the CLI surface of the broader manual dispatch trigger system. It works in concert with the web UI dispatch button, the TUI dispatch modal, and the API dispatch endpoints to provide a unified experience across all Codeplane clients.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane workflow dispatch <identifier>` accepts a workflow name, path stem, full path, or numeric ID as the positional argument
- [ ] The `--input key=value` flag can be specified zero or more times to pass typed inputs to the workflow
- [ ] The `--ref <ref>` flag specifies the ref to dispatch against, defaulting to `"main"`
- [ ] The `--repo OWNER/REPO` flag overrides the repository context when not inside a repo directory
- [ ] A successful dispatch prints a structured confirmation including the run ID, workflow name, status, and trigger type
- [ ] A failed dispatch exits with a non-zero exit code and prints a descriptive error message
- [ ] The CLI uses the by-name dispatch API endpoint (`POST /api/repos/:owner/:repo/workflows/:identifier/dispatch`) rather than the numeric-only endpoint
- [ ] All existing E2E tests in `e2e/cli/workflow-dispatch.test.ts` pass
- [ ] The `--json` output flag produces machine-readable JSON output for scripting

### Identifier Resolution

- [ ] Numeric strings (e.g., `"42"`) resolve to the workflow definition with that numeric ID
- [ ] Non-numeric strings resolve by exact case-insensitive name match first
- [ ] If no name match, resolve by path stem (filename without extension, e.g., `"ci"` matches `.codeplane/workflows/ci.ts`)
- [ ] If no path stem match, resolve by full path match
- [ ] If no match is found, return a 404 error with a descriptive message
- [ ] If the identifier is ambiguous (multiple matches), the CLI reports the ambiguity and lists the conflicting workflows
- [ ] On near-miss (Levenshtein distance ≤ 3 from a known workflow name), the error message suggests the closest match

### Input Handling

- [ ] `--input key=value` is parsed as `key` → `"value"` (string)
- [ ] Multiple `--input` flags accumulate into a single inputs object
- [ ] Duplicate `--input` keys: the last value wins
- [ ] `--input` with no `=` separator is rejected with a clear error message
- [ ] `--input` key must be non-empty; an empty key is rejected
- [ ] Input values are passed as strings to the API; the server handles type coercion
- [ ] Maximum input key length: 256 characters
- [ ] Maximum input value length: 10,000 characters
- [ ] Maximum number of `--input` flags per dispatch: 100
- [ ] Maximum total serialized input payload: 64 KB
- [ ] If the workflow defines required inputs with no defaults and the user omits them, the server returns a 400 error and the CLI displays the missing input names

### Ref Handling

- [ ] `--ref` accepts bare bookmark/branch names (e.g., `main`)
- [ ] `--ref` accepts qualified refs (e.g., `refs/heads/main`, `refs/bookmarks/main`, `bookmarks/main`) and the server normalizes them
- [ ] If `--ref` is omitted, defaults to `"main"`
- [ ] If the specified ref does not exist on the repository, the server returns a 404 or 400 error

### Output Behavior

- [ ] Default output: human-readable table/line format showing run ID, workflow name, status, trigger
- [ ] `--json` output: structured JSON object with fields `id`, `workflow_name`, `status`, `trigger`, `inputs`, `ref`
- [ ] `--json` output supports field filtering (e.g., `--json id,status`)
- [ ] `--watch` flag: after dispatch, automatically streams the run's status and logs until completion

### Edge Cases

- [ ] Dispatching an inactive workflow returns a clear error indicating the workflow is not active
- [ ] Dispatching a workflow that does not declare `on.workflow_dispatch` returns an error indicating the workflow is not manually dispatchable
- [ ] Dispatching with an empty body (no ref, no inputs) succeeds using defaults
- [ ] Dispatching when unauthenticated returns a 401 error
- [ ] Dispatching without write permission on the repository returns a 403 error
- [ ] Dispatching against a nonexistent repository returns a 404 error
- [ ] Dispatching with malformed JSON in the request body returns a 400 error
- [ ] Network errors (server unreachable) produce a clear connectivity error message

## Design

### CLI Command

#### Synopsis

```
codeplane workflow dispatch <identifier> [flags]
```

#### Arguments

| Argument | Type | Required | Description |
|---|---|---|---|
| `identifier` | string | Yes | Workflow name, path stem, full path, or numeric ID |

#### Flags

| Flag | Short | Type | Default | Description |
|---|---|---|---|---|
| `--ref` | `-r` | string | `"main"` | Ref (bookmark/branch) to dispatch against |
| `--input` | `-i` | string (repeatable) | — | Input as `key=value`; repeatable |
| `--repo` | `-R` | string | auto-detect | Repository in `OWNER/REPO` format |
| `--json` | | boolean/string | — | Output as JSON; optionally specify fields |
| `--watch` | `-w` | boolean | `false` | Follow the run after dispatch |

#### Examples

```bash
# Dispatch by name with default ref
codeplane workflow dispatch deploy

# Dispatch with inputs and a specific ref
codeplane workflow dispatch deploy --ref release/v2 --input environment=staging --input debug=true

# Dispatch by numeric ID
codeplane workflow dispatch 42

# Dispatch and follow the run
codeplane workflow dispatch ci-pipeline --watch

# Dispatch with JSON output for scripting
codeplane workflow dispatch deploy --json

# Dispatch in a different repo
codeplane workflow dispatch deploy --repo myorg/myrepo --input version=1.2.3
```

#### Default Output

```
✓ Workflow dispatched

  Run ID:    187
  Workflow:  deploy
  Ref:       release/v2
  Status:    queued
  Trigger:   workflow_dispatch
  Inputs:    environment=staging, debug=true
```

#### JSON Output

```json
{
  "id": 187,
  "workflow_name": "deploy",
  "ref": "release/v2",
  "status": "queued",
  "trigger": "workflow_dispatch",
  "inputs": {
    "environment": "staging",
    "debug": "true"
  }
}
```

#### Error Output (name not found, with suggestion)

```
Error: Workflow "deplo" not found in myorg/myrepo

  Did you mean: deploy?

  Available workflows:
    deploy          .codeplane/workflows/deploy.ts
    ci-pipeline     .codeplane/workflows/ci.ts
    lint            .codeplane/workflows/lint.ts
```

#### Error Output (missing required input)

```
Error: Missing required inputs for workflow "deploy"

  Missing:
    - environment (choice: staging, production)
    - version (string, required)
```

### API Shape

The CLI calls the by-name dispatch endpoint:

```
POST /api/repos/:owner/:repo/workflows/:identifier/dispatch
Content-Type: application/json
Authorization: Bearer <token>

{
  "ref": "release/v2",
  "inputs": {
    "environment": "staging",
    "debug": "true"
  }
}
```

**Success Response**: `204 No Content`

The CLI then fetches the latest run to populate its output:

```
GET /api/repos/:owner/:repo/workflows/runs?limit=1&trigger=workflow_dispatch
```

**Error Responses**:

| Status | Condition | Body |
|---|---|---|
| 400 | Invalid inputs, malformed body | `{ "error": "...", "details": { "missing": [...], "invalid": [...] } }` |
| 401 | Not authenticated | `{ "error": "Authentication required" }` |
| 403 | Insufficient permissions | `{ "error": "Write access required" }` |
| 404 | Workflow or repo not found | `{ "error": "Workflow not found", "suggestions": ["deploy"] }` |
| 409 | Ambiguous identifier | `{ "error": "Ambiguous workflow identifier", "matches": [...] }` |
| 422 | Workflow not dispatchable | `{ "error": "Workflow does not support manual dispatch" }` |

### SDK Shape

The `@codeplane/ui-core` API client should expose:

```typescript
function dispatchWorkflow(
  owner: string,
  repo: string,
  identifier: string,
  options?: {
    ref?: string;
    inputs?: Record<string, string>;
  }
): Promise<void>;
```

This is consumed by the CLI, TUI, and web UI dispatch flows.

### Documentation

The following end-user documentation should be written:

1. **CLI Reference — `workflow dispatch`**: Full command synopsis, argument descriptions, flag documentation, examples covering dispatch by name/ID/path, inputs, ref override, JSON output, and `--watch` mode. Include a "Common Errors" section with resolution steps.

2. **Workflow Authoring Guide — Manual Dispatch Trigger**: How to declare `on.manualDispatch()` in a workflow definition, including typed input schemas (string, boolean, choice), defaults, required vs optional inputs, and a complete working example workflow.

3. **Workflows Overview — Triggering Workflows**: A section explaining the different trigger types, with manual dispatch highlighted as the way to run workflows on-demand from CLI, web, or TUI. Include a quick-start example showing a workflow definition and matching dispatch command.

## Permissions & Security

### Authorization

| Role | Can Dispatch? | Notes |
|---|---|---|
| Repository Owner | ✅ Yes | Full access |
| Organization Admin | ✅ Yes | Full access to org repos |
| Repository Admin | ✅ Yes | Full access |
| Team Member (Write) | ✅ Yes | Standard dispatch access |
| Team Member (Read) | ❌ No | Can view workflows but not dispatch |
| Anonymous | ❌ No | Cannot access dispatch endpoint |

Write access to the repository is the minimum permission required. The dispatch endpoint must validate the authenticated user's permission level before executing.

### Rate Limiting

| Scope | Limit | Window |
|---|---|---|
| Per user per repository | 30 dispatches | 1 minute |
| Per user global | 120 dispatches | 1 minute |
| Per repository global | 300 dispatches | 1 minute |

Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy

- Dispatch inputs may contain sensitive values (e.g., environment names, version strings). Inputs are stored in the workflow run record and are visible to anyone with read access to the repository.
- The CLI must never log input values at debug level without explicit user opt-in (`--verbose`).
- Input values must not appear in URL query parameters; they are always transmitted in the POST body.
- Workflow agent tokens generated at dispatch time are hashed before storage and expire after 24 hours.

### Secret Handling

- The `--input` flag is for workflow inputs, not secrets. Secrets should be configured via `codeplane secret` and injected at runtime.
- CLI should warn if an `--input` value looks like it might be a secret (e.g., matches common secret patterns like `sk-*`, `ghp_*`, or is longer than 256 characters and high-entropy).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `WorkflowDispatched` | Successful dispatch via any client | `client` (cli/web/tui/api), `identifier_type` (name/id/path_stem/full_path), `has_inputs` (boolean), `input_count` (number), `ref`, `repository_id`, `workflow_definition_id`, `user_id`, `duration_ms` |
| `WorkflowDispatchFailed` | Failed dispatch attempt | `client`, `error_type` (not_found/forbidden/validation/rate_limit/ambiguous), `identifier`, `repository_id`, `user_id` |
| `WorkflowDispatchSuggestionUsed` | User dispatches after seeing a fuzzy suggestion | `original_identifier`, `suggested_identifier`, `levenshtein_distance` |
| `WorkflowDispatchWatchUsed` | User uses `--watch` flag | `client`, `run_id`, `final_status`, `watch_duration_ms` |

### Funnel Metrics

| Metric | Definition | Target |
|---|---|---|
| Dispatch success rate | `WorkflowDispatched / (WorkflowDispatched + WorkflowDispatchFailed)` | > 95% |
| CLI dispatch adoption | Unique users dispatching via CLI per week | Growing week-over-week |
| Name-based dispatch ratio | Dispatches using name vs numeric ID | > 80% by name (indicates UX improvement) |
| Time to first dispatch | Time from repo creation to first manual dispatch | Decreasing trend |
| Watch flag adoption | Dispatches with `--watch` / total CLI dispatches | > 30% (indicates value of streaming) |

### Success Indicators

- CLI dispatch volume grows relative to web dispatch volume, indicating CLI is a first-class workflow trigger surface
- Error rate for "not found" decreases over time as fuzzy matching helps users find workflows
- Input validation errors decrease as users learn the input schema from error messages

## Observability

### Logging

| Log Point | Level | Structured Context | Description |
|---|---|---|---|
| Dispatch request received | `info` | `repository_id`, `identifier`, `ref`, `has_inputs`, `user_id`, `client` | Entry point for all dispatch requests |
| Identifier resolution | `debug` | `identifier`, `resolution_type` (numeric/name/path_stem/full_path), `definition_id` | How the identifier was resolved |
| Identifier not found | `warn` | `identifier`, `repository_id`, `suggestions[]` | No match; includes fuzzy suggestions if available |
| Ambiguous identifier | `warn` | `identifier`, `repository_id`, `matches[]` | Multiple definitions matched |
| Input validation failed | `warn` | `repository_id`, `definition_id`, `missing_inputs[]`, `invalid_inputs[]` | Inputs did not pass schema validation |
| Dispatch successful | `info` | `repository_id`, `definition_id`, `run_id`, `ref`, `input_count` | Run created successfully |
| Dispatch failed (internal) | `error` | `repository_id`, `definition_id`, `error_message`, `stack_trace` | Unexpected server error during dispatch |
| Rate limit exceeded | `warn` | `user_id`, `repository_id`, `limit_scope`, `retry_after_seconds` | Rate limit hit |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workflow_dispatch_total` | Counter | `status` (success/error), `client`, `identifier_type`, `repository` | Total dispatch attempts |
| `codeplane_workflow_dispatch_duration_seconds` | Histogram | `client`, `status` | Time from request to run creation |
| `codeplane_workflow_dispatch_input_count` | Histogram | `repository` | Number of inputs per dispatch |
| `codeplane_workflow_dispatch_errors_total` | Counter | `error_type` (not_found/forbidden/validation/rate_limit/ambiguous/internal) | Dispatch errors by type |
| `codeplane_workflow_dispatch_identifier_resolution_duration_seconds` | Histogram | `resolution_type` | Time to resolve identifier to definition |
| `codeplane_workflow_dispatch_rate_limited_total` | Counter | `scope` (user_repo/user_global/repo_global) | Rate limit rejections |

### Alerts

#### Alert: High Workflow Dispatch Error Rate

**Condition**: `rate(codeplane_workflow_dispatch_errors_total{error_type!="not_found"}[5m]) / rate(codeplane_workflow_dispatch_total[5m]) > 0.1` for 5 minutes

**Severity**: Warning

**Runbook**:
1. Check `codeplane_workflow_dispatch_errors_total` by `error_type` to identify the dominant error class.
2. If `error_type=internal`: Check server logs for stack traces. Look for database connectivity issues or workflow service failures. Check `codeplane_workflow_dispatch_duration_seconds` for latency spikes indicating DB pressure.
3. If `error_type=forbidden`: Check if a permission model change was recently deployed. Verify auth middleware is correctly loading user context.
4. If `error_type=validation`: Check if workflow definitions were recently updated with new required inputs. Review recent workflow definition deployments.
5. Escalate if error rate persists above 10% for more than 15 minutes.

#### Alert: Workflow Dispatch Latency Spike

**Condition**: `histogram_quantile(0.95, rate(codeplane_workflow_dispatch_duration_seconds_bucket[5m])) > 5` for 5 minutes

**Severity**: Warning

**Runbook**:
1. Check `codeplane_workflow_dispatch_identifier_resolution_duration_seconds` to determine if resolution is slow.
2. If resolution is slow: Check database query performance. A repository with many workflow definitions may cause slow scans. Check for missing indexes on workflow_definitions table.
3. If resolution is fast but total dispatch is slow: Check `createRunForDefinition` path. Look for slow agent token generation, slow DAG validation, or database write contention.
4. Check server resource utilization (CPU, memory, DB connections).
5. Consider if a batch dispatch (many workflows triggered simultaneously) is causing queuing.

#### Alert: Dispatch Rate Limiting Surge

**Condition**: `rate(codeplane_workflow_dispatch_rate_limited_total[5m]) > 10` for 5 minutes

**Severity**: Info

**Runbook**:
1. Identify the user/repository being rate limited from structured logs.
2. Determine if this is legitimate automation (CI scripts, agents) or abuse.
3. If legitimate: Consider increasing per-user or per-repo limits for the specific use case, or advise the user to batch their dispatches.
4. If abuse: Review the user's account for suspicious activity. Consider temporary suspension if warranted.

#### Alert: Dispatch Endpoint Unavailable

**Condition**: `up{job="codeplane-server"} == 0` OR `rate(codeplane_workflow_dispatch_total[5m]) == 0` when `rate(codeplane_workflow_dispatch_total[1h] offset 1d) > 0` for 15 minutes

**Severity**: Critical

**Runbook**:
1. Verify server process is running: `systemctl status codeplane` or check container orchestrator.
2. Check health endpoint: `curl /api/health`.
3. If server is up but dispatch is zero: Check route mounting. Verify workflow routes are registered in the server bootstrap sequence.
4. Check for recent deployments that may have broken route registration.
5. Restart server if health check fails. If restart doesn't resolve, check logs for startup errors.

### Error Cases and Failure Modes

| Error Case | HTTP Status | CLI Exit Code | Recovery |
|---|---|---|---|
| Server unreachable | N/A | 1 | Retry; check daemon/server status |
| Authentication expired | 401 | 1 | Re-authenticate via `codeplane auth login` |
| Repository not found | 404 | 1 | Verify `--repo` flag or current directory |
| Workflow not found | 404 | 1 | Check workflow name; use `codeplane workflow list` |
| Workflow not dispatchable | 422 | 1 | Add `on.workflow_dispatch` to workflow definition |
| Workflow inactive | 400 | 1 | Reactivate workflow or contact admin |
| Ambiguous identifier | 409 | 1 | Use more specific identifier (full path or numeric ID) |
| Missing required inputs | 400 | 1 | Provide `--input` flags for all required inputs |
| Invalid input type | 400 | 1 | Check expected types in workflow definition |
| Input payload too large | 400 | 1 | Reduce input value sizes |
| Permission denied | 403 | 1 | Request write access to repository |
| Rate limited | 429 | 1 | Wait for `Retry-After` period |
| Internal server error | 500 | 1 | Report bug; check server logs |

## Verification

### API Integration Tests

- [ ] **Dispatch by numeric ID — success**: POST to `/api/repos/:owner/:repo/workflows/:id/dispatches` with valid ID returns 204 and creates a queued run
- [ ] **Dispatch by name — success**: POST to `/api/repos/:owner/:repo/workflows/ci-pipeline/dispatch` resolves by name and returns 204
- [ ] **Dispatch by path stem — success**: POST with identifier `"ci"` resolves to `.codeplane/workflows/ci.ts`
- [ ] **Dispatch by full path — success**: POST with identifier `.codeplane/workflows/ci.ts` resolves correctly
- [ ] **Dispatch by name — case insensitive**: POST with identifier `"CI-Pipeline"` resolves to workflow named `"ci-pipeline"`
- [ ] **Dispatch with inputs — success**: POST with `inputs: { environment: "staging", debug: "true" }` stores inputs on the created run
- [ ] **Dispatch with default ref**: POST with no `ref` field dispatches against `"main"`
- [ ] **Dispatch with explicit ref**: POST with `ref: "release/v2"` dispatches against that ref
- [ ] **Dispatch with qualified ref**: POST with `ref: "refs/heads/main"` normalizes to `"main"`
- [ ] **Dispatch with empty body**: POST with `{}` body succeeds using all defaults
- [ ] **Dispatch with no body**: POST with no request body succeeds using all defaults
- [ ] **Dispatch nonexistent workflow — 404**: POST with identifier `"nonexistent"` returns 404
- [ ] **Dispatch inactive workflow — error**: POST against an inactive workflow returns appropriate error
- [ ] **Dispatch non-dispatchable workflow — 422**: POST against a workflow without `on.workflow_dispatch` returns 422
- [ ] **Dispatch ambiguous identifier — 409**: When two workflows share a path stem, POST returns 409 with both matches listed
- [ ] **Dispatch missing required inputs — 400**: Workflow defines required input without default; POST without it returns 400 with missing input details
- [ ] **Dispatch invalid choice input — 400**: Workflow defines choice input with options; POST with invalid option returns 400
- [ ] **Dispatch with extra unknown inputs — success**: POST with inputs not in schema is accepted (forward-compatible)
- [ ] **Dispatch unauthenticated — 401**: POST without auth returns 401
- [ ] **Dispatch unauthorized (read-only) — 403**: POST from user with only read access returns 403
- [ ] **Dispatch rate limited — 429**: Exceed 30 dispatches/minute/user/repo; next request returns 429 with `Retry-After`
- [ ] **Dispatch input key max length**: POST with input key of exactly 256 characters succeeds
- [ ] **Dispatch input key over max length**: POST with input key of 257 characters returns 400
- [ ] **Dispatch input value max length**: POST with input value of exactly 10,000 characters succeeds
- [ ] **Dispatch input value over max length**: POST with input value of 10,001 characters returns 400
- [ ] **Dispatch with 100 inputs**: POST with exactly 100 input entries succeeds
- [ ] **Dispatch with 101 inputs**: POST with 101 input entries returns 400
- [ ] **Dispatch payload at 64 KB limit**: POST with inputs totaling exactly 64 KB serialized succeeds
- [ ] **Dispatch payload over 64 KB limit**: POST with inputs totaling 65 KB serialized returns 400
- [ ] **Dispatch input with empty key — 400**: POST with `"": "value"` returns 400
- [ ] **Dispatch creates run with correct trigger event**: Verify created run has `triggerEvent: "workflow_dispatch"`
- [ ] **Dispatch creates run with correct ref**: Verify created run's `triggerRef` matches the provided ref
- [ ] **Dispatch creates agent token**: Verify a hashed agent token is created with 24-hour expiry
- [ ] **Dispatch input default merging**: Workflow defines input with default; POST without that input; verify run has the default value
- [ ] **Dispatch input override**: Workflow defines input with default; POST with override value; verify run has the override value

### CLI E2E Tests

- [ ] **`workflow dispatch <name>` — success**: `codeplane workflow dispatch ci-pipeline` dispatches and prints confirmation with run ID, workflow name, status, trigger
- [ ] **`workflow dispatch <name> --ref <ref>`**: `codeplane workflow dispatch ci-pipeline --ref develop` dispatches against `develop`
- [ ] **`workflow dispatch <name> --input key=value`**: `codeplane workflow dispatch ci-pipeline --input environment=staging` passes input; response shows `inputs.environment === "staging"`
- [ ] **`workflow dispatch <name> --input a=1 --input b=2`**: Multiple inputs accumulate correctly
- [ ] **`workflow dispatch <name> --input key=value=with=equals`**: Value containing `=` characters is parsed correctly (split on first `=` only)
- [ ] **`workflow dispatch <name> --input badformat`**: Missing `=` separator produces descriptive error and non-zero exit
- [ ] **`workflow dispatch <name> --input =value`**: Empty key produces descriptive error and non-zero exit
- [ ] **`workflow dispatch <numeric-id>`**: Dispatches by numeric ID
- [ ] **`workflow dispatch nonexistent`**: Returns non-zero exit code with "not found" message
- [ ] **`workflow dispatch <name> --json`**: Output is valid JSON with expected fields
- [ ] **`workflow dispatch <name> --json id,status`**: Output is filtered JSON with only `id` and `status` fields
- [ ] **`workflow dispatch <name> --repo owner/repo`**: Dispatches in specified repo context
- [ ] **`workflow dispatch <name> --watch`**: Dispatches and then streams run status until completion
- [ ] **`workflow dispatch <near-miss-name>`**: Shows fuzzy suggestion in error message (e.g., "Did you mean: deploy?")
- [ ] **`workflow dispatch` with no identifier**: Prints usage help and exits with non-zero code
- [ ] **`workflow dispatch <name>` when unauthenticated**: Prints authentication error
- [ ] **`workflow dispatch <name>` with duplicate `--input` keys**: Last value wins; no error

### CLI Output Format Tests

- [ ] **Default output contains run ID**: Output includes `Run ID:` line with numeric value
- [ ] **Default output contains workflow name**: Output includes `Workflow:` line
- [ ] **Default output contains status**: Output includes `Status:` line showing `queued` or `pending`
- [ ] **Default output contains trigger**: Output includes `Trigger: workflow_dispatch`
- [ ] **Default output contains inputs when provided**: Output includes `Inputs:` line listing key=value pairs
- [ ] **Default output omits inputs line when none provided**: No `Inputs:` line in output

### Playwright (Web UI) E2E Tests

- [ ] **Web dispatch button visible for dispatchable workflow**: Workflow detail page shows "Run workflow" button when `on.workflow_dispatch` is declared
- [ ] **Web dispatch button hidden for non-dispatchable workflow**: No dispatch button when workflow lacks `on.workflow_dispatch`
- [ ] **Web dispatch modal opens**: Clicking "Run workflow" opens a modal with ref field and input fields
- [ ] **Web dispatch modal shows typed inputs**: String inputs render as text fields, booleans as toggles, choices as dropdowns
- [ ] **Web dispatch modal pre-fills defaults**: Default values from workflow definition are pre-populated
- [ ] **Web dispatch modal submit — success**: Filling inputs and clicking "Dispatch" creates a run and shows success feedback
- [ ] **Web dispatch modal submit — validation error**: Omitting required input shows inline validation error
- [ ] **Web dispatch button disabled for read-only users**: Users with read-only access see a disabled button or no button

### Cross-Client Consistency Tests

- [ ] **CLI and API produce same run**: Dispatching via CLI and verifying via API returns consistent run data
- [ ] **Inputs roundtrip**: Inputs passed via CLI `--input` appear correctly in `GET /api/repos/:owner/:repo/workflows/runs/:id` response
- [ ] **Ref roundtrip**: Ref passed via CLI `--ref` appears correctly in run detail
