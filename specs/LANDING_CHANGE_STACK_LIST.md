# LANDING_CHANGE_STACK_LIST

Specification for LANDING_CHANGE_STACK_LIST.

## High-Level User POV

When a user opens a landing request, one of the most important things they need to understand is *what changes are being proposed and in what order*. The **change stack list** is the surface that answers this question. It presents the ordered sequence of jj changes that constitute the landing request, rendered as a navigable vertical list that communicates the logical structure of the work.

Unlike traditional forges where a pull request is a flat comparison between two branches, Codeplane's landing requests are built around **stacked jj changes**. Each change in the stack has a stable jj change ID, a position in the ordering (from base to tip), a description, an author, and individual conflict and emptiness status. The change stack list makes this structure visible, giving reviewers and collaborators a clear picture of how the author decomposed the work into discrete, reviewable units.

The change stack list appears as the **Changes tab** within the landing request detail view across all Codeplane clients. On the web, it renders as a visually connected vertical list with clickable rows that navigate to per-change diffs. In the CLI, it renders as a formatted table or JSON output showing each change's position, ID, description, and status. In the TUI, it renders as a keyboard-navigable scrollable list with quick-jump shortcuts for conflicted changes. In editor integrations, it appears as a tree or picker view for quickly browsing the stack.

For landing requests with a single change, the list contains one entry. For large stacks, the list is paginated to keep the interface responsive. An empty landing request (zero changes) shows a clear empty-state message. Changes that have conflicts are visually marked so reviewers can immediately see which parts of the stack need attention. Empty changes (those with no file modifications) are similarly indicated so reviewers understand the stack's composition without needing to open every diff.

The change stack list is a read-only navigational surface. It does not allow reordering, adding, or removing changes — those operations happen through the jj CLI or the landing request edit flow. Its job is to faithfully represent the current state of the stack and provide fast navigation into per-change detail and diff views.

## Acceptance Criteria

### Definition of Done

- [ ] The change stack list is accessible from the landing request detail view on all clients (Web, CLI, TUI, Editor).
- [ ] The list displays all changes associated with a landing request, ordered by `position_in_stack` ascending (base at top, tip at bottom).
- [ ] Each change row displays: 1-based position number, short change ID (first 12 hex characters on web, 8 on TUI compact), conflict indicator (⚠ if `has_conflict` is true), empty indicator (∅ if `is_empty` is true), first line of the change description, author name, and relative timestamp.
- [ ] A vertical connector line runs down the left margin of the list on web and TUI, visually reinforcing the sequential ordering of the stack.
- [ ] A summary line at the top or bottom shows: "N changes → {target_bookmark}" with aggregate conflict status ("✓ Clean" or "⚠ K conflicts").
- [ ] Clicking or selecting a change navigates to a per-change diff view for that specific change ID.
- [ ] The list supports page-based pagination with a default page size of 30 and a maximum page size of 100.
- [ ] The `X-Total-Count` response header reflects the total number of changes for the landing request.
- [ ] The `Link` response header includes RFC 5988 pagination links (first, last, prev, next) when applicable.
- [ ] When the landing request has zero changes, the list displays: "No changes in this landing request."
- [ ] When a single change exists, the list renders one row with no pagination controls.
- [ ] When the change count exceeds the page size, a load-more or next-page mechanism is provided.
- [ ] The change stack list loads independently from other landing detail tabs (lazy loading per tab).

### Edge Cases

- [ ] A landing request with zero changes returns an empty array `[]` with `X-Total-Count: 0`.
- [ ] A landing request with exactly 100 changes (maximum page size) returns all items in a single page when `per_page=100`.
- [ ] A landing request with 101 changes paginates correctly across two pages.
- [ ] A `page` value of 0 or negative is normalized to page 1.
- [ ] A `per_page` value of 0 or negative is normalized to 30 (default).
- [ ] A `per_page` value exceeding 100 is clamped to 100.
- [ ] A `page` value beyond the total number of pages returns an empty array `[]` (not a 404).
- [ ] Change IDs containing only hexadecimal characters are displayed correctly.
- [ ] Change descriptions containing special characters (quotes, angle brackets, unicode, emoji) are rendered safely without XSS or layout breakage.
- [ ] Change descriptions that are empty strings display a fallback: "(no description)".
- [ ] Change descriptions longer than the display column are truncated with an ellipsis on the first line.
- [ ] A change with `has_conflict: true` displays the conflict indicator regardless of the aggregate `conflict_status` on the landing request.
- [ ] A change with both `has_conflict: true` and `is_empty: true` displays both indicators.
- [ ] The list handles author names containing unicode, spaces, and special characters without layout breakage.
- [ ] The list handles the case where change metadata (description, author, timestamp) is not yet available by showing the change ID with placeholder indicators.
- [ ] If the landing request does not exist, the API returns 404 (not an empty list).
- [ ] If the user does not have read access to the repository, the API returns 404 (not 403) to avoid leaking repository existence.

