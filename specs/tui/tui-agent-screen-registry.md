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

This ticket is a prerequisite for all five agent feature screens (`AgentSessionList`, `AgentChat`, `AgentSessionCreate`, `AgentSessionReplay`, and the message-send flow embedded in chat). Without this registration, none of those screens can be navigated to.

### 1.2 Scope

| In scope | Out of scope |
|----------|--------------|
| `ScreenName` enum additions | Agent screen component implementations |
| `screenRegistry` map entries | Data hooks (`useAgentSessions`, etc.) |
| Go-to keybinding `g a` | SSE streaming integration |
| Command palette entries | MessageBlock / ToolBlock components |
| Deep-link argument parsing | Any visual rendering of agent screens |
| Breadcrumb generation rules | Wiki, org, or any other screen wiring |
| Stub/placeholder screen components for routing | |
| TypeScript interfaces for new types | |
| Barrel re-export updates for `screens/Agents/index.ts` | |

### 1.3 Relationship to existing Agents code

The `apps/tui/src/screens/Agents/` directory already contains partial scaffolding from earlier work:

| File | Status | Action in this ticket |
|------|--------|----------------------|
| `types.ts` | Exists — defines `MessageRole`, `MessagePart`, `AgentMessage`, `Breakpoint` | **No changes** — consumed by downstream screen tickets |
| `components/MessageBlock.tsx` | Empty stub (`export {}`) | **No changes** — implementation is downstream |
| `components/ToolBlock.tsx` | Empty stub (`export {}`) | **No changes** — implementation is downstream |
| `components/index.ts` | Barrel export for MessageBlock, ToolBlock | **No changes** |
| `utils/formatTimestamp.ts` | Implemented — relative timestamp formatting | **No changes** |
| `AgentSessionListScreen.tsx` | Does not exist | **Create** — stub |
| `AgentChatScreen.tsx` | Does not exist | **Create** — stub |
| `AgentSessionCreateScreen.tsx` | Does not exist | **Create** — stub |
| `AgentSessionReplayScreen.tsx` | Does not exist | **Create** — stub |
| `index.ts` (root barrel) | Does not exist | **Create** — barrel export for four screen stubs |

The existing `types.ts`, `components/`, and `utils/` files are untouched. This ticket adds screen components alongside them.

### 1.4 Current codebase state

Critical context: the `apps/tui/src/navigation/` and `apps/tui/src/commands/` directories do **not yet exist**. The only existing infrastructure under `apps/tui/src/` is:

```
apps/tui/src/
├── hooks/
│   └── useDiffSyntaxStyle.ts     ← diff syntax style hook (implemented)
├── lib/
│   └── diff-syntax.ts            ← diff syntax highlighting (implemented)
└── screens/
    └── Agents/
        ├── types.ts              ← message types (implemented)
        ├── components/
        │   ├── index.ts          ← barrel export (implemented)
        │   ├── MessageBlock.tsx  ← empty stub
        │   └── ToolBlock.tsx     ← empty stub
        └── utils/
            └── formatTimestamp.ts ← timestamp formatting (implemented)
```

This ticket creates the `navigation/` and `commands/` directories and their foundational files. The `ScreenName` enum, `ScreenDefinition` interface, `GoToBinding` interface, `PaletteCommand`/`CommandContext` types, and `DeepLinkArgs`/`DeepLinkResult` interfaces are all defined for the first time in this ticket. They establish patterns that all subsequent screen registration tickets will follow.

---

## 2. Implementation Plan

### Step 1: Create the `navigation/` directory and `screenRegistry.ts` with types and agent entries

**File:** `apps/tui/src/navigation/screenRegistry.ts` *(new file — directory does not exist yet)*

This file establishes the screen registry system. It defines the `ScreenName` enum, the `ScreenDefinition` interface, and the `screenRegistry` map. The agent entries are added alongside placeholder entries for all other screens defined in the architecture (Dashboard, RepoList, etc.), ensuring the enum is immediately exhaustive.

**`ScreenName` enum:**

```typescript
export enum ScreenName {
  // Core screens
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

  // Agent screens — added by tui-agent-screen-registry
  Agents = "Agents",
  AgentChat = "AgentChat",
  AgentSessionCreate = "AgentSessionCreate",
  AgentSessionReplay = "AgentSessionReplay",
}
```

**`ScreenDefinition` interface:**

```typescript
export interface ScreenDefinition {
  component: React.ComponentType;
  requiresRepo: boolean;
  /**
   * Names of required params. Validated at push time.
   * A push with missing required params logs a warning and aborts.
   */
  params: string[];
  /**
   * Breadcrumb text for the header bar.
   * String: static text.
   * Function: receives the ScreenEntry params and returns display text.
   */
  breadcrumb: string | ((params: Record<string, string>) => string);
}
```

**`ScreenEntry` interface (used by NavigationProvider):**

```typescript
export interface ScreenEntry {
  id: string;
  screen: ScreenName;
  params: Record<string, string>;
  breadcrumb: string;
}
```

**Import block for agent screen components:**

```typescript
import {
  AgentSessionListScreen,
  AgentChatScreen,
  AgentSessionCreateScreen,
  AgentSessionReplayScreen,
} from "../screens/Agents";
```

**Agent registry entries:**

```typescript
const screenRegistry: Record<ScreenName, ScreenDefinition> = {
  // ... other entries (stubs for non-agent screens pending their tickets) ...

  // Agent screens — added by tui-agent-screen-registry
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
};

export { screenRegistry };
```

**Design decision rationale:**

| Decision | Rationale |
|----------|-----------|
| `requiresRepo: true` for all four screens | Agent sessions are scoped to a repository. The navigation system enforces repo context before pushing these screens; without it, it redirects to `RepoList`. |
| `params: ["sessionId"]` for `AgentChat` and `AgentSessionReplay` | These screens require a session identifier to fetch and render. The navigation system validates required params at push time and logs a warning + aborts if any are missing, preventing blank or broken screens. |
| Dynamic breadcrumb for `AgentChat` and `AgentSessionReplay` | The breadcrumb should reflect the session being viewed. The function receives the `ScreenEntry.params` object. The 8-char truncation fits breadcrumbs at minimum terminal width. When full session data loads, the screen component calls `updateBreadcrumb()` to replace the truncated ID with the session title (see §5.1). |
| `params: []` for `Agents` and `AgentSessionCreate` | These screens don't require additional params beyond repo context inherited from the navigation stack. |

**Type propagation:** After adding the `ScreenName` enum values, TypeScript will emit exhaustiveness errors in every `switch (screen)` or `Record<ScreenName, ...>` that does not handle the new values. These are addressed in Steps 2, 3, and 6.

---

### Step 2: Create stub screen components

**Files to create:**
- `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`
- `apps/tui/src/screens/Agents/AgentChatScreen.tsx`
- `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx`
- `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx`
- `apps/tui/src/screens/Agents/index.ts` (root barrel export)

Each stub renders a minimal placeholder that:
1. Identifies the screen by title
2. Calls `useScreen()` to register the screen's breadcrumb title and keybinding scope
3. Displays a non-interactive "Not yet implemented" placeholder

Stubs are **not** experiments or PoC code. They are the simplest valid production components that satisfy the `ScreenRouter`'s exhaustive switch check and the `screenRegistry` map's component reference. They will be replaced by full implementations in subsequent tickets.

