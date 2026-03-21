# Engineering Specification: tui-agent-screen-registry

> **Register agent screens in TUI navigation and command palette**

| Field | Value |
|-------|-------|
| Ticket ID | `tui-agent-screen-registry` |
| Type | Engineering |
| Estimate | 4 hours |
| Dependencies | None |
| Feature Group | `TUI_AGENTS` |
| Status | Not started |

---

## 1. Overview

This ticket registers all agent-related screens in the TUI's screen registry, go-to keybinding system, command palette, and deep-link parser. After this work, agent screens are reachable through every navigation pathway in the TUI — go-to mode (`g a`), the command palette (`:agents`, `New Agent Session`), and CLI deep-links (`--screen agents`). No agent screen components are functionally implemented in this ticket; only the registry wiring, navigation entries, routing plumbing, and minimal stub components that satisfy TypeScript's exhaustiveness checks.

### 1.1 Motivation

The TUI's navigation system is registry-driven. A screen does not exist to the user unless it is registered in:

1. The `ScreenName` enum (canonical identifier)
2. The `screenRegistry` map (component and metadata)
3. The go-to binding table (`goToBindings.ts`)
4. The command palette (`agentCommands.ts`)
5. The deep-link parser (`deepLinks.ts`)

This ticket is a prerequisite for all agent feature screens (`AgentSessionList`, `AgentChat`, `AgentSessionCreate`, `AgentSessionReplay`). Without this registration, none of those screens can be navigated to.

### 1.2 Scope

| In scope | Out of scope |
|----------|-------------|
| `ScreenName` enum additions | Agent screen component implementations |
| `screenRegistry` map entries | Data hooks (`useAgentSessions`, etc.) |
| Go-to keybinding `g a` | SSE streaming integration |
| Command palette entries | MessageBlock / ToolBlock implementations |
| Deep-link argument parsing (`--session-id`) | Any visual rendering of agent screens |
| Breadcrumb generation rules | Wiki, org, or any other screen wiring |
| Stub/placeholder screen components for routing | |
| Barrel re-export updates for `screens/Agents/index.ts` | |

### 1.3 Relationship to existing Agents code

The `apps/tui/src/screens/Agents/` directory contains **partial** implementation from earlier work:

| File | Status | Action in this ticket |
|------|--------|----------------------|
| `types.ts` | Exists — defines `MessageRole`, `MessagePart`, `AgentMessage`, `Breakpoint` | **No changes** |
| `components/MessageBlock.tsx` | Exists — **stub only** (`export {};`) | **No changes** |
| `components/ToolBlock.tsx` | Exists — **stub only** (`export {};`) | **No changes** |
| `components/index.ts` | Barrel export for MessageBlock, ToolBlock | **No changes** |
| `utils/formatTimestamp.ts` | Implemented — relative timestamp formatting | **No changes** |
| `AgentSessionListScreen.tsx` | Does not exist | **Create** — stub |
| `AgentChatScreen.tsx` | Does not exist | **Create** — stub |
| `AgentSessionCreateScreen.tsx` | Does not exist | **Create** — stub |
| `AgentSessionReplayScreen.tsx` | Does not exist | **Create** — stub |
| `index.ts` (root barrel) | Does not exist | **Create** — barrel export for four screen stubs |

### 1.4 Current codebase state

The actual file tree under `apps/tui/src/` is:

```
apps/tui/src/
├── hooks/
│   └── useDiffSyntaxStyle.ts       ← diff syntax style hook (implemented)
├── lib/
│   └── diff-syntax.ts              ← color tier detection, palette resolution (implemented)
└── screens/
    └── Agents/
        ├── types.ts                ← message types (implemented)
        ├── components/
        │   ├── index.ts            ← barrel export
        │   ├── MessageBlock.tsx    ← stub (`export {};`)
        │   └── ToolBlock.tsx       ← stub (`export {};`)
        └── utils/
            └── formatTimestamp.ts  ← timestamp formatting (implemented)
```

Critical observations:
- **No `router/` directory exists.** The architecture document describes a `router/types.ts` with `ScreenEntry`, `NavigationContextType`, and `MAX_STACK_DEPTH`, but these files do not exist in the codebase.
- **No `providers/` directory exists.** The architecture document describes a `NavigationProvider.tsx`, but it does not exist.
- **No `hooks/index.ts` exists.** Only `useDiffSyntaxStyle.ts` exists in hooks.
- **No `hooks/useNavigation.ts` exists.**
- **No `navigation/` directory exists.**
- **No `commands/` directory exists.**
- **No `e2e/tui/agents.test.ts` exists.** Only `e2e/tui/diff.test.ts` exists.
- **No `e2e/tui/helpers.ts` exists.**
- **`MessageBlock.tsx` and `ToolBlock.tsx` are stubs** — they contain only `export {};`, not full implementations.

Existing E2E test files:
- `e2e/tui/diff.test.ts` — test stubs with `createTestTui` import from `@microsoft/tui-test`

### 1.5 Spec conflict resolution

This ticket diverges from two upstream specifications. Both divergences are intentional and grounded in the API contract.

**Conflict 1: `requiresRepo` for Agents**

| Source | Value | |
|--------|-------|---|
| Engineering Architecture (`engineering-architecture.md` §Screen Registry) | `requiresRepo: false` | ❌ Overridden |
| Deep-Link Spec (`TUI_DEEP_LINK_LAUNCH.md` §Stack Pre-Population Rules) | `--screen agents → [Dashboard, Agents]` (depth 2, no repo) | ❌ Overridden |
| This ticket | `requiresRepo: true` for all four agent screens | ✅ Canonical |

