# Research: `tui-workspace-list-screen` — Workspace list screen with pagination and filtering

## 1. Codebase Architecture

### 1.1 Screen Rendering Pipeline

The TUI renders screens through this hierarchy:

```
App Entry (apps/tui/src/index.tsx)
  → ThemeProvider → KeybindingProvider → OverlayManager → AuthProvider
    → APIClientProvider → SSEProvider → NavigationProvider → LoadingProvider
      → GlobalKeybindings → AppShell → ScreenRouter
```

**ScreenRouter** (`apps/tui/src/router/ScreenRouter.tsx`, lines 1-27) looks up `screenRegistry[currentScreen.screen]`, gets the `component`, and renders `<Component entry={currentScreen} params={currentScreen.params} />`.

**AppShell** (`apps/tui/src/components/AppShell.tsx`, lines 1-25) provides the global layout: `<HeaderBar>` + content area (`flexGrow={1}`) + `<StatusBar>` + `<OverlayLayer>`. If breakpoint is `null` (< 80×24), it renders `<TerminalTooSmallScreen>` instead.

### 1.2 Navigation System

**NavigationProvider** (`apps/tui/src/providers/NavigationProvider.tsx`) manages a `ScreenEntry[]` stack with:
- `push(screen, params)` — auto-resolves repo/org context from existing stack entries, prevents duplicates, capped at `MAX_STACK_DEPTH = 32`
- `pop()` — removes top entry
- `replace(screen, params)` — replaces top without growing stack
- `reset(screen, params)` — clears stack, pushes new root
- `repoContext` / `orgContext` — extracted from current stack
- `saveScrollPosition` / `getScrollPosition` — per-entry scroll cache

**useNavigation** is exported from `NavigationProvider.tsx` at line 179:
```typescript
export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within a NavigationProvider");
  return ctx;
}
```
**NOTE**: There is no separate `apps/tui/src/hooks/useNavigation.ts` file. The hook is exported from `providers/NavigationProvider.tsx` and re-exported via `apps/tui/src/hooks/index.ts` (line 16).

### 1.3 Go-to Bindings

**File**: `apps/tui/src/navigation/goToBindings.ts` (lines 1-51)

Workspaces binding: `{ key: "w", screen: ScreenName.Workspaces, requiresRepo: false, description: "Workspaces" }` at line 16.

`executeGoTo()` resets stack to Dashboard, optionally pushes RepoOverview if repo context exists, then pushes target screen.

### 1.4 Deep Links

**File**: `apps/tui/src/navigation/deepLinks.ts` — `buildInitialStack()` parses `--screen`, `--repo` args to create initial stack. Workspaces doesn't require repo, so `--screen workspaces` works standalone.

---

## 2. Registry: Current State & Required Modification

**File**: `apps/tui/src/router/registry.ts`

Lines 29-34 — current Workspaces entry:
```typescript
[ScreenName.Workspaces]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Workspaces",
},
```

Also relevant:
- Line 143-148 — `WorkspaceDetail`: `requiresRepo: false`, breadcrumb from `p.workspaceId?.slice(0, 8)`
- Line 149-154 — `WorkspaceCreate`: `requiresRepo: false`, breadcrumb `"New Workspace"`

**Required change**: Import `WorkspaceListScreen` and replace `PlaceholderScreen` on line 30.

The registry also has a compile-time exhaustiveness check (lines 199-207) that throws if any `ScreenName` is missing.

---

## 3. Screen Component Props Contract

**File**: `apps/tui/src/router/types.ts`

```typescript
export interface ScreenComponentProps {
  entry: ScreenEntry;       // ScreenEntry with id, screen, params, breadcrumb, scrollPosition
  params: Record<string, string>;  // Convenience: entry.params
}

export interface ScreenEntry {
  id: string;               // crypto.randomUUID()
  screen: ScreenName;
  params: Record<string, string>;
  breadcrumb: string;
  scrollPosition?: number;
}
```

Since `Workspaces` has `requiresRepo: false`, `params` may be empty `{}` or may include `owner`/`repo` if navigated from a repo context.

---

## 4. Keybinding System

### 4.1 Priority Levels

**File**: `apps/tui/src/providers/keybinding-types.ts` (lines 30-41)

