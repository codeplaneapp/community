# TUI_ORG_SETTINGS_VIEW

Specification for TUI_ORG_SETTINGS_VIEW.

## High-Level User POV

The organization settings view is the terminal-native administration screen for Codeplane organizations. It is accessible only to organization owners. From the organization overview screen, the owner presses `s` to push the settings view onto the navigation stack, and the breadcrumb updates to "Dashboard > org-name > Settings".

The settings view is structured as a vertically scrollable screen with four clearly separated sections: General Settings, Members, Teams, and Danger Zone. The user navigates between sections using `Tab` and `Shift+Tab`, which cycles focus through the four section panels. Within each section, `j`/`k` and arrow keys move between focusable fields, list rows, or action buttons. The currently active section is indicated by a highlighted section header with the `primary` accent color.

**General Settings** presents a form with five fields: Name, Description, Visibility, Website, and Location. Each field is pre-populated with the organization's current values. The user tabs between fields with `Tab`/`Shift+Tab` within the form. The Name field shows a live character counter (e.g., "23/255") and a warning line about URL changes. The Visibility field is a `<select>` cycling between "public", "limited", and "private". Changing visibility to a more restrictive level triggers a confirmation modal before the change is applied. The form includes a Save action activated with `Ctrl+S` from any field, or by focusing the Save button and pressing `Enter`. The Save button is only enabled when at least one field differs from the loaded state. On successful save, a status line flash reads "✓ Organization updated" and the form resets its dirty tracking. On error, the error message appears inline below the form in `error` color.

**Members** shows a list of organization members, each row displaying username, display name (if set), and a role badge ("Owner" in `primary` color, "Member" in `muted` color). The section header shows "Members (N)" with the total count. The user moves between member rows with `j`/`k`. Pressing `a` opens an "Add member" modal with a user ID input and a role select. Pressing `d` or `x` on a focused member row opens a "Remove member" confirmation modal. If the focused member is the last owner, the remove action is blocked with an inline message "Cannot remove the last owner". The member list supports cursor-based pagination — scrolling past 80% of loaded items fetches the next page.

**Teams** shows a list of organization teams, each row displaying team name, description (truncated), and a permission badge ("Read" in `success` color, "Write" in `primary` color, "Admin" in `warning` color). Pressing `c` opens a "Create team" modal with name, description, and permission fields. Pressing `Enter` on a focused team navigates to the team detail screen (pushed onto the stack). Pressing `e` on a focused team opens an inline edit modal. Pressing `d` or `x` opens a deletion confirmation modal that requires typing the team name to confirm. The section header shows "Teams (N)".

**Danger Zone** is the final section, rendered with a red `error`-color border. It contains a single action: "Delete this organization". The description explains the irreversible nature of the operation. Pressing `Enter` on the delete action opens a confirmation modal requiring the user to type the exact organization name (case-sensitive). The modal's confirm action is only enabled when the typed text matches exactly. On successful deletion, the TUI navigates to the dashboard with a status flash "Organization deleted".

All modals are rendered as centered overlays using `<box position="absolute">`, dismiss with `Esc`, and trap keyboard focus. The screen uses `<scrollbox>` for the overall content area so that all four sections remain accessible in small terminals. On terminals below 120 columns, the member and team list descriptions are hidden to save horizontal space. On terminals at 80×24 minimum, only the essential columns (name/username and badge) are shown.

If the authenticated user is not an owner of the organization, the settings screen is not accessible — the `s` keybinding is suppressed on the org overview, and direct deep-link navigation to the settings screen shows an inline "Access denied. Organization owner role required." message and auto-pops after 3 seconds.

## Acceptance Criteria

### Definition of Done

- The organization settings screen is accessible by pressing `s` on the organization overview screen, only for organization owners
- The screen pushes onto the navigation stack with breadcrumb "Dashboard > {org_name} > Settings"
- The screen contains four sections: General Settings, Members, Teams, and Danger Zone
- Each section loads its data independently — a failure in one section does not block others
- All form submissions use the existing API endpoints via `@codeplane/ui-core` hooks
- Non-owner users cannot access the settings screen; `s` keybinding is suppressed, deep-link shows access-denied
- All modals are dismissable with `Esc`
- All interactions are achievable with keyboard only — no mouse required
- The screen renders correctly at all supported terminal sizes (80×24 through 200×60+)

### Functional Constraints — General Settings

- The General Settings form displays five fields: Name, Description, Visibility, Website, and Location
- All fields are pre-populated from `GET /api/orgs/:org` via `useOrg()` hook
- The Name field shows a live character counter formatted as "N/255" in `muted` color
- The Name field shows a warning line: "Renaming will change the organization's URL" in `warning` color
- The Name field rejects characters outside `[a-zA-Z0-9_-]` at input time (character filtering)
- The Visibility field is a `<select>` with exactly three options: public, limited, private
- Changing visibility from public to limited or private opens a confirmation modal before save
- The Save action (`Ctrl+S` or `Enter` on Save button) is only active when the form is dirty
- `PATCH /api/orgs/:org` is called with only changed fields
- On success (200): status flash "✓ Organization updated", form dirty state reset, fields reflect updated values
- On name conflict (409): inline error "An organization with that name already exists"
- On validation error (422): inline error below the offending field
- On permission error (403): inline error "You don't have permission to update this organization"
- On network error: inline error "Failed to update. Press R to retry." — form state preserved
- While saving: all form inputs are disabled, Save button shows braille spinner
- After org rename: screen context updates to new org name, breadcrumb refreshes

### Functional Constraints — Members

