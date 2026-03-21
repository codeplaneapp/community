# REPO_SETTINGS_UI_MILESTONES

Specification for REPO_SETTINGS_UI_MILESTONES.

## High-Level User POV

When you manage a Codeplane repository, milestones are the time-bounded planning targets your team uses to organize issues around releases, sprints, or deliverables. The repository settings milestones page is where you go to define, inspect, and maintain these planning targets.

You reach the milestones settings page by navigating to your repository, clicking the "Settings" tab in the repository tab bar (visible only if you have admin or owner permission), and then selecting "Milestones" from the settings sidebar navigation. The URL is `/:owner/:repo/settings/milestones`. It sits alongside other settings categories like General, Labels, Webhooks, Secrets, Variables, and Deploy Keys in the settings sidebar.

The page is organized into two parts: a creation form at the top and the full list of existing milestones below it.

The **creation form** lets you define a new milestone by entering a title, optionally writing a description, and optionally setting a due date. The title is the milestone's display name — something like "v1.0," "Q2 Sprint 3," or "Security Hardening Phase." The description explains the milestone's scope, purpose, and success criteria so the team knows what completing this milestone means. The due date establishes a deadline that gives the team a shared target to work toward. Once you fill in the title and click "Create milestone," the new milestone appears instantly in the list below without a page reload.

The **milestone list** shows every milestone currently defined for the repository. The list is filterable by state — you can view all milestones, only open milestones, or only closed milestones. Each row displays the milestone's title, description, state (shown as a colored badge — green for open, purple for closed), and due date (with a relative time indicator like "Due in 12 days" or "Overdue by 3 days"). For each milestone you have write access to, you see action buttons to edit, close/reopen, and delete. Clicking "Edit" transforms the row into an inline edit form pre-filled with the milestone's current values. You can change the title, description, or due date — or any combination — and save. The close/reopen button lets you toggle the milestone's state with a single click. Clicking "Delete" opens a confirmation dialog warning that the milestone will be permanently removed and that all issues currently associated with it will have their milestone association cleared. Once confirmed, the milestone disappears from the list.

The milestones settings page is designed to feel like a fast, focused workspace for release and sprint planning management. You can create, rename, reschedule, describe, close, reopen, and clean up milestones without ever leaving the page. Every change takes effect immediately across all Codeplane surfaces — the web UI issue sidebar, CLI, TUI, editor integrations, and API consumers all see updated milestones right away because milestones are shared repository-level entities.

The page also handles edge cases gracefully. If you try to create a milestone with a title that already exists, you see a clear inline error. If another team member deletes a milestone while you're looking at the list, the next interaction tells you the milestone is gone rather than silently failing. If the repository is archived, the page shows your milestones in read-only mode with a notice that the repository must be unarchived before milestones can be modified. Overdue open milestones are visually highlighted so you can quickly spot planning targets that need attention.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users with admin or owner permission on a repository can access the milestones settings page at `/:owner/:repo/settings/milestones`.
- [ ] The milestones settings page is accessible from the settings sidebar under "Milestones."
- [ ] The page contains a milestone creation form and a filterable, paginated list of existing milestones.
- [ ] Milestone creation, editing (title, description, due date), state toggling (close/reopen), and deletion are fully functional from this page.
- [ ] All milestone operations call the existing Milestone API endpoints (POST, GET, PATCH, DELETE under `/api/repos/:owner/:repo/milestones`).
- [ ] Non-admin authenticated users who navigate to `/:owner/:repo/settings/milestones` are redirected to the repository overview (`/:owner/:repo`) with an access-denied toast notification.
- [ ] Unauthenticated users who navigate to `/:owner/:repo/settings/milestones` for a private repo see a 404 page.
- [ ] Unauthenticated users who navigate to `/:owner/:repo/settings/milestones` for a public repo are redirected to the login page.
- [ ] The "Settings" tab in the repository tab bar is only visible to users with admin or owner permission.
- [ ] All client-side validation matches the API constraints exactly — no mismatch between what the client allows and what the server accepts.
- [ ] The page is fully navigable via keyboard (Tab/Shift+Tab between fields, Enter to submit, Escape to dismiss dialogs).
- [ ] The page renders correctly on viewports from 320px to 2560px wide.
- [ ] All verification tests pass.
- [ ] Observability instrumentation is in place.

### Milestone Creation Form Constraints

- [ ] The **Title** field is a single-line text input, placeholder "Milestone title", required.
- [ ] The title is trimmed of leading/trailing whitespace before submission.
- [ ] The title must be 1–255 characters after trimming.
- [ ] An empty or whitespace-only title shows an inline validation error: "Milestone title is required."
- [ ] A title exceeding 255 characters shows an inline validation error: "Milestone title must be 255 characters or fewer." The character counter turns red.
- [ ] The title field displays a live character counter: `N / 255`.
- [ ] The title field accepts Unicode content including emoji, CJK characters, accented characters, punctuation, slashes, parentheses, and special characters.
- [ ] The **Description** field is a multiline textarea, placeholder "Description (optional)".
- [ ] The description is optional and may be empty.
- [ ] There is no maximum length enforced on the description.
- [ ] The **Due date** field is a date picker input allowing the user to select a calendar date.
- [ ] The due date is optional. Leaving it blank creates the milestone without a due date.
- [ ] The due date field allows selection of past dates (no future-only restriction).
- [ ] The due date is converted to an ISO 8601 string before submission to the API.
- [ ] A "Clear" button or action adjacent to the date picker allows removing a previously set due date.
- [ ] The **"Create milestone"** button is disabled until the title field is non-empty and passes client-side validation.
- [ ] While submitting, the button shows a spinner and all form inputs are disabled.
- [ ] On success (201): the form clears, the new milestone appears at the top of the open milestones list, and a success toast reads "Milestone created."
- [ ] On conflict (409): an inline error on the title field reads "A milestone with this title already exists."
- [ ] On validation error (422): inline errors appear on the offending fields.
- [ ] On permission error (403): toast notification "Permission denied."
- [ ] On network or server error (500): toast notification "Something went wrong. Please try again." Form state is preserved.

