# ORG_SETTINGS_UI

Specification for ORG_SETTINGS_UI.

## High-Level User POV

# ORG_SETTINGS_UI — User Point of View

When you are an owner of an organization on Codeplane, the organization settings page is your administrative control center. It is where you go to manage everything about how your organization is configured, who belongs to it, and how its teams are structured.

You reach the organization settings page by navigating to your organization's profile and clicking the "Settings" tab — visible only to organization owners. From the CLI, you manage the same settings through `codeplane org edit`, `codeplane org member`, and `codeplane org team` commands. From the TUI, you press `s` on the organization overview screen to open the settings view.

The settings page is organized into clearly separated sections that give you complete control over the organization lifecycle:

**General Settings** lets you update your organization's identity — its name, description, visibility level, website, and location. Renaming your organization changes its URL immediately, and the settings page warns you about this before you save. Changing visibility from public to private immediately restricts who can see the organization, and a confirmation dialog makes sure you understand the impact before proceeding.

**Members** shows you every person who belongs to your organization, along with their role (owner or member). You can add new members by searching for Codeplane users, and you can remove members who no longer need access. The system protects you from accidentally orphaning the organization — you cannot remove the last remaining owner.

**Teams** lets you create and manage teams within the organization. Each team has a name, description, and a permission level (read, write, or admin). You can drill into any team to manage its members and the repositories it has access to. Teams are how you structure fine-grained access control within your organization.

**Danger Zone** is the final section at the bottom of the settings page, visually separated with a red border to indicate irreversible actions. Here, you can delete the organization entirely. Because this destroys all repositories, teams, memberships, and associated data, the page requires you to type the organization's exact name to confirm deletion.

The settings page is a private surface — only organization owners can see or interact with it. Regular members who attempt to access the settings URL are redirected to the organization overview with a permission-denied notification. Unauthenticated users see a 404 page, preventing them from even learning the organization exists if it is not public.

Every change you make on this page takes effect immediately. There is no draft or staging concept. The page reflects the current state of the organization at all times, and after a successful save, all fields update to show the new values. If something goes wrong — a name conflict, a validation error, a network failure — the page tells you exactly what happened and how to fix it, without losing your unsaved changes.

The organization settings page is the single place where an organization owner can manage the full lifecycle of their organization: configure it, grow it by adding members, structure it with teams, and ultimately retire it when it is no longer needed.

## Acceptance Criteria

# ORG_SETTINGS_UI — Acceptance Criteria

## Definition of Done

- [ ] Authenticated organization owners can access the organization settings page at `/:org/settings`.
- [ ] The settings page contains four sections: General Settings, Members, Teams, and Danger Zone.
- [ ] All CRUD operations for organization metadata, members, and teams are functional from the settings page.
- [ ] Non-owner members who navigate to `/:org/settings` are redirected to `/:org` with an access-denied toast notification.
- [ ] Unauthenticated users who navigate to `/:org/settings` for a non-public org see a 404 page.
- [ ] Unauthenticated users who navigate to `/:org/settings` for a public org are redirected to the login page.
- [ ] The sidebar navigation within organization settings highlights the active section.
- [ ] All form validation matches the API constraints exactly.
- [ ] The page is fully navigable via keyboard and accessible via screen readers.
- [ ] The page renders correctly on viewports from 320px to 2560px wide.
- [ ] CLI `org edit`, `org member *`, and `org team *` commands produce equivalent outcomes to the web UI.
- [ ] TUI organization settings screen provides equivalent functionality for org metadata editing.
- [ ] All verification tests pass.
- [ ] Observability instrumentation is in place.

## Functional Constraints — General Settings Section

- [ ] The General Settings form displays five fields: Name, Description, Visibility, Website, and Location.
- [ ] All fields are pre-populated with the current organization values fetched from `GET /api/orgs/:org`.
- [ ] The "Save changes" button is disabled until at least one field value differs from the loaded state.
- [ ] The "Save changes" button submits a `PATCH /api/orgs/:org` request with only the changed fields.
- [ ] On successful save (200), a success toast "Organization updated successfully" is displayed and all fields reflect the updated values.
- [ ] On name conflict (409), an error toast "An organization with that name already exists" is displayed, the name field is highlighted with an inline error, and no fields are reset.
- [ ] On validation error (422), the specific field that failed validation is highlighted with the error message inline below the field.
- [ ] On permission error (403), an error toast "You don't have permission to update this organization" is displayed.
- [ ] On network error, an error toast "Failed to update organization. Please try again." is displayed without clearing form state.
- [ ] The Name field shows a live character count indicator (e.g., "23 / 255").
- [ ] The Name field displays a warning callout: "Renaming your organization will change its URL. Existing links to the old name will stop working immediately."
- [ ] The Name field only accepts alphanumeric characters, hyphens, and underscores.
- [ ] The Visibility field is rendered as a radio button group with three options: Public, Limited, Private, each with a description line.
- [ ] Changing visibility from Public to Limited or Private triggers a confirmation dialog before saving: "Changing visibility to {level} will immediately restrict access. Non-members will no longer be able to view this organization. Continue?"
- [ ] The Description field is a multiline textarea with placeholder text "Describe your organization…".
- [ ] The Website field is a single-line text input with placeholder "https://example.com".
- [ ] The Location field is a single-line text input with placeholder "City, Country".
- [ ] While saving, the button shows a loading spinner and all form inputs are disabled.
- [ ] After save completes, the form returns to its editable state with updated values and the dirty state is reset.

## Functional Constraints — Members Section

- [ ] The Members section displays a paginated table of organization members fetched from `GET /api/orgs/:org/members`.
- [ ] Each row shows: avatar (32×32, rounded), username (as link to user profile), display name, and role badge ("Owner" or "Member").
- [ ] The member list supports page/per_page pagination with 30 items per page by default.
- [ ] An "Add member" button opens a dialog with a user search input.
- [ ] The user search input accepts a user ID and a role selection (Owner or Member).
- [ ] Adding a member calls `POST /api/orgs/:org/members` with `{ user_id, role }`.
- [ ] On successful add (201), the member list refreshes and a success toast "Member added successfully" is displayed.
- [ ] On duplicate member (409), an error toast "User is already a member of this organization" is displayed.
- [ ] On user not found (404), an error toast "User not found" is displayed.
- [ ] Each member row has a "Remove" action (icon button or context menu) visible only for non-self members.
- [ ] Clicking "Remove" opens a confirmation dialog: "Remove {username} from {org_name}? They will lose access to all organization teams and team-scoped repositories."
- [ ] Removing a member calls `DELETE /api/orgs/:org/members/:username`.
- [ ] On successful removal (204), the member list refreshes and a success toast "Member removed" is displayed.
- [ ] Attempting to remove the last owner shows an error toast "Cannot remove the last organization owner".
- [ ] The total member count is displayed in the section header (e.g., "Members (12)") sourced from the `X-Total-Count` response header.
- [ ] An empty member list (theoretically impossible — at least one owner exists) shows a placeholder message.

## Functional Constraints — Teams Section

