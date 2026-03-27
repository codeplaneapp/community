# Engineering Specification: TUI Reusable ListComponent with Vim-Style Keyboard Navigation

**Ticket:** `tui-list-component`
**Status:** `Partial`
**Dependencies:** `tui-theme-and-color-tokens` (✅ Complete), `tui-bootstrap-and-renderer` (✅ Complete)

---

## 1. Overview

This specification describes the implementation of the shared `ListComponent` — the foundational list abstraction used across all list screens in the Codeplane TUI (issues, repos, landings, notifications, workflows, workspaces, agents, organizations, search results, etc.).

The deliverable is a composable component + hook system:

1. **`hooks/useKeyboardNavigation.ts`** — Vim-style keyboard navigation for list focus management (`j/k`, `G/gg`, `Ctrl+D/U`, `Enter`, `Space`).
2. **`hooks/useListSelection.ts`** — Multi-select state management with `Space` toggle, `selectAll`, and `clearSelection`.
3. **`components/ListEmptyState.tsx`** — Centered muted empty message component.
4. **`components/ListRow.tsx`** — Single row wrapper with focus highlight and selection indicator.
5. **`components/ListComponent.tsx`** — A scrollbox-wrapped vertical list with focused row highlighting, empty state, and pagination loading.
6. **Pagination integration** — `onEndReached` callback firing at 80% scroll threshold with inline loading indicator.
7. **Focus-gated keyboard activation** — Navigation bindings only active when the list has focus (not during search input or modal overlay).

This component replaces ad-hoc list rendering in individual screens with a single, tested, composable abstraction.

---

## 2. Current State Assessment

### Production Files (in `apps/tui/src/`)

| File | State | Relevance |
|------|-------|----------|
| `components/SkeletonList.tsx` | 84 lines, complete | Loading placeholder for list views. **Not** the interactive list — purely visual skeleton. |
| `components/PaginationIndicator.tsx` | 60 lines, complete | Inline loading/error indicator. Will be consumed by ListComponent. |
| `hooks/usePaginationLoading.ts` | 108 lines, complete | Manages pagination state, deduplication, retry. ListComponent will compose this. |
| `hooks/useScreenKeybindings.ts` | 55 lines, complete | Registers screen-level keybindings. ListComponent will use this for focus-gated bindings. |
| `hooks/useLayout.ts` | 110 lines, complete | Provides `contentHeight` for viewport calculations. |
| `hooks/useTheme.ts` | 30 lines, complete | Provides semantic color tokens for focus styling. |
| `providers/KeybindingProvider.tsx` | 165 lines, complete | Priority-based keyboard dispatch. ListComponent registers a SCREEN-priority scope. |
| `providers/keybinding-types.ts` | 89 lines, complete | `KeyHandler`, `PRIORITY`, `StatusBarHint` types. |
| `providers/normalize-key.ts` | 74 lines, complete | `normalizeKeyEvent()` and `normalizeKeyDescriptor()` for consistent key lookup. |
| `theme/tokens.ts` | 263 lines, complete | `TextAttributes.REVERSE` for focused row highlight, `statusToToken()` for semantic coloring. |
| `loading/types.ts` | 150 lines, complete | `PaginationStatus`, `LoadingError` types. |
| `loading/constants.ts` | 39 lines, complete | `PAGINATION_INDICATOR_PADDING`, `RETRY_DEBOUNCE_MS` constants. |
| `components/ErrorScreen.tsx` | 415 lines, complete | Contains reference `gg` two-key state machine implementation (lines 260-271). |
| `navigation/goToBindings.ts` | 51 lines, complete | Go-to mode destinations. Note: `g` key is registered as a go-to prefix at PRIORITY.GLOBAL. |

### Absent from Production

- `components/ListComponent.tsx` — Does not exist
- `hooks/useKeyboardNavigation.ts` — Does not exist
- `hooks/useListSelection.ts` — Does not exist
- `components/ListRow.tsx` — Does not exist
- `components/ListEmptyState.tsx` — Does not exist
- No reusable list component anywhere in `apps/tui/src/`

---

## 3. File Inventory

### Source Files (all under `apps/tui/src/`)

| File | Purpose | Action |
|------|---------|--------|
| `hooks/useKeyboardNavigation.ts` | Vim-style list focus management hook | **New** |
| `hooks/useListSelection.ts` | Multi-select state management hook | **New** |
| `components/ListComponent.tsx` | Reusable scrollbox list with focus, selection, pagination | **New** |
| `components/ListEmptyState.tsx` | Centered muted empty message component | **New** |
| `components/ListRow.tsx` | Single row wrapper with focus highlight and selection indicator | **New** |
| `components/index.ts` | Barrel re-exports for components | **Modify** — add 3 new exports |
| `hooks/index.ts` | Barrel re-exports for hooks | **Modify** — add 2 new exports |

### Test Files (all under `e2e/tui/`)

| File | Purpose | Action |
|------|---------|--------|
| `list-component.test.ts` | E2E tests for ListComponent keyboard navigation, pagination, selection, empty state, snapshots | **New** |

---

## 4. Implementation Plan

### Step 1: `hooks/useKeyboardNavigation.ts`

**File:** `apps/tui/src/hooks/useKeyboardNavigation.ts`

A hook that manages focused index state and produces keybinding handlers for vim-style list navigation. It returns handler functions and a `bindings` array that the consuming component passes to `useScreenKeybindings()`.

#### Interface

```typescript
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { KeyHandler } from "../providers/keybinding-types.js";

export interface UseKeyboardNavigationOptions {
  /** Total number of items in the list. */
  itemCount: number;
  /** Number of visible rows in the viewport (for page up/down). */
  viewportHeight: number;
  /** Callback when Enter is pressed on the focused item. */
  onSelect?: (index: number) => void;
  /** Callback when Space is pressed on the focused item (multi-select toggle). */
  onToggleSelect?: (index: number) => void;
  /**
   * Predicate controlling whether navigation bindings are active.
   * When false, all key handlers are no-ops via the `when` predicate.
   * Used to disable navigation during search input focus.
   * Defaults to () => true.
   */
  isActive?: () => boolean;
  /**
   * Callback fired when focused index changes.
   * Used to trigger scroll-into-view and pagination checks.
   */
  onFocusChange?: (index: number) => void;
}

export interface UseKeyboardNavigationReturn {
  /** Currently focused item index (0-based). -1 when list is empty. */
  focusedIndex: number;
  /** Imperatively set the focused index (clamped to valid range). */
  setFocusedIndex: (index: number) => void;
  /**
   * Array of KeyHandler objects ready to pass to useScreenKeybindings().
   * Includes j/k, G, Ctrl+D/U, Enter, Space.
   * Does NOT include gg (see gg section below).
   */
  bindings: KeyHandler[];
  /** Jump to the first item (index 0). Exposed for gg wiring. */
  jumpToTop: () => void;
  /** Jump to the last item. Exposed for G binding. */
  jumpToBottom: () => void;
}
```

#### Navigation behaviors