**Stub pattern — `AgentSessionListScreen.tsx`:**

```tsx
import React from "react";
import { useScreen } from "../../hooks/useScreen";
import { ScreenName } from "../../navigation/screenRegistry";

export function AgentSessionListScreen() {
  useScreen({ name: ScreenName.Agents, title: "Agent Sessions" });

  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Sessions</text>
      <text color="muted">Not yet implemented.</text>
    </box>
  );
}
```

**Stub pattern — `AgentChatScreen.tsx`:**

```tsx
import React from "react";
import { useScreen } from "../../hooks/useScreen";
import { useNavigation } from "../../navigation/NavigationProvider";
import { ScreenName } from "../../navigation/screenRegistry";

export function AgentChatScreen() {
  const { currentScreen } = useNavigation();
  const sessionId = currentScreen.params.sessionId ?? "(unknown)";

  useScreen({ name: ScreenName.AgentChat, title: `Session: ${sessionId.slice(0, 8)}` });

  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Chat</text>
      <text color="muted">Session: {sessionId}</text>
      <text color="muted">Not yet implemented.</text>
    </box>
  );
}
```

**Stub pattern — `AgentSessionCreateScreen.tsx`:**

```tsx
import React from "react";
import { useScreen } from "../../hooks/useScreen";
import { ScreenName } from "../../navigation/screenRegistry";

export function AgentSessionCreateScreen() {
  useScreen({ name: ScreenName.AgentSessionCreate, title: "New Session" });

  return (
    <box flexDirection="column" padding={1}>
      <text bold>New Agent Session</text>
      <text color="muted">Not yet implemented.</text>
    </box>
  );
}
```

**Stub pattern — `AgentSessionReplayScreen.tsx`:**

```tsx
import React from "react";
import { useScreen } from "../../hooks/useScreen";
import { useNavigation } from "../../navigation/NavigationProvider";
import { ScreenName } from "../../navigation/screenRegistry";

export function AgentSessionReplayScreen() {
  const { currentScreen } = useNavigation();
  const sessionId = currentScreen.params.sessionId ?? "(unknown)";

  useScreen({ name: ScreenName.AgentSessionReplay, title: `Replay: ${sessionId.slice(0, 8)}` });

  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Session Replay</text>
      <text color="muted">Session: {sessionId}</text>
      <text color="muted">Not yet implemented.</text>
    </box>
  );
}
```

**Barrel export — `apps/tui/src/screens/Agents/index.ts`:**

```typescript
export { AgentSessionListScreen } from "./AgentSessionListScreen";
export { AgentChatScreen } from "./AgentChatScreen";
export { AgentSessionCreateScreen } from "./AgentSessionCreateScreen";
export { AgentSessionReplayScreen } from "./AgentSessionReplayScreen";
```

**Coexistence with existing files:** The existing `components/index.ts`, `types.ts`, and `utils/formatTimestamp.ts` are untouched. The new barrel export at `screens/Agents/index.ts` only re-exports the four new screen components. It does **not** re-export `types.ts` or `components/` — those are imported directly by downstream tickets that need them.

**Why stubs must call `useScreen()`:** The `useScreen` hook registers the screen's keybinding scope and breadcrumb with `KeybindingProvider` and `NavigationProvider` on mount. A stub that renders `null` or omits this call causes the header bar to display a blank breadcrumb segment and strips all screen-level key hints from the status bar.

**Note on `useScreen` and `useNavigation`:** These hooks are defined by the TUI's provider infrastructure (`apps/tui/src/hooks/useScreen.ts` and `apps/tui/src/navigation/NavigationProvider.tsx`). If they do not yet exist at implementation time, this ticket must create minimal versions that satisfy the stub components. The minimal `useScreen` hook registers the screen name and title with the NavigationProvider context; the minimal `useNavigation` hook reads the navigation context. See Step 7 for details.

---

### Step 3: Add `g a` go-to keybinding

**File:** `apps/tui/src/navigation/goToBindings.ts` *(new file — directory created in Step 1)*

This file is the single source of truth for all `g {key}` navigation shortcuts.

**`GoToBinding` interface** (defined in this file):

```typescript
import { ScreenName } from "./screenRegistry";

export interface GoToBinding {
  /** Single character pressed after `g` to trigger this binding. */
  key: string;
  /** Destination screen. */
  screen: ScreenName;
  /** If true and no repo context is active, redirect to RepoList instead. */
  requiresRepo: boolean;
  /** Human-readable description shown in help overlay and go-to mode hint. */
  description: string;
}
```

**`goToBindings` array:**

```typescript
export const goToBindings: GoToBinding[] = [
  // Existing bindings — do not change key assignments
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

  // Agent screens — added by tui-agent-screen-registry
  { key: "a", screen: ScreenName.Agents, requiresRepo: true, description: "Agents" },
];
```

**Key collision check:** `a` is not assigned to any existing binding. Verified against the design spec's go-to table (§1.3). No conflict.

**Detailed `g a` behavior sequence:**

1. `KeybindingProvider` detects `g` keypress → enters go-to mode; starts 1500ms timer; shows `-- GO TO --` indicator in the status bar at the left hints position.
2. User presses `a` within 1500ms.
3. Go-to handler performs a linear scan of `goToBindings` for `key === "a"` → finds `{ screen: Agents, requiresRepo: true }`.
4. **Repo context available** (`repoContext !== null`): Navigation stack is **reset** (not pushed) to a fresh three-entry stack. Reset clears the current stack entirely before building the new one.
5. **No repo context** (`repoContext === null`): Handler navigates to `RepoList`; status bar shows `"No repository in context"` in warning color (`theme.warning`) for 2000ms, then clears. Go-to mode is cancelled. No agent screen is pushed.
6. **1500ms timeout without a second key**: Go-to mode is silently cancelled; status bar indicator clears. The `g` key press is consumed (not forwarded to the screen).
7. **Esc pressed during go-to mode**: Go-to mode cancelled. Status bar clears.

**Stack construction for `g a` with repo context `acme/api`:**

```
ScreenEntry[0]: { id: "...", screen: Dashboard,     params: {},                                    breadcrumb: "Dashboard" }
ScreenEntry[1]: { id: "...", screen: RepoOverview,  params: { owner: "acme", repo: "api" },        breadcrumb: "acme/api" }
ScreenEntry[2]: { id: "...", screen: Agents,         params: { owner: "acme", repo: "api" },        breadcrumb: "Agent Sessions" }
```

Rendered header breadcrumb: `Dashboard › acme/api › Agent Sessions`

**Go-to mode suppression (handled by `KeybindingProvider`, no changes required in this ticket):**

- Text input is focused → `g` is a printable character; it goes to the input, never enters go-to mode.
- Modal/overlay is active → `g` is handled by the modal's keybinding scope.
- Terminal is below minimum size (< 80×24) → only `Ctrl+C` is active.

---

### Step 4: Create command types and register palette entries

**File:** `apps/tui/src/commands/types.ts` *(new file — directory does not exist yet)*

Define the `PaletteCommand` and `CommandContext` interfaces used by all command modules:

```typescript
import type { ScreenName } from "../navigation/screenRegistry";

export interface PaletteCommand {
  id: string;
  name: string;
  aliases?: string[];
  description: string;
  category: "Navigate" | "Action" | "Toggle";
  /** Shown next to the command name in the palette when set. */
  keybinding?: string;
  /**
   * Lower number = higher priority in results.
   * Range: 0 (highest) – 100 (lowest).
   */
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
  navigate: (screen: ScreenName, params?: Record<string, string>) => void;
  hasRepoContext: () => boolean;
  getRepoContext: () => { owner: string; repo: string } | null;
  hasWriteAccess: () => boolean;
}
```

**File:** `apps/tui/src/commands/agentCommands.ts` *(new file)*

```typescript
import { ScreenName } from "../navigation/screenRegistry";
import type { CommandContext, PaletteCommand } from "./types";

/**
 * Returns command palette entries for agent screen navigation.
 *
 * Both commands require repo context. The "New Agent Session" command
 * additionally requires write access — it is invisible (not grayed out)
 * to read-only users and guests.
 */
export function createAgentCommands(context: CommandContext): PaletteCommand[] {
  return [
    {
      id: "navigate-agents",
      name: "Agent Sessions",
      aliases: [":agents", "agents"],
      description: "Go to the agent sessions list for this repository",
      category: "Navigate",
      keybinding: "g a",
      priority: 40,
      contextRequirements: { repo: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return; // guard: palette filtering should prevent reaching this
        context.navigate(ScreenName.Agents, { owner: repo.owner, repo: repo.repo });
      },
    },

    {
      id: "create-agent-session",
      name: "New Agent Session",
      aliases: ["Create Agent Session", "new agent", "create agent"],
      description: "Start a new agent session in this repository",
      category: "Action",
      priority: 41,
      contextRequirements: { repo: true, writeAccess: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return; // guard: palette filtering should prevent reaching this
        context.navigate(ScreenName.AgentSessionCreate, {
          owner: repo.owner,
          repo: repo.repo,
        });
      },
    },
  ];
}
```

**Filtering behavior:**

| Command | Visible when | Hidden when |
|---------|-------------|-------------|
| `Agent Sessions` | Repo context is active | No repo context |
| `New Agent Session` | Repo context is active AND `hasWriteAccess()` returns `true` | No repo context OR read-only access |

Hidden commands are **absent** from fuzzy search results — they are not grayed out or disabled. This is enforced by the `CommandPalette` component's pre-filter step, which applies `contextRequirements` before running fuzzy matching. No changes to `CommandPalette` are needed for this filtering to work — it already respects `contextRequirements`.

**Fuzzy match coverage:**

| Input | Matches |
|-------|---------|
| `:agents` | `Agent Sessions` (via alias) |
| `agents` | `Agent Sessions` (via alias) |
| `ag se` | `Agent Sessions` (fuzzy on name) |
| `New Agent` | `New Agent Session` (prefix on name) |
| `Create Agent` | `New Agent Session` (via alias) |
| `new ag` | `New Agent Session` (fuzzy on alias) |
| `nag` | `New Agent Session` (initials of alias) |

---

### Step 5: Wire agent commands into the command registry

**File:** `apps/tui/src/commands/index.ts` *(new file)*

Create the command registry builder that aggregates commands from all modules. This is the integration point where `createAgentCommands` output is merged into the full command list consumed by the `CommandPalette` component.

```typescript
import type { CommandContext, PaletteCommand } from "./types";
import { createAgentCommands } from "./agentCommands";

export type { CommandContext, PaletteCommand };

/**
 * Builds the full command palette entry list by collecting commands
 * from all feature modules.
 *
 * New feature modules should add their createXxxCommands() call here.
 */
export function buildCommandRegistry(context: CommandContext): PaletteCommand[] {
  return [
    // Agent commands — added by tui-agent-screen-registry
    ...createAgentCommands(context),
    // ... other command groups will be added by subsequent tickets ...
  ];
}
```

The `CommandContext` type provides `navigate`, `hasRepoContext`, `getRepoContext`, and `hasWriteAccess`. These are consumed by `createAgentCommands`. No new fields on `CommandContext` are required.

---

### Step 6: Add deep-link parsing for agent screens

**File:** `apps/tui/src/navigation/deepLinks.ts` *(new file)*

Create the deep-link parser with agent screen mappings, `--session-id` argument parsing, and validation.

**`DeepLinkArgs` interface:**

```typescript
export interface DeepLinkArgs {
  screen?: string;
  repo?: string;
  /** Used by agent-chat and agent-replay. Non-empty, no whitespace, max 255 chars. */
  sessionId?: string;
  org?: string;
}
```

**`DeepLinkResult` interface:**

```typescript
import type { ScreenEntry } from "./screenRegistry";

export interface DeepLinkResult {
  stack: ScreenEntry[];
  /**
   * Non-empty when validation failed.
   * Displayed in the status bar for 5 seconds on launch.
   * Stack will contain [Dashboard] as the fallback.
   */
  error?: string;
}
```

**`SCREEN_ID_MAP`:**

```typescript
import { ScreenName } from "./screenRegistry";

const SCREEN_ID_MAP: Record<string, ScreenName> = {
  // Core screen mappings
  dashboard:     ScreenName.Dashboard,
  repos:         ScreenName.RepoList,
  issues:        ScreenName.Issues,
  landings:      ScreenName.Landings,
  workspaces:    ScreenName.Workspaces,
  workflows:     ScreenName.Workflows,
  search:        ScreenName.Search,
  notifications: ScreenName.Notifications,
  settings:      ScreenName.Settings,
  orgs:          ScreenName.Organizations,
  sync:          ScreenName.Sync,
  wiki:          ScreenName.Wiki,

  // Agent deep-links — added by tui-agent-screen-registry
  agents:          ScreenName.Agents,
  "agent-chat":    ScreenName.AgentChat,
  "agent-replay":  ScreenName.AgentSessionReplay,
  // Note: "agent-create" is intentionally absent (see §6.6)
};
```

**`parseCliArgs` function:**

```typescript
export function parseCliArgs(argv: string[]): DeepLinkArgs {
  const args: DeepLinkArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--screen":
        args.screen = next?.toLowerCase();
        i++;
        break;
      case "--repo":
        args.repo = next;
        i++;
        break;
      case "--session-id":
        args.sessionId = next;
        i++;
        break;
      case "--org":
        args.org = next;
        i++;
        break;
    }
  }

  return args;
}
```

**`buildInitialStack` — full implementation with agent cases:**

Add the following `case` blocks inside the `switch (screenName)` statement. Place them after the existing cases, before the `default` case.

**`--session-id` format validation** (placed before the switch statement):

```typescript
// Validate --session-id when provided
if (args.sessionId !== undefined) {
  if (!args.sessionId || /\s/.test(args.sessionId)) {
    return {
      stack: [dashboardEntry()],
      error: `Invalid session ID format: "${args.sessionId || "(empty)"}"`,
    };
  }
  if (args.sessionId.length > 255) {
    return {
      stack: [dashboardEntry()],
      error: "Invalid session ID format: too long (max 255 chars)",
    };
  }
}
```

**Agent screen cases:**

