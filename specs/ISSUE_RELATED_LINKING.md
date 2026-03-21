# ISSUE_RELATED_LINKING

Specification for ISSUE_RELATED_LINKING.

## High-Level User POV

When working on a complex project in Codeplane, issues rarely exist in isolation. A bug report may be blocked by an infrastructure task. A feature request may depend on a prerequisite being completed first. Two issues may address related aspects of the same user-facing problem. Codeplane's issue-related linking gives users a structured way to express and visualize these relationships directly from any client surface.

A developer looking at an issue can see at a glance which other issues it depends on and which issues are waiting on it. When an issue is blocking three other issues, those dependent issues are listed explicitly — making it clear that resolving the blocker will unblock downstream work. When a developer creates a dependency link between two issues, both issues' detail views update immediately to reflect the relationship from each side: the source issue shows a new dependency, and the target issue shows a new dependent.

The linking model is intentionally directional. A user says "issue #12 depends on issue #8", which simultaneously means "issue #8 blocks issue #12." This single, unambiguous relationship is stored once and displayed from both perspectives. Users can link issues from the web UI's issue detail sidebar, from the CLI with a single command, from the TUI's issue detail screen, or through the API. They can also remove links when a dependency no longer applies — for example, if the blocking work was split into a different issue or is no longer required.

Dependencies between issues serve as an organizing layer on top of labels and milestones. While a milestone tracks what should ship together and labels categorize the nature of the work, dependency links express ordering constraints. A team can look at a milestone's issues and immediately see which ones are blocked, which are ready to start, and which are blocking others. Agents can also use dependency information to prioritize which issues to pick up first — choosing unblocked issues before attempting work that has unresolved prerequisites.

The feature is scoped to same-repository linking. Cross-repository dependencies are not supported in this version. Self-linking (an issue depending on itself) is rejected. Duplicate links are handled gracefully — attempting to create a link that already exists is idempotent rather than an error.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access can create a directional dependency link between two issues in the same repository.
- [ ] An authenticated user with write access can remove an existing dependency link.
- [ ] Any user with read access can list the dependencies and dependents for an issue.
- [ ] The dependency relationship is visible from both sides: the source issue shows "depends on #N" and the target issue shows "blocks #N".
- [ ] All clients (API, Web UI, CLI, TUI) support creating, listing, and removing dependency links.
- [ ] Dependency operations are reflected in the issue event timeline.
- [ ] Webhook events fire for dependency creation and removal.
- [ ] Notifications are sent to issue participants when a dependency link is created.

### Core Constraints

- [ ] Dependencies are unidirectional: issue A depends on issue B. The inverse (B blocks A) is derived, not separately stored.
- [ ] Self-dependency is rejected: an issue cannot depend on itself. Return `422` with `{ resource: "IssueDependency", field: "depends_on", code: "invalid", message: "an issue cannot depend on itself" }`.
- [ ] Duplicate links are idempotent: creating a link that already exists returns `200 OK` with the existing link, not an error.
- [ ] Both issues must exist in the same repository. Referencing a non-existent issue number returns `404`.
- [ ] Cross-repository linking is not supported. The API is scoped to a single `/:owner/:repo` context.
- [ ] An issue may have at most 50 dependencies (issues it depends on). Attempting to add a 51st returns `422` with `{ resource: "IssueDependency", field: "dependencies", code: "limit_exceeded", message: "maximum 50 dependencies per issue" }`.
- [ ] An issue may have an unlimited number of dependents (issues that depend on it).
- [ ] Removing a link that does not exist returns `204 No Content` (idempotent, not an error).
- [ ] Creating a dependency on a closed issue is permitted.
- [ ] Deleting an issue removes all dependency relationships where that issue appears as either side (cascade delete).

### Input Validation

- [ ] The `depends_on` issue number must be a positive integer. Zero, negative, or non-numeric values return `400 Bad Request`.
- [ ] The source issue number (in the URL path) must be a positive integer. Zero, negative, or non-numeric values return `400 Bad Request`.
- [ ] A request body with missing `depends_on` field returns `422` with `{ resource: "IssueDependency", field: "depends_on", code: "missing_field" }`.
- [ ] A request body with `depends_on: null` returns `422`.
- [ ] Extra/unknown fields in the request body are silently ignored.

