# REPO_SETTINGS_UI_LABELS

Specification for REPO_SETTINGS_UI_LABELS.

## High-Level User POV

When you manage a Codeplane repository, labels are the organizational vocabulary your team uses to categorize issues — they give work items visual identity and meaning through a name, color, and description. The repository settings labels page is where you go to define and maintain this vocabulary.

You reach the labels settings page by navigating to your repository, clicking the "Settings" tab in the repository tab bar (visible only if you have admin or owner permission), and then selecting "Labels" from the settings sidebar navigation. The URL is `/:owner/:repo/settings/labels`. It sits alongside other settings categories like General, Milestones, Webhooks, Secrets, Variables, and Deploy Keys in the settings sidebar.

The page is organized into two parts: a creation form at the top and the full list of existing labels below it.

The **creation form** lets you define a new label by entering a name, picking a color, and optionally writing a description. The name is the label's display text — something like "bug," "enhancement," or "needs-triage." The color gives the label its visual identity when it appears as a badge on issues, in search results, and across every Codeplane surface. The description explains what the label means so that new contributors can apply it correctly. Once you fill in the name and color and click "Create label," the new label appears instantly in the list below without a page reload.

The **label list** shows every label currently defined for the repository. Each row displays the label as a colored badge alongside its description and how many issues currently use it. For each label you have write access to, you see action buttons to edit and delete. Clicking "Edit" transforms the row into an inline edit form pre-filled with the label's current values. You can change the name, color, or description — or any combination — and save. Only the fields you actually changed are sent to the server. Clicking "Delete" opens a confirmation dialog warning that the label will be permanently removed from all issues. Once confirmed, the label disappears from the list and from every issue that referenced it.

The labels settings page is designed to feel like a fast, focused workspace for label taxonomy management. You can create, rename, recolor, describe, and clean up labels without ever leaving the page. Every change takes effect immediately across all Codeplane surfaces — the web UI, CLI, TUI, editor integrations, and API consumers all see updated labels right away because labels are shared repository-level entities, not per-issue copies.

The page also handles edge cases gracefully. If you try to create a label with a name that already exists, you see a clear inline error. If another team member deletes a label while you're looking at the list, the next interaction tells you the label is gone rather than silently failing. If the repository is archived, the page shows your labels in read-only mode with a notice that the repository must be unarchived before labels can be modified.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users with admin or owner permission on a repository can access the labels settings page at `/:owner/:repo/settings/labels`.
- [ ] The labels settings page is accessible from the settings sidebar under "Labels."
- [ ] The page contains a label creation form and a paginated list of existing labels.
- [ ] Label creation, editing, and deletion are fully functional from this page.
- [ ] All label operations call the existing Label API endpoints (POST, GET, PATCH, DELETE under `/api/repos/:owner/:repo/labels`).
- [ ] Non-admin authenticated users who navigate to `/:owner/:repo/settings/labels` are redirected to the repository overview (`/:owner/:repo`) with an access-denied toast notification.
- [ ] Unauthenticated users who navigate to `/:owner/:repo/settings/labels` for a private repo see a 404 page.
- [ ] Unauthenticated users who navigate to `/:owner/:repo/settings/labels` for a public repo are redirected to the login page.
- [ ] The "Settings" tab in the repository tab bar is only visible to users with admin or owner permission.
- [ ] All client-side validation matches the API constraints exactly — no mismatch between what the client allows and what the server accepts.
- [ ] The page is fully navigable via keyboard (Tab/Shift+Tab between fields, Enter to submit, Escape to dismiss dialogs).
- [ ] The page renders correctly on viewports from 320px to 2560px wide.
- [ ] All verification tests pass.
- [ ] Observability instrumentation is in place.

### Label Creation Form Constraints