**Rationale:** Agent sessions are scoped to a repository. The API endpoint is `GET /api/repos/{owner}/{repo}/agent/sessions`. Creating a session requires `POST /api/repos/{owner}/{repo}/agent/sessions`. There is no global agent session endpoint. Without repo context, the agent screen cannot fetch or display any data. The architecture document's `requiresRepo: false` is an error — likely a copy-paste from the `Workspaces` entry which genuinely does not require repo context.

**Impact:** `--screen agents` without `--repo` will produce an error message and fall back to Dashboard. The deep-link spec's stack table row for agents should be read as: `--screen agents --repo acme/api → [Dashboard, Repo(acme/api), Agents]` (depth 3).

**Conflict 2: `--session-id` CLI argument**

The `TUI_DEEP_LINK_LAUNCH.md` spec defines three CLI flags: `--screen`, `--repo`, `--org`. This ticket introduces a fourth: `--session-id`. This is an additive extension, not a conflict. The deep-link spec's validation and error handling patterns are followed for the new argument.

### 1.6 Infrastructure created by this ticket

Since the `router/`, `providers/`, and `hooks/useNavigation.ts` infrastructure described in the architecture document does **not yet exist**, this ticket creates the **navigation registry layer** as a self-contained module. The `navigation/` module defines types and data structures that will be consumed by the `NavigationProvider` and `ScreenRouter` when they are built in a downstream `tui-foundation-scaffold` ticket.

This ticket creates:
- `navigation/screenRegistry.ts` — `ScreenName` enum, `ScreenDefinition` interface, `screenRegistry` map
- `navigation/goToBindings.ts` — go-to binding data and execution helper
- `navigation/deepLinks.ts` — CLI arg parsing and initial stack construction
- `navigation/index.ts` — barrel export
- `commands/types.ts` — palette command interfaces
- `commands/agentCommands.ts` — agent command factory
- `commands/index.ts` — command registry builder

These are **pure data/type modules** with no runtime dependency on NavigationProvider. They export data structures and functions that the NavigationProvider, ScreenRouter, KeybindingProvider, and CommandPalette will consume. This decoupling is intentional — it allows screen registration to proceed independently of provider implementation.

### 1.7 Feature inventory mapping

This ticket contributes to the `TUI_AGENTS` feature group defined in `specs/tui/features.ts`. The features touched:

| Feature | Contribution from this ticket |
|---------|-------------------------------|
| `TUI_AGENT_SESSION_LIST` | `ScreenName.Agents` enum value, registry entry, go-to binding `g a`, `:agents` palette command, `--screen agents` deep-link, stub `AgentSessionListScreen` |
| `TUI_AGENT_CHAT_SCREEN` | `ScreenName.AgentChat` enum value, registry entry with `params: ["sessionId"]`, `--screen agent-chat` deep-link, stub `AgentChatScreen` |
| `TUI_AGENT_SESSION_CREATE` | `ScreenName.AgentSessionCreate` enum value, registry entry, `New Agent Session` palette command, stub `AgentSessionCreateScreen` |
| `TUI_AGENT_SESSION_REPLAY` | `ScreenName.AgentSessionReplay` enum value, registry entry with `params: ["sessionId"]`, `--screen agent-replay` deep-link, stub `AgentSessionReplayScreen` |

This ticket also contributes to `TUI_APP_SHELL` features:
- `TUI_SCREEN_ROUTER` — screen registry entries
- `TUI_GOTO_KEYBINDINGS` — `g a` binding
- `TUI_COMMAND_PALETTE` — two agent commands
- `TUI_DEEP_LINK_LAUNCH` — three deep-link screen mappings

---

## 2. Implementation Plan

### Step 1: Create `PlaceholderScreen` component

**File:** `apps/tui/src/screens/PlaceholderScreen.tsx` *(new file)*

A generic placeholder used for non-agent entries in the screen registry. This avoids creating 16 separate stub files in this ticket.

```tsx
import React from "react";

export function PlaceholderScreen() {
  return (
    <box flexDirection="column" padding={1}>
      <text dimColor>Screen not yet implemented.</text>
    </box>
  );
}
```

Note: OpenTUI's `<text>` component uses `dimColor` (boolean) for muted text. This matches the OpenTUI React component API.

---

### Step 2: Create agent screen stub components

**Files to create:**
- `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`
- `apps/tui/src/screens/Agents/AgentChatScreen.tsx`
- `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx`
- `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx`
- `apps/tui/src/screens/Agents/index.ts` (root barrel export)

Each stub renders a minimal placeholder that identifies the screen by title. Stubs are **not** experiments or PoC code. They are the simplest valid production components that satisfy the `screenRegistry`'s component reference. They will be replaced by full implementations in subsequent tickets.

**`AgentSessionListScreen.tsx`:**

```tsx
import React from "react";

export function AgentSessionListScreen() {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Sessions</text>
      <text dimColor>Not yet implemented.</text>
    </box>
  );
}
```

**`AgentChatScreen.tsx`:**

```tsx
import React from "react";

export function AgentChatScreen() {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Chat</text>
      <text dimColor>Not yet implemented.</text>
    </box>
  );
}
```

**`AgentSessionCreateScreen.tsx`:**

```tsx
import React from "react";

export function AgentSessionCreateScreen() {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>New Agent Session</text>
      <text dimColor>Not yet implemented.</text>
    </box>
  );
}
```

**`AgentSessionReplayScreen.tsx`:**

```tsx
import React from "react";

export function AgentSessionReplayScreen() {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Session Replay</text>
      <text dimColor>Not yet implemented.</text>
    </box>
  );
}
```