- [ ] The Teams section displays a paginated table of teams fetched from `GET /api/orgs/:org/teams`.
- [ ] Each row shows: team name (as link to team detail), description (truncated to 80 chars with ellipsis), permission badge (Read/Write/Admin), and created date (relative timestamp).
- [ ] A "Create team" button opens a creation dialog with fields: Name, Description, and Permission (select: read/write/admin).
- [ ] Creating a team calls `POST /api/orgs/:org/teams` with `{ name, description, permission }`.
- [ ] On successful creation (201), the team list refreshes and a success toast "Team created" is displayed.
- [ ] Each team row has "Edit" and "Delete" actions.
- [ ] Editing a team opens an inline form or dialog to update name, description, and permission, calling `PATCH /api/orgs/:org/teams/:team`.
- [ ] Deleting a team opens a confirmation dialog requiring the team name to be typed, then calls `DELETE /api/orgs/:org/teams/:team`.
- [ ] Clicking a team name navigates to a team detail view showing team members and assigned repositories.
- [ ] The total team count is displayed in the section header (e.g., "Teams (5)") sourced from the `X-Total-Count` response header.
- [ ] An empty team list shows: "No teams yet. Create your first team to organize repository access."

## Functional Constraints — Danger Zone Section

- [ ] The Danger Zone section is visually separated from other sections with a red/destructive border.
- [ ] It contains a "Delete this organization" action with an explanation: "Once you delete an organization, there is no going back. This will permanently delete all repositories, teams, memberships, secrets, variables, and webhooks associated with this organization."
- [ ] Clicking "Delete organization" opens a confirmation dialog requiring the user to type the exact organization name.
- [ ] The confirmation dialog's "Delete" button is disabled until the typed name matches exactly (case-sensitive).
- [ ] On successful deletion (204), the user is redirected to the home page with a toast "Organization deleted".
- [ ] On permission error (403), an error toast is displayed.

## Boundary Constraints

- [ ] Organization name: 1–255 characters, alphanumeric plus hyphens and underscores only.
- [ ] Organization name input rejects characters outside `[a-zA-Z0-9_-]` via client-side filtering (keypress prevention or input mask).
- [ ] Description: no enforced maximum length in the current API, but the textarea should support up to 100,000 characters without UI degradation.
- [ ] Website: no enforced maximum length, but the input should display correctly for URLs up to 2,048 characters.
- [ ] Location: no enforced maximum length, but the input should display correctly for values up to 2,048 characters.
- [ ] Visibility: exactly one of `public`, `limited`, `private` — the radio group must always have exactly one selected.
- [ ] Team name: 1–255 characters after trimming.
- [ ] Team description: string, may be empty.
- [ ] Team permission: exactly one of `read`, `write`, `admin`.
- [ ] Member role: exactly one of `owner` or `member`.
- [ ] User ID for member add: positive integer.
- [ ] Pagination: page ≥ 1, per_page 1–100.
- [ ] All string inputs support UTF-8 including emoji, CJK, and accented characters.
- [ ] All string inputs are trimmed of leading/trailing whitespace before submission.

## Edge Cases

- [ ] Navigating to `/:org/settings` for a nonexistent org shows a 404 page.
- [ ] Navigating to `/:org/settings` as a member (not owner) redirects to `/:org` with access-denied toast.
- [ ] Submitting the general settings form with no changes (all fields identical to loaded values) keeps the save button disabled.
- [ ] Submitting a name that matches the current name exactly does not trigger a conflict error.
- [ ] Submitting a name that differs only in casing from the current name succeeds.
- [ ] Submitting a name that matches another organization's name (case-insensitive) shows a 409 conflict error.
- [ ] Rapidly clicking "Save changes" multiple times does not send duplicate requests (button is disabled during submission).
- [ ] If the organization is renamed while viewing settings, the URL updates to reflect the new org name after save.
- [ ] Adding a member who is already a member shows a 409 conflict error.
- [ ] Removing a member and then trying to remove them again (e.g., from a stale tab) shows a 404 error.
- [ ] Attempting to remove yourself as the last owner shows a 409 error with a clear explanation.
- [ ] Creating a team with a name that already exists (case-insensitive) shows a 409 conflict error.
- [ ] Deleting a team that was already deleted (stale tab) shows a 404 error.
- [ ] The organization name confirmation for deletion must be case-sensitive exact match.
- [ ] If the session expires while on the settings page, the next action redirects to login.
- [ ] Long organization names (255 chars) render without breaking the page layout (truncation with tooltip).
- [ ] Long team descriptions (1000+ chars) are truncated in the table row but fully visible in edit mode.
- [ ] An organization with 0 teams shows the empty state message in the Teams section.
- [ ] An organization with 100+ members paginates correctly in the Members section.
- [ ] The page renders correctly when the organization has maximum field lengths for all fields simultaneously.
- [ ] Network errors during member list fetch show an inline error with a retry button, without breaking other sections.
- [ ] Network errors during team list fetch show an inline error with a retry button, without breaking other sections.

## Design

# ORG_SETTINGS_UI — Design

## Web UI Design

### Route

`/:org/settings` — the organization settings page, accessible only to organization owners.

### Layout

The page uses a two-column layout consistent with the user settings pattern established by `USER_SETTINGS_HOME_UI`:

- **Left column (sidebar, ~240px fixed)**: Vertical navigation list with links to organization sub-pages.
- **Right column (content area, fluid)**: The settings content, organized into vertically stacked sections.

### Sidebar Navigation

The organization sidebar is rendered as a vertical list:

| Order | Icon | Label | Route |
|-------|------|-------|-------|
| 1 | 📋 (overview) | Overview | `/:org` |
| 2 | 📦 (package) | Repositories | `/:org` (repos tab) |
| 3 | 👥 (people) | Members | `/:org/settings` (members section) |
| 4 | 🏷️ (tag) | Teams | `/:org/settings` (teams section) |
| 5 | ⚙️ (gear) | Settings | `/:org/settings` |

The active page item has a left-border accent (4px, primary color), bold label text, and a subtle background highlight. On viewports < 768px, the sidebar collapses into a horizontal tab bar.

### Page Header

- **Breadcrumb**: `Home > {org_name} > Settings`
- **Title**: "Organization Settings" as an h1 heading
- **Subtitle**: "Manage your organization's profile, members, and teams."

### Section 1 — General Settings

```
┌─────────────────────────────────────────────────────┐
│ General                                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Organization name                                   │
│ ┌─────────────────────────────────┐  23 / 255       │
│ │ acme-corp                       │                 │
│ └─────────────────────────────────┘                 │
│ ⚠ Renaming your organization will change its URL.  │
│   Existing links will stop working immediately.     │
│                                                     │
│ Description                                         │
│ ┌─────────────────────────────────┐                 │
│ │ Building the future of...       │                 │
│ │                                 │                 │
│ └─────────────────────────────────┘                 │
│                                                     │
│ Visibility                                          │
│ ○ Public — Anyone can see this organization         │
│ ● Limited — Only authenticated members can see it   │
│ ○ Private — Only organization members can see it    │
│                                                     │
│ Website                                             │
│ ┌─────────────────────────────────┐                 │
│ │ https://acme.example.com        │                 │
│ └─────────────────────────────────┘                 │
│                                                     │
│ Location                                            │
│ ┌─────────────────────────────────┐                 │
│ │ San Francisco, CA               │                 │
│ └─────────────────────────────────┘                 │
│                                                     │
│                          [Save changes] (disabled)  │
└─────────────────────────────────────────────────────┘
```

