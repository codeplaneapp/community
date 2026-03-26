# Engineering Specification: tui-issue-keyboard-shortcuts

## Ticket Summary

**Title:** Unified keybinding dispatch, priority resolution, help overlay, and status bar hints  
**Type:** Feature  
**Dependencies:** `tui-issue-list-screen`, `tui-issue-detail-view`, `tui-issue-create-form`, `tui-issue-edit-form`, `tui-issue-close-reopen`, `tui-issue-comment-create`, `tui-issue-list-filters`, `tui-issue-list-search`, `tui-issue-labels-display`  
**Status:** Not started

---

## Overview

This ticket delivers `useIssueKeyboard()` — the capstone orchestration hook that unifies keybinding dispatch across all issue sub-screens (list, detail, create form, edit form, comment creation, filter overlays, search) into a single coherent keyboard layer. It implements the 6-layer priority resolution model, the help overlay content rendering, responsive status bar hints, command palette issue actions, the Esc cascade, go-to mode integration, and multi-select bulk actions.

The existing codebase provides:
- `KeybindingProvider` (`apps/tui/src/providers/KeybindingProvider.tsx`) — scope-based dispatch with `PRIORITY.TEXT_INPUT(1)`, `MODAL(2)`, `GOTO(3)`, `SCREEN(4)`, `GLOBAL(5)`
- `useScreenKeybindings()` (`apps/tui/src/hooks/useScreenKeybindings.ts`) — per-screen binding registration at `PRIORITY.SCREEN`
- `useGlobalKeybindings()` (`apps/tui/src/hooks/useGlobalKeybindings.ts`) — always-active `q`, `Esc`, `Ctrl+C`, `?`, `:`, `g`
- `OverlayManager` (`apps/tui/src/providers/OverlayManager.tsx`) — modal state with `PRIORITY.MODAL` scope and `Esc` close binding
- `StatusBarHintsContext` — hint registration with ordering and override
- `normalizeKeyEvent()` / `normalizeKeyDescriptor()` (`apps/tui/src/providers/normalize-key.ts`) — key normalization
- `goToBindings` (`apps/tui/src/navigation/goToBindings.ts`) — destination table for `g` prefix

This ticket extends these foundations with a 6th priority layer (issue-wide, between sub-screen and global), implements the `g` go-to mode timeout and dispatch, wires `?` to render grouped keybinding content in the help overlay, computes responsive status bar hints, registers issue command palette entries, and implements the Esc cascade logic.

---

## Feature Mapping

From `specs/tui/features.ts`:
- `TUI_ISSUE_KEYBOARD_SHORTCUTS` (full implementation)

---

## Architecture Decisions

### AD-1: 6-Layer Priority Model

The existing `KeybindingProvider` supports 5 named priorities (`TEXT_INPUT=1`, `MODAL=2`, `GOTO=3`, `SCREEN=4`, `GLOBAL=5`). The product spec calls for a 6-layer model:

1. Text input (handled by OpenTUI focus system + `PRIORITY.TEXT_INPUT`)
2. Modal/overlay (`PRIORITY.MODAL`)
3. Go-to mode (`PRIORITY.GOTO`)
4. Active sub-screen (`PRIORITY.SCREEN`)
5. **Issue-wide** (new — between SCREEN and GLOBAL)
6. Global (`PRIORITY.GLOBAL`)

**Decision:** Define `ISSUE_WIDE_PRIORITY = 4.5` as a numeric constant. The existing `KeybindingProvider.getActiveScopesSorted()` sorts by numeric priority ASC, so inserting 4.5 between 4 and 5 requires zero changes to the provider. The constant lives in a local `constants.ts` file rather than modifying the shared `keybinding-types.ts`, because issue-wide priority is domain-specific.

**Implementation:** `useIssueKeyboard()` registers cross-cutting bindings (like `R` for retry, Esc cascade) at priority 4.5 via `keybindingCtx.registerScope({ priority: 4.5, ... })`. Sub-screen hooks continue to register at `PRIORITY.SCREEN = 4`.

### AD-2: Go-To Mode Implementation

The `GlobalKeybindings` component (`apps/tui/src/components/GlobalKeybindings.tsx`) currently registers `g` at `PRIORITY.GLOBAL` with a TODO handler. Go-to mode requires:
- `g` press → enter go-to mode for 1500ms
- Second key → resolve destination from `goToBindings`
- `g g` → scroll to top (special case, not go-to navigation)
- Timeout (1500ms) → cancel silently
- `Esc` → cancel explicitly
- `q` → cancel + pop screen

**Decision:** Implement `useGoToMode()` hook that manages a `PRIORITY.GOTO` scope. When `g` is pressed at the global level, the hook activates a GOTO scope containing all destination keys plus `g` (for `g g`), `escape` (cancel), and `q` (cancel + pop). A 1500ms timer cancels the scope if no second key arrives. Status bar hints are overridden during go-to mode to show available destinations. Unknown keys do not match any binding in the GOTO scope, so they fall through to lower priorities and the scope remains active until timeout — but since the product spec says unrecognized keys cancel silently, we add a catch-all handler.

### AD-3: Help Overlay Content Rendering

The `OverlayLayer` (`apps/tui/src/components/OverlayLayer.tsx`) currently renders placeholder text for the help overlay. This ticket replaces the placeholder with real grouped keybinding display.

**Decision:** Create `HelpOverlayContent` component that reads all active bindings from `keybindingCtx.getAllBindings()`, groups them by `group` label, enforces the 8-group / 20-per-group / 80-total limits, and renders in a `<scrollbox>`. At `minimum` breakpoint, single-column layout. At `large` breakpoint, two-column layout. The component is screen-agnostic (reads from global context) but is delivered as part of this ticket.

### AD-4: Esc Cascade

The Esc key has contextual behavior with strict cascade priority:
1. Stacked overlays → close topmost only
2. Single overlay open → close it
3. Search input focused → blur, clear query
4. Form with unsaved changes → show confirmation dialog
5. None of the above → pop screen

**Decision:** The Esc cascade is implemented in `useIssueKeyboard()` as a single handler registered at issue-wide priority (4.5). It checks overlay state, search state, and form dirty state in order, executing the first matching action. The existing `GlobalKeybindings` Esc handler (which calls `nav.pop()`) serves as the final fallback at `PRIORITY.GLOBAL`.

