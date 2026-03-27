# Engineering Specification: tui-issue-labels-display

## Cross-cutting Label Rendering with Picker Overlay, Mutation Support, and Integration Surfaces

**Ticket:** tui-issue-labels-display
**Status:** Partial
**Dependencies:** tui-label-badge-component, tui-issues-data-hooks, tui-modal-component, tui-issue-list-screen
**Target Directory:** `apps/tui/src/`
**Test Directory:** `e2e/tui/`

---

## 1. Summary

This ticket implements the full label display and interaction system for the Codeplane TUI. It is a cross-cutting concern that touches the issue list rows, issue detail view, issue create/edit forms, and two modal overlays (label picker and label filter). The implementation builds on the `LabelBadge` and `LabelBadgeList` components from `tui-label-badge-component`, the data hooks from `tui-issues-data-hooks`, and the overlay infrastructure from `tui-modal-component`.

The deliverables are:

1. **`LabelPickerOverlay`** — A modal overlay for adding/removing labels on an issue (opened via `l` in detail view).
2. **`LabelFilterOverlay`** — A modal overlay for filtering the issue list by labels (opened via `L` in list view).
3. **`useLabelPicker`** — Shared stateful hook for picker UI logic (fuzzy search, navigation, selection, keyboard dispatch).
4. **`useLabelMutations`** — Optimistic add/remove label mutations with revert.
5. **Integration code** in `IssueListScreen`, `IssueDetailScreen`, `IssueCreateForm`, and `IssueEditForm`.
6. **84 E2E tests** across snapshot, keyboard, responsive, integration, and edge case categories.

---

## 2. Codebase Ground Truth

Before reading further, the following facts about the actual repository drive every decision in this spec. Each fact was verified by reading the source file.

