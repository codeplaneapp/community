# THANK_YOU_PAGE_UI

Specification for THANK_YOU_PAGE_UI.

## High-Level User POV

As a Codeplane user (developer, team lead, or platform engineer), I need a jj-native software forge that treats jj concepts—bookmarks, changes, conflicts, operation history, and stacked-change-oriented landing requests—as first-class citizens across all product surfaces (web UI, CLI, TUI, desktop, and editor integrations). I should be able to move seamlessly from issue creation → code change → landing request → workflow run → workspace without leaving the system. When working locally or offline, the daemon and desktop app should continue to function via PGLite, syncing state when connectivity resumes. AI agents should be able to participate as active collaborators—creating changes, triaging issues, reviewing diffs, and executing tasks in sandboxed workspaces—alongside human teammates. Self-hosted administrators should be able to deploy a single system that covers auth, repos, workflows, workspaces, notifications, and admin without stitching together separate tools.

## Acceptance Criteria

## Core Platform
- Server boots as a single Bun/Hono process, initializing DB, service registry, feature flags, SSH server, SSE manager, and cleanup scheduler
- Server mounts all 22+ route families: health, auth, users, repos, jj, issues, landings, workflows, workspaces, orgs, labels, milestones, releases, webhooks, search, wiki, secrets, agents, notifications, admin, oauth2, lfs, integrations, daemon, previews, billing
- Middleware executes in order: requestId → logger → cors → rateLimit(120/min) → jsonContentType → authLoader
- Server shuts down cleanly on SIGINT/SIGTERM, including preview cleanup and SSH shutdown
- Health endpoint returns 200 with service status
- Public feature flags endpoint returns current flag states

## Authentication & Identity
- GitHub OAuth sign-in completes full flow and creates session
- CLI browser OAuth flow opens browser, completes auth, returns token
- Key-based challenge/response sign-in works for SSH-linked identities
- PAT-based Authorization header authenticates API requests
- PATs can be listed, created, and revoked
- User sessions can be listed and revoked
- Email addresses can be added, verified, and removed
- SSH keys can be added, listed, and deleted
- Connected accounts can be listed and removed
- OAuth2 applications can be created, listed, updated, and deleted

## Users, Orgs, Teams
- Public user profiles display user info and repositories
- Current user can update account settings
- Organizations support full CRUD
- Organization membership can be added, removed, and role-changed
- Teams support CRUD within organizations
- Team membership can be managed
- Teams can be assigned to repositories with permission levels

## Repositories & jj-Native Collaboration
- Repositories support CRUD, transfer, archive, unarchive, fork, star, watch, and topic updates
- Bookmarks are browsable and reflect jj bookmark state
- Changes are browsable by jj change ID
- File and tree browsing returns content with syntax metadata
- Operation log is accessible per repository
- Conflicts are inspectable with file-level detail
- Diffs render in unified/split mode with whitespace preference
- Repository graph visualization renders commit/change topology
- Commit status APIs accept and return external CI/check status

## Issues
- Issue list supports filtering by state, label, assignee, milestone
- Issues can be created, edited, closed, and reopened
- Comments can be added, edited, and deleted
- Labels and assignees can be attached and removed
- Milestones can be associated
- Reactions, pin, lock, and link actions function in CLI and/or UI

## Landing Requests
- Landing requests can be created from jj change IDs
- Landing request list/detail/edit works
- Reviews can be submitted with approve/request-changes/comment
- Comments can be added to landing requests
- Diffs display between source and target
- Conflicts are visible when present
- Check/status results are visible on landing requests
- Landing requests can be enqueued for merge
- CLI supports create/view/review/checks/conflicts/edit/comment/land flows

## Labels, Milestones, Wiki, Releases, LFS, Secrets, Variables, Webhooks
- Labels support CRUD with color and description
- Milestones support CRUD with due date and progress
- Wiki pages support CRUD and list/search
- Releases support CRUD with asset upload and download
- LFS batch API handles object upload/download negotiation
- Repository secrets and variables support CRUD
- Webhooks support CRUD with event selection and delivery history

