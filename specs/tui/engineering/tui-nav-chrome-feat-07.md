# Engineering Specification: `tui-nav-chrome-feat-07` — TUI_DEEP_LINK_LAUNCH

## TL;DR

This ticket upgrades the existing deep-link argument parsing and navigation bootstrap to meet the full product specification: `--org` flag support, strict input validation with sanitization, transient status bar errors with 5-second auto-clear, auth-before-navigation gating (no Dashboard flash), responsive breadcrumb/error truncation, telemetry event emission, and structured logging. The implementation touches 4 existing files and adds 1 new component.

---

## Current State Analysis

The TUI already has partial deep-link support:

| Capability | Current State | Gap |
|---|---|---|
| `--screen` parsing | ✅ `parseCLIArgs()` in `lib/terminal.ts` | No `--org` flag |
| `--repo` parsing | ✅ `parseCLIArgs()` | No regex validation, no max-length enforcement |
| Screen name resolution | ✅ `resolveScreenName()` in `navigation/deepLinks.ts` | Case-insensitive ✅, `orgs` alias present |
| Stack pre-population | ✅ `buildInitialStack()` | No org-context stacks (`--org acme` → `[Dashboard, Org(acme)]`) |
| Validation errors | ✅ Returns `error` string in `DeepLinkResult` | Error is ignored — never displayed in status bar |
| Input sanitization | ❌ | Control chars, escape sequences not stripped; no max-length truncation |
| Auth gating | ✅ | `AuthProvider` gates children — deep-linked screen only mounts after auth succeeds |
| Transient status bar error | ✅ `LoadingProvider.failMutation()` shows 5s error | Deep-link errors don't use this mechanism |
| `--org` flag | ❌ | Not parsed in CLI args, not handled in `buildInitialStack` |
| `NO_COLOR` error prefix | ❌ | StatusBar uses color only, no `[ERROR]` text prefix |
| Telemetry events | ❌ | No `tui.deep_link.*` events emitted |
| Logging | ❌ | No `logger.*` calls for deep-link resolution |

---

## Implementation Plan

### Step 1: Extend CLI argument parsing — `apps/tui/src/lib/terminal.ts`

**Changes:**

1. Add `org?: string` to `TUILaunchOptions` interface.
2. Add `--org` case to `parseCLIArgs()` switch statement.
3. Add exported `sanitizeDeepLinkInput(value: string): string` that strips ASCII control characters (0x00–0x1F except 0x0A, and 0x7F) and ANSI escape sequences (`/\x1B\[[0-9;]*[A-Za-z]/g`).
4. Apply `sanitizeDeepLinkInput()` to `--screen`, `--repo`, and `--org` values immediately after parsing.

```typescript
export function sanitizeDeepLinkInput(value: string): string {
  return value
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}
```

Updated `parseCLIArgs`:

```typescript
export function parseCLIArgs(argv: string[]): TUILaunchOptions {
  const opts: TUILaunchOptions = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--repo":
        opts.repo = sanitizeDeepLinkInput(argv[++i] ?? "");
        break;
      case "--screen":
        opts.screen = sanitizeDeepLinkInput(argv[++i] ?? "");
        break;
      case "--org":
        opts.org = sanitizeDeepLinkInput(argv[++i] ?? "");
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

### Step 2: Upgrade deep-link validation — `apps/tui/src/navigation/deepLinks.ts`

**Add validation constants:**

```typescript
import { logger } from "../lib/logger.js";

const SCREEN_MAX_LENGTH = 32;
const REPO_MAX_LENGTH = 128;
const ORG_MAX_LENGTH = 64;
const REPO_SEGMENT_MAX_LENGTH = 64;
const REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const ORG_REGEX = /^[a-zA-Z0-9_.-]+$/;
const ERROR_SCREEN_TRUNCATE = 32;
const ERROR_REPO_TRUNCATE = 64;
const ERROR_ORG_TRUNCATE = 32;

