# ORG_TEAM_MANAGEMENT_UI

Specification for ORG_TEAM_MANAGEMENT_UI.

## High-Level User POV

## High-Level User POV

When you manage an organization on Codeplane, teams are how you structure people and control who can access which repositories. The team management UI is the web surface where you see everything about a team, manage its members, assign repositories, adjust its settings, and — when the time comes — delete it.

You reach team management by navigating to your organization's Teams section and clicking on a team name. This takes you to the team detail page, a focused workspace where you can see the team's name, description, permission level, and when it was created. From this page, you manage two lists: the people on the team and the repositories the team can access.

The **Members** tab shows everyone currently on the team, with their username, display name, and avatar. If you are an organization owner, you can add new members by searching for organization members who are not yet on this team. You can also remove members individually. Adding someone to a team does not add them to the organization — they must already be an organization member. Removing someone from a team does not remove them from the organization either; it simply revokes the access path that flows through this team.

The **Repositories** tab shows every repository currently assigned to this team, along with its description and visibility. Organization owners can assign additional repositories from the pool of organization-owned repositories, and they can unassign repositories that no longer belong to this team's scope. Assigning a repository to a team means team members gain the team's permission level (read, write, or admin) on that repository. Unassigning it removes that access path.

Organization owners can also **edit the team's metadata** — changing its name, description, or permission level — directly from the team detail page. Changing the permission level affects all team members' access to all team-assigned repositories immediately. There is no staged rollout; the change takes effect the moment it is saved.

When a team has outlived its purpose, organization owners can **delete the team** from this page. Deletion permanently removes the team, disassociates all members, and revokes all repository access grants that flowed through it. No members lose their organization membership, and no repositories are deleted. A confirmation dialog ensures owners do not accidentally destroy a team.

Regular organization members (non-owners) can view team details, see who is on the team, and see which repositories are assigned. They cannot add or remove members, assign or unassign repositories, edit team settings, or delete the team. The UI hides or disables these owner-only controls for members, keeping the interface clean and preventing confusion.

This management surface brings the team lifecycle full circle in the web UI: owners can create teams from the team list page, populate and configure them from the team detail page, and retire them when they are no longer needed — all without leaving the browser.

## Acceptance Criteria

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated organization member can navigate to `/:org/-/teams/:team` in the web UI and view team details, team members, and team repositories. Organization owners can additionally add/remove team members, assign/unassign team repositories, edit team metadata, and delete the team. All states — loading, empty, error, success — are handled correctly across every sub-surface. The UI is consistent with the underlying API contracts defined in the ORG_TEAM_* sibling specifications. Feature-flag `ORG_TEAM_MANAGEMENT_UI` gates the entire surface.

### Functional Criteria — Team Detail Page

- [ ] The page is accessible at `/:org/-/teams/:team` for any authenticated organization member.
- [ ] The page is gated behind the `ORG_TEAM_MANAGEMENT_UI` feature flag. When disabled, navigating to this route shows a "Coming Soon" placeholder or redirects.
- [ ] The page renders the team's name as the page heading.
- [ ] The page displays the team's description below the heading (or a muted "No description" placeholder if empty).
- [ ] The page displays the team's permission level as a colored badge: `read` (gray/neutral), `write` (blue), `admin` (amber/orange).
- [ ] The page displays the team's creation date as relative time ("3 days ago") with a tooltip showing the full ISO 8601 timestamp.
- [ ] The page includes a tabbed navigation with two tabs: **Members** and **Repositories**.
- [ ] The Members tab is the default active tab on page load.
- [ ] Organization owners see an "Edit Team" button and a "Delete Team" button in the page header area. Members do not see these buttons.
- [ ] Breadcrumb navigation shows: `{Org Name} > Teams > {Team Name}`.

### Functional Criteria — Members Tab

- [ ] The Members tab displays a list of team members in a table/card layout.
- [ ] Each member row shows: avatar (32×32 round), display name, and username (muted, prefixed with `@`).
- [ ] Members are ordered alphabetically by username.
- [ ] The member list supports pagination when there are more than 30 members (default page size).
- [ ] Pagination controls (Previous / Next) appear at the bottom when there are multiple pages.
- [ ] The `X-Total-Count` header value is displayed as a count badge on the Members tab label (e.g., "Members (12)").
- [ ] Organization owners see an "Add Member" button above the member list.
- [ ] Organization owners see a "Remove" button on each member row.
- [ ] Organization members (non-owners) do not see the "Add Member" button or "Remove" buttons.
- [ ] Empty state (no members): centered message "This team has no members yet." with an "Add Member" CTA for owners, or "No members" for non-owners.

### Functional Criteria — Add Member Flow

- [ ] Clicking "Add Member" opens a dialog/modal titled "Add team member".
- [ ] The dialog contains a search input with placeholder "Search organization members...".
- [ ] Typing in the search input filters organization members who are NOT already on this team.
- [ ] Search results show avatar, display name, and username for each candidate.
- [ ] Clicking a search result sends `PUT /api/orgs/:org/teams/:team/members/:username` and shows a loading state on that result row.
- [ ] On success (`204`), the dialog closes, the member list refreshes, the member count updates, and a success toast appears: "Member added successfully".
- [ ] On error (`409` — already a member), an inline error appears in the dialog: "User is already a member of this team".
- [ ] On error (`422` — user is not an org member), an inline error appears: "User must be an organization member first".
- [ ] On error (`404` — user not found), an inline error appears: "User not found".
- [ ] Escape key or clicking the backdrop closes the dialog without side effects.
- [ ] The search input supports at least 2 character minimum before firing search requests.
- [ ] Search is debounced (300ms minimum) to avoid excessive API calls.

### Functional Criteria — Remove Member Flow

- [ ] Clicking "Remove" on a member row opens a confirmation dialog.
- [ ] Dialog title: "Remove team member".
- [ ] Dialog body: `Are you sure you want to remove @{username} from {team_name}? They will lose access to repositories assigned to this team. Their organization membership will not be affected.`
- [ ] Dialog buttons: "Cancel" (secondary) and "Remove" (destructive/red).
- [ ] Clicking "Remove" sends `DELETE /api/orgs/:org/teams/:team/members/:username` with a loading spinner on the button.
- [ ] On success (`204`), dialog closes, member disappears from the list, member count decrements, success toast: "Member removed".
- [ ] On error, dialog stays open with inline error message.
- [ ] Double-click prevention: button disabled after first click.

### Functional Criteria — Repositories Tab