```typescript
case ScreenName.Agents: {
  // codeplane tui --screen agents --repo owner/repo
  if (!repo) {
    return {
      stack: [dashboardEntry()],
      error: "--repo required for agents screen",
    };
  }
  return {
    stack: [
      dashboardEntry(),
      repoOverviewEntry(repo),
      {
        id: generateId(),
        screen: ScreenName.Agents,
        params: { owner: repo.owner, repo: repo.repo },
        breadcrumb: "Agent Sessions",
      },
    ],
  };
}

case ScreenName.AgentChat: {
  // codeplane tui --screen agent-chat --repo owner/repo --session-id {id}
  if (!repo) {
    return {
      stack: [dashboardEntry()],
      error: "--repo required for agent-chat screen",
    };
  }
  if (!args.sessionId) {
    return {
      stack: [dashboardEntry()],
      error: "--session-id required for agent-chat screen",
    };
  }
  return {
    stack: [
      dashboardEntry(),
      repoOverviewEntry(repo),
      {
        id: generateId(),
        screen: ScreenName.Agents,
        params: { owner: repo.owner, repo: repo.repo },
        breadcrumb: "Agent Sessions",
      },
      {
        id: generateId(),
        screen: ScreenName.AgentChat,
        params: { owner: repo.owner, repo: repo.repo, sessionId: args.sessionId },
        breadcrumb: `Session: ${args.sessionId.slice(0, 8)}`,
      },
    ],
  };
}

case ScreenName.AgentSessionReplay: {
  // codeplane tui --screen agent-replay --repo owner/repo --session-id {id}
  if (!repo) {
    return {
      stack: [dashboardEntry()],
      error: "--repo required for agent-replay screen",
    };
  }
  if (!args.sessionId) {
    return {
      stack: [dashboardEntry()],
      error: "--session-id required for agent-replay screen",
    };
  }
  return {
    stack: [
      dashboardEntry(),
      repoOverviewEntry(repo),
      {
        id: generateId(),
        screen: ScreenName.Agents,
        params: { owner: repo.owner, repo: repo.repo },
        breadcrumb: "Agent Sessions",
      },
      {
        id: generateId(),
        screen: ScreenName.AgentSessionReplay,
        params: { owner: repo.owner, repo: repo.repo, sessionId: args.sessionId },
        breadcrumb: `Replay: ${args.sessionId.slice(0, 8)}`,
      },
    ],
  };
}

case ScreenName.AgentSessionCreate: {
  // Not a valid deep-link target — fall through to default
  return {
    stack: [dashboardEntry()],
    error: "agent-create is not a valid deep-link screen",
  };
}
```

**Deep-link validation matrix:**

| CLI invocation | Result stack | Stack depth | Error message |
|----------------|-------------|-------------|---------------|
| `--screen agents --repo acme/api` | `[Dashboard, Repo(acme/api), Agents]` | 3 | — |
| `--screen agent-chat --repo acme/api --session-id abc123` | `[Dashboard, Repo, Agents, AgentChat(abc123)]` | 4 | — |
| `--screen agent-replay --repo acme/api --session-id abc123` | `[Dashboard, Repo, Agents, AgentSessionReplay(abc123)]` | 4 | — |
| `--screen agents` (no `--repo`) | `[Dashboard]` | 1 | `"--repo required for agents screen"` |
| `--screen agent-chat --repo acme/api` (no `--session-id`) | `[Dashboard]` | 1 | `"--session-id required for agent-chat screen"` |
| `--screen agent-replay --repo acme/api` (no `--session-id`) | `[Dashboard]` | 1 | `"--session-id required for agent-replay screen"` |
| `--screen agent-chat --session-id abc` (no `--repo`) | `[Dashboard]` | 1 | `"--repo required for agent-chat screen"` |
| `--screen agent-chat --repo acme/api --session-id "bad id"` | `[Dashboard]` | 1 | `"Invalid session ID format: \"bad id\""` |
| `--screen agent-chat --repo acme/api --session-id ""` | `[Dashboard]` | 1 | `"Invalid session ID format: \"(empty)\""` |
| `--screen agent-chat --repo acme/api --session-id {256+ chars}` | `[Dashboard]` | 1 | `"Invalid session ID format: too long (max 255 chars)"` |

**Error display behavior:** On validation failure, the stack falls back to `[Dashboard]`. The error string is passed to the `AppShell` at startup, which sets a transient status bar message in `theme.warning` color for 5000ms, then clears. The error is not modal — the user can interact with the Dashboard immediately.

**Back navigation from deep-linked agent screens:**

```
AgentChat (deep-link) → q → Agents list → q → RepoOverview → q → Dashboard → q → quit TUI
AgentSessionReplay    → q → Agents list → q → RepoOverview → q → Dashboard → q → quit TUI
Agents                → q → RepoOverview → q → Dashboard → q → quit TUI
```

---

### Step 7: Create minimal supporting infrastructure (if not yet present)

This ticket may be the first to create files in `apps/tui/src/navigation/` and `apps/tui/src/commands/`. If the following supporting files do not already exist at implementation time, create minimal versions. These are **not** stubs — they are the real implementations, just minimal at first.

**File:** `apps/tui/src/hooks/useScreen.ts` *(new file if not present)*

```typescript
import { useEffect } from "react";
import type { ScreenName } from "../navigation/screenRegistry";

interface UseScreenOptions {
  name: ScreenName;
  title: string;
  keybindings?: Array<{ key: string; description: string; handler: () => void }>;
}

/**
 * Registers the current screen's name, title, and keybindings with the
 * NavigationProvider and KeybindingProvider. Call once at the top of
 * each screen component.
 */
export function useScreen(options: UseScreenOptions): { isActive: boolean } {
  // Minimal implementation: keybinding registration and breadcrumb
  // will be wired by the NavigationProvider/KeybindingProvider tickets.
  // For now, this is a no-op that satisfies the type contract.
  return { isActive: true };
}
```

**File:** `apps/tui/src/navigation/NavigationProvider.tsx` *(new file if not present)*

```typescript
import React, { createContext, useContext } from "react";
import type { ScreenEntry, ScreenName } from "./screenRegistry";

interface NavigationContextValue {
  stack: ScreenEntry[];
  push(screen: ScreenName, params?: Record<string, string>): void;
  pop(): void;
  replace(screen: ScreenName, params?: Record<string, string>): void;
  reset(screen: ScreenName, params?: Record<string, string>): void;
  canGoBack: boolean;
  currentScreen: ScreenEntry;
  repoContext: { owner: string; repo: string } | null;
  updateBreadcrumb(text: string): void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}

// Full NavigationProvider implementation deferred to tui-foundation-scaffold ticket.
// This file establishes the type contract and context.
export { NavigationContext };
```

These files establish type contracts consumed by the stub components. The full `NavigationProvider` implementation (state management, stack operations, breadcrumb computation) is deferred to the `tui-foundation-scaffold` ticket but the types and context created here are permanent.

---