- The Members section displays a paginated list from `GET /api/orgs/:org/members` via `useOrgMembers()` hook
- Each row shows: username, display name (or empty), role badge ("Owner" / "Member")
- Section header shows "Members (N)" with total count
- `a` opens an "Add member" modal with user ID input and role select (owner/member)
- Adding a member calls `POST /api/orgs/:org/members` with `{ user_id, role }`
- On successful add (201): member list refreshes, status flash "Member added"
- On duplicate (409): modal inline error "User is already a member"
- On user not found (404): modal inline error "User not found"
- `d` or `x` on a focused member opens a removal confirmation modal
- Confirmation modal text: "Remove @{username} from {org_name}?"
- Removing a member calls `DELETE /api/orgs/:org/members/:username`
- On successful removal (204): member list refreshes, status flash "Member removed"
- Attempting to remove the last owner shows inline error "Cannot remove the last organization owner"
- The remove action is suppressed (keybinding inactive) on the last owner row
- Pagination loads next page when scrollbox reaches 80% of content height
- "Loading more…" indicator shown at bottom during page fetch

### Functional Constraints — Teams

- The Teams section displays a paginated list from `GET /api/orgs/:org/teams` via `useOrgTeams()` hook
- Each row shows: team name, description (truncated), permission badge (Read/Write/Admin)
- Section header shows "Teams (N)" with total count
- Empty state: "No teams yet. Create one with `c`." in `muted` color
- `c` opens a "Create team" modal with: name input, description input, permission select (read/write/admin)
- Creating a team calls `POST /api/orgs/:org/teams` with `{ name, description, permission }`
- On successful creation (201): team list refreshes, status flash "Team created"
- On duplicate name (409): modal inline error "A team with that name already exists"
- `Enter` on a focused team pushes the team detail screen onto the navigation stack
- `e` on a focused team opens an edit modal to update name, description, and permission
- Editing calls `PATCH /api/orgs/:org/teams/:team`
- `d` or `x` on a focused team opens a deletion confirmation requiring the team name to be typed
- Deletion calls `DELETE /api/orgs/:org/teams/:team`
- The delete confirm button is disabled until typed name matches exactly (case-sensitive)

### Functional Constraints — Danger Zone

- The Danger Zone section is bordered in `error` color
- Contains "Delete this organization" action with an explanation of cascade behavior
- `Enter` on the delete action opens a confirmation modal
- The confirmation modal requires typing the exact organization name (case-sensitive)
- The confirm button is disabled until the typed name matches
- On successful deletion (204): TUI navigates to dashboard, status flash "Organization deleted"
- On permission error (403): inline error in modal
- `Esc` cancels the modal without any action

### Keyboard Interactions

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Any | Move focus to next section (General → Members → Teams → Danger Zone → General) |
| `Shift+Tab` | Any | Move focus to previous section |
| `j` / `Down` | Within list (Members/Teams) | Move focus to next row |
| `k` / `Up` | Within list (Members/Teams) | Move focus to previous row |
| `Tab` | Within General Settings form | Move to next form field |
| `Shift+Tab` | Within General Settings form | Move to previous form field |
| `Ctrl+S` | Within General Settings form | Save form (if dirty) |
| `Enter` | On Save button | Save form |
| `Enter` | On focused team row | Push team detail screen |
| `Enter` | On Danger Zone delete action | Open delete org confirmation modal |
| `a` | Members section focused | Open "Add member" modal |
| `d` / `x` | Members section, member row focused | Open "Remove member" confirmation |
| `c` | Teams section focused | Open "Create team" modal |
| `e` | Teams section, team row focused | Open "Edit team" modal |
| `d` / `x` | Teams section, team row focused | Open "Delete team" confirmation |
| `G` | Within list | Jump to last loaded row |
| `g g` | Within list | Jump to first row |
| `Ctrl+D` | Within list | Page down |
| `Ctrl+U` | Within list | Page up |
| `R` | Error state in any section | Retry failed fetch |
| `Esc` | Modal open | Close modal |
| `Esc` / `q` | No modal open | Pop settings screen (return to org overview) |
| `?` | Any | Toggle help overlay |
| `:` | Any | Open command palette |

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by app-shell router
- 80×24 – 119×39 (minimum): Members show username + role only. Teams show name + permission only. General Settings form fields use full width with stacked labels. Modals use 90% terminal width
- 120×40 – 199×59 (standard): Members show username (20ch) + display name (25ch) + role. Teams show name (20ch) + description (35ch) + permission. Inline form labels (14ch). Modals use 60% terminal width
- 200×60+ (large): Members show username (25ch) + display name (30ch) + role. Teams show name (25ch) + description (50ch) + permission. Expanded section spacing. Modals use 50% terminal width

### Truncation and Boundary Constraints

- Organization `name`: max 255 characters from API. Input enforces `[a-zA-Z0-9_-]` character set. Displayed in full in the form (scrollable input)
- Organization `description`: no enforced API max. Input supports up to 100,000 characters. Displayed as multi-line text input
- Organization `website`: displayed as single-line input. Max display: full width of form
- Organization `location`: displayed as single-line input. Max display: full width of form
- Member `username`: truncated with trailing `…` at column width boundary (20/25 chars at minimum/standard)
- Member `display_name`: truncated with trailing `…`. Hidden at minimum size
- Team `name`: truncated with trailing `…` at column width boundary (20/25 chars)
- Team `description`: truncated with trailing `…`. Hidden at minimum size. Max display: 35ch (standard), 50ch (large)
- Permission badge: exactly one of `read`, `write`, `admin` — never exceeds 5 characters
- Role badge: exactly one of `Owner`, `Member` — never exceeds 6 characters
- Visibility select options: exactly 3 options, never changes
- Section header counts: formatted as "(N)" — max 7 characters for counts up to 99,999
- Modal confirmation input: max 255 characters (matches org/team name max)
- Maximum loaded members in memory: 500 items (pagination cap)
- Maximum loaded teams in memory: 500 items (pagination cap)
- Filter inputs within modals: max 100 characters

### Edge Cases