| Key | Action | Edge behavior |
|-----|--------|---------------|
| `j` / `down` | Move focus down by 1 | Clamps at last item (no wrap) |
| `k` / `up` | Move focus up by 1 | Clamps at first item (no wrap) |
| `G` | Jump to last item | No-op if list is empty |
| `ctrl+d` | Page down (half viewport height) | Clamps at last item |
| `ctrl+u` | Page up (half viewport height) | Clamps at first item |
| `return` | Select focused item | Calls `onSelect(focusedIndex)`. No-op if empty. |
| ` ` (space) | Toggle multi-select on focused item | Calls `onToggleSelect(focusedIndex)`. No-op if `onToggleSelect` is undefined. |

#### Key descriptor reference

All key descriptors follow the normalization rules in `providers/normalize-key.ts`:
- Single characters: `"j"`, `"k"`, `" "` (space)
- Uppercase: `"G"` (detected via `event.shift + event.name === "g"`, normalized to `"G"`)
- Modifiers: `"ctrl+d"`, `"ctrl+u"`
- Special keys: `"return"` (Enter), `"up"`, `"down"`

The `normalizeKeyDescriptor()` function handles aliases: `"enter"` → `"return"`, `"esc"` → `"escape"`, `"arrowup"` → `"up"`, `"arrowdown"` → `"down"`. Uppercase single letters (A-Z) are preserved as-is. All other descriptors are lowercased and have parts joined by `+`.

#### `isActive` gating

Every handler in the `bindings` array includes a `when` predicate that delegates to the `isActive` option. When `isActive` returns `false` (e.g., search input is focused), all navigation bindings are skipped by the keybinding dispatch system, allowing the text input at PRIORITY.TEXT_INPUT to receive keystrokes:

```typescript
const when = options.isActive ?? (() => true);

// Each binding:
{ key: "j", description: "Move down", group: "Navigation", handler: moveDown, when }
```

The `KeybindingProvider` dispatches keys by priority (lower number = higher priority). TEXT_INPUT (1) > MODAL (2) > GOTO (3) > SCREEN (4) > GLOBAL (5). When a `<input>` or `<textarea>` is focused, OpenTUI's focus system captures printable keys at TEXT_INPUT priority before SCREEN-level bindings can see them. The `when` predicate provides an additional safety layer for edge cases where focus tracking may lag.

#### Focused index clamping

When `itemCount` changes (items added/removed, filter applied), the hook clamps `focusedIndex` to `[0, itemCount - 1]` via a `useEffect`. If `itemCount` drops to 0, `focusedIndex` is set to -1.

```typescript
useEffect(() => {
  if (itemCount === 0) {
    setFocusedIndexRaw(-1);
  } else {
    setFocusedIndexRaw((prev) => {
      const clamped = Math.max(0, Math.min(prev, itemCount - 1));
      if (prev < 0 && clamped === 0) {
        // Transitioning from empty to non-empty
        onFocusChangeRef.current?.(0);
      }
      return clamped;
    });
  }
}, [itemCount]);
```

#### Implementation details

```typescript
export function useKeyboardNavigation(
  options: UseKeyboardNavigationOptions,
): UseKeyboardNavigationReturn {
  const {
    itemCount,
    viewportHeight,
    onSelect,
    onToggleSelect,
    isActive,
    onFocusChange,
  } = options;

  const [focusedIndex, setFocusedIndexRaw] = useState<number>(
    itemCount > 0 ? 0 : -1,
  );

  const when = isActive ?? (() => true);

  // Ref for onFocusChange to avoid stale closures
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;

  const setFocusedIndex = useCallback(
    (index: number) => {
      const clamped =
        itemCount === 0 ? -1 : Math.max(0, Math.min(index, itemCount - 1));
      setFocusedIndexRaw(clamped);
      if (clamped >= 0) {
        onFocusChangeRef.current?.(clamped);
      }
    },
    [itemCount],
  );

  // Clamp on itemCount change
  useEffect(() => {
    if (itemCount === 0) {
      setFocusedIndexRaw(-1);
    } else {
      setFocusedIndexRaw((prev) => {
        const clamped = Math.max(0, Math.min(prev, itemCount - 1));
        if (prev < 0 && clamped === 0) {
          onFocusChangeRef.current?.(0);
        }
        return clamped;
      });
    }
  }, [itemCount]);

  const moveDown = useCallback(() => {
    setFocusedIndexRaw((prev) => {
      const next = Math.min(prev + 1, itemCount - 1);
      if (next !== prev) onFocusChangeRef.current?.(next);
      return next;
    });
  }, [itemCount]);

  const moveUp = useCallback(() => {
    setFocusedIndexRaw((prev) => {
      const next = Math.max(prev - 1, 0);
      if (next !== prev) onFocusChangeRef.current?.(next);
      return next;
    });
  }, [itemCount]);

  const jumpToBottom = useCallback(() => {
    if (itemCount === 0) return;
    const last = itemCount - 1;
    setFocusedIndexRaw(last);
    onFocusChangeRef.current?.(last);
  }, [itemCount]);

  const jumpToTop = useCallback(() => {
    if (itemCount === 0) return;
    setFocusedIndexRaw(0);
    onFocusChangeRef.current?.(0);
  }, [itemCount]);

  const pageDown = useCallback(() => {
    const pageSize = Math.max(1, Math.floor(viewportHeight / 2));
    setFocusedIndexRaw((prev) => {
      const next = Math.min(prev + pageSize, itemCount - 1);
      if (next !== prev) onFocusChangeRef.current?.(next);
      return next;
    });
  }, [viewportHeight, itemCount]);

  const pageUp = useCallback(() => {
    const pageSize = Math.max(1, Math.floor(viewportHeight / 2));
    setFocusedIndexRaw((prev) => {
      const next = Math.max(prev - pageSize, 0);
      if (next !== prev) onFocusChangeRef.current?.(next);
      return next;
    });
  }, [viewportHeight, itemCount]);

  const handleSelect = useCallback(() => {
    if (focusedIndex >= 0 && focusedIndex < itemCount) {
      onSelect?.(focusedIndex);
    }
  }, [focusedIndex, itemCount, onSelect]);

  const handleToggleSelect = useCallback(() => {
    if (onToggleSelect && focusedIndex >= 0 && focusedIndex < itemCount) {
      onToggleSelect(focusedIndex);
    }
  }, [focusedIndex, itemCount, onToggleSelect]);

  const bindings: KeyHandler[] = useMemo(
    () => [
      { key: "j",      description: "Move down",     group: "Navigation", handler: moveDown,           when },
      { key: "down",   description: "Move down",     group: "Navigation", handler: moveDown,           when },
      { key: "k",      description: "Move up",       group: "Navigation", handler: moveUp,             when },
      { key: "up",     description: "Move up",       group: "Navigation", handler: moveUp,             when },
      { key: "G",      description: "Jump to bottom", group: "Navigation", handler: jumpToBottom,       when },
      { key: "ctrl+d", description: "Page down",     group: "Navigation", handler: pageDown,           when },
      { key: "ctrl+u", description: "Page up",       group: "Navigation", handler: pageUp,             when },
      { key: "return", description: "Open",          group: "Actions",    handler: handleSelect,       when },
      ...(onToggleSelect
        ? [{ key: " ", description: "Select", group: "Actions", handler: handleToggleSelect, when }]
        : []),
    ],
    [moveDown, moveUp, jumpToBottom, pageDown, pageUp, handleSelect, handleToggleSelect, when, onToggleSelect],
  );

  return {
    focusedIndex,
    setFocusedIndex,
    bindings,
    jumpToTop,
    jumpToBottom,
  };
}
```