## 3. File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/tui/src/navigation/screenRegistry.ts` | **Create** | `ScreenName` enum, `ScreenDefinition` interface, `ScreenEntry` interface, `screenRegistry` map with agent entries |
| `apps/tui/src/navigation/goToBindings.ts` | **Create** | `GoToBinding` interface, `goToBindings` array with `g a` for Agents |
| `apps/tui/src/navigation/deepLinks.ts` | **Create** | `DeepLinkArgs`, `DeepLinkResult`, `SCREEN_ID_MAP`, `parseCliArgs`, `buildInitialStack` with agent cases and session-id validation |
| `apps/tui/src/navigation/NavigationProvider.tsx` | **Create** (if not present) | `NavigationContext`, `useNavigation` hook, type contracts |
| `apps/tui/src/commands/types.ts` | **Create** | `PaletteCommand` and `CommandContext` interfaces |
| `apps/tui/src/commands/agentCommands.ts` | **Create** | Factory for `navigate-agents` and `create-agent-session` palette commands |
| `apps/tui/src/commands/index.ts` | **Create** | `buildCommandRegistry` aggregating all command modules |
| `apps/tui/src/hooks/useScreen.ts` | **Create** (if not present) | `useScreen` hook for screen registration |
| `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` | **Create** | Stub component; calls `useScreen({ name: Agents })` |
| `apps/tui/src/screens/Agents/AgentChatScreen.tsx` | **Create** | Stub component; reads `sessionId` from `currentScreen.params`; calls `useScreen({ name: AgentChat })` |
| `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx` | **Create** | Stub component; calls `useScreen({ name: AgentSessionCreate })` |
| `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx` | **Create** | Stub component; reads `sessionId` from `currentScreen.params`; calls `useScreen({ name: AgentSessionReplay })` |
| `apps/tui/src/screens/Agents/index.ts` | **Create** | Barrel export for all four agent screen stubs |

**New files:** 13 (or 11 if `useScreen.ts` and `NavigationProvider.tsx` already exist)
**Modified files:** 0
**Deleted files:** 0

**Existing files NOT modified:**

| File | Status |
|------|--------|
| `apps/tui/src/screens/Agents/types.ts` | Unchanged |
| `apps/tui/src/screens/Agents/components/MessageBlock.tsx` | Unchanged |
| `apps/tui/src/screens/Agents/components/ToolBlock.tsx` | Unchanged |
| `apps/tui/src/screens/Agents/components/index.ts` | Unchanged |
| `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` | Unchanged |
| `apps/tui/src/hooks/useDiffSyntaxStyle.ts` | Unchanged |
| `apps/tui/src/lib/diff-syntax.ts` | Unchanged |

---

## 4. Data Layer

This ticket does not consume any `@codeplane/ui-core` data hooks. All data access is deferred to the screen implementation tickets (`tui-agent-session-list`, `tui-agent-chat-screen`, etc.).

The only runtime data dependencies are:
- `NavigationProvider` → provides `repoContext` and `currentScreen.params` (type contract established in this ticket)
- `AuthProvider` → provides write-access information used by the command palette (already defined in architecture)

No new API calls, no new SSE subscriptions, no new data hooks.

---

## 5. Breadcrumb Generation

Breadcrumbs are derived from the navigation stack. Each `ScreenEntry` has a `breadcrumb` field (string or function). The `HeaderBar` component joins the values with ` › `.

**Agent breadcrumb examples:**

| Navigation path | Breadcrumb trail |
|----------------|-----------------|
| `g a` from `acme/api` | `Dashboard › acme/api › Agent Sessions` |
| Enter on session row (in list) | `Dashboard › acme/api › Agent Sessions › Session: abc123de` |
| `n` key from session list | `Dashboard › acme/api › Agent Sessions › New Session` |
| `r` on completed session | `Dashboard › acme/api › Agent Sessions › Replay: abc123de` |
| Deep-link `--screen agents --repo acme/api` | `Dashboard › acme/api › Agent Sessions` |
| Deep-link `--screen agent-chat --session-id sess-abc123` | `Dashboard › acme/api › Agent Sessions › Session: sess-abc` |
| Deep-link `--screen agent-replay --session-id sess-abc123` | `Dashboard › acme/api › Agent Sessions › Replay: sess-abc` |

**Truncation at minimum breakpoint (80×24):**

When total breadcrumb text exceeds available header width, truncation proceeds left-to-right from the oldest ancestor. The current screen's breadcrumb is always fully visible. Truncated parents are replaced with `…`:

```
… › Agent Sessions › Session: abc123de
```

### 5.1 Dynamic breadcrumb updates

`AgentChatScreen` and `AgentSessionReplayScreen` will call `updateBreadcrumb(title)` after loading session metadata from the API (in their full implementations, not stubs). This replaces the truncated session ID with the human-readable title:

```typescript
// Pattern for full implementation (not this ticket):
const { session } = useAgentSession(owner, repo, sessionId);
const { updateBreadcrumb } = useNavigation();

useEffect(() => {
  if (session?.title) {
    updateBreadcrumb(`Session: ${session.title}`);
  }
}, [session?.title]);
```

This pattern mirrors `IssueDetailScreen`, which updates its breadcrumb from `#42` to the issue title after the issue loads.

---

## 6. Edge Cases and Error Handling

### 6.1 `g a` without repo context

**Behavior:** Navigate to `RepoList` screen. Status bar shows `"No repository in context"` in `theme.warning` color (ANSI 178) for 2000ms, then clears.

**Implementation:** The go-to handler in `KeybindingProvider` checks `requiresRepo` on the matched binding. When `true` and `repoContext` is `null`, it calls `navigate(ScreenName.RepoList)` and enqueues the transient warning. Identical behavior applies to `g i` (Issues), `g l` (Landings), `g f` (Workflows), and `g k` (Wiki).

### 6.2 `g a` timeout (no second key within 1500ms)

**Behavior:** Go-to mode is silently cancelled. The `-- GO TO --` status bar indicator clears. The `g` key is consumed (not forwarded to the screen).

**Implementation:** The `KeybindingProvider` sets a timeout on entering go-to mode. On expiry, `goToModeActive` is set to `false` and the status bar hint is removed. No navigation occurs.

### 6.3 `Esc` during go-to mode

**Behavior:** Identical to timeout — go-to mode is cancelled, status bar clears.

### 6.4 `New Agent Session` without write access

**Behavior:** The command is invisible in palette results. It never appears, even as a grayed-out entry.

**Implementation:** `contextRequirements.writeAccess: true` causes the command to be filtered out by the palette's `applyContextFilter()` step before fuzzy matching runs. The filter receives `{ hasWriteAccess: context.hasWriteAccess() }` and excludes commands whose `contextRequirements.writeAccess` is `true` when the value is `false`.

### 6.5 Deep-link with missing required arguments

| Missing argument | Screen | Error in status bar | Stack |
|-----------------|--------|-------------------|-------|
| `--repo` | `agents`, `agent-chat`, `agent-replay` | `"--repo required for {screen} screen"` | `[Dashboard]` |
| `--session-id` | `agent-chat`, `agent-replay` | `"--session-id required for {screen} screen"` | `[Dashboard]` |
| Both `--repo` and `--session-id` | `agent-chat` | `"--repo required for agent-chat screen"` (first check) | `[Dashboard]` |
| Invalid `--repo` format | any | `"Invalid repository format: {value} (expected OWNER/REPO)"` | `[Dashboard]` |
| `--session-id` contains whitespace | `agent-chat`, `agent-replay` | `"Invalid session ID format: \"{value}\""` | `[Dashboard]` |
| `--session-id` is empty string | `agent-chat`, `agent-replay` | `"Invalid session ID format: \"(empty)\""` | `[Dashboard]` |
| `--session-id` exceeds 255 chars | `agent-chat`, `agent-replay` | `"Invalid session ID format: too long (max 255 chars)"` | `[Dashboard]` |

Error messages are shown in `theme.warning` color for 5000ms in the status bar. Non-modal; user can interact with the Dashboard immediately.

### 6.6 `agent-create` is not a deep-link target