### Edge Cases

- [ ] Creating a bidirectional cycle (A depends on B, B depends on A) is permitted. Codeplane does not enforce DAG constraints.
- [ ] Creating a dependency between two closed issues is permitted.
- [ ] A locked issue still allows dependency management — locking restricts comments, not link operations.
- [ ] Creating a dependency link triggers an issue event on both the source and target issue timelines.
- [ ] The `updated_at` timestamp of both issues is refreshed when a dependency link is created or removed.

## Design

### API Shape

#### Create Dependency Link

**Endpoint:** `POST /api/repos/:owner/:repo/issues/:number/dependencies`

**Authentication:** Required. Session cookie, PAT via `Authorization: Bearer <token>`, or OAuth2 token.

**Content-Type:** `application/json`

**Request Body:**
```typescript
interface CreateIssueDependencyRequest {
  depends_on: number;  // Required. Issue number that this issue depends on.
}
```

**Success Response:** `201 Created` (new link) or `200 OK` (link already exists)
```typescript
interface IssueDependencyResponse {
  issue_number: number;
  depends_on_issue_number: number;
  created_at: string;  // ISO 8601
}
```

**Error Responses:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 400 | Invalid issue number (non-numeric, zero, negative) | `{ message: "invalid issue number" }` |
| 401 | Not authenticated | `{ message: "authentication required" }` |
| 403 | No write access | `{ message: "permission denied" }` |
| 404 | Source or target issue not found | `{ message: "issue not found" }` |
| 422 | Self-dependency, missing field, or limit exceeded | `{ message: "validation failed", errors: [{ resource, field, code, message }] }` |
| 429 | Rate limited | `{ message: "rate limit exceeded" }` with `Retry-After` header |

#### Remove Dependency Link

**Endpoint:** `DELETE /api/repos/:owner/:repo/issues/:number/dependencies/:depends_on_number`

**Authentication:** Required.

**Success Response:** `204 No Content` (idempotent: returns 204 whether the link existed or not)

**Error Responses:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 400 | Invalid issue number | `{ message: "invalid issue number" }` |
| 401 | Not authenticated | `{ message: "authentication required" }` |
| 403 | No write access | `{ message: "permission denied" }` |
| 404 | Source issue not found | `{ message: "issue not found" }` |
| 429 | Rate limited | `{ message: "rate limit exceeded" }` with `Retry-After` header |

#### List Dependencies

**Endpoint:** `GET /api/repos/:owner/:repo/issues/:number/dependencies`

**Authentication:** Optional for public repos; required for private repos.

**Success Response:** `200 OK`
```typescript
interface IssueDependencyListResponse {
  dependencies: Array<{
    issue_number: number;
    depends_on_issue_number: number;
    depends_on_issue: { number: number; title: string; state: "open" | "closed" };
    created_at: string;
  }>;
  dependents: Array<{
    issue_number: number;
    depends_on_issue_number: number;
    dependent_issue: { number: number; title: string; state: "open" | "closed" };
    created_at: string;
  }>;
}
```

### SDK Shape

The SDK exposes dependency management through the `IssueService`:

```typescript
class IssueService {
  async addDependency(actor: AuthUser | null, owner: string, repo: string, issueNumber: number, dependsOnNumber: number): Promise<void>;
  async removeDependency(actor: AuthUser | null, owner: string, repo: string, issueNumber: number, dependsOnNumber: number): Promise<void>;
  async listDependencies(viewer: AuthUser | null, owner: string, repo: string, issueNumber: number): Promise<{ dependencies: Array<{ issueId: number; dependsOnIssueId: number; createdAt: string }>; dependents: Array<{ issueId: number; dependsOnIssueId: number; createdAt: string }> }>;
}
```

The service performs all validation (self-dependency, limit checking), repository resolution, permission checks, and database operations. Route handlers are thin wrappers over this service. The service also creates issue events and triggers webhook delivery after successful link operations.