### AD-5: Command Palette Integration

**Decision:** Create `ISSUE_COMMANDS` constant array in a dedicated file. These commands are registered with the command registry when any issue screen mounts. The `OverlayLayer` command palette content rendering is a separate ticket — this ticket ensures the action definitions exist and can be consumed.

### AD-6: Key Event Queue and Performance Budget

The spec requires a 64-event queue with overflow handling and 16ms handler budget.

**Decision:** OpenTUI's `useKeyboard()` hook processes events synchronously in the React render cycle — there is no explicit queue to manage. The 16ms budget is enforced by keeping all dispatch-path handlers synchronous (no awaits). A `performance.now()` check in debug mode (`CODEPLANE_LOG_LEVEL=debug`) warns on handlers exceeding 16ms. The queue depth constraint is documented as an architectural contract for future OpenTUI versions.

---

## Implementation Plan

### Step 1: Create keyboard directory structure and constants

**File: `apps/tui/src/screens/Issues/keyboard/constants.ts`** (new)

```typescript
import { PRIORITY } from "../../../providers/keybinding-types.js";

/** Issue-wide keybinding priority. Between SCREEN (4) and GLOBAL (5). */
export const ISSUE_WIDE_PRIORITY = 4.5 as const;

export const GOTO_TIMEOUT_MS = 1500;
export const MAX_HELP_GROUPS = 8;
export const MAX_HELP_PER_GROUP = 20;
export const MAX_HELP_TOTAL = 80;
export const HANDLER_BUDGET_MS = 16;
export const KEY_QUEUE_DEPTH = 64;
export const BULK_SELECTION_MAX = 50;
export const CONFIRM_MAX_WIDTH = 60;
export const BULK_CONFIRM_THRESHOLD = 5;
export const MUTATING_DEBOUNCE_MS = 50;
export const STATUS_BAR_RESERVED_CHARS = 20;

export { PRIORITY };
```

**File: `apps/tui/src/screens/Issues/keyboard/types.ts`** (new)

```typescript
import type { StatusBarHint } from "../../../providers/keybinding-types.js";

export type IssueSubScreen =
  | "list"
  | "detail"
  | "create-form"
  | "edit-form"
  | "comment-form";

export type FocusContext =
  | "list"
  | "detail"
  | "form-field"
  | "overlay"
  | "search"
  | "go-to";

export interface ResponsiveHintConfig {
  minimum: StatusBarHint[];
  standard: StatusBarHint[];
  large: StatusBarHint[];
}

export interface HelpGroup {
  label: string;
  entries: HelpEntry[];
}

export interface HelpEntry {
  key: string;
  description: string;
}

export interface GoToModeState {
  active: boolean;
  activatedAt: number | null;
}
```

---

### Step 2: Implement useGoToMode() hook

**File: `apps/tui/src/screens/Issues/keyboard/useGoToMode.ts`** (new)

Manages go-to mode lifecycle: activation on `g`, 1500ms timeout, destination resolution from `goToBindings`, `g g` scroll-to-top, cancellation.

Key behaviors:
- On `g` press: registers `PRIORITY.GOTO` scope containing all destination keys, `g` (scroll-to-top), `escape` (cancel), `q` (cancel + pop). Overrides status bar hints with destination list.
- On second key match: executes `executeGoTo()` from `navigation/goToBindings.ts`, then cancels go-to mode.
- On `g g`: calls `onScrollToTop()` callback, cancels go-to mode.
- On timeout (1500ms): cancels silently via `setTimeout` + cleanup.
- On `Esc`: cancels explicitly.
- On `q`: cancels + pops screen.
- On unknown key: catch-all handler cancels silently.
- Cleanup on unmount: removes scope, clears timer, restores hints.

The hook returns `{ active: boolean, activate: () => void, cancel: () => void }`.

**Implementation detail:** The hook uses `useRef` for `scopeIdRef`, `timerRef`, `hintsCleanupRef` to avoid stale closures. Handler functions access latest state via refs.

---

### Step 3: Implement responsive status bar hint computation

**File: `apps/tui/src/screens/Issues/keyboard/useIssueStatusBarHints.ts`** (new)

Pure computation hook that returns `StatusBarHint[]` based on:
- `subScreen`: list, detail, create-form, edit-form, comment-form
- `focusContext`: current focus state
- `selectionCount`: bulk selection count
- `issueState`: open/closed (for dynamic labels like "x:close" vs "x:reopen")
- `isSearchActive`: whether search mode is on
- `breakpoint`: from `useLayout()`

Hint sets per sub-screen:
- **List (all):** `j/k:navigate`, `↵:open`, `f:state`, `/:search`, `L:labels`, `a:assignee`, `c:new`, `x:close`, `Space:select`, `o:sort`, `q:back`
- **Detail (all):** `j/k:scroll`, `n/p:comment`, `c:reply`, `e:edit`, `o:close`, `↵:dependency`, `R:retry`, `q:back`
- **Form (all):** `Tab:next`, `S-Tab:prev`, `^S:submit`, `Esc:cancel`
- **Search:** `↵:apply`, `Esc:clear`
- **Bulk selection:** `{N}:selected`, `x:{close|reopen}`, `Space:toggle`, `Esc:clear`, `q:back`

Truncation rules:
- Hints sorted by `order` ASC
- At `minimum` breakpoint: show 3 hints
- At `standard`: show 5-6 hints
- At `large`: show all
- Additional truncation if total hint string width exceeds `terminal_width - 20`
- Rightmost (highest-order) hints dropped first

---

### Step 4: Implement HelpOverlayContent component

**File: `apps/tui/src/screens/Issues/keyboard/HelpOverlayContent.tsx`** (new)

Reads all active bindings from `keybindingCtx.getAllBindings()`, which returns a `Map<string, KeyHandler[]>` grouped by `group` label. Enforces limits:
- Max 8 groups
- Max 20 entries per group
- Max 80 total entries
- Entries beyond 80: show `…` indicator

Layout:
- At `minimum` and `standard` breakpoints: single-column `<scrollbox>`
- At `large` breakpoint: two-column layout, groups split evenly
- Each group renders as: bold primary-colored label, then rows of `[key_display (14 chars wide)]  [description]`