Agent session creation (`AgentSessionCreate`) is intentionally absent from `SCREEN_ID_MAP`. The creation screen is a transient form reachable only from:
- The session list via the `n` keybinding
- The command palette via `New Agent Session`

Deep-linking to a creation form is an anti-pattern: it bypasses the session list context, provides no back-navigation into the list, and gives the user no way to see existing sessions. If a user attempts `--screen agent-create`, the `SCREEN_ID_MAP` lookup returns `undefined`, and `buildInitialStack` falls back to `[Dashboard]` with the standard unknown-screen error message.

### 6.7 Screen registry exhaustiveness

`ScreenRouter` and `buildInitialStack` both perform an exhaustive `switch` over `ScreenName`. Adding new enum values without corresponding `case` blocks causes TypeScript compilation errors (not warnings). The stub components in Step 2 satisfy the `ScreenRouter` requirement. The `case` blocks in Step 6 satisfy `buildInitialStack`. The `Record<ScreenName, ScreenDefinition>` type in `screenRegistry` produces a type error for any missing enum value, caught at compile time.

### 6.8 Navigation push with invalid repo context

If `ScreenName.Agents` (or any other `requiresRepo: true` screen) is pushed programmatically without a `repoContext`, `NavigationProvider.push()` logs a warning and aborts the push. This is a safety net for programmatic callers — the go-to handler and command palette actions both guard this explicitly before calling `navigate()`.

### 6.9 Concurrent go-to cancellation

If the user presses `g` and then a rapid sequence of unrelated keys (e.g., `g x j k`), the `x` key resolves go-to mode with no match (silent cancel), and subsequent `j k` keys fall through to the screen's keybinding scope. There is no dangling timer state — the 1500ms timeout is cleared on any key that resolves or cancels go-to mode.

### 6.10 Deep-link `--session-id` with very long values

Session IDs up to 255 characters are accepted. IDs exceeding 255 characters are rejected with `"Invalid session ID format: too long (max 255 chars)"`. This prevents pathological breadcrumb truncation calculations and URL construction in downstream API calls.

### 6.11 Multiple `--screen` or `--session-id` arguments

If the CLI receives duplicate arguments (e.g., `--screen agents --screen issues`), the last value wins. This is standard CLI argument parsing behavior and is implemented by the `for` loop overwriting `args.screen` on each match.

### 6.12 Case sensitivity in `--screen` values

The `--screen` value is lowercased in `parseCliArgs` (`next?.toLowerCase()`). This means `--screen Agents`, `--screen AGENTS`, and `--screen agents` all resolve to the same screen. The `SCREEN_ID_MAP` keys are all lowercase.

---

## 7. Unit & Integration Tests

**Test file:** `e2e/tui/agents.test.ts`

All tests below go in a `describe("Agent screen registry")` block. Tests use `@microsoft/tui-test` with `launchTUI` from `e2e/tui/helpers.ts`. All tests launch a fresh TUI instance; no shared state between tests.

Tests that fail due to unimplemented backends (API calls, SSE) are left failing. They are **never** skipped, commented out, or wrapped in `try/catch` to hide failures.

### 7.1 Go-to navigation tests

```typescript
import { test, expect, describe } from "bun:test";
import { launchTUI } from "./helpers";

describe("Agent screen registry", () => {
  describe("go-to navigation", () => {
    test("g a navigates to agent sessions when repo context is active", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys("g", "a");
      await terminal.waitForText("Agent Sessions");

      // Breadcrumb shows full path
      expect(terminal.getLine(0)).toMatch(/Dashboard.*›.*acme\/api.*›.*Agent Sessions/);

      await terminal.terminate();
    });

    test("g a without repo context navigates to repo list with warning", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });

      await terminal.sendKeys("g", "a");

      // Should land on repo list, not agent sessions
      await terminal.waitForText("Repositories");
      await terminal.waitForNoText("Agent Sessions");

      // Status bar shows context warning (appears within 2s)
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/No repository in context/);

      await terminal.terminate();
    });

    test("g shows go-to mode indicator in status bar", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys("g");

      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/GO TO/);

      await terminal.terminate();
    });

    test("Esc cancels go-to mode without navigating", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      // Confirm we start on Dashboard
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("g");
      await terminal.sendKeys("Escape");

      // Status bar go-to indicator should be gone
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).not.toMatch(/GO TO/);

      // Still on Dashboard, not on any other screen
      expect(terminal.getLine(0)).not.toMatch(/Agent Sessions/);

      await terminal.terminate();
    });

    test("g a builds correct navigation stack with back navigation", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys("g", "a");
      await terminal.waitForText("Agent Sessions");

      // q → repo overview
      await terminal.sendKeys("q");
      await terminal.waitForText("acme/api");
      await terminal.waitForNoText("Agent Sessions");
      expect(terminal.getLine(0)).toMatch(/Dashboard.*›.*acme\/api/);

      // q → dashboard
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");
      expect(terminal.getLine(0)).not.toMatch(/acme\/api/);

      await terminal.terminate();
    });
  });
```

### 7.2 Command palette tests

```typescript
  describe("command palette", () => {
    test("':agents' alias navigates to agent sessions", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");

      await terminal.sendText(":agents");
      await terminal.waitForText("Agent Sessions");

      // Select and execute the top result
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Agent Sessions");

      // Breadcrumb confirms navigation
      expect(terminal.getLine(0)).toMatch(/Agent Sessions/);

      await terminal.terminate();
    });

    test("'Agent Sessions' fuzzy matches partial query", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("ag se");
      await terminal.waitForText("Agent Sessions");

      await terminal.terminate();
    });

    test("'New Agent Session' command visible with repo context and write access", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("New Agent");
      await terminal.waitForText("New Agent Session");

      await terminal.terminate();
    });

    test("'New Agent Session' command hidden without repo context", async () => {
      // No --repo arg: no repo context
      const terminal = await launchTUI({ cols: 120, rows: 40 });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("New Agent");

      // Must NOT appear — it is filtered out, not grayed out
      await terminal.waitForNoText("New Agent Session");

      await terminal.terminate();
    });

    test("'Agent Sessions' command hidden without repo context", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText(":agents");

      // Command should not appear when no repo context
      await terminal.waitForNoText("Agent Sessions");

      await terminal.terminate();
    });
  });
```

### 7.3 Deep-link tests