```typescript
export const PRIORITY = {
  TEXT_INPUT: 1,  // Text fields (highest)
  MODAL: 2,      // Modals, overlays
  GOTO: 3,       // Go-to mode after 'g'
  SCREEN: 4,     // Screen-specific
  GLOBAL: 5,     // Always-active fallback
};
```

Dispatch: sorted by priority ascending (lower = higher priority), LIFO within same priority.

### 4.2 KeyHandler Interface

```typescript
export interface KeyHandler {
  key: string;          // Normalized key descriptor
  description: string;  // For help/status bar
  group: string;        // Group in help overlay
  handler: () => void;
  when?: () => boolean; // Predicate at dispatch time
}
```

### 4.3 useScreenKeybindings

**File**: `apps/tui/src/hooks/useScreenKeybindings.ts` (lines 1-55)

Registers a `PRIORITY.SCREEN` scope. Auto-generates status bar hints from the first 8 bindings unless custom `hints` param provided. Key descriptors are normalized. Handler refs are always fresh.

### 4.4 Global Keybindings

**File**: `apps/tui/src/components/GlobalKeybindings.tsx` — registers `q` (pop/quit), `escape` (pop), `ctrl+c` (force quit), `?` (help), `:` (command palette), `g` (go-to mode) at `PRIORITY.GLOBAL`.

**Important for `gg` handling**: The screen-level binding (PRIORITY.SCREEN = 4) fires BEFORE the global go-to handler (PRIORITY.GLOBAL = 5). So a `g` key at screen level will be caught first if the screen registers it. The spec calls for a `lastGPressRef` timestamp approach where the screen-level `g` handler checks for double-g within 500ms.

### 4.5 OverlayManager Modal Keybindings

**File**: `apps/tui/src/providers/OverlayManager.tsx` (lines 1-162)

When an overlay is opened, it registers a `PRIORITY.MODAL` scope with `escape` to close, and overrides status bar hints. The confirm overlay also accepts `y`/`n` keys. The delete confirmation modal in the workspace spec needs to either use this existing system or register its own MODAL-priority scope.

---

## 5. Layout and Responsive System

### 5.1 useLayout

**File**: `apps/tui/src/hooks/useLayout.ts` (lines 1-111)

```typescript
export interface LayoutContext {
  width: number;
  height: number;
  breakpoint: Breakpoint | null;  // null = unsupported (<80x24)
  contentHeight: number;          // height - 2 (header + status)
  sidebarVisible: boolean;
  sidebarWidth: string;
  modalWidth: string;             // "50%" | "60%" | "90%"
  modalHeight: string;
  sidebar: SidebarState;
}
```

Modal widths: `large → "50%"`, `standard → "60%"`, `null/minimum → "90%"`

### 5.2 Breakpoints

**File**: `apps/tui/src/types/breakpoint.ts`

```typescript
export type Breakpoint = "minimum" | "standard" | "large";
// <80 || <24 → null, <120 || <40 → "minimum", <200 || <60 → "standard", else → "large"
```

### 5.3 useResponsiveValue

**File**: `apps/tui/src/hooks/useResponsiveValue.ts` — Takes `ResponsiveValues<T>` object with `minimum`, `standard`, `large` keys plus optional `fallback`. Returns appropriate value for current breakpoint.

---

## 6. Loading System

### 6.1 useScreenLoading

**File**: `apps/tui/src/hooks/useScreenLoading.ts` (lines 1-203)

Options: `{ id, label, isLoading, error, onRetry }`

Returns: `{ signal, showSpinner, showSkeleton, showError, loadingError, retry, spinnerFrame }`

Key behaviors:
- 80ms spinner skip threshold (`SPINNER_SKIP_THRESHOLD_MS`)
- 30s timeout (`LOADING_TIMEOUT_MS`)
- AbortController for fetch cancellation
- Error classification: 401 → auth_error, 429 → rate_limited, 500+ → http_error, else → network
- Retry debounced at 1s

### 6.2 usePaginationLoading

**File**: `apps/tui/src/hooks/usePaginationLoading.ts` (lines 1-108)

Options: `{ screen, hasMore, fetchMore }`

Returns: `{ status, error, loadMore, retry, spinnerFrame }`

Deduplicates in-flight requests, handles pagination errors.

### 6.3 useOptimisticMutation

