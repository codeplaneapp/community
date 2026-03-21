# WORKFLOW_LIBRARY_WORKSPACE_HELPERS

Specification for WORKFLOW_LIBRARY_WORKSPACE_HELPERS.

## High-Level User POV

When you author Codeplane workflows in TypeScript, you need a way to describe what your workspaces, preview environments, and CI pipelines look like — without writing container orchestration code or manually provisioning VMs. The Workflow Library Workspace Helpers give you three simple, type-safe functions — `defineWorkspace`, `definePreview`, and `defineCI` — that you place in well-known files in your repository's `.codeplane/` directory. These functions let you declaratively describe the tools, packages, services, environment variables, and runtime behavior that your development environments, landing request previews, and continuous integration pipelines need.

With `defineWorkspace`, you commit a `.codeplane/workspace.ts` file that says "every workspace for this repository should have Bun and jj installed, should run `bun install` on first boot, and should start a dev server on port 3000." When any team member — or an agent acting on their behalf — creates a workspace for that repository, the platform reads this definition and provisions the environment accordingly. The workspace definition also controls operational behaviors like idle timeout, persistence mode, and which Linux user to run as.

With `definePreview`, you commit a `.codeplane/preview.ts` file that tells Codeplane how to stand up a preview environment for landing requests. You specify the port to expose, an install and start command, environment variables, and optionally a fully programmable setup function that receives a workspace handle for arbitrary file and command operations inside the preview container.

With `defineCI`, you describe a CI pipeline as a series of sequential stages, each containing steps that run in parallel. This gives you typed, validated pipeline definitions that catch errors at authoring time — like duplicate step IDs, missing commands, or invalid timeouts — rather than at runtime.

All three helpers validate their inputs eagerly at definition time, providing clear error messages for invalid tool names, malformed package names, out-of-range ports, and other configuration mistakes. The result is a configuration-as-code experience where your repository workspace infrastructure is version-controlled, type-checked, and reviewed alongside your application code.

## Acceptance Criteria

### Definition of Done

- [ ] All three DSL functions (`defineWorkspace`, `definePreview`, `defineCI`) are exported from the `@codeplane-ai/workflow` package.
- [ ] Each function accepts a typed configuration object and returns a typed definition object with a discriminated `_type` field (`"workspace"`, `"preview"`, `"ci"`).
- [ ] All validation rules fire eagerly at definition time with descriptive error messages.
- [ ] The helpers are usable in `.codeplane/workspace.ts`, `.codeplane/preview.ts`, and `.codeplane/ci.ts` convention files as default exports.
- [ ] The `WorkspaceHandle` interface is exported for use in preview `setup` functions.
- [ ] All exported types (`WorkspaceConfig`, `WorkspaceDefinition`, `PreviewConfig`, `PreviewDefinition`, `CIConfig`, `CIDefinition`, `CIStepConfig`, `CIGroupConfig`, `ServiceConfig`, `WorkspaceHandle`) are importable.
- [ ] Documentation covers all three helpers with complete examples.

### Validation Constraints

- [ ] **Tool names**: Must match `/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`. Must start with alphanumeric. May contain hyphens and underscores.
- [ ] **Apt package names**: Must match `/^[a-z0-9][a-z0-9.+\-]*$/`. Lowercase alphanumeric start, may include dots, plus signs, and hyphens.
- [ ] **Linux usernames**: Must match `/^[a-z_][a-z0-9_-]*[$]?$/`. Maximum 32 characters.
- [ ] **Ports**: Integer between 1 and 65535 inclusive.
- [ ] **Idle timeout**: Non-negative integer (seconds). Zero is valid.
- [ ] **Persistence mode**: One of `"ephemeral"`, `"sticky"`, or `"persistent"`. Any other string rejected.
- [ ] **Service command**: Non-empty string after trimming.
- [ ] **CI stage IDs**: Non-empty. Globally unique across all stages.
- [ ] **CI step IDs**: Non-empty. Globally unique across all steps in all stages.
- [ ] **CI step commands**: Non-empty strings.
- [ ] **CI step timeout**: Positive integer (≥ 1 second) if provided.
- [ ] **CI stages array**: At least one stage required.
- [ ] **CI stage steps array**: Each stage must have at least one step.
- [ ] **Preview config**: Must specify at least one of `start` or `setup`.

### Edge Cases

