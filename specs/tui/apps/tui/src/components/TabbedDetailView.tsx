import React, {
  forwardRef,
  useImperativeHandle,
} from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type {
  TabbedDetailViewProps,
  TabbedDetailViewHandle,
  TabContentContext,
} from "./TabbedDetailView.types.js";
import { getBreakpoint } from "../types/breakpoint.js";
import type { Breakpoint } from "../types/breakpoint.js";
import { useTabs } from "../hooks/useTabs.js";
import { useTabScrollState } from "../hooks/useTabScrollState.js";
import { useTabFilter, FILTER_MAX_LENGTH } from "../hooks/useTabFilter.js";

/**
 * Format a count for display in a tab badge.
 * - null → "" (no badge)
 * - 0-999 → " (N)"
 * - 1000-9999 → " (N.NK)"
 * - 10000+ → " (9999+)"
 */
export function formatCount(count: number | null): string {
  if (count === null) return "";
  if (count > 9999) return " (9999+)";
  if (count > 999) return ` (${(count / 1000).toFixed(1)}K)`;
  return ` (${count})`;
}

// --- Internal sub-component: HeaderSection ---

interface HeaderSectionProps {
  title: string;
  badge?: TabbedDetailViewProps["badge"];
  description?: string;
  descriptionPlaceholder?: string;
  metadata: NonNullable<TabbedDetailViewProps["metadata"]>;
  breakpoint: Breakpoint;
}

