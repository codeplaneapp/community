# Research: TUI_DIFF_INLINE_COMMENTS — Landing Diff Inline Comments with c/n/p Keys

## 1. Current State of Implementation

### 1.1 DiffScreen Directory
**Path:** `apps/tui/src/screens/DiffScreen/`
**Status:** Directory exists but is **completely empty**. No files have been created yet.

The router currently maps `ScreenName.DiffView` to `PlaceholderScreen` at `apps/tui/src/router/registry.ts` line 113-118:
```typescript
[ScreenName.DiffView]: {
  component: PlaceholderScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Diff",
},
```

### 1.2 Dependency Ticket Status
All three dependency tickets are **not started** — no files exist yet:
- `tui-diff-unified-view`: Would provide `UnifiedDiffViewer`, `DiffFileHeader`, `DiffHunkHeader`, `useHunkCollapse`, `useDiffScroll`, `diff-constants.ts`
- `tui-diff-expand-collapse`: Would provide `useHunkCollapseGlobal`, `useFocusedHunk`, `CollapsedHunkSummary`, `useCollapseKeybindings`
- `tui-diff-file-navigation`: Would provide file tree sidebar and `]`/`[` navigation

### 1.3 Types File
**Path:** `apps/tui/src/types/diff.ts` — **Does not exist yet**
The types are fully specified in `specs/tui/engineering/tui-diff-data-hooks.md` lines 35-132.

### 1.4 Data Hooks
**None exist yet.** The following hooks are specified but not implemented:
- `useLandingComments` — specified in `specs/tui/engineering/tui-diff-data-hooks.md` lines 678-808
- `useCreateLandingComment` — specified in `specs/tui/engineering/tui-diff-data-hooks.md` lines 889-983
- `useChangeDiff` — specified lines 299-403
- `useLandingDiff` — specified lines 475-582

---

## 2. API Contract (Server-Side — Implemented)

### 2.1 Landing Comment Types
**File:** `apps/server/src/routes/landings.ts` lines 49-96

```typescript
interface CreateLandingCommentInput {
  path: string;
  line: number;
  side: string;
  body: string;
}

interface LandingCommentResponse {
  id: number;
  landing_request_id: number;
  author: LandingRequestAuthor; // { id: number; login: string }
  path: string;
  line: number;
  side: string;
  body: string;
  created_at: string;
  updated_at: string;
}
```

### 2.2 List Comments Endpoint
**File:** `apps/server/src/routes/landings.ts` lines 643-662
- **Route:** `GET /api/repos/:owner/:repo/landings/:number/comments`
- **Auth:** Optional (public repos)
- **Pagination:** Page-based (`page`, `per_page` query params), NOT cursor-based
- **Headers:** `X-Total-Count` for total, plus standard pagination link headers
- **Response:** `LandingCommentResponse[]`

### 2.3 Create Comment Endpoint
**File:** `apps/server/src/routes/landings.ts` lines 665-694
- **Route:** `POST /api/repos/:owner/:repo/landings/:number/comments`
- **Auth:** Required (`requireRouteUser`)
- **Body:** `{ path?: string, line?: number, side?: string, body?: string }` (all optional with defaults)
- **Response:** `201 Created` with `LandingCommentResponse`

### 2.4 SDK Service Layer
**File:** `packages/sdk/src/services/landing.ts` lines 104-114
- `listLandingComments()` — paginated listing
- `createLandingComment()` — create new comment

### 2.5 Database Layer
**File:** `packages/sdk/src/db/landings_sql.ts`
- `listLandingRequestComments()` — paginated query
- `countLandingRequestComments()` — total count
- `createLandingRequestComment()` — insert

---

## 3. Existing Hook Patterns (Critical for Implementation)

### 3.1 useOptimisticMutation
**File:** `apps/tui/src/hooks/useOptimisticMutation.ts` (93 lines)
**Pattern used by spec:** The inline comments `useCreateLandingComment` hook is specified to use this pattern.