## Search & Notifications
- Search returns results for repositories, issues, users, and code
- Notification inbox lists notifications with read/unread state
- Notifications can be marked as read individually and in bulk
- Notification preferences can be configured per category
- Notification SSE stream delivers real-time updates

## Workflows
- Workflow definitions are discovered from repository content
- Workflows can be manually dispatched
- Workflow runs are listable with status filtering
- Run detail shows steps, tasks, and status
- Runs can be cancelled, rerun, and resumed
- Log streaming works via SSE
- Event streaming works via SSE
- Artifacts can be listed, downloaded, and deleted
- Cache can be listed, stats retrieved, and cleared
- Triggers evaluate correctly for: push, issue, issue_comment, landing_request, release, schedule, workflow_run, workflow_artifact, and manual dispatch

## Workspaces & Previews
- Workspaces can be created, listed, viewed, and deleted
- Workspaces can be suspended and resumed
- Workspace forking creates a new workspace from existing state
- Snapshots can be created and managed
- Workspace sessions can be created with SSH connection info
- Session status streams via SSE
- Preview environments can be created, looked up, deleted, suspended, and woken
- Preview proxy routing resolves to correct target

## Agents
- Agent sessions support CRUD
- Messages can be appended and listed
- Agent tooling has repository context awareness
- CLI agent helper mode activates when no explicit command given
- Session replay UI renders historical sessions
- [KNOWN LIMITATION] CE agent streaming endpoint returns 501

## Integrations
- Linear OAuth flow completes and stores tokens
- Linear repository mapping can be configured
- Linear sync can be triggered
- Integration guide surfaces render for GitHub mirroring and Notion sync
- [KNOWN LIMITATION] MCP and skills discovery endpoints return stubs

## Admin & System
- Admin views for users, orgs, repos, runners, health, and audit logs
- Closed-alpha waitlist and whitelist management functions
- Billing endpoints for balance, usage, ledger, quota, and admin credit grant
- Daemon supports start, status, stop, connect, disconnect, sync, conflict list, retry, and resolve
- Sync queue processes pending operations
- PGLite local-first operation works in daemon and desktop modes

## CLI-Specific
- All 27+ domain subcommands execute successfully
- Default invocation without command enters agent helper mode
- `-R` rewrites to `--repo`, `--change-id` aliases work
- `--json` field filtering works
- `workspace issue` orchestrates: fetch issue → create workspace → poll SSH → seed auth → run automation → create landing request
- Structured output formatting works across all commands

## TUI
- All screens render: dashboard, repositories, issues, issue detail, landings, landing detail, diffs, workspaces, search, notifications, sync status, sync conflicts, wiki, agent chat, agent sessions, command palette
- Navigation between screens works
- Data loads from shared API client

## Desktop
- Desktop app starts daemon in-process with PGLite
- WebView loads UI from local daemon URL
- Tray icon appears with quick actions
- Sync status polling updates tray state
- Hide-to-tray lifecycle works correctly

## Editor Integrations
- VS Code: activation, daemon startup, status bar, issue/landing/bookmark views, webview dashboard, search, sync commands, JJ SCM provider
- Neovim: setup, daemon management, commands for issues/landings/changes/search/workspace/sync/health, Telescope integration, statusline integration

## SSH Transport
- SSH server authenticates via public key fingerprint
- Repository access resolves user keys and deploy keys
- Repository transport supports git-style push/pull
- Workspace SSH access works when container runtime available

## Feature Flags (16 flags)
- All 16 flags (workspaces, agents, preview, sync, billing, readout_dashboard, landing_queue, tool_skills, tool_policies, repo_snapshots, integrations, session_replay, secrets_manager, web_editor, client_error_reporting, client_metrics) default to enabled in CE
- Flags can be overridden via CODEPLANE_FEATURE_FLAGS_<NAME> env var
- Setting to 'false' or '0' disables the flag
- Gated surfaces degrade gracefully when flag is disabled