**Barrel export — `apps/tui/src/screens/Agents/index.ts`:**

```typescript
export { AgentSessionListScreen } from "./AgentSessionListScreen.js";
export { AgentChatScreen } from "./AgentChatScreen.js";
export { AgentSessionCreateScreen } from "./AgentSessionCreateScreen.js";
export { AgentSessionReplayScreen } from "./AgentSessionReplayScreen.js";
```

**Coexistence with existing files:** The existing `components/index.ts`, `types.ts`, `utils/formatTimestamp.ts`, `components/MessageBlock.tsx`, and `components/ToolBlock.tsx` are untouched. The new barrel export at `screens/Agents/index.ts` only re-exports the four new screen components.

---

### Step 3: Create `navigation/screenRegistry.ts`

**File:** `apps/tui/src/navigation/screenRegistry.ts` *(new file — directory does not exist yet)*

This file establishes the screen registry system. It defines the `ScreenName` enum, the `ScreenDefinition` interface, and the `screenRegistry` map.

**`ScreenName` enum:**

```typescript
export enum ScreenName {
  Dashboard = "Dashboard",
  RepoList = "RepoList",
  RepoOverview = "RepoOverview",
  Issues = "Issues",
  IssueDetail = "IssueDetail",
  Landings = "Landings",
  LandingDetail = "LandingDetail",
  DiffView = "DiffView",
  Workspaces = "Workspaces",
  Workflows = "Workflows",
  Search = "Search",
  Notifications = "Notifications",
  Settings = "Settings",
  Organizations = "Organizations",
  Sync = "Sync",
  Wiki = "Wiki",
  Agents = "Agents",
  AgentChat = "AgentChat",
  AgentSessionCreate = "AgentSessionCreate",
  AgentSessionReplay = "AgentSessionReplay",
}
```

**`ScreenDefinition` interface:**

```typescript
import type React from "react";

export interface ScreenDefinition {
  component: React.ComponentType;
  requiresRepo: boolean;
  params: string[];
  breadcrumb: string | ((params: Record<string, string>) => string);
}
```

**Registry map:** The full `Record<ScreenName, ScreenDefinition>` map. Non-agent entries reference the shared `PlaceholderScreen` stub. Agent entries reference their respective stub components. The four agent entries:

```typescript
[ScreenName.Agents]: {
  component: AgentSessionListScreen,
  requiresRepo: true,
  params: [],
  breadcrumb: "Agent Sessions",
},
[ScreenName.AgentChat]: {
  component: AgentChatScreen,
  requiresRepo: true,
  params: ["sessionId"],
  breadcrumb: (params) => `Session: ${params.sessionId?.slice(0, 8) ?? "…"}`,
},
[ScreenName.AgentSessionCreate]: {
  component: AgentSessionCreateScreen,
  requiresRepo: true,
  params: [],
  breadcrumb: "New Session",
},
[ScreenName.AgentSessionReplay]: {
  component: AgentSessionReplayScreen,
  requiresRepo: true,
  params: ["sessionId"],
  breadcrumb: (params) => `Replay: ${params.sessionId?.slice(0, 8) ?? "…"}`,
},
```

**Design decisions:**

| Decision | Rationale |
|----------|-----------|  
| `requiresRepo: true` for all four agent screens | Agent sessions are scoped to a repository. API endpoint: `GET /api/repos/{owner}/{repo}/agent/sessions`. Overrides architecture doc's `requiresRepo: false` (see §1.5). |
| `params: ["sessionId"]` for `AgentChat` and `AgentSessionReplay` | These screens require a session identifier to fetch and render. |
| Dynamic breadcrumb for `AgentChat` and `AgentSessionReplay` | 8-char truncation fits at minimum terminal width. |
| Shared `PlaceholderScreen` for non-agent entries | Avoids creating 16 separate stub files. |

---

### Step 4: Add `g a` go-to keybinding

**File:** `apps/tui/src/navigation/goToBindings.ts` *(new file)*

```typescript
import { ScreenName } from "./screenRegistry.js";

export interface GoToBinding {
  key: string;
  screen: ScreenName;
  requiresRepo: boolean;
  description: string;
}

export const goToBindings: readonly GoToBinding[] = [
  { key: "d", screen: ScreenName.Dashboard,     requiresRepo: false, description: "Dashboard" },
  { key: "r", screen: ScreenName.RepoList,       requiresRepo: false, description: "Repositories" },
  { key: "i", screen: ScreenName.Issues,          requiresRepo: true,  description: "Issues" },
  { key: "l", screen: ScreenName.Landings,        requiresRepo: true,  description: "Landings" },
  { key: "w", screen: ScreenName.Workspaces,      requiresRepo: false, description: "Workspaces" },
  { key: "n", screen: ScreenName.Notifications,   requiresRepo: false, description: "Notifications" },
  { key: "s", screen: ScreenName.Search,           requiresRepo: false, description: "Search" },
  { key: "o", screen: ScreenName.Organizations,   requiresRepo: false, description: "Organizations" },
  { key: "f", screen: ScreenName.Workflows,        requiresRepo: true,  description: "Workflows" },
  { key: "k", screen: ScreenName.Wiki,             requiresRepo: true,  description: "Wiki" },
  { key: "a", screen: ScreenName.Agents,           requiresRepo: true,  description: "Agents" },
] as const;
```

**Key collision check:** `a` is not assigned to any existing binding. Full allocation after this ticket: `a d f i k l n o r s w` — 11 of 26 letters used.

**`GoToNavigator` interface and `executeGoTo` helper:**

