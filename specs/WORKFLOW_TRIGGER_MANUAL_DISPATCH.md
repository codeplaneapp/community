# WORKFLOW_TRIGGER_MANUAL_DISPATCH

Specification for WORKFLOW_TRIGGER_MANUAL_DISPATCH.

## High-Level User POV

When a Codeplane user has a workflow that supports manual triggering, they can dispatch that workflow on demand — from the web UI, CLI, TUI, or editor — without waiting for an automated event like a push or issue creation. This is the workflow equivalent of pressing a "Run now" button.

Manual dispatch is especially valuable for deployment workflows, data migrations, one-off maintenance tasks, and any automation that a human or agent needs to trigger at a specific moment rather than in response to a repository event. Workflow authors declare that a workflow supports manual dispatch by including a `workflow_dispatch` trigger in their workflow definition. They can optionally define typed input parameters — strings, booleans, and choice selectors — that the person or agent triggering the workflow must fill in. For example, a deploy workflow might ask for a target environment (staging vs. production) and a debug flag.

When someone dispatches a workflow, they choose which bookmark (ref) to run against and provide any required inputs. The system validates those inputs against the schema the workflow author defined, merges in any default values, and immediately creates a new workflow run. The user can then watch the run execute in real time — streaming logs and status changes — or check back later. The dispatched run is clearly labeled as a "manual dispatch" in every surface where runs appear, so it is always obvious how and why a given run was triggered.

Manual dispatch works identically whether the user is a human clicking a button in the web UI, an engineer running `codeplane workflow dispatch` from the terminal, an agent operating through the API, or a teammate using a keyboard shortcut in the TUI. The same input schema, validation rules, and execution semantics apply everywhere.

## Acceptance Criteria

### Definition of Done

- [ ] A workflow definition with `on: { workflow_dispatch: ... }` is recognized as manually dispatchable across all surfaces (web, CLI, TUI, API, editors).
- [ ] Users can dispatch a workflow by numeric ID or by name/path identifier.
- [ ] Dispatch creates exactly one workflow run per request, with `trigger_event` set to `"workflow_dispatch"`.
- [ ] The dispatched run appears in all run-listing surfaces and is clearly labeled as manually dispatched.
- [ ] Input parameters defined in the workflow's `workflow_dispatch.inputs` schema are rendered as a dynamic form in interactive clients (web, TUI) and accepted as CLI flags / API body fields.
- [ ] Default values from the input schema are merged with user-provided values.
- [ ] The TypeScript workflow authoring library (`packages/workflow`) exposes `on.manualDispatch(inputs?)` for defining dispatch triggers.

### Input Validation

- [ ] Required inputs (those without defaults) must be provided; omitting them returns a clear validation error.
- [ ] String inputs accept any UTF-8 content up to 10,000 characters per value.
- [ ] Boolean inputs accept `true`, `false`, `"true"`, `"false"`, `1`, `0` and are coerced to boolean.
- [ ] Choice inputs must match one of the declared `options`; providing an unlisted value returns a validation error naming the valid options.
- [ ] Extra input keys not declared in the schema are silently accepted (forward-compatible).
- [ ] The total serialized JSON payload for dispatch (ref + inputs) must not exceed 64 KB; payloads exceeding this limit are rejected with a 400 error.
- [ ] An empty `inputs` object or omitted `inputs` field is valid when no inputs are required.

### Ref Handling

- [ ] The `ref` field specifies which bookmark the workflow runs against.
- [ ] If `ref` is empty, blank, or omitted, it defaults to the repository's default bookmark (typically `"main"`).
- [ ] Ref values prefixed with `refs/heads/`, `refs/bookmarks/`, or `bookmarks/` are normalized to the bare bookmark name.
- [ ] Tag refs (`refs/tags/...`) fall back to the default bookmark.

### Identifier Resolution (dispatch by name)

- [ ] Numeric identifiers are tried first as a workflow definition ID.
- [ ] If no match by ID, the system searches all definitions for a case-insensitive match on: exact name, path stem (filename without extension), or full path.
- [ ] If no definition matches, a 404 error is returned.
- [ ] Workflow definitions that are marked inactive are skipped and do not match.

