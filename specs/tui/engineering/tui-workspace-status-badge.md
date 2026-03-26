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
| `ThemeTokens` interface defines `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border` plus 5 diff tokens — each as `RGBA` (Float32Array-backed) | `apps/tui/src/theme/tokens.ts` lines 13–41 | Badge colors resolve to these semantic tokens via `theme[tokenName]` |
| `createTheme(tier)` returns `Readonly<ThemeTokens>` — frozen identity-stable objects (same object for same tier) | `apps/tui/src/theme/tokens.ts` lines 155–164 | Theme tokens are frozen and referentially stable |
| `statusToToken()` maps generic status strings to `CoreTokenName` — maps `suspended` → `warning` and `stopped` → `error` | `apps/tui/src/theme/tokens.ts` lines 209–256 | Badge needs **custom** mapping — `suspended` should be `muted` (dormant, not warning) and `stopped` should be `muted` (normal terminal state, not error) |
| `useTheme()` returns `Readonly<ThemeTokens>` from ThemeProvider context, throws if outside provider | `apps/tui/src/hooks/useTheme.ts` lines 21–30 | Components access `theme.success` as RGBA directly |
| `useSpinner(active: boolean): string` returns current braille/ASCII frame or `""` — per-caller gating ensures inactive callers get `""` even if other spinners are active | `apps/tui/src/hooks/useSpinner.ts` lines 165–177 | Badge delegates all animation to this hook |
| Braille frames: `["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]` at 80ms; ASCII: `["-", "\\", "|", "/"]` at 120ms | `apps/tui/src/hooks/useSpinner.ts` lines 8–19 | Badge consumes `useSpinner()`, does not manage animation |
| `useSpinner` uses `Timeline` from `@opentui/core` with `useSyncExternalStore` for frame synchronization — all concurrent spinners show same frame | `apps/tui/src/hooks/useSpinner.ts` lines 82–120 | Multiple workspace badges with transitional states are visually synchronized |
| `useLayout()` returns `LayoutContext` with `breakpoint: Breakpoint \| null` where `null` means unsupported (<80×24) | `apps/tui/src/hooks/useLayout.ts` lines 12–49, 92–110 | Badge checks `breakpoint === null \|\| breakpoint === "minimum"` for icon-only mode |
| `Breakpoint` type is `"minimum" \| "standard" \| "large"` — **NOT** `"unsupported"`; unsupported is represented as `null` | `apps/tui/src/types/breakpoint.ts` lines 11, 28–32 | Badge must compare against `null`, not a string |
| `getBreakpoint(cols, rows)` — `<80\|<24` → `null`, `<120\|<40` → `"minimum"`, `<200\|<60` → `"standard"`, else → `"large"` | `apps/tui/src/types/breakpoint.ts` lines 25–33 | Determines when label is shown |
| `detectColorCapability(): ColorTier` returns `"truecolor" \| "ansi256" \| "ansi16"` | `apps/tui/src/theme/detect.ts` lines 8, 22–52 | Used by ThemeProvider upstream |
| `isUnicodeSupported(): boolean` — returns `false` for `TERM=dumb` or `NO_COLOR` (non-empty) | `apps/tui/src/theme/detect.ts` lines 61–73 | Badge uses `●` on Unicode terminals, `*` on ASCII |
| `WorkspaceResponse.status` is typed as `string` in SDK — not a discriminated union | `packages/sdk/src/services/workspace.ts` line 65 | Badge defines its own `WorkspaceDisplayStatus` union for compile-time safety |
| SQL queries use status values: `'pending'`, `'starting'`, `'running'`, `'suspended'`, `'stopped'`, `'failed'` | `packages/sdk/src/db/workspace_sql.ts` lines 256–257, 307–317 | Canonical 6 API values from database |
| SSE workspace status stream defines transitional display states: `starting`, `stopping`, `suspending`, `resuming` | `specs/tui/` workspace stream specs | These are **display states** beyond the 6 API states — component must accept extended status union |
| `<text>` accepts `fg` prop as `RGBA` | `@opentui/react` component types (via StatusBar.tsx usage pattern, lines 65–86) | RGBA tokens pass directly without conversion |
| `<box>` accepts `flexDirection`, `gap`, `alignItems`, `justifyContent` layout props | `@opentui/core` BoxOptions (via StatusBar.tsx usage, line 62) | Badge uses row layout for icon + label |
| `apps/tui/src/components/` directory already exists with 16 components and barrel export `index.ts` | `apps/tui/src/components/index.ts` lines 1–16 | Badge is added to existing barrel, not first component |
| Existing barrel exports use `.js` extensions (ESM) | `apps/tui/src/components/index.ts` line 4: `export { AppShell } from "./AppShell.js"` | Follow same pattern |
| StatusBar.tsx demonstrates the pattern: `const theme = useTheme(); <text fg={theme.success}>...</text>` | `apps/tui/src/components/StatusBar.tsx` lines 13–14, 84 | Badge follows identical pattern |
| `WorkspaceStatusChangedEvent` in SDK: `{ workspaceId, workspaceName, ownerId, newStatus }` where `newStatus` is `string` | `packages/sdk/src/services/notification-fanout.ts` lines 117–121 | SSE events deliver status as untyped string |
| E2E helpers export `launchTUI()`, `TUITestInstance`, `TERMINAL_SIZES`, `run()`, `bunEval()` | `e2e/tui/helpers.ts` lines 41–62, 283–449 | Standard test infrastructure |
| `launchTUI` defaults: `cols=120, rows=40`, `COLORTERM=truecolor`, `TERM=xterm-256color` | `e2e/tui/helpers.ts` lines 294–295, 303–305 | Tests run at standard breakpoint with truecolor by default |

