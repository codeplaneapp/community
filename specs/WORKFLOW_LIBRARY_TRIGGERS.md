# WORKFLOW_LIBRARY_TRIGGERS

Specification for WORKFLOW_LIBRARY_TRIGGERS.

## High-Level User POV

Codeplane's workflow engine today supports triggering workflows from events like pushes, issues, landing requests, releases, schedules, and manual dispatch. But teams building real automation quickly discover they need to compose workflows — one workflow should be able to trigger another, and shared workflow logic should be reusable across repositories like a library.

**Workflow Library Triggers** introduces two connected capabilities:

First, workflows can now explicitly trigger other workflows. When a workflow run completes, succeeds, fails, or reaches a specific step, it can fire a trigger that starts one or more downstream workflows. This lets teams build pipelines — a "build" workflow triggers a "deploy" workflow, which triggers a "smoke-test" workflow — without brittle glue scripts or polling. The triggering workflow can pass outputs and context to the downstream workflow, so the entire chain shares state cleanly.

Second, organizations and users can publish **workflow libraries** — reusable workflow definitions that other repositories can reference. A workflow library is a collection of workflow definitions published from a source repository. Other repositories subscribe to a library and can use its workflows as callable units or trigger sources. When a library workflow is updated, subscribing repositories see the new version on their next run. Libraries can be scoped to an organization (shared across all org repos) or published publicly.

Together, these capabilities mean that a platform team can author a canonical CI/CD pipeline once, publish it as a library, and every repository in the organization can trigger and compose those shared workflows without copy-pasting YAML or TypeScript definitions. Individual developers can chain their own workflows together without leaving Codeplane. Agent-driven flows benefit especially: an agent can kick off a build workflow, wait for completion, then automatically trigger a deploy — all expressed declaratively in the workflow definition rather than requiring imperative orchestration.

The experience is designed to feel native across all Codeplane surfaces. From the web UI, users browse available libraries, see which workflows are available from each library, and inspect trigger chains visually. From the CLI, users can list libraries, subscribe repositories, trigger workflows manually, and inspect the trigger graph. The TUI, editor integrations, and API all expose the same capabilities consistently.

## Acceptance Criteria

### Workflow-to-Workflow Triggers

- [ ] A workflow definition can declare a `workflow_run` trigger that fires when a specified workflow in the same repository completes, succeeds, or fails.
- [ ] A workflow definition can declare a `workflow_step` trigger that fires when a specified step in a specified workflow reaches a given status (completed, failed, skipped).
- [ ] Trigger declarations must reference workflows by name. The referenced workflow must exist in the same repository or in a subscribed library.
- [ ] When a triggering workflow run reaches the matching condition, all downstream workflows are dispatched automatically within 5 seconds.
- [ ] The downstream workflow run receives the triggering run's ID, conclusion, outputs, and repository context as input parameters.
- [ ] Circular trigger chains (A triggers B triggers A) must be detected at definition validation time and rejected with a clear error message.
- [ ] Circular chains that span more than 2 levels (A→B→C→A) must also be detected and rejected.
- [ ] A maximum trigger chain depth of **8** levels is enforced. Exceeding this depth causes the would-be 9th workflow to not be dispatched, and an error event is emitted on the 8th run.
- [ ] If a downstream workflow fails to dispatch (e.g., it was deleted between definition and execution), the upstream workflow run is not affected, but a warning event is emitted.
- [ ] A workflow can trigger at most **10** downstream workflows from a single trigger declaration.
- [ ] Trigger conditions support `completed`, `success`, `failure`, and `cancelled` conclusion filters.
- [ ] Workflow-to-workflow triggers respect the same concurrency controls as other trigger types (e.g., concurrency groups, queue behavior).

### Workflow Libraries

