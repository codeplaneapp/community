# REPO_SETTINGS_UI_GENERAL

Specification for REPO_SETTINGS_UI_GENERAL.

## High-Level User POV

When you own or administer a Codeplane repository, the repository settings page is your administrative control center. You reach it by navigating to your repository and clicking the "Settings" tab in the repository tab bar — visible only if you have admin or owner permission on the repository. The URL is `/:owner/:repo/settings`, and it feels like a natural extension of the repository workbench you already use for code, issues, and landing requests.

The General settings page is the first and default section within repository settings. It is where you manage the repository's public-facing identity — the information that determines how the repository appears in search results, on your profile, in team dashboards, and across every Codeplane client surface.

The page presents a clean, form-based editing experience organized into four clearly separated sections:

**General Information** is the top section. Here you see your repository's name (displayed but not editable, since Codeplane does not currently support renaming repositories), a description textarea where you can explain what the project is about, a default bookmark field that controls which jj bookmark Codeplane treats as the primary entry point for browsing and diffs, and a topics editor that lets you categorize your repository with standardized tags for discoverability. Every field has clear validation feedback — the description shows a live character counter, topics highlight invalid entries immediately, and the default bookmark field explains what happens if you leave it empty.

**Visibility** sits below the general information section. It shows the repository's current visibility state — Public or Private — with a clear explanation of what each means. Toggling visibility is one of the most consequential settings changes you can make, so the page requires you to confirm through a dialog before the change takes effect. Switching from public to private immediately restricts who can discover and access the repository. Switching from private to public makes it visible to everyone.

**Archive** provides the ability to archive or unarchive the repository. Archiving marks the repository as read-only — pushes are blocked, metadata edits are disabled, workflow dispatch is prevented, and landing request creation is stopped — but all existing content remains fully browsable. When the repository is archived, the general information fields become visually disabled and a notice explains that you must unarchive the repository before editing its metadata.

**Danger Zone** is the final section, visually distinguished with a red border to signal irreversible or high-impact operations. It contains two actions: transferring ownership of the repository to another user or organization, and permanently deleting the repository. Both actions require explicit confirmation — transfer asks for the new owner's name, and deletion requires typing the full `owner/repo` string.

Every change you make on this page takes effect immediately. There is no draft or staging concept. The "Save changes" button sends only the fields you actually modified, and after a successful save, the page reflects the new values and resets its dirty state. If something goes wrong — a validation error, a network failure, or a permission issue — the page tells you exactly what happened with an inline error or a toast notification, without losing your unsaved changes.

The General settings page is intentionally focused on the most fundamental repository attributes. Other settings categories — labels, milestones, webhooks, secrets, variables, deploy keys — live on their own dedicated settings sub-pages accessible from a sidebar navigation within the settings area.

## Acceptance Criteria

## Definition of Done

- [ ] Authenticated users with admin or owner permission on a repository can access the general settings page at `/:owner/:repo/settings`.
- [ ] The settings page is the default landing within the settings area and renders the general settings form.
- [ ] The page contains four sections: General Information, Visibility, Archive, and Danger Zone.
- [ ] All metadata update operations (description, default bookmark, topics, visibility) are functional and submit via `PATCH /api/repos/:owner/:repo`.
- [ ] Archive and unarchive operations are functional and submit via `POST /api/repos/:owner/:repo/archive` and `POST /api/repos/:owner/:repo/unarchive`.
- [ ] Transfer ownership is functional and submits via `POST /api/repos/:owner/:repo/transfer`.
- [ ] Delete repository is functional and submits via `DELETE /api/repos/:owner/:repo`.
- [ ] Non-admin authenticated users who navigate to `/:owner/:repo/settings` are redirected to the repository overview (`/:owner/:repo`) with an access-denied toast notification.
- [ ] Unauthenticated users who navigate to `/:owner/:repo/settings` for a private repo see a 404 page (consistent with the privacy model that avoids leaking repository existence).
- [ ] Unauthenticated users who navigate to `/:owner/:repo/settings` for a public repo are redirected to the login page.
- [ ] The "Settings" tab in the repository tab bar is only visible to users with admin or owner permission.
- [ ] All form validation matches the API constraints exactly — no mismatch between what the client allows and what the server accepts.
- [ ] The page is fully navigable via keyboard (Tab/Shift+Tab between fields, Enter to activate buttons and dialogs).
- [ ] The page renders correctly on viewports from 320px to 2560px wide.
- [ ] All verification tests pass.
- [ ] Observability instrumentation is in place.