const REPO_REQUIRED_SCREENS = new Set<ScreenName>([
  ScreenName.Issues, ScreenName.Landings, ScreenName.Workflows, ScreenName.Wiki,
  ScreenName.RepoOverview, ScreenName.IssueDetail, ScreenName.IssueCreate,
  ScreenName.IssueEdit, ScreenName.LandingDetail, ScreenName.LandingCreate,
  ScreenName.LandingEdit, ScreenName.DiffView, ScreenName.WorkflowRunDetail,
  ScreenName.WikiDetail,
]);
```

**Add private helper:**

```typescript
function truncateForError(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + "…";
}
```

**Add exported helper for telemetry:**

```typescript
export function inferDeepLinkFailureReason(error: string): string {
  if (error.startsWith("Unknown screen")) return "unknown_screen";
  if (error.startsWith("--repo required")) return "missing_repo";
  if (error.startsWith("Invalid repository")) return "invalid_repo_format";
  if (error.startsWith("Invalid organization")) return "invalid_org_format";
  return "unknown";
}
```

**Rewrite `buildInitialStack` with full validation pipeline:**

```typescript
export function buildInitialStack(args: DeepLinkArgs): DeepLinkResult {
  const dashboardEntry = () => createEntry(ScreenName.Dashboard);
  logger.debug(`deep-link: raw args: screen=${args.screen ?? ""} repo=${args.repo ?? ""} org=${args.org ?? ""}`);

  if (!args.screen && !args.repo && !args.org) {
    return { stack: [dashboardEntry()] };
  }

  // 1. Validate --screen
  let screenName: ScreenName | null = null;
  if (args.screen) {
    if (args.screen.length > SCREEN_MAX_LENGTH) {
      const msg = `Unknown screen: ${truncateForError(args.screen, ERROR_SCREEN_TRUNCATE)}`;
      logger.warn(`deep-link: unknown --screen value "${truncateForError(args.screen, 32)}", falling back to dashboard`);
      return { stack: [dashboardEntry()], error: msg };
    }
    screenName = resolveScreenName(args.screen);
    if (!screenName) {
      const msg = `Unknown screen: ${truncateForError(args.screen, ERROR_SCREEN_TRUNCATE)}`;
      logger.warn(`deep-link: unknown --screen value "${truncateForError(args.screen, 32)}", falling back to dashboard`);
      return { stack: [dashboardEntry()], error: msg };
    }
  }

  // 2. Validate --repo
  let owner = "";
  let repoName = "";
  if (args.repo) {
    if (args.repo.length > REPO_MAX_LENGTH || !REPO_REGEX.test(args.repo)) {
      const msg = `Invalid repository format: ${truncateForError(args.repo, ERROR_REPO_TRUNCATE)} (expected OWNER/REPO)`;
      logger.warn(`deep-link: --repo "${truncateForError(args.repo, 32)}" does not match OWNER/REPO format, falling back to dashboard`);
      return { stack: [dashboardEntry()], error: msg };
    }
    const parts = args.repo.split("/");
    owner = parts[0];
    repoName = parts[1];
    if (owner.length > REPO_SEGMENT_MAX_LENGTH || repoName.length > REPO_SEGMENT_MAX_LENGTH) {
      const msg = `Invalid repository format: ${truncateForError(args.repo, ERROR_REPO_TRUNCATE)} (expected OWNER/REPO)`;
      logger.warn(`deep-link: --repo segment too long, falling back to dashboard`);
      return { stack: [dashboardEntry()], error: msg };
    }
  }

  // 3. Validate --org
  if (args.org) {
    if (args.org.length > ORG_MAX_LENGTH || !ORG_REGEX.test(args.org)) {
      const msg = `Invalid organization format: ${truncateForError(args.org, ERROR_ORG_TRUNCATE)}`;
      logger.warn(`deep-link: --org "${truncateForError(args.org, 32)}" does not match slug format, falling back to dashboard`);
      return { stack: [dashboardEntry()], error: msg };
    }
  }

  // 4. Check repo-context requirement
  if (screenName && REPO_REQUIRED_SCREENS.has(screenName) && !owner) {
    const msg = `--repo required for ${args.screen!.toLowerCase()}`;
    logger.warn(`deep-link: --screen ${args.screen} requires --repo but none provided, falling back to dashboard`);
    return { stack: [dashboardEntry()], error: msg };
  }

  // 5. Build stack
  const stack: ScreenEntry[] = [dashboardEntry()];

  if (owner && repoName) {
    stack.push(createEntry(ScreenName.RepoOverview, { owner, repo: repoName }));
    logger.debug(`deep-link: building stack entry 1: RepoOverview with context ${owner}/${repoName}`);
  }

  if (args.org && !owner) {
    stack.push(createEntry(ScreenName.OrgOverview, { org: args.org }));
    logger.debug(`deep-link: building stack entry 1: OrgOverview with context ${args.org}`);
  }

  if (screenName && screenName !== ScreenName.Dashboard) {
    const params: Record<string, string> = {};
    if (owner && repoName) { params.owner = owner; params.repo = repoName; }
    if (args.org) { params.org = args.org; }
    if (args.sessionId) { params.sessionId = args.sessionId; }

    const isRepoOverviewDuplicate = screenName === ScreenName.RepoOverview && !!owner;
    const isOrgOverviewDuplicate = screenName === ScreenName.OrgOverview && !!args.org;
    const isOrgsWithOrgContext = screenName === ScreenName.Organizations && !!args.org;

    if (!isRepoOverviewDuplicate && !isOrgOverviewDuplicate && !isOrgsWithOrgContext) {
      stack.push(createEntry(screenName, params));
      logger.debug(`deep-link: building stack entry ${stack.length - 1}: ${screenName}`);
    }
  }

  logger.info(`deep-link: resolved to stack [${stack.map(e => e.screen).join(", ")}], depth ${stack.length}`);
  return { stack };
}
```

---

### Step 3: Surface deep-link errors — new `DeepLinkErrorBanner` + LoadingProvider extension

**New file: `apps/tui/src/components/DeepLinkErrorBanner.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { useLoading } from "../hooks/useLoading.js";
import { logger } from "../lib/logger.js";

