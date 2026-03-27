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

This ticket corrects and completes the agent screen wiring across the TUI's screen registry, go-to keybinding system, deep-link parser, and command palette. After this work, agent screens are fully reachable through every navigation pathway — go-to mode (`g a`), the command palette (`:agents`, `New Agent Session`), and CLI deep-links (`--screen agents`, `--screen agent-chat`, `--screen agent-replay`). No agent screen components are functionally implemented in this ticket; only registry corrections, deep-link additions, CLI arg parsing, command palette entries, and minimal stub screen components.

### 1.1 Motivation

The TUI's navigation system is registry-driven. A screen does not exist to the user unless it is registered in:

1. The `ScreenName` enum (canonical identifier) — **already exists for all agent screens**
2. The `screenRegistry` map (component and metadata) — **exists but `requiresRepo` is wrong**
3. The go-to binding table (`goToBindings.ts`) — **exists but `requiresRepo` is wrong**
4. The command palette — **does not exist yet**
5. The deep-link parser (`deepLinks.ts`) — **partially exists; missing `agent-chat`, `agent-replay`, and `--session-id`**
6. CLI arg parsing (`lib/terminal.ts`) — **missing `--session-id` flag**
7. Stub screen components — **do not exist yet**

This ticket is a prerequisite for all agent feature screen implementations (`AgentSessionList`, `AgentChat`, `AgentSessionCreate`, `AgentSessionReplay`).

### 1.2 Scope

| In scope | Out of scope |
|----------|--------------|
| Fix `requiresRepo: true` for agent screen registry entries | Agent screen component implementations |
| Fix `requiresRepo: true` for `g a` go-to binding | Data hooks (`useAgentSessions`, etc.) |
| Add `--session-id` CLI arg parsing | SSE streaming integration |
| Add `agent-chat` and `agent-replay` to deep-link screen map | MessageBlock / ToolBlock implementations |
| Add agent screens to deep-link `requiresRepo` list | Any visual rendering of agent screens |
| Create command palette infrastructure (`commands/` directory) | Wiki, org, or any other screen wiring |
| Create agent palette commands | |
| Create stub screen components for the four agent screens | |
| Create barrel export at `screens/Agents/index.ts` | |

### 1.3 Current Codebase State

**Critical finding:** The existing engineering spec assumed most infrastructure did not exist. In reality, the codebase has evolved significantly:

#### What already exists (no changes needed):

| File | Status |
|------|--------|
| `apps/tui/src/router/types.ts` | **Exists** — `ScreenName` enum has all 35 entries including `Agents`, `AgentSessionList`, `AgentChat`, `AgentSessionCreate`, `AgentSessionReplay`. Also has `ScreenEntry`, `NavigationContext`, `ScreenDefinition`, `ScreenComponentProps`, `MAX_STACK_DEPTH=32`, `DEFAULT_ROOT_SCREEN` |
| `apps/tui/src/router/registry.ts` | **Exists** — full `screenRegistry` map for all 35 screens with runtime exhaustiveness check |
| `apps/tui/src/router/ScreenRouter.tsx` | **Exists** — renders current screen from registry |
| `apps/tui/src/providers/NavigationProvider.tsx` | **Exists** — full stack-based navigation with push/pop/replace/reset, repo/org context extraction, scroll position caching, duplicate prevention |
| `apps/tui/src/providers/KeybindingProvider.tsx` | **Exists** — 5-priority layered keybinding system |
| `apps/tui/src/navigation/goToBindings.ts` | **Exists** — 11 bindings including `g a` for Agents |
| `apps/tui/src/navigation/deepLinks.ts` | **Exists** — `buildInitialStack()` with `resolveScreenName()` and `agents` mapping |
| `apps/tui/src/screens/PlaceholderScreen.tsx` | **Exists** — generic placeholder accepting `ScreenComponentProps` |
| `apps/tui/src/components/GlobalKeybindings.tsx` | **Exists** — registers global keybindings including `g` for go-to mode |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | **Exists** — registers PRIORITY.GLOBAL scope |
| `apps/tui/src/screens/Agents/types.ts` | **Exists** — `MessageRole`, `MessagePart`, `AgentMessage` |
| `apps/tui/src/screens/Agents/components/` | **Exists** — stub MessageBlock.tsx and ToolBlock.tsx |
| `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` | **Exists** — relative timestamp formatting |
| `e2e/tui/helpers.ts` | **Exists** — full test infrastructure with `launchTUI`, `TUITestInstance`, key resolution |
| `e2e/tui/agents.test.ts` | **Exists** — 518 E2E test stubs for the agent feature group |

#### What exists but needs modification:

| File | Issue | Required change |
|------|-------|----------------|
| `apps/tui/src/router/registry.ts` | Agent screens have `requiresRepo: false` | Change `AgentSessionList`, `AgentChat`, `AgentSessionCreate`, `AgentSessionReplay` to `requiresRepo: true` |
| `apps/tui/src/navigation/goToBindings.ts` | `g a` binding has `requiresRepo: false` | Change to `requiresRepo: true` |
| `apps/tui/src/navigation/deepLinks.ts` | Missing `agent-chat` and `agent-replay` screen mappings; agent screens not in `requiresRepo` list; no `--session-id` param handling in stack building |
| `apps/tui/src/navigation/index.ts` | Does not re-export deep-link `--session-id` types (minimal) |
| `apps/tui/src/lib/terminal.ts` | `parseCLIArgs` does not parse `--session-id` flag |

#### What does not exist (must be created):

| File | Purpose |
|------|---------|
| `apps/tui/src/commands/types.ts` | `PaletteCommand` and `CommandContext` interfaces |
| `apps/tui/src/commands/agentCommands.ts` | Agent command factory |
| `apps/tui/src/commands/index.ts` | `buildCommandRegistry` |
| `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` | Stub screen component |
| `apps/tui/src/screens/Agents/AgentChatScreen.tsx` | Stub screen component |
| `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx` | Stub screen component |
| `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx` | Stub screen component |
| `apps/tui/src/screens/Agents/index.ts` | Barrel export for screen stubs |
| `e2e/tui/agents-registry.test.ts` | Unit tests for registry, go-to, deep-link, and command modules |

