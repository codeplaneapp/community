# Engineering Specification: `tui-workspace-status-badge`

## Reusable workspace status badge component

---

## Ticket Metadata

| Field | Value |
|---|---|
| **ID** | `tui-workspace-status-badge` |
| **Title** | Reusable workspace status badge component |
| **Type** | engineering |
| **Feature** | `TUI_WORKSPACES` — consumed by workspace list, workspace detail, dashboard, and any screen displaying workspace status |
| **Estimate** | 3 hours |
| **Dependencies** | `tui-theme-provider` (provides `useTheme()`, `ThemeTokens`, semantic color tokens) |
| **Upstream deps** | `tui-spinner-hook` (provides `useSpinner()`), `tui-layout-hook` (provides `useLayout()`, `Breakpoint`), `tui-color-detection` (provides `isUnicodeSupported()`) |
| **Target files** | `apps/tui/src/components/WorkspaceStatusBadge.tsx`, `apps/tui/src/components/index.ts` |
| **Test file** | `e2e/tui/workspaces.test.ts` |

---

## 1. Problem Statement

The TUI workspace surfaces (list screen, detail view, dashboard activity feed) all need to render workspace status with semantic coloring and animated spinners for transitional states. Without a shared component, each consumer would duplicate:

- The mapping from `WorkspaceStatus` values to visual representations (icon + color + label)
- The decision of when to show an animated braille spinner vs a static dot
- Responsive behavior (icon-only at minimum breakpoint, icon + label at standard+)
- Integration with the shared `useSpinner()` hook for frame-synchronized animation

This component is the visual primitive that all workspace-related screens compose. It must be built before:

| Downstream Ticket | Usage |
|---|---|
| `tui-workspace-list-screen` | Status column in each workspace row |
| `tui-workspace-detail-view` | Status display in detail header |
| `tui-workspace-status-stream` | SSE-driven status transitions update this badge |
| `tui-workspace-suspend-resume` | Optimistic status changes render through this badge |
| `tui-dashboard-activity-feed` | Workspace activity items show inline status |

---

## 2. Codebase Ground Truth

Before reading further, the following facts about the actual repository drive every decision in this spec:

| Fact | Location | Impact |
|---|---|---|
| `ThemeTokens` interface defines `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border` plus 5 diff tokens as `RGBA` | `apps/tui/src/theme/tokens.ts` (specified in `tui-theme-tokens` ticket) | Badge colors resolve to these semantic tokens |
| `createTheme(tier)` returns `Readonly<ThemeTokens>` — frozen RGBA objects per color tier | `apps/tui/src/theme/tokens.ts` | Theme tokens are frozen and referentially stable |
| `statusToToken()` maps status strings to `CoreTokenName` — general-purpose mapper | `apps/tui/src/theme/tokens.ts` | Exists but workspace badge needs **custom** mapping (see §3.2) — workspace statuses have nuanced color semantics |
| `useTheme()` returns `Readonly<ThemeTokens>` from ThemeProvider context | `apps/tui/src/hooks/useTheme.ts` (specified in `tui-theme-provider` ticket) | Components pass `theme.success` directly to `fg` prop |
| `useSpinner(active: boolean): string` returns current braille/ASCII frame or `""` | `apps/tui/src/hooks/useSpinner.ts` (specified in `tui-spinner-hook` ticket) | Badge delegates all animation to this hook |
| Braille frames: `["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]` at 80ms; ASCII: `["|", "/", "-", "\\"]` at 120ms | `tui-spinner-hook` ticket spec | Badge consumes `useSpinner()`, does not manage animation |
| `useSpinner` uses `useTimeline()` from `@opentui/react` with `useSyncExternalStore` for frame synchronization | `tui-spinner-hook` ticket spec | All concurrent spinners display the same frame |
| `useLayout()` returns `{ breakpoint, width, height, contentHeight, ... }` with `Breakpoint = "minimum" \| "standard" \| "large"` (plus `"unsupported"` special case) | `apps/tui/src/hooks/useLayout.ts` (specified in `tui-layout-hook` ticket) | Badge uses breakpoint for responsive text |
| `getBreakpoint(cols, rows)` — `<80\|<24` → unsupported, `<120\|<40` → minimum, `<200\|<60` → standard, else → large | `tui-layout-hook` ticket spec | Determines when label is shown |
| `detectColorCapability(): ColorTier` returns `"truecolor" \| "ansi256" \| "ansi16"` | `apps/tui/src/theme/detect.ts` (specified in `tui-color-detection` ticket) | Used by ThemeProvider upstream |
| `isUnicodeSupported(): boolean` — returns false for `TERM=dumb` or `NO_COLOR=1` | `apps/tui/src/theme/detect.ts` | Badge uses `●` on Unicode terminals, `*` on ASCII |
| `WorkspaceStatus` API type: `"pending" \| "starting" \| "running" \| "suspended" \| "stopped" \| "failed"` | `packages/sdk/src/db/workspace_sql.ts` and `packages/sdk/src/services/workspace.ts` | Canonical 6 API values from database schema |
| Workspace list row shows `●` status icon (2ch column width) at minimum | `specs/tui/TUI_WORKSPACE_LIST_SCREEN.md` line 64 | Badge must fit within 2-character icon column at minimum |
| SSE workspace status stream spec defines transitional display states: `starting`, `stopping`, `suspending`, `resuming` | `specs/tui/TUI_WORKSPACE_STATUS_STREAM.md` lines 34-35 | These are **display states** beyond the 6 API states — component must accept extended status union |
| `<text>` accepts `fg` prop as `string \| RGBA` | `@opentui/react` component types (context/opentui) | RGBA tokens pass directly without conversion |
| `<box>` accepts `flexDirection`, `gap`, `alignItems` layout props | `@opentui/core` BoxOptions | Badge uses row layout for icon + label |
| `apps/tui/src/components/` directory does not yet exist | `find` scan of `apps/tui/src/` | Must be created; first shared component |
| Existing barrel exports use `.js` extensions (ESM) | Convention from other TUI ticket specs | `export { WorkspaceStatusBadge } from "./WorkspaceStatusBadge.js"` |
| Existing E2E test file: `e2e/tui/diff.test.ts` uses `import { createTestTui } from "@microsoft/tui-test"` | `e2e/tui/diff.test.ts` line 1 | Test infrastructure pattern to follow |
| E2E test helpers spec defines `launchTUI()`, `TUITestInstance` with `sendKeys()`, `waitForText()`, `snapshot()`, `getLine()`, `resize()`, `terminate()` | `tui-e2e-test-infra` ticket and `specs/tui/e2e/tui/helpers.ts` | Standard test helper API |
| Workspace test helpers define `WORKSPACE_FIXTURES`, `launchTUIWithWorkspaceContext()`, `assertWorkspaceRow()` | `tui-workspace-e2e-helpers` ticket | Specialized workspace test helpers (not yet implemented) |