### Boundary Constraints

- [ ] `page` parameter: integer, minimum effective value 1, no maximum (returns empty beyond data range).
- [ ] `per_page` parameter: integer, minimum effective value 1, maximum 100, default 30.
- [ ] `change_id` string: hexadecimal characters only, typically 40 characters long (but display shows first 8–12).
- [ ] `position_in_stack`: 0-indexed integer, unique per landing request, contiguous from 0 to N-1.
- [ ] `description`: arbitrary UTF-8 string, no maximum enforced by this endpoint (but only first line displayed in list).
- [ ] `author_name`: arbitrary UTF-8 string, no maximum enforced by this endpoint (truncated in display).
- [ ] Maximum changes per landing request: no hard limit enforced by this endpoint (pagination handles arbitrarily large stacks).

## Design

### Web UI Design

The change stack list renders as the **Changes** tab within the landing request detail page at `/:owner/:repo/landings/:number`.

**Tab Label:** "Changes (N)" where N is `stack_size` from the landing request response.

**Layout:**

```
┌─ Changes (5) ─────────────────────────────────────────────────┐
│ 5 changes → main · ✓ Clean                                    │
│                                                                │
│  ① │ abc123def456  First change: add utility module       wcory  2h │
│  │                                                              │
│  ② │ bcd234ef5678  Second change: update API handler      wcory  2h │
│  │                                                              │
│  ③│⚠ cde345f67890  Third change: fix conflict scenario    agent  1h │
│  │                                                              │
│  ④│∅ def456789012  Fourth change: empty merge commit       wcory  1h │
│  │                                                              │
│  ⑤ │ ef5678901234  Fifth change: final polish             wcory 30m │
│                                                                │
│                        Page 1 of 1                             │
└────────────────────────────────────────────────────────────────┘
```

**Row Components:**
- **Position badge**: Circled number (①②③…) or plain number for positions > 20.
- **Connector line**: Thin vertical line (│) in a muted color on the left margin between rows.
- **Change ID**: First 12 hex characters in monospace font, clickable, links to per-change diff view.
- **Conflict indicator**: Orange ⚠ icon, shown only if `has_conflict` is true for that change.
- **Empty indicator**: Gray ∅ icon, shown only if `is_empty` is true for that change.
- **Description**: First line of the change description, truncated with ellipsis if it overflows.
- **Author**: Avatar (if available) + username/name, truncated if needed.
- **Timestamp**: Relative timestamp ("2h", "3d", "1w").

**Interaction:**
- Clicking a row navigates to `/:owner/:repo/landings/:number/changes/:change_id`.
- Hovering highlights the row.
- Keyboard: Arrow keys move focus between rows, Enter navigates to the focused change.

**Empty State:** Centered text: "No changes in this landing request." with a muted icon.

**Loading State:** Skeleton rows matching the layout structure.

**Error State:** "Failed to load changes. Retry" with a retry button.

**Pagination:** "Load more" button at the bottom when more pages are available.

**Responsive Behavior:**
- Desktop (≥1024px): Full row with all columns.
- Tablet (768–1023px): Author column hidden, timestamp abbreviated.
- Mobile (<768px): Description truncated more aggressively, only change ID + conflict indicators + short description shown.

### API Shape

**Endpoint:**

```
GET /api/repos/:owner/:repo/landings/:number/changes
```

**Query Parameters:**

| Parameter  | Type    | Default | Constraints       | Description                    |
|------------|---------|---------|-------------------|--------------------------------|
| `page`     | integer | 1       | min 1 (clamped)   | Page number (1-indexed)        |
| `per_page` | integer | 30      | min 1, max 100    | Items per page                 |

**Success Response (200):**