- [ ] The **Name** field is a single-line text input, placeholder "Label name", required.
- [ ] The name is trimmed of leading/trailing whitespace before submission.
- [ ] The name must be 1–255 characters after trimming.
- [ ] An empty or whitespace-only name shows an inline validation error: "Label name is required."
- [ ] A name exceeding 255 characters shows an inline validation error: "Label name must be 255 characters or fewer." The character counter turns red.
- [ ] The name field displays a live character counter: `N / 255`.
- [ ] The name field accepts Unicode content including emoji, CJK characters, accented characters, punctuation, slashes, and special characters.
- [ ] The **Color** field is a hex color input with a visual color swatch preview adjacent to it.
- [ ] The color input shows a `#` prefix that is displayed but not sent to the API (or stripped before sending).
- [ ] The color field accepts 6-character hex strings (0–9, a–f, case-insensitive).
- [ ] An empty color field shows an inline validation error: "Label color is required."
- [ ] A color that is not exactly 6 hex characters (after stripping `#`) shows an inline validation error: "Color must be a valid 6-character hex code."
- [ ] A visual color picker (palette or swatch grid) is available. The picker includes a set of 16 preset colors for quick selection.
- [ ] The color swatch preview updates live as the user types or selects a color.
- [ ] The **Description** field is a single-line text input, placeholder "Description (optional)".
- [ ] The description is optional and may be empty.
- [ ] There is no maximum length enforced on the description.
- [ ] The **"Create label"** button is disabled until both name and color are non-empty and pass client-side validation.
- [ ] While submitting, the button shows a spinner and all form inputs are disabled.
- [ ] On success (201): the form clears, the new label appears in the label list, and a success toast reads "Label created."
- [ ] On conflict (409): an inline error on the name field reads "A label with this name already exists."
- [ ] On validation error (422): inline errors appear on the offending fields.
- [ ] On permission error (403): toast notification "Permission denied."
- [ ] On network or server error (500): toast notification "Something went wrong. Please try again." Form state is preserved.

### Label List Constraints

- [ ] The label list displays all labels for the repository, paginated (default 30, max 100).
- [ ] The list header shows the total label count: "Labels (N)."
- [ ] Each label row displays: colored badge, description (or "No description" placeholder), issue count ("N issues"), and Edit/Delete actions.
- [ ] Labels are displayed in deterministic order (by ID ascending, creation order).
- [ ] When the repository has no labels, the list shows an empty state message.
- [ ] Pagination controls appear when labels exceed page size.

### Inline Edit Constraints

- [ ] Clicking "Edit" transforms the row into an inline form pre-filled with current values.
- [ ] Same validation rules as creation form (name: 1–255 chars, color: 6 hex chars, description: optional).
- [ ] "Save changes" button is disabled until at least one field differs from loaded state.
- [ ] "Cancel" button (and Escape key) returns row to display state without saving.
- [ ] Only changed fields are submitted via PATCH.
- [ ] On success (200): row reverts to display mode with updated values, toast "Label updated."
- [ ] On conflict (409): inline error "A label with this name already exists."
- [ ] On not found (404): toast "Label not found," row removed.
- [ ] Only one label can be in edit mode at a time.

### Delete Constraints

- [ ] Clicking "Delete" opens a confirmation dialog with the label name.
- [ ] Dialog has Cancel (default focus) and Delete (red, destructive) buttons.
- [ ] On confirm and success (204): row removed, toast "Label deleted," count header updates.
- [ ] No optimistic deletion — row stays until server confirms.
- [ ] Escape dismisses dialog without action.

### Archived Repository Behavior

- [ ] Yellow banner: "This repository is archived. Unarchive it to manage labels."
- [ ] Create form hidden or disabled. Edit and Delete buttons hidden.
- [ ] Label list remains visible for reference.

### Edge Cases

- [ ] Non-existent repository → 404 page.
- [ ] Private repo without access → 404 page.
- [ ] Label name of exactly 255 characters → succeeds.
- [ ] Label name of 256 characters → prevented by client validation.
- [ ] Color `000000` → creates black label with visible swatch.
- [ ] Color `ffffff` → creates white label with border for visibility.
- [ ] Color with # prefix → stripped before submission.
- [ ] Concurrent duplicate name creation → second shows conflict error.
- [ ] Concurrent deletion of same label → second shows "not found" toast.
- [ ] Browser back/forward preserves page state.
- [ ] Deep-linking directly to `/:owner/:repo/settings/labels` works.

