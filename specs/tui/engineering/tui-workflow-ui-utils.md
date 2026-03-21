# Engineering Specification: `tui-workflow-ui-utils`

## Title
Create shared workflow UI utilities: status icons, duration formatting, color mapping

## Status
`Partial` — Utility module to be created as a prerequisite for all Workflows screen components.

## Ticket Dependencies
- **`tui-theme-provider`** — Required. This module resolves colors via `CoreTokenName` references into `ThemeTokens`. The `ThemeProvider` and `useTheme()` hook must be available. The `statusToToken()` function from `apps/tui/src/theme/tokens.ts` is also consumed by sibling infrastructure but this module is decoupled from it — it owns its own status→token mapping for workflow-specific semantics.

## 1. Overview

This ticket creates a single, pure-function utility module at `apps/tui/src/screens/Workflows/utils.ts` that provides all shared formatting, icon-mapping, and color-resolution logic needed by the Workflows screen family (WorkflowListScreen, WorkflowRunListScreen, WorkflowRunDetailScreen, log viewer, artifact/cache views).

Every function is **pure** — no React dependencies, no context access, no side effects, no IO. Functions accept primitives and return plain objects or strings. This allows the module to be consumed by components, hooks, and tests without a React rendering context.

The module follows the established pattern from `apps/tui/src/screens/Agents/utils/` — small, focused functions with explicit fallback handling, Unicode/ASCII dual-mode support, and `CoreTokenName` references (not raw RGBA values).

### 1.1 Why workflow-specific utils instead of the generic `statusToToken()`?

The platform-level `statusToToken()` in `apps/tui/src/theme/tokens.ts` maps generic entity states ("open", "active", "pending", "closed", etc.) to semantic color tokens. The Workflows domain requires finer-grained mappings with different semantics:

| Status | `statusToToken()` | Workflow utils |
|--------|-------------------|----------------|
| `queued` | `"warning"` | `"primary"` (cyan) — visually distinct from active running |
| `running` | `"success"` | `"warning"` (yellow) — in-progress, not yet succeeded |
| `cancelled` | `"error"` | `"muted"` — terminal but non-actionable |

These divergences are intentional product design choices for the Workflows surface. The Workflows utils module is authoritative for workflow status coloring.

### 1.2 Relationship to Agents utils

The Agents screen (`apps/tui/src/screens/Agents/utils/`) established the file-per-function pattern with `sessionStatusIcon.ts`, `formatDuration.ts`, `formatMessageCount.ts`, etc. The Workflows utils module consolidates its utilities into a single file because:

1. All 10 functions share the same domain types (`WorkflowRunStatus`, `CoreTokenName`).
2. Several functions compose internally (`getMiniStatusBar` calls `getRunStatusIcon`).
3. The module has no external imports beyond type-only references.
4. A single file eliminates circular import risk within the Workflows screen.

If the module grows beyond ~300 lines in future tickets, it should be split following the Agents file-per-function pattern.

## 2. File Location

**Primary module:**
```
apps/tui/src/screens/Workflows/utils.ts
```

**Re-exported from screen index:**
```
apps/tui/src/screens/Workflows/index.ts
```

## 3. Type Definitions

The utility module depends on existing types and introduces three local types.

### 3.1 Imported types

```typescript
import type { WorkflowRunStatus } from "../../hooks/workflow-types.js";
import type { CoreTokenName } from "../../theme/tokens.js";
```

Both are type-only imports — no runtime dependency on the theme system or hooks.

### 3.2 New types defined in this file

```typescript
/**
 * Icon + color configuration for workflow status rendering.
 *
 * Follows the StatusIconConfig pattern from Agents screen but adds
 * the `label` field for textual status display in constrained layouts.
 *
 * `color` is a CoreTokenName (e.g., "success", "error") — resolved to
 * RGBA by the consuming component via useTheme()[color].
 */
export interface WorkflowStatusIcon {
  /** Unicode icon character (e.g., "✓", "✗", "◎") */
  icon: string;
  /** ASCII fallback for non-Unicode terminals (e.g., "[OK]", "[FL]") */
  fallback: string;
  /** Semantic color token name — key into ThemeTokens */
  color: CoreTokenName;
  /** Whether to render with bold text attribute */
  bold: boolean;
  /** Human-readable status label (e.g., "Success", "Running") */
  label: string;
}

/**
 * Step status identifiers used by WorkflowRunNode.status.
 *
 * The API returns these as strings on WorkflowRunNode.status.
 * This type narrows the union for exhaustive pattern matching.
 */
export type StepStatus = "success" | "failure" | "running" | "pending" | "skipped";

/**
 * A compact run summary for mini status bar rendering.
 * Consumed by getMiniStatusBar().
 */
export interface MiniRun {
  status: WorkflowRunStatus;
}
```

### 3.3 Comparison with Agents' `StatusIconConfig`

The Agents screen defines `StatusIconConfig` in `apps/tui/src/screens/Agents/types.ts`:

```typescript
export interface StatusIconConfig {
  icon: string;
  fallback: string;
  color: string;    // untyped string
  bold: boolean;
}
```

`WorkflowStatusIcon` differs in two ways:
1. `color` is typed as `CoreTokenName` (not `string`) — enforces compile-time token validity.
2. Adds `label: string` — used for textual status display in constrained layouts where icons alone are insufficient.

A future unification ticket could align these types into a shared `StatusIconConfig<T extends string = string>` in `apps/tui/src/types/`. That is out of scope here.

## 4. Implementation Plan

Each function is specified with its exact signature, behavior, edge cases, and rationale.

### Step 1: Create the `Workflows/` directory scaffold

Create the directory structure:

```
apps/tui/src/screens/Workflows/
├── utils.ts      ← this ticket
└── index.ts      ← re-exports from utils.ts
```

**File: `apps/tui/src/screens/Workflows/index.ts`**
```typescript
export {
  // Types
  type WorkflowStatusIcon,
  type StepStatus,
  type MiniRun,
  // Run status
  getRunStatusIcon,
  getRunStatusIconNoColor,
  // Step status
  getStepStatusIcon,
  getStepStatusIconNoColor,
  // Formatting
  formatDuration,
  getDurationColor,
  formatRelativeTime,
  getMiniStatusBar,
  formatBytes,
  abbreviateSHA,
  formatRunCount,
} from "./utils.js";
```