```typescript
  describe("deep-links", () => {
    test("--screen agents --repo opens agent session list with correct stack", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.getLine(0)).toMatch(/Dashboard.*›.*acme\/api.*›.*Agent Sessions/);

      await terminal.terminate();
    });

    test("--screen agent-chat --repo --session-id opens chat screen with session in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "sess-abc123"],
      });

      await terminal.waitForText("Session");
      expect(terminal.getLine(0)).toMatch(
        /Dashboard.*›.*acme\/api.*›.*Agent Sessions.*›.*Session/,
      );

      await terminal.terminate();
    });

    test("--screen agent-replay --repo --session-id opens replay screen with replay in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "sess-abc123"],
      });

      await terminal.waitForText("Replay");
      expect(terminal.getLine(0)).toMatch(
        /Dashboard.*›.*acme\/api.*›.*Agent Sessions.*›.*Replay/,
      );

      await terminal.terminate();
    });

    test("--screen agents without --repo shows error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents"],
      });

      await terminal.waitForText("Dashboard");
      // Error shown in status bar
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/--repo required/);

      await terminal.terminate();
    });

    test("--screen agent-chat without --session-id shows error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/--session-id required/);

      await terminal.terminate();
    });

    test("--screen agent-replay without --session-id shows error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/--session-id required/);

      await terminal.terminate();
    });

    test("--session-id with whitespace shows format error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "bad id"],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Invalid session ID format/);

      await terminal.terminate();
    });

    test("--screen value is case-insensitive", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "AGENTS", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.getLine(0)).toMatch(/Agent Sessions/);

      await terminal.terminate();
    });

    test("deep-linked agent chat supports full back navigation through pre-built stack", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "sess-abc123"],
      });

      // Start at chat
      await terminal.waitForText("Session");

      // q → Agents list
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions");
      await terminal.waitForNoText("Session: sess-ab");

      // q → Repo overview
      await terminal.sendKeys("q");
      await terminal.waitForText("acme/api");
      await terminal.waitForNoText("Agent Sessions");

      // q → Dashboard
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");

      await terminal.terminate();
    });

    test("deep-linked agent replay supports full back navigation through pre-built stack", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "sess-xyz789"],
      });

      // Start at replay
      await terminal.waitForText("Replay");

      // q → Agents list
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions");

      // q → Repo overview
      await terminal.sendKeys("q");
      await terminal.waitForText("acme/api");

      // q → Dashboard
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");

      await terminal.terminate();
    });
  });
```

### 7.4 Screen registry tests

```typescript
  describe("screen registry", () => {
    test("Agents screen registered — reachable by deep-link with requiresRepo satisfied", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      await terminal.terminate();
    });

    test("AgentChat screen registered — requires sessionId param (validated at deep-link parse)", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api"],
        // Intentionally missing --session-id
      });

      // Missing sessionId → error fallback to Dashboard
      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });

    test("AgentSessionReplay screen registered — requires sessionId param (validated at deep-link parse)", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api"],
        // Intentionally missing --session-id
      });

      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });

    test("agent-create is not a deep-link target — unknown screen falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-create", "--repo", "acme/api"],
      });

      // Unknown screen ID → defaults to Dashboard (no error about agent-create specifically)
      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });
  });
```

### 7.5 Snapshot tests

```typescript
  describe("snapshots", () => {
    test("agent session list stub renders at 120x40", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("agent session list stub renders at 80x24 (minimum breakpoint)", async () => {
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("agent chat stub renders at 120x40 with session id in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "sess-001"],
      });

      await terminal.waitForText("Session");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("agent replay stub renders at 120x40 with replay in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "sess-001"],
      });

      await terminal.waitForText("Replay");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("agent session list stub renders at 200x60 (large breakpoint)", async () => {
      const terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });
  });
});
```

### 7.6 Test summary

| Test category | Count | What is verified |
|---------------|-------|-----------------|
| Go-to navigation | 5 | `g a` with/without repo context, go-to mode indicator, Esc cancellation, full back-navigation stack |
| Command palette | 5 | `:agents` execution, fuzzy matching, `New Agent Session` visibility with/without context, `Agent Sessions` hidden without context |
| Deep-links | 10 | All three valid screens, missing `--repo`, missing `--session-id` (×2), invalid session-id format, case-insensitive screen arg, full back-navigation for chat and replay |
| Screen registry | 4 | Reachability, `AgentChat` param enforcement, `AgentSessionReplay` param enforcement, `agent-create` not a deep-link |
| Snapshots | 5 | Stub rendering at 80×24, 120×40, and 200×60 for all reachable stubs |
| **Total** | **29** | |

**Test philosophy compliance:**
- Tests validate user-facing behavior (navigation targets, breadcrumbs, error messages, command visibility), not implementation internals.
- No mocking of `screenRegistry`, `goToBindings`, `deepLinks`, or any internal module.
- Each test launches a fresh TUI instance via `launchTUI`.
- Tests that fail due to unimplemented backends are left failing — never skipped or commented out.
- Snapshot tests are supplementary; interaction tests are the primary verification mechanism.
- Snapshots at three breakpoints (80×24, 120×40, 200×60) cover responsive layout regressions per the testing philosophy.

---

## 8. Productionization Notes

### 8.1 Stub screen lifecycle

The four stub screen components are intentional scaffolding that will be replaced by full implementations in subsequent tickets:

| Stub | Replaced by ticket | Prerequisite tickets |
|------|---------------------|---------------------|
| `AgentSessionListScreen` | `tui-agent-session-list` | `tui-agent-data-hooks` |
| `AgentChatScreen` | `tui-agent-chat-screen` | `tui-agent-sse-stream-hook`, `tui-agent-message-block` |
| `AgentSessionCreateScreen` | `tui-agent-session-create` | `tui-agent-session-list` |
| `AgentSessionReplayScreen` | `tui-agent-session-replay` | `tui-agent-message-block` |

### 8.2 What is permanent vs. what is replaced

**Permanent (do not modify in downstream tickets):**
- `ScreenName` enum values — canonical identifiers referenced everywhere
- `ScreenDefinition` and `ScreenEntry` interfaces — the type contracts for all screen registration
- `screenRegistry` map entries — component reference will be updated in-place, but the key and metadata structure persists
- `GoToBinding` interface and go-to binding `{ key: "a", screen: Agents }` — never reassign this key
- `PaletteCommand` and `CommandContext` interfaces — the type contracts for all command modules
- Command palette entries in `agentCommands.ts` — may be extended but not removed
- All deep-link mappings in `SCREEN_ID_MAP` — new entries may be added but existing ones must not change
- `DeepLinkArgs` and `DeepLinkResult` interfaces — may be extended with new fields, never remove existing ones
- All 29 tests — may be extended but never deleted

**Replaced by downstream tickets:**
- Stub component implementations → full React screen components
- Stub `breadcrumb` functions in `screenRegistry` → may be refined to use live session titles via `updateBreadcrumb()` (see §5.1)
- Minimal `useScreen` implementation → full implementation with keybinding scope registration
- Minimal `NavigationProvider` type contract → full state management implementation

### 8.3 No PoC code

This ticket is pure registry wiring and type contract establishment. All code written is immediately production-grade. Stubs are the minimal valid implementation, not experiments. There is no `poc/` output to graduate.

### 8.4 TypeScript exhaustiveness and compile-time safety

Adding `ScreenName` enum values triggers compile-time errors (not warnings) in:

1. `ScreenRouter` — `switch (currentScreen.screen)` must handle all cases. ✅ Satisfied by stubs in Step 2.
2. `buildInitialStack` — `switch (screenName)` must handle all cases. ✅ Satisfied by cases in Step 6.
3. `screenRegistry` — `Record<ScreenName, ScreenDefinition>` must have an entry for every enum value. ✅ Satisfied by Step 1.

No suppressions (`@ts-ignore`, `as any`) are permitted. All type errors must be resolved in this ticket.

### 8.5 Naming conventions

| Element | Convention | Example |
|---------|-----------|---------|
| `ScreenName` enum values | PascalCase | `AgentSessionCreate` |
| `screenRegistry` map keys | Bracket notation with enum | `[ScreenName.AgentChat]` |
| Deep-link `--screen` arg values | kebab-case | `agent-chat` |
| Command palette `id` field | kebab-case | `create-agent-session` |
| Screen component file names | PascalCase + `Screen.tsx` suffix | `AgentChatScreen.tsx` |
| Interface files | camelCase `.ts` | `types.ts` |
| Go-to binding keys | single lowercase letter | `a` |