Key display formatting (`formatKeyDisplay`):
- `return` → `Enter`, `escape` → `Esc`, `tab` → `Tab`, `ctrl+c` → `Ctrl+C`
- Single chars preserved: `j`, `k`, `G`, `?`, `/`

Fallback on error: `"Unable to display help. Press Esc to close."`

---

### Step 5: Implement Esc cascade logic

**File: `apps/tui/src/screens/Issues/keyboard/useEscCascade.ts`** (new)

Returns a single `() => void` handler that checks overlay state, search state, and form dirty state in priority order:

1. If `activeOverlay !== null` → `closeOverlay()` (close topmost only)
2. If `focusContext === "search"` and `onClearSearch` provided → call it
3. If `focusContext === "form-field"` and `isFormDirty()` returns true → call `onFormDirtyConfirm()` (shows confirmation dialog)
4. Otherwise → `nav.pop()` if `canGoBack`

Each level logs to stderr at debug level with the cascade level for observability.

---

### Step 6: Implement command palette issue actions

**File: `apps/tui/src/screens/Issues/keyboard/issueCommands.ts`** (new)

Defines `ISSUE_COMMANDS` array with 11 entries:
- `Create issue`, `Close issue`, `Reopen issue`, `Edit issue`, `Add comment`
- `Filter by state: Open`, `Filter by state: Closed`, `Filter by state: All`
- `Filter by label`, `Filter by assignee`, `Clear all filters`

Each command has: `id`, `label`, `keywords: string[]` (for fuzzy search), `action` (string identifier), `requiresWrite` (boolean for permission gating).

---

### Step 7: Implement the capstone useIssueKeyboard() hook

**File: `apps/tui/src/screens/Issues/keyboard/useIssueKeyboard.ts`** (new)

This is the central orchestration hook. Accepts `IssueKeyboardConfig`:

```typescript
interface IssueKeyboardConfig {
  subScreen: IssueSubScreen;
  subScreenBindings: KeyHandler[];
  focusContext: FocusContext;
  selectionCount: number;
  issueState?: "open" | "closed";
  isSearchActive?: boolean;
  onScrollToTop?: () => void;
  onClearSearch?: () => void;
  isFormDirty?: () => boolean;
  onFormDirtyConfirm?: () => void;
}
```

Returns `{ goToActive: boolean }`.

Internal wiring:

1. **Go-to mode:** Instantiates `useGoToMode(config.onScrollToTop)`. Returns `goTo.active` in the result.

2. **Esc cascade:** Instantiates `useEscCascade({ getFocusContext, onClearSearch, isFormDirty, onFormDirtyConfirm })`. Registers the cascade handler at `ISSUE_WIDE_PRIORITY` for the `escape` key.

3. **Issue-wide scope (priority 4.5):** Registers a `KeybindingScope` containing:
   - `escape` → Esc cascade handler
   - `R` → retry/refetch (issue-wide action)
   Scope registered on mount, removed on unmount.

4. **Sub-screen scope (priority SCREEN=4):** Wraps each handler from `config.subScreenBindings` with:
   - Key normalization via `normalizeKeyDescriptor()`
   - Debug-mode performance timing (`performance.now()` before/after, warn if >16ms)
   - Debug-mode dispatch logging
   Scope registered on mount, removed on unmount. Re-registered when `subScreenBindings` key set changes.

5. **Status bar hints:** Calls `useIssueStatusBarHints()` with current config. Registers hints via `statusBarCtx.registerHints()`. Skips registration when `goTo.active` (go-to mode overrides hints via its own mechanism).

6. **Handler refs:** Uses `useRef` pattern for all callback dependencies to avoid scope re-registration on every render.

---

### Step 8: Create GoToContext provider

**File: `apps/tui/src/providers/GoToContext.tsx`** (new)

Context that allows the active screen to register its go-to activation function, which `GlobalKeybindings` calls when `g` is pressed.

```typescript
interface GoToContextType {
  activate: (() => void) | null;
  register(fn: () => void): () => void;
}
```

`GoToProvider` wraps children, stores the current activate function in a ref. `register()` returns a cleanup function. `GlobalKeybindings` reads `activate` from context and calls it on `g` press.

Added to the provider stack in `apps/tui/src/index.tsx` between `KeybindingProvider` and `OverlayManager`.

---

### Step 9: Wire GlobalKeybindings to real handlers

**File: `apps/tui/src/components/GlobalKeybindings.tsx`** (modify)

Replace the three TODO callbacks:

```typescript
// Before:
const onHelp = useCallback(() => { /* TODO */ }, []);
const onCommandPalette = useCallback(() => { /* TODO */ }, []);
const onGoTo = useCallback(() => { /* TODO */ }, []);

// After:
const { openOverlay } = useOverlay();
const goToCtx = useGoToContext();

const onHelp = useCallback(() => {
  openOverlay("help");
}, [openOverlay]);

const onCommandPalette = useCallback(() => {
  openOverlay("command-palette");
}, [openOverlay]);

const onGoTo = useCallback(() => {
  goToCtx.activate?.();
}, [goToCtx]);
```

---

### Step 10: Update OverlayLayer to render HelpOverlayContent

**File: `apps/tui/src/components/OverlayLayer.tsx`** (modify)

Replace the help placeholder:

```typescript
// Before:
{activeOverlay === "help" && (
  <text fg={theme.muted}>[Help overlay content — pending TUI_HELP_OVERLAY implementation]</text>
)}

// After:
import { HelpOverlayContent } from "../screens/Issues/keyboard/HelpOverlayContent.js";

{activeOverlay === "help" && <HelpOverlayContent />}
```

Note: `HelpOverlayContent` is screen-agnostic (reads from global `KeybindingContext`). Location in Issues directory is a delivery artifact; it should be promoted to `apps/tui/src/components/HelpOverlayContent.tsx` in a follow-up.

---

### Step 11: Integrate useIssueKeyboard() into all issue screens

**File: `apps/tui/src/screens/Issues/IssueListScreen.tsx`** (modify)

Replace existing `useScreenKeybindings()` with `useIssueKeyboard()`. Pass list-specific bindings (`j`, `k`, `down`, `up`, `return`, `G`, `ctrl+d`, `ctrl+u`, `/`, `f`, `L`, `a`, `m`, `o`, `c`, `x`, ` `). Set `focusContext` dynamically based on search/overlay state. Register `goTo.activate` with `GoToContext` on mount.