### Step 2: Implement `getRunStatusIcon(status)`

Maps a `WorkflowRunStatus` to a `WorkflowStatusIcon`.

**Lookup table (module-level constant, allocated once):**

```typescript
const RUN_STATUS_ICONS: Record<WorkflowRunStatus, WorkflowStatusIcon> = {
  success:   { icon: "✓", fallback: "[OK]", color: "success", bold: false, label: "Success" },
  failure:   { icon: "✗", fallback: "[FL]", color: "error",   bold: true,  label: "Failure" },
  running:   { icon: "◎", fallback: "[..]", color: "warning", bold: true,  label: "Running" },
  queued:    { icon: "◌", fallback: "[__]", color: "primary", bold: false, label: "Queued" },
  cancelled: { icon: "✕", fallback: "[XX]", color: "muted",  bold: false, label: "Cancelled" },
  error:     { icon: "⚠", fallback: "[ER]", color: "error",   bold: true,  label: "Error" },
};
```

**Signature:**
```typescript
export function getRunStatusIcon(status: WorkflowRunStatus): WorkflowStatusIcon;
```

**Behavior:**
- Exhaustive lookup from `RUN_STATUS_ICONS` record.
- Unknown status values (defensive, since `WorkflowRunStatus` is a union): return a fallback with `icon: "?", fallback: "[??]", color: "muted", bold: false, label: "Unknown"`.

**Icon character table:**

| Status | Icon | Unicode | Description |
|--------|------|---------|-------------|
| `success` | ✓ | U+2713 | Check mark |
| `failure` | ✗ | U+2717 | Ballot X |
| `running` | ◎ | U+25CE | Bullseye |
| `queued` | ◌ | U+25CC | Dotted circle |
| `cancelled` | ✕ | U+2715 | Multiplication X |
| `error` | ⚠ | U+26A0 | Warning sign |

**Design decisions:**
- `queued` uses `"primary"` (cyan/blue) rather than `"warning"` to visually distinguish "waiting to start" from "actively running". This matches the PRD's color table: `queued(◌/cyan)`.
- `error` is distinct from `failure`. `failure` = workflow ran and a step failed. `error` = infrastructure/orchestration error. Both use `"error"` token but `error` includes a warning triangle icon.
- `cancelled` uses `"muted"` to de-emphasize terminal-but-non-actionable runs.
- `failure` and `error` use `bold: true` to draw visual urgency — matching the established Agents pattern where `active` sessions are bolded.

### Step 3: Implement `getStepStatusIcon(status)`

Maps a step/node status string to a `WorkflowStatusIcon`.

**Lookup table:**

```typescript
const STEP_STATUS_ICONS: Record<StepStatus, WorkflowStatusIcon> = {
  success: { icon: "✓", fallback: "[OK]", color: "success", bold: false, label: "Success" },
  failure: { icon: "✗", fallback: "[FL]", color: "error",   bold: true,  label: "Failure" },
  running: { icon: "◎", fallback: "[..]", color: "warning", bold: true,  label: "Running" },
  pending: { icon: "◌", fallback: "[__]", color: "muted",   bold: false, label: "Pending" },
  skipped: { icon: "⊘", fallback: "[SK]", color: "muted",   bold: false, label: "Skipped" },
};
```

**Signature:**
```typescript
export function getStepStatusIcon(status: string): WorkflowStatusIcon;
```

**Behavior:**
- Accepts `string` (not `StepStatus`) because `WorkflowRunNode.status` is typed as `string` in the API response model (see `workflow-types.ts` line 53).
- Lowercases the input and performs a guarded lookup in `STEP_STATUS_ICONS`.
- Unknown status values return: `{ icon: "?", fallback: "[??]", color: "muted", bold: false, label: status }` — the raw status string is preserved as the label so it's visible for debugging in the UI.

**Design decisions:**
- `pending` in steps uses `"muted"` (not `"primary"` like queued runs) because pending steps are not individually actionable — they're just "not yet started."
- `skipped` uses `⊘` (circled division slash, U+2298) — distinct from cancelled `✕` used at the run level.
- Accepts `string` instead of the narrower `StepStatus` type for API resilience — the server may introduce new step statuses without a client update.

**Implementation guard pattern:**
```typescript
export function getStepStatusIcon(status: string): WorkflowStatusIcon {
  const normalized = status.toLowerCase();
  if (
    normalized === "success" ||
    normalized === "failure" ||
    normalized === "running" ||
    normalized === "pending" ||
    normalized === "skipped"
  ) {
    return STEP_STATUS_ICONS[normalized];
  }
  return { icon: "?", fallback: "[??]", color: "muted", bold: false, label: status };
}
```

Explicit string equality checks are used instead of `normalized in STEP_STATUS_ICONS` because the `in` operator doesn't narrow the type for Record indexing.

### Step 4: Implement no-color fallback variants

No-color fallback variants return the same `WorkflowStatusIcon` but with `color: "muted"` for all statuses and `bold: false`. Used when `NO_COLOR` is set or in pipe/logging contexts.

**Signatures:**
```typescript
export function getRunStatusIconNoColor(status: WorkflowRunStatus): WorkflowStatusIcon;
export function getStepStatusIconNoColor(status: string): WorkflowStatusIcon;
```

**Behavior:**
- Calls the standard function, then returns a new object with `color` overridden to `"muted"` and `bold` set to `false`.
- Preserves `icon`, `fallback`, and `label` so the textual output is still meaningful.
- Returns a new object via spread — the lookup table originals are never mutated.

**Implementation:**
```typescript
export function getRunStatusIconNoColor(status: WorkflowRunStatus): WorkflowStatusIcon {
  const base = getRunStatusIcon(status);
  return { ...base, color: "muted", bold: false };
}

export function getStepStatusIconNoColor(status: string): WorkflowStatusIcon {
  const base = getStepStatusIcon(status);
  return { ...base, color: "muted", bold: false };
}
```

### Step 5: Implement `formatDuration(seconds)`

Formats a number of seconds into a compact human-readable duration string.

**Signature:**
```typescript
export function formatDuration(seconds: number | null | undefined): string;
```