```typescript
export interface GoToNavigator {
  reset(screen: string, params?: Record<string, string>): void;
  push(screen: string, params?: Record<string, string>): void;
}

export function executeGoTo(
  nav: GoToNavigator,
  binding: GoToBinding,
  repoContext: { owner: string; repo: string } | null,
): { error?: string } {
  if (binding.requiresRepo && !repoContext) {
    return { error: "No repository in context" };
  }
  nav.reset(ScreenName.Dashboard);
  if (repoContext) {
    nav.push(ScreenName.RepoOverview, { owner: repoContext.owner, repo: repoContext.repo });
  }
  const params = repoContext ? { owner: repoContext.owner, repo: repoContext.repo } : undefined;
  nav.push(binding.screen, params);
  return {};
}

export function findGoToBinding(key: string): GoToBinding | undefined {
  return goToBindings.find((b) => b.key === key);
}
```

**`g a` behavior:** Builds stack `[Dashboard, RepoOverview(owner/repo), Agents(owner/repo)]`. Without repo context, returns error `"No repository in context"` and does not navigate.

---

### Step 5: Create command types and register palette entries

**File:** `apps/tui/src/commands/types.ts` *(new file)*

```typescript
export interface PaletteCommand {
  id: string;
  name: string;
  aliases?: string[];
  description: string;
  category: "Navigate" | "Action" | "Toggle";
  keybinding?: string;
  priority: number;
  contextRequirements?: {
    repo?: boolean;
    authenticated?: boolean;
    writeAccess?: boolean;
  };
  featureFlag?: string;
  action: () => void;
}

export interface CommandContext {
  navigate: (screen: string, params?: Record<string, string>) => void;
  hasRepoContext: () => boolean;
  getRepoContext: () => { owner: string; repo: string } | null;
  hasWriteAccess: () => boolean;
}
```

**File:** `apps/tui/src/commands/agentCommands.ts` *(new file)*

Two commands:
- `navigate-agents`: Name "Agent Sessions", aliases `[":agents", "agents"]`, keybinding `"g a"`, priority 40, requires repo context.
- `create-agent-session`: Name "New Agent Session", aliases `["Create Agent Session", "new agent", "create agent"]`, priority 41, requires repo context and write access.

Hidden commands are **absent** from fuzzy search results — not grayed out.

---

### Step 6: Wire agent commands into the command registry

**File:** `apps/tui/src/commands/index.ts` *(new file)*

`buildCommandRegistry(context)` collects commands from all feature modules (currently only `createAgentCommands`) and returns them sorted by priority.

---

### Step 7: Add deep-link parsing for agent screens

**File:** `apps/tui/src/navigation/deepLinks.ts` *(new file)*

**`SCREEN_ID_MAP`:** Maps CLI `--screen` values to `ScreenName` enum. Includes `agents`, `agent-chat`, `agent-replay`. Intentionally excludes `agent-create`.

**`parseCliArgs(argv)`:** Extracts `--screen` (lowercased), `--repo`, `--session-id`, `--org` from argv array.

**`buildInitialStack(args)`:** Validates inputs and constructs the initial navigation stack:

| CLI invocation | Result stack | Depth |
|----------------|-------------|-------|
| `--screen agents --repo acme/api` | `[Dashboard, Repo, Agents]` | 3 |
| `--screen agent-chat --repo acme/api --session-id abc123` | `[Dashboard, Repo, Agents, AgentChat]` | 4 |
| `--screen agent-replay --repo acme/api --session-id abc123` | `[Dashboard, Repo, Agents, Replay]` | 4 |

**Validation rules:**
- `--screen` max 32 chars, case-insensitive
- `--repo` max 128 chars, must match `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$`
- `--session-id` max 255 chars, non-empty, no whitespace characters
- Missing required args fall back to `[Dashboard]` with error message
- Error messages display in status bar for 5 seconds per TUI_DEEP_LINK_LAUNCH.md

---

### Step 8: Create navigation barrel export

**File:** `apps/tui/src/navigation/index.ts` *(new file)*

Re-exports all public types, enums, functions, and constants from the three navigation modules.

---

## 3. File Inventory

| File | Action | Purpose |
|------|--------|--------|
| `apps/tui/src/navigation/screenRegistry.ts` | **Create** | `ScreenName` enum, `ScreenDefinition` interface, `screenRegistry` map |
| `apps/tui/src/navigation/goToBindings.ts` | **Create** | `GoToBinding` interface, `goToBindings` array, `executeGoTo`, `findGoToBinding` |
| `apps/tui/src/navigation/deepLinks.ts` | **Create** | `DeepLinkArgs`, `DeepLinkResult`, `SCREEN_ID_MAP`, `parseCliArgs`, `buildInitialStack` |
| `apps/tui/src/navigation/index.ts` | **Create** | Barrel export |
| `apps/tui/src/commands/types.ts` | **Create** | `PaletteCommand` and `CommandContext` interfaces |
| `apps/tui/src/commands/agentCommands.ts` | **Create** | Agent command factory |
| `apps/tui/src/commands/index.ts` | **Create** | `buildCommandRegistry` |
| `apps/tui/src/screens/PlaceholderScreen.tsx` | **Create** | Generic placeholder |
| `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` | **Create** | Stub |
| `apps/tui/src/screens/Agents/AgentChatScreen.tsx` | **Create** | Stub |
| `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx` | **Create** | Stub |
| `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx` | **Create** | Stub |
| `apps/tui/src/screens/Agents/index.ts` | **Create** | Barrel export |

**New files:** 13 | **Modified files:** 0 | **Deleted files:** 0

