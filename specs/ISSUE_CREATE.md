# ISSUE_CREATE

Specification for ISSUE_CREATE.

## High-Level User POV

When a Codeplane user encounters a bug, wants to propose a feature, or needs to track a task, they create an issue against a repository. Issue creation is the primary entry point for all work tracking in Codeplane and is designed to be accessible from every product surface — the web UI, the CLI, the TUI, and editor integrations.

A user navigates to a repository's issue section, initiates creation, provides a title describing the work, and optionally writes a longer description using Markdown. They can immediately associate the issue with other organizational primitives: assigning team members, applying colored labels for categorization, and linking the issue to a milestone for release planning. The system assigns a sequential issue number scoped to the repository, records the creating user as the author, and marks the issue as open.

The experience is designed to be fast and low-friction. A developer in the terminal can create an issue with a single CLI command. A user in the TUI can press `c` from the issue list and fill out a focused form. A user in the web UI can use a full-featured form with autocomplete for assignees, labels, and milestones. AI agents can create issues programmatically through the same API. Regardless of the surface, the result is an immediately visible, linkable, commentable issue that integrates with landing requests, workflows, and workspace automation.

Once created, the issue appears in lists, is searchable, triggers configured webhooks, and becomes the anchor for all subsequent collaboration — comments, state changes, label updates, dependency linking, and eventual resolution through a landing request.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access to a repository can create an issue with a title and receive a `201 Created` response containing the full issue representation.
- [ ] The created issue is immediately visible in issue list endpoints and UI surfaces.
- [ ] The issue number is sequential and unique within the repository.
- [ ] The issue state is always `open` upon creation.
- [ ] The author is automatically set to the authenticated user.
- [ ] All clients (Web UI, CLI, TUI, VS Code, Neovim) can trigger issue creation through their respective interfaces.
- [ ] Webhook events fire for the `issues` event type with action `opened` upon successful creation.

### Required Fields

- [ ] `title` is required. An empty or whitespace-only title must be rejected with a `422` validation error: `{ resource: "Issue", field: "title", code: "missing_field" }`.
- [ ] `title` must be trimmed of leading/trailing whitespace before storage.
- [ ] `title` maximum length is 255 characters. Titles exceeding 255 characters must be rejected with a `422` validation error: `{ resource: "Issue", field: "title", code: "invalid" }`.

### Optional Fields

- [ ] `body` is optional and defaults to an empty string if omitted.
- [ ] `body` supports Markdown content.
- [ ] `body` maximum length is 100,000 characters. Bodies exceeding this limit must be rejected with a `422` validation error.
- [ ] `assignees` is an optional array of usernames. Each username must resolve to a valid existing user. Invalid usernames must be rejected with a `422` validation error: `{ resource: "Issue", field: "assignees", code: "invalid" }`.
- [ ] `labels` is an optional array of label names. Each label name must resolve to a valid label within the target repository. Invalid label names must be rejected with a `422` validation error: `{ resource: "Issue", field: "labels", code: "invalid" }`.
- [ ] `milestone` is an optional milestone ID (integer). If provided, it must refer to a valid milestone within the target repository. Invalid milestone IDs must be rejected with a `422` validation error: `{ resource: "Issue", field: "milestone", code: "invalid" }`.
- [ ] Duplicate usernames in the `assignees` array must be silently deduplicated.
- [ ] Duplicate label names in the `labels` array must be silently deduplicated.

### Edge Cases

- [ ] A request body with no `title` key must return `422`, not `400`.
- [ ] A request body with `title: ""` (empty string) must return `422`.
- [ ] A request body with `title: "   "` (whitespace only) must return `422`.
- [ ] A request body with `title: null` must return `422`.
- [ ] A request with `assignees: []` (empty array) must succeed and create an issue with no assignees.
- [ ] A request with `labels: []` (empty array) must succeed and create an issue with no labels.
- [ ] A request with `milestone: null` or `milestone` omitted must succeed and create an issue with no milestone.
- [ ] A request with a valid `milestone` that belongs to a different repository must return `422`.
- [ ] A request with a closed milestone must still succeed (milestones are valid regardless of state).
- [ ] A request with a mix of valid and invalid assignees must reject the entire request, not partially apply.
- [ ] A request with a mix of valid and invalid labels must reject the entire request, not partially apply.
- [ ] A request with extra/unknown fields must be silently ignored (no error).
- [ ] Creating multiple issues in rapid succession must assign strictly increasing, non-duplicate issue numbers.
- [ ] The `created_at` and `updated_at` timestamps must be set to the server's current time.
- [ ] The `comment_count` must be `0` on a newly created issue.
- [ ] The `closed_at` must be `null` on a newly created issue.
- [ ] The repository's total issue count must be incremented atomically.
- [ ] Title containing special characters (Unicode, emoji, HTML entities, angle brackets, backticks) must be stored verbatim without sanitization or escaping at the storage layer.
- [ ] Body containing Markdown with code blocks, images, links, and HTML must be stored verbatim.

