# ISSUE_CREATE_UI

Specification for ISSUE_CREATE_UI.

## High-Level User POV

## User POV

When a Codeplane user encounters a bug, wants to propose a feature, or needs to track a piece of work, they create an issue against a repository. Issue creation is the single most common entry point for all work tracking in Codeplane and is designed to be reachable from every product surface — the web UI, the CLI, the TUI, editor integrations, and AI agent tooling.

A user navigates to a repository's issue section and initiates creation. The experience differs by surface but converges on the same outcome: the user provides a title describing the work, optionally writes a longer Markdown description, and optionally associates the issue with organizational primitives — assigning team members, applying colored labels for categorization, and linking the issue to a milestone for release planning. The system assigns a sequential issue number scoped to the repository, records the creating user as the author, and marks the issue as open.

The experience is designed to be fast and low-friction. In the web UI, a full-featured form with typeahead for assignees, labels, and milestones allows power users to fully categorize an issue in one action. In the terminal TUI, pressing `c` from the issue list opens a focused form with keyboard-driven selectors. A developer in the terminal can create an issue with a single CLI command and flags. VS Code and Neovim users can create issues without leaving their editor. AI agents can create issues programmatically through the same API, with an enriched body template that includes contextual system information.

Regardless of the surface, the result is identical: an immediately visible, searchable, linkable, commentable issue that integrates with landing requests, workflows, workspace automation, and webhook delivery. Once created, the issue appears in lists across all clients, is indexed for full-text search, triggers configured webhooks with an `issues` event and `opened` action, and becomes the anchor for all subsequent collaboration — comments, state changes, label updates, assignee changes, dependency linking, and eventual resolution through a landing request.

## Acceptance Criteria

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access to a repository can create an issue with a title and receive a `201 Created` response containing the full issue representation.
- [ ] The created issue is immediately visible in issue list endpoints and all UI surfaces (web, TUI, CLI `issue list`).
- [ ] The issue number is sequential and unique within the repository, with no gaps under normal operation.
- [ ] The issue state is always `open` upon creation.
- [ ] The author is automatically set to the authenticated user — callers cannot override the author.
- [ ] All clients (Web UI, CLI, TUI, VS Code, Neovim, AI agent tool) can trigger issue creation through their respective interfaces.
- [ ] Webhook events fire for the `issues` event type with action `opened` upon successful creation.
- [ ] The issue is indexed for full-text search (title and body) and respects repository visibility rules.

### Required Fields

- [ ] `title` is required. An empty, whitespace-only, or missing title must be rejected with a `422` validation error: `{ resource: "Issue", field: "title", code: "missing_field" }`.
- [ ] `title` must be trimmed of leading and trailing whitespace before storage.
- [ ] `title` maximum length is 255 characters after trimming. Titles exceeding 255 characters must be rejected with a `422` validation error: `{ resource: "Issue", field: "title", code: "invalid" }`.
- [ ] `title: null` must be rejected with a `422` validation error.

### Optional Fields

- [ ] `body` is optional and defaults to an empty string if omitted.
- [ ] `body` supports arbitrary Markdown content including code blocks, images, links, tables, and HTML.
- [ ] `body` maximum length is 100,000 characters. Bodies exceeding this limit must be rejected with a `422` validation error.
- [ ] `assignees` is an optional array of usernames. Each username must resolve to a valid existing user. If any username is invalid, the entire request must be rejected atomically (no partial application) with a `422`: `{ resource: "Issue", field: "assignees", code: "invalid" }`.
- [ ] `labels` is an optional array of label names. Each label name must resolve to a valid label within the target repository. If any label name is invalid, the entire request must be rejected atomically with a `422`: `{ resource: "Issue", field: "labels", code: "invalid" }`.
- [ ] `milestone` is an optional milestone ID (positive integer). If provided, it must refer to a valid milestone within the target repository regardless of milestone state. Invalid milestone IDs must be rejected with a `422`: `{ resource: "Issue", field: "milestone", code: "invalid" }`.
- [ ] Duplicate usernames in the `assignees` array must be silently deduplicated.
- [ ] Duplicate label names in the `labels` array must be silently deduplicated.
- [ ] Assignee usernames are matched case-insensitively (trimmed and lowercased).
- [ ] Label names are matched case-sensitively.

### Edge Cases