## Design

## Architecture Overview

Codeplane is a Bun/TypeScript monorepo implementing a jj-native software forge with the following topology:

### Applications
- **apps/server** — Hono/Bun HTTP API server + SSH server (primary product surface)
- **apps/cli** — Bun CLI built with `incur` (27+ subcommands)
- **apps/ui** — SolidJS SPA repository workbench
- **apps/tui** — React/Ink terminal UI
- **apps/desktop** — ElectroBun shell embedding daemon + webview
- **apps/vscode-extension** — VS Code integration
- **apps/nvim-plugin** — Neovim integration
- **apps/codeplanectl** — Operator control plane / dev harness

### Shared Packages
- **packages/sdk** — DB adapters, generated SQL wrappers, 20+ domain services, SSE, sync, workspace, preview, auth, blob store, feature flags
- **packages/workflow** — TypeScript workflow authoring helpers
- **packages/ui-core** — Shared API client, hooks, commands, stores for UI/TUI
- **packages/editor-core** — Editor/daemon integration helpers

### Server Bootstrap Sequence
1. `initDb()` — PostgreSQL or PGLite connection
2. `initServices()` — Singleton service registry (20 services: user, repo, issue, label, milestone, landing, org, wiki, search, webhook, workflow, notification, secret, release, oauth2, lfs, sse, workspace, preview, billing)
3. Load feature flags (16 flags, all CE-enabled by default)
4. Start SSH server (best-effort)
5. Start cleanup scheduler
6. Construct Hono app with middleware chain
7. Mount 22+ route families
8. Register SIGINT/SIGTERM handlers

### Middleware Stack (ordered)
1. requestId — UUID per request for tracing
2. logger — Structured JSON logging
3. cors — Cross-origin headers
4. rateLimit(120) — 120 req/min per identity
5. jsonContentType — Enforce application/json on mutations
6. authLoader — Populate auth context from cookie/PAT/OAuth

### Data Layer
- **Persistence**: 51 generated SQL wrapper files in packages/sdk/src/db, one per entity type
- **Key entities**: agents, auth, billing, bookmarks, changes, conflicts, deploy_keys, issues, jj_operations, labels, landings, lfs, milestones, notifications, oauth2, orgs, reactions, releases, repos, secrets, ssh_keys, users, variables, webhooks, wiki, workflow_artifacts, workflow_caches, workflow_logs, workflow_runs, workflow_schedules, workflows, workspaces
- **Blob store**: Abstracted via BlobStore interface for release assets, LFS objects
- **Eventing**: SSE manager (packages/sdk/src/services/sse.ts) using PostgreSQL LISTEN/NOTIFY for workflow logs, workflow status, notifications, workspace/session status

### jj Integration Boundary
- Codeplane does NOT reimplement jj in TypeScript
- RepoHostService bridges to local repositories via subprocess-based jj CLI invocation
- This enables: bookmark/change browsing, file contents, diffs, conflict introspection, operation log, commit status

### API Design
- Resource-oriented JSON over Hono routes
- Repository-scoped paths: `/api/repos/:owner/:repo/...`
- Mixed pagination: page/per-page for some routes, cursor/limit for others (intentional current state)
- Auth: session cookies, PAT Authorization header, GitHub OAuth, key-based challenge/response, OAuth2 app flows
- Streaming: SSE for notifications, workflow logs/events, workspace status, workspace session status
- Error model: structured JSON error payloads via APIError class with helpers (notFound, badRequest, unauthorized, forbidden, conflict, internal)