## Field Constraints — General Information

- [ ] The **Repository name** is displayed as a read-only text field with a subtle "Repository names cannot be changed" note beneath it.
- [ ] The **Description** field is a textarea with a live character counter showing `N / 1024` characters remaining.
- [ ] The description field accepts Unicode content including emoji, CJK characters, accented characters, RTL text, and newlines.
- [ ] The description field allows an empty string to clear the description.
- [ ] The description field rejects input longer than 1024 characters — the counter turns red and the save button is disabled when the limit is exceeded.
- [ ] The **Default bookmark** field is a single-line text input pre-populated with the current value (defaults to `"main"`).
- [ ] The default bookmark field trims leading/trailing whitespace on blur.
- [ ] If the default bookmark field is cleared entirely, submitting saves the value as `"main"` (API normalization behavior).
- [ ] The default bookmark field rejects whitespace-only input — inline validation error: "Default bookmark cannot be blank."
- [ ] The **Topics** field is a tag-style input where the user types a topic and presses Enter or comma to add it as a tag chip.
- [ ] Each topic chip displays a × button to remove it.
- [ ] Topics are automatically lowercased as the user types.
- [ ] Topics that do not match the pattern `^[a-z0-9][a-z0-9-]{0,34}$` show an inline validation error.
- [ ] Duplicate topics (case-insensitive) are silently prevented.
- [ ] The topics editor displays a count indicator: `N / 20 topics`.
- [ ] When 20 topics are present, the input is disabled with a note: "Maximum of 20 topics reached."
- [ ] An empty topic list `[]` is a valid state.

## Field Constraints — Visibility

- [ ] The visibility section shows current state with explanation text.
- [ ] Changing visibility triggers a confirmation dialog before the API call.
- [ ] The confirmation dialog for public → private reads: "Make this repository private? Only users with explicit access will be able to see it."
- [ ] The confirmation dialog for private → public reads: "Make this repository public? Anyone on the internet will be able to see this repository."
- [ ] Canceling the dialog returns to the previous state with no API call.

## Field Constraints — Archive

- [ ] Archive section shows current status with timestamp when archived.
- [ ] When not archived: yellow "Archive this repository" button with explanatory text.
- [ ] When archived: green "Unarchive this repository" button with explanatory text.
- [ ] Both actions require a confirmation dialog.
- [ ] When archived, all General Information fields become visually disabled with a notice.
- [ ] Archive and unarchive are idempotent.

## Field Constraints — Danger Zone

- [ ] Red border and header distinguish the danger zone visually.
- [ ] Transfer opens a modal with new owner text input; confirm button disabled until input non-empty.
- [ ] On transfer success, browser redirects to new repo URL.
- [ ] On transfer error, error displayed inline in modal without closing.
- [ ] Delete opens a modal requiring typing full `owner/repo`; confirm button disabled until exact match.
- [ ] On delete success, browser redirects to owner profile.

## Form Behavior

- [ ] "Save changes" button is disabled until at least one field differs from loaded state.
- [ ] Only changed fields are submitted via PATCH.
- [ ] While saving, button shows spinner and inputs are disabled.
- [ ] On success (200): toast, fields update, dirty state resets.
- [ ] On validation error (422): inline error on offending field, form state preserved.
- [ ] On permission error (403): toast notification.
- [ ] On network error: toast notification, form state preserved.
- [ ] Empty submission (`{}`) is accepted as a no-op.

## Edge Cases

- [ ] Non-existent repository shows 404.
- [ ] Private repo without access shows 404 (not 403).
- [ ] Description of exactly 1024 characters succeeds.
- [ ] Description of 1025 characters prevented by client validation.
- [ ] Topic of exactly 35 characters succeeds.
- [ ] Topic of 36 characters rejected by client validation.
- [ ] Topic starting with hyphen rejected.
- [ ] Topic with spaces rejected.
- [ ] Concurrent saves use last-write-wins; next save returns latest state.
- [ ] Repository deleted externally → next API call returns 404 → user redirected.
- [ ] Browser back/forward preserves form state.

## Design

## Web UI Design

### Route and Layout