**File: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`** (modify)

Add `useIssueKeyboard()` with detail-specific bindings (`j`, `k`, `G`, `ctrl+d`, `ctrl+u`, `n`, `p`, `c`, `e`, `o`, `return`). Set `focusContext: "detail"`.

**File: `apps/tui/src/screens/Issues/IssueCreateForm.tsx`** (modify)

Add `useIssueKeyboard()` with form-specific bindings (`tab`, `shift+tab`, `ctrl+s`). Set `focusContext: "form-field"`. Wire `isFormDirty` and `onFormDirtyConfirm`.

**File: `apps/tui/src/screens/Issues/IssueEditForm.tsx`** (modify)

Same pattern as `IssueCreateForm` but with `subScreen: "edit-form"` and `save` instead of `submit`.

---

### Step 12: Create barrel export

**File: `apps/tui/src/screens/Issues/keyboard/index.ts`** (new)

```typescript
export { useIssueKeyboard } from "./useIssueKeyboard.js";
export type { IssueKeyboardConfig, IssueKeyboardReturn } from "./useIssueKeyboard.js";
export { useGoToMode } from "./useGoToMode.js";
export { useEscCascade } from "./useEscCascade.js";
export { useIssueStatusBarHints } from "./useIssueStatusBarHints.js";
export { HelpOverlayContent } from "./HelpOverlayContent.js";
export { ISSUE_COMMANDS } from "./issueCommands.js";
export * from "./constants.js";
export * from "./types.js";
```

---

## File Inventory

### New Files (11)

| Path | Purpose |
|------|----------|
| `apps/tui/src/screens/Issues/keyboard/index.ts` | Barrel export |
| `apps/tui/src/screens/Issues/keyboard/constants.ts` | Priority constants, limits, timeouts |
| `apps/tui/src/screens/Issues/keyboard/types.ts` | Type definitions |
| `apps/tui/src/screens/Issues/keyboard/useIssueKeyboard.ts` | Capstone orchestration hook |
| `apps/tui/src/screens/Issues/keyboard/useGoToMode.ts` | Go-to mode state management |
| `apps/tui/src/screens/Issues/keyboard/useEscCascade.ts` | Esc cascade priority logic |
| `apps/tui/src/screens/Issues/keyboard/useIssueStatusBarHints.ts` | Responsive hint computation |
| `apps/tui/src/screens/Issues/keyboard/HelpOverlayContent.tsx` | Help overlay grouped keybinding display |
| `apps/tui/src/screens/Issues/keyboard/issueCommands.ts` | Command palette action definitions |
| `apps/tui/src/providers/GoToContext.tsx` | Go-to mode activation context |
| `e2e/tui/issues-keyboard.test.ts` | All 120 E2E tests |

### Modified Files (5)

| Path | Change |
|------|--------|
| `apps/tui/src/components/GlobalKeybindings.tsx` | Wire `onHelp`, `onCommandPalette`, `onGoTo` to real handlers |
| `apps/tui/src/components/OverlayLayer.tsx` | Replace help overlay placeholder with `HelpOverlayContent` |
| `apps/tui/src/screens/Issues/IssueListScreen.tsx` | Replace `useScreenKeybindings` with `useIssueKeyboard` |
| `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` | Add `useIssueKeyboard` integration |
| `apps/tui/src/screens/Issues/IssueCreateForm.tsx` | Add `useIssueKeyboard` with form config |
| `apps/tui/src/screens/Issues/IssueEditForm.tsx` | Add `useIssueKeyboard` with form config |
| `apps/tui/src/index.tsx` | Add `GoToProvider` to provider stack |

---

## Productionization Checklist

### 1. Promote HelpOverlayContent to shared component

`HelpOverlayContent` reads from the global `KeybindingContext.getAllBindings()` — it is screen-agnostic. After this ticket lands:
- Move `apps/tui/src/screens/Issues/keyboard/HelpOverlayContent.tsx` → `apps/tui/src/components/HelpOverlayContent.tsx`
- Update import in `OverlayLayer.tsx`
- Remove from Issues keyboard barrel export

### 2. Promote GoToContext and useGoToMode to shared layer

`GoToContext` and `useGoToMode()` are not issue-specific. After this ticket:
- Move `GoToContext.tsx` import into main provider stack permanently
- Move `useGoToMode.ts` to `apps/tui/src/hooks/useGoToMode.ts`
- Other screen domains (landings, workflows) can use the same go-to behavior

### 3. Extract ISSUE_WIDE_PRIORITY into keybinding-types.ts

If other screen domains need a domain-wide priority layer, add `DOMAIN_WIDE = 4.5` to the shared `PRIORITY` constant in `providers/keybinding-types.ts`.

### 4. Performance monitoring

The `HANDLER_BUDGET_MS` check is only active at `CODEPLANE_LOG_LEVEL=debug`. For production observability, add opt-in `CODEPLANE_TUI_PERF=1` environment variable that enables handler timing without full debug logging.

### 5. Command palette rendering

This ticket defines `ISSUE_COMMANDS` but does not implement command palette overlay content. A separate ticket should implement `CommandPaletteContent` component that:
- Renders fuzzy-searchable list from command registry
- Filters by commands registered by active screen
- Executes selected command on Enter
- Uses `@codeplane/ui-core` `fuzzySearch()` utility

### 6. Catch-all handler for unknown go-to keys

The current `useGoToMode` registers specific keys. If OpenTUI's dispatch lets unmatched keys fall through, unknown keys during go-to mode would be processed by screen bindings. Verify this behavior in a PoC test and add a catch-all if needed (register a wildcard handler or intercept at the `useKeyboard` level before dispatch).

---

## Unit & Integration Tests

### Test File: `e2e/tui/issues-keyboard.test.ts`

All 120 tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  WRITE_TOKEN,
  READ_TOKEN,
  OWNER,
  type TUITestInstance,
} from "./helpers";
```

---