- [ ] A request body with no `title` key must return `422`, not `400`.
- [ ] A request body with `title: ""` (empty string) must return `422`.
- [ ] A request body with `title: "   "` (whitespace only) must return `422`.
- [ ] A request body with `title: null` must return `422`.
- [ ] A request with `assignees: []` (empty array) must succeed and create an issue with no assignees.
- [ ] A request with `labels: []` (empty array) must succeed and create an issue with no labels.
- [ ] A request with `milestone: null` or `milestone` omitted must succeed with no milestone.
- [ ] A request with a valid milestone belonging to a different repository must return `422`.
- [ ] A request with a closed milestone must succeed (milestones are valid regardless of state).
- [ ] A request with a mix of valid and invalid assignees must reject the entire request atomically.
- [ ] A request with a mix of valid and invalid labels must reject the entire request atomically.
- [ ] A request with extra/unknown fields in the body must be silently ignored (no error).
- [ ] Creating multiple issues in rapid succession must assign strictly increasing, non-duplicate issue numbers.
- [ ] The `created_at` and `updated_at` timestamps must be set to the server's current time (ISO 8601).
- [ ] The `comment_count` must be `0` on a newly created issue.
- [ ] The `closed_at` must be `null` on a newly created issue.
- [ ] The repository's total issue count must be incremented atomically.
- [ ] Title containing special characters (Unicode, emoji, CJK, RTL, diacritics, HTML entities, angle brackets, backticks) must be stored verbatim without sanitization or escaping at the storage layer.
- [ ] Body containing Markdown with code blocks, images, links, and embedded HTML must be stored verbatim.
- [ ] A request with `milestone: 0` or `milestone: -1` must return `422`.
- [ ] A request with an empty string assignee `[""]` in the array must return `422`.
- [ ] A request with an empty string label `[""]` in the array must return `422`.
- [ ] An empty request body `{}` must return `422` (missing title).
- [ ] Non-JSON content type must return `400` or `415`.
- [ ] Malformed JSON body must return `400`.

## Design

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

---

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

---

### Web UI Design

**Entry Points:**
- "New Issue" button on the repository issues list page (`/:owner/:repo/issues`)
- Command palette: type "Create Issue" or "New Issue"
- Keyboard shortcut: `c` from the issue list view

**Route:** `/:owner/:repo/issues/new` — a full page (not a modal).

**Form Layout:**

| Field | Type | Required | Behavior |
|-------|------|----------|----------|
| Title | Single-line text input | Yes | Auto-focused on page load. Max 255 chars. Character count indicator appears when 230+ chars are entered, showing remaining count. |
| Description | Multi-line Markdown editor | No | Supports Markdown preview toggle (Write/Preview tabs). Drag-and-drop or clipboard-paste image upload. Tab key inserts indentation within the editor (does not advance focus). |
| Assignees | Multi-select dropdown | No | Typeahead search over repository collaborators. Displays avatar + username for each option. Selected items shown as removable chips above the dropdown. |
| Labels | Multi-select dropdown | No | Typeahead search over repository labels. Displays color swatch (small circle) + label name for each option. Selected labels shown as colored chips. |
| Milestone | Single-select dropdown | No | Lists open milestones for the repository. Shows milestone title and due date (if set). "None" is the default selection. |

**Submit Button:**
- Text: "Create issue"
- Disabled until title is non-empty (client-side gate)
- Shows spinner icon and "Creating…" text during submission
- Disabled during submission to prevent double-submit
- All form fields become read-only during submission
- On success: navigates to the newly created issue detail page (`/:owner/:repo/issues/:number`)
- On error: re-enables form, displays inline error banner at top of form with the error message

**Validation UX:**
- Client-side: title must be non-empty. Inline error "Title is required" displayed below the title field with red styling.
- Character count indicator turns red when at 255 characters.
- Server-side validation errors (422) are mapped to the appropriate form field with error text below the field. If the error cannot be mapped to a specific field, it shows as a top-level error banner.
- Error styling clears when the user edits the errored field.

**Dirty Form Protection:**
- If any field has been modified and the user attempts to navigate away (browser back, sidebar link, etc.), a confirmation dialog appears: "You have unsaved changes. Are you sure you want to leave?"
- `beforeunload` browser event is also intercepted.

**Empty/Error States:**
- If collaborator list fails to load: assignees dropdown shows "Unable to load collaborators" with a retry link.
- If labels list fails to load: labels dropdown shows "Unable to load labels" with a retry link.
- If milestones list fails to load: milestone dropdown shows "Unable to load milestones" with a retry link.
- If no labels exist in the repository: labels dropdown shows "No labels — create one" with a link to label management.
- If no milestones exist: milestone dropdown shows "No milestones".
- If no collaborators exist: assignees dropdown shows "No collaborators".

---

### CLI Command

```
codeplane issue create [title] [--title <title>] [--body <body>] [--assignee <username>] [--label <name>] [--milestone <id>] [--repo <owner/repo>] [--json]
```

**Positional shorthand:** `codeplane issue create "My issue title"` (title as first positional argument).

**Flags:**

| Flag | Short | Required | Description |
|------|-------|----------|-------------|
| `--title` | `-t` | Yes (or positional) | Issue title |
| `--body` | `-b` | No | Issue body/description |
| `--assignee` | `-a` | No | Assignee username (repeatable for multiple) |
| `--label` | `-l` | No | Label name (repeatable for multiple) |
| `--milestone` | `-m` | No | Milestone ID |
| `--repo` | `-R` | No | Repository in `owner/repo` format. Defaults to current repo context. |
| `--json` | | No | Output raw JSON response |

**Output (default):** `Created issue #N: <title>`

**Output (--json):** Full `IssueResponse` JSON object.

**Errors:** Printed to stderr with non-zero exit code. Error message matches the server error (e.g., `Error: validation failed — title: missing_field`).

**Exit Codes:**
- `0`: Success
- `1`: Error (validation, auth, network, etc.)