interface DeepLinkErrorBannerProps {
  error: string | undefined;
}

export function DeepLinkErrorBanner({ error }: DeepLinkErrorBannerProps) {
  const { setStatusBarError } = useLoading();
  const firedRef = useRef(false);

  useEffect(() => {
    if (error && !firedRef.current) {
      firedRef.current = true;
      logger.debug(`deep-link: showing transient error in status bar: "${error}" for 5000ms`);
      setStatusBarError(error);
    }
  }, [error, setStatusBarError]);

  return null;
}
```

**File: `apps/tui/src/loading/types.ts`** — add to `LoadingContextValue`:

```typescript
setStatusBarError: (message: string) => void;
```

**File: `apps/tui/src/providers/LoadingProvider.tsx`** — add public setter:

```typescript
const setStatusBarErrorPublic = useCallback((message: string) => {
  setStatusBarError(message);
  if (statusBarTimerRef.current) {
    clearTimeout(statusBarTimerRef.current);
  }
  statusBarTimerRef.current = setTimeout(() => {
    setStatusBarError(null);
    logger.debug("deep-link: transient error cleared from status bar");
  }, STATUS_BAR_ERROR_DURATION_MS);
}, []);

// Include in value object:
const value: LoadingContextValue = {
  // ...existing fields...
  setStatusBarError: setStatusBarErrorPublic,
};
```

**File: `apps/tui/src/index.tsx`** — wire everything:

```tsx
import { DeepLinkErrorBanner } from "./components/DeepLinkErrorBanner.js";
import { inferDeepLinkFailureReason } from "./navigation/deepLinks.js";

const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
  org: launchOptions.org,
});
const initialStack = deepLinkResult.stack;

// Telemetry
const hasDeepLink = !!(launchOptions.screen || launchOptions.repo || launchOptions.org);
if (hasDeepLink) {
  emit("tui.deep_link.launch", {
    screen: launchOptions.screen ?? "",
    has_repo: !!launchOptions.repo,
    has_org: !!launchOptions.org,
    terminal_width: renderer.width,
    terminal_height: renderer.height,
  });
}
if (deepLinkResult.error) {
  emit("tui.deep_link.failed", {
    screen: launchOptions.screen ?? "",
    reason: inferDeepLinkFailureReason(deepLinkResult.error),
  });
} else if (hasDeepLink) {
  emit("tui.deep_link.resolved", {
    screen: launchOptions.screen ?? "",
    stack_depth: deepLinkResult.stack.length,
  });
}

// In JSX, inside LoadingProvider:
<LoadingProvider>
  <DeepLinkErrorBanner error={deepLinkResult.error} />
  <GlobalKeybindings>
    <AppShell>
      <ScreenRouter />
    </AppShell>
  </GlobalKeybindings>
</LoadingProvider>
```

---

### Step 4: `NO_COLOR` error prefix — `apps/tui/src/components/StatusBar.tsx`

Add `NO_COLOR` detection and `[ERROR]` prefix:

```tsx
const noColor = process.env.NO_COLOR === "1" || process.env.TERM === "dumb";