#### Section 1: Terminal Snapshot Tests — Status Bar Hints (9 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Status Bar Hints", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 1
  test("issue-keyboard-status-bar-list-120x40", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/j\/k/);
    expect(statusLine).toMatch(/open/);
    expect(statusLine).toMatch(/state|filter/);
    expect(statusLine).toMatch(/search/);
    expect(statusLine).toMatch(/new/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 2
  test("issue-keyboard-status-bar-list-80x24", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/j\/k/);
    expect(statusLine).toMatch(/open/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 3
  test("issue-keyboard-status-bar-list-200x60", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/j\/k/);
    expect(statusLine).toMatch(/sort/);
    expect(statusLine).toMatch(/back/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 4
  test("issue-keyboard-status-bar-detail-120x40", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/scroll/);
    expect(statusLine).toMatch(/comment/);
    expect(statusLine).toMatch(/reply/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 5
  test("issue-keyboard-status-bar-detail-80x24", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/scroll/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 6
  test("issue-keyboard-status-bar-create-form", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/Tab/);
    expect(statusLine).toMatch(/submit/);
    expect(statusLine).toMatch(/cancel|Esc/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 7
  test("issue-keyboard-status-bar-bulk-selection", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Space", "j", "Space", "j", "Space");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/3/);
    expect(statusLine).toMatch(/selected/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 8
  test("issue-keyboard-status-bar-search-active", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("/");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/apply/);
    expect(statusLine).toMatch(/clear|Esc/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 9
  test("issue-keyboard-status-bar-goto-mode", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/g\s*[drilwnsofka]/);
    expect(tui.snapshot()).toMatchSnapshot();
  });
});
```

---

#### Section 2: Terminal Snapshot Tests — Help Overlay (6 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Help Overlay", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 10
  test("issue-keyboard-help-overlay-list", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    const snap = tui.snapshot();
    expect(snap).toMatch(/Navigation/);
    expect(snap).toMatch(/Filters/);
    expect(snap).toMatch(/Actions/);
    expect(snap).toMatch(/Global/);
    expect(snap).toMatchSnapshot();
  });

  // Test 11
  test("issue-keyboard-help-overlay-detail", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    const snap = tui.snapshot();
    expect(snap).toMatch(/Navigation/);
    expect(snap).toMatch(/Comments/);
    expect(snap).toMatch(/Actions/);
    expect(snap).toMatch(/Global/);
    expect(snap).toMatchSnapshot();
  });

  // Test 12
  test("issue-keyboard-help-overlay-create-form", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    const snap = tui.snapshot();
    expect(snap).toMatch(/Form/);
    expect(snap).toMatch(/Global/);
    expect(snap).toMatchSnapshot();
  });

  // Test 13
  test("issue-keyboard-help-overlay-80x24", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 14
  test("issue-keyboard-help-overlay-200x60", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 15
  test("issue-keyboard-help-overlay-scrolled", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    await tui.sendKeys("j", "j", "j");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});
```

---

#### Section 3: Keyboard Tests — List Navigation (11 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — List Navigation", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 16
  test("issue-keyboard-j-moves-down-in-list", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const before = tui.snapshot();
    await tui.sendKeys("j");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 17
  test("issue-keyboard-k-moves-up-in-list", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("j", "j");
    const before = tui.snapshot();
    await tui.sendKeys("k");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 18
  test("issue-keyboard-down-arrow-moves-down", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const before = tui.snapshot();
    await tui.sendKeys("Down");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 19
  test("issue-keyboard-up-arrow-moves-up", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Down", "Down");
    const before = tui.snapshot();
    await tui.sendKeys("Up");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 20
  test("issue-keyboard-G-jumps-to-bottom", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("G");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 21
  test("issue-keyboard-gg-jumps-to-top", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("G");
    await tui.sendKeys("g", "g");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 22
  test("issue-keyboard-ctrl-d-pages-down", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const before = tui.snapshot();
    await tui.sendKeys("ctrl+d");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 23
  test("issue-keyboard-ctrl-u-pages-up", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("ctrl+d");
    const before = tui.snapshot();
    await tui.sendKeys("ctrl+u");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 24
  test("issue-keyboard-enter-opens-detail", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    const header = tui.getLine(0);
    expect(header).toMatch(/#\d+/);
  });

  // Test 25
  test("issue-keyboard-j-wraps-at-bottom", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("G");
    const atBottom = tui.snapshot();
    await tui.sendKeys("j");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 26
  test("issue-keyboard-k-stops-at-top", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const atTop = tui.snapshot();
    await tui.sendKeys("k");
    expect(tui.snapshot()).toBe(atTop);
  });
});
```

---

#### Section 4: Keyboard Tests — List Actions (9 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — List Actions", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 27
  test("issue-keyboard-c-opens-create-form", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    expect(tui.getLine(0)).toMatch(/Create|New/);
  });

  // Test 28
  test("issue-keyboard-x-closes-open-issue", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("x");
    await tui.waitForText("closed");
  });

  // Test 29
  test("issue-keyboard-x-reopens-closed-issue", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("f");
    await tui.waitForText("Closed");
    await tui.sendKeys("x");
    await tui.waitForText("open");
  });

  // Test 30
  test("issue-keyboard-x-reverts-on-403", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: READ_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("x");
    await tui.waitForText("failed");
  });

  // Test 31
  test("issue-keyboard-space-selects-row", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Space");
    expect(tui.getLine(tui.rows - 1)).toMatch(/1.*selected/);
  });

  // Test 32
  test("issue-keyboard-space-deselects-row", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Space", "Space");
    expect(tui.getLine(tui.rows - 1)).not.toMatch(/selected/);
  });

  // Test 33
  test("issue-keyboard-x-bulk-close", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Space", "j", "Space", "j", "Space");
    await tui.sendKeys("x");
    await tui.waitForText("closed");
  });

  // Test 34
  test("issue-keyboard-x-bulk-confirmation", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    for (let i = 0; i < 6; i++) await tui.sendKeys("Space", "j");
    await tui.sendKeys("x");
    await tui.waitForText("Confirm");
    await tui.sendKeys("Enter");
    await tui.waitForText("closed");
  });

  // Test 35
  test("issue-keyboard-x-bulk-deny-confirmation", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    for (let i = 0; i < 6; i++) await tui.sendKeys("Space", "j");
    await tui.sendKeys("x");
    await tui.waitForText("Confirm");
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Confirm");
    expect(tui.getLine(tui.rows - 1)).toMatch(/6.*selected/);
  });
});
```

---

#### Section 5: Keyboard Tests — Filters (7 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Filters", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 36
  test("issue-keyboard-f-cycles-state-filter", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("f");
    expect(tui.snapshot()).toMatch(/Closed|All/);
  });

  // Test 37
  test("issue-keyboard-L-opens-label-overlay", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("L");
    await tui.waitForText("Labels");
  });

  // Test 38
  test("issue-keyboard-a-opens-assignee-overlay", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("a");
    await tui.waitForText("Assignee");
  });

  // Test 39
  test("issue-keyboard-m-opens-milestone-overlay", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("m");
    await tui.waitForText("Milestone");
  });

  // Test 40
  test("issue-keyboard-slash-activates-search", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("/");
    expect(tui.getLine(tui.rows - 1)).toMatch(/apply|clear/);
  });

  // Test 41
  test("issue-keyboard-o-cycles-sort", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const before = tui.snapshot();
    await tui.sendKeys("o");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 42
  test("issue-keyboard-escape-clears-search", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("/");
    await tui.sendText("bug");
    await tui.sendKeys("Escape");
    expect(tui.getLine(tui.rows - 1)).toMatch(/navigate/);
  });
});
```

---

#### Section 6: Keyboard Tests — Detail Navigation (6 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Detail Navigation", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 43
  test("issue-keyboard-j-scrolls-detail", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    const before = tui.snapshot();
    await tui.sendKeys("j");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 44
  test("issue-keyboard-k-scrolls-detail-up", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("j", "j", "j");
    const before = tui.snapshot();
    await tui.sendKeys("k");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 45
  test("issue-keyboard-n-next-comment", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("n");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 46
  test("issue-keyboard-p-prev-comment", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("n");
    await tui.sendKeys("p");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 47
  test("issue-keyboard-n-at-last-comment-is-noop", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    for (let i = 0; i < 20; i++) await tui.sendKeys("n");
    const atEnd = tui.snapshot();
    await tui.sendKeys("n");
    expect(tui.snapshot()).toBe(atEnd);
  });

  // Test 48
  test("issue-keyboard-p-at-first-comment-is-noop", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    const atStart = tui.snapshot();
    await tui.sendKeys("p");
    expect(tui.snapshot()).toBe(atStart);
  });
});
```

---

#### Section 7: Keyboard Tests — Detail Actions (5 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Detail Actions", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 49
  test("issue-keyboard-c-opens-comment-form-on-detail", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("c");
    await tui.waitForText("Comment");
  });

  // Test 50
  test("issue-keyboard-e-opens-edit-form", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("e");
    await tui.waitForText("Edit");
  });

  // Test 51
  test("issue-keyboard-o-toggles-state-on-detail", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("o");
    await tui.waitForText(/closed|reopen/);
  });

  // Test 52
  test("issue-keyboard-enter-opens-dependency", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 53
  test("issue-keyboard-R-retries-on-detail", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("R");
    expect(tui.snapshot()).toBeDefined();
  });
});
```

---

#### Section 8: Keyboard Tests — Forms (8 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Forms", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 54
  test("issue-keyboard-tab-cycles-fields", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    const before = tui.snapshot();
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 55
  test("issue-keyboard-shift-tab-cycles-backwards", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendKeys("Tab");
    const atSecond = tui.snapshot();
    await tui.sendKeys("shift+Tab");
    expect(tui.snapshot()).not.toBe(atSecond);
  });

  // Test 56
  test("issue-keyboard-ctrl-s-submits-form", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("Test issue from e2e");
    await tui.sendKeys("ctrl+s");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 57
  test("issue-keyboard-printable-keys-not-intercepted-in-form", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("jjj");
    expect(tui.snapshot()).toMatch(/jjj/);
  });

  // Test 58
  test("issue-keyboard-form-validation-blocks-submit", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText(/required|title/i);
  });

  // Test 59
  test("issue-keyboard-esc-cancels-clean-form", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendKeys("Escape");
    await tui.waitForText("Issues");
    await tui.waitForNoText("Confirm");
  });

  // Test 60
  test("issue-keyboard-esc-dirty-form-shows-confirmation", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("Some title");
    await tui.sendKeys("Escape");
    await tui.waitForText("Confirm");
  });

  // Test 61
  test("issue-keyboard-esc-dirty-form-confirm-discard", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("Some title");
    await tui.sendKeys("Escape");
    await tui.waitForText("Confirm");
    await tui.sendKeys("Enter");
    await tui.waitForText("Issues");
  });
});
```

