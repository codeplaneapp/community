# WORKFLOW_STEP_USE_ACTION

Specification for WORKFLOW_STEP_USE_ACTION.

## High-Level User POV

When a developer defines a Codeplane workflow, the most powerful workflow steps are rarely raw shell scripts. Instead, teams build up a library of reusable actions — tested, versioned, encapsulated units of automation like "set up Node.js", "deploy to staging", "run a security scan", or "post a Slack notification". The `uses` step type lets a workflow author reference one of these reusable actions by name and version, pass it structured inputs, and consume its outputs — all without copying and pasting scripts between workflow files.

Today, Codeplane workflows support two step execution modes: `run` for inline shell scripts and `agent` for AI-driven tasks. The `uses` step type completes the picture by enabling a workflow step to declare a dependency on a reusable action — `uses: "codeplane/setup-node@v3"` — and pass it parameters through a `with` block. The action author publishes versioned action definitions that declare their expected inputs, outputs, and execution strategy (shell script, Docker container, or composite sub-steps). The workflow executor resolves the action reference, validates the inputs, runs the action in an isolated context, and captures outputs that subsequent steps can reference.

From the developer's perspective, using an action in a workflow feels like calling a function. You specify the action reference, pass inputs, and optionally capture outputs. If the action doesn't exist, the version is invalid, or the inputs fail validation, the step fails immediately with a clear error message before any execution begins. In the web UI, action steps are visually distinguished from script steps, showing the resolved action name, version, and input/output summary. In the CLI, `codeplane workflow run view` and `codeplane workflow run steps` display the action reference alongside each step's status.

Actions can come from three sources: built-in actions shipped with Codeplane (such as checkout, cache, and artifact helpers), repository-local actions defined in the `.codeplane/actions/` directory, and community actions referenced from other Codeplane repositories. This model gives teams the flexibility to start with built-in actions, build custom actions for their specific needs, and eventually share actions across the organization — all using the same `uses:` syntax and versioning conventions.

For agent-assisted workflows, the `uses` step type is especially valuable. Agents can compose workflows from well-known actions rather than generating raw shell scripts, producing more reliable and auditable automation. When an agent creates a workflow, it can reference `codeplane/setup-node@v3` with confidence that the action has been tested and versioned, rather than guessing at the right shell commands for a particular environment.

## Acceptance Criteria

### Definition of Done

- [ ] Workflow definitions accept `uses` as a valid step type alongside `run` and `agent`
- [ ] The `uses` field follows the format `owner/name@version` for community actions, `./path` for repository-local actions, or `name@version` for built-in actions
- [ ] Steps with `uses` accept a `with` block containing key-value input parameters
- [ ] Steps with `uses` can declare an `id` field to expose outputs for consumption by later steps
- [ ] Action references are resolved and validated at workflow run creation time
- [ ] Invalid action references cause the step to fail immediately with a clear error message
- [ ] Input values are validated against the action's declared input schema before execution begins
- [ ] Missing required inputs cause the step to fail with a message listing the missing inputs
- [ ] Unknown inputs (not declared by the action) cause the step to fail with a message listing the unexpected keys
- [ ] Action outputs are captured and made available to subsequent steps via `steps.<step-id>.outputs.<output-name>`
- [ ] Built-in actions (`checkout`, `cache/restore`, `cache/save`, `upload-artifact`, `download-artifact`) are available without any external resolution
- [ ] Repository-local actions (referenced as `./path-to-action`) are resolved from the repository's file tree at the trigger ref
- [ ] Community actions (referenced as `owner/action@version`) are resolved from the specified Codeplane repository
- [ ] The web UI visually distinguishes `uses` steps from `run` and `agent` steps
- [ ] The CLI step listing shows the action reference for `uses` steps
- [ ] The TUI step listing shows the action reference for `uses` steps
- [ ] E2E tests cover built-in, repository-local, and community action resolution
- [ ] E2E tests cover input validation, output capture, and version resolution
- [ ] Documentation covers action authoring, action reference syntax, and built-in action catalog

### Action Reference Format

- [ ] `owner/name@version` — community action from another Codeplane repository (e.g., `codeplane/setup-node@v3`)
- [ ] `owner/name@sha` — community action pinned to a specific commit SHA (40-character hex string)
- [ ] `owner/name/path@version` — community action in a subdirectory of a repository
- [ ] `./path` — repository-local action relative to the repository root (e.g., `./.codeplane/actions/deploy`)
- [ ] `name@version` — built-in action (e.g., `checkout@v1`, `cache/restore@v1`)
- [ ] The `@version` segment is required for community and built-in actions
- [ ] Version tags must match `v[0-9]+` (major only), `v[0-9]+.[0-9]+` (major.minor), or `v[0-9]+.[0-9]+.[0-9]+` (full semver)
- [ ] SHA references must be exactly 40 lowercase hexadecimal characters
- [ ] The owner segment must be 1–39 characters matching `[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?`
- [ ] The name segment must be 1–100 characters matching `[a-zA-Z0-9._-]+`
- [ ] The total `uses` string must not exceed 512 characters

### Action Definition Format

