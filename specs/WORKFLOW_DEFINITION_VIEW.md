# WORKFLOW_DEFINITION_VIEW

Specification for WORKFLOW_DEFINITION_VIEW.

## High-Level User POV

When a developer wants to understand what a workflow does before running it — what triggers it, which jobs it contains, what steps each job executes, what inputs it accepts for manual dispatch, and how jobs depend on each other — they need a dedicated view of the workflow definition. Today, Codeplane lets users list workflow definitions and run them, but there is no way to inspect the actual content of a workflow definition across any client surface. The Workflow Definition View fills this gap.

From the web, TUI, or CLI, a user selects a specific workflow definition and is presented with a structured, human-readable rendering of its configuration. They see the workflow's name, file path, active/inactive status, and timestamps at the top. Below that, the trigger section shows exactly which events will cause this workflow to fire — push events with branch/bookmark filters, issue events, landing request events, scheduled cron expressions, manual dispatch with its input schema, or chained workflow-run and workflow-artifact triggers. The jobs section presents each job as a named block showing its runner environment, conditional execution rules, dependency relationships to other jobs, cache descriptors, and an ordered list of steps. Each step shows its type (script, action, or agent task) and its configuration. If the workflow supports manual dispatch, the input schema is rendered with field names, types, default values, and descriptions, giving the user everything they need to understand what values to provide when triggering the workflow.

The view also shows a visual dependency graph of jobs when there are inter-job dependencies, making it easy to understand execution order and parallelism. For users who prefer raw access, a "View source" toggle reveals the underlying JSON configuration object.

This feature is valuable because it gives developers confidence about what a workflow will do before they dispatch it, helps onboard new team members to a repository's CI/CD pipeline, and provides a reference surface for debugging failed runs by comparing the definition against run outcomes.

## Acceptance Criteria

### Definition of Done

- [ ] A user can view a single workflow definition's full configuration from the API, CLI, TUI, and web surfaces
- [ ] The response includes: id, name, path, config (parsed), is_active, created_at, updated_at
- [ ] The config object is rendered as structured, human-readable sections rather than raw JSON by default
- [ ] A "raw" or "source" toggle/flag is available to display the raw JSON config
- [ ] The view is reachable by workflow definition ID (numeric) across all surfaces
- [ ] Inactive workflow definitions are viewable with a clear visual indicator of their inactive status

### Trigger Display

- [ ] Push triggers display branch/bookmark filter patterns and tag patterns
- [ ] Push triggers display branches-ignore patterns when present
- [ ] Issue triggers display event types (opened, closed, etc.)
- [ ] Issue comment triggers display event types
- [ ] Landing request triggers display event types
- [ ] Release triggers display event types and tag filters
- [ ] Schedule triggers display each cron expression with a human-readable description (e.g., "Every day at midnight UTC")
- [ ] Workflow run triggers display source workflow name filters and event types
- [ ] Workflow artifact triggers display source workflow and artifact name filters
- [ ] Manual dispatch triggers display the full input schema with field names, types, defaults, and descriptions
- [ ] When multiple trigger types are configured, all are displayed
- [ ] When no triggers are configured, a "No triggers configured" message is shown

### Job Display

- [ ] Each job is displayed with its name as a heading
- [ ] The `runs-on` environment is shown for each job
- [ ] The `if` condition is shown when present, with syntax-highlighted expression
- [ ] Job dependencies (`needs`) are shown as a list of referenced job names
- [ ] Cache descriptors are shown with action, key, hash_files, and paths
- [ ] Steps are displayed in order with position numbers
- [ ] Script steps show the `run` command content
- [ ] Action steps show the `uses` reference
- [ ] Agent task steps show the agent configuration
- [ ] Step names are displayed when present; unnamed steps show a type-derived label ("Run script", "Use action", "Agent task")
- [ ] When no jobs are configured, a "No jobs configured" message is shown

### Dependency Graph

- [ ] When jobs have `needs` dependencies, a visual dependency graph is rendered
- [ ] The graph shows job names as nodes and dependency edges
- [ ] Jobs with no dependencies are shown as root nodes
- [ ] The graph degrades gracefully to a text list when visual rendering is unavailable (CLI, small terminals)