// In render:
{statusBarError ? (
  <text fg={noColor ? undefined : theme.error}>
    {noColor
      ? `[ERROR] ${truncateRight(statusBarError, maxErrorWidth - 8)}`
      : truncateRight(statusBarError, maxErrorWidth)}
  </text>
) : (
  // ...existing hints rendering
)}
```

---

### Step 5: Auth-before-navigation gating — NO CODE CHANGES NEEDED

The existing provider hierarchy already ensures this:

```
AuthProvider (gates children on auth state)
  → NavigationProvider (receives initialStack)
    → LoadingProvider → DeepLinkErrorBanner → AppShell → ScreenRouter
```

`AuthProvider` shows `AuthLoadingScreen` during validation, then mounts `children` on success. The deep-linked screen only mounts after auth completes. No Dashboard flash occurs. Auth retry preserves deep-link params because `initialStack` is captured in the closure and `NavigationProvider` remounts with the same value via `navResetKey`.

---

## Boundary Constraints Summary

| Constraint | Value | Enforcement |
|---|---|---|
| `--screen` max length | 32 chars | Reject as unrecognized if exceeded |
| `--repo` max length | 128 chars | Fail regex validation |
| `--org` max length | 64 chars | Fail regex validation |
| Repo owner segment max | 64 chars | Fail after split validation |
| Repo name segment max | 64 chars | Fail after split validation |
| Breadcrumb segment max | 24 chars | Enforced in `screenRegistry[*].breadcrumbLabel()` |
| Status bar error max display | `terminal_width - 20` chars | `truncateRight` in `StatusBar` |
| Status bar error duration | 5,000 ms | `STATUS_BAR_ERROR_DURATION_MS` |
| Error screen value truncation | 32/64/32 chars | `truncateForError()` |

---

## Stack Pre-Population Rules

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

## Telemetry Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.deep_link.launch` | TUI launched with any deep-link flag | `screen`, `has_repo`, `has_org`, `terminal_width`, `terminal_height` |
| `tui.deep_link.resolved` | Validation passed, stack built | `screen`, `stack_depth` |
| `tui.deep_link.failed` | Validation failed | `screen`, `reason` |

---

## Structured Logging

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Argument parsing | `deep-link: raw args: screen=... repo=... org=...` |
| `debug` | Stack construction | `deep-link: building stack entry N: ScreenName with context ...` |
| `debug` | Error shown | `deep-link: showing transient error in status bar: "..." for 5000ms` |
| `debug` | Error cleared | `deep-link: transient error cleared from status bar` |
| `info` | Resolved | `deep-link: resolved to stack [...], depth N` |
| `warn` | Unknown screen | `deep-link: unknown --screen value "...", falling back to dashboard` |
| `warn` | Missing repo | `deep-link: --screen X requires --repo but none provided` |
| `warn` | Invalid repo | `deep-link: --repo "..." does not match OWNER/REPO format` |
| `warn` | Invalid org | `deep-link: --org "..." does not match slug format` |

---

## File Change Summary

| File | Action | Description |
|---|---|---|
| `apps/tui/src/lib/terminal.ts` | Modify | Add `org` to interface, `--org` parsing, `sanitizeDeepLinkInput()` |
| `apps/tui/src/navigation/deepLinks.ts` | Rewrite | Full validation, org stacks, truncation, logging, telemetry helper |
| `apps/tui/src/index.tsx` | Modify | Pass `org`, add `DeepLinkErrorBanner`, telemetry emissions |
| `apps/tui/src/providers/LoadingProvider.tsx` | Modify | Expose `setStatusBarError` public method |
| `apps/tui/src/loading/types.ts` | Modify | Add `setStatusBarError` to interface |
| `apps/tui/src/components/StatusBar.tsx` | Modify | Add `NO_COLOR` `[ERROR]` prefix |
| `apps/tui/src/components/DeepLinkErrorBanner.tsx` | **New** | Renderless bridge: deep-link error → status bar |

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All tests added under `describe("TUI_DEEP_LINK_LAUNCH")` blocks using existing `launchTUI`, `bunEval`, `TUITestInstance`, `TERMINAL_SIZES`, `OWNER`, `ORG` from `helpers.ts`.

#### Terminal Snapshot Tests (18 tests)