```json
[
  {
    "id": 42,
    "landing_request_id": 7,
    "change_id": "abc123def456789012345678901234567890abcd",
    "position_in_stack": 0
  },
  {
    "id": 43,
    "landing_request_id": 7,
    "change_id": "bcd234ef5678901234567890123456789012bcde",
    "position_in_stack": 1
  }
]
```

**Response Headers:**

| Header          | Description                                                  |
|-----------------|--------------------------------------------------------------|
| `X-Total-Count` | Total number of changes for this landing request             |
| `Link`          | RFC 5988 pagination links (rel=first, last, prev, next)      |

**Error Responses:**

| Status | Condition                              | Body                                          |
|--------|----------------------------------------|-----------------------------------------------|
| 404    | Landing request not found              | `{ "message": "Landing request not found" }`  |
| 404    | Repository not found or no read access | `{ "message": "Repository not found" }`       |
| 401    | Not authenticated (private repo)       | `{ "message": "Authentication required" }`    |

### SDK Shape

Shared hooks in `@codeplane/ui-core`:

```typescript
useLandingChanges(owner: string, repo: string, number: number, options?: {
  page?: number;
  perPage?: number;
}) → {
  data: LandingRequestChange[] | undefined;
  total: number;
  loading: boolean;
  error: Error | null;
  loadMore: () => void;
  hasMore: boolean;
  refetch: () => void;
}
```

Where `LandingRequestChange` is:

```typescript
interface LandingRequestChange {
  id: number;
  landing_request_id: number;
  change_id: string;
  position_in_stack: number;
}
```

Complementary hook for enriching change metadata (used for display):

```typescript
useChangeMetadata(owner: string, repo: string, changeIds: string[]) → {
  data: Map<string, ChangeMetadata> | undefined;
  loading: boolean;
  error: Error | null;
}

interface ChangeMetadata {
  change_id: string;
  commit_id: string;
  description: string;
  author_name: string;
  author_email: string;
  timestamp: string;
  has_conflict: boolean;
  is_empty: boolean;
  parent_change_ids: string[];
}
```

### CLI Command

The change stack list is accessed through the `land view` command and also as a standalone sub-list:

**View landing request (includes change stack):**

```bash
$ codeplane land view 5
# Landing Request #5: Add utility module
# State: open | Author: wcory | Target: main | Conflicts: clean
# Stack: 3 changes
#
# Changes:
#   1. abc123de  Add utility module              wcory  2 hours ago
#   2. bcd234ef  Update API handler              wcory  2 hours ago
#   3. cde345f6  Fix conflict scenario           agent  1 hour ago
```

**List changes only (JSON-capable):**

```bash
$ codeplane land changes 5
$ codeplane land changes 5 --json
$ codeplane land changes 5 --json '.[] | .change_id'
$ codeplane land changes 5 --page 2 --per-page 50
```

**Output columns (default table format):**

| Column      | Description                          |
|-------------|--------------------------------------|
| `#`         | 1-based position in stack            |
| `CHANGE ID` | First 8 hex characters               |
| `STATUS`    | `⚠` if conflicted, `∅` if empty, `-` otherwise |
| `DESCRIPTION` | First line, truncated to terminal width |
| `AUTHOR`    | Author name                          |
| `AGE`       | Relative timestamp                   |

### TUI UI

The TUI change stack list renders as a section within the landing detail screen, accessed via the "Changes" tab (shortcut: `s`).

**Tab label:** "Changes (N)"

**Layout:**

```
╔═══════════════════════════════════════════════════════╗
║ Changes (3) → main · ✓ Clean                         ║
╠═══════════════════════════════════════════════════════╣
║ ▸ ① abc123de  Add utility module           wcory  2h ║
║   │                                                   ║
║   ② bcd234ef  Update API handler           wcory  2h ║
║   │                                                   ║
║   ③ cde345f6  Fix conflict scenario        agent  1h ║
╠═══════════════════════════════════════════════════════╣
║ j/k:navigate  Enter:detail  d:diff  D:combined  ?:help║
╚═══════════════════════════════════════════════════════╝
```

**Keyboard Shortcuts:**