### Edge Cases

- [ ] Dispatching a workflow that does not declare `workflow_dispatch` in its trigger config silently produces zero runs (no error, no run created).
- [ ] Dispatching an inactive workflow definition returns no runs or an appropriate inactive-workflow error.
- [ ] Concurrent dispatches of the same workflow are allowed and each creates an independent run.
- [ ] A workflow with zero jobs in its config creates a run record but no steps/tasks.
- [ ] A workflow with an invalid DAG (circular dependencies) returns a 400 error at dispatch time.
- [ ] Dispatching with a malformed JSON body returns a 400 error.
- [ ] Dispatching with an empty body (no JSON) returns a 400 error.
- [ ] A workflow name containing URL-unsafe characters is handled via URL encoding in the by-name endpoint.

## Design

### API Shape

**Dispatch by numeric ID:**

```
POST /api/repos/:owner/:repo/workflows/:id/dispatches
Content-Type: application/json

{
  "ref": "main",
  "inputs": {
    "environment": "staging",
    "debug": true
  }
}
```

Response: `204 No Content` on success. No response body.

Error responses:
- `400` — Invalid workflow ID, malformed body, invalid DAG, input validation failure, or payload too large.
- `401` — Not authenticated.
- `403` — Insufficient permissions on the repository.
- `404` — Workflow definition not found or inactive.
- `429` — Rate limit exceeded.

**Dispatch by name/path identifier:**

```
POST /api/repos/:owner/:repo/workflows/:identifier/dispatch
Content-Type: application/json

{
  "ref": "main",
  "inputs": {
    "environment": "production"
  }
}
```

Same response and error semantics as dispatch-by-ID. The `:identifier` parameter is resolved in order: numeric ID → exact name → path stem → full path (all case-insensitive for non-numeric matching).

### SDK Shape

**Trigger builder (packages/workflow):**

```typescript
import { on } from "@codeplane/workflow";

// No inputs
on.manualDispatch()

// With typed inputs
on.manualDispatch({
  environment: {
    type: "choice",
    options: ["staging", "production"],
    default: "staging",
    description: "Deploy target environment",
  },
  debug: {
    type: "boolean",
    default: false,
    description: "Enable debug logging",
  },
  version: {
    type: "string",
    default: "1.0.0",
    description: "Release version",
  },
})
```

Returns a `ManualDispatchTriggerDescriptor` with `_type: "manual_dispatch"`.

**Service layer (packages/sdk):**

- `matchTrigger(config, event)` — returns `true` when the config's `on.workflow_dispatch` is present and the event type is `"workflow_dispatch"`.
- `validateDispatchInputs(config, userInputs)` — extracts the input schema from `on.workflow_dispatch.inputs`, merges defaults with user-provided values, and returns the merged record.
- `dispatchForEvent(input)` — accepts a `DispatchForEventInput` with event type `"workflow_dispatch"`, matches definitions, validates inputs, and creates workflow runs.

### CLI Command

```
codeplane workflow dispatch <identifier> [options]
```

**Arguments:**
- `<identifier>` — Workflow ID (numeric) or workflow name/path.

**Options:**
- `--ref <ref>` — Bookmark to run against. Defaults to `"main"`.
- `--repo <OWNER/REPO>` — Repository. Inferred from cwd if inside a repo.
- `--input <key=value>` — Dispatch input. Repeatable for multiple inputs. Example: `--input environment=staging --input debug=true`.

**Output (JSON mode):**
```json
{
  "id": 42,
  "workflow_name": "deploy",
  "status": "queued",
  "trigger": "workflow_dispatch",
  "inputs": {
    "environment": "staging",
    "debug": "true"
  }
}
```

**Output (human mode):**
```
Dispatched workflow "deploy" → run #42 (queued)
```

**Error output:**
- Workflow not found: exit code 1, message "workflow definition not found".
- Input validation failure: exit code 1, message describing which inputs failed.

### TUI UI