**Behavior:**

| Input | Output | Rule |
|-------|--------|------|
| `null` / `undefined` | `"—"` (em dash, U+2014) | No data |
| `NaN` / `Infinity` / `-Infinity` | `"—"` | Invalid numeric |
| Negative values | `"—"` | Invalid duration |
| `0` | `"0s"` | Zero is valid |
| `45` | `"45s"` | Seconds only |
| `45.9` | `"45s"` | Floor fractional |
| `60` | `"1m 0s"` | Minutes boundary |
| `83` | `"1m 23s"` | Minutes + seconds |
| `3600` | `"1h 0m"` | Hours boundary |
| `7500` | `"2h 5m"` | Hours + minutes |
| `86400` | `"24h 0m"` | Large value |

**Implementation:**
```typescript
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return `${m}m ${remS}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}
```

**Differences from Agents `formatDuration`** (`apps/tui/src/screens/Agents/utils/formatDuration.ts`):
- Agents version takes ISO timestamps (`startedAt`, `finishedAt`) and computes delta internally using `Date.now()` for in-progress sessions.
- This version takes pre-computed seconds (from `WorkflowRunNode.duration_seconds` field in `workflow-types.ts` line 58, or computed externally from `started_at`/`completed_at`).
- No `Date.now()` dependency — fully deterministic for testing.
- Same output format (`Xs`, `Xm Ys`, `Xh Ym`) for visual consistency across screens.

### Step 6: Implement `getDurationColor(seconds)`

Returns a `CoreTokenName` based on duration thresholds for visual urgency indication.

**Signature:**
```typescript
export function getDurationColor(seconds: number | null | undefined): CoreTokenName;
```

**Behavior:**

| Range | Token | Rationale |
|-------|-------|-----------|
| `null`/`undefined`/`NaN`/`Infinity`/negative | `"muted"` | No data, no urgency |
| `0 – 59` | `"success"` | Fast — green |
| `60 – 299` | `"muted"` | Normal — default (no visual signal) |
| `300 – 899` | `"warning"` | Slow — yellow attention |
| `900+` | `"error"` | Very slow — red alert |

**Boundary precision:**
- Boundaries are exclusive on the left, inclusive on the right: `seconds < 60` → success, `seconds < 300` → muted, etc.
- `0` maps to `"success"` (instant completion is good).

**Implementation:**
```typescript
export function getDurationColor(seconds: number | null | undefined): CoreTokenName {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "muted";
  }
  if (seconds < 60) return "success";
  if (seconds < 300) return "muted";
  if (seconds < 900) return "warning";
  return "error";
}
```

### Step 7: Implement `formatRelativeTime(timestamp)`

Formats an ISO-8601 timestamp into a compact relative time string.

**Signature:**
```typescript
export function formatRelativeTime(timestamp: string | null | undefined, now?: Date): string;
```

**Behavior:**

| Delta from `now` | Output | Boundary |
|------------------|--------|----------|
| `null`/`undefined`/invalid/empty | `"—"` | — |
| < 60s ago | `"now"` | `deltaSec < 60` |
| 1–59 minutes | `"Xm"` | `deltaMin < 60` |
| 1–23 hours | `"Xh"` | `deltaHr < 24` |
| 1–6 days | `"Xd"` | `deltaDay < 7` |
| 7–29 days | `"Xw"` | `deltaDay < 30` |
| 30–364 days | `"Xmo"` | `deltaDay < 365` |
| 365+ days | `"Xy"` | — |
| Future timestamps | `"now"` | clamped via `Math.max(0, ...)` |

**Implementation:**
```typescript
export function formatRelativeTime(timestamp: string | null | undefined, now?: Date): string {
  if (!timestamp) return "—";
  try {
    const then = new Date(timestamp).getTime();
    if (Number.isNaN(then)) return "—";
    const nowMs = (now ?? new Date()).getTime();
    const deltaSec = Math.max(0, Math.floor((nowMs - then) / 1000));
    if (deltaSec < 60) return "now";
    const deltaMin = Math.floor(deltaSec / 60);
    if (deltaMin < 60) return `${deltaMin}m`;
    const deltaHr = Math.floor(deltaMin / 60);
    if (deltaHr < 24) return `${deltaHr}h`;
    const deltaDay = Math.floor(deltaHr / 24);
    if (deltaDay < 7) return `${deltaDay}d`;
    if (deltaDay < 30) return `${Math.floor(deltaDay / 7)}w`;
    if (deltaDay < 365) return `${Math.floor(deltaDay / 30)}mo`;
    return `${Math.floor(deltaDay / 365)}y`;
  } catch {
    return "—";
  }
}
```

**Design decisions:**
- The optional `now` parameter enables deterministic testing without `Date.now()` mocking or `bun:test` timers.
- Compact format (`3d`, `1w`, `2mo`) matches the ticket spec and fits within the constrained column widths of list rows (typically 4–6 characters).
- Future timestamps are clamped to `"now"` — handles clock skew between client and server without showing confusing negative durations.
- The `try/catch` guards against `Date` constructor edge cases with malformed strings.
- Empty string (`""`) is caught by the initial `!timestamp` falsy check.

### Step 8: Implement `getMiniStatusBar(recentRuns)`

Generates a 5-character colored dot array representing the last N run statuses, displayed in the workflow list rows.

**Signature:**
```typescript
export function getMiniStatusBar(
  recentRuns: readonly MiniRun[],
): Array<{ char: string; color: CoreTokenName }>;
```

**Character mapping:**

```typescript
const MINI_DOT: Record<WorkflowRunStatus, string> = {
  success:   "●",  // U+25CF Black circle (filled = complete)
  failure:   "●",  // U+25CF Same shape, color differentiates
  running:   "◎",  // U+25CE Bullseye (active)
  queued:    "○",  // U+25CB White circle (empty = waiting)
  cancelled: "·",  // U+00B7 Middle dot (minimal)
  error:     "●",  // U+25CF Filled, red color differentiates
};
const EMPTY_DOT = { char: "·", color: "muted" as CoreTokenName };
```

**Behavior:**
- Takes the first 5 runs from the input array (or fewer if fewer exist).
- Returns an array of `{ char, color }` tuples — one per run, preserving input order (most recent first by convention of the caller).
- Pads with `{ char: "·", color: "muted" }` when fewer than 5 runs exist.
- Always returns exactly 5 elements — ensures consistent column width in list views.
- Color for each slot is derived from `getRunStatusIcon(status).color` — reuses the authoritative run status color mapping.
- Unknown statuses in `MiniRun` fall back to `"·"` char via the `??` operator.

**Implementation:**
```typescript
export function getMiniStatusBar(
  recentRuns: readonly MiniRun[],
): Array<{ char: string; color: CoreTokenName }> {
  const slots: Array<{ char: string; color: CoreTokenName }> = [];
  const runs = recentRuns.slice(0, 5);
  for (const run of runs) {
    const dot = MINI_DOT[run.status] ?? "·";
    const color = getRunStatusIcon(run.status).color;
    slots.push({ char: dot, color });
  }
  while (slots.length < 5) {
    slots.push({ ...EMPTY_DOT });
  }
  return slots;
}
```

**Design decisions:**
- Returns structured `{ char, color }` array (not a pre-rendered string) so the consuming component can apply `useTheme()` color resolution per-character using OpenTUI `<text>` elements.
- Fixed 5-slot width ensures consistent column alignment in list views regardless of run history depth.
- `{ ...EMPTY_DOT }` spread creates new objects for each padding slot — prevents shared mutable references if a consumer modifies a slot.

### Step 9: Implement `formatBytes(bytes)`

Formats a byte count into a human-readable size string.

**Signature:**
```typescript
export function formatBytes(bytes: number | null | undefined): string;
```

**Behavior:**

| Input | Output | Rule |
|-------|--------|------|
| `null`/`undefined`/`NaN`/`Infinity`/negative | `"—"` | Invalid |
| `0` | `"0 B"` | Special case |
| `89` | `"89 B"` | Bytes, integer |
| `1024` | `"1.0 KB"` | < 10, one decimal |
| `345 * 1024` (353280) | `"345 KB"` | ≥ 10, integer |
| `2.1 * 1024²` | `"2.1 MB"` | < 10, one decimal |
| `1.2 * 1024³` | `"1.2 GB"` | < 10, one decimal |
| `2 * 1024⁴` | `"2.0 TB"` | < 10, one decimal |

**Implementation:**
```typescript
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes === 0) return "0 B";
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exp);
  const unit = BYTE_UNITS[exp];
  if (exp === 0) return `${Math.floor(value)} ${unit}`;
  if (value < 10) return `${value.toFixed(1)} ${unit}`;
  return `${Math.floor(value)} ${unit}`;
}
```

**Design decisions:**
- Uses 1024-based (binary) units — standard for file sizes in developer tools. Not SI (1000-based).
- Single decimal place for values under 10 (e.g., `2.1 MB`) for precision at small magnitudes; integer for larger values (e.g., `345 KB`) to save horizontal space in constrained list columns.
- `TB` is included for completeness even though workflow artifacts rarely exceed GB — future-proofing without cost.
- `BYTE_UNITS` array bounds are guarded by `Math.min(..., BYTE_UNITS.length - 1)` to prevent index overflow on astronomically large values.

### Step 10: Implement `abbreviateSHA(sha)`

Truncates a full SHA hash to its 7-character abbreviated form.

**Signature:**
```typescript
export function abbreviateSHA(sha: string | null | undefined): string;
```

**Behavior:**
- Returns first 7 characters of the input string.
- `null`/`undefined`/empty → `"—"`.
- Strings shorter than 7 characters are returned as-is (no padding).
- Does not validate hex format — any string is truncated.

**Implementation:**
```typescript
export function abbreviateSHA(sha: string | null | undefined): string {
  if (!sha || sha.length === 0) return "—";
  return sha.slice(0, 7);
}
```

**Design decision:** 7 characters is the git-standard short SHA length and is sufficient for uniqueness within a single repository. This matches `WorkflowRun.trigger_commit_sha` truncation needs.

### Step 11: Implement `formatRunCount(n)`

Formats a run count with K-abbreviation for large numbers.

**Signature:**
```typescript
export function formatRunCount(n: number | null | undefined): string;
```

**Behavior:**

| Input | Output | Rule |
|-------|--------|------|
| `null`/`undefined` | `"0"` | Default to zero (not em dash — zero runs is meaningful data) |
| `0` | `"0"` | Plain number |
| `42` | `"42"` | Plain number |
| `999` | `"999"` | No K (boundary) |
| `1000` | `"1.0K"` | K suffix, one decimal |
| `1500` | `"1.5K"` | K suffix, one decimal |
| `9999` | `"10.0K"` | K suffix, one decimal |
| `10000` | `"10K"` | K suffix, integer |
| `153200` | `"153K"` | K suffix, integer |

**Implementation:**
```typescript
export function formatRunCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  if (n < 1000) return String(n);
  const k = n / 1000;
  if (k < 10) return `${k.toFixed(1)}K`;
  return `${Math.floor(k)}K`;
}
```

**Design decision:** Unlike `formatBytes` and `formatDuration`, `null`/`undefined` returns `"0"` instead of `"—"` because a null run count semantically means "no runs" (countable zero), not "data unavailable."

### Step 12: Re-export from index

**File: `apps/tui/src/screens/Workflows/index.ts`**

```typescript
export {
  // Types
  type WorkflowStatusIcon,
  type StepStatus,
  type MiniRun,
  // Run status
  getRunStatusIcon,
  getRunStatusIconNoColor,
  // Step status
  getStepStatusIcon,
  getStepStatusIconNoColor,
  // Formatting
  formatDuration,
  getDurationColor,
  formatRelativeTime,
  getMiniStatusBar,
  formatBytes,
  abbreviateSHA,
  formatRunCount,
} from "./utils.js";
```

**Note:** This index file will grow as subsequent tickets add screen components (WorkflowListScreen, WorkflowRunDetailScreen, etc.). At that point, the pattern should match the Agents screen: export screen components from the index, and keep utils as direct imports within the screen's own components.

## 5. Integration with Theme System

Components consuming these utilities resolve colors like this:

```typescript
import { getRunStatusIcon } from "./utils.js";
import { useTheme } from "../../hooks/useTheme.js";
import { isUnicodeSupported } from "../../theme/detect.js";

