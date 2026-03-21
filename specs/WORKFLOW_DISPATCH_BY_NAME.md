# WORKFLOW_DISPATCH_BY_NAME

Specification for WORKFLOW_DISPATCH_BY_NAME.

## High-Level User POV

When a developer wants to manually trigger a workflow, they should be able to refer to it by its human-readable name rather than looking up an opaque numeric ID. Today, if a team registers a workflow called "deploy-production", triggering it from the CLI requires first listing workflows to find the numeric ID, then dispatching by that number. This is friction that slows down automation, scripting, and daily developer usage.

With dispatch-by-name, the developer simply types `codeplane workflow dispatch deploy-production --ref main` and the system resolves the workflow by its registered name. If the workflow defines custom inputs — for example, an environment selector or a debug toggle — the developer can pass those inline with `--input environment=staging --input debug=true`. The system validates the inputs against the workflow's declared input schema before creating the run, giving immediate feedback if something is wrong.

This capability extends across every Codeplane surface. In the web UI, the dispatch modal already shows workflows by name. In the TUI, the dispatch overlay is triggered from a named workflow in the list. The CLI and API are the primary surfaces where the numeric-ID-only limitation creates real user pain. By accepting a name, path stem, or full path as a workflow identifier — with graceful fallback to numeric ID for backward compatibility — dispatch-by-name makes workflow triggering feel natural and scriptable everywhere.

For agent-assisted workflows, dispatch-by-name is especially valuable. Agents working from issue context or automation pipelines know workflow names semantically (e.g., "ci-pipeline", "deploy-staging") but have no reason to track internal numeric IDs. Letting agents dispatch by name removes an unnecessary lookup step and makes agent-driven automation more robust.

## Acceptance Criteria

### Definition of Done

- [ ] The CLI `workflow dispatch` command accepts a workflow name, path stem, or full path as its primary argument, in addition to numeric IDs
- [ ] The server endpoint `POST /api/repos/:owner/:repo/workflows/:name/dispatch` correctly resolves workflows by name (case-insensitive), path stem (case-insensitive), full path (case-insensitive), or numeric ID
- [ ] Dispatch inputs are validated against the workflow's declared `on.workflow_dispatch.inputs` schema before creating the run
- [ ] All existing numeric-ID-based dispatch flows continue to work without modification
- [ ] The CLI supports `--input key=value` flags (repeatable) for passing dispatch inputs
- [ ] Error messages clearly indicate why resolution failed (not found, ambiguous match, inactive workflow, invalid inputs)
- [ ] The TUI dispatch overlay can be invoked by workflow name in the command palette, not only from the workflow list screen
- [ ] E2E tests pass for dispatch-by-name via CLI, API, and TUI
- [ ] Documentation is updated for CLI help text, API reference, and workflow authoring guide

### Identifier Resolution Rules

- [ ] Exact name match is tried first (case-insensitive, trimmed)
- [ ] If no name match, the path stem (filename without extension) is tried (case-insensitive)
- [ ] If no stem match, the full path is tried (case-insensitive)
- [ ] If the identifier is a valid positive integer, it is tried as a numeric ID before falling back to name resolution
- [ ] If zero matches are found, the system returns a 404 with message `"workflow not found: <identifier>"`
- [ ] If multiple workflows match the same name (duplicate names in the repository), the system returns a 409 with message `"ambiguous workflow name: <identifier> matches <N> definitions"` and lists the matching workflow IDs and paths
- [ ] Empty or whitespace-only identifiers are rejected with a 400

### Input Validation Rules

- [ ] If the workflow does not declare `on.workflow_dispatch`, the dispatch is rejected with 400 and message `"workflow is not manually dispatchable"`
- [ ] If the workflow declares required inputs (no `default` and `required: true`), they must be provided or the dispatch is rejected with 400 listing the missing inputs
- [ ] If an input is declared as `type: "choice"`, the provided value must match one of the declared `options` (case-sensitive)
- [ ] If an input is declared as `type: "boolean"`, the provided value must be coercible to a boolean (`"true"`, `"false"`, `"1"`, `"0"`, `true`, `false`)
- [ ] If an input is declared as `type: "number"`, the provided value must be coercible to a finite number
- [ ] Unknown inputs (keys not declared in the schema) are rejected with 400 listing the unexpected keys
- [ ] Input key names must be 1–128 characters, matching `[a-zA-Z_][a-zA-Z0-9_-]*`
- [ ] Input string values must not exceed 10,000 characters
- [ ] The total inputs payload must not exceed 64 KB when serialized as JSON
- [ ] A dispatch with no inputs when the workflow defines only optional inputs (all have defaults) succeeds, using the defaults

