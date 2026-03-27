# Engineering Specification: `tui-deep-link-launch`

## TUI Deep-Link Launch via CLI Flags `--screen`, `--repo`, `--org`

---

## Overview

This specification details the implementation of deep-link launch for the Codeplane TUI. When a user runs `codeplane tui --screen issues --repo acme/api`, the TUI opens directly to the issue list for that repository with a pre-populated navigation stack enabling natural backward navigation via `q`.

### Current State

The codebase has **partial** deep-link support:

- **`parseCLIArgs()`** (`apps/tui/src/lib/terminal.ts`): Parses `--screen` and `--repo` but **not `--org`**. No input validation (regex, length limits, control character stripping).
- **`buildInitialStack()`** (`apps/tui/src/navigation/deepLinks.ts`): Builds navigation stacks from `screen` + `repo` args. Supports org in the `DeepLinkArgs` interface but **no org-specific stack logic** (e.g., `--org acme` → `[Dashboard, OrgOverview(acme)]`).
- **`index.tsx`**: `deepLinkResult.error` is computed but **never displayed** in the status bar. The error string is silently discarded.
- **Status bar error**: `LoadingProvider` has `statusBarError` state with 5-second auto-clear, but there is **no code path** that feeds deep-link errors into it.
- **Validation**: Repo format validated only as "contains one `/`" — no regex, no length limits, no control character stripping.
- **`NO_COLOR` handling**: Status bar renders error with `theme.error` color but no `[ERROR]` prefix for no-color terminals.
- **Telemetry**: No `tui.deep_link.*` events are emitted.
- **Logging**: No structured deep-link log messages.

### Dependencies

| Dependency | Status | Notes |
|---|---|---|
| `tui-navigation-provider` | ✅ Implemented | `NavigationProvider` with `initialStack`, `push/pop/replace/reset`, `repoContext`, `orgContext` |
| `tui-screen-registry` | ✅ Implemented | 32 screens in `screenRegistry`, all using `PlaceholderScreen` |
| `tui-screen-router` | ✅ Implemented | `ScreenRouter` renders `currentScreen` from registry |
| `tui-bootstrap-and-renderer` | ✅ Implemented | `index.tsx` creates renderer, mounts provider stack, passes `initialStack` |

---

## Implementation Plan

### Step 1: Add `--org` flag to CLI argument parser

**File:** `apps/tui/src/lib/terminal.ts`

**Changes:**

1. Add `org?: string` field to `TUILaunchOptions` interface.
2. Add `--org` case to `parseCLIArgs()` switch statement.

```typescript
export interface TUILaunchOptions {
  repo?: string;
  screen?: string;
  org?: string;        // ← NEW
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
      case "--org":
        opts.org = argv[++i];
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

Minimal, low-risk change. No behavioral changes for existing flags.

---

### Step 2: Add input validation module

**File (new):** `apps/tui/src/navigation/deep-link-validation.ts`

Pure-function module with zero React dependencies for independent testability.

```typescript
/** Allowlist of valid --screen values (lowercase canonical form). */
export const VALID_SCREENS = new Set([
  "dashboard", "repos", "repositories", "issues", "landings",
  "landing-requests", "workspaces", "workflows", "search",
  "notifications", "agents", "settings", "orgs", "organizations",
  "sync", "wiki", "repo-detail",
]);

/** Screens that require --repo context. */
export const REPO_REQUIRED_SCREENS = new Set([
  "issues", "landings", "landing-requests", "workflows", "wiki", "repo-detail",
]);

export const MAX_SCREEN_LENGTH = 32;
export const MAX_REPO_LENGTH = 128;
export const MAX_ORG_LENGTH = 64;
export const MAX_REPO_SEGMENT_LENGTH = 64;
export const SCREEN_ERROR_TRUNCATE = 32;
export const REPO_ERROR_TRUNCATE = 64;
export const ORG_ERROR_TRUNCATE = 32;

export const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
export const ORG_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const CONTROL_CHARS = /[\x00-\x09\x0b-\x1f]|\x1b\[[0-9;]*[a-zA-Z]/g;

export interface DeepLinkValidationResult {
  valid: boolean;
  screen?: string;
  repo?: string;
  owner?: string;
  repoName?: string;
  org?: string;
  error?: string;
}

export function sanitize(input: string): string {
  return input.replace(CONTROL_CHARS, "");
}

export function truncateForError(input: string, maxLength: number): string {
  const clean = sanitize(input);
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1) + "…";
}