### Web UI Design

**Dependency Section in Issue Detail Sidebar:**

The issue detail page (`/:owner/:repo/issues/:number`) displays a "Dependencies" section in the sidebar, beneath labels, assignees, and milestone.

| Subsection | Display | Behavior |
|------------|---------|----------|
| **Depends on** | List of linked issue chips: `#N title` with state indicator (green dot for open, purple dot for closed) | Each chip is a link to the target issue. A remove button (×) appears on hover for users with write access. If no dependencies exist, shows "None" in muted text. |
| **Blocks** | List of dependent issue chips: `#N title` with state indicator | Same display as above. Remove button removes the link from the other direction. If no dependents exist, shows "None" in muted text. |

**Add Dependency Flow:**
1. User clicks "+ Add dependency" link in the "Depends on" subsection.
2. A dropdown/popover appears with a typeahead search input.
3. User types an issue number or title substring.
4. Matching issues in the repository are displayed as selectable options showing `#N title` and state.
5. Current issue and already-linked issues are excluded from results.
6. Selecting an option creates the dependency immediately (optimistic UI).
7. On error, the optimistic addition is reverted and an inline error is shown.

**Remove Dependency Flow:**
1. User hovers over a dependency chip and clicks the × button.
2. A confirmation tooltip appears: "Remove dependency on #N?"
3. On confirm, the link is removed immediately (optimistic UI).
4. On error, the link is restored and an inline error is shown.

**Issue Timeline Integration:**
When a dependency is added or removed, an event entry appears in both issues' timelines:
- "alice added a dependency: this issue depends on #8" (on the source issue)
- "alice added a dependent: #12 depends on this issue" (on the target issue)
- "alice removed a dependency: this issue no longer depends on #8" (on removal)

### CLI Command

**Add a dependency link:**
```
codeplane issue link <number> --depends-on <depends-on-number> [--repo <owner/repo>] [--json]
```

**Alias (current compatibility):**
```
codeplane issue link <number> --blocks <blocking-issue-number> [--repo <owner/repo>] [--json]
```

The `--blocks` flag inverts the direction: `issue link 12 --blocks 8` means "issue #12 blocks issue #8", creating a dependency where issue #8 depends on issue #12.

| Flag | Short | Required | Description |
|------|-------|----------|-------------|
| `--depends-on` | `-d` | Yes (or `--blocks`) | Issue number that this issue depends on |
| `--blocks` | `-b` | Yes (or `--depends-on`) | Issue number that this issue blocks |
| `--repo` | `-R` | No | Repository in `owner/repo` format |
| `--json` | | No | Output raw JSON response |

**Output (default):** `Linked: #12 depends on #8`

**Remove:** `codeplane issue unlink <number> --depends-on <depends-on-number> [--repo <owner/repo>]`
**Output:** `Unlinked: #12 no longer depends on #8`

**List:** `codeplane issue deps <number> [--repo <owner/repo>] [--json]`
**Output:**
```
Dependencies for #12:
  Depends on:
    #8   Fix database migration (open)
    #3   Set up CI pipeline (closed)
  Blocks:
    #15  Deploy new feature (open)
```

### TUI UI

The TUI issue detail screen shows a "Dependencies" section below the issue metadata block.

| Element | Rendering | Interaction |
|---------|-----------|-------------|
| Depends-on list | Each line: `→ #N title [open]` or `→ #N title [closed]` | `Enter` navigates to issue. `d` prompts removal. |
| Blocks list | Each line: `← #N title [open]` or `← #N title [closed]` | Same navigation and removal. |
| Empty state | `No dependencies` in dimmed text | — |
| Add action | `a` key: opens fuzzy-search issue picker overlay | |

### Neovim Plugin

- `:CodeplaneIssueLink <number> <depends-on-number>` — Creates a dependency link.
- `:CodeplaneIssueUnlink <number> <depends-on-number>` — Removes a dependency link.
- `:CodeplaneIssueDeps <number>` — Lists dependencies in a quickfix list.

### VS Code Extension