**Field behaviors**:
- Name input: character counter updates live. Inline validation prevents > 255 chars. Regex filter prevents non-`[a-zA-Z0-9_-]` characters.
- Description textarea: auto-resizes vertically to content. No character limit enforced.
- Visibility radios: selecting a more restrictive option (public → limited/private) triggers a confirmation dialog before the change is applied.
- Website input: placeholder `https://example.com`.
- Location input: placeholder `City, Country`.
- Save button: disabled (greyed out, no pointer cursor) until dirty. Shows spinner during submission. Re-enables on completion or error.

**Error display**:
- Field-level validation errors appear as red text directly below the offending input.
- Toast notifications appear in the top-right corner for success, conflict, permission, and network errors.
- The form preserves all user-entered values on error — no fields are cleared.

### Section 2 — Members

```
┌─────────────────────────────────────────────────────┐
│ Members (12)                            [Add member]│
├─────────────────────────────────────────────────────┤
│ Avatar │ Username    │ Display Name │ Role   │      │
│────────┼─────────────┼──────────────┼────────┼──────│
│ [img]  │ @alice      │ Alice Chen   │ Owner  │      │
│ [img]  │ @bob        │ Bob Smith    │ Member │ [✕]  │
│ [img]  │ @carol      │ Carol Jones  │ Member │ [✕]  │
│ ...                                                 │
├─────────────────────────────────────────────────────┤
│                    ◄ 1 2 3 ►                        │
└─────────────────────────────────────────────────────┘
```

**Table columns**:
- Avatar: 32×32 rounded image, identicon fallback
- Username: linked to `/:username` profile page
- Display Name: plain text, empty string if not set
- Role: badge — blue "Owner" or gray "Member"
- Action: remove button (✕ icon), hidden for the viewer's own row if they are the last owner, visible otherwise

**Add Member dialog**:
```
┌─────────────────────────────────────┐
│ Add Organization Member             │
├─────────────────────────────────────┤
│ User ID                             │
│ ┌───────────────────────────────┐   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
│ Role                                │
│ ┌───────────────────────────────┐   │
│ │ Member                    ▼   │   │
│ └───────────────────────────────┘   │
│                                     │
│               [Cancel]  [Add]       │
└─────────────────────────────────────┘
```

**Remove Member confirmation dialog**:
```
┌─────────────────────────────────────┐
│ Remove member                       │
├─────────────────────────────────────┤
│ Remove @bob from acme-corp?         │
│                                     │
│ They will lose access to all org    │
│ teams and team-scoped repositories. │
│                                     │
│               [Cancel]  [Remove]    │
└─────────────────────────────────────┘
```

### Section 3 — Teams

```
┌─────────────────────────────────────────────────────┐
│ Teams (5)                             [Create team] │
├─────────────────────────────────────────────────────┤
│ Name         │ Description        │ Permission │    │
│──────────────┼────────────────────┼────────────┼────│
│ engineering  │ Core engineering…  │ Write      │ ⋯  │
│ design       │ Product design t…  │ Read       │ ⋯  │
│ ops          │ Infrastructure a…  │ Admin      │ ⋯  │
│ ...                                                 │
├─────────────────────────────────────────────────────┤
│                    ◄ 1 2 ►                          │
└─────────────────────────────────────────────────────┘
```

**Table columns**:
- Name: linked to team detail page `/:org/settings/teams/:team`
- Description: truncated to 80 characters with ellipsis
- Permission: color-coded badge — green "Read", blue "Write", amber "Admin"
- Action: overflow menu (⋯) with "Edit" and "Delete" options

**Empty state**: "No teams yet. Create your first team to organize repository access." with a "Create team" CTA button.

**Create Team dialog**:
```
┌─────────────────────────────────────┐
│ Create Team                         │
├─────────────────────────────────────┤
│ Team name                           │
│ ┌───────────────────────────────┐   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
│ Description                         │
│ ┌───────────────────────────────┐   │
│ │                               │   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
│ Permission                          │
│ ○ Read — Read-only access           │
│ ● Write — Read and write access     │
│ ○ Admin — Full administrative access│
│                                     │
│              [Cancel]  [Create]     │
└─────────────────────────────────────┘
```

**Delete Team confirmation dialog**:
```
┌─────────────────────────────────────┐
│ Delete team                         │
├─────────────────────────────────────┤
│ This will permanently delete the    │
│ team "engineering" and remove all   │
│ repository access grants.           │
│                                     │
│ Type "engineering" to confirm:      │
│ ┌───────────────────────────────┐   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
│             [Cancel]  [Delete]      │
└─────────────────────────────────────┘
```

### Section 4 — Danger Zone

```
┌── Danger Zone ──────────────────────────────────────┐
│ (red border, subtle red background tint)            │
│                                                     │
│ Delete this organization                            │
│ Once you delete an organization, there is no going  │
│ back. This will permanently delete all repositories,│
│ teams, memberships, secrets, variables, and webhooks│
│ associated with this organization.                  │
│                                                     │
│                       [Delete this organization]    │
└─────────────────────────────────────────────────────┘
```

**Delete Organization confirmation dialog**:
```
┌─────────────────────────────────────┐
│ Delete organization                 │
├─────────────────────────────────────┤
│ This action CANNOT be undone. This  │
│ will permanently delete the         │
│ "acme-corp" organization, all of   │
│ its repositories, teams, and data.  │
│                                     │
│ Type "acme-corp" to confirm:        │
│ ┌───────────────────────────────┐   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
│           [Cancel]  [Delete] (red)  │
└─────────────────────────────────────┘
```

### Loading States

- On initial page load, each section independently renders skeleton placeholders matching its final dimensions.
- The General Settings form shows skeleton lines for each field label and input.
- The Members table shows skeleton rows (5 rows with shimmer animation).
- The Teams table shows skeleton rows (5 rows with shimmer animation).
- The Danger Zone section renders immediately (no data dependency).
- Each section loads independently — a slow Members fetch does not block General Settings from rendering.

### Responsive Behavior

- **≥1024px**: Full two-column layout. Sidebar on left, content on right.
- **768px–1023px**: Sidebar collapses to horizontal tabs above content. Content is full-width.
- **<768px**: Tabs collapse into a hamburger menu. Tables switch to card-based layouts for Members and Teams.

### Team Detail Page

**Route**: `/:org/settings/teams/:team`

This sub-page shows the full detail of a single team:

- **Header**: Team name, description, permission badge, created/updated timestamps.
- **Members sub-section**: Paginated list of team members with add/remove actions. Add calls `PUT /api/orgs/:org/teams/:team/members/:username`. Remove calls `DELETE /api/orgs/:org/teams/:team/members/:username`.
- **Repositories sub-section**: Paginated list of repositories the team has access to, with add/remove actions. Add calls `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo`. Remove calls `DELETE /api/orgs/:org/teams/:team/repos/:owner/:repo`.
- **Back navigation**: "← Back to Teams" link returning to `/:org/settings`.