### Authentication & Authorization Boundaries

- [ ] Unauthenticated requests must return `401 Unauthorized`.
- [ ] Authenticated users without write access to the repository must return `403 Forbidden`.
- [ ] Requests targeting a non-existent repository must return `404 Not Found`.
- [ ] Requests targeting a non-existent owner must return `404 Not Found`.
- [ ] PAT-based authentication must work identically to session-based authentication.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/issues`

**Authentication:** Required. Session cookie, PAT via `Authorization: Bearer <token>`, or OAuth2 token.

**Content-Type:** `application/json` (enforced by middleware).

**Request Body:**
```typescript
interface CreateIssueRequest {
  title: string;              // Required. 1–255 characters after trimming.
  body?: string;              // Optional. Max 100,000 characters. Defaults to "".
  assignees?: string[];       // Optional. Array of existing usernames.
  labels?: string[];          // Optional. Array of existing repo label names.
  milestone?: number;         // Optional. Valid milestone ID within this repo.
}
```

**Success Response:** `201 Created`
```typescript
interface IssueResponse {
  id: number;
  number: number;
  title: string;
  body: string;
  state: "open";
  author: {
    id: number;
    login: string;
    avatar_url: string;
  };
  assignees: Array<{
    id: number;
    login: string;
    avatar_url: string;
  }>;
  labels: Array<{
    id: number;
    name: string;
    color: string;
    description: string;
  }>;
  milestone_id: number | null;
  comment_count: 0;
  closed_at: null;
  created_at: string;
  updated_at: string;
}
```

**Error Responses:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 401 | Not authenticated | `{ message: "authentication required" }` |
| 403 | No write access | `{ message: "permission denied" }` |
| 404 | Repository not found | `{ message: "repository not found" }` |
| 422 | Validation failure | `{ message: "validation failed", errors: [{ resource, field, code }] }` |
| 429 | Rate limited | `{ message: "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK exposes issue creation through the `IssueService`:

```typescript
class IssueService {
  async createIssue(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    input: CreateIssueInput,
  ): Promise<IssueResponse>;
}

interface CreateIssueInput {
  title: string;
  body?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}
```

The service performs all validation, repository resolution, permission checks, milestone/assignee/label resolution, and database operations. Route handlers are thin wrappers over this service.

### Web UI Design

**Entry Points:**
- "New Issue" button on the repository issues list page (`/:owner/:repo/issues`)
- Command palette: type "Create Issue" or "New Issue"
- Keyboard shortcut: `c` from the issue list view

**Form Layout:**
The issue creation form is a full page (not a modal) at the route `/:owner/:repo/issues/new`.

| Field | Type | Required | Behavior |
|-------|------|----------|----------|
| Title | Single-line text input | Yes | Auto-focused on page load. Max 255 chars. Character count indicator appears at 230+ chars. |
| Description | Multi-line Markdown editor | No | Supports Markdown preview toggle. Drag-and-drop or paste image upload. Tab inserts indentation within the editor. |
| Assignees | Multi-select dropdown | No | Typeahead search over repository collaborators. Displays avatar + username. |
| Labels | Multi-select dropdown | No | Typeahead search over repository labels. Displays color swatch + label name. |
| Milestone | Single-select dropdown | No | Lists open milestones for the repository. Shows milestone title and due date if set. |

**Submit Button:**
- Text: "Create issue"
- Disabled until title is non-empty
- Shows spinner and "Creating…" during submission
- Disabled during submission to prevent double-submit
- On success: navigates to the newly created issue detail page (`/:owner/:repo/issues/:number`)
- On error: re-enables form, displays inline error banner at top of form

**Validation UX:**
- Client-side: title must be non-empty. Inline error "Title is required" below the title field.
- Server-side validation errors map to the appropriate form field with error text below the field.

### CLI Command

```
codeplane issue create --title <title> [--body <body>] [--assignee <username>] [--label <name>] [--milestone <id>] [--repo <owner/repo>] [--json]
```

**Positional shorthand:** `codeplane issue create "My issue title"` (title as first positional argument).

**Flags:**

| Flag | Short | Required | Description |
|------|-------|----------|-------------|
| `--title` | `-t` | Yes (or positional) | Issue title |
| `--body` | `-b` | No | Issue body/description |
| `--assignee` | `-a` | No | Assignee username (can be repeated for multiple) |
| `--label` | `-l` | No | Label name (can be repeated for multiple) |
| `--milestone` | `-m` | No | Milestone ID or title |
| `--repo` | `-R` | No | Repository in `owner/repo` format. Defaults to current repo context. |
| `--json` | | No | Output raw JSON response |

**Output (default):** `Created issue #N: <title>`

**Output (--json):** Full `IssueResponse` JSON object.

**Errors:** Printed to stderr with non-zero exit code. Error message matches the server error (e.g., "Error: validation failed — title: missing_field").

### TUI UI

**Entry Points:**
- Press `c` from the issue list screen
- Command palette: `:create issue`
- Go-to shortcut: `g i` then `c`

**Form Fields:**
1. **Title** — Single-line text input. Pre-focused. Max 255 characters enforced at input. Inline error "Title is required" displayed on empty submit.
2. **Description** — Multi-line textarea with scroll. Markdown supported. `Enter` inserts newline. Height is responsive to terminal size (5 lines at 80×24, 10 lines at 120×40, 16+ lines at 200×60+).
3. **Assignees** — Multi-select dropdown overlay. Loads collaborators on mount. Fuzzy search. `Space` toggles selection. `Enter` confirms.
4. **Labels** — Multi-select dropdown overlay. Color-coded with ANSI colors. Loads repository labels on mount.
5. **Milestone** — Single-select dropdown overlay. Shows open milestones only. Includes "None" option.

**Keyboard Navigation:**
- `Tab` / `Shift+Tab` — Cycle through fields
- `Ctrl+S` — Submit from any field
- `Esc` — Cancel (with confirmation if form is dirty)

**Submission:**
- Button text changes to "Creating…"
- All fields become non-interactive
- On success: navigates to the created issue's detail view
- On error: re-enables form, shows error at top

**Double-Submit Prevention:** `Ctrl+S` is ignored while submission is in flight.

### VS Code Extension

The VS Code extension provides:
- Command: `Codeplane: Create Issue` accessible via the command palette (`Cmd+Shift+P`)
- The command opens a QuickInput flow: first prompts for title, then optionally for body
- On success: shows information notification "Issue #N created" with a button to open in browser
- Requires active daemon connection or authenticated server context

### Neovim Plugin

The Neovim plugin provides:
- Command: `:CodeplaneIssueCreate` with optional arguments `title="..." body="..."`
- Interactive mode: if called without arguments, opens a split buffer for title input and a second buffer for body
- On success: echoes "Issue #N created" and optionally opens the issue URL via `vim.ui.open`
- Uses the daemon or configured server for API calls

### Documentation

End-user documentation must include:
- **Quickstart guide section** on creating your first issue, covering Web, CLI, and TUI
- **API reference** for `POST /api/repos/:owner/:repo/issues` with request/response examples and all error codes
- **CLI reference** for `codeplane issue create` with all flags, examples, and `--json` usage
- **TUI reference** showing keyboard shortcuts and form navigation for issue creation
- **Editor integration guides** for VS Code command palette and Neovim commands
- **Permissions guide** clarifying write-access requirement and how to grant it

## Permissions & Security

### Authorization Matrix

| Role | Can Create Issues? |
|------|--------------------|
| Repository Owner | ✅ Yes |
| Organization Owner (for org repos) | ✅ Yes |
| Admin Collaborator | ✅ Yes |
| Write Collaborator | ✅ Yes |
| Read Collaborator | ❌ No (403) |
| Non-collaborator on public repo | ❌ No (403) |
| Non-collaborator on private repo | ❌ No (404 — repo existence hidden) |
| Unauthenticated | ❌ No (401) |
| AI Agent (with valid PAT + write access) | ✅ Yes |
| Deploy Key | ❌ No (deploy keys are for transport, not API) |

### Rate Limiting

- **Authenticated users:** 30 issue creations per hour per user per repository.
- **Global per-user:** 120 issue creations per hour across all repositories.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header in seconds and `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.
- Rate limit state keyed on `user_id`, not session or IP, to prevent circumvention via multiple sessions.

### Data Privacy & PII

- Issue title and body may contain user-entered PII. No automatic PII scanning is performed.
- Issue author identity (username, avatar URL) is exposed in the response. This is public information for public repos and visible to all collaborators on private repos.
- Assignee usernames are validated against existing users — the API does not leak whether a username exists if the caller lacks repository access (the 404 for private repos hides the repo, and assignee validation only runs after write-access is confirmed).
- Search indexing: issue title and body are indexed for full-text search. Ensure the search index respects the same visibility rules as the issue itself.

### Input Sanitization

- Titles and bodies are stored verbatim. Rendering layers (web UI, TUI) must sanitize/escape output to prevent XSS or terminal injection.
- The API layer does not strip HTML or Markdown — that is a rendering concern.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.created` | Issue successfully created (201 response) | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `author_id`, `author_login`, `has_body` (bool), `body_length` (int), `assignee_count` (int), `label_count` (int), `has_milestone` (bool), `client_surface` ("api" \| "web" \| "cli" \| "tui" \| "vscode" \| "nvim" \| "agent"), `created_at` |
| `issue.create_failed` | Issue creation rejected (4xx response) | `repo_owner`, `repo_name`, `error_code` (401/403/404/422/429), `error_field` (if 422), `client_surface`, `timestamp` |
| `issue.create_form.opened` | User opens issue creation form (UI/TUI only) | `repo_owner`, `repo_name`, `client_surface`, `entry_point` ("button" \| "keyboard" \| "palette" \| "deeplink") |
| `issue.create_form.abandoned` | User cancels/leaves form without submitting | `repo_owner`, `repo_name`, `client_surface`, `had_title` (bool), `had_body` (bool), `time_spent_ms` |

### Funnel Metrics

1. **Form Open → Submit Attempt:** Measures friction in the creation form. Target: >70% of form opens result in a submit attempt.
2. **Submit Attempt → Successful Creation:** Measures validation/error rate. Target: >95% of submit attempts succeed.
3. **Issues Created per Active User per Week:** Measures adoption. Baseline to be established post-launch.
4. **Client Surface Distribution:** Percentage of issues created via web vs. CLI vs. TUI vs. editors vs. API-direct. Informs investment priorities.
5. **Time-to-First-Issue:** Time from account creation to first issue created. Measures onboarding success.
6. **Metadata Attachment Rate:** Percentage of issues created with at least one label, assignee, or milestone. Measures feature discovery.

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Issue created | `info` | `repo_id`, `repo_name`, `owner`, `issue_id`, `issue_number`, `author_id`, `assignee_count`, `label_count`, `has_milestone`, `duration_ms` | After successful DB insert and all associations |
| Issue creation validation failure | `warn` | `repo_name`, `owner`, `field`, `code`, `actor_id` | When service throws `validationFailed` |
| Issue creation auth failure | `warn` | `repo_name`, `owner`, `reason` ("unauthenticated" \| "forbidden"), `actor_id` (if available) | When 401 or 403 is returned |
| Issue creation repo not found | `info` | `owner`, `repo`, `actor_id` | When repository resolution fails |
| Issue creation internal error | `error` | `repo_id`, `owner`, `repo_name`, `actor_id`, `error_message`, `stack_trace` | When DB insert or association write fails |
| Assignee resolution failure | `warn` | `repo_id`, `username`, `actor_id` | When an assignee username doesn't resolve |
| Label resolution failure | `warn` | `repo_id`, `label_name`, `actor_id` | When a label name doesn't resolve |
| Milestone resolution failure | `warn` | `repo_id`, `milestone_id`, `actor_id` | When a milestone ID doesn't resolve |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issues_created_total` | Counter | `owner`, `repo` | Total issues created |
| `codeplane_issue_create_duration_seconds` | Histogram | `status` (success/error) | End-to-end latency of issue creation (service layer) |
| `codeplane_issue_create_errors_total` | Counter | `error_type` (validation/auth/not_found/internal/rate_limit) | Issue creation failures by type |
| `codeplane_issue_create_validation_errors_total` | Counter | `field` (title/assignees/labels/milestone) | Validation errors by field |
| `codeplane_issue_create_metadata_total` | Counter | `metadata_type` (assignee/label/milestone) | Metadata attached during issue creation |
| `codeplane_issue_number_sequence_gauge` | Gauge | `repo_id` | Current highest issue number per repo (for monitoring sequence gaps) |

### Alerts & Runbooks

#### Alert: `IssueCreateErrorRateHigh`

**Condition:** `rate(codeplane_issue_create_errors_total{error_type="internal"}[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check server logs for `issue creation internal error` entries. Look for `error_message` and `stack_trace`.
2. Check database connectivity: `SELECT 1` against the primary DB. If DB is unreachable, escalate to database on-call.
3. Check if the `get_next_issue_number` function is failing — this could indicate sequence exhaustion or lock contention. Query: `SELECT max(number) FROM issues WHERE repository_id = $1`.
4. Check for recent deployments that may have introduced a regression.
5. If specific to one repository, check for corrupt repository state or unusually high write volume.
6. Temporarily increase logging to `debug` for the issue service to capture full request payloads.

#### Alert: `IssueCreateLatencyHigh`

**Condition:** `histogram_quantile(0.99, rate(codeplane_issue_create_duration_seconds_bucket[5m])) > 2.0`

**Severity:** Warning

**Runbook:**
1. Check database query latency via `pg_stat_statements` for issue-related queries.
2. Check if assignee/label/milestone resolution is slow — each requires additional DB lookups.
3. Check for lock contention on the `issues` table or the `repositories` table (for issue count increment).
4. Check if webhook delivery is blocking the response (it should be async — verify).
5. Profile a sample request if the issue is intermittent.

#### Alert: `IssueCreateRateLimitSpiking`

**Condition:** `rate(codeplane_issue_create_errors_total{error_type="rate_limit"}[5m]) > 1.0`

**Severity:** Warning

**Runbook:**
1. Identify the user(s) hitting rate limits via structured logs.
2. Determine if this is legitimate automation (e.g., an agent creating issues in bulk) or abuse.
3. If legitimate: consider raising per-user limits or adding an allowlist for agent accounts.
4. If abuse: consider temporary account suspension or IP-level blocks via the admin interface.
5. Review the rate limit configuration to ensure it's appropriately tuned.

#### Alert: `IssueNumberSequenceGap`

**Condition:** `changes(codeplane_issue_number_sequence_gauge[1h]) > 0 AND (codeplane_issue_number_sequence_gauge - codeplane_issue_number_sequence_gauge offset 1h) > (sum(increase(codeplane_issues_created_total[1h])) by (repo_id)) * 1.1`

**Severity:** Warning

**Runbook:**
1. Check for failed transactions that incremented the sequence but rolled back the issue insert.
2. Query the database for gaps: `SELECT number FROM issues WHERE repository_id = $1 ORDER BY number` and compare with the sequence value.
3. Gaps are cosmetic (not functional), but large gaps may indicate transaction failures that need investigation.
4. If the sequence is significantly ahead, check for concurrent issue creation under high load causing sequence skips.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Failure Mode | Recovery |
|------------|-------------|--------------|----------|
| Empty/missing title | 422 | Predictable validation error | User fixes input |
| Title too long (>255 chars) | 422 | Predictable validation error | User shortens title |
| Body too long (>100k chars) | 422 | Predictable validation error | User shortens body |
| Invalid assignee username | 422 | Predictable validation error | User corrects username |
| Invalid label name | 422 | Predictable validation error | User corrects label name |
| Invalid milestone ID | 422 | Predictable validation error | User selects valid milestone |
| Unauthenticated | 401 | Expected auth boundary | User authenticates |
| No write permission | 403 | Expected auth boundary | User requests access |
| Repository not found | 404 | Expected resolution failure | User corrects owner/repo |
| Rate limited | 429 | Expected throttle | User waits for `Retry-After` |
| DB connection lost | 500 | Infrastructure failure | Alert fires, on-call investigates |
| Sequence function failure | 500 | Infrastructure failure | Alert fires, check DB functions |
| Transaction deadlock | 500 (retry) | Transient | Automatic retry or user retry |
| Malformed JSON body | 400 | Client error | User fixes request format |

## Verification

### API Integration Tests

```
POST /api/repos/:owner/:repo/issues
├── Happy Path
│   ├── creates issue with title only — returns 201, issue number=1, state=open, empty body, no assignees, no labels, no milestone
│   ├── creates issue with title and body — returns 201, body matches input
│   ├── creates issue with title, body, assignees, labels, and milestone — returns 201, all fields populated correctly
│   ├── creates issue with title containing 255 characters (maximum) — returns 201, title stored verbatim
│   ├── creates issue with body containing 100,000 characters (maximum) — returns 201, body stored verbatim
│   ├── creates issue with Unicode title (emoji, CJK, RTL, diacritics) — returns 201, title stored verbatim
│   ├── creates issue with Markdown body (code blocks, images, links, tables) — returns 201, body stored verbatim
│   ├── creates issue with HTML in title — returns 201, HTML stored verbatim (not escaped at storage)
│   ├── creates issue with multiple assignees — returns 201, all assignees present in response
│   ├── creates issue with multiple labels — returns 201, all labels present with correct colors
│   ├── creates issue with duplicate assignees in request — returns 201, deduplicated assignees in response
│   ├── creates issue with duplicate labels in request — returns 201, deduplicated labels in response
│   ├── creates issue with empty assignees array — returns 201, assignees is empty array
│   ├── creates issue with empty labels array — returns 201, labels is empty array
│   ├── creates issue with milestone=null — returns 201, milestone_id is null
│   ├── second issue in same repo gets number=2 — returns 201, sequential numbering
│   ├── issue in different repo starts at number=1 — returns 201, per-repo numbering
│   ├── created_at and updated_at are recent ISO 8601 timestamps
│   ├── comment_count is 0 on new issue
│   ├── closed_at is null on new issue
│   ├── response includes author with correct login matching the authenticated user
│   └── issue appears in GET /api/repos/:owner/:repo/issues list after creation
│
├── Title Validation
│   ├── missing title field — returns 422 with field="title", code="missing_field"
│   ├── title is empty string "" — returns 422
│   ├── title is whitespace only "   " — returns 422
│   ├── title is null — returns 422
│   ├── title exceeds 255 characters (256 chars) — returns 422 with field="title", code="invalid"
│   └── title with leading/trailing whitespace — returns 201, title is trimmed
│
├── Body Validation
│   ├── body exceeds 100,000 characters (100,001 chars) — returns 422
│   └── body is null — returns 201, body defaults to empty string
│
├── Assignee Validation
│   ├── assignee username does not exist — returns 422 with field="assignees", code="invalid"
│   ├── one valid and one invalid assignee — returns 422, no issue created (atomic rejection)
│   └── assignee is empty string in array — returns 422
│
├── Label Validation
│   ├── label name does not exist in repository — returns 422 with field="labels", code="invalid"
│   ├── one valid and one invalid label — returns 422, no issue created (atomic rejection)
│   ├── label exists in different repository — returns 422
│   └── label is empty string in array — returns 422
│
├── Milestone Validation
│   ├── milestone ID does not exist — returns 422 with field="milestone", code="invalid"
│   ├── milestone belongs to different repository — returns 422
│   ├── milestone ID is 0 — returns 422
│   ├── milestone ID is negative — returns 422
│   └── milestone ID is non-integer string — returns 422 or 400
│
├── Authentication & Authorization
│   ├── unauthenticated request — returns 401
│   ├── PAT-authenticated request with write access — returns 201
│   ├── session-authenticated request with write access — returns 201
│   ├── authenticated user with read-only access — returns 403
│   ├── authenticated user with no access to private repo — returns 404
│   ├── authenticated user with no access to public repo (non-collaborator) — returns 403
│   └── expired/invalid PAT — returns 401
│
├── Repository Resolution
│   ├── non-existent owner — returns 404
│   ├── non-existent repo under valid owner — returns 404
│   ├── owner is case-insensitive — returns 201 with correct repo context
│   └── repo name is case-insensitive — returns 201 with correct repo context
│
├── Request Format
│   ├── non-JSON content type — returns 400 or 415
│   ├── malformed JSON body — returns 400
│   ├── extra unknown fields in body — returns 201 (ignored)
│   └── empty request body {} — returns 422 (missing title)
│
├── Rate Limiting
│   └── exceeding rate limit — returns 429 with Retry-After header
│
└── Concurrency
    ├── 10 concurrent issue creations on same repo — all succeed with unique sequential numbers
    └── rapid sequential creation — numbers are strictly increasing with no gaps
```

### CLI E2E Tests

```
codeplane issue create
├── creates issue with --title flag — output contains "Created issue #N: <title>"
├── creates issue with positional title argument — same output
├── creates issue with --title and --body — issue body matches when viewed
├── creates issue with --assignee — issue assignees contain the specified user
├── creates issue with --label — issue labels contain the specified label (requires label pre-creation)
├── creates issue with --milestone — issue milestone_id matches
├── creates issue with --json — output is valid JSON matching IssueResponse schema
├── creates issue with --repo flag overriding context — issue created in specified repo
├── fails without --title and no positional arg — exits non-zero with error message
├── fails with empty title "" — exits non-zero with validation error
├── fails when not authenticated — exits non-zero with auth error
├── fails when repo does not exist — exits non-zero with 404 error
├── fails when user lacks write access — exits non-zero with permission error
├── creates issue and verifies it appears in `issue list` output
├── creates issue and verifies `issue view N` returns full details
└── lifecycle: create → assign → label → comment → close → reopen (sequential)
```

### Web UI Playwright Tests

```
Issue Creation Page (/:owner/:repo/issues/new)
├── Navigation
│   ├── navigating to issues/new shows the creation form
│   ├── "New Issue" button on issue list navigates to creation form
│   └── command palette "Create Issue" navigates to creation form
│
├── Form Rendering
│   ├── title input is present and auto-focused
│   ├── description textarea/editor is present
│   ├── assignees dropdown is present and shows collaborators on click
│   ├── labels dropdown is present and shows repo labels with color swatches on click
│   ├── milestone dropdown is present and shows open milestones on click
│   └── submit button is present and initially disabled (no title)
│
├── Form Interaction
│   ├── typing in title enables the submit button
│   ├── clearing the title disables the submit button
│   ├── assignees dropdown allows selecting multiple users
│   ├── labels dropdown allows selecting multiple labels
│   ├── milestone dropdown allows selecting one milestone
│   ├── description supports Markdown input with preview toggle
│   └── tab order follows: title → description → assignees → labels → milestone → submit
│
├── Submission
│   ├── submitting with valid title creates issue and redirects to issue detail page
│   ├── submit button shows loading state during submission
│   ├── submit button is disabled during submission (no double submit)
│   ├── form fields are disabled during submission
│   ├── created issue detail page shows correct title, body, assignees, labels, milestone
│   └── created issue appears in the issue list page
│
├── Validation
│   ├── submitting with empty title shows inline error "Title is required"
│   ├── server-side validation error (e.g., invalid label) shows error banner
│   └── error state clears when user edits the errored field
│
├── Error States
│   ├── 403 error shows permission denied message
│   ├── 429 error shows rate limit message
│   ├── network error shows connection error with retry option
│   └── form re-enables after error (user can fix and retry)
│
└── Edge Cases
    ├── submitting issue with maximum title length (255 chars) succeeds
    ├── submitting issue with long body (10,000+ chars) succeeds
    ├── navigating away from dirty form shows confirmation dialog
    └── unauthenticated user is redirected to login
```

### TUI Integration Tests

```
TUI Issue Create Form
├── Form Access
│   ├── pressing 'c' from issue list opens create form
│   ├── command palette ':create issue' opens create form
│   └── form opens with title field focused
│
├── Field Interaction
│   ├── typing title populates the field
│   ├── Tab advances to next field
│   ├── Shift+Tab returns to previous field
│   ├── description field accepts multi-line input (Enter inserts newline)
│   ├── assignees selector opens overlay and allows selection
│   ├── labels selector opens overlay and allows selection
│   └── milestone selector opens overlay and allows selection
│
├── Submission
│   ├── Ctrl+S submits the form
│   ├── successful submission navigates to issue detail view
│   ├── submit shows "Creating…" state
│   └── Ctrl+S during submission is ignored (no double submit)
│
├── Validation
│   ├── submitting with empty title shows "Title is required" error
│   └── title field receives focus after validation error
│
├── Cancellation
│   ├── Esc on empty form closes immediately
│   └── Esc on dirty form shows discard confirmation
│
└── Error Recovery
    ├── API error re-enables form
    ├── error message is displayed
    └── user can modify and resubmit
```

### Webhook Integration Tests

```
Issue Creation Webhook
├── webhook with "issues" event type fires on issue creation
├── webhook payload includes action="opened" and full issue object
├── webhook delivery is recorded and visible in webhook deliveries list
└── webhook does not fire for repositories without configured webhooks
```