- [ ] The Repositories tab displays a list of repositories assigned to this team.
- [ ] Each repository row shows: repository name (as a link to `/:owner/:repo`), description (truncated at ~80 characters with tooltip), visibility badge ("Public" or "Private"), and owner.
- [ ] Repositories are ordered alphabetically by name.
- [ ] The repository list supports pagination when there are more than 30 repositories.
- [ ] The `X-Total-Count` header value is displayed as a count badge on the Repositories tab label (e.g., "Repositories (5)").
- [ ] Organization owners see an "Assign Repository" button above the repository list.
- [ ] Organization owners see an "Unassign" button on each repository row.
- [ ] Organization members (non-owners) do not see the "Assign Repository" button or "Unassign" buttons.
- [ ] Empty state (no repositories): centered message "No repositories assigned to this team." with an "Assign Repository" CTA for owners.

### Functional Criteria — Assign Repository Flow

- [ ] Clicking "Assign Repository" opens a dialog/modal titled "Assign repository to team".
- [ ] The dialog contains a search input with placeholder "Search organization repositories...".
- [ ] Typing in the search input filters organization-owned repositories that are NOT already assigned to this team.
- [ ] Search results show repository name, description (truncated), and visibility for each candidate.
- [ ] Clicking a search result sends `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo` and shows a loading state.
- [ ] On success (`204`), dialog closes, repository list refreshes, repository count updates, success toast: "Repository assigned successfully".
- [ ] On error (`409` — already assigned), inline error: "Repository is already assigned to this team".
- [ ] On error (`422` — not an org repository), inline error: "Repository must belong to this organization".
- [ ] On error (`404`), inline error: "Repository not found".
- [ ] Escape key or backdrop click closes the dialog.

### Functional Criteria — Unassign Repository Flow

- [ ] Clicking "Unassign" on a repository row opens a confirmation dialog.
- [ ] Dialog title: "Remove repository from team".
- [ ] Dialog body: `Are you sure you want to remove {repo_name} from {team_name}? Team members will lose their team-based access to this repository.`
- [ ] Dialog buttons: "Cancel" (secondary) and "Remove" (destructive/red).
- [ ] On success (`204`), dialog closes, repository disappears from the list, count decrements, success toast: "Repository removed from team".
- [ ] On error, dialog stays open with inline error.

### Functional Criteria — Edit Team

- [ ] Clicking "Edit Team" opens a dialog/modal or navigates to `/:org/-/teams/:team/edit`.
- [ ] The edit form pre-populates with the team's current name, description, and permission level.
- [ ] Form fields: Name (text input, required, max 255 chars), Description (textarea, optional), Permission (select/radio: read, write, admin).
- [ ] "Save Changes" button is disabled when no fields have changed.
- [ ] "Save Changes" sends `PATCH /api/orgs/:org/teams/:team` with only the changed fields.
- [ ] On success (`200`), dialog/form closes, team detail page refreshes with new data, success toast: "Team updated".
- [ ] On error (`409` — name conflict), inline error on name field: "A team with this name already exists".
- [ ] On error (`422`), field-specific inline validation errors.
- [ ] Escape or Cancel closes without saving.

### Functional Criteria — Delete Team

- [ ] Clicking "Delete Team" opens a destructive confirmation dialog.
- [ ] Dialog title: "Delete team".
- [ ] Dialog body: `Are you sure you want to delete {team_name}? This will permanently remove the team, disassociate all members, and revoke all repository access grants that flow through this team. This action cannot be undone.`
- [ ] The dialog requires typing the team name to confirm (anti-pattern prevention for accidental deletion).
- [ ] The "Delete" button is disabled until the team name is typed correctly (case-sensitive match against display name).
- [ ] Clicking "Delete" sends `DELETE /api/orgs/:org/teams/:team`.
- [ ] On success (`204`), redirects to `/:org/-/teams` with a success toast: "Team deleted".
- [ ] On error, dialog stays open with inline error.

### Edge Cases

- [ ] Unauthenticated user navigating to `/:org/-/teams/:team`: redirected to `/login`.
- [ ] Authenticated non-member navigating to `/:org/-/teams/:team`: 403 error page.
- [ ] Navigating to a nonexistent team: 404 error page "Team not found".
- [ ] Navigating to a nonexistent organization: 404 error page "Organization not found".
- [ ] Team with 0 members and 0 repositories: both tabs show empty states.
- [ ] Team with 100+ members: pagination renders correctly, all members accessible.
- [ ] Team with 100+ repositories: pagination renders correctly.
- [ ] Team name with Unicode characters: displayed correctly in heading, breadcrumb, dialogs.
- [ ] Team name at maximum length (255 chars): truncated in breadcrumb with tooltip, displayed in full on the detail page heading.
- [ ] Member search with no results: "No matching members found" message in dialog.
- [ ] Repository search with no results: "No matching repositories found" message in dialog.
- [ ] All org members already on team: search shows empty state "All organization members are already on this team".
- [ ] All org repos already assigned: search shows empty state "All organization repositories are already assigned".
- [ ] Network error loading team detail: error banner with retry button.
- [ ] Session expires while on page: next API call redirects to login.
- [ ] Concurrent removal (member removed by another owner): next refresh shows updated list; stale remove attempt returns 404 gracefully.
- [ ] Owner removes themselves from the team: succeeds, page continues to render (they are still an org member/owner).
- [ ] Organization name in URL differs in case from stored name: resolves correctly.
- [ ] Team name in URL differs in case from stored name: resolves correctly.

### Boundary Constraints

- [ ] Team name input (edit form): `maxlength="255"`, required. Client-side rejects empty/whitespace-only.
- [ ] Team description input (edit form): no enforced length limit. Textarea with reasonable default height.
- [ ] Permission badge colors: `read` = gray/neutral, `write` = blue, `admin` = amber/orange.
- [ ] Member avatar: 32×32px, rounded. Fallback to initials or default avatar if URL fails.
- [ ] Repository name in list: links to `/:owner/:repo`. No truncation.
- [ ] Repository description in list: truncated at ~80 characters with full text in tooltip.
- [ ] Relative time: consistent formatting ("just now", "2 minutes ago", "3 hours ago", "3 days ago").
- [ ] Full timestamp tooltip: ISO 8601 format.
- [ ] Tab count badges: updated optimistically after add/remove operations.
- [ ] Confirmation dialogs: modal, trap focus, prevent background interaction.
- [ ] Toast notifications: auto-dismiss after 5 seconds; manually dismissible.
- [ ] Search debounce: 300ms minimum.
- [ ] Search minimum characters: 2 characters before first API call.
- [ ] Pagination: default 30 items per page, consistent with API defaults.

## Design

## Design

### Web UI Design

**Route:** `/:org/-/teams/:team`

