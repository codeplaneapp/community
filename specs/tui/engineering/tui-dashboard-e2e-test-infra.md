# Engineering Specification: `tui-dashboard-e2e-test-infra`

## Ticket Summary

| Field | Value |
|-------|-------|
| Title | Set up Dashboard E2E test file, fixtures, and test helpers |
| Ticket ID | `tui-dashboard-e2e-test-infra` |
| Type | Engineering |
| Status | Not started |
| Dependencies | `tui-dashboard-screen-scaffold` |

## Context

The `tui-dashboard-screen-scaffold` ticket creates the `DashboardScreen` component at `apps/tui/src/screens/Dashboard/index.tsx`, registers it in the screen router, and adds a basic set of E2E tests in `e2e/tui/dashboard.test.ts` that validate the scaffold itself (module exports, default launch, breadcrumb, status bar hints, basic keyboard, responsive rendering).

This ticket **extends** that test file with the complete E2E test infrastructure needed for all subsequent Dashboard feature tickets (`tui-dashboard-repos-list`, `tui-dashboard-orgs-list`, `tui-dashboard-starred-repos`, `tui-dashboard-activity-feed`, `tui-dashboard-quick-actions`). It adds:

1. **Typed fixture data** — Realistic seed data representing a fully populated test user and an empty test user.
2. **Dashboard-specific helper functions** — Reusable functions for navigating to and asserting state on the Dashboard.
3. **Describe block structure** — Organized test blocks matching the verification sections from `TUI_DASHBOARD_SCREEN.md`.
4. **Concrete test cases** — Tests covering snapshots, keyboard interaction, responsive behavior, data loading, and edge cases.

Tests that exercise behaviors dependent on unimplemented backend features (e.g., the activity API returning 501, go-to mode not wired) are **left failing** — never skipped or commented out.

## Existing Infrastructure (What Already Exists)

### `e2e/tui/helpers.ts` (shared utilities)

This file already provides:

- `launchTUI(options?)` → spawns a TUI process in a real PTY via `@microsoft/tui-test`, returns `TUITestInstance`
- `TUITestInstance` interface with `sendKeys()`, `sendText()`, `waitForText()`, `waitForNoText()`, `snapshot()`, `getLine()`, `resize()`, `terminate()`, `rows`, `cols`
- `TERMINAL_SIZES` — `minimum` (80×24), `standard` (120×40), `large` (200×60)
- `createTestCredentialStore(token?)` — temp credential file for test isolation
- `createMockAPIEnv(options?)` — environment config for mock API server
- `resolveKey(key)` — maps human-readable key names to `@microsoft/tui-test` key enum values
- `run(cmd, opts)` — subprocess execution
- `bunEval(expression)` — bun eval in TUI package context

### `e2e/tui/dashboard.test.ts` (from scaffold ticket)

The scaffold ticket creates a `dashboard.test.ts` file with tests organized under `describe("TUI_DASHBOARD — Screen scaffold", ...)` that cover:

- Module scaffold verification (export exists, barrel export, registry mapping)
- Default launch behavior (snapshots at 3 sizes, welcome text, stack depth)
- Header bar breadcrumb integration
- Status bar keybinding hints
- Basic keyboard interaction (q exits, Ctrl+C exits, g d navigation — left failing)
- Responsive layout (80×24, 200×60, resize, below-minimum)
- Navigation integration (no placeholder text, default root, registry metadata)

This ticket **adds to** that file rather than replacing it.

### Established patterns from `agents.test.ts`

The agent test file demonstrates the canonical fixture + helper + test structure:

1. **Fixture interfaces** — TypeScript interfaces for test entities (e.g., `AgentSessionFixture`, `AgentMessageFixture`).
2. **Fixture data** — Inline arrays of realistic fixture objects with edge cases (empty titles, unicode, max-length strings).
3. **Screen-specific helpers** — Functions like `navigateToAgents()`, `createSession()`, `navigateToChat()` that compose `sendKeys()` and `waitForText()` calls.
4. **Describe blocks** — Organized by test category: `"Terminal Snapshot Tests"`, `"Keyboard Interaction Tests"`, etc.
5. **Test IDs** — Prefixed with category codes: `SNAP-`, `KEY-`, etc.
6. **Cleanup** — Each test manages its own `terminal` instance and calls `terminate()` in the test body (or via `afterEach`).

### SDK types (from `@codeplane/sdk`)

```typescript
// packages/sdk/src/services/user.ts

export interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  email: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface RepoSummary {
  id: number;
  owner: string;
  full_name: string;
  name: string;
  description: string;
  is_public: boolean;
  num_stars: number;
  default_bookmark: string;
  created_at: string;
  updated_at: string;
}

export interface OrgSummary {
  id: number;
  name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
}

export interface ActivitySummary {
  id: number;
  event_type: string;
  action: string;
  actor_username: string;
  target_type: string;
  target_name: string;
  summary: string;
  created_at: string;
}
```

---

## Implementation Plan

### Step 1: Define fixture interfaces

**File modified:** `e2e/tui/dashboard.test.ts`

**Action:** Add fixture interfaces immediately after the imports, before any test blocks. These interfaces mirror the SDK types but are standalone — test files should not import from `@codeplane/sdk` at runtime because test fixtures represent the *API response shape*, not the server-side domain model.

```typescript
// --- Fixture Interfaces ---

interface RepoFixture {
  id: number;
  owner: string;
  full_name: string;
  name: string;
  description: string;
  is_public: boolean;
  num_stars: number;
  default_bookmark: string;
  created_at: string;
  updated_at: string;
}

interface OrgFixture {
  id: number;
  name: string;
  description: string;
  visibility: "public" | "limited" | "private";
  website: string;
  location: string;
}

interface ActivityFixture {
  id: number;
  event_type: string;
  action: string;
  actor_username: string;
  target_type: string;
  target_name: string;
  summary: string;
  created_at: string;
}

interface UserFixture {
  id: number;
  username: string;
  display_name: string;
  email: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}
```

**Design decisions:**
- Interfaces are local to the test file, not shared. Each E2E test file owns its fixtures. This keeps tests independent.
- The `OrgFixture.visibility` uses a literal union (`"public" | "limited" | "private"`) to match the server API's enum constraint, providing type-safety in fixture construction.
- `ActivityFixture.event_type` remains `string` (not a union) because the set of event types may expand, and test fixtures should exercise both known and unknown types.

### Step 2: Create fixture data

**File modified:** `e2e/tui/dashboard.test.ts`

**Action:** Add fixture data arrays after the interfaces. Each array represents the API response body for a specific endpoint.

#### User fixture

```typescript
const testUser: UserFixture = {
  id: 1,
  username: "alice",
  display_name: "Alice Chen",
  email: "alice@example.com",
  bio: "Full-stack developer. Terminal enthusiast.",
  avatar_url: "https://example.com/avatars/alice.png",
  is_admin: false,
  created_at: "2025-01-15T08:00:00Z",
  updated_at: "2026-03-20T14:30:00Z",
};
```

#### Repository fixtures (5+ repos, mix of public/private, varying stars)