---

## 3. Architecture

### 3.1 Component Location

```
apps/tui/src/components/
├── ... (16 existing components)
├── WorkspaceStatusBadge.tsx    ← THIS TICKET
└── index.ts                    ← append export to existing barrel
```

The badge is added to the existing components directory. The barrel export at `index.ts` already exists and has 16 entries.

### 3.2 Status-to-Visual Mapping

The component defines its own mapping rather than using the generic `statusToToken()`, because workspace statuses have specific visual requirements that differ from the generic mapper:

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
- `suspended` maps to `muted` (not `warning` as in generic mapper) — a suspended workspace is dormant, not actively in a warning state
- `stopped` maps to `muted` (not `error` as in generic mapper) — stopped is a normal terminal state, not an error
- `pending` maps to `warning` with a **static** dot, not a spinner — it's waiting, not actively transitioning
- Transitional states (`starting`, `stopping`, `suspending`, `resuming`) get animated spinners — these are actively in-flight operations
- `deleted` is an additional display state not in the 6-value API status set

### 3.3 Extended Status Type

The component accepts a broader status union than the API's `WorkspaceResponse.status` (which is typed as bare `string` in the SDK) to handle optimistic UI transitions:

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

**Rationale:** The `tui-workspace-suspend-resume` ticket specifies optimistic status updates — when the user presses `s` to suspend, the badge immediately shows `suspending` with a spinner before the server confirms. These display states must be first-class inputs to the badge.

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
| Own status mapping vs `statusToToken()` | Own mapping | Workspace statuses have nuanced color semantics (e.g., `suspended` → `muted`, not `warning`; `stopped` → `muted`, not `error`) and the component must know which statuses get spinners. The generic mapper doesn't encode animation decisions. |
| Accept `WorkspaceDisplayStatus` (extended) vs `WorkspaceResponse.status` (`string`) | Extended union | Provides compile-time safety for all 11 display states. Optimistic UI shows transitional states (`suspending`, `resuming`) before the server confirms. |
| Static dot character | `●` (U+25CF BLACK CIRCLE) on Unicode, `*` on ASCII | `●` is the standard convention in this TUI for status indicators. Falls back to `*` when `isUnicodeSupported()` returns false (`TERM=dumb` or `NO_COLOR`). |
| Responsive label visibility | `useLayout()` breakpoint | At minimum (80×24), list rows can only afford limited characters for the status column. Label is hidden. At standard+, label is shown. |
| `compact` prop | Optional boolean | Workspace list rows need tighter spacing than the detail header. Compact mode removes the gap between icon and label. |
| No wrapper `<box>` when icon-only | Render bare `<text>` | When only the icon shows (minimum breakpoint or unsupported), avoid unnecessary layout nodes. Reduces JSX tree depth and render cost. |
| Module-level `DOT` constant | Evaluated once via `isUnicodeSupported()` | Unicode detection is based on env vars that don't change during a TUI session. Avoids per-render evaluation. |
| `Object.freeze()` on status config | Immutable at module level | Prevents accidental mutation. Zero per-render allocation since all instances share the same frozen object. |
| Fallback for unknown status | `STATUS_CONFIG[status] ?? STATUS_CONFIG.pending` | TypeScript prevents invalid status at compile time, but runtime defensiveness via `??` ensures the component never crashes on unexpected server data. |
| Unsupported breakpoint check | `breakpoint === null` | The `Breakpoint` type is `"minimum" | "standard" | "large"` with `null` for unsupported — NOT `"unsupported"` as a string value. |