### 1.4 Spec Conflict Resolution

**Conflict 1: `requiresRepo` for Agents**

| Source | Value | |
|--------|-------|---|
| Engineering Architecture (`engineering-architecture.md` §Screen Registry) | `requiresRepo: false` | ❌ Overridden |
| Current `router/registry.ts` | `requiresRepo: false` | ❌ Must be fixed |
| Current `goToBindings.ts` | `requiresRepo: false` for `g a` | ❌ Must be fixed |
| This ticket | `requiresRepo: true` for all four agent detail screens | ✅ Canonical |

**Rationale:** Agent sessions are scoped to a repository. The API endpoint is `GET /api/repos/{owner}/{repo}/agent/sessions`. Creating a session requires `POST /api/repos/{owner}/{repo}/agent/sessions`. There is no global agent session endpoint. Without repo context, the agent screen cannot fetch or display any data.

**Note on `ScreenName.Agents` vs `ScreenName.AgentSessionList`:** The `ScreenName` enum already uses `Agents` as the top-level entry (line 8) and `AgentSessionList` as a detail-level entry (line 34). The `Agents` entry is the one listed in the go-to bindings and the top-level deep-link target. Both `Agents` and `AgentSessionList` need `requiresRepo: true`. For go-to `g a`, the target is `ScreenName.Agents`. The deep-link `--screen agents` resolves to `ScreenName.Agents`.

**Conflict 2: `--session-id` CLI argument**

The current `parseCLIArgs` in `lib/terminal.ts` only parses `--repo`, `--screen`, and `--debug`. This ticket adds `--session-id` to both `parseCLIArgs` and `buildInitialStack`.

### 1.5 Feature Inventory Mapping

This ticket contributes to the `TUI_AGENTS` feature group. Features touched:

| Feature | Contribution from this ticket |
|---------|-------------------------------|
| `TUI_AGENT_SESSION_LIST` | `requiresRepo: true` fix, go-to `g a` fix, `:agents` palette command, `--screen agents` deep-link fix, stub `AgentSessionListScreen` |
| `TUI_AGENT_CHAT_SCREEN` | `requiresRepo: true` fix, `--screen agent-chat` deep-link mapping, stub `AgentChatScreen` |
| `TUI_AGENT_SESSION_CREATE` | `requiresRepo: true` fix, `New Agent Session` palette command, stub `AgentSessionCreateScreen` |
| `TUI_AGENT_SESSION_REPLAY` | `requiresRepo: true` fix, `--screen agent-replay` deep-link mapping, stub `AgentSessionReplayScreen` |

This ticket also contributes to `TUI_APP_SHELL` features:
- `TUI_GOTO_KEYBINDINGS` — `g a` binding correction
- `TUI_COMMAND_PALETTE` — two agent commands
- `TUI_DEEP_LINK_LAUNCH` — two new deep-link screen mappings, `--session-id` arg

---

## 2. Implementation Plan

### Step 1: Fix `requiresRepo` in Screen Registry

**File:** `apps/tui/src/router/registry.ts` *(modify)*

Change the four agent detail screen entries from `requiresRepo: false` to `requiresRepo: true`. The top-level `Agents` entry (ScreenName.Agents) also changes to `requiresRepo: true`.

**Before (lines 35-40 — `ScreenName.Agents`):**
```typescript
[ScreenName.Agents]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Agents",
},
```

**After:**
```typescript
[ScreenName.Agents]: {
  component: PlaceholderScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Agents",
},
```

**Before (lines 155-178 — four agent detail screens):**
```typescript
[ScreenName.AgentSessionList]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Agent Sessions",
},
[ScreenName.AgentChat]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.sessionId ? p.sessionId.slice(0, 8) : "Chat"),
},
[ScreenName.AgentSessionCreate]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "New Session",
},
[ScreenName.AgentSessionReplay]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.sessionId ? p.sessionId.slice(0, 8) : "Replay"),
},
```

**After:**
```typescript
[ScreenName.AgentSessionList]: {
  component: PlaceholderScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Agent Sessions",
},
[ScreenName.AgentChat]: {
  component: PlaceholderScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.sessionId ? `Session: ${p.sessionId.slice(0, 8)}` : "Chat"),
},
[ScreenName.AgentSessionCreate]: {
  component: PlaceholderScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "New Session",
},
[ScreenName.AgentSessionReplay]: {
  component: PlaceholderScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.sessionId ? `Replay: ${p.sessionId.slice(0, 8)}` : "Replay"),
},
```

**Changes:** 5 lines changed (`requiresRepo: false` → `requiresRepo: true`). Additionally, `AgentChat` breadcrumb updated to include `Session: ` prefix for clarity in breadcrumb trail, and `AgentSessionReplay` updated to include `Replay: ` prefix.

---

### Step 2: Fix `requiresRepo` in Go-To Bindings

**File:** `apps/tui/src/navigation/goToBindings.ts` *(modify)*

**Before (line 22):**
```typescript
{ key: "a", screen: ScreenName.Agents, requiresRepo: false, description: "Agents" },
```

**After:**
```typescript
{ key: "a", screen: ScreenName.Agents, requiresRepo: true, description: "Agents" },
```

**Changes:** 1 line changed.

**`g a` behavior after fix:** When repo context exists (e.g., user is viewing `acme/api`), `executeGoTo` builds stack `[Dashboard, RepoOverview(acme/api), Agents(acme/api)]`. When no repo context exists, returns `{ error: "No repository in context" }` and does not navigate.

---

### Step 3: Add `--session-id` to CLI Arg Parsing

**File:** `apps/tui/src/lib/terminal.ts` *(modify)*

Add `sessionId` to `TUILaunchOptions` interface and parse `--session-id` in `parseCLIArgs`.

**Before:**
```typescript
export interface TUILaunchOptions {
  repo?: string;
  screen?: string;
  debug?: boolean;
  apiUrl?: string;
  token?: string;
}

export function parseCLIArgs(argv: string[]): TUILaunchOptions {
  const opts: TUILaunchOptions = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--repo":
        opts.repo = argv[++i];
        break;
      case "--screen":
        opts.screen = argv[++i];
        break;
      case "--debug":
        opts.debug = true;
        break;
    }
  }
  opts.debug = opts.debug || process.env.CODEPLANE_TUI_DEBUG === "true";
  opts.apiUrl = process.env.CODEPLANE_API_URL ?? "http://localhost:3000";
  opts.token = process.env.CODEPLANE_TOKEN;
  return opts;
}
```