### Web Application (SolidJS)
- Owner-aware routing: `/:owner/:repo/*` for repos, `/:owner` for profiles, global routes for settings/admin/search/inbox
- Shell components: sidebar, pinned section, global strip, command palette, keyboard help, terminal dock, agent dock
- Data model: repoContext + API helpers, repo-scoped resource loaders, prefetched navigation, shared stores, authenticated EventSource for SSE
- Feature-gated routes: landing queue, readout dashboard, repo snapshots, tool policies, tool skills (scaffolded placeholders)

### CLI Architecture
- 27+ domain subcommands with shared output formatting and repo resolution
- Root behavior: defaults to agent helper mode, rewrites -R/--change-id aliases, supports --json field filtering
- Notable orchestration: `workspace issue` flow (fetch issue → create workspace → poll SSH → seed Claude auth → run automation → create landing request)
- Daemon lifecycle commands: start, stop, status, sync, conflicts

### TUI Architecture
- React/Ink (not Solid) — consumes shared @codeplane/ui-core hooks and API client
- Screen-based navigation: dashboard, repos, issues, landings, diffs, workspaces, search, notifications, sync, wiki, agents, command palette

### Desktop Architecture
- ElectroBun shell starts Codeplane server in-process with PGLite
- WebView points to local daemon URL
- Native: tray icon, sync status polling, quick actions, hide-to-tray

### Daemon & Sync
- Daemon mode: PGLite-backed local DB, operational APIs (status, force sync, conflict list/resolve/retry, connect/disconnect)
- Sync engine: local sync queue, periodic flushes, ElectricSQL shape subscriptions, cursor persistence, conflict tracking, jj operation watch hooks

### Deployment Modes
1. **Server mode** — Self-hosted CE with PostgreSQL
2. **Daemon mode** — Local-first with PGLite
3. **Desktop mode** — Embedded daemon + native webview

### Known Design Gaps
- Agent streaming: CE returns 501 (placeholder, not real SSE)
- Workspace routes: placeholder repo/user resolution in several endpoints
- Web terminal: references session input endpoint not exposed by server
- Deploy keys: UI exists, SSH auth exists, but repo management routes not mounted
- MCP/skills: discovery endpoints are stubs
- Feature-flagged UI routes: present as placeholders without complete backend

### Security Model
- Session cookies (secure, httpOnly)
- PAT handling with scoped permissions
- OAuth flows (GitHub, OAuth2 apps)
- Email verification
- SSH public key identity + deploy key authorization
- Repository secrets/variables encrypted at rest
- Workspace sandbox access tokens
- Container sandbox boundary (degrades gracefully if runtime unavailable)

## Permissions & Security

## Authentication Methods
- **Session cookies**: Secure httpOnly cookies set after OAuth or direct sign-in
- **Personal Access Tokens (PAT)**: Bearer token via Authorization header, scoped permissions
- **GitHub OAuth**: Full OAuth2 flow for sign-in and account linking
- **Key-based challenge/response**: SSH key-linked identity verification
- **OAuth2 application flows**: Third-party app authorization

## Authorization Model
- **Repository access**: Owner, admin, write, read permission levels
- **Organization membership**: Owner, admin, member roles
- **Team-to-repository assignment**: Teams grant repository permissions to members
- **Deploy keys**: Repository-scoped SSH keys with read or read-write access, resolved by fingerprint during SSH auth
- **Admin access**: Separate admin role for system-wide operations (user/org/repo/runner/health/audit management)

## Resource-Level Permissions
- **Repositories**: Public (read by anyone) or private (read by authorized users only); write requires explicit permission
- **Issues**: Readable by anyone with repo read access; writable by repo collaborators
- **Landing requests**: Readable by anyone with repo read access; reviewable by repo collaborators
- **Secrets/Variables**: Write-only (values not readable after creation); scoped to repository
- **Webhooks**: Manageable by repo admins only
- **Wiki**: Readable by anyone with repo read access; editable by collaborators
- **Workflows**: Dispatchable by users with repo write access; logs readable by anyone with repo read
- **Workspaces**: Scoped to creating user; admin can list all
- **Agent sessions**: Scoped to creating user within repository context
- **Notifications**: Scoped to authenticated user only
- **Organizations**: Public listing; membership management restricted to org admins/owners
- **Admin surfaces**: Restricted to users with admin role