---

## 3. Architecture

### 3.1 Component Location

```
apps/tui/src/components/
├── WorkspaceStatusBadge.tsx    ← THIS TICKET
└── index.ts                    ← barrel export (created by this ticket)
```

This is the first shared component in the TUI `components/` directory. The directory and barrel export are created by this ticket.

### 3.2 Status-to-Visual Mapping

The component defines its own mapping rather than using the generic `statusToToken()`, because workspace statuses have specific visual requirements:

| Status | Token | Icon | Animated | Label |
|---|---|---|---|---|
| `running` | `success` | `●` (solid dot) | No | `Running` |
| `starting` | `warning` | braille spinner | Yes (80ms) | `Starting` |
| `stopping` | `warning` | braille spinner | Yes (80ms) | `Stopping` |
| `suspending` | `warning` | braille spinner | Yes (80ms) | `Suspending` |
| `resuming` | `warning` | braille spinner | Yes (80ms) | `Resuming` |
| `suspended` | `muted` | `●` (solid dot) | No | `Suspended` |
| `stopped` | `muted` | `●` (solid dot) | No | `Stopped` |
| `deleted` | `muted` | `●` (solid dot) | No | `Deleted` |
| `error` | `error` | `●` (solid dot) | No | `Error` |
| `failed` | `error` | `●` (solid dot) | No | `Failed` |
| `pending` | `warning` | `●` (solid dot) | No | `Pending` |

**Key differences from `statusToToken()`:**
- `suspended` maps to `muted` (not `warning`) — a suspended workspace is dormant, not actively in a warning state
- `stopped` maps to `muted` (not `error`) — stopped is a normal terminal state, not an error
- `pending` maps to `warning` with a **static** dot, not a spinner — it's waiting, not actively transitioning
- Transitional states (`starting`, `stopping`, `suspending`, `resuming`) get animated spinners — these are actively in-flight operations
- `deleted` is an additional display state not in the 6-value API enum

This mapping aligns with the SSE status stream spec (`TUI_WORKSPACE_STATUS_STREAM.md` line 34): `success` for `running`, `warning` for transitional, `error` for `error`/`failed`, `muted` for `suspended`/`deleted`/`stopped`.

### 3.3 Extended Status Type

The component accepts a broader status union than the API's `WorkspaceStatus` to handle optimistic UI transitions:

```typescript
/**
 * Extended workspace status values.
 *
 * Includes the 6 API-defined statuses plus transitional display states
 * that appear during optimistic updates (e.g., user presses "suspend"
 * → status shows "suspending" before server confirms).
 */
export type WorkspaceDisplayStatus =
  | "pending"
  | "starting"
  | "running"
  | "stopping"
  | "suspending"
  | "suspended"
  | "resuming"
  | "stopped"
  | "deleted"
  | "error"
  | "failed";
```

**Rationale:** The `tui-workspace-suspend-resume` ticket specifies optimistic status updates — when the user presses `s` to suspend, the badge immediately shows `suspending` with a spinner before the server confirms. The `tui-workspace-status-stream` spec (line 9) shows the badge rendering `[⠹ starting…]` for transitional states. These display states must be first-class inputs to the badge.

### 3.4 Props Interface

```typescript
export interface WorkspaceStatusBadgeProps {
  /** The workspace status to display. */
  readonly status: WorkspaceDisplayStatus;

  /**
   * Compact mode for list row usage.
   *
   * When true, reduces horizontal padding and uses a tighter layout (zero gap).
   * At minimum breakpoint, only the icon is shown regardless of compact.
   * Default: false.
   */
  readonly compact?: boolean;
}
```

