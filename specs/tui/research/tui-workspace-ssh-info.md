# Research: `tui-workspace-ssh-info` — SSH Connection Info Panel with Token Countdown

## 1. Target File Inventory

### Files to Create
| File | Type | Purpose |
|---|---|---|
| `apps/tui/src/hooks/useTokenCountdown.ts` | New hook | Token TTL countdown with 1-second tick, formatted display, color transitions, expiry callback |
| `apps/tui/src/components/SSHInfoPlaceholder.tsx` | New component | Status-appropriate placeholder messages for non-running workspaces |
| `apps/tui/src/components/WorkspaceSSHPanel.tsx` | New component | Primary SSH info panel with fields, copy handlers, refresh logic, error formatting, telemetry |
| `e2e/tui/workspaces.test.ts` | New test file | 50 E2E tests for TUI_WORKSPACE_SSH_INFO feature |

### Files to Modify
| File | Change |
|---|---|
| `apps/tui/src/components/index.ts` (line ~13) | Append exports for `WorkspaceSSHPanel`, `SSHInfoPlaceholder` |
| `apps/tui/src/hooks/index.ts` (line ~27) | Append exports for `useTokenCountdown`, `formatTokenTTL`, `getTokenColorKey`, `TokenCountdownState` |

---

## 2. Existing Implementation Patterns — Exact File Paths & Line Numbers

### 2.1 Theme Tokens
**File:** `apps/tui/src/hooks/useTheme.ts` (lines 1-30)
- `useTheme()` returns `Readonly<ThemeTokens>` — must be called inside `<ThemeProvider>`
- Returns `context.tokens` from `ThemeContext`

