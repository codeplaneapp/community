import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation.js";
import { useLayout } from "../hooks/useLayout.js";
import { useListSelection } from "../hooks/useListSelection.js";
import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";
import type { LoadingError, PaginationStatus } from "../loading/types.js";
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";
import { ListEmptyState } from "./ListEmptyState.js";
import { ListRow } from "./ListRow.js";
import { PaginationIndicator } from "./PaginationIndicator.js";

/**
 * Imperative list navigation controls exposed to consumers.
 */
export interface ListNavigationControls {
  /** Current focused row index. */
  focusedIndex: number;
  /** Programmatically set focused row index. */
  setFocusedIndex: (index: number) => void;
  /** Jump focus to the first row. */
  jumpToTop: () => void;
  /** Jump focus to the last row. */
  jumpToBottom: () => void;
}

/**
 * Props for {@link ListComponent}.
 */
export interface ListComponentProps<T> {
  /** Items to render in the list. */
  items: T[];
  /** Render function for each row. */
  renderItem: (item: T, focused: boolean, index: number) => ReactNode;
  /** Called when Enter selects an item. */
  onSelect: (item: T) => void;
  /** Called whenever selected item set changes. Enables Space toggle. */
  onMultiSelect?: (selectedItems: T[]) => void;
  /** Empty-state message when no items are available. */
  emptyMessage?: string;
  /** Stable unique key extractor for each item. */
  keyExtractor: (item: T) => string;
  /** Called when focus reaches the pagination threshold. */
  onEndReached?: () => void;
  /** Whether more items can be loaded. */
  hasMore?: boolean;
  /** Pagination loading status for bottom indicator. */
  paginationStatus?: PaginationStatus;
  /** Pagination error object for bottom indicator. */
  paginationError?: LoadingError | null;
  /** Current spinner frame for pagination loading indicator. */
  paginationSpinnerFrame?: string;
  /** Predicate controlling whether list keybindings are active. */
  isNavigationActive?: () => boolean;
  /** Additional SCREEN-priority keybindings for this list context. */
  extraBindings?: KeyHandler[];
  /** Explicit status-bar hints; defaults to first list bindings if omitted. */
  statusBarHints?: StatusBarHint[];
  /** Fixed row height in terminal rows. */
  rowHeight?: number;
  /**
   * Called with imperative focus controls.
   * This is used by consumers to wire `gg` style top-jump behavior.
   */
  onNavigationReady?: (controls: ListNavigationControls) => void;
}

/**
 * Reusable keyboard-first list component with focus, selection, and pagination.
 */
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
  paginationError = null,
  paginationSpinnerFrame = "",
  isNavigationActive,
  extraBindings,
  statusBarHints,
  rowHeight = 1,
  onNavigationReady,
}: ListComponentProps<T>) {
  const { contentHeight } = useLayout();
  const scrollboxRef = useRef<ScrollBoxRenderable | null>(null);

  const normalizedRowHeight = Math.max(1, rowHeight);
  const showPaginationIndicator =
    paginationStatus === "loading" || paginationStatus === "error";
  const listViewportHeight = Math.max(
    1,
    contentHeight - (showPaginationIndicator ? 1 : 0),
  );
  const viewportRows = Math.max(1, Math.floor(listViewportHeight / normalizedRowHeight));

  const selection = useListSelection({ items, keyExtractor });

  const ensureFocusedRowVisible = useCallback(
    (index: number): void => {
      const scrollbox = scrollboxRef.current;
      if (!scrollbox) {
        return;
      }

      const rowStart = index * normalizedRowHeight;
      const rowEnd = rowStart + normalizedRowHeight - 1;
      const currentTop = scrollbox.scrollTop;
      const viewportEnd = currentTop + viewportRows - 1;

      let nextTop = currentTop;
      if (rowStart < currentTop) {
        nextTop = rowStart;
      } else if (rowEnd > viewportEnd) {
        nextTop = rowEnd - viewportRows + 1;
      }

      if (nextTop !== currentTop) {
        scrollbox.scrollTop = Math.max(0, nextTop);
      }
    },
    [normalizedRowHeight, viewportRows],
  );

  const checkEndReached = useCallback(
    (index: number): void => {
      if (!onEndReached || !hasMore || paginationStatus === "loading") {
        return;
      }
      if (items.length === 0) {
        return;
      }

      const threshold = Math.floor(items.length * 0.8);
      if (index >= threshold) {
        onEndReached();
      }
    },
    [onEndReached, hasMore, paginationStatus, items.length],
  );

  const handleFocusChange = useCallback(
    (index: number): void => {
      ensureFocusedRowVisible(index);
      checkEndReached(index);
    },
    [ensureFocusedRowVisible, checkEndReached],
  );

  const navigation = useKeyboardNavigation({
    itemCount: items.length,
    viewportHeight: viewportRows,
    onSelect: (index) => {
      const item = items[index];
      if (item !== undefined) {
        onSelect(item);
      }
    },
    onToggleSelect: onMultiSelect
      ? (index) => {
          const item = items[index];
          if (item !== undefined) {
            selection.toggle(keyExtractor(item));
          }
        }
      : undefined,
    isActive: isNavigationActive,
    onFocusChange: handleFocusChange,
  });

  const allBindings = useMemo(() => {
    if (!extraBindings || extraBindings.length === 0) {
      return navigation.bindings;
    }
    return [...navigation.bindings, ...extraBindings];
  }, [navigation.bindings, extraBindings]);

  useScreenKeybindings(allBindings, statusBarHints);

  const selectedItems = useMemo(
    () =>
      items.filter((item) => selection.selectedIds.has(keyExtractor(item))),
    [items, selection.selectedIds, keyExtractor],
  );

  useEffect(() => {
    if (onMultiSelect) {
      onMultiSelect(selectedItems);
    }
  }, [onMultiSelect, selectedItems]);

  const navigationControls = useMemo<ListNavigationControls>(
    () => ({
      focusedIndex: navigation.focusedIndex,
      setFocusedIndex: navigation.setFocusedIndex,
      jumpToTop: navigation.jumpToTop,
      jumpToBottom: navigation.jumpToBottom,
    }),
    [
      navigation.focusedIndex,
      navigation.setFocusedIndex,
      navigation.jumpToTop,
      navigation.jumpToBottom,
    ],
  );

  useEffect(() => {
    onNavigationReady?.(navigationControls);
  }, [onNavigationReady, navigationControls]);

  if (items.length === 0) {
    return <ListEmptyState message={emptyMessage} />;
  }

  return (
    <box flexDirection="column" width="100%" height={contentHeight}>
      <scrollbox ref={scrollboxRef} scrollY={true} flexGrow={1}>
        <box flexDirection="column" width="100%">
          {items.map((item, index) => {
            const id = keyExtractor(item);
            const focused = index === navigation.focusedIndex;
            return (
              <ListRow
                key={id}
                focused={focused}
                selected={onMultiSelect ? selection.isSelected(id) : false}
                height={normalizedRowHeight}
              >
                {renderItem(item, focused, index)}
              </ListRow>
            );
          })}
        </box>
      </scrollbox>
      {showPaginationIndicator && (
        <PaginationIndicator
          status={paginationStatus}
          spinnerFrame={paginationSpinnerFrame}
          error={paginationError}
        />
      )}
    </box>
  );
}