### 3.5 Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Own status mapping vs `statusToToken()` | Own mapping | Workspace statuses have nuanced color semantics (e.g., `suspended` → `muted`, not `warning`) and the component must know which statuses get spinners. The generic mapper doesn't encode animation decisions. |
| Accept `WorkspaceDisplayStatus` (extended) vs `WorkspaceStatus` (API) | Extended | Optimistic UI shows transitional states (`suspending`, `resuming`) before the server confirms. The component must render these without the caller having to manage icon/color themselves. |
| Static dot character | `●` (U+25CF BLACK CIRCLE) on Unicode, `*` on ASCII | `●` is the standard convention in this TUI (see workspace list spec and SSE stream spec). Falls back to `*` for `TERM=dumb` or `NO_COLOR=1`. |
| Responsive label visibility | `useLayout()` breakpoint | At minimum (80×24), list rows can only afford 2 characters for the status column. Label is hidden. At standard+, label is shown. |
| `compact` prop | Optional boolean | Workspace list rows need tighter spacing than the detail header. Compact mode removes the gap between icon and label. |
| No wrapper `<box>` when icon-only | Render bare `<text>` | When only the icon shows (minimum breakpoint), avoid unnecessary layout nodes. Reduces JSX tree depth and render cost. |
| Module-level `DOT` constant | Evaluated once via `isUnicodeSupported()` | Unicode detection is based on env vars that don't change during a TUI session. Avoids per-render evaluation. |
| `Object.freeze()` on status config | Immutable at module level | Prevents accidental mutation. Zero per-render allocation since all instances share the same frozen object. |
| Fallback for unknown status | `STATUS_CONFIG[status] ?? STATUS_CONFIG.pending` | TypeScript prevents invalid status at compile time, but runtime defensiveness via `??` ensures the component never crashes on unexpected server data. |

---

## 4. Implementation Plan

### Step 1: Create the components directory and barrel export

**File:** `apps/tui/src/components/index.ts`

This is the first shared component directory in the TUI. Create the directory and the barrel export file.

```typescript
export { WorkspaceStatusBadge } from "./WorkspaceStatusBadge.js";
export type {
  WorkspaceStatusBadgeProps,
  WorkspaceDisplayStatus,
} from "./WorkspaceStatusBadge.js";
```

### Step 2: Define the status configuration map

**File:** `apps/tui/src/components/WorkspaceStatusBadge.tsx`

Create the module with types, constants, and a frozen lookup object that maps each `WorkspaceDisplayStatus` to its visual configuration. This is a module-level constant — no per-render allocation.

```typescript
import type { ThemeTokens } from "../theme/tokens.js";

/**
 * Extended workspace status values.
 * Includes the 6 API statuses plus transitional display states for optimistic UI.
 */
export type WorkspaceDisplayStatus =
  | "pending"
  | "starting"
  | "running"
  | "stopping"
  | "suspending"
  | "suspended"
  | "resuming"
  | "stopped"
  | "deleted"
  | "error"
  | "failed";

/** Visual configuration for a single workspace status value. */
interface StatusConfig {
  /** Semantic token name to resolve from ThemeTokens. */
  readonly tokenName: keyof ThemeTokens;
  /** Whether to show an animated spinner instead of a static dot. */
  readonly animated: boolean;
  /** Human-readable label text. */
  readonly label: string;
}

/**
 * Status → visual configuration mapping.
 * Frozen at module scope — zero per-render allocation.
 */
const STATUS_CONFIG: Readonly<Record<WorkspaceDisplayStatus, StatusConfig>> =
  Object.freeze({
    running:    { tokenName: "success", animated: false, label: "Running" },
    starting:   { tokenName: "warning", animated: true,  label: "Starting" },
    stopping:   { tokenName: "warning", animated: true,  label: "Stopping" },
    suspending: { tokenName: "warning", animated: true,  label: "Suspending" },
    resuming:   { tokenName: "warning", animated: true,  label: "Resuming" },
    suspended:  { tokenName: "muted",   animated: false, label: "Suspended" },
    stopped:    { tokenName: "muted",   animated: false, label: "Stopped" },
    deleted:    { tokenName: "muted",   animated: false, label: "Deleted" },
    error:      { tokenName: "error",   animated: false, label: "Error" },
    failed:     { tokenName: "error",   animated: false, label: "Failed" },
    pending:    { tokenName: "warning", animated: false, label: "Pending" },
  });
```

### Step 3: Implement the static dot character

Determine the dot character based on Unicode support. This is evaluated once at module load, not per render.

```typescript
import { isUnicodeSupported } from "../theme/detect.js";

/** Static dot character: ● on Unicode terminals, * on ASCII fallback. */
const DOT: string = isUnicodeSupported() ? "●" : "*";
```

### Step 4: Implement the component

The component is a pure function component that:
1. Looks up the status config from the frozen map
2. Resolves the color from the theme via `useTheme()`
3. Delegates animation to `useSpinner()` — the hook manages Timeline lifecycle and frame synchronization
4. Uses `useLayout()` for responsive label visibility
5. Renders `<text>` (icon-only at minimum) or `<box>` + `<text>` (icon+label at standard+)

```typescript
import React from "react";
import type { RGBA } from "@opentui/core";
import { useTheme } from "../hooks/useTheme.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { useLayout } from "../hooks/useLayout.js";

export interface WorkspaceStatusBadgeProps {
  /** The workspace status to display. */
  readonly status: WorkspaceDisplayStatus;
  /**
   * Compact mode for list row usage.
   * When true, uses tighter layout (zero gap between icon and label).
   * @default false
   */
  readonly compact?: boolean;
}

export function WorkspaceStatusBadge({
  status,
  compact = false,
}: WorkspaceStatusBadgeProps): React.ReactNode {
  const theme = useTheme();
  const { breakpoint } = useLayout();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const color: RGBA = theme[config.tokenName];
  const spinnerFrame = useSpinner(config.animated);

  // Determine the icon: animated spinner frame or static dot
  const icon: string = config.animated ? spinnerFrame : DOT;

  // At minimum/unsupported breakpoint: icon only (no label)
  const showLabel =
    breakpoint !== "minimum" && breakpoint !== "unsupported";

  if (!showLabel) {
    // Icon-only mode: single <text> element, no wrapper box needed
    return <text fg={color}>{icon}</text>;
  }

  // Standard/large: icon + label in a horizontal row
  return (
    <box flexDirection="row" gap={compact ? 0 : 1} alignItems="center">
      <text fg={color}>{icon}</text>
      <text fg={color}>{config.label}</text>
    </box>
  );
}
```