- [ ] Actions are defined by an `action.yml` or `action.yaml` file in the action directory
- [ ] The action definition must include `name` (string, 1–128 characters)
- [ ] The action definition must include `description` (string, 1–1024 characters)
- [ ] The action definition may include `inputs` (map of input name to input definition)
- [ ] Each input definition may include `description` (string), `required` (boolean, default `false`), `default` (string), and `type` (string: `string`, `boolean`, `number`, `choice`)
- [ ] Choice-type inputs must include an `options` array of valid string values (1–50 options)
- [ ] The action definition may include `outputs` (map of output name to output definition)
- [ ] Each output definition must include `description` (string) and may include `value` (expression string)
- [ ] The action definition must include `runs` (execution strategy):
  - `runs.using: "shell"` with `runs.main` (path to the entry script relative to the action directory)
  - `runs.using: "docker"` with `runs.image` (Docker image reference) and optional `runs.entrypoint` and `runs.args`
  - `runs.using: "composite"` with `runs.steps` (array of step configs — recursive `run`/`uses` steps)
- [ ] Input names must be 1–128 characters matching `[a-zA-Z_][a-zA-Z0-9_-]*`
- [ ] Output names must be 1–128 characters matching `[a-zA-Z_][a-zA-Z0-9_-]*`
- [ ] Maximum of 50 declared inputs per action
- [ ] Maximum of 50 declared outputs per action
- [ ] Maximum composite action nesting depth is 5 levels
- [ ] Circular composite action references are detected and rejected

### Step Configuration (`with` block)

- [ ] The `with` block is a flat key-value map of string keys to string/boolean/number values
- [ ] Keys in `with` must match declared input names (case-sensitive)
- [ ] String values must not exceed 32,768 characters
- [ ] Boolean values are accepted as `true`/`false`, `"true"`/`"false"`, `"1"`/`"0"`
- [ ] Number values must be finite numbers
- [ ] The total serialized `with` block must not exceed 256 KB
- [ ] Expression syntax `${{ steps.<id>.outputs.<name> }}` is supported in `with` values for referencing previous step outputs
- [ ] Expression syntax `${{ inputs.<name> }}` is supported for referencing workflow dispatch inputs
- [ ] Expression syntax `${{ env.<name> }}` is supported for referencing environment variables
- [ ] Unresolvable expressions fail the step with a clear error

### Edge Cases

- [ ] A step with both `uses` and `run` is rejected at parse time with `"step cannot have both 'uses' and 'run'"`
- [ ] A step with both `uses` and `agent` is rejected at parse time with `"step cannot have both 'uses' and 'agent'"`
- [ ] A step with `uses` but an empty string value is rejected with `"'uses' must not be empty"`
- [ ] A step with `uses` referencing an action that does not exist returns a step failure with `"action not found: <ref>"`
- [ ] A step with `uses` referencing a version tag that does not exist returns a step failure with `"action version not found: <ref>"`
- [ ] A step with `uses` referencing a repository-local path that has no `action.yml` or `action.yaml` returns `"action definition not found at <path>"`
- [ ] A composite action that references itself (directly or transitively) is detected and rejected with `"circular action reference detected"`
- [ ] A `with` block with no matching input declaration fails with a list of unknown keys
- [ ] A `with` block missing a required input (no default) fails listing the missing inputs
- [ ] An action with zero inputs and a step providing `with` values fails with unknown keys
- [ ] An action with all optional inputs (all have defaults) and a step providing no `with` block succeeds using defaults
- [ ] Multiple steps in the same job can reference the same action independently
- [ ] Steps in different jobs can reference the same action independently
- [ ] Action resolution happens at run creation for community/built-in actions and at step execution for repository-local actions (to pick up the correct ref)

## Design

### API Shape

#### Enhanced Step Configuration in Workflow Config

The `StepConfig` interface is extended:

```typescript
interface StepConfig {
  id?: string;          // Step identifier for output references
  name?: string;        // Human-readable step name
  run?: string;         // Shell command (mutually exclusive with uses/agent)
  uses?: string;        // Action reference (mutually exclusive with run/agent)
  with?: Record<string, string | boolean | number>;  // Action inputs
  agent?: Record<string, unknown>;  // Agent config (mutually exclusive with run/uses)
  env?: Record<string, string>;     // Step-level environment variables
  if?: string;          // Conditional expression
  "continue-on-error"?: boolean;
  "timeout-minutes"?: number;
}
```

#### Step Detail Response Enhancement

`GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` response is enhanced for action steps:

```json
{
  "id": 305,
  "workflow_run_id": 1047,
  "name": "Setup Node.js",
  "position": 2,
  "status": "success",
  "step_type": "action",
  "action": {
    "ref": "codeplane/setup-node@v3",
    "resolved_version": "v3.2.1",
    "resolved_sha": "a1b2c3d4e5f6...",
    "inputs": {
      "node-version": "20",
      "cache": "npm"
    },
    "outputs": {
      "node-version": "20.11.0",
      "cache-hit": "true"
    }
  },
  "started_at": "2026-03-22T10:15:31.000Z",
  "completed_at": "2026-03-22T10:15:38.000Z",
  "created_at": "2026-03-22T10:15:28.000Z",
  "updated_at": "2026-03-22T10:15:38.000Z",
  "logs": []
}
```

The `step_type` field is added to all step responses: `"script"`, `"action"`, or `"agent"`.

#### Step List Response Enhancement