**File**: `apps/tui/src/hooks/useOptimisticMutation.ts` (lines 1-94)

Options: `{ id, entityType, action, mutate, onOptimistic, onRevert, onSuccess }`

Returns: `{ execute, isLoading }`

Applies optimistic update immediately, reverts on error with 5s status bar error. Mutation continues in background even if user navigates away.

---

## 7. Shared Components

### 7.1 FullScreenLoading

**File**: `apps/tui/src/components/FullScreenLoading.tsx` (lines 1-48)

Props: `{ spinnerFrame: string, label: string }`

Centered `{spinnerFrame} {label}` using `flexGrow={1}`, `justifyContent="center"`, `alignItems="center"`.

### 7.2 FullScreenError

**File**: `apps/tui/src/components/FullScreenError.tsx` (lines 1-52)

Props: `{ screenLabel: string, error: LoadingError }`

Shows `✗ Failed to load {screenLabel}` in error color, plus error summary.

### 7.3 PaginationIndicator

**File**: `apps/tui/src/components/PaginationIndicator.tsx` (lines 1-60)

Props: `{ status: PaginationStatus, spinnerFrame: string, error?: LoadingError }`

Shows `{spinnerFrame} Loading more…` when loading, `✗ Failed to load — R to retry` on error.

### 7.4 ActionButton

Exported from `apps/tui/src/components/index.ts` line 15.

---

## 8. Text Utilities

**File**: `apps/tui/src/util/text.ts` (lines 1-61)

```typescript
truncateRight(text, maxWidth)  // Truncates with "…" if exceeds
fitWidth(text, width, align)   // Pad or truncate to exact width
truncateText(text, maxLength)  // Same as truncateRight but handles maxLength < 1
wrapText(text, width)          // Word-wrap to width
truncateBreadcrumb(segments, maxWidth, separator)  // Smart left-truncation
```

---

## 9. Theme System

### 9.1 ThemeTokens

**File**: `apps/tui/src/theme/tokens.ts` (lines 1-263)

```typescript
interface ThemeTokens {
  primary: RGBA;   // Blue — focused items, links
  success: RGBA;   // Green — open, running, passed
  warning: RGBA;   // Yellow — pending, syncing, conflict
  error: RGBA;     // Red — failed, closed, rejected
  muted: RGBA;     // Gray — secondary text, metadata
  surface: RGBA;   // Dark gray — modal backgrounds
  border: RGBA;    // Gray — borders, separators
  // + 5 diff-specific tokens
}
```

### 9.2 statusToToken

Maps status strings to token names (line 209-256):
- `running` → `success`
- `pending`, `suspended` → `warning`
- `failed`, `stopped` → `error`

**Note**: The WorkspaceStatusBadge spec (dependency ticket) overrides this mapping: `suspended` → `muted`, `stopped` → `muted`.

### 9.3 TextAttributes

Line 175-184:
```typescript
export const TextAttributes = Object.freeze({
  BOLD: 1 << 0,      // SGR 1
  DIM: 1 << 1,       // SGR 2
  UNDERLINE: 1 << 2, // SGR 4
  REVERSE: 1 << 3,   // SGR 7  ← Used for focused row highlight
});
```

---

## 10. Auth System

**File**: `apps/tui/src/providers/AuthProvider.tsx`

```typescript
export interface AuthContextValue {
  readonly status: AuthStatus;  // "loading" | "authenticated" | "unauthenticated" | "expired" | "offline"
  readonly user: string | null;
  readonly tokenSource: AuthTokenSource | null;
  readonly apiUrl: string;
  readonly host: string;
  readonly token: string | null;
  readonly retry: () => void;
}
```

**useAuth** (`apps/tui/src/hooks/useAuth.ts`): `useContext(AuthContext)` with null check.

The spec notes `currentUserId: null` as a productionization stub — will need `useAuth().user` when `tui-auth-provider` is wired. Note that `user` is `string | null` (username), not a numeric ID.

---

## 11. SSE Provider

**File**: `apps/tui/src/providers/SSEProvider.tsx` (lines 1-16)

Currently a stub: `useSSE(channel)` returns `null`. The workspace SSE streaming (`useWorkspaceListStatusStream`) is a dependency ticket (`tui-workspace-status-stream`).

---

## 12. Telemetry