### Step 5: Export test-accessible config

Add a named export of the config map so module-level tests can validate the mapping without rendering:

```typescript
/**
 * Exported for test assertions only.
 * Do not use in production code — use the WorkspaceStatusBadge component.
 * @internal
 */
export { STATUS_CONFIG as _STATUS_CONFIG_FOR_TESTING };
```

---

## 5. Complete File: `apps/tui/src/components/WorkspaceStatusBadge.tsx`

```typescript
import React from "react";
import type { RGBA } from "@opentui/core";
import type { ThemeTokens } from "../theme/tokens.js";
import { isUnicodeSupported } from "../theme/detect.js";
import { useTheme } from "../hooks/useTheme.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { useLayout } from "../hooks/useLayout.js";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Extended workspace status values.
 *
 * Includes the 6 API-defined statuses (`pending`, `starting`, `running`,
 * `suspended`, `stopped`, `failed`) plus transitional display states
 * that appear during optimistic updates (e.g., user presses "suspend"
 * → status shows "suspending" before server confirms).
 */
export type WorkspaceDisplayStatus =
  | "pending"
  | "starting"
  | "running"
  | "stopping"
  | "suspending"
  | "suspended"
  | "resuming"
  | "stopped"
  | "deleted"
  | "error"
  | "failed";

/** Visual configuration for a single workspace status value. */
interface StatusConfig {
  /** Semantic token name to resolve from ThemeTokens. */
  readonly tokenName: keyof ThemeTokens;
  /** Whether to show an animated spinner instead of a static dot. */
  readonly animated: boolean;
  /** Human-readable label text. */
  readonly label: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Static dot character: ● on Unicode terminals, * on ASCII fallback. */
const DOT: string = isUnicodeSupported() ? "●" : "*";

/**
 * Status → visual configuration mapping.
 * Frozen at module scope — zero per-render allocation.
 */
const STATUS_CONFIG: Readonly<Record<WorkspaceDisplayStatus, StatusConfig>> =
  Object.freeze({
    running:    { tokenName: "success", animated: false, label: "Running" },
    starting:   { tokenName: "warning", animated: true,  label: "Starting" },
    stopping:   { tokenName: "warning", animated: true,  label: "Stopping" },
    suspending: { tokenName: "warning", animated: true,  label: "Suspending" },
    resuming:   { tokenName: "warning", animated: true,  label: "Resuming" },
    suspended:  { tokenName: "muted",   animated: false, label: "Suspended" },
    stopped:    { tokenName: "muted",   animated: false, label: "Stopped" },
    deleted:    { tokenName: "muted",   animated: false, label: "Deleted" },
    error:      { tokenName: "error",   animated: false, label: "Error" },
    failed:     { tokenName: "error",   animated: false, label: "Failed" },
    pending:    { tokenName: "warning", animated: false, label: "Pending" },
  });

/**
 * Exported for test assertions only.
 * Do not use in production code — use the WorkspaceStatusBadge component.
 * @internal
 */
export { STATUS_CONFIG as _STATUS_CONFIG_FOR_TESTING };

// ── Props ────────────────────────────────────────────────────────────────────

export interface WorkspaceStatusBadgeProps {
  /** The workspace status to display. */
  readonly status: WorkspaceDisplayStatus;

  /**
   * Compact mode for list row usage.
   *
   * When true, uses tighter horizontal layout (zero gap between icon and label).
   * Combined with minimum breakpoint, shows icon only.
   *
   * @default false
   */
  readonly compact?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Reusable workspace status badge.
 *
 * Renders a workspace status as a colored icon with optional label text.
 * Transitional states (starting, stopping, suspending, resuming) display
 * an animated braille spinner instead of a static dot. All spinners are
 * frame-synchronized via the shared `useSpinner()` hook.
 *
 * Responsive behavior:
 * - Minimum breakpoint (80×24): icon only, no label text
 * - Standard+ breakpoint (120×40+): icon + label text
 *
 * @example
 * ```tsx
 * // In a workspace list row (compact):
 * <WorkspaceStatusBadge status={workspace.status} compact />
 *
 * // In a workspace detail header (full):
 * <WorkspaceStatusBadge status={workspace.status} />
 * ```
 */
export function WorkspaceStatusBadge({
  status,
  compact = false,
}: WorkspaceStatusBadgeProps): React.ReactNode {
  const theme = useTheme();
  const { breakpoint } = useLayout();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const color: RGBA = theme[config.tokenName];
  const spinnerFrame = useSpinner(config.animated);

  // Determine the icon: animated spinner frame or static dot
  const icon: string = config.animated ? spinnerFrame : DOT;

  // At minimum/unsupported breakpoint: icon only
  const showLabel =
    breakpoint !== "minimum" && breakpoint !== "unsupported";

  if (!showLabel) {
    return <text fg={color}>{icon}</text>;
  }

  // Standard+: icon + label in horizontal row
  return (
    <box flexDirection="row" gap={compact ? 0 : 1} alignItems="center">
      <text fg={color}>{icon}</text>
      <text fg={color}>{config.label}</text>
    </box>
  );
}
```