### Milestone List Constraints

- [ ] The milestone list displays all milestones for the repository, paginated (default 30, max 100).
- [ ] A state filter control (tabs or toggle) allows filtering by: "Open" (default), "Closed", or "All".
- [ ] The list header shows counts for each state: "N open" and "N closed."
- [ ] Each milestone row displays: title, state badge ("Open" in green or "Closed" in purple), due date (formatted as relative time with absolute date tooltip), and description (truncated to 2 lines with ellipsis if longer).
- [ ] Open milestones with a due date in the past show a red "Overdue" indicator or red-colored due date text.
- [ ] Milestones are displayed in deterministic order (by ID ascending, creation order).
- [ ] When the repository has no milestones matching the active filter, the list shows an empty state message: "No open milestones" / "No closed milestones" / "No milestones yet. Create one above to start organizing your issues."
- [ ] Pagination controls appear when milestones exceed page size.
- [ ] Each milestone row has a Close/Reopen button (toggle based on current state), Edit button, and Delete button.

### State Toggle Constraints (Close/Reopen)

- [ ] Clicking "Close" on an open milestone immediately sends `PATCH` with `{ "state": "closed" }` and the row updates to show "Closed" badge.
- [ ] Clicking "Reopen" on a closed milestone immediately sends `PATCH` with `{ "state": "open" }` and the row updates to show "Open" badge.
- [ ] While the state toggle request is in flight, the button shows a spinner and is disabled.
- [ ] On success: toast "Milestone closed" or "Milestone reopened", row badge updates, list counts update.
- [ ] On error: toast with error message, milestone state unchanged in the UI.
- [ ] The milestone moves between filter views immediately — closing a milestone while viewing the "Open" filter removes it from the current view (with a brief transition or info toast).

### Inline Edit Constraints

- [ ] Clicking "Edit" transforms the row into an inline form pre-filled with current title, description, and due date values.
- [ ] Same title validation rules as creation form (1–255 chars after trimming, unique per repo).
- [ ] Description textarea with no length limit.
- [ ] Due date picker pre-filled with current value (or empty if null), with a clear action.
- [ ] "Save changes" button is disabled until at least one field differs from loaded state.
- [ ] "Cancel" button (and Escape key) returns row to display state without saving.
- [ ] Only changed fields are submitted via PATCH.
- [ ] On success (200): row reverts to display mode with updated values, toast "Milestone updated."
- [ ] On conflict (409): inline error "A milestone with this title already exists."
- [ ] On not found (404): toast "Milestone not found," row removed from list.
- [ ] Only one milestone can be in edit mode at a time.

### Delete Constraints

- [ ] Clicking "Delete" opens a confirmation dialog.
- [ ] Dialog title: "Delete milestone \"<title>\"?"
- [ ] Dialog body: "This milestone will be permanently removed from this repository. All issues currently associated with this milestone will have their milestone cleared. This action cannot be undone."
- [ ] Dialog has Cancel (default focus) and Delete (red, destructive) buttons.
- [ ] On confirm and success (204): row removed, toast "Milestone deleted," count header updates.
- [ ] No optimistic deletion — row stays until server confirms.
- [ ] Escape dismisses dialog without action.

### Archived Repository Behavior

- [ ] Yellow banner: "This repository is archived. Unarchive it to manage milestones."
- [ ] Create form hidden or disabled. Close/Reopen, Edit, and Delete buttons hidden.
- [ ] Milestone list remains visible for reference.

### Edge Cases

- [ ] Non-existent repository → 404 page.
- [ ] Private repo without access → 404 page (not 403, to avoid leaking existence).
- [ ] Milestone title of exactly 255 characters → creation and update succeed.
- [ ] Milestone title of 256 characters → prevented by client validation.
- [ ] Milestone title of exactly 1 character → succeeds.
- [ ] Milestone title with leading/trailing whitespace → trimmed before submission.
- [ ] Due date set to a past date → succeeds (no future-only restriction).
- [ ] Due date set to far future (e.g., year 2099) → succeeds.
- [ ] Due date cleared (set to empty) on existing milestone → succeeds, `due_date` becomes null.
- [ ] Concurrent duplicate title creation → second shows conflict error.
- [ ] Concurrent deletion of same milestone → second shows "not found" toast.
- [ ] Closing an already-closed milestone → idempotent, no error.
- [ ] Reopening an already-open milestone → idempotent, no error.
- [ ] Browser back/forward preserves page state (including filter selection).
- [ ] Deep-linking directly to `/:owner/:repo/settings/milestones` works.
- [ ] Deep-linking with query parameter `?state=closed` pre-selects the closed filter.
- [ ] Milestone with extremely long description (10,000+ chars) → list row truncates gracefully.
- [ ] Unicode characters in title (emoji, CJK, RTL) → render correctly.
- [ ] Milestone deleted externally while user is viewing → next interaction shows not-found error gracefully.

## Design

### Web UI Design

#### Route and Layout