---

### TUI UI

**Entry Points:**
- Press `c` from the issue list screen
- Command palette (`:`) → type "create issue"
- Go-to shortcut: `g i` then `c`

**Screen:** Full-content area between header bar and status bar. Breadcrumb: `Dashboard > owner/repo > Issues > New Issue`.

**Form Fields (in tab order):**
1. **Title** — Single-line text input. Pre-focused. Max 255 characters enforced at input time (stops accepting characters beyond 255). Inline error "Title is required" on empty submit.
2. **Description** — Multi-line textarea in a scrollbox. Markdown supported. `Enter` inserts newline. Scrollable for long content. Responsive height (5 lines at 80×24, 10 lines at 120×40, 16+ lines at 200×60+).
3. **Assignees** — Multi-select dropdown overlay. Loads collaborators on mount. `Enter` opens, `j`/`k` or `Up`/`Down` navigates, `Space` toggles selection, `/` filters, `Enter` confirms. Shows "(no collaborators)" if empty.
4. **Labels** — Multi-select dropdown overlay. Color-coded with ANSI colors (● prefix). Loads repo labels on mount. Same interaction model as assignees.
5. **Milestone** — Single-select dropdown overlay. Shows open milestones plus "None" option. Shows "(no milestones)" if empty.
6. **Submit** button — Text changes to "Creating…" during submission.
7. **Cancel** button.

**Keyboard Navigation:**
- `Tab` / `Shift+Tab` — Cycle through all 7 tab stops (wraps around)
- `Ctrl+S` — Submit from any field
- `Esc` — Cancel (immediate if form is clean, confirmation prompt "Discard changes? (y/n)" if dirty)
- `R` — Retry submission after an error
- `?` — Help overlay showing all keybindings

**Submission:**
- Client-side validation: title required (non-empty after trim)
- On submit: all fields become non-interactive, button shows "Creating…"
- On success: form screen replaced with new issue detail view
- On error: form re-enables, red error message at top, first errored field focused
- On 401: "Session expired. Run `codeplane auth login` to re-authenticate."
- On 403: "You do not have permission to create issues in this repository."
- Double-submit prevention: `Ctrl+S` ignored while submission is in flight

**Responsive Behavior:**

| Terminal Size | Body Height | Labels | Selectors | Spacing |
|---------------|-------------|--------|-----------|---------|
| 80×24 (min) | 5 lines | Abbreviated ("Assign", "Miles.") | Inline summary ("N selected") | Minimal |
| 120×40 (standard) | 10 lines | Full text | Overlay dropdown (8 items) | 1-line gaps |
| 200×60+ (large) | 16+ lines | Full text | Overlay dropdown (12 items) | Expanded padding |
| <80×24 (unsupported) | N/A | N/A | N/A | "Terminal too small" message |

**State Behavior:**
- Form state is not persisted across screen navigation. Returning to the form starts fresh.
- Terminal resize preserves all form state and focus position.
- Resize below minimum shows warning; resize back above minimum restores the form with state intact.

---

### VS Code Extension

- **Command:** `Codeplane: Create Issue` accessible via command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
- **Flow:** QuickInput prompt for title (required) → optional QuickInput for body → API call → information notification "Issue #N created" with "Open in Browser" button
- **Requires:** Active daemon connection or authenticated server context
- **Errors:** VS Code error notification with message from API

### Neovim Plugin

- **Command:** `:CodeplaneIssueCreate` with optional arguments `title="..." body="..."`
- **Interactive mode:** Without arguments, opens a split buffer for title input and a second buffer for body
- **On success:** Echoes "Issue #N created" and optionally opens the issue URL via `vim.ui.open`
- **Uses:** Daemon or configured server for API calls

---

### Documentation

End-user documentation must include:
- **Quickstart guide section** covering creating your first issue from Web, CLI, and TUI with concrete examples
- **API reference** for `POST /api/repos/:owner/:repo/issues` with full request/response examples, all error codes, and rate limiting behavior
- **CLI reference** for `codeplane issue create` with all flags, positional argument syntax, `--json` usage, and example output
- **TUI reference** showing keyboard shortcuts, form navigation, and responsive behavior for issue creation
- **Editor integration guides** for VS Code command palette flow and Neovim `:CodeplaneIssueCreate` command
- **Permissions guide** clarifying the write-access requirement and how to grant collaborator access
- **Troubleshooting section** covering common errors: 401 (re-authenticate), 403 (request access), 422 (fix input), 429 (wait and retry)

## Permissions & Security

## Permissions & Security

### Authorization Matrix

| Role | Can Create Issues? | Notes |
|------|--------------------|-------|
| Repository Owner | ✅ Yes | |
| Organization Owner (for org repos) | ✅ Yes | Inherits full access |
| Admin Collaborator | ✅ Yes | |
| Write Collaborator | ✅ Yes | |
| Read Collaborator | ❌ No (403) | Sees the repo but cannot create |
| Non-collaborator on public repo | ❌ No (403) | Can read but not write |
| Non-collaborator on private repo | ❌ No (404) | Repo existence is hidden |
| Unauthenticated | ❌ No (401) | |
| AI Agent (with valid PAT + write access) | ✅ Yes | Same rules as human users |
| Deploy Key | ❌ No | Deploy keys are for SSH transport, not API operations |