---

## 4. Data Layer

This ticket does not consume any `@codeplane/ui-core` data hooks. The `navigation/` module is **pure data** with no React context or provider dependencies. The `commands/` module receives a `CommandContext` plain object injected by the caller.

---

## 5. Breadcrumb Generation

| Navigation path | Breadcrumb trail |
|----------------|------------------|
| `g a` from `acme/api` | `Dashboard › acme/api › Agent Sessions` |
| Enter on session row | `Dashboard › acme/api › Agent Sessions › Session: abc123de` |
| Create new session | `Dashboard › acme/api › Agent Sessions › New Session` |
| Replay completed session | `Dashboard › acme/api › Agent Sessions › Replay: abc123de` |
| Deep-link `--screen agent-chat --session-id sess-abc123` | `Dashboard › acme/api › Agent Sessions › Session: sess-abc` |

---

## 6. Edge Cases and Error Handling

### 6.1 `g a` without repo context

Status bar shows `No repository in context` in error color (ANSI 196) for 2000ms. Screen does not change.

### 6.2 `g a` timeout

Go-to mode silently cancelled after 1500ms. Status bar reverts.

### 6.3 `Esc` during go-to mode

Go-to mode cancelled without popping current screen.

### 6.4 `q` during go-to mode

Go-to mode cancelled, then current screen popped (standard `q` behavior).

### 6.5 `New Agent Session` without write access

Command is invisible in palette results — never appears.

### 6.6 Deep-link with missing required arguments

| Missing argument | Screen | Error | Stack |
|-----------------|--------|-------|-------|
| `--repo` | `agents`, `agent-chat`, `agent-replay` | `"--repo required for {screen} screen"` | `[Dashboard]` |
| `--session-id` | `agent-chat`, `agent-replay` | `"--session-id required for {screen} screen"` | `[Dashboard]` |
| Both | `agent-chat` | `"--repo required for agent-chat screen"` (first check wins) | `[Dashboard]` |

All errors display for 5 seconds per TUI_DEEP_LINK_LAUNCH.md.

### 6.7 `agent-create` is not a deep-link target

Deep-linking to a creation form is an anti-pattern. `SCREEN_ID_MAP` lookup returns `undefined`, falls back to `[Dashboard]` with error.

### 6.8 Screen registry exhaustiveness

`Record<ScreenName, ScreenDefinition>` produces a type error for any missing enum value. No `@ts-ignore` or `as any` permitted.

### 6.9 Case sensitivity

`--screen` value is lowercased in `parseCliArgs`. `AGENTS`, `Agents`, `agents` all resolve identically.

### 6.10 Multiple duplicate arguments

Last value wins (sequential parsing loop).

### 6.11 `--repo` regex validation

`^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$` rejects `@`, `!`, spaces, control characters.

### 6.12 `--session-id` edge cases

- Whitespace-only (`"   "`) rejected by `/\s/` test
- Empty string rejected by falsy check
- Over 255 chars rejected by length check
- Tab, newline, carriage return rejected by `/\s/` test

### 6.13 `--screen` without a following value

`next` is `undefined`, `args.screen` becomes `undefined`, `buildInitialStack` returns `[Dashboard]` with no error.

---

## 7. Unit & Integration Tests

### 7.1 Pure function unit tests

**Test file:** `e2e/tui/agents-unit.test.ts` *(new file)*

These tests exercise the pure functions exported by `navigation/` and `commands/` without launching a TUI instance. They import directly from the source modules and use `bun:test`.

```typescript
import { describe, test, expect } from "bun:test";
import { ScreenName, screenRegistry } from "../../apps/tui/src/navigation/screenRegistry.js";
import { goToBindings, executeGoTo, findGoToBinding } from "../../apps/tui/src/navigation/goToBindings.js";
import { parseCliArgs, buildInitialStack } from "../../apps/tui/src/navigation/deepLinks.js";
import { createAgentCommands } from "../../apps/tui/src/commands/agentCommands.js";
import { buildCommandRegistry } from "../../apps/tui/src/commands/index.js";
import type { GoToNavigator } from "../../apps/tui/src/navigation/goToBindings.js";
import type { CommandContext } from "../../apps/tui/src/commands/types.js";
```

**Screen registry tests (UNIT-REG-001 through UNIT-REG-011):**

| ID | Assertion |
|----|----------|
| UNIT-REG-001 | ScreenName enum contains all four agent values with correct string values |
| UNIT-REG-002 | All agent screens have `requiresRepo: true` |
| UNIT-REG-003 | AgentChat requires `sessionId` param |
| UNIT-REG-004 | AgentSessionReplay requires `sessionId` param |
| UNIT-REG-005 | Agents and AgentSessionCreate have empty params |
| UNIT-REG-006 | Agents breadcrumb is static `"Agent Sessions"` |
| UNIT-REG-007 | AgentChat breadcrumb truncates sessionId to 8 chars |
| UNIT-REG-008 | AgentSessionReplay breadcrumb truncates sessionId to 8 chars |
| UNIT-REG-009 | AgentSessionCreate breadcrumb is static `"New Session"` |
| UNIT-REG-010 | Every ScreenName value has an entry in screenRegistry |
| UNIT-REG-011 | All agent screen components are non-null functions |

**Go-to binding tests (UNIT-GTO-001 through UNIT-GTO-007):**