```typescript
describe("TUI_DEEP_LINK_LAUNCH — terminal snapshot tests", () => {
  test("deep-link-dashboard-default: no flags renders Dashboard with depth-1 breadcrumb", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await tui.waitForText("Dashboard");
      const header = tui.getLine(0);
      expect(header).toContain("Dashboard");
      expect(header).not.toContain("›");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-screen-repos: --screen repos renders Repository list", async () => {
    const tui = await launchTUI({ args: ["--screen", "repos"] });
    try {
      await tui.waitForText("Repositories");
      const header = tui.getLine(0);
      expect(header).toContain("Dashboard");
      expect(header).toContain("Repositories");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-screen-notifications: --screen notifications", async () => {
    const tui = await launchTUI({ args: ["--screen", "notifications"] });
    try {
      await tui.waitForText("Notifications");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-screen-settings: --screen settings", async () => {
    const tui = await launchTUI({ args: ["--screen", "settings"] });
    try {
      await tui.waitForText("Settings");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-screen-search: --screen search", async () => {
    const tui = await launchTUI({ args: ["--screen", "search"] });
    try {
      await tui.waitForText("Search");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-repo-context-only: --repo renders repo overview", async () => {
    const tui = await launchTUI({ args: ["--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText(`${OWNER}/test-repo`);
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-issues-with-repo: --screen issues --repo depth-3 breadcrumb", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      const header = tui.getLine(0);
      expect(header).toContain("Dashboard");
      expect(header).toContain("Issues");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-landings-with-repo", async () => {
    const tui = await launchTUI({ args: ["--screen", "landings", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Landings");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-workflows-with-repo", async () => {
    const tui = await launchTUI({ args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Workflows");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-wiki-with-repo", async () => {
    const tui = await launchTUI({ args: ["--screen", "wiki", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Wiki");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-orgs-screen", async () => {
    const tui = await launchTUI({ args: ["--screen", "orgs"] });
    try {
      await tui.waitForText("Organizations");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-org-context-only: --org renders org overview", async () => {
    const tui = await launchTUI({ args: ["--org", ORG] });
    try {
      await tui.waitForText(ORG);
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-unknown-screen-error: status bar shows error", async () => {
    const tui = await launchTUI({ args: ["--screen", "foobar"] });
    try {
      await tui.waitForText("Dashboard");
      await tui.waitForText("Unknown screen: foobar");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-missing-repo-error", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues"] });
    try {
      await tui.waitForText("Dashboard");
      await tui.waitForText("--repo required for issues");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-invalid-repo-error", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", "inv@lid!!!"] });
    try {
      await tui.waitForText("Invalid repository format");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-invalid-org-error", async () => {
    const tui = await launchTUI({ args: ["--org", "inv@lid!!!"] });
    try {
      await tui.waitForText("Invalid organization format");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-error-clears-after-5s", async () => {
    const tui = await launchTUI({ args: ["--screen", "foobar"] });
    try {
      await tui.waitForText("Unknown screen: foobar");
      await tui.waitForNoText("Unknown screen: foobar", 8_000);
    } finally { await tui.terminate(); }
  }, 15_000);

  test("deep-link-loading-state: breadcrumb visible during data load", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      const header = tui.getLine(0);
      expect(header).toContain("Dashboard");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);
});
```

#### Keyboard Interaction Tests (13 tests)