- [ ] Empty `tools` object `{}` is valid.
- [ ] Empty `packages` array `[]` is valid.
- [ ] Empty `env` object `{}` is valid.
- [ ] Empty `services` object `{}` is valid.
- [ ] `undefined` optional fields are silently ignored.
- [ ] Single-character tool name (e.g., `"a"`) is valid.
- [ ] Tool name starting with underscore or hyphen is rejected.
- [ ] Username exactly 32 characters is valid; 33 characters is rejected.
- [ ] Port `0` is rejected. Port `65536` is rejected.
- [ ] `idleTimeout: 0` is valid. `idleTimeout: -1` is rejected. `idleTimeout: 1.5` is rejected.
- [ ] Preview with both `start` and `setup` is valid.
- [ ] Preview with only `setup` (no `start`) is valid.
- [ ] Preview with neither `start` nor `setup` is rejected.
- [ ] CI step IDs must be globally unique across stages (not just within a stage).
- [ ] CI step with whitespace-only command is rejected.

## Design

### SDK Shape (`@codeplane-ai/workflow` Package Exports)

#### `defineWorkspace(config: WorkspaceConfig): WorkspaceDefinition`

Accepts a `WorkspaceConfig` and returns a `WorkspaceDefinition` with `_type: "workspace"`. Validates all inputs eagerly.

```typescript
import { defineWorkspace } from "@codeplane-ai/workflow";

export default defineWorkspace({
  tools: { bun: "latest", jj: "latest" },
  packages: ["curl", "git", "jq"],
  install: "bun install",
  services: {
    "dev-server": { command: "bun run dev", port: 3000 },
  },
  env: { NODE_ENV: "development" },
  user: "developer",
  persistence: "sticky",
  idleTimeout: 1800,
});
```

#### `definePreview(config: PreviewConfig): PreviewDefinition`

Accepts a `PreviewConfig` and returns a `PreviewDefinition` with `_type: "preview"`. Validates port and services eagerly.

```typescript
import { definePreview } from "@codeplane-ai/workflow";

// Simple approach
export default definePreview({
  port: 3000,
  install: "bun install",
  start: "bun run dev",
  env: { NODE_ENV: "preview" },
});

// Programmatic approach with WorkspaceHandle
export default definePreview({
  port: 8080,
  setup: async (workspace) => {
    await workspace.exec("npm install");
    await workspace.writeFile(".env", "DATABASE_URL=...");
    await workspace.exec("npm run build");
    await workspace.exec("npm start &");
  },
});
```

#### `defineCI(config: CIConfig): CIDefinition`

Accepts a `CIConfig` and returns a `CIDefinition` with `_type: "ci"`. Validates stages, step uniqueness, commands, and timeouts eagerly.

```typescript
import { defineCI } from "@codeplane-ai/workflow";

export default defineCI({
  install: "bun install",
  tools: { bun: "1.1.0" },
  packages: ["curl"],
  env: { CI: "true" },
  stages: [
    {
      id: "lint",
      label: "Linting",
      steps: [
        { id: "lint-ts", command: "bun run lint", timeout: 120 },
        { id: "lint-go", command: "go vet ./..." },
      ],
    },
    {
      id: "test",
      label: "Testing",
      steps: [
        { id: "test-unit", command: "bun test", continueOnFail: true },
        { id: "test-e2e", command: "bun run test:e2e", timeout: 600 },
      ],
    },
  ],
});
```

#### `WorkspaceHandle` Interface

Exported for use in `PreviewConfig.setup` functions:

- `exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }>` — Execute a shell command inside the workspace.
- `writeFile(path: string, content: string): Promise<void>` — Write a file inside the workspace.
- `readFile(path: string): Promise<string>` — Read a file from the workspace.

#### `ServiceConfig` Interface

- `command: string` — Shell command to start the service (required, non-empty).
- `port?: number` — Port the service listens on (1–65535).
- `healthCheck?: string` — Shell command to check service health (exit 0 = healthy).
- `readySignal?: string` — String to watch for in stdout to determine readiness.

#### Exported Types

All configuration and definition types are exported:
`WorkspaceConfig`, `WorkspaceDefinition`, `PreviewConfig`, `PreviewDefinition`, `CIConfig`, `CIDefinition`, `CIStepConfig`, `CIGroupConfig`, `ServiceConfig`, `WorkspaceHandle`

### Convention File Locations