- On the **Workflows** screen, workflows that declare `workflow_dispatch` display a dispatch affordance (e.g., `[d] Dispatch` in the footer).
- Pressing `d` on a dispatchable workflow opens a **Dispatch Overlay Modal**.
- The modal contains:
  - A **Ref** text input, pre-filled with the repository's default bookmark.
  - A **dynamic form** section rendering one field per declared input:
    - `string` → text input, pre-filled with default if present.
    - `boolean` → toggle/checkbox, pre-set to default.
    - `choice` → select/dropdown with declared options, pre-selected to default.
  - Each input field shows its `description` as helper text.
  - A **Dispatch** button (also activated with `Ctrl+S`).
  - A **Cancel** button (also activated with `Escape`).
- Keyboard navigation: `Tab` / `Shift+Tab` cycles between fields. `Enter` on the Dispatch button submits.
- On success, the modal closes and a status bar message reads `"Workflow dispatched ✓"`. The workflows/runs list refreshes.
- On error, the modal stays open and displays the error message inline.
- Responsive sizing: The modal uses 90% terminal width at 80×24 and 50% at standard (120×40+) terminal sizes.

### Web UI Design

- On the **Workflow Detail** page, a **"Run workflow"** button is visible for workflows with `workflow_dispatch` triggers.
- Clicking the button opens a **dispatch dialog/drawer** with:
  - A bookmark/ref selector dropdown.
  - Dynamic form fields for each declared input (same types: string, boolean, choice).
  - Default values pre-populated.
  - Input descriptions as field labels or helper text.
  - A "Run workflow" primary action button and a "Cancel" secondary button.
- On the **Workflows List** page, dispatchable workflows show a small dispatch icon or action button inline.
- After successful dispatch, the user is shown a success toast with a link to the new run, and the run list refreshes automatically.
- Validation errors are shown inline next to the offending field.
- The dispatch dialog is also accessible from the **Command Palette** via a "Dispatch workflow…" action.

### Editor Integrations

**VS Code:**
- The workflow tree view shows a "Dispatch" inline action on dispatchable workflows.
- Clicking it opens a VS Code Quick Pick flow: first pick the ref, then enter each input in sequence via input boxes.
- Success/failure is shown via VS Code notification.

**Neovim:**
- `:Codeplane workflow dispatch <name> --ref <ref> --input key=value` command.
- Telescope picker for selecting a workflow to dispatch, with follow-up input prompts.

### Documentation

The following end-user documentation should be written:

1. **"Manually running a workflow"** — A guide explaining what manual dispatch is, how to add `workflow_dispatch` to a workflow definition, how to define inputs with types and defaults, and how to trigger dispatch from each surface (web, CLI, TUI).
2. **"Workflow input types reference"** — A reference table of supported input types (`string`, `boolean`, `choice`), their validation rules, coercion behavior, and examples.
3. **CLI reference update** — The `codeplane workflow dispatch` command must be documented with all arguments, options, and example invocations.
4. **API reference update** — Both dispatch endpoints (by-ID and by-name) must be documented with request/response schemas, error codes, and curl examples.

## Permissions & Security

### Authorization

| Role | Can dispatch? |
|------|--------------|
| Repository Owner | ✅ Yes |
| Repository Admin | ✅ Yes |
| Repository Member (Write) | ✅ Yes |
| Repository Member (Read-only) | ❌ No |
| Anonymous / unauthenticated | ❌ No |
| Deploy Key (write scope) | ✅ Yes |
| OAuth Application (repo write scope) | ✅ Yes |
| Personal Access Token (repo write scope) | ✅ Yes |

- Dispatch requires **write access** to the repository. Read-only collaborators and anonymous users cannot dispatch.
- Deploy keys with write access may dispatch workflows, enabling machine-to-machine automation.
- OAuth applications with repository write scope may dispatch on behalf of users.

### Rate Limiting

| Scope | Limit |
|-------|-------|
| Per authenticated user per repository | 30 dispatches / minute |
| Per repository (global, all users) | 120 dispatches / minute |
| Per deploy key / OAuth app per repository | 60 dispatches / minute |

- Rate limit responses use standard `429 Too Many Requests` with `Retry-After` header.
- Rate limit state is tracked per-repository to prevent a single repository from being overwhelmed.