| Key            | Action                                    |
|----------------|-------------------------------------------|
| `j` / `↓`     | Move selection down                       |
| `k` / `↑`     | Move selection up                         |
| `Enter`        | Open change detail screen                 |
| `d`            | Open diff for focused change              |
| `D`            | Open combined diff for all changes        |
| `g g`          | Jump to first change                      |
| `G`            | Jump to last change                       |
| `n`            | Jump to next conflicted change            |
| `p`            | Jump to previous conflicted change        |
| `R`            | Retry on error                            |
| `Tab`          | Next tab section                          |
| `Shift+Tab`    | Previous tab section                      |
| `?`            | Show keyboard help overlay                |

**Responsive Breakpoints:**

| Terminal Size  | Change ID | Author    | Timestamp |
|----------------|-----------|-----------|----------|
| 80×24 (min)    | 8 chars   | Hidden    | 4 chars   |
| 120×40 (std)   | 8 chars   | 14 chars  | 8 chars   |
| 200×60 (lg)    | 12 chars  | 18 chars  | 14 chars  |

**Pagination:** Loads 50 items at a time. Scrolling past 80% of the list triggers automatic loading of the next page.

### VS Code Extension

The VS Code extension exposes the change stack through:

- **Landing Request Tree View**: A tree item for the landing request includes child items for each change in the stack, showing change ID and description.
- **Quick Pick**: `Codeplane: Browse Landing Changes` command opens a picker listing all changes in the focused landing request, allowing navigation to per-change diff.

### Neovim Plugin

The Neovim plugin provides:

- `:CodeplaneLandChanges <number>` — Opens a Telescope picker listing all changes in the landing request with change ID, description, and conflict status. Selecting a change opens the diff.

### Documentation

End-user documentation should include:

- **"Viewing the Change Stack"** section in the Landing Requests guide, explaining what the change stack represents, how changes are ordered (base to tip), and what the conflict/empty indicators mean.
- **CLI reference** for `codeplane land view` and `codeplane land changes` including all flags and output formats.
- **Keyboard shortcut reference** for TUI change stack navigation.
- **API reference** for `GET /api/repos/:owner/:repo/landings/:number/changes` with request/response examples and pagination details.

## Permissions & Security

### Authorization

| Role       | Access                                                      |
|------------|-------------------------------------------------------------|
| Owner      | Full read access to change stack for any landing request    |
| Admin      | Full read access to change stack for any landing request    |
| Member     | Read access to change stack for landing requests in repos they can access |
| Read-Only  | Read access to change stack in public repos or repos explicitly shared |
| Anonymous  | Read access to change stack in public repositories only     |

The change stack list is a **read-only** surface. No write permissions are required. Authorization is determined by the user's read access to the parent repository.

When a user does not have read access, the API returns **404** (not 403) to avoid disclosing the existence of private repositories or landing requests.

### Rate Limiting

| Scope             | Limit                  | Window  |
|-------------------|------------------------|---------|
| Authenticated     | 5000 requests          | 1 hour  |
| Unauthenticated   | 60 requests            | 1 hour  |
| Per-endpoint      | Inherits global limits | —       |

The change stack list endpoint inherits the global API rate limiting configuration. No endpoint-specific rate limits are required because this is a lightweight read operation.

### Data Privacy

- Change IDs, descriptions, and author information are scoped to the repository. They are only visible to users who have read access to the repository.
- Author email addresses should **not** be returned in the change stack list response. The `author_name` is sufficient for display. Email is available only through the dedicated change detail endpoint for authenticated users.
- No PII beyond author name and change description content is exposed through this endpoint.
- The endpoint does not log or store information about who viewed the change stack (beyond standard request logs).

## Telemetry & Product Analytics

### Business Events

| Event Name                     | Trigger                                              | Properties                                                                                     |
|--------------------------------|------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `landing_change_stack_viewed`  | User loads the changes tab/section                   | `owner`, `repo`, `landing_number`, `stack_size`, `page`, `per_page`, `client` (web/cli/tui/editor), `has_conflicts` (boolean) |
| `landing_change_selected`      | User clicks/selects a specific change from the list  | `owner`, `repo`, `landing_number`, `change_id`, `position_in_stack`, `client`, `navigation_target` (diff/detail) |
| `landing_combined_diff_opened` | User opens the combined diff from the change stack   | `owner`, `repo`, `landing_number`, `stack_size`, `client`                                      |
| `landing_change_stack_paginated` | User loads a subsequent page of changes             | `owner`, `repo`, `landing_number`, `page`, `per_page`, `client`                               |