| Helper | Convention File | Purpose |
|---|---|---|
| `defineWorkspace` | `.codeplane/workspace.ts` | Repository workspace template |
| `definePreview` | `.codeplane/preview.ts` | Landing request preview environment |
| `defineCI` | `.codeplane/ci.ts` | CI pipeline definition |

Each convention file should `export default` the result of the corresponding helper function.

### Documentation

1. **Workspace Configuration Guide** — How to create `.codeplane/workspace.ts`, what each field does, validation rules for tool names/packages/usernames, and examples for common project types.
2. **Preview Environment Guide** — How to create `.codeplane/preview.ts`, covering simple `start`-based approach and advanced `setup`-function approach using `WorkspaceHandle`.
3. **CI Pipeline Guide** — How to define CI pipelines with stages and steps, parallel execution, timeouts, `continueOnFail`, and working directory overrides.
4. **Workspace Helpers API Reference** — Complete API reference for all three functions, all interfaces, validation rules, and error messages.
5. **Service Configuration Reference** — How to configure long-running services with health checks, ready signals, and port binding.

## Permissions & Security

### Authorization

- **Authoring workspace/preview/CI definitions**: Any user with write (push) access to the repository can commit `.codeplane/workspace.ts`, `.codeplane/preview.ts`, or `.codeplane/ci.ts` files. The helpers themselves are pure validation functions with no server-side authorization gate. The permission boundary is repository push access.
- **Consuming definitions**: The server reads and evaluates these convention files when provisioning workspaces, previews, or CI runs. The server-side consumer acts under the permission context of the triggering user or automation.
- **`WorkspaceHandle` operations**: The `exec`, `writeFile`, and `readFile` methods execute within the sandbox boundary of the provisioned container. They inherit the permissions of the workspace's Linux user (as configured by `WorkspaceConfig.user`), not the Codeplane user's forge-level permissions.
- **Read-only users and anonymous users**: Can view the `.codeplane/` convention files in the repository code browser but cannot create workspaces, previews, or CI runs from them.

### Rate Limiting