### Data Privacy

- Dispatch inputs may contain sensitive values (e.g., version strings, environment names). Inputs are stored as JSON in the `dispatch_inputs` column and are visible to anyone with read access to the workflow run.
- Inputs must **never** be logged at INFO level or below. DEBUG-level logging may include input keys but not values.
- Secrets should be passed via repository secrets/variables, not via dispatch inputs. Documentation should explicitly warn against putting credentials in dispatch inputs.
- Agent tokens generated per-run are hashed before storage; only the SHA-256 hash is persisted.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowDispatched` | Successful dispatch (run created) | `repository_id`, `workflow_definition_id`, `workflow_name`, `ref`, `input_count`, `dispatch_method` (`"api_by_id"`, `"api_by_name"`, `"cli"`, `"tui"`, `"web"`, `"vscode"`, `"neovim"`), `user_id`, `is_deploy_key`, `is_oauth_app` |
| `WorkflowDispatchFailed` | Dispatch attempt that returned an error | `repository_id`, `workflow_identifier`, `error_code` (`400`, `403`, `404`, `429`), `error_reason` (e.g., `"not_found"`, `"rate_limited"`, `"invalid_input"`, `"inactive"`), `dispatch_method`, `user_id` |
| `WorkflowDispatchInputValidationFailed` | Input validation specifically failed | `repository_id`, `workflow_definition_id`, `invalid_input_keys[]`, `validation_error_type` (`"missing_required"`, `"invalid_choice"`, `"type_coercion_failed"`, `"payload_too_large"`) |

### Funnel Metrics

- **Dispatch conversion rate**: % of workflow detail page views / CLI `workflow list` invocations that result in a dispatch.
- **Dispatch success rate**: % of dispatch attempts that succeed (not 4xx/5xx).
- **Input error rate**: % of dispatches rejected due to input validation — high rates suggest unclear input schemas or poor UX.
- **Time to first dispatch**: Time from workflow creation to first manual dispatch — measures discoverability.
- **Dispatch-to-completion latency**: Time from dispatch to run completion — measures end-to-end workflow value.
- **Dispatch method distribution**: Breakdown of dispatches by method (web / CLI / TUI / API / editor) — measures surface adoption.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Dispatch request received | `INFO` | `repository_id`, `workflow_identifier`, `ref`, `user_id`, `dispatch_method`, `input_count` |
| Workflow definition resolved | `DEBUG` | `repository_id`, `workflow_definition_id`, `workflow_name`, `resolved_by` (`"id"`, `"name"`, `"path_stem"`, `"full_path"`) |
| Input validation performed | `DEBUG` | `workflow_definition_id`, `schema_input_count`, `provided_input_count`, `merged_input_count`, `has_defaults` |
| Dispatch inputs merged | `DEBUG` | `workflow_definition_id`, `input_keys` (keys only, no values) |
| Workflow run created | `INFO` | `repository_id`, `workflow_definition_id`, `workflow_run_id`, `trigger_event: "workflow_dispatch"`, `trigger_ref`, `has_dispatch_inputs` |
| Agent token generated | `DEBUG` | `workflow_run_id`, `token_expires_at` |
| Dispatch rejected — not found | `WARN` | `repository_id`, `workflow_identifier`, `user_id` |
| Dispatch rejected — inactive | `WARN` | `repository_id`, `workflow_definition_id`, `user_id` |
| Dispatch rejected — rate limited | `WARN` | `repository_id`, `user_id`, `rate_limit_scope`, `retry_after_seconds` |
| Dispatch rejected — invalid input | `WARN` | `repository_id`, `workflow_definition_id`, `validation_error` |
| Dispatch rejected — payload too large | `WARN` | `repository_id`, `payload_size_bytes`, `max_allowed_bytes` |
| Dispatch internal error | `ERROR` | `repository_id`, `workflow_definition_id`, `error_message`, `stack_trace` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_dispatch_total` | Counter | `repository_id`, `status` (`success`, `error_400`, `error_403`, `error_404`, `error_429`, `error_500`), `dispatch_method` | Total dispatch attempts |
| `codeplane_workflow_dispatch_duration_seconds` | Histogram | `repository_id`, `status` | End-to-end dispatch latency (request → run created) |
| `codeplane_workflow_dispatch_input_count` | Histogram | `repository_id` | Number of inputs provided per dispatch |
| `codeplane_workflow_dispatch_payload_bytes` | Histogram | `repository_id` | Request payload size in bytes |
| `codeplane_workflow_dispatch_rate_limit_remaining` | Gauge | `repository_id`, `scope` (`user`, `repo`, `deploy_key`) | Remaining rate limit budget |