- **Route**: `/:owner/:repo/settings` (default sub-route, equivalent to `/:owner/:repo/settings/general`)
- **Parent layout**: Lives inside the existing repository layout, below the repository header and tab bar.
- **Settings sidebar**: A left-side navigation panel lists settings categories. "General" is the first item and is selected by default. Future categories (Labels, Milestones, Webhooks, Secrets, Variables, Deploy Keys) appear below.
- **Content area**: The right side renders the active settings section.

### General Information Section

```
┌─────────────────────────────────────────────────────────────┐
│  General                                                     │
├─────────────────────────────────────────────────────────────┤
│  Repository name                                              │
│  ┌─────────────────────────────────┐                         │
│  │ my-repo                         │  (read-only)            │
│  └─────────────────────────────────┘                         │
│  Repository names cannot be changed.                         │
│                                                               │
│  Description                                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ A jj-native software forge for modern teams             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                  42 / 1024   │
│                                                               │
│  Default bookmark                                             │
│  ┌─────────────────────────────────┐                         │
│  │ main                            │                         │
│  └─────────────────────────────────┘                         │
│  The default jj bookmark used for browsing, diffs, and       │
│  landing request targets.                                     │
│                                                               │
│  Topics                                                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ [jj ×] [forge ×] [typescript ×]  |type to add...      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                   3 / 20     │
│  Classify your repository with topics for discoverability.   │
│                                                               │
│  ┌──────────────┐                                            │
│  │ Save changes │  (disabled until form is dirty)            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

### Visibility Section

- Shows current state: "This repository is currently **Public/Private**."
- Explanation text describing implications.
- "Change visibility" button triggers confirmation dialog.
- Confirmation dialog text varies by direction (public→private vs private→public).
- Confirm submits `PATCH` with `{ "private": true|false }`.

### Archive Section

- Shows current status with timestamp when archived.
- Active state: yellow "Archive this repository" button.
- Archived state: green "Unarchive this repository" button.
- Confirmation dialog for both actions.
- When archived: General Information fields disabled, save button hidden, yellow banner at top.

### Danger Zone Section

- Red border and header distinguish the section.
- **Transfer ownership**: Card with description, "Transfer" button opens modal with new owner input and confirmation.
- **Delete repository**: Card with description, "Delete" button opens modal requiring `owner/repo` typed to confirm.

### Archived Repository State

When archived:
- Yellow banner: "This repository is archived. Unarchive it to edit general settings."
- All General Information fields are disabled (grayed out).
- "Save changes" button is hidden.
- Visibility "Change visibility" button is disabled.
- Archive section shows "Unarchive" button.
- Danger Zone remains fully functional.

### Responsive Behavior

- **< 768px**: Settings sidebar collapses to dropdown. Fields stack at full width.
- **768px – 1024px**: Sidebar 200px wide. Fields fill remaining width.
- **> 1024px**: Sidebar 240px wide. Form content max-width 640px.

### Loading and Error States

- **Initial load**: Skeleton loader while fetching.
- **Save in progress**: Spinner on button, inputs disabled.
- **Network error**: Toast notification, form state preserved.
- **404 during load**: Full-page 404 component.

## API Shape

No new API endpoints required. The settings UI consumes:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/repos/:owner/:repo` | `GET` | Load current repository state |
| `/api/repos/:owner/:repo` | `PATCH` | Update description, visibility, default_bookmark, topics |
| `/api/repos/:owner/:repo/archive` | `POST` | Archive repository |
| `/api/repos/:owner/:repo/unarchive` | `POST` | Unarchive repository |
| `/api/repos/:owner/:repo/transfer` | `POST` | Transfer ownership |
| `/api/repos/:owner/:repo` | `DELETE` | Delete repository |

## SDK Shape

Shared hooks from `@codeplane/ui-core`:

- `useRepo(owner, repo)` — fetches and caches repository metadata
- `useUpdateRepo()` — mutation hook wrapping `PATCH /api/repos/:owner/:repo`
- `useArchiveRepo()` — mutation hook wrapping archive endpoint
- `useUnarchiveRepo()` — mutation hook wrapping unarchive endpoint
- `useTransferRepo()` — mutation hook wrapping transfer endpoint
- `useDeleteRepo()` — mutation hook wrapping delete endpoint
- `useUser()` — current authenticated user context