### Rate Limiting

- **Per-user per-repository:** 30 issue creations per hour per user per repository.
- **Global per-user:** 120 issue creations per hour across all repositories.
- Rate limit responses return `429 Too Many Requests` with:
  - `Retry-After` header (seconds until reset)
  - `X-RateLimit-Remaining` header (remaining quota)
  - `X-RateLimit-Reset` header (Unix timestamp of reset)
- Rate limit state is keyed on `user_id`, not session or IP, to prevent circumvention via multiple sessions or tokens.
- Burst creation by agents (e.g., migration scripts) should be handled by admin-configurable allowlists or elevated per-user limits, not by disabling rate limiting.

### Data Privacy & PII

- Issue title and body may contain user-entered PII. No automatic PII scanning or redaction is performed.
- Issue author identity (username, avatar URL) is exposed in the response. This is public information for public repos and visible to all collaborators on private repos.
- Assignee resolution: the API does not leak whether a username exists globally. Assignee validation only runs after write-access is confirmed. For private repos, the initial 404 hides the repo's existence. For public repos, assignee validation against existing users could theoretically confirm a username exists, but this is acceptable since the user endpoint is already public.
- Search indexing: issue title and body are indexed for full-text search. The search index must respect the same visibility rules as the issue itself — private repo issues must not appear in search results for unauthorized users.

### Input Sanitization

- Titles and bodies are stored verbatim at the storage layer. **No** HTML stripping, Markdown sanitization, or encoding is performed at the API or service layer.
- Rendering layers (web UI Markdown renderer, TUI text renderer) are responsible for sanitizing/escaping output to prevent XSS in browsers or terminal injection in terminals.
- The API layer enforces `application/json` content-type for mutation requests, which provides implicit protection against CSRF form submissions.

## Telemetry & Product Analytics

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.created` | Issue successfully created (201 response) | `repo_owner`, `repo_name`, `repo_id`, `issue_number`, `issue_id`, `author_id`, `author_login`, `has_body` (bool), `body_length` (int), `assignee_count` (int), `label_count` (int), `has_milestone` (bool), `client_surface` ("api" \| "web" \| "cli" \| "tui" \| "vscode" \| "nvim" \| "agent"), `created_at` (ISO 8601) |
| `issue.create_failed` | Issue creation rejected (4xx response) | `repo_owner`, `repo_name`, `error_code` (401/403/404/422/429), `error_field` (if 422, e.g. "title", "assignees"), `client_surface`, `timestamp` |
| `issue.create_form.opened` | User opens issue creation form (Web UI / TUI only) | `repo_owner`, `repo_name`, `client_surface` ("web" \| "tui"), `entry_point` ("button" \| "keyboard" \| "palette" \| "deeplink" \| "go_to"), `terminal_columns` (TUI only), `terminal_rows` (TUI only) |
| `issue.create_form.abandoned` | User cancels or navigates away from form without submitting | `repo_owner`, `repo_name`, `client_surface`, `had_title` (bool), `had_body` (bool), `time_spent_ms`, `fields_filled` (count of non-empty fields) |
| `issue.create_form.validation_error` | Client-side validation prevents submission | `repo_owner`, `repo_name`, `client_surface`, `field` ("title"), `error_type` ("empty" \| "too_long") |

### Funnel Metrics & Success Indicators

1. **Form Open → Submit Attempt:** Measures friction in the creation form. Target: >70% of form opens result in a submit attempt.
2. **Submit Attempt → Successful Creation:** Measures validation/error rate. Target: >95% of submit attempts succeed.
3. **Issues Created per Active User per Week:** Measures adoption depth. Baseline to be established post-launch.
4. **Client Surface Distribution:** Percentage of issues created via web vs. CLI vs. TUI vs. editors vs. API-direct vs. agent. Informs investment priorities across surfaces.
5. **Time-to-First-Issue:** Time from account creation to first issue created. Measures onboarding success. Target: <30 minutes for users who visit a repository.
6. **Metadata Attachment Rate:** Percentage of issues created with at least one label, assignee, or milestone. Measures feature discovery and organizational maturity. Target: >40% after 30 days.
7. **Form Abandonment with Dirty State:** Percentage of form opens where user typed content but abandoned. Target: <15%. High values indicate UX friction.
8. **Error Recovery Rate:** Of users who encounter a creation error, what percentage successfully retry and create the issue. Target: >80%.

## Observability

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Issue created | `info` | `repo_id`, `repo_name`, `owner`, `issue_id`, `issue_number`, `author_id`, `assignee_count`, `label_count`, `has_milestone`, `duration_ms` | After successful DB insert and all associations committed |
| Issue creation validation failure | `warn` | `repo_name`, `owner`, `field`, `code`, `actor_id`, `request_id` | When service throws `validationFailed` |
| Issue creation auth failure | `warn` | `repo_name`, `owner`, `reason` ("unauthenticated" \| "forbidden"), `actor_id` (if available), `request_id` | When 401 or 403 is returned |
| Issue creation repo not found | `info` | `owner`, `repo`, `actor_id`, `request_id` | When repository resolution fails |
| Issue creation internal error | `error` | `repo_id`, `owner`, `repo_name`, `actor_id`, `error_message`, `stack_trace`, `request_id` | When DB insert or association write fails unexpectedly |
| Assignee resolution failure | `warn` | `repo_id`, `username`, `actor_id`, `request_id` | When an assignee username doesn't resolve to an existing user |
| Label resolution failure | `warn` | `repo_id`, `label_name`, `actor_id`, `request_id` | When a label name doesn't resolve to a label in the repository |
| Milestone resolution failure | `warn` | `repo_id`, `milestone_id`, `actor_id`, `request_id` | When a milestone ID doesn't resolve to a milestone in the repository |
| Rate limit hit | `warn` | `actor_id`, `repo_id`, `remaining`, `reset_at`, `request_id` | When issue creation is rate-limited |
| Webhook dispatch for issue.opened | `info` | `repo_id`, `issue_id`, `webhook_id`, `delivery_id` | When a webhook is dispatched for the new issue |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issues_created_total` | Counter | `owner`, `repo` | Total issues created, partitioned by repository |
| `codeplane_issue_create_duration_seconds` | Histogram | `status` (success \| error) | End-to-end latency of the issue creation operation at the service layer. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0 |
| `codeplane_issue_create_errors_total` | Counter | `error_type` (validation \| auth \| not_found \| internal \| rate_limit) | Issue creation failures partitioned by error category |
| `codeplane_issue_create_validation_errors_total` | Counter | `field` (title \| assignees \| labels \| milestone \| body) | Validation errors partitioned by which field failed |
| `codeplane_issue_create_metadata_total` | Counter | `metadata_type` (assignee \| label \| milestone) | Count of metadata associations made during issue creation |
| `codeplane_issue_number_sequence_gauge` | Gauge | `repo_id` | Current highest issue number per repository, for monitoring sequence health |