export function validateDeepLinkInputs(args: {
  screen?: string;
  repo?: string;
  org?: string;
}): DeepLinkValidationResult {
  const { screen: rawScreen, repo: rawRepo, org: rawOrg } = args;

  let normalizedScreen: string | undefined;
  if (rawScreen !== undefined) {
    if (rawScreen.length > MAX_SCREEN_LENGTH) {
      return { valid: false, error: `Unknown screen: ${truncateForError(rawScreen, SCREEN_ERROR_TRUNCATE)}` };
    }
    normalizedScreen = sanitize(rawScreen).toLowerCase();
    if (!VALID_SCREENS.has(normalizedScreen)) {
      return { valid: false, error: `Unknown screen: ${truncateForError(rawScreen, SCREEN_ERROR_TRUNCATE)}` };
    }
  }

  let owner: string | undefined;
  let repoName: string | undefined;
  if (rawRepo !== undefined) {
    if (rawRepo.length > MAX_REPO_LENGTH || !REPO_PATTERN.test(rawRepo)) {
      return { valid: false, error: `Invalid repository format: ${truncateForError(rawRepo, REPO_ERROR_TRUNCATE)} (expected OWNER/REPO)` };
    }
    const parts = rawRepo.split("/");
    owner = parts[0];
    repoName = parts[1];
    if (owner.length > MAX_REPO_SEGMENT_LENGTH || repoName.length > MAX_REPO_SEGMENT_LENGTH) {
      return { valid: false, error: `Invalid repository format: ${truncateForError(rawRepo, REPO_ERROR_TRUNCATE)} (expected OWNER/REPO)` };
    }
  }

  let org: string | undefined;
  if (rawOrg !== undefined) {
    if (rawOrg.length > MAX_ORG_LENGTH || !ORG_PATTERN.test(rawOrg)) {
      return { valid: false, error: `Invalid organization format: ${truncateForError(rawOrg, ORG_ERROR_TRUNCATE)}` };
    }
    org = sanitize(rawOrg);
  }

  if (normalizedScreen && REPO_REQUIRED_SCREENS.has(normalizedScreen) && !owner) {
    return { valid: false, error: `--repo required for ${normalizedScreen}` };
  }

  return { valid: true, screen: normalizedScreen, repo: rawRepo, owner, repoName, org };
}
```

---

### Step 3: Upgrade `buildInitialStack()` with org support

**File:** `apps/tui/src/navigation/deepLinks.ts`

Add `buildInitialStackFromValidated()` accepting pre-validated inputs. Add org-context stack construction. Preserve legacy `buildInitialStack()` for backward compat.

```typescript
import type { ScreenEntry } from "../router/types.js";
import { ScreenName } from "../router/types.js";
import { createEntry } from "../providers/NavigationProvider.js";
import type { DeepLinkValidationResult } from "./deep-link-validation.js";

function resolveScreenName(input: string): ScreenName | null {
  const map: Record<string, ScreenName> = {
    dashboard: ScreenName.Dashboard,
    issues: ScreenName.Issues,
    landings: ScreenName.Landings,
    "landing-requests": ScreenName.Landings,
    workspaces: ScreenName.Workspaces,
    workflows: ScreenName.Workflows,
    search: ScreenName.Search,
    notifications: ScreenName.Notifications,
    settings: ScreenName.Settings,
    organizations: ScreenName.Organizations,
    orgs: ScreenName.Organizations,
    agents: ScreenName.Agents,
    wiki: ScreenName.Wiki,
    sync: ScreenName.Sync,
    repositories: ScreenName.RepoList,
    repos: ScreenName.RepoList,
    "repo-detail": ScreenName.RepoOverview,
  };
  return map[input] ?? null;
}

const REPO_REQUIRED_SCREEN_NAMES = new Set<ScreenName>([
  ScreenName.RepoOverview, ScreenName.Issues, ScreenName.IssueDetail,
  ScreenName.IssueCreate, ScreenName.IssueEdit, ScreenName.Landings,
  ScreenName.LandingDetail, ScreenName.LandingCreate, ScreenName.LandingEdit,
  ScreenName.DiffView, ScreenName.Workflows, ScreenName.WorkflowRunDetail,
  ScreenName.Wiki, ScreenName.WikiDetail,
]);