## Design

### Web UI Design

#### Route and Layout

- **Route**: `/:owner/:repo/settings/labels`
- **Parent layout**: Lives inside the existing repository layout, below the repository header and tab bar, within the settings area.
- **Settings sidebar**: Left-side navigation panel. "Labels" appears below "General" and is highlighted when active with a left border accent (4px, primary color), bold text, and subtle background.
- **Content area**: The right side renders the labels management interface.

#### Page Layout

The page has two main sections:

1. **Create Form Section**: A card at the top with heading "Create a new label." On desktop (>1024px), fields are in a single row: Name, Color (with swatch + picker), Description, Create button. On mobile (<768px), fields stack vertically.

2. **Label List Section**: Below the form. Header shows "Labels (N)" with total count. Each row shows a colored badge/pill, description text, issue count, and Edit/Delete action buttons.

#### Create Form Details

- **Name input**: Single-line, placeholder "Label name", live character counter `N / 255` below.
- **Color input**: Hex field with `#` prefix displayed. Adjacent 24×24 circular swatch updates live. Small button opens a picker dropdown with 16 preset colors and a "Random color" button.
- **Description input**: Single-line, placeholder "Description (optional)".
- **Submit button**: "Create label" — primary styling, disabled until valid.

Preset colors: `#d73a4a`, `#e99695`, `#f9d0c4`, `#fef2c0`, `#c2e0c6`, `#0e8a16`, `#006b75`, `#1d76db`, `#0075ca`, `#5319e7`, `#d876e3`, `#b60205`, `#bfd4f2`, `#fbca04`, `#0052cc`, `#e4e669`.

#### Label Row Details

Each row shows:
- **Badge**: Pill shape with label color as background, label name as text, with appropriate contrast (white text for dark backgrounds, dark text for light). Light-colored labels get a 1px border for visibility.
- **Description**: Muted gray text. If empty: "No description" in italic.
- **Issue count**: "N issues" in muted text.
- **Actions**: Edit (pencil icon) and Delete (trash icon), right-aligned. Only for users with write access.

#### Inline Edit

Clicking "Edit" expands the row into a form mirroring the create form layout with pre-filled values. "Save changes" (disabled until dirty) and "Cancel" buttons. Only one row editable at a time.

#### Delete Dialog

Modal centered on viewport:
- **Title**: Delete label "{name}"?
- **Body**: "This label will be permanently removed from this repository and detached from all issues that currently use it. This action cannot be undone."
- **Buttons**: Cancel (secondary, default focus) | Delete (destructive, red).

#### Responsive Behavior

- **< 768px**: Sidebar collapses to dropdown. Create form fields stack. Label rows stack vertically.
- **768px – 1024px**: Sidebar 200px. Create form in two rows. Label rows horizontal.
- **> 1024px**: Sidebar 240px. Create form single row. Content max-width 720px.

#### Loading and Error States

- **Initial load**: Skeleton loader for label list. Create form renders immediately.
- **List load error**: Inline error card with "Failed to load labels" and "Retry" button.
- **Save in progress**: Spinner on button, inputs disabled.
- **Network error**: Toast notification, form state preserved.

### API Shape