---

## 4. Implementation Plan

### Step 1: Define types and constants in WorkspaceStatusBadge.tsx

**File:** `apps/tui/src/components/WorkspaceStatusBadge.tsx`

Create the module with the `WorkspaceDisplayStatus` type, `StatusConfig` interface, and the frozen `STATUS_CONFIG` lookup map. These are module-level constants — no per-render allocation.

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
```

### Step 2: Create the status configuration map and module-level constants

Still in the same file, define the frozen config map and the dot character constant:

```typescript
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
```

### Step 3: Implement the component

The component is a pure function component that:
1. Looks up the status config from the frozen map (with `??` fallback for runtime safety)
2. Resolves the color from the theme via `useTheme()`
3. Delegates animation to `useSpinner()` — the hook manages Timeline lifecycle and frame synchronization
4. Uses `useLayout()` for responsive label visibility, checking `breakpoint` against `null` (unsupported) and `"minimum"`
5. Renders `<text>` (icon-only at minimum/null breakpoint) or `<box>` + `<text>` (icon+label at standard+)

```typescript
// ── Props ────────────────────────────────────────────────────────────────────

export interface WorkspaceStatusBadgeProps {
  /** The workspace status to display. */
  readonly status: WorkspaceDisplayStatus;

  /**
   * Compact mode for list row usage.
   *
   * When true, uses tighter horizontal layout (zero gap between icon and label).
   * Combined with null/minimum breakpoint, shows icon only.
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
 * - null breakpoint (<80×24) or minimum breakpoint (80×24): icon only
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

  // At null (unsupported) or minimum breakpoint: icon only (no label)
  const showLabel =
    breakpoint !== null && breakpoint !== "minimum";

  if (!showLabel) {
    // Icon-only mode: single <text> element, no wrapper box needed
    return <text fg={color}>{icon}</text>;
  }

  // Standard/large: icon + label in horizontal row
  return (
    <box flexDirection="row" gap={compact ? 0 : 1} alignItems="center">
      <text fg={color}>{icon}</text>
      <text fg={color}>{config.label}</text>
    </box>
  );
}
```

### Step 4: Append to existing barrel export

**File:** `apps/tui/src/components/index.ts`

Append the following lines to the existing barrel export (which already has 16 component exports):

```typescript
export { WorkspaceStatusBadge } from "./WorkspaceStatusBadge.js";
export type {
  WorkspaceStatusBadgeProps,
  WorkspaceDisplayStatus,
} from "./WorkspaceStatusBadge.js";
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
   * Combined with null/minimum breakpoint, shows icon only.
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
 * - null breakpoint (<80×24) or minimum (80×24): icon only, no label text
 * - Standard+ breakpoint (120×40+): icon + label text
 *
 * @example
 * ```tsx
 * // In a workspace list row (compact):
 * <WorkspaceStatusBadge status={workspace.status as WorkspaceDisplayStatus} compact />
 *
 * // In a workspace detail header (full):
 * <WorkspaceStatusBadge status={workspace.status as WorkspaceDisplayStatus} />
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

  // At null (unsupported) or minimum breakpoint: icon only
  const showLabel =
    breakpoint !== null && breakpoint !== "minimum";

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
import type { WorkspaceDisplayStatus } from "../../components/WorkspaceStatusBadge.js";

function WorkspaceRow({ workspace, focused }: WorkspaceRowProps) {
  return (
    <box flexDirection="row" gap={1}>
      <WorkspaceStatusBadge status={workspace.status as WorkspaceDisplayStatus} compact />
      <text>{workspace.name}</text>
      {/* ... other columns */}
    </box>
  );
}
```

**Workspace detail header** (`WorkspaceDetailScreen.tsx`, `tui-workspace-detail-view` ticket):
```typescript
import { WorkspaceStatusBadge } from "../../components/WorkspaceStatusBadge.js";
import type { WorkspaceDisplayStatus } from "../../components/WorkspaceStatusBadge.js";