### 8.6 Integration with existing Agents directory

The existing files in `apps/tui/src/screens/Agents/` (`types.ts`, `components/`, `utils/`) are not part of this ticket's delivery scope. They were created by prior work and will be consumed by downstream feature tickets. This ticket adds screen components alongside them without modifying or re-exporting them. The directory structure after this ticket:

```
apps/tui/src/
├── commands/
│   ├── types.ts                         ← NEW (PaletteCommand, CommandContext)
│   ├── agentCommands.ts                 ← NEW (createAgentCommands factory)
│   └── index.ts                         ← NEW (buildCommandRegistry)
├── hooks/
│   ├── useDiffSyntaxStyle.ts            ← EXISTING (unchanged)
│   └── useScreen.ts                     ← NEW (screen registration hook)
├── lib/
│   └── diff-syntax.ts                   ← EXISTING (unchanged)
├── navigation/
│   ├── screenRegistry.ts                ← NEW (ScreenName, ScreenDefinition, registry)
│   ├── goToBindings.ts                  ← NEW (GoToBinding, goToBindings array)
│   ├── deepLinks.ts                     ← NEW (DeepLinkArgs, SCREEN_ID_MAP, parser)
│   └── NavigationProvider.tsx           ← NEW (NavigationContext, useNavigation)
└── screens/
    └── Agents/
        ├── index.ts                     ← NEW (barrel: screen components only)
        ├── AgentSessionListScreen.tsx   ← NEW (stub)
        ├── AgentChatScreen.tsx          ← NEW (stub)
        ├── AgentSessionCreateScreen.tsx ← NEW (stub)
        ├── AgentSessionReplayScreen.tsx ← NEW (stub)
        ├── types.ts                     ← EXISTING (unchanged)
        ├── components/
        │   ├── index.ts                 ← EXISTING (unchanged)
        │   ├── MessageBlock.tsx         ← EXISTING (unchanged)
        │   └── ToolBlock.tsx            ← EXISTING (unchanged)
        └── utils/
            └── formatTimestamp.ts       ← EXISTING (unchanged)
```

### 8.7 Pattern establishment

This ticket establishes patterns that all subsequent screen registration tickets must follow:

1. **Screen registration pattern:** Add to `ScreenName` enum → create stub component → add to `screenRegistry` map → add to `ScreenRouter` switch → add to `buildInitialStack` switch.
2. **Go-to binding pattern:** Add entry to `goToBindings` array with key collision check.
3. **Command palette pattern:** Create `createXxxCommands(context)` factory → register in `buildCommandRegistry`.
4. **Deep-link pattern:** Add to `SCREEN_ID_MAP` → add `case` block to `buildInitialStack`.
5. **Stub component pattern:** Call `useScreen()` → render minimal placeholder with title and "Not yet implemented" text.

Future screen registration tickets (Issues, Workflows, Wiki, etc.) should reference this ticket as the canonical example.

---

## 9. Acceptance Criteria Checklist

| # | Criterion | Verification method |
|---|-----------|---------------------|
| 1 | All four agent screens registered in `screenRegistry` with correct `requiresRepo` flags and `params` | TypeScript: `Record<ScreenName, ScreenDefinition>` is exhaustive. Test: screen registry tests in `agents.test.ts`. |
| 2 | `g a` navigates to Agents screen when repo context is active | Test: "g a navigates to agent sessions when repo context is active" |
| 3 | `g a` without repo context redirects to repo list with status bar warning | Test: "g a without repo context navigates to repo list with warning" |
| 4 | `g` shows go-to mode indicator before second key | Test: "g shows go-to mode indicator in status bar" |
| 5 | `Esc` during go-to mode cancels it without navigating | Test: "Esc cancels go-to mode without navigating" |
| 6 | `:agents` command palette alias navigates to Agents | Test: "':agents' alias navigates to agent sessions" |
| 7 | `New Agent Session` palette entry visible with repo context and write access | Test: "'New Agent Session' command visible with repo context and write access" |
| 8 | `New Agent Session` palette entry hidden without repo context | Test: "'New Agent Session' command hidden without repo context" |
| 9 | `Agent Sessions` palette entry hidden without repo context | Test: "'Agent Sessions' command hidden without repo context" |
| 10 | Deep-link `--screen agents --repo` opens session list with correct breadcrumb | Test: "--screen agents --repo opens agent session list with correct stack" |
| 11 | Deep-link `--screen agent-chat --repo --session-id` opens chat screen | Test: "--screen agent-chat --repo --session-id opens chat screen with session in breadcrumb" |
| 12 | Deep-link `--screen agent-replay --repo --session-id` opens replay screen | Test: "--screen agent-replay --repo --session-id opens replay screen with replay in breadcrumb" |
| 13 | Deep-link missing `--repo` shows error and falls back to dashboard | Tests: "--screen agents without --repo" |
| 14 | Deep-link missing `--session-id` shows error and falls back to dashboard | Tests: two "without --session-id" tests |
| 15 | Invalid `--session-id` (whitespace) shows format error | Test: "--session-id with whitespace shows format error" |
| 16 | `--screen` value is case-insensitive | Test: "--screen value is case-insensitive" |
| 17 | `--screen agent-create` is not a valid deep-link (falls back to dashboard) | Test: "agent-create is not a deep-link target" |
| 18 | Back navigation from deep-linked agent chat traverses full pre-built stack | Test: "deep-linked agent chat supports full back navigation through pre-built stack" |
| 19 | Back navigation from deep-linked agent replay traverses full pre-built stack | Test: "deep-linked agent replay supports full back navigation through pre-built stack" |
| 20 | TypeScript compiles without errors after all enum, registry, router, and deep-link changes | `bun tsc --noEmit` passes |
| 21 | Existing `types.ts`, `components/`, and `utils/` files in Agents directory are unchanged | `git diff` shows no modifications to those files |
| 22 | Snapshot tests pass at 80×24, 120×40, and 200×60 breakpoints | Tests: snapshot test suite |

---

## 10. Dependencies

**Upstream:** None. This ticket has no dependencies and can be implemented immediately.

**Downstream:** All five agent feature tickets depend on this ticket:

| Ticket | Dependency on this ticket |
|--------|--------------------------|
| `tui-agent-session-list` | `ScreenName.Agents`, `screenRegistry[Agents]`, go-to `g a` binding |
| `tui-agent-chat-screen` | `ScreenName.AgentChat`, `screenRegistry[AgentChat]` with `params: ["sessionId"]` |
| `tui-agent-session-create` | `ScreenName.AgentSessionCreate`, command palette `create-agent-session` |
| `tui-agent-session-replay` | `ScreenName.AgentSessionReplay`, `screenRegistry[AgentSessionReplay]` with `params: ["sessionId"]` |
| `tui-agent-e2e-scaffolding` | `ScreenName` enum values referenced in `e2e/tui/helpers.ts` type stubs |
| `tui-foundation-scaffold` | `ScreenEntry`, `ScreenDefinition`, `NavigationContext` types established here |

Additionally, all future screen registration tickets (Issues, Workflows, Wiki, etc.) depend on the patterns and type contracts established by this ticket.