### Alerts & Runbooks

**Alert: High Dispatch Error Rate**
- Condition: `rate(codeplane_workflow_dispatch_total{status=~"error_.*"}[5m]) / rate(codeplane_workflow_dispatch_total[5m]) > 0.20` for 5 minutes.
- Severity: Warning.
- **Runbook:**
  1. Check which `status` label dominates errors. If 404s: check whether workflows were recently deleted or renamed. If 429s: check rate limit settings and whether a single user/bot is flooding. If 400s: check recent workflow definition changes that might have introduced invalid schemas. If 500s: escalate to database/service investigation.
  2. Query recent dispatch logs at WARN level: filter by `repository_id` to isolate scope.
  3. If rate-limit 429s are dominant, check for runaway automation or misconfigured CI.
  4. If 500s are present, check database connectivity and `createWorkflowRun` query performance.

**Alert: Dispatch Latency Spike**
- Condition: `histogram_quantile(0.95, rate(codeplane_workflow_dispatch_duration_seconds_bucket[5m])) > 2.0` for 5 minutes.
- Severity: Warning.
- **Runbook:**
  1. Check database query latency for `workflow_definitions` and `workflow_runs` tables.
  2. Check whether the broadcast dispatch path (list-all-definitions) is being triggered more than targeted dispatch — this is slower for repos with many definitions.
  3. Check system resource utilization (CPU, memory, I/O) on the server.
  4. Check if a specific repository has an unusually large number of workflow definitions (>50) slowing down the matching loop.

**Alert: Dispatch Rate Limit Saturation**
- Condition: `codeplane_workflow_dispatch_rate_limit_remaining < 5` for any `scope` for 2 minutes.
- Severity: Info.
- **Runbook:**
  1. Identify the user/key saturating the limit from the `user_id` or `deploy_key` in WARN-level rate limit logs.
  2. Determine if this is intentional automation or abuse.
  3. If legitimate, consider adjusting rate limits for the specific repository or user.
  4. If abuse, consider revoking the access token or deploy key.