## CLI Command

No new CLI commands required. The CLI already supports equivalent functionality through `codeplane repo edit`, `codeplane repo archive/unarchive`, `codeplane repo transfer`, and `codeplane repo delete`.

## TUI UI

The TUI already has a repository settings tab (tab 6) specified in `TUI_REPO_SETTINGS_VIEW.md`. No new TUI work required.

## Documentation

1. **Repository Settings Guide** — How to access settings, section-by-section walkthrough, permission requirements, cross-references to CLI equivalents.
2. **Quick Reference Card** — Compact reference: Web (`/:owner/:repo/settings`), CLI (`repo edit`, `repo archive`, etc.), TUI (Tab 6).

## Permissions & Security

## Authorization Roles

| Role | View Settings | Edit General Info | Change Visibility | Archive/Unarchive | Transfer | Delete |
|------|--------------|-------------------|-------------------|-------------------|----------|--------|
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Admin** (org team) | ✅ | ✅ | ✅ | ✅ | ❌ (owner only) | ❌ (owner only) |
| **Write** (collaborator) | ❌ (redirect) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Read** (collaborator) | ❌ (redirect) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Anonymous (public repo)** | ❌ (login redirect) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Anonymous (private repo)** | ❌ (404) | ❌ | ❌ | ❌ | ❌ | ❌ |

## Client-Side Permission Enforcement

- The "Settings" tab in the repository tab bar is only rendered if the current user has admin or owner permission.
- The route guard for `/:owner/:repo/settings` checks permission on mount. If the user lacks admin permission, they are redirected to `/:owner/:repo` with a toast: "You don't have permission to access repository settings."
- Danger Zone actions (transfer, delete) additionally check for owner-level permission. Org admins can edit settings and archive, but only the repository owner (or org owner for org repos) can transfer or delete.

## Rate Limiting

- Standard rate limiting applies to all API calls from the settings page (inherits global per-user rate limit).
- Metadata updates (`PATCH`): 30 requests per minute per user per repository.
- Archive/unarchive: shares standard repository mutation rate limit.
- Transfer: 5 requests per hour per user (across all repositories).
- Delete: 10 requests per hour per user (across all repositories).

## Data Privacy

- Repository descriptions, topics, default bookmark, and visibility are public metadata for public repositories.
- For private repositories, all settings metadata is only visible to users with at least read access.
- The settings page does not display or handle PII beyond the authenticated user's session and repository owner's username.
- Transfer preserves repository secrets and variables under the new owner — the confirmation dialog must explicitly mention this.
- No repository content (code, issues, diffs) is loaded on the settings page.
- Private repository settings pages return 404 to unauthorized users, not 403, to avoid leaking repository existence.

## Telemetry & Product Analytics

## Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `repo.settings.page_viewed` | User navigates to settings page | `repo_id`, `owner`, `repo_name`, `actor_id`, `referrer` (tab_bar, direct_url, sidebar), `is_archived`, `is_public` |
| `repo.settings.general.saved` | Successful general info save | `repo_id`, `owner`, `repo_name`, `actor_id`, `fields_changed` (array), `topics_count_after`, `description_length` |
| `repo.settings.general.save_failed` | Save attempt failed | `repo_id`, `owner`, `repo_name`, `actor_id`, `error_code` (401, 403, 404, 422, 500), `failed_field` |
| `repo.settings.visibility.changed` | Visibility confirmed and succeeded | `repo_id`, `owner`, `repo_name`, `actor_id`, `direction` (public_to_private, private_to_public) |
| `repo.settings.visibility.cancelled` | Visibility dialog cancelled | `repo_id`, `owner`, `repo_name`, `actor_id`, `proposed_direction` |
| `repo.settings.archived` | Repository archived | `repo_id`, `owner`, `repo_name`, `actor_id` |
| `repo.settings.unarchived` | Repository unarchived | `repo_id`, `owner`, `repo_name`, `actor_id`, `archive_duration_days` |
| `repo.settings.transfer.initiated` | Transfer modal opened | `repo_id`, `owner`, `repo_name`, `actor_id` |
| `repo.settings.transfer.completed` | Transfer succeeded | `repo_id`, `repo_name`, `from_owner`, `to_owner`, `actor_id` |
| `repo.settings.transfer.cancelled` | Transfer modal cancelled | `repo_id`, `owner`, `repo_name`, `actor_id` |
| `repo.settings.delete.initiated` | Delete modal opened | `repo_id`, `owner`, `repo_name`, `actor_id` |
| `repo.settings.delete.completed` | Delete succeeded | `repo_id`, `repo_name`, `owner`, `actor_id` |
| `repo.settings.delete.cancelled` | Delete modal cancelled | `repo_id`, `owner`, `repo_name`, `actor_id` |