### Boundary Constraints

- [ ] Workflow name identifiers in the URL path segment must be 1–255 characters
- [ ] The `ref` field must be 1–255 characters and must not contain null bytes or newlines
- [ ] Maximum of 50 declared inputs per workflow definition
- [ ] Maximum of 50 provided inputs per dispatch request
- [ ] Workflow names may contain alphanumeric characters, hyphens, underscores, dots, and forward slashes
- [ ] Workflow names must not start or end with a dot or forward slash

### Edge Cases

- [ ] Dispatching an inactive (disabled) workflow returns 409 with message `"workflow is inactive"`
- [ ] Dispatching with a ref that does not exist in the repository returns 422 with message `"ref not found: <ref>"`
- [ ] Dispatching a workflow while a previous run of the same workflow is already queued does NOT block — concurrent dispatch is allowed
- [ ] Dispatching by numeric ID string `"42"` resolves to the workflow with ID 42, not a workflow named "42"
- [ ] A workflow named `"123"` can still be dispatched by name if explicitly using the by-name endpoint and no workflow with numeric ID 123 exists, or if the numeric lookup fails
- [ ] Special URL characters in workflow names (e.g., `.codeplane/workflows/ci.ts`) are properly percent-encoded/decoded in URL paths

## Design

### API Shape

#### Dispatch by Name Endpoint

```
POST /api/repos/:owner/:repo/workflows/:identifier/dispatch
```

**Path Parameters:**
- `owner` — Repository owner (user or org)
- `repo` — Repository name
- `identifier` — Workflow name, path stem, full path, or numeric ID string

**Request Body:**
```json
{
  "ref": "main",
  "inputs": {
    "environment": "staging",
    "debug": true
  }
}
```

- `ref` (string, optional, default `"main"`) — The jj bookmark or git ref to run against
- `inputs` (object, optional, default `{}`) — Key-value pairs matching the workflow's declared dispatch inputs

**Success Response:** `204 No Content`

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Empty identifier, invalid inputs, missing required inputs, unknown input keys, non-dispatchable workflow | `{ "message": "...", "details": [...] }` |
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 403 | Insufficient permissions | `{ "message": "write access required" }` |
| 404 | Workflow not found | `{ "message": "workflow not found: <identifier>" }` |
| 409 | Ambiguous name match or inactive workflow | `{ "message": "..." }` |
| 422 | Ref does not exist | `{ "message": "ref not found: <ref>" }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` |

#### Dispatch by Numeric ID Endpoint (Existing — Unchanged)

```
POST /api/repos/:owner/:repo/workflows/:id/dispatches
```

This endpoint continues to work as-is. The by-name endpoint is the new recommended surface.

### CLI Command

**Updated command signature:**

```
codeplane workflow dispatch <name-or-id> [options]
```

**Arguments:**
- `name-or-id` (required) — Workflow name, path stem, full path, or numeric ID

**Options:**
- `--ref <ref>` — Ref to run against (default: `"main"`)
- `--input <key=value>` — Dispatch input (repeatable)
- `--repo <OWNER/REPO>` — Target repository (defaults to context repo)
- `--json` — Output as JSON

**Examples:**

```bash
# Dispatch by name
codeplane workflow dispatch deploy-production --ref main

# Dispatch by name with inputs
codeplane workflow dispatch ci-pipeline --input environment=staging --input debug=true

# Dispatch by path stem
codeplane workflow dispatch ci --ref release/v2

# Dispatch by numeric ID (backward compatible)
codeplane workflow dispatch 42 --ref main
```

**Output (default):**

```
✓ Workflow run created
  Workflow: deploy-production
  Run ID:  187
  Ref:     main
  Status:  queued
```