```typescript
interface OptimisticMutationOptions<TArgs> {
  id: string;
  entityType: string;
  action: string;
  mutate: (args: TArgs) => Promise<void>;
  onOptimistic: (args: TArgs) => void;
  onRevert: (args: TArgs) => void;
  onSuccess?: (args: TArgs) => void;
}
```

Key behaviors:
- Applies local state immediately via `onOptimistic()`
- Never cancels on unmount (mutations fire-and-forget)
- Reverts via `onRevert()` on server error
- Shows 5-second error in status bar via `loading.failMutation()`
- Uses `useLoading()` for registration/completion/failure tracking
- Error messages truncated to 60 chars

### 3.2 useScreenKeybindings
**File:** `apps/tui/src/hooks/useScreenKeybindings.ts` (55 lines)
**Pattern used by spec:** DiffScreen registers `c`, `n`, `p` keys at `PRIORITY.SCREEN` level.

```typescript
function useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void
```

Key behaviors:
- Pushes `PRIORITY.SCREEN` scope on mount, pops on unmount
- Uses `bindingsRef` pattern so handlers are always fresh without re-registering scope
- Auto-generates status bar hints from first 8 bindings or accepts custom `hints` array
- Normalizes key descriptors for consistent matching

### 3.3 Keybinding Priority System
**File:** `apps/tui/src/providers/keybinding-types.ts` (89 lines)

```typescript
const PRIORITY = {
  TEXT_INPUT: 1,  // Highest priority — for form textarea
  MODAL: 2,
  GOTO: 3,
  SCREEN: 4,     // Normal screen keybindings
  GLOBAL: 5,     // Always-active fallback
};
```

**Critical for inline comments:** When the comment form is open, a `TEXT_INPUT` priority scope must be registered that traps all keys except `Ctrl+S`, `Escape`, `Ctrl+C`, and `?`. This is how the form captures `j`, `k`, `n`, `p`, etc. as text input rather than navigation.

### 3.4 useLayout
**File:** `apps/tui/src/hooks/useLayout.ts` (110 lines)

Returns `LayoutContext` with:
- `width`, `height` — raw terminal dimensions
- `breakpoint` — `"minimum" | "standard" | "large" | null`
- `contentHeight` — `height - 2` (excludes header + status bar)
- `sidebarVisible`, `sidebarWidth` — sidebar state
- `modalWidth`, `modalHeight` — modal sizing
- `sidebar` — full `SidebarState` object

### 3.5 useBreakpoint
**File:** `apps/tui/src/hooks/useBreakpoint.ts` (17 lines)

Simple wrapper: reads `useTerminalDimensions()` from `@opentui/react`, returns `getBreakpoint(cols, rows)`.

Breakpoint thresholds:
- `null`: < 80×24
- `"minimum"`: 80×24 – 119×39
- `"standard"`: 120×40 – 199×59
- `"large"`: 200×60+

### 3.6 useTheme
**File:** `apps/tui/src/hooks/useTheme.ts` (30 lines)