**Alert: Dispatch Internal Errors**
- Condition: `rate(codeplane_workflow_dispatch_total{status="error_500"}[5m]) > 0` for 2 minutes.
- Severity: Critical.
- **Runbook:**
  1. Immediately check ERROR-level logs for the dispatch path — look for `dispatch internal error` entries.
  2. Common causes: database connection pool exhaustion, disk full (can't write run record), SSE manager failure.
  3. Check database health: `SELECT 1` latency, connection count, disk usage.
  4. Check if `createWorkflowRun` or `updateWorkflowRunAgentToken` queries are failing.
  5. If the error is transient (brief DB hiccup), monitor for auto-recovery. If persistent, check for schema migration issues or constraint violations.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | User-facing message |
|-------|-------------|-------|---------------------|
| Invalid workflow ID | 400 | Non-numeric, zero, negative, or overflow ID | "invalid workflow id" |
| Invalid identifier | 400 | Empty or whitespace-only name | "invalid workflow identifier" |
| Malformed body | 400 | Non-JSON or unparseable request body | "invalid request body" |
| Payload too large | 400 | Serialized body exceeds 64 KB | "request payload too large" |
| Invalid input: missing required | 400 | Required input not provided | "required input '{key}' is missing" |
| Invalid input: bad choice | 400 | Choice value not in options list | "input '{key}' must be one of: {options}" |
| Invalid DAG | 400 | Circular job dependencies in workflow config | "invalid workflow DAG: {details}" |
| Not authenticated | 401 | No session/token | "authentication required" |
| Forbidden | 403 | User lacks write access | "insufficient permissions" |
| Definition not found | 404 | No matching definition (active) | "workflow definition not found" |
| Rate limited | 429 | Dispatch rate limit exceeded | "rate limit exceeded" (with Retry-After) |
| Internal error | 500 | DB failure, token generation failure | "internal server error" |

## Verification

### API Integration Tests

1. **Dispatch by ID — success with no inputs**: POST dispatch to a valid workflow with `workflow_dispatch` trigger, no inputs. Assert 204. Assert a run exists with `trigger_event: "workflow_dispatch"`.
2. **Dispatch by ID — success with inputs**: POST dispatch with `inputs: { environment: "staging", debug: true }`. Assert 204. Assert run's `dispatch_inputs` contains merged values including defaults.
3. **Dispatch by ID — default ref**: POST dispatch with no `ref` field. Assert the created run's `trigger_ref` equals the repository's default bookmark.
4. **Dispatch by ID — explicit ref**: POST dispatch with `ref: "feature-branch"`. Assert `trigger_ref: "feature-branch"`.
5. **Dispatch by ID — ref normalization**: POST dispatch with `ref: "refs/heads/my-branch"`. Assert `trigger_ref: "my-branch"`.
6. **Dispatch by ID — ref normalization for bookmarks prefix**: POST dispatch with `ref: "refs/bookmarks/my-bookmark"`. Assert `trigger_ref: "my-bookmark"`.
7. **Dispatch by ID — tag ref falls back to default**: POST dispatch with `ref: "refs/tags/v1.0"`. Assert `trigger_ref` equals the default bookmark.
8. **Dispatch by ID — empty string ref defaults**: POST dispatch with `ref: ""`. Assert `trigger_ref` equals the default bookmark.
9. **Dispatch by ID — non-numeric ID returns 400**: POST with `id: "abc"`. Assert 400.
10. **Dispatch by ID — zero ID returns 400**: POST with `id: 0`. Assert 400.
11. **Dispatch by ID — negative ID returns 400**: POST with `id: -1`. Assert 400.
12. **Dispatch by ID — nonexistent ID returns 404**: POST with `id: 999999`. Assert 404.
13. **Dispatch by ID — inactive workflow returns no run or 404**.
14. **Dispatch by ID — workflow without dispatch trigger produces zero runs**: POST dispatch against a push-only workflow. Assert 204 and no new run created.
15. **Dispatch by ID — malformed JSON body returns 400**: POST with `Content-Type: application/json` and body `"not json"`. Assert 400.
16. **Dispatch by ID — empty body returns 400**: POST with no body. Assert 400.
17. **Dispatch by ID — unauthenticated returns 401**: POST dispatch without auth. Assert 401.
18. **Dispatch by ID — read-only user returns 403**: POST dispatch as a read-only collaborator. Assert 403.
19. **Dispatch by name — exact name match**: POST with identifier matching `workflow.name`. Assert 204.
20. **Dispatch by name — path stem match**: POST with identifier matching filename without extension. Assert 204.
21. **Dispatch by name — full path match**: POST with identifier matching `workflow.path`. Assert 204.
22. **Dispatch by name — case-insensitive match**: POST with identifier in different casing. Assert 204.
23. **Dispatch by name — numeric identifier resolves by ID first**: POST with identifier `"5"` where a definition has `id: 5`. Assert it dispatches that definition.
24. **Dispatch by name — nonexistent name returns 404**: POST with identifier that matches nothing. Assert 404.
25. **Dispatch by name — empty identifier returns 400**: POST with empty `:identifier`. Assert 400.
26. **Dispatch by name — whitespace-only identifier returns 400**: POST with `"  "`. Assert 400.

### Input Validation Tests

27. **Required input provided — success**: Workflow declares required input (no default). Dispatch with that input provided. Assert 204.
28. **Required input missing — failure**: Dispatch without providing required input. Assert 400 with descriptive error.
29. **Default value merged**: Workflow declares input with `default: "staging"`. Dispatch with no inputs. Assert run's `dispatch_inputs` includes `environment: "staging"`.
30. **User value overrides default**: Workflow declares `default: "staging"`. Dispatch with `environment: "production"`. Assert `dispatch_inputs.environment: "production"`.
31. **Boolean coercion — string "true"**: Dispatch with `debug: "true"`. Assert coerced to boolean `true` in stored inputs.
32. **Boolean coercion — string "false"**: Dispatch with `debug: "false"`. Assert coerced to `false`.
33. **Boolean coercion — number 1**: Dispatch with `debug: 1`. Assert coerced to `true`.
34. **Boolean coercion — number 0**: Dispatch with `debug: 0`. Assert coerced to `false`.
35. **Choice input — valid option**: Dispatch with `environment: "staging"` where options are `["staging", "production"]`. Assert 204.
36. **Choice input — invalid option**: Dispatch with `environment: "dev"` where options are `["staging", "production"]`. Assert 400.
37. **Extra input keys accepted**: Dispatch with an input key not in the schema. Assert 204 (forward-compatible).
38. **String input at maximum length (10,000 chars)**: Dispatch with a string input value of exactly 10,000 characters. Assert 204.
39. **String input exceeding maximum length (10,001 chars)**: Dispatch with a 10,001-character string. Assert 400.
40. **Payload at maximum size (64 KB)**: Construct a dispatch body of exactly 64 KB. Assert 204.
41. **Payload exceeding maximum size (64 KB + 1 byte)**: Construct a body of 64 KB + 1. Assert 400.
42. **Empty inputs object — valid**: Dispatch with `inputs: {}`. Assert 204.
43. **Null inputs — valid**: Dispatch with `inputs: null`. Assert 204.
44. **Omitted inputs — valid**: Dispatch with body `{ "ref": "main" }` (no inputs key). Assert 204.

### Concurrency and Idempotency Tests

45. **Concurrent dispatches create independent runs**: Fire 5 concurrent dispatch requests. Assert 5 distinct workflow runs created.
46. **Rapid sequential dispatches succeed within rate limit**: Fire 10 dispatches sequentially. Assert all succeed (under 30/min limit).
47. **Rate limit enforcement**: Fire 31 dispatches in rapid succession from the same user. Assert the 31st returns 429 with `Retry-After` header.

### Workflow Run Lifecycle Tests

48. **Dispatched run has correct trigger metadata**: After dispatch, fetch the run. Assert `trigger_event: "workflow_dispatch"`, `trigger_ref` matches, `dispatch_inputs` matches.
49. **Dispatched run appears in run-list endpoints**: After dispatch, list runs for the repo. Assert the new run appears.
50. **Dispatched run appears in definition-scoped run list**: List runs filtered by definition ID. Assert the dispatched run appears.
51. **Agent token generated**: After dispatch, verify the run has a non-null `agent_token_expires_at` approximately 24 hours in the future.
52. **Zero-job workflow creates run but no steps**: Dispatch a workflow with `workflow_dispatch` trigger but no jobs. Assert run created with status `"queued"`, zero steps.
53. **Invalid DAG returns 400**: Dispatch a workflow where job A depends on job B and job B depends on job A. Assert 400 with DAG error message.

### CLI E2E Tests

54. **`codeplane workflow dispatch <name> --ref main`**: Assert exit code 0, output includes run ID and status "queued", trigger "workflow_dispatch".
55. **`codeplane workflow dispatch <name> --ref main --input environment=staging --input debug=true`**: Assert exit code 0, output includes inputs.
56. **`codeplane workflow dispatch <numeric-id> --ref main`**: Dispatch by numeric ID. Assert success.
57. **`codeplane workflow dispatch nonexistent-workflow`**: Assert non-zero exit code and error message.
58. **`codeplane workflow dispatch <name>` (no --ref)**: Assert defaults to "main".
59. **`codeplane workflow dispatch <name> --json`**: Assert output is valid JSON with expected fields.
60. **`codeplane workflow dispatch <name> --repo OWNER/REPO`**: Assert explicit repo flag works.

### TUI E2E / Snapshot Tests

61. **Dispatch overlay renders for dispatchable workflow**: Navigate to a workflow with `workflow_dispatch`. Press `d`. Assert modal renders with ref input and dynamic form fields.
62. **Dispatch overlay does NOT render for non-dispatchable workflow**: Navigate to a push-only workflow. Press `d`. Assert nothing happens / no modal.
63. **String input field renders with default**: Assert text input shows default value from schema.
64. **Boolean input field renders as toggle**: Assert checkbox/toggle is present and matches default.
65. **Choice input field renders as selector**: Assert dropdown/select with correct options and default selection.
66. **Input descriptions shown as helper text**: Assert each field's description text is visible.
67. **Tab navigation cycles through fields**: Press Tab repeatedly. Assert focus moves through ref → input fields → dispatch button → cancel button.
68. **Shift+Tab reverse navigation**: Assert reverse focus order.
69. **Ctrl+S submits dispatch**: Fill in fields, press Ctrl+S. Assert dispatch fires and modal closes.
70. **Escape cancels modal**: Press Escape. Assert modal closes without dispatching.
71. **Success message shown in status bar**: After successful dispatch, assert `"Workflow dispatched ✓"` appears.
72. **Error message shown inline on failure**: Mock a 404 response. Assert error message displayed in modal.
73. **Rate limit error shown**: Mock a 429 response. Assert rate limit message displayed.
74. **Responsive sizing — small terminal**: Render at 80×24. Assert modal width ≈ 90%.
75. **Responsive sizing — large terminal**: Render at 120×40. Assert modal width ≈ 50%.

### Web UI E2E (Playwright) Tests

76. **"Run workflow" button visible on dispatchable workflow detail page**: Navigate to workflow detail. Assert button visible.
77. **"Run workflow" button NOT visible on non-dispatchable workflow**: Navigate to push-only workflow detail. Assert no dispatch button.
78. **Dispatch dialog opens on button click**: Click "Run workflow". Assert dialog/drawer appears with ref selector and input form.
79. **Default values pre-populated**: Assert form fields show default values from the workflow's input schema.
80. **Choice input renders as dropdown with correct options**: Assert select element has all declared options.
81. **Submit dispatch — success toast and redirect**: Fill in form, click "Run workflow" in dialog. Assert success toast appears. Assert run list refreshes with new run.
82. **Submit dispatch — validation error shown inline**: Clear a required field, submit. Assert error message appears next to the field.
83. **Cancel closes dialog without dispatching**: Click Cancel. Assert dialog closes. Assert no new run created.
84. **Dispatch from command palette**: Open command palette, type "Dispatch workflow", select the action. Assert dispatch dialog opens.
85. **Run list shows dispatch trigger label**: After dispatch, navigate to runs list. Assert the new run displays "Manual dispatch" or equivalent label.

### SDK / Service Layer Integration Tests

86. **`matchTrigger` returns true for workflow_dispatch event against a config with `on.workflow_dispatch`**: Assert `true`.
87. **`matchTrigger` returns false for workflow_dispatch event against a push-only config**: Assert `false`.
88. **`matchTrigger` returns false for malformed JSON config**: Assert `false` (graceful degradation).
89. **`validateDispatchInputs` merges defaults**: Config with `default: "staging"`, no user inputs. Assert returns `{ environment: "staging" }`.
90. **`validateDispatchInputs` with no dispatch trigger in config**: Assert returns user inputs as-is (or null).
91. **`validateDispatchInputs` with malformed config JSON**: Assert returns user inputs gracefully.
92. **`dispatchForEvent` creates run for matching definition**: Assert one `WorkflowRunResult` returned.
93. **`dispatchForEvent` with targeted definition ID**: Assert only that definition is checked.
94. **`dispatchForEvent` with broadcast (no definition ID)**: Assert all active definitions are checked for match.
95. **`dispatchForEvent` skips inactive definitions in broadcast mode**: Assert inactive definitions do not produce runs.
96. **`dispatchForEvent` with invalid repository ID returns error**: Assert `badRequest` result.
97. **`dispatchForEvent` with empty event type returns error**: Assert `badRequest` result.