### Funnel Metrics

| Metric                             | Description                                                    | Success Indicator                |
|------------------------------------|----------------------------------------------------------------|----------------------------------|
| Change stack view rate             | % of landing detail views that include a changes tab view      | > 60% of landing detail sessions |
| Change-to-diff navigation rate     | % of change stack views where user navigates to a per-change diff | > 30%                         |
| Combined diff from stack rate      | % of change stack views where user opens combined diff         | > 20%                            |
| Conflict-jump usage (TUI)          | % of TUI change stack sessions using `n`/`p` shortcuts         | Tracks adoption of power features |
| Pagination engagement              | % of change stack views that paginate beyond page 1            | Low is healthy (most stacks fit one page) |

### Success Indicators

- Users who view the change stack tab spend meaningful time on landing request detail pages (not bouncing).
- The per-change diff navigation rate indicates users are leveraging the stack decomposition rather than only viewing the combined diff.
- Stacks with conflicts show higher engagement (users are inspecting individual conflicted changes).

## Observability

### Logging

| Log Point                          | Level | Structured Context                                                    |
|------------------------------------|-------|----------------------------------------------------------------------|
| Change stack list requested        | INFO  | `owner`, `repo`, `landing_number`, `page`, `per_page`, `user_id`    |
| Change stack list returned         | DEBUG | `owner`, `repo`, `landing_number`, `total_changes`, `returned_count`, `duration_ms` |
| Landing request not found          | WARN  | `owner`, `repo`, `landing_number`, `user_id`                        |
| Repository not found / no access   | WARN  | `owner`, `repo`, `user_id`                                          |
| Pagination parameter clamped       | DEBUG | `original_value`, `clamped_value`, `parameter_name`                  |
| Database query failure             | ERROR | `owner`, `repo`, `landing_number`, `error_message`, `query_duration_ms` |
| Rate limit exceeded                | WARN  | `user_id`, `endpoint`, `current_count`, `limit`                     |

### Prometheus Metrics

| Metric Name                                      | Type      | Labels                                        | Description                                      |
|--------------------------------------------------|-----------|-----------------------------------------------|--------------------------------------------------|
| `codeplane_landing_changes_list_total`           | Counter   | `status` (200/404/401/500), `owner`, `repo`   | Total requests to the change stack list endpoint  |
| `codeplane_landing_changes_list_duration_seconds`| Histogram | `status`                                      | Request duration for the change stack list        |
| `codeplane_landing_changes_count`                | Histogram | —                                             | Distribution of stack sizes returned              |
| `codeplane_landing_changes_list_errors_total`    | Counter   | `error_type` (db_failure, not_found, auth)    | Errors broken down by type                        |
| `codeplane_landing_changes_page_requested`       | Histogram | —                                             | Distribution of requested page numbers            |

### Alerts

#### Alert: High Error Rate on Change Stack List

**Condition:** `rate(codeplane_landing_changes_list_errors_total{error_type="db_failure"}[5m]) > 0.1`

**Severity:** Warning

**Runbook:**
1. Check database connectivity: `SELECT 1` against the primary database.
2. Check for table locks or long-running queries: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%landing_request_changes%'`.
3. Verify the `landing_request_changes` table exists and has the expected indexes.
4. Check disk space and connection pool exhaustion.
5. If the database is healthy, check for recent schema migrations that may have altered the table.
6. Escalate to database on-call if the issue persists beyond 10 minutes.

#### Alert: High Latency on Change Stack List

**Condition:** `histogram_quantile(0.95, rate(codeplane_landing_changes_list_duration_seconds_bucket[5m])) > 2.0`

**Severity:** Warning

**Runbook:**
1. Check if the slow queries correlate with specific repositories (large stacks).
2. Run `EXPLAIN ANALYZE` on the `listLandingRequestChanges` query for the affected landing request IDs.
3. Verify that the index on `landing_request_changes(landing_request_id, position_in_stack)` exists and is being used.
4. Check for database resource contention (CPU, memory, I/O).
5. If specific landing requests have extremely large stacks (>1000 changes), consider whether a hard cap should be introduced.
6. Escalate to platform engineering if p95 latency remains above 2s after index verification.

#### Alert: Elevated 404 Rate