**Layout:** Organization settings layout — breadcrumb navigation at top, main content area below. No sidebar within the team detail page itself; the team list page serves as the navigation hub.

**Breadcrumb:** `{Org Name} > Teams > {Team Name}`

**Page structure (top to bottom):**

1. **Page header section:**
   - **Team name** as `h1` heading.
   - **Description** as muted paragraph below heading. If empty, show "No description provided" in italicized muted text.
   - **Metadata row:** Permission badge (colored pill: read=gray, write=blue, admin=amber) · "Created {relative_time}" with tooltip.
   - **Action buttons** (owner-only, right-aligned in header):
     - "Edit Team" (secondary button, pencil icon).
     - "Delete Team" (destructive/outline button, trash icon).

2. **Tab bar:**
   - **Members ({count})** — default active tab.
   - **Repositories ({count})**.
   - Tab counts sourced from `X-Total-Count` response headers.

3. **Members tab content:**
   - **"Add Member" button** (top-right, primary style, owner-only). Icon: person-plus.
   - **Member table:**
     - Columns: Avatar + Name (flex, avatar 32×32 rounded + display name bold + @username muted), Actions (~80px, "Remove" button, owner-only).
     - If no members: centered empty state with icon, message, and CTA.
   - **Pagination controls** at bottom (Previous / Next) when total exceeds page size.

4. **Repositories tab content:**
   - **"Assign Repository" button** (top-right, primary style, owner-only). Icon: repo-plus.
   - **Repository table:**
     - Columns: Name (~200px, linked), Description (~300px flex, truncated), Visibility (~80px, badge), Owner (~120px), Actions (~100px, "Unassign" button, owner-only).
     - If no repositories: centered empty state.
   - **Pagination controls** at bottom.

**Loading state:** Skeleton loader matching page structure — skeleton header, skeleton tabs, skeleton table rows (5 rows).

**Error state:** Centered error banner: "Failed to load team details. Please try again." with retry button.

**404 state:** Centered: "Team not found" with link back to `/:org/-/teams`.

**403 state:** Centered: "You don't have access to this organization" with link to home.

---

**Add Member Dialog:**
- Modal with backdrop overlay.
- Title: "Add team member".
- Subtitle: "Search for organization members to add to {team_name}".
- Search input: autofocused, placeholder "Search by username or display name...".
- Results list: avatar (24×24) + display name + @username. Each row clickable. Hover highlights. Click triggers add.
- Loading: spinner in results area during search.
- Empty search results: "No matching members found".
- All members already on team: "All organization members are already on this team".
- Add in progress: clicked row shows spinner, other rows disabled.
- Success: dialog closes, list + count refresh, toast.
- Error: inline error above results area.
- Dismiss: Escape, backdrop click, or X button.

**Remove Member Dialog:**
- Modal with backdrop.
- Title: "Remove team member".
- Body text with @username and team name.
- Warning about access revocation.
- "Cancel" (secondary) + "Remove" (destructive/red) buttons.
- Loading spinner on Remove during API call.

**Assign Repository Dialog:**
- Modal with backdrop overlay.
- Title: "Assign repository to team".
- Subtitle: "Search for organization repositories to assign to {team_name}".
- Search input: autofocused, placeholder "Search by repository name...".
- Results list: repo name + description (truncated) + visibility badge. Each row clickable.
- Behavior mirrors Add Member dialog pattern.

**Unassign Repository Dialog:**
- Modal with backdrop.
- Title: "Remove repository from team".
- Body text with repo name and team name.
- Warning about access revocation.
- "Cancel" + "Remove" buttons.

**Edit Team Dialog:**
- Modal with backdrop.
- Title: "Edit team".
- Pre-populated form: Name (text input), Description (textarea, 3 rows), Permission (radio group with descriptions: Read — "Members can view team repositories", Write — "Members can push to team repositories", Admin — "Members have full control over team repositories").
- "Cancel" + "Save Changes" (primary, disabled when no changes) buttons.
- Inline validation: empty name shows "Team name is required", >255 chars shows "Team name is too long".
- Loading spinner on Save during API call.

**Delete Team Dialog:**
- Modal with destructive styling.
- Title: "Delete team" with red warning icon.
- Body: warning text about permanent consequences.
- Confirmation input: "Type the team name to confirm" with placeholder matching team name.
- "Cancel" + "Delete team" (red, disabled until name matches) buttons.
- Loading spinner on Delete during API call.

### API Shape

The UI consumes the following existing API endpoints:

| Operation | Method | Endpoint | Success | Key Error Codes |
|-----------|--------|----------|---------|------------------|
| Get team detail | `GET` | `/api/orgs/:org/teams/:team` | `200` | 401, 403, 404 |
| List team members | `GET` | `/api/orgs/:org/teams/:team/members` | `200` | 401, 403, 404 |
| Add team member | `PUT` | `/api/orgs/:org/teams/:team/members/:username` | `204` | 401, 403, 404, 409, 422 |
| Remove team member | `DELETE` | `/api/orgs/:org/teams/:team/members/:username` | `204` | 401, 403, 404 |
| List team repos | `GET` | `/api/orgs/:org/teams/:team/repos` | `200` | 401, 403, 404 |
| Assign team repo | `PUT` | `/api/orgs/:org/teams/:team/repos/:owner/:repo` | `204` | 401, 403, 404, 409, 422 |
| Unassign team repo | `DELETE` | `/api/orgs/:org/teams/:team/repos/:owner/:repo` | `204` | 401, 403, 404 |
| Update team | `PATCH` | `/api/orgs/:org/teams/:team` | `200` | 401, 403, 404, 409, 422 |
| Delete team | `DELETE` | `/api/orgs/:org/teams/:team` | `204` | 401, 403, 404 |
| List org members (for add dialog) | `GET` | `/api/orgs/:org/members` | `200` | 401, 403, 404 |
| List org repos (for assign dialog) | `GET` | `/api/orgs/:org/repos` | `200` | 401, 403, 404 |

All list endpoints support `?page=N&per_page=M` pagination with `X-Total-Count` response header.

### SDK Shape

UI-core client methods needed:

```typescript
// Team detail
getTeam(org: string, team: string): Promise<Team>

// Team members
listTeamMembers(org: string, team: string, page?: number, perPage?: number): Promise<PaginatedResponse<TeamMember>>
addTeamMember(org: string, team: string, username: string): Promise<void>
removeTeamMember(org: string, team: string, username: string): Promise<void>

// Team repositories
listTeamRepos(org: string, team: string, page?: number, perPage?: number): Promise<PaginatedResponse<TeamRepo>>
addTeamRepo(org: string, team: string, owner: string, repo: string): Promise<void>
removeTeamRepo(org: string, team: string, owner: string, repo: string): Promise<void>

// Team edit/delete
updateTeam(org: string, team: string, req: UpdateTeamRequest): Promise<Team>
deleteTeam(org: string, team: string): Promise<void>

// For add dialogs — candidate search
listOrgMembers(org: string, page?: number, perPage?: number): Promise<PaginatedResponse<OrgMember>>
listOrgRepos(org: string, page?: number, perPage?: number): Promise<PaginatedResponse<Repo>>
```

Interfaces:
```typescript
interface Team {
  id: number;
  organization_id: number;
  name: string;
  lower_name: string;
  description: string;
  permission: "read" | "write" | "admin";
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

interface TeamRepo {
  id: number;
  name: string;
  lower_name: string;
  owner: string;
  description: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface UpdateTeamRequest {
  name?: string;
  description?: string;
  permission?: "read" | "write" | "admin";
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}
```

### CLI Command

CLI equivalents already exist (specified in sibling specs):
- `codeplane org team view <org> <team>`
- `codeplane org team edit <org> <team> [--name <name>] [--description <desc>] [--permission read|write|admin]`
- `codeplane org team delete <org> <team> [--yes]`
- `codeplane org team member list <org> <team>`
- `codeplane org team member add <org> <team> <username>`
- `codeplane org team member remove <org> <team> <username>`
- `codeplane org team repo list <org> <team>`
- `codeplane org team repo add <org> <team> <repo>`
- `codeplane org team repo remove <org> <team> <repo>`

### TUI UI

The TUI provides team management through:
- Team detail screen accessible from the team list screen.
- Tabbed layout for Members and Repositories.
- `a` to add member/repo, `d` to remove, `e` to edit team, `D` to delete team (owner-only).
- Keyboard navigation with vim-style `j`/`k` movement.
- Specified in sibling TUI specs.

### Documentation