| ID | Assertion |
|----|----------|
| UNIT-GTO-001 | `findGoToBinding("a")` returns `{ screen: Agents, requiresRepo: true }` |
| UNIT-GTO-002 | No duplicate keys in goToBindings array |
| UNIT-GTO-003 | All binding screen values exist in ScreenName |
| UNIT-GTO-004 | `findGoToBinding("x")` returns undefined |
| UNIT-GTO-005 | `executeGoTo` with repo builds Dashboard → Repo → Agents stack |
| UNIT-GTO-006 | `executeGoTo` without repo returns `"No repository in context"` error |
| UNIT-GTO-007 | `executeGoTo` for non-repo-scoped screen skips RepoOverview |

**CLI arg parsing tests (UNIT-DLK-001 through UNIT-DLK-007):**

| ID | Assertion |
|----|----------|
| UNIT-DLK-001 | Parses `--screen --repo --session-id` correctly |
| UNIT-DLK-002 | Lowercases `--screen` value |
| UNIT-DLK-003 | Returns empty object for no arguments |
| UNIT-DLK-004 | Last value wins for duplicate arguments |
| UNIT-DLK-005 | `--screen` without following value yields undefined |
| UNIT-DLK-006 | Does not lowercase `--repo` value |
| UNIT-DLK-007 | Parses `--org` |

**Deep-link stack building tests (UNIT-DLK-010 through UNIT-DLK-029):**

| ID | Assertion |
|----|----------|
| UNIT-DLK-010 | `--screen agents --repo` builds 3-entry stack |
| UNIT-DLK-011 | `--screen agent-chat` builds 4-entry stack with sessionId |
| UNIT-DLK-012 | `--screen agent-replay` builds 4-entry stack with sessionId |
| UNIT-DLK-013 | `--screen agents` without `--repo` returns error |
| UNIT-DLK-014 | `--screen agent-chat` without `--session-id` returns error |
| UNIT-DLK-015 | `--screen agent-replay` without `--session-id` returns error |
| UNIT-DLK-016 | `--session-id` with whitespace is rejected |
| UNIT-DLK-017 | `--session-id` empty string is rejected |
| UNIT-DLK-018 | `--session-id` over 255 chars is rejected |
| UNIT-DLK-019 | `--repo` with invalid format returns error |
| UNIT-DLK-020 | `--repo` with special chars rejected |
| UNIT-DLK-021 | Case-insensitive screen matching |
| UNIT-DLK-022 | Unknown screen returns error |
| UNIT-DLK-023 | `agent-create` is not a valid deep-link |
| UNIT-DLK-024 | No `--screen` returns Dashboard |
| UNIT-DLK-025 | `--screen` longer than 32 chars truncates in error |
| UNIT-DLK-026 | `--repo` longer than 128 chars returns error |
| UNIT-DLK-027 | `agent-chat` without `--repo` checks repo first |
| UNIT-DLK-028 | `--session-id` with tab character is rejected |
| UNIT-DLK-029 | Valid session ID characters pass validation |

**Command palette tests (UNIT-CMD-001 through UNIT-CMD-011):**

| ID | Assertion |
|----|----------|
| UNIT-CMD-001 | `createAgentCommands` returns two commands |
| UNIT-CMD-002 | `navigate-agents` has correct metadata (name, keybinding, category) |
| UNIT-CMD-003 | `create-agent-session` requires writeAccess |
| UNIT-CMD-004 | `navigate-agents` includes `:agents` alias |
| UNIT-CMD-005 | `create-agent-session` includes `Create Agent Session` alias |
| UNIT-CMD-006 | `navigate-agents` action calls navigate with correct params |
| UNIT-CMD-007 | `navigate-agents` action is no-op without repo context |
| UNIT-CMD-010 | `buildCommandRegistry` includes agent commands |
| UNIT-CMD-011 | `buildCommandRegistry` returns commands sorted by priority |

### 7.2 E2E integration tests

**Test file:** `e2e/tui/agents.test.ts` *(new file)*

These tests launch a full TUI instance using `createTestTui` from `@microsoft/tui-test` (matching the `e2e/tui/diff.test.ts` import pattern). Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

```typescript
import { createTestTui } from "@microsoft/tui-test";
```

**Go-to navigation tests (NAV-AGT-001 through NAV-AGT-006):**

| ID | Behavior verified |
|----|------------------|
| NAV-AGT-001 | `g a` navigates to agent sessions when repo context is active |
| NAV-AGT-002 | `g a` without repo context shows error, does not change screen |
| NAV-AGT-003 | `g` shows `-- GO TO --` mode indicator in status bar |
| NAV-AGT-004 | `Esc` cancels go-to mode without navigating or popping |
| NAV-AGT-005 | `g a` builds correct stack allowing `q` back-navigation |
| NAV-AGT-006 | Unrecognized key during go-to mode cancels silently |

**Command palette tests (CMD-AGT-001 through CMD-AGT-006):**

| ID | Behavior verified |
|----|------------------|
| CMD-AGT-001 | `:agents` alias navigates to agent sessions |
| CMD-AGT-002 | Fuzzy match `ag se` finds Agent Sessions |
| CMD-AGT-003 | `New Agent Session` visible with repo + write access |
| CMD-AGT-004 | `New Agent Session` hidden without repo context |
| CMD-AGT-005 | `Agent Sessions` hidden without repo context |
| CMD-AGT-006 | Keybinding hint `g a` shown next to Agent Sessions |

**Deep-link tests (DLK-AGT-001 through DLK-AGT-013):**

