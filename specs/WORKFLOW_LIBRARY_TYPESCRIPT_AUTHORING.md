# WORKFLOW_LIBRARY_TYPESCRIPT_AUTHORING

Specification for WORKFLOW_LIBRARY_TYPESCRIPT_AUTHORING.

## High-Level User POV

When a Codeplane user wants to automate their repository — running tests on every push, triaging issues with an AI agent, deploying to staging when a landing request is approved, or scanning for vulnerabilities on a schedule — they write their workflows in TypeScript. Instead of learning a custom YAML configuration language with limited expressiveness, they author `.tsx` files inside the `.codeplane/workflows/` directory of their repository using the `@codeplane-ai/workflow` package. This package gives them a familiar, strongly typed authoring experience with full IDE support: autocompletion, type checking, go-to-definition, and inline documentation.

A workflow file is a TypeScript module that default-exports a function. That function receives a context object and returns a JSX tree of `<Workflow>` and `<Task>` components. Each `<Workflow>` declares its name and the events that should trigger it — pushes to certain bookmarks, landing request lifecycle events, issue activity, cron schedules, manual dispatch with typed inputs, or the completion of another workflow. Each `<Task>` is an executable unit of work: either a shell command via Bun's `$` tagged template, or an AI agent prompt passed via the `agent` prop. Tasks run sequentially by default but can be grouped with `<Parallel>`, `<Sequence>`, and `<Branch>` composition primitives for more complex orchestration.

For workflows that need structured data passing between tasks — particularly AI agent workflows where one step's analysis feeds into another step's action — users call `createSmithers()` with Zod schemas to get type-safe output persistence and retrieval. The `ctx.output()` function lets any task read validated, typed results from a previous task, backed by automatic SQLite persistence. This makes multi-step agent pipelines as type-safe and debuggable as any other TypeScript code.

The authoring experience is designed to be zero-configuration. Users add a `package.json` and `tsconfig.json` to their `.codeplane/` directory, install `@codeplane-ai/workflow`, and start writing workflows. The package re-exports everything they need: JSX components, trigger builders via the `on` namespace, artifact upload/download helpers, cache save/restore descriptors, and workspace/preview/CI definition functions. Because workflows are plain TypeScript, users can import any npm package, share utilities across workflow files, and test their workflow logic with standard testing tools before pushing.

This approach means workflows aren't a second-class configuration surface — they are real code that benefits from the entire TypeScript ecosystem. A user who knows TypeScript already knows how to write Codeplane workflows. The type system catches misconfigured triggers, malformed cache keys, and schema mismatches at author time rather than at run time. And because the same `@codeplane-ai/workflow` package powers both self-hosted Community Edition and cloud Codeplane, workflow definitions are portable across deployment modes.

## Acceptance Criteria

### Definition of Done

- [ ] The `@codeplane-ai/workflow` package (`packages/workflow`) is published as a Bun workspace package importable as `@codeplane-ai/workflow` from any `.codeplane/` workspace directory.
- [ ] The package exports `Workflow` and `Task` JSX components that accept Codeplane-specific props (`triggers`, `if`, `cache`, `agent`, `skipIf`, `needsApproval`, `timeoutMs`, `retries`, `continueOnFail`, `label`, `meta`).
- [ ] The package exports `Sequence`, `Parallel`, `Branch`, and `Ralph` composition primitives re-exported from `smithers-orchestrator`.
- [ ] The package exports the `on` trigger builder namespace with sub-builders for `push`, `landingRequest`, `release`, `issue`, `issueComment`, `schedule`, `manualDispatch`, `webhook`, `workflowRun`, and `workflowArtifact`.
- [ ] The package exports `createSmithers` for schema-driven workflows with Zod-typed output persistence and a `smithers()` wrapper that injects `artifacts` and `cache` helpers into the build context.
- [ ] The package exports `createWorkflowArtifactHelpers` and related types for artifact upload/download within running workflows.
- [ ] The package exports `createWorkflowCacheHelpers` and related types for cache save/restore descriptor generation.
- [ ] The package exports `defineWorkspace`, `definePreview`, and `defineCI` configuration-definition functions for `.codeplane/workspace.ts`, `.codeplane/preview.ts`, and `.codeplane/ci.ts` files.
- [ ] Workflow files authored with this package are discovered by the workflow engine from `.codeplane/workflows/*.tsx`.
- [ ] All exported types provide full IntelliSense and go-to-definition in VS Code, Neovim (via LSP), and other TypeScript-aware editors when the `.codeplane/tsconfig.json` is configured.
- [ ] The "Your First Workflow" documentation page accurately describes the full authoring setup, all component props, all trigger builders, schema-driven workflows, manual dispatch inputs, scheduled triggers, and agent task steps.