1. **"Managing teams in your organization"** — comprehensive guide covering the full team lifecycle from the web UI perspective: navigating to teams, viewing team details, adding/removing members, assigning/unassigning repositories, editing team metadata, deleting teams. Include annotated screenshots of each dialog and state.
2. **"Team permission levels"** — reference page explaining the three permission levels (read, write, admin) and how they translate to repository access when a repository is assigned to a team.
3. **"Organization roles and team management"** — explain the distinction between organization owners and members regarding team management capabilities. Clarify that only owners can create, edit, delete teams and manage team membership/repos.
4. **FAQ section**: "Does removing a member from a team remove them from the organization?" (No), "Does deleting a team delete its repositories?" (No), "Can I be on multiple teams?" (Yes), "What happens when I change a team's permission level?" (All members' access updates immediately).

## Permissions & Security

## Permissions & Security

### Authorization Roles

| Operation | Org Owner | Org Member | Authenticated Non-Member | Anonymous |
|-----------|-----------|------------|--------------------------|----------|
| View team detail page | ✅ Full access | ✅ Read-only view | ❌ 403 | ❌ 401 → redirect to login |
| View team members tab | ✅ Full access | ✅ Read-only view | ❌ 403 | ❌ 401 |
| View team repos tab | ✅ Full access | ✅ Read-only view | ❌ 403 | ❌ 401 |
| Add team member | ✅ Yes | ❌ Button hidden | ❌ 403 | ❌ 401 |
| Remove team member | ✅ Yes | ❌ Button hidden | ❌ 403 | ❌ 401 |
| Assign repository | ✅ Yes | ❌ Button hidden | ❌ 403 | ❌ 401 |
| Unassign repository | ✅ Yes | ❌ Button hidden | ❌ 403 | ❌ 401 |
| Edit team | ✅ Yes | ❌ Button hidden | ❌ 403 | ❌ 401 |
| Delete team | ✅ Yes | ❌ Button hidden | ❌ 403 | ❌ 401 |

### Scope Enforcement

- The web UI authenticates via session cookies, which are not scope-gated. All team management operations are available to any authenticated browser session with the appropriate org role.
- Owner-only controls (Add, Remove, Assign, Unassign, Edit, Delete buttons) must be hidden in the DOM for non-owner users — not merely visually hidden but excluded from the rendered DOM tree. This prevents CSS overrides from exposing controls.
- The server enforces authorization as defense-in-depth. Even if a non-owner manipulates the DOM or crafts a request, the API returns 403.
- The UI must never construct URLs or forms that allow one organization's data to be viewed in the context of another organization.
- Team detail pages for private/limited-visibility organizations return 404 (not 403) to unauthenticated or non-member users, to prevent leaking the existence of the organization.

### Rate Limiting

- All API calls from this page are subject to the platform-wide rate limiting middleware by authenticated user ID.
- Write operations (add member, remove member, assign repo, unassign repo, update team, delete team) share the platform default write rate limit.
- Search/list operations in the add-member and assign-repo dialogs use the platform default read rate limit.
- Client-side search debouncing (300ms) reduces unnecessary API load.
- `429` responses are displayed as an inline toast: "Too many requests. Please wait and try again."
- No special per-endpoint rate limits are required beyond platform defaults, as team management is a low-frequency operation.

### Data Privacy Constraints

- Team member avatars, display names, and usernames are organizational data. They are displayed only to authenticated organization members.
- Repository visibility badges are informational. Private repositories assigned to a team are visible in the team's repo list to all org members (since org membership implies repository awareness), but the repository content is still governed by repository-level access.
- No PII is stored by the UI in client-side storage (localStorage, sessionStorage, IndexedDB).
- Team names and descriptions are free-text fields that could contain sensitive information. They are displayed only to authenticated org members.
- No team data should appear in client-side error reporting payloads beyond team ID and org name.

## Telemetry & Product Analytics

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ui.org.team.detail_viewed` | User navigates to `/:org/-/teams/:team` | `user_id`, `org_name`, `team_name`, `team_permission`, `member_count`, `repo_count`, `is_owner` (bool) |
| `ui.org.team.members_tab_viewed` | User clicks or loads the Members tab | `user_id`, `org_name`, `team_name`, `member_count` |
| `ui.org.team.repos_tab_viewed` | User clicks the Repositories tab | `user_id`, `org_name`, `team_name`, `repo_count` |
| `ui.org.team.add_member_dialog_opened` | Owner clicks "Add Member" | `user_id`, `org_name`, `team_name`, `current_member_count` |
| `ui.org.team.member_added` | Member added successfully | `user_id`, `org_name`, `team_name`, `added_username`, `new_member_count` |
| `ui.org.team.member_add_failed` | Member add fails | `user_id`, `org_name`, `team_name`, `attempted_username`, `error_code`, `error_reason` |
| `ui.org.team.remove_member_initiated` | Owner clicks "Remove" on a member | `user_id`, `org_name`, `team_name`, `target_username` |
| `ui.org.team.member_removed` | Member removed successfully | `user_id`, `org_name`, `team_name`, `removed_username`, `new_member_count` |
| `ui.org.team.remove_member_cancelled` | Owner cancels remove dialog | `user_id`, `org_name`, `team_name` |
| `ui.org.team.assign_repo_dialog_opened` | Owner clicks "Assign Repository" | `user_id`, `org_name`, `team_name`, `current_repo_count` |
| `ui.org.team.repo_assigned` | Repository assigned successfully | `user_id`, `org_name`, `team_name`, `repo_name`, `new_repo_count` |
| `ui.org.team.repo_assign_failed` | Repository assign fails | `user_id`, `org_name`, `team_name`, `repo_name`, `error_code` |
| `ui.org.team.unassign_repo_initiated` | Owner clicks "Unassign" on a repo | `user_id`, `org_name`, `team_name`, `repo_name` |
| `ui.org.team.repo_unassigned` | Repository unassigned successfully | `user_id`, `org_name`, `team_name`, `repo_name`, `new_repo_count` |
| `ui.org.team.edit_dialog_opened` | Owner clicks "Edit Team" | `user_id`, `org_name`, `team_name` |
| `ui.org.team.team_updated` | Team updated successfully | `user_id`, `org_name`, `team_name`, `fields_changed` (string[]), `old_permission`, `new_permission` |
| `ui.org.team.team_update_failed` | Team update fails | `user_id`, `org_name`, `team_name`, `error_code` |
| `ui.org.team.delete_dialog_opened` | Owner clicks "Delete Team" | `user_id`, `org_name`, `team_name`, `member_count`, `repo_count` |
| `ui.org.team.team_deleted` | Team deleted successfully | `user_id`, `org_name`, `team_name`, `member_count_at_deletion`, `repo_count_at_deletion` |
| `ui.org.team.delete_cancelled` | Owner cancels delete dialog | `user_id`, `org_name`, `team_name` |
| `ui.org.team.delete_failed` | Team deletion fails | `user_id`, `org_name`, `team_name`, `error_code` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Team detail engagement rate** | % of team list views that result in a team detail view | > 40% |
| **Member management activity** | % of team detail views (by owners) that include at least one add/remove action | Tracked |
| **Repo assignment activity** | % of team detail views (by owners) that include at least one assign/unassign action | Tracked |
| **Add member completion rate** | % of add-member dialog opens that result in a successful add | > 70% |
| **Assign repo completion rate** | % of assign-repo dialog opens that result in a successful assign | > 70% |
| **Edit form completion rate** | % of edit dialog opens resulting in a successful save | > 60% |
| **Delete confirmation rate** | % of delete dialog opens where the owner types the name and confirms | 50–80% |
| **Remove member confirmation rate** | % of remove-member dialogs where owner confirms vs cancels | 60–80% |
| **Tab switching rate** | % of team detail views where user visits both tabs | Tracked |

### Success Indicators

- Team detail page load latency p50 < 300ms, p99 < 1.5s (includes team detail + initial member list fetch).
- Zero 5xx errors on team management operations over a rolling 24-hour window.
- At least 30% of organizations with teams have at least one team with both members and repositories assigned.
- Delete confirmation rate between 50-80% indicates the confirmation UX is working (not too easy, not too hard).
- Member add dialog search returns results within 500ms p99.

## Observability

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Team detail page loaded | `debug` | `request_id`, `org_name`, `team_name`, `status_code`, `latency_ms` | Client-side API call logging |
| Team members list loaded | `debug` | `request_id`, `org_name`, `team_name`, `member_count`, `page`, `latency_ms` | |
| Team repos list loaded | `debug` | `request_id`, `org_name`, `team_name`, `repo_count`, `page`, `latency_ms` | |
| Add member API call | `debug` | `request_id`, `org_name`, `team_name`, `username`, `status_code`, `latency_ms` | |
| Remove member API call | `debug` | `request_id`, `org_name`, `team_name`, `username`, `status_code`, `latency_ms` | |
| Assign repo API call | `debug` | `request_id`, `org_name`, `team_name`, `repo_owner`, `repo_name`, `status_code`, `latency_ms` | |
| Unassign repo API call | `debug` | `request_id`, `org_name`, `team_name`, `repo_owner`, `repo_name`, `status_code`, `latency_ms` | |
| Update team API call | `debug` | `request_id`, `org_name`, `team_name`, `fields_changed`, `status_code`, `latency_ms` | Do NOT log new team name if changed |
| Delete team API call | `info` | `request_id`, `org_name`, `team_name`, `status_code`, `latency_ms` | Elevated to info — destructive action |
| Search for candidates (members/repos) | `debug` | `request_id`, `search_query_length`, `result_count`, `latency_ms` | Do NOT log search query text |
| Unhandled error rendering team management page | `error` | `error_message`, `component_name`, `stack_trace`, `org_name`, `team_name` | Error boundary |

Server-side logging for the underlying API endpoints is specified in the individual ORG_TEAM_* sibling specs.

### Prometheus Metrics

**Server-side (defined in sibling specs, critical for UI health):**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_view_requests_total` | Counter | `status` | Team detail GET requests |
| `codeplane_org_team_view_duration_seconds` | Histogram | `status` | Team detail response latency |
| `codeplane_org_team_member_list_requests_total` | Counter | `status` | Team member list requests |
| `codeplane_org_team_member_list_duration_seconds` | Histogram | `status` | Member list latency |
| `codeplane_org_team_member_add_requests_total` | Counter | `status` | Add member requests |
| `codeplane_org_team_member_remove_requests_total` | Counter | `status` | Remove member requests |
| `codeplane_org_team_repo_list_requests_total` | Counter | `status` | Team repo list requests |
| `codeplane_org_team_repo_add_requests_total` | Counter | `status` | Assign repo requests |
| `codeplane_org_team_repo_remove_requests_total` | Counter | `status` | Unassign repo requests |
| `codeplane_org_team_update_requests_total` | Counter | `status` | Update team requests |
| `codeplane_org_team_delete_requests_total` | Counter | `status` | Delete team requests |

**Client-side:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_ui_org_team_detail_page_load_seconds` | Histogram | — | Time from navigation to fully rendered team detail page |
| `codeplane_ui_org_team_member_search_latency_seconds` | Histogram | — | Time from search keystroke to results rendered in add-member dialog |
| `codeplane_ui_org_team_repo_search_latency_seconds` | Histogram | — | Time from search keystroke to results rendered in assign-repo dialog |

### Alerts

#### Alert: Team Detail Page Load Degradation
- **Condition**: `histogram_quantile(0.95, rate(codeplane_org_team_view_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. `/:org/-/teams/:team` page is loading slowly due to slow team detail API.
  2. Check database query performance for `SELECT ... FROM teams WHERE organization_id = $1 AND lower_name = $2`.
  3. Verify `teams(organization_id, lower_name)` index is healthy.
  4. Check overall database load — CPU, connections, IO.
  5. If isolated to a specific org, check org-level data size.
  6. Verify no recent schema migration is holding table locks.

#### Alert: Team Member Management Error Spike
- **Condition**: `rate(codeplane_org_team_member_add_requests_total{status=~"5.."}[5m]) + rate(codeplane_org_team_member_remove_requests_total{status=~"5.."}[5m]) > 1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Users clicking Add/Remove member buttons are seeing errors.
  2. Check server error logs for `PUT/DELETE /api/orgs/:org/teams/:team/members/:username`.
  3. Verify database write health: connection pool, disk space, lock contention.
  4. Check for foreign key constraint failures (e.g., `team_members` referencing deleted teams or users).
  5. Verify the `addTeamMemberIfOrgMember` SQL function is working correctly.
  6. Check for recent deployment regression in `OrgService.addTeamMember` or `removeTeamMember`.

#### Alert: Team Repository Management Error Spike
- **Condition**: `rate(codeplane_org_team_repo_add_requests_total{status=~"5.."}[5m]) + rate(codeplane_org_team_repo_remove_requests_total{status=~"5.."}[5m]) > 1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Users clicking Assign/Unassign repository buttons are seeing errors.
  2. Check server error logs for `PUT/DELETE /api/orgs/:org/teams/:team/repos/:owner/:repo`.
  3. Verify database write health.
  4. Check for foreign key constraint failures on `team_repos` table.
  5. Verify the `addTeamRepoIfOrgRepo` SQL function is working correctly.
  6. Check for race conditions with concurrent repo assignment/unassignment.

#### Alert: Team Deletion Error Spike
- **Condition**: `rate(codeplane_org_team_delete_requests_total{status="500"}[5m]) > 0.5` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Users attempting to delete teams are seeing errors.
  2. Check server error logs for `DELETE /api/orgs/:org/teams/:team`.
  3. Verify cascading delete of `team_members` and `team_repos` rows is succeeding.
  4. Check for long-running transactions holding locks on the teams table.
  5. Check database disk space and connection pool health.
  6. Verify no foreign key constraints are preventing team deletion (inspect `pg_constraint` on the teams table).

#### Alert: Team Update Conflict Rate Spike
- **Condition**: `rate(codeplane_org_team_update_requests_total{status="409"}[15m]) / rate(codeplane_org_team_update_requests_total[15m]) > 0.3` sustained for 15 minutes.
- **Severity**: Informational
- **Runbook**:
  1. >30% of team update attempts are hitting name conflicts.
  2. Check if a single org is producing all conflicts (inspect org_name label).
  3. This may indicate a UX issue where owners cannot see existing team names before editing.
  4. Review whether the edit form should pre-check name availability.
  5. No infrastructure action required — this is a product signal.

### Error Cases and Failure Modes

| Failure Mode | User Impact | Behavior |
|-------------|-------------|----------|
| Team detail API returns `500` | Cannot see team | Error banner with retry button |
| Team detail API returns `401` | Session expired | Redirect to login page |
| Team detail API returns `403` | Not an org member | 403 error page |
| Team detail API returns `404` | Team doesn't exist | 404 page with link to team list |
| Member list API returns `500` | Cannot see members | Error banner in Members tab with retry |
| Add member API returns `409` | Already a member | Inline error in dialog; dialog stays open |
| Add member API returns `422` | Not an org member | Inline error in dialog |
| Add member API returns `500` | Server failure | Inline error in dialog |
| Remove member API returns `404` | Already removed | Dialog closes; member already gone from list; toast: "Member was already removed" |
| Remove member API returns `500` | Server failure | Dialog stays open with inline error |
| Repo list API returns `500` | Cannot see repos | Error banner in Repos tab with retry |
| Assign repo API returns `409` | Already assigned | Inline error in dialog |
| Assign repo API returns `422` | Not an org repo | Inline error in dialog |
| Unassign repo API returns `404` | Already removed | Dialog closes; repo already gone |
| Update team API returns `409` | Name conflict | Inline error on name field |
| Update team API returns `422` | Validation | Field-specific inline errors |
| Delete team API returns `500` | Cannot delete | Dialog stays open with inline error |
| Network timeout on any request | Loading hangs | After 10s, show error with retry |
| JS error in component | Page fails | Error boundary with "Something went wrong" + reload button |

## Verification

## Verification

### Playwright (Web UI) E2E Tests — Page Load and Navigation

- [ ] **Navigate to team detail**: Authenticated org member navigates to `/:org/-/teams/:team` → page loads with team name, description, permission badge.
- [ ] **Breadcrumb shows correct path**: Breadcrumb reads `{Org Name} > Teams > {Team Name}`.
- [ ] **Default tab is Members**: Members tab is active on page load.
- [ ] **Tab switching works**: Click Repositories tab → repo content loads. Click Members tab → member content loads.
- [ ] **Tab counts are displayed**: Members tab shows count, Repositories tab shows count.
- [ ] **Permission badge displays correctly**: Team with `read` → gray badge, `write` → blue badge, `admin` → amber badge.
- [ ] **Description displays**: Team with description → paragraph visible. Team without → "No description provided" placeholder.
- [ ] **Created date shows relative time**: "3 days ago" format with ISO 8601 tooltip.
- [ ] **Owner sees Edit and Delete buttons**: Authenticated as org owner → both buttons visible.
- [ ] **Member does not see Edit and Delete buttons**: Authenticated as org member (non-owner) → buttons not in DOM.
- [ ] **Unauthenticated redirected to login**: Visit URL without auth → redirect to `/login`.
- [ ] **Non-member sees 403**: Authenticated user who is not an org member → 403 error page.
- [ ] **Nonexistent team shows 404**: Visit `/:org/-/teams/nonexistent` → 404 page with link to team list.
- [ ] **Nonexistent org shows 404**: Visit `/nonexistent-org/-/teams/test` → 404 page.
- [ ] **Direct URL access works**: Typing `/:org/-/teams/:team` directly loads correctly.
- [ ] **Case-insensitive team name in URL**: `/:org/-/teams/BACKEND` resolves to "backend" team.
- [ ] **Case-insensitive org name in URL**: `/MYORG/-/teams/:team` resolves correctly.

### Playwright (Web UI) E2E Tests — Members Tab Display

- [ ] **Member list renders**: Team with 3 members → 3 rows visible.
- [ ] **Member row shows avatar, display name, username**: All three elements present per row.
- [ ] **Avatar is 32×32 and rounded**: Visual verification.
- [ ] **Username prefixed with @**: "@johndoe" format.
- [ ] **Members ordered alphabetically**: Members a, b, c appear in alphabetical order.
- [ ] **Pagination for 31+ members**: Create 31 members → pagination controls visible.
- [ ] **Pagination navigation**: Click Next → page 2 loads. Click Previous → page 1 loads.
- [ ] **Empty state for zero members**: Team with 0 members → empty state message visible.
- [ ] **Empty state CTA for owners**: Owner sees "Add Member" CTA in empty state.
- [ ] **Empty state no CTA for members**: Non-owner sees only "No members" message.
- [ ] **Owner sees Remove buttons**: Each member row has a Remove button for owners.
- [ ] **Member does not see Remove buttons**: Non-owner → Remove buttons not in DOM.
- [ ] **Owner sees Add Member button**: Button visible above member list.
- [ ] **Member does not see Add Member button**: Button not in DOM for non-owners.

### Playwright (Web UI) E2E Tests — Add Member Flow

- [ ] **Add Member opens dialog**: Click button → modal appears with search input.
- [ ] **Dialog title correct**: "Add team member".
- [ ] **Search input is autofocused**: Input has focus on dialog open.
- [ ] **Search returns matching org members**: Type username → matching candidates appear.
- [ ] **Search excludes existing team members**: Members already on team do not appear in results.
- [ ] **Search result shows avatar, name, username**: Visual elements present.
- [ ] **Clicking result adds member**: Click candidate → loading state → dialog closes → member in list → toast.
- [ ] **Member count updates after add**: Tab count increments.
- [ ] **Duplicate add shows error**: Add same member twice → 409 → inline error "User is already a member of this team".
- [ ] **Non-org-member add shows error**: Attempt to add user not in org → 422 → inline error.
- [ ] **Search with no results**: Type nonexistent username → "No matching members found".
- [ ] **All members already added**: When all org members are on team → "All organization members are already on this team".
- [ ] **Escape closes dialog**: Press Escape → dialog closes, no side effects.
- [ ] **Backdrop click closes dialog**: Click outside → dialog closes.
- [ ] **Search debounce**: Typing quickly does not fire excessive requests (verify network panel).
- [ ] **Minimum 2 characters**: Typing 1 character does not trigger search.

### Playwright (Web UI) E2E Tests — Remove Member Flow

- [ ] **Remove opens confirmation dialog**: Click Remove → modal appears.
- [ ] **Dialog title correct**: "Remove team member".
- [ ] **Dialog mentions username**: @username appears in body text.
- [ ] **Dialog mentions team name**: Team name appears in body text.
- [ ] **Cancel closes dialog**: Click Cancel → dialog closes, member still in list.
- [ ] **Escape closes dialog**: Same as Cancel.
- [ ] **Confirm removes member**: Click Remove → loading → dialog closes → member gone → toast.
- [ ] **Member count decrements**: Tab count updates.
- [ ] **Remove last member shows empty state**: Remove only member → empty state appears.
- [ ] **Error keeps dialog open**: API 500 → dialog stays open with error message.
- [ ] **Double-click prevention**: Button disabled after first click.
- [ ] **Already-removed member**: Another owner removed the member → 404 → dialog closes gracefully.

### Playwright (Web UI) E2E Tests — Repositories Tab Display

- [ ] **Repository list renders**: Team with 3 repos → 3 rows visible.
- [ ] **Repo row shows name, description, visibility, owner**: All elements present.
- [ ] **Repo name is a link**: Clicking navigates to `/:owner/:repo`.
- [ ] **Description truncated**: 100-char description truncated at ~80 with tooltip.
- [ ] **Visibility badge**: Public repo shows "Public" badge, private shows "Private".
- [ ] **Repos ordered alphabetically**: a-repo, b-repo, c-repo in order.
- [ ] **Pagination for 31+ repos**: Create 31 repos → pagination visible.
- [ ] **Empty state for zero repos**: Empty state message visible.
- [ ] **Owner sees Assign and Unassign buttons**: Both present for owners.
- [ ] **Member does not see Assign and Unassign buttons**: Not in DOM.

### Playwright (Web UI) E2E Tests — Assign Repository Flow

- [ ] **Assign Repository opens dialog**: Click button → modal appears.
- [ ] **Dialog title correct**: "Assign repository to team".
- [ ] **Search returns org repos**: Type repo name → matching repos appear.
- [ ] **Search excludes already-assigned repos**: Already-assigned repos not in results.
- [ ] **Clicking result assigns repo**: Click → loading → dialog closes → repo in list → toast.
- [ ] **Repo count updates**: Tab count increments.
- [ ] **Duplicate assign shows error**: 409 → inline error.
- [ ] **Non-org-repo shows error**: 422 → inline error.
- [ ] **Search with no results**: "No matching repositories found".
- [ ] **All repos already assigned**: "All organization repositories are already assigned".
- [ ] **Escape closes dialog**: No side effects.

### Playwright (Web UI) E2E Tests — Unassign Repository Flow

- [ ] **Unassign opens confirmation dialog**: Click Unassign → modal.
- [ ] **Dialog mentions repo and team name**: Both in body text.
- [ ] **Cancel closes dialog**: Repo still assigned.
- [ ] **Confirm unassigns repo**: Loading → dialog closes → repo gone → toast.
- [ ] **Repo count decrements**: Tab count updates.
- [ ] **Unassign last repo shows empty state**: Empty state appears.
- [ ] **Error keeps dialog open**: 500 → inline error.

### Playwright (Web UI) E2E Tests — Edit Team Flow

- [ ] **Edit Team opens dialog**: Click button → modal with form appears.
- [ ] **Form pre-populated**: Name, description, permission match current team state.
- [ ] **Save disabled when no changes**: No modifications → Save button disabled.
- [ ] **Change name enables Save**: Modify name → Save enabled.
- [ ] **Change description enables Save**: Modify description → Save enabled.
- [ ] **Change permission enables Save**: Select different permission → Save enabled.
- [ ] **Empty name shows validation error**: Clear name → "Team name is required".
- [ ] **Name > 255 chars shows error**: Type 256 chars → "Team name is too long".
- [ ] **Name = 255 chars succeeds**: Type exactly 255 chars → save succeeds.
- [ ] **Save with valid changes succeeds**: Modify name → Save → dialog closes → page refreshes → toast.
- [ ] **Updated name reflected on page**: New name in heading and breadcrumb.
- [ ] **Updated permission reflected**: New badge color and label.
- [ ] **Name conflict shows error**: Change to existing team name → 409 → inline error "A team with this name already exists".
- [ ] **Cancel closes without saving**: Modify fields → Cancel → page shows original data.
- [ ] **Escape closes without saving**: Same as Cancel.
- [ ] **Loading state on Save**: Spinner, button disabled during API call.

### Playwright (Web UI) E2E Tests — Delete Team Flow

- [ ] **Delete Team opens dialog**: Click button → destructive modal appears.
- [ ] **Dialog shows warning text**: Permanent deletion warning visible.
- [ ] **Confirmation input required**: "Type the team name to confirm" with input field.
- [ ] **Delete button disabled initially**: Button disabled before name is typed.
- [ ] **Typing wrong name keeps button disabled**: Type incorrect text → button stays disabled.
- [ ] **Typing correct name enables button**: Type exact team name → button enabled.
- [ ] **Case-sensitive match**: Lowercase when team is uppercase → button stays disabled.
- [ ] **Confirm deletes team**: Type name → Click Delete → loading → redirect to `/:org/-/teams` → toast "Team deleted".
- [ ] **Team no longer in team list**: After redirect, team does not appear in list.
- [ ] **Cancel closes dialog**: No deletion occurs.
- [ ] **Error keeps dialog open**: 500 → inline error, dialog stays.
- [ ] **Delete team with members and repos**: Team with 5 members and 3 repos → deletion succeeds, all associations removed.

### Playwright (Web UI) E2E Tests — Full Lifecycle

- [ ] **Create → view → edit → add members → assign repos → delete round trip**: Create team from list page → navigate to detail → edit name → add 2 members → assign 2 repos → verify all visible → delete → verify gone.
- [ ] **Multi-tab consistency**: Open team detail in two tabs → add member in tab 1 → refresh tab 2 → member visible.
- [ ] **Owner removes self from team**: Owner adds self to team → removes self → succeeds, page still renders.
- [ ] **Edit permission and verify badge update**: Change from read to admin → badge changes from gray to amber.
- [ ] **UI matches API state**: Fetch team via API → compare with UI-displayed data → all fields match.

### Playwright (Web UI) E2E Tests — States

- [ ] **Loading state**: Navigate to team detail → skeleton loaders visible before data loads.
- [ ] **Error state**: Mock API 500 → error banner with retry button.
- [ ] **Retry works**: Click retry after error → successful load.
- [ ] **Feature flag off**: Disable `ORG_TEAM_MANAGEMENT_UI` → route shows Coming Soon or redirects.

### API Integration Tests (supporting the UI)

- [ ] **GET team detail shape**: Response has `id`, `organization_id`, `name`, `lower_name`, `description`, `permission`, `created_at`, `updated_at`.
- [ ] **GET team members shape**: Each member has `id`, `username`, `display_name`, `avatar_url`.
- [ ] **GET team repos shape**: Each repo has `id`, `name`, `lower_name`, `owner`, `description`, `is_public`, `created_at`, `updated_at`.
- [ ] **PUT add member — happy path**: 204.
- [ ] **PUT add member — already on team**: 409.
- [ ] **PUT add member — not org member**: 422.
- [ ] **PUT add member — nonexistent user**: 404.
- [ ] **DELETE remove member — happy path**: 204.
- [ ] **DELETE remove member — not on team**: 404.
- [ ] **PUT assign repo — happy path**: 204.
- [ ] **PUT assign repo — already assigned**: 409.
- [ ] **PUT assign repo — not org repo**: 422.
- [ ] **DELETE unassign repo — happy path**: 204.
- [ ] **DELETE unassign repo — not assigned**: 404.
- [ ] **PATCH update team — happy path**: 200 with updated team.
- [ ] **PATCH update team — name conflict**: 409.
- [ ] **PATCH update team — empty name**: 422.
- [ ] **PATCH update team — name > 255 chars**: 422.
- [ ] **PATCH update team — name = 255 chars**: 200.
- [ ] **PATCH update team — invalid permission**: 422.
- [ ] **DELETE team — happy path**: 204.
- [ ] **DELETE team — already deleted**: 404.
- [ ] **DELETE team — cascades member associations**: After delete, member list returns 404.
- [ ] **DELETE team — cascades repo associations**: After delete, repo list returns 404.
- [ ] **Auth: unauthenticated → 401 on all endpoints**.
- [ ] **Auth: non-member → 403 on all endpoints**.
- [ ] **Auth: member → 403 on write endpoints (add, remove, assign, unassign, update, delete)**.
- [ ] **Auth: owner → 200/204 on all endpoints**.
- [ ] **Case-insensitive org name**: Uppercase org in URL resolves.
- [ ] **Case-insensitive team name**: Uppercase team in URL resolves.
- [ ] **Pagination: 31 members with default page size**: First page has 30, second has 1.
- [ ] **Pagination: per_page=100 max**: Request per_page=200 → returns max 100.
- [ ] **X-Total-Count header present**: On member list and repo list responses.

### Security-Focused Tests

- [ ] **Owner-only buttons not in DOM for members**: Inspect DOM as non-owner → no Add, Remove, Assign, Unassign, Edit, Delete elements.
- [ ] **Cross-org isolation**: User in org A cannot view team detail in org B.
- [ ] **No PII in error reports**: Simulate error → verify no team names or usernames in error payloads.
- [ ] **No team data in localStorage**: After viewing team detail → no team data in browser storage.
- [ ] **CSRF protection**: Write requests include session cookie with SameSite enforcement.

### Boundary & Stress Tests

- [ ] **Team with 100 members**: All render correctly, pagination works.
- [ ] **Team with 100 repositories**: All render correctly, pagination works.
- [ ] **Team name at 255 characters**: Displays correctly in heading, truncates in breadcrumb.
- [ ] **Team description at 10,000 characters**: Displays correctly (may need scroll or expand/collapse).
- [ ] **Member display name with Unicode/emoji**: Renders correctly.
- [ ] **Repository name with hyphens and dots**: Renders correctly, link works.
- [ ] **Rapid add/remove cycles**: Add member, immediately remove, add again → state is consistent.
- [ ] **Concurrent edit by two owners**: Owner A edits name, Owner B edits description simultaneously → last write wins, both see final state on refresh.
