# ORG_TEAMS_UI

Specification for ORG_TEAMS_UI.

## High-Level User POV

When a member of an organization on Codeplane wants to understand how their organization structures people and repository access, they navigate to the organization's Teams page. This is the central surface for discovering, browsing, and — for organization owners — managing the teams that define collaboration structure within the organization.

From any page on Codeplane, a user can reach the teams surface by navigating to their organization's profile and selecting the "Teams" tab, or by visiting the URL `/:org/-/teams` directly. What they see is a clean, paginated list of every team in the organization, showing each team's name, description, and permission level at a glance. The permission level — read, write, or admin — is color-coded so the user can instantly distinguish between low-privilege observer teams and high-privilege administrative ones.

The teams list is the organizational directory that makes collaboration structure transparent. From it, a member can click into any team to see its full details — who belongs to it, which repositories it has access to, and what level of access that entails. For organization owners, the teams surface is also the management hub: they can create new teams, edit existing ones, add or remove members, assign or unassign repositories, and delete teams that are no longer needed — all without leaving the web interface.

The experience is designed to feel like a natural extension of the organization profile. If the organization has no teams yet, the page doesn't show a confusing empty table — instead, it displays a clear message explaining what teams are and inviting the owner to create the first one. If the organization has dozens of teams, pagination keeps the page responsive and scannable.

For organization members who are not owners, the teams page is read-only. They can browse teams, view details, and see members and repositories, but they cannot create, edit, or delete teams. This distinction is reflected throughout the UI — action buttons simply do not appear for non-owners, keeping the interface clean and preventing confusion about what actions are available.

The teams UI is also the jumping-off point for deeper team management. Clicking a team name navigates to a team detail view with sub-tabs for Members and Repositories, where owners can manage team composition and access. This drill-down model keeps the top-level list lightweight while making detailed management only a click away.

## Acceptance Criteria

## Functional Constraints

- [ ] The teams list page is accessible at `/:org/-/teams` for any authenticated organization member (owner or member role).
- [ ] Unauthenticated users navigating to `/:org/-/teams` are redirected to the login page with a return URL.
- [ ] Authenticated users who are not members of the organization see a 403 access-denied state — not a 404.
- [ ] The page displays a paginated list of teams, defaulting to 30 items per page.
- [ ] Each team row displays: team name (clickable link), description (truncated to single line), permission badge (color-coded), and created-at timestamp (relative format).
- [ ] Permission badges use consistent color coding: green/success for `read`, yellow/warning for `write`, red/danger for `admin`.
- [ ] Teams are ordered by `id` ascending (creation order), matching the API default.
- [ ] The page title / heading reads "Teams" with the total count in parentheses, e.g., "Teams (12)".
- [ ] Pagination controls appear at the bottom of the list when there are more teams than the page size.
- [ ] The "New Team" button is visible only to organization owners. Organization members (non-owners) do not see this button.
- [ ] Clicking "New Team" navigates to `/:org/-/teams/new` (the team creation form).
- [ ] Clicking a team name navigates to the team detail page at `/:org/-/teams/:team`.
- [ ] The breadcrumb trail reads: `<Org Name> > Teams`.
- [ ] An empty state is shown when the organization has zero teams. For owners: "No teams yet. Create your first team to organize members and repository access." with a "Create Team" call-to-action button. For members: "No teams yet. Ask an organization owner to create teams."
- [ ] API errors display an inline error banner with a "Retry" button.
- [ ] Loading state shows a skeleton/placeholder UI while the team list is being fetched.

### Team Creation Form (`/:org/-/teams/new`)