- [ ] A repository owner can publish a workflow library from their repository. The library contains all workflow definitions in the repository's `.codeplane/workflows/` directory.
- [ ] A library has a unique name scoped to the owner (user or organization). Library names must be 1–64 characters, lowercase alphanumeric plus hyphens, must start with a letter, and must not end with a hyphen.
- [ ] Duplicate library names within the same owner scope are rejected.
- [ ] A library can be scoped as `organization` (visible to all repos in the org), `public` (visible to all Codeplane users), or `private` (visible only to the source repository).
- [ ] A repository can subscribe to a library. Subscriptions are stored at the repository level.
- [ ] A repository can subscribe to at most **20** libraries simultaneously.
- [ ] Subscribing to a library does not copy workflow files. It creates a runtime reference that resolves at dispatch time.
- [ ] When a subscribed library's source repository updates its workflow definitions, the subscribing repository's next trigger evaluation uses the updated definitions.
- [ ] Library workflows can be referenced in trigger declarations using the syntax `library-name/workflow-name`.
- [ ] Library workflows can be triggered via `workflow_dispatch` from subscribing repositories, passing inputs defined by the library workflow.
- [ ] A library can be versioned using tags. Subscriptions can pin to a tag (e.g., `my-library@v1`) or follow `latest`.
- [ ] When a pinned tag version is used, the workflow definition at that tag is resolved, not the latest.
- [ ] Tags must follow the pattern `v` followed by a semver-like string (e.g., `v1`, `v1.0`, `v1.2.3`). Maximum tag length is 32 characters.
- [ ] A library can have at most **100** published tags.
- [ ] A library can contain at most **50** workflow definitions.
- [ ] Unsubscribing from a library does not affect currently running workflow runs that were started from that library.
- [ ] Deleting a library source repository archives the library. Subscribing repos see a clear "library archived" status and their trigger references to that library stop dispatching new runs.
- [ ] Empty library names, names with special characters outside the allowed set, and names exceeding 64 characters are rejected with descriptive validation errors.
- [ ] A library with zero workflow definitions can be created but produces a warning in the UI and CLI.

### Cross-Cutting

- [ ] All trigger and library behavior is available through the API, web UI, CLI, and TUI.
- [ ] Library subscription and trigger chain state is visible in the repository settings area.
- [ ] The workflow run detail view shows the trigger chain — which upstream run triggered this run, and which downstream runs it triggered.
- [ ] The repository workflow list view shows library-sourced workflows with a visual indicator distinguishing them from local workflows.
- [ ] All operations respect existing repository permission models (read, write, admin).
- [ ] Feature is gated behind the `WORKFLOW_LIBRARY_TRIGGERS` feature flag until generally available.

### Definition of Done

- All acceptance criteria above pass automated verification.
- API, web UI, CLI, and TUI surfaces are implemented and consistent.
- Documentation is published covering library creation, subscription, trigger syntax, and trigger chain behavior.
- Observability instrumentation is in place (metrics, logs, alerts).
- Feature flag is registered and defaults to off in production until rollout.

## Design

### 3.1 Web UI Design

#### Repository Workflows Page

The existing workflows list page gains a new section or tab: **"Library Workflows"**. This section shows:

- Workflows sourced from subscribed libraries, grouped by library name.
- Each library workflow entry displays: library name, workflow name, library version (tag or `latest`), and a badge indicating the library scope (org/public/private).
- Clicking a library workflow navigates to a read-only workflow detail view showing the definition, recent runs from this repo, and a link to the source library.

Local workflows continue to appear in the main list as they do today, with no badge.

#### Library Management (Repository Settings → Workflows)

A new "Libraries" subsection in repository settings:

- **Subscribed Libraries**: A table listing all libraries this repository subscribes to, with columns: Library Name, Owner, Version (tag or `latest`), Scope, Subscribed Date, and an Unsubscribe action button.
- **Subscribe to Library**: A search/autocomplete input that searches available libraries by name. Results show library name, owner, scope, description, and workflow count. Clicking "Subscribe" opens a modal to choose a version (latest or a specific tag).
- **Publish as Library** (visible only to repo admins): A card/section allowing the repo owner to publish this repository's workflows as a library. Fields: library name (pre-filled from repo name, editable), scope dropdown (private/organization/public), description (max 256 chars). A "Publish" button. Once published, this section shows the library's status, current tags, and subscriber count.

#### Library Tag Management

When a repository is published as a library, the settings page shows a "Tags" subsection:

- List of existing tags with creation date and a delete action.
- "Create Tag" button opening a form with: tag name (validated), optional description (max 256 chars).

#### Workflow Run Detail — Trigger Chain

The workflow run detail page gains a "Trigger Chain" section:

- **Triggered By**: If this run was triggered by another workflow, show a link to the upstream run with its workflow name, run number, and conclusion.
- **Triggered Downstream**: If this run triggered downstream workflows, show a list of links to each downstream run with workflow name, run number, and current status.
- The chain is rendered as a small horizontal flow diagram (boxes connected by arrows) for chains of 3+ runs. For simpler chains, inline links suffice.