| ID | Behavior verified |
|----|------------------|
| DLK-AGT-001 | `--screen agents --repo` opens agent session list with correct breadcrumb |
| DLK-AGT-002 | `--screen agent-chat --repo --session-id` opens chat with session in breadcrumb |
| DLK-AGT-003 | `--screen agent-replay --repo --session-id` opens replay with replay in breadcrumb |
| DLK-AGT-004 | `--screen agents` without `--repo` shows error, falls back to dashboard |
| DLK-AGT-005 | `--screen agent-chat` without `--session-id` shows error |
| DLK-AGT-006 | `--screen agent-replay` without `--session-id` shows error |
| DLK-AGT-007 | `--session-id` with whitespace shows format error |
| DLK-AGT-008 | `--screen` value is case-insensitive |
| DLK-AGT-009 | `--repo` with invalid format shows error |
| DLK-AGT-010 | Deep-linked agent chat supports full `q` back-navigation (4 pops) |
| DLK-AGT-011 | Deep-linked agent replay supports full `q` back-navigation (4 pops) |
| DLK-AGT-012 | `--session-id` empty string shows format error |
| DLK-AGT-013 | `--repo` with special chars rejected by regex |

**Screen registry tests (REG-AGT-001 through REG-AGT-005):**

| ID | Behavior verified |
|----|------------------|
| REG-AGT-001 | Agents screen reachable via deep-link with repo context |
| REG-AGT-002 | AgentChat requires sessionId — missing param falls back |
| REG-AGT-003 | AgentSessionReplay requires sessionId — missing param falls back |
| REG-AGT-004 | `agent-create` is not a deep-link target — shows unknown screen |
| REG-AGT-005 | AgentSessionCreate reachable via command palette |

**Snapshot tests (SNAP-AGT-001 through SNAP-AGT-006):**

| ID | Terminal size | Screen |
|----|--------------|--------|
| SNAP-AGT-001 | 120×40 | Agent session list stub |
| SNAP-AGT-002 | 80×24 | Agent session list stub (minimum) |
| SNAP-AGT-003 | 120×40 | Agent chat stub with session in breadcrumb |
| SNAP-AGT-004 | 120×40 | Agent replay stub with replay in breadcrumb |
| SNAP-AGT-005 | 200×60 | Agent session list stub (large) |
| SNAP-AGT-006 | 120×40 | Agent create stub |

### 7.3 Test Summary

| File | Category | Count |
|------|----------|-------|
| `agents-unit.test.ts` | Screen registry | 11 |
| `agents-unit.test.ts` | Go-to bindings | 7 |
| `agents-unit.test.ts` | CLI arg parsing | 7 |
| `agents-unit.test.ts` | Deep-link stack building | 20 |
| `agents-unit.test.ts` | Command palette | 9 |
| `agents.test.ts` | Go-to navigation (E2E) | 6 |
| `agents.test.ts` | Command palette (E2E) | 6 |
| `agents.test.ts` | Deep-links (E2E) | 13 |
| `agents.test.ts` | Screen registry (E2E) | 5 |
| `agents.test.ts` | Snapshots (E2E) | 6 |
| **Total** | | **90** |

---

## 8. Productionization Notes

### 8.1 No PoC code

All code is immediately production-grade. Stubs are minimal valid implementations. No `poc/` output to graduate.

### 8.2 Stub screen lifecycle

| Stub | Replaced by ticket | Prerequisite tickets |
|------|---------------------|---------------------|
| `AgentSessionListScreen` | `tui-agent-session-list` | `tui-agent-data-hooks` |
| `AgentChatScreen` | `tui-agent-chat-screen` | `tui-agent-sse-stream-hook`, `tui-agent-message-block` |
| `AgentSessionCreateScreen` | `tui-agent-session-create` | `tui-agent-session-list` |
| `AgentSessionReplayScreen` | `tui-agent-session-replay` | `tui-agent-message-block` |

### 8.3 What is permanent vs. what is replaced

**Permanent:** `ScreenName` enum values, `ScreenDefinition` interface, `screenRegistry` map structure, `GoToBinding` interface and `key: "a"` binding, `GoToNavigator` interface, `PaletteCommand` and `CommandContext` interfaces, command palette entries in `agentCommands.ts`, deep-link mappings in `SCREEN_ID_MAP`, `DeepLinkArgs`/`DeepLinkResult` interfaces, `REPO_FORMAT_REGEX`, all 90 tests.

**Replaced by downstream tickets:** Stub component implementations, `PlaceholderScreen` references replaced per-entry.

### 8.4 TypeScript exhaustiveness

`Record<ScreenName, ScreenDefinition>` produces compile errors for missing enum values. No suppressions permitted.

### 8.5 Naming conventions

| Element | Convention | Example |
|---------|-----------|--------|
| `ScreenName` enum values | PascalCase | `AgentSessionCreate` |
| `screenRegistry` map keys | Bracket notation | `[ScreenName.AgentChat]` |
| Deep-link `--screen` values | kebab-case | `agent-chat` |
| Command palette `id` | kebab-case | `create-agent-session` |
| Screen component files | PascalCase + `Screen.tsx` | `AgentChatScreen.tsx` |
| Go-to binding keys | single lowercase letter | `a` |
| Test name prefix | UPPER-CASE | `NAV-AGT-001` |
| Import paths | `.js` extension (ESM) | `from "./screenRegistry.js"` |

### 8.6 Directory structure after this ticket