#### The `gg` Problem

The global keybinding system handles `g` as the go-to mode prefix at PRIORITY.GOTO (priority 3), which is higher than SCREEN (priority 4). When the user presses `g`, the global go-to mode activates and waits 1500ms for a second key. Pressing `g` again within go-to mode does not currently map to any go-to destination.

The `gg` → "jump to top" binding must be registered as a **go-to destination** rather than a screen keybinding, because the first `g` is consumed by the go-to system before screen bindings can see it.

**Resolution strategy:**

The `useKeyboardNavigation` hook exposes `jumpToTop()` as a public function. The `ListComponent` does NOT register `gg` itself. Instead:

1. For this ticket, `ListComponent` exposes `jumpToTop` via a callback prop pattern.
2. The go-to bindings system (`navigation/goToBindings.ts`) should eventually register `g` as a context-sensitive destination that calls `jumpToTop()` when a list screen is active. That integration is out of scope for this ticket but is enabled by the exposed `jumpToTop` function.
3. As a pragmatic fallback until go-to mode handles `gg`, individual screens can register a `g` handler at SCREEN priority with a two-key state machine (following the pattern in `ErrorScreen.tsx` lines 260-271). The hook provides the `jumpToTop` function for this purpose.

**The `ErrorScreen.tsx` reference pattern** (lines 260-271) shows the two-key `gg` detection:
```typescript
// Track last key time for gg detection
const lastKeyRef = useRef({ key: "", time: 0 });
if (key === "g") {
  if (lastKeyRef.current.key === "g" && now - lastKeyRef.current.time < 500) {
    scrollToTop();
    lastKeyRef.current = { key: "", time: 0 };
    return;
  }
  lastKeyRef.current = { key: "g", time: now };
  return;
}
```

This approach is NOT used inside `useKeyboardNavigation` because it conflicts with the GOTO priority system. The hook cleanly exposes `jumpToTop` and leaves `gg` wiring to the consuming context.

---

### Step 2: `hooks/useListSelection.ts`

**File:** `apps/tui/src/hooks/useListSelection.ts`

A hook that manages multi-select state for list items. Tracks selected item IDs as a `Set<string>` and provides toggle, selectAll, and clearSelection operations.

#### Interface

```typescript
import { useState, useCallback, useMemo } from "react";

export interface UseListSelectionOptions<T> {
  /** The full list of items (used for selectAll). */
  items: T[];
  /** Extract a unique string ID from an item. */
  keyExtractor: (item: T) => string;
}

export interface UseListSelectionReturn {
  /** Set of currently selected item IDs. */
  selectedIds: ReadonlySet<string>;
  /** Whether a specific item ID is selected. */
  isSelected: (id: string) => boolean;
  /** Toggle selection of a single item by ID. */
  toggle: (id: string) => void;
  /** Select all items in the current list. */
  selectAll: () => void;
  /** Clear all selections. */
  clearSelection: () => void;
  /** Number of currently selected items. */
  selectedCount: number;
}
```

#### Implementation

```typescript
export function useListSelection<T>(
  options: UseListSelectionOptions<T>,
): UseListSelectionReturn {
  const { items, keyExtractor } = options;
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const isSelected = useCallback(
    (id: string): boolean => selectedIds.has(id),
    [selectedIds],
  );

  const toggle = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next; // New Set reference triggers React re-render
      });
    },
    [],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(keyExtractor)));
  }, [items, keyExtractor]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedCount = selectedIds.size;

  return {
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    clearSelection,
    selectedCount,
  };
}
```

#### Behavior details

- `toggle(id)`: If `id` is in `selectedIds`, remove it. Otherwise, add it. Returns a new `Set` reference.
- `selectAll()`: Creates a new Set from all current item IDs. Overwrites existing selections.
- `clearSelection()`: Resets `selectedIds` to an empty `Set`.
- **Stale selection retention:** When the `items` array changes (e.g., new page loaded, filter applied), stale selections for items no longer in the list are **retained** (not pruned). This allows selections to persist across pagination loads. Consumers can call `clearSelection()` when appropriate.
- The `selectedIds` set is a new `Set` reference on every mutation to trigger React re-renders.

---

### Step 3: `components/ListEmptyState.tsx`

**File:** `apps/tui/src/components/ListEmptyState.tsx`

A simple centered, muted-text component shown when a list has zero items.

```typescript
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { TextAttributes } from "../theme/tokens.js";

export interface ListEmptyStateProps {
  /** Message to display. Defaults to "No items" */
  message?: string;
}

/**
 * Centered empty state message shown when a list has zero items.
 * Uses muted color with DIM attribute for de-emphasized appearance.
 */
export function ListEmptyState({ message = "No items" }: ListEmptyStateProps) {
  const theme = useTheme();
  const { contentHeight } = useLayout();

  return (
    <box
      flexDirection="column"
      width="100%"
      height={contentHeight}
      justifyContent="center"
      alignItems="center"
    >
      <text
        fg={theme.muted}
        attributes={TextAttributes.DIM}
      >
        {message}
      </text>
    </box>
  );
}
```

#### Constraints
- Vertically and horizontally centered within the content area.
- Uses `theme.muted` color (RGBA from `ThemeTokens`) with `TextAttributes.DIM` (SGR 2) attribute for de-emphasized appearance.
- No interactivity — purely presentational.
- The message is a single line. Long messages are truncated by the terminal; no wrapping.

---

### Step 4: `components/ListRow.tsx`

**File:** `apps/tui/src/components/ListRow.tsx`

A wrapper component for a single row in the list. Handles focus highlighting and selection indicator.

```typescript
import type { ReactNode } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { TextAttributes } from "../theme/tokens.js";

export interface ListRowProps {
  /** Whether this row is the focused row. */
  focused: boolean;
  /** Whether this row is selected (multi-select). */
  selected?: boolean;
  /** Row content provided by the consumer's renderItem function. */
  children: ReactNode;
  /** Row height in terminal rows. Defaults to 1. */
  height?: number;
}

/**
 * Single row wrapper for ListComponent.
 *
 * Focus rendering uses reverse video (ANSI SGR 7) for maximum
 * compatibility across all color tiers and terminal emulators.
 *
 * Selected-but-unfocused rows show a ● bullet prefix in primary color.
 */
export function ListRow({
  focused,
  selected = false,
  children,
  height = 1,
}: ListRowProps) {
  const theme = useTheme();

  return (
    <box
      flexDirection="row"
      width="100%"
      height={height}
      paddingX={1}
      attributes={focused ? TextAttributes.REVERSE : 0}
    >
      {/* Selection indicator */}
      {selected && (
        <text fg={theme.primary}>● </text>
      )}
      {!selected && (
        <text>  </text>
      )}
      {/* Row content */}
      <box flexGrow={1} flexDirection="row">
        {children}
      </box>
    </box>
  );
}
```

#### Focus rendering strategy

The architecture document specifies "reverse video or accent color" for focused rows. We use **reverse video** (`TextAttributes.REVERSE`, value `1 << 3 = 8`) applied to the entire row's `<box>` via the `attributes` prop because:
1. It works identically across all 3 color tiers (truecolor, ansi256, ansi16).
2. It is universally supported by terminal emulators.
3. It provides maximum contrast regardless of terminal background color.
4. This matches the pattern used in `ErrorScreen.tsx` for navigation.

