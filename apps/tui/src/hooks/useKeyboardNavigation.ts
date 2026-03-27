import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyHandler } from "../providers/keybinding-types.js";

/**
 * Configuration for vim-style keyboard navigation over a list.
 */
export interface UseKeyboardNavigationOptions {
  /** Total number of items in the list. */
  itemCount: number;
  /** Number of visible rows in the viewport (used for page up/down). */
  viewportHeight: number;
  /** Called when Enter is pressed on the focused item. */
  onSelect?: (index: number) => void;
  /** Called when Space is pressed on the focused item. */
  onToggleSelect?: (index: number) => void;
  /**
   * Predicate controlling whether navigation bindings are active.
   * Defaults to always active.
   */
  isActive?: () => boolean;
  /**
   * Called whenever focused index changes to a valid row.
   * Used for scroll-into-view and pagination checks.
   */
  onFocusChange?: (index: number) => void;
}

/**
 * Return value from {@link useKeyboardNavigation}.
 */
export interface UseKeyboardNavigationReturn {
  /** Current focused index (0-based). `-1` when list is empty. */
  focusedIndex: number;
  /** Imperatively set focused index. Input is clamped to valid range. */
  setFocusedIndex: (index: number) => void;
  /** SCREEN-priority keybindings for list navigation and actions. */
  bindings: KeyHandler[];
  /** Jump focus to first item. */
  jumpToTop: () => void;
  /** Jump focus to last item. */
  jumpToBottom: () => void;
}

function clampIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return -1;
  }
  return Math.max(0, Math.min(index, itemCount - 1));
}

/**
 * Vim-style list navigation hook.
 *
 * Exposes ready-to-register keybindings for:
 * `j`/`k`, `down`/`up`, `G`, `ctrl+d`, `ctrl+u`, `return`, and `space`.
 *
 * `gg` is intentionally not registered here because `g` is reserved by
 * go-to mode at higher keybinding priority. Consumers can wire `gg` using
 * the exposed `jumpToTop()` callback in a higher-priority context.
 */
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

  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const when = useCallback((): boolean => {
    const predicate = isActiveRef.current;
    return predicate ? predicate() : true;
  }, []);

  const updateFocus = useCallback(
    (nextIndex: number | ((prev: number) => number)): void => {
      setFocusedIndexRaw((prev) => {
        const resolved =
          typeof nextIndex === "function" ? nextIndex(prev) : nextIndex;
        const clamped = clampIndex(resolved, itemCount);

        if (clamped !== prev && clamped >= 0) {
          onFocusChangeRef.current?.(clamped);
        }
        return clamped;
      });
    },
    [itemCount],
  );

  const setFocusedIndex = useCallback(
    (index: number): void => {
      updateFocus(index);
    },
    [updateFocus],
  );

  useEffect(() => {
    setFocusedIndexRaw((prev) => {
      const clamped = clampIndex(prev, itemCount);
      if (clamped !== prev && clamped >= 0) {
        onFocusChangeRef.current?.(clamped);
      }
      return clamped;
    });
  }, [itemCount]);

  const moveDown = useCallback(() => {
    updateFocus((prev) => {
      if (itemCount <= 0) {
        return -1;
      }
      if (prev < 0) {
        return 0;
      }
      return prev + 1;
    });
  }, [itemCount, updateFocus]);

  const moveUp = useCallback(() => {
    updateFocus((prev) => {
      if (itemCount <= 0) {
        return -1;
      }
      if (prev <= 0) {
        return 0;
      }
      return prev - 1;
    });
  }, [itemCount, updateFocus]);

  const jumpToBottom = useCallback(() => {
    updateFocus(itemCount - 1);
  }, [itemCount, updateFocus]);

  const jumpToTop = useCallback(() => {
    updateFocus(0);
  }, [updateFocus]);

  const pageDown = useCallback(() => {
    const pageSize = Math.max(1, Math.floor(viewportHeight / 2));
    updateFocus((prev) => {
      if (itemCount <= 0) {
        return -1;
      }
      const base = prev < 0 ? 0 : prev;
      return base + pageSize;
    });
  }, [itemCount, updateFocus, viewportHeight]);

  const pageUp = useCallback(() => {
    const pageSize = Math.max(1, Math.floor(viewportHeight / 2));
    updateFocus((prev) => {
      if (itemCount <= 0) {
        return -1;
      }
      const base = prev < 0 ? 0 : prev;
      return base - pageSize;
    });
  }, [itemCount, updateFocus, viewportHeight]);

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
      {
        key: "j",
        description: "Move down",
        group: "Navigation",
        handler: moveDown,
        when,
      },
      {
        key: "down",
        description: "Move down",
        group: "Navigation",
        handler: moveDown,
        when,
      },
      {
        key: "k",
        description: "Move up",
        group: "Navigation",
        handler: moveUp,
        when,
      },
      {
        key: "up",
        description: "Move up",
        group: "Navigation",
        handler: moveUp,
        when,
      },
      {
        key: "G",
        description: "Jump to bottom",
        group: "Navigation",
        handler: jumpToBottom,
        when,
      },
      {
        key: "ctrl+d",
        description: "Page down",
        group: "Navigation",
        handler: pageDown,
        when,
      },
      {
        key: "ctrl+u",
        description: "Page up",
        group: "Navigation",
        handler: pageUp,
        when,
      },
      {
        key: "return",
        description: "Open",
        group: "Actions",
        handler: handleSelect,
        when,
      },
      ...(onToggleSelect
        ? [
            {
              key: " ",
              description: "Select",
              group: "Actions",
              handler: handleToggleSelect,
              when,
            } satisfies KeyHandler,
          ]
        : []),
    ],
    [
      moveDown,
      moveUp,
      jumpToBottom,
      pageDown,
      pageUp,
      handleSelect,
      onToggleSelect,
      handleToggleSelect,
      when,
    ],
  );

  return {
    focusedIndex,
    setFocusedIndex,
    bindings,
    jumpToTop,
    jumpToBottom,
  };
}