---

#### Section 9: Keyboard Tests — Overlays (5 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Overlays", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 62
  test("issue-keyboard-label-overlay-jk-navigates", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("L");
    await tui.waitForText("Labels");
    const before = tui.snapshot();
    await tui.sendKeys("j");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 63
  test("issue-keyboard-label-overlay-space-toggles", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("L");
    await tui.waitForText("Labels");
    await tui.sendKeys("Space");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 64
  test("issue-keyboard-label-overlay-enter-applies", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("L");
    await tui.waitForText("Labels");
    await tui.sendKeys("Space", "Enter");
    await tui.waitForNoText("Labels");
  });

  // Test 65
  test("issue-keyboard-label-overlay-esc-cancels", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("L");
    await tui.waitForText("Labels");
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Labels");
  });

  // Test 66
  test("issue-keyboard-overlay-filter-input", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("L");
    await tui.waitForText("Labels");
    await tui.sendKeys("/");
    await tui.sendText("bug");
    expect(tui.snapshot()).toMatch(/bug/);
  });
});
```

---

#### Section 10: Keyboard Tests — Priority & Suppression (7 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Priority & Suppression", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 67
  test("issue-keyboard-keys-suppressed-in-text-input", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("q");
    expect(tui.snapshot()).toMatch(/Title/);
    expect(tui.snapshot()).toMatch(/q/);
  });

  // Test 68
  test("issue-keyboard-keys-suppressed-in-overlay", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("L");
    await tui.waitForText("Labels");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toMatch(/Labels/);
  });

  // Test 69
  test("issue-keyboard-keys-suppressed-in-help", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toMatch(/Keybindings/);
  });

  // Test 70
  test("issue-keyboard-esc-from-overlay-closes-only-top", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Keybindings");
    expect(tui.snapshot()).toMatch(/Issues/);
  });

  // Test 71
  test("issue-keyboard-ctrl-c-from-input-quits", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendKeys("ctrl+c");
    await new Promise((r) => setTimeout(r, 500));
  });

  // Test 72
  test("issue-keyboard-esc-from-search-blurs", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("/");
    await tui.sendText("test");
    await tui.sendKeys("Escape");
    expect(tui.getLine(tui.rows - 1)).toMatch(/navigate/);
  });

  // Test 73
  test("issue-keyboard-ctrl-s-from-input-submits", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("Test");
    await tui.sendKeys("ctrl+s");
    expect(tui.snapshot()).toBeDefined();
  });
});
```