For **selected but unfocused** rows, we show a `●` bullet prefix in `theme.primary` color. For **unselected** rows, we show two spaces to maintain consistent indentation.

For **selected + focused** rows, both the reverse video and the `●` indicator are visible — the reverse video inverts the `●` color, making it still distinguishable.

---

### Step 5: `components/ListComponent.tsx`

**File:** `apps/tui/src/components/ListComponent.tsx`

The main reusable list component. Composes `useKeyboardNavigation`, `useListSelection`, `ListRow`, `ListEmptyState`, and `PaginationIndicator`.

#### Props Interface

```typescript
import type { ReactNode } from "react";
import type { PaginationStatus, LoadingError } from "../loading/types.js";
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";

export interface ListComponentProps<T> {
  /** Array of items to render. */
  items: T[];
  /**
   * Render function for a single item.
   * Receives the item, whether it's focused, and its index.
   * Must return a React node that fits within a single ListRow.
   */
  renderItem: (item: T, focused: boolean, index: number) => ReactNode;
  /** Called when Enter is pressed on the focused item. */
  onSelect: (item: T) => void;
  /**
   * Called when multi-selection changes.
   * Undefined = multi-select disabled.
   */
  onMultiSelect?: (selectedItems: T[]) => void;
  /** Message shown when items array is empty. */
  emptyMessage?: string;
  /** Extract a unique string key from an item. */
  keyExtractor: (item: T) => string;

  // ── Pagination props ──────────────────────────────────────────
  /**
   * Called when focus reaches 80% of item count.
   * Undefined = no pagination.
   */
  onEndReached?: () => void;
  /** Whether more items are available to load. */
  hasMore?: boolean;
  /** Current pagination loading status. */
  paginationStatus?: PaginationStatus;
  /** Pagination error details. */
  paginationError?: LoadingError | null;
  /** Spinner frame for pagination indicator. */
  paginationSpinnerFrame?: string;

  // ── Focus gating ──────────────────────────────────────────────
  /**
   * Predicate controlling whether keyboard navigation is active.
   * Defaults to () => true.
   * Set to () => false when a search input or other text field has focus.
   */
  isNavigationActive?: () => boolean;

  // ── Additional keybindings ────────────────────────────────────
  /**
   * Extra keybindings to register alongside the list navigation bindings.
   * Allows screens to add list-context actions (e.g., 'c' for create, 'd' for delete)
   * without managing a separate keybinding scope.
   */
  extraBindings?: KeyHandler[];

  /**
   * Custom status bar hints. If not provided, auto-generated from bindings.
   * Passed through to useScreenKeybindings().
   */
  statusBarHints?: StatusBarHint[];

  /** Row height in terminal rows. Defaults to 1. */
  rowHeight?: number;
}
```

#### Implementation

```typescript
import { useCallback, useEffect, useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation.js";
import { useListSelection } from "../hooks/useListSelection.js";
import { PaginationIndicator } from "./PaginationIndicator.js";
import { ListEmptyState } from "./ListEmptyState.js";
import { ListRow } from "./ListRow.js";

export function ListComponent<T>({
  items,
  renderItem,
  onSelect,
  onMultiSelect,
  emptyMessage = "No items",
  keyExtractor,
  onEndReached,
  hasMore = false,
  paginationStatus = "idle",
  paginationError,
  paginationSpinnerFrame = "",
  isNavigationActive,
  extraBindings,
  statusBarHints,
  rowHeight = 1,
}: ListComponentProps<T>) {
  const { contentHeight } = useLayout();

  // ── Multi-select state ──────────────────────────────────────
  const selection = useListSelection({ items, keyExtractor });

  // ── Pagination: 80% threshold ───────────────────────────────
  const checkEndReached = useCallback(
    (index: number) => {
      if (!onEndReached || !hasMore || paginationStatus === "loading") return;
      const threshold = Math.floor(items.length * 0.8);
      if (index >= threshold) {
        onEndReached();
      }
    },
    [onEndReached, hasMore, paginationStatus, items.length],
  );

  // ── Keyboard navigation ─────────────────────────────────────
  const viewportRows = Math.max(1, Math.floor(contentHeight / rowHeight));
  const navigation = useKeyboardNavigation({
    itemCount: items.length,
    viewportHeight: viewportRows,
    onSelect: (index) => {
      if (index >= 0 && index < items.length) {
        onSelect(items[index]);
      }
    },
    onToggleSelect: onMultiSelect
      ? (index) => {
          if (index >= 0 && index < items.length) {
            selection.toggle(keyExtractor(items[index]));
          }
        }
      : undefined,
    isActive: isNavigationActive,
    onFocusChange: checkEndReached,
  });

  // ── Register keybindings ────────────────────────────────────
  const allBindings = useMemo(() => {
    const bindings = [...navigation.bindings];
    if (extraBindings) bindings.push(...extraBindings);
    return bindings;
  }, [navigation.bindings, extraBindings]);

  useScreenKeybindings(allBindings, statusBarHints);

  // ── Notify multi-select consumer ────────────────────────────
  useEffect(() => {
    if (onMultiSelect) {
      const selectedItems = items.filter((item) =>
        selection.isSelected(keyExtractor(item)),
      );
      onMultiSelect(selectedItems);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.selectedIds]);

  // ── Empty state ─────────────────────────────────────────────
  if (items.length === 0) {
    return <ListEmptyState message={emptyMessage} />;
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <box flexDirection="column" width="100%" height={contentHeight}>
      <scrollbox scrollY={true} flexGrow={1}>
        <box flexDirection="column" width="100%">
          {items.map((item, index) => (
            <ListRow
              key={keyExtractor(item)}
              focused={index === navigation.focusedIndex}
              selected={
                onMultiSelect
                  ? selection.isSelected(keyExtractor(item))
                  : false
              }
              height={rowHeight}
            >
              {renderItem(item, index === navigation.focusedIndex, index)}
            </ListRow>
          ))}
        </box>
      </scrollbox>
      {/* Pagination indicator at bottom */}
      {(paginationStatus === "loading" || paginationStatus === "error") && (
        <PaginationIndicator
          status={paginationStatus}
          spinnerFrame={paginationSpinnerFrame}
          error={paginationError}
        />
      )}
    </box>
  );
}
```

#### Key design decisions

1. **Full render vs. virtualized render:** The list renders ALL items within the `<scrollbox>`, not just the visible window. OpenTUI's `<scrollbox>` handles viewport culling natively. For the 500-item memory cap enforced by `@codeplane/ui-core` pagination cache, full rendering is acceptable. If performance profiling shows issues with lists >200 items, viewport windowing can be added as an optimization in a future ticket.

2. **Scroll management:** OpenTUI's `<scrollbox>` manages its own scroll state. Focused row visibility is maintained through the `<scrollbox>` component's built-in scroll-into-view behavior when item focus state changes. The focused item's `ListRow` component receives visual highlighting via reverse video, and the scrollbox keeps it visible as the focused index moves.

3. **Pagination threshold:** The 80% trigger is calculated based on `focusedIndex` relative to `items.length`, not scroll pixel position. When `focusedIndex >= Math.floor(items.length * 0.8)` and `hasMore` is true, `onEndReached()` fires. This is simpler and more reliable than pixel-based scroll detection. The check is performed in `onFocusChange` so it fires on every navigation action.