### Alerts & Runbooks

#### Alert: `IssueCreateErrorRateHigh`

**Condition:** `rate(codeplane_issue_create_errors_total{error_type="internal"}[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check server logs for entries at `error` level containing "issue creation internal error". Extract `error_message`, `stack_trace`, and `repo_id`.
2. Verify database connectivity: run `SELECT 1` against the primary database. If unreachable, escalate to database on-call.
3. Check if the `get_next_issue_number()` PostgreSQL function is failing — this could indicate sequence exhaustion or lock contention. Run: `SELECT max(number) FROM issues WHERE repository_id = '<repo_id>'`.
4. Check for recent deployments that may have introduced a regression in the issue service or DB layer.
5. If errors are scoped to a single repository, check for corrupt repository state or unusually high write volume. Inspect `pg_locks` for contention on the repository's issue rows.
6. If the root cause is unclear, temporarily increase logging to `debug` for the issue service to capture full request payloads.
7. If the issue is widespread, consider rolling back the most recent deployment.

#### Alert: `IssueCreateLatencyHigh`

**Condition:** `histogram_quantile(0.99, rate(codeplane_issue_create_duration_seconds_bucket[5m])) > 2.0`

**Severity:** Warning

**Runbook:**
1. Check database query latency via `pg_stat_statements` for issue-related queries (INSERT into issues, SELECT from users, SELECT from labels, SELECT from milestones).
2. Determine whether latency is in the issue insert itself or in assignee/label/milestone resolution — each requires additional DB lookups that could be slow.
3. Check for lock contention on the `issues` table or the `repositories` table (for the atomic issue count increment).
4. Check whether webhook delivery is accidentally blocking the HTTP response (it must be async).
5. Check connection pool saturation: inspect active/idle connection counts.
6. If intermittent, profile a sample request end-to-end.

#### Alert: `IssueCreateRateLimitSpiking`

**Condition:** `rate(codeplane_issue_create_errors_total{error_type="rate_limit"}[5m]) > 1.0`

**Severity:** Warning

**Runbook:**
1. Identify the user(s) hitting rate limits from structured logs (filter by `actor_id` on rate limit log entries).
2. Determine if this is legitimate automation (e.g., a migration script, an agent creating issues in bulk) or abuse.
3. If legitimate: consider raising per-user limits for the specific user or adding the user/agent to an admin allowlist.
4. If abuse: consider temporary account suspension via the admin interface or IP-level blocks.
5. Review rate limit configuration to ensure it is appropriately tuned for current usage patterns.

#### Alert: `IssueNumberSequenceGap`

**Condition:** `changes(codeplane_issue_number_sequence_gauge[1h]) > 0 AND (codeplane_issue_number_sequence_gauge - codeplane_issue_number_sequence_gauge offset 1h) > (sum(increase(codeplane_issues_created_total[1h])) by (repo_id)) * 1.1`

**Severity:** Warning

**Runbook:**
1. Check for failed transactions that incremented the database sequence but rolled back the issue insert. These would leave gaps in the number sequence.
2. Query the database for gaps: `SELECT number FROM issues WHERE repository_id = '<repo_id>' ORDER BY number` and compare the count against the max number.
3. Gaps are cosmetic (not functionally harmful), but large gaps may indicate transaction failures that need investigation.
4. If the sequence is significantly ahead of the actual issue count, investigate concurrent issue creation under high load causing sequence skips.
5. If gaps are unacceptable, consider resetting the sequence to `max(number) + 1` during a maintenance window (this requires careful locking).

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
| Rate limited | 429 | Expected throttle | User waits for `Retry-After` duration |
| DB connection lost | 500 | Infrastructure failure | Alert fires, on-call investigates per `IssueCreateErrorRateHigh` runbook |
| Sequence function failure | 500 | Infrastructure failure | Alert fires, check `get_next_issue_number()` function |
| Transaction deadlock | 500 (transient) | Concurrency contention | Automatic retry at DB level or user retries |
| Malformed JSON body | 400 | Client error | User/client fixes request format |
| Wrong content type | 400/415 | Client error | User/client sends application/json |

## Verification

## Verification

### API Integration Tests

```
POST /api/repos/:owner/:repo/issues
├── Happy Path
│   ├── creates issue with title only — returns 201, number=1, state="open", body="", assignees=[], labels=[], milestone_id=null
│   ├── creates issue with title and body — returns 201, body matches input verbatim
│   ├── creates issue with title, body, assignees, labels, and milestone — returns 201, all fields populated correctly
│   ├── creates issue with exactly 255-character title (maximum) — returns 201, title stored verbatim
│   ├── creates issue with exactly 100,000-character body (maximum) — returns 201, body stored verbatim
│   ├── creates issue with Unicode title (emoji 🐛, CJK 漢字, RTL العربية, diacritics ñ) — returns 201, title stored verbatim
│   ├── creates issue with Markdown body (code blocks, images, links, tables, headings) — returns 201, body stored verbatim
│   ├── creates issue with HTML in title (<script>, <img>, &amp;) — returns 201, HTML stored verbatim (not escaped at storage)
│   ├── creates issue with multiple assignees — returns 201, all assignees present in response with correct login and avatar_url
│   ├── creates issue with multiple labels — returns 201, all labels present with correct name, color, description
│   ├── creates issue with duplicate assignees in request ["alice", "alice"] — returns 201, deduplicated to one assignee
│   ├── creates issue with duplicate labels in request ["bug", "bug"] — returns 201, deduplicated to one label
│   ├── creates issue with empty assignees array [] — returns 201, assignees is empty array
│   ├── creates issue with empty labels array [] — returns 201, labels is empty array
│   ├── creates issue with milestone=null — returns 201, milestone_id is null
│   ├── creates issue with milestone omitted — returns 201, milestone_id is null
│   ├── creates issue with a closed milestone — returns 201, milestone_id matches the closed milestone
│   ├── second issue in same repo gets number=2 — returns 201, sequential numbering verified
│   ├── first issue in a different repo starts at number=1 — returns 201, per-repo numbering isolation verified
│   ├── created_at and updated_at are recent ISO 8601 timestamps (within last 5 seconds)
│   ├── comment_count is 0 on new issue
│   ├── closed_at is null on new issue
│   ├── state is "open" on new issue
│   ├── response includes author with login matching the authenticated user
│   ├── response includes author with valid avatar_url
│   ├── issue appears in GET /api/repos/:owner/:repo/issues list immediately after creation
│   └── extra unknown fields in request body are silently ignored — returns 201
│
├── Title Validation
│   ├── missing title field entirely — returns 422, errors[0].field="title", errors[0].code="missing_field"
│   ├── title is empty string "" — returns 422
│   ├── title is whitespace only "   " — returns 422
│   ├── title is null — returns 422
│   ├── title is exactly 256 characters — returns 422, errors[0].field="title", errors[0].code="invalid"
│   ├── title is 1000 characters — returns 422
│   ├── title with leading/trailing whitespace "  Bug report  " — returns 201, title is trimmed to "Bug report"
│   └── title with only internal whitespace "Bug  report" — returns 201, internal whitespace preserved
│
├── Body Validation
│   ├── body is exactly 100,001 characters — returns 422
│   ├── body is 200,000 characters — returns 422
│   ├── body is null — returns 201, body defaults to empty string
│   └── body is omitted — returns 201, body defaults to empty string
│
├── Assignee Validation
│   ├── assignee username does not exist — returns 422, errors[0].field="assignees", errors[0].code="invalid"
│   ├── one valid and one invalid assignee — returns 422, no issue created (verify via list)
│   ├── assignee is empty string in array [""] — returns 422
│   └── assignee is case-insensitive ("Alice" and "alice" both resolve to same user) — returns 201, deduplicated
│
├── Label Validation
│   ├── label name does not exist in repository — returns 422, errors[0].field="labels", errors[0].code="invalid"
│   ├── one valid and one invalid label — returns 422, no issue created (verify via list)
│   ├── label exists in different repository but not target repo — returns 422
│   └── label is empty string in array [""] — returns 422
│
├── Milestone Validation
│   ├── milestone ID does not exist — returns 422, errors[0].field="milestone", errors[0].code="invalid"
│   ├── milestone belongs to different repository — returns 422
│   ├── milestone ID is 0 — returns 422
│   ├── milestone ID is negative (-1) — returns 422
│   └── milestone ID is non-integer ("abc") — returns 422 or 400
│
├── Authentication & Authorization
│   ├── unauthenticated request (no cookie, no token) — returns 401
│   ├── PAT-authenticated request with write access — returns 201
│   ├── session-authenticated request with write access — returns 201
│   ├── authenticated user with read-only collaborator access — returns 403
│   ├── authenticated user with no access to private repo — returns 404 (hides repo existence)
│   ├── authenticated non-collaborator on public repo — returns 403
│   ├── expired or revoked PAT — returns 401
│   ├── org owner can create issues on org repo — returns 201
│   └── admin collaborator can create issues — returns 201
│
├── Repository Resolution
│   ├── non-existent owner — returns 404
│   ├── non-existent repo under valid owner — returns 404
│   ├── owner is case-insensitive — returns 201 with correct repo context
│   └── repo name is case-insensitive — returns 201 with correct repo context
│
├── Request Format
│   ├── non-JSON content type (text/plain) — returns 400 or 415
│   ├── malformed JSON body — returns 400
│   ├── empty request body {} — returns 422 (missing title)
│   └── request body is not an object (array, string, number) — returns 400
│
├── Rate Limiting
│   ├── exceeding per-repo rate limit — returns 429 with Retry-After header
│   └── 429 response includes X-RateLimit-Remaining and X-RateLimit-Reset headers
│
├── Concurrency
│   ├── 10 concurrent issue creations on same repo — all succeed with unique sequential numbers, no duplicates
│   ├── 50 rapid sequential creations — numbers are strictly increasing 1-50 with no gaps
│   └── concurrent creation across two repos — each repo has independent numbering starting at 1
│
└── Webhook Integration
    ├── webhook with "issues" event type fires on issue creation with action="opened"
    ├── webhook payload includes full issue object
    ├── webhook delivery is recorded and visible in webhook deliveries list
    └── webhook does not fire for repositories without configured webhooks