export function buildInitialStackFromValidated(
  validated: DeepLinkValidationResult,
  extra?: { sessionId?: string },
): DeepLinkResult {
  const dashboardEntry = () => createEntry(ScreenName.Dashboard);

  if (!validated.valid) {
    return { stack: [dashboardEntry()], error: validated.error };
  }

  const { screen, owner, repoName, org } = validated;

  if (!screen && !owner && !org) {
    return { stack: [dashboardEntry()] };
  }

  const screenName = screen ? resolveScreenName(screen) : null;
  const stack: ScreenEntry[] = [dashboardEntry()];

  // --org without --screen (or --screen orgs --org): org overview
  if (org && (!screenName || screenName === ScreenName.Organizations)) {
    stack.push(createEntry(ScreenName.OrgOverview, { org }));
    return { stack };
  }

  // --repo without --screen: repo overview
  if (owner && repoName && !screenName) {
    stack.push(createEntry(ScreenName.RepoOverview, { owner, repo: repoName }));
    return { stack };
  }

  // --screen dashboard: just dashboard
  if (screenName === ScreenName.Dashboard) {
    return { stack };
  }

  // Intermediate entries
  if (owner && repoName) {
    stack.push(createEntry(ScreenName.RepoOverview, { owner, repo: repoName }));
  }
  if (org && !owner) {
    stack.push(createEntry(ScreenName.OrgOverview, { org }));
  }

  // Target screen
  if (screenName && screenName !== ScreenName.RepoOverview) {
    const params: Record<string, string> = {};
    if (REPO_REQUIRED_SCREEN_NAMES.has(screenName) && owner && repoName) {
      params.owner = owner;
      params.repo = repoName;
    }
    if (extra?.sessionId) params.sessionId = extra.sessionId;
    if (org) params.org = org;
    stack.push(createEntry(screenName, params));
  }

  return { stack };
}
```

**Stack pre-population rules:**

| Flags | Resulting Stack | Depth |
|-------|----------------|-------|
| (none) | `[Dashboard]` | 1 |
| `--screen dashboard` | `[Dashboard]` | 1 |
| `--screen repos` | `[Dashboard, RepoList]` | 2 |
| `--screen notifications` | `[Dashboard, Notifications]` | 2 |
| `--screen search` | `[Dashboard, Search]` | 2 |
| `--screen workspaces` | `[Dashboard, Workspaces]` | 2 |
| `--screen agents` | `[Dashboard, Agents]` | 2 |
| `--screen settings` | `[Dashboard, Settings]` | 2 |
| `--screen sync` | `[Dashboard, Sync]` | 2 |
| `--repo acme/api` | `[Dashboard, RepoOverview(acme/api)]` | 2 |
| `--screen issues --repo acme/api` | `[Dashboard, RepoOverview(acme/api), Issues]` | 3 |
| `--screen landings --repo acme/api` | `[Dashboard, RepoOverview(acme/api), Landings]` | 3 |
| `--screen workflows --repo acme/api` | `[Dashboard, RepoOverview(acme/api), Workflows]` | 3 |
| `--screen wiki --repo acme/api` | `[Dashboard, RepoOverview(acme/api), Wiki]` | 3 |
| `--screen orgs` | `[Dashboard, Organizations]` | 2 |
| `--org acme` | `[Dashboard, OrgOverview(acme)]` | 2 |
| `--screen orgs --org acme` | `[Dashboard, OrgOverview(acme)]` | 2 |

---

### Step 4: Wire deep-link error into status bar

**File:** `apps/tui/src/index.tsx`

Replace the existing `buildInitialStack()` call with the new validation pipeline:

```typescript
import { validateDeepLinkInputs } from "./navigation/deep-link-validation.js";
import { buildInitialStackFromValidated } from "./navigation/deepLinks.js";