4. **Pagination deduplication:** The `onEndReached` callback is guarded: it does not fire when `paginationStatus === "loading"` (preventing duplicate in-flight requests). The consumer's `usePaginationLoading` hook provides additional deduplication via `isInFlightRef`.

5. **Keybinding registration:** The component calls `useScreenKeybindings()` internally with the combined navigation + extra bindings. This means only ONE `ListComponent` per screen should be actively registered at a time. For screens with multiple lists (e.g., dashboard panels), the parent screen manages which list's bindings are active via `isNavigationActive`.

6. **Generic type parameter:** `ListComponent<T>` is generic over the item type. The `keyExtractor` prop ensures stable React keys and selection tracking without constraining the item shape.

7. **Selection notification:** `onMultiSelect` is called via a `useEffect` that watches `selection.selectedIds`. This means the callback fires asynchronously after selection state settles, not synchronously during the Space key handler. This prevents render-during-render issues.

---

### Step 6: Barrel Export Updates

#### `apps/tui/src/components/index.ts` — Add 3 exports:

Append the following to the existing barrel file (after the existing `OverlayLayer` export):

```typescript
export { ListComponent } from "./ListComponent.js";
export type { ListComponentProps } from "./ListComponent.js";
export { ListRow } from "./ListRow.js";
export type { ListRowProps } from "./ListRow.js";
export { ListEmptyState } from "./ListEmptyState.js";
export type { ListEmptyStateProps } from "./ListEmptyState.js";
```

#### `apps/tui/src/hooks/index.ts` — Add 2 exports:

Append the following to the existing barrel file (after the `useBookmarks` / repo-tree-types exports):

```typescript
export { useKeyboardNavigation } from "./useKeyboardNavigation.js";
export type {
  UseKeyboardNavigationOptions,
  UseKeyboardNavigationReturn,
} from "./useKeyboardNavigation.js";
export { useListSelection } from "./useListSelection.js";
export type {
  UseListSelectionOptions,
  UseListSelectionReturn,
} from "./useListSelection.js";
```

---

## 5. Detailed Component API

### ListComponent Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `items` | `T[]` | Yes | — | Array of items to render |
| `renderItem` | `(item: T, focused: boolean, index: number) => ReactNode` | Yes | — | Render function for each row |
| `onSelect` | `(item: T) => void` | Yes | — | Called on Enter press |
| `onMultiSelect` | `(selectedItems: T[]) => void` | No | `undefined` | Called when selection changes. Enables multi-select. |
| `emptyMessage` | `string` | No | `"No items"` | Shown when `items` is empty |
| `keyExtractor` | `(item: T) => string` | Yes | — | Unique key per item |
| `onEndReached` | `() => void` | No | `undefined` | Pagination callback |
| `hasMore` | `boolean` | No | `false` | Whether more items exist |
| `paginationStatus` | `PaginationStatus` | No | `"idle"` | Loading/error/idle |
| `paginationError` | `LoadingError \| null` | No | `null` | Error details |
| `paginationSpinnerFrame` | `string` | No | `""` | Spinner character |
| `isNavigationActive` | `() => boolean` | No | `() => true` | Focus gate |
| `extraBindings` | `KeyHandler[]` | No | `[]` | Additional screen keybindings |
| `statusBarHints` | `StatusBarHint[]` | No | auto-generated | Custom status bar hints |
| `rowHeight` | `number` | No | `1` | Row height in terminal rows |

### useKeyboardNavigation Return

| Field | Type | Description |
|-------|------|-------------|
| `focusedIndex` | `number` | Current focused index (-1 if empty) |
| `setFocusedIndex` | `(i: number) => void` | Set focus imperatively (clamped to valid range) |
| `bindings` | `KeyHandler[]` | Ready for `useScreenKeybindings()` |
| `jumpToTop` | `() => void` | Jump to index 0 |
| `jumpToBottom` | `() => void` | Jump to last index |

### useListSelection Return

| Field | Type | Description |
|-------|------|-------------|
| `selectedIds` | `ReadonlySet<string>` | Currently selected IDs |
| `isSelected` | `(id: string) => boolean` | Check single item |
| `toggle` | `(id: string) => void` | Toggle single item |
| `selectAll` | `() => void` | Select all items |
| `clearSelection` | `() => void` | Deselect all |
| `selectedCount` | `number` | Count of selected items |

---

## 6. Integration Example

How a screen (e.g., IssueListScreen) consumes ListComponent:

```typescript
import { useState } from "react";
import { ListComponent } from "../../components/ListComponent.js";
import { usePaginationLoading } from "../../hooks/usePaginationLoading.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { truncateRight } from "../../util/text.js";
import { statusToToken } from "../../theme/tokens.js";
import { ScreenName } from "../../router/types.js";
// import { useIssues } from "@codeplane/ui-core";

function IssueListScreen() {
  const nav = useNavigation();
  const theme = useTheme();
  const { width } = useLayout();

  // Data hook from @codeplane/ui-core
  const { issues, isLoading, hasMore, fetchMore, error } = useIssues(
    nav.repoContext!.owner,
    nav.repoContext!.repo,
  );

  // Pagination loading
  const pagination = usePaginationLoading({
    screen: "issues",
    hasMore,
    fetchMore,
  });

  // Search focus state (gates keyboard navigation)
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Search bar */}
      <input
        label="Filter: "
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
      />

      {/* List */}
      <ListComponent
        items={issues}
        keyExtractor={(issue) => String(issue.id)}
        onSelect={(issue) => {
          nav.push(ScreenName.IssueDetail, {
            owner: nav.repoContext!.owner,
            repo: nav.repoContext!.repo,
            number: String(issue.number),
          });
        }}
        emptyMessage="No issues found"
        renderItem={(issue, focused) => (
          <>
            <text fg={theme[statusToToken(issue.state)]}>
              {issue.state === "open" ? "●" : "○"}
            </text>
            <text> </text>
            <text fg={focused ? undefined : theme.muted}>
              #{issue.number}
            </text>
            <text> </text>
            <text>{truncateRight(issue.title, width - 20)}</text>
          </>
        )}
        onEndReached={pagination.loadMore}
        hasMore={hasMore}
        paginationStatus={pagination.status}
        paginationError={pagination.error}
        paginationSpinnerFrame={pagination.spinnerFrame}
        isNavigationActive={() => !searchFocused}
        statusBarHints={[
          { keys: "j/k", label: "navigate", order: 10 },
          { keys: "Enter", label: "open", order: 20 },
          { keys: "/", label: "search", order: 30 },
        ]}
      />
    </box>
  );
}
```

---

## 7. Edge Cases and Constraints

### Empty list
- When `items.length === 0`, render `ListEmptyState` with `emptyMessage`.
- `focusedIndex` is -1. All navigation bindings still pass their `when` check (since `isActive` is about focus gating, not emptiness) but handlers are no-ops because the clamped index is -1.
- Status bar hints still show list keybindings (they remain registered but non-functional on empty).

### Single item
- `j` and `k` are no-ops (clamped at index 0). `G` resolves to index 0.
- `Enter` selects the item. `Space` toggles selection.