```

### CLI E2E Tests

```
codeplane issue create
├── creates issue with --title flag — stdout contains "Created issue #1: <title>", exit code 0
├── creates issue with positional title argument — same output format
├── creates issue with --title and --body — verify via `issue view` that body matches
├── creates issue with --assignee — verify via `issue view --json` that assignees contain the user
├── creates issue with --repo flag overriding context — issue created in specified repo, not local context
├── creates issue with --json flag — stdout is valid JSON matching IssueResponse schema, contains number, title, state
├── creates issue with --json and pipes to jq — JSON is parseable
├── fails without --title and no positional arg — stderr contains error, exit code 1
├── fails with empty title "" — stderr contains "title is required", exit code 1
├── fails when not authenticated — stderr contains auth error, exit code 1
├── fails when repo does not exist — stderr contains error, exit code 1
├── fails when user lacks write access — stderr contains permission error, exit code 1
├── creates issue and verifies it appears in `issue list` output
├── creates issue and verifies `issue view <N>` returns matching title and body
├── creates issue and verifies `issue view <N> --json` returns full structured response
├── lifecycle: create → comment → close → reopen — all operations succeed sequentially
├── creates multiple issues and verifies sequential numbering in list output
├── title with special characters (quotes, backticks, newlines in shell) — created correctly
└── --assignee with non-existent username — stderr contains validation error, exit code 1
```

### Web UI Playwright Tests

```
Issue Creation Page (/:owner/:repo/issues/new)
├── Navigation
│   ├── navigating to /:owner/:repo/issues/new shows the creation form
│   ├── "New Issue" button on issue list page navigates to creation form
│   ├── command palette "Create Issue" navigates to creation form
│   └── unauthenticated user visiting issues/new is redirected to login
│
├── Form Rendering
│   ├── title input is present, visible, and auto-focused on page load
│   ├── description textarea/editor is present
│   ├── assignees dropdown is present and populates collaborators on click
│   ├── labels dropdown is present and shows repo labels with color swatches on click
│   ├── milestone dropdown is present and shows open milestones on click
│   ├── submit button is present with text "Create issue"
│   └── submit button is disabled when title is empty
│
├── Form Interaction
│   ├── typing in title field enables the submit button
│   ├── clearing the title field disables the submit button
│   ├── character count indicator appears at 230+ characters in title
│   ├── character count turns red at 255 characters
│   ├── title field does not accept characters beyond 255 (if client-enforced) or server rejects 256+
│   ├── assignees dropdown allows selecting multiple users via typeahead
│   ├── selected assignees appear as removable chips
│   ├── removing an assignee chip deselects the user
│   ├── labels dropdown allows selecting multiple labels via typeahead
│   ├── selected labels appear as colored chips
│   ├── milestone dropdown allows selecting one milestone
│   ├── selecting a different milestone replaces the previous selection
│   ├── description editor supports Markdown preview toggle
│   └── tab order: title → description → assignees → labels → milestone → submit
│
├── Submission — Happy Path
│   ├── submitting with valid title only creates issue and redirects to issue detail page
│   ├── issue detail page shows correct title
│   ├── submitting with title + body creates issue with correct body (visible on detail page)
│   ├── submitting with title + assignees creates issue with correct assignees
│   ├── submitting with title + labels creates issue with correct labels
│   ├── submitting with title + milestone creates issue with correct milestone
│   ├── submitting with all fields populated creates issue with all metadata
│   ├── submit button shows spinner and "Creating…" text during submission
│   ├── submit button is disabled during submission (double-click protection)
│   ├── form fields are non-interactive during submission
│   └── created issue appears in the issue list page after navigating back
│
├── Validation & Errors
│   ├── submitting with empty title shows inline error "Title is required" below title field
│   ├── inline error clears when user types in the title field
│   ├── server-side 422 error (e.g., invalid label name) shows error banner at top of form
│   ├── server-side 403 error shows permission denied message
│   ├── server-side 429 error shows rate limit message
│   ├── network failure shows connection error with retry option
│   └── form re-enables after any error (user can fix and retry)
│
├── Dirty Form Protection
│   ├── navigating away from dirty form shows confirmation dialog
│   ├── confirming navigation leaves the page
│   ├── canceling navigation stays on the form
│   └── clean form (no edits) allows navigation without confirmation
│
└── Edge Cases
    ├── submitting issue with exactly 255-character title succeeds
    ├── submitting issue with long body (50,000+ chars) succeeds
    ├── assignees dropdown with no collaborators shows empty state message
    ├── labels dropdown with no labels shows "No labels" with link to create
    ├── milestone dropdown with no milestones shows "No milestones"
    └── page renders correctly on mobile viewport widths