### Input Schema Display

- [ ] Manual dispatch input fields show: field name, type (string, boolean, choice), default value, and description
- [ ] Choice-type inputs show available options
- [ ] Required vs. optional inputs are distinguished
- [ ] When no inputs are defined for a dispatchable workflow, "No inputs required" is shown

### Boundary Constraints

- [ ] Workflow definition ID must be a positive integer; non-numeric or negative IDs return a 400 error
- [ ] Workflow names may contain alphanumeric characters, hyphens, underscores, and periods; max 255 characters
- [ ] File paths are displayed as-is from the database; max 1024 characters with left-truncation in constrained displays
- [ ] Config JSON objects up to 1MB are supported for display
- [ ] Config objects larger than 1MB return a warning and offer raw-only display
- [ ] Script `run` content in steps is truncated at 500 lines in formatted view with a "Show full script" expansion
- [ ] Cron expressions are validated for display; malformed crons show the raw expression with a warning icon

### Edge Cases

- [ ] Workflow definition not found (deleted or wrong repo) returns 404 with a clear message
- [ ] Workflow definition with null/empty config displays "No configuration available"
- [ ] Workflow definition with malformed config JSON displays a parse error message and offers raw view
- [ ] Workflow definition with config but no `on` key displays "No triggers configured" in the trigger section
- [ ] Workflow definition with config but no `jobs` key displays "No jobs configured" in the jobs section
- [ ] Job with empty steps array displays "No steps defined"
- [ ] Job with circular `needs` references displays a cycle detection warning
- [ ] Concurrent definition update while viewing does not crash; stale data is acceptable with a refresh option
- [ ] Unicode and emoji in workflow names, step names, and script content render correctly
- [ ] Extremely deep job dependency chains (20+ levels) render without performance degradation
- [ ] Workflow with 50+ jobs renders with pagination or collapsible sections

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/workflows/:id`

This endpoint already exists and returns the workflow definition including the `config` field. No new endpoints are required for the core view. The existing response shape is:

```json
{
  "id": 42,
  "repository_id": 7,
  "name": "ci",
  "path": ".codeplane/workflows/ci.ts",
  "config": {
    "on": {
      "push": { "branches": ["main"], "bookmarks": ["release/*"] },
      "workflow_dispatch": {
        "inputs": {
          "environment": {
            "type": "choice",
            "options": ["staging", "production"],
            "default": "staging",
            "description": "Target environment"
          }
        }
      }
    },
    "jobs": {
      "build": {
        "name": "Build",
        "runs-on": "ubuntu-latest",
        "steps": [
          { "name": "Checkout", "uses": "checkout@v1" },
          { "name": "Build", "run": "bun run build" }
        ]
      },
      "test": {
        "name": "Test",
        "runs-on": "ubuntu-latest",
        "needs": ["build"],
        "steps": [
          { "name": "Run tests", "run": "bun test" }
        ]
      }
    }
  },
  "is_active": true,
  "created_at": "2026-01-15T10:30:00Z",
  "updated_at": "2026-03-10T14:22:00Z"
}
```

Error responses:

- `400 Bad Request`: `{ "message": "invalid workflow id" }` — when ID is non-numeric or negative
- `404 Not Found`: `{ "message": "workflow definition not found" }` — when ID does not exist in the repository

### CLI Command

**New command:** `workflow view <id>`

```
codeplane workflow view <id> [--repo OWNER/REPO] [--raw] [--json]
```

**Arguments:**
- `id` (required, positive integer): The workflow definition ID

**Options:**
- `--repo OWNER/REPO`: Target repository (defaults to current repo context via jj/git remote detection)
- `--raw`: Display raw JSON config instead of formatted output
- `--json`: Output full API response as JSON (for scripting)

**Formatted output example (default):**

```
Workflow: ci
Path:    .codeplane/workflows/ci.ts
Status:  Active
Created: 2026-01-15
Updated: 2026-03-10