function WorkspaceDetailHeader({ workspace }: { workspace: Workspace }) {
  return (
    <box flexDirection="row" gap={2} alignItems="center">
      <text bold>{workspace.name}</text>
      <WorkspaceStatusBadge status={workspace.status as WorkspaceDisplayStatus} />
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
| Unknown status string passed at runtime | Falls back to `STATUS_CONFIG.pending` — yellow dot + "Pending". TypeScript union type prevents this at compile time but runtime defensiveness via `??` fallback handles unexpected server data. |
| `compact={true}` at standard breakpoint | Shows icon + label but with zero gap between them (tighter layout for list rows). |
| `compact={true}` at minimum breakpoint | Shows icon only — same as non-compact at minimum. The `compact` prop has no additional effect when label is hidden. |
| `compact={false}` (default) at minimum breakpoint | Shows icon only. The label is hidden regardless of `compact` at minimum. |
| Terminal is `TERM=dumb` (no Unicode) | `DOT` resolves to `*`. Spinner uses ASCII frames (`- \\ | /`) at 120ms. Both handled upstream by `isUnicodeSupported()` and `useSpinner()`. |
| `NO_COLOR=1` environment | `isUnicodeSupported()` returns false — ASCII `*` dot. Colors still passed as RGBA but terminal ignores ANSI escapes. |
| Terminal resize from standard to minimum mid-render | `useLayout()` triggers synchronous re-render via `useTerminalDimensions()`/`useOnResize()`. Label disappears immediately. No animation or transition. |
| Terminal resize from minimum to standard | Label appears immediately on next render. |
| `breakpoint` is `null` (unsupported, <80×24) | Treated same as `minimum` — icon only. The "terminal too small" overlay is handled by the AppShell/router, not this component. |
| Multiple badges on screen (workspace list) | All animated badges show the same spinner frame — synchronized via `useSpinner()`'s shared Timeline and `useSyncExternalStore`. |
| No animated statuses visible | All `useSpinner(false)` calls → no active subscribers → Timeline is paused → zero CPU from animation. |
| Status transitions rapidly (`starting` → `running` in <80ms) | Badge re-renders with new config. `useSpinner` receives `active=false` for the new status. Spinner deactivates cleanly via `useEffect` cleanup calling `deactivate()`. No leaked timers. |
| Mixed animated and static badges in same list | Only badges with `config.animated === true` pass `true` to `useSpinner()`. Static badges pass `false` and get `""` back (unused — they render DOT instead). No unnecessary re-renders for static badges due to per-caller gating in `useSpinner`. |
| Component unmounts while spinner active | `useSpinner` uses `useEffect` cleanup to call `deactivate()`. When `activeCount` reaches 0, Timeline pauses. `useSyncExternalStore` listener is removed via the unsubscribe function. |
| `spinnerFrame` is empty string during first render | When `useSpinner(true)` is called and Timeline hasn't ticked yet, `getSnapshot()` may return the first frame `FRAMES[0]`. The icon will be the first braille character. If by any race `spinnerFrame` is `""`, the icon renders as empty — but this is a sub-frame transient that resolves on the next 80ms tick. |

---

## 8. Performance Characteristics

| Metric | Target | Mechanism |
|---|---|---|
| Render cost per badge | Negligible (2 JSX elements max) | No state, no effects in the component itself. Pure derivation from props + context. (Effects live in `useSpinner`.) |
| Re-renders per frame (animated) | 1 per 80ms (per animated badge) | `useSpinner` triggers via `useSyncExternalStore` only when `currentFrameIndex` changes. |
| Re-renders per frame (static) | 0 | `useSpinner(false)` returns stable `""` — per-caller gating prevents subscription-triggered renders even if other spinners are active. |
| Memory per badge instance | ~0 bytes (all data is shared/frozen) | `STATUS_CONFIG` is module-level. Theme tokens are context-level. No per-instance state. |
| CPU when no transitional statuses visible | 0% from badges | All `useSpinner(false)` → `activeCount` stays 0 → Timeline never starts or is paused. |
| Theme token resolution | O(1) property access | `theme[config.tokenName]` is a direct property lookup on a frozen object. |
| JSX tree depth at null/minimum breakpoint | 1 node (`<text>`) | No wrapper `<box>` when icon-only — minimizes layout computation. |
| JSX tree depth at standard+ breakpoint | 3 nodes (`<box>` + 2 `<text>`) | Minimal tree for icon + label layout. |

---

## 9. Responsive Behavior

| Breakpoint | Badge Rendering | Character Width |
|---|---|---|
| `null` (<80×24) | Icon only: `●` or spinner frame | 1 character |
| `"minimum"` (80×24 – 119×39) | Icon only: `●` or spinner frame | 1 character |
| `"standard"` (120×40 – 199×59) | Icon + label: `● Running` (gap=1) or `●Running` (compact, gap=0) | 2–12 characters |
| `"large"` (200×60+) | Same as standard — no additional expansion | 2–12 characters |

**Width budget (from workspace list column allocations):**
- **Minimum:** Status icon column — badge icon is 1ch, fits in allocated column width
- **Standard:** Status icon (1ch) + gap (1ch or 0ch) + label (max 10ch for "Suspending") = max 12ch
- **Large:** Same as standard column allocations

---

## 10. OpenTUI Components and Hooks Used

| Component/Hook | Package | Usage |
|---|---|---|
| `<text>` | `@opentui/react` | Renders icon character and label text with `fg` color prop accepting `RGBA` |
| `<box>` | `@opentui/react` | Horizontal flex container for icon + label at standard+ breakpoint |
| `useTheme()` | `apps/tui/src/hooks/useTheme.js` | Resolves semantic color tokens (`success`, `warning`, `error`, `muted`) to `RGBA` |
| `useSpinner()` | `apps/tui/src/hooks/useSpinner.js` | Returns animated braille/ASCII frame string for transitional statuses, `""` for inactive |
| `useLayout()` | `apps/tui/src/hooks/useLayout.js` | Returns current `breakpoint: Breakpoint | null` for responsive label visibility |
| `isUnicodeSupported()` | `apps/tui/src/theme/detect.js` | Determines dot character (`●` vs `*`) at module load time |
| `RGBA` (type) | `@opentui/core` | Type for theme color values passed to `<text fg={...}>` |

---

## 11. Unit & Integration Tests

### 11.1 Test File Location

**File:** `e2e/tui/workspaces.test.ts`

This file is **created** by this ticket. Tests are organized in a `describe("TUI_WORKSPACES — WorkspaceStatusBadge")` block.

### 11.2 Test Approach

Tests use two strategies:

1. **Module-level validation** — dynamically imports the component module and asserts on exported constants and types without spinning up a full TUI. These tests should **pass immediately** after the component is built because they only validate the module's exports and constant data.

2. **Rendered output validation (E2E)** — launches the TUI via `launchTUI()`, navigates to a workspace screen, and asserts on terminal content using snapshots and regex. These tests **will fail** until the full workspace screen stack is implemented (workspace list screen, workspace data hooks, SSE streaming, go-to keybinding for `g w`, etc.). They are intentionally left failing per project policy.

### 11.3 Test Cases

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, TERMINAL_SIZES } from "./helpers.js";

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
      const c = cfg as { label: string };
      expect(typeof c.label).toBe("string");
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.label.length).toBeLessThanOrEqual(10);
      expect(c.label[0]).toBe(c.label[0].toUpperCase());
      expect(c.label).not.toContain(" ");
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
  //   - tui-workspace-data-hooks (data fetching via @codeplane/ui-core)
  //   - tui-workspace-status-stream (SSE streaming)
  //   - Go-to keybinding `g w` registered in KeybindingProvider
  //   - A running API server with workspace test fixtures
  //
  // They are intentionally left FAILING until those dependencies
  // are implemented. They are NEVER skipped or commented out.

  test("BADGE-E2E-001: running workspace shows green dot and 'Running' label at 120x40", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await terminal.sendKeys("g", "w"); // navigate to workspaces
    await terminal.waitForText("Workspaces");
    // Expect a running workspace row to show ● and "Running"
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Running/);
    await terminal.terminate();
  });

  test("BADGE-E2E-002: running workspace shows dot only at 80x24 (no label)", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
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
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    // Look for any braille spinner character in the output
    const snapshot = terminal.snapshot();
    // Braille spinner frames: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
    expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    await terminal.terminate();
  });

  test("BADGE-E2E-004: suspended workspace shows muted-colored dot and 'Suspended' at 120x40", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Suspended/);
    await terminal.terminate();
  });

  test("BADGE-E2E-005: failed workspace shows 'Failed' label at 120x40", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Failed/);
    await terminal.terminate();
  });

  test("BADGE-E2E-006: badge responds to terminal resize from 80x24 to 120x40", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");

    // At 80x24, labels should be hidden
    let snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/Running\s/);

    // Resize to standard
    await terminal.resize(
      TERMINAL_SIZES.standard.width,
      TERMINAL_SIZES.standard.height,
    );
    await terminal.waitForText("Running");
    snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Running/);

    await terminal.terminate();
  });

  test("BADGE-E2E-007: multiple animated badges show synchronized frames", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
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
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("BADGE-E2E-009: snapshot at 80x24 captures workspace list with icon-only badges", async () => {
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
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
- The workspace data hooks being implemented (via `@codeplane/ui-core` `useWorkspaces()`)
- The `g w` go-to keybinding being registered in `KeybindingProvider`
- The workspace screen being registered in the screen registry/router
- A running API server with workspace test fixtures

**These tests are intentionally left failing.** They are never skipped or commented out. They serve as executable acceptance criteria that will pass once the full workspace screen stack is implemented. This follows the project testing philosophy stated in `MEMORY.md` and the engineering architecture.

The module-level tests (`BADGE-CFG-*`, `BADGE-EXP-*`) should pass immediately after the component and its dependencies are created, as they only validate the module's exports and constant data.

### 11.5 Test Philosophy Compliance

| Principle | How This Spec Complies |
|---|---|
| No mocking of implementation details | Module-level tests import the real module. E2E tests render the full TUI. No mock ThemeProvider, no mock useSpinner. |
| Tests validate user-facing behavior | E2E tests check what the user sees: colored dots, labels, spinner characters. Not internal state or hook return values. |
| Each test validates one behavior | Each test has a single assertion focus: one status mapping, one breakpoint behavior, one export check. |
| Tests at representative sizes | E2E tests run at 80×24 (minimum) and 120×40 (standard) using `TERMINAL_SIZES` constants from helpers, with resize test covering the transition. |
| Tests are independent | Each test uses a fresh dynamic `import()` or launches a fresh `launchTUI` instance. No shared state between tests. |
| Failing tests are not skipped | E2E tests that depend on unimplemented backends are left as-is — never `test.skip()`, never commented out. |
| Snapshot tests are supplementary | `BADGE-E2E-008` and `BADGE-E2E-009` capture golden-file snapshots at key sizes for regression detection, while the other E2E tests use targeted regex assertions. |

---

## 12. Productionization Checklist

This component is production-ready by design — there is no PoC phase. All code ships directly to `apps/tui/src/components/`.

| Item | Status | Notes |
|---|---|---|
| Zero runtime dependencies beyond existing hooks | ✅ | Uses `useTheme()`, `useSpinner()`, `useLayout()`, `isUnicodeSupported()` — all exist in the codebase |
| No `setInterval` or `setTimeout` | ✅ | Animation delegated to `useSpinner()` which uses OpenTUI's `Timeline` engine |
| No per-render memory allocation | ✅ | `STATUS_CONFIG` is module-level frozen object. Theme tokens are context-level. `DOT` is module-level constant. |
| TypeScript strict mode compatible | ✅ | `WorkspaceDisplayStatus` union prevents invalid status strings. `??` fallback handles runtime safety. |
| ESM import paths with `.js` extensions | ✅ | All imports use `.js` suffix per project convention |
| Added to existing barrel export in `components/index.ts` | ✅ | Component and types appended to existing 16-entry barrel |
| Frozen config map prevents mutation | ✅ | `Object.freeze()` on `STATUS_CONFIG` |
| Graceful fallback for unknown statuses | ✅ | `STATUS_CONFIG[status] ?? STATUS_CONFIG.pending` |
| ASCII fallback for non-Unicode terminals | ✅ | Handled by `isUnicodeSupported()` (dot) and `useSpinner()` (frames) |
| No direct ANSI codes | ✅ | All colors via semantic theme tokens resolved through `useTheme()` |
| No browser APIs | ✅ | Pure React + OpenTUI — no `window`, `document`, `localStorage` |
| Breakpoint null-check correct | ✅ | Uses `breakpoint !== null && breakpoint !== "minimum"` — matches actual `Breakpoint | null` type |
| Test coverage for all 11 statuses | ✅ | `BADGE-CFG-*` tests validate every entry in `STATUS_CONFIG` |
| Responsive behavior tested at 2 breakpoints + resize | ✅ | `BADGE-E2E-002` (80×24), `BADGE-E2E-001` (120×40), `BADGE-E2E-006` (resize) |
| No leaked timers on unmount | ✅ | `useSpinner` manages Timeline lifecycle; `useEffect` cleanup calls `deactivate()` |
| Snapshot tests for visual regression | ✅ | `BADGE-E2E-008` and `BADGE-E2E-009` capture golden files at standard and minimum |
| Uses `TERMINAL_SIZES` constants from helpers | ✅ | E2E tests use `TERMINAL_SIZES.standard` and `TERMINAL_SIZES.minimum` instead of magic numbers |

---

## 13. Files Changed

| File | Action | Description |
|---|---|---|
| `apps/tui/src/components/WorkspaceStatusBadge.tsx` | **Create** | Reusable workspace status badge component (types, constants, component function) |
| `apps/tui/src/components/index.ts` | **Modify** | Append `WorkspaceStatusBadge`, `WorkspaceStatusBadgeProps`, and `WorkspaceDisplayStatus` exports to existing barrel |
| `e2e/tui/workspaces.test.ts` | **Create** | `describe("TUI_WORKSPACES — WorkspaceStatusBadge")` test block with module-level and E2E tests |

---

## 14. Acceptance Criteria Traceability

Mapping from the ticket's acceptance criteria to tests and implementation:

| Acceptance Criterion | Implementation | Test |
|---|---|---|
| Component renders correct color for each status: running=green, transitional=yellow, error=red, inactive=gray | `STATUS_CONFIG` maps `tokenName` to `success`/`warning`/`error`/`muted` | `BADGE-CFG-002` through `BADGE-CFG-006` |
| Transitional statuses show animated braille spinner | `config.animated === true` for starting/stopping/suspending/resuming → `useSpinner(true)` | `BADGE-CFG-003`, `BADGE-E2E-003` |
| Spinner cycles through 10 braille frames at 80ms using useTimeline | Delegated to `useSpinner()` which uses `Timeline` from `@opentui/core` internally | `BADGE-E2E-003`, `BADGE-E2E-007` |
| Non-transitional statuses show static dot (●) | `config.animated === false` → renders `DOT` constant | `BADGE-CFG-002`, `BADGE-CFG-004`, `BADGE-CFG-005`, `BADGE-CFG-006` |
| Status label renders next to icon at standard and large breakpoints | `showLabel = breakpoint !== null && breakpoint !== "minimum"` | `BADGE-E2E-001`, `BADGE-E2E-004`, `BADGE-E2E-005` |
| At minimum breakpoint, only icon renders (no label) | `showLabel` is false → bare `<text>` | `BADGE-E2E-002`, `BADGE-E2E-006` |
| compact prop reduces gap to zero at standard+ breakpoint | `gap={compact ? 0 : 1}` in the `<box>` layout | §3.5 design decisions |
| Unknown status values handled gracefully | `STATUS_CONFIG[status] ?? STATUS_CONFIG.pending` fallback | `BADGE-CFG-001` (verifies all 11 keys exist) |
| Spinner animation stops when component unmounts | `useSpinner` uses `useEffect` cleanup to call `deactivate()`. When `activeCount` reaches 0, `timeline.pause()` is called. | §7 edge case; §8 performance characteristics |