### Boundary Constraints

- [ ] Workflow file names must match `[a-zA-Z0-9][a-zA-Z0-9_-]*\.tsx`. Maximum file name length (excluding extension): 128 characters.
- [ ] `<Workflow>` `name` prop: non-empty, 1–200 characters, printable UTF-8, no control characters.
- [ ] `<Task>` `id` prop: non-empty, 1–200 characters, matching `[a-zA-Z0-9][a-zA-Z0-9_-]*`. Must be unique within a `<Workflow>`.
- [ ] `<Task>` `output` string must reference a declared `createSmithers` schema key; undeclared key causes TypeScript compile error.
- [ ] `<Task>` `label`: optional, max 500 characters, printable UTF-8.
- [ ] `<Task>` `timeoutMs`: positive integer, 1,000–14,400,000. Default: 300,000 (script), 1,800,000 (agent).
- [ ] `<Task>` `retries`: non-negative integer, 0–10. Default: 0.
- [ ] `<Task>` `if`: non-empty string or omitted; empty string treated as omitted. Max 1,000 characters.
- [ ] `<Task>` `meta`: JSON-serializable, max 64 KB serialized.
- [ ] `on.push` `bookmarks`/`tags`: max 50 entries, each max 256 characters. `ignore`: max 100 entries.
- [ ] `on.schedule` `cron`: valid 5-field cron, max 128 characters.
- [ ] `on.manualDispatch` `inputs`: max 50 inputs; keys 1–128 chars matching `[a-zA-Z_][a-zA-Z0-9_]*`; `description` max 500 chars; `choice` options 1–50 entries, each 1–256 chars.
- [ ] Cache keys: non-empty after trim, max 256 characters. `hash_files`/`paths`: max 100 entries, each max 1,024 characters.
- [ ] Artifact names: 1–256 characters, no `/`, `\`, or null bytes.
- [ ] `defineWorkspace` `tools`: max 50 entries, names match `[a-zA-Z0-9][a-zA-Z0-9_-]*`. `packages`: max 200 entries, valid apt names. `user`: valid Linux username, max 32 chars. `idleTimeout`: non-negative integer. `persistence`: `"ephemeral"` | `"sticky"` | `"persistent"`.
- [ ] `definePreview` `port`: integer 1–65535. Must specify `start` or `setup`.
- [ ] `defineCI`: at least one stage; each stage has non-empty unique `id` and at least one step; step `id` globally unique; step `command` non-empty; step `timeout` positive integer.

### Edge Cases

- [ ] Workflow file that fails TypeScript compilation is reported as a definition error, not silently ignored.
- [ ] Workflow file without default export produces a clear parse error.
- [ ] Named exports alongside default export are valid — only default export is used.
- [ ] `createSmithers({})` (empty schemas) returns usable API; `ctx.output()` rejects all keys at type level.
- [ ] `on.push()` with no args matches all push events.
- [ ] `on.manualDispatch()` with no args allows dispatch with no inputs.
- [ ] Cache helpers trim whitespace and filter empty strings.
- [ ] Artifact helpers throw clear error outside runner context.
- [ ] `<Task if="">` is treated as no condition.
- [ ] Empty workspace config `defineWorkspace({})` is valid.
- [ ] Duplicate CI step IDs across stages are rejected with clear error.
- [ ] Invalid tool names, ports, usernames throw validation errors with descriptive messages.

## Design

### Package Structure and Exports

The `@codeplane-ai/workflow` package is located at `packages/workflow/` in the monorepo. It is published as `@codeplane-ai/workflow` version `0.0.1`. Entry point: `src/index.ts`.

**Top-level exports:** `Workflow`, `Task` (components); `Sequence`, `Parallel`, `Branch`, `Ralph` (composition); `on` (triggers); `createSmithers`, `runWorkflow` (schema-driven); `createWorkflowArtifactHelpers`, `createWorkflowCacheHelpers` (helpers); `defineWorkspace`, `definePreview`, `defineCI` (config definitions).

**Type exports:** `WorkflowProps`, `TaskProps`, `TriggerDescriptor`, `CodeplaneWorkflowCtx`, `CreateCodeplaneSmithersApi`, `SmithersCtx`, `SmithersWorkflow`, `SmithersWorkflowOptions`, `OutputKey`, `OutputAccessor`, `InferOutputEntry`, `WorkflowArtifactClient`, `WorkflowArtifactRecord`, `WorkflowArtifactUploadOptions`, `WorkflowCacheDescriptor`, `WorkflowCacheHelpers`, `WorkflowCacheRestoreDescriptor`, `WorkflowCacheSaveDescriptor`, `WorkspaceConfig`, `WorkspaceDefinition`, `PreviewConfig`, `PreviewDefinition`, `ServiceConfig`, `WorkspaceHandle`, `CIConfig`, `CIDefinition`, `CIStepConfig`, `CIGroupConfig`.

### Workflow Component API

`<Workflow>` props: `name` (string, required), `triggers` (TriggerDescriptor[], optional), `cache` (boolean, optional), `children` (ReactNode, optional).

`<Task>` props: `id` (string, required), `output` (ZodObject|string, optional), `agent` (Agent, optional), `skipIf` (boolean), `needsApproval` (boolean), `timeoutMs` (number), `retries` (number), `continueOnFail` (boolean), `label` (string), `meta` (Record<string,unknown>), `if` (string), `cache` (WorkflowCacheDescriptor|WorkflowCacheDescriptor[]), `children` (any, required — async function or prompt string).

### Trigger Builder API (`on` namespace)

`on.push(options?)` — push events filtered by bookmarks/tags/ignore globs.
`on.landingRequest` — `.opened()`, `.closed()`, `.synchronize()`, `.readyToLand()`, `.landed()`.
`on.release` — `.published(opts?)`, `.updated(opts?)`, `.deleted(opts?)`, `.released(opts?)`, `.prereleased(opts?)` — each optionally filtered by tags.
`on.issue` — `.opened()`, `.closed()`, `.edited()`, `.reopened()`, `.labeled()`, `.assigned()`, `.commented()`.
`on.issueComment` — `.created()`, `.edited()`, `.deleted()`.
`on.schedule(cron)` — 5-field cron, UTC.
`on.manualDispatch(inputs?)` — typed inputs: string, boolean, number, choice.
`on.webhook(event)` — arbitrary webhook event name.
`on.workflowRun({ workflows, types? })` — chain on other workflow completions.
`on.workflowArtifact({ workflows?, names? })` — trigger on artifact creation.

### Schema-Driven Workflow API (`createSmithers`)

`createSmithers(schemas, opts?)` — accepts Zod schema record, returns `{ Workflow, Task, smithers, ...base }`. The `smithers(build, opts?)` wrapper injects `ctx.artifacts` (WorkflowArtifactClient), `ctx.cache` (WorkflowCacheHelpers), and `ctx.output(key, { nodeId })` (type-safe output reader).

### Repository Setup

`.codeplane/package.json` — `{ "dependencies": { "@codeplane-ai/workflow": "workspace:*" } }`.
`.codeplane/tsconfig.json` — JSX with `smithers-orchestrator` import source, paths mapping to workflow package.
Workflow files at `.codeplane/workflows/<name>.tsx`.

### CLI Commands

`codeplane workflow init` — scaffold `.codeplane/` directory.
`codeplane workflow list` — list discovered definitions.
`codeplane workflow validate` — validate all definitions.
`codeplane workflow run <name> [--ref <ref>] [--input key=value]...` — dispatch.

### Web UI Design

Workflow list page (`/:owner/:repo/workflows`): workflow name, file path, trigger badges, last run status, "Run workflow" button for manual dispatch workflows. Definition detail: trigger config, input schema, "View Source" link.

### TUI UI

Workflow screen: list with name, trigger summary, last run status. Dispatch action for manual workflows.

### Documentation

1. "Your First Workflow" guide — setup, components, triggers, shell tasks, CLI commands.
2. "Manual Dispatch with Inputs" — `on.manualDispatch`, typed inputs, CLI `--input`, API endpoint, `ctx.input`.
3. "Scheduled Triggers" — `on.schedule`, cron reference, UTC, multiple schedules.
4. "AI Agent Steps" — `agent` prop, `ToolLoopAgent`, secret configuration.
5. "Schema-Driven Workflows" — `createSmithers`, Zod, `ctx.output()`, multi-step pipelines.
6. "Trigger Reference" — complete reference for every `on.*` builder.
7. "Workspace & Preview Configuration" — `defineWorkspace`, `definePreview`, `defineCI`.
8. API Reference — TSDoc for all exports.

## Permissions & Security

### Authorization

| Action | Owner | Admin | Member (Write) | Member (Read) | Anonymous |
|--------|-------|-------|----------------|---------------|----------|
| View workflow definitions | ✅ | ✅ | ✅ | ✅ | ✅ (public repos) |
| View workflow source files | ✅ | ✅ | ✅ | ✅ | ✅ (public repos) |
| Dispatch a workflow manually | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit workflow files (push) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Configure repository secrets | ✅ | ✅ | ❌ | ❌ | ❌ |

Workflow definitions are code in the repository and follow repository access permissions for read. Manual dispatch requires at least write access. Secret configuration (needed for agent API keys) requires admin or owner role.

### Rate Limiting

| Action | Limit |
|--------|-------|
| Workflow dispatch (manual) | 20/hour/user/repo |
| Workflow dispatch (API) | 60/hour/PAT/repo |
| Workflow definition list/view | 300/minute/user |
| Workflow validation | 30/minute/user/repo |

### Data Privacy

- Workflow files may reference secret names but must never contain secret values inline. Documentation must warn against hardcoding credentials.
- Manual dispatch input values are stored in the workflow run record and visible to anyone with read access to workflow runs. Users must be warned not to pass sensitive values as inputs.
- Agent API keys must be configured as repository secrets, not workflow file literals.
- The `@codeplane-ai/workflow` package does not transmit telemetry, phone home, or collect PII.

## Telemetry & Product Analytics

### Business Events

| Event | Properties |
|-------|------------|
| `WorkflowDefinitionDiscovered` | `repo_id`, `workflow_name`, `file_path`, `trigger_types[]`, `has_agent_tasks`, `has_schema`, `task_count` |
| `WorkflowDefinitionValidationFailed` | `repo_id`, `file_path`, `error_type`, `error_message` |
| `WorkflowDispatched` | `repo_id`, `workflow_name`, `trigger_type`, `has_inputs`, `input_count`, `user_id` (if manual) |
| `WorkflowSchemaCreated` | `repo_id`, `workflow_name`, `schema_count`, `schema_names[]` |
| `WorkflowWorkspaceDefinitionCreated` | `repo_id`, `tools_count`, `packages_count`, `has_services`, `persistence_mode` |
| `WorkflowPreviewDefinitionCreated` | `repo_id`, `port`, `has_setup_function`, `has_services` |
| `WorkflowCIDefinitionCreated` | `repo_id`, `stage_count`, `total_step_count` |
| `WorkflowPackageInstalled` | `repo_id`, `package_version` |
| `WorkflowInitScaffolded` | `repo_id`, `user_id` |

### Funnel Metrics

| Metric | Target |
|--------|--------|
| Adoption rate (% repos with workflows) | Increasing MoM |
| Activation rate (init → first run in 7d) | > 60% |
| Schema adoption (`createSmithers` usage) | Track for growth |
| Agent task adoption | Track for growth |
| Trigger diversity (avg distinct trigger types/repo) | Track for breadth |
| Definition error rate | < 5% |
| Mean time to first run | < 30 minutes |

## Observability

### Logging

| Log Event | Level | Context |
|-----------|-------|--------|
| Workflow definition discovered | `info` | `repo_id`, `workflow_name`, `file_path`, `trigger_count`, `task_count` |
| Workflow definition parse error | `warn` | `repo_id`, `file_path`, `error_type`, `error_message`, `line_number` |
| Workflow definition compile error | `warn` | `repo_id`, `file_path`, `error_type`, `error_message`, `tsc_diagnostics[]` |
| Workflow definition validation passed | `debug` | `repo_id`, `file_path`, `duration_ms` |
| Trigger descriptor built | `debug` | `trigger_type`, `config_summary` |
| `createSmithers` invoked | `debug` | `schema_names[]`, `db_path` |
| `defineWorkspace` validation error | `warn` | `repo_id`, `field`, `value`, `error_message` |
| `definePreview` validation error | `warn` | `repo_id`, `field`, `value`, `error_message` |
| `defineCI` validation error | `warn` | `repo_id`, `field`, `value`, `error_message` |
| Artifact helper called without runtime client | `error` | `method`, `workflow_run_id` |
| Cache descriptor generated | `debug` | `action`, `key`, `hash_files_count` or `paths_count` |

### Prometheus Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `codeplane_workflow_definitions_discovered_total` | Counter | `repo_id`, `status` |
| `codeplane_workflow_definitions_active` | Gauge | `repo_id` |
| `codeplane_workflow_definition_parse_duration_seconds` | Histogram | `repo_id` |
| `codeplane_workflow_triggers_configured_total` | Counter | `trigger_type` |
| `codeplane_workflow_schema_definitions_total` | Counter | `repo_id` |
| `codeplane_workflow_workspace_definitions_total` | Counter | `repo_id` |
| `codeplane_workflow_preview_definitions_total` | Counter | `repo_id` |
| `codeplane_workflow_ci_definitions_total` | Counter | `repo_id` |
| `codeplane_workflow_definition_validation_errors_total` | Counter | `repo_id`, `error_type` |
| `codeplane_workflow_artifact_helper_errors_total` | Counter | `method` |

### Alerts

**`WorkflowDefinitionParseErrorRateHigh`** — Condition: `rate(codeplane_workflow_definition_validation_errors_total[5m]) > 0.5`. Severity: Warning. Runbook: (1) Check error_type breakdown to identify compilation vs validation failures. (2) Query logs for affected repos/files. (3) If concentrated in few repos, likely user bugs — improve error messages. (4) If widespread after upgrade, check for breaking changes in `@codeplane-ai/workflow` or `smithers-orchestrator`; roll back if needed. (5) If in defineWorkspace/definePreview/defineCI, check for tightened validation constraints.

**`WorkflowDefinitionDiscoveryStalled`** — Condition: `increase(codeplane_workflow_definitions_discovered_total[30m]) == 0` while `codeplane_workflow_definitions_active > 0`. Severity: Critical. Runbook: (1) Check discovery service/job health. (2) Verify DB connectivity. (3) Check repo-host/jj bridge for file tree errors. (4) Inspect recent deploys for discovery path changes. (5) Restart discovery scheduler if hung.

**`WorkflowArtifactHelperErrorSpike`** — Condition: `rate(codeplane_workflow_artifact_helper_errors_total[5m]) > 0.1`. Severity: Warning. Runbook: (1) Indicates runner failed to inject artifact client. (2) Check runner bootstrap logs. (3) Verify blob store accessibility. (4) Check for deployment changes to artifact client injection.

### Error Cases

| Error | Cause | Behavior |
|-------|-------|----------|
| TypeScript compilation failure | Syntax/type errors in .tsx | Definition error at discovery |
| Missing default export | No export default | Parse error with clear message |
| Invalid trigger descriptor | Malformed trigger | Runtime render error in run logs |
| Schema key mismatch | output="nonexistent" | TypeScript compile-time error |
| Duplicate task IDs | Two Tasks with same id | Runtime render error at parse time |
| Artifact client unavailable | Upload/download outside runner | Throws descriptive error |
| Validation constraint violated | Invalid port/username/etc. | Synchronous throw with message |
| Circular workflow triggers | A triggers B triggers A | Detected by trigger engine (documented concern) |

## Verification

### Package Export Tests

- [ ] test: index.ts exports all documented components — import all exports and verify each is defined and correct type.
- [ ] test: index.ts exports all documented types — compile-time type import test.

### Workflow Component Tests

- [ ] test: Workflow accepts name and triggers — verify props propagate.
- [ ] test: Workflow accepts children — verify children present.
- [ ] test: Workflow name at max length (200 chars) — no error.
- [ ] test: Task requires id (TypeScript type test).
- [ ] test: Task id at max length (200 chars) — no error.
- [ ] test: Task with all optional props — verify propagation.
- [ ] test: Task with empty if is treated as absent.
- [ ] test: Task with cache array — single and array both work.

### Trigger Builder Tests

- [ ] test: on.push with no arguments returns `{ _type: "push" }`.
- [ ] test: on.push with bookmarks, tags, ignore — fields propagate.
- [ ] test: on.landingRequest all 5 events — correct descriptors.
- [ ] test: on.release all 5 events — correct descriptors.
- [ ] test: on.release with tags option — tags included.
- [ ] test: on.issue all 7 events.
- [ ] test: on.issueComment all 3 events.
- [ ] test: on.schedule with valid cron.
- [ ] test: on.manualDispatch with no inputs.
- [ ] test: on.manualDispatch with typed inputs.
- [ ] test: on.webhook.
- [ ] test: on.workflowRun.
- [ ] test: on.workflowArtifact.
- [ ] test: on.workflowArtifact with no arguments.
- [ ] test: all trigger descriptors are JSON-serializable.

### createSmithers Tests

- [ ] test: returns Workflow, Task, and smithers.
- [ ] test: smithers injects artifacts and cache helpers.
- [ ] test: cache.restore trims keys and filters empty hash_files.
- [ ] test: cache.save trims keys and filters empty paths.
- [ ] test: createSmithers with empty schema object.
- [ ] test: createSmithers passes options to underlying Smithers.

### Artifact Helper Tests

- [ ] test: upload delegates to runtime client.
- [ ] test: download delegates to runtime client.
- [ ] test: upload fails without runtime client.
- [ ] test: download fails without runtime client.
- [ ] test: client set/get round-trip.

### Cache Helper Tests

- [ ] test: restore with string hashFiles normalizes to array.
- [ ] test: restore with array hashFiles — trim and passthrough.
- [ ] test: restore with no hashFiles — empty array.
- [ ] test: save with string path — normalizes.
- [ ] test: save with array paths — trim and filter.
- [ ] test: key trimming.
- [ ] test: empty string filtering.

### defineWorkspace Tests

- [ ] test: minimal config `defineWorkspace({})` — valid.
- [ ] test: full config — all fields populated.
- [ ] test: rejects invalid tool name (leading hyphen).
- [ ] test: rejects invalid tool name (special characters).
- [ ] test: accepts valid tool names.
- [ ] test: rejects invalid apt package name.
- [ ] test: rejects invalid user.
- [ ] test: rejects user exceeding 32 chars.
- [ ] test: rejects negative idleTimeout.
- [ ] test: rejects non-integer idleTimeout.
- [ ] test: rejects invalid persistence value.
- [ ] test: accepts all valid persistence values.
- [ ] test: rejects service with empty command.
- [ ] test: rejects service with invalid port (0).
- [ ] test: rejects service with invalid port (70000).
- [ ] test: 50 tools (maximum) — no error.
- [ ] test: 200 packages (maximum) — no error.

### definePreview Tests

- [ ] test: with start command — valid.
- [ ] test: with setup function — valid.
- [ ] test: rejects missing start and setup.
- [ ] test: rejects port 0.
- [ ] test: rejects port 70000.
- [ ] test: accepts port 1.
- [ ] test: accepts port 65535.
- [ ] test: with services — validation runs.

### defineCI Tests

- [ ] test: valid single-stage pipeline.
- [ ] test: multiple stages.
- [ ] test: rejects empty stages array.
- [ ] test: rejects stage with no steps.
- [ ] test: rejects stage with empty id.
- [ ] test: rejects duplicate stage ids.
- [ ] test: rejects duplicate step ids across stages.
- [ ] test: rejects step with empty id.
- [ ] test: rejects step with empty command.
- [ ] test: rejects step with timeout 0.
- [ ] test: rejects step with negative timeout.
- [ ] test: accepts step with timeout 1.
- [ ] test: rejects invalid tool names.
- [ ] test: rejects invalid package names.

### E2E: API Tests

- [ ] e2e/api: repo with valid workflow is discovered.
- [ ] e2e/api: repo with invalid workflow shows discovery error.
- [ ] e2e/api: manual dispatch workflow can be triggered.
- [ ] e2e/api: dispatch with missing required input returns 400.
- [ ] e2e/api: dispatch with invalid choice input returns 400.
- [ ] e2e/api: dispatch by anonymous returns 401.
- [ ] e2e/api: dispatch by read-only user returns 403.

### E2E: CLI Tests

- [ ] e2e/cli: `codeplane workflow list` shows discovered workflows.
- [ ] e2e/cli: `codeplane workflow run <name>` dispatches and returns run ID.
- [ ] e2e/cli: `codeplane workflow run <name> --input key=value` passes inputs.
- [ ] e2e/cli: `codeplane workflow run` with missing required input shows error.
- [ ] e2e/cli: `codeplane workflow validate` with valid workflows succeeds.
- [ ] e2e/cli: `codeplane workflow validate` with invalid workflow shows errors.

### E2E: Playwright UI Tests

- [ ] e2e/ui: workflow list page shows discovered workflows.
- [ ] e2e/ui: "Run workflow" button visible for manual dispatch workflows.
- [ ] e2e/ui: manual dispatch dialog accepts inputs and triggers run.
- [ ] e2e/ui: definition detail shows trigger configuration.
- [ ] e2e/ui: definition detail links to source file.

### E2E: Roundtrip Tests

- [ ] e2e/roundtrip: push workflow → discovery → dispatch → run completes successfully.
- [ ] e2e/roundtrip: schema-driven workflow passes data between tasks.
- [ ] e2e/roundtrip: workflow with cache descriptors includes cache config in run.
- [ ] e2e/roundtrip: workflow with multiple trigger types is triggered by push.