**Condition:** `rate(codeplane_landing_changes_list_total{status="404"}[15m]) / rate(codeplane_landing_changes_list_total[15m]) > 0.5`

**Severity:** Info

**Runbook:**
1. Check if a client is making requests for deleted or non-existent landing requests (bot/scraper traffic).
2. Verify no recent data migration deleted landing request records unexpectedly.
3. Check web/CLI/TUI client versions for bugs that might construct invalid landing request numbers.
4. If the 404 rate is from a single IP/user-agent, consider rate limiting or blocking.

### Error Cases and Failure Modes

| Error Case                            | HTTP Status | User-Facing Message                     | Recovery                                |
|---------------------------------------|-------------|------------------------------------------|-----------------------------------------|
| Landing request not found             | 404         | "Landing request not found"              | Verify the landing request number       |
| Repository not found or inaccessible  | 404         | "Repository not found"                   | Check repository name and permissions   |
| Not authenticated (private repo)      | 401         | "Authentication required"                | Sign in or provide a valid token        |
| Database connection failure           | 500         | "Internal server error"                  | Automatic retry; alert fires            |
| Database query timeout                | 500         | "Internal server error"                  | Automatic retry; check stack size       |
| Rate limit exceeded                   | 429         | "Rate limit exceeded. Retry after {N}s"  | Wait and retry after the indicated time |
| Invalid page/per_page (non-integer)   | 400         | "Invalid pagination parameters"          | Fix the query parameters                |

## Verification

### API Integration Tests

1. **List changes for a landing request with 0 changes** — Assert: 200, empty array, `X-Total-Count: 0`, no `Link` header with `next`.
2. **List changes for a landing request with 1 change** — Assert: 200, array of length 1, correct `change_id` and `position_in_stack: 0`, `X-Total-Count: 1`.
3. **List changes for a landing request with 5 changes** — Assert: 200, array of length 5, items ordered by `position_in_stack` ascending (0 through 4), `X-Total-Count: 5`.
4. **List changes with default pagination (no params)** — Assert: returns up to 30 items, page=1 behavior.
5. **List changes with `per_page=2` for a landing with 5 changes** — Assert: 200, array of length 2, `X-Total-Count: 5`, `Link` header includes `rel="next"` and `rel="last"`.
6. **List changes page 2 with `per_page=2` for a landing with 5 changes** — Assert: 200, array of length 2, positions 2 and 3, `Link` header includes `rel="prev"` and `rel="first"`.
7. **List changes page 3 (last page) with `per_page=2` for a landing with 5 changes** — Assert: 200, array of length 1, position 4, `Link` header includes `rel="prev"` but not `rel="next"`.
8. **List changes with page beyond total pages** — Assert: 200, empty array, `X-Total-Count` still reflects the real total.
9. **List changes with `per_page=100`** — Assert: returns up to 100 items in a single page.
10. **List changes with `per_page=100` for a landing with exactly 100 changes** — Assert: 200, array of length 100, `X-Total-Count: 100`, no `next` link.
11. **List changes with `per_page=101`** — Assert: clamped to 100, returns at most 100 items.
12. **List changes with `per_page=0`** — Assert: normalized to default (30), returns up to 30 items.
13. **List changes with `per_page=-5`** — Assert: normalized to default (30).
14. **List changes with `page=0`** — Assert: normalized to page 1.
15. **List changes with `page=-1`** — Assert: normalized to page 1.
16. **Verify `position_in_stack` ordering is always ascending** — Create a landing with changes in a specific order, assert API returns them sorted by `position_in_stack` ASC.
17. **Verify each item has the correct shape** — Assert: every item has `id` (number), `landing_request_id` (number), `change_id` (string), `position_in_stack` (number).
18. **List changes for a non-existent landing request** — Assert: 404, `{ "message": "Landing request not found" }`.
19. **List changes for a non-existent repository** — Assert: 404.
20. **List changes as an unauthenticated user on a public repo** — Assert: 200, changes returned.
21. **List changes as an unauthenticated user on a private repo** — Assert: 404.
22. **List changes as an authenticated user without repo access** — Assert: 404.
23. **List changes as an authenticated user with read access** — Assert: 200, changes returned.
24. **List changes as repo owner** — Assert: 200, changes returned.
25. **Verify `X-Total-Count` header is present and numeric** — Assert for multiple scenarios.
26. **Verify `Link` header format** — Assert RFC 5988 compliance with correct rel values and URL patterns.
27. **Verify changes are scoped to the specific landing request** — Create two landing requests with different changes, assert each returns only its own changes.
28. **List changes for a landing with 200 changes, page through all pages** — Assert: all 200 changes are retrievable across pages with no duplicates or gaps.