#### Trigger Chain Visualization (Repository Workflows Page)

A "Trigger Graph" view (toggled via a button next to the list/grid view toggle) renders a DAG of all workflow trigger relationships in the repository, including library-sourced workflows. Nodes are workflow names; edges are trigger conditions. Circular dependency errors are highlighted in red with an error tooltip.

### 3.2 API Shape

#### Workflow Library Endpoints

```
POST   /api/repos/:owner/:repo/workflow-library
  Body: { name: string, scope: "private"|"organization"|"public", description?: string }
  Response: 201 { library }

GET    /api/repos/:owner/:repo/workflow-library
  Response: 200 { library } | 404

PATCH  /api/repos/:owner/:repo/workflow-library
  Body: { scope?: string, description?: string }
  Response: 200 { library }

DELETE /api/repos/:owner/:repo/workflow-library
  Response: 204
```

#### Library Tags

```
POST   /api/repos/:owner/:repo/workflow-library/tags
  Body: { name: string, description?: string }
  Response: 201 { tag }

GET    /api/repos/:owner/:repo/workflow-library/tags
  Response: 200 { tags: [...] }

DELETE /api/repos/:owner/:repo/workflow-library/tags/:tag
  Response: 204
```

#### Library Discovery

```
GET    /api/workflow-libraries
  Query: { q?: string, scope?: string, page?: number, per_page?: number }
  Response: 200 { libraries: [...], total: number }

GET    /api/workflow-libraries/:owner/:name
  Response: 200 { library, workflows: [...], tags: [...] }

GET    /api/workflow-libraries/:owner/:name/workflows/:workflow
  Query: { tag?: string }
  Response: 200 { workflow_definition }
```

#### Library Subscriptions

```
POST   /api/repos/:owner/:repo/workflow-subscriptions
  Body: { library_owner: string, library_name: string, tag?: string }
  Response: 201 { subscription }

GET    /api/repos/:owner/:repo/workflow-subscriptions
  Response: 200 { subscriptions: [...] }

PATCH  /api/repos/:owner/:repo/workflow-subscriptions/:subscription_id
  Body: { tag?: string }
  Response: 200 { subscription }

DELETE /api/repos/:owner/:repo/workflow-subscriptions/:subscription_id
  Response: 204
```

#### Trigger Chain on Runs

```
GET    /api/repos/:owner/:repo/workflow-runs/:run_id
  Response includes: { ...existing_fields, triggered_by?: { run_id, workflow_name, conclusion }, triggered_runs?: [{ run_id, workflow_name, status }] }

GET    /api/repos/:owner/:repo/workflow-trigger-graph
  Response: 200 { nodes: [{ workflow_name, source: "local"|"library", library?: string }], edges: [{ from, to, condition }], errors: [{ type: "circular", path: [...] }] }
```

### 3.3 SDK Shape

New services in `packages/sdk`:

- `WorkflowLibraryService`: CRUD for libraries, tag management, discovery/search, and subscription management.
- Extension of `WorkflowService`: trigger chain resolution, circular dependency detection, depth enforcement, cross-repo library workflow resolution at dispatch time.

New types in `packages/sdk`:

- `WorkflowLibrary`: `{ id, repo_id, owner, name, scope, description, created_at, updated_at, archived }`
- `WorkflowLibraryTag`: `{ id, library_id, name, description, created_at }`
- `WorkflowSubscription`: `{ id, repo_id, library_id, tag?, subscribed_at }`
- `WorkflowTriggerChainEntry`: `{ run_id, upstream_run_id?, workflow_name, depth }`

### 3.4 CLI Commands

```
codeplane workflow library publish [--name <name>] [--scope private|organization|public] [--description <desc>]
codeplane workflow library info
codeplane workflow library update [--scope <scope>] [--description <desc>]
codeplane workflow library delete [--confirm]
codeplane workflow library tags
codeplane workflow library tag create <tag-name> [--description <desc>]
codeplane workflow library tag delete <tag-name>

codeplane workflow subscribe <owner/library-name> [--tag <tag>]
codeplane workflow subscriptions
codeplane workflow unsubscribe <subscription-id|owner/library-name>
codeplane workflow subscription update <subscription-id|owner/library-name> --tag <tag>

codeplane workflow libraries [--query <q>] [--scope <scope>]
codeplane workflow library show <owner/library-name> [--tag <tag>]

codeplane workflow trigger-graph
codeplane workflow run <run-id>   # existing; now includes trigger chain in output
```