## Closed-Alpha Enforcement
- Waitlist and whitelist management in admin surfaces
- Identity enforcement in service layer gates access for non-whitelisted users

## SSH Transport Authorization
- SSH server resolves user keys and deploy keys by fingerprint
- Repository access mode (read/write) determined by key type and permissions
- Workspace SSH access requires valid sandbox access token

## Rate Limiting
- 120 requests per minute per authenticated identity
- Applied uniformly across all API routes via middleware

## Telemetry & Product Analytics

## Feature Flags as Telemetry Gates
- **client_error_reporting** flag: When enabled, clients can report errors back to the server for aggregation
- **client_metrics** flag: When enabled, clients can submit usage metrics
- Both flags default to enabled in CE but can be disabled via CODEPLANE_FEATURE_FLAGS_CLIENT_ERROR_REPORTING=false or CODEPLANE_FEATURE_FLAGS_CLIENT_METRICS=false

## Structured Logging
- All API requests logged with structured JSON via middleware logger
- Request ID (UUID) attached to every request for distributed tracing
- Log entries include: request method, path, status code, duration, user identity (when authenticated)

## Audit Log
- audit_log entity exists in the database schema (generated SQL wrappers present)
- Admin audit log view available in admin surfaces
- Captures system-significant events for compliance and debugging

## Billing Usage Tracking
- Billing service tracks: balance, usage, ledger entries, quota consumption
- Admin can view usage and grant credits
- Usage data available via billing API endpoints

## Workflow Telemetry
- Workflow runs track: status, duration, step/task lifecycle events
- Workflow logs streamed via SSE and persisted
- Workflow cache stats available (hit/miss rates, storage usage)
- Workflow artifacts tracked with metadata

## Notification Delivery Tracking
- Notification fanout service tracks delivery status
- Webhook deliveries include response status and retry metadata

## Sync Telemetry (Daemon Mode)
- Sync queue tracks pending/completed/failed operations
- Conflict tracking captures sync conflicts with resolution status
- Cursor persistence tracks sync progress

## No External Analytics
- CE does not include third-party analytics SDKs (no Google Analytics, Segment, etc.)
- All telemetry is self-contained within the Codeplane instance

## Observability

## Health Endpoint
- GET /api/health returns server health status including service availability
- Used by daemon, desktop, CLI health commands, and external monitoring

## Structured Request Logging
- Every API request logged with: request ID (UUID), method, path, status code, response time, authenticated user
- JSON format suitable for log aggregation (ELK, Loki, etc.)

## Request Tracing
- requestId middleware assigns UUID to every request
- Request ID propagated through service calls for correlation
- Available in response headers for client-side correlation

## SSE Event Streams (Real-Time Observability)
- **Workflow log stream**: Real-time log output from running workflow steps
- **Workflow event stream**: Status change events for workflow runs
- **Notification stream**: Real-time notification delivery to connected clients
- **Workspace status stream**: Workspace lifecycle events (creating, ready, suspended, error)
- **Workspace session status stream**: Session connection state changes

## Audit Log
- Database-backed audit log captures admin and system-significant operations
- Viewable in admin UI for operational review

## Admin Dashboard
- Admin views expose: user counts, org counts, repo counts, runner pool status
- Health view shows system component status
- Audit log view shows recent system events

## Cleanup Scheduler
- Background cleanup jobs for: stale workspaces, expired sessions, old workflow artifacts
- Scheduler logs cleanup operations for monitoring

## Webhook Delivery Observability
- Each webhook delivery records: event type, target URL, HTTP status, response body, retry count
- Delivery history viewable per webhook in UI and API