- Terminal resize while modal is open: modal re-centers at new size, content preserved
- Terminal resize while form is dirty: form state preserved, layout recalculates
- Rapid `j` presses in member/team lists: processed sequentially, no debouncing
- Pressing `d` on the last owner in member list: action suppressed, inline hint shown
- Pressing `Ctrl+S` when form is not dirty: no-op, no error
- Pressing `Ctrl+S` while a save is in-flight: no-op (debounced)
- Org renamed while viewing settings: breadcrumb and context update after save completes
- Org deleted by another owner while viewing: next API call returns 404, screen shows error and auto-pops
- Member removed between page loads: stale count tolerated, absent from subsequent pages
- Team deleted by another owner while viewing: next interaction returns 404, list refreshes
- Network disconnect during modal submission: error shown inline in modal, form state preserved
- Unicode in name/description inputs: handled correctly, truncation respects grapheme clusters
- Empty description/website/location: fields show placeholder text, no empty gaps
- Opening settings for an org with 0 teams: Teams section shows empty state
- Opening settings for an org with 100+ members: member list paginates, first page renders immediately
- Typing confirmation name with trailing whitespace: trimmed before comparison
- SSE disconnect: settings screen unaffected (uses REST, not SSE)
- Auth token expiry mid-session: next API call returns 401, propagated to app-shell auth error screen

## Design

### Layout Structure

The organization settings screen uses a full-width scrollable layout with stacked sections:

```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > org-name > Settings         │
├─────────────────────────────────────────────────┤
│                                                 │
│ <scrollbox flexGrow={1}>                        │
│   ┌── General ─────────────────────────────┐    │
│   │ Name:        [acme-corp        ] 9/255 │    │
│   │ ⚠ Renaming will change the org's URL   │    │
│   │ Description: [Building the future...  ]│    │
│   │ Visibility:  [public ▼               ] │    │
│   │ Website:     [https://acme.example.com]│    │
│   │ Location:    [San Francisco, CA       ]│    │
│   │                          [Save] (dim)  │    │
│   └────────────────────────────────────────┘    │
│                                                 │
│   ┌── Members (12) ───────────────────────┐     │
│   │ @alice       │ Alice Chen  │ Owner    │     │
│   │ @bob         │ Bob Smith   │ Member   │     │
│   │ @carol       │ Carol Jones │ Member   │     │
│   │ …                                     │     │
│   │ [a] add  [d] remove                   │     │
│   └────────────────────────────────────────┘    │
│                                                 │
│   ┌── Teams (3) ──────────────────────────┐     │
│   │ engineering  │ Core engine… │ Write   │     │
│   │ design       │ Product des… │ Read    │     │
│   │ ops          │ Infra and d… │ Admin   │     │
│   │ [c] create  [e] edit  [d] delete       │    │
│   │ [Enter] view team detail               │    │
│   └────────────────────────────────────────┘    │
│                                                 │
│   ┌── Danger Zone ─────────────────────────┐    │
│   │ (red border)                           │    │
│   │ Delete this organization               │    │
│   │ Once you delete an organization,       │    │
│   │ there is no going back. This will      │    │
│   │ permanently delete all repos, teams,   │    │
│   │ memberships, secrets, and webhooks.    │    │
│   │                                        │    │
│   │              [Delete this organization]│    │
│   └────────────────────────────────────────┘    │
│                                                 │
│ </scrollbox>                                    │
│                                                 │
├─────────────────────────────────────────────────┤
│ Status: Tab sections │ Ctrl+S save │ ? help     │
└─────────────────────────────────────────────────┘
```

### Component Structure

```jsx
<box flexDirection="column" width="100%" height="100%">
  <scrollbox flexGrow={1}>
    <box flexDirection="column" gap={1} padding={1}>

      {/* Section 1: General Settings */}
      <box flexDirection="column" border="single"
           borderColor={activeSection === "general" ? "primary" : "border"}>
        <text bold color={activeSection === "general" ? "primary" : undefined}>
          General
        </text>
        <box flexDirection="column" gap={1} padding={1}>
          <box flexDirection="row">
            <text width={14}>Name:</text>
            <input value={name} onChange={setName} width="flex" />
            <text color="muted"> {name.length}/255</text>
          </box>
          <text color="warning" dimmed>⚠ Renaming will change the organization's URL</text>
          <box flexDirection="row">
            <text width={14}>Description:</text>
            <input value={description} onChange={setDescription} width="flex" />
          </box>
          <box flexDirection="row">
            <text width={14}>Visibility:</text>
            <select value={visibility} onChange={handleVisibilityChange}
                    options={["public", "limited", "private"]} />
          </box>
          <box flexDirection="row">
            <text width={14}>Website:</text>
            <input value={website} onChange={setWebsite} placeholder="https://example.com" />
          </box>
          <box flexDirection="row">
            <text width={14}>Location:</text>
            <input value={location} onChange={setLocation} placeholder="City, Country" />
          </box>
          {generalError && <text color="error">{generalError}</text>}
          <box flexDirection="row" justifyContent="flex-end">
            <text color={isDirty ? "primary" : "muted"}
                  bold={isDirty}>
              {saving ? "Saving…" : "[Save]"}
            </text>
          </box>
        </box>
      </box>

      {/* Section 2: Members */}
      <box flexDirection="column" border="single"
           borderColor={activeSection === "members" ? "primary" : "border"}>
        <box flexDirection="row">
          <text bold color={activeSection === "members" ? "primary" : undefined}>
            Members
          </text>
          <text color="muted"> ({memberCount})</text>
        </box>
        <scrollbox maxHeight={12}>
          <box flexDirection="column">
            {members.map(member => (
              <box key={member.user_id} flexDirection="row" height={1}
                   backgroundColor={member.user_id === focusedMemberId ? "primary" : undefined}>
                <box width={usernameWidth}>
                  <text>{truncate(member.username, usernameWidth)}</text>
                </box>
                {showDisplayName && (
                  <box width={displayNameWidth}>
                    <text color="muted">{truncate(member.display_name, displayNameWidth)}</text>
                  </box>
                )}
                <box width={8}>
                  <text color={member.role === "owner" ? "primary" : "muted"}>
                    {member.role === "owner" ? "Owner" : "Member"}
                  </text>
                </box>
              </box>
            ))}
            {loadingMoreMembers && <text color="muted">Loading more…</text>}
          </box>
        </scrollbox>
        {memberError && <text color="error">{memberError} Press R to retry.</text>}
      </box>

      {/* Section 3: Teams */}
      <box flexDirection="column" border="single"
           borderColor={activeSection === "teams" ? "primary" : "border"}>
        <box flexDirection="row">
          <text bold color={activeSection === "teams" ? "primary" : undefined}>
            Teams
          </text>
          <text color="muted"> ({teamCount})</text>
        </box>
        {teams.length === 0 && !loadingTeams ? (
          <text color="muted">No teams yet. Create one with `c`.</text>
        ) : (
          <scrollbox maxHeight={12}>
            <box flexDirection="column">
              {teams.map(team => (
                <box key={team.id} flexDirection="row" height={1}
                     backgroundColor={team.id === focusedTeamId ? "primary" : undefined}>
                  <box width={teamNameWidth}>
                    <text>{truncate(team.name, teamNameWidth)}</text>
                  </box>
                  {showTeamDescription && (
                    <box width={teamDescWidth}>
                      <text color="muted">{truncate(team.description, teamDescWidth)}</text>
                    </box>
                  )}
                  <box width={7}>
                    <text color={permissionColor(team.permission)}>
                      {capitalize(team.permission)}
                    </text>
                  </box>
                </box>
              ))}
              {loadingMoreTeams && <text color="muted">Loading more…</text>}
            </box>
          </scrollbox>
        )}
        {teamError && <text color="error">{teamError} Press R to retry.</text>}
      </box>

      {/* Section 4: Danger Zone */}
      <box flexDirection="column" border="single" borderColor="error">
        <text bold color="error">Danger Zone</text>
        <box flexDirection="column" padding={1} gap={1}>
          <text>Delete this organization</text>
          <text color="muted">
            Once you delete an organization, there is no going back.
            This will permanently delete all repositories, teams,
            memberships, secrets, variables, and webhooks.
          </text>
          <box flexDirection="row" justifyContent="flex-end">
            <text color="error" bold
                  backgroundColor={focusedAction === "delete" ? "error" : undefined}>
              [Delete this organization]
            </text>
          </box>
        </box>
      </box>

    </box>
  </scrollbox>
</box>
```