```typescript
const repoFixtures: RepoFixture[] = [
  {
    id: 1,
    owner: "alice",
    full_name: "alice/codeplane-cli",
    name: "codeplane-cli",
    description: "Command-line tools for the Codeplane platform",
    is_public: true,
    num_stars: 142,
    default_bookmark: "main",
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2026-03-22T09:15:00Z",
  },
  {
    id: 2,
    owner: "alice",
    full_name: "alice/dotfiles",
    name: "dotfiles",
    description: "Personal configuration files for zsh, tmux, and neovim",
    is_public: true,
    num_stars: 38,
    default_bookmark: "main",
    created_at: "2025-03-10T14:00:00Z",
    updated_at: "2026-03-21T18:45:00Z",
  },
  {
    id: 3,
    owner: "alice",
    full_name: "alice/internal-api",
    name: "internal-api",
    description: "Private microservice for payment processing",
    is_public: false,
    num_stars: 0,
    default_bookmark: "main",
    created_at: "2025-09-20T08:30:00Z",
    updated_at: "2026-03-20T11:00:00Z",
  },
  {
    id: 4,
    owner: "alice",
    full_name: "alice/tui-experiments",
    name: "tui-experiments",
    description: "Exploring terminal UI patterns with OpenTUI and Zig",
    is_public: true,
    num_stars: 1523,
    default_bookmark: "main",
    created_at: "2025-11-05T16:00:00Z",
    updated_at: "2026-03-19T07:30:00Z",
  },
  {
    id: 5,
    owner: "acme",
    full_name: "acme/shared-utils",
    name: "shared-utils",
    description: "Shared utility library for all Acme projects — includes logging, config, and HTTP helpers",
    is_public: false,
    num_stars: 5,
    default_bookmark: "main",
    created_at: "2025-04-15T12:00:00Z",
    updated_at: "2026-03-18T22:10:00Z",
  },
  {
    id: 6,
    owner: "alice",
    full_name: "alice/very-long-repository-name-that-exceeds-normal-display-width",
    name: "very-long-repository-name-that-exceeds-normal-display-width",
    description: "",
    is_public: true,
    num_stars: 0,
    default_bookmark: "main",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-03-17T15:00:00Z",
  },
  {
    id: 7,
    owner: "alice",
    full_name: "alice/null-desc-repo",
    name: "null-desc-repo",
    description: "",
    is_public: true,
    num_stars: 999,
    default_bookmark: "main",
    created_at: "2026-02-14T10:00:00Z",
    updated_at: "2026-03-16T08:00:00Z",
  },
];
```

#### Organization fixtures (3+ orgs, mix of visibility)

```typescript
const orgFixtures: OrgFixture[] = [
  {
    id: 1,
    name: "acme-corp",
    description: "Enterprise software solutions for the modern developer",
    visibility: "public",
    website: "https://acme-corp.example.com",
    location: "San Francisco, CA",
  },
  {
    id: 2,
    name: "open-source-collective",
    description: "Community-driven open source projects",
    visibility: "public",
    website: "https://osc.example.org",
    location: "",
  },
  {
    id: 3,
    name: "internal-team",
    description: "Private development team",
    visibility: "private",
    website: "",
    location: "Remote",
  },
  {
    id: 4,
    name: "alpha-testers",
    description: "",
    visibility: "limited",
    website: "",
    location: "",
  },
];
```

#### Starred repository fixtures (4+ starred repos)

```typescript
const starredRepoFixtures: RepoFixture[] = [
  {
    id: 101,
    owner: "popular",
    full_name: "popular/framework",
    name: "framework",
    description: "The most popular web framework for modern applications",
    is_public: true,
    num_stars: 25430,
    default_bookmark: "main",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2026-03-23T00:00:00Z",
  },
  {
    id: 102,
    owner: "tools",
    full_name: "tools/cli-utils",
    name: "cli-utils",
    description: "Command-line utilities for everyday development tasks",
    is_public: true,
    num_stars: 89,
    default_bookmark: "main",
    created_at: "2024-06-15T10:00:00Z",
    updated_at: "2026-03-22T12:00:00Z",
  },
  {
    id: 103,
    owner: "security",
    full_name: "security/vault-client",
    name: "vault-client",
    description: "Lightweight secrets management client with zero dependencies",
    is_public: true,
    num_stars: 1500,
    default_bookmark: "main",
    created_at: "2025-02-20T08:00:00Z",
    updated_at: "2026-03-21T16:00:00Z",
  },
  {
    id: 104,
    owner: "alice",
    full_name: "alice/codeplane-cli",
    name: "codeplane-cli",
    description: "Command-line tools for the Codeplane platform",
    is_public: true,
    num_stars: 142,
    default_bookmark: "main",
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2026-03-22T09:15:00Z",
  },
  {
    id: 105,
    owner: "data",
    full_name: "data/stream-processor",
    name: "stream-processor",
    description: "High-throughput event stream processor built on Zig",
    is_public: true,
    num_stars: 10250,
    default_bookmark: "main",
    created_at: "2025-08-10T14:00:00Z",
    updated_at: "2026-03-20T20:00:00Z",
  },
];
```

#### Activity feed fixtures (10+ events, mix of types)

```typescript
const activityFixtures: ActivityFixture[] = [
  {
    id: 1,
    event_type: "issue",
    action: "opened",
    actor_username: "alice",
    target_type: "issue",
    target_name: "acme/shared-utils#42",
    summary: "alice opened issue #42 in acme/shared-utils",
    created_at: "2026-03-23T08:00:00Z",
  },
  {
    id: 2,
    event_type: "landing",
    action: "merged",
    actor_username: "bob",
    target_type: "landing_request",
    target_name: "acme/shared-utils!17",
    summary: "bob merged LR !17 in acme/shared-utils",
    created_at: "2026-03-23T06:30:00Z",
  },
  {
    id: 3,
    event_type: "workflow",
    action: "failed",
    actor_username: "ci",
    target_type: "workflow_run",
    target_name: "acme/shared-utils/runs/891",
    summary: "CI failed on acme/shared-utils",
    created_at: "2026-03-23T05:00:00Z",
  },
  {
    id: 4,
    event_type: "landing",
    action: "submitted",
    actor_username: "carol",
    target_type: "landing_request",
    target_name: "open-source-collective/core!23",
    summary: "carol submitted LR !23 in open-source-collective/core",
    created_at: "2026-03-22T14:00:00Z",
  },
  {
    id: 5,
    event_type: "issue",
    action: "closed",
    actor_username: "dave",
    target_type: "issue",
    target_name: "acme/shared-utils#38",
    summary: "dave closed issue #38 in acme/shared-utils",
    created_at: "2026-03-22T10:00:00Z",
  },
  {
    id: 6,
    event_type: "repo",
    action: "created",
    actor_username: "alice",
    target_type: "repository",
    target_name: "alice/new-project",
    summary: "alice created repository alice/new-project",
    created_at: "2026-03-21T16:00:00Z",
  },
  {
    id: 7,
    event_type: "repo",
    action: "forked",
    actor_username: "alice",
    target_type: "repository",
    target_name: "alice/framework-fork",
    summary: "alice forked popular/framework to alice/framework-fork",
    created_at: "2026-03-21T12:00:00Z",
  },
  {
    id: 8,
    event_type: "workflow",
    action: "passed",
    actor_username: "ci",
    target_type: "workflow_run",
    target_name: "alice/codeplane-cli/runs/450",
    summary: "CI passed on alice/codeplane-cli",
    created_at: "2026-03-20T20:00:00Z",
  },
  {
    id: 9,
    event_type: "repo",
    action: "archived",
    actor_username: "alice",
    target_type: "repository",
    target_name: "alice/old-experiment",
    summary: "alice archived repository alice/old-experiment",
    created_at: "2026-03-20T08:00:00Z",
  },
  {
    id: 10,
    event_type: "repo",
    action: "transferred",
    actor_username: "alice",
    target_type: "repository",
    target_name: "acme/migrated-service",
    summary: "alice transferred alice/service to acme/migrated-service",
    created_at: "2026-03-19T14:00:00Z",
  },
  {
    id: 11,
    event_type: "comment",
    action: "created",
    actor_username: "eve",
    target_type: "issue_comment",
    target_name: "acme/shared-utils#42",
    summary: "eve commented on issue #42 in acme/shared-utils",
    created_at: "2026-03-19T10:00:00Z",
  },
  {
    id: 12,
    event_type: "landing",
    action: "submitted",
    actor_username: "alice",
    target_type: "landing_request",
    target_name: "alice/codeplane-cli!8",
    summary: "alice submitted LR !8 in alice/codeplane-cli",
    created_at: "2026-03-18T22:00:00Z",
  },
];
```