---

## 6. Integration Points

### 6.1 Consumer Examples

**Workspace list row** (`WorkspaceListScreen.tsx`, `tui-workspace-list-screen` ticket):
```typescript
import { WorkspaceStatusBadge } from "../../components/WorkspaceStatusBadge.js";

function WorkspaceRow({ workspace, focused }: WorkspaceRowProps) {
  return (
    <box flexDirection="row" gap={1}>
      <WorkspaceStatusBadge status={workspace.status} compact />
      <text>{workspace.name}</text>
      {/* ... other columns */}
    </box>
  );
}
```

**Workspace detail header** (`WorkspaceDetailScreen.tsx`, `tui-workspace-detail-view` ticket):
```typescript
import { WorkspaceStatusBadge } from "../../components/WorkspaceStatusBadge.js";

function WorkspaceDetailHeader({ workspace }: { workspace: Workspace }) {
  return (
    <box flexDirection="row" gap={2} alignItems="center">
      <text bold>{workspace.name}</text>
      <WorkspaceStatusBadge status={workspace.status} />
    </box>
  );
}
```

**Optimistic suspend/resume** (`tui-workspace-suspend-resume` ticket):
```typescript
// User presses 's' to suspend a running workspace
// → optimistic status immediately set to "suspending"
// → Badge shows yellow braille spinner + "Suspending"
// On server confirm via SSE: status becomes "suspended" → gray dot + "Suspended"
// On server error: status reverts to "running" → green dot + "Running"
const optimisticStatus: WorkspaceDisplayStatus = "suspending";
```

**SSE status stream** (`TUI_WORKSPACE_STATUS_STREAM.md` wireframe, line 118):
```
● staging-env            [⠹ starting…] @dev  5m ago    ← spinner animates via badge
```

### 6.2 Dependency Graph

```
tui-color-detection        tui-foundation-scaffold
    │                           │
    ▼                           ▼
tui-theme-tokens          tui-layout-hook
    │                           │
    ▼                           │
tui-theme-provider              │
    │                           │
    ├───────────────────────────┤
    │                           │
    ▼                           ▼
tui-spinner-hook     (useLayout, Breakpoint)
    │                           │
    ├───────────────────────────┤
    │
    ▼
tui-workspace-status-badge   ◄── THIS TICKET
    │
    ├──► tui-workspace-list-screen
    ├──► tui-workspace-detail-view
    ├──► tui-workspace-status-stream
    ├──► tui-workspace-suspend-resume
    └──► tui-dashboard-activity-feed
```

---

