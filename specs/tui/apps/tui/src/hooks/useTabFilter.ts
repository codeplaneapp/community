import { useState, useCallback, useRef } from "react";

/**
 * Maximum filter input length.
 * Applied via OpenTUI's <input maxLength={FILTER_MAX_LENGTH}> prop.
 */
export const FILTER_MAX_LENGTH = 100;

export interface UseTabFilterReturn {
  /** Current filter text for the active tab */
  filterText: string;
  /** Whether the filter input is currently focused/active */
  isFiltering: boolean;
  /** Set the filter text (called by <input onInput>) */
  setFilterText: (text: string) => void;
  /** Activate filter input (sets isFiltering=true) */
  activateFilter: () => void;
  /** Clear filter text and deactivate filter input */
  clearFilter: () => void;
  /** Get stored filter text for a specific tab */
  getTabFilter: (tabId: string) => string;
  /** Save current filter to old tab, restore from new tab */
  switchTab: (fromTabId: string, toTabId: string) => void;
}

export function useTabFilter(): UseTabFilterReturn {
  const [filterText, setFilterTextRaw] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const tabFilters = useRef<Map<string, string>>(new Map());

  const setFilterText = useCallback((text: string) => {
    setFilterTextRaw(text);
  }, []);

  const activateFilter = useCallback(() => {
    setIsFiltering(true);
  }, []);

  const clearFilter = useCallback(() => {
    setFilterTextRaw("");
    setIsFiltering(false);
  }, []);

  const getTabFilter = useCallback((tabId: string): string => {
    return tabFilters.current.get(tabId) ?? "";
  }, []);

  const switchTab = useCallback(
    (fromTabId: string, toTabId: string) => {
      // Save current filter to departing tab
      tabFilters.current.set(fromTabId, filterText);
      // Restore filter from arriving tab
      const restored = tabFilters.current.get(toTabId) ?? "";
      setFilterTextRaw(restored);
      // Re-activate filter UI if the restored tab had active filter text
      setIsFiltering(restored.length > 0);
    },
    [filterText]
  );

  return {
    filterText,
    isFiltering,
    setFilterText,
    activateFilter,
    clearFilter,
    getTabFilter,
    switchTab,
  };
}