**File**: `apps/tui/src/lib/telemetry.ts` (lines 1-62)

```typescript
emit(name: string, properties?: Record<string, string | number | boolean>): void
```

Writes JSON to stderr when `CODEPLANE_TUI_DEBUG=true`. The spec calls for `emit("tui.workspaces.view", ...)` on mount.

---

## 13. Workspace Data Types

**File**: `specs/tui/packages/ui-core/src/types/workspaces.ts`

```typescript
export type WorkspaceStatus = "pending" | "starting" | "running" | "suspended" | "stopped" | "failed";

export interface Workspace {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  status: WorkspaceStatus;
  is_fork: boolean;
  parent_workspace_id?: string;
  freestyle_vm_id: string;
  persistence: string;
  ssh_host?: string;
  snapshot_id?: string;
  idle_timeout_seconds: number;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSSHInfo {
  workspace_id: string;
  session_id: string;
  vm_id: string;
  host: string;
  ssh_host: string;
  username: string;
  port: number;
  access_token: string;
  command: string;
}

export interface WorkspacesOptions {
  page?: number;
  perPage?: number;
  status?: WorkspaceStatus;
  enabled?: boolean;
}
```

**Important**: These types are in `specs/tui/` (spec-generated), not yet in the actual `packages/ui-core/`. The spec's dependency `tui-workspace-data-hooks` will create the actual hooks. This screen should define a local stub or import from the spec location.

---

## 14. E2E Test Infrastructure

### 14.1 Test Helpers

**File**: `e2e/tui/helpers.ts` (lines 1-491)

**`launchTUI(options)`**: Spawns TUI via `@microsoft/tui-test` + `node-pty` + `@xterm/headless`. Default: 120×40, `TERM=xterm-256color`, `COLORTERM=truecolor`.

**`TUITestInstance`** interface:
```typescript
interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;   // Resolved via resolveKey()
  sendText(text: string): Promise<void>;        // Literal text input
  waitForText(text, timeoutMs?): Promise<void>; // Polls every 100ms
  waitForNoText(text, timeoutMs?): Promise<void>;
  snapshot(): string;                           // Full terminal buffer
  getLine(lineNumber: number): string;          // 0-indexed
  resize(cols, rows): Promise<void>;            // 200ms settle
  terminate(): Promise<void>;
  rows: number;
  cols: number;
}
```

**Key resolution** (line 195-266): `"Enter"` → press Enter, `"Escape"` → press Escape, `"Up"/"Down"` → special terminal methods, `"shift+G"` → press `G` with shift modifier, `"ctrl+d"` → keyCtrlD special method.

**Timeouts**: Wait: 10s, Launch: 15s, Poll: 100ms.

### 14.2 Workspace E2E Helpers

**File**: `specs/tui/e2e/tui/helpers/workspaces.ts` (lines 1-352)

**Fixtures**: `WORKSPACE_FIXTURES` with 6 states (running, suspended, starting, failed, pending, stopped). Each has deterministic IDs and timestamps.

**`launchTUIWithWorkspaceContext(options)`**: Launches with `--screen workspaces --repo acme/api` and waits for "Workspaces" text.

**`waitForStatusTransition(terminal, from, to, options)`**: Polls for status text change with configurable timeout.

**`assertWorkspaceRow(terminal, lineNumber, expected)`**: Asserts name, status, focused (reverse video), contains/notContains on a specific line.

**`createSSEInjectionFile()`**: Creates temp file for SSE event injection in tests.

### 14.3 Test Config

**File**: `e2e/tui/bunfig.toml` — `[test] timeout = 30000`

### 14.4 Existing Workspace Tests

**File**: `specs/tui/e2e/tui/workspaces.test.ts` — Contains tests for `WorkspaceStatusBadge` (dependency ticket). The workspace list screen tests will be appended to this file.

---

## 15. Existing Screen Patterns (Reference Implementations)

### 15.1 PlaceholderScreen

**File**: `apps/tui/src/screens/PlaceholderScreen.tsx` (lines 1-22)

Minimal implementation: receives `ScreenComponentProps`, renders screen name and params.

### 15.2 Agents Screen Directory

**Path**: `apps/tui/src/screens/Agents/`