- [ ] The creation form is a dedicated page (not a modal) accessible only to organization owners.
- [ ] Non-owners navigating to `/:org/-/teams/new` see a 403 access-denied state.
- [ ] The form contains three fields: Name (text input, required), Description (textarea, optional), Permission (select/radio group, defaults to "read").
- [ ] The Name input has a maximum length of 255 characters. Client-side validation prevents submission of empty or whitespace-only names.
- [ ] The Permission selector shows three options — Read, Write, Admin — each with a helper description explaining the access level.
- [ ] The Submit button is labeled "Create Team" and is disabled while the form is submitting.
- [ ] On successful creation (201), the user is redirected to `/:org/-/teams/:team` (the new team's detail page) and a success toast "Team created successfully" is displayed.
- [ ] On 409 Conflict (duplicate name), an inline error appears on the Name field: "A team with this name already exists".
- [ ] On 422 validation errors, field-specific inline errors are displayed.
- [ ] On 403, an access-denied message is shown.
- [ ] The breadcrumb trail reads: `<Org Name> > Teams > New Team`.
- [ ] Pressing Escape or clicking a "Cancel" link navigates back to the team list without creating a team.

### Team Detail Page (`/:org/-/teams/:team`)

- [ ] Displays the team's name as the page heading, permission badge (color-coded), and description.
- [ ] Shows created-at and updated-at timestamps in human-readable relative format with ISO 8601 tooltip on hover.
- [ ] If description is empty, shows muted placeholder text: "No description provided."
- [ ] Breadcrumb trail reads: `<Org Name> > Teams > <Team Name>`.
- [ ] For organization owners: "Edit" and "Delete" action buttons appear in a top-right action bar.
- [ ] For organization members (non-owners): No edit or delete buttons are visible.
- [ ] Sub-navigation tabs: "Members" and "Repositories" appear below the team header.
- [ ] Default sub-tab is "Members".

### Team Detail — Members Sub-Tab

- [ ] Lists all team members with username, display name, and avatar.
- [ ] Paginated with default page size 30.
- [ ] For owners: an "Add Member" button opens a member-addition interface (search/select from org members).
- [ ] For owners: each member row has a "Remove" action (with confirmation dialog).
- [ ] The "Add Member" search only shows users who are already organization members but not yet team members.
- [ ] Adding a member that is already on the team is idempotent (no error, no duplicate).
- [ ] Empty state: "No members yet. Add organization members to this team." (owners) or "No members yet." (members).
- [ ] Removing the last member from a team leaves the team with zero members (no restriction).

### Team Detail — Repositories Sub-Tab

- [ ] Lists all repositories assigned to the team with repo name, owner, description (truncated), and visibility badge.
- [ ] Paginated with default page size 30.
- [ ] For owners: an "Add Repository" button opens a repository-selection interface (search/select from org-owned repos).
- [ ] For owners: each repo row has a "Remove" action (with confirmation dialog).
- [ ] The "Add Repository" search only shows repositories owned by the organization that are not yet assigned to this team.
- [ ] Empty state: "No repositories assigned. Add organization repositories to grant this team access." (owners) or "No repositories assigned." (members).

### Team Edit Form (`/:org/-/teams/:team/edit` or inline)

- [ ] Pre-populated with the team's current name, description, and permission.
- [ ] Supports partial updates — unchanged fields retain their existing values.
- [ ] Name field follows the same validation rules as creation (1–255 chars, unique within org).
- [ ] On success (200), redirects back to the team detail page with a success toast "Team updated successfully".
- [ ] On 409 Conflict (name collision), inline error on Name field.
- [ ] On 422 validation errors, field-specific inline errors.
- [ ] Breadcrumb: `<Org Name> > Teams > <Team Name> > Edit`.

### Team Deletion

- [ ] Triggered by clicking "Delete" on the team detail page.
- [ ] A confirmation dialog appears: "Are you sure you want to delete <team name>? This will remove all member and repository associations. This action cannot be undone."
- [ ] Confirmation requires typing the team name to proceed (destructive action guard).
- [ ] On successful deletion (204), redirects to `/:org/-/teams` with a success toast "Team deleted successfully".
- [ ] The deleted team no longer appears in the team list.

### Boundary Constraints

- [ ] Team name: 1–255 characters after trimming. Allowed characters: any Unicode except control characters. Leading/trailing whitespace is trimmed.
- [ ] Team description: 0–unlimited characters (no enforced maximum). Rendered as plain text (no markdown rendering).
- [ ] Permission: Exactly one of `"read"`, `"write"`, `"admin"`.
- [ ] Organization name in URL: case-insensitive resolution.
- [ ] Team name in URL: case-insensitive resolution.
- [ ] Pagination: page sizes 1–100, default 30, values > 100 clamped to 100.
- [ ] Team names are unique within an organization (case-insensitive). "Backend" and "backend" are considered the same name.
- [ ] The `lower_name` field is always the lowercase form of the display name.

### Edge Cases

- [ ] Creating a team with a name that differs from an existing team only by case is rejected (409 Conflict).
- [ ] An organization with exactly one team renders the list with one row and no pagination controls.
- [ ] Navigating to `/:org/-/teams/nonexistent-team` renders a 404 state with message "Team not found".
- [ ] Navigating to `/:nonexistent-org/-/teams` renders a 404 state with message "Organization not found".
- [ ] Rapid double-click on "Create Team" does not submit the form twice (submit button disabled on first click).
- [ ] Deleting a team while another user is viewing its detail page results in a 404 on their next navigation action.
- [ ] Adding a member who was concurrently removed from the organization fails with a clear error.
- [ ] Team names containing special characters (hyphens, underscores, dots, Unicode) display correctly.
- [ ] Descriptions containing HTML-like content (`<script>`, `<img>`) are rendered as escaped plain text, not HTML.
- [ ] Browser back/forward navigation works correctly across team list → detail → edit → delete flows.

### Definition of Done

- The team list page at `/:org/-/teams` renders correctly for org owners and org members with appropriate role-based visibility of action buttons.
- Team creation, viewing, editing, and deletion flows work end-to-end from the web UI.
- Team member management (add/remove) works end-to-end from the team detail Members tab.
- Team repository management (add/remove) works end-to-end from the team detail Repositories tab.
- Empty states, loading states, error states, and 404 states are all implemented and visually polished.
- All Playwright E2E tests pass.
- The feature is gated behind the `ORG_TEAMS_UI` feature flag and only renders when the flag is enabled.
- Breadcrumb navigation is correct on all pages.
- Keyboard accessibility meets WCAG 2.1 AA requirements (all interactive elements focusable, operable via keyboard).
- Pagination works correctly across all list views (teams, members, repositories).

## Design

## Web UI Design

### Route Structure

| Route | Component | Description |
|-------|-----------|-------------|
| `/:org/-/teams` | `TeamsListView` | Paginated list of all teams in the organization |
| `/:org/-/teams/new` | `TeamCreateView` | Team creation form (owner-only) |
| `/:org/-/teams/:team` | `TeamDetailView` | Team detail with Members/Repositories sub-tabs |
| `/:org/-/teams/:team/edit` | `TeamEditView` | Team editing form (owner-only) |

All routes are nested under the organization layout, which provides the organization header, navigation tabs, and authentication context. The "Teams" tab appears in the organization's top-level navigation alongside "Repositories", "Members", and "Settings".

### Teams List Page (`/:org/-/teams`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Breadcrumb: Org Name > Teams                   │
├─────────────────────────────────────────────────┤
│  Teams (12)                        [New Team]   │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐│
│  │ 🟢 backend          Backend engineering...  ││
│  │ 🟡 frontend         Frontend and UI team    ││
│  │ 🔴 platform-admin   Full platform access    ││
│  │ 🟢 design           Design and UX team      ││
│  │ ...                                         ││
│  └─────────────────────────────────────────────┘│
│  ◀ 1 2 3 ▶                                      │
└─────────────────────────────────────────────────┘
```

**Team Row Structure:**
- Left: Permission badge (colored dot or pill) — green for read, amber/yellow for write, red for admin
- Center-left: Team name as a clickable link (bold, primary color on hover)
- Center: Description text, truncated to single line with ellipsis
- Right: Relative timestamp ("Created 3 days ago")

**"New Team" Button:**
- Positioned in the top-right of the page header, aligned with the "Teams (N)" heading.
- Style: Primary action button (filled, accent color).
- Only rendered when the current user's org role is `owner`.
- Navigates to `/:org/-/teams/new` on click.

**Empty State (zero teams):**
- Centered illustration or icon (e.g., people-group icon).
- Heading: "No teams yet"
- Subtext (for owners): "Teams help you organize members and control repository access. Create your first team to get started."
- CTA button (for owners): "Create Team" → navigates to `/:org/-/teams/new`.
- Subtext (for members): "Ask an organization owner to create teams."

**Loading State:**
- Skeleton rows matching the team row layout: a colored dot placeholder, a text block placeholder for name, a longer text block for description.
- 5 skeleton rows shown by default.

**Error State:**
- Inline alert banner (red/error variant) with the error message.
- "Retry" button that re-fetches the team list.
- If 403: "You don't have permission to view teams in this organization."
- If 404 (org not found): "Organization not found."

**Pagination:**
- Rendered at the bottom of the list.
- Shows page numbers with previous/next arrows.
- Reflects `X-Total-Count` from the API response.
- URL updates with `?page=N` query parameter for shareable URLs.

### Team Creation Page (`/:org/-/teams/new`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Breadcrumb: Org Name > Teams > New Team        │
├─────────────────────────────────────────────────┤
│  Create a new team                              │
│                                                 │
│  Team name *                                    │
│  ┌─────────────────────────────────────────┐    │
│  │ e.g., backend, design, infra            │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Description                                    │
│  ┌─────────────────────────────────────────┐    │
│  │ Describe this team's purpose            │    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Permission level                               │
│  ○ Read   — Members can view team repositories  │
│  ● Write  — Members can push to team repos      │
│  ○ Admin  — Full control over team repositories  │
│                                                 │
│  [Cancel]                    [Create Team]      │
└─────────────────────────────────────────────────┘
```

**Form Fields:**

| Field | Type | Required | Placeholder | Validation |
|-------|------|----------|-------------|------------|
| Team name | Text input | Yes | "e.g., backend, design, infra" | Non-empty after trimming, ≤ 255 chars. Inline error on blur for empty. Server-side uniqueness check on submit. |
| Description | Textarea (3 rows) | No | "Describe this team's purpose" | No length limit. |
| Permission level | Radio group | Yes (default: read) | — | Must select one of Read, Write, Admin. |

**Interaction:**
- "Create Team" button: primary style, disabled during submission, shows spinner.
- "Cancel" link: navigates back to `/:org/-/teams` without side effects.
- Enter key from any field submits the form.
- On 201 success: redirect to `/:org/-/teams/:team`, toast "Team created successfully".
- On 409: inline error under Name: "A team with this name already exists."
- On 422: field-specific inline errors.

### Team Detail Page (`/:org/-/teams/:team`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Breadcrumb: Org Name > Teams > backend         │
├─────────────────────────────────────────────────┤
│  backend                    🟡 write            │
│  Backend engineering team          [Edit][Delete]│
│  Created 3 months ago · Updated 2 weeks ago     │
├─────────────────────────────────────────────────┤
│  [Members (5)]  [Repositories (8)]              │
├─────────────────────────────────────────────────┤
│  (Sub-tab content area)                         │
└─────────────────────────────────────────────────┘
```

**Header Section:**
- Team name as `<h1>` heading.
- Permission badge pill, color-coded: green "read", yellow "write", red "admin".
- Description as a paragraph below the name. If empty: muted italic "No description provided."
- Timestamps: "Created {relative}" · "Updated {relative}" — each with an ISO 8601 tooltip.
- Action buttons (owner-only): "Edit" (pencil icon) and "Delete" (trash icon, danger style).

**Sub-Navigation Tabs:**
- "Members (N)" — shows member count from API.
- "Repositories (N)" — shows repo count from API.
- Active tab has underline accent.
- URL updates: `/:org/-/teams/:team` (default = Members), `/:org/-/teams/:team/repos` for Repositories.

**Members Sub-Tab:**

| Column | Content |
|--------|---------|
| Avatar | User avatar image (32×32), fallback to initials |
| Username | Clickable link to `/:username` profile |
| Display name | Full name, muted color if same as username |
| Actions (owner-only) | "Remove" button with trash icon |

- "Add Member" button (owner-only): opens a combobox/search dropdown populated with org members who are not already team members. Typing filters the list. Selecting a user triggers `PUT /api/orgs/:org/teams/:team/members/:username`.
- "Remove" action: confirmation dialog "Remove @username from this team?" with "Remove" (danger) and "Cancel" buttons.
- Empty state: "No members yet." with "Add Member" CTA for owners.

**Repositories Sub-Tab:**

| Column | Content |
|--------|---------|
| Repo name | `owner/repo` format, clickable link to repo |
| Description | Truncated, single line |
| Visibility | Public/Private badge |
| Actions (owner-only) | "Remove" button |

- "Add Repository" button (owner-only): combobox/search of org-owned repos not already assigned. Selecting triggers `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo`.
- "Remove" action: confirmation dialog "Remove repository owner/repo from this team?".
- Empty state: "No repositories assigned." with "Add Repository" CTA for owners.

### Team Edit Page (`/:org/-/teams/:team/edit`)

- Same form layout as creation, pre-populated with current values.
- Heading: "Edit team"
- Submit button labeled "Save Changes".
- On 200 success: redirect to team detail, toast "Team updated successfully".
- On 409: inline error on Name.
- "Cancel" navigates back to team detail.
- Breadcrumb: `<Org Name> > Teams > <Team Name> > Edit`.

### Team Deletion Dialog

- Modal overlay triggered by "Delete" button on team detail.
- Content: "Are you sure you want to delete **{team name}**? This will remove all member and repository associations. This action cannot be undone."
- Destructive confirmation: text input requiring the user to type the team name exactly.
- "Delete Team" button (danger style): disabled until name matches.
- On 204 success: close modal, redirect to `/:org/-/teams`, toast "Team deleted successfully".

### Navigation Integration

- The "Teams" tab is added to the organization-level navigation bar, appearing after "Members" and before "Settings".
- The sidebar's organization section includes a "Teams" link.
- The command palette supports: "Go to Teams" when within an organization context.
- Deep links (direct URL entry) work for all team routes.

### Responsive Behavior

- **Desktop (≥1024px)**: Full layout with all columns.
- **Tablet (768–1023px)**: Description column hidden in team list. Sub-tab content stacks vertically.
- **Mobile (< 768px)**: Single-column layout. Team rows show name and badge only. Forms go full-width.

### Keyboard Accessibility

- All interactive elements (buttons, links, form fields, tabs) are focusable via Tab.
- Radio group navigable with arrow keys.
- Confirmation dialogs trap focus.
- Escape closes modals and dropdowns.
- Enter activates focused button or submits focused form.

## API Shape

The web UI consumes the existing implemented API endpoints:

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| List teams | GET | `/api/orgs/:org/teams?page=N&per_page=M` | Paginated, returns `X-Total-Count` header |
| Create team | POST | `/api/orgs/:org/teams` | Body: `{ name, description, permission }` |
| View team | GET | `/api/orgs/:org/teams/:team` | Single team object |
| Update team | PATCH | `/api/orgs/:org/teams/:team` | Partial update body |
| Delete team | DELETE | `/api/orgs/:org/teams/:team` | Returns 204 |
| List members | GET | `/api/orgs/:org/teams/:team/members?page=N&per_page=M` | Paginated |
| Add member | PUT | `/api/orgs/:org/teams/:team/members/:username` | Returns 204 |
| Remove member | DELETE | `/api/orgs/:org/teams/:team/members/:username` | Returns 204 |
| List repos | GET | `/api/orgs/:org/teams/:team/repos?page=N&per_page=M` | Paginated |
| Add repo | PUT | `/api/orgs/:org/teams/:team/repos/:owner/:repo` | Returns 204 |
| Remove repo | DELETE | `/api/orgs/:org/teams/:team/repos/:owner/:repo` | Returns 204 |
| List org members | GET | `/api/orgs/:org/members?page=N&per_page=M` | For member-add search |
| List org repos | GET | `/api/orgs/:org/repos?page=N&per_page=M` | For repo-add search |

## SDK / UI-Core Hooks

The following hooks should be added to `@codeplane/ui-core` for consumption by the SolidJS web app:

```typescript
// Team list with pagination
useOrgTeams(orgName: string, page?: number, perPage?: number): {
  teams: Team[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Single team detail
useOrgTeam(orgName: string, teamName: string): {
  team: Team | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Team members with pagination
useTeamMembers(orgName: string, teamName: string, page?: number, perPage?: number): {
  members: TeamMember[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Team repositories with pagination
useTeamRepos(orgName: string, teamName: string, page?: number, perPage?: number): {
  repos: TeamRepo[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Mutation hooks
useCreateTeam(): { create: (orgName: string, req: CreateTeamRequest) => Promise<Team>; isSubmitting: boolean; error: Error | null; }
useUpdateTeam(): { update: (orgName: string, teamName: string, req: UpdateTeamRequest) => Promise<Team>; isSubmitting: boolean; error: Error | null; }
useDeleteTeam(): { remove: (orgName: string, teamName: string) => Promise<void>; isSubmitting: boolean; error: Error | null; }
useAddTeamMember(): { add: (orgName: string, teamName: string, username: string) => Promise<void>; isSubmitting: boolean; error: Error | null; }
useRemoveTeamMember(): { remove: (orgName: string, teamName: string, username: string) => Promise<void>; isSubmitting: boolean; error: Error | null; }
useAddTeamRepo(): { add: (orgName: string, teamName: string, owner: string, repo: string) => Promise<void>; isSubmitting: boolean; error: Error | null; }
useRemoveTeamRepo(): { remove: (orgName: string, teamName: string, owner: string, repo: string) => Promise<void>; isSubmitting: boolean; error: Error | null; }
```

## TUI Integration

The TUI should add team management screens accessible from the organization overview:

- **Org Teams List Screen**: Accessible via `t` key from org overview. Shows paginated team list with name, permission badge, description. `Enter` opens team detail. `c` creates new team (owners only).
- **Team Detail Screen**: Shows team metadata, tabbed Members/Repos views. `e` to edit, `d` to delete (owners). `m` tab to Members, `r` tab to Repos.
- **Team Members Screen**: List with `a` to add member, `x` to remove (owners).
- **Team Repos Screen**: List with `a` to add repo, `x` to remove (owners).

## Documentation

- **User Guide: "Managing organization teams"** — step-by-step walkthrough of creating a team, adding members, assigning repositories, editing team settings, and deleting a team. Includes screenshots of each UI surface.
- **Concept Page: "What are teams?"** — explains the relationship between organizations, teams, members, and repositories. Describes the three permission levels (read, write, admin) and when to use each.
- **API Reference** — already exists for all team endpoints; link from the UI guide.
- **CLI Reference** — already exists for `org team *` commands; link from the UI guide for users who prefer CLI.
- **FAQ Entry: "How do team permissions work?"** — explains that team permission is the default access level for team members on team-assigned repositories.

## Permissions & Security

## Authorization Roles

### Teams List Page

| Role | Can view team list? | Can see "New Team" button? |
|------|--------------------|--------------------------|
| Organization Owner | ✅ Yes | ✅ Yes |
| Organization Member | ✅ Yes | ❌ No |
| Authenticated non-member | ❌ No (403) | N/A |
| Unauthenticated / Anonymous | ❌ No (redirect to login) | N/A |

### Team Detail Page

| Role | Can view detail? | Can see Edit/Delete? | Can add/remove members? | Can add/remove repos? |
|------|-----------------|--------------------|-----------------------|---------------------|
| Organization Owner | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Organization Member | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Authenticated non-member | ❌ No (403) | N/A | N/A | N/A |
| Unauthenticated / Anonymous | ❌ No (redirect to login) | N/A | N/A | N/A |

### Team Creation/Edit/Delete

| Role | Can create? | Can edit? | Can delete? |
|------|------------|----------|------------|
| Organization Owner | ✅ Yes | ✅ Yes | ✅ Yes |
| Organization Member | ❌ No (403) | ❌ No (403) | ❌ No (403) |
| Authenticated non-member | ❌ No (403) | ❌ No (403) | ❌ No (403) |
| Unauthenticated / Anonymous | ❌ No (401) | ❌ No (401) | ❌ No (401) |

### Rate Limiting

- All team UI routes inherit the platform-wide rate limiting middleware.
- Read operations (list, view): Standard platform rate limit (no per-endpoint override needed).
- Write operations (create, update, delete, member add/remove, repo add/remove): Standard platform rate limit. If abuse is detected (e.g., automated mass team creation), a per-org rate limit of 30 write operations per hour should be considered.
- Client-side: The UI should debounce search inputs (member/repo search dropdowns) to avoid rapid-fire API calls. Minimum 300ms debounce on search inputs.
- The "Add Member" and "Add Repository" combobox searches should paginate results rather than loading all org members/repos at once.

### Data Privacy Constraints

- Team names and descriptions are free-text fields that should not contain PII by convention, but no server-side PII scanning is performed. The UI should not encourage PII entry (no fields labeled "email" or "phone" in team forms).
- Team member lists expose usernames, display names, and avatar URLs. These are public profile fields within the organization boundary and are acceptable to display.
- The `organization_id` field is an internal numeric identifier. It is included in API responses but should not be prominently displayed in the UI (used internally for routing/linking).
- No team data is sent to external services or third-party analytics. Telemetry events use organization and team IDs/names but not member PII.
- The team deletion confirmation dialog must clearly state that the action is irreversible to prevent accidental data loss.
- The UI must not cache sensitive team membership data in localStorage or sessionStorage beyond the active session.

## Telemetry & Product Analytics

## Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamsPageViewed` | Teams list page loads successfully | `org_name`, `org_id`, `total_teams`, `viewer_role` (owner/member), `viewer_user_id`, `page_number` |
| `OrgTeamCreatedViaUI` | Team creation form submitted successfully (201) | `org_name`, `org_id`, `team_name`, `team_id`, `permission`, `has_description` (boolean), `creator_user_id` |
| `OrgTeamCreateFormOpened` | User navigates to team creation form | `org_name`, `org_id`, `creator_user_id` |
| `OrgTeamCreateFormAbandoned` | User navigates away from creation form without submitting | `org_name`, `org_id`, `had_name_filled` (boolean), `time_on_form_ms` |
| `OrgTeamCreateFormFailed` | Team creation form submission fails | `org_name`, `team_name_attempted`, `error_status_code`, `error_reason` (conflict/validation/forbidden/internal), `creator_user_id` |
| `OrgTeamDetailViewed` | Team detail page loads successfully | `org_name`, `team_name`, `team_id`, `team_permission`, `viewer_role`, `viewer_user_id`, `active_tab` (members/repos) |
| `OrgTeamEditedViaUI` | Team edit form submitted successfully | `org_name`, `team_name`, `team_id`, `fields_changed` (array of changed field names), `editor_user_id` |
| `OrgTeamDeletedViaUI` | Team deletion confirmed and succeeded | `org_name`, `team_name`, `team_id`, `team_had_members` (boolean), `team_had_repos` (boolean), `deleter_user_id` |
| `OrgTeamDeleteCancelled` | Team deletion dialog opened but cancelled | `org_name`, `team_name`, `team_id`, `deleter_user_id` |
| `OrgTeamMemberAddedViaUI` | Member added to team via UI | `org_name`, `team_name`, `team_id`, `added_username`, `adder_user_id` |
| `OrgTeamMemberRemovedViaUI` | Member removed from team via UI | `org_name`, `team_name`, `team_id`, `removed_username`, `remover_user_id` |
| `OrgTeamRepoAddedViaUI` | Repository added to team via UI | `org_name`, `team_name`, `team_id`, `repo_owner`, `repo_name`, `adder_user_id` |
| `OrgTeamRepoRemovedViaUI` | Repository removed from team via UI | `org_name`, `team_name`, `team_id`, `repo_owner`, `repo_name`, `remover_user_id` |
| `OrgTeamMemberSearchUsed` | User types in the Add Member search box | `org_name`, `team_name`, `search_query_length`, `results_count` |
| `OrgTeamRepoSearchUsed` | User types in the Add Repository search box | `org_name`, `team_name`, `search_query_length`, `results_count` |
| `OrgTeamsPaginationUsed` | User clicks a pagination control on any team-related list | `org_name`, `list_type` (teams/members/repos), `page_number`, `total_pages` |

## Funnel Metrics

1. **Team list view → team creation conversion**: Percentage of owners viewing the team list who click "New Team" and complete team creation within the same session. Target: > 25% for new organizations.
2. **Team creation form completion rate**: Percentage of users who open the creation form and successfully submit it. High abandonment indicates form friction. Target: > 80%.
3. **Team creation → member assignment conversion**: Percentage of newly created teams that have at least one member added within 24 hours. Target: > 60%.
4. **Team creation → repo assignment conversion**: Percentage of newly created teams that have at least one repository assigned within 24 hours. Target: > 40%.
5. **Team detail engagement**: Average number of sub-tab switches (Members ↔ Repos) per team detail page view. Indicates whether users explore team composition.
6. **Permission distribution**: Breakdown of permission levels across all created teams. Insight into whether users understand and use the permission model.
7. **Active team management rate**: Percentage of organizations with 3+ members that create at least one team within 30 days of org creation. Target: > 40%.
8. **Edit frequency**: Average number of team edits per team per month. High edit rate may indicate that initial creation UX is unclear.
9. **Delete rate**: Percentage of teams deleted within 7 days of creation. High rate suggests creation errors or experimentation. Target: < 15%.
10. **Client distribution**: Breakdown of team management actions by client surface (web UI vs CLI vs API vs TUI). Measures web UI adoption.

## Success Indicators

- Web UI team management adoption reaches 60% of all team management actions within 90 days of launch (vs CLI/API-only before).
- Team creation form completion rate > 80%.
- Team creation → first member add within 1 hour > 50%.
- User-reported confusion about team management drops to < 5% of support tickets related to organizations.
- Page load performance: teams list page LCP < 1.5s, team detail page LCP < 1.0s.

## Observability

## Logging Requirements

### Client-Side Logging (Browser Console / Structured Telemetry)

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Teams list fetch initiated | `debug` | `org_name`, `page`, `per_page` |
| Teams list fetch succeeded | `debug` | `org_name`, `total_count`, `items_returned`, `duration_ms` |
| Teams list fetch failed | `warn` | `org_name`, `status_code`, `error_message`, `duration_ms` |
| Team detail fetch initiated | `debug` | `org_name`, `team_name` |
| Team detail fetch succeeded | `debug` | `org_name`, `team_name`, `team_id`, `duration_ms` |
| Team detail fetch failed | `warn` | `org_name`, `team_name`, `status_code`, `error_message` |
| Team creation form submitted | `info` | `org_name`, `team_name`, `permission` |
| Team creation succeeded | `info` | `org_name`, `team_name`, `team_id`, `duration_ms` |
| Team creation failed | `warn` | `org_name`, `team_name`, `status_code`, `error_reason` |
| Team update submitted | `info` | `org_name`, `team_name`, `fields_changed` |
| Team update succeeded | `info` | `org_name`, `team_name`, `team_id`, `duration_ms` |
| Team update failed | `warn` | `org_name`, `team_name`, `status_code`, `error_reason` |
| Team deletion confirmed | `info` | `org_name`, `team_name`, `team_id` |
| Team deletion succeeded | `info` | `org_name`, `team_name`, `team_id` |
| Team deletion failed | `warn` | `org_name`, `team_name`, `status_code`, `error_reason` |
| Member add attempted | `info` | `org_name`, `team_name`, `username` |
| Member add succeeded | `info` | `org_name`, `team_name`, `username`, `duration_ms` |
| Member add failed | `warn` | `org_name`, `team_name`, `username`, `status_code` |
| Member remove confirmed | `info` | `org_name`, `team_name`, `username` |
| Member remove succeeded | `info` | `org_name`, `team_name`, `username` |
| Repo add attempted | `info` | `org_name`, `team_name`, `repo_owner`, `repo_name` |
| Repo add succeeded | `info` | `org_name`, `team_name`, `repo_owner`, `repo_name` |
| Repo remove confirmed | `info` | `org_name`, `team_name`, `repo_owner`, `repo_name` |

### Server-Side Logging

Server-side logging is already specified in the individual feature specs (ORG_TEAM_CREATE, ORG_TEAM_LIST, etc.) and applies here. The key additions for the UI feature:

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Concurrent team modification detected (optimistic locking) | `warn` | `org_name`, `team_name`, `team_id`, `expected_updated_at`, `actual_updated_at`, `request_id` |
| Feature flag `ORG_TEAMS_UI` checked | `debug` | `flag_value`, `user_id`, `request_id` |

## Prometheus Metrics

### Server-Side (API)

All existing per-endpoint metrics from the individual specs apply. Additional composite metrics:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_teams_ui_page_views_total` | counter | `page` (list/detail/create/edit), `org_name`, `viewer_role` | Total page views via web UI referer |
| `codeplane_org_teams_ui_actions_total` | counter | `action` (create/update/delete/member_add/member_remove/repo_add/repo_remove), `org_name`, `status` (success/error) | Total management actions triggered from web UI |
| `codeplane_org_teams_list_response_size` | histogram | `org_name` | Number of teams returned per list request (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |

### Client-Side (Web Vitals)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_web_teams_page_lcp_seconds` | histogram | `page` (list/detail/create/edit) | Largest Contentful Paint per page |
| `codeplane_web_teams_page_fid_seconds` | histogram | `page` | First Input Delay |
| `codeplane_web_teams_api_call_duration_seconds` | histogram | `endpoint`, `status_code` | Client-observed API latency |

## Alerts

### Alert: `OrgTeamsUIHighAPIErrorRate`
- **Condition**: `rate(codeplane_org_teams_ui_actions_total{status="error"}[5m]) / rate(codeplane_org_teams_ui_actions_total[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check which `action` label has the highest error rate — is it concentrated on creates, deletes, or member operations?
  2. Inspect server logs for the corresponding `request_id` values in the affected time window.
  3. Verify database connectivity by running a health check against the `teams` table.
  4. Check if a recent deployment changed the org routes or OrgService methods.
  5. If errors are 403s: Check if an auth or role-checking regression was introduced.
  6. If errors are 500s: Check for database connection pool exhaustion, missing indexes, or ORM mapping errors.
  7. Verify the `ORG_TEAMS_UI` feature flag is still enabled and not accidentally toggled.
  8. Escalate to the platform team if not resolved within 15 minutes.

### Alert: `OrgTeamsUIHighPageLoadLatency`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_web_teams_page_lcp_seconds_bucket{page="list"}[10m])) > 3.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if the latency is isolated to a specific organization with a very large number of teams.
  2. Verify the `GET /api/orgs/:org/teams` endpoint latency using `codeplane_org_team_list_duration_seconds` — if API p95 > 500ms, the issue is server-side.
  3. If API latency is normal, check for client-side rendering bottlenecks — large DOM, excessive re-renders.
  4. Check CDN / asset delivery latency for the web app bundle.
  5. Verify that the teams list is paginated (not loading all teams at once).
  6. If a single org has 1000+ teams, consider adding server-side search/filter to reduce payload size.

### Alert: `OrgTeamsUICreationFailureSpike`
- **Condition**: `rate(codeplane_org_teams_ui_actions_total{action="create",status="error"}[15m]) > 5 * avg_over_time(rate(codeplane_org_teams_ui_actions_total{action="create",status="error"}[15m])[1h:15m])`
- **Severity**: Info
- **Runbook**:
  1. Check if the failures are primarily 409 Conflict (duplicate names) — this indicates a UX issue, not a system failure.
  2. Check if failures are 422 validation errors — a UI regression may have removed client-side validation.
  3. If failures are 500s, follow the general API error runbook above.
  4. Check if a single organization is generating all failures.
  5. No immediate infrastructure action needed for 409/422 spikes; create a product ticket to investigate UX improvements.

### Alert: `OrgTeamsUIDeletionSpike`
- **Condition**: `rate(codeplane_org_teams_ui_actions_total{action="delete",status="success"}[1h]) > 20`
- **Severity**: Info
- **Runbook**:
  1. Verify if a single organization is performing mass deletions — this may be intentional cleanup.
  2. Check if the deleting user has owner role (should be enforced, but verify).
  3. If the deletions seem automated or malicious, check the user's session for anomalies.
  4. No immediate action if deletions are intentional. Monitor for follow-up support tickets.

## Error Cases and Failure Modes

| Error Case | User Experience | Recovery |
|------------|----------------|----------|
| API returns 500 on team list | Error banner with "Something went wrong. Please try again." + Retry button | Retry button re-fetches. If persistent, check server health. |
| API returns 500 on team create | Toast error "Failed to create team. Please try again." Form remains populated. | User retries submission. Duplicate check prevents accidental duplicates. |
| API returns 500 on team delete | Toast error "Failed to delete team." Team still exists. | User retries deletion. |
| Network timeout (client-side) | Toast error "Network error. Check your connection." | Auto-retry on next navigation. |
| Session expired (401) | Redirect to login page with return URL | User re-authenticates and returns to the same page. |
| Concurrent team deletion | 404 on next interaction with deleted team | UI navigates to team list with "Team not found" message. |
| Concurrent team rename collision | 409 on save | Inline error "A team with this name already exists." User changes name. |
| Feature flag disabled | Team routes return 404 or fallback | UI hides Teams tab from org navigation. |
| Large team list (100+ teams) | Pagination handles gracefully | No performance degradation — server returns max 100 per page. |
| Browser tab left open during team changes by another user | Stale data shown until refresh | Encourage refetch on tab focus. |

## Verification

## Playwright Web UI E2E Tests

### Teams List Page Tests

- **`test: teams list page renders heading with total count`** — Create org with 3 teams, navigate to `/:org/-/teams`, assert heading contains "Teams (3)".
- **`test: teams list page renders all team rows`** — Create org with 3 teams, navigate to list, assert 3 team row elements are visible.
- **`test: team row displays name, description, and permission badge`** — Create team "backend" with description "Backend team" and permission "write", navigate to list, assert row contains "backend", "Backend team", and a yellow "write" badge.
- **`test: permission badge colors are correct`** — Create teams with each permission level, navigate to list, assert: read badge is green, write badge is yellow, admin badge is red.
- **`test: clicking team name navigates to team detail`** — Create team, navigate to list, click team name link, assert URL is `/:org/-/teams/:team`.
- **`test: 'New Team' button visible to org owner`** — Authenticate as org owner, navigate to teams list, assert "New Team" button is visible.
- **`test: 'New Team' button not visible to org member`** — Authenticate as org member (non-owner), navigate to teams list, assert "New Team" button is not present in DOM.
- **`test: empty state shown when org has zero teams`** — Create org with no teams, navigate to list, assert "No teams yet" heading and create CTA (for owner) are visible.
- **`test: empty state for member shows no CTA`** — Authenticate as member, navigate to org with zero teams, assert "No teams yet" text visible but no "Create Team" button.
- **`test: loading state shows skeleton rows`** — Navigate to teams list, assert skeleton placeholder elements appear before data loads.
- **`test: pagination renders when teams exceed page size`** — Create org with 35 teams, navigate to list, assert pagination controls are visible and show page 1 of 2.
- **`test: clicking page 2 loads second page`** — Create 35 teams, navigate to list, click page 2, assert URL contains `?page=2` and different teams are shown.
- **`test: breadcrumb shows Org Name > Teams`** — Navigate to teams list, assert breadcrumb contains org name and "Teams".
- **`test: 403 state shown for non-member`** — Authenticate as non-member, navigate to `/:org/-/teams`, assert access-denied message is shown.
- **`test: 404 state shown for nonexistent org`** — Navigate to `/nonexistent-org/-/teams`, assert "Organization not found" state.
- **`test: teams list refreshes after team creation`** — Create team via UI, navigate back to list, assert new team appears.
- **`test: teams list refreshes after team deletion`** — Delete team via UI, navigate to list, assert deleted team is gone.

### Team Creation Form Tests

- **`test: creation form renders all fields`** — Navigate to `/:org/-/teams/new`, assert name input, description textarea, and permission radio group are present.
- **`test: permission defaults to read`** — Open creation form, assert "Read" radio is selected by default.
- **`test: submitting valid form creates team and redirects`** — Fill name "e2e-team", description "Test", select "write", click "Create Team", assert redirect to `/:org/-/teams/e2e-team` and success toast.
- **`test: submitting without name shows validation error`** — Leave name empty, click "Create Team", assert inline error on name field.
- **`test: name exceeding 255 characters shows validation error`** — Type 256-char name, submit, assert inline error.
- **`test: name of exactly 255 characters succeeds`** — Type 255-char name, submit, assert 201 redirect.
- **`test: duplicate name shows conflict error`** — Create team "existing", navigate to create form, enter "existing", submit, assert inline error "A team with this name already exists".
- **`test: case-insensitive duplicate detected`** — Create "Backend", try to create "backend" via form, assert conflict error.
- **`test: submit button disabled during submission`** — Fill valid form, click submit, assert button shows loading state and is disabled.
- **`test: cancel navigates back to team list`** — Open creation form, click "Cancel", assert URL is `/:org/-/teams`.
- **`test: creation form not accessible to non-owner`** — Authenticate as member, navigate to `/:org/-/teams/new`, assert 403 access denied.
- **`test: breadcrumb shows Org Name > Teams > New Team`** — Open creation form, assert breadcrumb.
- **`test: special characters in name are accepted`** — Create team with name "café-team", assert success.
- **`test: HTML in description is escaped`** — Create team with description `<script>alert('xss')</script>`, view detail, assert raw text is displayed (not executed).
- **`test: form preserves input on validation error`** — Fill name and description, trigger validation error, assert fields retain their values.
- **`test: Enter key submits form`** — Fill valid form, press Enter on name field, assert form submits.

### Team Detail Page Tests

- **`test: detail page renders team name as heading`** — Navigate to `/:org/-/teams/:team`, assert h1 contains team name.
- **`test: detail page shows permission badge`** — Create team with "admin" permission, navigate to detail, assert badge with "admin" text is visible.
- **`test: detail page shows description`** — Create team with description, navigate to detail, assert description text is visible.
- **`test: empty description shows placeholder`** — Create team without description, navigate to detail, assert "No description provided" text.
- **`test: detail page shows timestamps`** — Navigate to detail, assert created and updated timestamps are rendered.
- **`test: timestamp tooltip shows ISO 8601`** — Hover over timestamp, assert tooltip contains ISO 8601 formatted date.
- **`test: owner sees Edit and Delete buttons`** — Authenticate as owner, navigate to detail, assert "Edit" and "Delete" buttons visible.
- **`test: member does not see Edit and Delete buttons`** — Authenticate as member, navigate to detail, assert no edit/delete buttons.
- **`test: Members tab is default`** — Navigate to team detail, assert Members tab is active.
- **`test: clicking Repositories tab switches content`** — Navigate to detail, click "Repositories" tab, assert repos content is shown.
- **`test: 404 for nonexistent team`** — Navigate to `/:org/-/teams/nonexistent`, assert "Team not found" state.
- **`test: breadcrumb navigates back to team list`** — Navigate to detail, click "Teams" in breadcrumb, assert URL is `/:org/-/teams`.
- **`test: non-member sees 403 on detail page`** — Authenticate as non-member, navigate to team detail, assert access denied.

### Team Members Tab Tests

- **`test: members tab shows member list`** — Add 3 members to team, navigate to detail Members tab, assert 3 member rows.
- **`test: member row shows avatar, username, display name`** — Add member, view members tab, assert avatar, username link, and display name are visible.
- **`test: 'Add Member' button visible to owner`** — Authenticate as owner, navigate to members tab, assert "Add Member" button visible.
- **`test: 'Add Member' button not visible to member`** — Authenticate as member, navigate to members tab, assert no "Add Member" button.
- **`test: add member search shows org members not on team`** — Org has 5 members, team has 2, click "Add Member", assert search shows 3 available members.
- **`test: selecting member from search adds them`** — Click "Add Member", search for username, select, assert member appears in list.
- **`test: remove member with confirmation`** — Click "Remove" on member row, confirm dialog, assert member removed from list.
- **`test: remove member cancel does not remove`** — Click "Remove", cancel dialog, assert member still in list.
- **`test: empty members state`** — Team with no members, navigate to members tab, assert "No members yet" message.
- **`test: members pagination works`** — Add 35 members, navigate to members tab, assert pagination controls and correct page sizes.
- **`test: owner 'Remove' button visible on each member row`** — Authenticate as owner, assert "Remove" button on each member row.
- **`test: member 'Remove' button not visible`** — Authenticate as member, assert no "Remove" buttons on member rows.

### Team Repositories Tab Tests

- **`test: repos tab shows repository list`** — Assign 3 repos to team, click Repos tab, assert 3 repo rows.
- **`test: repo row shows name, description, visibility`** — Assign repo, view repos tab, assert name link, description, and visibility badge.
- **`test: 'Add Repository' button visible to owner`** — Authenticate as owner, click repos tab, assert "Add Repository" button.
- **`test: 'Add Repository' button not visible to member`** — Authenticate as member, assert no "Add Repository" button.
- **`test: add repo search shows org repos not on team`** — Org has 5 repos, team has 2, click "Add Repository", assert search shows 3.
- **`test: selecting repo from search assigns it`** — Click "Add Repository", search, select, assert repo appears in list.
- **`test: remove repo with confirmation`** — Click "Remove" on repo row, confirm, assert repo removed from list.
- **`test: empty repos state`** — Team with no repos, click repos tab, assert "No repositories assigned" message.
- **`test: repos pagination works`** — Assign 35 repos, click repos tab, assert pagination.

### Team Edit Tests

- **`test: edit form pre-populated with current values`** — Navigate to team edit, assert name, description, and permission match current team state.
- **`test: changing name and saving succeeds`** — Change name to "new-name", submit, assert redirect to `/:org/-/teams/new-name` with updated name.
- **`test: changing permission saves correctly`** — Change permission from read to admin, save, assert detail page shows admin badge.
- **`test: changing description saves correctly`** — Update description, save, assert detail page shows new description.
- **`test: submitting unchanged form succeeds`** — Open edit, submit without changes, assert success (updated_at advances).
- **`test: name collision on edit shows error`** — Create teams "alpha" and "beta", edit "alpha" to "beta", assert 409 error.
- **`test: renaming to same name (own name) succeeds`** — Edit team, submit with same name, assert success.
- **`test: edit form not accessible to non-owner`** — Authenticate as member, navigate to `/:org/-/teams/:team/edit`, assert 403.
- **`test: cancel returns to team detail`** — Open edit, click cancel, assert URL is team detail.

### Team Deletion Tests

- **`test: delete button opens confirmation dialog`** — Click "Delete" on detail page, assert confirmation dialog appears.
- **`test: confirmation requires typing team name`** — Open delete dialog, assert "Delete Team" button is disabled until team name is typed.
- **`test: typing correct name enables delete button`** — Type team name in confirmation input, assert "Delete Team" button becomes enabled.
- **`test: confirming deletion redirects to team list`** — Type name, click "Delete Team", assert redirect to `/:org/-/teams` and success toast.
- **`test: deleted team no longer in list`** — Delete team, navigate to list, assert team is absent.
- **`test: cancelling deletion keeps team intact`** — Open delete dialog, click "Cancel", assert team detail still renders.
- **`test: deleting team with members and repos succeeds`** — Team with 3 members and 2 repos, delete, assert success.

### Cross-Cutting Tests

- **`test: browser back navigates from detail to list`** — Navigate list → detail, press browser back, assert URL is team list.
- **`test: browser forward navigates from list to detail`** — Navigate list → detail → back → forward, assert URL is team detail.
- **`test: direct URL to team detail works`** — Type `/:org/-/teams/:team` directly in browser, assert detail page renders.
- **`test: direct URL to team creation works for owner`** — Type `/:org/-/teams/new` directly, assert creation form renders.
- **`test: case-insensitive team name in URL resolves`** — Create team "Backend", navigate to `/:org/-/teams/backend` (lowercase), assert detail page with name "Backend".
- **`test: case-insensitive org name in URL resolves`** — Create org "MyOrg", navigate to `/myorg/-/teams`, assert teams list renders.
- **`test: feature flag disabled hides teams tab`** — Disable `ORG_TEAMS_UI` flag, navigate to org profile, assert no "Teams" tab in navigation.

## CLI E2E Tests (Verifying UI-Backend Parity)

- **`test: team created via UI appears in CLI list`** — Create team via Playwright, run `codeplane org team list <org>`, assert team in output.
- **`test: team created via CLI appears in UI list`** — Run `codeplane org team create <org> cli-team`, navigate to teams list in browser, assert "cli-team" visible.
- **`test: member added via UI reflected in CLI`** — Add member via UI, run `codeplane org team member list <org> <team>`, assert member in output.
- **`test: repo assigned via UI reflected in CLI`** — Assign repo via UI, run `codeplane org team repo list <org> <team>`, assert repo in output.

## API Integration Tests (Backend Validation)

- **`test: GET /api/orgs/:org/teams returns paginated list`** — Create 5 teams, call API with `?per_page=2`, assert 2 items returned, `X-Total-Count: 5`, `Link` header present.
- **`test: GET /api/orgs/:org/teams returns empty array for org with no teams`** — Call API, assert `[]` with `X-Total-Count: 0`.
- **`test: POST /api/orgs/:org/teams with valid body returns 201`** — Post valid body, assert 201 with correct team object shape.
- **`test: POST /api/orgs/:org/teams with duplicate name returns 409`** — Create team, try same name, assert 409.
- **`test: POST /api/orgs/:org/teams with name of exactly 255 chars returns 201`** — Assert success at boundary.
- **`test: POST /api/orgs/:org/teams with name of 256 chars returns 422`** — Assert rejection at boundary.
- **`test: POST /api/orgs/:org/teams with empty name returns 422`** — Assert validation error.
- **`test: POST /api/orgs/:org/teams with invalid permission returns 422`** — Assert validation error.
- **`test: POST /api/orgs/:org/teams without permission defaults to read`** — Assert `permission: "read"` in response.
- **`test: PATCH /api/orgs/:org/teams/:team with name change returns 200`** — Update name, assert new name in response.
- **`test: PATCH /api/orgs/:org/teams/:team with empty body returns 200`** — Assert team unchanged except updated_at.
- **`test: PATCH /api/orgs/:org/teams/:team with conflicting name returns 409`** — Assert conflict.
- **`test: DELETE /api/orgs/:org/teams/:team returns 204`** — Delete team, assert 204.
- **`test: DELETE /api/orgs/:org/teams/:team for nonexistent team returns 404`** — Assert 404.
- **`test: PUT /api/orgs/:org/teams/:team/members/:username returns 204`** — Add member, assert 204.
- **`test: PUT /api/orgs/:org/teams/:team/members/:username for non-org-member returns 400`** — Assert rejection.
- **`test: DELETE /api/orgs/:org/teams/:team/members/:username returns 204`** — Remove member, assert 204.
- **`test: PUT /api/orgs/:org/teams/:team/repos/:owner/:repo returns 204`** — Add repo, assert 204.
- **`test: PUT /api/orgs/:org/teams/:team/repos/:owner/:repo for non-org-repo returns 400`** — Assert rejection.
- **`test: DELETE /api/orgs/:org/teams/:team/repos/:owner/:repo returns 204`** — Remove repo, assert 204.
- **`test: all team endpoints return 401 for unauthenticated requests`** — Call each endpoint without auth, assert 401.
- **`test: all team mutation endpoints return 403 for org member (non-owner)`** — Call create/update/delete/member-add/member-remove/repo-add/repo-remove as member, assert 403.
- **`test: all team endpoints return 404 for nonexistent org`** — Call each endpoint with nonexistent org, assert 404.
- **`test: per_page > 100 is clamped to 100`** — Call list with `?per_page=200`, assert max 100 items returned.
- **`test: page=0 normalizes to page 1`** — Call list with `?page=0`, assert same results as `?page=1`.