function RunStatusBadge({ status }: { status: WorkflowRunStatus }) {
  const theme = useTheme();
  const unicode = isUnicodeSupported();
  const { icon, fallback, color, bold, label } = getRunStatusIcon(status);

  return (
    <text fg={theme[color]} bold={bold}>
      {unicode ? icon : fallback} {label}
    </text>
  );
}
```

The utility module itself **never** imports `useTheme()`, `RGBA`, or `@opentui/core`. It only references `CoreTokenName` strings via type-only imports. This keeps it pure and testable without a React or OpenTUI runtime environment.

## 6. No-Color Strategy

Two levels of no-color support:

1. **Per-character fallback:** `isUnicodeSupported()` from `theme/detect.ts` determines whether to use `icon` or `fallback` from the `WorkflowStatusIcon`. This is a component-level concern — the utility module provides both options.

2. **Full no-color mode:** `getRunStatusIconNoColor()` and `getStepStatusIconNoColor()` return icons with `color: "muted"` and `bold: false`. Used when rendering in pipe mode, log output, or when `NO_COLOR` is detected at the component level.

The decision tree in the component:
```
NO_COLOR set?
  └─ yes → use getRunStatusIconNoColor() + fallback string
  └─ no → isUnicodeSupported()?
       └─ yes → use getRunStatusIcon().icon
       └─ no  → use getRunStatusIcon().fallback
