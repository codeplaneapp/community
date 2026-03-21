# JJHub Design Specification

This design specification describes the current JJHub repository architecture and interface model. It is intentionally code-backed. It explains how the product is structured today, which boundaries are authoritative, and where the current implementation is partial or intentionally gated.

## Status Model

The same maturity labels used in the PRD apply here:

- `Implemented`
- `Partial`
- `Gated`
- `Cloud-only / future`

## 1. Design Goals

JJHub’s current repository is designed around these technical goals:

- `jj-native architecture`: jj concepts are exposed directly in routes, clients, and workflows.
- `API as contract`: web, CLI, TUI, desktop, and editor integrations should converge on the same HTTP API and shared packages.
- `Shared packages over duplication`: SDK, UI-core, workflow, and editor-core packages carry reusable logic.
- `Streaming where it matters`: notifications, workflow logs, workflow events, and workspace/session status use SSE-style streaming.
- `Composable deployment modes`: the same codebase supports server mode, local daemon mode, and desktop-embedded daemon mode.
- `Explicit implementation status`: design docs must call out where clients are ahead of server routes or where surfaces are still scaffolded.

## 2. Monorepo Topology

The repository is organized into application surfaces and shared packages.

### 2.1 Applications

- `apps/server`
  Hono/Bun API server, SSH integration, route handlers, service registry bootstrap
- `apps/cli`
  Bun CLI built with `incur`
- `apps/ui`
  SolidJS SPA and repository workbench
- `apps/tui`
  React/Ink terminal UI
- `apps/desktop`
  ElectroBun desktop shell embedding daemon + web UI
- `apps/vscode-extension`
  VS Code extension
- `apps/nvim-plugin`
  Neovim plugin

### 2.2 Shared packages

- `packages/sdk`
  DB adapters, generated SQL wrappers, domain services, SSE, sync, workspace, preview, auth, and utility libraries
- `packages/workflow`
  TypeScript workflow authoring helpers and primitives
- `packages/ui-core`
  shared API client, hooks, commands, and stores for UI/TUI consumers
- `packages/editor-core`
  editor/daemon integration helpers

## 3. Runtime Architecture

### 3.1 Server bootstrap

`Implemented`

`apps/server/src/index.ts` performs the core server startup sequence:

1. initialize the database
2. initialize the service registry
3. load feature flags
4. start the SSH server on a best-effort basis
5. start the cleanup scheduler
6. construct the Hono app with middleware
7. mount route families
8. handle graceful shutdown, including preview cleanup and SSH shutdown

### 3.2 Middleware stack

`Implemented`

The current middleware ordering is:

1. request ID
2. structured logging
3. CORS
4. rate limiting
5. JSON content-type enforcement for mutations
6. auth context loading

This stack is effectively the common runtime contract for all mounted routes.

### 3.3 Service registry

`Implemented`

`apps/server/src/services.ts` creates singleton service instances from `@jjhub/sdk`, including:

- user
- repo
- issue
- label
- milestone
- landing
- org
- wiki
- search
- webhook
- workflow
- notification
- secret
- release
- oauth2
- lfs
- sse
- workspace
- preview
- billing

The server route layer is intentionally thin and delegates domain logic to these services.

### 3.4 Deployment modes

`Implemented`, with `Cloud-only / future` extensions

The same codebase supports:

- server mode for self-hosted Community Edition
- local daemon mode backed by PGLite
- desktop mode, which embeds the daemon and points a webview at it

Cloud-specific orchestration models such as Firecracker VM orchestration are product direction, not implemented CE runtime behavior in this repo.

## 4. Data and Service Boundaries

### 4.1 Persistence model

`Implemented`

Persistence lives primarily in `packages/sdk/src/db` and service modules in `packages/sdk/src/services`.

Key properties:

- generated SQL wrappers provide low-level database access
- domain services encapsulate business logic
- routes marshal/unmarshal request and response payloads
- blob-backed features such as release assets and LFS use the shared blob store abstraction

### 4.2 Repo-host / jj boundary

`Implemented`

JJHub does not reimplement jj semantics in TypeScript. The repo-host layer bridges to local repositories and jj operations via subprocess-based integration and repo-host services. This boundary is what enables:

- bookmark and change browsing
- file contents and diff retrieval
- conflict introspection
- operation-log-driven behaviors
- commit status association

### 4.3 Eventing boundary

`Implemented`

The SSE manager in `packages/sdk/src/services/sse.ts` is the internal event delivery utility for:

- workflow log streams
- workflow status streams
- notification streams
- workspace and workspace-session status streams

This eventing layer is a core design primitive for long-running or append-only product surfaces.

## 5. HTTP API Design

### 5.1 API style

`Implemented`

The API is resource-oriented JSON over Hono routes. It favors:

- repository-scoped resource paths
- structured JSON responses
- explicit error payloads
- a mix of pagination styles, depending on the route family

### 5.2 Route families

`Implemented`

The current mounted route families are:

- `health`
- `auth`
- `users`
- `repos`
- `jj`
- `issues`
- `landings`
- `workflows`
- `workspaces`
- `orgs`
- `labels`
- `milestones`
- `releases`
- `webhooks`
- `search`
- `wiki`
- `secrets`
- `agents`
- `notifications`
- `admin`
- `oauth2`
- `lfs`
- `integrations`
- `daemon`
- `previews`
- `billing`

### 5.3 Auth model

`Implemented`

The API currently supports:

- session cookies
- PAT-based `Authorization` use
- GitHub OAuth
- key-based challenge/response sign-in
- OAuth2 application flows

### 5.4 Pagination model

`Implemented`, but mixed by design

The API currently uses both:

- page/per-page patterns
- cursor/limit patterns

This is a real property of the repo today and should be treated as part of the contract until/unless normalized.

### 5.5 Streaming model

`Implemented`, with one `Partial` agent exception

Current streaming-capable API surfaces include:

- notification SSE
- workflow run logs SSE
- workflow run event SSE
- workspace status SSE
- workspace session status SSE

Important exception:

- agent session streaming exists as an endpoint, but the Community Edition implementation currently returns a 501 placeholder

## 6. SSH and Transport Design

### 6.1 Repository SSH transport

`Implemented`

The SSH server supports git-style repository transport using SSH public key authentication. It resolves user keys and deploy keys by fingerprint and authorizes repository access modes accordingly.

### 6.2 Workspace SSH transport

`Implemented`

The SSH server also supports workspace access when a container sandbox runtime is available. This allows the same SSH boundary to serve both repository and workspace use cases.

### 6.3 Smart HTTP / repository transport

`Implemented`

The repository routes expose content, refs, trees, commits, archive, and related repository transport surfaces sufficient for JJHub’s repository browsing and compatibility workflows.

## 7. Web Application Design

### 7.1 Routing model

`Implemented`

The Solid app uses an owner-aware route model:

- global routes for login, search, inbox, settings, admin, integrations, workspaces, waitlist, marketing
- repository routes under `/:owner/:repo/*`
- user profile routes under `/:owner` and `/users/:username`

Legacy `/repo/:repo/*` paths are redirected using a fallback owner.

### 7.2 Layout and shell

`Implemented`

The web app shell includes:

- app layout with auth context
- sidebar
- pinned section
- global strip
- command palette
- keyboard help modal
- terminal dock
- agent dock

This shell is part of the product architecture, not just decoration. It provides cross-cutting navigation, command dispatch, and repository-context-aware tools.

### 7.3 Data access model

`Implemented`

The UI relies on:

- `repoContext` and API helpers
- repo-scoped resource loaders
- prefetched navigation data
- shared stores for workbench and diff preferences
- authenticated event sources for SSE-compatible flows

The intended architecture is server-authoritative state with thin client-side caching and UI state.

### 7.4 Feature-gated and placeholder surfaces

`Gated` and `Partial`

The following web routes exist but are not complete feature implementations:

- landing queue
- readout dashboard
- repo snapshots
- tool policies
- tool skills

These are scaffolded UI entry points and should be treated as planned surfaces, not fully operational backend-backed features.

## 8. CLI Design

### 8.1 Command architecture

`Implemented`

The CLI is organized as domain subcommands with shared output formatting and repo resolution logic. It combines:

- API-backed commands
- local jj-aware helper flows
- daemon lifecycle operations
- workflow and workspace orchestration
- agent helper entrypoints

### 8.2 Root behavior

`Implemented`

The CLI has domain-specific rewrite behavior that is part of the product UX:

- default to `agent ask` style behavior when no explicit command is given
- rewrite `-R` to `--repo`
- rewrite `--change-id` aliases
- support JSON field filtering after `--json`
- rewrite repo clone argv for the desired UX

### 8.3 Workspace and issue automation

`Implemented`

One notable CLI-specific design path is `workspace issue`, which:

- fetches an issue
- creates a workspace
- polls for SSH readiness
- seeds Claude auth where possible
- runs an issue-driven automation flow
- creates a landing request if changes are produced

This is a significant product-specific orchestration surface, not merely a thin transport wrapper.

## 9. TUI Design

### 9.1 Technology choice

`Implemented`

The TUI is built with React and Ink rather than Solid. This is acceptable because it consumes shared `@jjhub/ui-core` data hooks and the common API.

### 9.2 Screen model

`Implemented`

The TUI is screen-based and includes:

- dashboard
- repositories
- issues
- issue detail and creation
- landing requests
- landing detail
- diff viewer
- workspaces and workspace create/detail
- notifications
- search
- sync status and conflicts
- agent chat and agent sessions
- wiki
- command palette

This makes the TUI a real first-class client, not a placeholder command.

## 10. Desktop Design

### 10.1 Embedded daemon model

`Implemented`

The desktop application starts the JJHub server in-process using PGLite and then loads the UI from the local daemon URL. This means desktop is not a distinct backend; it is a packaging and runtime composition of existing server and UI surfaces.

### 10.2 Native desktop affordances

`Implemented`