All commands support `--json` for structured output. `--repo` / `-R` flag applies where repository context is needed.

### 3.5 TUI Design

#### Workflows Screen

- Add a "Library" tab alongside existing workflow list.
- Library tab shows subscribed libraries grouped, with workflow names, versions, and run counts.
- Selecting a library workflow shows its definition and recent runs.

#### Workflow Run Detail Screen

- Add "Triggered By" and "Triggered Downstream" sections mirroring the web UI.
- Navigation hotkeys to jump to upstream/downstream runs.

#### New Screens

- **Library Browse** (`l` hotkey from workflows): Search and browse available libraries, subscribe/unsubscribe.
- **Trigger Graph** (`g` hotkey from workflows): ASCII-rendered DAG of trigger relationships.

### 3.6 Neovim Plugin API

New commands:

- `:CodeplaneWorkflowLibraries` — list subscribed libraries via Telescope picker.
- `:CodeplaneWorkflowSubscribe <owner/name>` — subscribe current repo to a library.
- `:CodeplaneWorkflowTriggerGraph` — open a buffer with the ASCII trigger graph.

### 3.7 VS Code Extension

- Workflow tree view gains a "Libraries" group showing subscribed library workflows.
- Workflow run detail webview shows trigger chain.
- Command palette: "Codeplane: Subscribe to Workflow Library", "Codeplane: View Trigger Graph".

### 3.8 Documentation

End-user documentation to be written:

1. **"Workflow Libraries" guide**: How to publish a library, manage tags, scope visibility, and what subscribers see. Includes a walkthrough of publishing a CI library from a platform-team repo and subscribing from application repos.
2. **"Workflow Triggers: Chaining Workflows" guide**: How to use `workflow_run` and `workflow_step` triggers, how to reference library workflows, how outputs flow downstream, depth limits, and circular dependency errors.
3. **"Trigger Graph" reference**: How to read the trigger graph in web, CLI, and TUI. How to diagnose circular dependency and depth-exceeded errors.
4. **CLI reference updates**: All new `workflow library`, `workflow subscribe`, and `workflow trigger-graph` commands documented with examples.
5. **API reference updates**: All new endpoints documented with request/response examples.
6. **Workflow definition syntax update**: Document the `workflow_run` and `workflow_step` trigger types in the workflow definition reference, including the `library-name/workflow-name` syntax for cross-library references.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Write | Read | Anonymous |
|---|---|---|---|---|---|
| Publish library from repo | ✅ | ✅ | ❌ | ❌ | ❌ |
| Update/delete library | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create/delete library tags | ✅ | ✅ | ❌ | ❌ | ❌ |
| Subscribe repo to library | ✅ | ✅ | ✅ | ❌ | ❌ |
| Unsubscribe repo from library | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update subscription version | ✅ | ✅ | ✅ | ❌ | ❌ |
| View subscribed libraries | ✅ | ✅ | ✅ | ✅ | ❌ (unless public repo) |
| Browse public libraries | ✅ | ✅ | ✅ | ✅ | ✅ |
| Browse org-scoped libraries | Org members only | Org members only | Org members only | Org members only | ❌ |
| View trigger graph | ✅ | ✅ | ✅ | ✅ | ❌ (unless public repo) |
| Manually dispatch library workflow | ✅ | ✅ | ✅ | ❌ | ❌ |

### Rate Limiting

- Library publish/update/delete: **10 requests per minute per user**.
- Library tag create/delete: **20 requests per minute per user**.
- Library subscribe/unsubscribe: **30 requests per minute per user**.
- Library search/browse: **60 requests per minute per user**.
- Trigger graph computation: **20 requests per minute per repository** (this is a potentially expensive graph operation).
- Workflow-to-workflow trigger dispatch: **50 downstream dispatches per minute per repository** (prevents runaway chain explosions).

### Data Privacy

