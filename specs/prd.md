# JJHub Product Requirements Document

This PRD is a code-backed product specification for the JJHub repository in its current form. It is intentionally grounded in the implemented server routes, clients, shared packages, and tests in this repo. It replaces the earlier aspirational framing with an explicit description of what exists now, what is scaffolded, and what is positioned as a cloud or future extension.

## Status Model

This document uses four maturity labels:

- `Implemented`: Present in the current repo as a usable server, client, or shared-package surface.
- `Partial`: Present but incomplete, stubbed, mismatched across clients, or marked with TODOs.
- `Gated`: Present behind a feature flag or placeholder route/view.
- `Cloud-only / future`: Referenced in marketing or architecture direction, but not implemented in this Community Edition repo.

## 1. Product Summary

JJHub is a jj-native software forge. In this repository, it is implemented as a Bun/TypeScript monorepo that combines:

- A Hono-based API server with SSH support.
- A SolidJS web application.
- A first-party CLI.
- A React/Ink TUI.
- A native desktop wrapper that embeds the daemon and web UI.
- VS Code and Neovim integrations.
- Shared SDK, workflow, editor, and UI-core packages.

JJHub’s core product promise is that repositories, jj-native collaboration, workflows, workspaces, and agent-assisted development should feel like one system instead of separate tools glued together.

## 2. Editions and Scope

### 2.1 Community Edition in this repo

`Implemented`

The open-source codebase is the Community Edition. It supports:

- Self-hosted API and web UI.
- Smart HTTP and SSH repository access.
- jj-native repository concepts such as bookmarks, changes, conflicts, operation history, and stacked-change-oriented landing requests.
- Repository collaboration features including issues, labels, milestones, wiki, releases, webhooks, secrets, variables, search, and notifications.
- Workflow orchestration, workflow runs, logs, artifacts, and cache management.
- Container-backed workspaces and preview environments.
- Agent sessions and agent-oriented repository tooling.
- Local-first daemon mode backed by PGLite.
- Desktop, CLI, TUI, VS Code, and Neovim clients.

### 2.2 Cloud positioning

`Cloud-only / future`

Cloud-specific capabilities are referenced in README/docs and should still be treated as part of JJHub’s broader product direction, but they are not implemented in this repository as shipped Community Edition behavior. These include:

- Firecracker-based isolation and sub-second snapshot resume.
- Enterprise SSO / SAML.
- Multi-tenant fleet management.
- Copy-on-write workspace forking semantics beyond the current CE container model.

## 3. Problem Statement

JJHub exists because traditional git-hosting products are weak fits for jj-native development and for agent-assisted engineering.

The repository’s implemented product surfaces are optimized around these problems:

- Git-oriented review models do not express stable jj change IDs, stacked changes, or conflict objects cleanly.
- Human-only workflows do not scale to teams using agents to produce code, triage issues, review diffs, or execute tasks in sandboxes.
- Existing toolchains split work across a forge, CI system, workspace provider, agent runtime, and editor plugins, creating inconsistent state and weak automation boundaries.
- Teams need both server-hosted collaboration surfaces and local-first daemon workflows that continue to work from the desktop, CLI, editors, and TUI.

## 4. Product Principles

JJHub in this repo is defined by the following principles:

- `jj-native first`: jj concepts are first-class product concepts, not hidden behind git-only abstractions.
- `API-centered`: the HTTP API is the main product contract consumed by web, CLI, TUI, desktop, and editor clients.
- `TypeScript-first`: server, clients, workflow authoring, and most shared libraries are authored in TypeScript.
- `Agent-aware`: issue resolution, code changes, workflow execution, and workspace flows are designed to accommodate AI agents as active participants.
- `Local-first where useful`: the daemon, desktop app, editor integrations, and sync engine support a local operational mode instead of requiring always-on cloud-only behavior.
- `Explicit maturity`: the product spec must distinguish shipped behavior from scaffolding, flags, and placeholders.

## 5. Target Users

### 5.1 jj-native developers

These users want a forge that understands bookmarks, changes, operation logs, and conflicts without forcing everything back into a branch-and-PR mental model.

### 5.2 Agent-augmented software teams

These users need workflows, workspaces, issue tracking, and review surfaces that can be driven partly by agents and partly by humans.

### 5.3 Platform and tooling engineers

These users care about daemon mode, shared APIs, editor integrations, workflow execution, and secure workspace/runtime boundaries.

### 5.4 Self-hosting administrators

These users need one deployable system that includes auth, repos, workflows, workspaces, notifications, admin surfaces, and local operational tooling.

## 6. Primary Jobs To Be Done

Users should be able to:

- Create and administer repositories, organizations, teams, users, and credentials.
- Browse and manipulate jj-native repository state from the web UI, CLI, TUI, and editors.
- Track work with issues, labels, milestones, comments, reactions, and notifications.
- Create and review landing requests built around jj change IDs and stacks.
- Run workflows and inspect workflow runs, logs, artifacts, and caches.
- Create and access repository-scoped workspaces and preview environments.
- Start and inspect agent sessions tied to repository context.
- Operate JJHub as either a server-hosted application or a local-first daemon-backed experience.