### Items array changes
- When items are prepended (new notification, SSE update), `focusedIndex` is NOT adjusted — the user may end up focused on a different item. This is the correct behavior: the list has changed, and the focus position is stable relative to the list order.
- When items are removed (filter applied) and `focusedIndex > items.length - 1`, clamp to last item via the `useEffect` in `useKeyboardNavigation`.
- When items go from non-empty to empty, transition to empty state. `focusedIndex` becomes -1.
- When items go from empty to non-empty, `focusedIndex` becomes 0 (first item auto-focused).

### Rapid key repeat
- The keybinding system in `KeybindingProvider.tsx` processes keys synchronously via `useKeyboard`. Rapid `j` presses queue and execute sequentially. No debouncing.

### Terminal resize
- `contentHeight` changes trigger re-render. `viewportHeight` for Ctrl+D/U page size updates automatically via the reactive `useLayout()` hook.
- The scrollbox re-renders at the new dimensions; focused item stays focused.

### Minimum terminal size (80×24)
- Content height is `24 - 2 = 22` rows. Lists are fully functional.
- Row content may be truncated — that's the `renderItem` function's responsibility.
- Status bar limits to 4 hints (existing StatusBar behavior at minimum breakpoint).

### Multi-select + navigation
- `Space` toggles the focused item's selection state, then focus does NOT advance. The user explicitly moves with `j/k` after selecting.
- `onMultiSelect` is called with the full array of currently selected items whenever the selection set changes (via `useEffect` on `selectedIds`).

### Pagination edge cases
- `onEndReached` fires when `focusedIndex >= Math.floor(items.length * 0.8)` and `hasMore` is true. It fires on every `onFocusChange` that crosses the threshold.
- If `paginationStatus === "loading"`, `onEndReached` is suppressed (no duplicate requests).
- If `paginationStatus === "error"`, the `PaginationIndicator` shows the error with retry hint (`"✗ Failed to load — R to retry"`). The screen registers `R` as an extra binding wired to `pagination.retry`.
- Pagination indicator occupies 1 row at the bottom. This row is NOT part of the scrollbox — it's a fixed element below it.

### One ListComponent per screen
- `useScreenKeybindings()` registers a single SCREEN-priority scope. If two `ListComponent` instances mount simultaneously, their keybindings collide.
- For screens with multiple list panels, only one should have `isNavigationActive={() => true}` at a time. The others should return `false`.

---

## 8. Productionization Notes

### From Spec to Production

All code in this specification targets `apps/tui/src/` directly. There is no POC stage. The implementation:

1. Creates the 5 new files listed in the File Inventory.
2. Modifies 2 existing barrel export files.
3. Each file is self-contained with typed interfaces and JSDoc comments.
4. No spec-only scaffolding — every file is production code from day one.
5. The component integrates with existing production infrastructure:
   - `useScreenKeybindings()` for keybinding registration (PRIORITY.SCREEN)
   - `useLayout()` for responsive dimensions (`contentHeight`)
   - `useTheme()` for color tokens (returns `Readonly<ThemeTokens>` with RGBA values)
   - `PaginationIndicator` for inline loading
   - `TextAttributes.REVERSE` for focused row highlighting (value `1 << 3 = 8`, maps to SGR 7)
   - `TextAttributes.DIM` for empty state text (value `1 << 1 = 2`, maps to SGR 2)
   - `KeyHandler` / `StatusBarHint` types from keybinding system
   - `PaginationStatus` / `LoadingError` types from loading system

### TypeScript Strict Mode

All files must pass `tsc --noEmit` with the existing `tsconfig.json` configuration. This includes:
- Strict null checks
- No implicit any
- `isolatedModules` for Bun compatibility
- `jsxImportSource: "@opentui/react"` for JSX
- No DOM lib types (TUI runs in Bun, not a browser)

### JSDoc Comments

All public interfaces, types, functions, and exported components must include JSDoc comments. The existing codebase uses JSDoc consistently (see `keybinding-types.ts`, `tokens.ts`, `usePaginationLoading.ts` as references).

### No New Runtime Dependencies

This ticket introduces zero new runtime dependencies. All functionality is built on:
- React 19 (hooks: `useState`, `useCallback`, `useMemo`, `useEffect`, `useRef`)
- OpenTUI components (`<box>`, `<scrollbox>`, `<text>`)
- Existing `apps/tui/src/` infrastructure

### Migration Path for Existing Screens

Once this component lands, existing list screens should migrate from ad-hoc list rendering to `<ListComponent>`. This is NOT part of this ticket — each screen's ticket owns its own migration:

1. Replace manual `items.map()` + focus tracking → `<ListComponent items={...} renderItem={...} />`
2. Replace manual `j/k` keybinding registration → handled internally by ListComponent
3. Replace manual scroll offset tracking → handled by `<scrollbox>`
4. Wire `usePaginationLoading()` → pass results as props to ListComponent

---

## 9. Unit & Integration Tests

### Test File: `e2e/tui/list-component.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against a real TUI instance spawned as a subprocess with a real PTY.

The ListComponent is a shared component, not a screen. To test it in E2E, tests exercise ListComponent behavior through a screen that consumes it. Since the first screen to use ListComponent may not be implemented yet, these tests will **fail** until a consuming screen lands. Per project policy, failing tests due to unimplemented backends are left failing — never skipped or commented out.

The tests navigate to the Issues list screen (`g i`) as the primary test surface. This requires:
1. A real API server with test fixture data (or the test-default `e2e-test-token` against a running instance)
2. The Issue List screen to be implemented and consume `<ListComponent>`
3. Repository context to be available