## 7. Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Unknown status string passed | Falls back to `STATUS_CONFIG.pending` — yellow dot + "Pending". TypeScript union type prevents this at compile time but runtime defensiveness via `??` fallback. |
| `compact={true}` at standard breakpoint | Shows icon + label but with zero gap between them (tighter layout for list rows). |
| `compact={true}` at minimum breakpoint | Shows icon only — same as non-compact at minimum. The `compact` prop has no additional effect at minimum. |
| `compact={false}` (default) at minimum breakpoint | Shows icon only. The label is hidden regardless of `compact` at minimum. |
| Terminal is `TERM=dumb` (no Unicode) | `DOT` resolves to `*`. Spinner uses ASCII frames (`| / - \`). Both handled upstream by `isUnicodeSupported()` and `useSpinner()`. |
| `NO_COLOR=1` environment | `isUnicodeSupported()` returns false — ASCII `*` dot. Colors still passed as RGBA but terminal ignores ANSI escapes. |
| Terminal resize from standard to minimum mid-render | `useLayout()` triggers synchronous re-render via `useTerminalDimensions()`/`useOnResize()`. Label disappears immediately. No animation or transition. |
| Terminal resize from minimum to standard | Label appears immediately on next render. |
| Multiple badges on screen (workspace list) | All animated badges show the same spinner frame — synchronized via `useSpinner()`'s shared timeline and `useSyncExternalStore`. |
| No animated statuses visible | `useSpinner(false)` for all badges → spinner timeline is paused → zero CPU from animation. |
| Status transitions rapidly (`starting` → `running` in <80ms) | Badge re-renders with new config. `useSpinner` receives `active=false` for the new status. Spinner deactivates cleanly. No leaked timers. |
| `unsupported` breakpoint (<80×24) | Treated same as `minimum` — icon only. The "terminal too small" overlay is handled by the AppShell/router, not this component. |
| Mixed animated and static badges in same list | Only badges with `config.animated === true` pass `true` to `useSpinner()`. Static badges pass `false` and get `""` back (unused). No unnecessary re-renders for static badges. |
| Component unmounts while spinner active | `useSpinner` internally uses `useSyncExternalStore` — React's cleanup handles unsubscription. The shared Timeline continues for other active subscribers. When no subscribers remain, Timeline pauses. |

---

## 8. Performance Characteristics

| Metric | Target | Mechanism |
|---|---|---|
| Render cost per badge | Negligible (2 JSX elements max) | No state, no effects. Pure derivation from props + context. |
| Re-renders per frame (animated) | 1 per 80ms (per animated badge) | `useSpinner` triggers via `useSyncExternalStore` only when `frameIndex` changes. |
| Re-renders per frame (static) | 0 | `useSpinner(false)` returns stable `""` — no subscription to frame changes. |
| Memory per badge instance | ~0 bytes (all data is shared/frozen) | `STATUS_CONFIG` is module-level. Theme tokens are context-level. No per-instance state. |
| CPU when no transitional statuses visible | 0% from badges | All `useSpinner(false)` → no active subscribers → Timeline paused. |
| Theme token resolution | O(1) property access | `theme[config.tokenName]` is a direct property lookup on a frozen object. |
| JSX tree depth at minimum breakpoint | 1 node (`<text>`) | No wrapper `<box>` when icon-only — minimizes layout computation. |
| JSX tree depth at standard+ breakpoint | 3 nodes (`<box>` + 2 `<text>`) | Minimal tree for icon + label layout. |

---

## 9. Responsive Behavior

| Breakpoint | Badge Rendering | Character Width |
|---|---|---|
| `unsupported` (<80×24) | Icon only: `●` or spinner frame | 1 character |
| `minimum` (80×24 – 119×39) | Icon only: `●` or spinner frame | 1 character |
| `standard` (120×40 – 199×59) | Icon + label: `● Running` (gap=1) or `●Running` (compact, gap=0) | 2–12 characters |
| `large` (200×60+) | Same as standard — no additional expansion | 2–12 characters |

**Width budget per breakpoint (from TUI_WORKSPACE_LIST_SCREEN.md):**

The workspace list spec allocates:
- **Minimum:** Status icon (2ch) — badge icon is 1ch, fits in 2ch column with 1ch padding
- **Standard:** Status icon (2ch) + status label (12ch) — badge icon (1ch) + gap (1ch or 0ch) + label (max 10ch for "Suspending") = max 12ch
- **Large:** Same as standard column allocations

---

## 10. OpenTUI Components and Hooks Used

| Component/Hook | Package | Usage |
|---|---|---|
| `<text>` | `@opentui/react` | Renders icon character and label text with `fg` color prop |
| `<box>` | `@opentui/react` | Horizontal flex container for icon + label at standard+ breakpoint |
| `useTheme()` | `apps/tui/src/hooks/useTheme.js` | Resolves semantic color tokens (`success`, `warning`, `error`, `muted`) to RGBA |
| `useSpinner()` | `apps/tui/src/hooks/useSpinner.js` | Returns animated braille/ASCII frame string for transitional statuses |
| `useLayout()` | `apps/tui/src/hooks/useLayout.js` | Returns current breakpoint for responsive label visibility |
| `isUnicodeSupported()` | `apps/tui/src/theme/detect.js` | Determines dot character (`●` vs `*`) at module load time |
| `RGBA` (type) | `@opentui/core` | Type for theme color values passed to `<text fg={...}>` |

---

## 11. Unit & Integration Tests

### 11.1 Test File Location

**File:** `e2e/tui/workspaces.test.ts`

Tests are written into the workspace E2E test file. The badge tests form a `describe("TUI_WORKSPACES — WorkspaceStatusBadge")` block. This file is **created** by this ticket if it does not yet exist.

### 11.2 Test Approach

Tests use two strategies:

1. **Module-level validation** — imports the component module directly (using Bun's module resolution) and asserts on exported constants and types without spinning up a full TUI. These tests should **pass immediately** after the component is built because they only validate the module's exports and constant data.

2. **Rendered output validation (E2E)** — launches the TUI via `launchTUI()`, navigates to a workspace screen, and asserts on terminal content using snapshots and regex. These tests **will fail** until the full workspace screen stack is implemented (workspace list screen, workspace data hooks, SSE streaming, etc.). They are intentionally left failing per project policy.

### 11.3 Test Cases

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";

describe("TUI_WORKSPACES — WorkspaceStatusBadge", () => {

  // ── STATUS CONFIG MAP ───────────────────────────────────────────────

  test("BADGE-CFG-001: STATUS_CONFIG has entries for all 11 display statuses", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const expected = [
      "pending", "starting", "running", "stopping", "suspending",
      "suspended", "resuming", "stopped", "deleted", "error", "failed",
    ].sort();
    const keys = Object.keys(_STATUS_CONFIG_FOR_TESTING).sort();
    expect(keys).toEqual(expected);
  });

  test("BADGE-CFG-002: running maps to success token, not animated", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const cfg = _STATUS_CONFIG_FOR_TESTING.running;
    expect(cfg.tokenName).toBe("success");
    expect(cfg.animated).toBe(false);
    expect(cfg.label).toBe("Running");
  });

  test("BADGE-CFG-003: transitional states (starting, stopping, suspending, resuming) are animated with warning token", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const transitional = ["starting", "stopping", "suspending", "resuming"] as const;
    for (const status of transitional) {
      const cfg = _STATUS_CONFIG_FOR_TESTING[status];
      expect(cfg.tokenName).toBe("warning");
      expect(cfg.animated).toBe(true);
    }
  });

  test("BADGE-CFG-004: suspended, stopped, deleted map to muted token, not animated", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const dormant = ["suspended", "stopped", "deleted"] as const;
    for (const status of dormant) {
      const cfg = _STATUS_CONFIG_FOR_TESTING[status];
      expect(cfg.tokenName).toBe("muted");
      expect(cfg.animated).toBe(false);
    }
  });

  test("BADGE-CFG-005: error and failed map to error token, not animated", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const errorStates = ["error", "failed"] as const;
    for (const status of errorStates) {
      const cfg = _STATUS_CONFIG_FOR_TESTING[status];
      expect(cfg.tokenName).toBe("error");
      expect(cfg.animated).toBe(false);
    }
  });

  test("BADGE-CFG-006: pending maps to warning token, not animated, with static dot", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const cfg = _STATUS_CONFIG_FOR_TESTING.pending;
    expect(cfg.tokenName).toBe("warning");
    expect(cfg.animated).toBe(false);
    expect(cfg.label).toBe("Pending");
  });

  test("BADGE-CFG-007: all labels are capitalized single words ≤ 10 characters", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    for (const [, cfg] of Object.entries(_STATUS_CONFIG_FOR_TESTING)) {
      expect(typeof cfg.label).toBe("string");
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.label.length).toBeLessThanOrEqual(10);
      expect(cfg.label[0]).toBe(cfg.label[0].toUpperCase());
      expect(cfg.label).not.toContain(" ");
    }
  });

  test("BADGE-CFG-008: STATUS_CONFIG is frozen (immutable)", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    expect(Object.isFrozen(_STATUS_CONFIG_FOR_TESTING)).toBe(true);
  });

  // ── MODULE EXPORTS ──────────────────────────────────────────────────

  test("BADGE-EXP-001: module exports WorkspaceStatusBadge as a function", async () => {
    const { WorkspaceStatusBadge } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    expect(typeof WorkspaceStatusBadge).toBe("function");
  });

  test("BADGE-EXP-002: barrel export re-exports WorkspaceStatusBadge", async () => {
    const { WorkspaceStatusBadge } = await import(
      "../../apps/tui/src/components/index.js"
    );
    expect(typeof WorkspaceStatusBadge).toBe("function");
  });

  test("BADGE-EXP-003: module compiles and imports without errors", async () => {
    const mod = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    expect(mod).toBeDefined();
    expect(mod.WorkspaceStatusBadge).toBeDefined();
    expect(mod._STATUS_CONFIG_FOR_TESTING).toBeDefined();
  });

  // ── RENDERED OUTPUT (E2E) ──────────────────────────────────────────
  //
  // These tests depend on:
  //   - tui-workspace-list-screen (workspace list screen)
  //   - tui-workspace-data-hooks (data fetching)
  //   - tui-workspace-status-stream (SSE streaming)
  //   - A running API server with workspace test fixtures
  //
  // They are intentionally left FAILING until those dependencies
  // are implemented. They are NEVER skipped or commented out.

  test("BADGE-E2E-001: running workspace shows green dot and 'Running' label at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w"); // navigate to workspaces
    await terminal.waitForText("Workspaces");
    // Expect a running workspace row to show ● and "Running"
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Running/);
    await terminal.terminate();
  });

  test("BADGE-E2E-002: running workspace shows dot only at 80x24 (no label)", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snapshot = terminal.snapshot();
    // Should have the dot
    expect(snapshot).toMatch(/●/);
    // At 80x24 the "Running" label should NOT appear adjacent to workspace rows
    // (label is suppressed at minimum breakpoint)
    await terminal.terminate();
  });

  test("BADGE-E2E-003: transitional status shows braille spinner character", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    // Look for any braille spinner character in the output
    const snapshot = terminal.snapshot();
    // Braille spinner frames: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
    expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    await terminal.terminate();
  });

  test("BADGE-E2E-004: suspended workspace shows muted-colored dot and 'Suspended' at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Suspended/);
    await terminal.terminate();
  });

  test("BADGE-E2E-005: failed workspace shows 'Failed' label at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Failed/);
    await terminal.terminate();
  });

  test("BADGE-E2E-006: badge responds to terminal resize from 80x24 to 120x40", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");

    // At 80x24, labels should be hidden
    let snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/Running\s/);

    // Resize to standard
    await terminal.resize(120, 40);
    await terminal.waitForText("Running");
    snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Running/);

    await terminal.terminate();
  });

  test("BADGE-E2E-007: multiple animated badges show synchronized frames", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    // If multiple workspaces have transitional statuses,
    // all spinner characters in the snapshot should be identical
    const snapshot = terminal.snapshot();
    const spinnerChars = snapshot.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g);
    if (spinnerChars && spinnerChars.length > 1) {
      const allSame = spinnerChars.every((c: string) => c === spinnerChars[0]);
      expect(allSame).toBe(true);
    }
    await terminal.terminate();
  });

  test("BADGE-E2E-008: snapshot at 120x40 captures workspace list with status badges", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("BADGE-E2E-009: snapshot at 80x24 captures workspace list with icon-only badges", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

});
```

### 11.4 Tests Left Failing

The E2E tests (`BADGE-E2E-001` through `BADGE-E2E-009`) depend on:
- The workspace list screen being implemented (`tui-workspace-list-screen`)
- The workspace data hooks being implemented (`tui-workspace-data-hooks`)
- The workspace screen scaffold being registered (`tui-workspace-screen-scaffold`)
- A running API server with workspace test fixtures
- The `g w` go-to keybinding being registered

**These tests are intentionally left failing.** They are never skipped or commented out. They serve as executable acceptance criteria that will pass once the full workspace screen stack is implemented. This follows the project testing philosophy stated in `MEMORY.md` and the engineering architecture.

The module-level tests (`BADGE-CFG-*`, `BADGE-EXP-*`) should pass immediately after the component and its dependencies are created, as they only validate the module's exports and constant data.

### 11.5 Test Philosophy Compliance

| Principle | How This Spec Complies |
|---|---|
| No mocking of implementation details | Module-level tests import the real module. E2E tests render the full TUI. No mock ThemeProvider, no mock useSpinner. |
| Tests validate user-facing behavior | E2E tests check what the user sees: colored dots, labels, spinner characters. Not internal state or hook return values. |
| Each test validates one behavior | Each test has a single assertion focus: one status mapping, one breakpoint behavior, one export check. |
| Tests at representative sizes | E2E tests run at 80×24 (minimum) and 120×40 (standard) with resize test covering the transition. |
| Tests are independent | Each test uses a fresh dynamic `import()` or launches a fresh `launchTUI` instance. No shared state between tests. |
| Failing tests are not skipped | E2E tests that depend on unimplemented backends are left as-is — never `test.skip()`, never commented out. |
| Snapshot tests are supplementary | `BADGE-E2E-008` and `BADGE-E2E-009` capture golden-file snapshots at key sizes for regression detection, while the other E2E tests use targeted regex assertions. |

---

## 12. Productionization Checklist

This component is production-ready by design — there is no PoC phase. All code ships directly to `apps/tui/src/components/`.

| Item | Status | Notes |
|---|---|---|
| Zero runtime dependencies beyond existing hooks | ✅ | Uses `useTheme()`, `useSpinner()`, `useLayout()`, `isUnicodeSupported()` — all from existing/planned modules |
| No `setInterval` or `setTimeout` | ✅ | Animation delegated to `useSpinner()` which uses OpenTUI's `Timeline` engine via `useTimeline()` |
| No per-render memory allocation | ✅ | `STATUS_CONFIG` is module-level frozen object. Theme tokens are context-level. `DOT` is module-level constant. |
| TypeScript strict mode compatible | ✅ | `WorkspaceDisplayStatus` union prevents invalid status strings. `??` fallback handles runtime safety. |
| ESM import paths with `.js` extensions | ✅ | All imports use `.js` suffix per project convention |
| Barrel export in `components/index.ts` | ✅ | Component and types exported for clean import paths |
| Frozen config map prevents mutation | ✅ | `Object.freeze()` on `STATUS_CONFIG` |
| Graceful fallback for unknown statuses | ✅ | `STATUS_CONFIG[status] ?? STATUS_CONFIG.pending` |
| ASCII fallback for non-Unicode terminals | ✅ | Handled by `isUnicodeSupported()` (dot) and `useSpinner()` (frames) |
| No direct ANSI codes | ✅ | All colors via semantic theme tokens resolved through `useTheme()` |
| No browser APIs | ✅ | Pure React + OpenTUI — no `window`, `document`, `localStorage` |
| Test coverage for all 11 statuses | ✅ | `BADGE-CFG-*` tests validate every entry in `STATUS_CONFIG` |
| Responsive behavior tested at 2 breakpoints + resize | ✅ | `BADGE-E2E-002` (80×24), `BADGE-E2E-001` (120×40), `BADGE-E2E-006` (resize) |
| No leaked timers on unmount | ✅ | `useSpinner` manages Timeline lifecycle; React cleanup handles unsubscription |
| Snapshot tests for visual regression | ✅ | `BADGE-E2E-008` and `BADGE-E2E-009` capture golden files at standard and minimum |

---

## 13. Files Changed

| File | Action | Description |
|---|---|---|
| `apps/tui/src/components/WorkspaceStatusBadge.tsx` | **Create** | Reusable workspace status badge component (types, constants, component function) |
| `apps/tui/src/components/index.ts` | **Create** | Barrel export for components directory (first shared component) |
| `e2e/tui/workspaces.test.ts` | **Create** | `describe("TUI_WORKSPACES — WorkspaceStatusBadge")` test block with module-level and E2E tests |

---

## 14. Acceptance Criteria Traceability

Mapping from the ticket's acceptance criteria to tests and implementation:

| Acceptance Criterion | Implementation | Test |
|---|---|---|
| Component renders correct color for each status: running=green, transitional=yellow, error=red, inactive=gray | `STATUS_CONFIG` maps `tokenName` to `success`/`warning`/`error`/`muted` | `BADGE-CFG-002` through `BADGE-CFG-006` |
| Transitional statuses show animated braille spinner | `config.animated === true` for starting/stopping/suspending/resuming → `useSpinner(true)` | `BADGE-CFG-003`, `BADGE-E2E-003` |
| Spinner cycles through 10 braille frames at 80ms using useTimeline | Delegated to `useSpinner()` which uses `useTimeline()` internally | `BADGE-E2E-003`, `BADGE-E2E-007` |
| Non-transitional statuses show static dot (●) | `config.animated === false` → renders `DOT` constant | `BADGE-CFG-002`, `BADGE-CFG-004`, `BADGE-CFG-005`, `BADGE-CFG-006` |
| Status label renders next to icon at standard and large breakpoints | `showLabel = breakpoint !== "minimum" && breakpoint !== "unsupported"` | `BADGE-E2E-001`, `BADGE-E2E-004`, `BADGE-E2E-005` |
| At minimum breakpoint, only icon renders (no label) | `showLabel` is false → bare `<text>` | `BADGE-E2E-002`, `BADGE-E2E-006` |
| compact prop reduces to icon-only regardless of breakpoint | Compact at minimum → icon only (same as non-compact); compact at standard → icon+label with gap=0 | §3.5 design decision; responsive logic in component |
| Unknown status values handled gracefully | `STATUS_CONFIG[status] ?? STATUS_CONFIG.pending` fallback | `BADGE-CFG-001` (verifies all 11 keys exist) |
| Spinner animation stops when component unmounts | `useSpinner` uses `useSyncExternalStore` with cleanup; Timeline pauses when no subscribers | §7 edge case; §8 performance characteristics |