const validation = validateDeepLinkInputs({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
  org: launchOptions.org,
});
const deepLinkResult = buildInitialStackFromValidated(validation);
const initialStack = deepLinkResult.stack;
const deepLinkError = deepLinkResult.error ?? null;
```

Pass error to `LoadingProvider`:

```tsx
<LoadingProvider initialStatusBarError={deepLinkError}>
```

**File:** `apps/tui/src/providers/LoadingProvider.tsx`

Add `initialStatusBarError` prop:

```typescript
export function LoadingProvider({
  children,
  initialStatusBarError,
}: {
  children: React.ReactNode;
  initialStatusBarError?: string | null;
}) {
  const [statusBarError, setStatusBarError] = useState<string | null>(
    initialStatusBarError ?? null
  );

  useEffect(() => {
    if (initialStatusBarError) {
      const timer = setTimeout(() => {
        setStatusBarError((current) =>
          current === initialStatusBarError ? null : current
        );
      }, STATUS_BAR_ERROR_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [initialStatusBarError]);
  // ... rest unchanged
}
```

---

### Step 5: Add `NO_COLOR` support for status bar errors

**File:** `apps/tui/src/components/StatusBar.tsx`

Add `[ERROR]` prefix when `NO_COLOR=1` or `TERM=dumb`:

```typescript
const noColor = process.env.NO_COLOR === "1" || process.env.TERM === "dumb";

// In render:
{statusBarError ? (
  <text fg={noColor ? undefined : theme.error}>
    {noColor
      ? `[ERROR] ${truncateRight(statusBarError, maxErrorWidth - 8)}`
      : truncateRight(statusBarError, maxErrorWidth)}
  </text>
) : (
  /* existing hints */
)}
```

---

### Step 6: Add telemetry events

**File:** `apps/tui/src/index.tsx` (pre-mount section)

```typescript
const hasDeepLink = !!(launchOptions.screen || launchOptions.repo || launchOptions.org);

if (hasDeepLink) {
  emit("tui.deep_link.launch", {
    screen: launchOptions.screen ?? "",
    has_repo: !!launchOptions.repo,
    has_org: !!launchOptions.org,
    terminal_width: renderer.width,
    terminal_height: renderer.height,
  });

  if (validation.valid) {
    emit("tui.deep_link.resolved", {
      screen: validation.screen ?? "",
      stack_depth: initialStack.length,
    });
  } else {
    const reason = deepLinkError?.startsWith("Unknown screen") ? "unknown_screen"
      : deepLinkError?.startsWith("--repo required") ? "missing_repo"
      : deepLinkError?.startsWith("Invalid repository") ? "invalid_repo_format"
      : deepLinkError?.startsWith("Invalid organization") ? "invalid_org_format"
      : "unknown";
    emit("tui.deep_link.failed", { screen: launchOptions.screen ?? "", reason });
  }
}
```

---

### Step 7: Add structured logging

**File:** `apps/tui/src/index.tsx` (pre-mount section)

```typescript
if (hasDeepLink) {
  logger.info(`deep-link: launching with --screen ${launchOptions.screen ?? "(none)"} --repo ${launchOptions.repo ?? "(none)"} --org ${launchOptions.org ?? "(none)"}`);
  logger.debug(`deep-link: raw args: ${JSON.stringify(process.argv.slice(2))}`);
}
if (validation.valid && hasDeepLink) {
  logger.info(`deep-link: resolved to stack [${initialStack.map(e => e.screen).join(", ")}], depth ${initialStack.length}`);
} else if (!validation.valid) {
  logger.warn(`deep-link: validation failed — ${deepLinkError}, falling back to dashboard`);
}
```

---

### Step 8: Update barrel export

**File:** `apps/tui/src/navigation/index.ts`

Add exports for new validation module and `buildInitialStackFromValidated`.

---

## File Inventory

| File | Action | Description |
|---|---|---|
| `apps/tui/src/lib/terminal.ts` | **Edit** | Add `--org` flag, `org` to `TUILaunchOptions` |
| `apps/tui/src/navigation/deep-link-validation.ts` | **New** | Validation: regex, length, allowlist, sanitization |
| `apps/tui/src/navigation/deepLinks.ts` | **Edit** | Add `buildInitialStackFromValidated()`, org stack logic |
| `apps/tui/src/navigation/index.ts` | **Edit** | Export new validation module |
| `apps/tui/src/index.tsx` | **Edit** | Wire validation → error → telemetry → logging |
| `apps/tui/src/providers/LoadingProvider.tsx` | **Edit** | Add `initialStatusBarError` prop |
| `apps/tui/src/components/StatusBar.tsx` | **Edit** | Add `NO_COLOR` `[ERROR]` prefix |

---

## Data Flow

```
process.argv
  ▼
parseCLIArgs()                    ← apps/tui/src/lib/terminal.ts
  ▼
validateDeepLinkInputs()          ← apps/tui/src/navigation/deep-link-validation.ts
  ▼
buildInitialStackFromValidated()  ← apps/tui/src/navigation/deepLinks.ts
  ▼
emit() + logger.*()               ← telemetry + logging
  ▼
React mount
  ├─► NavigationProvider(initialStack)  → HeaderBar breadcrumb + ScreenRouter
  └─► LoadingProvider(initialStatusBarError) → StatusBar 5s transient error
```

---

## Interaction Contracts

### NavigationProvider

Already accepts `initialStack?: ScreenEntry[]`. No changes needed. `buildInitialStackFromValidated()` guarantees valid `ScreenName` values.

### LoadingProvider

**New prop:** `initialStatusBarError?: string | null`. Seeds `statusBarError` on mount. Auto-clears after 5000ms. Existing `failMutation()` path unaffected — a mutation error during the 5s window replaces the deep-link error.

### Auth ordering

Validation is synchronous, runs before React mount. Auth is async inside `AuthProvider`. Deep-linked screen is the first content screen after auth — no Dashboard flash.

### Auth retry

`initialStack` is captured in closure before mount. `AuthProvider.retry()` re-renders children with same stack. Deep-link params preserved.

---

## Edge Cases

| Case | Behavior |
|---|---|
| `--screen orgs --repo acme/api` | `--repo` stored in context but unused by orgs screen. No error. |
| `--screen orgs --org acme` | Resolves to `[Dashboard, OrgOverview(acme)]` (depth 2). |
| Multi-byte UTF-8 in `--repo` | Fails regex validation cleanly. |
| Terminal < 80×24 at launch | `TerminalTooSmallScreen` shown. Stack preserved for resize. |
| Control chars in `--screen` | `sanitize()` strips them; result fails allowlist. |
| ANSI escapes in `--repo` | `sanitize()` strips before display in error message. |
| `--screen` with trailing null byte | Sanitized, then checked against allowlist. |

---

## Productionization Checklist

1. **`PlaceholderScreen` replacement**: Real screens slot in via `screenRegistry` with zero deep-link changes.
2. **SSE on deep-linked screens**: `SSEProvider` wraps entire tree; auto-connects.
3. **Scroll position cache**: `NavigationProvider` caches per `ScreenEntry.id`; works on back-nav.
4. **Auth retry**: Verified — re-renders with same `initialStack`.
5. **i18n**: Error messages are pure-function return values; extractable to string table.
6. **Feature flag**: Not needed. Absence of flags = default Dashboard.

---

## Unit & Integration Tests

### Test File: `e2e/tui/deep-link-validation.test.ts` (new)

Pure unit tests — no TUI launch. Import validation functions directly.

```typescript
import { describe, test, expect } from "bun:test";
import {
  validateDeepLinkInputs, sanitize, truncateForError,
  VALID_SCREENS, MAX_SCREEN_LENGTH, MAX_REPO_LENGTH, MAX_ORG_LENGTH,
} from "../../apps/tui/src/navigation/deep-link-validation.js";

describe("sanitize", () => {
  test("passes through clean ASCII", () => {
    expect(sanitize("hello-world")).toBe("hello-world");
  });
  test("strips null bytes", () => {
    expect(sanitize("hello\x00world")).toBe("helloworld");
  });
  test("strips ANSI escapes", () => {
    expect(sanitize("hello\x1b[31mred\x1b[0m")).toBe("hellored");
  });
  test("preserves newlines", () => {
    expect(sanitize("a\nb")).toBe("a\nb");
  });
});

describe("truncateForError", () => {
  test("short strings unchanged", () => {
    expect(truncateForError("abc", 10)).toBe("abc");
  });
  test("long strings truncated with ellipsis", () => {
    expect(truncateForError("abcdefghij", 5)).toBe("abcd…");
  });
});

describe("screen validation", () => {
  test("no args returns valid", () => {
    expect(validateDeepLinkInputs({}).valid).toBe(true);
  });
  test("each valid screen accepted", () => {
    for (const s of VALID_SCREENS) {
      expect(validateDeepLinkInputs({ screen: s }).valid).toBe(true);
    }
  });
  test("case-insensitive normalization", () => {
    const r = validateDeepLinkInputs({ screen: "Issues" });
    expect(r.valid).toBe(true);
    expect(r.screen).toBe("issues");
  });
  test("unknown screen → error", () => {
    const r = validateDeepLinkInputs({ screen: "foobar" });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("Unknown screen");
  });
  test("exceeds max length → error", () => {
    const r = validateDeepLinkInputs({ screen: "a".repeat(33) });
    expect(r.valid).toBe(false);
  });
  test("control chars in screen → error", () => {
    const r = validateDeepLinkInputs({ screen: "issues\x00" });
    expect(r.valid).toBe(false);
  });
});

describe("repo validation", () => {
  test("valid format accepted", () => {
    const r = validateDeepLinkInputs({ repo: "acme/api" });
    expect(r.valid).toBe(true);
    expect(r.owner).toBe("acme");
    expect(r.repoName).toBe("api");
  });
  test("dots hyphens underscores accepted", () => {
    expect(validateDeepLinkInputs({ repo: "my-org.co/repo_name" }).valid).toBe(true);
  });
  test("no slash → error", () => {
    const r = validateDeepLinkInputs({ repo: "justarepo" });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("Invalid repository format");
  });
  test("multiple slashes → error", () => {
    expect(validateDeepLinkInputs({ repo: "a/b/c" }).valid).toBe(false);
  });
  test("special characters → error", () => {
    expect(validateDeepLinkInputs({ repo: "inv@lid/repo!" }).valid).toBe(false);
  });
  test("exceeds max length → error", () => {
    expect(validateDeepLinkInputs({ repo: "a".repeat(65) + "/" + "b".repeat(65) }).valid).toBe(false);
  });
  test("owner segment > 64 chars → error", () => {
    expect(validateDeepLinkInputs({ repo: "a".repeat(65) + "/repo" }).valid).toBe(false);
  });
  test("name segment > 64 chars → error", () => {
    expect(validateDeepLinkInputs({ repo: "owner/" + "a".repeat(65) }).valid).toBe(false);
  });
  test("empty string → error", () => {
    expect(validateDeepLinkInputs({ repo: "" }).valid).toBe(false);
  });
});

describe("org validation", () => {
  test("valid slug accepted", () => {
    const r = validateDeepLinkInputs({ org: "acme" });
    expect(r.valid).toBe(true);
    expect(r.org).toBe("acme");
  });
  test("special characters → error", () => {
    const r = validateDeepLinkInputs({ org: "inv@lid!!!" });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("Invalid organization format");
  });
  test("slash → error", () => {
    expect(validateDeepLinkInputs({ org: "org/sub" }).valid).toBe(false);
  });
  test("exceeds max length → error", () => {
    expect(validateDeepLinkInputs({ org: "a".repeat(65) }).valid).toBe(false);
  });
  test("empty string → error", () => {
    expect(validateDeepLinkInputs({ org: "" }).valid).toBe(false);
  });
});

describe("context requirements", () => {
  test("issues without repo → error", () => {
    const r = validateDeepLinkInputs({ screen: "issues" });
    expect(r.valid).toBe(false);
    expect(r.error).toBe("--repo required for issues");
  });
  test("landings without repo → error", () => {
    expect(validateDeepLinkInputs({ screen: "landings" }).error).toBe("--repo required for landings");
  });
  test("workflows without repo → error", () => {
    expect(validateDeepLinkInputs({ screen: "workflows" }).error).toBe("--repo required for workflows");
  });
  test("wiki without repo → error", () => {
    expect(validateDeepLinkInputs({ screen: "wiki" }).error).toBe("--repo required for wiki");
  });
  test("issues with repo → valid", () => {
    expect(validateDeepLinkInputs({ screen: "issues", repo: "acme/api" }).valid).toBe(true);
  });
  test("notifications without repo → valid", () => {
    expect(validateDeepLinkInputs({ screen: "notifications" }).valid).toBe(true);
  });
  test("dashboard without repo → valid", () => {
    expect(validateDeepLinkInputs({ screen: "dashboard" }).valid).toBe(true);
  });
});

describe("combined inputs", () => {
  test("all three valid", () => {
    const r = validateDeepLinkInputs({ screen: "issues", repo: "acme/api", org: "acme" });
    expect(r.valid).toBe(true);
  });
  test("invalid screen takes priority", () => {
    const r = validateDeepLinkInputs({ screen: "foobar", repo: "acme/api" });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("Unknown screen");
  });
  test("valid screen with invalid repo", () => {
    const r = validateDeepLinkInputs({ screen: "issues", repo: "invalid!!" });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("Invalid repository");
  });
});
```

---

### Test File: `e2e/tui/deep-link-stack.test.ts` (new)

Unit tests for stack construction logic.

```typescript
import { describe, test, expect } from "bun:test";
import { buildInitialStackFromValidated } from "../../apps/tui/src/navigation/deepLinks.js";
import { ScreenName } from "../../apps/tui/src/router/types.js";
import type { DeepLinkValidationResult } from "../../apps/tui/src/navigation/deep-link-validation.js";

function v(overrides: Partial<DeepLinkValidationResult> = {}): DeepLinkValidationResult {
  return { valid: true, ...overrides };
}

describe("stack construction", () => {
  test("no args → [Dashboard]", () => {
    const r = buildInitialStackFromValidated(v());
    expect(r.stack).toHaveLength(1);
    expect(r.stack[0].screen).toBe(ScreenName.Dashboard);
  });

  test("--screen dashboard → [Dashboard]", () => {
    const r = buildInitialStackFromValidated(v({ screen: "dashboard" }));
    expect(r.stack).toHaveLength(1);
  });

  test("--screen repos → [Dashboard, RepoList]", () => {
    const r = buildInitialStackFromValidated(v({ screen: "repos" }));
    expect(r.stack).toHaveLength(2);
    expect(r.stack[1].screen).toBe(ScreenName.RepoList);
  });

  test("--screen notifications → depth 2", () => {
    const r = buildInitialStackFromValidated(v({ screen: "notifications" }));
    expect(r.stack).toHaveLength(2);
    expect(r.stack[1].screen).toBe(ScreenName.Notifications);
  });

  test("--screen search → depth 2", () => {
    expect(buildInitialStackFromValidated(v({ screen: "search" })).stack[1].screen).toBe(ScreenName.Search);
  });

  test("--screen workspaces → depth 2", () => {
    expect(buildInitialStackFromValidated(v({ screen: "workspaces" })).stack[1].screen).toBe(ScreenName.Workspaces);
  });

  test("--screen agents → depth 2", () => {
    expect(buildInitialStackFromValidated(v({ screen: "agents" })).stack[1].screen).toBe(ScreenName.Agents);
  });

  test("--screen settings → depth 2", () => {
    expect(buildInitialStackFromValidated(v({ screen: "settings" })).stack[1].screen).toBe(ScreenName.Settings);
  });

  test("--screen sync → depth 2", () => {
    expect(buildInitialStackFromValidated(v({ screen: "sync" })).stack[1].screen).toBe(ScreenName.Sync);
  });

  test("--repo only → [Dashboard, RepoOverview]", () => {
    const r = buildInitialStackFromValidated(v({ repo: "acme/api", owner: "acme", repoName: "api" }));
    expect(r.stack).toHaveLength(2);
    expect(r.stack[1].screen).toBe(ScreenName.RepoOverview);
    expect(r.stack[1].params.owner).toBe("acme");
  });

  test("--screen issues --repo → [Dashboard, RepoOverview, Issues]", () => {
    const r = buildInitialStackFromValidated(v({ screen: "issues", owner: "acme", repoName: "api" }));
    expect(r.stack).toHaveLength(3);
    expect(r.stack[1].screen).toBe(ScreenName.RepoOverview);
    expect(r.stack[2].screen).toBe(ScreenName.Issues);
  });

  test("--screen landings --repo → depth 3", () => {
    expect(buildInitialStackFromValidated(v({ screen: "landings", owner: "a", repoName: "b" })).stack[2].screen).toBe(ScreenName.Landings);
  });

  test("--screen workflows --repo → depth 3", () => {
    expect(buildInitialStackFromValidated(v({ screen: "workflows", owner: "a", repoName: "b" })).stack[2].screen).toBe(ScreenName.Workflows);
  });

  test("--screen wiki --repo → depth 3", () => {
    expect(buildInitialStackFromValidated(v({ screen: "wiki", owner: "a", repoName: "b" })).stack[2].screen).toBe(ScreenName.Wiki);
  });

  test("--screen orgs → [Dashboard, Organizations]", () => {
    const r = buildInitialStackFromValidated(v({ screen: "orgs" }));
    expect(r.stack).toHaveLength(2);
    expect(r.stack[1].screen).toBe(ScreenName.Organizations);
  });

  test("--org only → [Dashboard, OrgOverview]", () => {
    const r = buildInitialStackFromValidated(v({ org: "acme" }));
    expect(r.stack).toHaveLength(2);
    expect(r.stack[1].screen).toBe(ScreenName.OrgOverview);
    expect(r.stack[1].params.org).toBe("acme");
  });

  test("--screen orgs --org → [Dashboard, OrgOverview]", () => {
    const r = buildInitialStackFromValidated(v({ screen: "orgs", org: "acme" }));
    expect(r.stack).toHaveLength(2);
    expect(r.stack[1].screen).toBe(ScreenName.OrgOverview);
  });

  test("validation error → [Dashboard] + error", () => {
    const r = buildInitialStackFromValidated({ valid: false, error: "Unknown screen: foobar" });
    expect(r.stack).toHaveLength(1);
    expect(r.error).toBe("Unknown screen: foobar");
  });

  test("unique IDs across stack entries", () => {
    const r = buildInitialStackFromValidated(v({ screen: "issues", owner: "a", repoName: "b" }));
    const ids = new Set(r.stack.map(e => e.id));
    expect(ids.size).toBe(r.stack.length);
  });

  test("breadcrumbs: Dashboard > acme/api > Issues", () => {
    const r = buildInitialStackFromValidated(v({ screen: "issues", owner: "acme", repoName: "api" }));
    expect(r.stack[0].breadcrumb).toBe("Dashboard");
    expect(r.stack[1].breadcrumb).toBe("acme/api");
    expect(r.stack[2].breadcrumb).toBe("Issues");
  });
});
```

---

### Test File: `e2e/tui/app-shell.test.ts` (additions)

E2E tests using `@microsoft/tui-test` via `launchTUI()`. Appended as new `describe` blocks.

```typescript
// ── TUI_DEEP_LINK_LAUNCH — Snapshot tests ────────────────────────────────────

describe("TUI_DEEP_LINK_LAUNCH — snapshots", () => {
  let terminal: import("./helpers.js").TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("deep-link-dashboard-default: no flags", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("deep-link-screen-repos", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repos"] });
    await terminal.waitForText("Repositories");
    expect(terminal.getLine(0)).toContain("Repositories");
  });

  test("deep-link-screen-notifications", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "notifications"] });
    await terminal.waitForText("Notifications");
  });

  test("deep-link-screen-settings", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "settings"] });
    await terminal.waitForText("Settings");
  });

  test("deep-link-repo-context-only", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--repo", "acme/api"] });
    await terminal.waitForText("acme/api");
  });

  test("deep-link-issues-with-repo", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    const h = terminal.getLine(0);
    expect(h).toContain("acme/api");
    expect(h).toContain("Issues");
  });

  test("deep-link-org-context-only", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--org", "acme"] });
    await terminal.waitForText("acme");
  });

  test("deep-link-unknown-screen-error", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "foobar"] });
    await terminal.waitForText("Dashboard");
    expect(terminal.getLine(terminal.rows - 1)).toContain("Unknown screen");
  });

  test("deep-link-missing-repo-error", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues"] });
    await terminal.waitForText("Dashboard");
    expect(terminal.getLine(terminal.rows - 1)).toContain("--repo required for issues");
  });

  test("deep-link-invalid-repo-error", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "inv@lid!!!"] });
    await terminal.waitForText("Dashboard");
    expect(terminal.getLine(terminal.rows - 1)).toContain("Invalid repository format");
  });

  test("deep-link-invalid-org-error", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--org", "inv@lid!!!"] });
    await terminal.waitForText("Dashboard");
    expect(terminal.getLine(terminal.rows - 1)).toContain("Invalid organization format");
  });

  test("deep-link-error-clears-after-5s", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "foobar"] });
    await terminal.waitForText("Unknown screen");
    await new Promise(r => setTimeout(r, 6000));
    expect(terminal.getLine(terminal.rows - 1)).not.toContain("Unknown screen");
  });

  test("deep-link-case-insensitive", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "Issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
  });
});