**Output (JSON):**

```json
{
  "id": 187,
  "workflow_name": "deploy-production",
  "workflow_id": 5,
  "status": "queued",
  "trigger": "workflow_dispatch",
  "ref": "main",
  "inputs": {
    "environment": "staging",
    "debug": true
  },
  "created_at": "2026-03-22T10:15:00Z"
}
```

**Error output:**

```
✗ Workflow not found: deploy-prodction
  Did you mean: deploy-production?
```

The CLI should provide fuzzy-match suggestions when a workflow name is close but not exact. Use Levenshtein distance ≤ 3 on all workflow names in the repository.

### Web UI Design

The web UI dispatch modal is already name-oriented (users click a "Run workflow" button on a named workflow). The following enhancements apply:

**Dispatch from URL:**
- Support URL pattern: `/:owner/:repo/workflows/:name/dispatch` which pre-opens the dispatch modal for the named workflow

**Command Palette Integration:**
- The command palette should support typing `dispatch <workflow-name>` or `run <workflow-name>` to trigger the dispatch modal with the workflow pre-selected
- Autocomplete should suggest matching workflow names as the user types

**Dispatch Modal Enhancements:**
- Show the workflow name prominently in the modal header
- If the workflow has declared inputs, render form fields dynamically:
  - `string` → text input
  - `boolean` → toggle switch
  - `choice` → dropdown select with declared options
  - `number` → number input
- Show default values as placeholder text or pre-filled values
- Show input descriptions as help text below each field
- Validate inputs client-side before submission
- Show a "Dispatching..." loading state with the workflow name
- On success, navigate to the newly created run detail page

### TUI UI

**Dispatch from Workflow List (existing behavior — enhanced):**
- Press `d` on a workflow in the list to open the dispatch overlay
- The overlay title shows the workflow name, not the numeric ID

**Dispatch from Command Palette (new):**
- Type `:dispatch <name>` in the command palette
- Autocomplete suggests matching workflow names
- Opens the dispatch overlay pre-populated with the selected workflow

**Dispatch Overlay Fields:**
- Ref input (default: `"main"`)
- Dynamic input fields rendered based on the workflow's declared inputs
- Submit with `Ctrl+S`, cancel with `Esc`
- Show validation errors inline next to the relevant field

### SDK Shape

The `@codeplane/sdk` workflow service should expose:

```typescript
// Resolve a workflow definition by name, path stem, full path, or numeric ID
resolveWorkflowDefinition(
  repositoryId: number,
  identifier: string
): Promise<{ definition: WorkflowDefinition | null; ambiguous: boolean; matchCount: number }>

// Validate dispatch inputs against the workflow's declared input schema
validateDispatchInputs(
  definition: WorkflowDefinition,
  inputs: Record<string, unknown>
): { valid: boolean; errors: Array<{ field: string; message: string }> }

// Dispatch a workflow by resolved definition (existing, enhanced with input validation)
dispatchWorkflow(
  repositoryId: number,
  definitionId: number,
  ref: string,
  inputs: Record<string, unknown>
): Promise<WorkflowRun>
```

### Documentation

The following end-user documentation should be written:

1. **CLI Reference — `workflow dispatch`**: Updated command reference showing name-based dispatch as the primary usage pattern, with examples for name, path stem, full path, and numeric ID
2. **API Reference — Workflow Dispatch**: Document both endpoints, emphasizing the by-name endpoint as the recommended approach. Include request/response schemas and all error codes
3. **Workflow Authoring Guide — Dispatchable Workflows**: How to declare `on.workflow_dispatch` with inputs, including type definitions, defaults, required fields, and choice options
4. **Cookbook — Automating Deployments**: A practical example showing how to register a deploy workflow and trigger it by name from the CLI, a script, and an agent

## Permissions & Security

### Authorization

| Role | Can dispatch? | Notes |
|------|--------------|-------|
| Repository Owner | ✅ | Full access |
| Repository Admin | ✅ | Full access |
| Repository Write (Member) | ✅ | Can dispatch any active workflow |
| Repository Read | ❌ | Cannot trigger workflows |
| Anonymous | ❌ | Must be authenticated |