```

### TUI Integration Tests

```
TUI Issue Create Form
├── Form Access
│   ├── pressing 'c' from issue list screen opens create form
│   ├── command palette ':create issue' opens create form
│   ├── form opens with title field focused
│   └── breadcrumb shows "Dashboard > owner/repo > Issues > New Issue"
│
├── Field Interaction
│   ├── typing in title field populates the value
│   ├── title field stops accepting input at 255 characters
│   ├── Tab advances focus to next field (7 tab stops wrap around)
│   ├── Shift+Tab moves focus to previous field
│   ├── description field accepts multi-line input (Enter inserts newline)
│   ├── assignees selector opens overlay with Enter
│   ├── assignees selector navigates with j/k
│   ├── assignees selector toggles with Space
│   ├── assignees selector confirms with Enter
│   ├── assignees selector filters with / then typing
│   ├── labels selector opens and shows colored indicators (●)
│   ├── labels selector supports multi-select
│   ├── milestone selector opens and allows single selection
│   └── milestone selector includes "None" option
│
├── Submission
│   ├── Ctrl+S submits from title field
│   ├── Ctrl+S submits from body field
│   ├── Ctrl+S submits from any selector field
│   ├── successful submission navigates to issue detail view
│   ├── submit button shows "Creating…" during submission
│   ├── Ctrl+S during submission is ignored (no double submit — verify single API call)
│   └── R after error retries submission
│
├── Validation
│   ├── submitting with empty title shows "Title is required" error
│   ├── title field receives focus after validation error
│   ├── server 422 error maps to inline field errors
│   └── first errored field is focused after server validation error
│
├── Cancellation
│   ├── Esc on clean form (no edits) pops screen immediately
│   ├── Esc on dirty form shows "Discard changes? (y/n)" prompt
│   ├── 'y' on discard prompt pops form screen
│   └── 'n' on discard prompt returns to form with state preserved
│
├── Error Recovery
│   ├── API error re-enables all form fields
│   ├── error message displayed in red at top of form
│   ├── 401 error shows "Session expired. Run `codeplane auth login` to re-authenticate."
│   ├── 403 error shows "You do not have permission to create issues in this repository."
│   └── user can modify fields and resubmit after error
│
├── Responsive Layout
│   ├── form renders correctly at 80×24 (minimum) — abbreviated labels, 5-line body
│   ├── form renders correctly at 120×40 (standard) — full labels, 10-line body
│   ├── form renders correctly at 200×60 (large) — expanded body, extra padding
│   ├── terminal below 80×24 shows "terminal too small" message
│   ├── resize from 120×40 to 80×24 preserves form state and focus
│   ├── resize from below minimum back to 80×24 restores form with state intact
│   └── resize during submission does not interrupt the submission
│
└── Snapshot Tests
    ├── initial empty form at 120×40
    ├── initial empty form at 80×24
    ├── form with title validation error
    ├── form in submitting state
    ├── form with server error banner
    ├── assignees selector expanded
    ├── labels selector with colored indicators
    ├── milestone selector expanded
    └── discard confirmation prompt
```

### Agent Tool Integration Tests

```
codeplane_issue_create agent tool
├── creates issue with title and generated summary body — returns issue with number and correct title
├── includes structured sections in body (Summary, Expected Behavior, etc.) when optional fields provided
├── includes system context (cwd, repo root, auth status) in body
├── resolves repo from context when --repo not specified
├── overrides repo with explicit --repo flag
└── fails gracefully with error message when API returns 4xx
```
