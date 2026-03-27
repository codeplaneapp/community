# Engineering Specification: TUI Repository Overview Screen

**Ticket:** `tui-repo-overview`
**Title:** Repository overview screen with metadata, stats, and README
**Type:** Feature
**Dependencies:** `tui-repo-screen-scaffold`, `tui-repo-data-hooks`, `tui-bootstrap-and-renderer`, `tui-detail-view-component`, `tui-responsive-layout`

---

## 1. Overview

This specification describes the implementation of the repository overview screen — the anchor content displayed when a user navigates to a repository in the Codeplane TUI. The screen renders repository metadata, engagement stats, topics, fork provenance, description, and README content in a single vertically-scrollable view.

The overview screen replaces the current `PlaceholderScreen` for the `ScreenName.RepoOverview` entry in the screen registry and becomes the first fully-implemented repository screen.

---

## 2. Implementation Plan

### Step 1: Create Utility Functions

**File:** `apps/tui/src/util/repo.ts`

Add repository-specific formatting utilities. These are pure functions, easily testable, reusable across other repository screens.

```typescript
/**
 * Format a number with K/M abbreviation.
 * - 0-999: displayed as-is ("42")
 * - 1,000-999,999: K-abbreviated with 1 decimal ("1.2k")
 * - 1,000,000+: M-abbreviated with 1 decimal ("3.4m")
 * - Never exceeds 7 characters.
 */
export function formatCount(n: number): string {
  if (n < 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return k >= 100 ? `${Math.floor(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  const m = n / 1_000_000;
  return m >= 100 ? `${Math.floor(m)}m` : `${m.toFixed(1).replace(/\.0$/, "")}m`;
}

/**
 * Format an ISO 8601 timestamp as a compact relative time string.
 * Examples: "3s", "5m", "2h", "3d", "2w", "1mo", "2y"
 * Maximum 4 characters.
 */
export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "?";
  const diffMs = Math.max(0, now - then);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

/**
 * Validate a repo owner/name segment against allowed characters.
 * Returns true if valid.
 */
export function isValidRepoSegment(segment: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(segment);
}

/**
 * Parse a "owner/name" string into parts.
 * Returns null if invalid.
 */
export function parseRepoFullName(fullName: string): { owner: string; repo: string } | null {
  const parts = fullName.split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return null;
  return { owner, repo };
}
```

**Rationale:** These utilities are small, pure, and reusable. `formatCount` and `relativeTime` will be consumed by every repository-related screen, stats display, and list row.

---

### Step 2: Create Repository Types

**File:** `apps/tui/src/types/repository.ts`

The TUI-local `Repository` type mapped from the API response. This type is consumed by all repository screens.

```typescript
/**
 * Repository entity as consumed by TUI screens.
 * Mapped from the API response via parseRepository().
 */
export interface Repository {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description: string;
  isPrivate: boolean;
  isPublic: boolean;
  defaultBookmark: string;
  topics: string[];
  isArchived: boolean;
  archivedAt: string | null;
  isFork: boolean;
  forkId: number | null;
  parentFullName: string | null;
  numStars: number;
  numForks: number;
  numWatches: number;
  numIssues: number;
  cloneUrl: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Parse a raw API response object into a typed Repository.
 * Handles snake_case → camelCase conversion.
 * Provides safe defaults for missing fields.
 */
export function parseRepository(raw: Record<string, unknown>): Repository {
  return {
    id: Number(raw.id),
    owner: String(raw.owner ?? ""),
    name: String(raw.name ?? ""),
    fullName: String(raw.full_name ?? `${raw.owner}/${raw.name}`),
    description: String(raw.description ?? ""),
    isPrivate: Boolean(raw.private),
    isPublic: Boolean(raw.is_public ?? !raw.private),
    defaultBookmark: String(raw.default_bookmark ?? "main"),
    topics: Array.isArray(raw.topics) ? raw.topics.map(String) : [],
    isArchived: Boolean(raw.is_archived),
    archivedAt: raw.archived_at ? String(raw.archived_at) : null,
    isFork: Boolean(raw.is_fork),
    forkId: raw.fork_id != null ? Number(raw.fork_id) : null,
    parentFullName: raw.parent_full_name ? String(raw.parent_full_name) : null,
    numStars: Number(raw.num_stars ?? 0),
    numForks: Number(raw.num_forks ?? 0),
    numWatches: Number(raw.num_watches ?? 0),
    numIssues: Number(raw.num_issues ?? 0),
    cloneUrl: String(raw.clone_url ?? ""),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
  };
}
```

---

### Step 3: Create TUI Data Hook Adapters

These hooks use the existing `useRepoFetch()` internal helper (from `apps/tui/src/hooks/useRepoFetch.ts`) which provides authenticated `GET` requests via the `APIClientProvider` context. This avoids reading `process.env.CODEPLANE_API_URL` and `process.env.CODEPLANE_TOKEN` directly in each hook — the `APIClientProvider` already resolves and injects these.

The `useRepoFetch()` helper returns a `RepoFetchContext` with a `get<T>(path, options?)` method that:
- Constructs the full URL from `client.baseUrl + path`
- Sets `Authorization: Bearer ${client.token}` headers
- Throws `FetchError` with `.status` property on HTTP errors
- Returns parsed JSON on success

**File:** `apps/tui/src/hooks/useRepo.ts`

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { useRepoFetch, FetchError, toLoadingError } from "./useRepoFetch.js";
import { parseRepository, type Repository } from "../types/repository.js";

interface UseRepoResult {
  repo: Repository | null;
  isLoading: boolean;
  error: (Error & { status?: number }) | null;
  refetch: () => void;
}

export function useRepo(owner: string, repo: string): UseRepoResult {
  const { get } = useRepoFetch();
  const [data, setData] = useState<Repository | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<(Error & { status?: number }) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchRepo = useCallback(async () => {
    if (!owner || !repo) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const path = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const json = await get<Record<string, unknown>>(path, { signal: controller.signal });
      setData(parseRepository(json));
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (e instanceof FetchError) {
        const err = Object.assign(new Error(e.message), { status: e.status });
        setError(err);
      } else if (e instanceof Error) {
        setError(e);
      } else {
        setError(new Error("Unknown error"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo, get]);

  useEffect(() => {
    fetchRepo();
    return () => abortRef.current?.abort();
  }, [fetchRepo]);

  return { repo: data, isLoading, error, refetch: fetchRepo };
}
```

**File:** `apps/tui/src/hooks/useRepoReadme.ts`

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { useRepoFetch, FetchError } from "./useRepoFetch.js";

interface UseRepoReadmeResult {
  content: string | null;
  isLoading: boolean;
  error: (Error & { status?: number }) | null;
}

export function useRepoReadme(owner: string, repo: string): UseRepoReadmeResult {
  const { get } = useRepoFetch();
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<(Error & { status?: number }) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchReadme = useCallback(async () => {
    if (!owner || !repo) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const path = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`;
      const json = await get<Record<string, unknown>>(path, { signal: controller.signal });
      setContent(typeof json.content === "string" ? json.content : null);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (e instanceof FetchError && e.status === 404) {
        setContent(null);
        return;
      }
      if (e instanceof FetchError) {
        const err = Object.assign(new Error(e.message), { status: e.status });
        setError(err);
      } else if (e instanceof Error) {
        setError(e);
      }
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo, get]);

  useEffect(() => {
    fetchReadme();
    return () => abortRef.current?.abort();
  }, [fetchReadme]);

  return { content, isLoading, error };
}
```

**File:** `apps/tui/src/hooks/useStarRepo.ts`

```typescript
import { useState, useEffect, useCallback } from "react";
import { useAPIClient } from "../providers/APIClientProvider.js";

interface UseStarRepoResult {
  starred: boolean;
  isLoading: boolean;
  error: (Error & { status?: number }) | null;
  toggle: () => Promise<void>;
}

export function useStarRepo(owner: string, repo: string): UseStarRepoResult {
  const client = useAPIClient();
  const [starred, setStarred] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<(Error & { status?: number }) | null>(null);

  useEffect(() => {
    if (!owner || !repo) return;
    const controller = new AbortController();

    (async () => {
      try {
        const url = `${client.baseUrl}/api/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${client.token}` },
          signal: controller.signal,
        });
        setStarred(res.status === 204);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (e instanceof Error) setError(e);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [owner, repo, client.baseUrl, client.token]);

  const toggle = useCallback(async () => {
    const method = starred ? "DELETE" : "PUT";
    const url = `${client.baseUrl}/api/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${client.token}` },
    });
    if (!res.ok) {
      const err = Object.assign(
        new Error(`Star toggle failed: ${res.statusText}`),
        { status: res.status },
      );
      throw err;
    }
    setStarred(!starred);
  }, [owner, repo, starred, client.baseUrl, client.token]);

  return { starred, isLoading, error, toggle };
}
```

**File:** `apps/tui/src/hooks/useClipboard.ts`

```typescript
import { useCallback, useState } from "react";

interface UseClipboardResult {
  copy: (text: string) => Promise<boolean>;
  supported: boolean;
}

export function useClipboard(): UseClipboardResult {
  const [supported] = useState(() => {
    return process.stdout.isTTY === true;
  });

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      const encoded = Buffer.from(text).toString("base64");
      process.stdout.write(`\x1b]52;c;${encoded}\x07`);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { copy, supported };
}
```

**Design decision — `useRepoFetch` vs direct `fetch`:** The `useRepo` and `useRepoReadme` hooks use the existing `useRepoFetch()` helper which provides authenticated requests via `APIClientProvider` context. The `useStarRepo` hook uses `useAPIClient()` directly because the star-check endpoint returns 204/404 (not JSON), which doesn't fit `useRepoFetch`'s JSON-parsing contract. The `useClipboard` hook is terminal-specific (OSC 52) and stays TUI-local permanently.

---

### Step 4: Create the Repository Overview Screen Component

**File:** `apps/tui/src/screens/RepoOverviewScreen.tsx`

This is the primary deliverable. The component replaces `PlaceholderScreen` for `ScreenName.RepoOverview`.

The component manages these local state values:
- `localStarred` / `localStarCount`: Optimistic star state, overlaid on top of API data
- `starInFlightRef`: Ref guard preventing double-toggle during in-flight star request
- `statusMessage`: Transient status bar message ("Copied!", "Star failed", "Copy not available")
- `loadStartRef`: Timestamp for telemetry load time measurement

The component calls three data hooks:
1. `useRepo(owner, repoName)` — fetches `GET /api/repos/:owner/:repo` via `useRepoFetch()`
2. `useRepoReadme(owner, repoName)` — fetches `GET /api/repos/:owner/:repo/readme` via `useRepoFetch()`
3. `useStarRepo(owner, repoName)` — checks and toggles star status via `useAPIClient()`

Loading and error states from `useRepo` are wired into `useScreenLoading` for consistent spinner/error/retry behavior.

The star toggle implements optimistic UI with a `starInFlightRef` guard preventing double-toggle. The clipboard copy uses OSC 52 via `useClipboard()`. Transient status messages auto-clear after 2 seconds via a timer ref.

Keybinding registration uses `useScreenKeybindings` which pushes a `PRIORITY.SCREEN` scope on mount and pops on unmount.

The component renders three states: loading (`FullScreenLoading`), error (`FullScreenError` with 401 propagation to ErrorBoundary), or loaded (full overview layout in a `<scrollbox>`).

Sub-components `MetadataRow`, `StatsRow`, and `ForkIndicator` are defined in the same file.

---

### Step 5: Register the Screen in the Router

**File:** `apps/tui/src/router/registry.ts`

Update the `RepoOverview` entry to point to the new screen component:

```typescript
import { RepoOverviewScreen } from "../screens/RepoOverviewScreen.js";

[ScreenName.RepoOverview]: {
  component: RepoOverviewScreen,     // was: PlaceholderScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => (p.owner && p.repo ? `${p.owner}/${p.repo}` : p.repo ?? "Repository"),
},
```

---

### Step 6: Export Barrel Updates

**File:** `apps/tui/src/util/index.ts` — append repo util exports.
**File:** `apps/tui/src/types/index.ts` — append repository type exports.
**File:** `apps/tui/src/hooks/index.ts` — append hook exports.

---

### Step 7: Telemetry Integration

Telemetry events use the existing `emit()` from `apps/tui/src/lib/telemetry.ts`. Events emitted: `tui.repo.overview.view`, `tui.repo.overview.star`, `tui.repo.overview.copy_clone_url`, `tui.repo.overview.navigate`, `tui.repo.overview.fork_navigate`.

---

### Step 8: Logging

Structured logging via `apps/tui/src/lib/logger.ts`. Level controlled by `CODEPLANE_TUI_LOG_LEVEL` (default: `error`) or `CODEPLANE_TUI_DEBUG=true` (sets level to `debug`).

---

## 3. File Inventory

| File | Action | Purpose |
|------|--------|---------|  
| `apps/tui/src/util/repo.ts` | Create | `formatCount()`, `relativeTime()`, `parseRepoFullName()`, `isValidRepoSegment()` |
| `apps/tui/src/types/repository.ts` | Create | `Repository` interface, `parseRepository()` |
| `apps/tui/src/hooks/useRepo.ts` | Create | Fetch single repo metadata via `useRepoFetch()` |
| `apps/tui/src/hooks/useRepoReadme.ts` | Create | Fetch repo README content via `useRepoFetch()` |
| `apps/tui/src/hooks/useStarRepo.ts` | Create | Star/unstar with check-on-mount via `useAPIClient()` |
| `apps/tui/src/hooks/useClipboard.ts` | Create | OSC 52 clipboard write |
| `apps/tui/src/screens/RepoOverviewScreen.tsx` | Create | Main screen component with sub-components |
| `apps/tui/src/router/registry.ts` | Edit | Import `RepoOverviewScreen`, replace `PlaceholderScreen` for `RepoOverview` |
| `apps/tui/src/util/index.ts` | Edit | Add repo util exports |
| `apps/tui/src/types/index.ts` | Edit | Add repository type exports |
| `apps/tui/src/hooks/index.ts` | Edit | Add hook exports |
| `e2e/tui/repository.test.ts` | Edit | Add E2E tests for repo overview (append to existing file) |
| `e2e/tui/util-repo.test.ts` | Create | Unit tests for repo utility functions |

---

## 4. Component Tree

```
AppShell
├── HeaderBar (breadcrumb: "… > owner/repo")
├── RepoOverviewScreen
│   ├── [loading] → FullScreenLoading
│   ├── [error]   → FullScreenError
│   └── [loaded]  → <scrollbox>
│       ├── RepoHeader (fullName + PUBLIC/PRIVATE + ARCHIVED badges)
│       ├── MetadataSection
│       │   ├── MetadataRow (Owner)
│       │   ├── MetadataRow (Default bookmark — primary color)
│       │   ├── CloneUrlRow (with copy hint)
│       │   ├── MetadataRow (Created — muted, relative time)
│       │   └── MetadataRow (Updated — muted, relative time)
│       ├── StatsRow (★ ⑂ 👁 Issues — stacked at minimum breakpoint)
│       ├── [topics.length > 0] → TopicTags (inline [topic] in primary)
│       ├── [isFork] → ForkIndicator
│       ├── [description] → DescriptionBlock (wrapped text)
│       └── ReadmeBlock
│           ├── [loading] → "Loading README…" (muted)
│           ├── [error]   → "Unable to load README." (muted)
│           ├── [content] → <markdown>{readme}</markdown>
│           └── [empty]   → "No README found." (muted)
└── StatusBar (hints: s star | c copy url | i issues | l landings | q back)
```

---

## 5. Keyboard Interaction Map

| Key | Action | Condition | Priority |
|-----|--------|-----------|----------|
| `j` / `Down` | Scroll content down | Scrollbox focused | OpenTUI native |
| `k` / `Up` | Scroll content up | Scrollbox focused | OpenTUI native |
| `Ctrl+D` | Page down (half viewport) | Scrollbox focused | OpenTUI native |
| `Ctrl+U` | Page up (half viewport) | Scrollbox focused | OpenTUI native |
| `G` | Scroll to bottom | Scrollbox focused | OpenTUI native |
| `g g` | Scroll to top | Scrollbox focused | GOTO → OpenTUI native |
| `s` | Star/unstar repository | Not in error state | SCREEN (priority 4) |
| `c` | Copy clone URL | Not in error state | SCREEN (priority 4) |
| `b` | Navigate to bookmarks | Not in error state | SCREEN (priority 4) |
| `i` | Navigate to issues | Not in error state | SCREEN (priority 4) |
| `l` | Navigate to landings | Not in error state | SCREEN (priority 4) |
| `f` | Navigate to workflows | Not in error state | SCREEN (priority 4) |
| `e` | Navigate to code explorer | Not in error state | SCREEN (priority 4) |
| `g k` | Navigate to wiki | Not in error state | GOTO (priority 3) |
| `Tab` / `Shift+Tab` | Cycle repo tabs | Always | SCREEN (priority 4) |
| `1`–`9` | Jump to tab by number | Always | SCREEN (priority 4) |
| `R` | Retry failed fetch | Error state | SCREEN (priority 4) |
| `q` | Pop screen | Always | GLOBAL (priority 5) |
| `Esc` | Pop screen | No overlay | GLOBAL (priority 5) |
| `?` | Help overlay | Always | GLOBAL (priority 5) |
| `:` | Command palette | Always | GLOBAL (priority 5) |

---

## 6. Responsive Behavior

### 80×24 (minimum)
- Metadata label width: 12 chars
- Stats row: stacked vertically
- Clone URL: truncated with `…` if exceeding `width - labelWidth - 16`
- Topics: wrap across multiple lines
- Sidebar: hidden
- Modal overlays: 90% width/height

### 120×40 (standard)
- Metadata label width: 18 chars
- Stats row: single horizontal line with `gap={2}`
- Clone URL: displayed in full
- Topics: single line unless overflow
- Full layout

### 200×60 (large)
- Metadata label width: 24 chars
- Stats row: single line with extra spacing
- Extra vertical gap between sections
- README renders with wider comfortable margins

---

## 7. Error Handling Matrix

| Scenario | Detection | User-Facing Behavior |
|----------|-----------|---------------------|
| Network timeout (30s) | `useScreenLoading` timeout | `FullScreenError` with "Press R to retry" |
| 404 Not Found | `FetchError.status === 404` | `FullScreenError`: "Repository not found" |
| 401 Unauthorized | `FetchError.status === 401` | Throw to ErrorBoundary → Auth error screen |
| 429 Rate Limited | `FetchError.status === 429` | `FullScreenError`: "Rate limited — try again later" |
| 500 Server Error | `FetchError.status >= 500` | `FullScreenError`: "Internal Server Error (500)" |
| README fetch failure | `readmeError != null` | Repo metadata renders. README section shows "Unable to load README." |
| Star toggle failure | `toggleStar()` throws | Optimistic revert. Status bar: "Star failed" for 2s |
| Clipboard unavailable | `useClipboard().supported === false` | Status bar: "Copy not available" for 2s |
| Fork parent deleted | `parentFullName === null` | "Forked from [deleted repository]", Enter is no-op |
| Terminal resize | `useOnResize` fires via OpenTUI | Synchronous re-layout. Scroll position preserved |
| Malformed API response | `parseRepository()` returns defaults | Displays with defaults, no crash |

---

## 8. Productionization Notes

### Data Hook Migration
When `@codeplane/ui-core` ships its repository hooks: delete TUI-local adapters, import from `@codeplane/ui-core`, verify return type compatibility. Keep `useClipboard` — it is terminal-specific.

### Performance Guardrails
- README content capped at 500,000 characters
- `parseRepository()` called once per fetch, not per render
- Scroll position managed by OpenTUI's `<scrollbox>` natively
- `starInFlightRef` guard prevents double star requests

---

## 9. Unit & Integration Tests

### Test File: `e2e/tui/util-repo.test.ts`
Pure function tests: formatCount (5 tests), relativeTime (8 tests), parseRepoFullName (3 tests), isValidRepoSegment (2 tests), parseRepository (5 tests). Total: 23 unit tests.

### Test File: `e2e/tui/repository.test.ts` (appended)
E2E tests: Terminal Snapshots (21), Keyboard Interactions (28), Responsive (10), Integration (10). Total: 69 E2E tests.

---

## 10. Test Matrix Summary

| Category | Count |
|----------|-------|
| Terminal Snapshots | 21 |
| Keyboard Interactions | 28 |
| Responsive | 10 |
| Integration | 10 |
| Unit tests | 23 |
| **Total** | **92** |

All E2E tests run against a real API server with test fixtures. Tests that fail due to unimplemented backend features are left failing — never skipped or commented out.

---

## 11. Dependency Graph

```
tui-bootstrap-and-renderer (✅ implemented)
  └── tui-responsive-layout (✅ implemented)
       └── tui-repo-data-hooks (planned — this spec creates TUI-local adapters)
            └── tui-detail-view-component (planned — this spec uses <scrollbox> directly)
                 └── tui-repo-screen-scaffold (planned — this spec creates the screen component)
                      └── tui-repo-overview (THIS SPEC)
```

---

## 12. Migration Path

When dependency tickets are completed:
- `tui-repo-data-hooks` completed → delete local hooks, import from `@codeplane/ui-core`
- `tui-detail-view-component` completed → optionally wrap scrollbox in `<DetailView>`
- `tui-repo-screen-scaffold` completed → integrate overview as tab content
- `APIClientProvider` already consumed — no migration needed

---

## 13. Open Questions

1. `k` key conflict (RESOLVED): Wiki uses `g k` via goToBindings.ts
2. Fork parent navigation: future `p` key or command palette integration
3. Star rate limit: `starInFlightRef` guard + server-side 429
4. README rendering cap: 500,000 chars, adjustable if OpenTUI performance requires