| Fact | Location | Impact |
|---|---|---|
| `KeyHandler` interface: `{ key: string, description: string, group: string, handler: () => void, when?: () => boolean }` | `apps/tui/src/providers/keybinding-types.ts` | Picker overlays register `KeyHandler[]` via `KeybindingContext.registerScope()` |
| `PRIORITY`: `TEXT_INPUT(1)`, `MODAL(2)`, `GOTO(3)`, `SCREEN(4)`, `GLOBAL(5)` — lower number = higher priority | `apps/tui/src/providers/keybinding-types.ts` | Picker overlays register at `PRIORITY.MODAL` (priority 2) |
| `KeybindingContextType.registerScope(scope: Omit<KeybindingScope, "id">)` returns scope ID string; `removeScope(id)` cleans up | `apps/tui/src/providers/KeybindingProvider.tsx` | Overlays must clean up scopes on close |
| `StatusBarHintsContextType.overrideHints(hints: StatusBarHint[])` returns `() => void` cleanup function | `apps/tui/src/providers/keybinding-types.ts` | Picker overlays override hints during open |
| `StatusBarHint`: `{ keys: string, label: string, order?: number }` | `apps/tui/src/providers/keybinding-types.ts` | Status bar hint format |
| `normalizeKeyDescriptor(descriptor: string): string` normalizes key strings; maps aliases (`"Enter"` → `"return"`, `"Esc"` → `"escape"`); preserves uppercase single letters (`"G"` stays `"G"`) | `apps/tui/src/providers/normalize-key.ts` | All key registrations must normalize first |
| `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])` registers at `PRIORITY.SCREEN`; auto-generates hints from first 8 bindings if hints not provided | `apps/tui/src/hooks/useScreenKeybindings.ts` | Issue screens use this for `L`/`l` bindings |
| `useOptimisticMutation<TArgs>(options: { id, entityType, action, mutate, onOptimistic, onRevert, onSuccess? })` returns `{ execute: (args: TArgs) => void, isLoading: boolean }` | `apps/tui/src/hooks/useOptimisticMutation.ts` | Label mutations follow this pattern |
| `useOptimisticMutation` calls `loading.registerMutation(id, action, entityType)` on execute, `loading.completeMutation(id)` on success, `loading.failMutation(id, errorMessage)` on error | `apps/tui/src/hooks/useOptimisticMutation.ts` | Error toast shows `✗ {message}` for 5s |
| `LoadingContextValue.failMutation(id: string, errorMessage: string)` — shows error in status bar, auto-clears after `STATUS_BAR_ERROR_DURATION_MS` (5000) | `apps/tui/src/loading/types.ts` | Used for permission denied flash and mutation errors |
| `OverlayManager` manages `"help" \| "command-palette" \| "confirm"` with a single `escape` binding at `PRIORITY.MODAL` | `apps/tui/src/providers/OverlayManager.tsx` | Label overlays bypass OverlayManager — manage their own MODAL scope directly |
| `useLayout()` returns `LayoutContext` with: `width`, `height`, `breakpoint: Breakpoint \| null`, `contentHeight`, `sidebarVisible`, `sidebarWidth`, `modalWidth`, `modalHeight`, `sidebar: SidebarState` | `apps/tui/src/hooks/useLayout.ts` | Picker sizing and responsive layout |
| `getModalWidth(breakpoint)`: `"large"` → `"50%"`, `"standard"` → `"60%"`, minimum/null → `"90%"` | `apps/tui/src/hooks/useLayout.ts` | Picker width matches existing modal pattern |
| `useResponsiveValue<T>(values: { minimum: T, standard: T, large: T }, fallback?: T): T \| undefined` — returns `fallback` when breakpoint is null | `apps/tui/src/hooks/useResponsiveValue.ts` | Column widths, truncation limits |
| `Breakpoint` type: `"minimum" \| "standard" \| "large"` — from `getBreakpoint(cols, rows)` which returns `null` when below 80×24 | `apps/tui/src/types/breakpoint.ts` | Breakpoint can be null |
| `ThemeTokens`: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`, plus 5 diff tokens — all `RGBA` | `apps/tui/src/theme/tokens.ts` | Picker border, background, text colors |
| `useTheme()` returns `Readonly<ThemeTokens>` from `ThemeContext` | `apps/tui/src/hooks/useTheme.ts` | All color references via `theme.{token}` |
| `useColorTier()` returns `"truecolor" \| "ansi256" \| "ansi16"` | `apps/tui/src/hooks/useColorTier.ts` | Passed to `resolveColor()` for tier-aware palette mapping |
| `detectColorCapability()` returns `"ansi16"` when `NO_COLOR` is set | `apps/tui/src/theme/detect.ts` | Under `NO_COLOR`, tier is `"ansi16"` but `resolveColor()` additionally returns `undefined` |
| `emit(name: string, properties?: Record<string, string \| number \| boolean>)` — writes JSON to stderr when `CODEPLANE_TUI_DEBUG=true` | `apps/tui/src/lib/telemetry.ts` | All telemetry events |
| Telemetry context includes: `session_id`, `tui_version`, `terminal_width`, `terminal_height`, `color_tier` | `apps/tui/src/lib/telemetry.ts` | Automatically appended to all emitted events |
| `logger.debug/info/warn/error(msg: string)` — writes to stderr as `[ISO] [LEVEL] msg`; level controlled by `CODEPLANE_TUI_LOG_LEVEL` env var (default: `"error"`, or `"debug"` when `CODEPLANE_TUI_DEBUG=true`) | `apps/tui/src/lib/logger.ts` | All structured logs |
| `LabelBadge`, `LabelBadgeList`, `badgeDisplayWidth`, `computeVisibleLabels` from tui-label-badge-component | `apps/tui/src/components/LabelBadge.tsx` (pending dependency) | Foundation rendering components |
| `Label` interface in LabelBadge: `{ readonly id: number, readonly name: string, readonly color: string }` | `apps/tui/src/components/LabelBadge.tsx` (pending) | Minimal label shape for badge components |
| `resolveColor(hexColor: string \| undefined \| null, tier: ColorTier, mutedFallback: RGBA): RGBA \| undefined` — cached, validates hex, applies luminance floor, maps to tier | `apps/tui/src/util/color.ts` (pending dependency) | Colored bullet in picker rows |
| `displayWidth(str: string): number` — CJK/emoji-aware terminal column width | `apps/tui/src/util/color.ts` (pending dependency) | Picker layout calculations |
| `truncateToWidth(str: string, maxWidth: number): string` — grapheme-cluster-aware truncation with `…` | `apps/tui/src/util/color.ts` (pending dependency) | Label name truncation in picker items |
| `IssueLabelSummary`: `{ id: number, name: string, color: string, description: string }` (labels on an issue) | `specs/tui/packages/ui-core/src/types/issues.ts` | Labels on issue objects have descriptions |
| `Label` (repo label): `{ id, repository_id, name, color, description, created_at, updated_at }` | `specs/tui/packages/ui-core/src/types/issues.ts` | Full label from `useRepoLabels()` |
| `useRepoLabels(owner, repo, options?)` returns `{ labels: Label[], totalCount, isLoading, error, hasMore, fetchMore, refetch }` — uses `usePaginatedQuery` with max 500 items, 30 per page | `specs/tui/packages/ui-core/src/hooks/issues/useRepoLabels.ts` | Lazy-fetch all repo labels for picker |
| `useAddIssueLabels(owner, repo)` returns `{ mutate: (issueNumber, labelNames: string[]) => void, isLoading, error }` — validates non-empty, POSTs to `/api/repos/:owner/:repo/issues/:number/labels` | `specs/tui/packages/ui-core/src/hooks/issues/useAddIssueLabels.ts` | Add labels mutation |
| `useRemoveIssueLabel(owner, repo, callbacks?)` returns `{ mutate: (issueNumber, labelName: string) => void, isLoading, error }` — DELETEs to `/api/repos/:owner/:repo/issues/:number/labels/:name` | `specs/tui/packages/ui-core/src/hooks/issues/useRemoveIssueLabel.ts` | Remove label mutation |
| `RemoveIssueLabelCallbacks`: `{ onOptimistic?, onRevert?, onError?, onSettled? }` — per-item callbacks | `specs/tui/packages/ui-core/src/hooks/issues/useRemoveIssueLabel.ts` | Hooks into mutation lifecycle |
| All screens currently map to `PlaceholderScreen` | `apps/tui/src/router/registry.ts` | Issue screens pending implementation from dependency tickets |
| `ScreenName.Issues`, `ScreenName.IssueDetail`, `ScreenName.IssueCreate`, `ScreenName.IssueEdit` defined in enum | `apps/tui/src/router/types.ts` | Screen names for navigation |
| `LaunchTUIOptions`: `{ cols?: number, rows?: number, env?, args?, launchTimeoutMs? }` — defaults: cols=120, rows=40 | `e2e/tui/helpers.ts` | Test launch uses `cols`/`rows` |
| `TERMINAL_SIZES`: `minimum: { width: 80, height: 24 }`, `standard: { width: 120, height: 40 }`, `large: { width: 200, height: 60 }` | `e2e/tui/helpers.ts` | Size constants use `width`/`height`; pass to `launchTUI` as `cols`/`rows` |
| `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`, `API_URL` test constants | `e2e/tui/helpers.ts` | Shared test env vars |
| `TUITestInstance`: `sendKeys(...keys)`, `sendText(text)`, `waitForText(text, timeout?)`, `waitForNoText(text, timeout?)`, `snapshot()`, `getLine(n)`, `resize(cols, rows)`, `terminate()` | `e2e/tui/helpers.ts` | Full test interface |
| Import paths use `.js` extensions throughout `apps/tui/src/` | Convention | Must follow for all new files |
| `OverlayManager.openOverlay()` toggles on repeated calls for the same type | `apps/tui/src/providers/OverlayManager.tsx` | Our overlays self-manage, don't use OverlayManager |
| Keybinding dispatch: scopes checked in priority order (lower number first), then LIFO within same priority | `apps/tui/src/providers/KeybindingProvider.tsx` | MODAL scope takes precedence over SCREEN |

---

## 3. Architecture Overview

### 3.1 Component Dependency Graph

```
@codeplane/ui-core
  useRepoLabels()  useAddIssueLabels()  useRemoveIssueLabel()
           │                              │
           ▼                              ▼
  LabelPickerOverlay            LabelFilterOverlay
           │                              │
           ▼                              ▼
              Shared: useLabelPicker() hook
           │                              │
           ▼                              ▼
     LabelBadge                  LabelBadgeList
     (tui-label-badge-component)