Triggers:
  push:
    branches: main
    bookmarks: release/*
  manual_dispatch:
    inputs:
      environment (choice, default: "staging"): Target environment
        options: staging, production

Jobs:
  build (runs-on: ubuntu-latest)
    1. Checkout          [uses: checkout@v1]
    2. Build             [run: bun run build]

  test (runs-on: ubuntu-latest, needs: build)
    1. Run tests         [run: bun test]
```

**Error output:**
- Non-existent ID: `Error: Workflow definition not found`
- Invalid ID: `Error: Invalid workflow ID — must be a positive integer`
- No repository context: `Error: No repository context. Use --repo OWNER/REPO or run from a repository directory`

### TUI UI

**Screen name:** `workflow-definition-view`

**Entry points:**
- From the Workflow List screen, pressing `v` on a focused workflow opens the definition view
- From the Workflow Run List screen, pressing `V` opens the parent definition view
- Command palette: `:workflow-view <id>`
- Deep link: `codeplane tui --screen workflow-view --repo owner/repo --workflow-id 42`

**Layout (120×40 standard):**

```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workflows > ci                      │
├──────────────────────────────────────────────────────────────┤
│ ci                                              ● Active     │
│ .codeplane/workflows/ci.ts                                   │
│ Created: Jan 15, 2026  Updated: Mar 10, 2026                │
├──────────────────────────────────────────────────────────────┤
│ ▸ Triggers                                                   │
│   push: branches [main], bookmarks [release/*]               │
│   manual_dispatch: 1 input (environment)                     │
│                                                              │
│ ▸ Jobs (2)                                                   │
│   ┌─ build (ubuntu-latest)                                   │
│   │  1. Checkout [uses: checkout@v1]                         │
│   │  2. Build [run: bun run build]                           │
│   └──► test (ubuntu-latest)                                  │
│        1. Run tests [run: bun test]                          │
│                                                              │
│ ▸ Inputs                                                     │
│   environment (choice) = "staging"                           │
│     Target environment                                       │
│     Options: staging | production                            │
├──────────────────────────────────────────────────────────────┤
│ v:raw j/k:scroll d:dispatch q:back                           │
└──────────────────────────────────────────────────────────────┘
```

**Keybindings:**

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Scroll down | Content focused |
| `k` / `Up` | Scroll up | Content focused |
| `G` | Jump to bottom | Content focused |
| `g g` | Jump to top | Content focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | Content focused |
| `v` | Toggle raw JSON view | Always |
| `d` | Dispatch workflow | Active + dispatchable |
| `Enter` | Open workflow run list | Always |
| `R` | Refresh / retry | Always |
| `q` | Pop screen | Always |
| `Esc` | Pop screen | Always |

**Sections are collapsible** via `Tab` cycling and `Enter` on section headers. The Triggers, Jobs, and Inputs sections start expanded.

**Responsive behavior:**
- 80×24: Triggers as compact one-liners, jobs show name + step count only, no input details
- 120×40: Full trigger details, job steps visible, input descriptions shown
- 200×60+: Full script content preview (first 5 lines), dependency graph ASCII art, cache descriptors

**Raw view:** When `v` is pressed, the entire content area switches to a syntax-highlighted JSON rendering of the `config` object with line numbers.

### Web UI Design

**Route:** `/:owner/:repo/workflows/:id`

**Page layout:**
- Breadcrumb: `owner / repo / Workflows / workflow-name`
- Header card: workflow name (h1), file path (monospace, muted), active/inactive badge, created/updated timestamps
- Tab bar: "Overview" (default), "Runs", "Source"

**Overview tab:**
- Triggers section with a card per trigger type, each showing its configuration in a structured key-value layout
- Jobs section with a card per job, showing runner, conditions, dependencies, and an expandable step list
- Dependency graph rendered as an SVG/canvas DAG visualization (or Mermaid diagram)
- Inputs section (only for workflows with `workflow_dispatch`) showing a table of input fields with name, type, default, description columns

**Runs tab:**
- Reuses the existing workflow run list component filtered to this definition

**Source tab:**
- Full JSON config displayed in a code block with syntax highlighting and copy-to-clipboard button

**Dispatch button:** A prominent "Run workflow" button in the header card that opens the dispatch modal (reusing existing dispatch flow)

### SDK Shape

The existing `WorkflowService.getWorkflowDefinitionById()` method and the `GET /api/repos/:owner/:repo/workflows/:id` endpoint are sufficient. The `@codeplane/ui-core` package needs:

**New hook:** `useWorkflowDefinition(repoContext, definitionId)`
- Fetches `GET /api/repos/:owner/:repo/workflows/:id`
- Returns `{ data, loading, error, refetch }`
- Caches by definition ID with 60-second TTL

**New utility:** `parseWorkflowConfig(config: unknown)`
- Parses raw config into typed trigger, jobs, and input structures
- Returns `{ triggers: Trigger[], jobs: Job[], inputs: Input[], errors: string[] }`
- Handles malformed configs gracefully by returning partial results with error descriptions

### Documentation

**User guide section:** "Viewing Workflow Definitions" added to the existing workflows guide (`docs/guides/workflows.mdx`)

Content to cover:
- How to view a workflow definition from the web UI (navigate to Workflows tab, click a workflow name)
- How to view from the CLI (`codeplane workflow view <id>`)
- How to view from the TUI (navigate to Workflows, press `v`)
- Explanation of the trigger section and each trigger type
- Explanation of the jobs section, steps, and dependency visualization
- Explanation of the inputs section for dispatchable workflows
- How to switch between formatted and raw/source views

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View definition (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View definition (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Dispatch from definition view | ❌ | ❌ | ✅ | ✅ | ✅ |

- The `GET /api/repos/:owner/:repo/workflows/:id` endpoint inherits the repository visibility rules: public repos are readable by any authenticated user; private repos require at least read access
- The dispatch button/keybinding in the definition view is visible to all users but only functional for users with write access
- Users without write access who attempt dispatch receive a 403 with "Permission denied"

### Rate Limiting

- `GET /api/repos/:owner/:repo/workflows/:id`: 300 requests/minute per user (shared with the workflow list endpoint rate budget)
- No special rate limiting beyond the existing per-route limits since this is a read-only endpoint
- 429 responses include `Retry-After` header

### Data Privacy

- Workflow configs may contain references to secret names (e.g., `${{ secrets.DEPLOY_KEY }}`); secret values are never stored in config and are not exposed
- Workflow configs may contain script content that references internal infrastructure; this is acceptable because it follows the same visibility rules as the repository source code
- No PII is stored in workflow definitions beyond the user-authored content in names, descriptions, and scripts
- The `config` field is returned as-is from storage; no server-side redaction is applied because the user who can view the definition already has read access to the repository source where the workflow file lives

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workflow_definition.viewed` | User opens the definition view | `repo_id`, `repo_owner`, `repo_name`, `definition_id`, `definition_name`, `definition_path`, `is_active`, `client` (web/cli/tui), `view_mode` (formatted/raw), `has_dispatch_trigger`, `job_count`, `trigger_count`, `entry_method` (list_click/deep_link/command), `load_time_ms` |
| `workflow_definition.raw_toggled` | User switches to raw/source view | `repo_id`, `definition_id`, `definition_name`, `client`, `from_view`, `to_view` |
| `workflow_definition.section_toggled` | User expands/collapses a section (TUI/web) | `repo_id`, `definition_id`, `section` (triggers/jobs/inputs), `action` (expand/collapse), `client` |
| `workflow_definition.dispatch_initiated` | User clicks dispatch from definition view | `repo_id`, `definition_id`, `definition_name`, `client` |
| `workflow_definition.not_found` | User navigates to a non-existent definition | `repo_id`, `requested_id`, `client`, `entry_method` |
| `workflow_definition.parse_error` | Config could not be parsed for structured display | `repo_id`, `definition_id`, `error_type`, `client` |

### Common Properties (all events)

- `user_id`, `session_id`, `timestamp`, `client_version`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| View completion rate (loaded successfully) | >98% | Basic reliability |
| Raw toggle usage | 10–30% of views | Confirms structured view is sufficient for most users but raw access is still valued |
| Dispatch from definition view | >8% of views | Shows the view is a useful launchpad, not just documentation |
| Definition view → run list navigation | >40% of views | Confirms users use the view as a workflow hub |
| Time spent on definition view | >15 seconds median | Confirms users are reading the content, not bouncing |
| 404 rate | <5% of attempts | Confirms users are finding valid definitions |
| Parse error rate | <1% of views | Confirms config quality |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Definition view requested | `repo_id`, `definition_id`, `user_id`, `client` |
| `debug` | Config parsed for display | `repo_id`, `definition_id`, `job_count`, `trigger_count`, `config_size_bytes`, `parse_duration_ms` |
| `info` | Definition view served | `repo_id`, `definition_id`, `user_id`, `response_time_ms`, `config_size_bytes` |
| `warn` | Config parse failure | `repo_id`, `definition_id`, `error_message`, `config_size_bytes` |
| `warn` | Slow response (>2s) | `repo_id`, `definition_id`, `response_time_ms`, `config_size_bytes` |
| `warn` | Large config (>500KB) | `repo_id`, `definition_id`, `config_size_bytes` |
| `error` | Database error on definition fetch | `repo_id`, `definition_id`, `error_message`, `error_code` |
| `error` | Unexpected server error | `repo_id`, `definition_id`, `error_message`, `stack_trace` |

Server logs use structured JSON format. Client logs (TUI/CLI) go to stderr at the level controlled by `CODEPLANE_LOG_LEVEL`.

### Prometheus Metrics

**Counters:**
- `codeplane_workflow_definition_views_total{repo, status, client}` — Total definition view requests, labeled by HTTP status (200, 400, 404, 500) and client type
- `codeplane_workflow_definition_not_found_total{repo}` — Total 404 responses for definition views
- `codeplane_workflow_definition_parse_errors_total{repo}` — Total config parse failures during structured rendering

**Histograms:**
- `codeplane_workflow_definition_view_duration_seconds{repo}` — Latency of the GET endpoint (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
- `codeplane_workflow_definition_config_size_bytes{repo}` — Size of returned config payloads (buckets: 1KB, 10KB, 50KB, 100KB, 500KB, 1MB)

**Gauges:**
- `codeplane_workflow_definitions_active_total{repo}` — Number of active definitions per repo (updated on list queries)

### Alerts

**Alert: WorkflowDefinitionViewHighErrorRate**
- Condition: `rate(codeplane_workflow_definition_views_total{status=~"5.."}[5m]) / rate(codeplane_workflow_definition_views_total[5m]) > 0.05`
- Severity: warning
- Runbook:
  1. Check `codeplane_workflow_definition_views_total` by status code to identify whether errors are 500s (server) or 502/503 (upstream)
  2. Check server logs for `error` level entries with `workflow_definition` context
  3. Check database connectivity: run `SELECT 1` against the workflow_definitions table
  4. Check if a specific repo is generating all errors (look at the `repo` label)
  5. If database connection issue: check PG connection pool saturation, restart server if needed
  6. If specific repo: check if the repo's workflow definitions have corrupted config data
  7. Escalate if error rate persists after database connectivity is confirmed

**Alert: WorkflowDefinitionViewHighLatency**
- Condition: `histogram_quantile(0.95, rate(codeplane_workflow_definition_view_duration_seconds_bucket[5m])) > 2.0`
- Severity: warning
- Runbook:
  1. Check if latency is correlated with config size: review `codeplane_workflow_definition_config_size_bytes` histogram
  2. Check database query performance: look for slow query logs on `workflow_definitions` table
  3. Check if the `workflow_definitions` table has appropriate indexes on `(repository_id, id)`
  4. Check server CPU and memory utilization
  5. If large configs: consider adding config size limits or lazy loading for the config field
  6. If database slow: check for table bloat, run VACUUM ANALYZE on workflow_definitions

**Alert: WorkflowDefinitionHighNotFoundRate**
- Condition: `rate(codeplane_workflow_definition_not_found_total[15m]) > 10`
- Severity: info
- Runbook:
  1. Check if a specific client or user is generating 404s (likely a broken link or stale bookmark)
  2. Review recent workflow definition deletions/deactivations
  3. Check if there's a client bug causing incorrect ID resolution
  4. No immediate action required unless correlated with user complaints

### Error Cases and Failure Modes

| Error | HTTP Status | Behavior | Recovery |
|-------|-------------|----------|----------|
| Invalid workflow ID (non-numeric) | 400 | Return `{ "message": "invalid workflow id" }` | Client shows validation error |
| Negative workflow ID | 400 | Return `{ "message": "invalid workflow id" }` | Client shows validation error |
| Workflow not found | 404 | Return `{ "message": "workflow definition not found" }` | Client shows not-found state with back navigation |
| Database connection failure | 500 | Return `{ "message": "internal server error" }` | Retry with backoff; alert fires |
| Config JSON corruption | 200 | Return definition with config field; client handles parse error | Client shows raw view with parse error banner |
| Rate limit exceeded | 429 | Return with `Retry-After` header | Client shows rate limit message |
| Auth token expired | 401 | Return unauthorized | Client redirects to auth flow |
| Repository not found (wrong owner/repo) | 404 | Return `{ "message": "repository not found" }` | Client shows not-found state |

## Verification

### API Tests (`e2e/api/workflow-definition-view.test.ts`)

- API-WDV-001: GET `/api/repos/:owner/:repo/workflows/:id` returns 200 with complete definition including config, name, path, is_active, created_at, updated_at
- API-WDV-002: GET with valid ID returns config object containing `on` and `jobs` keys
- API-WDV-003: GET with non-existent ID returns 404 with `{ "message": "workflow definition not found" }`
- API-WDV-004: GET with non-numeric ID (e.g., "abc") returns 400 with `{ "message": "invalid workflow id" }`
- API-WDV-005: GET with negative ID returns 400
- API-WDV-006: GET with zero ID returns 400
- API-WDV-007: GET with float ID (e.g., "1.5") returns 400
- API-WDV-008: GET with extremely large ID (Number.MAX_SAFE_INTEGER + 1) returns 400 or 404
- API-WDV-009: GET on private repo without auth returns 401
- API-WDV-010: GET on private repo with read access returns 200
- API-WDV-011: GET on private repo with write access returns 200
- API-WDV-012: GET on public repo without auth returns 200 (if anonymous read is allowed) or 401
- API-WDV-013: GET on public repo with auth returns 200
- API-WDV-014: GET returns correct `is_active` field for active definitions
- API-WDV-015: GET returns correct `is_active` field for inactive definitions
- API-WDV-016: GET returns definition with push trigger config containing branches and bookmarks arrays
- API-WDV-017: GET returns definition with schedule trigger config containing cron expressions
- API-WDV-018: GET returns definition with workflow_dispatch trigger containing input schema
- API-WDV-019: GET returns definition with multiple trigger types simultaneously
- API-WDV-020: GET returns definition with jobs containing needs dependencies
- API-WDV-021: GET returns definition with job steps containing run, uses, and agent step types
- API-WDV-022: GET returns definition with cache descriptors in job config
- API-WDV-023: GET returns definition with conditional `if` expressions on jobs
- API-WDV-024: GET returns definition with empty config object (`{}`)
- API-WDV-025: GET returns definition with null config
- API-WDV-026: GET returns definition with config containing no `on` key
- API-WDV-027: GET returns definition with config containing no `jobs` key
- API-WDV-028: GET returns definition where a job has empty steps array
- API-WDV-029: GET returns definition with maximum valid config size (1MB JSON)
- API-WDV-030: GET returns definition for repo with many definitions (verify correct one returned)
- API-WDV-031: GET returns definition where config has unicode characters in names and scripts
- API-WDV-032: Response time for a 1MB config is under 2 seconds
- API-WDV-033: GET definition belonging to a different repository returns 404 (cross-repo isolation)
- API-WDV-034: Rate limiting returns 429 after exceeding 300 requests/minute with Retry-After header

### CLI Tests (`e2e/cli/workflow-definition-view.test.ts`)

- CLI-WDV-001: `workflow view <id>` displays formatted output with name, path, status, triggers, jobs
- CLI-WDV-002: `workflow view <id> --raw` displays raw JSON config
- CLI-WDV-003: `workflow view <id> --json` outputs full API response as valid JSON
- CLI-WDV-004: `workflow view <id> --repo owner/repo` resolves correct repository
- CLI-WDV-005: `workflow view` without ID shows usage error
- CLI-WDV-006: `workflow view abc` with non-numeric ID shows "Invalid workflow ID" error
- CLI-WDV-007: `workflow view 99999` with non-existent ID shows "Workflow definition not found" error
- CLI-WDV-008: `workflow view <id>` without repo context and without `--repo` shows "No repository context" error
- CLI-WDV-009: `workflow view <id>` in a directory with jj repo context auto-resolves the repository
- CLI-WDV-010: Formatted output shows push triggers with branch patterns
- CLI-WDV-011: Formatted output shows schedule triggers with cron expressions
- CLI-WDV-012: Formatted output shows manual_dispatch inputs with type, default, description
- CLI-WDV-013: Formatted output shows jobs with steps in correct order
- CLI-WDV-014: Formatted output shows job dependencies (needs)
- CLI-WDV-015: Formatted output shows inactive workflow with "Inactive" status
- CLI-WDV-016: Formatted output for definition with no triggers shows "No triggers configured"
- CLI-WDV-017: Formatted output for definition with no jobs shows "No jobs configured"
- CLI-WDV-018: Formatted output for definition with null config shows "No configuration available"
- CLI-WDV-019: `workflow view <id> --json` output can be piped to jq and parsed
- CLI-WDV-020: Exit code is 0 for successful view, 1 for errors

### TUI Tests (`e2e/tui/workflow-definition-view.test.ts`)

#### Terminal Snapshot Tests (20 tests)

- SNAP-WDVIEW-001: Definition view at 120×40 with populated triggers, jobs — full structured layout
- SNAP-WDVIEW-002: Definition view at 80×24 — compact layout with abbreviated sections
- SNAP-WDVIEW-003: Definition view at 200×60 — expanded layout with script previews and dependency graph
- SNAP-WDVIEW-004: Active workflow status indicator — ● green "Active"
- SNAP-WDVIEW-005: Inactive workflow status indicator — ○ gray "Inactive"
- SNAP-WDVIEW-006: Push trigger display with branch and bookmark patterns
- SNAP-WDVIEW-007: Schedule trigger display with cron expression and human description
- SNAP-WDVIEW-008: Manual dispatch input schema display with types and defaults
- SNAP-WDVIEW-009: Job display with steps showing run/uses/agent types
- SNAP-WDVIEW-010: Job dependency display with ASCII arrow notation
- SNAP-WDVIEW-011: Raw JSON view toggle — full config with line numbers
- SNAP-WDVIEW-012: Loading state — "Loading workflow definition…"
- SNAP-WDVIEW-013: Error state — red error with "Press R to retry"
- SNAP-WDVIEW-014: Not-found state — "Workflow definition not found"
- SNAP-WDVIEW-015: Empty config — "No configuration available"
- SNAP-WDVIEW-016: No triggers configured message
- SNAP-WDVIEW-017: No jobs configured message
- SNAP-WDVIEW-018: Breadcrumb "Dashboard > owner/repo > Workflows > ci"
- SNAP-WDVIEW-019: Status bar hints "v:raw j/k:scroll d:dispatch q:back"
- SNAP-WDVIEW-020: Collapsible section headers with expand/collapse indicators

#### Keyboard Interaction Tests (18 tests)

- KEY-WDVIEW-001–002: j/k/Down/Up scrolling through content
- KEY-WDVIEW-003–004: G (bottom), g g (top) jump navigation
- KEY-WDVIEW-005–006: Ctrl+D/Ctrl+U page down/up
- KEY-WDVIEW-007–008: v toggles raw view on/off
- KEY-WDVIEW-009: d opens dispatch overlay for dispatchable workflow
- KEY-WDVIEW-010: d shows "Not dispatchable" message for non-dispatchable workflow
- KEY-WDVIEW-011: d shows "Workflow is inactive" for inactive workflow
- KEY-WDVIEW-012: Enter navigates to workflow run list
- KEY-WDVIEW-013: R refreshes data
- KEY-WDVIEW-014: R retries in error state
- KEY-WDVIEW-015: q pops screen
- KEY-WDVIEW-016: Esc pops screen
- KEY-WDVIEW-017: Tab cycles between collapsible sections
- KEY-WDVIEW-018: Enter on section header toggles collapse

#### Responsive Tests (8 tests)

- RESP-WDVIEW-001–002: 80×24 compact layout — triggers as one-liners, jobs as name+step-count
- RESP-WDVIEW-003–004: 120×40 standard layout — full trigger details, step contents visible
- RESP-WDVIEW-005–006: 200×60 expanded layout — script previews, dependency graph, cache descriptors
- RESP-WDVIEW-007: Resize between breakpoints preserves scroll position
- RESP-WDVIEW-008: Resize in raw view adjusts line wrapping

#### Integration Tests (12 tests)

- INT-WDVIEW-001: Navigation from workflow list (press v) opens correct definition
- INT-WDVIEW-002: Navigation from workflow run list (press V) opens parent definition
- INT-WDVIEW-003: Back navigation (q) returns to previous screen with state preserved
- INT-WDVIEW-004: Deep link launch via `--screen workflow-view --workflow-id 42`
- INT-WDVIEW-005: Command palette entry `:workflow-view 42`
- INT-WDVIEW-006: Auth expiry during view → auth error screen
- INT-WDVIEW-007: Rate limit → inline rate limit message
- INT-WDVIEW-008: Network error → error state with retry
- INT-WDVIEW-009: Server 500 → error state with retry
- INT-WDVIEW-010: Dispatch from definition view → dispatch overlay → success flash
- INT-WDVIEW-011: View definition then navigate to runs and back
- INT-WDVIEW-012: View definition for private repo without access → permission error

#### Edge Case Tests (8 tests)

- EDGE-WDVIEW-001: Definition with 50+ jobs renders with scrolling
- EDGE-WDVIEW-002: Definition with deeply nested config (10+ levels) renders without crash
- EDGE-WDVIEW-003: Definition with 1MB config — raw view loads within 3 seconds
- EDGE-WDVIEW-004: Definition name with unicode/emoji renders correctly
- EDGE-WDVIEW-005: Job with 100+ steps — steps render with scrolling
- EDGE-WDVIEW-006: Script step with 500+ lines — truncated with expansion prompt
- EDGE-WDVIEW-007: Concurrent definition update — stale data shown, R refreshes
- EDGE-WDVIEW-008: Definition ID at INT64 max boundary — handled gracefully

### Web UI Tests (Playwright) (`e2e/web/workflow-definition-view.test.ts`)

- WEB-WDVIEW-001: Navigate to `/:owner/:repo/workflows/:id` displays definition overview
- WEB-WDVIEW-002: Breadcrumb shows correct path with clickable segments
- WEB-WDVIEW-003: Header card shows workflow name, path, active badge, timestamps
- WEB-WDVIEW-004: Inactive workflow shows inactive badge in muted style
- WEB-WDVIEW-005: Triggers section renders each configured trigger type
- WEB-WDVIEW-006: Jobs section renders each job with steps
- WEB-WDVIEW-007: Dependency graph renders for jobs with `needs`
- WEB-WDVIEW-008: Inputs section renders dispatch input schema
- WEB-WDVIEW-009: "Source" tab shows raw JSON with syntax highlighting
- WEB-WDVIEW-010: "Source" tab copy button copies JSON to clipboard
- WEB-WDVIEW-011: "Runs" tab shows run list filtered to this definition
- WEB-WDVIEW-012: "Run workflow" button opens dispatch modal
- WEB-WDVIEW-013: "Run workflow" button disabled for users without write access
- WEB-WDVIEW-014: Navigate to non-existent definition shows 404 page
- WEB-WDVIEW-015: Navigate to definition in wrong repo shows 404 page
- WEB-WDVIEW-016: Page loads within 2 seconds for typical definition
- WEB-WDVIEW-017: Page is accessible (keyboard navigation, ARIA labels, screen reader)
- WEB-WDVIEW-018: Responsive layout at mobile viewport (375px width)
- WEB-WDVIEW-019: Responsive layout at tablet viewport (768px width)
- WEB-WDVIEW-020: Responsive layout at desktop viewport (1440px width)

All tests are left failing if backend/frontend is unimplemented — never skipped or commented out.