- "Dependencies" section in issue detail webview with clickable links.
- `Codeplane: Link Issue Dependency` command via QuickInput.
- `Codeplane: Unlink Issue Dependency` command via QuickInput.
- Issue tree view sidebar shows "Dependencies" child node under each issue.

### Documentation

- **Concept guide**: Dependency model explanation (depends-on vs. blocks, unidirectional, same-repo scoping).
- **Web UI guide**: Adding and removing dependencies from the issue detail sidebar, with screenshots.
- **CLI reference**: Full docs for `codeplane issue link`, `codeplane issue unlink`, and `codeplane issue deps`.
- **TUI reference**: Keyboard shortcuts for dependency management.
- **API reference**: Full docs for POST, DELETE, and GET on `/api/repos/:owner/:repo/issues/:number/dependencies`.
- **FAQ**: "Can I create circular dependencies?", "Can I link across repositories?", "What happens when I delete a linked issue?"

## Permissions & Security

### Authorization Matrix

| Role | Create Link | Remove Link | View Links |
|------|------------|------------|------------|
| Repository Owner | ✅ Yes | ✅ Yes | ✅ Yes |
| Organization Owner (for org repos) | ✅ Yes | ✅ Yes | ✅ Yes |
| Admin Collaborator | ✅ Yes | ✅ Yes | ✅ Yes |
| Write Collaborator | ✅ Yes | ✅ Yes | ✅ Yes |
| Read Collaborator | ❌ No (403) | ❌ No (403) | ✅ Yes |
| Non-collaborator on public repo | ❌ No (403) | ❌ No (403) | ✅ Yes |
| Non-collaborator on private repo | ❌ No (404) | ❌ No (404) | ❌ No (404 — repo existence hidden) |
| Unauthenticated on public repo | ❌ No (401) | ❌ No (401) | ✅ Yes |
| Unauthenticated on private repo | ❌ No (401) | ❌ No (401) | ❌ No (404) |
| AI Agent (with valid PAT + write access) | ✅ Yes | ✅ Yes | ✅ Yes |
| Deploy Key | ❌ No | ❌ No | ❌ No |

### Rate Limiting

- **Create link:** 60 link creations per hour per user per repository.
- **Remove link:** 60 link removals per hour per user per repository.
- **List dependencies:** 300 requests per hour per user per repository (read-heavy, more generous).
- Rate limit responses return `429 Too Many Requests` with `Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- Rate limit state keyed on `user_id`, not session or IP.

### Data Privacy & PII

- Dependency links themselves contain no PII — only issue IDs and timestamps.
- The list-dependencies response includes issue titles and states, which follow the same visibility rules as the issues themselves.
- No PII leakage risk: the target issue must exist in the same repository, and the caller must have read access to see any data.
- Audit trail: dependency create/remove events include the actor ID, stored in issue events and visible to repository collaborators.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.dependency.created` | Dependency link successfully created | `repo_owner`, `repo_name`, `repo_id`, `source_issue_number`, `depends_on_issue_number`, `actor_id`, `actor_login`, `client_surface` ("api" \| "web" \| "cli" \| "tui" \| "vscode" \| "nvim" \| "agent"), `was_duplicate` (bool), `created_at` |
| `issue.dependency.removed` | Dependency link successfully removed | `repo_owner`, `repo_name`, `repo_id`, `source_issue_number`, `depends_on_issue_number`, `actor_id`, `actor_login`, `client_surface`, `removed_at` |
| `issue.dependency.create_failed` | Dependency creation rejected | `repo_owner`, `repo_name`, `error_code` (400/401/403/404/422/429), `error_reason` (self_dependency/limit_exceeded/not_found/etc.), `client_surface`, `timestamp` |
| `issue.dependency.list_viewed` | User/agent views dependency list | `repo_owner`, `repo_name`, `issue_number`, `dependency_count`, `dependent_count`, `client_surface`, `timestamp` |
| `issue.dependency.navigated` | User clicks a dependency link to navigate to linked issue | `repo_owner`, `repo_name`, `from_issue_number`, `to_issue_number`, `link_direction` ("depends_on" \| "blocks"), `client_surface`, `timestamp` |

### Funnel Metrics