### Modal Overlays

**Visibility Change Confirmation Modal**: Centered modal with `warning` border. Shows "Changing visibility to {level} will immediately restrict access" message with Cancel and Continue buttons.

**Add Member Modal**: Centered modal with standard border. Contains User ID `<input>`, Role `<select>` (member/owner), inline error area, and Cancel/Add buttons.

**Remove Member Confirmation Modal**: Centered modal. Shows "Remove @{username} from {orgName}?" with explanation and Cancel/Remove buttons.

**Create Team Modal**: Centered modal. Contains Name `<input>`, Description `<input>`, Permission `<select>` (read/write/admin), and Cancel/Create buttons.

**Edit Team Modal**: Same layout as create, pre-populated with existing team data.

**Delete Team Confirmation Modal**: Red-bordered modal. Shows deletion warning, requires typing exact team name in `<input>`. Delete button disabled until match.

**Delete Organization Confirmation Modal**: Red-bordered modal. Shows irreversibility warning, requires typing exact org name in `<input>`. Delete button disabled until match.

All modals: `position="absolute"`, `top="center"`, `left="center"`. Width varies by breakpoint (90%/60%/50%). Focus-trapping enabled, `Esc` dismisses.

### Loading States

- **Initial screen load**: Each section independently shows a braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms intervals) with "Loading…" in `muted` color
- **Form saving**: Save button text changes to "Saving…" with spinner. All form inputs disabled
- **Pagination**: "Loading more…" at bottom of member/team list during fetch
- **Modal submission**: Modal action button shows "Adding…" / "Removing…" / "Creating…" / "Deleting…" with spinner

### Error States

- **Section data fetch error**: Error message in `error` color with "Press R to retry" in `muted` color
- **Form save error**: Inline error text below the form in `error` color. Form state preserved
- **Modal action error**: Error text within the modal in `error` color. Modal remains open
- **Auth error (401)**: Propagated to app-shell auth error screen
- **Access denied**: Full-screen message "Access denied. Organization owner role required." with auto-pop after 3 seconds

### Permission Badge Colors

| Badge | Color Token | ANSI |
|-------|-------------|------|
| `Owner` | `primary` | Blue (33) |
| `Member` | `muted` | Gray (245) |
| `Read` | `success` | Green (34) |
| `Write` | `primary` | Blue (33) |
| `Admin` | `warning` | Yellow (178) |

### Visibility Option Colors

| Option | Color Token | ANSI |
|--------|-------------|------|
| `public` | `success` | Green (34) |
| `limited` | `warning` | Yellow (178) |
| `private` | `error` | Red (196) |

### Responsive Column Layout

**80×24 (minimum)**:
- General Settings: form fields use full content width, labels above inputs (stacked)
- Members: `│ @username (30ch) │ Owner │` — 2 columns
- Teams: `│ teamname (30ch) │ Write │` — 2 columns
- Modals: 90% terminal width

**120×40 (standard)**:
- General Settings: labels inline with inputs (14ch label + flex input)
- Members: `│ @username (20ch) │ Display Name (25ch) │ Owner │` — 3 columns
- Teams: `│ teamname (20ch) │ description (35ch) │ Write │` — 3 columns
- Modals: 60% terminal width

**200×60 (large)**:
- General Settings: wider form fields with more padding
- Members: `│ @username (25ch) │ Display Name (30ch) │ Owner │` — 3 columns with wider fields
- Teams: `│ teamname (25ch) │ description (50ch) │ Write │` — 3 columns with wider fields
- Modals: 50% terminal width

### Data Hooks