**After:**
```typescript
export interface TUILaunchOptions {
  repo?: string;
  screen?: string;
  sessionId?: string;
  debug?: boolean;
  apiUrl?: string;
  token?: string;
}

export function parseCLIArgs(argv: string[]): TUILaunchOptions {
  const opts: TUILaunchOptions = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--repo":
        opts.repo = argv[++i];
        break;
      case "--screen":
        opts.screen = argv[++i];
        break;
      case "--session-id":
        opts.sessionId = argv[++i];
        break;
      case "--debug":
        opts.debug = true;
        break;
    }
  }
  opts.debug = opts.debug || process.env.CODEPLANE_TUI_DEBUG === "true";
  opts.apiUrl = process.env.CODEPLANE_API_URL ?? "http://localhost:3000";
  opts.token = process.env.CODEPLANE_TOKEN;
  return opts;
}
```

---

### Step 4: Update Entry Point to Pass `sessionId` to Deep-Link Builder

**File:** `apps/tui/src/index.tsx` *(modify)*

**Before (line 36-39):**
```typescript
const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});
```

**After:**
```typescript
const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
  sessionId: launchOptions.sessionId,
});
```

---

### Step 5: Extend Deep-Link Parser

**File:** `apps/tui/src/navigation/deepLinks.ts` *(modify)*

Three changes:

**5a. Add `agent-chat` and `agent-replay` to `resolveScreenName` map:**

Add these entries to the `map` object inside `resolveScreenName()`:
```typescript
"agent-chat": ScreenName.AgentChat,
"agent-replay": ScreenName.AgentSessionReplay,
```

**5b. Add agent screens to the `requiresRepo` list inside `buildInitialStack`:**

The existing `requiresRepo` array (lines 81-87) must include the agent screens:
```typescript
const requiresRepo = [
  ScreenName.RepoOverview, ScreenName.Issues, ScreenName.IssueDetail, 
  ScreenName.IssueCreate, ScreenName.IssueEdit, ScreenName.Landings, 
  ScreenName.LandingDetail, ScreenName.LandingCreate, ScreenName.LandingEdit, 
  ScreenName.DiffView, ScreenName.Workflows, ScreenName.WorkflowRunDetail, 
  ScreenName.Wiki, ScreenName.WikiDetail,
  ScreenName.Agents, ScreenName.AgentSessionList,
  ScreenName.AgentChat, ScreenName.AgentSessionCreate, ScreenName.AgentSessionReplay,
].includes(screenName);
```

**5c. Add `--session-id` validation and intermediate `Agents` screen push:**

After the `requiresRepo` check and before the final `stack.push`, add validation for `agent-chat` and `agent-replay` requiring `--session-id`, and push an intermediate `Agents` entry so back-navigation works:

```typescript
// Validate --session-id for screens that require it
const requiresSessionId = [
  ScreenName.AgentChat, ScreenName.AgentSessionReplay,
].includes(screenName);

if (requiresSessionId && !args.sessionId) {
  return {
    stack: [dashboardEntry()],
    error: `--session-id required for ${args.screen} screen`,
  };
}

if (requiresSessionId && args.sessionId) {
  // Validate session ID format
  if (args.sessionId.length === 0 || /\s/.test(args.sessionId)) {
    return {
      stack: [dashboardEntry()],
      error: `Invalid --session-id format: must be non-empty with no whitespace`,
    };
  }
  if (args.sessionId.length > 255) {
    return {
      stack: [dashboardEntry()],
      error: `--session-id exceeds maximum length of 255 characters`,
    };
  }
}

// For agent detail screens (chat, replay), push intermediate Agents screen
const agentDetailScreens = [
  ScreenName.AgentChat, ScreenName.AgentSessionReplay,
];
if (agentDetailScreens.includes(screenName) && owner && repoName) {
  stack.push(createEntry(ScreenName.Agents, { owner, repo: repoName }));
}
```

This ensures deep-linked `--screen agent-chat` builds a 4-entry stack: `[Dashboard, RepoOverview, Agents, AgentChat]`.

**Full `buildInitialStack` after changes:**

```typescript
export function buildInitialStack(args: DeepLinkArgs): DeepLinkResult {
  const dashboardEntry = () => createEntry(ScreenName.Dashboard);

  if (!args.screen && !args.repo) {
    return { stack: [dashboardEntry()] };
  }

  const screenName = args.screen ? resolveScreenName(args.screen) : null;
  
  if (args.screen && !screenName) {
    return {
      stack: [dashboardEntry()],
      error: `Unknown screen: "${args.screen}"`,
    };
  }

  let owner = "";
  let repoName = "";

  if (args.repo) {
    const parts = args.repo.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        stack: [dashboardEntry()],
        error: `Invalid repository format: "${args.repo}"`,
      };
    }
    owner = parts[0];
    repoName = parts[1];
  }

  const stack: ScreenEntry[] = [dashboardEntry()];

  if (owner && repoName) {
    stack.push(createEntry(ScreenName.RepoOverview, { owner, repo: repoName }));
  }

  if (screenName && screenName !== ScreenName.Dashboard) {
    const requiresRepo = [
      ScreenName.RepoOverview, ScreenName.Issues, ScreenName.IssueDetail, 
      ScreenName.IssueCreate, ScreenName.IssueEdit, ScreenName.Landings, 
      ScreenName.LandingDetail, ScreenName.LandingCreate, ScreenName.LandingEdit, 
      ScreenName.DiffView, ScreenName.Workflows, ScreenName.WorkflowRunDetail, 
      ScreenName.Wiki, ScreenName.WikiDetail,
      ScreenName.Agents, ScreenName.AgentSessionList,
      ScreenName.AgentChat, ScreenName.AgentSessionCreate, ScreenName.AgentSessionReplay,
    ].includes(screenName);

    if (requiresRepo && (!owner || !repoName)) {
      return {
        stack: [dashboardEntry()],
        error: `--repo required for ${args.screen} screen`,
      };
    }

    // Validate --session-id for screens that require it
    const requiresSessionId = [
      ScreenName.AgentChat, ScreenName.AgentSessionReplay,
    ].includes(screenName);

    if (requiresSessionId && !args.sessionId) {
      return {
        stack: [dashboardEntry()],
        error: `--session-id required for ${args.screen} screen`,
      };
    }

    if (requiresSessionId && args.sessionId) {
      if (args.sessionId.length === 0 || /\s/.test(args.sessionId)) {
        return {
          stack: [dashboardEntry()],
          error: `Invalid --session-id format: must be non-empty with no whitespace`,
        };
      }
      if (args.sessionId.length > 255) {
        return {
          stack: [dashboardEntry()],
          error: `--session-id exceeds maximum length of 255 characters`,
        };
      }
    }

    const params: Record<string, string> = {};
    if (requiresRepo) {
      params.owner = owner;
      params.repo = repoName;
    }
    if (args.sessionId) {
      params.sessionId = args.sessionId;
    }
    if (args.org) {
      params.org = args.org;
    }

    // For agent detail screens, push intermediate Agents screen for back-nav
    const agentDetailScreens = [
      ScreenName.AgentChat, ScreenName.AgentSessionReplay,
    ];
    if (agentDetailScreens.includes(screenName) && owner && repoName) {
      stack.push(createEntry(ScreenName.Agents, { owner, repo: repoName }));
    }

    // avoid pushing duplicates if RepoOverview is the target
    if (screenName !== ScreenName.RepoOverview || !owner) {
      stack.push(createEntry(screenName, params));
    }
  }

  return { stack };
}
```