## 7. Product Surfaces

### 7.1 API server and SSH server

`Implemented`

The server is the product core. It initializes the database, feature flags, service registry, SSE manager, SSH server, and cleanup scheduler, and mounts route families for:

- auth
- users
- repos
- jj-native repository APIs
- issues
- landing requests
- workflows
- workspaces
- organizations and teams
- labels and milestones
- releases
- webhooks
- search
- wiki
- secrets and variables
- agents
- notifications
- admin
- OAuth2 applications
- LFS
- integrations
- daemon mode
- preview environments
- billing

### 7.2 Web application

`Implemented`, with some `Gated` and `Partial` views

The web app is an owner-aware repository workbench with routes for:

- repository overview, bookmarks, changes, code explorer, conflicts, graph, issues, landings, releases, settings, terminal, wiki, workflows, and agent sessions
- user settings, emails, SSH keys, tokens, secrets, variables, connected accounts, notifications, and OAuth applications
- organization settings and team management
- global search, inbox, workspaces, admin, integrations, waitlist, marketing, and login

The web shell also includes:

- sidebar navigation
- pinned pages
- command palette
- keyboard help
- terminal dock
- agent dock
- feature-flag-aware routing

Known gated or placeholder web surfaces:

- landing queue
- readout dashboard
- repo snapshots
- tool policies
- tool skills

### 7.3 CLI

`Implemented`

The CLI exposes major product domains through first-party commands:

- `auth`
- `repo`
- `issue`
- `land`
- `change`
- `bookmark`
- `release`
- `artifact`
- `cache`
- `workflow` and `run`
- `workspace`
- `search`
- `label`
- `secret`
- `variable`
- `ssh-key`
- `config`
- `status`
- `completion`
- `agent`
- `org`
- `wiki`
- `notification`
- `webhook`
- `admin`
- `extension`
- `alpha`
- `api`
- `serve`
- `daemon`
- `health`
- `tui`

The CLI also has product-specific behavior beyond simple REST wrappers:

- defaults to local agent helper mode when invoked without a clear command
- rewrites compatibility aliases such as `-R` and `--change-id`
- supports structured output filtering
- shells out to local jj flows where appropriate
- orchestrates an issue-to-workspace-to-landing-request automation path

### 7.4 TUI

`Implemented`

The repository contains a React/Ink terminal UI with screens for:

- dashboard
- repositories
- issues and issue detail
- landing requests and landing detail
- diffs
- workspaces
- search
- notifications
- sync status and sync conflicts
- wiki
- agent chat and agent sessions
- command palette

### 7.5 Desktop app

`Implemented`

The desktop app embeds the daemon in-process using PGLite and opens the web UI in a native webview. It adds:

- tray integration
- sync status monitoring
- quick access to force sync and status
- hide-to-tray behavior

### 7.6 Editor integrations

`Implemented`

VS Code and Neovim provide direct access to JJHub surfaces from the editor, including:

- issue browsing
- landing request browsing
- bookmark browsing
- daemon interaction
- status indicators
- dashboard/webview entry points
- search and picker flows
- workspace and remote context helpers

## 8. Functional Requirements By Domain

### 8.1 Platform runtime

`Implemented`

JJHub must:

- boot as a single Bun/Hono server process
- initialize DB, services, feature flags, SSH, SSE, and cleanup jobs
- expose public feature flags and health endpoints
- shut down cleanly on SIGINT/SIGTERM

### 8.2 Authentication and identity

`Implemented`, with some `Partial` service wiring

JJHub must support:

- GitHub OAuth sign-in
- CLI-specific browser OAuth
- key-based challenge/response sign-in
- personal access token sign-in
- PAT listing, creation, and revocation
- user session listing and revocation
- email management and verification
- SSH key management
- connected account listing/removal
- OAuth2 application management

Closed-alpha identity enforcement exists in the service layer and admin surfaces.

### 8.3 Users, orgs, and teams

`Implemented`

JJHub must support:

- public user profile and repository views
- current-user account and settings views
- organization CRUD
- organization membership management
- team CRUD
- team membership management
- team-to-repository assignment

### 8.4 Repositories and jj-native collaboration

`Implemented`

JJHub must support:

- repository CRUD, transfer, archive, unarchive, fork, star, watch, and topic updates
- bookmark and change browsing
- file and tree browsing
- operation log access
- conflict inspection
- diff viewing with unified/split and whitespace preferences
- repository graph visualization
- commit status APIs

### 8.5 Issues

`Implemented`

JJHub must support:

- issue list and detail
- issue creation, editing, close/reopen
- comments
- labels and assignees
- milestone association
- reactions, pin, lock, and link actions in CLI and/or UI

### 8.6 Landing requests

`Implemented`, with some `Partial` and `Gated` surfaces

JJHub must support:

- landing request creation from jj change IDs
- landing request list/detail/edit
- reviews and comments
- diff viewing
- conflict visibility
- checks/status visibility
- enqueueing a landing request
- CLI flows for create/view/review/checks/conflicts/edit/comment/land

The global landing queue surface exists as a gated placeholder view rather than a full end-to-end shipped queue UI.