- `useOrg(orgName)` from `@codeplane/ui-core` — returns `{ org, isLoading, error, refetch }`. Calls `GET /api/orgs/:org`
- `useUpdateOrg(orgName)` from `@codeplane/ui-core` — returns `{ updateOrg, isSubmitting, error }`. Calls `PATCH /api/orgs/:org`
- `useOrgMembers(orgName)` from `@codeplane/ui-core` — returns `{ items, totalCount, isLoading, error, loadMore, hasMore, retry }`. Calls `GET /api/orgs/:org/members`, page size 30
- `useAddOrgMember(orgName)` — returns `{ addMember, isSubmitting, error }`. Calls `POST /api/orgs/:org/members`
- `useRemoveOrgMember(orgName)` — returns `{ removeMember, isSubmitting, error }`. Calls `DELETE /api/orgs/:org/members/:username`
- `useOrgTeams(orgName)` — returns `{ items, totalCount, isLoading, error, loadMore, hasMore, retry }`. Calls `GET /api/orgs/:org/teams`, page size 30
- `useCreateTeam(orgName)` — returns `{ createTeam, isSubmitting, error }`. Calls `POST /api/orgs/:org/teams`
- `useUpdateTeam(orgName, teamName)` — returns `{ updateTeam, isSubmitting, error }`. Calls `PATCH /api/orgs/:org/teams/:team`
- `useDeleteTeam(orgName, teamName)` — returns `{ deleteTeam, isSubmitting, error }`. Calls `DELETE /api/orgs/:org/teams/:team`
- `useDeleteOrg(orgName)` — returns `{ deleteOrg, isSubmitting, error }`. Calls `DELETE /api/orgs/:org`
- `useTerminalDimensions()` — for responsive layout breakpoints
- `useOnResize()` — trigger synchronous re-layout on terminal resize
- `useKeyboard()` — keybinding registration for section navigation, list navigation, and action keys

### Navigation Context

- Pushed via `push("org-settings", { org: orgName })` from org overview screen
- Breadcrumb: "Dashboard > {org_name} > Settings"
- After org rename: `replace("org-settings", { org: newOrgName })` to update breadcrumb
- After org delete: `popToRoot()` to return to dashboard
- Team detail: `push("org-team-detail", { org: orgName, team: teamName })`

### Type Definitions

```typescript
type Organization = {
  id: number;
  name: string;
  lower_name: string;
  description: string;
  visibility: "public" | "limited" | "private";
  website: string;
  location: string;
  created_at: string;
  updated_at: string;
};

type UpdateOrgRequest = {
  name?: string;
  description?: string;
  visibility?: "public" | "limited" | "private";
  website?: string;
  location?: string;
};

type OrgMember = {
  user_id: number;
  username: string;
  display_name: string;
  role: "owner" | "member";
};

type Team = {
  id: number;
  name: string;
  description: string;
  permission: "read" | "write" | "admin";
  created_at: string;
  updated_at: string;
};

type CreateTeamRequest = {
  name: string;
  description: string;
  permission: "read" | "write" | "admin";
};

type UpdateTeamRequest = {
  name?: string;
  description?: string;
  permission?: "read" | "write" | "admin";
};
```

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (non-member) | Org Member | Org Owner | Platform Admin |
|--------|-----------|---------------------------|------------|-----------|----------------|
| View settings screen | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit general settings | ❌ | ❌ | ❌ | ✅ | ✅ |
| View member list | ❌ | ❌ | ❌ | ✅ | ✅ |
| Add/remove members | ❌ | ❌ | ❌ | ✅ | ✅ |
| View team list | ❌ | ❌ | ❌ | ✅ | ✅ |
| Create/edit/delete teams | ❌ | ❌ | ❌ | ✅ | ✅ |
| Delete organization | ❌ | ❌ | ❌ | ✅ | ✅ |

### Security Rules

1. **Owner-only access**: The `s` keybinding on org overview is only registered when the viewer's org role is `owner`. The screen checks role at mount and shows access-denied if the user is not an owner
2. **Server-side enforcement**: All mutations are enforced server-side. Client-side role checks are for UX only — they do not replace server authorization
3. **Information leakage prevention**: Non-owner access shows a generic "Access denied" message without revealing organization details. The settings screen never renders organization data until the role check passes
4. **Last owner protection**: The API enforces that the last owner cannot be removed. The TUI reflects this by suppressing the `d`/`x` keybinding on the last owner row and showing an explanatory hint
5. **Name change URL sensitivity**: After rename, the navigation context updates to use the new org name. Stale references to the old name will fail on subsequent API calls
6. **Visibility downgrade sensitivity**: Changing from public to limited/private triggers a confirmation modal. The change is not submitted until the user explicitly confirms
7. **Destructive action safety**: Org deletion and team deletion require typing the exact name to confirm. The confirm button is disabled until the name matches

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at TUI bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token in all requests
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- The TUI does not implement its own OAuth browser flow — authentication is delegated to the CLI

### Rate Limiting

| Context | Rate Limit | Window | Notes |
|---------|-----------|--------|-------|
| Authenticated read requests (GET) | 5,000 requests | per hour | Org details, member list, team list |
| Authenticated mutation requests (PATCH, POST, DELETE) | 30 requests | per minute | Org update, member add/remove, team CRUD, org delete |
| Per-IP burst (mutations) | 10 requests | per minute | Prevents rapid destructive operations |

- If 429 is returned, the affected section or modal displays "Rate limited. Retry in {Retry-After}s." inline in `warning` color
- No auto-retry on rate limit. User waits and retries manually with `R` (sections) or re-submits (modals)
- Rate limit headers (`X-RateLimit-Remaining`) are not displayed in the TUI — only the 429 error state

### Input Sanitization