- **Route**: `/:owner/:repo/settings/milestones`
- **Parent layout**: Lives inside the existing repository layout, below the repository header and tab bar, within the settings area.
- **Settings sidebar**: Left-side navigation panel. "Milestones" appears below "Labels" and is highlighted when active with a left border accent (4px, primary color), bold text, and subtle background.
- **Content area**: The right side renders the milestones management interface.

#### Page Layout

The page has two main sections:

1. **Create Form Section**: A card at the top with heading "Create a new milestone."
2. **Milestone List Section**: Below the form, with state filter tabs and paginated list.

#### Create Form Details

```
┌─────────────────────────────────────────────────────────────┐
│  Create a new milestone                                      │
├─────────────────────────────────────────────────────────────┤
│  Title                                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Milestone title                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                   0 / 255   │
│                                                              │
│  Due date (optional)                                         │
│  ┌───────────────────────────────┐  ┌───────┐               │
│  │ yyyy-mm-dd                    │  │ Clear │               │
│  └───────────────────────────────┘  └───────┘               │
│                                                              │
│  Description (optional)                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌───────────────────┐                                       │
│  │ Create milestone  │  (disabled until title non-empty)     │
│  └───────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

- **Title input**: Single-line, placeholder "Milestone title", live character counter `N / 255` below.
- **Due date input**: Native date picker or custom date-picker component. Displays selected date in `yyyy-mm-dd` format. Adjacent "Clear" button to remove the date. Cleared state shows the placeholder.
- **Description textarea**: Multi-line (3–5 rows), placeholder "Description (optional)". Auto-grows with content.
- **Submit button**: "Create milestone" — primary styling, disabled until title is non-empty and valid.

#### Milestone List Details

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ 5 open    ○ 3 closed                                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │  v2.0                                    [Open ●]       ││
│  │  Second major release with new agent features           ││
│  │  📅 Due Jun 30, 2026 · Due in 100 days                  ││
│  │                          [Close] [Edit] [Delete]        ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │  v1.1                                    [Open ●]       ││
│  │  Bug fixes and performance improvements                 ││
│  │  📅 Due Apr 15, 2026 · Due in 24 days                   ││
│  │                          [Close] [Edit] [Delete]        ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Security Sprint                         [Open ●]       ││
│  │  No description                                         ││
│  │  📅 Due Mar 10, 2026 · 🔴 Overdue by 12 days            ││
│  │                          [Close] [Edit] [Delete]        ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │  v0.9-alpha                              [Open ●]       ││
│  │  Alpha testing phase                                    ││
│  │  No due date                                            ││
│  │                          [Close] [Edit] [Delete]        ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**State Filter Tabs:**
- Two clickable tabs/toggles at the top of the list: "N open" (default selected) and "N closed."
- Selecting a tab re-fetches the list with the corresponding `?state=open` or `?state=closed` query parameter.
- The unselected tab is clickable and shows the count for the other state.
- Both tabs show "0" counts when there are no milestones in that state.

**Each milestone row shows:**
- **Title**: Bold, large text. The primary identifier.
- **State badge**: Green "Open" pill or purple "Closed" pill, right-aligned.
- **Description**: Muted gray text below the title. If empty: "No description" in italic muted text. Truncated to 2 lines with ellipsis for long descriptions.
- **Due date line**: Calendar icon followed by formatted date (`Due Jun 30, 2026`), then relative time (`Due in 100 days` / `Overdue by 3 days` / `Due today`). Red text for overdue open milestones. No due date line if `due_date` is null — shows "No due date" in muted italic instead.
- **Closed timestamp** (closed milestones only): Shows "Closed on Mar 22, 2026" below the due date.
- **Actions**: Close/Reopen button, Edit (pencil icon) button, Delete (trash icon) button — right-aligned at bottom of row. Only visible for users with write access.

**Close/Reopen Button:**
- Open milestones show a "Close" button (outline style).
- Closed milestones show a "Reopen" button (outline style).
- Single-click triggers the state change immediately with a confirmation spinner on the button.

#### Inline Edit Form

When "Edit" is clicked, the milestone row expands into:

```
┌─────────────────────────────────────────────────────────────┐
│  Title                                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ v2.0                                                    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                   3 / 255   │
│                                                              │
│  Due date                                                    │
│  ┌───────────────────────────────┐  ┌───────┐               │
│  │ 2026-06-30                    │  │ Clear │               │
│  └───────────────────────────────┘  └───────┘               │
│                                                              │
│  Description                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Second major release with new agent features            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────┐  ┌────────┐                                │
│  │ Save changes │  │ Cancel │                                │
│  └──────────────┘  └────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

- Pre-filled with current values.
- Save disabled until dirty.
- Cancel returns to display mode.
- Only changed fields sent via PATCH.
- State is NOT editable in the inline edit form — use the Close/Reopen button instead.

#### Delete Confirmation Dialog

Modal centered on viewport:
- **Title**: `Delete milestone "v2.0"?`
- **Body**: "This milestone will be permanently removed from this repository. All issues currently associated with this milestone will have their milestone cleared. This action cannot be undone."
- **Buttons**: Cancel (secondary, default focus) | Delete (destructive, red).

#### Responsive Behavior

- **< 768px**: Sidebar collapses to dropdown. Create form fields stack vertically. Milestone rows stack vertically.
- **768px – 1024px**: Sidebar 200px. Create form fields stack. Milestone rows horizontal.
- **> 1024px**: Sidebar 240px. Create form fields stack. Content max-width 720px.

#### Loading and Error States