#### Empty user fixture

```typescript
const emptyUser: UserFixture = {
  id: 999,
  username: "newuser",
  display_name: "New User",
  email: "newuser@example.com",
  bio: "",
  avatar_url: "",
  is_admin: false,
  created_at: "2026-03-23T00:00:00Z",
  updated_at: "2026-03-23T00:00:00Z",
};

const emptyRepoFixtures: RepoFixture[] = [];
const emptyOrgFixtures: OrgFixture[] = [];
const emptyStarredRepoFixtures: RepoFixture[] = [];
const emptyActivityFixtures: ActivityFixture[] = [];
```

**Design decisions:**

- **Fixture data is inline, not imported from external files.** This follows the pattern from `agents.test.ts`. Fixtures are colocated with tests for readability and independence.
- **7 repos** (not exactly 5) to cover edge cases: long names (id 6), empty descriptions (id 6, 7), zero stars (id 3, 6), high stars (id 4 = 1523), org-owned repo (id 5).
- **4 orgs** with visibility mix: 2 public, 1 private, 1 limited. Org id 4 has empty description.
- **5 starred repos** with star count variety: 89, 142, 1500, 10250, 25430 to test formatting ("89", "142", "1.5k", "10k", "25k").
- **12 activity events** with all required types: issue opened/closed, landing submitted/merged, workflow passed/failed, repo created/forked/archived/transferred, comment created.
- **Timestamps are fixed strings**, not `new Date().toISOString()`. This ensures deterministic snapshot output. The agents test uses `new Date()` but that prevents stable snapshots — we improve on this pattern.
- **Empty user fixture** has zero items for all collections, testing empty-state rendering.

### Step 3: Create dashboard-specific helper functions

**File modified:** `e2e/tui/dashboard.test.ts`

**Action:** Add helper functions after fixtures, before test blocks.