```

## 7. Productionization Notes

### 7.1 No POC code

This module is pure utility functions. There is no POC phase — the functions are deterministic, have no external dependencies beyond type imports, and can be unit-tested exhaustively from day one. No code in `poc/` is needed.

### 7.2 Module-level constants

All icon/color lookup tables (`RUN_STATUS_ICONS`, `STEP_STATUS_ICONS`, `MINI_DOT`, `BYTE_UNITS`, `EMPTY_DOT`) are module-level constants allocated once at import time. No per-call allocation for the common path — lookup returns an existing object reference from the record.

The `getRunStatusIconNoColor` and `getStepStatusIconNoColor` functions do allocate a new object via spread on each call. This is acceptable because:
1. No-color mode is the uncommon path.
2. The objects are small (5 string/boolean fields).
3. GC pressure is negligible at TUI interaction rates.

### 7.3 Defensive coding

Every function handles `null`, `undefined`, `NaN`, `Infinity`, empty strings, and unknown enum values gracefully with `"—"` or `"muted"` fallbacks. The API may return unexpected status strings during schema evolution — the utils must never throw. The `formatRelativeTime` function additionally wraps its core logic in a `try/catch` as a final safety net against `Date` constructor edge cases.

### 7.4 No `Date.now()` dependency

`formatRelativeTime()` accepts an optional `now` parameter. In production, components pass nothing (defaults to `new Date()`). In tests, a fixed `now` is injected for deterministic assertions. `formatDuration()` takes seconds directly — no internal Date computation. This makes the entire module clock-independent.

### 7.5 Tree-shaking

All exports are named exports (no default export). Unused functions are tree-shakeable by Bun's bundler in production builds. The module has no side effects at the top level beyond constant allocation.

### 7.6 Future extensibility

When new `WorkflowRunStatus` values are added to the API (e.g., `"timed_out"`, `"waiting"`):
1. Add the new status to `WorkflowRunStatus` union in `workflow-types.ts`.
2. Add the corresponding entry to `RUN_STATUS_ICONS` in `utils.ts`.
3. TypeScript will emit a compile error if the Record is incomplete — the `Record<WorkflowRunStatus, WorkflowStatusIcon>` type ensures exhaustive coverage.
4. The `getMiniStatusBar` function automatically picks up new statuses via its `getRunStatusIcon` delegation.

For `StepStatus`, the guard-clause pattern in `getStepStatusIcon` means new statuses are handled gracefully at runtime (shown as `"?"`) until the type and lookup table are updated.

## 8. Unit & Integration Tests

### 8.1 Test file location

```
e2e/tui/workflow-utils.test.ts
```

### 8.2 Test framework

Uses `bun:test` (the Bun-native test runner) with `describe`/`test`/`expect`. 

**Why not `@microsoft/tui-test`?** The `@microsoft/tui-test` framework is designed for terminal rendering snapshot matching and keyboard interaction simulation — it provides `createTestTui`, `launchTUI`, and terminal buffer assertions. This pure utility module has no terminal rendering, no keyboard input, and no React components. Direct `bun:test` assertions on function return values are sufficient and more maintainable for deterministic function output.

The `@microsoft/tui-test` snapshot and `launchTUI()` patterns are reserved for the workflow screen integration tests (in `e2e/tui/workflows.test.ts`) where these utils are exercised through the actual TUI rendering pipeline.

### 8.3 Import path

```typescript
import { describe, test, expect } from "bun:test";
import {
  getRunStatusIcon,
  getRunStatusIconNoColor,
  getStepStatusIcon,
  getStepStatusIconNoColor,
  formatDuration,
  getDurationColor,
  formatRelativeTime,
  getMiniStatusBar,
  formatBytes,
  abbreviateSHA,
  formatRunCount,
  type WorkflowStatusIcon,
  type MiniRun,
} from "../../apps/tui/src/screens/Workflows/utils.js";
```

### 8.4 Test plan

#### `getRunStatusIcon` — 8 tests

```typescript
describe("getRunStatusIcon", () => {

  test("UTIL-RSI-001: success returns green check icon", () => {
    const result = getRunStatusIcon("success");
    expect(result.icon).toBe("✓");
    expect(result.color).toBe("success");
    expect(result.fallback).toBe("[OK]");
    expect(result.bold).toBe(false);
    expect(result.label).toBe("Success");
  });

  test("UTIL-RSI-002: failure returns red X icon with bold", () => {
    const result = getRunStatusIcon("failure");
    expect(result.icon).toBe("✗");
    expect(result.color).toBe("error");
    expect(result.bold).toBe(true);
    expect(result.label).toBe("Failure");
  });

  test("UTIL-RSI-003: running returns yellow circle with bold", () => {
    const result = getRunStatusIcon("running");
    expect(result.icon).toBe("◎");
    expect(result.color).toBe("warning");
    expect(result.bold).toBe(true);
    expect(result.label).toBe("Running");
  });

  test("UTIL-RSI-004: queued returns cyan open circle", () => {
    const result = getRunStatusIcon("queued");
    expect(result.icon).toBe("◌");
    expect(result.color).toBe("primary");
    expect(result.bold).toBe(false);
    expect(result.label).toBe("Queued");
  });

  test("UTIL-RSI-005: cancelled returns muted X mark", () => {
    const result = getRunStatusIcon("cancelled");
    expect(result.icon).toBe("✕");
    expect(result.color).toBe("muted");
    expect(result.bold).toBe(false);
    expect(result.label).toBe("Cancelled");
  });

  test("UTIL-RSI-006: error returns red warning triangle with bold", () => {
    const result = getRunStatusIcon("error");
    expect(result.icon).toBe("⚠");
    expect(result.color).toBe("error");
    expect(result.bold).toBe(true);
    expect(result.label).toBe("Error");
  });

  test("UTIL-RSI-007: all run statuses have distinct icons", () => {
    const statuses = ["success", "failure", "running", "queued", "cancelled", "error"] as const;
    const icons = statuses.map(s => getRunStatusIcon(s).icon);
    expect(new Set(icons).size).toBe(statuses.length);
  });

  test("UTIL-RSI-008: all run statuses have distinct fallbacks", () => {
    const statuses = ["success", "failure", "running", "queued", "cancelled", "error"] as const;
    const fallbacks = statuses.map(s => getRunStatusIcon(s).fallback);
    expect(new Set(fallbacks).size).toBe(statuses.length);
  });
});
```

#### `getStepStatusIcon` — 8 tests

```typescript
describe("getStepStatusIcon", () => {

  test("UTIL-SSI-001: success step returns green check", () => {
    const result = getStepStatusIcon("success");
    expect(result.icon).toBe("✓");
    expect(result.color).toBe("success");
  });

  test("UTIL-SSI-002: failure step returns red X with bold", () => {
    const result = getStepStatusIcon("failure");
    expect(result.icon).toBe("✗");
    expect(result.color).toBe("error");
    expect(result.bold).toBe(true);
  });

  test("UTIL-SSI-003: running step returns yellow circle", () => {
    const result = getStepStatusIcon("running");
    expect(result.icon).toBe("◎");
    expect(result.color).toBe("warning");
  });

  test("UTIL-SSI-004: pending step returns muted open circle", () => {
    const result = getStepStatusIcon("pending");
    expect(result.icon).toBe("◌");
    expect(result.color).toBe("muted");
  });

  test("UTIL-SSI-005: skipped step returns muted circle slash", () => {
    const result = getStepStatusIcon("skipped");
    expect(result.icon).toBe("⊘");
    expect(result.color).toBe("muted");
  });

  test("UTIL-SSI-006: unknown status returns question mark with muted color", () => {
    const result = getStepStatusIcon("some_unknown_status");
    expect(result.icon).toBe("?");
    expect(result.color).toBe("muted");
    expect(result.label).toBe("some_unknown_status");
  });

  test("UTIL-SSI-007: case insensitive lookup", () => {
    const result = getStepStatusIcon("SUCCESS");
    expect(result.icon).toBe("✓");
    expect(result.color).toBe("success");
  });

  test("UTIL-SSI-008: empty string returns unknown fallback", () => {
    const result = getStepStatusIcon("");
    expect(result.icon).toBe("?");
    expect(result.color).toBe("muted");
  });
});
```

#### No-color variants — 4 tests

```typescript
describe("getRunStatusIconNoColor", () => {

  test("UTIL-NC-001: no-color variant preserves icon and label but overrides color", () => {
    const result = getRunStatusIconNoColor("success");
    expect(result.icon).toBe("✓");
    expect(result.label).toBe("Success");
    expect(result.color).toBe("muted");
    expect(result.bold).toBe(false);
  });

  test("UTIL-NC-002: no-color variant for failure removes bold", () => {
    const result = getRunStatusIconNoColor("failure");
    expect(result.bold).toBe(false);
    expect(result.color).toBe("muted");
  });

  test("UTIL-NC-003: all no-color statuses use muted color", () => {
    const statuses = ["success", "failure", "running", "queued", "cancelled", "error"] as const;
    for (const s of statuses) {
      expect(getRunStatusIconNoColor(s).color).toBe("muted");
    }
  });
});

