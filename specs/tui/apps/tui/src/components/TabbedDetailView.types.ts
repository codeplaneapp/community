import type { ReactNode } from "react";
import type { Breakpoint } from "../types/breakpoint.js";

/**
 * Re-export Breakpoint for consumers who import from this file.
 */
export type { Breakpoint };

/**
 * A badge displayed alongside the header title.
 */
export interface DetailBadge {
  /** Display text (e.g., "public", "admin", "owner") */
  label: string;
  /**
   * Foreground color for the badge text.
   * Accepts any value valid for OpenTUI's `fg` prop: named color string,
   * hex string, or RGBA instance.
   */
  fg: string;
}

/**
 * A single metadata line displayed in the header.
 * Lines with falsy `value` are omitted from rendering.
 */
export interface DetailMetadataLine {
  /** Label prefix (e.g., "Created", "Website") — rendered with dim styling via fg="gray" */
  label: string;
  /** Value text — rendered in default foreground */
  value: string;
  /** If true, this line is hidden at minimum breakpoint (80×24) */
  hideAtMinimum?: boolean;
}

/**
 * Tab scroll and focus state, preserved across tab switches.
 */
export interface TabScrollState {
  /** Vertical scroll offset within the tab's scrollbox */
  scrollOffset: number;
  /** Index of the focused row in the tab's list (0-based) */
  focusedIndex: number;
}

/**
 * Configuration for a single tab.
 */
export interface TabDefinition {
  /** Unique tab identifier (e.g., "repos", "members", "teams", "settings") */
  id: string;
  /** Full label shown at standard/large breakpoints (e.g., "Repositories") */
  label: string;
  /** Abbreviated label shown at minimum breakpoint 80×24 (e.g., "Repos") */
  shortLabel: string;
  /** Item count displayed as badge — null hides the count */
  count: number | null;
  /** Whether this tab is visible. Tabs with visible=false are not rendered in the bar. */
  visible: boolean;
  /**
   * Render function for the tab's content area.
   * Receives the current filter text, scroll state, and breakpoint.
   * Only called when the tab is active.
   */
  renderContent: (ctx: TabContentContext) => ReactNode;
  /**
   * Whether activating this tab pushes a new screen instead of
   * rendering inline content. Used for Settings-type tabs that
   * navigate to a full sub-screen via the NavigationProvider.
   * When true, the active tab does NOT change.
   */
  pushOnActivate?: boolean;
  /**
   * Callback invoked when this tab is activated via pushOnActivate.
   * Consumer handles the navigation push.
   */
  onPush?: () => void;
  /**
   * Callback invoked the first time this tab is activated.
   * Used to trigger lazy data loading.
   */
  onFirstActivation?: () => void;
  /**
   * Whether the filter input (/) is supported for this tab.
   * Defaults to true.
   */
  filterable?: boolean;
}

/**
 * Context passed to the tab content render function.
 */
export interface TabContentContext {
  /** Current filter text (empty string if no filter active) */
  filterText: string;
  /** Whether the filter input is currently focused */
  isFiltering: boolean;
  /** Current tab's preserved scroll state */
  scrollState: TabScrollState;
  /** Callback to update scroll state (called by list component on scroll/focus change) */
  onScrollStateChange: (state: TabScrollState) => void;
  /** Whether this is the first time this tab has been rendered */
  isFirstRender: boolean;
  /** Terminal breakpoint for responsive layout decisions in content */
  breakpoint: Breakpoint;
}

/**
 * Props for the TabbedDetailView component.
 */
export interface TabbedDetailViewProps {
  /** Title text displayed in bold at the top of the header */
  title: string;
  /** Optional badge displayed next to the title */
  badge?: DetailBadge;
  /** Description text, word-wrapped. If empty/undefined, omitted. */
  description?: string;
  /** Placeholder text when description is empty (e.g., "No description provided.") */
  descriptionPlaceholder?: string;
  /** Metadata lines displayed below the description */
  metadata?: DetailMetadataLine[];
  /** Tab definitions — order determines tab bar order and number key mapping */
  tabs: TabDefinition[];
  /** ID of the initially active tab. Defaults to first visible tab. */
  initialTabId?: string;
  /** Callback when the active tab changes */
  onTabChange?: (fromTabId: string, toTabId: string) => void;
  /** Whether the component is in a loading state (shows spinner instead of content) */
  isLoading?: boolean;
  /** Error message to display (replaces content with error + retry hint) */
  error?: string | null;
  /** Callback for retry action (R key in error state) */
  onRetry?: () => void;
}

/**
 * Imperative handle for the TabbedDetailView (via React.forwardRef/useImperativeHandle).
 */
export interface TabbedDetailViewHandle {
  /** Returns the currently active tab ID */
  getActiveTabId: () => string;
  /** Programmatically switch to a tab by ID */
  setActiveTab: (tabId: string) => void;
  /** Returns the set of tab IDs that have been activated at least once */
  getActivatedTabs: () => ReadonlySet<string>;
}