- Private library workflow definitions are never exposed to non-members of the source repository.
- Organization-scoped library definitions are only visible to organization members.
- Workflow outputs passed through trigger chains may contain sensitive data. The trigger chain payload is subject to the same secret-masking rules as workflow logs.
- Library subscriber counts are visible to library publishers but individual subscriber repository names are not exposed via the API (only counts).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Properties | When Fired |
|---|---|---|
| `WorkflowLibraryPublished` | `library_id`, `owner_id`, `scope`, `workflow_count` | Library first published |
| `WorkflowLibraryTagCreated` | `library_id`, `tag_name` | Tag created |
| `WorkflowLibrarySubscribed` | `library_id`, `repo_id`, `tag`, `scope` | Repo subscribes to library |
| `WorkflowLibraryUnsubscribed` | `library_id`, `repo_id` | Repo unsubscribes |
| `WorkflowTriggerChainDispatched` | `upstream_run_id`, `downstream_run_id`, `chain_depth`, `trigger_type` | Downstream workflow dispatched via trigger |
| `WorkflowTriggerChainDepthExceeded` | `run_id`, `chain_depth`, `workflow_name` | Chain depth limit reached |
| `WorkflowTriggerCircularDetected` | `repo_id`, `cycle_path` | Circular dependency detected at validation time |
| `WorkflowLibrarySearched` | `query`, `result_count`, `user_id` | User searches for libraries |
| `WorkflowTriggerGraphViewed` | `repo_id`, `node_count`, `edge_count`, `surface` (web/cli/tui) | User views trigger graph |

### Funnel Metrics & Success Indicators