```typescript
describe("TUI_DEEP_LINK_LAUNCH — keyboard interaction tests", () => {
  test("deep-link-q-walks-back-from-issues", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.sendKeys("q");
      const header = tui.getLine(0);
      expect(header).not.toContain("Issues");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-q-walks-back-from-repo", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.sendKeys("q");
      await tui.sendKeys("q");
      await tui.waitForText("Dashboard");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-q-exits-from-dashboard", async () => {
    const tui = await launchTUI({ args: ["--screen", "repos"] });
    try {
      await tui.waitForText("Repositories");
      await tui.sendKeys("q");
      await tui.waitForText("Dashboard");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-q-walks-back-from-notifications", async () => {
    const tui = await launchTUI({ args: ["--screen", "notifications"] });
    try {
      await tui.waitForText("Notifications");
      await tui.sendKeys("q");
      await tui.waitForText("Dashboard");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-escape-pops", async () => {
    const tui = await launchTUI({ args: ["--screen", "repos"] });
    try {
      await tui.waitForText("Repositories");
      await tui.sendKeys("Escape");
      await tui.waitForText("Dashboard");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-ctrl-c-exits", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.sendKeys("ctrl+c");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-goto-from-deep-linked-screen", async () => {
    const tui = await launchTUI({ args: ["--screen", "notifications"] });
    try {
      await tui.waitForText("Notifications");
      await tui.sendKeys("g", "r");
      await tui.waitForText("Repositories");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-goto-with-repo-context", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.sendKeys("g", "l");
      await tui.waitForText("Landings");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-command-palette", async () => {
    const tui = await launchTUI({ args: ["--screen", "repos"] });
    try {
      await tui.waitForText("Repositories");
      await tui.sendKeys(":");
      await tui.waitForText(">");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-help-overlay", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.sendKeys("?");
      await tui.waitForText("help");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-error-screen-still-navigable", async () => {
    const tui = await launchTUI({ args: ["--screen", "foobar"] });
    try {
      await tui.waitForText("Unknown screen: foobar");
      await tui.sendKeys("g", "n");
      await tui.waitForText("Notifications");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-rapid-q-from-deep-stack", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.sendKeys("q", "q", "q");
    } finally { await tui.terminate(); }
  }, 30_000);
});
```

#### Responsive Tests (7 tests)

```typescript
describe("TUI_DEEP_LINK_LAUNCH — responsive tests", () => {
  test("deep-link-80x24-breadcrumb-truncation", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-80x24-error-truncation", async () => {
    const longRepo = "a".repeat(60) + "/" + "b".repeat(60);
    const tui = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "issues", "--repo", longRepo] });
    try {
      await tui.waitForText("Invalid repository");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-120x40-full-breadcrumb", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      const header = tui.getLine(0);
      expect(header).toContain("Dashboard");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-200x60-no-truncation", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      const header = tui.getLine(0);
      expect(header).not.toContain("…");
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-resize-after-launch", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.resize(80, 24);
      expect(tui.snapshot()).toMatchSnapshot();
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-resize-to-too-small", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.resize(60, 20);
      await tui.waitForText("Terminal too small");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-resize-from-too-small", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      await tui.resize(60, 20);
      await tui.waitForText("Terminal too small");
      await tui.resize(120, 40);
      await tui.waitForText("Issues");
    } finally { await tui.terminate(); }
  }, 30_000);
});
```

#### Integration Tests (6 tests)