```

### 3.2 Why Picker Overlays Bypass OverlayManager

The existing `OverlayManager` supports three overlay types (`"help" | "command-palette" | "confirm"`) with a single `PRIORITY.MODAL` scope that only registers `escape → closeOverlay`. The label picker requires rich modal keybindings (`j`, `k`, `Space`, `Enter`, `Escape`, `g`, `G`, `Ctrl+D`, `Ctrl+U`, `Backspace`, plus printable chars for fuzzy search). Rather than extending OverlayManager's architecture, the picker overlays manage their own `PRIORITY.MODAL` scope directly via `KeybindingContext.registerScope()` — the same mechanism OverlayManager uses internally.

Only one modal can be active at a time (MODAL priority blocks other keyboard input at a higher priority than SCREEN or GLOBAL), so coexistence is not an issue. The label picker scope is registered when the overlay opens and removed when it closes, exactly mirroring OverlayManager's lifecycle pattern.

### 3.3 File Inventory

| File Path | Type | Purpose |
|---|---|---|
| `apps/tui/src/hooks/useLabelPicker.ts` | New | Shared picker state machine — fuzzy search, navigation, selection, keyboard dispatch |
| `apps/tui/src/hooks/useLabelMutations.ts` | New | Optimistic add/remove label mutations with revert |
| `apps/tui/src/components/LabelPickerOverlay.tsx` | New | Modal overlay for add/remove labels on an issue |
| `apps/tui/src/components/LabelFilterOverlay.tsx` | New | Modal overlay for filtering issue list by labels |
| `apps/tui/src/components/index.ts` | Modified | Barrel exports for new components |
| `apps/tui/src/hooks/index.ts` | Modified | Barrel exports for new hooks |
| `apps/tui/src/screens/Issues/IssueListScreen.tsx` | Modified | Label column integration + `L` keybinding |
| `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` | Modified | Label metadata row + `l` keybinding |
| `apps/tui/src/screens/Issues/IssueCreateForm.tsx` | Modified | Label picker field in form |
| `apps/tui/src/screens/Issues/IssueEditForm.tsx` | Modified | Label picker field in form |
| `e2e/tui/issues.test.ts` | Modified | 84 label-specific tests added |

---

## 4. Implementation Plan

### Step 1: `useLabelPicker` Hook

**File:** `apps/tui/src/hooks/useLabelPicker.ts`

Shared state machine driving both the label picker (add/remove) and the label filter overlay. This hook owns navigation, selection, fuzzy search, and keyboard dispatch, but does NOT own modal rendering or API mutations.

#### 4.1 Interface

```typescript
import type { RGBA } from "@opentui/core";