```
apps/tui/src/
├── commands/                            ← NEW
│   ├── types.ts
│   ├── agentCommands.ts
│   └── index.ts
├── hooks/
│   └── useDiffSyntaxStyle.ts            ← EXISTING
├── lib/
│   └── diff-syntax.ts                   ← EXISTING
├── navigation/                          ← NEW
│   ├── screenRegistry.ts
│   ├── goToBindings.ts
│   ├── deepLinks.ts
│   └── index.ts
└── screens/
    ├── PlaceholderScreen.tsx             ← NEW
    └── Agents/
        ├── index.ts                     ← NEW
        ├── AgentSessionListScreen.tsx   ← NEW
        ├── AgentChatScreen.tsx          ← NEW
        ├── AgentSessionCreateScreen.tsx ← NEW
        ├── AgentSessionReplayScreen.tsx ← NEW
        ├── types.ts                     ← EXISTING
        ├── components/                  ← EXISTING
        └── utils/                       ← EXISTING

e2e/tui/
├── diff.test.ts                         ← EXISTING
├── agents.test.ts                       ← NEW
└── agents-unit.test.ts                  ← NEW
```

### 8.7 Pattern establishment

1. **Screen registration:** Add to `ScreenName` → create stub → add to `screenRegistry` → add `case` to `buildInitialStack`.
2. **Go-to binding:** Add entry to `goToBindings` with key collision check.
3. **Command palette:** Create `createXxxCommands(context)` factory → register in `buildCommandRegistry`.
4. **Deep-link:** Add to `SCREEN_ID_MAP` → add `case` block to `buildInitialStack`.
5. **Stub component:** `<text bold>` for title, `<text dimColor>` for placeholder text.
6. **Test:** Unit tests in `*-unit.test.ts` for pure functions; E2E tests in `*.test.ts` for user-facing behavior.

---

## 9. Acceptance Criteria Checklist

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | All four agent screens in `screenRegistry` with correct `requiresRepo` and `params` | `UNIT-REG-*`, `REG-AGT-*` |
| 2 | `g a` navigates to Agents with repo context | `NAV-AGT-001`, `UNIT-GTO-005` |
| 3 | `g a` without repo context shows error | `NAV-AGT-002`, `UNIT-GTO-006` |
| 4 | `g` shows go-to mode indicator | `NAV-AGT-003` |
| 5 | `Esc` cancels go-to mode | `NAV-AGT-004` |
| 6 | Unrecognized key cancels go-to mode | `NAV-AGT-006` |
| 7 | `:agents` palette alias works | `CMD-AGT-001`, `UNIT-CMD-004` |
| 8 | `New Agent Session` visible with repo + write access | `CMD-AGT-003`, `UNIT-CMD-003` |
| 9 | `New Agent Session` hidden without repo | `CMD-AGT-004` |
| 10 | `Agent Sessions` hidden without repo | `CMD-AGT-005` |
| 11 | Keybinding hint `g a` shown in palette | `CMD-AGT-006`, `UNIT-CMD-002` |
| 12 | Deep-link `--screen agents --repo` works | `DLK-AGT-001`, `UNIT-DLK-010` |
| 13 | Deep-link `--screen agent-chat` works | `DLK-AGT-002`, `UNIT-DLK-011` |
| 14 | Deep-link `--screen agent-replay` works | `DLK-AGT-003`, `UNIT-DLK-012` |
| 15 | Missing `--repo` error | `DLK-AGT-004`, `UNIT-DLK-013` |
| 16 | Missing `--session-id` error | `DLK-AGT-005/006`, `UNIT-DLK-014/015` |
| 17 | Invalid `--session-id` whitespace error | `DLK-AGT-007`, `UNIT-DLK-016` |
| 18 | Invalid `--session-id` empty error | `DLK-AGT-012`, `UNIT-DLK-017` |
| 19 | Invalid `--repo` format error | `DLK-AGT-009`, `UNIT-DLK-019` |
| 20 | Invalid `--repo` special chars error | `DLK-AGT-013`, `UNIT-DLK-020` |
| 21 | Case-insensitive `--screen` | `DLK-AGT-008`, `UNIT-DLK-002/021` |
| 22 | `agent-create` not a deep-link | `REG-AGT-004`, `UNIT-DLK-023` |
| 23 | `AgentSessionCreate` reachable via palette | `REG-AGT-005` |
| 24 | Back-nav from deep-linked chat | `DLK-AGT-010` |
| 25 | Back-nav from deep-linked replay | `DLK-AGT-011` |
| 26 | TypeScript compiles without errors | `bun tsc --noEmit` |
| 27 | Existing files unchanged | `git diff` |
| 28 | Snapshots pass at all breakpoints | `SNAP-AGT-001` through `SNAP-AGT-006` |
| 29 | Fuzzy `ag se` finds Agent Sessions | `CMD-AGT-002` |
| 30 | `e2e/tui/diff.test.ts` not modified | File diff |
| 31 | No go-to key collisions | `UNIT-GTO-002` |
| 32 | All ScreenName values have registry entries | `UNIT-REG-010` |
| 33 | Pure function unit tests pass | `bun test e2e/tui/agents-unit.test.ts` |

---

## 10. Dependencies

**Upstream:** None. This ticket has no dependencies and can be implemented immediately.

**Downstream:** All agent feature tickets depend on this ticket:

| Ticket | Dependency |
|--------|------------|
| `tui-agent-session-list` | `ScreenName.Agents`, `screenRegistry[Agents]`, go-to `g a` |
| `tui-agent-chat-screen` | `ScreenName.AgentChat`, `screenRegistry[AgentChat]` with `params: ["sessionId"]` |
| `tui-agent-session-create` | `ScreenName.AgentSessionCreate`, palette `create-agent-session` |
| `tui-agent-session-replay` | `ScreenName.AgentSessionReplay`, `screenRegistry[AgentSessionReplay]` with `params: ["sessionId"]` |
| `tui-foundation-scaffold` | `ScreenName` enum, `ScreenDefinition`, `screenRegistry` patterns |