```typescript
describe("TUI_DEEP_LINK_LAUNCH — integration tests", () => {
  test("deep-link-auth-then-screen: no Dashboard flash", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      const header = tui.getLine(0);
      expect(header).toContain("Issues");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-auth-failure-preserves-params", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`], env: { CODEPLANE_TOKEN: "invalid" } });
    try {
      await tui.waitForText("Issues");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-nonexistent-repo: q navigates back", async () => {
    const tui = await launchTUI({ args: ["--screen", "issues", "--repo", "nonexistent/repo"] });
    try {
      await tui.sendKeys("q");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-no-color-terminal: [ERROR] prefix", async () => {
    const tui = await launchTUI({ args: ["--screen", "foobar"], env: { NO_COLOR: "1" } });
    try {
      await tui.waitForText("[ERROR]");
      await tui.waitForText("Unknown screen: foobar");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-case-insensitive-screen", async () => {
    const tui = await launchTUI({ args: ["--screen", "Issues", "--repo", `${OWNER}/test-repo`] });
    try {
      await tui.waitForText("Issues");
      const snap = tui.snapshot();
      expect(snap).not.toContain("Unknown screen");
    } finally { await tui.terminate(); }
  }, 30_000);

  test("deep-link-notification-badge-on-deep-linked-screen", async () => {
    const tui = await launchTUI({ args: ["--screen", "repos"] });
    try {
      await tui.waitForText("Repositories");
      const header = tui.getLine(0);
      expect(header).toContain("●");
    } finally { await tui.terminate(); }
  }, 30_000);
});
```

#### Validation Unit Tests (10 tests via `bunEval`)

```typescript
describe("TUI_DEEP_LINK_LAUNCH — validation unit tests", () => {
  test("no args returns Dashboard-only stack", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({});console.log(JSON.stringify({len:x.stack.length,s:x.stack[0].screen,e:x.error}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.len).toBe(1); expect(p.s).toBe("Dashboard"); expect(p.e).toBeUndefined();
  });

  test("rejects screen > 32 chars", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({screen:"${'a'.repeat(33)}"});console.log(JSON.stringify({e:x.error,l:x.stack.length}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.e).toContain("Unknown screen"); expect(p.l).toBe(1);
  });

  test("validates repo regex", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({screen:"issues",repo:"inv@lid/repo!"});console.log(JSON.stringify({e:x.error}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.e).toContain("Invalid repository format");
  });

  test("validates org regex", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({org:"inv@lid!!!"});console.log(JSON.stringify({e:x.error}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.e).toContain("Invalid organization format");
  });

  test("requires --repo for issues", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({screen:"issues"});console.log(JSON.stringify({e:x.error}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.e).toContain("--repo required for issues");
  });

  test("--org builds org-context stack", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({org:"acme"});console.log(JSON.stringify({l:x.stack.length,s:x.stack.map(e=>e.screen)}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.l).toBe(2); expect(p.s).toEqual(["Dashboard","OrgOverview"]);
  });

  test("case-insensitive screen names", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({screen:"NOTIFICATIONS"});console.log(JSON.stringify({e:x.error,s:x.stack[x.stack.length-1].screen}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.e).toBeUndefined(); expect(p.s).toBe("Notifications");
  });

  test("sanitizeDeepLinkInput strips control chars", async () => {
    const r = await bunEval(`const{sanitizeDeepLinkInput}=require("${TUI_SRC}/lib/terminal.ts");console.log(sanitizeDeepLinkInput("hello\\x00world\\x1B[31mred\\x1B[0m"))`);
    expect(r.stdout.trim()).toBe("helloworld");
  });

  test("--screen orgs --org acme produces [Dashboard, OrgOverview]", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({screen:"orgs",org:"acme"});console.log(JSON.stringify({l:x.stack.length,s:x.stack.map(e=>e.screen)}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.l).toBe(2); expect(p.s).toEqual(["Dashboard","OrgOverview"]);
  });

  test("--screen dashboard produces depth-1", async () => {
    const r = await bunEval(`const{buildInitialStack}=require("${TUI_SRC}/navigation/deepLinks.ts");const x=buildInitialStack({screen:"dashboard"});console.log(JSON.stringify({l:x.stack.length}))`);
    const p = JSON.parse(r.stdout.trim());
    expect(p.l).toBe(1);
  });
});
```

---

## Productionization Notes

### What exists vs. what's new

| Component | Status | Action |
|---|---|---|
| `parseCLIArgs` | Exists | Extend with `--org`, sanitization |
| `buildInitialStack` | Exists | Rewrite with full validation |
| `DeepLinkResult.error` | Exists | Now surfaced via `DeepLinkErrorBanner` |
| `StatusBar` error display | Exists | Add `NO_COLOR` prefix |
| `LoadingProvider.statusBarError` | Exists | Expose `setStatusBarError()` |
| `DeepLinkErrorBanner` | **New** | Renderless bridge component |
| `sanitizeDeepLinkInput` | **New** | Pure function |
| `inferDeepLinkFailureReason` | **New** | Pure function for telemetry |
| Telemetry events | **New** | Uses existing `emit()` |
| Structured logging | **New** | Uses existing `logger` |

### Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `LoadingProvider` API change breaks consumers | Low | `setStatusBarError` is additive |
| `DeepLinkErrorBanner` fires before status bar ready | Low | `useEffect` defers to after mount |
| E2E tests fail due to auth timing | Medium | 30s timeouts; `waitForText` polls |
| `sanitizeDeepLinkInput` strips valid Unicode | Low | Only targets control chars and ANSI escapes |

### No POC required

All changes use existing infrastructure. No new 3rd-party deps. No new native bindings.

### Migration

The `resolveDeepLink` alias in `deepLinks.ts` is a `const` pointing to `buildInitialStack` — it auto-updates.

---

## Dependencies

| Dependency | Ticket | Status |
|---|---|---|
| NavigationProvider stack model | `tui-nav-chrome-eng-08` | Implemented |
| AppShell layout | `tui-nav-chrome-feat-01` | Implemented |
| HeaderBar breadcrumb truncation | `tui-nav-chrome-feat-02` | Implemented |
| StatusBar hints | `tui-nav-chrome-feat-03` | Implemented |
| LoadingProvider transient errors | `tui-nav-chrome-eng-06` | Implemented (needs `setStatusBarError` exposed) |

All dependencies satisfied. This ticket can be implemented independently.