Desktop-specific additions include:

- tray icon
- sync status polling
- quick actions
- hide-to-tray lifecycle

## 11. Editor Integration Design

### 11.1 VS Code

`Implemented`

The VS Code extension provides:

- activation lifecycle
- daemon startup integration
- status bar state
- issue, landing, and bookmark views
- webview entrypoint to the dashboard
- search and sync commands
- JJ SCM/provider plumbing

### 11.2 Neovim

`Implemented`

The Neovim plugin provides:

- setup/config bootstrap
- daemon management hooks
- commands for issues, landings, changes, search, workspace, sync, and health
- Telescope integration
- statusline integration

## 12. Local-First Daemon and Sync Design

### 12.1 Daemon mode

`Implemented`

Daemon mode exposes internal operational APIs for:

- status
- force sync
- conflict listing
- conflict resolve/retry
- remote connect/disconnect

### 12.2 Sync engine

`Implemented`

The sync service uses:

- a local sync queue
- periodic queue flushes
- ElectricSQL shape subscriptions
- cursor persistence
- conflict tracking
- jj operation watch hooks

This is the technical basis for local-first JJHub behavior in the daemon, desktop, and editor-linked workflows.

## 13. Workflow, Workspace, Preview, and Agent Design

### 13.1 Workflow engine

`Implemented`

The workflow service is responsible for:

- definition lookup
- trigger evaluation
- run creation
- step/task lifecycle
- rerun/cancel/resume
- artifact and log association
- event emission

### 13.2 Workspace service

`Implemented`, with `Partial` route plumbing

The workspace service handles:

- workspace creation
- restore-from-snapshot behavior
- container provisioning
- session lifecycle
- SSH connection info
- idle/stale cleanup
- activity tracking

The service layer is more complete than some route-layer wiring, which still uses placeholder repository/user resolution in several endpoints.

### 13.3 Preview service

`Implemented`

The preview service manages landing-request-scoped preview environments, including:

- preview create/get/delete
- host/path lookup for reverse proxy routing
- idle suspend
- wake on access
- preview URL resolution

### 13.4 Agent services

`Implemented`, with `Partial` live-stream behavior

The repo contains:

- agent session/message APIs
- agent context and tooling packages
- local and workspace backends
- session replay UI

The main missing CE piece is real live response streaming from the server-side endpoint.

## 14. Security Model

### 14.1 Identity and session boundaries

`Implemented`

The security model includes:

- secure session cookies
- PAT handling
- OAuth flows
- email verification
- SSH public key identity
- deploy key authorization in SSH

### 14.2 Secret and token boundaries

`Implemented`

Secrets and credentials are handled through:

- repository secrets and variables
- daemon/desktop local auth storage
- workspace sandbox access tokens
- workflow and workspace secret injection paths

### 14.3 Sandbox boundary

`Implemented`, with runtime-dependent availability

Workspace and preview features depend on a container sandbox client. If a supported runtime is unavailable, the server degrades gracefully and leaves those capabilities unavailable.

## 15. Known Gaps and Mismatches

The most important current design gaps are:

- agent session stream endpoint is still a 501 placeholder in Community Edition
- workspace route handlers still contain placeholder repository/user resolution in multiple endpoints
- web terminal clients reference a session input endpoint that is not currently exposed by the server routes
- deploy-key management UI exists, and deploy-key SSH auth exists, but repository deploy-key API routes are not mounted
- integrations `mcp` and `skills` discovery endpoints are currently stubs
- several feature-flagged UI routes are present as placeholders rather than complete backend-backed product areas
- cloud-specific features are documented directionally but are not part of the CE implementation in this repo

These gaps should remain explicit in any future design updates.

## 16. Design Rules for Future Changes

Changes to JJHub should preserve these architectural rules:

- add product logic to shared services before duplicating it in route handlers or clients
- treat the HTTP API as the main integration boundary
- keep jj-native concepts explicit rather than flattening them into git-only abstractions
- mark partial, gated, and cloud-only features clearly in docs and specs
- prefer extending existing shared packages (`sdk`, `ui-core`, `workflow`, `editor-core`) over creating client-specific forks of common behavior

## 17. Source of Truth

This design spec should be maintained alongside:

- [prd.md](/Users/williamcory/jjhub/specs/prd.md)
- [features.ts](/Users/williamcory/jjhub/specs/features.ts)
- [README.md](/Users/williamcory/jjhub/README.md)

## 9. SuperSmithers Dev Harness (jjhubctl)

The development harness uses `incur` to manage CLI arguments and the Smithers workflow engine for autonomous orchestration.

- **Interactive Pi Session**: `jjhubctl` exposes an interactive command that spawns the `pi` coding agent, loading a local extension and skill.
- **TUI Dashboards**: The Dev Harness UI embeds tools to view PRD/Design specs, review implementation plans, monitor Smithers task progress, and surface PromQL/Grafana alerts.
- **Runbook Execution**: Provides command-line affordances to execute operational runbooks interactively, tracking results as Smithers task attempts.