- **Library adoption rate**: % of active repositories that subscribe to at least one library within 30 days of feature launch.
- **Library reuse ratio**: Average number of subscribing repos per published library.
- **Trigger chain utilization**: % of workflow runs that are triggered by another workflow (vs. direct triggers).
- **Chain depth distribution**: Histogram of trigger chain depths — healthy product usage should cluster at depths 2-4.
- **Time-to-downstream-dispatch**: P50/P95 time from upstream run conclusion to downstream run creation. Target: <5 seconds P95.
- **Circular detection hit rate**: Number of circular dependency errors per week — should trend toward zero as users learn the system.
- **Library search-to-subscribe conversion**: % of library search sessions that result in a subscription.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Library published | INFO | `library_id`, `owner`, `name`, `scope`, `workflow_count` |
| Library deleted/archived | INFO | `library_id`, `owner`, `name`, `reason` |
| Tag created | INFO | `library_id`, `tag_name` |
| Tag deleted | INFO | `library_id`, `tag_name` |
| Subscription created | INFO | `repo_id`, `library_id`, `tag` |
| Subscription removed | INFO | `repo_id`, `library_id` |
| Trigger chain dispatch started | INFO | `upstream_run_id`, `downstream_workflow`, `chain_depth` |
| Trigger chain dispatch completed | INFO | `upstream_run_id`, `downstream_run_id`, `dispatch_latency_ms` |
| Trigger chain dispatch failed | ERROR | `upstream_run_id`, `downstream_workflow`, `error`, `chain_depth` |
| Trigger chain depth exceeded | WARN | `run_id`, `chain_depth`, `max_depth`, `workflow_name` |
| Circular dependency detected | WARN | `repo_id`, `cycle_path` |
| Library resolution failed (archived/deleted) | WARN | `repo_id`, `library_id`, `library_name` |
| Library workflow definition resolved | DEBUG | `library_id`, `workflow_name`, `tag`, `resolved_commit` |
| Trigger graph computed | DEBUG | `repo_id`, `node_count`, `edge_count`, `computation_ms` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workflow_libraries_total` | Gauge | `scope` | Total number of published libraries |
| `codeplane_workflow_library_subscriptions_total` | Gauge | `scope` | Total active subscriptions |
| `codeplane_workflow_trigger_chain_dispatches_total` | Counter | `trigger_type`, `result` (success/failure) | Total downstream workflow dispatches |
| `codeplane_workflow_trigger_chain_depth` | Histogram | — | Distribution of chain depths for dispatched runs |
| `codeplane_workflow_trigger_dispatch_latency_seconds` | Histogram | — | Time from upstream conclusion to downstream dispatch |
| `codeplane_workflow_trigger_depth_exceeded_total` | Counter | — | Number of depth-exceeded events |
| `codeplane_workflow_trigger_circular_detected_total` | Counter | — | Number of circular dependency detections |
| `codeplane_workflow_library_resolution_failures_total` | Counter | `reason` (archived/deleted/not_found) | Library resolution failures |
| `codeplane_workflow_trigger_graph_computation_seconds` | Histogram | — | Trigger graph computation time |
| `codeplane_workflow_library_search_total` | Counter | — | Total library search requests |

### Alerts & Runbooks

#### Alert: `WorkflowTriggerDispatchLatencyHigh`
- **Condition**: P95 of `codeplane_workflow_trigger_dispatch_latency_seconds` > 10s for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check the workflow service logs for dispatch errors or timeouts.
  2. Check database query latency on the workflow runs table — trigger dispatch involves a run insert.
  3. Check if a specific repository is generating an unusually high volume of trigger dispatches (possible misconfigured chain).
  4. If a single repo is the source, inspect its trigger graph for fan-out issues (one workflow triggering 10 workflows each of which triggers 10 more).
  5. If database latency is the issue, check connection pool saturation and query plans.
  6. Escalate to platform team if latency persists after ruling out single-repo issues.

#### Alert: `WorkflowTriggerDepthExceededSpike`
- **Condition**: `codeplane_workflow_trigger_depth_exceeded_total` increases by >10 in 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify the repository/repositories generating depth-exceeded events from logs.
  2. Check if the user intentionally configured deep chains or if this indicates a misconfiguration.
  3. Review the trigger graph for the affected repositories.
  4. If a single user/org is responsible, contact them proactively with guidance.
  5. If the spike is organic across many repos, consider whether the depth limit of 8 is too low for real-world usage and open a product discussion.

#### Alert: `WorkflowTriggerCircularDetectedSpike`
- **Condition**: `codeplane_workflow_trigger_circular_detected_total` increases by >20 in 10 minutes.
- **Severity**: Info
- **Runbook**:
  1. This is primarily a UX signal — users are creating circular definitions and hitting validation errors.
  2. Check if the error messages are clear and actionable.
  3. If a single repo/user is responsible, it may indicate confusion — consider proactive documentation or onboarding outreach.
  4. No immediate engineering action required unless validation is failing to catch cycles (which would manifest as infinite dispatch loops).

#### Alert: `WorkflowLibraryResolutionFailuresHigh`
- **Condition**: `codeplane_workflow_library_resolution_failures_total` rate > 5/min for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check which libraries are failing to resolve from logs.
  2. If failures are due to archived/deleted libraries, this is expected fallout from a library being removed. Confirm the subscription cleanup process is working.
  3. If failures are due to `not_found`, check for database inconsistencies between the library and subscription tables.
  4. If a library's source repository was deleted but the library wasn't properly archived, run the library archival reconciliation process.
  5. Notify affected repository owners if their subscriptions are pointing at permanently unavailable libraries.

#### Alert: `WorkflowTriggerGraphComputationSlow`
- **Condition**: P95 of `codeplane_workflow_trigger_graph_computation_seconds` > 5s for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify which repositories are generating slow graph computations from logs.
  2. Check the `node_count` and `edge_count` — very large graphs (>100 nodes) may need pagination or caching.
  3. If specific repos have unusually large trigger graphs, check if they're subscribing to many libraries with many workflows.
  4. Consider adding a result cache with a short TTL (30s) for the trigger graph endpoint if load is sustained.

### Error Cases and Failure Modes

| Error Case | Expected Behavior |
|---|---|
| Publish library with duplicate name under same owner | 409 Conflict with message "A library with this name already exists" |
| Subscribe to non-existent library | 404 Not Found |
| Subscribe to private library without access | 403 Forbidden |
| Subscribe when at 20-library limit | 422 with message "Maximum library subscription limit (20) reached" |
| Create tag with invalid format | 422 with validation error specifying the pattern requirement |
| Create tag when at 100-tag limit | 422 with message "Maximum tag limit (100) reached" |
| Publish library with 51+ workflows | 422 with message "Maximum workflow count (50) exceeded" |
| Circular dependency in trigger definition | 422 at definition save time with the detected cycle path |
| Library workflow referenced but library archived | Run proceeds without dispatching downstream; warning event logged |
| Trigger dispatch fails due to transient error | Retry up to 3 times with exponential backoff; emit error event if all retries fail |
| Concurrent publish + delete of same library | Serialized via database transaction; one operation wins cleanly |
| Tag deletion while subscriptions reference it | Subscriptions fall back to `latest`; subscribers see a notification |

## Verification

### API Integration Tests

#### Library CRUD
- [ ] Create a workflow library with valid name, scope, and description → 201 with library object.
- [ ] Create a library with name at maximum length (64 chars) → 201 success.
- [ ] Create a library with name at 65 chars → 422 validation error.
- [ ] Create a library with empty name → 422 validation error.
- [ ] Create a library with name containing uppercase → 422 validation error.
- [ ] Create a library with name containing special characters (`_`, `.`, `@`) → 422 validation error.
- [ ] Create a library with name starting with a hyphen → 422 validation error.
- [ ] Create a library with name ending with a hyphen → 422 validation error.
- [ ] Create a library with name containing only digits → 422 validation error.
- [ ] Create a duplicate library name under the same owner → 409 Conflict.
- [ ] Create libraries with the same name under different owners → both succeed.
- [ ] Update library scope from private to public → 200 with updated library.
- [ ] Update library description to max length (256 chars) → 200 success.
- [ ] Update library description to 257 chars → 422 validation error.
- [ ] Delete a library → 204, subsequent GET returns 404.
- [ ] Delete a library with active subscriptions → 204, subscriptions become stale.
- [ ] Get library info for a published repository → 200 with library.
- [ ] Get library info for a non-published repository → 404.

#### Library Tags
- [ ] Create tag with valid semver name → 201 with tag.
- [ ] Create tag at maximum name length (32 chars) → 201 success.
- [ ] Create tag at 33 chars → 422 validation error.
- [ ] Create tag without `v` prefix → 422 validation error.
- [ ] Create tag with invalid semver after `v` (e.g., `vabc`) → 422 validation error.
- [ ] Create duplicate tag name → 409 Conflict.
- [ ] Create 100th tag → 201 success.
- [ ] Create 101st tag → 422 limit exceeded.
- [ ] Delete a tag → 204.
- [ ] Delete a tag referenced by subscriptions → 204, subscriptions fall back to latest.
- [ ] List tags → returns all tags ordered by creation date.

#### Library Discovery
- [ ] Search libraries with query matching name → returns matching libraries.
- [ ] Search libraries with scope filter → returns only libraries of that scope.
- [ ] Search with empty query → returns all visible libraries.
- [ ] Search as anonymous user → returns only public libraries.
- [ ] Search as org member → returns public + org-scoped libraries.
- [ ] Get library detail with workflows listed → returns workflow definitions.
- [ ] Get library detail with specific tag → returns definitions at that tag.
- [ ] Pagination: request page 2 with per_page=5 when 12 libraries exist → returns 5 libraries.

#### Subscriptions
- [ ] Subscribe to a public library → 201 with subscription.
- [ ] Subscribe to an org-scoped library as org member → 201.
- [ ] Subscribe to an org-scoped library as non-member → 403.
- [ ] Subscribe to a private library from a different repo → 403.
- [ ] Subscribe to the same library twice → 409 Conflict.
- [ ] Subscribe with a specific tag → 201, subscription includes tag.
- [ ] Subscribe with non-existent tag → 404.
- [ ] Subscribe when at 20-subscription limit → 422.
- [ ] Update subscription to change tag → 200.
- [ ] Update subscription to remove tag (follow latest) → 200.
- [ ] Unsubscribe → 204.
- [ ] List subscriptions → returns all active subscriptions.

#### Workflow-to-Workflow Triggers
- [ ] Create a workflow with `workflow_run` trigger referencing a local workflow → definition saved successfully.
- [ ] Create a workflow with `workflow_run` trigger referencing a library workflow → definition saved successfully.
- [ ] Create a workflow with `workflow_run` trigger referencing non-existent workflow → 422.
- [ ] Create a circular trigger (A→B→A) → 422 with cycle path.
- [ ] Create a deep circular trigger (A→B→C→A) → 422 with cycle path.
- [ ] Run workflow A which triggers workflow B → B is dispatched within 5s, B's run includes `triggered_by`.
- [ ] Run A → triggers B → triggers C (chain depth 2) → all dispatched correctly.
- [ ] Run chain at depth 8 → 8th workflow runs, 9th is not dispatched, error event emitted.
- [ ] Trigger with condition `success` but upstream fails → downstream is NOT dispatched.
- [ ] Trigger with condition `failure` and upstream fails → downstream IS dispatched.
- [ ] Trigger with condition `completed` and upstream succeeds → downstream IS dispatched.
- [ ] Trigger with condition `completed` and upstream fails → downstream IS dispatched.
- [ ] Trigger with condition `cancelled` and upstream is cancelled → downstream IS dispatched.
- [ ] One workflow triggers 10 downstream workflows → all 10 are dispatched.
- [ ] Workflow definition declares 11 downstream triggers → 422 validation error.
- [ ] Downstream workflow deleted after upstream definition saved → upstream runs fine, downstream dispatch emits warning.
- [ ] Verify trigger chain metadata in run detail API response.

#### Trigger Graph
- [ ] Get trigger graph for repo with no triggers → empty nodes/edges.
- [ ] Get trigger graph for repo with local triggers → correct DAG.
- [ ] Get trigger graph for repo with library triggers → library workflows included with source metadata.
- [ ] Get trigger graph with circular dependency error → errors array populated with cycle path.

### Permission Tests
- [ ] Read-only user cannot publish a library → 403.
- [ ] Write user cannot publish a library → 403.
- [ ] Admin user can publish a library → 201.
- [ ] Read-only user cannot subscribe to a library → 403.
- [ ] Write user can subscribe to a library → 201.
- [ ] Read-only user can view subscriptions → 200.
- [ ] Anonymous user cannot view private repo subscriptions → 401.
- [ ] Anonymous user can view public repo subscriptions → 200.
- [ ] Anonymous user can browse public libraries → 200.
- [ ] Anonymous user cannot browse org-scoped libraries → 403.

### Playwright (Web UI) E2E Tests
- [ ] Navigate to repo workflows page → "Library Workflows" section is visible when subscribed to a library.
- [ ] Navigate to repo settings → Libraries section shows subscribed libraries.
- [ ] Subscribe to a library via the UI → subscription appears in list.
- [ ] Unsubscribe from a library via the UI → subscription removed.
- [ ] Publish repo as library via settings → library appears with correct metadata.
- [ ] Create a library tag via the UI → tag appears in tag list.
- [ ] Delete a library tag → tag is removed.
- [ ] View workflow run with trigger chain → "Triggered By" and "Triggered Downstream" sections render correctly.
- [ ] Toggle to Trigger Graph view → DAG renders with correct nodes and edges.
- [ ] Search for a library in the subscribe modal → results appear.
- [ ] Feature flag off → library features are not visible in UI.

### CLI E2E Tests
- [ ] `codeplane workflow library publish --name test-lib --scope public` → library published.
- [ ] `codeplane workflow library info` → shows library details.
- [ ] `codeplane workflow library tags` → lists tags.
- [ ] `codeplane workflow library tag create v1.0.0` → tag created.
- [ ] `codeplane workflow library tag delete v1.0.0` → tag deleted.
- [ ] `codeplane workflow subscribe owner/test-lib` → subscription created.
- [ ] `codeplane workflow subscriptions` → lists subscriptions.
- [ ] `codeplane workflow unsubscribe owner/test-lib` → subscription removed.
- [ ] `codeplane workflow libraries --query test` → search results displayed.
- [ ] `codeplane workflow library show owner/test-lib` → library detail displayed.
- [ ] `codeplane workflow trigger-graph` → ASCII DAG rendered.
- [ ] `codeplane workflow trigger-graph --json` → JSON graph output.
- [ ] `codeplane workflow run <run-id>` → trigger chain visible in output.
- [ ] `codeplane workflow library publish --name INVALID` → validation error.
- [ ] `codeplane workflow library delete --confirm` → library deleted.

### TUI E2E Tests
- [ ] Open workflows screen → Library tab is visible.
- [ ] Navigate to Library tab → subscribed library workflows are listed.
- [ ] Open Library Browse screen → search and subscribe flow works.
- [ ] Open Trigger Graph screen → ASCII DAG renders.
- [ ] Open workflow run detail → trigger chain sections present.

### Rate Limiting Tests
- [ ] Send 11 library publish requests in 1 minute → 11th returns 429.
- [ ] Send 21 tag create requests in 1 minute → 21st returns 429.
- [ ] Send 51 trigger dispatches in 1 minute from one repo → dispatches beyond 50 are queued/rejected.
- [ ] Send 61 library search requests in 1 minute → 61st returns 429.

### Feature Flag Tests
- [ ] With `WORKFLOW_LIBRARY_TRIGGERS` flag off, library API endpoints return 404 or are not mounted.
- [ ] With flag off, workflow trigger chain evaluation does not dispatch downstream workflows.
- [ ] With flag on, all endpoints and behaviors are active.