`GET /api/repos/:owner/:repo/actions/runs/:id/steps` response includes the new fields:

```json
{
  "steps": [
    {
      "id": 301,
      "workflow_run_id": 1047,
      "name": "Checkout",
      "position": 1,
      "status": "success",
      "step_type": "action",
      "uses": "checkout@v1",
      "started_at": "...",
      "completed_at": "...",
      "created_at": "...",
      "updated_at": "..."
    },
    {
      "id": 302,
      "workflow_run_id": 1047,
      "name": "Install",
      "position": 2,
      "status": "success",
      "step_type": "script",
      "uses": null,
      "started_at": "...",
      "completed_at": "...",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

#### Action Definition Lookup Endpoint

```
GET /api/repos/:owner/:repo/actions/:path
```

Resolves and returns the `action.yml` definition for a repository-local or community action.

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `owner` | string | Valid owner name | Repository owner |
| `repo` | string | Valid repository name | Repository name |
| `path` | string | Valid action path within the repository | Path to the action directory |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ref` | string | default bookmark | The ref/bookmark to resolve the action from |

**Response (200 OK):**

```json
{
  "name": "Setup Node.js",
  "description": "Set up a Node.js environment and optionally cache dependencies",
  "inputs": {
    "node-version": {
      "description": "Version of Node.js to use",
      "required": true,
      "type": "string"
    },
    "cache": {
      "description": "Package manager to cache",
      "required": false,
      "default": "",
      "type": "choice",
      "options": ["npm", "yarn", "pnpm", ""]
    }
  },
  "outputs": {
    "node-version": {
      "description": "The installed Node.js version"
    },
    "cache-hit": {
      "description": "Whether the cache was hit"
    }
  },
  "runs": {
    "using": "composite",
    "steps": [
      { "name": "Install Node.js", "run": "..." },
      { "name": "Cache packages", "uses": "cache/restore@v1", "with": { "key": "node-${{ inputs.cache }}" } }
    ]
  }
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|----------|
| 400 | `{ "message": "invalid action path" }` | Malformed path |
| 404 | `{ "message": "action definition not found" }` | No action.yml at the specified path |
| 404 | `{ "message": "repository not found" }` | Owner/repo does not exist |

#### Built-in Action Catalog Endpoint

```
GET /api/actions/builtins
```

Returns the list of built-in actions available in this Codeplane instance.

**Response (200 OK):**

```json
{
  "actions": [
    {
      "name": "checkout",
      "description": "Check out repository code at the trigger ref",
      "latest_version": "v1",
      "versions": ["v1"]
    },
    {
      "name": "cache/restore",
      "description": "Restore cached files by key",
      "latest_version": "v1",
      "versions": ["v1"]
    },
    {
      "name": "cache/save",
      "description": "Save files to the cache by key",
      "latest_version": "v1",
      "versions": ["v1"]
    },
    {
      "name": "upload-artifact",
      "description": "Upload a workflow artifact",
      "latest_version": "v1",
      "versions": ["v1"]
    },
    {
      "name": "download-artifact",
      "description": "Download a workflow artifact",
      "latest_version": "v1",
      "versions": ["v1"]
    }
  ]
}
```

### SDK Shape

The `@codeplane/sdk` workflow service adds:

```typescript
// Validate step configurations before creating a run
validateStepConfigs(steps: StepConfig[]): { valid: boolean; errors: Array<{ step: number; message: string }> }

// Resolve an action reference to a concrete definition
resolveAction(
  repositoryId: string,
  ref: string,
  uses: string
): Promise<Result<ResolvedAction, APIError>>

// Validate action inputs against the action's declared schema
validateActionInputs(
  action: ActionDefinition,
  inputs: Record<string, unknown>
): { valid: boolean; errors: Array<{ input: string; message: string }> }

// Get built-in action definitions
getBuiltinActions(): ActionDefinition[]

// Get a single built-in action by name and version
getBuiltinAction(name: string, version: string): ActionDefinition | null
```

New types:

```typescript
interface ActionDefinition {
  name: string;
  description: string;
  inputs: Record<string, ActionInputDefinition>;
  outputs: Record<string, ActionOutputDefinition>;
  runs: ActionRunsConfig;
}

interface ActionInputDefinition {
  description: string;
  required: boolean;
  default?: string;
  type: "string" | "boolean" | "number" | "choice";
  options?: string[];
}

interface ActionOutputDefinition {
  description: string;
  value?: string;
}

type ActionRunsConfig =
  | { using: "shell"; main: string }
  | { using: "docker"; image: string; entrypoint?: string; args?: string[] }
  | { using: "composite"; steps: StepConfig[] }

interface ResolvedAction {
  definition: ActionDefinition;
  resolvedVersion: string;
  resolvedSha: string;
  source: "builtin" | "local" | "community";
}
```

### Workflow Package (`packages/workflow`)

A new `actions.ts` module is added to the workflow package:

```typescript
export interface ActionStepDescriptor {
  _type: "action";
  uses: string;
  with?: Record<string, string | boolean | number>;
  id?: string;
}