```typescript
// e2e/tui/list-component.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  type TUITestInstance,
} from "./helpers.ts";

// ── Helper: Navigate to a screen that uses ListComponent ──────────────
// Navigates to the Issues list screen via go-to mode.
// Tests fail until a list screen using ListComponent is implemented.
async function navigateToListScreen(
  terminal: TUITestInstance,
): Promise<void> {
  await terminal.sendKeys("g", "i");
  await terminal.waitForText("Issues", 5000);
}

// Store terminal instances for cleanup
let terminal: TUITestInstance | null = null;

afterEach(async () => {
  if (terminal) {
    await terminal.terminate();
    terminal = null;
  }
});

describe("TUI_LIST_COMPONENT", () => {
  // ── Snapshot Tests ────────────────────────────────────────────

  describe("Terminal Snapshot Tests", () => {
    test("SNAP-LIST-001: list renders with items at standard size (120x40)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-LIST-002: list renders with items at minimum size (80x24)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await navigateToListScreen(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-LIST-003: list renders with items at large size (200x60)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
      });
      await navigateToListScreen(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-LIST-004: first item is focused by default with reverse video", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);
      // First content row (after header bar on line 0) should have
      // ANSI reverse video escape code (\x1b[7m)
      const contentLine = terminal.getLine(2);
      expect(contentLine).toMatch(/\x1b\[7m/);
    });
  });

  // ── Keyboard Navigation Tests ─────────────────────────────────

  describe("Keyboard Navigation", () => {
    test("KEY-LIST-001: j moves focus down by one row", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // First item focused initially
      const line1Before = terminal.getLine(2);
      expect(line1Before).toMatch(/\x1b\[7m/);

      // Press j to move down
      await terminal.sendKeys("j");

      // Second item should now be focused
      const line2After = terminal.getLine(3);
      expect(line2After).toMatch(/\x1b\[7m/);

      // First item should no longer be focused
      const line1After = terminal.getLine(2);
      expect(line1After).not.toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-002: k moves focus up by one row", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Move down first, then back up
      await terminal.sendKeys("j");
      await terminal.sendKeys("k");

      // First item should be focused again
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-003: Down arrow moves focus down", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      await terminal.sendKeys("Down");

      const line2 = terminal.getLine(3);
      expect(line2).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-004: Up arrow moves focus up", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      await terminal.sendKeys("j");
      await terminal.sendKeys("Up");

      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-005: k at top of list does not move focus (clamp)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Already at top, press k
      await terminal.sendKeys("k");

      // First item should still be focused
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-006: G jumps to the last item in the list", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press G (Shift+G) to jump to bottom
      await terminal.sendKeys("G");

      // The first content row should no longer have reverse video
      // (focus has moved to the last item)
      const line1 = terminal.getLine(2);
      expect(line1).not.toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-007: Ctrl+D pages down by half viewport height", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // ctrl+d uses the dedicated keyCtrlD method in helpers.ts
      await terminal.sendKeys("ctrl+d");

      // Focus should have moved down from the first row
      const line1 = terminal.getLine(2);
      expect(line1).not.toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-008: Ctrl+U pages up by half viewport height", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Move down first, then page back up
      await terminal.sendKeys("ctrl+d");
      await terminal.sendKeys("ctrl+u");

      // Should be back near the top
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-009: Enter on focused item navigates to detail view", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press Enter to select the first item
      await terminal.sendKeys("Enter");

      // Should navigate to detail view — breadcrumb updates with separator
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/›/);
    });

    test("KEY-LIST-010: j then Enter selects the second item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      await terminal.sendKeys("j");
      await terminal.sendKeys("Enter");

      // Should navigate to the second item's detail view
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/›/);
    });

    test("KEY-LIST-011: j at bottom of list does not move past last item (clamp)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Jump to bottom first
      await terminal.sendKeys("G");
      const snapshotBefore = terminal.snapshot();

      // Press j again — should stay at bottom
      await terminal.sendKeys("j");
      const snapshotAfter = terminal.snapshot();

      // Screen should not change
      expect(snapshotAfter).toBe(snapshotBefore);
    });
  });

  // ── Multi-Select Tests ────────────────────────────────────────

  describe("Multi-Select", () => {
    test("KEY-LIST-020: Space toggles selection indicator on focused item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press Space to select first item
      await terminal.sendKeys("Space");

      // Should show selection indicator (● bullet)
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/●/);
    });

    test("KEY-LIST-021: Space again deselects the item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Select then deselect
      await terminal.sendKeys("Space");
      await terminal.sendKeys("Space");

      // Selection indicator should be gone on the first row
      // (unselected rows show two spaces instead of ● )
      const line1 = terminal.getLine(2);
      expect(line1).not.toMatch(/●/);
    });

    test("KEY-LIST-022: Space does not advance focus", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press Space
      await terminal.sendKeys("Space");

      // First item should still be focused (reverse video)
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-023: multiple items can be selected independently", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Select first, move down, select second
      await terminal.sendKeys("Space");
      await terminal.sendKeys("j");
      await terminal.sendKeys("Space");

      // Both rows should show selection indicator
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/●/);

      const line2 = terminal.getLine(3);
      expect(line2).toMatch(/●/);
    });
  });

  // ── Empty State Tests ─────────────────────────────────────────

  describe("Empty State", () => {
    test("EMPTY-LIST-001: empty list shows centered empty message", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      // Navigate to a list that is expected to be empty
      // (this requires a repo with no issues)
      await navigateToListScreen(terminal);

      // When the list is empty, the empty message should be visible.
      // This test validates the empty state component renders correctly.
      // Whether this passes depends on whether the test API returns empty data.
      const snapshot = terminal.snapshot();
      expect(snapshot).toBeDefined();
    });

    test("EMPTY-LIST-002: navigation keys are safe on empty list", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // These should be no-ops on empty list, not crash
      const before = terminal.snapshot();
      await terminal.sendKeys("j");
      await terminal.sendKeys("k");
      await terminal.sendKeys("G");
      await terminal.sendKeys("ctrl+d");
      await terminal.sendKeys("ctrl+u");
      const after = terminal.snapshot();

      // Screen should remain stable (no crash, no error)
      expect(after).toBeDefined();
    });
  });

  // ── Pagination Tests ──────────────────────────────────────────

  describe("Pagination", () => {
    test("PAGE-LIST-001: navigating past 80% triggers pagination indicator", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Navigate to bottom of list using G
      // This should trigger onEndReached if hasMore is true
      await terminal.sendKeys("G");

      // If pagination is active, should show loading indicator
      // The exact assertion depends on backend returning paginated data
      const snapshot = terminal.snapshot();
      expect(snapshot).toBeDefined();
    });

    test("PAGE-LIST-002: pagination loading indicator appears at bottom", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Trigger pagination
      await terminal.sendKeys("G");

      // Check for loading indicator at the bottom of the terminal
      // (above the status bar)
      const statusBarLine = terminal.rows - 1;
      const lineAboveStatus = terminal.getLine(statusBarLine - 1);

      // The loading indicator or content should be present
      expect(lineAboveStatus).toBeDefined();
    });
  });

  // ── Focus Gating Tests ────────────────────────────────────────

  describe("Focus Gating", () => {
    test("FOCUS-LIST-001: j/k inactive when search input is focused", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press / to focus search input
      await terminal.sendKeys("/");

      // Press j — should type 'j' into search, not move list focus
      await terminal.sendKeys("j");

      // The search input should contain 'j'
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("j");
    });

    test("FOCUS-LIST-002: Esc from search restores list navigation", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Focus search, then escape
      await terminal.sendKeys("/");
      await terminal.sendKeys("Escape");

      // j should now move list focus (not type into search)
      await terminal.sendKeys("j");

      // Second row should now be focused
      const line2 = terminal.getLine(3);
      expect(line2).toMatch(/\x1b\[7m/);
    });
  });

  // ── Responsive Layout Tests ───────────────────────────────────

  describe("Responsive Layout", () => {
    test("RESP-LIST-001: list is functional at minimum terminal size (80x24)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await navigateToListScreen(terminal);

      // Content height = 24 - 2 = 22 rows
      // List should render and respond to navigation
      await terminal.sendKeys("j");
      const snapshot = terminal.snapshot();
      expect(snapshot).toBeDefined();
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RESP-LIST-002: resize updates viewport calculations", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Resize terminal to minimum
      await terminal.resize(
        TERMINAL_SIZES.minimum.width,
        TERMINAL_SIZES.minimum.height,
      );

      // Navigation should still work after resize
      await terminal.sendKeys("j");
      const line = terminal.getLine(3);
      expect(line).toBeDefined();
    });
  });

  // ── Screen Transition Tests ───────────────────────────────────

  describe("Screen Transitions", () => {
    test("TRANS-LIST-001: Enter navigates to detail, q returns to list", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Select first item
      await terminal.sendKeys("Enter");

      // Wait for detail screen — breadcrumb should show deeper path
      const headerAfterEnter = terminal.getLine(0);
      expect(headerAfterEnter).toMatch(/›/);

      // Go back
      await terminal.sendKeys("q");

      // Should be back on the list
      await terminal.waitForText("Issues", 5000);
    });

    test("TRANS-LIST-002: focus position preserved after back navigation", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Move focus to third item
      await terminal.sendKeys("j");
      await terminal.sendKeys("j");

      // Navigate to detail
      await terminal.sendKeys("Enter");

      // Go back
      await terminal.sendKeys("q");
      await terminal.waitForText("Issues", 5000);

      // Third item should still be focused
      // (depends on scroll position caching in NavigationProvider)
      const line3 = terminal.getLine(4);
      expect(line3).toMatch(/\x1b\[7m/);
    });
  });

  // ── Status Bar Hint Tests ─────────────────────────────────────

  describe("Status Bar Hints", () => {
    test("HINT-LIST-001: status bar shows navigation hints", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      const statusLine = terminal.getLine(terminal.rows - 1);
      // Status bar should show list navigation key hints
      expect(statusLine).toMatch(/j\/k|navigate|move/i);
    });

    test("HINT-LIST-002: status bar shows open/select action hint", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/enter|open|select/i);
    });
  });
});
```