Structure:
```
Agents/
├── types.ts               # MessageRole, MessagePart, AgentMessage, Breakpoint
├── components/
│   ├── MessageBlock.tsx
│   ├── ToolBlock.tsx
│   └── index.ts           # Barrel re-exports
└── utils/
    └── formatTimestamp.ts  # Breakpoint-aware relative time formatting
```

This is the most developed screen directory but has no root screen component yet (still uses PlaceholderScreen).

### 15.3 Key Pattern: formatTimestamp

**File**: `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` — breakpoint-aware relative time: minimum hides timestamp, standard shows compact (`3m`, `2h`, `5d`), large shows verbose (`3 minutes ago`).

---

## 16. Dependency Status Summary

| Dependency | Status | Impact on Implementation |
|---|---|---|
| `tui-workspace-data-hooks` | 🔜 Not implemented | `useWorkspaces()`, `useSuspendWorkspace()`, `useResumeWorkspace()`, `useDeleteWorkspace()`, `useWorkspaceSSH()` — all need stubs |
| `tui-workspace-screen-scaffold` | ✅ Partial | ScreenName enum entries exist; go-to binding exists; deep-link exists; registry uses PlaceholderScreen |
| `tui-workspace-status-badge` | 🔜 Not implemented | `WorkspaceStatusBadge` component — need temporary inline rendering |
| `tui-workspace-status-stream` | 🔜 Not implemented | `useWorkspaceListStatusStream` hook — need stub |
| `tui-workspace-e2e-helpers` | ✅ In specs/tui | Fixtures, launchTUIWithWorkspaceContext, assertWorkspaceRow ready |

---

## 17. Files to Create (13 new files)

```
apps/tui/src/screens/Workspaces/
├── index.ts                                # Barrel export
├── WorkspaceListScreen.tsx                 # Root screen component
├── types.ts                                # StatusFilter, ColumnConfig, WorkspaceRowProps
├── constants.ts                            # PAGE_SIZE, MEMORY_CAP, STATUS_FILTER_CYCLE, COLUMNS
├── components/
│   ├── WorkspaceRow.tsx                    # Single row
│   ├── WorkspaceColumnHeaders.tsx          # Column header row
│   ├── WorkspaceFilterToolbar.tsx          # Filter toolbar
│   ├── WorkspaceEmptyState.tsx             # Empty/no-results state
│   └── DeleteConfirmationOverlay.tsx       # Delete confirmation modal
└── hooks/
    ├── useWorkspaceListState.ts            # Focus, filter, selection, pagination state
    ├── useWorkspaceListKeybindings.ts      # All screen keybindings
    ├── useWorkspaceActions.ts              # Suspend/resume/delete/SSH orchestration
    └── useWorkspaceColumns.ts             # Responsive column layout
```

## 18. Files to Modify (1 file)

```
apps/tui/src/router/registry.ts   # Replace PlaceholderScreen → WorkspaceListScreen (lines 29-34)
```

## 19. Test File

```
e2e/tui/workspaces.test.ts        # Append 120 tests (4 describe blocks)
```

---

## 20. Import Map for New Files

All imports that new files will use, with exact source paths:

```typescript
// From router
import type { ScreenComponentProps } from "../../router/types.js";
import { ScreenName } from "../../router/types.js";

// From hooks
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useScreenLoading } from "../../hooks/useScreenLoading.js";
import { useOptimisticMutation } from "../../hooks/useOptimisticMutation.js";
import { usePaginationLoading } from "../../hooks/usePaginationLoading.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useAuth } from "../../hooks/useAuth.js";

// From providers
import { useNavigation } from "../../providers/NavigationProvider.js";
import { PRIORITY, type KeyHandler, type StatusBarHint } from "../../providers/keybinding-types.js";

// From components
import { FullScreenLoading } from "../../components/FullScreenLoading.js";
import { FullScreenError } from "../../components/FullScreenError.js";
import { PaginationIndicator } from "../../components/PaginationIndicator.js";

// From util
import { truncateRight, fitWidth } from "../../util/text.js";

// From theme
import { TextAttributes } from "../../theme/tokens.js";

// From lib
import { emit } from "../../lib/telemetry.js";

// From OpenTUI
import { useTerminalDimensions, useOnResize } from "@opentui/react";

// From React
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
```

---

## 21. Key Implementation Patterns to Follow