## Sync Engine Observability (Daemon Mode)
- Sync queue depth and processing rate
- Conflict count and resolution status
- Last successful sync timestamp
- Connection status (connected/disconnected to remote)

## Desktop/Daemon Status
- Tray icon reflects current sync status
- CLI `status` command reports daemon health, sync state, and connection info
- Editor integrations show status bar indicators for daemon/sync state

## Billing Observability
- Usage ledger provides time-series view of resource consumption
- Quota endpoint shows current usage vs. limits

## Error Handling
- APIError class provides structured error responses with: status code, error code, message, optional details
- Consistent error format across all API routes
- Errors include request ID for correlation with server logs

## Verification

## Unit & Integration Testing
- Test files co-located with source across packages/sdk, apps/server, apps/cli
- Service-level tests validate business logic in isolation
- Route-level tests validate HTTP request/response contracts
- Database wrapper tests validate SQL query correctness

## End-to-End Testing
- e2e/ directory contains cross-surface integration tests
- Tests exercise full request lifecycle: client → API → service → DB → response
- [IMPORTANT per project memory]: Tests that fail due to unimplemented backends must NOT be skipped or commented out — they should fail naturally to signal incomplete work

## Feature Specification Verification
- 2,505 generated feature specification files in specs/ directory
- Each spec covers a discrete feature with acceptance criteria
- Specs serve as verification checklists for implementation completeness

## Manual Verification Paths

### Server
- Boot server: `bun run apps/server/src/index.ts`
- Verify health: `curl http://localhost:3000/api/health`
- Verify route mounting: Check structured log output for mounted route families
- Verify middleware: Send request and confirm request ID in response headers
- Verify auth: Attempt protected endpoint without credentials → 401
- Verify rate limiting: Send >120 requests/min → 429

### CLI
- Verify help: `codeplane --help` lists all subcommands
- Verify auth flow: `codeplane auth login` opens browser OAuth
- Verify repo operations: `codeplane repo list` returns repos
- Verify agent default: `codeplane` with no args enters agent helper mode
- Verify alias rewriting: `codeplane -R owner/repo` resolves correctly

### Web UI
- Navigate to each major route and verify rendering
- Verify repo context loads on /:owner/:repo
- Verify command palette opens with keyboard shortcut
- Verify SSE streams connect for notifications
- Verify feature-gated routes show appropriate state when flag disabled

### TUI
- Launch: `codeplane tui`
- Navigate all screens: dashboard, repos, issues, landings, workspaces, agents
- Verify data loading from API
- Verify keyboard navigation

### Desktop
- Launch desktop app
- Verify daemon starts (PGLite)
- Verify webview loads UI
- Verify tray icon appears
- Verify sync status updates

### SSH Transport
- Clone via SSH: `jj git clone ssh://user@host/owner/repo`
- Push via SSH and verify server receives changes
- Verify deploy key access with read-only key

### Daemon & Sync
- Start daemon: `codeplane daemon start`
- Verify status: `codeplane daemon status`
- Verify sync: `codeplane daemon sync`
- Verify conflict detection: create conflicting changes, verify `codeplane daemon conflicts` lists them
- Stop daemon: `codeplane daemon stop`

### Workflows
- Dispatch workflow manually via CLI or API
- Verify run appears in list
- Verify log streaming via SSE
- Verify artifact upload/download
- Verify cancel/rerun

### Workspaces
- Create workspace via CLI or API
- Verify SSH connectivity
- Verify suspend/resume
- Verify snapshot creation
- Verify deletion cleanup

### Known Verification Limitations
- Agent streaming: CE endpoint returns 501 — verify 501 response, not streaming behavior
- MCP/skills discovery: Verify stub response, not real discovery
- Deploy key management routes: Not mounted — verify 404 for management endpoints
- Web terminal input: Session input endpoint not exposed — verify graceful degradation
- Landing queue UI: Gated placeholder — verify renders with feature flag, no backend data expected