## Funnel Metrics and Success Indicators

- **Settings page visit rate**: Percentage of repositories where settings is visited at least once per month — indicates discoverability.
- **Save success rate**: Should be > 95%. Low rate indicates validation UX gaps.
- **Field update frequency**: Breakdown of which fields are most frequently changed — informs field ordering.
- **Visibility toggle confirmation rate**: Of users who click "Change visibility," what percentage confirm — measures friction appropriateness.
- **Archive round-trip time**: Median time between archive and unarchive — short times (< 1 hour) indicate accidental archiving.
- **Danger Zone interaction rate**: Percentage of settings visitors who interact with Danger Zone — informs discoverability decisions.
- **Client surface distribution**: Web UI vs CLI vs TUI vs API for metadata updates — informs investment priority.

## Observability

## Logging Requirements

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| `repo.settings.page_loaded` | `DEBUG` | `{ repo_id, owner, repo, actor_id, load_duration_ms }` | Settings page completes initial data load |
| `repo.settings.general.saved` | `INFO` | `{ repo_id, owner, repo, actor_id, fields_changed }` | General info saved successfully |
| `repo.settings.visibility.changed` | `INFO` | `{ repo_id, owner, repo, actor_id, from, to }` | Visibility changed (audit-worthy) |
| `repo.settings.archived` | `INFO` | `{ repo_id, owner, repo, actor_id }` | Repository archived from settings |
| `repo.settings.unarchived` | `INFO` | `{ repo_id, owner, repo, actor_id, archive_duration_seconds }` | Repository unarchived from settings |
| `repo.settings.transfer.completed` | `INFO` | `{ repo_id, repo, from_owner, to_owner, actor_id }` | Transfer completed |
| `repo.settings.delete.completed` | `INFO` | `{ repo_id, owner, repo, actor_id }` | Repository deleted |
| `repo.settings.permission_denied` | `WARN` | `{ owner, repo, actor_id, required_role }` | User attempted settings access without permission |
| `repo.settings.save_validation_error` | `WARN` | `{ repo_id, owner, repo, actor_id, field, error_code, value_length }` | Submitted data failed validation |
| `repo.settings.save_db_error` | `ERROR` | `{ repo_id, owner, repo, error_message }` | Database error during save |
| `repo.settings.load_error` | `ERROR` | `{ owner, repo, actor_id, error_message, status_code }` | Settings page failed to load |

## Prometheus Metrics

**Counters:**
- `codeplane_repo_settings_page_views_total{section}` — page views by section
- `codeplane_repo_settings_saves_total{status, section}` — saves by status and section
- `codeplane_repo_settings_visibility_changes_total{direction}` — visibility changes
- `codeplane_repo_settings_archive_actions_total{action, status}` — archive/unarchive actions
- `codeplane_repo_settings_danger_zone_actions_total{action, status}` — transfer/delete actions
- `codeplane_repo_settings_permission_denied_total` — access denials

**Histograms:**
- `codeplane_repo_settings_page_load_duration_seconds` — page load time (buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0s)
- `codeplane_repo_settings_save_duration_seconds` — save round-trip time (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)

**Gauges:**
- `codeplane_repo_settings_active_sessions` — currently open settings pages

## Alerts