### CLI Integration Tests

29. **`codeplane land view <number>` displays change stack** — Assert: output includes "Changes:" section with position numbers, change IDs, and descriptions.
30. **`codeplane land changes <number>` lists all changes** — Assert: table output with correct columns (#, CHANGE ID, STATUS, DESCRIPTION, AUTHOR, AGE).
31. **`codeplane land changes <number> --json`** — Assert: valid JSON array output with all `LandingRequestChange` fields.
32. **`codeplane land changes <number> --json '.[] | .change_id'`** — Assert: outputs only change IDs, one per line.
33. **`codeplane land changes <number> --page 2 --per-page 2`** — Assert: returns the second page of results.
34. **`codeplane land changes <number>` for a landing with 0 changes** — Assert: displays "No changes" or empty table.
35. **`codeplane land changes <number>` for a non-existent landing** — Assert: error message and non-zero exit code.
36. **`codeplane land changes <number>` on a private repo without auth** — Assert: error message and non-zero exit code.

### Web UI E2E Tests (Playwright)

37. **Navigate to landing detail → Changes tab shows correct count in tab label** — Assert: "Changes (N)" matches `stack_size`.
38. **Changes tab renders all changes in correct order** — Assert: position numbers 1 through N, each with change ID text.
39. **Changes tab shows conflict indicator on conflicted changes** — Assert: ⚠ icon visible for changes with conflicts.
40. **Changes tab shows empty indicator on empty changes** — Assert: ∅ icon visible for empty changes.
41. **Changes tab shows connector line between changes** — Assert: visual connector element exists in the DOM.
42. **Click a change row navigates to per-change diff** — Assert: URL changes to include the change ID.
43. **Changes tab empty state** — Assert: "No changes in this landing request." displayed for a landing with 0 changes.
44. **Changes tab loading state** — Assert: skeleton rows displayed while data loads.
45. **Changes tab error state with retry** — Simulate API failure, assert error message and retry button, click retry and verify recovery.
46. **Changes tab pagination (load more)** — Create a landing with >30 changes, assert load more button appears, click it, assert more changes rendered.
47. **Changes tab responsive layout on mobile viewport** — Assert: abbreviated columns on narrow viewport.
48. **Summary line shows target bookmark and conflict status** — Assert: "N changes → main · ✓ Clean" or similar.
49. **Keyboard navigation within changes list** — Tab to changes list, use arrow keys, assert focus movement, press Enter, assert navigation.

### TUI Integration Tests

50. **TUI landing detail → Changes section renders change list** — Assert: change rows with position, ID, and description rendered in terminal output.
51. **TUI `j`/`k` navigation moves selection** — Assert: selection indicator moves between change rows.
52. **TUI `Enter` on a change opens detail** — Assert: screen transitions to change detail.
53. **TUI `d` on a change opens diff** — Assert: diff view rendered for the selected change.
54. **TUI `D` opens combined diff** — Assert: combined diff view rendered.
55. **TUI `G` jumps to last change, `g g` jumps to first** — Assert: selection jumps to expected positions.
56. **TUI `n`/`p` jumps between conflicted changes** — Create a landing with conflicted changes at positions 1 and 4, assert `n` from position 0 jumps to 1, then to 4.
57. **TUI empty state rendering** — Assert: "No changes in this landing request." displayed.
58. **TUI responsive: 80×24 terminal** — Assert: 8-char change IDs, no author column.
59. **TUI responsive: 120×40 terminal** — Assert: 8-char change IDs, 14-char author column visible.
60. **TUI scroll-to-load pagination** — Create a landing with >50 changes, scroll past 80%, assert more changes loaded.

### Cross-Client Consistency Tests

61. **API, CLI, and Web return the same change IDs in the same order** — For a given landing request, assert all three clients show identical change IDs in identical order.
62. **Pagination produces identical results across clients** — Assert: page 2 with per_page=10 returns the same items via API, CLI (`--page 2 --per-page 10`), and web UI load-more.
