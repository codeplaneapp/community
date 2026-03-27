import { useCallback, useState } from "react";

/**
 * Options for multi-select list state.
 */
export interface UseListSelectionOptions<T> {
  /** Full list of items currently rendered. */
  items: T[];
  /** Stable unique ID extractor for each item. */
  keyExtractor: (item: T) => string;
}

/**
 * Return value from {@link useListSelection}.
 */
export interface UseListSelectionReturn {
  /** Set of selected item IDs. */
  selectedIds: ReadonlySet<string>;
  /** Check whether an ID is currently selected. */
  isSelected: (id: string) => boolean;
  /** Toggle a single item by ID. */
  toggle: (id: string) => void;
  /** Select all currently available items. */
  selectAll: () => void;
  /** Clear all selections. */
  clearSelection: () => void;
  /** Count of selected items. */
  selectedCount: number;
}

/**
 * Generic multi-select state for list screens.
 *
 * Selection is ID-based and intentionally retains stale IDs when the
 * backing item array changes. This allows selection persistence across
 * pagination updates and temporary filtering.
 */
export function useListSelection<T>(
  options: UseListSelectionOptions<T>,
): UseListSelectionReturn {
  const { items, keyExtractor } = options;
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const isSelected = useCallback(
    (id: string): boolean => selectedIds.has(id),
    [selectedIds],
  );

  const toggle = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((): void => {
    setSelectedIds(new Set(items.map((item) => keyExtractor(item))));
  }, [items, keyExtractor]);

  const clearSelection = useCallback((): void => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    clearSelection,
    selectedCount: selectedIds.size,
  };
}