### Alert: `RepoSettingsSaveErrorRateHigh`
- **Condition**: `rate(codeplane_repo_settings_saves_total{status="server_error"}[5m]) / rate(codeplane_repo_settings_saves_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check `repo.settings.save_db_error` logs for the last 10 minutes.
  2. Verify database connectivity via health check query.
  3. Check for lock contention on `repositories` table via `pg_stat_activity`.
  4. Check disk space on database volume.
  5. If isolated to a specific repository, check data integrity on that row.
  6. If database is healthy, check Hono middleware stack for unexpected failures.
  7. Escalate to database on-call if infrastructure-related.

### Alert: `RepoSettingsSaveLatencyHigh`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_repo_settings_save_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency for `UPDATE repositories` statements.
  2. Look for table bloat — run `VACUUM ANALYZE repositories` if needed.
  3. Check for lock contention or concurrent long-running transactions.
  4. Verify index health on `repositories(lower_name, user_id)` and `repositories(lower_name, org_id)`.
  5. If isolated to specific repos, check for unusually large topic arrays.
  6. If systemic, check connection pool utilization and replication lag.

### Alert: `RepoSettingsPermissionDeniedSpike`
- **Condition**: `rate(codeplane_repo_settings_permission_denied_total[15m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. Check `repo.settings.permission_denied` logs to identify actors.
  2. Determine if single user repeatedly hitting settings URL (broken bookmark or automation).
  3. If many users affected, check if UI change made Settings tab visible to non-admin users.
  4. Verify route guard permission check is functioning.
  5. No immediate action unless combined with customer complaints.

### Alert: `RepoSettingsPageLoadSlow`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_settings_page_load_duration_seconds_bucket[5m])) > 3.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if `GET /api/repos/:owner/:repo` endpoint latency increased.
  2. Review network conditions (CDN, reverse proxy layers).
  3. Check client bundle size for significant increases.
  4. Profile client-side rendering for excessive re-renders.
  5. If API latency is bottleneck, follow save latency runbook for database investigation.

## Error Cases and Failure Modes

| Error Case | User Experience | Recovery |
|---|---|---|
| Page load fails (network) | Full-page error with "Retry" button | Click Retry or refresh |
| Page load fails (404) | Full-page 404 component | Repo may be deleted; navigate elsewhere |
| Page load fails (403) | Redirect to repo overview with toast | Request admin access |
| Save fails (422 validation) | Inline error on field; form preserved | Fix field and retry |
| Save fails (403 permission) | Toast notification; form preserved | Permissions revoked mid-session |
| Save fails (network) | Toast; form preserved | Retry when network restored |
| Save fails (500 server) | Toast "Something went wrong"; form preserved | Retry; check observability |
| Archive fails | Toast with error | Retry |
| Transfer fails (404) | Inline modal error | Correct target name |
| Transfer fails (409) | Inline modal error | Rename conflicting repo first |
| Delete fails | Inline modal error | Retry or check permissions |
| Concurrent modification | Last-write-wins; stale data until refresh | Refresh page |

## Verification

## API Integration Tests

1. `GET /api/repos/:owner/:repo` returns all fields needed by settings (description, private, is_public, default_bookmark, topics, is_archived, archived_at)
2. `PATCH` with `{ "description": "new" }` returns 200 with updated description
3. `PATCH` with `{ "private": true }` returns 200 with `private: true, is_public: false`
4. `PATCH` with `{ "default_bookmark": "develop" }` returns 200 with updated bookmark
5. `PATCH` with `{ "topics": ["jj", "forge"] }` returns 200 with topics array
6. `PATCH` with `{}` (empty body) returns 200 with unchanged state
7. `PATCH` with description of exactly 1024 characters returns 200
8. `PATCH` with description of 1025 characters returns 422
9. `PATCH` with `{ "topics": ["RUST"] }` returns 200 with normalized `["rust"]`
10. `PATCH` with `{ "topics": ["rust", "rust"] }` returns 200 with deduplicated `["rust"]`
11. `PATCH` with `{ "topics": ["invalid topic!"] }` returns 422
12. `PATCH` with `{ "default_bookmark": "   " }` returns 422
13. `PATCH` with `{ "default_bookmark": "" }` returns 200 with bookmark normalized to `"main"`
14. `PATCH` as non-admin returns 403
15. `PATCH` unauthenticated returns 401
16. `PATCH` on archived repo (description change) returns 422
17. `POST archive` returns 200 with `is_archived: true`
18. `POST unarchive` returns 200 with `is_archived: false`
19. Archive idempotency: archiving already-archived repo returns 200
20. Unarchive idempotency: unarchiving already-active repo returns 200
21. `POST transfer` with valid new_owner returns 200 with updated owner
22. `POST transfer` with nonexistent target returns 404
23. `POST transfer` with name collision returns 409
24. `POST transfer` to same owner returns 422
25. `DELETE` as owner returns 204
26. `DELETE` as non-owner returns 403
27. `PATCH` with 20 unique valid topics returns 200
28. `PATCH` with topic of 1 character `["a"]` returns 200
29. `PATCH` with topic of exactly 35 characters returns 200
30. `PATCH` with topic starting with number `["3d-models"]` returns 200
31. `PATCH` with topic starting with hyphen `["-rust"]` returns 422
32. After unarchiving, `PATCH` with description change returns 200

## Web UI Playwright E2E Tests

### Page Access and Permissions
33. Navigate to settings as admin → page renders with general section
34. Navigate to settings as non-admin → redirected to overview with toast
35. Navigate to settings unauthenticated (public repo) → redirected to login
36. Navigate to settings unauthenticated (private repo) → 404 page
37. Navigate to settings for nonexistent owner → 404 page
38. Navigate to settings for nonexistent repo → 404 page
39. Settings tab visible for admin users
40. Settings tab NOT visible for read-only users
41. Settings tab NOT visible for unauthenticated users on public repos

### General Information Form
42. Page loads with all fields pre-populated from current repo state
43. Repository name field is read-only
44. Edit description → save button becomes enabled
45. Edit description → save → toast appears → field reflects new value
46. Edit description to empty → save → description cleared
47. Edit description to 1024 chars → save succeeds
48. Type 1025 chars in description → counter turns red → save disabled
49. Edit default bookmark → save → value updates
50. Clear default bookmark → save → value shows "main"
51. Whitespace-only in default bookmark → inline error → save disabled
52. Add topic via Enter key → chip appears
53. Add topic via comma key → chip appears
54. Remove topic via × button → chip removed
55. Uppercase topic input → auto-lowercased
56. Duplicate topic → silently prevented
57. Invalid topic (spaces) → inline validation error
58. Topic starting with hyphen → inline validation error
59. Topic of 36 characters → inline validation error
60. Add 20 topics → input disabled with max message
61. Remove topic at 20 → input re-enabled
62. No changes → save button remains disabled
63. Change then undo → save button returns to disabled
64. Save multiple fields → all update correctly
65. Page reload → saved values persist

### Visibility Section
66. Shows "Public" for public repos
67. Shows "Private" for private repos
68. Click change visibility → confirmation dialog opens
69. Confirm → visibility updates → page reflects new state
70. Cancel → no API call → unchanged
71. Public → private: header badge updates

### Archive Section
72. Shows "active" for non-archived repos
73. Click archive → confirmation dialog
74. Confirm archive → archived status → fields disabled
75. Cancel archive → no change
76. Archived: general info fields disabled
77. Archived: save button hidden/disabled
78. Archived: unarchive button visible (green)
79. Click unarchive → confirm → fields editable
80. After unarchive: can edit and save

### Danger Zone — Transfer
81. Red border visible
82. Click Transfer → modal opens
83. Confirm disabled when input empty
84. Valid new owner → confirm → redirects to new URL
85. Nonexistent owner → inline error in modal
86. Name collision → inline error in modal
87. Cancel → modal closes, no API call
88. Modal preserves input on error

### Danger Zone — Delete
89. Click delete → modal opens
90. Confirm disabled until exact `owner/repo` typed
91. Partial name → confirm remains disabled
92. Exact `owner/repo` → confirm enabled
93. Confirm → redirects to owner profile
94. Repo no longer accessible after deletion
95. Cancel → modal closes, no API call

### Settings Sidebar
96. Sidebar visible with "General" first
97. "General" highlighted by default
98. Other categories navigate to sub-pages

### Loading and Error States
99. Skeleton loader shown while fetching
100. Network error during load → error with retry
101. Network error during save → toast, form preserved
102. Server error during save → toast, form preserved

### Responsive Design
103. Renders correctly at 320px width
104. Renders correctly at 768px width
105. Renders correctly at 1440px width
106. Sidebar collapses on mobile

### Accessibility
107. All fields have associated labels
108. Tab navigates through all interactive elements
109. Dialogs trap focus and dismiss with Escape
110. Errors announced to screen readers
111. Color contrast meets WCAG 2.1 AA

### Keyboard Navigation
112. Tab through fields in logical order
113. Enter on save triggers save
114. Enter in topics input adds topic
115. Escape in modal closes modal
116. Shift+Tab navigates backwards