describe("getStepStatusIconNoColor", () => {

  test("UTIL-NC-004: step no-color variant overrides color to muted", () => {
    const result = getStepStatusIconNoColor("failure");
    expect(result.icon).toBe("✗");
    expect(result.color).toBe("muted");
    expect(result.bold).toBe(false);
  });
});
```

#### `formatDuration` — 13 tests

```typescript
describe("formatDuration", () => {

  test("UTIL-FD-001: null returns em dash", () => {
    expect(formatDuration(null)).toBe("—");
  });

  test("UTIL-FD-002: undefined returns em dash", () => {
    expect(formatDuration(undefined)).toBe("—");
  });

  test("UTIL-FD-003: zero returns 0s", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  test("UTIL-FD-004: seconds under 60 use s suffix", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  test("UTIL-FD-005: 60 seconds formats as 1m 0s", () => {
    expect(formatDuration(60)).toBe("1m 0s");
  });

  test("UTIL-FD-006: mixed minutes and seconds", () => {
    expect(formatDuration(83)).toBe("1m 23s");
  });

  test("UTIL-FD-007: 3600 seconds formats as 1h 0m", () => {
    expect(formatDuration(3600)).toBe("1h 0m");
  });

  test("UTIL-FD-008: mixed hours and minutes", () => {
    expect(formatDuration(7500)).toBe("2h 5m");
  });

  test("UTIL-FD-009: negative returns em dash", () => {
    expect(formatDuration(-1)).toBe("—");
  });

  test("UTIL-FD-010: NaN returns em dash", () => {
    expect(formatDuration(NaN)).toBe("—");
  });

  test("UTIL-FD-011: Infinity returns em dash", () => {
    expect(formatDuration(Infinity)).toBe("—");
  });

  test("UTIL-FD-012: fractional seconds are floored", () => {
    expect(formatDuration(45.9)).toBe("45s");
  });

  test("UTIL-FD-013: large value 86400s = 24h 0m", () => {
    expect(formatDuration(86400)).toBe("24h 0m");
  });
});
```

#### `getDurationColor` — 13 tests

```typescript
describe("getDurationColor", () => {

  test("UTIL-DC-001: null returns muted", () => {
    expect(getDurationColor(null)).toBe("muted");
  });

  test("UTIL-DC-002: under 60s returns success", () => {
    expect(getDurationColor(30)).toBe("success");
  });

  test("UTIL-DC-003: 60–299s returns muted", () => {
    expect(getDurationColor(120)).toBe("muted");
  });

  test("UTIL-DC-004: 300–899s returns warning", () => {
    expect(getDurationColor(600)).toBe("warning");
  });

  test("UTIL-DC-005: 900+ returns error", () => {
    expect(getDurationColor(1200)).toBe("error");
  });

  test("UTIL-DC-006: boundary at 59 returns success", () => {
    expect(getDurationColor(59)).toBe("success");
  });

  test("UTIL-DC-007: boundary at 60 returns muted", () => {
    expect(getDurationColor(60)).toBe("muted");
  });

  test("UTIL-DC-008: boundary at 299 returns muted", () => {
    expect(getDurationColor(299)).toBe("muted");
  });

  test("UTIL-DC-009: boundary at 300 returns warning", () => {
    expect(getDurationColor(300)).toBe("warning");
  });

  test("UTIL-DC-010: boundary at 899 returns warning", () => {
    expect(getDurationColor(899)).toBe("warning");
  });

  test("UTIL-DC-011: boundary at 900 returns error", () => {
    expect(getDurationColor(900)).toBe("error");
  });

  test("UTIL-DC-012: zero returns success", () => {
    expect(getDurationColor(0)).toBe("success");
  });

  test("UTIL-DC-013: negative returns muted", () => {
    expect(getDurationColor(-5)).toBe("muted");
  });
});
```

#### `formatRelativeTime` — 12 tests

```typescript
describe("formatRelativeTime", () => {
  const now = new Date("2026-03-22T12:00:00Z");

  test("UTIL-RT-001: null returns em dash", () => {
    expect(formatRelativeTime(null, now)).toBe("—");
  });

  test("UTIL-RT-002: undefined returns em dash", () => {
    expect(formatRelativeTime(undefined, now)).toBe("—");
  });

  test("UTIL-RT-003: 30 seconds ago returns now", () => {
    expect(formatRelativeTime("2026-03-22T11:59:30Z", now)).toBe("now");
  });

  test("UTIL-RT-004: 5 minutes ago returns 5m", () => {
    expect(formatRelativeTime("2026-03-22T11:55:00Z", now)).toBe("5m");
  });

  test("UTIL-RT-005: 3 hours ago returns 3h", () => {
    expect(formatRelativeTime("2026-03-22T09:00:00Z", now)).toBe("3h");
  });

  test("UTIL-RT-006: 3 days ago returns 3d", () => {
    expect(formatRelativeTime("2026-03-19T12:00:00Z", now)).toBe("3d");
  });

  test("UTIL-RT-007: 10 days ago returns 1w", () => {
    expect(formatRelativeTime("2026-03-12T12:00:00Z", now)).toBe("1w");
  });

  test("UTIL-RT-008: 60 days ago returns 2mo", () => {
    expect(formatRelativeTime("2026-01-21T12:00:00Z", now)).toBe("2mo");
  });

  test("UTIL-RT-009: 400 days ago returns 1y", () => {
    expect(formatRelativeTime("2025-02-15T12:00:00Z", now)).toBe("1y");
  });

  test("UTIL-RT-010: future timestamp returns now", () => {
    expect(formatRelativeTime("2026-03-23T12:00:00Z", now)).toBe("now");
  });

  test("UTIL-RT-011: invalid ISO string returns em dash", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("—");
  });

  test("UTIL-RT-012: empty string returns em dash", () => {
    expect(formatRelativeTime("", now)).toBe("—");
  });
});
```

#### `getMiniStatusBar` — 6 tests

```typescript
describe("getMiniStatusBar", () => {

  test("UTIL-MSB-001: empty array returns 5 muted dots", () => {
    const result = getMiniStatusBar([]);
    expect(result).toHaveLength(5);
    expect(result.every(s => s.char === "·" && s.color === "muted")).toBe(true);
  });

  test("UTIL-MSB-002: single success run pads remaining with dots", () => {
    const result = getMiniStatusBar([{ status: "success" }]);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ char: "●", color: "success" });
    expect(result[1].char).toBe("·");
  });

  test("UTIL-MSB-003: 5 runs fills all slots", () => {
    const runs: MiniRun[] = [
      { status: "success" },
      { status: "failure" },
      { status: "running" },
      { status: "queued" },
      { status: "cancelled" },
    ];
    const result = getMiniStatusBar(runs);
    expect(result).toHaveLength(5);
    expect(result[0].color).toBe("success");
    expect(result[1].color).toBe("error");
    expect(result[2].color).toBe("warning");
    expect(result[3].color).toBe("primary");
    expect(result[4].color).toBe("muted");
  });

  test("UTIL-MSB-004: more than 5 runs truncates to first 5", () => {
    const runs: MiniRun[] = Array.from({ length: 10 }, () => ({ status: "success" as const }));
    const result = getMiniStatusBar(runs);
    expect(result).toHaveLength(5);
  });

  test("UTIL-MSB-005: running status uses double circle character", () => {
    const result = getMiniStatusBar([{ status: "running" }]);
    expect(result[0].char).toBe("◎");
  });

  test("UTIL-MSB-006: queued status uses open circle character", () => {
    const result = getMiniStatusBar([{ status: "queued" }]);
    expect(result[0].char).toBe("○");
  });
});
```

#### `formatBytes` — 10 tests

```typescript
describe("formatBytes", () => {

  test("UTIL-FB-001: null returns em dash", () => {
    expect(formatBytes(null)).toBe("—");
  });

  test("UTIL-FB-002: 0 returns 0 B", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  test("UTIL-FB-003: 89 bytes returns 89 B", () => {
    expect(formatBytes(89)).toBe("89 B");
  });

  test("UTIL-FB-004: 1024 returns 1.0 KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  test("UTIL-FB-005: large KB value drops decimal", () => {
    expect(formatBytes(345 * 1024)).toBe("345 KB");
  });

  test("UTIL-FB-006: small MB shows decimal", () => {
    expect(formatBytes(2.1 * 1024 * 1024)).toBe("2.1 MB");
  });

  test("UTIL-FB-007: GB range formats correctly", () => {
    expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe("1.2 GB");
  });

  test("UTIL-FB-008: negative returns em dash", () => {
    expect(formatBytes(-100)).toBe("—");
  });

  test("UTIL-FB-009: NaN returns em dash", () => {
    expect(formatBytes(NaN)).toBe("—");
  });

  test("UTIL-FB-010: very large value uses TB", () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024 * 1024)).toBe("2.0 TB");
  });
});
```

#### `abbreviateSHA` — 6 tests

```typescript
describe("abbreviateSHA", () => {

  test("UTIL-SHA-001: 40-char SHA truncates to 7", () => {
    expect(abbreviateSHA("abc1234def5678901234567890abcdef12345678")).toBe("abc1234");
  });

  test("UTIL-SHA-002: null returns em dash", () => {
    expect(abbreviateSHA(null)).toBe("—");
  });

  test("UTIL-SHA-003: undefined returns em dash", () => {
    expect(abbreviateSHA(undefined)).toBe("—");
  });

  test("UTIL-SHA-004: empty string returns em dash", () => {
    expect(abbreviateSHA("")).toBe("—");
  });

  test("UTIL-SHA-005: short string returned as-is", () => {
    expect(abbreviateSHA("abc")).toBe("abc");
  });

  test("UTIL-SHA-006: exactly 7 chars returned unchanged", () => {
    expect(abbreviateSHA("abcdefg")).toBe("abcdefg");
  });
});
```

#### `formatRunCount` — 8 tests

```typescript
describe("formatRunCount", () => {

  test("UTIL-RC-001: null returns 0", () => {
    expect(formatRunCount(null)).toBe("0");
  });

  test("UTIL-RC-002: zero returns 0", () => {
    expect(formatRunCount(0)).toBe("0");
  });

  test("UTIL-RC-003: under 1000 returns plain number", () => {
    expect(formatRunCount(42)).toBe("42");
  });

  test("UTIL-RC-004: 999 returns 999 (no K)", () => {
    expect(formatRunCount(999)).toBe("999");
  });

  test("UTIL-RC-005: 1000 returns 1.0K", () => {
    expect(formatRunCount(1000)).toBe("1.0K");
  });

  test("UTIL-RC-006: 1500 returns 1.5K", () => {
    expect(formatRunCount(1500)).toBe("1.5K");
  });

  test("UTIL-RC-007: 10000 returns 10K", () => {
    expect(formatRunCount(10000)).toBe("10K");
  });

  test("UTIL-RC-008: undefined returns 0", () => {
    expect(formatRunCount(undefined)).toBe("0");
  });
});
```

### 8.5 Test count summary

| Function group | Tests |
|----------------|-------|
| `getRunStatusIcon` | 8 |
| `getStepStatusIcon` | 8 |
| `getRunStatusIconNoColor` | 3 |
| `getStepStatusIconNoColor` | 1 |
| `formatDuration` | 13 |
| `getDurationColor` | 13 |
| `formatRelativeTime` | 12 |
| `getMiniStatusBar` | 6 |
| `formatBytes` | 10 |
| `abbreviateSHA` | 6 |
| `formatRunCount` | 8 |
| **Total** | **88** |

### 8.6 Integration tests in existing workflows test file

The existing `e2e/tui/workflows.test.ts` contains tests that will exercise these utils through the rendering pipeline (e.g., `HOOK-WFRD-002: run detail shows nodes with status and duration`). Those tests validate end-to-end behavior — the unit tests above validate the util functions in isolation.

**No modifications to `e2e/tui/workflows.test.ts` are required for this ticket.** The existing tests will naturally exercise the utils once the Workflows screen components are implemented in subsequent tickets.

### 8.7 Tests left failing policy

Per project policy: if any test fails because the backend doesn't return expected data shapes or the workflow API endpoints are not yet implemented, those tests remain failing. They are **never** skipped, commented out, or mocked. The pure utility tests in this ticket should all pass because they have no backend dependency — they test deterministic pure functions with hardcoded inputs.

## 9. Acceptance Criteria

1. File `apps/tui/src/screens/Workflows/utils.ts` exists and exports all 10 functions + 3 types.
2. File `apps/tui/src/screens/Workflows/index.ts` re-exports all public symbols from `utils.ts`.
3. All functions are pure — no React imports, no `@opentui/core` runtime imports (only type-only imports from `../../hooks/workflow-types.js` and `../../theme/tokens.js`).
4. Every function handles `null`, `undefined`, `NaN`, `Infinity`, and unknown enum values without throwing.
5. `getRunStatusIcon` covers all 6 `WorkflowRunStatus` values with distinct icons and distinct fallbacks.
6. `getStepStatusIcon` handles case-insensitive string input and unknown statuses gracefully.
7. `formatDuration` produces `"Xs"`, `"Xm Ys"`, or `"Xh Ym"` format with `"—"` for invalid input.
8. `getDurationColor` returns correct token at all boundary values (0/60/300/900).
9. `formatRelativeTime` accepts optional `now` parameter for deterministic testing.
10. `getMiniStatusBar` always returns exactly 5 slots regardless of input length.
11. `formatBytes` uses 1024-based units with appropriate decimal precision.
12. `abbreviateSHA` returns 7-character truncation with `"—"` for empty/null.
13. `formatRunCount` abbreviates with K suffix above 999 and returns `"0"` for null/undefined.
14. No-color variants exist for both run and step icon functions, returning `color: "muted"` and `bold: false`.
15. Test file `e2e/tui/workflow-utils.test.ts` exists with 88 test cases covering all functions.
16. All 88 tests pass (no backend dependency in this pure-function module).
17. No POC code needed — module is production-ready from first commit.