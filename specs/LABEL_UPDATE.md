# LABEL_UPDATE

Specification for LABEL_UPDATE.

## High-Level User POV

Labels are a repository's organizational vocabulary — they give issues visual identity and meaning through a name, color, and description. Over the lifetime of a repository, the taxonomy a team started with evolves. A label that was named "triage" early on may need to become "needs-triage" as the team's process matures. A color that blended into the UI may need a more vivid replacement. A description that was left empty at creation time may need a sentence now that new contributors are joining.

The Label Update feature lets a user with write access to a repository modify any combination of a label's name, color, and description in a single operation. The update is partial: a user who only wants to change the color can send just the color without touching the name or description, and the other fields are preserved exactly as they were. This makes it safe for quick cosmetic fixes (e.g., darkening a color) as well as full label renames.

When a label is renamed, every issue that carries that label immediately reflects the new name — the label is a single shared entity, not a per-issue copy. This means renaming "wontfix" to "won't fix" updates the display everywhere at once, without requiring any issue-by-issue migration.

Label updates are available from the API, the CLI (via `codeplane label update`), and the web UI's label management settings page. In every surface, the user sees the current values pre-filled and can change whichever fields they want. The system validates the new values against the same rules used during creation: names must be 1–255 characters and unique within the repository, and colors must be valid 6-character hex strings. If the new name conflicts with another label in the same repository, the user receives a clear conflict error.

## Acceptance Criteria

- A user with write access to a repository can update an existing label by providing any combination of `name`, `color`, and `description`.
- The update uses partial (PATCH) semantics: only fields present in the request body are changed; omitted fields retain their current values.
- The label `name`, if provided, is trimmed of leading and trailing whitespace before validation and storage.
- The label `name`, if provided, must not be empty after trimming and must not exceed 255 characters.
- The label `color`, if provided, must be a valid 6-character hexadecimal string (characters 0–9 and a–f, case-insensitive) and may optionally include a leading `#` which is stripped before validation.
- The `color` is normalized to lowercase with a `#` prefix (e.g., input `D73A4A` is stored and returned as `#d73a4a`).
- The `description`, if provided, may be any string including an empty string. There is no length limit enforced on description.
- Label names must be unique within a repository. Attempting to rename a label to a name that already exists on another label in the same repository returns a 409 Conflict error with the message "label already exists."
- Renaming a label to its own current name (no-op rename) succeeds without triggering a conflict.
- An empty request body (no fields provided) succeeds and returns the label unchanged, with an updated `updated_at` timestamp.
- Unauthenticated requests are rejected with a 401 Unauthorized error.
- Authenticated users without write access to the repository are rejected with a 403 Forbidden error.
- Requests targeting a non-existent repository return a 404 Not Found error.
- Requests targeting a non-existent label ID return a 404 Not Found error with the message "label not found."
- An invalid (non-numeric or non-positive) label ID returns a 400 Bad Request error.
- A malformed or unparseable JSON request body returns a 400 Bad Request error.
- A name that is empty after trimming returns a 422 Validation Failed error with `{ resource: "Label", field: "name", code: "missing_field" }`.
- A name exceeding 255 characters returns a 422 Validation Failed error with `{ resource: "Label", field: "name", code: "invalid" }`.
- A color that is empty returns a 422 Validation Failed error with `{ resource: "Label", field: "color", code: "missing_field" }`.
- A color that is not exactly 6 hex characters (after stripping `#`) returns a 422 Validation Failed error with `{ resource: "Label", field: "color", code: "invalid" }`.
- A color containing non-hex characters (e.g., `gggggg`, `zz00ff`) returns a 422 Validation Failed error with `{ resource: "Label", field: "color", code: "invalid" }`.
- On successful update, the response includes the label's `id`, `repository_id`, `name`, `color` (normalized with `#` prefix), `description`, `created_at` (unchanged from creation), and `updated_at` (set to the current time).
- The response status code for a successful update is 200 OK.
- The updated label is immediately reflected in label listings, issue label displays, and any other surface that references the label.
- Issues that had the label attached before the update continue to show the label with its new name, color, and description without any manual re-attachment.
- The CLI `label update` command accepts a positional `id` argument, and optional `--name`, `--color`, `--description`, and `--repo` options.
- **Definition of Done**: the feature is complete when the API endpoint, CLI command, and all acceptance criteria are covered by passing integration/E2E tests.

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo/labels/:id`

**Path Parameters:**
- `owner` — Repository owner username or organization name (case-insensitive)
- `repo` — Repository name (case-insensitive)
- `id` — Label ID (positive integer)

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <PAT>` or session cookie