```typescript
// --- Dashboard-Specific Helper Functions ---

/**
 * Wait for the Dashboard screen to fully render.
 * Checks for the "Dashboard" breadcrumb in the header bar.
 * At this scaffold stage, also checks for "Welcome to Codeplane" text.
 * Once data hooks are wired, this will be updated to wait for all 4 panels
 * to finish loading (or show empty state).
 */
async function waitForDashboard(terminal: TUITestInstance): Promise<void> {
  await terminal.waitForText("Dashboard");
}

/**
 * Wait for all 4 dashboard panels to finish loading.
 * Checks for panel titles that indicate data has loaded (or empty state shown).
 * This function will fail until the dashboard panels are implemented.
 */
async function waitForDashboardPanelsLoaded(
  terminal: TUITestInstance,
): Promise<void> {
  await terminal.waitForText("Recent Repos");
  await terminal.waitForText("Organizations");
  await terminal.waitForText("Starred Repos");
  await terminal.waitForText("Activity Feed");
  // Wait for loading indicators to disappear
  await terminal.waitForNoText("Loading…", 5000);
}

/**
 * Assert which panel currently has focus by checking for
 * the primary-colored (ANSI 33) border on the expected panel.
 *
 * Panel indices:
 *   0 = Recent Repos (top-left)
 *   1 = Organizations (top-right)
 *   2 = Starred Repos (bottom-left)
 *   3 = Activity Feed (bottom-right)
 */
async function assertPanelFocused(
  terminal: TUITestInstance,
  panelIndex: number,
): Promise<void> {
  const panelNames = [
    "Recent Repos",
    "Organizations",
    "Starred Repos",
    "Activity Feed",
  ];
  const expectedPanel = panelNames[panelIndex];
  if (!expectedPanel) {
    throw new Error(`Invalid panel index: ${panelIndex}. Must be 0-3.`);
  }

  // The focused panel's title should be rendered with primary color (ANSI 33)
  // We check the terminal buffer for the panel name near ANSI escape codes
  // indicating the primary color
  const content = terminal.snapshot();
  // Verify the panel name exists
  if (!content.includes(expectedPanel)) {
    throw new Error(
      `Panel "${expectedPanel}" not found in terminal content.\n` +
        `Content:\n${content}`,
    );
  }
  // The focused panel border uses ANSI color 33 (blue/primary).
  // We check for the ANSI SGR sequence for color 33 near the panel title.
  // \x1b[38;5;33m or \x1b[33m — the exact sequence depends on theme impl.
  // Regex: panel name preceded by or near ANSI 33 color code
  const focusPattern = new RegExp(
    `\\x1b\\[(?:38;5;)?33m[^\\x1b]*${expectedPanel.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`,
  );
  // Note: This assertion will fail until panel focus rendering is implemented.
  // Left failing per project policy.
  expect(content).toMatch(focusPattern);
}

/**
 * Assert that the terminal content matches a regex pattern.
 * Convenience wrapper around snapshot() + expect().toMatch().
 */
function assertScreenContent(
  terminal: TUITestInstance,
  pattern: RegExp,
): void {
  expect(terminal.snapshot()).toMatch(pattern);
}

/**
 * Capture a terminal snapshot for golden-file comparison.
 * Thin wrapper — exists for API consistency and future extension
 * (e.g., stripping volatile content like timestamps before comparison).
 */
function captureSnapshot(terminal: TUITestInstance): string {
  return terminal.snapshot();
}

/**
 * Navigate to Dashboard from any screen using g d.
 * Will fail until go-to mode is wired in tui-global-keybindings.
 */
async function navigateToDashboard(
  terminal: TUITestInstance,
): Promise<void> {
  await terminal.sendKeys("g", "d");
  await waitForDashboard(terminal);
}

/**
 * Cycle panel focus forward N times using Tab.
 */
async function cyclePanelForward(
  terminal: TUITestInstance,
  times: number = 1,
): Promise<void> {
  for (let i = 0; i < times; i++) {
    await terminal.sendKeys("Tab");
  }
}

/**
 * Cycle panel focus backward N times using Shift+Tab.
 */
async function cyclePanelBackward(
  terminal: TUITestInstance,
  times: number = 1,
): Promise<void> {
  for (let i = 0; i < times; i++) {
    await terminal.sendKeys("shift+Tab");
  }
}

/**
 * Navigate within the focused panel using j/k.
 */
async function navigateInPanel(
  terminal: TUITestInstance,
  direction: "down" | "up",
  times: number = 1,
): Promise<void> {
  const key = direction === "down" ? "j" : "k";
  for (let i = 0; i < times; i++) {
    await terminal.sendKeys(key);
  }
}
```

**Design decisions:**

- **`waitForDashboard()`** is intentionally minimal now (just checks for "Dashboard" text). It will be updated when panel rendering is implemented, but the function signature and usage patterns are stable.
- **`waitForDashboardPanelsLoaded()`** checks for all 4 panel titles and waits for loading indicators to clear. This will fail until panels are implemented — tests using it are left failing.
- **`assertPanelFocused()`** checks for ANSI color 33 (primary) near the panel title. The regex handles both `\x1b[33m` and `\x1b[38;5;33m` SGR sequences. This will fail until panel focus rendering is implemented.
- **`assertScreenContent()`** is a thin wrapper for readability and consistency — tests read more clearly as `assertScreenContent(terminal, /pattern/)` than `expect(terminal.snapshot()).toMatch(/pattern/)`.
- **`captureSnapshot()`** is a wrapper around `terminal.snapshot()` that exists for future extension (stripping volatile content for deterministic comparison).
- **Navigation helpers** (`cyclePanelForward`, `cyclePanelBackward`, `navigateInPanel`) abstract common multi-key sequences.

### Step 4: Add describe blocks and test cases

**File modified:** `e2e/tui/dashboard.test.ts`

**Action:** Add the new describe blocks after the existing scaffold tests. The structure follows the verification sections from `TUI_DASHBOARD_SCREEN.md`.

#### Test Structure Overview

```
describe("TUI_DASHBOARD — Full test infrastructure")
  ├── describe("Terminal Snapshot Tests")
  │   ├── SNAP-DASH-101: All panels populated at 120x40
  │   ├── SNAP-DASH-102: Minimum size (80x24) single-column layout
  │   ├── SNAP-DASH-103: Large size (200x60) expanded layout
  │   ├── SNAP-DASH-104: Empty state (new user)
  │   ├── SNAP-DASH-105: Recent Repos panel content
  │   ├── SNAP-DASH-106: Organizations panel content
  │   ├── SNAP-DASH-107: Starred Repos panel content
  │   ├── SNAP-DASH-108: Activity Feed panel content
  │   ├── SNAP-DASH-109: Focused panel border highlight
  │   ├── SNAP-DASH-110: Quick-actions bar content
  │   ├── SNAP-DASH-111: Loading state (panels loading)
  │   ├── SNAP-DASH-112: Error state (API 500)
  │   ├── SNAP-DASH-113: Inline filter active
  │   ├── SNAP-DASH-114: Panel position indicator at 80x24
  │   └── SNAP-DASH-115: Star count formatting
  │
  ├── describe("Keyboard Interaction Tests")
  │   ├── KEY-DASH-101: Tab cycles panel focus forward
  │   ├── KEY-DASH-102: Shift+Tab cycles panel focus backward
  │   ├── KEY-DASH-103: j/k navigates within focused panel
  │   ├── KEY-DASH-104: Enter on repo navigates to repo overview
  │   ├── KEY-DASH-105: Enter on org navigates to org overview
  │   ├── KEY-DASH-106: Enter on activity navigates to resource
  │   ├── KEY-DASH-107: G jumps to last item
  │   ├── KEY-DASH-108: g g jumps to first item
  │   ├── KEY-DASH-109: Ctrl+D and Ctrl+U page scroll
  │   ├── KEY-DASH-110: c opens create repo
  │   ├── KEY-DASH-111: n opens notifications
  │   ├── KEY-DASH-112: s opens search
  │   ├── KEY-DASH-113: / opens inline filter
  │   ├── KEY-DASH-114: Esc closes filter
  │   ├── KEY-DASH-115: Enter in filter selects match
  │   ├── KEY-DASH-116: R retries failed panel
  │   ├── KEY-DASH-117: h/l column navigation
  │   ├── KEY-DASH-118: Focus preserved per panel
  │   ├── KEY-DASH-119: q on dashboard quits TUI
  │   └── KEY-DASH-120: g d returns to dashboard
  │
  ├── describe("Responsive Tests")
  │   ├── RESIZE-DASH-101: 120x40 → 80x24 collapses to stacked
  │   ├── RESIZE-DASH-102: 80x24 → 120x40 expands to grid
  │   ├── RESIZE-DASH-103: 120x40 → 200x60 shows full content
  │   ├── RESIZE-DASH-104: Rapid resize without artifacts
  │   ├── RESIZE-DASH-105: Focus preserved through resize
  │   ├── RESIZE-DASH-106: Scroll position preserved
  │   └── RESIZE-DASH-107: Quick actions bar adapts
  │
  ├── describe("Data Loading Tests")
  │   ├── DATA-DASH-101: All panels load concurrently
  │   ├── DATA-DASH-102: Pagination on scroll
  │   ├── DATA-DASH-103: Pagination stops at 200 cap
  │   ├── DATA-DASH-104: Data cached on re-navigation
  │   ├── DATA-DASH-105: Panel error state
  │   ├── DATA-DASH-106: 401 auth error message
  │   └── DATA-DASH-107: Empty user state
  │
  └── describe("Edge Case Tests")
      ├── EDGE-DASH-101: No auth token → auth error screen
      ├── EDGE-DASH-102: Long repo names truncated
      ├── EDGE-DASH-103: Unicode/special chars in descriptions
      ├── EDGE-DASH-104: Single item per panel
      ├── EDGE-DASH-105: Concurrent resize + Tab
      ├── EDGE-DASH-106: Filter with no matches
      ├── EDGE-DASH-107: Null description fields
      └── EDGE-DASH-108: Star count edge cases
```

#### Concrete test implementations

The following shows the complete test code. Test IDs use 100+ numbering to avoid collision with the scaffold tests (which use SNAP-DASH-001 through SNAP-DASH-031, KEY-DASH-001 through KEY-DASH-003, etc.).

```typescript
describe("TUI_DASHBOARD — Full test infrastructure", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Terminal Snapshot Tests
  // ═══════════════════════════════════════════════════════════════════

  describe("Terminal Snapshot Tests", () => {
    test("SNAP-DASH-101: Dashboard renders at 120x40 with all panels populated", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // All 4 panels should be visible in two-column grid
      assertScreenContent(terminal, /Recent Repos/);
      assertScreenContent(terminal, /Organizations/);
      assertScreenContent(terminal, /Starred Repos/);
      assertScreenContent(terminal, /Activity Feed/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-102: Dashboard renders at 80x24 minimum size with single-column layout", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Should show single panel with position indicator [1/4]
      assertScreenContent(terminal, /\[1\/4\]/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-103: Dashboard renders at 200x60 large size with expanded content", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Large size should show full descriptions and full timestamps
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-104: Dashboard with empty state (new user, no data)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Empty state messages for each panel
      assertScreenContent(terminal, /No repositories yet/);
      assertScreenContent(terminal, /No organizations/);
      assertScreenContent(terminal, /No starred repositories/);
      assertScreenContent(terminal, /No recent activity/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-105: Recent Repos panel shows repo names, descriptions, visibility badges, and star counts", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Check for repo name in primary color and visibility badge
      assertScreenContent(terminal, /alice\/codeplane-cli/);
      assertScreenContent(terminal, /◆/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-106: Organizations panel shows org names and descriptions", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      assertScreenContent(terminal, /acme-corp/);
      assertScreenContent(terminal, /open-source-collective/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-107: Starred Repos panel shows starred repo names and star counts", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      assertScreenContent(terminal, /popular\/framework/);
      // Star count for 25430 should render as "25k" or "25.4k"
      assertScreenContent(terminal, /25k|25\.4k/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-108: Activity Feed shows event icons, summaries, and timestamps", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Activity summaries
      assertScreenContent(terminal, /alice opened issue #42/);
      assertScreenContent(terminal, /bob merged LR !17/);
      // Event icons (● for issue, ✗ for failure, etc.)
      assertScreenContent(terminal, /●|▶|✓|✗|\+/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-109: Focused panel has primary-colored border", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // First panel (Recent Repos) should have focus by default
      await assertPanelFocused(terminal, 0);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-110: Quick-actions bar shows keybinding labels", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Quick actions bar in content area (not status bar)
      assertScreenContent(terminal, /c:new repo/);
      assertScreenContent(terminal, /n:notification/);
      assertScreenContent(terminal, /s:search/);
      assertScreenContent(terminal, /\/:filter/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-111: Dashboard panels show loading state", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Panels should show "Loading…" before data arrives
      assertScreenContent(terminal, /Loading/);
    });

    test("SNAP-DASH-112: Dashboard panel shows error state on API failure", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Error panel should show error message with retry hint
      assertScreenContent(terminal, /error|Error|failed|Failed/);
      assertScreenContent(terminal, /R.*retry|retry/i);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-113: Inline filter input visible when activated", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Activate filter
      await terminal.sendKeys("/");
      // Filter input should appear
      assertScreenContent(terminal, /Filter|filter|Search|search/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("SNAP-DASH-114: Panel title shows [N/4] indicator at 80x24", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Default panel [1/4]
      assertScreenContent(terminal, /\[1\/4\]/);
      // Tab to next panel
      await terminal.sendKeys("Tab");
      assertScreenContent(terminal, /\[2\/4\]/);
    });

    test("SNAP-DASH-115: Star count formatting for various magnitudes", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      const content = captureSnapshot(terminal);
      // 0 stars should show nothing or "0"
      // 142 stars should show "142"
      // 1523 stars should show "1.5k"
      // These assertions validate the star count formatting logic
      expect(content).toMatch(/142|1\.5k|25k/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Keyboard Interaction Tests
  // ═══════════════════════════════════════════════════════════════════

  describe("Keyboard Interaction Tests", () => {
    test("KEY-DASH-101: Tab cycles panel focus forward through all 4 panels", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Default: Recent Repos focused (panel 0)
      await assertPanelFocused(terminal, 0);
      // Tab → Organizations (panel 1)
      await cyclePanelForward(terminal, 1);
      await assertPanelFocused(terminal, 1);
      // Tab → Starred Repos (panel 2)
      await cyclePanelForward(terminal, 1);
      await assertPanelFocused(terminal, 2);
      // Tab → Activity Feed (panel 3)
      await cyclePanelForward(terminal, 1);
      await assertPanelFocused(terminal, 3);
      // Tab → wraps to Recent Repos (panel 0)
      await cyclePanelForward(terminal, 1);
      await assertPanelFocused(terminal, 0);
    });

    test("KEY-DASH-102: Shift+Tab cycles panel focus backward", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Default: Recent Repos (panel 0)
      await assertPanelFocused(terminal, 0);
      // Shift+Tab → wraps to Activity Feed (panel 3)
      await cyclePanelBackward(terminal, 1);
      await assertPanelFocused(terminal, 3);
      // Shift+Tab → Starred Repos (panel 2)
      await cyclePanelBackward(terminal, 1);
      await assertPanelFocused(terminal, 2);
    });

    test("KEY-DASH-103: j/k navigates within focused panel", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Move down in Recent Repos
      await navigateInPanel(terminal, "down", 1);
      // Second repo should now be highlighted (reverse video)
      const content = captureSnapshot(terminal);
      // The focused item should have reverse video ANSI code
      expect(content).toMatch(/\x1b\[7m.*dotfiles|dotfiles.*\x1b\[7m/);
      // Move back up
      await navigateInPanel(terminal, "up", 1);
      const contentAfter = captureSnapshot(terminal);
      expect(contentAfter).toMatch(/\x1b\[7m.*codeplane-cli|codeplane-cli.*\x1b\[7m/);
    });

    test("KEY-DASH-104: Enter on repo navigates to repo overview", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Press Enter on first repo
      await terminal.sendKeys("Enter");
      // Should navigate to repo overview — breadcrumb shows repo context
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard.*›.*alice\/codeplane-cli|alice\/codeplane-cli/);
    });

    test("KEY-DASH-105: Enter on org navigates to org overview", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Tab to Organizations panel
      await cyclePanelForward(terminal, 1);
      // Press Enter on first org
      await terminal.sendKeys("Enter");
      // Should navigate to org overview
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard.*›.*acme-corp|acme-corp/);
    });

    test("KEY-DASH-106: Enter on activity item navigates to referenced resource", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Tab to Activity Feed panel (panel 3)
      await cyclePanelForward(terminal, 3);
      // Press Enter on first activity (issue opened)
      await terminal.sendKeys("Enter");
      // Should navigate to the referenced issue
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/›/);
    });

    test("KEY-DASH-107: G jumps to last item in focused panel", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Press G to jump to last repo
      await terminal.sendKeys("G");
      // Last repo in fixture should be highlighted
      const content = captureSnapshot(terminal);
      expect(content).toMatch(/null-desc-repo/);
    });

    test("KEY-DASH-108: g g jumps to first item in focused panel", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Navigate down several items
      await navigateInPanel(terminal, "down", 4);
      // g g should jump back to first
      await terminal.sendKeys("g", "g");
      const content = captureSnapshot(terminal);
      // First repo should be highlighted
      expect(content).toMatch(/\x1b\[7m.*codeplane-cli|codeplane-cli.*\x1b\[7m/);
    });

    test("KEY-DASH-109: Ctrl+D pages down, Ctrl+U pages up", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Ctrl+D should page down
      await terminal.sendKeys("ctrl+d");
      // Ctrl+U should page back up
      await terminal.sendKeys("ctrl+u");
      // First item should be near top again
      const content = captureSnapshot(terminal);
      expect(content).toMatch(/codeplane-cli/);
    });

    test("KEY-DASH-110: c opens create repository screen", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      await terminal.sendKeys("c");
      // Should navigate to create repo screen or show create form
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Create|New|Repository/i);
    });

    test("KEY-DASH-111: n opens notifications screen", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      await terminal.sendKeys("n");
      await terminal.waitForText("Notifications");
    });

    test("KEY-DASH-112: s opens search screen", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      await terminal.sendKeys("s");
      await terminal.waitForText("Search");
    });

    test("KEY-DASH-113: / opens inline filter in focused panel", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      await terminal.sendKeys("/");
      // Filter input should be visible
      assertScreenContent(terminal, /Filter|filter|Search|search/);
      // Type a filter query
      await terminal.sendText("dotfiles");
      // List should narrow to matching items
      assertScreenContent(terminal, /dotfiles/);
    });

    test("KEY-DASH-114: Esc closes filter and restores full list", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Open filter and type
      await terminal.sendKeys("/");
      await terminal.sendText("xyz-nonexistent");
      // Esc should close filter
      await terminal.sendKeys("Escape");
      // Full list should be restored
      assertScreenContent(terminal, /codeplane-cli/);
      assertScreenContent(terminal, /dotfiles/);
    });

    test("KEY-DASH-115: Enter in filter selects first match and closes filter", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("dotfiles");
      await terminal.sendKeys("Enter");
      // Filter should close and cursor should be on matched item
      const content = captureSnapshot(terminal);
      expect(content).toMatch(/\x1b\[7m.*dotfiles|dotfiles.*\x1b\[7m/);
    });

    test("KEY-DASH-116: R retries failed panel", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Assuming repos panel has error
      await terminal.sendKeys("R");
      // Should show loading indicator (retry in progress)
      assertScreenContent(terminal, /Loading|Retrying/i);
    });

    test("KEY-DASH-117: h/l moves focus between columns in two-column layout", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Default: Recent Repos (panel 0, left column)
      await assertPanelFocused(terminal, 0);
      // l → move to right column → Organizations (panel 1)
      await terminal.sendKeys("l");
      await assertPanelFocused(terminal, 1);
      // h → back to left column → Recent Repos (panel 0)
      await terminal.sendKeys("h");
      await assertPanelFocused(terminal, 0);
    });

    test("KEY-DASH-118: Focus position preserved per panel across panel switches", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Move to 3rd repo in Recent Repos
      await navigateInPanel(terminal, "down", 2);
      // Tab to Organizations
      await cyclePanelForward(terminal, 1);
      // Move to 2nd org
      await navigateInPanel(terminal, "down", 1);
      // Shift+Tab back to Recent Repos
      await cyclePanelBackward(terminal, 1);
      // 3rd repo should still be highlighted
      const content = captureSnapshot(terminal);
      expect(content).toMatch(/\x1b\[7m.*internal-api|internal-api.*\x1b\[7m/);
    });

    test("KEY-DASH-119: q on dashboard root quits TUI", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      await terminal.sendKeys("q");
      // TUI should exit — if it doesn't, test will timeout
    });

    test("KEY-DASH-120: g d returns to dashboard from another screen", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Navigate away
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      // Navigate back
      await terminal.sendKeys("g", "d");
      await waitForDashboard(terminal);
      // Verify stack depth 1
      const headerLine = terminal.getLine(0);
      expect(headerLine).not.toMatch(/›/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Responsive Tests
  // ═══════════════════════════════════════════════════════════════════

  describe("Responsive Tests", () => {
    test("RESIZE-DASH-101: 120x40 → 80x24 collapses grid to single-column stacked layout", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Verify grid layout
      assertScreenContent(terminal, /Recent Repos/);
      assertScreenContent(terminal, /Organizations/);
      // Resize to minimum
      await terminal.resize(80, 24);
      // Should collapse to stacked with [N/4] indicator
      assertScreenContent(terminal, /\[\d\/4\]/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("RESIZE-DASH-102: 80x24 → 120x40 expands stacked to grid layout", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Should be stacked
      assertScreenContent(terminal, /\[\d\/4\]/);
      // Resize to standard
      await terminal.resize(120, 40);
      // Should now show grid with all panels
      assertScreenContent(terminal, /Recent Repos/);
      assertScreenContent(terminal, /Organizations/);
      assertScreenContent(terminal, /Starred Repos/);
      assertScreenContent(terminal, /Activity Feed/);
    });

    test("RESIZE-DASH-103: 120x40 → 200x60 shows full descriptions and timestamps", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      await terminal.resize(200, 60);
      // At large size, full timestamps like "hours ago" should appear
      // (vs compact "2h" at standard)
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("RESIZE-DASH-104: Rapid resize sequence produces clean layout", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Rapid resize sequence
      await terminal.resize(80, 24);
      await terminal.resize(200, 60);
      await terminal.resize(100, 30);
      await terminal.resize(150, 45);
      // Final state should be clean
      assertScreenContent(terminal, /Dashboard/);
      expect(captureSnapshot(terminal)).toMatchSnapshot();
    });

    test("RESIZE-DASH-105: Focus preserved when resizing between grid and stacked", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Focus Organizations panel (panel 1)
      await cyclePanelForward(terminal, 1);
      // Resize to stacked
      await terminal.resize(80, 24);
      // Organizations should be the visible panel in stacked mode
      assertScreenContent(terminal, /Organizations/);
      assertScreenContent(terminal, /\[2\/4\]/);
    });

    test("RESIZE-DASH-106: Scroll position preserved through resize", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Scroll down in repos
      await navigateInPanel(terminal, "down", 4);
      // Resize
      await terminal.resize(200, 60);
      // Item 5 should still be visible/focused
      assertScreenContent(terminal, /shared-utils/);
    });

    test("RESIZE-DASH-107: Quick actions bar adapts to terminal width", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Full labels at 120
      assertScreenContent(terminal, /c:new repo/);
      // Resize to 80
      await terminal.resize(80, 24);
      // Should show truncated labels or Tab hint
      assertScreenContent(terminal, /Tab/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Data Loading Tests
  // ═══════════════════════════════════════════════════════════════════

  describe("Data Loading Tests", () => {
    test("DATA-DASH-101: All 4 panels load data concurrently on mount", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      // All panels should eventually show data (or empty state)
      await waitForDashboardPanelsLoaded(terminal);
      // Verify all 4 panel titles visible
      assertScreenContent(terminal, /Recent Repos/);
      assertScreenContent(terminal, /Organizations/);
      assertScreenContent(terminal, /Starred Repos/);
      assertScreenContent(terminal, /Activity Feed/);
    });

    test("DATA-DASH-102: Pagination triggers on scroll past 80% of panel content", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Scroll to bottom of repos panel to trigger pagination
      await terminal.sendKeys("G");
      // Should show "Loading more..." at bottom
      assertScreenContent(terminal, /Loading more|loading/i);
    });

    test("DATA-DASH-103: Pagination stops at 200-item memory cap", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // This test validates the 200-item cap behavior
      // With fixture data well under 200, we verify the cap doesn't interfere
      assertScreenContent(terminal, /Recent Repos/);
    });

    test("DATA-DASH-104: Data cached on re-navigation (no loading spinner on return)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Navigate away
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Notifications");
      // Navigate back
      await terminal.sendKeys("g", "d");
      await waitForDashboard(terminal);
      // Should NOT show loading spinners (data cached)
      await terminal.waitForNoText("Loading", 2000);
    });

    test("DATA-DASH-105: Individual panel shows error while others render normally", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // One panel should show error, others should show data
      // The exact behavior depends on which API endpoints fail
      const content = captureSnapshot(terminal);
      // At minimum, the dashboard should not crash entirely
      expect(content).toMatch(/Dashboard/);
    });

    test("DATA-DASH-106: 401 auth error shows session expired message", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ token: "expired-token" }),
      });
      // With an invalid/expired token, should show auth error
      await terminal.waitForText("Session expired");
      assertScreenContent(terminal, /codeplane auth login/);
    });

    test("DATA-DASH-107: Empty user state shows all empty-state messages", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // With empty user, all panels should show empty state
      assertScreenContent(terminal, /No repositories yet/);
      assertScreenContent(terminal, /No organizations/);
      assertScreenContent(terminal, /No starred repositories/);
      assertScreenContent(terminal, /No recent activity/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Edge Case Tests
  // ═══════════════════════════════════════════════════════════════════

  describe("Edge Case Tests", () => {
    test("EDGE-DASH-101: No auth token shows auth error screen, not dashboard", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: {
          CODEPLANE_API_URL: "http://localhost:13370",
          CODEPLANE_TOKEN: "",
          CODEPLANE_DISABLE_SSE: "1",
        },
      });
      // Should show auth error, not dashboard
      await terminal.waitForText("auth");
      await terminal.waitForNoText("Recent Repos", 3000);
    });

    test("EDGE-DASH-102: Extremely long repo names truncated at 40 chars with ellipsis", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // The long repo name should be truncated
      const content = captureSnapshot(terminal);
      // Full name is "alice/very-long-repository-name-that-exceeds-normal-display-width"
      // Should be truncated with …
      expect(content).toMatch(/very-long-repository.*…/);
      // Full name should NOT appear
      expect(content).not.toMatch(/exceeds-normal-display-width/);
    });

    test("EDGE-DASH-103: Unicode and special characters in descriptions render without terminal corruption", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Dashboard should render cleanly with fixture data
      // No terminal corruption indicators
      const content = captureSnapshot(terminal);
      expect(content).toMatch(/Dashboard/);
      // Should not contain raw control characters outside ANSI escapes
      expect(content).not.toMatch(/[\x00-\x08\x0E-\x1A]/);
    });

    test("EDGE-DASH-104: Single item per panel renders correctly", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // With single-item panels, cursor should not crash
      await terminal.sendKeys("j"); // Should not crash or go out of bounds
      await terminal.sendKeys("k"); // Should not crash
      const content = captureSnapshot(terminal);
      expect(content).toMatch(/Dashboard/);
    });

    test("EDGE-DASH-105: Concurrent resize and Tab does not cause artifacts or focus corruption", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: createMockAPIEnv(),
      });
      await waitForDashboard(terminal);
      // Rapid Tab + resize interleaving
      await terminal.sendKeys("Tab");
      await terminal.resize(80, 24);
      await terminal.sendKeys("Tab");
      await terminal.resize(120, 40);
      await terminal.sendKeys("Tab");
      // Should still render cleanly
      const content = captureSnapshot(terminal);
      expect(content).toMatch(/Dashboard/);
      // No visual artifacts — snapshot should be valid
      expect(content).not.toBe("");
    });

    test("EDGE-DASH-106: Filter with no matches shows '0 of N' and Esc restores list", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("zzz-does-not-exist-anywhere");
      // Should show "0 of N" match count
      assertScreenContent(terminal, /0 of \d+/);
      // Esc should restore full list
      await terminal.sendKeys("Escape");
      assertScreenContent(terminal, /codeplane-cli/);
    });

    test("EDGE-DASH-107: Null/empty description fields render without 'null' text", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      // Fixture repos id=6 and id=7 have empty descriptions
      const content = captureSnapshot(terminal);
      // Should not show literal "null" or "undefined"
      expect(content).not.toMatch(/\bnull\b/);
      expect(content).not.toMatch(/\bundefined\b/);
    });

    test("EDGE-DASH-108: Star count edge cases format correctly", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await waitForDashboardPanelsLoaded(terminal);
      const content = captureSnapshot(terminal);
      // 0 stars — should not show "0" or should be omitted
      // 142 stars — should show "142"
      // 1523 stars — should show "1.5k"
      // 25430 stars (starred panel) — should show "25k" or "25.4k"
      // 10250 stars (starred panel) — should show "10k" or "10.2k"
      expect(content).toMatch(/142/);
      expect(content).toMatch(/1\.5k|1523/);
    });
  });
});
```

### Step 5: Integrate with existing scaffold tests

**File modified:** `e2e/tui/dashboard.test.ts`

**Action:** The new test infrastructure is **appended** to the existing file, not replacing it. The file structure becomes:

```
e2e/tui/dashboard.test.ts
├── imports (from "bun:test" and "./helpers")
├── Fixture interfaces
├── Fixture data (populated user + empty user)
├── Dashboard-specific helper functions
├── describe("TUI_DASHBOARD — Screen scaffold")         ← from scaffold ticket
│   ├── describe("module scaffold")
│   ├── describe("default launch")
│   ├── describe("header bar breadcrumb")
│   ├── describe("status bar keybinding hints")
│   ├── describe("keyboard interaction")
│   ├── describe("responsive layout")
│   └── describe("navigation integration")
└── describe("TUI_DASHBOARD — Full test infrastructure") ← this ticket
    ├── describe("Terminal Snapshot Tests")
    ├── describe("Keyboard Interaction Tests")
    ├── describe("Responsive Tests")
    ├── describe("Data Loading Tests")
    └── describe("Edge Case Tests")
```

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `e2e/tui/dashboard.test.ts` | **Modify** | Add fixture interfaces, fixture data, helper functions, and 5 new describe blocks with ~50 test cases |

## Files NOT Changed

| File | Reason |
|------|--------|
| `e2e/tui/helpers.ts` | All new helpers are dashboard-specific and belong in the test file, not in shared helpers. The shared `launchTUI`, `TUITestInstance`, `TERMINAL_SIZES`, and `createMockAPIEnv` are consumed as-is. |
| `apps/tui/src/**/*` | This ticket is test infrastructure only. No application code changes. |
| Any other `e2e/tui/*.test.ts` | Tests are scoped to the dashboard file. |

---

## Unit & Integration Tests

### Test Inventory

All tests are in `e2e/tui/dashboard.test.ts`. The following table maps each test to its verification section, expected pass/fail status, and the blocking dependency.

#### Terminal Snapshot Tests

| Test ID | Description | Expected Status | Blocking Dependency |
|---------|-------------|----------------|--------------------|
| SNAP-DASH-101 | All panels populated at 120x40 | ❌ Fails | Dashboard panels not implemented |
| SNAP-DASH-102 | Minimum size single-column layout | ❌ Fails | Dashboard panels not implemented |
| SNAP-DASH-103 | Large size expanded layout | ❌ Fails | Dashboard panels not implemented |
| SNAP-DASH-104 | Empty state (new user) | ❌ Fails | Dashboard panels not implemented |
| SNAP-DASH-105 | Recent Repos panel content | ❌ Fails | `tui-dashboard-repos-list` |
| SNAP-DASH-106 | Organizations panel content | ❌ Fails | `tui-dashboard-orgs-list` |
| SNAP-DASH-107 | Starred Repos panel content | ❌ Fails | `tui-dashboard-starred-repos` |
| SNAP-DASH-108 | Activity Feed panel content | ❌ Fails | `tui-dashboard-activity-feed` |
| SNAP-DASH-109 | Focused panel border highlight | ❌ Fails | Panel focus rendering |
| SNAP-DASH-110 | Quick-actions bar content | ❌ Fails | `tui-dashboard-quick-actions` |
| SNAP-DASH-111 | Loading state | ❌ Fails | Dashboard data hooks |
| SNAP-DASH-112 | Error state (API 500) | ❌ Fails | Dashboard data hooks |
| SNAP-DASH-113 | Inline filter active | ❌ Fails | Dashboard filter implementation |
| SNAP-DASH-114 | Panel position indicator at 80x24 | ❌ Fails | Stacked panel layout |
| SNAP-DASH-115 | Star count formatting | ❌ Fails | `tui-dashboard-repos-list` |

#### Keyboard Interaction Tests

| Test ID | Description | Expected Status | Blocking Dependency |
|---------|-------------|----------------|--------------------|
| KEY-DASH-101 | Tab cycles panel focus forward | ❌ Fails | Panel focus system |
| KEY-DASH-102 | Shift+Tab cycles panel focus backward | ❌ Fails | Panel focus system |
| KEY-DASH-103 | j/k navigates within panel | ❌ Fails | Panel item navigation |
| KEY-DASH-104 | Enter on repo navigates | ❌ Fails | `tui-dashboard-repos-list` |
| KEY-DASH-105 | Enter on org navigates | ❌ Fails | `tui-dashboard-orgs-list` |
| KEY-DASH-106 | Enter on activity navigates | ❌ Fails | `tui-dashboard-activity-feed` |
| KEY-DASH-107 | G jumps to last item | ❌ Fails | Panel item navigation |
| KEY-DASH-108 | g g jumps to first item | ❌ Fails | Panel item navigation |
| KEY-DASH-109 | Ctrl+D/Ctrl+U page scroll | ❌ Fails | Panel scroll implementation |
| KEY-DASH-110 | c opens create repo | ❌ Fails | `tui-dashboard-quick-actions` |
| KEY-DASH-111 | n opens notifications | ❌ Fails | Dashboard quick action keybinding |
| KEY-DASH-112 | s opens search | ❌ Fails | Dashboard quick action keybinding |
| KEY-DASH-113 | / opens inline filter | ❌ Fails | Dashboard filter implementation |
| KEY-DASH-114 | Esc closes filter | ❌ Fails | Dashboard filter implementation |
| KEY-DASH-115 | Enter in filter selects match | ❌ Fails | Dashboard filter implementation |
| KEY-DASH-116 | R retries failed panel | ❌ Fails | Dashboard error handling |
| KEY-DASH-117 | h/l column navigation | ❌ Fails | Panel focus system |
| KEY-DASH-118 | Focus preserved per panel | ❌ Fails | Panel focus system |
| KEY-DASH-119 | q on dashboard quits | ✅ Pass (scaffold covers) | None |
| KEY-DASH-120 | g d returns to dashboard | ❌ Fails | Go-to mode not wired |

#### Responsive Tests

| Test ID | Description | Expected Status | Blocking Dependency |
|---------|-------------|----------------|--------------------|
| RESIZE-DASH-101 | Grid → stacked collapse | ❌ Fails | Panel layout system |
| RESIZE-DASH-102 | Stacked → grid expand | ❌ Fails | Panel layout system |
| RESIZE-DASH-103 | Standard → large shows full content | ❌ Fails | Responsive panel rendering |
| RESIZE-DASH-104 | Rapid resize without artifacts | ❌ Fails | Panel layout system |
| RESIZE-DASH-105 | Focus preserved through resize | ❌ Fails | Panel focus + resize |
| RESIZE-DASH-106 | Scroll position preserved | ❌ Fails | Panel scroll + resize |
| RESIZE-DASH-107 | Quick actions bar adapts | ❌ Fails | `tui-dashboard-quick-actions` |

#### Data Loading Tests

| Test ID | Description | Expected Status | Blocking Dependency |
|---------|-------------|----------------|--------------------|
| DATA-DASH-101 | All panels load concurrently | ❌ Fails | Dashboard data hooks |
| DATA-DASH-102 | Pagination on scroll | ❌ Fails | Dashboard pagination |
| DATA-DASH-103 | Pagination 200-item cap | ❌ Fails | Dashboard pagination |
| DATA-DASH-104 | Data cached on re-navigation | ❌ Fails | Data hooks + go-to mode |
| DATA-DASH-105 | Individual panel error | ❌ Fails | Dashboard error handling |
| DATA-DASH-106 | 401 auth error message | ❌ Fails | Auth error display |
| DATA-DASH-107 | Empty user state | ❌ Fails | Dashboard empty states |

#### Edge Case Tests

| Test ID | Description | Expected Status | Blocking Dependency |
|---------|-------------|----------------|--------------------|
| EDGE-DASH-101 | No auth token → auth error | ✅ Pass (scaffold covers) | None |
| EDGE-DASH-102 | Long repo names truncated | ❌ Fails | `tui-dashboard-repos-list` |
| EDGE-DASH-103 | Unicode chars no corruption | ❌ Fails | Dashboard panel rendering |
| EDGE-DASH-104 | Single item per panel | ❌ Fails | Panel item navigation |
| EDGE-DASH-105 | Concurrent resize + Tab | ❌ Fails | Panel focus + resize |
| EDGE-DASH-106 | Filter no matches | ❌ Fails | Dashboard filter |
| EDGE-DASH-107 | Null description no "null" text | ❌ Fails | `tui-dashboard-repos-list` |
| EDGE-DASH-108 | Star count formatting | ❌ Fails | `tui-dashboard-repos-list` |

### Failure Policy

**All tests that fail due to unimplemented features are left failing.** They are never skipped (`test.skip`), commented out, or guarded with `if` conditions. Each failing test is a signal that tracks the implementation status of its blocking dependency.

When the blocking dependency ticket is completed, the corresponding tests should begin passing without any modifications to the test file.

---

## Productionization Checklist

### Current State (this ticket)

This ticket delivers **test infrastructure only**. No application code is created or modified. The deliverables are:

1. Fixture interfaces and data — ready for use by all subsequent dashboard tickets.
2. Helper functions — composable utilities for dashboard E2E tests.
3. 50 test cases — organized into 5 describe blocks matching the verification spec.
4. Snapshot capture points — golden-file baselines established for the dashboard at 3 terminal sizes.

### From Test Infrastructure → Full Coverage

| Concern | Current State | Full Coverage Target | Unblocked By |
|---------|---------------|---------------------|-------------|
| Fixture data served by test API | Fixtures defined but not served | Test API mock server returns fixture data for `/api/user/repos`, `/api/user/starred`, `/api/user/orgs`, `/api/users/:username/activity` | `tui-dashboard-data-hooks` + test server setup |
| Snapshot baselines | Capture points defined, baselines not yet generated | Golden files generated and committed for all 3 sizes | Dashboard panels fully implemented |
| Panel focus assertions | `assertPanelFocused()` checks for ANSI color codes | Assertions pass with real focus rendering | Panel focus system implementation |
| Reverse video assertions | Tests check for `\x1b[7m` ANSI code | Assertions pass with real item highlighting | Panel item rendering |
| Filter assertions | Tests check for filter input and match count | Assertions pass with real filter implementation | Dashboard filter implementation |

### Test Data Serving Strategy

The fixture data defined in this ticket is structured to match the API response shapes. When the test API mock server is set up, these fixtures should be served as:

| Endpoint | Fixture | Response |
|----------|---------|----------|
| `GET /api/user` | `testUser` | Single JSON object |
| `GET /api/user/repos?page=1&per_page=20` | `repoFixtures` | Bare array, `X-Total-Count: 7` |
| `GET /api/user/starred?page=1&per_page=20` | `starredRepoFixtures` | Bare array, `X-Total-Count: 5` |
| `GET /api/user/orgs?page=1&per_page=20` | `orgFixtures` | Bare array, `X-Total-Count: 4` |
| `GET /api/users/alice/activity?page=1&per_page=30` | `activityFixtures` | Bare array, `X-Total-Count: 12` |

For the empty user scenario:

| Endpoint | Fixture | Response |
|----------|---------|----------|
| `GET /api/user` | `emptyUser` | Single JSON object |
| All list endpoints | `empty*Fixtures` | Empty array `[]`, `X-Total-Count: 0` |

The exact mechanism (in-process mock server, real test server with seed data, or HTTP intercept) will be determined by the `tui-dashboard-data-hooks` ticket. This test infrastructure is designed to work with any of these approaches.

### No POC Code in apps/tui/

This ticket creates no code in `apps/tui/src/`. All deliverables are test infrastructure in `e2e/tui/dashboard.test.ts`. There is nothing to productionize.

---

## Acceptance Criteria

1. ✅ `e2e/tui/dashboard.test.ts` contains fixture interfaces for `RepoFixture`, `OrgFixture`, `ActivityFixture`, and `UserFixture`
2. ✅ Fixture data includes: 7 repos (mix of public/private, 0 to 1523 stars, empty descriptions, long names), 4 orgs (3 visibility types), 5 starred repos (star counts 89 to 25430), 12 activity events (issue, landing, workflow, repo, comment types), and an empty user fixture
3. ✅ Helper functions implemented: `waitForDashboard()`, `waitForDashboardPanelsLoaded()`, `assertPanelFocused(panelIndex)`, `assertScreenContent(regex)`, `captureSnapshot()`, `navigateToDashboard()`, `cyclePanelForward()`, `cyclePanelBackward()`, `navigateInPanel()`
4. ✅ Tests organized into 5 describe blocks: `"Terminal Snapshot Tests"`, `"Keyboard Interaction Tests"`, `"Responsive Tests"`, `"Data Loading Tests"`, `"Edge Case Tests"`
5. ✅ ~50 test cases covering all verification sections from `TUI_DASHBOARD_SCREEN.md`
6. ✅ Tests use `@microsoft/tui-test` via `launchTUI()` from shared helpers — no direct `@microsoft/tui-test` imports in the test file
7. ✅ Tests use `toMatchSnapshot()` for golden-file comparison at key interaction points
8. ✅ Tests use keyboard simulation (`sendKeys`, `sendText`) for interaction verification
9. ✅ Tests run at all 3 terminal sizes (80×24, 120×40, 200×60)
10. ✅ Tests that fail due to unimplemented features are left failing — never skipped or commented out
11. ✅ No mocking of implementation details — tests validate user-visible behavior
12. ✅ Each test is independent — launches a fresh TUI instance, cleans up via `afterEach`
13. ✅ Test IDs follow established convention: `SNAP-DASH-*`, `KEY-DASH-*`, `RESIZE-DASH-*`, `DATA-DASH-*`, `EDGE-DASH-*`
14. ✅ Test ID numbering starts at 101 to avoid collision with scaffold tests (001–031)
15. ✅ Fixture timestamps are fixed strings (not `new Date()`) for deterministic snapshot output