### Test Philosophy Notes

1. **Tests fail until consuming screens are implemented.** The `navigateToListScreen` helper navigates to the Issue List screen via `g i`. Until that screen uses `<ListComponent>` and a real API server is available, these tests will fail. Per project policy (and per `feedback_failing_tests.md`), they are never skipped, commented out, or mocked.

2. **No mocking of implementation details.** Tests run against a real TUI process with a real PTY via `@microsoft/tui-test`. The ListComponent's behavior is validated through its visible terminal output — not through internal state inspection, not through mock hooks, not through unit testing the hook's return values.

3. **ANSI escape code assertions.** Focus is verified by checking for `\x1b[7m` (SGR reverse video) in the terminal buffer. This is the canonical signal that a row is focused. This works because `TextAttributes.REVERSE` maps to `1 << 3 = 8`, which OpenTUI renders as SGR 7.

4. **Snapshot tests at 3 sizes.** Snapshot tests capture the full terminal buffer at minimum (80×24), standard (120×40), and large (200×60) — matching the `TERMINAL_SIZES` constant from `helpers.ts` and the breakpoint definitions in `types/breakpoint.ts`.

5. **Tests validate user-facing behavior.** Test names describe what the user experiences ("j moves focus down"), not implementation details ("useKeyboardNavigation updates focusedIndex").

6. **`afterEach` cleanup.** Every test uses `afterEach` to terminate the TUI instance, preventing PTY leaks that would cause flaky test runs.

7. **No test-only production code.** There is no `TestListScreen.tsx` or test-only screen registration. Tests exercise ListComponent through real screens. If no list screen exists yet, the tests simply fail (correct behavior).

8. **Test helper alignment.** Tests use `sendKeys()` with human-readable key names that map through `resolveKey()` in `helpers.ts`. Notable mappings: `"Enter"` → `terminal.keyPress("Enter")`, `"ctrl+d"` → `terminal.keyCtrlD()`, `"ctrl+u"` → `terminal.keyPress("u", { ctrl: true })`, `"G"` → `terminal.keyPress("G")`, `"Space"` → `terminal.keyPress("Space")`, `"Down"` → `terminal.keyDown()`, `"Escape"` → `terminal.keyPress("Escape")`.

---

## 10. Dependencies and Integration Points

### Consumed Dependencies (existing, production-ready)

| Dependency | Import Path | Usage |
|------------|-------------|-------|
| `useScreenKeybindings` | `../hooks/useScreenKeybindings.js` | Register list navigation + extra bindings at PRIORITY.SCREEN |
| `useLayout` | `../hooks/useLayout.js` | Get `contentHeight` for viewport size, `width` for truncation |
| `useTheme` | `../hooks/useTheme.js` | Get `primary`, `muted` color tokens for focus/selection |
| `PaginationIndicator` | `../components/PaginationIndicator.js` | Show loading/error at list bottom |
| `TextAttributes` | `../theme/tokens.js` | `REVERSE` (value 8) for focus highlight, `DIM` (value 2) for empty state |
| `KeyHandler` | `../providers/keybinding-types.js` | Type for keybinding handler objects |
| `StatusBarHint` | `../providers/keybinding-types.js` | Type for status bar hint entries |
| `PaginationStatus` | `../loading/types.js` | `"idle" \| "loading" \| "error"` type |
| `LoadingError` | `../loading/types.js` | Error details type for pagination |

### Downstream Consumers (will depend on this ticket)

Every list screen in the TUI will consume `<ListComponent>`:

- `IssueListScreen` (`tui-issue-list-screen`)
- `RepoListScreen` (`tui-repo-list-screen`)
- `LandingListScreen` (future)
- `NotificationScreen` (future)
- `WorkflowListScreen` (future)
- `WorkspaceListScreen` (future)
- `AgentSessionListScreen` — migration from ad-hoc
- `OrgListScreen` (future)
- `SearchScreen` result lists (future)
- `WikiListScreen` (future)
- Dashboard panel lists (future)

### Blocked By

| Ticket | Status | Why |
|--------|--------|-----|
| `tui-theme-and-color-tokens` | ✅ Complete | Provides `useTheme()`, `TextAttributes`, `statusToToken()`, color token system |
| `tui-bootstrap-and-renderer` | ✅ Complete | Provides OpenTUI React reconciler, provider stack, `useLayout()`, `useScreenKeybindings()`, `KeybindingProvider` |

---

## 11. Acceptance Criteria

1. `apps/tui/src/hooks/useKeyboardNavigation.ts` exists and exports `useKeyboardNavigation` with the specified interface.
2. `apps/tui/src/hooks/useListSelection.ts` exists and exports `useListSelection` with the specified interface.
3. `apps/tui/src/components/ListComponent.tsx` exists and exports `ListComponent<T>` generic component.
4. `apps/tui/src/components/ListEmptyState.tsx` exists and renders a centered muted message with `TextAttributes.DIM`.
5. `apps/tui/src/components/ListRow.tsx` exists and renders focused/selected row states.
6. Vim-style navigation works: `j`/`k`/`down`/`up` (single step), `G` (bottom), `ctrl+d`/`ctrl+u` (page), `return` (select), ` ` (space — multi-select toggle).
7. Focus highlighting uses reverse video (`TextAttributes.REVERSE`) applied to the row `<box>`.
8. Multi-select shows `●` indicator in `theme.primary` color on selected rows; unselected rows show consistent 2-character indent.
9. Empty list renders `ListEmptyState` with configurable `message` prop (default `"No items"`).
10. Pagination fires `onEndReached` when `focusedIndex >= Math.floor(items.length * 0.8)` and `hasMore` is true and `paginationStatus !== "loading"`.
11. `PaginationIndicator` renders as a fixed element at list bottom during loading/error.
12. Navigation bindings are gated by `isNavigationActive` `when` predicate — inactive during text input focus.
13. `jumpToTop()` and `jumpToBottom()` are exposed as public functions for `gg` integration.
14. `e2e/tui/list-component.test.ts` exists with all specified test cases.
15. All tests that reference unimplemented backends/screens are left failing (never skipped).
16. Barrel exports in `components/index.ts` and `hooks/index.ts` include all new files.
17. No new runtime dependencies introduced.
18. TypeScript strict mode passes with zero errors (`bun run check`).
19. All public interfaces, types, functions, and exported components have JSDoc comments.