- The helpers are pure TypeScript functions that run at build/import time. No server-side rate limiting applies to the validation itself.
- Server-side rate limiting applies when the definitions are consumed by workspace creation, preview creation, or workflow dispatch endpoints (governed by those endpoints' own rate limits).

### Data Privacy

- `WorkspaceConfig.env` and `PreviewConfig.env` contain non-secret environment variables. Users must not place secrets in these fields; secrets should use the repository secrets API instead. Documentation must clearly warn against placing credentials in env fields.
- `ServiceConfig.command` values are stored in repository source code and should not contain credentials.
- `WorkspaceHandle.writeFile` content may contain sensitive data at runtime; this data lives within the workspace sandbox and is not persisted to the forge database.
- Convention files are stored as regular repository files and follow the repository's visibility settings (public/private).

## Telemetry & Product Analytics

### Key Business Events

| Event | Properties | Description |
|---|---|---|
| `WorkspaceDefinitionValidated` | `repo_id`, `tools_count`, `packages_count`, `services_count`, `persistence`, `has_custom_user`, `has_idle_timeout` | Fired when a `.codeplane/workspace.ts` file is successfully loaded and validated by the server |
| `PreviewDefinitionValidated` | `repo_id`, `port`, `has_install`, `has_start`, `has_setup_fn`, `services_count` | Fired when a `.codeplane/preview.ts` file is successfully loaded and validated |
| `CIDefinitionValidated` | `repo_id`, `stages_count`, `total_steps_count`, `tools_count`, `packages_count`, `has_install` | Fired when a `.codeplane/ci.ts` file is successfully loaded and validated |
| `WorkspaceDefinitionValidationFailed` | `repo_id`, `error_message`, `field` | Fired when validation fails for a workspace definition |
| `PreviewDefinitionValidationFailed` | `repo_id`, `error_message`, `field` | Fired when validation fails for a preview definition |
| `CIDefinitionValidationFailed` | `repo_id`, `error_message`, `field` | Fired when validation fails for a CI definition |

### Funnel Metrics & Success Indicators

- **Adoption rate**: Percentage of active repositories with a `.codeplane/workspace.ts` file. Target: >20% of repos with >5 contributors within 6 months.
- **Preview adoption**: Percentage of repositories with landing requests that also have a `.codeplane/preview.ts` file.
- **CI adoption**: Percentage of repositories with workflow runs that also have a `.codeplane/ci.ts` file.
- **Validation failure rate**: Ratio of validation failures to successful validations, broken down by helper type. A decreasing rate over time indicates improving documentation and user understanding.
- **Field usage distribution**: Which fields of `WorkspaceConfig` are most commonly used (helps prioritize documentation and defaults).
- **Time-to-first-workspace-definition**: Median time from repository creation to first `.codeplane/workspace.ts` commit.
- **Convention file churn**: How often convention files are updated after initial commit (low churn = stable config, good UX).

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| Workspace definition loaded | `info` | `repo_id`, `tools`, `packages_count`, `persistence`, `idle_timeout` | Server reads and validates `.codeplane/workspace.ts` |
| Preview definition loaded | `info` | `repo_id`, `port`, `has_setup`, `services_count` | Server reads and validates `.codeplane/preview.ts` |
| CI definition loaded | `info` | `repo_id`, `stages_count`, `steps_count` | Server reads and validates `.codeplane/ci.ts` |
| Definition validation error | `warn` | `repo_id`, `definition_type`, `error_message`, `field` | Validation fails for any definition |
| Definition file not found | `debug` | `repo_id`, `file_path` | Convention file does not exist in repository |
| Definition file parse error | `error` | `repo_id`, `file_path`, `parse_error` | TypeScript/JavaScript parse error in convention file |
| WorkspaceHandle exec | `debug` | `workspace_id`, `command` (truncated to 200 chars), `exit_code`, `duration_ms` | `setup` function executes a command |
| WorkspaceHandle write | `debug` | `workspace_id`, `path`, `content_length` | `setup` function writes a file |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workspace_definition_loads_total` | Counter | `repo_id`, `status` (`success`/`error`) | Total workspace definition load attempts |
| `codeplane_preview_definition_loads_total` | Counter | `repo_id`, `status` (`success`/`error`) | Total preview definition load attempts |
| `codeplane_ci_definition_loads_total` | Counter | `repo_id`, `status` (`success`/`error`) | Total CI definition load attempts |
| `codeplane_definition_validation_errors_total` | Counter | `definition_type`, `error_type` | Total validation errors by type and error category |
| `codeplane_workspace_handle_exec_duration_seconds` | Histogram | `workspace_id` | Duration of WorkspaceHandle.exec calls during preview setup |
| `codeplane_workspace_handle_exec_exit_code` | Counter | `workspace_id`, `exit_code` | Exit codes from WorkspaceHandle.exec calls |

### Alerts and Runbooks

#### Alert: `HighDefinitionValidationFailureRate`
- **Condition**: `rate(codeplane_definition_validation_errors_total[5m]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Check structured logs for `definition_type` and `error_message` fields to identify the most common validation error.
  2. Determine if errors are concentrated in a single repository or spread across many.
  3. If concentrated: check if a recent commit introduced a malformed definition file. Notify the repository owner.
  4. If widespread: check if a recent package update changed validation behavior. Review recent changes to `packages/workflow/src/workspace.ts`.
  5. If caused by documentation gaps, escalate to product team for documentation improvements.

#### Alert: `WorkspaceHandleExecTimeout`
- **Condition**: `histogram_quantile(0.99, codeplane_workspace_handle_exec_duration_seconds) > 300`
- **Severity**: Warning
- **Runbook**:
  1. Check which preview `setup` functions are executing long-running commands.
  2. Review commands via structured logs (truncated to 200 chars).
  3. Identify if the workspace container is resource-constrained.
  4. If a single repository's setup is consistently slow, recommend optimizing the `setup` function or switching to `install` + `start`.
  5. Consider adding a configurable timeout to `WorkspaceHandle.exec` calls.

#### Alert: `DefinitionParseErrors`
- **Condition**: `increase(codeplane_workspace_definition_loads_total{status="error"}[1h]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check structured logs for `parse_error` details.
  2. Determine if errors are TypeScript syntax errors, import resolution failures, or runtime evaluation errors.
  3. If import resolution: verify the `@codeplane-ai/workflow` package version matches what the server expects.
  4. If syntax errors: the convention file was committed with invalid TypeScript. No server-side action needed.
  5. If runtime errors: investigate whether the definition file has side effects that fail in the server's evaluation context.

### Error Cases and Failure Modes

| Error Case | Behavior |
|---|---|
| Invalid tool name | `Error: Invalid tool name "...": must be alphanumeric (may include hyphens and underscores, must start with alphanumeric)` |
| Invalid package name | `Error: Invalid package name "...": must be a valid apt package name (lowercase alphanumeric, may include dots, plus, hyphens)` |
| Invalid port | `Error: Invalid port N for ...: must be an integer between 1 and 65535` |
| Invalid username | `Error: Invalid Linux username "...": must match [a-z_][a-z0-9_-]*[$]? and be at most 32 characters` |
| Invalid idle timeout | `Error: Invalid idleTimeout N: must be a non-negative integer (seconds)` |
| Invalid persistence | `Error: Invalid persistence "...": must be one of ephemeral, sticky, persistent` |
| Service with empty command | `Error: Service "..." must have a non-empty command` |
| Preview missing start and setup | `Error: Preview config must specify at least one of 'start' or 'setup'` |
| CI with no stages | `Error: CI config must define at least one stage` |
| Duplicate CI stage id | `Error: Duplicate CI stage id "..."` |
| Duplicate CI step id | `Error: Duplicate CI step id "..."` |
| CI step with invalid timeout | `Error: Invalid timeout N for step "...": must be a positive integer (seconds)` |

## Verification

### `defineWorkspace` Tests

- [ ] **Valid minimal config**: `defineWorkspace({})` returns `{ _type: "workspace", config: {} }`.
- [ ] **Valid full config**: All fields populated — returns definition with all values preserved.
- [ ] **Valid tool names**: `{ tools: { "bun": "latest", "node-18": "18.0.0", "go_lang": "1.21" } }` — no error.
- [ ] **Invalid tool name starting with hyphen**: `{ tools: { "-bad": "1.0" } }` — throws `Invalid tool name`.
- [ ] **Invalid tool name starting with underscore**: `{ tools: { "_bad": "1.0" } }` — throws `Invalid tool name`.
- [ ] **Invalid tool name with spaces**: `{ tools: { "my tool": "1.0" } }` — throws error.
- [ ] **Invalid tool name with special chars**: `{ tools: { "tool@2": "1.0" } }` — throws error.
- [ ] **Empty tools object**: `{ tools: {} }` — valid, no error.
- [ ] **Valid package names**: `{ packages: ["curl", "libssl1.1", "g++", "libc6-dev"] }` — all valid.
- [ ] **Invalid package name with uppercase**: `{ packages: ["Curl"] }` — throws `Invalid package name`.
- [ ] **Invalid package name starting with dot**: `{ packages: [".hidden"] }` — throws error.
- [ ] **Invalid package name with spaces**: `{ packages: ["my package"] }` — throws error.
- [ ] **Empty packages array**: `{ packages: [] }` — valid, no error.
- [ ] **Valid linux user**: `{ user: "developer" }` — valid.
- [ ] **Valid linux user with trailing dollar**: `{ user: "svc_user$" }` — valid.
- [ ] **Valid linux user at 32 chars**: `{ user: "a".repeat(32) }` — valid.
- [ ] **Invalid linux user at 33 chars**: `{ user: "a".repeat(33) }` — throws `Invalid Linux username`.
- [ ] **Invalid linux user starting with digit**: `{ user: "1user" }` — throws error.
- [ ] **Invalid linux user with uppercase**: `{ user: "Developer" }` — throws error.
- [ ] **Port 1 is valid**: `{ services: { "web": { command: "start", port: 1 } } }` — valid.
- [ ] **Port 65535 is valid**: `{ services: { "web": { command: "start", port: 65535 } } }` — valid.
- [ ] **Port 0 is rejected**: `{ services: { "web": { command: "start", port: 0 } } }` — throws port error.
- [ ] **Port 65536 is rejected**: `{ services: { "web": { command: "start", port: 65536 } } }` — throws port error.
- [ ] **Port -1 is rejected**: `{ services: { "web": { command: "start", port: -1 } } }` — throws error.
- [ ] **Non-integer port is rejected**: `{ services: { "web": { command: "start", port: 3000.5 } } }` — throws error.
- [ ] **Service with empty command**: `{ services: { "web": { command: "" } } }` — throws `must have a non-empty command`.
- [ ] **Service with whitespace-only command**: `{ services: { "web": { command: "   " } } }` — throws error.
- [ ] **Service with valid health check and ready signal**: valid, no error.
- [ ] **Persistence "ephemeral"**: valid.
- [ ] **Persistence "sticky"**: valid.
- [ ] **Persistence "persistent"**: valid.
- [ ] **Persistence "temporary"**: rejected.
- [ ] **Persistence empty string**: rejected.
- [ ] **idleTimeout 0**: valid.
- [ ] **idleTimeout 1800**: valid.
- [ ] **idleTimeout -1**: rejected.
- [ ] **idleTimeout 30.5**: rejected (not integer).
- [ ] **Return value has `_type: "workspace"`**: Verify discriminator.
- [ ] **Return value preserves config**: `result.config` matches input.

### `definePreview` Tests

- [ ] **Valid with start only**: `{ port: 3000, start: "npm start" }` — valid.
- [ ] **Valid with setup only**: `{ port: 3000, setup: async (ws) => {} }` — valid.
- [ ] **Valid with both start and setup**: valid.
- [ ] **Invalid with neither start nor setup**: `{ port: 3000 }` — throws `at least one of 'start' or 'setup'`.
- [ ] **Port validation applies**: `{ port: 0, start: "start" }` — throws port error.
- [ ] **Port 65535 is valid**: valid.
- [ ] **Valid with install**: valid.
- [ ] **Valid with env**: valid.
- [ ] **Valid with services**: valid.
- [ ] **Service validation applies in preview**: `{ port: 3000, start: "start", services: { db: { command: "" } } }` — throws service error.
- [ ] **Return value has `_type: "preview"`**: Verify discriminator.

### `defineCI` Tests

- [ ] **Valid minimal CI**: single stage, single step — valid.
- [ ] **Valid full CI**: all fields populated — valid.
- [ ] **Empty stages array rejected**: `{ stages: [] }` — throws error.
- [ ] **Stage with empty id rejected**: throws error.
- [ ] **Duplicate stage ids rejected**: throws `Duplicate CI stage id`.
- [ ] **Stage with empty steps rejected**: throws error.
- [ ] **Step with empty id rejected**: throws error.
- [ ] **Duplicate step ids across stages rejected**: throws `Duplicate CI step id`.
- [ ] **Step with empty command rejected**: throws error.
- [ ] **Step with whitespace-only command rejected**: throws error.
- [ ] **Step timeout 1 is valid**: valid.
- [ ] **Step timeout 0 is rejected**: throws error.
- [ ] **Step timeout -1 is rejected**: throws error.
- [ ] **Step timeout 1.5 is rejected**: throws error (not integer).
- [ ] **Tool name validation applies to CI**: throws tool name error.
- [ ] **Package name validation applies to CI**: throws package error.
- [ ] **Return value has `_type: "ci"`**: Verify discriminator.
- [ ] **Maximum valid input — 50 stages × 20 steps (1000 steps)**: All unique IDs, validates successfully without timeout.
- [ ] **Step with `continueOnFail: true`**: preserved in output.
- [ ] **Step with `workdir`**: preserved in output.

### `WorkspaceHandle` Interface Tests

- [ ] **Preview setup function receives workspace handle**: Mock `WorkspaceHandle`, verify `exec`, `writeFile`, `readFile` are callable.
- [ ] **WorkspaceHandle.exec returns structured result**: `{ exitCode, stdout, stderr }`.

### Integration / E2E Tests

- [ ] **Package import test**: `import { defineWorkspace, definePreview, defineCI } from "@codeplane-ai/workflow"` resolves.
- [ ] **All types are importable**: All 10 exported types resolve.
- [ ] **Convention file evaluation (workspace)**: Create temp `.codeplane/workspace.ts`, import, verify `_type: "workspace"`.
- [ ] **Convention file evaluation (preview)**: Create temp `.codeplane/preview.ts`, import, verify `_type: "preview"`.
- [ ] **Convention file evaluation (CI)**: Create temp `.codeplane/ci.ts`, import, verify `_type: "ci"`.
- [ ] **createSmithers integration**: `createSmithers` exposes `cache` and `artifacts` in context. Workflow using workspace helpers builds without error.
- [ ] **Maximum valid input sizes**: `WorkspaceConfig` with 100 tools, 200 packages, 50 services, 100 env vars, 32-char username, `idleTimeout: Number.MAX_SAFE_INTEGER` — validates successfully.
- [ ] **Input exceeding maximum username length (33 chars)**: Predictably errors with username validation message.
- [ ] **Large CI definition**: 100 stages with 50 steps each (5000 total steps), all unique IDs — validates successfully.
