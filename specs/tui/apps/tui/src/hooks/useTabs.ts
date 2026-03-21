import { useState, useCallback, useMemo, useRef } from "react";
import type { TabDefinition } from "../components/TabbedDetailView.types.js";

export interface UseTabsOptions {
  tabs: TabDefinition[];
  initialTabId?: string;
  onTabChange?: (fromTabId: string, toTabId: string) => void;
}

export interface UseTabsReturn {
  /** Currently active tab ID */
  activeTabId: string;
  /** Ordered array of visible tabs */
  visibleTabs: TabDefinition[];
  /** Set of tab IDs that have been activated at least once */
  activatedTabs: ReadonlySet<string>;
  /** Whether a given tab has been activated */
  hasActivated: (tabId: string) => boolean;
  /** Switch to a specific tab by ID. No-op if tab is not visible. */
  setActiveTab: (tabId: string) => void;
  /** Cycle to the next visible tab (wraps around) */
  cycleForward: () => void;
  /** Cycle to the previous visible tab (wraps around) */
  cycleBackward: () => void;
  /** Jump to a tab by 1-based index. No-op if index out of range. */
  jumpToIndex: (oneBasedIndex: number) => void;
  /** The active tab's definition */
  activeTab: TabDefinition;
  /** Whether the current activation is the first time for this tab */
  isFirstRender: boolean;
}

export function useTabs(options: UseTabsOptions): UseTabsReturn {
  const { tabs, initialTabId, onTabChange } = options;

  // Compute visible tabs — only tabs with visible=true
  const visibleTabs = useMemo(
    () => tabs.filter((t) => t.visible),
    [tabs]
  );

  // Determine initial active tab
  const initialId =
    initialTabId && visibleTabs.some((t) => t.id === initialTabId)
      ? initialTabId
      : visibleTabs[0]?.id ?? "";

  const [activeTabId, setActiveTabIdRaw] = useState<string>(initialId);
  const activatedTabsRef = useRef<Set<string>>(new Set([initialId]));
  const [activatedSnapshot, setActivatedSnapshot] = useState<ReadonlySet<string>>(
    new Set([initialId])
  );
  const [isFirstRender, setIsFirstRender] = useState(true);

  const setActiveTab = useCallback(
    (tabId: string) => {
      const tab = visibleTabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Handle push-on-activate tabs (e.g., Settings → navigates to new screen)
      if (tab.pushOnActivate && tab.onPush) {
        tab.onPush();
        return;
      }

      setActiveTabIdRaw((prev) => {
        if (prev === tabId) return prev;

        const isFirst = !activatedTabsRef.current.has(tabId);
        if (isFirst) {
          activatedTabsRef.current.add(tabId);
          setActivatedSnapshot(new Set(activatedTabsRef.current));
          tab.onFirstActivation?.();
        }
        setIsFirstRender(isFirst);

        onTabChange?.(prev, tabId);
        return tabId;
      });
    },
    [visibleTabs, onTabChange]
  );

  const cycleForward = useCallback(() => {
    if (visibleTabs.length === 0) return;
    const idx = visibleTabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = (idx + 1) % visibleTabs.length;
    setActiveTab(visibleTabs[nextIdx].id);
  }, [visibleTabs, activeTabId, setActiveTab]);

  const cycleBackward = useCallback(() => {
    if (visibleTabs.length === 0) return;
    const idx = visibleTabs.findIndex((t) => t.id === activeTabId);
    const prevIdx = (idx - 1 + visibleTabs.length) % visibleTabs.length;
    setActiveTab(visibleTabs[prevIdx].id);
  }, [visibleTabs, activeTabId, setActiveTab]);

  const jumpToIndex = useCallback(
    (oneBasedIndex: number) => {
      const tab = visibleTabs[oneBasedIndex - 1];
      if (tab) setActiveTab(tab.id);
    },
    [visibleTabs, setActiveTab]
  );

  const hasActivated = useCallback(
    (tabId: string) => activatedTabsRef.current.has(tabId),
    []
  );

  // If active tab was removed from visible set, fall back to first visible
  const activeTab =
    visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

  // Auto-correct if activeTabId no longer matches a visible tab
  if (activeTab && activeTab.id !== activeTabId) {
    // Schedule correction on next tick to avoid set-during-render
    queueMicrotask(() => setActiveTabIdRaw(activeTab.id));
  }

  return {
    activeTabId: activeTab?.id ?? "",
    visibleTabs,
    activatedTabs: activatedSnapshot,
    hasActivated,
    setActiveTab,
    cycleForward,
    cycleBackward,
    jumpToIndex,
    activeTab,
    isFirstRender,
  };
}