1. **Dependency Feature Adoption:** Percentage of repositories with at least one dependency link. Target: >30% of active repositories within 3 months.
2. **Dependencies per Issue:** Average number of dependency links per issue (across repos that use the feature).
3. **Link Creation → Navigation:** Percentage of created links that are later navigated via click/selection. Measures discovery value. Target: >40%.
4. **Client Surface Distribution:** Which surfaces are used to create/view dependency links. Informs UI investment.
5. **Dependency Depth:** Maximum chain length (A→B→C→...) per repository. Monitors healthy vs. excessive dependency graph complexity.
6. **Blocked Issue Resolution Time:** Mean time-to-close for issues that have open dependencies vs. those that don't. Measures whether the dependency signal helps prioritization.

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Dependency created | `info` | `repo_id`, `repo_name`, `owner`, `source_issue_number`, `depends_on_issue_number`, `actor_id`, `duration_ms` | After successful DB insert and event creation |
| Dependency removed | `info` | `repo_id`, `repo_name`, `owner`, `source_issue_number`, `depends_on_issue_number`, `actor_id`, `duration_ms` | After successful DB delete |
| Dependency creation: self-link rejected | `warn` | `repo_name`, `owner`, `issue_number`, `actor_id` | When an issue attempts to depend on itself |
| Dependency creation: limit exceeded | `warn` | `repo_name`, `owner`, `issue_number`, `current_count`, `actor_id` | When 50-dependency limit is hit |
| Dependency creation: duplicate link | `info` | `repo_name`, `owner`, `source_issue_number`, `depends_on_issue_number`, `actor_id` | When idempotent duplicate is detected |
| Dependency creation: issue not found | `info` | `repo_name`, `owner`, `issue_number`, `actor_id` | When referenced issue does not exist |
| Dependency creation: auth failure | `warn` | `repo_name`, `owner`, `reason` ("unauthenticated" \| "forbidden"), `actor_id` | When 401 or 403 is returned |
| Dependency creation: internal error | `error` | `repo_id`, `repo_name`, `owner`, `actor_id`, `error_message`, `stack_trace` | When DB operation fails unexpectedly |
| Dependency list retrieved | `debug` | `repo_id`, `issue_number`, `dependency_count`, `dependent_count`, `viewer_id`, `duration_ms` | After successful list query |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_dependencies_created_total` | Counter | `owner`, `repo` | Total dependency links created |
| `codeplane_issue_dependencies_removed_total` | Counter | `owner`, `repo` | Total dependency links removed |
| `codeplane_issue_dependency_create_duration_seconds` | Histogram | `status` (success/duplicate/error) | Latency of dependency creation operations |
| `codeplane_issue_dependency_list_duration_seconds` | Histogram | — | Latency of dependency list operations |
| `codeplane_issue_dependency_errors_total` | Counter | `error_type` (validation/auth/not_found/internal/rate_limit) | Dependency operation failures by type |
| `codeplane_issue_dependency_count_gauge` | Gauge | `repo_id` | Current total dependency links per repository |
| `codeplane_issue_dependency_per_issue_max_gauge` | Gauge | `repo_id` | Maximum dependencies on any single issue in the repo |

### Alerts & Runbooks

#### Alert: `IssueDependencyCreateErrorRateHigh`

**Condition:** `rate(codeplane_issue_dependency_errors_total{error_type="internal"}[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check server logs for `dependency creation: internal error` entries. Look for `error_message` and `stack_trace`.
2. Check database connectivity: `SELECT 1` against the primary DB. If DB is unreachable, escalate to database on-call.
3. Check for unique constraint violations on the `issue_dependencies` table — this could indicate a race condition in the idempotency check.
4. Check for recent deployments that may have introduced a regression in the dependency service.
5. If specific to one repository, check for corrupt issue state or an unusually large dependency graph.
6. Temporarily increase logging to `debug` for the issue dependency operations to capture full request context.

#### Alert: `IssueDependencyLatencyHigh`

**Condition:** `histogram_quantile(0.99, rate(codeplane_issue_dependency_create_duration_seconds_bucket[5m])) > 1.0`

**Severity:** Warning

**Runbook:**
1. Check database query latency via `pg_stat_statements` for `issue_dependencies` queries.
2. Check if the dependency count validation query is slow for repositories with many issues.
3. Check for lock contention on the `issue_dependencies` or `issue_events` tables.
4. Profile a sample request to identify the slow segment (validation vs. insert vs. event creation).
5. If the list endpoint is slow, check for issues with extremely high fan-out (many dependents) and consider adding an index or pagination.

#### Alert: `IssueDependencyLimitExceededSpike`

**Condition:** `rate(codeplane_issue_dependency_errors_total{error_type="validation"}[15m]) > 2.0`

**Severity:** Warning

**Runbook:**
1. Identify which users/repos are hitting the 50-dependency limit via structured logs.
2. Determine if this is legitimate workflow usage or abuse.
3. If legitimate and recurring, consider raising the per-issue limit or introducing a configurable org-level limit.
4. If automated agent traffic, review the agent's dependency creation logic for correctness.
5. No immediate action required — this is a soft product signal, not an infrastructure issue.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Failure Mode | Recovery |
|------------|-------------|--------------|----------|
| Self-dependency attempt | 422 | Predictable validation error | User selects a different issue |
| Dependency limit exceeded (50) | 422 | Predictable validation error | User removes existing dependencies first |
| Missing `depends_on` field | 422 | Predictable validation error | User provides the required field |
| Non-numeric issue number | 400 | Client error | User corrects input |
| Source issue not found | 404 | Resolution failure | User corrects issue number |
| Target issue not found | 404 | Resolution failure | User corrects issue number |
| Unauthenticated | 401 | Expected auth boundary | User authenticates |
| No write permission | 403 | Expected auth boundary | User requests access |
| Rate limited | 429 | Expected throttle | User waits for `Retry-After` |
| DB connection lost | 500 | Infrastructure failure | Alert fires, on-call investigates |
| Unique constraint race condition | 500 (or idempotent 200) | Transient concurrency | Retry resolves; robust idempotency prevents duplicates |

## Verification

### API Integration Tests

```
POST /api/repos/:owner/:repo/issues/:number/dependencies
├── Happy Path
│   ├── creates dependency link between two open issues — returns 201 with correct issue_number, depends_on_issue_number, and created_at
│   ├── creates dependency link between open issue and closed issue — returns 201
│   ├── creates dependency link between two closed issues — returns 201
│   ├── creates duplicate link — returns 200 with the existing link (idempotent)
│   ├── creates dependency link and verifies it appears in GET .../dependencies response
│   ├── creates dependency and verifies the target issue's dependents list includes the source
│   ├── creates multiple dependencies on one issue (up to 50) — all return 201
│   └── creates dependency with PAT authentication — returns 201
│
├── Self-Dependency Validation
│   ├── issue depends on itself — returns 422 with resource="IssueDependency", code="invalid"
│   └── self-dependency does not create any link (verify via GET)
│
├── Limit Validation
│   ├── issue with 50 dependencies, adding 51st — returns 422 with code="limit_exceeded"
│   ├── issue with 50 dependencies, removing one then adding — returns 201 (back within limit)
│   └── issue as a dependent of 100+ other issues — no error (no outbound limit)
│
├── Input Validation
│   ├── missing depends_on field — returns 422 with field="depends_on", code="missing_field"
│   ├── depends_on is null — returns 422
│   ├── depends_on is 0 — returns 400
│   ├── depends_on is negative — returns 400
│   ├── depends_on is a string — returns 400
│   ├── depends_on is a float (3.5) — returns 400
│   ├── source issue number is 0 in URL — returns 400
│   ├── source issue number is negative in URL — returns 400
│   ├── source issue number is non-numeric in URL — returns 400
│   └── extra unknown fields in body — returns 201 (ignored)
│
├── Issue Resolution
│   ├── source issue does not exist — returns 404
│   ├── target issue (depends_on) does not exist — returns 404
│   ├── source issue exists, target does not — returns 404 (not 201)
│   └── both issues do not exist — returns 404
│
├── Authentication & Authorization
│   ├── unauthenticated request — returns 401
│   ├── authenticated user with read-only access — returns 403
│   ├── authenticated user with write access — returns 201
│   ├── authenticated user with no access to private repo — returns 404
│   ├── expired/invalid PAT — returns 401
│   └── session-authenticated request with write access — returns 201
│
├── Repository Resolution
│   ├── non-existent owner — returns 404
│   ├── non-existent repo — returns 404
│   ├── owner is case-insensitive — returns 201
│   └── repo name is case-insensitive — returns 201
│
├── Rate Limiting
│   └── exceeding rate limit — returns 429 with Retry-After header
│
├── Event Timeline
│   ├── creating dependency adds event to source issue timeline
│   └── creating dependency adds event to target issue timeline
│
└── Webhook
    ├── dependency creation fires webhook with event_type="issues" and action="dependency_added"
    └── webhook payload includes source and target issue numbers

DELETE /api/repos/:owner/:repo/issues/:number/dependencies/:depends_on_number
├── Happy Path
│   ├── removes existing dependency link — returns 204
│   ├── removes non-existent link (idempotent) — returns 204
│   ├── verifies link no longer appears in GET .../dependencies after removal
│   └── verifies the target issue's dependents no longer includes the source
│
├── Authentication & Authorization
│   ├── unauthenticated request — returns 401
│   ├── read-only user — returns 403
│   ├── write-access user — returns 204
│   └── no access to private repo — returns 404
│
├── Input Validation
│   ├── non-numeric depends_on_number in URL — returns 400
│   ├── zero or negative depends_on_number — returns 400
│   └── source issue does not exist — returns 404
│
├── Event Timeline
│   ├── removing dependency adds removal event to source issue timeline
│   └── removing dependency adds removal event to target issue timeline
│
└── Webhook
    └── dependency removal fires webhook with action="dependency_removed"

GET /api/repos/:owner/:repo/issues/:number/dependencies
├── Happy Path
│   ├── issue with no dependencies — returns 200 with empty arrays
│   ├── issue with dependencies — returns 200 with populated dependencies array, each containing issue detail
│   ├── issue with dependents — returns 200 with populated dependents array, each containing issue detail
│   ├── issue with both dependencies and dependents — returns both arrays
│   ├── dependency entries include issue title, number, and state
│   └── results are ordered by depends_on_issue_number ASC (dependencies) and issue_number ASC (dependents)
│
├── Authentication & Authorization
│   ├── unauthenticated on public repo — returns 200
│   ├── unauthenticated on private repo — returns 404
│   ├── read-only access on private repo — returns 200
│   └── no access on private repo — returns 404
│
├── Issue Resolution
│   ├── non-existent issue — returns 404
│   └── non-numeric issue number — returns 400
│
└── Consistency
    ├── creating a dependency then listing shows it immediately (read-after-write)
    └── removing a dependency then listing omits it immediately (read-after-write)
```

### CLI E2E Tests

```
codeplane issue link
├── links two issues with --depends-on — output: "Linked: #N depends on #M"
├── links two issues with --blocks — output: "Linked: #N blocks #M" (inverted direction)
├── links with --json — output is valid JSON matching IssueDependencyResponse
├── links with --repo flag — link created in specified repo
├── fails with self-dependency — exits non-zero with validation error
├── fails when source issue doesn't exist — exits non-zero with 404 error
├── fails when target issue doesn't exist — exits non-zero with 404 error
├── fails when not authenticated — exits non-zero with auth error
├── fails when user lacks write access — exits non-zero with permission error
├── duplicate link — succeeds idempotently (no error, outputs existing link)
└── verifies link appears in `issue deps` output after creation

codeplane issue unlink
├── unlinks existing dependency — output: "Unlinked: #N no longer depends on #M"
├── unlinks non-existent link — succeeds silently (idempotent)
├── fails when not authenticated — exits non-zero
├── fails when user lacks write access — exits non-zero
└── verifies link no longer appears in `issue deps` output after removal

codeplane issue deps
├── lists dependencies and dependents for an issue — formatted output with issue numbers, titles, states
├── lists dependencies for issue with no links — output: "No dependencies"
├── lists with --json — output is valid JSON matching IssueDependencyListResponse
├── fails for non-existent issue — exits non-zero with 404 error
└── lifecycle: create two issues → link → verify deps → unlink → verify empty deps
```

### Web UI Playwright Tests

```
Issue Detail Page — Dependencies Section (/:owner/:repo/issues/:number)
├── Rendering
│   ├── issue with no dependencies shows "None" in depends-on and blocks subsections
│   ├── issue with dependencies shows linked issue chips with numbers, titles, and state dots
│   ├── issue with dependents shows blocker issue chips with numbers, titles, and state dots
│   ├── open linked issues show green state indicator
│   ├── closed linked issues show purple state indicator
│   └── dependencies section is visible in the sidebar
│
├── Adding a Dependency
│   ├── clicking "+ Add dependency" opens issue search popover
│   ├── typing issue number filters results
│   ├── typing title fragment filters results
│   ├── current issue is excluded from search results
│   ├── already-linked issues are excluded from search results
│   ├── selecting a result creates the link and shows the new chip immediately
│   ├── add popover closes after selection
│   ├── error during creation reverts the optimistic addition and shows inline error
│   └── user without write access does not see "+ Add dependency" link
│
├── Removing a Dependency
│   ├── hovering over a dependency chip shows × button
│   ├── clicking × shows confirmation tooltip
│   ├── confirming removal removes the chip immediately
│   ├── cancelling keeps the chip
│   ├── error during removal restores the chip and shows inline error
│   └── user without write access does not see × button on hover
│
├── Navigation
│   ├── clicking a dependency chip navigates to that issue's detail page
│   └── the linked issue's detail page shows the original issue in its dependents list
│
├── Timeline
│   ├── adding a dependency creates a timeline event on the current issue
│   └── removing a dependency creates a timeline event on the current issue
│
└── Edge Cases
    ├── issue with maximum 50 dependencies renders all chips
    ├── adding 51st dependency shows error message
    ├── rapidly clicking add does not create duplicate links
    └── dependency section updates when navigating between issues without full page reload
```

### TUI Integration Tests

```
TUI Issue Detail — Dependencies
├── Display
│   ├── issue with no dependencies shows "No dependencies"
│   ├── issue with dependencies shows → #N title [state] entries
│   ├── issue with dependents shows ← #N title [state] entries
│   └── dependency entries are navigable with arrow keys
│
├── Adding
│   ├── pressing 'a' opens issue picker overlay
│   ├── typing in picker filters issues
│   ├── selecting an issue creates the link
│   ├── Esc cancels picker without creating link
│   └── self-link attempt shows error message
│
├── Removing
│   ├── pressing 'd' on selected dependency prompts confirmation
│   ├── confirming 'y' removes the dependency
│   ├── pressing 'n' cancels removal
│   └── removal is reflected immediately in the list
│
├── Navigation
│   ├── pressing Enter on a dependency navigates to that issue
│   └── pressing Esc from navigated issue returns to the original issue
│
└── Error Handling
    ├── API error during add shows error toast and does not add entry
    └── API error during remove shows error toast and retains entry
```

### Webhook Integration Tests

```
Issue Dependency Webhooks
├── creating dependency fires webhook with event_type="issues" and action="dependency_added"
├── webhook payload includes source_issue and depends_on_issue objects
├── removing dependency fires webhook with action="dependency_removed"
├── webhook delivery is recorded and visible in webhook deliveries list
└── webhook does not fire for repositories without configured webhooks
```

### Cross-Feature Integration Tests

```
Cross-Feature
├── deleting an issue removes all its dependency links (cascade)
├── deleting an issue that other issues depend on removes those dependency entries
├── issue list API does not include dependency data (separate endpoint)
├── issue detail response does not include inline dependency data (fetched separately)
├── creating a dependency on a locked issue succeeds (locking restricts comments, not links)
├── agent (PAT-based) can create, list, and remove dependencies
└── concurrent dependency creation on same pair — one 201, one 200 (idempotent), no duplicates in DB
```