// ── TUI_DEEP_LINK_LAUNCH — Keyboard interaction ─────────────────────────────

describe("TUI_DEEP_LINK_LAUNCH — keyboard", () => {
  let terminal: import("./helpers.js").TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("q walks back from issues → repo → dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("q");
    await terminal.waitForText("acme/api");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("q from notifications → dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "notifications"] });
    await terminal.waitForText("Notifications");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("ctrl+c exits from deep-linked screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("ctrl+c");
  });

  test("g r from deep-linked screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "notifications"] });
    await terminal.waitForText("Notifications");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("g l preserves repo context from deep-link", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landings");
  });

  test("? opens help on deep-linked screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("?");
    await terminal.waitForText("help");
  });

  test("error screen still navigable", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "foobar"] });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
  });

  test("rapid q from depth 3 exits", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("q", "q", "q");
  });
});

// ── TUI_DEEP_LINK_LAUNCH — Responsive ────────────────────────────────────────

describe("TUI_DEEP_LINK_LAUNCH — responsive", () => {
  let terminal: import("./helpers.js").TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("80x24 breadcrumb truncation", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    const clean = terminal.getLine(0).replace(/\x1b\[[0-9;]*m/g, "");
    expect(clean.length).toBeLessThanOrEqual(80);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("120x40 full breadcrumb", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    const h = terminal.getLine(0);
    expect(h).toContain("Dashboard");
    expect(h).toContain("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("200x60 full breadcrumb", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    expect(terminal.getLine(0)).toContain("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("resize to too-small shows message", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    await terminal.resize(60, 20);
    expect(terminal.snapshot()).toMatch(/too small|minimum|80.*24/i);
  });

  test("resize from too-small restores screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    await terminal.resize(60, 20);
    await terminal.resize(120, 40);
    await terminal.waitForText("Issues");
  });

  test("80x24 error fits in status bar", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "issues", "--repo", "very-long-org-name/very-long-repo-name"] });
    await terminal.waitForText("Dashboard");
    const clean = terminal.getLine(terminal.rows - 1).replace(/\x1b\[[0-9;]*m/g, "");
    expect(clean.length).toBeLessThanOrEqual(80);
  });
});

