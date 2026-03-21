import { useCallback, useRef } from "react";
import type { TabScrollState } from "../components/TabbedDetailView.types.js";

const DEFAULT_SCROLL_STATE: Readonly<TabScrollState> = {
  scrollOffset: 0,
  focusedIndex: 0,
};

export interface UseTabScrollStateReturn {
  /** Get the current scroll state for a tab */
  getScrollState: (tabId: string) => TabScrollState;
  /** Save scroll state for a tab */
  saveScrollState: (tabId: string, state: TabScrollState) => void;
  /** Reset scroll state for a tab to defaults */
  resetScrollState: (tabId: string) => void;
  /** Reset all tabs */
  resetAll: () => void;
}

export function useTabScrollState(): UseTabScrollStateReturn {
  const stateMap = useRef<Map<string, TabScrollState>>(new Map());

  const getScrollState = useCallback((tabId: string): TabScrollState => {
    return stateMap.current.get(tabId) ?? { ...DEFAULT_SCROLL_STATE };
  }, []);

  const saveScrollState = useCallback(
    (tabId: string, state: TabScrollState) => {
      stateMap.current.set(tabId, { ...state });
    },
    []
  );

  const resetScrollState = useCallback((tabId: string) => {
    stateMap.current.delete(tabId);
  }, []);

  const resetAll = useCallback(() => {
    stateMap.current.clear();
  }, []);

  return { getScrollState, saveScrollState, resetScrollState, resetAll };
}