**File:** `apps/tui/src/theme/tokens.ts` (lines 13-41)
- `ThemeTokens` interface has: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border` (all `RGBA`) plus diff tokens
- Token countdown needs `theme.success` (>120s), `theme.warning` (30-120s), `theme.error` (<30s)
- `statusToToken()` (lines 209-256) maps status strings to color token names — useful reference for workspace status mapping
- `TextAttributes.BOLD = 1 << 0` (line 176) — used for `attributes={1}` for bold text rendering

### 2.2 Layout & Breakpoints
**File:** `apps/tui/src/hooks/useLayout.ts` (lines 1-110)
- `useLayout()` returns `LayoutContext` with `width`, `height`, `breakpoint`, `contentHeight`, `sidebarVisible`, `sidebarWidth`, `modalWidth`, `modalHeight`, `sidebar`
- `Breakpoint = "minimum" | "standard" | "large"` or `null` (unsupported)
- Uses `useTerminalDimensions()` from `@opentui/react` and `getBreakpoint()` from `../types/breakpoint.js`

**File:** `apps/tui/src/types/breakpoint.ts` (lines 1-33)
- `getBreakpoint(cols, rows)` — `<80|<24` → `null`, `<120|<40` → `"minimum"`, `<200|<60` → `"standard"`, else → `"large"`
- Uses OR for dimension downgrade (if EITHER dimension is below threshold)

### 2.3 Spinner
**File:** `apps/tui/src/hooks/useSpinner.ts` (lines 1-177)
- `useSpinner(active: boolean): string` — returns current frame character or `""`
- Global singleton — all active spinners are frame-synchronized
- Uses OpenTUI Timeline engine, not setInterval (80ms braille frames)
- Per-caller gating: returns `""` when caller's `active` is false even if other spinners are running

### 2.4 Screen Keybindings
**File:** `apps/tui/src/hooks/useScreenKeybindings.ts` (lines 1-55)
- `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void`
- Pushes `PRIORITY.SCREEN` scope on mount, pops on unmount
- Auto-generates status bar hints from first 8 bindings if `hints` not provided
- Uses `bindingsRef` pattern to keep handlers fresh without re-registering scope

**File:** `apps/tui/src/providers/keybinding-types.ts` (lines 1-89)
- `KeyHandler` interface: `key`, `description`, `group`, `handler`, `when?` (optional predicate)
- `PRIORITY` enum: `TEXT_INPUT=1`, `MODAL=2`, `GOTO=3`, `SCREEN=4`, `GLOBAL=5`
- `StatusBarHint` interface: `keys`, `label`, `order?`
- `KeybindingScope` interface: `id`, `priority`, `bindings` (Map), `active`

### 2.5 Key Normalization
**File:** `apps/tui/src/providers/normalize-key.ts` (lines 1-74)
- `normalizeKeyEvent(event)` — converts KeyEvent to normalized string descriptor
- `normalizeKeyDescriptor(descriptor)` — normalizes string descriptor for consistent lookup
- Single uppercase letters preserved as-is ("G" stays "G")
- Shift+printable → uppercase (e.g., shift+r → "R")
- Ctrl+key → "ctrl+c" etc.

### 2.6 Truncation Utilities
**File:** `apps/tui/src/util/truncate.ts` (lines 1-133)
- `truncateText(text, maxWidth)` — ellipsis from right, appends "…" (U+2026, width=1)
- `truncateLeft(text, maxWidth)` — ellipsis from left (for breadcrumbs)
- `wrapText(text, maxWidth)` — wrap at word boundaries with hard-break for long words

**File:** `apps/tui/src/util/text.ts` (lines 1-60)
- Alternative `truncateText()` and `truncateRight()` implementations exist here too
- `truncateRight(text, maxWidth)` at line 24 — used by StatusBar and FullScreenLoading
- Both files export similar functions — spec's `truncateText` import from `../util/truncate.js` is correct

### 2.7 Telemetry
**File:** `apps/tui/src/lib/telemetry.ts` (lines 1-61)
- `emit(name: string, properties?: Record<string, string | number | boolean>): void`
- Writes JSON to stderr when `CODEPLANE_TUI_DEBUG="true"`
- `TelemetryEvent` interface: `name`, `properties`, `timestamp` (ISO 8601)
- `initTelemetry(ctx)` called once at startup; `updateTelemetryDimensions()` on resize

### 2.8 Component Pattern Reference: StatusBar
**File:** `apps/tui/src/components/StatusBar.tsx` (lines 1-96)
- Demonstrates theme + layout + hints integration
- Uses `useLayout()`, `useTheme()`, `useAuth()`, `useLoading()`, `useStatusBarHints()`
- Auth confirmation pattern: `useState`+`useEffect`+`setTimeout` for transient 3s feedback (lines 23-33)
- Renders hints via `displayedHints.map()` with `<text fg={theme.primary}>` for keys and `<text fg={theme.muted}>` for labels
- Box-based layout: `<box flexDirection="row" height={1} width="100%" borderColor={theme.border} border={["top"]}>`

### 2.9 Component Pattern Reference: FullScreenLoading
**File:** `apps/tui/src/components/FullScreenLoading.tsx` (lines 1-48)
- Takes `spinnerFrame` and `label` as props
- Uses `useLayout()` for `width` and `contentHeight`
- Truncates label to fit terminal width
- Renders spinner with `<span fg={theme.primary}>{spinnerFrame}</span>`

### 2.10 Component Pattern Reference: FullScreenError
**File:** `apps/tui/src/components/FullScreenError.tsx` (lines 1-52)
- Takes `screenLabel` and `error` (LoadingError) as props
- Error line: `attributes={1}` (bold) + `fg={theme.error}`
- Summary line: `fg={theme.muted}`

### 2.11 Component Pattern Reference: ActionButton
**File:** `apps/tui/src/components/ActionButton.tsx` (lines 1-58)
- Uses `useTheme()` and `useLoading()` for spinner
- Disabled styling: `fg={theme.muted}` and `borderColor={theme.muted}`
- Bold: `attributes={1}` when not disabled

### 2.12 Components Barrel Export
**File:** `apps/tui/src/components/index.ts` (lines 1-13)
```typescript
export { AppShell } from "./AppShell.js";
export { HeaderBar } from "./HeaderBar.js";
export { StatusBar } from "./StatusBar.js";
export { ErrorBoundary } from "./ErrorBoundary.js";
export { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";
export { GlobalKeybindings } from "./GlobalKeybindings.js";
export { FullScreenLoading } from "./FullScreenLoading.js";
export { FullScreenError } from "./FullScreenError.js";
export { SkeletonList } from "./SkeletonList.js";
export { SkeletonDetail } from "./SkeletonDetail.js";
export { PaginationIndicator } from "./PaginationIndicator.js";
export { ActionButton } from "./ActionButton.js";
export { OverlayLayer } from "./OverlayLayer.js";
```
- Uses `.js` extensions (ESM) — new exports must follow same pattern

### 2.13 Hooks Barrel Export
**File:** `apps/tui/src/hooks/index.ts` (lines 1-27)
- Uses `.js` extensions (ESM) pattern consistently
- Exports both value exports and `type` exports
- Groups: data hooks, layout hooks, auth, loading, navigation, repo-specific
- New `useTokenCountdown` export should be appended following same pattern

---

## 3. Dependency Specs (Not Yet Implemented)

### 3.1 useWorkspaceSSH Hook
**File:** `specs/tui/packages/ui-core/src/hooks/workspaces/useWorkspaceSSH.ts`
- Returns: `{ sshInfo, isLoading, error, refetch, tokenExpiresAt, isTokenExpired }`
- `sshInfo` is `WorkspaceSSHInfo | null`
- `tokenExpiresAt` is `number | null` (epoch ms, set to `Date.now() + 5min` on fetch success)
- `refetch()` increments a counter to trigger re-fetch effect
- API endpoint: `/api/repos/{owner}/{repo}/workspaces/{workspaceId}/ssh`
- **Known bugs documented in spec:**
  1. Import path `useAPIClient` from wrong location (`../../client/APIClientProvider.js` vs `../../client/context.js`)
  2. Destructures `{ fetch }` but `useAPIClient()` returns `APIClient` object (confirmed — see `apps/tui/src/providers/APIClientProvider.tsx` line 30: returns `ctx` which is `{ baseUrl, token }`)
  3. Manual `JSON.stringify()` causes double-serialization

### 3.2 useClipboard Hook
**File:** `specs/tui/apps/tui/src/hooks/useClipboard.ts`
- Returns: `{ copy, status, fallbackText, clearFallback, provider }`
- `copy(text: string): Promise<ClipboardResult>` (not `Promise<boolean>` as spec says)
- `status`: `"idle" | "copying" | "copied" | "failed" | "unavailable"`
- Auto-resets status after 2s except "unavailable"
- Depends on `../lib/clipboard.js` for platform detection

**Note:** The eng spec's `WorkspaceSSHPanel` takes `copyToClipboard: (text: string) => Promise<boolean>` and `clipboardSupported: boolean` as props — this abstracts away the `useClipboard()` return shape. The parent screen would adapt.

### 3.3 WorkspaceSSHInfo Type
**File:** `specs/tui/packages/ui-core/src/types/workspaces.ts` (lines 46-56)
```typescript
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
```
**Note:** The eng spec's `WorkspaceSSHConnectionInfo` interface (in WorkspaceSSHPanel) uses `ssh_host`, `port`, `username`, `command`, `access_token?`, `workspace_id?`, `vm_id?` — subtly different from the API type. The component's interface makes some fields optional and omits `session_id` and `host`.

### 3.4 Workspace E2E Helpers
**File:** `specs/tui/e2e/tui/helpers/workspaces.ts`
- `WORKSPACE_IDS` — deterministic UUIDs for each status (running, suspended, starting, failed, pending, stopped)
- `WORKSPACE_FIXTURES` — pre-built `Workspace` objects
- `launchTUIWithWorkspaceContext(options)` — launches TUI pre-navigated to workspace screen
- `waitForStatusTransition(terminal, from, to, options)` — polls for SSE-driven transitions
- `createSSEInjectionFile()` — writes mock SSE events to a temp file for `CODEPLANE_SSE_INJECT_FILE`
- `launchTUIWithSSEInjection(options)` — combined launch + SSE injection
- `assertWorkspaceRow()` — ANSI-aware row assertions with focused state detection
- `stripAnsi()`, `hasReverseVideo()` — ANSI utilities

### 3.5 useWorkspaceStatusStream
**File:** `specs/tui/apps/tui/src/hooks/useWorkspaceStatusStream.ts`
- Returns: `{ status, connectionState, lastEvent, error, reconcile }`
- SSE ticket auth via POST `/api/auth/sse-ticket`
- Connection states: `"idle" | "connecting" | "connected" | "reconnecting" | "degraded" | "disconnected"`
- Exponential backoff: 1s initial, 2× multiplier, 30s max, 20 max attempts

---

## 4. Router & Screen Registration

**File:** `apps/tui/src/router/types.ts`
- `ScreenName.WorkspaceDetail = "WorkspaceDetail"` (line 30)
- `ScreenName.Workspaces = "Workspaces"` (line 5)
- `ScreenComponentProps` has `entry: ScreenEntry` and `params: Record<string, string>`
- `NavigationContext` has `push`, `pop`, `replace`, `reset`, `repoContext`, `canGoBack`

**File:** `apps/tui/src/router/registry.ts` (lines 143-148)
- `WorkspaceDetail` currently uses `PlaceholderScreen`
- `requiresRepo: false` — workspace screens don't require repo context
- `breadcrumbLabel: (p) => (p.workspaceId ? p.workspaceId.slice(0, 8) : "Workspace")`

---

## 5. SSE & Streaming Infrastructure

**File:** `apps/tui/src/providers/SSEProvider.tsx` (lines 1-16)
- **Currently a stub** — `SSEContext` wraps children with `null` value
- `useSSE(channel)` returns `null`
- Real SSE adapter is spec-only at `specs/tui/apps/tui/src/streaming/WorkspaceSSEAdapter.ts`

**File:** `apps/tui/src/providers/APIClientProvider.tsx` (lines 1-34)
- **Currently a mock** — `APIClient` is just `{ baseUrl, token }`
- `useAPIClient()` returns the mock client
- No `fetch()` method on the client — only `baseUrl` and `token` properties

---

## 6. E2E Test Infrastructure

**File:** `e2e/tui/helpers.ts` (lines 1-491)
- `launchTUI(options?)` returns `TUITestInstance` with full PTY via `@microsoft/tui-test`
- `TUITestInstance` methods: `sendKeys(...keys)`, `sendText(text)`, `waitForText(text, timeout?)`, `waitForNoText(text, timeout?)`, `snapshot()`, `getLine(lineNumber)`, `resize(cols, rows)`, `terminate()`
- `TERMINAL_SIZES`: `minimum: {80, 24}`, `standard: {120, 40}`, `large: {200, 60}`
- `createMockAPIEnv(options?)` — sets `CODEPLANE_API_URL`, `CODEPLANE_TOKEN`, optional `CODEPLANE_DISABLE_SSE`
- `createTestCredentialStore(token?)` — temp credential store file with cleanup
- Default wait timeout: 10s; default launch timeout: 15s; poll interval: 100ms
- `run(cmd, opts)` and `bunEval(expression)` for subprocess verification
- Uses dynamic import for `@microsoft/tui-test` to avoid top-level dependency issues

**Existing test files:**
- `e2e/tui/app-shell.test.ts` — 30+ tests for package scaffold, tsconfig, module resolution
- `e2e/tui/repository.test.ts` — 40+ tests for hook structure and compilation
- `e2e/tui/diff.test.ts`, `e2e/tui/agents.test.ts`, `e2e/tui/keybinding-normalize.test.ts`, `e2e/tui/util-text.test.ts`
- **No `e2e/tui/workspaces.test.ts` yet** — must be created

**Import pattern from existing tests:**
```typescript
import { describe, test, expect, afterEach } from "bun:test"
import { launchTUI, TERMINAL_SIZES, createMockAPIEnv } from "./helpers.ts"
```

---

## 7. Feature Registry

**File:** `specs/tui/features.ts` (lines 106-113)
```typescript
TUI_WORKSPACES: [
  "TUI_WORKSPACE_LIST_SCREEN",
  "TUI_WORKSPACE_DETAIL_VIEW",
  "TUI_WORKSPACE_CREATE_FORM",
  "TUI_WORKSPACE_SUSPEND_RESUME",
  "TUI_WORKSPACE_SSH_INFO",       // ← THIS TICKET
  "TUI_WORKSPACE_STATUS_STREAM",
]
```

---

## 8. Key Implementation Decisions & Risks

### 8.1 Props-based Component vs Hook-internal
The `WorkspaceSSHPanel` receives all data as props from the parent screen. This is the correct pattern because:
- `useScreenKeybindings` operates at screen level (PRIORITY.SCREEN), not component level
- The parent `WorkspaceDetailScreen` needs to coordinate keybindings across SSH panel, workspace actions, scroll, etc.
- The component is testable in isolation without hooking into real API/SSE

### 8.2 Timer Approach: setInterval vs useTimeline
The spec uses `setInterval` at 1s for the countdown, NOT OpenTUI's `useTimeline`/Timeline engine. This is correct because:
- Timeline is optimized for sub-frame animation (80ms ticks) — wasteful for 1-second updates
- `useSpinner` already uses Timeline for its animation loop (different use case)
- A simple `setInterval` at 1s is the most appropriate for a countdown timer

### 8.3 `truncateText` Import Ambiguity
There are TWO `truncateText` functions:
1. `apps/tui/src/util/truncate.ts:25` — robust, handles edge cases (maxWidth<1, maxWidth===1)
2. `apps/tui/src/util/text.ts:36` — simpler, similar behavior

The spec imports from `../util/truncate.js` — this is correct per the spec's codebase ground truth table.

### 8.4 APIClient Mock State
The current `APIClientProvider` at `apps/tui/src/providers/APIClientProvider.tsx` is a mock that only provides `{ baseUrl, token }`. The real `useWorkspaceSSH` hook calls `fetch()` which doesn't exist on the mock. This is documented in the spec as a known bug in the dependency ticket `tui-workspace-data-hooks`.

### 8.5 SSE Provider Stub
The `SSEProvider` at `apps/tui/src/providers/SSEProvider.tsx` is a stub returning `null`. Real-time workspace status transitions won't work until the `tui-workspace-status-stream` dependency is complete. The SSH panel component degrades gracefully — it just requires manual navigation to see status changes.

### 8.6 Bold Text Attribute
OpenTUI uses `attributes={1}` for bold (not a `bold` JSX prop). The spec code uses `<text bold>` which may not be correct. Reference: `FullScreenError.tsx` line 45 uses `<text attributes={1} fg={theme.error}>`. However, some OpenTUI docs suggest `bold` is a shorthand — need to verify.

### 8.7 Box Border Syntax
OpenTUI's `<box>` accepts `border` as boolean or array of sides. Reference: `StatusBar.tsx` line 62 uses `border={["top"]}` for top-only border.

### 8.8 WorkspaceSSHConnectionInfo vs WorkspaceSSHInfo Type Mismatch
The spec defines `WorkspaceSSHConnectionInfo` in the component with optional fields (`access_token?`, `workspace_id?`, `vm_id?`) while the API type `WorkspaceSSHInfo` has them as required. The parent screen should map between these types.

---

## 9. Exact Lines to Modify in Existing Files

### 9.1 `apps/tui/src/components/index.ts`
Append after line 13:
```typescript
export { WorkspaceSSHPanel } from "./WorkspaceSSHPanel.js";
export type { WorkspaceSSHPanelProps, WorkspaceSSHConnectionInfo } from "./WorkspaceSSHPanel.js";
export { SSHInfoPlaceholder } from "./SSHInfoPlaceholder.js";
export type { SSHInfoPlaceholderProps } from "./SSHInfoPlaceholder.js";
```

### 9.2 `apps/tui/src/hooks/index.ts`
Append after line 27 (after the repo-tree-types exports):
```typescript
export { useTokenCountdown, formatTokenTTL, getTokenColorKey } from "./useTokenCountdown.js";
export type { TokenCountdownState } from "./useTokenCountdown.js";
```

---

## 10. Test Infrastructure Notes

- `e2e/tui/workspaces.test.ts` does NOT exist yet — must be created from scratch
- Import pattern: `from "./helpers.ts"` (uses `.ts` extension in test files, NOT `.js`)
- Workspace-specific helpers at `specs/tui/e2e/tui/helpers/workspaces.ts` are also spec-only (not implemented)
- Tests should be left failing if backend features are unimplemented (per project memory: `feedback_failing_tests.md`)
- Token expiry tests have 310s timeouts (5min TTL + buffer) — inherently slow
- SSE integration tests have 30-45s timeouts for status transitions
- `toMatchSnapshot()` is available from `bun:test`'s `expect` for golden-file comparisons

---

## 11. Loading State Constants

**File:** `apps/tui/src/loading/constants.ts`
- `LOADING_TIMEOUT_MS = 30_000` — full-screen loading timeout
- `SPINNER_SKIP_THRESHOLD_MS = 80` — skip spinner if data arrives quickly
- `STATUS_BAR_ERROR_DURATION_MS = 5_000` — transient error display
- `RETRY_DEBOUNCE_MS = 1_000` — retry debounce interval
- `STATUS_BAR_ERROR_PADDING = 20` — max chars for status bar error

**File:** `apps/tui/src/loading/types.ts`
- `LoadingError` interface: `type` (network/timeout/http_error/auth_error/rate_limited), `httpStatus?`, `summary`
- `ScreenLoadingStatus`: idle | loading | error | timeout

---

## 12. OpenTUI Component API Reference (from usage patterns)

### `<box>` props observed:
- `flexDirection="column"` / `"row"`
- `height={1}` / `height={contentHeight}` / `height="100%"`
- `width="100%"` / `width={labelWidth}`
- `paddingX={1}` / `paddingX={2}`
- `gap={1}` / `gap={2}`
- `border={true}` / `border={["top"]}`
- `borderColor={theme.border}`
- `flexGrow={1}`
- `justifyContent="center"` / `"space-between"`
- `alignItems="center"`
- `padding={1}` / `marginTop={1}`
- `minWidth={n}`

### `<text>` props observed:
- `fg={theme.primary}` (RGBA object)
- `attributes={1}` (bold)
- `bold` (shorthand — may work in some OpenTUI versions)
- `color="gray"` (string fallback)
- `underline` (attribute shorthand)

### `<span>` observed:
- Used inside `<text>` for inline styling: `<span fg={theme.primary}>{content}</span>`

### No `<scrollbox>`, `<input>`, `<select>` usage found in existing components (placeholder-only app)

---

## 13. Summary: Implementation Readiness

### Ready to implement now:
- `useTokenCountdown` hook — standalone, no external dependencies
- `SSHInfoPlaceholder` component — uses only `useTheme()` and `useSpinner()` which are implemented
- `WorkspaceSSHPanel` component — props-based, no dependency hooks needed
- Barrel export updates — trivial appends
- `e2e/tui/workspaces.test.ts` — test file structure and test cases

### Blocked by dependencies:
- End-to-end functionality requires `useWorkspaceSSH` (from `tui-workspace-data-hooks`)
- Clipboard integration requires `useClipboard` (from `tui-clipboard-util`)
- SSE status streaming requires `useWorkspaceStatusStream` (from `tui-workspace-status-stream`)
- Workspace E2E helpers must exist for advanced test scenarios
- The `APIClient` mock must be enhanced with a `fetch()` or `request()` method

### Tests that will fail:
- All 50 E2E tests will fail because `WorkspaceDetail` screen is still `PlaceholderScreen`
- Tests that depend on API responses will fail because the mock API client lacks `fetch()`
- Tests should be left failing per project policy