## API Shape

The ORG_SETTINGS_UI consumes existing API endpoints. No new endpoints are required.

**Page load data sources**:
| Endpoint | Purpose |
|---|---|
| `GET /api/orgs/:org` | Fetch organization details for General Settings |
| `GET /api/orgs/:org/members?page=1&per_page=30` | Fetch member list |
| `GET /api/orgs/:org/teams?page=1&per_page=30` | Fetch team list |

**Mutation endpoints used**:
| Endpoint | Method | Trigger |
|---|---|---|
| `PATCH /api/orgs/:org` | PATCH | Save general settings |
| `POST /api/orgs/:org/members` | POST | Add member |
| `DELETE /api/orgs/:org/members/:username` | DELETE | Remove member |
| `POST /api/orgs/:org/teams` | POST | Create team |
| `PATCH /api/orgs/:org/teams/:team` | PATCH | Update team |
| `DELETE /api/orgs/:org/teams/:team` | DELETE | Delete team |
| `PUT /api/orgs/:org/teams/:team/members/:username` | PUT | Add team member |
| `DELETE /api/orgs/:org/teams/:team/members/:username` | DELETE | Remove team member |
| `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo` | PUT | Grant team repo access |
| `DELETE /api/orgs/:org/teams/:team/repos/:owner/:repo` | DELETE | Revoke team repo access |
| `DELETE /api/orgs/:org` | DELETE | Delete organization |

## CLI Command

The CLI provides equivalent functionality through existing commands:

- `codeplane org edit <name> [--description, --visibility, --new-name, --website, --location]` — Update org settings
- `codeplane org member list <org>` — List members
- `codeplane org member add <org> <username>` — Add member
- `codeplane org member remove <org> <username>` — Remove member
- `codeplane org team list <org>` — List teams
- `codeplane org team create <org> <name> [--description, --permission]` — Create team
- `codeplane org team edit <org> <team> [--description, --permission]` — Update team
- `codeplane org team delete <org> <team>` — Delete team
- `codeplane org team member list <org> <team>` — List team members
- `codeplane org team member add <org> <team> <username>` — Add team member
- `codeplane org team member remove <org> <team> <username>` — Remove team member
- `codeplane org team repo list <org> <team>` — List team repos
- `codeplane org team repo add <org> <team> <repo>` — Grant team repo access
- `codeplane org team repo remove <org> <team> <repo>` — Revoke team repo access
- `codeplane org delete <name> --confirm <name>` — Delete organization

All CLI commands output JSON and support `--json` field filtering.

## TUI UI

**Screen: Organization Settings**

Accessible from the organization overview screen by pressing `s` (owner only).

**Layout**:
- Header bar: `Settings: {org_name}`
- Form fields navigable with Tab/Shift+Tab:
  - Name: `[text input]`
  - Description: `[text input]`
  - Visibility: `[select: public | limited | private]`
  - Website: `[text input]`
  - Location: `[text input]`
- Actions bar: `[Save]` (Enter or Ctrl+S), `[Cancel]` (Esc)

**Key bindings**:
| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Move between form fields |
| `Enter` (on Save) | Submit form |
| `Ctrl+S` | Submit form from any field |
| `Esc` | Cancel and return to org overview |
| `?` | Show keyboard help |

**Feedback**:
- On success: flash "✓ Organization updated" and return to org overview with refreshed data.
- On error: display error message inline at the bottom of the form.

## Documentation

- **User guide**: "Managing Organization Settings" — walkthrough of all four settings sections (General, Members, Teams, Danger Zone) with screenshots showing form interactions, confirmation dialogs, and error states.
- **API reference**: Link to existing `PATCH /api/orgs/:org`, member, and team endpoint documentation.
- **CLI reference**: Link to existing `codeplane org edit` and related commands.
- **Concept page**: Update "Organization visibility levels" to explain immediate effect of visibility changes from the settings page.
- **FAQ entry**: "What happens when I delete an organization?" explaining cascade behavior.

## Permissions & Security

# ORG_SETTINGS_UI — Permissions & Security

## Authorization Roles