---

### Step 6: Create Agent Screen Stub Components

**Files to create:**
- `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`
- `apps/tui/src/screens/Agents/AgentChatScreen.tsx`
- `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx`
- `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx`
- `apps/tui/src/screens/Agents/index.ts`

Each stub must accept `ScreenComponentProps` (matching the `screenRegistry` component type) and render a minimal placeholder identifying the screen.

**`AgentSessionListScreen.tsx`:**

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function AgentSessionListScreen({ entry }: ScreenComponentProps) {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Sessions</text>
      <text color="gray">Not yet implemented.</text>
      {entry.params.owner && entry.params.repo && (
        <text color="gray">{`Repository: ${entry.params.owner}/${entry.params.repo}`}</text>
      )}
    </box>
  );
}
```

**`AgentChatScreen.tsx`:**

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function AgentChatScreen({ entry }: ScreenComponentProps) {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Chat</text>
      <text color="gray">Not yet implemented.</text>
      {entry.params.sessionId && (
        <text color="gray">{`Session: ${entry.params.sessionId}`}</text>
      )}
    </box>
  );
}
```

**`AgentSessionCreateScreen.tsx`:**

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function AgentSessionCreateScreen({ entry }: ScreenComponentProps) {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>New Agent Session</text>
      <text color="gray">Not yet implemented.</text>
    </box>
  );
}
```

**`AgentSessionReplayScreen.tsx`:**

```tsx
import type { ScreenComponentProps } from "../../router/types.js";