- Deploy keys with write access can dispatch workflows via API (using the deploy key's associated repository scope)
- PATs with `repo:write` or `workflow:write` scope can dispatch workflows
- OAuth2 applications with `workflow:dispatch` scope can dispatch workflows

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Per user, per repository | 30 dispatches | 1 minute |
| Per user, global | 120 dispatches | 1 minute |
| Per deploy key, per repository | 60 dispatches | 1 minute |
| Per OAuth2 app, per repository | 60 dispatches | 1 minute |

Rate limit responses include `Retry-After` and `X-RateLimit-*` headers.

### Data Privacy

- Dispatch inputs may contain sensitive values (e.g., environment names, feature flags). Inputs are stored with the workflow run record and are visible to anyone with read access to the repository's workflow runs.
- The workflow name and dispatch inputs are logged in structured server logs. Sensitive input values should be marked with `secret: true` in the workflow's input schema, and those values should be redacted in logs and API responses (displayed as `***`).
- Webhook payloads for `workflow_dispatch` events include the dispatch inputs. Repository administrators should be aware that webhook endpoints receive these values.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowDispatched` | A workflow run is successfully created via manual dispatch | `repository_id`, `workflow_id`, `workflow_name`, `identifier_type` (`name` | `path_stem` | `full_path` | `numeric_id`), `ref`, `input_count`, `client` (`cli` | `web` | `tui` | `api` | `agent`), `user_id`, `timestamp` |
| `WorkflowDispatchFailed` | A dispatch attempt fails | `repository_id`, `identifier`, `identifier_type`, `failure_reason` (`not_found` | `ambiguous` | `inactive` | `invalid_inputs` | `permission_denied` | `ref_not_found`), `client`, `user_id`, `timestamp` |
| `WorkflowDispatchInputValidationFailed` | Inputs fail validation | `repository_id`, `workflow_id`, `workflow_name`, `invalid_fields`, `client`, `user_id`, `timestamp` |

### Funnel Metrics

1. **Dispatch Adoption Rate**: Percentage of workflow dispatches using name-based resolution vs. numeric ID, tracked weekly. Success indicator: >80% name-based within 30 days of launch.
2. **First Dispatch Latency**: Time from user's first workflow registration to their first manual dispatch. Success indicator: median < 5 minutes.
3. **Dispatch Error Rate**: Percentage of dispatch attempts that fail, broken down by failure reason. Success indicator: < 5% error rate excluding permission denials.
4. **Resolution Success Rate**: Percentage of name-based lookups that resolve on the first attempt without ambiguity. Success indicator: > 95%.
5. **Agent Dispatch Share**: Percentage of dispatches originating from agent sessions. Tracked to measure agent-driven automation adoption.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------||
| Dispatch request received | `info` | `repository_id`, `identifier`, `ref`, `client_ip`, `user_id` |
| Identifier resolved to workflow | `info` | `repository_id`, `identifier`, `resolved_workflow_id`, `resolved_workflow_name`, `resolution_method` (`name` | `path_stem` | `full_path` | `numeric_id`) |
| Identifier resolution failed (not found) | `warn` | `repository_id`, `identifier`, `total_definitions_searched` |
| Ambiguous identifier detected | `warn` | `repository_id`, `identifier`, `match_count`, `matched_workflow_ids` |
| Input validation failed | `warn` | `repository_id`, `workflow_id`, `validation_errors` |
| Dispatch completed (run created) | `info` | `repository_id`, `workflow_id`, `run_id`, `ref`, `input_count`, `duration_ms` |
| Dispatch rate limited | `warn` | `user_id`, `repository_id`, `limit`, `window` |
| Dispatch failed (internal error) | `error` | `repository_id`, `workflow_id`, `error_message`, `stack_trace` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_dispatch_total` | Counter | `repository`, `status` (`success` | `not_found` | `ambiguous` | `invalid_inputs` | `inactive` | `permission_denied` | `error`), `resolution_method`, `client` | Total dispatch attempts |
| `codeplane_workflow_dispatch_duration_seconds` | Histogram | `repository`, `status`, `resolution_method` | End-to-end dispatch latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_workflow_dispatch_input_count` | Histogram | `repository` | Number of inputs per dispatch (buckets: 0, 1, 2, 5, 10, 20, 50) |
| `codeplane_workflow_identifier_resolution_duration_seconds` | Histogram | `resolution_method` | Time spent resolving identifier to workflow definition |
| `codeplane_workflow_dispatch_rate_limited_total` | Counter | `user_id`, `repository` | Total rate-limited dispatch attempts |

### Alerts

#### Alert: High Workflow Dispatch Error Rate

- **Condition**: `rate(codeplane_workflow_dispatch_total{status!="success"}[5m]) / rate(codeplane_workflow_dispatch_total[5m]) > 0.2`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workflow_dispatch_total` by `status` label to identify the dominant error type
  2. If `not_found` is dominant: Check if a recent deployment removed or renamed workflow definitions. Query the workflow definitions table for recently deleted/updated entries.
  3. If `invalid_inputs` is dominant: Check if a workflow definition's input schema was recently changed without updating callers. Review recent workflow config changes.
  4. If `ambiguous` is dominant: Check for duplicate workflow names within repositories. Query for repositories with non-unique workflow names.
  5. If `error` is dominant: Check server logs for stack traces. Look for database connectivity issues, service registry failures, or jj subprocess timeouts.

#### Alert: Workflow Dispatch Latency Degradation

- **Condition**: `histogram_quantile(0.99, rate(codeplane_workflow_dispatch_duration_seconds_bucket[5m])) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workflow_identifier_resolution_duration_seconds` — if resolution is slow, the identifier search is scanning too many definitions
  2. Check the count of workflow definitions per repository. If a repository has >500 definitions, resolution scanning becomes expensive. Consider adding an index on workflow name.
  3. Check database connection pool saturation and query latency
  4. Check if jj ref resolution is slow (subprocess timeouts). Review jj process metrics.
  5. If latency is isolated to specific repositories, check those repos for abnormal definition counts or filesystem issues

#### Alert: Dispatch Rate Limiting Spike

- **Condition**: `rate(codeplane_workflow_dispatch_rate_limited_total[5m]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Identify the affected `user_id` and `repository` from the metric labels
  2. Check if the user is running an automated script with no backoff — contact them if appropriate
  3. Check if an agent session is in a dispatch retry loop — review agent session logs
  4. Verify rate limit thresholds are correctly configured and not overly aggressive for the use case

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database unavailable | 503 Service Unavailable | Automatic retry with circuit breaker |
| Workflow service timeout | 504 Gateway Timeout after 30s | Client retry with exponential backoff |
| jj ref resolution subprocess crash | 422 with "ref validation failed" | Check jj binary health; restart if needed |
| Concurrent dispatch of same workflow | Both dispatches succeed (no mutual exclusion) | N/A — by design |
| Repository deleted between identifier resolution and dispatch | 404 Repository not found | Client should re-validate repository existence |
| Workflow definition modified between resolution and dispatch | Dispatch uses the definition state at resolution time | Acceptable — eventual consistency |

## Verification

### API Integration Tests

| # | Test | Expected Result |
|---|------|------------------|
| 1 | `POST /workflows/ci-pipeline/dispatch` with a registered workflow named "ci-pipeline" | 204, run created |
| 2 | `POST /workflows/ci/dispatch` where a workflow has path `.codeplane/workflows/ci.ts` | 204, resolved by path stem |
| 3 | `POST /workflows/.codeplane%2Fworkflows%2Fci.ts/dispatch` (URL-encoded full path) | 204, resolved by full path |
| 4 | `POST /workflows/42/dispatch` where workflow ID 42 exists | 204, resolved by numeric ID |
| 5 | `POST /workflows/nonexistent/dispatch` | 404, `"workflow not found: nonexistent"` |
| 6 | `POST /workflows/ci-pipeline/dispatch` where two workflows are named "ci-pipeline" | 409, `"ambiguous workflow name"` |
| 7 | `POST /workflows/CI-PIPELINE/dispatch` (case variation) | 204, case-insensitive match |
| 8 | `POST /workflows/ /dispatch` (whitespace only) | 400, `"identifier is required"` |
| 9 | `POST /workflows/ci-pipeline/dispatch` with `{ "ref": "main", "inputs": { "env": "staging" } }` where `env` is a valid choice input | 204 |
| 10 | `POST /workflows/ci-pipeline/dispatch` with `{ "inputs": { "env": "invalid-option" } }` where `env` is a choice input | 400, validation error listing valid options |
| 11 | `POST /workflows/ci-pipeline/dispatch` with `{ "inputs": { "unknown_key": "value" } }` | 400, `"unexpected input: unknown_key"` |
| 12 | `POST /workflows/ci-pipeline/dispatch` with missing required input | 400, `"missing required input: <name>"` |
| 13 | `POST /workflows/ci-pipeline/dispatch` where workflow is inactive | 409, `"workflow is inactive"` |
| 14 | `POST /workflows/ci-pipeline/dispatch` with `{ "ref": "nonexistent-ref" }` | 422, `"ref not found"` |
| 15 | `POST /workflows/ci-pipeline/dispatch` without authentication | 401 |
| 16 | `POST /workflows/ci-pipeline/dispatch` with read-only user | 403 |
| 17 | `POST /workflows/ci-pipeline/dispatch` with write user | 204 |
| 18 | `POST /workflows/ci-pipeline/dispatch` with PAT (repo:write scope) | 204 |
| 19 | `POST /workflows/ci-pipeline/dispatch` with PAT (repo:read scope only) | 403 |
| 20 | `POST /workflows/ci-pipeline/dispatch` where workflow has no `on.workflow_dispatch` trigger | 400, `"workflow is not manually dispatchable"` |
| 21 | `POST /workflows/ci-pipeline/dispatch` with `{ "inputs": { "debug": "true" } }` where debug is boolean type | 204, input coerced to `true` |
| 22 | `POST /workflows/ci-pipeline/dispatch` with `{ "inputs": { "debug": "yes" } }` where debug is boolean type | 400, invalid boolean value |
| 23 | `POST /workflows/ci-pipeline/dispatch` with `{ "inputs": { "count": "42" } }` where count is number type | 204, input coerced to `42` |
| 24 | `POST /workflows/ci-pipeline/dispatch` with `{ "inputs": { "count": "not-a-number" } }` where count is number type | 400, invalid number value |
| 25 | `POST /workflows/ci-pipeline/dispatch` with 50 valid inputs | 204 |
| 26 | `POST /workflows/ci-pipeline/dispatch` with 51 inputs | 400, `"too many inputs"` |
| 27 | `POST /workflows/ci-pipeline/dispatch` with input value of exactly 10,000 characters | 204 |
| 28 | `POST /workflows/ci-pipeline/dispatch` with input value of 10,001 characters | 400, `"input value exceeds maximum length"` |
| 29 | `POST /workflows/ci-pipeline/dispatch` with input key `"a"` (1 char, valid) | 204 |
| 30 | `POST /workflows/ci-pipeline/dispatch` with input key of 129 characters | 400, `"input key exceeds maximum length"` |
| 31 | `POST /workflows/ci-pipeline/dispatch` with input key `"123invalid"` (starts with number) | 400, `"invalid input key format"` |
| 32 | `POST /workflows/ci-pipeline/dispatch` with empty inputs `{}` and all inputs have defaults | 204, defaults applied |
| 33 | `POST /workflows/ci-pipeline/dispatch` with total inputs JSON payload of exactly 64 KB | 204 |
| 34 | `POST /workflows/ci-pipeline/dispatch` with total inputs JSON payload exceeding 64 KB | 400, `"inputs payload too large"` |
| 35 | `POST /workflows/42/dispatch` where no workflow has ID 42 but a workflow is named "42" | 204, resolved by name |
| 36 | `POST /workflows/ci-pipeline/dispatch` triggered 31 times in 1 minute by same user | 429 on the 31st request |
| 37 | `POST /workflows/ci-pipeline/dispatch` with `{ "ref": "" }` (empty ref) | 400, `"ref is required"` |
| 38 | Dispatch by name, verify returned run has correct `workflow_name` and `trigger: "workflow_dispatch"` when fetched via `GET /workflows/:id/runs` | Run record matches |
| 39 | Dispatch by name, verify webhook `workflow_dispatch` event is emitted with correct payload | Webhook received with workflow name and inputs |
| 40 | `POST /workflows/ci-pipeline/dispatch` with identifier containing URL-unsafe characters properly encoded | 204 |

### CLI E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 41 | `codeplane workflow dispatch ci-pipeline --ref main` | Success output with workflow name and run ID |
| 42 | `codeplane workflow dispatch ci-pipeline --input environment=staging --input debug=true` | Success with inputs shown |
| 43 | `codeplane workflow dispatch ci-pipeline --json` | Valid JSON output with run details |
| 44 | `codeplane workflow dispatch nonexistent --ref main` | Error: "workflow not found" with exit code 1 |
| 45 | `codeplane workflow dispatch 42 --ref main` (numeric ID) | Success (backward compatible) |
| 46 | `codeplane workflow dispatch ci-pipeline` (no --ref, uses default "main") | Success with ref "main" |
| 47 | `codeplane workflow dispatch ci-pipeline --repo owner/repo` | Success dispatching against explicit repo |
| 48 | `codeplane workflow dispatch ci-pipeline --input env=invalid` (invalid choice) | Error with validation message |
| 49 | `codeplane workflow dispatch ci-pipeline --input key_without_value` (malformed input) | Error: "invalid input format, expected key=value" |
| 50 | `codeplane workflow dispatch ci-pipeline --input =value` (empty key) | Error: "input key cannot be empty" |
| 51 | `codeplane workflow dispatch` (no identifier) | Error: "workflow name or ID is required" |
| 52 | `codeplane workflow dispatch ci-pipeline --ref main --input a=b --input a=c` (duplicate key) | Last value wins, dispatches with `a=c` |

### TUI E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 53 | Navigate to Workflow List, select dispatchable workflow, press `d` | Dispatch overlay opens with workflow name in header |
| 54 | In dispatch overlay, fill ref and inputs, press `Ctrl+S` | Dispatch succeeds, overlay closes, success toast shown |
| 55 | In dispatch overlay, submit with invalid inputs | Inline validation errors shown, overlay stays open |
| 56 | In dispatch overlay, press `Esc` | Overlay closes, no dispatch created |
| 57 | Open command palette, type `:dispatch ci-pipeline` | Dispatch overlay opens for ci-pipeline |
| 58 | Open command palette, type `:dispatch nonex` with autocomplete | No autocomplete matches shown |

### Playwright (Web UI) E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 59 | Navigate to `/:owner/:repo/workflows`, click "Run workflow" on a named workflow | Dispatch modal opens with workflow name |
| 60 | In dispatch modal, fill inputs and click "Dispatch" | Modal closes, navigates to run detail page |
| 61 | In dispatch modal, submit with missing required input | Validation error shown inline |
| 62 | In dispatch modal, submit with invalid choice value | Validation error shown with valid options listed |
| 63 | Navigate directly to `/:owner/:repo/workflows/ci-pipeline/dispatch` | Dispatch modal opens pre-populated |
| 64 | Open command palette, type "dispatch ci-pipeline" | Dispatch modal opens for ci-pipeline |
| 65 | Dispatch modal shows default values pre-filled for optional inputs | Defaults visible in form fields |
| 66 | Dispatch modal shows input descriptions as help text | Help text visible under each field |
| 67 | After successful dispatch, run detail page shows correct trigger type "workflow_dispatch" | Trigger badge shows "Manual" |
| 68 | Dispatch modal "Dispatching..." loading state is shown during submission | Loading spinner visible, buttons disabled |

### Cross-Client Consistency Tests

| # | Test | Expected Result |
|---|------|------------------|
| 69 | Dispatch by name via CLI, verify run appears in web UI workflow runs list | Run visible with correct name and trigger |
| 70 | Dispatch by name via web UI, verify run appears in CLI `workflow runs` output | Run visible with correct metadata |
| 71 | Dispatch by name via API with inputs, verify inputs are visible in CLI `workflow run view` | Inputs shown correctly |
| 72 | Register workflow, dispatch by name via CLI, dispatch same workflow by numeric ID via API — both create runs | Two runs created for same workflow |