export function useAction(
  ref: string,
  options?: { with?: Record<string, string | boolean | number>; id?: string }
): ActionStepDescriptor {
  if (!ref || ref.trim() === "") {
    throw new Error("action reference must not be empty");
  }
  if (ref.length > 512) {
    throw new Error("action reference must not exceed 512 characters");
  }
  return {
    _type: "action",
    uses: ref.trim(),
    with: options?.with,
    id: options?.id,
  };
}
```

Exported from `packages/workflow/src/index.ts` as part of the public API.

### CLI Command

The `codeplane workflow run steps` and `codeplane workflow run view` commands are enhanced:

**Enhanced table output for `workflow run steps`:**

```
STEP  NAME                  TYPE     ACTION                       STATUS   DURATION
#1    Checkout              action   checkout@v1                  ✓        2s
#2    Setup Node.js         action   codeplane/setup-node@v3      ✓        8s
#3    Install               script   —                            ✓        15s
#4    Build                 script   —                            ✓        24s
#5    Deploy                action   ./actions/deploy             ◎        running
#6    Notify Slack          action   codeplane/slack-notify@v1    ◌        —
```

**New CLI command to list built-in actions:**

```
codeplane workflow actions [--json]
```

Outputs:

```
NAME                DESCRIPTION                                     VERSION
checkout            Check out repository code at the trigger ref    v1
cache/restore       Restore cached files by key                     v1
cache/save          Save files to the cache by key                  v1
upload-artifact     Upload a workflow artifact                       v1
download-artifact   Download a workflow artifact                     v1
```

### Web UI Design

#### Step List Enhancement

In the workflow run detail page (`/:owner/:repo/workflows/runs/:id`):

- Each step row shows a type icon: 📜 (script), 🔧 (action), 🤖 (agent)
- Action steps display the resolved action reference as a secondary label beneath the step name (e.g., `codeplane/setup-node@v3 → v3.2.1`)
- Clicking an action step expands to show:
  - Input values as a key-value table
  - Output values as a key-value table (after completion)
  - Execution logs
  - Resolved action version and SHA

#### Workflow Definition Editor Enhancement

When viewing or editing a workflow definition:

- Action references in `uses` fields are syntax-highlighted
- Hovering over a `uses` value shows a tooltip with the action's name, description, and input schema
- Autocomplete suggests built-in action names when typing a `uses` value
- Invalid action references are underlined in red with an error tooltip

#### Built-in Action Catalog Page

New route: `/:owner/:repo/workflows/actions`

- Lists all built-in actions with name, description, and version
- Each action links to its full documentation showing inputs, outputs, and usage examples
- Search/filter by action name

### TUI UI

#### Step List Enhancement

- Action steps show the action reference after the step name: `Setup Node.js (codeplane/setup-node@v3)`
- Expanding an action step with `Enter` shows inputs, outputs (if complete), and logs in a tabbed layout
- Tab navigation within an expanded action step: `[Inputs]` `[Outputs]` `[Logs]`

### Documentation

1. **"Using Actions in Workflows"** — Guide covering the `uses` syntax, `with` inputs, output references, and the three action source types (built-in, local, community). Includes complete workflow examples.
2. **"Authoring Custom Actions"** — Guide for creating repository-local actions with `action.yml`, including input/output declarations, execution strategies (shell, docker, composite), and versioning.
3. **"Built-in Actions Reference"** — Catalog page documenting each built-in action's purpose, inputs, outputs, and example usage.
4. **"CLI Reference: `workflow actions`"** — Command docs for the built-in action catalog command.
5. **"API Reference: Action Definition Lookup"** — Endpoint docs for `GET /api/repos/:owner/:repo/actions/:path` and `GET /api/actions/builtins`.
6. **"Workflow Step Types"** — Overview document comparing `run`, `uses`, and `agent` step types with guidance on when to use each.

## Permissions & Security

### Authorization Roles

| Role | Use actions in workflow (dispatch) | View action definitions | Author local actions |
|------|-----------------------------------|------------------------|---------------------|
| Repository Owner | ✅ | ✅ | ✅ |
| Repository Admin | ✅ | ✅ | ✅ |
| Write Member | ✅ | ✅ | ✅ |
| Read-Only Member | ❌ (cannot dispatch) | ✅ | ❌ |
| Anonymous (public repo) | ❌ (cannot dispatch) | ✅ | ❌ |
| Anonymous (private repo) | ❌ | ❌ | ❌ |

**Community action resolution permissions:**
- Resolving a community action from a public repository requires no special permissions
- Resolving a community action from a private repository requires the workflow's repository owner (or the triggering user) to have at least read access to the action's source repository
- If the action's source repository is not accessible, the step fails with `"action repository not accessible"`

**Built-in action permissions:**
- Built-in actions are available to all workflow runs without any access check

### Rate Limiting

| Endpoint | Limit | Scope |
|----------|-------|-------|
| `GET /api/repos/:owner/:repo/actions/:path` | 120 requests/minute | Per authenticated user |
| `GET /api/repos/:owner/:repo/actions/:path` (anonymous) | 30 requests/minute | Per IP address |
| `GET /api/actions/builtins` | 120 requests/minute | Per authenticated user |
| `GET /api/actions/builtins` (anonymous) | 60 requests/minute | Per IP address |
| Action resolution during workflow execution | 60 resolutions/minute | Per repository |

Rate limit responses include `Retry-After` and `X-RateLimit-*` headers.

### Data Privacy

- Action input values passed via `with` are stored in the workflow task payload and visible to anyone with read access to the workflow run
- Secret values should be passed via `${{ secrets.NAME }}` expressions, not hardcoded in `with` blocks. Expression-based secrets are resolved at execution time and are never stored in the task payload in plaintext
- Community action resolution exposes the referencing repository's existence to the action source repository's access logs. This is acceptable — it is analogous to dependency resolution in package managers
- Action definitions fetched from community repositories are cached for the duration of the workflow run but not persisted. Re-runs re-fetch the action definition

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `WorkflowStepActionUsed` | A workflow run is created containing at least one `uses` step | `repo_owner`, `repo_name`, `run_id`, `action_ref`, `action_source` (`builtin` / `local` / `community`), `action_version`, `input_count`, `client` |
| `WorkflowStepActionResolved` | An action reference is successfully resolved to a concrete definition | `action_ref`, `resolved_version`, `resolved_sha`, `source`, `resolution_duration_ms` |
| `WorkflowStepActionResolutionFailed` | An action reference fails to resolve | `action_ref`, `failure_reason` (`not_found` / `version_not_found` / `invalid_format` / `access_denied` / `circular_ref`), `repo_owner`, `repo_name` |
| `WorkflowStepActionCompleted` | An action step finishes execution | `repo_owner`, `repo_name`, `run_id`, `step_id`, `action_ref`, `action_source`, `status` (`success` / `failure` / `timeout` / `cancelled`), `duration_seconds`, `output_count` |
| `WorkflowStepActionInputValidationFailed` | Action inputs fail validation at execution time | `action_ref`, `invalid_inputs`, `repo_owner`, `repo_name`, `run_id` |
| `BuiltinActionCatalogViewed` | User views the built-in action catalog | `client` (`web` / `cli` / `api`), `user_id` |

### Common Properties (all events)

- `user_id` (hashed)
- `session_id`
- `timestamp` (ISO 8601)
- `codeplane_version`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Action step adoption rate | > 30% of workflow runs use at least one `uses` step within 60 days of launch | Indicates the action model provides value over raw scripts |
| Built-in action usage | > 60% of action steps use built-in actions in the first 30 days | Built-in actions should be the easiest on-ramp |
| Action resolution success rate | > 99% | References should almost always resolve if the workflow was authored correctly |
| Action input validation failure rate | < 5% of action step executions | Indicates developers understand the action input schemas |
| Community action adoption | > 10% of action steps reference community actions within 90 days | Indicates cross-repo action sharing is providing value |
| Mean action step duration | Comparable to equivalent `run` steps (within 20% overhead) | Action wrapping should not add significant execution cost |
| Composite action nesting depth (p95) | ≤ 2 | Deeply nested composite actions indicate overengineering |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------|
| `debug` | Step config parsed with `uses` field | `run_id`, `step_position`, `uses_ref`, `has_with`, `request_id` |
| `debug` | Action resolution started | `uses_ref`, `source_type`, `run_id`, `request_id` |
| `info` | Action resolved successfully | `uses_ref`, `resolved_version`, `resolved_sha`, `source`, `resolution_duration_ms`, `request_id` |
| `info` | Action step execution started | `run_id`, `step_id`, `uses_ref`, `source`, `input_count`, `request_id` |
| `info` | Action step execution completed | `run_id`, `step_id`, `uses_ref`, `status`, `duration_seconds`, `output_count`, `request_id` |
| `warn` | Action resolution slow (> 2s) | `uses_ref`, `resolution_duration_ms`, `source`, `request_id` |
| `warn` | Composite action nesting depth > 3 | `uses_ref`, `nesting_depth`, `run_id`, `request_id` |
| `warn` | Action input validation failed | `uses_ref`, `validation_errors`, `run_id`, `step_id`, `request_id` |
| `error` | Action resolution failed | `uses_ref`, `failure_reason`, `error_message`, `run_id`, `request_id` |
| `error` | Action execution failed (internal) | `uses_ref`, `step_id`, `run_id`, `error_message`, `stack_trace`, `request_id` |
| `error` | Circular composite action reference detected | `uses_ref`, `reference_chain`, `run_id`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_action_resolution_total` | Counter | `source` (`builtin` / `local` / `community`), `status` (`success` / `not_found` / `version_not_found` / `access_denied` / `error`) | Total action resolution attempts |
| `codeplane_workflow_action_resolution_duration_seconds` | Histogram | `source`, `status` | Action resolution latency (buckets: 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_workflow_action_step_executions_total` | Counter | `source`, `action_name`, `status` (`success` / `failure` / `timeout` / `cancelled`) | Total action step executions |
| `codeplane_workflow_action_step_duration_seconds` | Histogram | `source`, `action_name`, `status` | Action step execution duration (buckets: 0.5, 1, 5, 10, 30, 60, 120, 300, 600) |
| `codeplane_workflow_action_input_validation_failures_total` | Counter | `action_name` | Total input validation failures |
| `codeplane_workflow_action_composite_nesting_depth` | Histogram | — | Composite action nesting depth observed (buckets: 1, 2, 3, 4, 5) |
| `codeplane_workflow_action_cache_hit_total` | Counter | `source` | Cached action definition reuse during a single run |
| `codeplane_workflow_builtin_catalog_requests_total` | Counter | `status` (`200` / `429` / `500`) | Requests to the built-in catalog endpoint |

### Alerts

#### Alert: `WorkflowActionResolutionHighFailureRate`
- **Condition:** `rate(codeplane_workflow_action_resolution_total{status!="success"}[10m]) / rate(codeplane_workflow_action_resolution_total[10m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_action_resolution_total` by `status` label to identify the dominant failure type
  2. If `not_found` is dominant: check if a popular community action repository was renamed, deleted, or made private. Query recent action reference failures in structured logs grouped by `uses_ref`
  3. If `version_not_found` is dominant: check if a popular action recently removed or reorganized version tags. Cross-reference with the action source repository's tag history
  4. If `access_denied` is dominant: check if a private repository hosting actions changed its access policy. Review recent permission changes in the source repository
  5. If `error` is dominant: check for network issues (community action fetch failures), disk issues (local action read failures), or database connectivity problems (built-in action registry)
  6. Verify that the built-in action definitions are correctly loaded at server startup by checking startup logs for the action catalog initialization message

#### Alert: `WorkflowActionResolutionHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_action_resolution_duration_seconds_bucket[5m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. Break down by `source` label to identify which action source type is slow
  2. For `community` actions: check network latency to the source repository's hosting infrastructure. Check DNS resolution, TLS handshake, and repository clone/fetch times
  3. For `local` actions: check filesystem I/O latency. Verify the repository is not on a degraded storage volume. Check for excessive file tree sizes at the resolution ref
  4. For `builtin` actions: this should be near-instant (in-memory). If slow, check for memory pressure or GC pauses in the server process
  5. Check if a specific `action_ref` is consistently slow and investigate that source repository's health

#### Alert: `WorkflowActionStepHighFailureRate`
- **Condition:** `rate(codeplane_workflow_action_step_executions_total{status="failure"}[15m]) / rate(codeplane_workflow_action_step_executions_total[15m]) > 0.3`
- **Severity:** Warning
- **Runbook:**
  1. Break down by `action_name` to identify which action is failing most often
  2. Check if the failure is in a built-in action (indicates a Codeplane bug) vs. a community/local action (indicates an action authoring issue)
  3. For built-in action failures: inspect step logs for the failing action. Check if a recent server deployment changed built-in action behavior
  4. For community action failures: check if the action's source repository recently published a breaking change. Compare the resolved SHA against the last known good SHA
  5. For local action failures: check if the repository's action definition was recently modified. Diff the action.yml at the current ref vs. the previous ref
  6. Check `codeplane_workflow_action_input_validation_failures_total` — if input validation failures are correlated, the issue may be a schema change in the action definition

#### Alert: `WorkflowActionCircularReferenceDetected`
- **Condition:** Logged at `error` level with event `"circular composite action reference detected"`
- **Severity:** Info
- **Runbook:**
  1. Extract the `reference_chain` from the structured log to identify the cycle
  2. Notify the repository owner that their composite action contains a circular reference
  3. No server-side fix is needed — the system correctly rejects the circular reference. This alert is informational to track misuse patterns

### Error Cases and Failure Modes

| Error Case | Step Status | Log Level | Recovery |
|------------|-------------|-----------|----------|
| Invalid `uses` format (empty, too long, malformed) | `failure` | `warn` | Workflow author fixes the reference |
| Action not found (community) | `failure` | `warn` | Verify action repo exists and is accessible |
| Action version not found | `failure` | `warn` | Verify version tag exists in the action repo |
| Repository-local action missing `action.yml` | `failure` | `warn` | Author adds action.yml to the specified path |
| Community action repo not accessible (403) | `failure` | `warn` | Grant read access to the action source repo |
| Missing required input | `failure` | `warn` | Workflow author adds the missing `with` value |
| Unknown input key | `failure` | `warn` | Workflow author removes the invalid `with` key |
| Invalid input value type (e.g., non-boolean for boolean input) | `failure` | `warn` | Workflow author fixes the `with` value |
| Circular composite action reference | `failure` | `error` | Action author breaks the cycle |
| Composite action nesting depth exceeded (> 5) | `failure` | `error` | Action author reduces nesting |
| Network failure during community action fetch | `failure` | `error` | Retry; check connectivity |
| Docker image pull failure (docker action) | `failure` | `error` | Verify image exists and is accessible |
| Action script execution timeout | `timeout` | `warn` | Action author optimizes the script or increases timeout |
| Step cancelled during action execution | `cancelled` | `info` | N/A — user-initiated |
| Both `uses` and `run` specified | Parse error (run not created) | `warn` | Workflow author removes one |
| `with` block exceeds 256 KB | `failure` | `warn` | Workflow author reduces input sizes |

## Verification

### API Integration Tests

**File: `e2e/api/workflow-step-use-action.test.ts`**

| Test ID | Description |
|---------|-------------|
| API-WSUA-001 | Dispatch a workflow with a `uses: "checkout@v1"` step; verify the run is created with `step_type: "action"` |
| API-WSUA-002 | Dispatch a workflow with a `uses` step and `with` inputs; verify inputs appear in the step detail response |
| API-WSUA-003 | Dispatch a workflow with multiple `uses` steps in the same job; verify all are created in position order |
| API-WSUA-004 | Dispatch a workflow mixing `run`, `uses`, and `agent` steps; verify each step has the correct `step_type` |
| API-WSUA-005 | Step list response includes `uses` field for action steps and `null` for script steps |
| API-WSUA-006 | Step detail response includes `action.ref`, `action.resolved_version`, `action.inputs`, and `action.outputs` for completed action steps |
| API-WSUA-007 | `GET /api/actions/builtins` returns the built-in action catalog with at least `checkout`, `cache/restore`, `cache/save`, `upload-artifact`, `download-artifact` |
| API-WSUA-008 | Built-in action catalog entries have `name`, `description`, `latest_version`, and `versions` fields |
| API-WSUA-009 | `GET /api/repos/:owner/:repo/actions/:path?ref=main` with a valid local action returns the action definition |
| API-WSUA-010 | `GET /api/repos/:owner/:repo/actions/:path` with a non-existent path returns 404 |
| API-WSUA-011 | Dispatch a workflow with `uses: ""` (empty) step; verify 400 error with `"'uses' must not be empty"` |
| API-WSUA-012 | Dispatch a workflow with a step having both `uses` and `run`; verify 400 error with `"step cannot have both 'uses' and 'run'"` |
| API-WSUA-013 | Dispatch a workflow with a step having both `uses` and `agent`; verify 400 error with `"step cannot have both 'uses' and 'agent'"` |
| API-WSUA-014 | Dispatch a workflow with `uses: "nonexistent/action@v1"`; step fails with `"action not found"` |
| API-WSUA-015 | Dispatch a workflow with `uses: "codeplane/setup-node@v999"`; step fails with `"action version not found"` |
| API-WSUA-016 | Dispatch a workflow with `uses: "./nonexistent-dir"`; step fails with `"action definition not found at ./nonexistent-dir"` |
| API-WSUA-017 | Dispatch a workflow with `uses` step providing a `with` key not declared by the action; step fails listing the unknown key |
| API-WSUA-018 | Dispatch a workflow with `uses` step missing a required input; step fails listing the missing input |
| API-WSUA-019 | Dispatch a workflow with `uses` step providing all optional inputs with defaults and no `with` block; step succeeds using defaults |
| API-WSUA-020 | Dispatch a workflow with `uses` step providing a boolean input as `"true"` (string); step succeeds with coerced value |
| API-WSUA-021 | Dispatch a workflow with `uses` step providing a boolean input as `"yes"` (invalid); step fails with validation error |
| API-WSUA-022 | Dispatch a workflow with `uses` step providing a choice input with a valid option; step succeeds |
| API-WSUA-023 | Dispatch a workflow with `uses` step providing a choice input with an invalid option; step fails listing valid options |
| API-WSUA-024 | Dispatch a workflow with `uses` step providing a number input as `"42"` (valid coercion); step succeeds |
| API-WSUA-025 | Dispatch a workflow with `uses` step providing a number input as `"NaN"` (invalid); step fails |
| API-WSUA-026 | `uses` reference exactly 512 characters long is accepted |
| API-WSUA-027 | `uses` reference 513 characters long is rejected with `"action reference must not exceed 512 characters"` |
| API-WSUA-028 | `with` block value exactly 32,768 characters long is accepted |
| API-WSUA-029 | `with` block value 32,769 characters long is rejected |
| API-WSUA-030 | `with` block total serialized size exactly 256 KB is accepted |
| API-WSUA-031 | `with` block total serialized size exceeding 256 KB is rejected |
| API-WSUA-032 | `with` block with 50 valid inputs is accepted |
| API-WSUA-033 | `with` block with 51 inputs is rejected when the action declares 51 inputs (exceeds max) |
| API-WSUA-034 | Action with zero inputs and step providing `with: { "key": "value" }` fails with unknown key error |
| API-WSUA-035 | Two steps in the same job referencing the same action both execute independently |
| API-WSUA-036 | Steps in different jobs referencing the same action both execute independently |
| API-WSUA-037 | A `uses` step with `id: "setup"` makes outputs available; a subsequent step referencing `${{ steps.setup.outputs.node-version }}` receives the correct value |
| API-WSUA-038 | A composite action (built-in or local) with sub-steps executes all sub-steps and captures outputs |
| API-WSUA-039 | A composite action nested 5 levels deep executes successfully |
| API-WSUA-040 | A composite action nested 6 levels deep is rejected with nesting depth error |
| API-WSUA-041 | A composite action that references itself (directly) is rejected with circular reference error |
| API-WSUA-042 | A composite action that references itself transitively (A → B → A) is rejected with circular reference error |
| API-WSUA-043 | `uses` format `owner/name@v1` resolves correctly |
| API-WSUA-044 | `uses` format `owner/name@v1.2` resolves correctly |
| API-WSUA-045 | `uses` format `owner/name@v1.2.3` resolves correctly |
| API-WSUA-046 | `uses` format `owner/name@<40-hex-sha>` resolves correctly |
| API-WSUA-047 | `uses` format `owner/name/subdir@v1` resolves action from subdirectory |
| API-WSUA-048 | `uses` format `./actions/deploy` resolves repository-local action |
| API-WSUA-049 | `uses` format `checkout@v1` resolves built-in action |
| API-WSUA-050 | `uses: "owner/name@"` (empty version after @) returns 400 |
| API-WSUA-051 | `uses: "owner/name"` (no version) returns 400 for community actions |
| API-WSUA-052 | `uses: "@v1"` (no name) returns 400 |
| API-WSUA-053 | Unauthenticated request to built-in catalog endpoint on public instance returns 200 |
| API-WSUA-054 | Action step that times out has `status: "timeout"` with non-null `started_at` and `completed_at` |
| API-WSUA-055 | Cancelled run correctly cancels in-progress action steps with `status: "cancelled"` |
| API-WSUA-056 | Rerunning a run with action steps re-resolves actions at the original ref |
| API-WSUA-057 | `with` input key with invalid format (starts with number `"123key"`) is rejected |
| API-WSUA-058 | `with` input key at max length (128 chars) is accepted |
| API-WSUA-059 | `with` input key at 129 chars is rejected |
| API-WSUA-060 | Private community action repository not accessible to the triggering user; step fails with `"action repository not accessible"` |

### CLI Integration Tests

**File: `e2e/cli/workflow-step-use-action.test.ts`**

| Test ID | Description |
|---------|-------------|
| CLI-WSUA-001 | `codeplane workflow run steps <run-id> --repo owner/repo` with action steps shows TYPE column with `action` for `uses` steps |
| CLI-WSUA-002 | `codeplane workflow run steps <run-id> --repo owner/repo` shows ACTION column with the `uses` reference for action steps |
| CLI-WSUA-003 | `codeplane workflow run steps <run-id> --json` includes `step_type` and `uses` fields |
| CLI-WSUA-004 | `codeplane workflow run view <run-id> --json` includes `action.ref`, `action.inputs`, `action.outputs` for action steps |
| CLI-WSUA-005 | `codeplane workflow actions` lists built-in actions in table format |
| CLI-WSUA-006 | `codeplane workflow actions --json` returns JSON array of built-in actions |
| CLI-WSUA-007 | `codeplane workflow actions` includes at least `checkout`, `cache/restore`, `cache/save`, `upload-artifact`, `download-artifact` |
| CLI-WSUA-008 | Dispatch a workflow with action steps and verify `workflow run steps` shows correct step types throughout lifecycle |
| CLI-WSUA-009 | `codeplane workflow run steps` for a run with mixed step types shows correct TYPE for each (script/action/agent) |
| CLI-WSUA-010 | `codeplane workflow run steps` for a run with 50 action steps shows all 50 with correct action references |

### Playwright (Web UI) E2E Tests

**File: `e2e/web/workflow-step-use-action.test.ts`**

| Test ID | Description |
|---------|-------------|
| WEB-WSUA-001 | Navigate to workflow run detail; action steps show action type icon (🔧) |
| WEB-WSUA-002 | Action step row shows resolved action reference as secondary label |
| WEB-WSUA-003 | Click an action step to expand; input values table is visible |
| WEB-WSUA-004 | Completed action step expansion shows output values table |
| WEB-WSUA-005 | Completed action step expansion shows resolved version and SHA |
| WEB-WSUA-006 | Mixed run (script + action + agent steps) renders correct type icons for each |
| WEB-WSUA-007 | Navigate to `/:owner/:repo/workflows/actions`; built-in action catalog is displayed |
| WEB-WSUA-008 | Built-in action catalog shows name, description, and version for each action |
| WEB-WSUA-009 | Click a built-in action in the catalog; detail view shows inputs, outputs, and usage example |
| WEB-WSUA-010 | Failed action step shows error message (e.g., "action not found") in the expanded view |
| WEB-WSUA-011 | Running action step shows animated progress indicator |
| WEB-WSUA-012 | Queued action step shows queued status badge |

### TUI E2E Tests

**File: `e2e/tui/workflow-step-use-action.test.ts`**

| Test ID | Description |
|---------|-------------|
| TUI-WSUA-001 | Workflow run detail screen shows action reference after step name for `uses` steps |
| TUI-WSUA-002 | Expanding an action step with `Enter` shows tabbed view with Inputs, Outputs, Logs tabs |
| TUI-WSUA-003 | Tab navigation within expanded action step works with left/right arrows |
| TUI-WSUA-004 | Inputs tab shows key-value pairs from the `with` block |
| TUI-WSUA-005 | Outputs tab shows captured outputs after step completion |
| TUI-WSUA-006 | Logs tab shows execution logs |
| TUI-WSUA-007 | Mixed step types display correct type indicators |
| TUI-WSUA-008 | Failed action step shows error summary in collapsed view |

### Cross-Client Consistency Tests

**File: `e2e/cross-client/workflow-step-use-action.test.ts`**

| Test ID | Description |
|---------|-------------|
| CROSS-WSUA-001 | Dispatch a workflow with action steps via API; verify `step_type: "action"` in CLI `workflow run steps --json` output |
| CROSS-WSUA-002 | Dispatch a workflow with action steps via CLI; verify action badge appears in web UI run detail |
| CROSS-WSUA-003 | Dispatch a workflow with action steps; verify action inputs/outputs are consistent across API, CLI JSON, and web UI detail view |
| CROSS-WSUA-004 | Built-in action catalog from `GET /api/actions/builtins`, CLI `workflow actions --json`, and web UI catalog page all return the same action list |

All tests are left failing if the backend is unimplemented — never skipped or commented out.