### 21.1 Screen Component Pattern

```typescript
export function WorkspaceListScreen({ entry, params }: ScreenComponentProps) {
  // 1. Data hooks (stubs until dependency complete)
  // 2. useScreenLoading() for spinner/error states
  // 3. useWorkspaceListState() for local state
  // 4. useWorkspaceColumns() for responsive layout
  // 5. useWorkspaceActions() for mutations
  // 6. useWorkspaceListKeybindings() for keybindings
  // 7. emit() telemetry on mount
  // 8. Conditional rendering: spinner → error → empty → list
}
```

### 21.2 Focused Row Pattern

From spec: `attributes={7}` (ANSI reverse video = `TextAttributes.REVERSE = 1 << 3 = 8`, but spec says `7` which is ANSI SGR 7). Use `attributes={TextAttributes.REVERSE}` which equals `8`, or the raw `7` for SGR reverse. Tests check for `\x1b[7m` in terminal output.

### 21.3 Keybinding Pattern with `when` Predicates

```typescript
useScreenKeybindings([
  { key: "j", description: "Down", group: "Navigation", handler: moveDown,
    when: () => !searchActive && !showDeleteConfirm && !showSpinner },
  // ...
]);
```

### 21.4 Optimistic Mutation Pattern

```typescript
const suspendMutation = useOptimisticMutation({
  id: `workspace-suspend-${workspaceId}`,
  entityType: "workspace",
  action: "suspend",
  mutate: async (args) => { /* call API */ },
  onOptimistic: (args) => { /* update local status to "suspending" */ },
  onRevert: (args) => { /* restore original status */ },
  onSuccess: (args) => { emit("tui.workspace.suspended", { workspaceId }) },
});
```

### 21.5 Delete Confirmation via Custom Modal

The spec calls for a custom `DeleteConfirmationOverlay` component (absolute-positioned) rather than using the OverlayManager's built-in confirm dialog. This is because the workspace delete overlay has specific layout requirements (50%/90% width based on breakpoint) and custom keybindings (`y`/`n`/`Esc`).

The overlay should register its own `PRIORITY.MODAL` scope to trap focus.

### 21.6 Column Layout Pattern

The `COLUMNS` config in constants.ts maps breakpoints to column definitions. At `minimum`, only status icon + name + age are shown. At `standard`, adds status label, owner, idle timeout. At `large`, adds workspace ID, suspended-at, created-at.

Flexible column (`width: -1`) fills remaining space.

---

## 22. Critical Implementation Notes

1. **No existing screen implementations to copy from** — All 36 screens currently use `PlaceholderScreen`. The Agents directory has sub-components but no root screen. This will be the first real screen implementation.

2. **Navigation import path** — `useNavigation()` is in `providers/NavigationProvider.tsx`, NOT in a separate hook file. Import from `"../../providers/NavigationProvider.js"`.

3. **Data hooks are stubs** — All `@codeplane/ui-core` workspace hooks are not yet implemented. The screen must work with stub data that returns loading state, then empty list, then mock data for development.

4. **SSE is a stub** — `useSSE()` returns `null`. The `useWorkspaceListStatusStream` hook doesn't exist yet.

5. **WorkspaceStatusBadge doesn't exist yet** — Need temporary inline `●` rendering with `statusToToken()` from `theme/tokens.ts` until the dependency ticket is complete.

6. **Tests should be left failing** — Per project memory: "Don't skip/comment tests that fail due to unimplemented backends; let them fail naturally."

7. **Workspace type location** — The `Workspace` type is defined in `specs/tui/packages/ui-core/src/types/workspaces.ts` but may not be importable at `@codeplane/ui-core`. The types.ts file should define a local type or use a conditional import.

8. **`contentHeight` from useLayout** — The screen renders inside AppShell's content area which is `flexGrow={1}`. The screen should use `useLayout().contentHeight` for explicit height calculations when needed.

9. **OSC 52 clipboard** — SSH copy uses `\x1b]52;c;{base64}\x07` escape sequence written to `process.stdout`. Not all terminals support this.

10. **`formatRelativeTime` for Age column** — Needs a local utility similar to `Agents/utils/formatTimestamp.ts` but with max 4-char output (`now`, `3m`, `2h`, `5d`, `1mo`, `2y`).