- All form inputs are rendered as plain text via `<input>` and `<select>` components (no injection risk)
- Organization names are filtered at input time to reject characters outside `[a-zA-Z0-9_-]`
- All text values are trimmed of leading/trailing whitespace before API submission
- Confirmation inputs (delete org, delete team) are compared after trimming
- Modal inputs are local state only — never sent to the API until explicit submission

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.org.settings.view` | Settings screen mounted and initial data loaded | `org_name`, `viewer_role`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `member_count`, `team_count` |
| `tui.org.settings.general.save` | General settings successfully saved (200) | `org_name`, `fields_changed` (array), `name_changed` (boolean), `visibility_changed` (boolean), `visibility_from`, `visibility_to`, `save_time_ms` |
| `tui.org.settings.general.save_failed` | General settings save failed (4xx/5xx) | `org_name`, `status_code`, `error_type` (conflict/validation/permission/network), `fields_attempted` |
| `tui.org.settings.visibility.confirm_shown` | Visibility change confirmation modal displayed | `org_name`, `visibility_from`, `visibility_to` |
| `tui.org.settings.visibility.confirmed` | User confirmed visibility change | `org_name`, `visibility_from`, `visibility_to` |
| `tui.org.settings.visibility.cancelled` | User cancelled visibility change | `org_name`, `visibility_from`, `visibility_to` |
| `tui.org.settings.member.add` | Member successfully added (201) | `org_name`, `added_role`, `total_members_after` |
| `tui.org.settings.member.add_failed` | Member add failed | `org_name`, `status_code`, `error_type` |
| `tui.org.settings.member.remove` | Member successfully removed (204) | `org_name`, `removed_role`, `total_members_after` |
| `tui.org.settings.member.remove_failed` | Member removal failed | `org_name`, `status_code`, `error_type` |
| `tui.org.settings.team.create` | Team successfully created (201) | `org_name`, `team_permission`, `total_teams_after` |
| `tui.org.settings.team.edit` | Team successfully updated (200) | `org_name`, `team_name`, `fields_changed` |
| `tui.org.settings.team.delete` | Team successfully deleted (204) | `org_name`, `team_name`, `total_teams_after` |
| `tui.org.settings.team.view_detail` | User pressed Enter to view team detail | `org_name`, `team_name`, `team_permission` |
| `tui.org.settings.org.delete_initiated` | User focused delete org action and pressed Enter | `org_name` |
| `tui.org.settings.org.delete_confirmed` | Organization successfully deleted (204) | `org_name`, `member_count`, `team_count` |
| `tui.org.settings.org.delete_cancelled` | User cancelled delete confirmation | `org_name` |
| `tui.org.settings.access_denied` | Non-owner attempted to access settings screen | `org_name`, `viewer_role` |
| `tui.org.settings.section_navigate` | User navigated between sections via Tab | `org_name`, `from_section`, `to_section` |
| `tui.org.settings.error` | Any section fetch error | `org_name`, `section` (general/members/teams), `error_type`, `http_status` |
| `tui.org.settings.retry` | User pressed R to retry after error | `org_name`, `section`, `retry_success` |

### Success Indicators

- **Settings screen reach rate**: Percentage of org owners who visit the TUI settings screen at least once per month. Target: >15% of active TUI org owners
- **Settings save conversion**: Percentage of settings screen views that result in at least one successful save. Target: >20%
- **Member management activity**: Average member add/remove operations per organization per month via TUI
- **Team adoption via TUI**: Percentage of team creation events originating from the TUI client. Target: >5% of all team creates
- **Section navigation depth**: Average number of sections visited per settings session. Target: >1.5 (users explore beyond General)
- **Error rate**: Percentage of settings screen loads that result in error state. Target: <2%
- **Deletion safety**: Delete confirmation dialog cancellation rate. Target: >30% (safety guard is working)
- **Time to first save**: Time from settings screen mount to first successful save. Lower is better
- **Client distribution**: Breakdown of org settings actions across web, CLI, and TUI

## Observability

### Logging

| Log Level | Event | Structured Context |
|-----------|-------|--------------------||
| `info` | Settings screen loaded | `org_name`, `viewer_role`, `member_count`, `team_count`, `load_time_ms` |
| `info` | General settings saved | `org_name`, `fields_changed`, `name_changed`, `visibility_changed`, `save_time_ms` |
| `info` | Member added | `org_name`, `added_user_id`, `role` |
| `info` | Member removed | `org_name`, `removed_username` |
| `info` | Team created | `org_name`, `team_name`, `permission` |
| `info` | Team updated | `org_name`, `team_name`, `fields_changed` |
| `info` | Team deleted | `org_name`, `team_name` |
| `warn` | Organization renamed | `org_name`, `old_name`, `new_name` |
| `warn` | Organization visibility changed | `org_name`, `old_visibility`, `new_visibility` |
| `warn` | Organization deleted | `org_name`, `member_count`, `team_count` |
| `warn` | Last owner removal blocked | `org_name`, `attempted_username` |
| `warn` | API error on settings data fetch | `org_name`, `section`, `http_status`, `error_message` |
| `warn` | Rate limited | `org_name`, `section`, `retry_after_seconds` |
| `info` | Access denied to settings screen | `org_name`, `viewer_role` |
| `debug` | Section focus changed | `org_name`, `from_section`, `to_section` |
| `debug` | Form field changed | `org_name`, `field_name` |
| `debug` | Modal opened | `org_name`, `modal_type` |
| `debug` | Modal dismissed | `org_name`, `modal_type`, `reason` (esc/cancel/submit) |
| `debug` | Member list pagination triggered | `org_name`, `page_number`, `total_loaded` |
| `debug` | Team list pagination triggered | `org_name`, `page_number`, `total_loaded` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial org fetch | Data hook timeout (30s) | Section shows error + "Press R to retry" |
| Network timeout on member/team list | Data hook timeout (30s) | Section shows error, other sections unaffected |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline warning: "Rate limited. Retry in Ns." |
| Permission denied (403) | API returns 403 | Inline error. For screen access: auto-pop after 3s |
| Name conflict on save (409) | API returns 409 | Inline error on name field: "already exists" |
| Validation error (422) | API returns 422 | Inline error below offending field |
| Server error (500) | API returns 5xx | Inline error with generic message. R retries |
| Org deleted by another owner | Next API call returns 404 | Error message + auto-pop to dashboard |
| Member removed by another owner | Remove call returns 404 | Status flash "Member not found", list refreshes |
| Team deleted by another owner | Edit/delete call returns 404 | Status flash "Team not found", list refreshes |
| Terminal resize during modal | `useOnResize` fires | Modal re-centers, content preserved |
| Terminal resize during form edit | `useOnResize` fires | Layout recalculates, form state preserved |
| Terminal resize during save | `useOnResize` fires | Save continues, re-renders at new size on completion |
| SSE disconnect | Status bar indicator | Settings screen unaffected (uses REST, not SSE) |
| React error boundary triggered | Error boundary catches | Error screen per app-shell error boundary with restart/quit |
| Malformed API response | JSON parse error | Section error state with generic message |
| Concurrent saves from web + TUI | Last write wins at API level | TUI may show stale data until next fetch |

### Failure Modes

- **Total section fetch failure**: Affected section shows error state. Other sections continue to render independently
- **Partial pagination failure**: Existing loaded items remain visible. "Loading more…" replaced with inline error
- **Modal submission failure**: Modal stays open with inline error. User can correct and resubmit or dismiss with Esc
- **Org rename failure**: Form state preserved with error. Old name remains in breadcrumb/context
- **Org delete failure**: Modal stays open with error. Organization remains intact
- **Memory pressure**: 500-item pagination cap on members and teams prevents unbounded growth

## Verification

### Test File: `e2e/tui/organizations.test.ts`

### Terminal Snapshot Tests (18 tests)

- **org-settings-initial-load**: Launch TUI → navigate to org overview → press `s` → snapshot shows settings screen with General, Members, Teams, and Danger Zone sections. Breadcrumb shows "Dashboard > org-name > Settings"
- **org-settings-general-form-populated**: Navigate to settings → snapshot shows General Settings form with pre-populated name, description, visibility, website, and location fields matching the org's current values
- **org-settings-name-character-counter**: Navigate to settings → snapshot shows character counter "N/255" next to name field in muted color
- **org-settings-name-rename-warning**: Navigate to settings → snapshot shows "⚠ Renaming will change the organization's URL" warning in yellow
- **org-settings-members-list**: Navigate to settings → snapshot shows Members section with header "Members (N)", member rows with username, display name, and role badges
- **org-settings-members-role-badges**: Navigate to settings with owner and member roles → snapshot shows "Owner" badge in blue, "Member" badge in gray
- **org-settings-teams-list**: Navigate to settings with 3 teams → snapshot shows Teams section with header "Teams (3)", team rows with name, description, and permission badges
- **org-settings-teams-empty-state**: Navigate to settings for org with no teams → snapshot shows "No teams yet. Create one with `c`." in muted color
- **org-settings-teams-permission-badges**: Navigate to settings with teams of varying permissions → snapshot shows "Read" in green, "Write" in blue, "Admin" in yellow
- **org-settings-danger-zone-styling**: Navigate to settings → snapshot shows Danger Zone section with red border and "Delete this organization" text
- **org-settings-loading-state**: Navigate to settings with slow API → snapshot shows braille spinner with "Loading…" in each section independently
- **org-settings-error-state**: Navigate to settings with failing API → snapshot shows error message in red with "Press R to retry"
- **org-settings-add-member-modal**: Navigate to settings → Tab to Members → press `a` → snapshot shows "Add Organization Member" modal with user ID input, role select, Cancel and Add buttons
- **org-settings-remove-member-modal**: Navigate to settings → Tab to Members → focus a member → press `d` → snapshot shows "Remove member" confirmation modal with username and org name
- **org-settings-create-team-modal**: Navigate to settings → Tab to Teams → press `c` → snapshot shows "Create Team" modal with name, description, permission fields
- **org-settings-delete-team-modal**: Navigate to settings → Tab to Teams → focus a team → press `d` → snapshot shows "Delete team" modal with name confirmation input
- **org-settings-delete-org-modal**: Navigate to settings → Tab to Danger Zone → press Enter → snapshot shows "Delete organization" modal with red border and name confirmation input
- **org-settings-access-denied**: Navigate to settings as non-owner → snapshot shows "Access denied. Organization owner role required." message

### Keyboard Interaction Tests (35 tests)

- **org-settings-s-opens-from-overview**: On org overview as owner, press `s` → settings screen pushed onto stack, breadcrumb updated
- **org-settings-s-suppressed-for-member**: On org overview as non-owner member, press `s` → no-op, no navigation
- **org-settings-tab-cycles-sections**: On settings, press `Tab` → focus moves General → Members → Teams → Danger Zone → General
- **org-settings-shift-tab-reverse-cycles**: On settings Members section, press `Shift+Tab` → focus moves to General
- **org-settings-j-moves-down-in-members**: Tab to Members, press `j` → focus moves from first to second member row
- **org-settings-k-moves-up-in-members**: Tab to Members, press `j` then `k` → focus returns to first member row
- **org-settings-j-moves-down-in-teams**: Tab to Teams, press `j` → focus moves from first to second team row
- **org-settings-k-moves-up-in-teams**: Tab to Teams, press `j` then `k` → focus returns to first team row
- **org-settings-enter-on-team-opens-detail**: Tab to Teams, focus a team, press `Enter` → team detail screen pushed
- **org-settings-ctrl-s-saves-general**: Tab to General, change description, press `Ctrl+S` → save submitted, status flash "✓ Organization updated"
- **org-settings-ctrl-s-noop-when-clean**: Tab to General, do not change anything, press `Ctrl+S` → no-op
- **org-settings-ctrl-s-noop-during-save**: Change description, press `Ctrl+S`, immediately press `Ctrl+S` again → only one save request
- **org-settings-a-opens-add-member-modal**: Tab to Members, press `a` → Add member modal appears
- **org-settings-add-member-modal-esc-dismisses**: Open add member modal, press `Esc` → modal closes, no action
- **org-settings-add-member-submit**: Open add member modal, enter user ID and role, Tab to Add, press `Enter` → member added, list refreshes
- **org-settings-d-opens-remove-member-modal**: Tab to Members, focus a member, press `d` → Remove member confirmation modal
- **org-settings-x-opens-remove-member-modal**: Tab to Members, focus a member, press `x` → same as `d`
- **org-settings-remove-member-confirm**: Open remove modal, Tab to Remove, press `Enter` → member removed, list refreshes
- **org-settings-d-suppressed-on-last-owner**: Tab to Members, focus the last owner row, press `d` → no modal, inline hint shown
- **org-settings-c-opens-create-team-modal**: Tab to Teams, press `c` → Create team modal appears
- **org-settings-create-team-submit**: Open create team modal, fill fields, Tab to Create, press `Enter` → team created, list refreshes
- **org-settings-e-opens-edit-team-modal**: Tab to Teams, focus a team, press `e` → Edit team modal appears with pre-populated fields
- **org-settings-d-opens-delete-team-modal**: Tab to Teams, focus a team, press `d` → Delete team confirmation modal
- **org-settings-delete-team-confirm-disabled-wrong-name**: Open delete team modal, type wrong name → Delete button in muted color, Enter is no-op
- **org-settings-delete-team-confirm-enabled-correct-name**: Open delete team modal, type correct team name → Delete button in error color, Enter deletes team
- **org-settings-enter-on-danger-zone-opens-delete-org**: Tab to Danger Zone, press `Enter` → Delete organization confirmation modal
- **org-settings-delete-org-confirm-disabled-wrong-name**: Open delete org modal, type wrong name → Delete button disabled
- **org-settings-delete-org-confirm-disabled-wrong-case**: Org name "AcmeCorp", type "acmecorp" → Delete button remains disabled
- **org-settings-delete-org-confirm-enabled-exact-name**: Open delete org modal, type exact org name → Delete button enabled
- **org-settings-delete-org-success**: Confirm org deletion → TUI navigates to dashboard, status flash "Organization deleted"
- **org-settings-esc-pops-screen**: No modal open, press `Esc` → settings screen popped, returns to org overview
- **org-settings-q-pops-screen**: No modal open, press `q` → settings screen popped, returns to org overview
- **org-settings-G-jumps-to-bottom-in-list**: Tab to Members, press `G` → focus on last loaded member row
- **org-settings-gg-jumps-to-top-in-list**: In Members, press `G` then `g g` → focus on first member row
- **org-settings-R-retries-on-error**: Section shows error, press `R` → fetch retried

### Responsive Tests (12 tests)

- **org-settings-80x24-layout**: Terminal 80×24 → General form uses stacked labels. Members show username + role only. Teams show name + permission only. Modals use 90% width
- **org-settings-80x24-member-no-display-name**: Terminal 80×24 → member display name column hidden
- **org-settings-80x24-team-no-description**: Terminal 80×24 → team description column hidden
- **org-settings-80x24-form-stacked-labels**: Terminal 80×24 → form labels rendered above inputs instead of inline
- **org-settings-120x40-layout**: Terminal 120×40 → General form has inline labels. Members show all 3 columns. Teams show all 3 columns. Modals use 60% width
- **org-settings-120x40-member-display-name-visible**: Terminal 120×40 → member display name column visible at 25ch width
- **org-settings-120x40-team-description-visible**: Terminal 120×40 → team description column visible at 35ch width
- **org-settings-200x60-layout**: Terminal 200×60 → wider columns, expanded spacing. Modals use 50% width
- **org-settings-resize-standard-to-min**: Resize 120×40 → 80×24 → display name and description columns collapse immediately
- **org-settings-resize-preserves-form-state**: Resize at any breakpoint while form is dirty → form values preserved
- **org-settings-resize-preserves-focus**: Resize at any breakpoint → focused section and row preserved
- **org-settings-resize-modal-recenters**: Resize while modal is open → modal re-centers at new size, content preserved

### Integration Tests (20 tests)

- **org-settings-auth-expiry**: 401 on any settings API call → app-shell auth error screen
- **org-settings-rate-limit-429**: 429 with Retry-After: 30 → "Rate limited. Retry in 30s." inline
- **org-settings-network-error-general**: Network timeout on org details fetch → General section error with "Press R to retry"
- **org-settings-network-error-members**: Network timeout on member list → Members section error, General section renders normally
- **org-settings-network-error-teams**: Network timeout on team list → Teams section error, other sections render normally
- **org-settings-sections-load-independently**: Slow member API → General and Teams sections render while Members shows loading
- **org-settings-name-conflict-409**: Save with duplicate name → inline error "An organization with that name already exists"
- **org-settings-rename-updates-context**: Rename org → breadcrumb and navigation context update to new name
- **org-settings-visibility-change-confirmation**: Change visibility public→private → confirmation modal shown. Cancel → no change. Confirm → visibility saved
- **org-settings-add-duplicate-member-409**: Add already-existing member → modal error "User is already a member"
- **org-settings-add-nonexistent-user-404**: Add user with invalid ID → modal error "User not found"
- **org-settings-remove-last-owner-blocked**: Try to remove last owner → action suppressed, inline hint
- **org-settings-create-duplicate-team-409**: Create team with existing name → modal error "already exists"
- **org-settings-delete-team-success**: Create team, delete with name confirmation → team removed from list
- **org-settings-delete-org-success-redirects**: Delete org → navigates to dashboard
- **org-settings-member-pagination**: Org with 45 members → first page 30, scroll triggers second page with 15
- **org-settings-team-pagination**: Org with 45 teams → pagination works correctly
- **org-settings-deep-link-as-owner**: Launch TUI with `--screen org-settings --org acme-corp` as owner → settings screen renders
- **org-settings-deep-link-as-member**: Launch TUI with `--screen org-settings --org acme-corp` as member → access denied message
- **org-settings-unicode-inputs**: Enter Unicode characters in description (emoji, CJK) → saved and displayed correctly