**Request Body:**
```json
{
  "name": "critical bug",
  "color": "e11d48",
  "description": "Urgent production issue"
}
```

All fields are optional. Any subset may be sent.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | No | 1–255 characters after trimming; unique per repository |
| `color` | string | No | 6 hex chars (0-9, a-f); leading `#` optional and stripped |
| `description` | string | No | No length limit enforced |

**Success Response (200 OK):**
```json
{
  "id": 42,
  "repository_id": 7,
  "name": "critical bug",
  "color": "#e11d48",
  "description": "Urgent production issue",
  "created_at": "2026-03-20T12:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| 400 | Malformed JSON body | `{ "message": "invalid request body" }` |
| 400 | Invalid label ID (non-numeric, zero, negative) | `{ "message": "invalid label id" }` |
| 400 | Missing label ID | `{ "message": "label id is required" }` |
| 401 | No authentication | `{ "message": "authentication required" }` |
| 403 | Insufficient permissions | `{ "message": "permission denied" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 404 | Label not found | `{ "message": "label not found" }` |
| 409 | Duplicate label name in repo | `{ "message": "label already exists" }` |
| 422 | Validation error | `{ "message": "validation failed", "errors": [{ "resource": "Label", "field": "<field>", "code": "missing_field" or "invalid" }] }` |
| 500 | Unexpected server error | `{ "message": "failed to update label" }` |

### SDK Shape

The `LabelService` class from `@codeplane/sdk` exposes:

```typescript
updateLabel(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  id: number,
  req: UpdateLabelInput,
): Promise<LabelResponse>
```

Where `UpdateLabelInput` is:
```typescript
interface UpdateLabelInput {
  name?: string;
  color?: string;
  description?: string;
}
```

And `LabelResponse` is:
```typescript
{
  id: number;
  repository_id: number;
  name: string;
  color: string;       // Always "#xxxxxx"
  description: string;
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
}
```

The method:
1. Requires authentication (throws 401 if actor is null).
2. Resolves the repository by lowercase owner and repo name.
3. Requires write access to the repository (throws 403 otherwise).
4. Fetches the existing label by ID (throws 404 if not found).
5. For each optional field present in the request, validates and normalizes it; omitted fields retain the existing label's values.
6. Performs the database update.
7. Handles unique constraint violations by throwing 409.
8. Returns the updated `LabelResponse`.

### CLI Command

**Command:** `codeplane label update <id> [options]`

**Arguments:**
- `<id>` — The label ID to update (positional, required, coerced to number)

**Options:**
- `--name <text>` — New label name
- `--color <hex>` — New label color as a 6-character hex string (leading `#` optional)
- `--description <text>` — New label description
- `--repo <OWNER/REPO>` — Target repository; if omitted, resolved from the current working directory's jj/git context

**Output:** JSON object of the updated label on success. Error message on failure.

**Examples:**
```bash
# Rename a label
codeplane label update 42 --name "critical bug" --repo myorg/myproject

# Change a label's color
codeplane label update 42 --color e11d48 --repo myorg/myproject

# Update all fields at once
codeplane label update 42 --name "urgent" --color ff0000 --description "Needs immediate attention" --repo myorg/myproject

# Update description only, resolve repo from working directory
codeplane label update 42 --description "Updated description"
```

### Web UI Design

Label editing in the web UI is accessible from the repository's label management settings page at `/:owner/:repo/settings/labels`. Each label row in the list should include an "Edit" button (pencil icon or text link) that opens an inline edit form or navigates to an edit view.

The edit form presents:
1. **Name input** — Pre-filled with the current label name, placeholder "Label name", max 255 characters.
2. **Description input** — Pre-filled with the current description, placeholder "Description (optional)".
3. **Color picker** — Pre-filled with the current color as a hex input with swatch preview. Users can type a hex value or use a visual color picker. The `#` prefix is shown in the input but stripped before sending to the API.
4. **Save button** — "Save changes" button, disabled when no fields have been modified from their original values.
5. **Cancel button** — Returns to the label list without saving.

On successful update, the label row refreshes to show the new values immediately. On validation errors, inline error messages appear next to the offending field. On conflict (duplicate name), an inline error reads "A label with this name already exists."

The edit form should use an optimistic pattern: the button text changes to "Saving..." on submission and reverts on error.

### TUI UI

The TUI does not currently expose a dedicated label editing screen. Label management (including updates) is available through the CLI `label update` command. If a label edit flow is added to the TUI in the future, it should present a pre-filled form with name, color (hex input), and description fields, with inline validation matching the API constraints.

### Documentation

End-user documentation should cover:

- **How-to: Update a label via CLI** — Show `codeplane label update` usage with examples for renaming, recoloring, updating description, and combined updates.
- **How-to: Update a label via API** — Show the `PATCH /api/repos/:owner/:repo/labels/:id` endpoint with a curl example demonstrating partial update.
- **Reference: Label API** — Full endpoint reference for PATCH including request/response shapes, all error codes, and partial update semantics.
- **Reference: CLI label commands** — Argument/option table for `label update` alongside `label create`, `label list`, `label delete`.
- **Concept page: Labels** — Ensure the existing concept page mentions that labels can be renamed and that updates propagate to all attached issues automatically.

## Permissions & Security

### Authorization Matrix

| Role | Can Update Labels? |
|---|---|
| Repository Owner | ✅ Yes |
| Organization Owner (for org repo) | ✅ Yes |
| Admin Collaborator | ✅ Yes |
| Write Collaborator | ✅ Yes |
| Read Collaborator | ❌ No (403) |
| Unauthenticated | ❌ No (401) |
| Authenticated, no repo access | ❌ No (403) |

### Permission Resolution Order

1. If the user is the repository owner (direct user match), write access is granted.
2. If the repository is org-owned and the user is the org owner, write access is granted.
3. The highest permission is resolved from team permissions and collaborator permissions.
4. If the resolved permission is `write` or `admin`, access is granted.
5. If the resolved permission is `read` or lower, 403 Forbidden is returned.
6. If the user is not authenticated, 401 Unauthorized is returned before any permission check.

### Rate Limiting

- Label updates are subject to the server's global rate limiting middleware applied to all mutation endpoints.
- A per-user burst limit of **30 label update requests per minute per repository** is recommended to prevent automated abuse (e.g., a script churning label renames in a tight loop).
- The same rate limit bucket should be shared with label creation to prevent combined create+update flooding.

### Data Privacy

- Label names, colors, and descriptions are repository-scoped metadata. They are visible to anyone who can read the repository (including unauthenticated users for public repositories).
- No PII is expected in label fields, but since users may type arbitrary text into the name and description fields, labels inherit the repository's visibility scope. Private repository labels are not exposed to unauthorized viewers.
- The update operation does not log the previous label values in the API response, so old names/descriptions are not leaked through the update response itself.
- Label updates do not involve secrets, tokens, or credentials.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `LabelUpdated` | Successful label update | `repository_id`, `label_id`, `label_name` (new), `label_color` (new), `actor_id`, `fields_changed` (array of field names that were modified, e.g. `["name", "color"]`), `was_rename` (boolean — true if `name` was changed), `client` ("api" / "cli" / "web" / "tui"), `timestamp` |

### Event Properties Detail

- `repository_id` (number): Internal ID of the repository.
- `label_id` (number): The label's ID.
- `label_name` (string): The label's name after the update.
- `label_color` (string): The label's color after the update (normalized `#rrggbb`).
- `actor_id` (number): The authenticated user who performed the update.
- `fields_changed` (string[]): Which fields were actually modified (present in the request body). Possible values: `"name"`, `"color"`, `"description"`.
- `was_rename` (boolean): True if the `name` field was present in the request and differs from the previous name.
- `client` (string): The client surface that initiated the request (derived from User-Agent or explicit client header).
- `timestamp` (string): ISO 8601 timestamp of the event.

### Funnel Metrics

- **Label update rate**: Number of label updates per active repository per month. Indicates how frequently teams refine their label taxonomy.
- **Rename frequency**: Percentage of label updates that include a name change. High rename frequency may indicate labels are being created hastily or that naming conventions are evolving.
- **Color-only update rate**: Percentage of label updates that only change the color. Indicates cosmetic refinement patterns.
- **Update-after-create latency**: Time between label creation and first update. Short durations may indicate the creation flow is missing affordances (e.g., no color picker, so users create and then immediately fix the color).
- **Update error rate**: Ratio of failed update attempts to successful ones, broken down by error type (validation, conflict, permission, not found). A high conflict rate may indicate teams need better label name visibility during editing.

### Success Indicators

- A steady, low-volume update rate indicates teams are refining labels naturally as their process evolves.
- A high color-only update rate indicates the color picker or default color experience may need improvement.
- A low error rate on updates indicates the UI and CLI pre-fill values correctly and guide users toward valid changes.
- If the rename frequency is very high relative to creation, it may suggest the creation flow needs better naming guidance.

## Observability

### Logging Requirements

| Event | Log Level | Structured Fields |
|---|---|---|
| Label updated successfully | `info` | `event: "label.updated"`, `repository_id`, `label_id`, `label_name`, `actor_id`, `fields_changed`, `duration_ms` |
| Label update failed — validation | `warn` | `event: "label.update_failed"`, `reason: "validation"`, `field`, `code`, `repository_id`, `label_id`, `actor_id` |
| Label update failed — conflict (duplicate name) | `warn` | `event: "label.update_failed"`, `reason: "conflict"`, `label_name`, `repository_id`, `label_id`, `actor_id` |
| Label update failed — label not found | `info` | `event: "label.update_failed"`, `reason: "not_found"`, `label_id`, `repository_id`, `actor_id` |
| Label update failed — permission denied | `warn` | `event: "label.update_failed"`, `reason: "forbidden"`, `repository_id`, `actor_id` |
| Label update failed — unauthenticated | `info` | `event: "label.update_failed"`, `reason: "unauthenticated"` |
| Label update failed — repository not found | `info` | `event: "label.update_failed"`, `reason: "repo_not_found"`, `owner`, `repo` |
| Label update failed — internal error | `error` | `event: "label.update_failed"`, `reason: "internal"`, `repository_id`, `label_id`, `actor_id`, `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_label_updates_total` | Counter | `status` (success / error), `error_type` (validation / conflict / not_found / forbidden / unauthenticated / internal) | Total label update attempts |
| `codeplane_label_update_duration_seconds` | Histogram | — | Time taken to process a label update request end-to-end (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_label_update_fields_changed` | Counter | `field` (name / color / description) | Count of individual field changes across all updates, to understand which fields are modified most |

### Alerts

#### Alert: High Label Update Internal Error Rate
- **Condition:** `rate(codeplane_label_updates_total{status="error", error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `event: "label.update_failed"` with `reason: "internal"` to identify the root cause.
  2. Look for database connection issues — the update requires a SELECT followed by an UPDATE. Check for DB pool exhaustion or connectivity problems.
  3. Verify the `labels` table is accessible and the `updateLabel` SQL query is executing correctly. Run `EXPLAIN ANALYZE` on the update query if needed.
  4. Check if the unique constraint on `(repository_id, name)` still exists — a dropped constraint could cause silent data corruption instead of a proper 409.
  5. Check for recent migrations that may have altered the `labels` table schema.
  6. If the error is a transient DB issue, monitor for auto-recovery. If persistent, check PGLite/Postgres health and restart the server if needed.

#### Alert: Label Update Latency Spike
- **Condition:** `histogram_quantile(0.99, rate(codeplane_label_update_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency — the update path involves a SELECT (to fetch the existing label) followed by an UPDATE. Either query could be slow.
  2. Look for table bloat, missing indexes, or lock contention on the `labels` table.
  3. Check if the unique constraint index on `(repository_id, name)` is healthy — a degraded index can slow unique constraint checks.
  4. Review server resource utilization (CPU, memory, DB connections).
  5. If isolated to one repository, check if that repository has an unusually large number of labels causing index pressure.
  6. Check for long-running transactions that may be holding locks on the labels table.

#### Alert: High Label Update Conflict Rate
- **Condition:** `rate(codeplane_label_updates_total{status="error", error_type="conflict"}[15m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. This indicates frequent attempts to rename labels to names that already exist. This is a user error, not a system error.
  2. Check structured logs to see if the conflicts are concentrated on one repository or user.
  3. If concentrated on one actor, it may indicate a misconfigured automation or script that is trying to bulk-rename labels.
  4. If distributed, consider whether the web UI or CLI could surface existing label names more prominently during editing to reduce accidental conflicts.
  5. No immediate action required unless the volume indicates abuse.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Label ID not a positive integer | 400 | Invalid label id | User provides a valid numeric label ID |
| Label not found | 404 | Label not found | User verifies the label ID exists in the repository |
| Name empty after trimming | 422 | Validation failed — name missing_field | User provides a non-empty name |
| Name exceeds 255 chars | 422 | Validation failed — name invalid | User shortens the name |
| Color is empty string | 422 | Validation failed — color missing_field | User provides a valid hex color |
| Color not 6 hex chars | 422 | Validation failed — color invalid | User corrects the color format |
| Color contains non-hex chars | 422 | Validation failed — color invalid | User corrects the color to valid hex |
| Duplicate name in repo | 409 | Label already exists | User chooses a different name |
| Not authenticated | 401 | Authentication required | User logs in or provides a valid PAT |
| No write access | 403 | Permission denied | User requests write access from a repo admin |
| Repository not found | 404 | Repository not found | User verifies the owner/repo path |
| Malformed JSON body | 400 | Invalid request body | User fixes the request payload |
| Database unreachable | 500 | Failed to update label | Ops team investigates DB connectivity |
| Unexpected DB error | 500 | Failed to update label | Ops team investigates via structured logs |

## Verification

### API Integration Tests

#### Happy Path — Partial Update Semantics

1. **Update name only** — Create a label "bug" with color `d73a4a` and description "broken". PATCH with `{ "name": "defect" }`. Assert 200, response `name` is `"defect"`, `color` is `"#d73a4a"` (unchanged), `description` is `"broken"` (unchanged).

2. **Update color only** — Create a label. PATCH with `{ "color": "00ff00" }`. Assert 200, response `name` and `description` are unchanged, `color` is `"#00ff00"`.

3. **Update description only** — Create a label. PATCH with `{ "description": "Updated description" }`. Assert 200, response `name` and `color` are unchanged, `description` is `"Updated description"`.

4. **Update all fields at once** — Create a label. PATCH with `{ "name": "new-name", "color": "abcdef", "description": "new desc" }`. Assert 200, all three fields are updated.

5. **Empty body (no fields)** — Create a label. PATCH with `{}`. Assert 200, all fields unchanged, `updated_at` is updated.

6. **Update preserves `created_at`** — Create a label, note `created_at`. Wait briefly. PATCH with `{ "name": "renamed" }`. Assert `created_at` is unchanged from original creation.

7. **Update changes `updated_at`** — Create a label, note `updated_at`. Wait briefly. PATCH with `{ "color": "111111" }`. Assert `updated_at` is different (later) than the original value.

8. **Response shape is complete** — PATCH a label. Assert response contains `id` (number), `repository_id` (number), `name` (string), `color` (string matching `/#[0-9a-f]{6}/`), `description` (string), `created_at` (valid ISO 8601), and `updated_at` (valid ISO 8601).

#### Name Validation

9. **Name: maximum valid length (255 characters)** — Create a label. PATCH with a name that is exactly 255 characters long. Assert 200 and response `name` has length 255.

10. **Name: exceeds maximum length (256 characters)** — Create a label. PATCH with a name that is 256 characters long. Assert 422 with `{ resource: "Label", field: "name", code: "invalid" }`.

11. **Name: whitespace trimming** — Create a label. PATCH with `{ "name": "  trimmed  " }`. Assert 200 and response `name` is `"trimmed"`.

12. **Name: all whitespace** — Create a label. PATCH with `{ "name": "   " }`. Assert 422 with `{ resource: "Label", field: "name", code: "missing_field" }`.

13. **Name: empty string** — Create a label. PATCH with `{ "name": "" }`. Assert 422 with `{ resource: "Label", field: "name", code: "missing_field" }`.

14. **Name: special characters** — Create a label. PATCH with `{ "name": "won't fix / duplicate" }`. Assert 200.

15. **Name: Unicode and emoji** — Create a label. PATCH with `{ "name": "🐛 バグ" }`. Assert 200 and response `name` is `"🐛 バグ"`.

16. **Name: rename to same name (no-op)** — Create a label named "bug". PATCH with `{ "name": "bug" }`. Assert 200 (no conflict since it's the same label).

#### Color Validation

17. **Color normalization: uppercase hex** — PATCH with `{ "color": "D73A4A" }`. Assert response `color` is `"#d73a4a"`.

18. **Color normalization: with # prefix** — PATCH with `{ "color": "#a2eeef" }`. Assert response `color` is `"#a2eeef"`.

19. **Color normalization: mixed case with # prefix** — PATCH with `{ "color": "#AbCdEf" }`. Assert response `color` is `"#abcdef"`.

20. **Color: all zeros** — PATCH with `{ "color": "000000" }`. Assert 200 and response `color` is `"#000000"`.

21. **Color: all f's** — PATCH with `{ "color": "ffffff" }`. Assert 200 and response `color` is `"#ffffff"`.

22. **Color: empty string** — PATCH with `{ "color": "" }`. Assert 422 with `{ resource: "Label", field: "color", code: "missing_field" }`.

23. **Color: too short (5 chars)** — PATCH with `{ "color": "d73a4" }`. Assert 422 with `{ resource: "Label", field: "color", code: "invalid" }`.

24. **Color: too long (7 chars without #)** — PATCH with `{ "color": "d73a4aa" }`. Assert 422 with `{ resource: "Label", field: "color", code: "invalid" }`.

25. **Color: non-hex characters** — PATCH with `{ "color": "gggggg" }`. Assert 422 with `{ resource: "Label", field: "color", code: "invalid" }`.

26. **Color: mixed valid/invalid hex** — PATCH with `{ "color": "zz00ff" }`. Assert 422 with `{ resource: "Label", field: "color", code: "invalid" }`.

27. **Color: 3-character shorthand** — PATCH with `{ "color": "f00" }`. Assert 422 (must be exactly 6 chars).

#### Description Edge Cases

28. **Description: set to empty string** — Create a label with description "something". PATCH with `{ "description": "" }`. Assert 200 and response `description` is `""`.

29. **Description: set to long string** — PATCH with a description of 10,000 characters. Assert 200.

30. **Description: unicode and emoji** — PATCH with `{ "description": "🔥 重要なバグ" }`. Assert 200.

#### Duplicate Name Handling

31. **Duplicate name: exact match with another label** — Create labels "bug" and "feature". PATCH label "feature" with `{ "name": "bug" }`. Assert 409 with message "label already exists".

32. **Duplicate name: case sensitivity** — Create label "Bug" and "other". PATCH "other" with `{ "name": "bug" }`. Assert behavior is consistent with the database collation. Document actual behavior.

33. **Rename: no conflict when name is unique** — Create labels "bug" and "feature". PATCH "bug" with `{ "name": "defect" }`. Assert 200.

34. **Cross-repository: same name allowed** — Create label "bug" in repo A. Create label "feature" in repo B. PATCH repo B's label to `{ "name": "bug" }`. Assert 200 (uniqueness is per-repository).

#### Label ID Validation

35. **Invalid label ID: zero** — PATCH `/api/repos/:owner/:repo/labels/0` with `{ "name": "test" }`. Assert 400.

36. **Invalid label ID: negative** — PATCH `/api/repos/:owner/:repo/labels/-1` with `{ "name": "test" }`. Assert 400.

37. **Invalid label ID: non-numeric** — PATCH `/api/repos/:owner/:repo/labels/abc` with `{ "name": "test" }`. Assert 400.

38. **Non-existent label ID** — PATCH with a valid but non-existent label ID. Assert 404 with message "label not found".

#### Permission Tests

39. **Unauthenticated request** — PATCH without auth. Assert 401 with message "authentication required".

40. **Read-only collaborator** — PATCH as a user with only read access. Assert 403 with message "permission denied".

41. **Write collaborator** — PATCH as a user with write access. Assert 200.

42. **Admin collaborator** — PATCH as a user with admin access. Assert 200.

43. **Repository owner** — PATCH as the repository owner. Assert 200.

44. **Organization owner** — PATCH as the org owner for an org-owned repo. Assert 200.

45. **Authenticated user with no repo access** — PATCH as an authenticated user who is not a collaborator on a private repo. Assert 403.

#### Repository Edge Cases

46. **Non-existent repository** — PATCH to `/api/repos/nobody/nonexistent/labels/1`. Assert 404 with message "repository not found".

47. **Malformed JSON body** — PATCH with body `"not json"`. Assert 400 with message "invalid request body".

48. **Missing body entirely** — PATCH with no body / empty content. Assert 400.

#### Propagation and Consistency

49. **Updated label reflected in label list** — Create a label, update its name. GET `/api/repos/:owner/:repo/labels`. Assert the list contains the new name and not the old name.

50. **Updated label reflected in get-by-ID** — Create a label, update it. GET `/api/repos/:owner/:repo/labels/:id`. Assert all updated fields match.

51. **Updated label reflected on attached issues** — Create a label, attach it to an issue, update the label name/color. GET the issue's labels. Assert the issue's label reflects the new name and color.

52. **Multiple sequential updates** — Create a label. Update name, then update color, then update description in three separate PATCH requests. Assert final state reflects all three changes.

### CLI E2E Tests

53. **CLI: Update label name** — Create a label via CLI. Run `codeplane label update <id> --name "new-name" --repo OWNER/REPO`. Assert JSON output contains the updated name with other fields preserved.

54. **CLI: Update label color** — Run `codeplane label update <id> --color 00ff00 --repo OWNER/REPO`. Assert JSON output contains `color: "#00ff00"` with other fields preserved.

55. **CLI: Update label description** — Run `codeplane label update <id> --description "new desc" --repo OWNER/REPO`. Assert JSON output contains the updated description.

56. **CLI: Update all fields** — Run `codeplane label update <id> --name "renamed" --color abcdef --description "changed" --repo OWNER/REPO`. Assert all fields updated.

57. **CLI: Update non-existent label** — Run `codeplane label update 999999 --name "test" --repo OWNER/REPO`. Assert non-zero exit code and error output indicating label not found.

58. **CLI: Update with duplicate name** — Create two labels. Run `codeplane label update <id2> --name <name1> --repo OWNER/REPO`. Assert non-zero exit code and error output indicating label already exists.

59. **CLI: Updated label appears in list** — Update a label name via CLI. Run `codeplane label list --repo OWNER/REPO`. Assert the updated name appears and the old name does not.

60. **CLI: Repo resolution from working directory** — In a directory with jj/git context pointing to a known repo, run `codeplane label update <id> --name "contextual"` without `--repo`. Assert success.

### Playwright (Web UI) E2E Tests

61. **Web: Edit button visible on label row** — Navigate to `/:owner/:repo/settings/labels`. Assert each label row has an edit action (button or link).

62. **Web: Edit form pre-fills current values** — Click edit on a label. Assert the form name, color, and description fields are pre-filled with the label's current values.

63. **Web: Update label name via form** — Open edit form, change name, click save. Assert the label list row updates to show the new name.

64. **Web: Update label color via form** — Open edit form, change color, click save. Assert the label list row updates to show the new color swatch.

65. **Web: Update label description via form** — Open edit form, change description, click save. Assert the label list row updates to show the new description.

66. **Web: Cancel edit reverts form** — Open edit form, modify fields, click cancel. Assert no changes are saved and the label retains its original values.

67. **Web: Inline validation — empty name** — Open edit form, clear the name field, click save. Assert an inline validation error appears on the name field.

68. **Web: Inline validation — invalid color** — Open edit form, enter "xyz" as color, click save. Assert an inline validation error appears on the color field.

69. **Web: Duplicate name error** — Open edit form, enter a name that matches another existing label, click save. Assert a user-visible error message about the label already existing.

70. **Web: Save button disabled when no changes** — Open edit form without modifying any fields. Assert the save button is disabled.

71. **Web: Updated label reflected in issue label picker** — Update a label name via the settings page. Navigate to an issue with that label attached. Assert the issue displays the new label name.