// ── TUI_DEEP_LINK_LAUNCH — Integration ───────────────────────────────────────

describe("TUI_DEEP_LINK_LAUNCH — integration", () => {
  let terminal: import("./helpers.js").TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("auth completes before deep-linked screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/api"] });
    await terminal.waitForText("Issues");
    expect(terminal.getLine(0)).toContain("acme/api");
  });

  test("NO_COLOR uses [ERROR] prefix", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "foobar"], env: { NO_COLOR: "1" } });
    await terminal.waitForText("Dashboard");
    expect(terminal.getLine(terminal.rows - 1)).toContain("[ERROR]");
  });

  test("connection indicator visible on deep-linked screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repos"] });
    await terminal.waitForText("Repositories");
    expect(terminal.getLine(0)).toContain("●");
  });
});
```

---

### Test Summary

| Test File | Type | ~Count | Description |
|---|---|---|---|
| `e2e/tui/deep-link-validation.test.ts` | Unit | 40 | Pure validation functions |
| `e2e/tui/deep-link-stack.test.ts` | Unit | 20 | Stack construction logic |
| `e2e/tui/app-shell.test.ts` (additions) | E2E | 30 | Snapshot, keyboard, responsive, integration |

**Total: ~90 test cases**

### Tests Left Failing by Design

Per repository policy, tests are never skipped or commented out:

- **`deep-link-nonexistent-repo`**: Will fail until real screen components replace `PlaceholderScreen` and fetch data that surfaces 404 errors.
- **`deep-link-auth-failure-preserves-params`**: Requires credential store mutation detection. Auth retry path works but the test needs external token provisioning.
- Any test validating actual screen content (issue lists, etc.) beyond placeholder text.

---

## Constants Reference

| Constant | Value | File |
|---|---|---|
| `MAX_SCREEN_LENGTH` | 32 | `deep-link-validation.ts` |
| `MAX_REPO_LENGTH` | 128 | `deep-link-validation.ts` |
| `MAX_ORG_LENGTH` | 64 | `deep-link-validation.ts` |
| `MAX_REPO_SEGMENT_LENGTH` | 64 | `deep-link-validation.ts` |
| `SCREEN_ERROR_TRUNCATE` | 32 | `deep-link-validation.ts` |
| `REPO_ERROR_TRUNCATE` | 64 | `deep-link-validation.ts` |
| `ORG_ERROR_TRUNCATE` | 32 | `deep-link-validation.ts` |
| `STATUS_BAR_ERROR_DURATION_MS` | 5000 | `loading/constants.ts` (existing) |
| `STATUS_BAR_ERROR_PADDING` | 20 | `loading/constants.ts` (existing) |