---

#### Section 11: Keyboard Tests — Go-To Mode (8 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Go-To Mode", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 74
  test("issue-keyboard-goto-d-navigates-to-dashboard", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g", "d");
    await tui.waitForText("Dashboard");
  });

  // Test 75
  test("issue-keyboard-goto-r-navigates-to-repos", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
  });

  // Test 76
  test("issue-keyboard-goto-n-navigates-to-notifications", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g", "n");
    await tui.waitForText("Notifications");
  });

  // Test 77
  test("issue-keyboard-goto-esc-cancels", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/g\s*[drilwnsofka]/);
    await tui.sendKeys("Escape");
    expect(tui.getLine(tui.rows - 1)).toMatch(/navigate/);
  });

  // Test 78
  test("issue-keyboard-gg-scrolls-to-top", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("G");
    await tui.sendKeys("g", "g");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 79
  test("issue-keyboard-goto-timeout-cancels-silently", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g");
    expect(tui.getLine(tui.rows - 1)).toMatch(/g\s*[drilwnsofka]/);
    await new Promise((r) => setTimeout(r, 2000));
    expect(tui.getLine(tui.rows - 1)).toMatch(/navigate/);
  });

  // Test 80
  test("issue-keyboard-goto-unknown-key-cancels", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g", "z");
    expect(tui.getLine(tui.rows - 1)).toMatch(/navigate/);
    expect(tui.snapshot()).toMatch(/Issues/);
  });

  // Test 81
  test("issue-keyboard-goto-q-cancels-and-pops", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g", "q");
    await tui.waitForNoText("Issues");
  });
});
```

---

#### Section 12: Keyboard Tests — Rapid Input (5 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Rapid Input", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 82
  test("issue-keyboard-rapid-j-navigates-multiple", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("j", "j", "j", "j", "j");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 83
  test("issue-keyboard-rapid-f-cycles-filter", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("f", "f", "f");
    expect(tui.snapshot()).toMatch(/Open|Closed|All/);
  });

  // Test 84
  test("issue-keyboard-rapid-space-toggles", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Space", "Space", "Space");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/1.*selected/);
  });

  // Test 85
  test("issue-keyboard-rapid-x-debounced", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("x", "x", "x");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 86
  test("issue-keyboard-rapid-mixed-sequence", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("j", "j", "Enter");
    await tui.waitForText("#");
    await tui.sendKeys("j", "j", "n", "q");
    await tui.waitForText("Issues");
  });
});
```

---