function HeaderSection(props: HeaderSectionProps) {
  const {
    title,
    badge,
    description,
    descriptionPlaceholder,
    metadata,
    breakpoint,
  } = props;

  // Filter metadata based on breakpoint
  const visibleMetadata = metadata.filter(
    (m) => m.value && !(breakpoint === "minimum" && m.hideAtMinimum)
  );

  const descriptionText = description || descriptionPlaceholder;
  const isPlaceholder = !description && !!descriptionPlaceholder;

  return (
    <box flexDirection="column" paddingX={1}>
      {/* Title + Badge row */}
      <box flexDirection="row" gap={2}>
        <text><b>{title}</b></text>
        {badge && <text fg={badge.fg}>{badge.label}</text>}
      </box>

      {/* Description */}
      {descriptionText && (
        <text wrapMode="word" fg={isPlaceholder ? "gray" : undefined}>
          {descriptionText}
        </text>
      )}

      {/* Metadata lines */}
      {visibleMetadata.length > 0 && (
        <box flexDirection="row" gap={2}>
          {visibleMetadata.map((m) => (
            <text key={m.label}>
              <span fg="gray">{m.label} </span>{m.value}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}

/**
 * TabbedDetailView — reusable layout component for entity detail screens
 * that combine a header/metadata section with tabbed content areas.
 *
 * Renders using verified OpenTUI JSX intrinsic elements:
 * - <box> for layout (flexDirection, flexGrow, gap, paddingX, border, borderStyle)
 * - <text> with fg/bg for colored text, <b>/<u> for bold/underline
 * - <input> with focused, placeholder, maxLength, onInput
 * - <scrollbox> for scrollable content areas
 *
 * @example
 * ```tsx
 * <TabbedDetailView
 *   title="Acme Corp"
 *   badge={{ label: "public", fg: "green" }}
 *   description="Building the future"
 *   tabs={[
 *     { id: "repos", label: "Repositories", shortLabel: "Repos",
 *       count: 12, visible: true, renderContent: (ctx) => <RepoList {...ctx} /> },
 *     { id: "settings", label: "Settings", shortLabel: "Sett.",
 *       count: null, visible: isOwner, pushOnActivate: true,
 *       onPush: () => nav.push("org-settings") },
 *   ]}
 * />
 * ```
 */
export const TabbedDetailView = forwardRef<
  TabbedDetailViewHandle,
  TabbedDetailViewProps
>(function TabbedDetailView(props, ref) {
  const {
    title,
    badge,
    description,
    descriptionPlaceholder,
    metadata = [],
    tabs: tabDefs,
    initialTabId,
    onTabChange,
    isLoading = false,
    error = null,
    onRetry,
  } = props;

  // --- Terminal dimensions via @opentui/react ---
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  const rawBreakpoint = getBreakpoint(termWidth, termHeight);
  const breakpoint: Breakpoint =
    rawBreakpoint === null ? "minimum" : rawBreakpoint;

  // --- Tab state ---
  const tabState = useTabs({
    tabs: tabDefs,
    initialTabId,
    onTabChange: (from, to) => {
      // Save/restore filter state on tab switch
      filterState.switchTab(from, to);
      onTabChange?.(from, to);
    },
  });

  // --- Scroll state ---
  const scrollState = useTabScrollState();

  // --- Filter state ---
  const filterState = useTabFilter();

  // --- Imperative handle for parent refs ---
  useImperativeHandle(ref, () => ({
    getActiveTabId: () => tabState.activeTabId,
    setActiveTab: (tabId: string) => tabState.setActiveTab(tabId),
    getActivatedTabs: () => tabState.activatedTabs,
  }));

  // --- Keyboard handler ---
  // Uses the actual @opentui/react useKeyboard API.
  // KeyEvent has: name (string), shift (boolean), ctrl (boolean),
  //               stopPropagation(), preventDefault()
  useKeyboard((event) => {
    // When filter input is active, only Esc propagates from this handler.
    // All printable keys are captured by <input focused> natively.
    if (filterState.isFiltering) {
      if (event.name === "escape") {
        filterState.clearFilter();
        event.stopPropagation();
        return;
      }
      // All other keys go to the <input> component natively
      return;
    }

    // Error state: R to retry
    if (error && event.name === "r" && onRetry) {
      onRetry();
      event.stopPropagation();
      return;
    }

    // Tab cycling: Tab (forward), Shift+Tab (backward)
    if (event.name === "tab" && !event.shift) {
      tabState.cycleForward();
      event.stopPropagation();
      return;
    }
    if (event.name === "tab" && event.shift) {
      tabState.cycleBackward();
      event.stopPropagation();
      return;
    }

    // Filter activation via /
    if (event.name === "/" && tabState.activeTab?.filterable !== false) {
      filterState.activateFilter();
      event.stopPropagation();
      return;
    }

    // Direct tab jump via 1-9
    if (/^[1-9]$/.test(event.name)) {
      tabState.jumpToIndex(parseInt(event.name, 10));
      event.stopPropagation();
      return;
    }
  });

  // --- Render: Unsupported terminal size ---
  if (rawBreakpoint === null) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
      >
        <text>
          Terminal too small — minimum 80×24, current {termWidth}×{termHeight}
        </text>
      </box>
    );
  }

  // --- Render: Loading state ---
  if (isLoading) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
      >
        <text>Loading…</text>
      </box>
    );
  }

  // --- Render: Error state ---
  if (error) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
        gap={1}
      >
        <text fg="red">{error}</text>
        {onRetry && <text fg="gray">Press R to retry</text>}
      </box>
    );
  }

  // --- Render: Zero visible tabs ---
  if (tabState.visibleTabs.length === 0) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <HeaderSection
          title={title}
          badge={badge}
          description={description}
          descriptionPlaceholder={descriptionPlaceholder}
          metadata={metadata}
          breakpoint={breakpoint}
        />
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text fg="gray">No content available.</text>
        </box>
      </box>
    );
  }

  // --- Build tab content context ---
  const activeTabScrollState = scrollState.getScrollState(tabState.activeTabId);
  const contentContext: TabContentContext = {
    filterText: filterState.filterText,
    isFiltering: filterState.isFiltering,
    scrollState: activeTabScrollState,
    onScrollStateChange: (state) =>
      scrollState.saveScrollState(tabState.activeTabId, state),
    isFirstRender: tabState.isFirstRender,
    breakpoint,
  };

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* --- Header Section --- */}
      <HeaderSection
        title={title}
        badge={badge}
        description={description}
        descriptionPlaceholder={descriptionPlaceholder}
        metadata={metadata}
        breakpoint={breakpoint}
      />

      {/* --- Tab Bar --- */}
      <box
        flexDirection="row"
        paddingX={1}
        height={1}
        border={["bottom"]}
        borderStyle="single"
        borderColor="gray"
      >
        {tabState.visibleTabs.map((tab, idx) => {
          const isActive = tab.id === tabState.activeTabId;
          const label = breakpoint === "minimum" ? tab.shortLabel : tab.label;
          const countStr = formatCount(tab.count);
          const displayText = `${idx + 1}:${label}${countStr}`;

          return (
            <box key={tab.id} marginRight={2}>
              <text fg={isActive ? "blue" : "gray"}>
                {isActive ? <b><u>{displayText}</u></b> : displayText}
              </text>
            </box>
          );
        })}
      </box>

      {/* --- Tab Content Area --- */}
      <box flexGrow={1}>
        {tabState.activeTab?.renderContent(contentContext)}
      </box>

      {/* --- Filter Input (when active) --- */}
      {filterState.isFiltering && (
        <box
          paddingX={1}
          height={1}
          border={["top"]}
          borderStyle="single"
          borderColor="gray"
        >
          <text fg="gray">/</text>
          <input
            value={filterState.filterText}
            onInput={filterState.setFilterText}
            placeholder="Filter…"
            maxLength={FILTER_MAX_LENGTH}
            focused
          />
        </box>
      )}
    </box>
  );
});