### 8.7 Labels, milestones, wiki, releases, LFS, secrets, variables, webhooks

`Implemented`, with one `Partial` deploy-key mismatch

JJHub must support:

- label CRUD
- milestone CRUD
- wiki CRUD and list/search
- release CRUD and asset upload
- LFS batch/object management
- repository secrets and variables
- repository webhooks and deliveries

Important current mismatch:

- deploy-key UI and deploy-key SSH auth support exist, but repository management routes for deploy keys are not currently mounted in the server route tree

### 8.8 Search and notifications

`Implemented`

JJHub must support:

- repository, issue, user, and code search
- inbox-style notification listing
- mark-read flows
- notification preference management
- notification streaming

### 8.9 Workflows and automation

`Implemented`

JJHub must support:

- workflow definition discovery
- workflow dispatch
- run listing and run detail
- run cancellation, rerun, and resume
- log streaming
- event streaming
- artifact listing/download/deletion
- cache listing/stats/clear
- trigger evaluation for push, issue, issue comment, landing request, release, schedule, workflow run, workflow artifact, and manual dispatch flows
- TypeScript workflow authoring helpers via `packages/workflow`

### 8.10 Workspaces and previews

`Implemented`, with some `Partial` route-layer wiring

JJHub must support:

- workspace creation, listing, viewing, deletion
- suspend/resume
- forking
- snapshot creation and snapshot CRUD
- workspace session creation and status streaming
- SSH connection info for workspaces and sessions
- preview environment creation, lookup, deletion, suspend/wake, and proxy targeting

Known current limitations:

- the workspaces route layer still contains placeholder repo/user resolution in several endpoints
- the web terminal clients reference a session input endpoint that is not currently exposed by the server routes

### 8.11 Agents

`Implemented`, with a `Partial` Community Edition stream path

JJHub must support:

- agent session CRUD
- message append/list
- repository-context-aware agent tooling
- agent helper flows in CLI
- session replay UI

Current limitation:

- the Community Edition server’s agent streaming endpoint currently returns a 501 placeholder rather than a real SSE/live stream implementation

### 8.12 Integrations

`Implemented`, `Partial`, and `Gated`

JJHub must support:

- Linear OAuth and integration configuration
- Linear repository mapping and sync trigger
- built-in integration guide surfaces for GitHub mirroring and Notion sync

Current limitations:

- MCP and skills integration discovery endpoints are currently stubs
- some tool/policy surfaces are gated placeholders awaiting backend wiring

### 8.13 Admin, alpha access, billing, and daemon mode

`Implemented`, with mixed maturity

JJHub must support:

- admin user/org/repo/runner/health/audit views
- closed-alpha waitlist and whitelist management
- billing balance, usage, ledger, quota, and admin credit grant endpoints
- daemon startup, status, stop, connect/disconnect, sync, conflict inspection, and retry/resolve
- sync queue, conflict handling, and local-first PGLite operation

## 9. Non-Functional Requirements

JJHub should meet the following qualities:

- `Consistency`: API contracts should remain the shared source of truth across clients.
- `Streaming support`: long-running workflow, notification, and workspace status paths should favor streaming rather than polling.
- `Security`: auth cookies, tokens, secrets, SSH keys, and workspace sandbox boundaries must be handled explicitly and conservatively.
- `Operability`: the product must be runnable as a server, daemon, or embedded desktop experience.
- `Maintainability`: shared logic should live in packages rather than being reimplemented across clients.

## 10. Non-Goals

The Community Edition repository does not currently require:

- full enterprise SSO
- full multi-tenant cloud fleet management
- fully implemented Firecracker VM orchestration
- a claim that every surfaced UI screen is already backed by a complete server implementation

## 11. Success Criteria

JJHub is successful when:

- jj-native repository operations feel first-class across API, web, CLI, TUI, and editor clients
- users can move from issue to change to landing request to workflow to workspace without leaving the product
- local-first daemon mode and self-hosted server mode both remain viable
- the docs and specs stay aligned with the code, especially around partial and gated features

## 12. Source of Truth

This PRD should be maintained alongside:

- [features.ts](/Users/williamcory/jjhub/specs/features.ts)
- [design.md](/Users/williamcory/jjhub/specs/design.md)
- [README.md](/Users/williamcory/jjhub/README.md)

## 9. SuperSmithers Dev Harness (jjhubctl)

Building JJHub is orchestrated by the exact same tools that power the product. `jjhubctl` is the operator control plane and dev harness for managing the autonomous software lifecycle. 

- **Interactive Pi Extension**: When run interactively, `jjhubctl` launches a `pi` coding agent session loaded with custom JJHub skills.
- **Unified Operator Dashboard**: The harness includes a UI (via Pi/TUI) to view all product specifications, read agent research, review implementation plans, and monitor running Smithers orchestrations.
- **Production Monitoring & Runbooks**: `jjhubctl` acts as the command center to monitor live deployments, open Grafana metrics, and execute runbooks when alerts fire.
- **Recursive Invalidation Engine**: Any edit made via `jjhubctl edit <doc>` recursively invalidates and intelligently regenerates the entire downstream artifact chain.