Returns frozen `ThemeTokens` from context. Tokens include:
- Core: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`
- Diff: `diffAddedBg`, `diffRemovedBg`, `diffAddedText`, `diffRemovedText`, `diffHunkHeader`

### 3.7 useAuth
**File:** `apps/tui/src/hooks/useAuth.ts` (8 lines)

Returns `AuthContextValue` with:
- `status`: `"loading" | "authenticated" | "unauthenticated" | "expired" | "offline"`
- `user`: `string | null`
- `token`: `string | null`
- `apiUrl`, `host`, `tokenSource`, `retry`

Used by comment form to check authentication before allowing `c` key.

### 3.8 APIClient & useRepoFetch
**File:** `apps/tui/src/providers/APIClientProvider.tsx` (34 lines)

```typescript
interface APIClient { baseUrl: string; token: string; }
```

**File:** `apps/tui/src/hooks/useRepoFetch.ts` (113 lines)

Authenticated fetch helper:
- Adds `Authorization: Bearer ${token}` header
- `FetchError` class carries HTTP status
- `toLoadingError()` classifies: 401 → auth_error, 429 → rate_limited, 400+ → http_error, other → network
- Messages truncated to 60 characters

### 3.9 useStatusBarHints
**File:** `apps/tui/src/hooks/useStatusBarHints.ts` (12 lines)

```typescript
interface StatusBarHint { keys: string; label: string; order?: number; }
interface StatusBarHintsContextType {
  hints: StatusBarHint[];
  registerHints(sourceId: string, hints: StatusBarHint[]): () => void;
  overrideHints(hints: StatusBarHint[]): () => void;
  isOverridden: boolean;
}
```

---

## 4. Existing Component Patterns

### 4.1 Agent Screen Components (Reference Pattern)
**Path:** `apps/tui/src/screens/Agents/`

Structure:
- `types.ts` — local type definitions (MessageRole, AgentMessage, etc.)
- `components/MessageBlock.tsx` — currently empty stub (`export {};`)
- `components/ToolBlock.tsx` — component file
- `components/index.ts` — barrel export
- `utils/formatTimestamp.ts` — utility for relative timestamps

`formatTimestamp.ts` (33 lines) is a direct analog to the `relativeTime()` function specified for inline comments:
```typescript
function formatTimestamp(isoString: string, breakpoint: Breakpoint): string | null {
  // minimum → null (hidden)
  // standard → compact ("<1m", "5m", "2h", "3d")
  // large → verbose ("just now", "5 minutes ago")
}
```

### 4.2 PlaceholderScreen
**File:** `apps/tui/src/screens/PlaceholderScreen.tsx`
Used as fallback for unimplemented screens.

---

## 5. Theme & Color System

### 5.1 ThemeTokens
**File:** `apps/tui/src/theme/tokens.ts` (263 lines)

Three token sets (TRUECOLOR, ANSI256, ANSI16). Each set includes:
- `primary` — Blue (#3B82F6 / 33 / 4)
- `success` — Green (#22C55E / 34 / 2)
- `warning` — Yellow (#EAB308 / 178 / 3)
- `error` — Red (#EF4444 / 196 / 1)
- `muted` — Gray (#6B7280 / 245 / dim)
- `surface` — Dark gray (#1F2937 / 236 / default)
- `border` — Gray (#4B5563 / 240 / dim)

Diff-specific:
- `diffAddedBg` — #1A4D1A / 22 / 2
- `diffRemovedBg` — #4D1A1A / 52 / 1
- `diffAddedText` — #22C55E / 34 / 2
- `diffRemovedText` — #EF4444 / 196 / 1
- `diffHunkHeader` — #06B6D4 / 37 / 6

### 5.2 Color Tier Detection
**File:** `apps/tui/src/theme/detect.ts`
- `detectColorCapability(): ColorTier` — checks `NO_COLOR`, `TERM`, `COLORTERM`
- `isUnicodeSupported(): boolean`

### 5.3 NO_COLOR Support
The spec requires `InlineCommentBlock` to check `process.env.NO_COLOR` for border character:
- Normal: `┃` (U+2503 heavy vertical)
- NO_COLOR: `|` (ASCII pipe)

---

## 6. Diff Syntax Highlighting (Existing Implementation)

### 6.1 useDiffSyntaxStyle Hook
**File:** `apps/tui/src/hooks/useDiffSyntaxStyle.ts` (53 lines)
- Creates and memoizes `SyntaxStyle` from `@opentui/core`
- Stable instance — NOT recreated on view toggle, file nav, whitespace toggle, resize, or scroll
- Returns `SyntaxStyle | null`
- Cleans up native resources on unmount

### 6.2 Diff Syntax Palettes
**File:** `apps/tui/src/lib/diff-syntax.ts` (143 lines)
- Three palettes: TRUECOLOR (17 tokens), ANSI256 (17 tokens), ANSI16 (17 tokens)
- `resolveFiletype(apiLanguage, filePath)` — prefer API language, fallback to path detection
- `createDiffSyntaxStyle(tier)` — factory

---

## 7. Type System

### 7.1 Breakpoint
**File:** `apps/tui/src/types/breakpoint.ts` (33 lines)
```typescript
type Breakpoint = "minimum" | "standard" | "large";
function getBreakpoint(cols: number, rows: number): Breakpoint | null;
```

### 7.2 Screen Router Types
**File:** `apps/tui/src/router/types.ts` (103 lines)
- `ScreenName` enum with 32 screens including `DiffView`
- `ScreenEntry`: id, screen, params, breadcrumb, scrollPosition?
- `ScreenComponentProps`: entry, params
- `MAX_STACK_DEPTH = 32`

### 7.3 Loading Types
**File:** `apps/tui/src/loading/types.ts`
```typescript
type ScreenLoadingStatus = "idle" | "loading" | "error" | "timeout";
type PaginationStatus = "idle" | "loading" | "error";
type ActionStatus = "idle" | "loading" | "success" | "error";
interface LoadingError {
  type: "network" | "timeout" | "http_error" | "auth_error" | "rate_limited";
  httpStatus?: number;
  summary: string;
}
```

### 7.4 Planned Diff Types (From Spec)
**Specified for:** `apps/tui/src/types/diff.ts`
```typescript
interface FileDiffItem {
  path: string; old_path?: string;
  change_type: "added" | "modified" | "deleted" | "renamed" | "copied";
  patch?: string; is_binary: boolean; language?: string;
  additions: number; deletions: number;
  old_content?: string; new_content?: string;
}
interface LandingComment {
  id: number; landing_request_id: number;
  author: LandingCommentAuthor; // { id: number; login: string }
  path: string; line: number; side: string;
  body: string; created_at: string; updated_at: string;
}
interface CreateLandingCommentInput {
  path: string; line: number;
  side: "left" | "right" | "both"; body: string;
}
```

---

## 8. Hunk Collapse System (Dependency — Not Yet Implemented)

### 8.1 useHunkCollapseGlobal Interface
**Specified in:** `specs/tui/engineering/tui-diff-expand-collapse.md` lines 66-91
```typescript
interface HunkCollapseGlobalState {
  collapsed: Map<string, Map<number, boolean>>;
  toggleHunk(filePath: string, hunkIndex: number): void;
  collapseHunk(filePath: string, hunkIndex: number): void;
  expandHunk(filePath: string, hunkIndex: number): void;
  collapseAllInFile(filePath: string, hunkCount: number): void;
  expandAllInFile(filePath: string): void;
  expandAll(): void;
  isCollapsed(filePath: string, hunkIndex: number): boolean;
  getFileCollapseMap(filePath: string): Map<number, boolean>;
  collapsedCountInFile(filePath: string): number;
  totalCollapsedCount(): number;
  reset(): void;
}
```

### 8.2 Inline Comments Extension to Hunk Collapse
The inline comments spec (Step 8) extends `useHunkCollapse` to accept `uncollapsibleHunks: Map<string, Set<number>>` parameter. Key changes:
- `collapseHunk()` returns `false` if the hunk is in the uncollapsible set
- `collapseAllInFile()` skips uncollapsible hunks
- `useEffect` auto-expands any collapsed hunks that become uncollapsible (when comments loaded)

---

## 9. E2E Test Infrastructure

### 9.1 Helpers
**File:** `e2e/tui/helpers.ts` (492 lines)

Key exports:
```typescript
export const TUI_ROOT = join(import.meta.dir, "../../apps/tui");
export const TUI_SRC = join(TUI_ROOT, "src");
export const TUI_ENTRY = join(TUI_SRC, "index.tsx");
export const BUN = Bun.which("bun") ?? process.execPath;
export const API_URL = process.env.API_URL ?? "http://localhost:3000";
export const WRITE_TOKEN = process.env.CODEPLANE_WRITE_TOKEN ?? "codeplane_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
export const READ_TOKEN = process.env.CODEPLANE_READ_TOKEN ?? "codeplane_feedfacefeedfacefeedfacefeedfacefeedface";
export const OWNER = process.env.CODEPLANE_E2E_OWNER ?? "alice";
export const ORG = process.env.CODEPLANE_E2E_ORG ?? "acme";
export const TERMINAL_SIZES = {
  minimum: { width: 80, height: 24 },
  standard: { width: 120, height: 40 },
  large: { width: 200, height: 60 },
} as const;
```

### 9.2 TUITestInstance Interface
```typescript
interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;
  sendText(text: string): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  snapshot(): string;
  getLine(lineNumber: number): string;
  resize(cols: number, rows: number): Promise<void>;
  terminate(): Promise<void>;
  rows: number;
  cols: number;
}
```

### 9.3 LaunchTUIOptions
```typescript
interface LaunchTUIOptions {
  cols?: number;  // Default: 120
  rows?: number;  // Default: 40
  env?: Record<string, string>;
  args?: string[];
  launchTimeoutMs?: number;  // Default: 15000
}
```

### 9.4 Existing Test File Pattern
**File:** `e2e/tui/diff.test.ts` (217 lines)
Currently contains 41 placeholder tests for `TUI_DIFF_SYNTAX_HIGHLIGHT` only (comment-based placeholders, no implementations). Uses `describe`/`test` blocks with test IDs like `SNAP-SYN-001`, `KEY-SYN-001`, etc.

Import pattern:
```typescript
import { launchTUI, TUITestInstance, TERMINAL_SIZES } from "./helpers.ts"
```

### 9.5 Test Configuration
**File:** `e2e/tui/bunfig.toml`
```toml
[test]
timeout = 30000
```

**TUI package.json:** `"test:e2e": "bun test ../../e2e/tui/ --timeout 30000"`

### 9.6 Test Philosophy
- Tests that fail due to unimplemented backends are **left failing** — never skipped or commented out
- Each test validates user-facing behavior, not implementation details
- Snapshot tests capture full terminal output at key interaction points
- Tests run against a real API server with test fixtures, not mocks

---

## 10. Existing Telemetry & Logging

### 10.1 Telemetry
**File:** `apps/tui/src/lib/telemetry.ts`
- `emit(eventName, properties)` — fire-and-forget telemetry
- Used by AuthProvider: `emit("tui.auth.started", { ... })`

### 10.2 Logger
**File:** `apps/tui/src/lib/logger.ts`
- `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`
- Output to stderr
- Controlled by `CODEPLANE_LOG_LEVEL`

---

## 11. Specification Files Referenced

| File | Content | Lines |
|------|---------|-------|
| `specs/tui/engineering/tui-diff-inline-comments.md` | Main spec for this ticket | Full |
| `specs/tui/engineering/tui-diff-data-hooks.md` | Type definitions, cache layer, data hooks | 35-983 |
| `specs/tui/engineering/tui-diff-expand-collapse.md` | Hunk collapse interface, uncollapsible hunks | 1-150 |
| `specs/tui/engineering/tui-diff-unified-view.md` | DiffContentArea, UnifiedDiffViewer interface | 1-200 |
| `specs/tui/engineering/tui-diff-screen-scaffold.md` | DiffScreen shell, params, focus zones | 1-200 |
| `specs/LANDING_COMMENT_CREATE.md` | Creation validation rules, API contract | Full |
| `specs/LANDING_COMMENT_LIST.md` | Listing pagination, partitioning | Full |
| `specs/LANDING_INLINE_COMMENTS_UI.md` | UI rendering spec for inline comments | Full |

---

## 12. Key Implementation Notes

### 12.1 Comment Partitioning
Inline comments: `path !== "" && line > 0`
General comments: `path === "" || line === 0`
Only inline comments are rendered in the diff viewer.

### 12.2 API Pagination Difference
- **Landing comments:** Page-based (`page`/`per_page`) with `X-Total-Count` header
- **Other lists:** Cursor-based

### 12.3 Auth Header Format
The server uses `Authorization: token ${token}` (AuthProvider line 62) but `useRepoFetch` uses `Authorization: Bearer ${token}` (line 89). The spec's hooks should follow `useRepoFetch` pattern.

### 12.4 No Existing DiffScreen Code
The entire DiffScreen is unimplemented. This ticket's files will need to be created fresh. However, all dependency tickets' types and interfaces are fully specified, so implementation can proceed with the assumption those interfaces exist.

### 12.5 Form Input Priority
When comment form is open, must register `PRIORITY.TEXT_INPUT` (1) scope that captures all keys except escape routes (`Ctrl+S`, `Escape`, `Ctrl+C`, `?`). This prevents `j/k/n/p/t/w/]/[` from being handled as navigation while typing.

### 12.6 Optimistic Comment IDs
Use negative IDs for optimistic comments (e.g., `-Date.now()`) to distinguish from server-assigned positive IDs. Clear from `optimisticIds` Set on success, remove optimistic comment on revert.

### 12.7 Hooks Barrel Export
**File:** `apps/tui/src/hooks/index.ts` (41 lines)
Currently exports 25 hooks. New hooks (`useLandingComments`, `useCreateLandingComment`) should be added here when implementing `tui-diff-data-hooks`.

### 12.8 NO_COLOR Border Character
The spec requires checking `process.env.NO_COLOR` in `InlineCommentBlock` for the vertical border:
- Normal: `┃` (Unicode heavy vertical)
- NO_COLOR: `|` (ASCII pipe)

### 12.9 Existing formatTimestamp Pattern
`apps/tui/src/screens/Agents/utils/formatTimestamp.ts` (33 lines) implements the same relative time pattern needed for `relativeTime()` in `commentUtils.ts`. It returns `null` at minimum breakpoint (hidden), compact at standard, verbose at large.

---

## 13. File Inventory Summary

### Files to Create
| File | Purpose |
|------|--------|
| `apps/tui/src/screens/DiffScreen/types.ts` | Extend with CommentAnchorKey, CommentNavigationState, InlineCommentFormState, FailedCommentBodyMap |
| `apps/tui/src/screens/DiffScreen/commentUtils.ts` | Pure utility functions |
| `apps/tui/src/screens/DiffScreen/useCommentNavigation.ts` | n/p comment navigation hook |
| `apps/tui/src/screens/DiffScreen/useCommentForm.ts` | Comment creation form lifecycle |
| `apps/tui/src/screens/DiffScreen/InlineCommentBlock.tsx` | Single comment rendering |
| `apps/tui/src/screens/DiffScreen/InlineCommentGroup.tsx` | Same-line comment group |
| `apps/tui/src/screens/DiffScreen/CommentForm.tsx` | Creation form with textarea |
| `apps/tui/src/screens/DiffScreen/commentTelemetry.ts` | Telemetry emitters |

### Files to Extend (When Dependencies Exist)
| File | Changes |
|------|--------|
| `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts` | Add uncollapsibleHunks parameter |
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Wire all comment hooks, keybindings, status bar |
| `apps/tui/src/screens/DiffScreen/DiffContentArea.tsx` | Render inline comments after diff lines |
| `e2e/tui/diff.test.ts` | Add 107 test cases |

### Critical Dependency Files (Must Exist First)
- `apps/tui/src/types/diff.ts` — LandingComment, FileDiffItem, CreateLandingCommentInput
- `apps/tui/src/lib/diff-cache.ts` — Cache layer
- `apps/tui/src/hooks/useLandingComments.ts` — Comment listing hook
- `apps/tui/src/hooks/useCreateLandingComment.ts` — Comment creation hook
- `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` — Screen shell (from scaffold ticket)
- `apps/tui/src/screens/DiffScreen/DiffContentArea.tsx` — Content area (from unified view ticket)
- `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts` — Hunk state (from unified view ticket)