export function AgentSessionReplayScreen({ entry }: ScreenComponentProps) {
  return (
    <box flexDirection="column" padding={1}>
      <text bold>Agent Session Replay</text>
      <text color="gray">Not yet implemented.</text>
      {entry.params.sessionId && (
        <text color="gray">{`Session: ${entry.params.sessionId}`}</text>
      )}
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

**Coexistence with existing files:** The existing `components/index.ts`, `types.ts`, `utils/formatTimestamp.ts`, `components/MessageBlock.tsx`, and `components/ToolBlock.tsx` are untouched. The new barrel export only re-exports the four new screen components.

**Note:** These stubs use `PlaceholderScreen`-compatible patterns (accepting `ScreenComponentProps`). They are **not** wired into the `screenRegistry` in this ticket — the registry continues to use `PlaceholderScreen` for all entries. The stubs exist so downstream tickets can swap them in without creating new files. If the team prefers to wire them immediately, the registry imports can be updated, but the ticket scope does not require it since `PlaceholderScreen` already renders screen name and params.

---

### Step 7: Create Command Palette Infrastructure

**File:** `apps/tui/src/commands/types.ts` *(new file)*

```typescript
export interface PaletteCommand {
  /** Unique identifier for the command (kebab-case) */
  id: string;
  /** Display name shown in the palette */
  name: string;
  /** Alternative names/triggers for fuzzy matching (e.g., ":agents") */
  aliases?: string[];
  /** Short description shown below the name */
  description: string;
  /** Grouping category in the palette */
  category: "Navigate" | "Action" | "Toggle";
  /** Keybinding hint shown to the right of the name */
  keybinding?: string;
  /** Sort priority — lower numbers appear first */
  priority: number;
  /** Context requirements — command is hidden when not met */
  contextRequirements?: {
    repo?: boolean;
    authenticated?: boolean;
    writeAccess?: boolean;
  };
  /** Execute the command */
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

```typescript
import type { PaletteCommand, CommandContext } from "./types.js";
import { ScreenName } from "../router/types.js";

export function createAgentCommands(ctx: CommandContext): PaletteCommand[] {
  return [
    {
      id: "navigate-agents",
      name: "Agent Sessions",
      aliases: [":agents", "agents"],
      description: "View agent sessions for the current repository",
      category: "Navigate",
      keybinding: "g a",
      priority: 40,
      contextRequirements: {
        repo: true,
      },
      action: () => {
        const repo = ctx.getRepoContext();
        if (!repo) return;
        ctx.navigate(ScreenName.Agents, { owner: repo.owner, repo: repo.repo });
      },
    },
    {
      id: "create-agent-session",
      name: "New Agent Session",
      aliases: ["Create Agent Session", "new agent", "create agent"],
      description: "Start a new agent session in the current repository",
      category: "Action",
      priority: 41,
      contextRequirements: {
        repo: true,
        writeAccess: true,
      },
      action: () => {
        const repo = ctx.getRepoContext();
        if (!repo) return;
        ctx.navigate(ScreenName.AgentSessionCreate, { owner: repo.owner, repo: repo.repo });
      },
    },
  ];
}
```

**File:** `apps/tui/src/commands/index.ts` *(new file)*

```typescript
import type { PaletteCommand, CommandContext } from "./types.js";
import { createAgentCommands } from "./agentCommands.js";

export type { PaletteCommand, CommandContext } from "./types.js";
export { createAgentCommands } from "./agentCommands.js";

/**
 * Build the full command registry from all feature modules.
 * Commands are returned sorted by priority (lower first).
 */
export function buildCommandRegistry(ctx: CommandContext): PaletteCommand[] {
  const commands: PaletteCommand[] = [
    ...createAgentCommands(ctx),
    // Future: ...createIssueCommands(ctx),
    // Future: ...createWorkflowCommands(ctx),
  ];
  return commands.sort((a, b) => a.priority - b.priority);
}
```

---

## 3. File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/tui/src/router/registry.ts` | **Modify** | Set `requiresRepo: true` for 5 agent screen entries, update breadcrumb labels |
| `apps/tui/src/navigation/goToBindings.ts` | **Modify** | Set `requiresRepo: true` for `g a` binding |
| `apps/tui/src/navigation/deepLinks.ts` | **Modify** | Add `agent-chat` and `agent-replay` screen mappings, add agent screens to `requiresRepo` list, add `--session-id` validation and intermediate stack entries |
| `apps/tui/src/lib/terminal.ts` | **Modify** | Add `sessionId` to `TUILaunchOptions`, parse `--session-id` flag |
| `apps/tui/src/index.tsx` | **Modify** | Pass `sessionId` to `buildInitialStack` |
| `apps/tui/src/commands/types.ts` | **Create** | `PaletteCommand` and `CommandContext` interfaces |
| `apps/tui/src/commands/agentCommands.ts` | **Create** | Agent command factory |
| `apps/tui/src/commands/index.ts` | **Create** | `buildCommandRegistry` and re-exports |
| `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` | **Create** | Stub screen component |
| `apps/tui/src/screens/Agents/AgentChatScreen.tsx` | **Create** | Stub screen component |
| `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx` | **Create** | Stub screen component |
| `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx` | **Create** | Stub screen component |
| `apps/tui/src/screens/Agents/index.ts` | **Create** | Barrel export for four screen stubs |
| `e2e/tui/agents-registry.test.ts` | **Create** | Unit + integration tests for this ticket |

**New files:** 8 | **Modified files:** 5 | **Deleted files:** 0

---

## 4. Data Layer

This ticket does not consume any `@codeplane/ui-core` data hooks. All modifications are to navigation/routing infrastructure (pure data/types) and the command palette system (plain objects/functions). The `commands/` module receives a `CommandContext` plain object injected by the caller — no React context or provider dependency.

---

## 5. Breadcrumb Generation

| Navigation path | Breadcrumb trail |
|----------------|------------------|
| `g a` from `acme/api` | `Dashboard › acme/api › Agents` |
| Deep-link `--screen agents --repo acme/api` | `Dashboard › acme/api › Agents` |
| Deep-link `--screen agent-chat --repo acme/api --session-id abc123def` | `Dashboard › acme/api › Agents › Session: abc123de` |
| Deep-link `--screen agent-replay --repo acme/api --session-id sess-001` | `Dashboard › acme/api › Agents › Replay: sess-001` |

---

## 6. Edge Cases and Error Handling

### 6.1 `g a` without repo context

After this fix, `executeGoTo` returns `{ error: "No repository in context" }` because `binding.requiresRepo` is now `true`. The caller (GlobalKeybindings/go-to mode handler) displays the error in the status bar. Screen does not change.

### 6.2 `g a` with repo context

`executeGoTo` builds stack: `reset(Dashboard)` → `push(RepoOverview, {owner, repo})` → `push(Agents, {owner, repo})`. The NavigationProvider's `push` auto-propagates repo context from the stack, so the Agents screen always receives `owner` and `repo` params.

### 6.3 Deep-link `--screen agents` without `--repo`

Returns `{ stack: [Dashboard], error: "--repo required for agents screen" }`. Error displayed in status bar for 5 seconds.

### 6.4 Deep-link `--screen agent-chat` without `--session-id`

Returns `{ stack: [Dashboard], error: "--session-id required for agent-chat screen" }`. Separate from the `--repo` check — `--repo` is validated first.

### 6.5 Deep-link `--session-id` with whitespace

Rejected by `/\s/` regex test. Returns error: `"Invalid --session-id format: must be non-empty with no whitespace"`.

### 6.6 Deep-link `--session-id` empty string or over 255 chars

Empty: caught by `length === 0` check. Over 255: caught by `length > 255` check.

### 6.7 Deep-link `--screen agent-create`

`resolveScreenName("agent-create")` returns `null`. Falls back to Dashboard with `Unknown screen: "agent-create"` error. This is intentional — deep-linking to a creation form is an anti-pattern.

### 6.8 `New Agent Session` command without write access

The command has `contextRequirements.writeAccess: true`. The command palette filters out commands whose context requirements are not met. The command never appears in results.

### 6.9 `Agent Sessions` command without repo context

The command has `contextRequirements.repo: true`. Hidden from palette when no repo context.

### 6.10 Case sensitivity for `--screen`

`resolveScreenName` lowercases the input. `AGENTS`, `Agents`, `agents`, `AGENT-CHAT` all resolve correctly.

### 6.11 Duplicate `--session-id` arguments

`parseCLIArgs` uses a sequential loop — last value wins (same as `--repo` and `--screen`).

### 6.12 `--repo` format validation

The existing `buildInitialStack` splits on `/` and checks for exactly 2 non-empty parts. This rejects `@org/repo`, empty segments, and missing `/`.

### 6.13 Navigation stack integrity for back-navigation

Deep-linked `--screen agent-chat` builds a 4-entry stack: `[Dashboard, RepoOverview, Agents, AgentChat]`. Pressing `q` four times returns to Dashboard, then exits. Each `q` pops one entry.

---

## 7. Unit & Integration Tests

### 7.1 Pure Function Unit Tests

**Test file:** `e2e/tui/agents-registry.test.ts` *(new file)*

These tests exercise the pure functions and data structures modified/created in this ticket. They import directly from source modules and use `bun:test`.

```typescript
import { describe, test, expect } from "bun:test";
import { ScreenName, screenRegistry } from "../../apps/tui/src/router/registry.js";
import { goToBindings, executeGoTo } from "../../apps/tui/src/navigation/goToBindings.js";
import { buildInitialStack } from "../../apps/tui/src/navigation/deepLinks.js";
import { createAgentCommands } from "../../apps/tui/src/commands/agentCommands.js";
import { buildCommandRegistry } from "../../apps/tui/src/commands/index.js";
import type { CommandContext } from "../../apps/tui/src/commands/types.js";
import { parseCLIArgs } from "../../apps/tui/src/lib/terminal.js";
```

#### Screen Registry Tests (UNIT-REG-001 through UNIT-REG-010)

| ID | Assertion |
|----|-----------|
| UNIT-REG-001 | `screenRegistry[ScreenName.Agents].requiresRepo` is `true` |
| UNIT-REG-002 | `screenRegistry[ScreenName.AgentSessionList].requiresRepo` is `true` |
| UNIT-REG-003 | `screenRegistry[ScreenName.AgentChat].requiresRepo` is `true` |
| UNIT-REG-004 | `screenRegistry[ScreenName.AgentSessionCreate].requiresRepo` is `true` |
| UNIT-REG-005 | `screenRegistry[ScreenName.AgentSessionReplay].requiresRepo` is `true` |
| UNIT-REG-006 | `AgentChat` breadcrumb includes `Session:` prefix and truncates sessionId to 8 chars |
| UNIT-REG-007 | `AgentSessionReplay` breadcrumb includes `Replay:` prefix and truncates sessionId to 8 chars |
| UNIT-REG-008 | `AgentSessionCreate` breadcrumb is `"New Session"` |
| UNIT-REG-009 | Every `ScreenName` value has an entry in `screenRegistry` (exhaustiveness) |
| UNIT-REG-010 | All agent registry entries have `requiresOrg: false` |

#### Go-To Binding Tests (UNIT-GTO-001 through UNIT-GTO-006)

| ID | Assertion |
|----|-----------|
| UNIT-GTO-001 | `goToBindings` contains entry with `key: "a"` and `screen: ScreenName.Agents` |
| UNIT-GTO-002 | `g a` binding has `requiresRepo: true` |
| UNIT-GTO-003 | No duplicate keys in `goToBindings` array |
| UNIT-GTO-004 | `executeGoTo` with `g a` and repo context builds 3-entry stack (Dashboard → Repo → Agents) |
| UNIT-GTO-005 | `executeGoTo` with `g a` and no repo context returns `"No repository in context"` error |
| UNIT-GTO-006 | All binding `screen` values exist in `ScreenName` enum |

Note: `executeGoTo` tests use a mock `NavigationContext` that records `reset` and `push` calls to verify stack construction.

#### CLI Arg Parsing Tests (UNIT-CLI-001 through UNIT-CLI-004)

| ID | Assertion |
|----|-----------|
| UNIT-CLI-001 | `parseCLIArgs(["--session-id", "abc123"])` returns `{ sessionId: "abc123" }` |
| UNIT-CLI-002 | `parseCLIArgs(["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "sess-001"])` returns all three values |
| UNIT-CLI-003 | Duplicate `--session-id` uses last value |
| UNIT-CLI-004 | `--session-id` without following value returns `undefined` |

#### Deep-Link Stack Building Tests (UNIT-DLK-001 through UNIT-DLK-020)

| ID | Assertion |
|----|-----------|
| UNIT-DLK-001 | `--screen agents --repo acme/api` builds 3-entry stack: `[Dashboard, RepoOverview, Agents]` |
| UNIT-DLK-002 | `--screen agent-chat --repo acme/api --session-id sess-001` builds 4-entry stack: `[Dashboard, RepoOverview, Agents, AgentChat]` |
| UNIT-DLK-003 | `--screen agent-replay --repo acme/api --session-id sess-001` builds 4-entry stack: `[Dashboard, RepoOverview, Agents, AgentSessionReplay]` |
| UNIT-DLK-004 | `--screen agents` without `--repo` returns error `"--repo required for agents screen"` |
| UNIT-DLK-005 | `--screen agent-chat --repo acme/api` without `--session-id` returns error `"--session-id required for agent-chat screen"` |
| UNIT-DLK-006 | `--screen agent-replay --repo acme/api` without `--session-id` returns error |
| UNIT-DLK-007 | `--session-id` with whitespace (`" abc "`) is rejected |
| UNIT-DLK-008 | `--session-id` with tab character is rejected |
| UNIT-DLK-009 | `--session-id` empty string is rejected |
| UNIT-DLK-010 | `--session-id` over 255 chars is rejected |
| UNIT-DLK-011 | Case-insensitive: `--screen AGENTS` resolves same as `--screen agents` |
| UNIT-DLK-012 | Case-insensitive: `--screen Agent-Chat` resolves to `AgentChat` |
| UNIT-DLK-013 | `--screen agent-create` returns unknown screen error |
| UNIT-DLK-014 | No `--screen` returns `[Dashboard]` with no error |
| UNIT-DLK-015 | `--repo` with invalid format (`noslash`) returns error |
| UNIT-DLK-016 | `--screen agent-chat` without `--repo` checks repo first (error: `"--repo required"`) |
| UNIT-DLK-017 | AgentChat stack entry has `sessionId` in params |
| UNIT-DLK-018 | AgentSessionReplay stack entry has `sessionId` in params |
| UNIT-DLK-019 | Agents intermediate entry in agent-chat stack has owner/repo but no sessionId |
| UNIT-DLK-020 | Valid session ID characters (alphanumeric, hyphens, underscores) pass validation |

#### Command Palette Tests (UNIT-CMD-001 through UNIT-CMD-009)

| ID | Assertion |
|----|-----------|
| UNIT-CMD-001 | `createAgentCommands` returns exactly 2 commands |
| UNIT-CMD-002 | `navigate-agents` command has name `"Agent Sessions"`, keybinding `"g a"`, category `"Navigate"` |
| UNIT-CMD-003 | `create-agent-session` command has `contextRequirements.writeAccess: true` |
| UNIT-CMD-004 | `navigate-agents` includes `:agents` in aliases |
| UNIT-CMD-005 | `create-agent-session` includes `"Create Agent Session"` in aliases |
| UNIT-CMD-006 | `navigate-agents` action calls `ctx.navigate` with `ScreenName.Agents` when repo context exists |
| UNIT-CMD-007 | `navigate-agents` action is no-op when `getRepoContext()` returns null |
| UNIT-CMD-008 | `buildCommandRegistry` includes both agent commands |
| UNIT-CMD-009 | `buildCommandRegistry` returns commands sorted by priority ascending |

The `CommandContext` for tests is a plain mock object:

```typescript
function createMockCommandContext(opts?: {
  repo?: { owner: string; repo: string } | null;
  writeAccess?: boolean;
}): CommandContext {
  const navigateCalls: Array<{ screen: string; params?: Record<string, string> }> = [];
  const repo = opts?.repo ?? null;
  return {
    navigate: (screen, params) => { navigateCalls.push({ screen, params }); },
    hasRepoContext: () => repo !== null,
    getRepoContext: () => repo,
    hasWriteAccess: () => opts?.writeAccess ?? false,
    _navigateCalls: navigateCalls, // test-only accessor
  } as CommandContext & { _navigateCalls: typeof navigateCalls };
}
```

### 7.2 E2E Integration Tests

The existing `e2e/tui/agents.test.ts` file already contains 518 E2E test stubs covering the full agent feature group. These tests use `launchTUI()` from `helpers.ts` and exercise navigation, rendering, and interaction. **No new E2E test file is needed for this ticket.** The existing tests already cover:

- `navigateToAgents(terminal)` helper that sends `g a` and waits for "Agent Sessions"
- Snapshot tests at multiple terminal sizes
- Navigation flow tests (enter session, back-nav with `q`)
- Session list rendering, chat rendering, create flow, replay mode

These tests will begin passing (or fail more meaningfully) as the `requiresRepo` fixes and deep-link changes land. Tests that fail due to unimplemented backend features are left failing per project policy.

### 7.3 Test Summary

| File | Category | Count |
|------|----------|-------|
| `e2e/tui/agents-registry.test.ts` | Screen registry | 10 |
| `e2e/tui/agents-registry.test.ts` | Go-to bindings | 6 |
| `e2e/tui/agents-registry.test.ts` | CLI arg parsing | 4 |
| `e2e/tui/agents-registry.test.ts` | Deep-link stack building | 20 |
| `e2e/tui/agents-registry.test.ts` | Command palette | 9 |
| `e2e/tui/agents.test.ts` | Pre-existing E2E stubs | 518 (unchanged) |
| **New tests total** | | **49** |

---

## 8. Productionization Notes

### 8.1 No PoC Code

All code is immediately production-grade. Stubs are minimal valid implementations matching the existing `ScreenComponentProps` contract. No `poc/` output to graduate.

### 8.2 Stub Screen Lifecycle

| Stub | Replaced by ticket | Prerequisite tickets |
|------|---------------------|-----------------|
| `AgentSessionListScreen` | `tui-agent-session-list` | `tui-agent-data-hooks` |
| `AgentChatScreen` | `tui-agent-chat-screen` | `tui-agent-sse-stream-hook`, `tui-agent-message-block` |
| `AgentSessionCreateScreen` | `tui-agent-session-create` | `tui-agent-session-list` |
| `AgentSessionReplayScreen` | `tui-agent-session-replay` | `tui-agent-message-block` |

When a downstream ticket replaces a stub, it updates the `screenRegistry` import in `router/registry.ts` from `PlaceholderScreen` to the real component. The stub file can be deleted or kept as a reference.

### 8.3 What is Permanent vs. What is Replaced

**Permanent (produced by this ticket, not expected to change):**
- `requiresRepo: true` on all agent screen registry entries
- `requiresRepo: true` on `g a` go-to binding
- `agent-chat` and `agent-replay` in deep-link screen map
- Agent screens in deep-link `requiresRepo` list
- `--session-id` CLI arg parsing
- `--session-id` validation rules (non-empty, no whitespace, max 255)
- Intermediate `Agents` stack entry for `agent-chat` and `agent-replay` deep-links
- `PaletteCommand` and `CommandContext` interfaces
- `createAgentCommands` factory
- `buildCommandRegistry` function
- `navigate-agents` and `create-agent-session` command definitions
- `AgentChat` breadcrumb format: `Session: {8-char-id}`
- `AgentSessionReplay` breadcrumb format: `Replay: {8-char-id}`
- All 49 new tests

**Replaced by downstream tickets:**
- Stub screen component files (replaced by real implementations)
- `PlaceholderScreen` references in registry for agent entries (replaced by real components)

### 8.4 TypeScript Exhaustiveness

The existing runtime check at the bottom of `registry.ts` catches any missing `ScreenName` entries:
```typescript
const missingScreens = Object.values(ScreenName).filter(
  (name) => !(name in screenRegistry),
);
if (missingScreens.length > 0) {
  throw new Error(`Screen registry is missing entries for: ${missingScreens.join(", ")}`);
}
```
This ticket does not add new enum values — they already exist. No new exhaustiveness risk.

### 8.5 Naming Conventions

| Element | Convention | Example |
|---------|-----------|--------|
| `ScreenName` enum values | PascalCase | `AgentSessionCreate` |
| Deep-link `--screen` values | kebab-case | `agent-chat` |
| Command palette `id` | kebab-case | `create-agent-session` |
| Screen component files | PascalCase + `Screen.tsx` | `AgentChatScreen.tsx` |
| Go-to binding keys | single lowercase letter | `a` |
| Test name prefix | UPPER-CASE | `UNIT-REG-001` |
| Import paths | `.js` extension (ESM) | `from "./screenRegistry.js"` |

### 8.6 Directory Structure After This Ticket

```
apps/tui/src/
├── commands/                            ← NEW
│   ├── types.ts
│   ├── agentCommands.ts
│   └── index.ts
├── hooks/                               ← EXISTING (unchanged)
├── lib/
│   └── terminal.ts                      ← MODIFIED (add --session-id)
├── navigation/
│   ├── goToBindings.ts                  ← MODIFIED (requiresRepo fix)
│   ├── deepLinks.ts                     ← MODIFIED (add screens, validation)
│   └── index.ts                         ← EXISTING (unchanged)
├── providers/                           ← EXISTING (unchanged)
├── router/
│   ├── types.ts                         ← EXISTING (unchanged)
│   ├── registry.ts                      ← MODIFIED (requiresRepo fixes, breadcrumb updates)
│   ├── ScreenRouter.tsx                 ← EXISTING (unchanged)
│   └── index.ts                         ← EXISTING (unchanged)
├── screens/
│   ├── PlaceholderScreen.tsx            ← EXISTING (unchanged)
│   └── Agents/
│       ├── index.ts                     ← NEW (barrel export)
│       ├── AgentSessionListScreen.tsx   ← NEW (stub)
│       ├── AgentChatScreen.tsx          ← NEW (stub)
│       ├── AgentSessionCreateScreen.tsx ← NEW (stub)
│       ├── AgentSessionReplayScreen.tsx ← NEW (stub)
│       ├── types.ts                     ← EXISTING (unchanged)
│       ├── components/                  ← EXISTING (unchanged)
│       └── utils/                       ← EXISTING (unchanged)
├── index.tsx                            ← MODIFIED (pass sessionId)
└── ... (other directories unchanged)

e2e/tui/
├── agents.test.ts                       ← EXISTING (unchanged, 518 tests)
├── agents-registry.test.ts              ← NEW (49 tests)
├── app-shell.test.ts                    ← EXISTING (unchanged)
├── helpers.ts                           ← EXISTING (unchanged)
└── ... (other test files unchanged)
```

### 8.7 Pattern Establishment

This ticket establishes the following patterns for future screen registration:

1. **Screen registration:** Enum value exists → set `requiresRepo`/`requiresOrg` correctly → set `breadcrumbLabel` with truncation for IDs → stub component exists for downstream
2. **Go-to binding:** Add entry to `goToBindings` with key collision check. Ensure `requiresRepo` matches the target screen's registry entry.
3. **Command palette:** Create `createXxxCommands(context)` factory → register in `buildCommandRegistry`. Use `contextRequirements` to gate visibility.
4. **Deep-link:** Add to `resolveScreenName` map → add to `requiresRepo` list → add validation for required params → push intermediate screens for proper back-nav.
5. **Stub component:** Accept `ScreenComponentProps` → render `<text bold>` for title, `<text color="gray">` for placeholder, show relevant params.

---

## 9. Acceptance Criteria Checklist

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | All 5 agent screen registry entries have `requiresRepo: true` | `UNIT-REG-001` through `UNIT-REG-005` |
| 2 | `g a` binding has `requiresRepo: true` | `UNIT-GTO-002` |
| 3 | `g a` with repo context navigates to Agents | `UNIT-GTO-004` |
| 4 | `g a` without repo context returns error | `UNIT-GTO-005` |
| 5 | `--session-id` parsed by `parseCLIArgs` | `UNIT-CLI-001`, `UNIT-CLI-002` |
| 6 | `--screen agents --repo` deep-link builds 3-entry stack | `UNIT-DLK-001` |
| 7 | `--screen agent-chat --repo --session-id` deep-link builds 4-entry stack | `UNIT-DLK-002` |
| 8 | `--screen agent-replay --repo --session-id` deep-link builds 4-entry stack | `UNIT-DLK-003` |
| 9 | `--screen agents` without `--repo` returns error | `UNIT-DLK-004` |
| 10 | `--screen agent-chat` without `--session-id` returns error | `UNIT-DLK-005` |
| 11 | `--session-id` with whitespace rejected | `UNIT-DLK-007`, `UNIT-DLK-008` |
| 12 | `--session-id` empty rejected | `UNIT-DLK-009` |
| 13 | `--session-id` over 255 chars rejected | `UNIT-DLK-010` |
| 14 | Case-insensitive `--screen` | `UNIT-DLK-011`, `UNIT-DLK-012` |
| 15 | `agent-create` not a deep-link target | `UNIT-DLK-013` |
| 16 | `createAgentCommands` returns 2 commands | `UNIT-CMD-001` |
| 17 | `:agents` alias present | `UNIT-CMD-004` |
| 18 | `create-agent-session` requires `writeAccess` | `UNIT-CMD-003` |
| 19 | `navigate-agents` action calls navigate with Agents screen | `UNIT-CMD-006` |
| 20 | `buildCommandRegistry` sorts by priority | `UNIT-CMD-009` |
| 21 | `AgentChat` breadcrumb has `Session:` prefix | `UNIT-REG-006` |
| 22 | `AgentSessionReplay` breadcrumb has `Replay:` prefix | `UNIT-REG-007` |
| 23 | Stub screen files exist and export components | File existence check + import |
| 24 | TypeScript compiles without errors | `bun run check` |
| 25 | Existing `e2e/tui/agents.test.ts` not modified | `git diff` |
| 26 | No go-to key collisions | `UNIT-GTO-003` |
| 27 | All `ScreenName` values have registry entries | `UNIT-REG-009` |
| 28 | Back-nav from deep-linked agent-chat (4 pops) | `UNIT-DLK-002` (stack depth verification) |
| 29 | `sessionId` passed through from entry point to deep-link builder | Code review of `index.tsx` change |

---

## 10. Dependencies

**Upstream:** None. This ticket has no dependencies and can be implemented immediately.

**Downstream:** All agent feature tickets depend on this ticket:

| Ticket | Dependency |
|--------|------------|
| `tui-agent-session-list` | `requiresRepo: true` on `ScreenName.Agents`, go-to `g a` with repo requirement |
| `tui-agent-chat-screen` | `--screen agent-chat` deep-link, `requiresRepo: true` on `ScreenName.AgentChat` |
| `tui-agent-session-create` | Palette command `create-agent-session`, `requiresRepo: true` on `ScreenName.AgentSessionCreate` |
| `tui-agent-session-replay` | `--screen agent-replay` deep-link, `requiresRepo: true` on `ScreenName.AgentSessionReplay` |
| `tui-command-palette` | `PaletteCommand` interface, `CommandContext` interface, `buildCommandRegistry` function |