| Role | Can access settings page? | Can view General Settings? | Can edit General Settings? | Can view Members? | Can add/remove Members? | Can view Teams? | Can create/edit/delete Teams? | Can delete Org? |
|------|--------------------------|---------------------------|--------------------------|-------------------|------------------------|----------------|-------------------------------|----------------|
| Anonymous (unauthenticated) | ❌ No (404 for non-public orgs, redirect to login for public orgs) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Authenticated (non-member) | ❌ No (403 → redirect to `/:org`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Organization Member (`member` role) | ❌ No (403 → redirect to `/:org` with access-denied toast) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Organization Owner (`owner` role) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Platform Admin (`is_admin`) | ✅ Yes (via admin routes) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

## Security Rules

1. **Owner-only access**: The entire settings page is restricted to organization owners. The client must verify the viewer's org role before rendering the page. The "Settings" tab/link in the organization navigation must only be visible to owners.
2. **Server-side enforcement**: All mutations are enforced server-side by the API routes. Client-side role checks are for UX only — they do not replace server authorization.
3. **Information leakage prevention**: Non-public organizations return 404 (not 403) to unauthenticated users. The settings page must follow this same pattern — unauthenticated users never learn the org exists.
4. **No privilege escalation via member add**: An owner cannot assign a role higher than `owner`. The only valid roles are `owner` and `member`.
5. **Last owner protection**: The API enforces that the last owner cannot be removed. The UI should reflect this constraint by disabling the remove action for the last owner and explaining why.
6. **Name change URL sensitivity**: After an organization rename, the URL changes. The UI must handle this by navigating to the new URL after a successful rename save.
7. **Visibility downgrade sensitivity**: Changing from public to private/limited immediately restricts access. The confirmation dialog is a critical UX safety guard.
8. **CSRF protection**: All mutation requests must include the CSRF token from the session cookie.
9. **PAT scope**: Personal access tokens can be used to authenticate against the settings API. Token scope must include org management permissions.
10. **No sensitive data exposure**: The settings page displays only organization-level metadata, member public profiles (username, display name, avatar), and team configuration. No email addresses, admin flags, or internal IDs beyond user_id for member add.

## Rate Limiting

| Context | Rate Limit | Window | Notes |
|---------|-----------|--------|-------|
| Authenticated read requests (GET) | 5,000 requests | per hour | Member list, team list, org details |
| Authenticated mutation requests (PATCH, POST, DELETE) | 30 requests | per minute | Org update, member add/remove, team CRUD |
| Per-IP burst (reads) | 30 requests | per minute | Prevents scraping |
| Per-IP burst (mutations) | 10 requests | per minute | Prevents mass operations |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses. The UI should display a user-friendly message when rate limits are hit: "You're making changes too quickly. Please wait a moment and try again."

## Data Privacy

- **Member PII**: The member list displays only public profile information (username, display name, avatar URL). Email addresses, login timestamps, IP addresses, and admin status are never exposed through the org member list.
- **Audit trail**: All settings changes (org update, member add/remove, team CRUD) are logged with the actor's identity for audit purposes.
- **Name history**: After an org rename, the old name is not stored or retrievable. This prevents enumeration of previous org names.
- **Team membership**: Team member lists are visible to all org members, not just owners. This is acceptable because team structure is organizational information, not personal data.
- **Deletion cascade**: When an org is deleted, all associated data (repos, teams, memberships, secrets, variables, webhooks) is permanently removed. There is no soft-delete or recovery mechanism.

## Telemetry & Product Analytics

# ORG_SETTINGS_UI — Telemetry & Product Analytics

## Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgSettingsPageViewed` | User loads the `/:org/settings` page | `org_id`, `org_name`, `viewer_user_id`, `viewer_role` (`owner`), `client` (`web`), `page_load_time_ms` |
| `OrgSettingsGeneralSaved` | User successfully saves general settings (200 response from PATCH) | `org_id`, `org_name`, `org_name_previous` (if changed), `actor_user_id`, `fields_changed` (array of changed field names), `visibility_previous` (if changed), `visibility_new` (if changed), `client` |
| `OrgSettingsGeneralSaveFailed` | General settings save returns a 4xx/5xx | `org_id`, `org_name`, `actor_user_id`, `status_code`, `error_reason`, `fields_attempted`, `client` |
| `OrgSettingsVisibilityConfirmShown` | Visibility confirmation dialog is displayed | `org_id`, `org_name`, `actor_user_id`, `visibility_current`, `visibility_attempted`, `client` |
| `OrgSettingsVisibilityConfirmAccepted` | User confirms visibility change in dialog | `org_id`, `org_name`, `actor_user_id`, `visibility_from`, `visibility_to`, `client` |
| `OrgSettingsVisibilityConfirmCancelled` | User cancels visibility change dialog | `org_id`, `org_name`, `actor_user_id`, `visibility_from`, `visibility_attempted`, `client` |
| `OrgSettingsMemberAdded` | Member successfully added (201 from POST) | `org_id`, `org_name`, `actor_user_id`, `added_user_id`, `added_role`, `total_members_after`, `client` |
| `OrgSettingsMemberAddFailed` | Member add returns a 4xx/5xx | `org_id`, `org_name`, `actor_user_id`, `attempted_user_id`, `attempted_role`, `status_code`, `error_reason`, `client` |
| `OrgSettingsMemberRemoved` | Member successfully removed (204 from DELETE) | `org_id`, `org_name`, `actor_user_id`, `removed_username`, `removed_role`, `total_members_after`, `client` |
| `OrgSettingsMemberRemoveFailed` | Member remove returns a 4xx/5xx | `org_id`, `org_name`, `actor_user_id`, `attempted_username`, `status_code`, `error_reason`, `client` |
| `OrgSettingsTeamCreated` | Team successfully created (201 from POST) | `org_id`, `org_name`, `actor_user_id`, `team_name`, `team_permission`, `total_teams_after`, `client` |
| `OrgSettingsTeamUpdated` | Team successfully updated (200 from PATCH) | `org_id`, `org_name`, `actor_user_id`, `team_name`, `fields_changed`, `client` |
| `OrgSettingsTeamDeleted` | Team successfully deleted (204 from DELETE) | `org_id`, `org_name`, `actor_user_id`, `team_name`, `total_teams_after`, `client` |
| `OrgSettingsDeleteInitiated` | User clicks "Delete this organization" button | `org_id`, `org_name`, `actor_user_id`, `client` |
| `OrgSettingsDeleteConfirmed` | Org successfully deleted (204 from DELETE) | `org_id`, `org_name`, `actor_user_id`, `member_count_at_deletion`, `team_count_at_deletion`, `repo_count_at_deletion`, `client` |
| `OrgSettingsDeleteCancelled` | User cancels the delete confirmation dialog | `org_id`, `org_name`, `actor_user_id`, `client` |
| `OrgSettingsAccessDenied` | Non-owner attempts to access settings page | `org_id`, `org_name`, `viewer_user_id`, `viewer_role`, `client` |

## Funnel Metrics

- **Settings page reach rate**: Percentage of org owners who visit `/:org/settings` at least once per month. Target: > 30% of active org owners.
- **Settings page → save conversion**: Percentage of settings page views that result in at least one successful general settings save. Target: > 15%. Low conversion may indicate UX friction or that users are only browsing.
- **Member management activity**: Average number of member add/remove operations per organization per month. Measures organizational churn and adoption of membership management.
- **Team adoption rate**: Percentage of organizations with at least one team. Target: > 25% of organizations with 3+ members.
- **Visibility change frequency**: Number of visibility changes per month. High volume may indicate user confusion about visibility levels.
- **Org deletion rate**: Percentage of organizations deleted within 30 days of creation. High rates may indicate experimentation or poor onboarding.
- **Delete dialog completion rate**: Percentage of delete confirmation dialogs that result in actual deletion vs. cancellation. High cancellation rates indicate the confirmation is working as a safety guard.
- **Error rate by section**: Breakdown of failed operations across General Settings, Members, and Teams. Identifies which section has the most friction.
- **Client distribution**: Breakdown of org settings actions across web, CLI, and TUI.

## Success Indicators

- Settings page load time p50 < 500ms, p99 < 2,000ms (multiple parallel API calls).
- General settings save latency p50 < 100ms, p99 < 500ms.
- Error rate for save operations < 2% (excluding expected validation/conflict errors).
- At least 50% of organizations with 2+ owners have at least one non-creator member added via the settings page within 30 days.
- Team creation rate > 20% among organizations with 5+ members.
- Org deletion confirmation dialog cancellation rate > 30% (safety guard effectiveness).

## Observability

# ORG_SETTINGS_UI — Observability

## Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Org settings page loaded | `debug` | `org_id`, `org_name`, `viewer_user_id`, `request_id` |
| General settings save requested | `debug` | `org_id`, `org_name`, `actor_user_id`, `fields_in_request` (array), `request_id` |
| General settings save succeeded | `info` | `org_id`, `org_name`, `actor_user_id`, `fields_changed` (array), `name_changed` (boolean), `visibility_changed` (boolean), `response_time_ms`, `request_id` |
| Organization renamed | `warn` | `org_id`, `old_name`, `new_name`, `actor_user_id`, `request_id` |
| Organization visibility changed | `warn` | `org_id`, `org_name`, `old_visibility`, `new_visibility`, `actor_user_id`, `request_id` |
| General settings save failed (4xx) | `info` | `org_id`, `org_name`, `actor_user_id`, `status_code`, `error_message`, `request_id` |
| General settings save failed (5xx) | `error` | `org_id`, `org_name`, `actor_user_id`, `status_code`, `error_message`, `error_stack`, `request_id` |
| Member added | `info` | `org_id`, `org_name`, `actor_user_id`, `added_user_id`, `role`, `request_id` |
| Member add failed | `info` | `org_id`, `org_name`, `actor_user_id`, `attempted_user_id`, `status_code`, `error_message`, `request_id` |
| Member removed | `info` | `org_id`, `org_name`, `actor_user_id`, `removed_username`, `request_id` |
| Member remove failed | `info` | `org_id`, `org_name`, `actor_user_id`, `attempted_username`, `status_code`, `error_message`, `request_id` |
| Last owner removal blocked (409) | `warn` | `org_id`, `org_name`, `actor_user_id`, `attempted_username`, `request_id` |
| Team created | `info` | `org_id`, `org_name`, `actor_user_id`, `team_name`, `permission`, `request_id` |
| Team updated | `info` | `org_id`, `org_name`, `actor_user_id`, `team_name`, `fields_changed`, `request_id` |
| Team deleted | `info` | `org_id`, `org_name`, `actor_user_id`, `team_name`, `request_id` |
| Organization deleted | `warn` | `org_id`, `org_name`, `actor_user_id`, `member_count`, `team_count`, `request_id` |
| Organization delete failed | `error` | `org_id`, `org_name`, `actor_user_id`, `status_code`, `error_message`, `request_id` |
| Access denied to settings page | `info` | `org_name`, `viewer_user_id`, `viewer_role`, `request_id` |
| Unauthenticated settings page access | `info` | `org_name`, `request_id` |

All log lines must include the `request_id` from the middleware for correlation. Name changes, visibility changes, and org deletions are logged at `warn` level due to their operational impact.

## Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_settings_page_loads_total` | counter | — | Total org settings page loads |
| `codeplane_org_settings_page_load_duration_seconds` | histogram | — | Page load duration (buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0) |
| `codeplane_org_settings_save_total` | counter | `status_code`, `section` (`general`, `member_add`, `member_remove`, `team_create`, `team_update`, `team_delete`, `org_delete`) | Total settings mutation requests |
| `codeplane_org_settings_save_duration_seconds` | histogram | `section` | Mutation request duration (buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_org_settings_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `conflict`, `validation`, `internal`), `section` | Error breakdown |
| `codeplane_org_settings_access_denied_total` | counter | `reason` (`not_member`, `not_owner`, `unauthenticated`) | Access denied attempts |
| `codeplane_org_rename_total` | counter | — | Total organization renames via settings |
| `codeplane_org_visibility_change_total` | counter | `from`, `to` | Visibility transitions |
| `codeplane_org_delete_total` | counter | `status` (`success`, `failed`, `cancelled`) | Org deletion outcomes |
| `codeplane_org_settings_in_flight` | gauge | `section` | Currently in-flight settings requests |

## Alerts

### Alert: `OrgSettingsHighErrorRate`
- **Condition**: `rate(codeplane_org_settings_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries containing org settings context. Look for stack traces and error messages.
  2. Verify database connectivity — run `SELECT 1` on the primary database and check connection pool health (`codeplane_db_pool_active`, `codeplane_db_pool_idle`).
  3. Check which `section` label is producing the most errors to isolate the problem to a specific operation (general settings, member management, or team management).
  4. Check for recent deployments that may have introduced a regression in org routes or `OrgService` methods.
  5. Verify that the `organizations`, `org_members`, and `teams` tables have expected indexes.
  6. Check for database lock contention in `pg_locks` if queries are timing out.
  7. Escalate to the platform team if the issue persists beyond 15 minutes.

### Alert: `OrgSettingsHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_settings_save_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific `section` label.
  2. Run `EXPLAIN ANALYZE` on the relevant SQL queries for the affected section.
  3. Check database connection pool utilization.
  4. Check for lock contention in `pg_locks`.
  5. Check system load on application and database hosts.
  6. If the issue is with member operations, check for organizations with very large member counts that may be causing slow queries.

### Alert: `OrgDeleteSpike`
- **Condition**: `increase(codeplane_org_delete_total{status="success"}[1h]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check if the deletions are from a single actor (potential abuse or automated cleanup script).
  2. Verify rate limiting is functioning correctly for mutation endpoints.
  3. Check if the deletions are correlated with a specific event (mass account cleanup, security incident).
  4. If abuse is suspected, temporarily block the actor's account and investigate.
  5. If legitimate (e.g., scheduled cleanup), acknowledge and document.

### Alert: `OrgSettingsAccessDeniedSpike`
- **Condition**: `rate(codeplane_org_settings_access_denied_total[10m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. Check if the denials are from a single IP or user agent (potential enumeration or probing).
  2. Check the `reason` label — a spike in `unauthenticated` denials may indicate a bot scanning settings URLs.
  3. Check the `not_owner` denials — a spike may indicate confusion about org roles (documentation issue).
  4. Verify rate limiting is functioning.
  5. No immediate action required for organic access-denied traffic.

### Alert: `OrgSettingsPageLoadSlow`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_org_settings_page_load_duration_seconds_bucket[5m])) > 3.0`
- **Severity**: Info
- **Runbook**:
  1. Check if the slowness is due to one specific API call (org details, member list, or team list) by checking individual endpoint latencies.
  2. Verify that the three parallel API calls are actually being made in parallel (check client-side implementation).
  3. Check for organizations with unusually large member or team counts causing slow list queries.
  4. Check CDN/edge cache status for static assets.

## Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost during save | 500 Internal Server Error; toast "Failed to update organization" | Automatic reconnection via pool; user retries |
| Org renamed by another owner while editing | Save may succeed or fail depending on which name is used; stale URL | User refreshes page to get new org name and URL |
| Org deleted by another owner while editing | Next save returns 404; user sees "Organization not found" | User is redirected to home |
| Member removed by another owner while viewing | Stale member list; next remove call returns 404 | List auto-refreshes on error; user sees updated list |
| Concurrent team deletion | One delete succeeds, other gets 404 | User sees "Team not found" toast; list refreshes |
| Network timeout during save | Toast "Failed to update organization. Please try again." | User retries manually |
| Session expired during page interaction | Next mutation returns 401; redirect to login | User logs in again and returns to settings |
| Rate limit exceeded | 429 Too Many Requests; toast "You're making changes too quickly" | User waits and retries |
| Invalid team name (empty after trimming) | 422 validation error; inline field error | User corrects and resubmits |
| Org name with 256+ characters entered | Client-side validation prevents submission; character counter shows red | User shortens name |

## Verification

# ORG_SETTINGS_UI — Verification

## Playwright Web UI E2E Tests

### Page Access & Authorization

- **`test: org owner can access settings page at /:org/settings`** — Create org. Authenticate as owner. Navigate to `/:org/settings`. Assert page title "Organization Settings" is visible. Assert all four sections (General, Members, Teams, Danger Zone) are rendered.
- **`test: org member is redirected to /:org with access-denied toast`** — Create org, add a user as member. Authenticate as member. Navigate to `/:org/settings`. Assert URL is `/:org`. Assert toast with text containing "permission" or "access denied" is visible.
- **`test: unauthenticated user sees 404 for non-public org settings`** — Create private org. Logout. Navigate to `/:org/settings`. Assert 404 page is rendered.
- **`test: unauthenticated user is redirected to login for public org settings`** — Create public org. Logout. Navigate to `/:org/settings`. Assert URL contains `/login`.
- **`test: non-member of private org sees 404 at settings page`** — Create private org. Authenticate as non-member. Navigate to `/:org/settings`. Assert 404 page is rendered.
- **`test: settings tab is visible only to org owners`** — Create org, add user as member. Authenticate as owner → navigate to `/:org` → assert "Settings" tab visible. Authenticate as member → navigate to `/:org` → assert "Settings" tab is NOT visible.
- **`test: nonexistent org settings page shows 404`** — Navigate to `/nonexistent-org-xyz/settings`. Assert 404 page.

### General Settings — Happy Path

- **`test: general settings form is pre-populated with current org data`** — Create org with name, description, visibility, website, location. Navigate to settings. Assert name input value matches. Assert description textarea value matches. Assert correct visibility radio is selected. Assert website input value matches. Assert location input value matches.
- **`test: save button is disabled when no fields are changed`** — Navigate to settings. Assert "Save changes" button is disabled.
- **`test: changing description enables save button`** — Navigate to settings. Clear description field and type "New description". Assert save button is enabled.
- **`test: saving updated description shows success toast`** — Change description. Click save. Assert toast "Organization updated successfully" appears. Assert description field contains new value.
- **`test: saving updated name updates the URL`** — Change org name to a new unique name. Click save. Assert URL contains the new org name. Assert name field shows the new name.
- **`test: saving updated visibility shows confirmation dialog for restrictive change`** — Org starts as public. Select "Private" radio. Click save. Assert confirmation dialog appears with text about restricting access. Click "Continue". Assert save completes with success toast.
- **`test: cancelling visibility confirmation dialog does not save`** — Org starts as public. Select "Private" radio. Click save. Assert dialog appears. Click "Cancel". Assert visibility radio reverts to "Public".
- **`test: saving updated website works`** — Change website to `https://newsite.example.com`. Click save. Assert success toast. Assert website field shows new value.
- **`test: saving updated location works`** — Change location to `Tokyo, Japan`. Click save. Assert success toast. Assert location field shows new value.
- **`test: saving all fields at once works`** — Change name, description, visibility, website, and location simultaneously. Save. Assert success toast. Assert all fields reflect new values.
- **`test: empty description preserves existing value`** — Org has description "Original". Clear the description field entirely. Save. Assert the description field shows "Original" (server preserves empty-string → existing value).

### General Settings — Error Cases

- **`test: name conflict shows 409 error`** — Create two orgs. Navigate to first org settings. Change name to match second org's name. Save. Assert inline error on name field or toast containing "already exists".
- **`test: name exceeding 255 characters is prevented by client-side validation`** — Type 256 characters into name field. Assert character counter shows red. Assert save button is disabled or submission is blocked.
- **`test: name at exactly 255 characters is accepted`** — Type exactly 255 valid characters into name field. Click save. Assert success.
- **`test: invalid characters in name are prevented`** — Attempt to type `@#$%` into name field. Assert those characters are not entered (input mask) or save fails with validation error.
- **`test: save button shows loading spinner during submission`** — Change description. Click save. Assert button shows spinner. Assert inputs are disabled during save.
- **`test: form state is preserved on network error`** — Change description and name. Simulate network failure (or disconnect). Click save. Assert error toast. Assert form still shows the user-entered values (not reverted).
- **`test: double-clicking save does not send duplicate requests`** — Change description. Double-click save rapidly. Assert only one API call is made (or button is disabled after first click).

### General Settings — Boundary Tests

- **`test: org name with maximum valid length (255 chars) saves successfully`** — Create org with 255-char name. Navigate to settings. Assert name field shows full 255-char name. Change description. Save. Assert success.
- **`test: org name with 256 chars shows validation error`** — Attempt to enter 256 characters. Assert client-side prevention.
- **`test: description with 100000 characters saves successfully`** — Enter a 100,000-character description. Save. Assert success. Reload page. Assert full description is present.
- **`test: website with 2048 characters saves successfully`** — Enter a 2048-character URL. Save. Assert success.
- **`test: location with unicode characters saves correctly`** — Enter `東京都渋谷区` as location. Save. Assert success. Reload. Assert location matches exactly.
- **`test: description with special characters saves correctly`** — Enter `<script>alert('xss')</script> "quotes" & ampersands 🚀 
newlines`. Save. Assert success. Reload. Assert description matches verbatim.

### Members Section — Happy Path

- **`test: member list shows all org members with correct roles`** — Create org (owner). Add 2 members. Navigate to settings. Assert 3 rows in member table. Assert owner has "Owner" badge. Assert members have "Member" badge.
- **`test: member list shows total count in section header`** — Assert section header shows "Members (3)".
- **`test: add member dialog opens and works`** — Click "Add member". Assert dialog is visible. Enter user ID and select role. Click "Add". Assert success toast. Assert member appears in list.
- **`test: remove member shows confirmation and works`** — Click remove button on a member row. Assert confirmation dialog appears with the member's username. Click "Remove". Assert success toast. Assert member disappears from list.
- **`test: member list paginates correctly`** — Create org with 35 members. Navigate to settings. Assert first page shows 30 members. Click next page. Assert second page shows 5 members.
- **`test: remove button is not shown for last owner`** — Create org with single owner. Navigate to settings. Assert no remove button on the owner's row.

### Members Section — Error Cases

- **`test: adding duplicate member shows conflict error`** — Add a user who is already a member. Assert error toast "User is already a member of this organization".
- **`test: adding nonexistent user shows not found error`** — Enter an invalid user ID. Click add. Assert error toast "User not found".
- **`test: removing last owner shows conflict error`** — Attempt to remove the last remaining owner (via API manipulation if UI prevents it). Assert error containing "cannot remove the last organization owner".
- **`test: adding member with invalid user_id shows validation error`** — Enter 0 or negative number as user ID. Click add. Assert validation error.

### Teams Section — Happy Path

- **`test: team list shows all org teams`** — Create org. Create 3 teams with different permissions. Navigate to settings. Assert 3 rows in team table with correct names and permission badges.
- **`test: team list shows total count in section header`** — Assert header shows "Teams (3)".
- **`test: empty team list shows empty state message`** — Create org with no teams. Navigate to settings. Assert empty state message "No teams yet" is visible.
- **`test: create team dialog opens and works`** — Click "Create team". Fill in name, description, permission. Click "Create". Assert success toast. Assert team appears in list.
- **`test: team name links to team detail page`** — Click team name in list. Assert navigation to `/:org/settings/teams/:team`.
- **`test: edit team updates team details`** — Click edit action on a team. Change description. Save. Assert success. Assert updated description in list.
- **`test: delete team requires name confirmation`** — Click delete action on a team. Assert confirmation dialog requires typing team name. Type wrong name. Assert delete button is disabled. Type correct name. Click delete. Assert success toast. Assert team removed from list.

### Teams Section — Error Cases

- **`test: creating team with duplicate name shows conflict error`** — Create a team "engineering". Try to create another team "engineering". Assert error containing "already exists".
- **`test: creating team with empty name shows validation error`** — Open create dialog. Leave name empty. Click create. Assert validation error.

### Danger Zone — Happy Path

- **`test: danger zone section is visually distinct`** — Navigate to settings. Assert danger zone section has red/destructive styling.
- **`test: delete organization requires name confirmation`** — Click "Delete this organization". Assert confirmation dialog. Type wrong name. Assert delete button disabled. Type correct name (exact case). Assert delete button enabled.
- **`test: successful org deletion redirects to home`** — Type correct org name in confirmation. Click delete. Assert redirect to home page. Assert toast "Organization deleted".

### Danger Zone — Error Cases

- **`test: typing wrong case in delete confirmation keeps button disabled`** — Org name is "AcmeCorp". Type "acmecorp" in confirmation. Assert delete button remains disabled.
- **`test: cancelling delete confirmation closes dialog without action`** — Click "Delete this organization". Click "Cancel" in dialog. Assert dialog closes. Assert still on settings page.

### Responsive & Accessibility

- **`test: settings page renders correctly at 320px viewport width`** — Set viewport to 320px. Navigate to settings. Assert all sections are visible. Assert no horizontal overflow.
- **`test: settings page renders correctly at 1920px viewport width`** — Set viewport to 1920px. Navigate to settings. Assert sidebar and content columns are visible.
- **`test: all form fields are keyboard navigable`** — Tab through all fields in General Settings. Assert each field receives focus in order.
- **`test: save button is reachable via keyboard`** — Tab to save button. Press Enter. Assert form submits (if dirty).

### Loading States

- **`test: page shows skeleton loaders while data is loading`** — Navigate to settings with slow network simulation. Assert skeleton placeholders are visible for all data-dependent sections.
- **`test: sections load independently`** — Simulate slow member list API. Assert general settings section renders fully while member list still shows skeleton.

## API Integration Tests

### Org Update (PATCH /api/orgs/:org)

- **`test: authenticated owner can update org name`** — Create org. PATCH with `{ name: "new-name" }`. Assert 200. Assert response `name === "new-name"`.
- **`test: authenticated owner can update org description`** — PATCH with `{ description: "updated" }`. Assert 200. Assert response `description === "updated"`.
- **`test: authenticated owner can update org visibility`** — PATCH with `{ visibility: "private" }`. Assert 200. Assert response `visibility === "private"`.
- **`test: authenticated owner can update org website`** — PATCH with `{ website: "https://new.example.com" }`. Assert 200.
- **`test: authenticated owner can update org location`** — PATCH with `{ location: "NYC" }`. Assert 200.
- **`test: partial update preserves unchanged fields`** — Create org with description "original". PATCH with `{ website: "https://x.com" }`. Assert description is still "original".
- **`test: unauthenticated request returns 401`** — PATCH without auth. Assert 401.
- **`test: member (not owner) returns 403`** — Authenticate as member. PATCH. Assert 403.
- **`test: name exceeding 255 chars returns 422`** — PATCH with 256-char name. Assert 422.
- **`test: name at exactly 255 chars succeeds`** — PATCH with 255-char name. Assert 200.
- **`test: duplicate name returns 409`** — Create two orgs. PATCH first to have second's name. Assert 409.
- **`test: invalid visibility returns 422`** — PATCH with `{ visibility: "super-secret" }`. Assert 422.
- **`test: empty body preserves all fields and advances updated_at`** — Note current updated_at. PATCH with `{}`. Assert all fields unchanged except updated_at which advanced.
- **`test: concurrent PATCH requests do not corrupt data`** — Send 10 concurrent PATCH requests with different descriptions. Assert all return 200. Assert final state is one of the submitted descriptions.

### Member Management

- **`test: owner can list members`** — GET /api/orgs/:org/members. Assert 200. Assert array with at least 1 member.
- **`test: member can list members`** — Authenticate as member. GET. Assert 200.
- **`test: non-member cannot list members`** — Authenticate as non-member. GET. Assert 403.
- **`test: owner can add member`** — POST with user_id and role. Assert 201.
- **`test: owner can remove member`** — DELETE /api/orgs/:org/members/:username. Assert 204.
- **`test: cannot remove last owner`** — Attempt to remove the only owner. Assert 409.
- **`test: removing member cascades team memberships`** — Add user to org and to a team. Remove from org. List team members. Assert user is gone.

### Team Management

- **`test: owner can list teams`** — GET /api/orgs/:org/teams. Assert 200.
- **`test: owner can create team`** — POST with name, description, permission. Assert 201.
- **`test: owner can update team`** — PATCH /api/orgs/:org/teams/:team. Assert 200.
- **`test: owner can delete team`** — DELETE /api/orgs/:org/teams/:team. Assert 204.
- **`test: team member CRUD works`** — PUT to add, GET to list, DELETE to remove team members. Assert correct responses.
- **`test: team repo CRUD works`** — PUT to add, GET to list, DELETE to remove team repos. Assert correct responses.

### Org Delete

- **`test: owner can delete org`** — DELETE /api/orgs/:org. Assert 204.
- **`test: member cannot delete org`** — Authenticate as member. DELETE. Assert 403.
- **`test: unauthenticated cannot delete org`** — DELETE without auth. Assert 401.
- **`test: double delete returns 404`** — Delete org. Delete again. Assert 404.
- **`test: deleted org name is reusable`** — Delete org. Create new org with same name. Assert 201.

## CLI E2E Tests

- **`test: codeplane org edit updates org settings`** — Run `codeplane org edit <name> --description "CLI updated"`. Parse JSON output. Assert description matches.
- **`test: codeplane org edit with --new-name renames org`** — Run `codeplane org edit <name> --new-name new-name`. Assert success. Assert `codeplane org view new-name` works.
- **`test: codeplane org edit with --visibility changes visibility`** — Run `codeplane org edit <name> --visibility private`. Assert visibility is private.
- **`test: codeplane org member list returns members`** — Run `codeplane org member list <org>`. Parse JSON. Assert array with at least 1 member.
- **`test: codeplane org member add adds member`** — Run `codeplane org member add <org> <username>`. Assert success.
- **`test: codeplane org member remove removes member`** — Run `codeplane org member remove <org> <username>`. Assert success.
- **`test: codeplane org team list returns teams`** — Run `codeplane org team list <org>`. Parse JSON. Assert array.
- **`test: codeplane org team create creates team`** — Run `codeplane org team create <org> eng --description "Engineering" --permission write`. Parse JSON. Assert team created.
- **`test: codeplane org team delete deletes team`** — Run `codeplane org team delete <org> eng`. Assert success.
- **`test: codeplane org delete with --confirm deletes org`** — Run `codeplane org delete <name> --confirm <name>`. Assert success. Assert `codeplane org view <name>` returns error.
- **`test: codeplane org delete without --confirm fails`** — Run `codeplane org delete <name>`. Assert non-zero exit code with error about confirmation.
- **`test: CLI output matches API response shape for org edit`** — Run CLI and API for the same update. Assert JSON shapes match.
- **`test: CLI exits non-zero on permission error`** — Authenticate as member. Run `codeplane org edit <name> --description x`. Assert non-zero exit code.
