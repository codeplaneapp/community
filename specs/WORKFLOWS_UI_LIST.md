# WORKFLOWS_UI_LIST

Specification for WORKFLOWS_UI_LIST.

## High-Level User POV

As a Codeplane developer or operator, I need the product specification to accurately reflect the current state of the codebase—including implemented features, partial implementations, gated surfaces, and cloud-only aspirations—so that I can make informed decisions about what to build, test, and ship next without being misled by aspirational documentation.

## Acceptance Criteria

1. The PRD and Design spec must use the four-tier maturity model (Implemented, Partial, Gated, Cloud-only/future) consistently across all sections.
2. Every server route family listed in the spec must correspond to a mounted route in apps/server.
3. Every client surface (Web, CLI, TUI, Desktop, VS Code, Neovim) must be documented with its actual command/screen/view inventory.
4. Known gaps and mismatches (agent 501 stub, workspace placeholder resolution, missing deploy-key routes, MCP/skills stubs, terminal session input endpoint) must be explicitly called out.
5. The spec must cover all 13+ functional domains: platform runtime, auth, users/orgs/teams, repos/jj, issues, landing requests, labels/milestones/wiki/releases/LFS/secrets/variables/webhooks, search/notifications, workflows, workspaces/previews, agents, integrations, and admin/billing/daemon.
6. Non-functional requirements for consistency, streaming, security, operability, and maintainability must be stated.
7. The Community Edition vs Cloud-only boundary must be explicit.

## Design

The system is a Bun/TypeScript monorepo with a Hono-based API server as the central product contract. Key architectural decisions:
- **Monorepo topology**: apps/ (server, cli, ui, tui, desktop, vscode-extension, nvim-plugin) + packages/ (sdk, workflow, ui-core, editor-core).
- **Server bootstrap**: DB init → service registry → feature flags → SSH server → cleanup scheduler → Hono app with middleware (requestId, logging, CORS, rate-limit, content-type, auth) → route mounting → graceful shutdown.
- **Service registry pattern**: Singleton services in packages/sdk/src/services consumed by thin route handlers.
- **Persistence**: Generated SQL wrappers + domain services in packages/sdk; PGLite for local/daemon mode.
- **jj boundary**: Subprocess-based jj integration via repo-host layer, not reimplemented in TS.
- **Eventing**: SSE manager for workflow logs, notifications, workspace status, and session streams.
- **Deployment modes**: Server (self-hosted), Daemon (PGLite-backed local), Desktop (embedded daemon + webview).
- **Sync engine**: Local sync queue, periodic flush, ElectricSQL shape subscriptions, cursor persistence, conflict tracking.
- **Web app**: SolidJS SPA with owner-aware routing, shell (sidebar, command palette, terminal dock, agent dock), feature-flag-gated routes.
- **CLI**: Domain subcommands via incur, default agent-helper mode, jj-aware local flows, workspace-issue automation orchestration.
- **TUI**: React/Ink consuming shared ui-core hooks.
- **Editor integrations**: VS Code and Neovim consuming editor-core + daemon APIs.

## Permissions & Security

- **Session cookies**: Secure HTTP-only cookies for web sessions.
- **PAT tokens**: Personal access tokens for API authentication via Authorization header.
- **OAuth flows**: GitHub OAuth for sign-in; OAuth2 application management for third-party integrations.
- **SSH keys**: Public key authentication for repository transport and workspace access; deploy keys with per-repo scoping.
- **Key-based challenge/response**: Alternative sign-in mechanism.
- **Repository access control**: Owner/collaborator/team-based authorization checked in route handlers and SSH server.
- **Organization/team boundaries**: Org membership and team-to-repository assignment govern access.
- **Admin surfaces**: Admin-only routes for user/org/repo/runner/health/audit management and alpha whitelist control.
- **Secrets isolation**: Repository-scoped secrets and variables; workspace sandbox access tokens; daemon local auth storage.
- **Deploy key gap**: Deploy key SSH auth works but repository deploy-key management API routes are not mounted.

## Telemetry & Product Analytics

- **Structured logging**: Request-level structured logging via middleware (request ID correlation).
- **Billing ledger**: Usage tracking, balance, quota, and admin credit grant endpoints exist for metering.
- **Workflow events**: Workflow run lifecycle events emitted through SSE for observability of automation pipelines.
- **Activity tracking**: Workspace activity tracking for idle/stale cleanup decisions.
- **Sync queue metrics**: Sync engine tracks queue depth, flush cycles, and conflict counts.
- **No explicit analytics/telemetry SDK**: The Community Edition does not currently ship client-side analytics or server-side metric emission to external systems (Prometheus/StatsD); this is a gap for production deployments.

## Observability

- **Health endpoint**: /health route for liveness/readiness checks.
- **Admin audit views**: Admin surfaces expose audit log access.
- **SSE streaming**: Real-time observability into workflow logs, workflow events, notification streams, workspace status, and session status via server-sent events.
- **Daemon status API**: Daemon mode exposes status, sync state, and conflict inspection endpoints.
- **Desktop sync status**: Desktop app polls daemon for sync status and surfaces it in tray.
- **Editor status indicators**: VS Code statusbar and Neovim statusline show daemon/sync state.
- **Known gap**: No integrated Prometheus/Grafana metrics export in CE; codeplanectl references Grafana monitoring but this is dev-harness scope, not shipped product.
- **Cleanup scheduler**: Server-side scheduled cleanup for stale workspaces and previews with logged lifecycle.
- **Feature flags**: Runtime feature flag system allows gating and observing feature rollout state.

## Verification

1. **Server route coverage**: Verify every route family in the spec is mounted in apps/server/src/index.ts or its route imports.
2. **Service registry completeness**: Confirm all services listed in design §3.3 are instantiated in apps/server/src/services.ts.
3. **CLI command inventory**: Run `bun run apps/cli --help` and verify all listed subcommands match spec §7.3.
4. **TUI screen inventory**: Glob apps/tui/src/screens/ and verify screens match spec §9.2.
5. **Web route inventory**: Glob apps/ui/src/routes/ and verify routes match spec §7.1-7.4.
6. **Known gaps validation**: Confirm agent stream returns 501, workspace routes have placeholder resolution, deploy-key routes are unmounted, MCP/skills endpoints are stubs.
7. **Streaming endpoints**: Verify SSE endpoints for notifications, workflow logs, workflow events, workspace status, and session status return proper SSE content-type.
8. **Auth flows**: E2E test GitHub OAuth, PAT creation/use, SSH key auth, and session management.
9. **Daemon mode**: Start in daemon mode with PGLite, verify status/sync/conflict APIs respond.
10. **Desktop embedding**: Launch desktop app, verify daemon starts in-process and web UI loads from local URL.
11. **Editor integrations**: Activate VS Code extension and Neovim plugin, verify daemon connection and command availability.
12. **Middleware ordering**: Verify middleware stack order matches spec §3.2 by inspecting apps/server/src/index.ts.
13. **Feature flag gating**: Toggle a feature flag and verify gated UI routes respond appropriately.