No new API endpoints. Consumes existing label endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/repos/:owner/:repo/labels` | GET | List labels (paginated) |
| `/api/repos/:owner/:repo/labels/:id` | GET | Get single label |
| `/api/repos/:owner/:repo/labels` | POST | Create label |
| `/api/repos/:owner/:repo/labels/:id` | PATCH | Update label (partial) |
| `/api/repos/:owner/:repo/labels/:id` | DELETE | Delete label |

### SDK Shape

Shared hooks from `@codeplane/ui-core`:

- `useLabels(owner, repo, page?, perPage?)` — paginated label list with refetch.
- `useLabel(owner, repo, id)` — single label fetch.
- `useCreateLabel()` — mutation wrapping POST.
- `useUpdateLabel()` — mutation wrapping PATCH.
- `useDeleteLabel()` — mutation wrapping DELETE.
- `useRepo(owner, repo)` — existing hook for archive status and permissions.
- `useUser()` — existing hook for auth context.

### CLI Command

No new CLI commands required. Existing commands cover full lifecycle: `label create`, `label list`, `label view`, `label update`, `label delete`.

### TUI UI

No dedicated TUI label management screen. Label management in TUI is via CLI. No new TUI work required.

### Documentation

1. **Managing Labels Guide** — Walkthrough of the labels settings page: access, create, edit, delete. Annotated screenshots. Cross-reference CLI equivalents.
2. **Quick Reference Card** — Web: `/:owner/:repo/settings/labels`. CLI: `label create/list/view/update/delete`. API: `POST/GET/PATCH/DELETE /api/repos/:owner/:repo/labels`.
3. **Labels Concept Page** — Ensure existing label docs reference the settings UI as the primary management surface.

## Permissions & Security

### Authorization Roles

| Role | View Labels Page | Create Labels | Edit Labels | Delete Labels |
|------|-----------------|---------------|-------------|---------------|
| **Owner** | ✅ | ✅ | ✅ | ✅ |
| **Admin** (org team) | ✅ | ✅ | ✅ | ✅ |
| **Write** (collaborator) | ❌ (redirect) | ❌ | ❌ | ❌ |
| **Read** (collaborator) | ❌ (redirect) | ❌ | ❌ | ❌ |
| **Anonymous (public repo)** | ❌ (login redirect) | ❌ | ❌ | ❌ |
| **Anonymous (private repo)** | ❌ (404) | ❌ | ❌ | ❌ |

Note: The settings pages require admin or owner permission to access. Write collaborators cannot access the settings area, even though they can create/edit/delete labels through the API and CLI directly. This is consistent with REPO_SETTINGS_UI_GENERAL.

### Client-Side Permission Enforcement

- The "Settings" tab is only rendered if the user has admin or owner permission.
- Route guard checks permission on mount; non-admin users are redirected to `/:owner/:repo` with toast: "You don't have permission to access repository settings."
- Edit and Delete buttons are conditionally rendered based on write access.

### Rate Limiting

- Standard rate limiting applies (inherits global per-user rate limit).
- Label creation/update: 30 requests per minute per user per repository (shared bucket).
- Label deletion: 30 requests per minute per user per repository.
- Label listing: standard read rate limit.

### Data Privacy

- Labels are repository-scoped metadata visible to anyone who can read the repo (public repos).
- For private repos, labels only visible to users with at least read access.
- No PII involved in label management.
- Private repo settings pages return 404 to unauthorized users (not 403) to avoid leaking existence.
- No secrets, tokens, or credentials involved.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `repo.settings.labels.page_viewed` | User navigates to labels settings | `repo_id`, `owner`, `repo_name`, `actor_id`, `referrer`, `labels_count`, `is_archived` |
| `repo.settings.labels.label_created` | Label created from settings | `repo_id`, `owner`, `repo_name`, `actor_id`, `label_id`, `label_name`, `label_color`, `has_description`, `used_preset_color`, `used_random_color`, `name_length` |
| `repo.settings.labels.label_create_failed` | Creation failed | `repo_id`, `owner`, `repo_name`, `actor_id`, `error_code`, `error_field` |
| `repo.settings.labels.edit_started` | User clicked edit | `repo_id`, `actor_id`, `label_id`, `label_name` |
| `repo.settings.labels.label_updated` | Label updated from settings | `repo_id`, `actor_id`, `label_id`, `label_name`, `fields_changed`, `was_rename` |
| `repo.settings.labels.label_update_failed` | Update failed | `repo_id`, `actor_id`, `label_id`, `error_code` |
| `repo.settings.labels.edit_cancelled` | User cancelled edit | `repo_id`, `actor_id`, `label_id`, `had_unsaved_changes` |
| `repo.settings.labels.delete_initiated` | Delete dialog opened | `repo_id`, `actor_id`, `label_id`, `label_name`, `issues_count` |
| `repo.settings.labels.label_deleted` | Label deleted from settings | `repo_id`, `actor_id`, `label_id`, `label_name`, `issues_affected_count` |
| `repo.settings.labels.delete_cancelled` | Delete dialog cancelled | `repo_id`, `actor_id`, `label_id` |
| `repo.settings.labels.color_picker_used` | Color picker opened | `repo_id`, `actor_id`, `selected_preset`, `selected_random` |

### Funnel Metrics and Success Indicators

- **Labels page visit rate**: % of repos where labels settings visited per month — indicates discoverability.
- **Label creation rate from settings**: Creations via web UI vs CLI vs API — indicates preferred surface.
- **Create success rate**: Should be >95%. Low rate = validation UX gaps.
- **Edit completion rate**: Edit starts → saved updates. Low rate = confusing edit UX.
- **Delete confirmation rate**: Delete initiations → confirmed. Measures friction appropriateness.
- **Color picker usage rate**: Preset/random vs manual hex typing — informs UX investment.
- **Empty state → first label conversion**: Users seeing "No labels" who create one in same session.
- **Time on labels page**: Median session duration (target: 30s–3m for healthy management sessions).

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| `repo.settings.labels.page_loaded` | DEBUG | `{ repo_id, owner, repo, actor_id, labels_count, load_duration_ms }` | Page completes initial load |
| `repo.settings.labels.label_created` | INFO | `{ repo_id, owner, repo, actor_id, label_id, label_name, duration_ms }` | Label created |
| `repo.settings.labels.label_updated` | INFO | `{ repo_id, owner, repo, actor_id, label_id, label_name, fields_changed, duration_ms }` | Label updated |
| `repo.settings.labels.label_deleted` | INFO | `{ repo_id, owner, repo, actor_id, label_id, label_name, issues_affected_count, duration_ms }` | Label deleted |
| `repo.settings.labels.permission_denied` | WARN | `{ owner, repo, actor_id, required_role }` | Unauthorized access attempt |
| `repo.settings.labels.create_validation_error` | WARN | `{ repo_id, actor_id, field, error_code, value_length }` | Create validation failure |
| `repo.settings.labels.create_conflict` | WARN | `{ repo_id, actor_id, label_name }` | Duplicate name on create |
| `repo.settings.labels.update_conflict` | WARN | `{ repo_id, actor_id, label_id, label_name }` | Duplicate name on rename |
| `repo.settings.labels.db_error` | ERROR | `{ repo_id, owner, repo, operation, error_message }` | Database error |
| `repo.settings.labels.load_error` | ERROR | `{ owner, repo, actor_id, error_message, status_code }` | Page load failure |

### Prometheus Metrics

**Counters:**
- `codeplane_repo_settings_labels_page_views_total`
- `codeplane_repo_settings_labels_creates_total{status}` (success, validation_error, conflict, forbidden, internal)
- `codeplane_repo_settings_labels_updates_total{status}`
- `codeplane_repo_settings_labels_deletes_total{status}`
- `codeplane_repo_settings_labels_permission_denied_total`
- `codeplane_repo_settings_labels_color_picker_selections_total{type}` (preset, random, manual)

**Histograms:**
- `codeplane_repo_settings_labels_page_load_duration_seconds` (buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0s)
- `codeplane_repo_settings_labels_create_duration_seconds` (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)
- `codeplane_repo_settings_labels_update_duration_seconds` (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)
- `codeplane_repo_settings_labels_delete_duration_seconds` (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)

**Gauges:**
- `codeplane_repo_settings_labels_active_sessions`

### Alerts

#### Alert: `RepoSettingsLabelsCreateErrorRateHigh`
- **Condition**: `rate(codeplane_repo_settings_labels_creates_total{status="internal"}[5m]) / rate(codeplane_repo_settings_labels_creates_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check `repo.settings.labels.db_error` logs (filter by `operation: "create"`).
  2. Verify database connectivity via health check.
  3. Check lock contention on `labels` table via `pg_stat_activity`.
  4. Verify unique constraint on `(repository_id, name)` exists.
  5. Check disk space on database volume.
  6. If isolated to one repo, check label state integrity.
  7. If transient, monitor for auto-recovery; if persistent, restart server and escalate.

#### Alert: `RepoSettingsLabelsDeleteLatencyHigh`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_repo_settings_labels_delete_duration_seconds_bucket[5m])) > 3.0`
- **Severity**: Warning
- **Runbook**:
  1. Cross-reference with `codeplane_label_delete_issues_affected` — may be high-issue-count deletions.
  2. `EXPLAIN ANALYZE` on `DELETE FROM issue_labels WHERE label_id = $1`.
  3. Check table bloat/vacuum on `labels` and `issue_labels`.
  4. Review server resource utilization.
  5. Consider batching or adding index on `issue_labels(label_id)`.

#### Alert: `RepoSettingsLabelsPageLoadSlow`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_settings_labels_page_load_duration_seconds_bucket[5m])) > 3.0`
- **Severity**: Warning
- **Runbook**:
  1. Check `GET /api/repos/:owner/:repo/labels` latency.
  2. Examine slow query logs for `listLabelsByRepo`/`countLabelsByRepo`.
  3. Verify indexes on `labels.repository_id`.
  4. Check for repos with unusually large label counts.
  5. Review network/CDN conditions.
  6. Profile client-side rendering.

#### Alert: `RepoSettingsLabelsPermissionDeniedSpike`
- **Condition**: `rate(codeplane_repo_settings_labels_permission_denied_total[15m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. Check logs for actor IDs.
  2. Determine if single user with broken bookmark/automation.
  3. If many users, check if UI exposed Settings tab to non-admin users.
  4. Verify route guard.
  5. No action unless customer complaints.

### Error Cases and Failure Modes

| Error Case | User Experience | Recovery |
|---|---|---|
| Page load fails (network) | Inline error + Retry button | Click Retry |
| Page load fails (404) | 404 page | Repo deleted; navigate elsewhere |
| Page load fails (403) | Redirect + toast | Request admin access |
| Create fails (422) | Inline field error; form preserved | Fix and retry |
| Create fails (409) | Inline error: duplicate name | Choose different name |
| Create fails (403) | Toast | Permissions revoked |
| Create fails (500) | Toast; form preserved | Retry |
| Edit fails (409) | Inline error: duplicate name | Choose different name |
| Edit fails (404) | Toast; row removed | Label deleted by another user |
| Delete fails (404) | Toast; row removed | Already deleted |
| Delete fails (500) | Toast; row stays | Retry |
| Concurrent modification | Last-write-wins | Refresh page |

## Verification

### API Integration Tests

1. **Create label and verify in list** — POST create "settings-test" with color `aabbcc`. GET list. Assert label present with `#aabbcc`.
2. **Create label with preset color** — POST with `d73a4a`. Assert 201, color `#d73a4a`.
3. **Create label with random valid hex** — POST with random 6-char hex. Assert 201.
4. **Create label with name at max (255 chars)** — Assert 201.
5. **Create label with name exceeding max (256 chars)** — Assert 422.
6. **Create label with whitespace-only name** — Assert 422.
7. **Create label with empty color** — Assert 422.
8. **Create label with invalid hex color (`gggggg`)** — Assert 422.
9. **Create label with 3-char hex (`f00`)** — Assert 422.
10. **Create label with # prefix in color** — Assert 201, response `#abcdef`.
11. **Create duplicate label name** — Assert 409.
12. **Update name only** — Assert 200, name changed, others preserved.
13. **Update color only** — Assert 200, color changed, others preserved.
14. **Update description only** — Assert 200, description changed, others preserved.
15. **Update all fields** — Assert 200, all updated.
16. **Update with empty body** — Assert 200, fields unchanged.
17. **Update to duplicate name** — Assert 409.
18. **Rename to own name (no-op)** — Assert 200.
19. **Delete label** — Assert 204.
20. **Delete removes label from issue** — Assert label absent from issue labels.
21. **Delete doesn't affect other labels on same issue** — Assert other label still present.
22. **Double delete returns 404** — Assert 404.
23. **List deterministic order** — Assert creation order.
24. **List pagination** — 35 labels, page 1 = 30, page 2 = 5, total = 35.
25. **List empty repo** — Assert `[]`, total 0.
26. **List with max page size** — `limit=100` works.
27. **Permission: unauthenticated gets 401 on mutations** — Assert 401.
28. **Archived repo blocks creation** — Assert appropriate error.
29. **Create label, name 1 char** — Assert 201.

### Web UI Playwright E2E Tests

#### Page Access and Permissions
30. Navigate as admin → page renders.
31. Navigate as non-admin → redirect with toast.
32. Navigate unauthenticated (public) → login redirect.
33. Navigate unauthenticated (private) → 404.
34. Navigate nonexistent repo → 404.
35. Settings sidebar shows "Labels".
36. Click "Labels" in sidebar → correct URL.
37. "Labels" sidebar item highlighted when active.

#### Create Form
38. Create form renders all fields.
39. Create button disabled when empty.
40. Button disabled with only name.
41. Button disabled with only color.
42. Button enabled with valid name + color.
43. Happy path: fill all, submit, toast + list update.
44. Create without description → success.
45. Color picker preset selection fills input.
46. Random color button fills valid hex.
47. Name character counter updates live.
48. Name at max 255 chars → success.
49. Name at 256 chars → counter red, button disabled.
50. Whitespace-only name → inline error.
51. Invalid hex color → inline error.
52. Short hex color → inline error.
53. Color swatch updates live.
54. Duplicate name → inline conflict error.
55. Special characters in name → success.
56. Emoji in name → success.
57. Form clears after success.
58. Form preserves state on error.

#### Label List
59. List renders correct count of labels.
60. Badge colors correct.
61. Descriptions displayed.
62. "No description" for empty.
63. Issue counts displayed.
64. Zero issues displayed.
65. Empty state message.
66. Total count header.
67. Pagination works.
68. Deterministic order.
69. White label has visible border.

#### Inline Edit
70. Edit button visible.
71. Click edit opens inline form.
72. Pre-fills correctly.
73. Save disabled when no changes.
74. Save enabled after name change.
75. Save enabled after color change.
76. Save enabled after description change.
77. Update name only → row updates.
78. Update color only → badge updates.
79. Update description only → text updates.
80. Update all fields.
81. Cancel reverts.
82. Escape cancels.
83. Duplicate name error inline.
84. Invalid color error inline.
85. Only one edit at a time.
86. "Saving…" state on submit.

#### Delete
87. Delete button visible.
88. Click opens confirmation dialog.
89. Dialog body text correct.
90. Cancel dismisses dialog.
91. Escape dismisses dialog.
92. Confirm removes label + toast.
93. No optimistic removal.
94. Deleted label absent from issue picker.
95. Error toast on failed delete.
96. Count header updates.

#### Archived Repository
97. Read-only banner shown.
98. Create form hidden/disabled.
99. Edit/Delete buttons hidden.
100. Label list still visible.
101. After unarchive, full functionality restored.

#### Loading and Error States
102. Skeleton loader during load.
103. Network error → inline error + Retry.
104. Retry reloads labels.
105. Network error during create → toast, state preserved.
106. Server error during create → toast, state preserved.

#### Responsive
107. 320px width renders correctly.
108. 768px width renders correctly.
109. 1440px width renders correctly.
110. Sidebar collapses on mobile.

#### Accessibility
111. Form fields have labels.
112. Tab navigates in order.
113. Enter triggers creation.
114. Delete dialog traps focus.
115. Escape dismisses dialog.
116. Errors announced to screen readers.
117. Color contrast meets WCAG 2.1 AA.

#### Keyboard Navigation
118. Tab through list actions.
119. Enter on Edit opens form.
120. Escape in edit form cancels.
121. Shift+Tab navigates backwards.