export interface PickerLabel {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  readonly description: string;
}

export interface UseLabelPickerOptions {
  allLabels: readonly PickerLabel[];
  initialSelected: ReadonlySet<number>;
  maxSelectable: number;
  isOpen: boolean;
  onConfirm: (selectedIds: ReadonlySet<number>) => void;
  onCancel: () => void;
}

export interface LabelPickerState {
  filteredLabels: readonly PickerLabel[];
  focusedIndex: number;
  selectedIds: ReadonlySet<number>;
  searchQuery: string;
  isSearchActive: boolean;
  isAtCap: boolean;
  totalCount: number;
  addedCount: number;
  removedCount: number;
  hasPendingChanges: boolean;
}
```

#### 4.2 Constants

```typescript
const PICKER_CAP = 100;
const G_TIMEOUT_MS = 1500;
const PAGE_SIZE = 10;
```

#### 4.3 Behavior

1. **State reset on open:** When `isOpen` transitions `false→true`, reset `selectedIds` to a copy of `initialSelected`, clear `searchQuery`, set `focusedIndex` to 0.

2. **Fuzzy search:** Case-insensitive `includes()` match on `label.name`. Sort: exact prefix matches first, then by match position, then alphabetical. Result capped at `PICKER_CAP` items.

3. **Navigation:** `j`/`down` increments focusedIndex (clamped). `k`/`up` decrements. `ctrl+d` pages +PAGE_SIZE. `ctrl+u` pages -PAGE_SIZE. All clamped.

4. **`g g` sequence:** Managed via `pendingGRef` + `gTimerRef`. First `g` (search inactive): set pending, start timer. Second `g` within window: jump to index 0. When search active, `g`/`G` append to query.

5. **Selection:** `Space` toggles focused label. At cap + unselected → no-op (signal cap hit).

6. **Confirm/Cancel:** `Enter` → `onConfirm(selectedIds)`. `Escape` → `onCancel()`.

7. **Search input:** Printable chars append to `searchQuery`. `Backspace` removes last grapheme.

8. **Scope lifecycle:** When `isOpen=true`, register `PRIORITY.MODAL` scope. Override status bar hints. When `isOpen=false`, remove scope and restore hints.

#### 4.4 Key Dispatch Table

All keys normalized via `normalizeKeyDescriptor()` before registration.

| Key Descriptor | Guard | Action |
|---|---|---|
| `j` | Always | Focus down |
| `down` | Always | Focus down |
| `k` | Always | Focus up |
| `up` | Always | Focus up |
| `space` | Always | Toggle selection |
| `return` | Always | Confirm |
| `escape` | Always | Cancel |
| `ctrl+d` | Always | Page down |
| `ctrl+u` | Always | Page up |
| `backspace` | `searchQuery.length > 0` | Remove last search char |
| `g` (first) | `!isSearchActive && !pendingG` | Start g-g sequence |
| `g` (second) | `!isSearchActive && pendingG` | Jump to first |
| `g` | `isSearchActive` | Append to search |
| `G` | `!isSearchActive` | Jump to last |
| `G` | `isSearchActive` | Append to search |
| `R` | Error state | Retry fetch |
| Any printable | Not bound above | Append to search |

### Step 2: `useLabelMutations` Hook

**File:** `apps/tui/src/hooks/useLabelMutations.ts`

Coordinates optimistic add/remove label mutations with batch processing and revert. Uses `useLoading()` directly (not `useOptimisticMutation`) because adds/removes are a batched operation with single revert.

### Step 3: `LabelPickerOverlay` Component

**File:** `apps/tui/src/components/LabelPickerOverlay.tsx`

Modal overlay with border, search input, scrollable label list with checkboxes and colored bullets, and footer.

### Step 4: `LabelFilterOverlay` Component

**File:** `apps/tui/src/components/LabelFilterOverlay.tsx`

Same structure as picker with: unlimited selection, AND logic, no API mutations.

### Step 5–7: Screen Integrations

Issue list (label column + L filter), issue detail (label row + l picker), issue create/edit forms (label field).

### Step 8–10: Barrel exports, telemetry/logging, productionization.

---

## 5–11. Data Flow, Responsive, Error Handling, Security, Tests, Implementation Order, Open Questions

See full specification in `specs/tui/engineering/tui-issue-labels-display.md` for complete details including 84 E2E tests, responsive behavior matrix, error handling table, security analysis, and implementation order with parallelization.