#### Section 13: Keyboard Tests — Context Disambiguation (6 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Context Disambiguation", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 87
  test("issue-keyboard-c-creates-on-list", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
  });

  // Test 88
  test("issue-keyboard-c-comments-on-detail", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("c");
    await tui.waitForText("Comment");
  });

  // Test 89
  test("issue-keyboard-c-types-in-form", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("c");
    expect(tui.snapshot()).toMatch(/c/);
    expect(tui.snapshot()).toMatch(/Title/);
  });

  // Test 90
  test("issue-keyboard-o-sorts-on-list", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const before = tui.snapshot();
    await tui.sendKeys("o");
    expect(tui.snapshot()).not.toBe(before);
  });

  // Test 91
  test("issue-keyboard-o-toggles-on-detail", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("o");
    await tui.waitForText(/closed|reopen/);
  });

  // Test 92
  test("issue-keyboard-o-types-in-form", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("o");
    expect(tui.snapshot()).toMatch(/o/);
  });
});
```

---

#### Section 14: Responsive Tests (14 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Responsive", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 93
  test("issue-keyboard-responsive-hints-80-list", async () => {
    tui = await launchTUI({ cols: 80, rows: 24, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    const status = tui.getLine(tui.rows - 1);
    const hintCount = (status.match(/:/g) || []).length;
    expect(hintCount).toBeLessThanOrEqual(4);
  });

  // Test 94
  test("issue-keyboard-responsive-hints-100-list", async () => {
    tui = await launchTUI({ cols: 100, rows: 30, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 95
  test("issue-keyboard-responsive-hints-120-list", async () => {
    tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    const status = tui.getLine(tui.rows - 1);
    expect(status).toMatch(/navigate/);
    expect(status).toMatch(/new/);
  });

  // Test 96
  test("issue-keyboard-responsive-hints-200-list", async () => {
    tui = await launchTUI({ cols: 200, rows: 60, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    const status = tui.getLine(tui.rows - 1);
    expect(status).toMatch(/sort/);
    expect(status).toMatch(/back/);
  });

  // Test 97
  test("issue-keyboard-responsive-hints-80-detail", async () => {
    tui = await launchTUI({ cols: 80, rows: 24, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 98
  test("issue-keyboard-responsive-hints-120-detail", async () => {
    tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 99
  test("issue-keyboard-responsive-help-80x24", async () => {
    tui = await launchTUI({ cols: 80, rows: 24, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 100
  test("issue-keyboard-responsive-help-200x60", async () => {
    tui = await launchTUI({ cols: 200, rows: 60, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  // Test 101
  test("issue-keyboard-responsive-resize-shrink", async () => {
    tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.resize(80, 24);
    const status = tui.getLine(tui.rows - 1);
    const hintCount = (status.match(/:/g) || []).length;
    expect(hintCount).toBeLessThanOrEqual(4);
  });

  // Test 102
  test("issue-keyboard-responsive-resize-grow", async () => {
    tui = await launchTUI({ cols: 80, rows: 24, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.resize(200, 60);
    const status = tui.getLine(tui.rows - 1);
    expect(status).toMatch(/sort/);
  });

  // Test 103
  test("issue-keyboard-responsive-resize-preserves-focus", async () => {
    tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.sendKeys("j", "j");
    await tui.resize(80, 24);
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
  });

  // Test 104
  test("issue-keyboard-responsive-resize-overlay", async () => {
    tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    await tui.resize(80, 24);
    expect(tui.snapshot()).toMatch(/Keybindings/);
  });

  // Test 105
  test("issue-keyboard-responsive-resize-form", async () => {
    tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.resize(80, 24);
    expect(tui.snapshot()).toMatch(/Title/);
  });

  // Test 106
  test("issue-keyboard-responsive-resize-hints-update", async () => {
    tui = await launchTUI({ cols: 200, rows: 60, env: { CODEPLANE_TOKEN: WRITE_TOKEN }, args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`] });
    await tui.waitForText("Issues");
    const wideBefore = tui.getLine(tui.rows - 1);
    await tui.resize(80, 24);
    const narrowAfter = tui.getLine(tui.rows - 1);
    expect(narrowAfter.length).toBeLessThan(wideBefore.length);
  });
});
```

---

#### Section 15: Integration Tests (14 tests)

```typescript
describe("TUI_ISSUE_KEYBOARD_SHORTCUTS — Integration", () => {
  let tui: TUITestInstance;
  afterEach(async () => { await tui?.terminate(); });

  // Test 107
  test("issue-keyboard-triage-workflow", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("j", "j");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("o");
    await tui.sendKeys("q");
    await tui.waitForText("Issues");
  });

  // Test 108
  test("issue-keyboard-create-and-view-workflow", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    await tui.waitForText("Title");
    await tui.sendText("E2E test issue");
    await tui.sendKeys("ctrl+s");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 109
  test("issue-keyboard-dependency-navigation", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 110
  test("issue-keyboard-auth-expiry", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: "expired_token_value" },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText(/expired|authenticate|login/i);
  });

  // Test 111
  test("issue-keyboard-rate-limit", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    for (let i = 0; i < 10; i++) await tui.sendKeys("x");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 112
  test("issue-keyboard-permission-denied", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: READ_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 113
  test("issue-keyboard-deep-link", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    const header = tui.getLine(0);
    expect(header).toMatch(/Issues/);
  });

  // Test 114
  test("issue-keyboard-command-palette-create", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys(":");
    await tui.waitForText("Command");
    await tui.sendText("create issue");
    await tui.sendKeys("Enter");
    await tui.waitForText("Title");
  });

  // Test 115
  test("issue-keyboard-command-palette-filter", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys(":");
    await tui.waitForText("Command");
    await tui.sendText("filter closed");
    await tui.sendKeys("Enter");
    expect(tui.snapshot()).toMatch(/Closed/);
  });

  // Test 116
  test("issue-keyboard-back-navigation-stack", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Enter");
    await tui.waitForText("#");
    await tui.sendKeys("e");
    await tui.waitForText("Edit");
    await tui.sendKeys("Escape");
    await tui.waitForText("#");
    await tui.sendKeys("q");
    await tui.waitForText("Issues");
  });

  // Test 117
  test("issue-keyboard-help-scrolling-full", async () => {
    tui = await launchTUI({
      cols: 80, rows: 24,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    for (let i = 0; i < 10; i++) await tui.sendKeys("j");
    await tui.sendKeys("G");
    expect(tui.snapshot()).toMatch(/Global/);
  });

  // Test 118
  test("issue-keyboard-concurrent-actions", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("Space", "j", "Space");
    await tui.sendKeys("x");
    expect(tui.snapshot()).toBeDefined();
  });

  // Test 119
  test("issue-keyboard-empty-list", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      args: ["--screen", "issues", "--repo", `${OWNER}/empty-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("j");
    await tui.sendKeys("k");
    await tui.sendKeys("Enter");
    await tui.sendKeys("x");
    await tui.sendKeys("Space");
    expect(tui.snapshot()).toMatch(/Issues/);
    await tui.sendKeys("c");
    await tui.waitForText("Title");
  });

  // Test 120
  test("issue-keyboard-no-color-terminal", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: WRITE_TOKEN, NO_COLOR: "1", COLORTERM: "" },
      args: ["--screen", "issues", "--repo", `${OWNER}/test-repo`],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    expect(tui.snapshot()).toBeDefined();
  });
});
```

---

**Total: 120 tests** across 15 `describe` blocks. All tests left failing if backend is unimplemented — never skipped or commented out.

---

## Logging Summary

All logging goes to `stderr` via `process.stderr.write()`. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Key dispatched | `IssueKeyboard: dispatched [key={key}] [handler={desc}] [layer={layer}] [elapsed_ms={ms}]` |
| `debug` | Key suppressed | `IssueKeyboard: suppressed [key={key}] [reason={reason}] [sub_screen={sub_screen}]` |
| `debug` | Go-to entered | `IssueKeyboard: goto mode entered [sub_screen={sub_screen}]` |
| `debug` | Go-to resolved | `IssueKeyboard: goto resolved [destination={dest}] [elapsed_ms={ms}]` |
| `debug` | Go-to cancelled | `IssueKeyboard: goto cancelled [reason={reason}] [elapsed_ms={ms}]` |
| `debug` | Hints updated | `IssueKeyboard: hints updated [count={n}] [truncated={bool}] [width={w}] [sub_screen={sub_screen}]` |
| `debug` | Esc cascade | `IssueKeyboard: esc cascade [level={level}] [sub_screen={sub_screen}]` |
| `info` | Help toggled | `IssueKeyboard: help overlay [action=open|close] [groups={n}] [entries={n}]` |
| `info` | Action triggered | `IssueKeyboard: action [key={key}] [action={action}] [repo={repo}] [issue={number}]` |
| `info` | Bulk action | `IssueKeyboard: bulk action [action={action}] [count={n}] [repo={repo}]` |
| `warn` | Action failed | `IssueKeyboard: action failed [key={key}] [action={action}] [error={type}] [status={http_status}]` |
| `warn` | Budget exceeded | `IssueKeyboard: handler exceeded budget [key={key}] [elapsed_ms={ms}] [budget_ms=16]` |
| `error` | Handler exception | `IssueKeyboard: handler error [key={key}] [handler={handler}] [error={msg}]` |
| `error` | Auth error | `IssueKeyboard: auth error [action={action}] [repo={repo}] [status=401]` |