- **Initial load**: Skeleton loader for milestone list. Create form renders immediately.
- **List load error**: Inline error card with "Failed to load milestones" and "Retry" button.
- **Save in progress**: Spinner on button, inputs disabled.
- **Network error**: Toast notification, form state preserved.

### API Shape

No new API endpoints. Consumes existing milestone endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/repos/:owner/:repo/milestones` | GET | List milestones (paginated, with `?state=` filter) |
| `/api/repos/:owner/:repo/milestones/:id` | GET | Get single milestone |
| `/api/repos/:owner/:repo/milestones` | POST | Create milestone |
| `/api/repos/:owner/:repo/milestones/:id` | PATCH | Update milestone (partial — title, description, state, due_date) |
| `/api/repos/:owner/:repo/milestones/:id` | DELETE | Delete milestone |

**Request/Response shapes** — all defined in existing MILESTONE_CREATE, MILESTONE_LIST, MILESTONE_UPDATE, and MILESTONE_VIEW specs. Key response shape:

```typescript
interface MilestoneResponse {
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;           // "open" or "closed"
  due_date: string | null; // ISO 8601 or null
  closed_at: string | null; // ISO 8601 or null
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}
```

### SDK Shape

Shared hooks from `@codeplane/ui-core`:

- `useMilestones(owner, repo, state?, page?, perPage?)` — paginated milestone list with state filter and refetch.
- `useMilestone(owner, repo, id)` — single milestone fetch.
- `useCreateMilestone()` — mutation wrapping `POST /api/repos/:owner/:repo/milestones`.
- `useUpdateMilestone()` — mutation wrapping `PATCH /api/repos/:owner/:repo/milestones/:id`.
- `useDeleteMilestone()` — mutation wrapping `DELETE /api/repos/:owner/:repo/milestones/:id`.
- `useRepo(owner, repo)` — existing hook for archive status and permissions.
- `useUser()` — existing hook for auth context.

All hooks follow the same pattern as `useLabels`/`useCreateLabel`/`useUpdateLabel`/`useDeleteLabel`.

### CLI Command

No new CLI commands required. Existing commands cover the full milestone lifecycle: `milestone create`, `milestone list`, `milestone view`, `milestone update`, `milestone delete`.

### TUI UI

No dedicated TUI milestone management screen. Milestone management in TUI is available via CLI. No new TUI work required for this feature.

### Documentation

1. **Managing Milestones Guide** — Walkthrough of the milestones settings page: access, create (with and without due date), edit, close/reopen, delete. Annotated screenshots. Explain the overdue indicator. Cross-reference CLI equivalents (`milestone create`, `milestone list`, `milestone update`, `milestone delete`).
2. **Quick Reference Card** — Web: `/:owner/:repo/settings/milestones`. CLI: `milestone create/list/view/update/delete`. API: `POST/GET/PATCH/DELETE /api/repos/:owner/:repo/milestones`.
3. **Milestones Concept Page** — Ensure the existing milestone docs reference the settings UI as the primary management surface. Explain the relationship between milestones and issues (single-select association, automatic clearing on milestone deletion).

## Permissions & Security

### Authorization Roles

| Role | View Milestones Page | Create Milestones | Edit Milestones | Close/Reopen | Delete Milestones |
|------|---------------------|-------------------|-----------------|-------------|-------------------|
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Admin** (org team) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Write** (collaborator) | ❌ (redirect) | ❌ | ❌ | ❌ | ❌ |
| **Read** (collaborator) | ❌ (redirect) | ❌ | ❌ | ❌ | ❌ |
| **Anonymous (public repo)** | ❌ (login redirect) | ❌ | ❌ | ❌ | ❌ |
| **Anonymous (private repo)** | ❌ (404) | ❌ | ❌ | ❌ | ❌ |

Note: The settings pages require admin or owner permission to access. Write collaborators cannot access the settings area, even though they can create/edit/delete milestones through the API and CLI directly (which only require write access). This is consistent with REPO_SETTINGS_UI_GENERAL and REPO_SETTINGS_UI_LABELS.

### Client-Side Permission Enforcement

- The "Settings" tab in the repository tab bar is only rendered if the current user has admin or owner permission.
- The route guard for `/:owner/:repo/settings/milestones` checks permission on mount. If the user lacks admin permission, they are redirected to `/:owner/:repo` with a toast: "You don't have permission to access repository settings."
- Close/Reopen, Edit, and Delete buttons are conditionally rendered based on write access (which is implied by the admin/owner gate for accessing settings).

### Rate Limiting

- Standard rate limiting applies (inherits global per-user rate limit).
- Milestone creation: 30 requests per minute per user per repository.
- Milestone update (including state toggle): 30 requests per minute per user per repository.
- Milestone deletion: 30 requests per minute per user per repository.
- Milestone listing: standard read rate limit.
- All rate limits are applied at the API layer, not the UI layer.

### Data Privacy

- Milestones are repository-scoped metadata visible to anyone who can read the repo (public repos: visible to unauthenticated users; private repos: only visible to authorized users).
- Milestone titles and descriptions may contain user-authored arbitrary text, but no PII is expected or required.
- For private repositories, milestones are only visible to users with at least read access.
- Private repo settings pages return 404 to unauthorized users (not 403) to avoid leaking repository existence.
- No secrets, tokens, or credentials are involved in milestone management.
- The settings UI does not expose user email addresses or other PII — only usernames and milestone metadata.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `repo.settings.milestones.page_viewed` | User navigates to milestones settings | `repo_id`, `owner`, `repo_name`, `actor_id`, `referrer` (sidebar, direct_url), `open_milestones_count`, `closed_milestones_count`, `is_archived`, `active_filter` (open, closed, all) |
| `repo.settings.milestones.milestone_created` | Milestone created from settings | `repo_id`, `owner`, `repo_name`, `actor_id`, `milestone_id`, `milestone_title`, `has_description` (boolean), `has_due_date` (boolean), `title_length`, `description_length` |
| `repo.settings.milestones.milestone_create_failed` | Creation failed | `repo_id`, `owner`, `repo_name`, `actor_id`, `error_code` (409, 422, 403, 500), `error_field` |
| `repo.settings.milestones.filter_changed` | User switched state filter tab | `repo_id`, `actor_id`, `from_filter`, `to_filter`, `result_count` |
| `repo.settings.milestones.edit_started` | User clicked Edit | `repo_id`, `actor_id`, `milestone_id`, `milestone_state` |
| `repo.settings.milestones.milestone_updated` | Milestone updated from settings | `repo_id`, `actor_id`, `milestone_id`, `milestone_title`, `fields_changed` (array of field names), `was_rename` (boolean), `due_date_changed` (boolean) |
| `repo.settings.milestones.milestone_update_failed` | Update failed | `repo_id`, `actor_id`, `milestone_id`, `error_code` |
| `repo.settings.milestones.edit_cancelled` | User cancelled edit | `repo_id`, `actor_id`, `milestone_id`, `had_unsaved_changes` |
| `repo.settings.milestones.state_toggled` | Milestone closed or reopened via button | `repo_id`, `actor_id`, `milestone_id`, `milestone_title`, `new_state` (open or closed), `previous_state` |
| `repo.settings.milestones.state_toggle_failed` | State toggle failed | `repo_id`, `actor_id`, `milestone_id`, `error_code` |
| `repo.settings.milestones.delete_initiated` | Delete dialog opened | `repo_id`, `actor_id`, `milestone_id`, `milestone_title`, `milestone_state` |
| `repo.settings.milestones.milestone_deleted` | Milestone deleted from settings | `repo_id`, `actor_id`, `milestone_id`, `milestone_title`, `milestone_state`, `had_due_date` |
| `repo.settings.milestones.delete_cancelled` | Delete dialog cancelled | `repo_id`, `actor_id`, `milestone_id` |

### Funnel Metrics and Success Indicators

- **Milestones page visit rate**: Percentage of repositories where milestones settings is visited at least once per month — indicates discoverability.
- **Milestone creation rate from settings**: Creations via web settings UI vs CLI vs API — indicates preferred management surface.
- **Create success rate**: Should be >95%. Low rate indicates validation UX gaps.
- **Edit completion rate**: Edit starts → saved updates. Low rate indicates confusing edit UX.
- **State toggle rate**: Close and reopen actions per session — high rate indicates active release management.
- **Delete confirmation rate**: Delete initiations → confirmed. Measures friction appropriateness (target: 60–80% confirm rate).
- **Filter usage rate**: Percentage of sessions that switch between open/closed filters — indicates users manage both active and completed milestones.
- **Due date usage rate**: Percentage of milestones created with a due date — indicates teams leverage time-bounded planning.
- **Empty state → first milestone conversion**: Users seeing "No milestones yet" who create one in the same session.
- **Time on milestones page**: Median session duration (target: 30s–3m for healthy management sessions).
- **Overdue milestone visibility**: Number of times an overdue milestone is visible to a user — informs whether overdue highlighting drives action.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| `repo.settings.milestones.page_loaded` | DEBUG | `{ repo_id, owner, repo, actor_id, milestones_count, open_count, closed_count, load_duration_ms }` | Page completes initial load |
| `repo.settings.milestones.milestone_created` | INFO | `{ repo_id, owner, repo, actor_id, milestone_id, milestone_title, has_due_date, duration_ms }` | Milestone created |
| `repo.settings.milestones.milestone_updated` | INFO | `{ repo_id, owner, repo, actor_id, milestone_id, milestone_title, fields_changed, duration_ms }` | Milestone updated |
| `repo.settings.milestones.state_toggled` | INFO | `{ repo_id, owner, repo, actor_id, milestone_id, from_state, to_state, duration_ms }` | Milestone closed/reopened |
| `repo.settings.milestones.milestone_deleted` | INFO | `{ repo_id, owner, repo, actor_id, milestone_id, milestone_title, duration_ms }` | Milestone deleted |
| `repo.settings.milestones.permission_denied` | WARN | `{ owner, repo, actor_id, required_role }` | Unauthorized access attempt |
| `repo.settings.milestones.create_validation_error` | WARN | `{ repo_id, actor_id, field, error_code, value_length }` | Create validation failure |
| `repo.settings.milestones.create_conflict` | WARN | `{ repo_id, actor_id, milestone_title }` | Duplicate title on create |
| `repo.settings.milestones.update_conflict` | WARN | `{ repo_id, actor_id, milestone_id, milestone_title }` | Duplicate title on rename |
| `repo.settings.milestones.db_error` | ERROR | `{ repo_id, owner, repo, operation, error_message }` | Database error during any mutation |
| `repo.settings.milestones.load_error` | ERROR | `{ owner, repo, actor_id, error_message, status_code }` | Page load failure |

### Prometheus Metrics

**Counters:**
- `codeplane_repo_settings_milestones_page_views_total` — page views
- `codeplane_repo_settings_milestones_creates_total{status}` — (success, validation_error, conflict, forbidden, internal)
- `codeplane_repo_settings_milestones_updates_total{status}` — (success, validation_error, conflict, not_found, forbidden, internal)
- `codeplane_repo_settings_milestones_state_toggles_total{status, new_state}` — (success, error; open, closed)
- `codeplane_repo_settings_milestones_deletes_total{status}` — (success, not_found, forbidden, internal)
- `codeplane_repo_settings_milestones_permission_denied_total`
- `codeplane_repo_settings_milestones_filter_changes_total{to_state}` — (open, closed)

**Histograms:**
- `codeplane_repo_settings_milestones_page_load_duration_seconds` — (buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0s)
- `codeplane_repo_settings_milestones_create_duration_seconds` — (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)
- `codeplane_repo_settings_milestones_update_duration_seconds` — (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)
- `codeplane_repo_settings_milestones_delete_duration_seconds` — (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)

**Gauges:**
- `codeplane_repo_settings_milestones_active_sessions` — currently open milestones settings pages

### Alerts

#### Alert: `RepoSettingsMilestonesCreateErrorRateHigh`
- **Condition**: `rate(codeplane_repo_settings_milestones_creates_total{status="internal"}[5m]) / rate(codeplane_repo_settings_milestones_creates_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check `repo.settings.milestones.db_error` logs (filter by `operation: "create"`) for the last 10 minutes.
  2. Verify database connectivity via the health check endpoint (`GET /api/health`).
  3. Check lock contention on the `milestones` table via `pg_stat_activity` — look for long-held row or table locks.
  4. Verify the unique constraint on `(repository_id, title)` still exists — run `\d milestones` in psql.
  5. Check disk space on database volume — insufficient disk can cause INSERT failures.
  6. If isolated to one repository, check milestone count and data integrity for that repository.
  7. If transient, monitor for auto-recovery over 10 minutes. If persistent, check Hono middleware for unexpected failures and restart the server process.
  8. Escalate to database on-call if infrastructure-related.

#### Alert: `RepoSettingsMilestonesDeleteLatencyHigh`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_repo_settings_milestones_delete_duration_seconds_bucket[5m])) > 3.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if the slow deletions are correlated with milestones that have many associated issues (cascade clearing of `milestone_id` on issues).
  2. Run `EXPLAIN ANALYZE` on `DELETE FROM milestones WHERE repository_id = $1 AND id = $2` and on the cascade query that clears `milestone_id` from issues.
  3. Check for table bloat on `milestones` and `issues` tables — run `VACUUM ANALYZE milestones; VACUUM ANALYZE issues;` if needed.
  4. Verify indexes on `issues.milestone_id` and `milestones(repository_id, id)` are healthy.
  5. Review server resource utilization (CPU, memory, DB connection pool).
  6. If isolated to specific repositories with very high issue counts, consider adding background processing for cascade operations.

#### Alert: `RepoSettingsMilestonesPageLoadSlow`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_settings_milestones_page_load_duration_seconds_bucket[5m])) > 3.0`
- **Severity**: Warning
- **Runbook**:
  1. Check `GET /api/repos/:owner/:repo/milestones` endpoint latency — is the API itself slow?
  2. Examine slow query logs for `listMilestonesByRepo` and `countMilestonesByRepo` queries.
  3. Verify index on `milestones.repository_id` is healthy.
  4. Check for repositories with unusually large milestone counts (>1000).
  5. Review network/CDN conditions and reverse proxy latency.
  6. Profile client-side rendering — check for excessive re-renders in the milestone list component.

#### Alert: `RepoSettingsMilestonesPermissionDeniedSpike`
- **Condition**: `rate(codeplane_repo_settings_milestones_permission_denied_total[15m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. Check `repo.settings.milestones.permission_denied` logs to identify actor IDs and repositories.
  2. Determine if a single user is repeatedly hitting the milestones settings URL (broken bookmark, automation, or misunderstanding).
  3. If many users are affected, check if a UI change inadvertently made the Settings tab or Milestones link visible to non-admin users.
  4. Verify the route guard permission check is functioning correctly.
  5. No immediate action required unless combined with customer complaints or support tickets.

### Error Cases and Failure Modes

| Error Case | User Experience | Recovery |
|---|---|---|
| Page load fails (network) | Inline error card + Retry button | Click Retry |
| Page load fails (404) | 404 page | Repo deleted; navigate elsewhere |
| Page load fails (403) | Redirect + toast | Request admin access |
| Create fails (422 — validation) | Inline field error; form preserved | Fix field and retry |
| Create fails (409 — duplicate) | Inline error: "A milestone with this title already exists" | Choose different title |
| Create fails (403) | Toast "Permission denied" | Permissions revoked mid-session |
| Create fails (500) | Toast; form preserved | Retry |
| Edit fails (409 — duplicate) | Inline error: "A milestone with this title already exists" | Choose different title |
| Edit fails (404) | Toast "Milestone not found"; row removed | Deleted by another user |
| Edit fails (500) | Toast; edit form preserved | Retry |
| State toggle fails (404) | Toast; row removed | Deleted by another user |
| State toggle fails (500) | Toast; state unchanged in UI | Retry |
| Delete fails (404) | Toast "Milestone not found"; row removed | Already deleted |
| Delete fails (500) | Toast; row stays | Retry |
| Concurrent modification | Last-write-wins; next fetch shows latest | Refresh page |

## Verification

### API Integration Tests

1. **Create milestone and verify in list** — POST create "settings-test" with description and due date. GET list with `?state=open`. Assert milestone present with state "open".
2. **Create milestone without due date** — POST with title and description only. Assert 201, `due_date` is null.
3. **Create milestone with empty description** — POST with `description: ""`. Assert 201, response description is `""`.
4. **Create milestone with title at max (255 chars)** — Assert 201, response title has length 255.
5. **Create milestone with title exceeding max (256 chars)** — Assert 422 with `{ resource: "Milestone", field: "title", code: "invalid" }`.
6. **Create milestone with whitespace-only title** — Assert 422 with `{ resource: "Milestone", field: "title", code: "missing_field" }`.
7. **Create milestone with empty title** — Assert 422 with `{ resource: "Milestone", field: "title", code: "missing_field" }`.
8. **Create milestone with single character title** — POST with `title: "X"`. Assert 201.
9. **Create milestone with leading/trailing whitespace title** — POST with `title: "  v1.0  "`. Assert 201, response title is `"v1.0"`.
10. **Create milestone with exactly 255 chars after trimming** — POST with `title: " " + "A".repeat(255) + " "`. Assert 201.
11. **Create duplicate milestone** — Create "v1.0" twice. Assert second returns 409.
12. **Create with valid ISO 8601 due date** — POST with `due_date: "2026-06-01T00:00:00.000Z"`. Assert 201, due_date is valid ISO string.
13. **Create with date-only due date** — POST with `due_date: "2026-06-01"`. Assert 201.
14. **Create with invalid due date** — POST with `due_date: "not-a-date"`. Assert 422.
15. **Create with impossible date** — POST with `due_date: "2026-13-45T00:00:00Z"`. Assert 422.
16. **Create with empty string due date** — POST with `due_date: ""`. Assert 201, `due_date` is null.
17. **Create with past due date** — POST with `due_date: "2020-01-01"`. Assert 201 (past dates allowed).
18. **Create with very long description (10,000 chars)** — Assert 201.
19. **Create with Unicode title** — POST with `title: "リリース v1.0 🚀"`. Assert 201.
20. **Create with special characters in title** — POST with `title: "release / v1.0-beta (RC1)"`. Assert 201.
21. **Create with newlines in description** — Assert 201, newlines preserved.
22. **List open milestones** — Create 2 open + 1 closed. GET with `?state=open`. Assert 2 results.
23. **List closed milestones** — GET with `?state=closed`. Assert 1 result.
24. **List all milestones** — GET without state filter. Assert all 3.
25. **List empty repo** — Assert `[]`, total 0.
26. **List pagination** — Create 35 milestones. Page 1 = 30, page 2 = 5.
27. **List with max page size** — `limit=100` works.
28. **List with invalid state filter** — `?state=pending`. Assert 422.
29. **List deterministic order** — Assert creation order (ID ascending).
30. **Update title only** — PATCH with `{ "title": "v1.1" }`. Assert 200, title changed, other fields unchanged.
31. **Update description only** — PATCH. Assert 200, description changed.
32. **Update due date only** — PATCH with `{ "due_date": "2026-12-01" }`. Assert 200.
33. **Clear due date** — PATCH with `{ "due_date": "" }`. Assert 200, `due_date` is null.
34. **Update to duplicate title** — Assert 409.
35. **Rename to own title** — PATCH with same title. Assert 200 (no-op, no conflict).
36. **Close milestone** — PATCH with `{ "state": "closed" }`. Assert 200, state is "closed", `closed_at` is non-null ISO string.
37. **Reopen milestone** — PATCH with `{ "state": "open" }`. Assert 200, state is "open", `closed_at` is null.
38. **Close already-closed** — Assert 200, `closed_at` preserved (not overwritten).
39. **Reopen already-open** — Assert 200, no error.
40. **Empty body update** — PATCH with `{}`. Assert 200, fields unchanged.
41. **Delete milestone** — DELETE. Assert 204.
42. **Delete non-existent milestone** — Assert 404.
43. **Double delete** — Assert 404 on second delete.
44. **Permission: unauthenticated create** — Assert 401.
45. **Permission: read-only user create** — Assert 403.
46. **Permission: write user create** — Assert 201.
47. **Permission: unauthenticated list on public repo** — Assert 200.
48. **Permission: unauthenticated list on private repo** — Assert 403.
49. **Non-existent repository** — Assert 404.

### Web UI Playwright E2E Tests

#### Page Access and Permissions
50. Navigate to milestones settings as admin → page renders with create form and milestone list.
51. Navigate as non-admin → redirect to repo overview with toast.
52. Navigate unauthenticated (public repo) → login redirect.
53. Navigate unauthenticated (private repo) → 404 page.
54. Navigate for nonexistent repo → 404 page.
55. Settings sidebar shows "Milestones" item.
56. Click "Milestones" in sidebar → URL is `/:owner/:repo/settings/milestones`.
57. "Milestones" sidebar item highlighted when active.

#### Create Form
58. Create form renders title input, description textarea, due date picker, and submit button.
59. Submit button disabled when title is empty.
60. Submit button enabled when valid title is entered.
61. Happy path: fill title, description, due date, submit → toast "Milestone created" + milestone appears in list with "Open" badge.
62. Create without description → success, "No description" shows in list.
63. Create without due date → success, "No due date" shows in list.
64. Title character counter updates live.
65. Title at 255 chars → submit succeeds.
66. Title at 256 chars → counter turns red, submit disabled.
67. Whitespace-only title → inline error "Milestone title is required."
68. Duplicate title → inline error "A milestone with this title already exists."
69. Unicode title (emoji, CJK) → success, renders correctly.
70. Special characters in title → success.
71. Form clears after successful creation.
72. Form state preserved on error.
73. Due date picker allows past date selection.
74. Due date "Clear" button removes date value.

#### State Filter Tabs
75. Default filter is "Open" with correct count.
76. "Closed" tab shows correct count.
77. Click "Closed" tab → only closed milestones shown.
78. Click "Open" tab → only open milestones shown.
79. Counts update after creating a milestone.
80. Counts update after closing/reopening a milestone.
81. Counts update after deleting a milestone.
82. Empty state when no open milestones: "No open milestones."
83. Empty state when no closed milestones: "No closed milestones."
84. Empty state when no milestones at all: "No milestones yet. Create one above to start organizing your issues."

#### Milestone List Display
85. Milestone rows show title, state badge, description, due date.
86. Open milestones show green "Open" badge.
87. Closed milestones show purple "Closed" badge.
88. Due date shows formatted date and relative time.
89. Overdue open milestones show red "Overdue" indicator.
90. Milestone without due date shows "No due date" in muted text.
91. Long description truncates with ellipsis.
92. Milestones in deterministic creation order.
93. Closed milestones show "Closed on" timestamp.
94. Pagination works when milestones exceed page size.

#### Close/Reopen
95. "Close" button visible on open milestones.
96. "Reopen" button visible on closed milestones.
97. Click "Close" → spinner on button → milestone closes → badge updates → toast "Milestone closed."
98. Click "Reopen" → spinner → milestone reopens → badge updates → toast "Milestone reopened."
99. Closing a milestone while viewing "Open" filter removes it from current view.
100. Reopening a milestone while viewing "Closed" filter removes it from current view.
101. Counts update after close/reopen.

#### Inline Edit
102. Edit button visible on each milestone row.
103. Click Edit → inline form appears with pre-filled values.
104. Title pre-filled correctly.
105. Description pre-filled correctly.
106. Due date pre-filled correctly (or empty if null).
107. Save button disabled when no changes.
108. Save button enabled after changing title.
109. Save button enabled after changing description.
110. Save button enabled after changing due date.
111. Update title only → row updates with new title.
112. Update description only → row updates.
113. Update due date only → row updates with new date.
114. Clear due date → row shows "No due date."
115. Cancel button reverts to display mode.
116. Escape key cancels edit.
117. Duplicate title → inline error.
118. Only one edit at a time — editing a second closes the first.
119. "Saving…" state with spinner on submit.
120. Not found (404) during save → toast, row removed.

#### Delete
121. Delete button visible on each milestone.
122. Click Delete → confirmation dialog opens.
123. Dialog shows milestone title and warning about issue association clearing.
124. Cancel button dismisses dialog.
125. Escape dismisses dialog.
126. Confirm → milestone removed from list → toast "Milestone deleted."
127. No optimistic removal (row stays until server confirms).
128. Count header updates after deletion.
129. Error during delete → toast, row stays.

#### Archived Repository
130. Archived repo → yellow banner "This repository is archived. Unarchive it to manage milestones."
131. Create form hidden or disabled when archived.
132. Close/Reopen, Edit, and Delete buttons hidden when archived.
133. Milestone list remains visible for reference.
134. After unarchive → full functionality restored.

#### Loading and Error States
135. Skeleton loader shown during initial load.
136. Create form renders immediately (before list loads).
137. Network error during load → inline error + Retry button.
138. Retry button reloads milestone list.
139. Network error during create → toast, form state preserved.
140. Server error during create → toast, form state preserved.
141. Network error during state toggle → toast, state unchanged.
142. Server error during delete → toast, row preserved.

#### Responsive Design
143. 320px width renders correctly — sidebar collapsed, fields stacked.
144. 768px width renders correctly.
145. 1440px width renders correctly.
146. Sidebar collapses to dropdown on mobile.

#### Accessibility
147. All form fields have associated labels.
148. Tab navigates through all interactive elements in logical order.
149. Enter triggers milestone creation from title field.
150. Delete dialog traps focus.
151. Escape in delete dialog dismisses it.
152. Errors announced to screen readers via aria-live.
153. Color contrast meets WCAG 2.1 AA.
154. State badges have accessible text (not just color-dependent).

#### Keyboard Navigation
155. Tab through create form fields in order (title → due date → description → submit).
156. Tab through list actions (Close/Edit/Delete for each milestone).
157. Enter on Edit opens inline form.
158. Escape in inline edit cancels.
159. Shift+Tab navigates backwards.
160. Enter on submit in inline edit saves changes.

### CLI E2E Tests

161. **CLI: Create milestone with all options** — `codeplane milestone create "v1.0" --description "First release" --due-date "2026-06-30" --repo OWNER/REPO --json`. Assert JSON contains `id`, `title: "v1.0"`, `state: "open"`.
162. **CLI: Create milestone appears in list** — `codeplane milestone list --repo OWNER/REPO --json`. Assert created milestone present.
163. **CLI: List with state filter** — `codeplane milestone list --state open --repo OWNER/REPO --json`. Assert only open milestones.
164. **CLI: Update milestone title** — `codeplane milestone update <id> --title "v1.1" --repo OWNER/REPO --json`. Assert title changed.
165. **CLI: Close milestone** — `codeplane milestone update <id> --state closed --repo OWNER/REPO --json`. Assert state is "closed".
166. **CLI: Reopen milestone** — `codeplane milestone update <id> --state open --repo OWNER/REPO --json`. Assert state is "open".
167. **CLI: Delete milestone** — `codeplane milestone delete <id> --repo OWNER/REPO`. Assert success.
168. **CLI: Create duplicate title** — Assert error message about duplicate.
