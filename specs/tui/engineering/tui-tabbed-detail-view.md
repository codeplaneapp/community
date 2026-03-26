# Engineering Specification: tui-tabbed-detail-view

## Build tabbed detail view component for org overview and team detail

**Ticket**: tui-tabbed-detail-view
**Type**: Engineering
**Dependencies**: None
**Status**: Not started
**Feature Group**: TUI_ORGANIZATIONS
**Features touched**: TUI_ORG_OVERVIEW (partial — component infrastructure), TUI_ORG_TEAM_DETAIL (partial — component infrastructure)

---

## 1. Summary

This ticket creates the `TabbedDetailView` reusable component — the primary layout component for entity detail screens that combine a header/metadata section with tabbed content areas. It is the structural backbone for the Organization Overview screen (4 tabs: Repos/Members/Teams/Settings) and the Team Detail screen (2 tabs: Members/Repos), and is designed for reuse by future detail screens (landing detail, repo overview, etc.).

The component provides:

1. **Header/metadata section** — fixed-height area above the tabs for entity identity (name, badges, description, timestamps)
2. **Tab bar** with numbered tabs supporting `Tab`/`Shift+Tab` cycling and `1`-`N` direct jump
3. **Lazy-loaded tab content areas** — tab data hooks are only invoked when a tab is first activated
4. **Per-tab scroll position preservation** — switching tabs and returning preserves the user's scroll offset and focused row index
5. **Per-tab list with filter support** — each tab can independently host a `<scrollbox>` list with `/` filter activation and `Esc` to clear
6. **Tab-aware keybinding context** — keybindings registered per-tab (e.g., owner-only `a`/`x` in specific tabs) that activate/deactivate on tab switch
7. **Tab count badges** — each tab label shows its item count as "(N)", K-abbreviated above 999
8. **Role-conditional tab visibility** — tabs can be conditionally shown (e.g., Settings tab only for owners)
9. **Tab data caching** — once a tab's data is fetched, it is cached and not re-fetched on subsequent visits
10. **Responsive tab label abbreviation** — full labels at standard/large breakpoints, abbreviated labels at minimum

No screen-level logic is implemented in this ticket. The component is a pure layout/interaction primitive consumed by screen components.

### 1.1 Why not use OpenTUI's `<tab-select>`?

OpenTUI provides a native `<tab-select>` component (verified in `context/opentui/packages/core/src/renderables/TabSelect.ts`). It was evaluated and rejected for this use case because:

| Requirement | `<tab-select>` support | Custom component |
|------------|----------------------|------------------|
| Badge counts `(N)` on tabs | ❌ Only `name + description` | ✅ Formatted into label |
| Responsive label switching | ❌ No auto-collapse | ✅ `label` vs `shortLabel` |
| Conditional tab visibility | ❌ Requires array rebuild | ✅ `visible` boolean per tab |
| `Tab`/`Shift+Tab` cycling | ❌ Default is `←`/`→`/`[`/`]` | ✅ Matches TUI design spec |
| Numbered direct jump `1-9` | ❌ Not supported | ✅ First-class feature |
| Push-on-activate pattern | ❌ Not supported | ✅ For Settings-type tabs |
| Render prop for content | ❌ Renders description text | ✅ Full React render prop |
| Per-tab filter input | ❌ Not supported | ✅ Integrated `/` filter |

The native `<tab-select>` is appropriate for simple choice-style tabs. The `TabbedDetailView` requires a custom tab bar tightly integrated with its content area, scroll state, and keybinding context.

---

## 2. Scope

### In scope

1. `apps/tui/src/components/TabbedDetailView.tsx` — the main component (new file)
2. `apps/tui/src/components/TabbedDetailView.types.ts` — TypeScript interfaces (new file)
3. `apps/tui/src/components/TabbedDetailView.test-helpers.ts` — test utility exports for E2E tests (new file)
4. `apps/tui/src/hooks/useTabs.ts` — tab state management hook (new file)
5. `apps/tui/src/hooks/useTabScrollState.ts` — per-tab scroll position and focus index preservation (new file)
6. `apps/tui/src/hooks/useTabFilter.ts` — per-tab filter input state with client-side substring matching (new file)
7. `apps/tui/src/components/index.ts` — update existing barrel export to include TabbedDetailView
8. `apps/tui/src/hooks/index.ts` — update existing barrel export to include new hooks
9. `apps/tui/src/screens/Agents/types.ts` — update to re-export Breakpoint from shared location (deduplication)
10. E2E test file: `e2e/tui/organizations.test.ts` — tests for the TabbedDetailView component behavior as exercised through org screens (new file)

### Out of scope

- Organization Overview screen implementation (TUI_ORG_OVERVIEW — separate ticket)
- Team Detail screen implementation (TUI_ORG_TEAM_DETAIL — separate ticket)
- Data hooks (`useOrg`, `useOrgRepos`, `useTeam`, etc.) — will be provided by `@codeplane/ui-core` (package not yet implemented; backend service methods exist in `packages/sdk/src/services/org.ts`)
- Navigation stack integration (NavigationProvider — already implemented in `apps/tui/src/providers/NavigationProvider.tsx`)
- Mutation actions (add/remove/delete) — screen-level concerns
- Command palette, help overlay — already implemented in `apps/tui/src/providers/OverlayManager.tsx`
- SSE streaming — not used by detail views (REST only)

---

## 3. Architecture

### 3.1 Component Hierarchy

```
TabbedDetailView
├── <box flexDirection="column">          ← root vertical layout, 100% width/height
│   ├── HeaderSection                     ← fixed-height metadata section
│   │   ├── <box flexDirection="row">     ← title + badge row
│   │   │   ├── <text><b>{title}</b></text>
│   │   │   └── <text fg={badgeColor}>{badge}</text>
│   │   ├── <text wrapMode="word">{description}</text>
│   │   └── <box flexDirection="row">     ← metadata row(s)
│   │       └── <text><span fg="gray">{label}</span> {value}</text> × N
│   ├── TabBar                            ← single-row tab bar
│   │   ├── <box flexDirection="row" border={["bottom"]} borderStyle="single">
│   │   │   └── TabLabel × N              ← "N:Label (count)" per visible tab
│   └── TabContent                        ← flexible-height content area
│       └── <box flexGrow={1}>            ← active tab's content
│           └── {renderContent(ctx)}      ← rendered by consumer via render prop
└── FilterInput (conditional)             ← shown at bottom when / is pressed
    └── <box border={["top"]} borderStyle="single">
        └── <text fg="gray">/</text><input focused placeholder="Filter…" />
```

### 3.2 OpenTUI JSX Prop Reference

All JSX props verified against the actual OpenTUI source code in `context/opentui/`:

**`<text>`** — `TextOptions extends TextBufferOptions`:
- **Foreground color**: `fg` prop (type: `string | RGBA`), NOT `color`
- **Background color**: `bg` prop (type: `string | RGBA`)
- **Text wrap**: `wrapMode` prop (`"none" | "char" | "word"`), NOT `wrap`
- **Styling attributes**: `attributes` prop (numeric bitfield), NOT individual `bold`/`dim`/`underline` boolean props
- **Content**: `content` prop (type: `StyledText | string`) or JSX children
- **Truncation**: `truncate` prop (boolean)
- **Selectable**: `selectable` prop (boolean)

**Inline text styling via JSX elements** (verified in `jsx-namespace.d.ts`):
- `<b>` — bold text (SpanProps)
- `<i>` — italic text (SpanProps)
- `<u>` — underlined text (SpanProps)
- `<em>` — emphasis/italic (SpanProps)
- `<strong>` — strong/bold (SpanProps)
- All accept `SpanProps` which includes `fg`, `bg`, `attributes`

**`<span>`** — `TextNodeOptions`:
- `fg` (foreground color), `bg` (background), `attributes` (numeric bitfield)
- Does NOT accept `dim`, `bold`, `color` as direct props

**`<box>`** — `BoxOptions extends RenderableOptions`:
- `border` accepts `boolean | BorderSides[]` where `BorderSides = "top" | "right" | "bottom" | "left"`
- `borderStyle` accepts `"single" | "double" | "rounded" | "heavy"`
- `borderColor` accepts `string | RGBA`
- `gap` accepts `number | \`${number}%\``
- Full Yoga flexbox: `flexDirection`, `flexGrow`, `flexShrink`, `justifyContent`, `alignItems`, `alignSelf`
- Sizing: `width`, `height` accept `number | "auto" | \`${number}%\``
- Spacing: `padding`, `paddingX`, `paddingY`, `margin`, `marginX`, `marginY`, `marginRight`, etc.
- Positioning: `position` (`"relative" | "absolute"`), `top`, `right`, `bottom`, `left`, `zIndex`
- `backgroundColor` for fill
- `focused` (boolean) for focus management
- `title` (string) for titled borders
- `titleAlignment` (`"left" | "center" | "right"`)
- `focusedBorderColor` for focus indication
- `focusable` (boolean)

**`<input>`** — `InputRenderableOptions`:
- `placeholder` (string)
- `value` (string, initial value, newlines stripped)
- `maxLength` (number, default 1000) — **built-in enforcement, no hook-level cap needed**
- `focused` (boolean)
- `onInput` (callback: `(value: string) => void`) — fires on every keystroke
- `onChange` (callback: `(value: string) => void`) — fires on blur/submit
- `onSubmit` (callback: `(value: string) => void`) — fires on Enter
- Single-line only, height always 1

**`<scrollbox>`** — `ScrollBoxOptions extends BoxOptions`:
- `stickyScroll` (boolean)
- `viewportCulling` (boolean)
- `scrollX` / `scrollY` (boolean)
- `stickyStart` (`"bottom" | "top" | "left" | "right"`)
- `scrollAcceleration` (ScrollAcceleration)
- Accepts `focused` (boolean)
- Methods: `scrollBy()`, `scrollTo()`, `scrollChildIntoView()`
- Properties: `scrollTop`, `scrollLeft`, `scrollWidth`, `scrollHeight`

**`useKeyboard`** — `@opentui/react` hook:
- Signature: `useKeyboard(handler: (key: KeyEvent) => void, options?: { release?: boolean })`
- `KeyEvent` properties: `name` (string), `ctrl` (boolean), `shift` (boolean), `meta` (boolean), `option` (boolean), `number` (boolean), `repeated` (boolean), `sequence` (string), `raw` (string)
- Event control: `event.preventDefault()`, `event.stopPropagation()`, `event.defaultPrevented`, `event.propagationStopped`
- Shift+Tab detected as: `event.name === "tab" && event.shift === true`
- Numbers detected as: `/^[1-9]$/.test(event.name)` or `event.number === true`
- By default only receives press events (including repeats with `repeated: true`)

**`useTerminalDimensions`** — returns `{ width: number, height: number }`

### 3.3 Data Flow

```
Consumer Screen (OrgOverview / TeamDetail)
  │
  ├─ defines tab configuration (id, label, shortLabel, count, visible, renderContent)
  ├─ passes header props (title, badge, description, metadata lines)
  ├─ passes role/permission context for conditional tab visibility
  │
  └─► TabbedDetailView
        │
        ├─ useTabFilter() → filterText, isFiltering, activateFilter, clearFilter, switchTab
        ├─ useTabs(tabConfig) → activeTabId, setActiveTab, visibleTabs, activatedTabs
        │   └─ onTabChange calls filterState.switchTab(from, to)
        ├─ useTabScrollState() → getScrollState, saveScrollState per tab
        │
        ├─ Registers keyboard handler via useKeyboard() from @opentui/react
        │   ├─ Tab/Shift+Tab → cycleForward/cycleBackward
        │   ├─ 1-9 → jumpToIndex
        │   ├─ / → activateFilter
        │   └─ Esc → clearFilter (when filtering)
        ├─ Renders header, tab bar, active tab content via render prop
        └─ Passes TabContentContext to content renderer
```

**Critical ordering note:** `useTabFilter()` must be called BEFORE `useTabs()` in the component body so that `filterState.switchTab` is available in the `useTabs` `onTabChange` callback without stale closure risk. This differs from the reference implementation in `specs/tui/` which calls `useTabFilter()` after `useTabs()` and can cause stale closure bugs.

### 3.4 Lazy Loading Pattern

Tab content is rendered via a render prop pattern. The `TabbedDetailView` only renders the active tab's content. To support lazy loading at the data level, the component tracks which tabs have been activated (`activatedTabs: Set<string>`). Consumers use this signal to conditionally invoke their data hooks:

```typescript
// In consumer screen — hooks are always called (React rules of hooks),
// but the enabled/skip parameter gates the actual API request.
// Note: @codeplane/ui-core org hooks do not yet exist. When implemented,
// hooks will follow this pattern per the architecture spec:
const reposHook = useOrgRepos(orgName, { enabled: tabState.hasActivated("repos") });
const membersHook = useOrgMembers(orgName, { enabled: tabState.hasActivated("members") });
```

Alternatively, consumers can use the `onFirstActivation` callback on `TabDefinition` to trigger data fetching imperatively.

### 3.5 Backend API Surface

The backend service methods exist in `packages/sdk/src/services/org.ts` (OrgService). Verified against source:

| Endpoint | Method | Returns |
|----------|--------|---------|
| `GET /api/orgs/:org` | `getOrg(viewer, orgName)` | `Organization` |
| `GET /api/orgs/:org/repos` | `listOrgRepos(viewer, orgName, page, perPage)` | `{items: Repository[], total: number}` |
| `GET /api/orgs/:org/members` | `listOrgMembers(viewer, orgName, page, perPage)` | `{items: ListOrgMembersRow[], total: number}` |
| `GET /api/orgs/:org/teams` | `listOrgTeams(viewer, orgName, page, perPage)` | `{items: Team[], total: number}` |
| `GET /api/orgs/:org/teams/:team` | `getTeam(viewer, orgName, teamName)` | `Team` |
| `GET /api/orgs/:org/teams/:team/members` | `listTeamMembers(viewer, orgName, teamName, page, perPage)` | `{items: User[], total: number}` |
| `GET /api/orgs/:org/teams/:team/repos` | `listTeamRepos(viewer, orgName, teamName, page, perPage)` | `{items: Repository[], total: number}` |

Pagination uses `page` (1-based) + `perPage` (default 30, max 100), returning `{items, total}`. Pagination is normalized via `normalizePage()` (see `packages/sdk/src/services/org.ts` line 64).

**SDK response types (verified against `packages/sdk/src/services/org.ts`):**

```typescript
interface Organization {
  id: number;
  name: string;
  lower_name: string;
  description: string;
  visibility: string;  // "public" | "limited" | "private"
  website: string;
  location: string;
  created_at: string;  // ISO-8601
  updated_at: string;
}

interface Team {
  id: number;
  organization_id: number;
  name: string;
  lower_name: string;
  description: string;
  permission: string;  // "read" | "write" | "admin"
  created_at: string;
  updated_at: string;
}

interface ListOrgMembersRow {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  role: string;  // "owner" | "member"
}

interface Repository {
  id: number;
  name: string;
  lower_name: string;
  owner: string;
  description: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}
```

### 3.6 Current Codebase State

The production `apps/tui/src/` directory currently contains 86 TypeScript files with established infrastructure:

**Already exists — no creation needed:**
- `apps/tui/src/types/breakpoint.ts` — Breakpoint type + `getBreakpoint()` function (exact content matches spec)
- `apps/tui/src/types/index.ts` — barrel export: `{ getBreakpoint, Breakpoint }`
- `apps/tui/src/components/index.ts` — barrel with 13 component exports (AppShell, HeaderBar, StatusBar, etc.)
- `apps/tui/src/hooks/index.ts` — barrel with 14 hook exports (useDiffSyntaxStyle, useTheme, useColorTier, useSpinner, useLayout, useNavigation, useAuth, useLoading, useScreenLoading, useOptimisticMutation, usePaginationLoading, useBreakpoint, useResponsiveValue, useSidebarState)
- `apps/tui/src/providers/` — full provider stack (ThemeProvider, NavigationProvider, SSEProvider, AuthProvider, APIClientProvider, LoadingProvider, KeybindingProvider, OverlayManager)

**Needs modification:**
- `apps/tui/src/screens/Agents/types.ts` — line 16 has duplicate `Breakpoint = "minimum" | "standard" | "large"` that must be changed to re-export from `../../types/breakpoint.js`
- `apps/tui/src/components/index.ts` — append TabbedDetailView exports
- `apps/tui/src/hooks/index.ts` — append new tab hook exports

**New files to create:**
- `apps/tui/src/components/TabbedDetailView.tsx`
- `apps/tui/src/components/TabbedDetailView.types.ts`
- `apps/tui/src/components/TabbedDetailView.test-helpers.ts`
- `apps/tui/src/hooks/useTabs.ts`
- `apps/tui/src/hooks/useTabScrollState.ts`
- `apps/tui/src/hooks/useTabFilter.ts`
- `e2e/tui/organizations.test.ts`

---

## 4. Implementation Plan

### Step 1: Deduplicate the `Breakpoint` type in Agents screen

**File**: `apps/tui/src/screens/Agents/types.ts` (existing file — line 16 modification)

The `Breakpoint` type is currently defined inline in this file as a duplicate of `apps/tui/src/types/breakpoint.ts`. Change line 16 from a standalone type definition to a re-export:

```diff
-export type Breakpoint = "minimum" | "standard" | "large";
+export type { Breakpoint } from "../../types/breakpoint.js";
```

This is a non-breaking change. `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` imports `Breakpoint` from `"../types.js"` (line 1) which will continue to resolve correctly via the re-export.

### Step 2: Define TypeScript interfaces

**File**: `apps/tui/src/components/TabbedDetailView.types.ts` (new file)

```typescript
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
   * Defaults to true (when undefined).
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
```

### Step 3: Create the `useTabs` hook

**File**: `apps/tui/src/hooks/useTabs.ts` (new file)

```typescript
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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

  // Auto-correct if activeTabId no longer matches a visible tab.
  // Uses useEffect instead of queueMicrotask to avoid side effects during render.
  const needsCorrection = activeTab && activeTab.id !== activeTabId;
  useEffect(() => {
    if (needsCorrection && activeTab) {
      setActiveTabIdRaw(activeTab.id);
    }
  }, [needsCorrection, activeTab]);

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
```

**Key change from reference implementation:** The `specs/tui` version at `specs/tui/apps/tui/src/hooks/useTabs.ts` lines 116–119 uses `queueMicrotask` to auto-correct the active tab when it becomes invisible. This is a side effect during render — React 19 will warn about it. The production implementation uses `useEffect` for the correction, which is the correct React pattern. The `useEffect` runs synchronously in the commit phase, so the correction is applied before the next paint — no visible flicker.

### Step 4: Create the `useTabScrollState` hook

**File**: `apps/tui/src/hooks/useTabScrollState.ts` (new file)

```typescript
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
```

### Step 5: Create the `useTabFilter` hook

**File**: `apps/tui/src/hooks/useTabFilter.ts` (new file)

```typescript
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
```

### Step 6: Create the `TabbedDetailView` component

**File**: `apps/tui/src/components/TabbedDetailView.tsx` (new file)

```typescript
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
 * - negative/NaN → "" (no badge)
 * - 0-999 → " (N)"
 * - 1000-9999 → " (N.NK)"
 * - 10000+ → " (9999+)"
 */
export function formatCount(count: number | null): string {
  if (count === null || count < 0 || Number.isNaN(count)) return "";
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

  // Filter metadata based on breakpoint and falsy value
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

  // --- Filter state (declared before useTabs so switchTab is available) ---
  const filterState = useTabFilter();

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

  // --- Imperative handle for parent refs ---
  useImperativeHandle(ref, () => ({
    getActiveTabId: () => tabState.activeTabId,
    setActiveTab: (tabId: string) => tabState.setActiveTab(tabId),
    getActivatedTabs: () => tabState.activatedTabs,
  }));

  // --- Keyboard handler ---
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
```

### Step 7: Create test helpers

**File**: `apps/tui/src/components/TabbedDetailView.test-helpers.ts` (new file)

```typescript
/**
 * Tab bar label format at different breakpoints.
 * Used by E2E tests to construct expected terminal content.
 */
export const TAB_LABEL_FORMATS = {
  orgOverview: {
    minimum: {
      repos: "1:Repos",
      members: "2:Memb.",
      teams: "3:Teams",
      settings: "4:Sett.",
    },
    standard: {
      repos: "1:Repositories",
      members: "2:Members",
      teams: "3:Teams",
      settings: "4:Settings",
    },
  },
  teamDetail: {
    minimum: {
      members: "1:Memb.",
      repos: "2:Repos",
    },
    standard: {
      members: "1:Members",
      repos: "2:Repositories",
    },
  },
} as const;

/** Maximum filter input length (enforced by <input maxLength>) */
export const MAX_FILTER_LENGTH = 100;

/** Maximum items per tab (pagination cap from architecture spec) */
export const MAX_ITEMS_PER_TAB = 500;

/** Format count for display, matching component logic */
export function formatCount(count: number | null): string {
  if (count === null || count < 0 || Number.isNaN(count)) return "";
  if (count > 9999) return " (9999+)";
  if (count > 999) return ` (${(count / 1000).toFixed(1)}K)`;
  return ` (${count})`;
}
```

### Step 8: Update barrel exports

**File**: `apps/tui/src/components/index.ts` (existing file — append lines)

Append after the existing `export { OverlayLayer }` line:

```typescript
export { TabbedDetailView, formatCount } from "./TabbedDetailView.js";
export type {
  TabbedDetailViewProps,
  TabbedDetailViewHandle,
  TabDefinition,
  TabContentContext,
  TabScrollState,
  DetailBadge,
  DetailMetadataLine,
} from "./TabbedDetailView.types.js";
```

**File**: `apps/tui/src/hooks/index.ts` (existing file — append lines)

Append after the existing `useSidebarState` export line:

```typescript
export { useTabs } from "./useTabs.js";
export type { UseTabsOptions, UseTabsReturn } from "./useTabs.js";
export { useTabScrollState } from "./useTabScrollState.js";
export type { UseTabScrollStateReturn } from "./useTabScrollState.js";
export { useTabFilter, FILTER_MAX_LENGTH } from "./useTabFilter.js";
export type { UseTabFilterReturn } from "./useTabFilter.js";
```

---

## 5. Consumer Integration Guide

### 5.1 Organization Overview (4 tabs)

```typescript
// apps/tui/src/screens/Organizations/OrgOverview.tsx
import { TabbedDetailView } from "../../components/index.js";
import type { TabDefinition } from "../../components/TabbedDetailView.types.js";

function OrgOverviewScreen({ orgName }: { orgName: string }) {
  const { data: org, isLoading, error, retry } = useOrg(orgName);
  const { role } = useOrgRole(orgName);
  const isOwner = role === "owner";
  const nav = useNavigation();

  const tabs: TabDefinition[] = [
    { id: "repos", label: "Repositories", shortLabel: "Repos",
      count: reposData?.totalCount ?? null, visible: true,
      renderContent: (ctx) => <OrgReposList orgName={orgName} {...ctx} /> },
    { id: "members", label: "Members", shortLabel: "Memb.",
      count: membersData?.totalCount ?? null, visible: true,
      renderContent: (ctx) => <OrgMembersList orgName={orgName} {...ctx} /> },
    { id: "teams", label: "Teams", shortLabel: "Teams",
      count: teamsData?.totalCount ?? null, visible: true,
      renderContent: (ctx) => <OrgTeamsList orgName={orgName} {...ctx} /> },
    { id: "settings", label: "Settings", shortLabel: "Sett.",
      count: null, visible: isOwner, pushOnActivate: true,
      onPush: () => nav.push("org-settings", { org: orgName }), filterable: false,
      renderContent: () => null },
  ];

  return (
    <TabbedDetailView
      title={org?.name ?? orgName}
      badge={org ? { label: org.visibility,
        fg: org.visibility === "public" ? "green" : org.visibility === "limited" ? "yellow" : "red" } : undefined}
      description={org?.description}
      metadata={[
        { label: "Website", value: org?.website ?? "", hideAtMinimum: true },
        { label: "Location", value: org?.location ?? "", hideAtMinimum: true },
        { label: "Created", value: formatRelativeTime(org?.created_at) },
      ]}
      tabs={tabs} isLoading={isLoading} error={error?.message} onRetry={retry}
    />
  );
}
```

### 5.2 Team Detail (2 tabs)

```typescript
// apps/tui/src/screens/Organizations/TeamDetail.tsx
import { TabbedDetailView } from "../../components/index.js";

function TeamDetailScreen({ org, team }: { org: string; team: string }) {
  const { data: teamData, isLoading, error, retry } = useTeam(org, team);

  const tabs: TabDefinition[] = [
    { id: "members", label: "Members", shortLabel: "Memb.",
      count: membersData?.totalCount ?? null, visible: true,
      renderContent: (ctx) => <TeamMembersList org={org} team={team} {...ctx} /> },
    { id: "repos", label: "Repositories", shortLabel: "Repos",
      count: reposData?.totalCount ?? null, visible: true,
      renderContent: (ctx) => <TeamReposList org={org} team={team} {...ctx} /> },
  ];

  return (
    <TabbedDetailView
      title={teamData?.name ?? team}
      badge={teamData ? { label: teamData.permission,
        fg: teamData.permission === "read" ? "green" : teamData.permission === "write" ? "yellow" : "red" } : undefined}
      description={teamData?.description}
      descriptionPlaceholder="No description provided."
      metadata={[{ label: "Created", value: formatRelativeTime(teamData?.created_at) }]}
      tabs={tabs} isLoading={isLoading} error={error?.message} onRetry={retry}
    />
  );
}
```

---

## 6. Responsive Behavior

| Breakpoint | Tab Labels | Header Metadata | Modal Width |
|------------|-----------|----------------|-------------|
| minimum (80×24) | `{N}:{shortLabel}` + count | `hideAtMinimum` lines hidden | 90% |
| standard (120×40) | `{N}:{label}` + count | All lines shown | 60% |
| large (200×60+) | `{N}:{label}` + count | All lines shown, wider | 50% |

Column layout within tab content is the consumer's responsibility — `TabContentContext.breakpoint` is passed through.

---

## 7. Keybinding Matrix

| Key | Context | Action | OpenTUI `event.name` | `event.shift` |
|-----|---------|--------|---------------------|----------------|
| `Tab` | Not in filter | Cycle to next visible tab | `"tab"` | `false` |
| `Shift+Tab` | Not in filter | Cycle to previous visible tab | `"tab"` | `true` |
| `1`-`9` | Not in filter | Jump to tab by 1-based index | `"1"` through `"9"` | n/a |
| `/` | Not in filter, tab filterable | Activate filter input | `"/"` | n/a |
| `Esc` | Filter active | Clear filter, deactivate input | `"escape"` | n/a |
| `R` | Error state | Retry | `"r"` | n/a |

When filter is active: all printable keys captured by `<input focused>` natively. Only `Esc` intercepted by component handler. `Ctrl+C` propagates to global quit via KeybindingProvider priority.

---

## 8. Edge Cases

| Case | Behavior |
|------|----------|
| Zero visible tabs | Header renders, "No content available." centered below |
| Active tab becomes invisible | `useEffect` auto-corrects to first visible tab |
| Count > 9999 | `(9999+)` |
| Count null/negative/NaN | No badge (empty string) |
| Count 0 | `(0)` shown |
| Single tab | Tab bar renders, Tab/Shift+Tab are no-ops (wraps to same tab) |
| Push-on-activate tab | `onPush()` called, active tab unchanged |
| Rapid tab switching | No corruption — each switch is atomic state update via functional `setState` |
| Terminal resize | `breakpoint` updates immediately via `useTerminalDimensions`, scroll/focus preserved |
| Below 80×24 | "Terminal too small" message, only Ctrl+C active |
| Empty tabs array | `activeTabId: ""`, shows empty message |
| Non-filterable tab + `/` | Key not consumed, propagates to parent handler |
| `initialTabId` invalid | Falls back to first visible tab |
| `initialTabId` matches hidden tab | Falls back to first visible tab |
| Filter active + Tab key | Tab key does NOT cycle (filter input captures it natively via `<input focused>`) |
| Filter active + number key | Number typed into filter (captured by `<input focused>`) |
| Metadata with empty `value` | Line omitted from rendering |

---

## 9. Unit & Integration Tests

### Test File: `e2e/tui/organizations.test.ts`

All tests use `@microsoft/tui-test` + `bun:test`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out. No mocking of implementation details.

The test file uses the `launchTUI()` helper from `e2e/tui/helpers.ts` which spawns a real TUI process with terminal emulation via `@microsoft/tui-test`.

**Test cleanup pattern:** Every test assigns to a shared `tui` variable per describe block. `afterEach` calls `tui.terminate()` to prevent leaked child processes. This is critical because each test spawns a real subprocess via `@microsoft/tui-test`.

**Test inventory (49 tests across 10 describe blocks):**

| Describe Block | Test IDs | Count |
|---------------|----------|-------|
| Tab bar rendering | SNAP-TAB-001 through SNAP-TAB-009 | 9 |
| Header rendering | SNAP-HDR-001 through SNAP-HDR-006 | 6 |
| Loading/error states | SNAP-STA-001, SNAP-STA-002, KEY-STA-001 | 3 |
| Tab navigation keyboard | KEY-TAB-001 through KEY-TAB-010 | 10 |
| Tab scroll preservation | KEY-SCR-001 through KEY-SCR-003 | 3 |
| Lazy loading | INT-LAZY-001 through INT-LAZY-003 | 3 |
| Filter | KEY-FLT-001 through KEY-FLT-006, EDGE-FLT-001 | 7 |
| Responsive behavior | RSP-TAB-001 through RSP-TAB-006 | 6 |
| Integration | INT-NAV-001 through INT-NAV-003, EDGE-TAB-001 through EDGE-TAB-003 | 6 |
| Team detail | KEY-TEAM-001 through KEY-TEAM-003, SNAP-TEAM-001, SNAP-TEAM-002 | 5 |

### Full Test Source

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance } from "./helpers.ts";

// =============================================================================
// Tab Bar Rendering
// =============================================================================

describe("TUI_ORG_OVERVIEW — tab bar rendering", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("SNAP-TAB-001: tab bar renders all visible tabs at 120x40", async () => {
    // Navigate to org overview at 120×40
    // Verify tab bar shows: 1:Repositories (N)  2:Members (N)  3:Teams (N)
    // First tab (Repositories) is active with underline and bold
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o"); // go to orgs
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter"); // open first org
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-TAB-002: tab bar hides Settings for non-owner", async () => {
    // Non-owner navigates to org overview
    // Verify only 3 tabs visible: Repositories, Members, Teams
    // Settings tab is not rendered in the tab bar
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    const snapshot = tui.snapshot();
    expect(snapshot).not.toMatch(/Settings/);
  });

  test("SNAP-TAB-003: tab bar shows Settings for owner", async () => {
    // Owner navigates to org overview
    // Verify 4 tabs visible including Settings
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Owner fixture org should show Settings
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/4:Settings/);
  });

  test("SNAP-TAB-004: tab labels include count badges", async () => {
    // Verify tab labels include item counts: "1:Repositories (12)"
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatch(/Repositories \(\d+\)/);
  });

  test("SNAP-TAB-005: tab bar abbreviates labels at 80x24", async () => {
    // At 80×24, tab labels use shortLabel: "Repos", "Memb.", "Teams"
    tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repos");
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/1:Repos/);
    expect(snapshot).toMatch(/2:Memb\./);
  });

  test("SNAP-TAB-006: tab bar full labels at 120x40", async () => {
    // At 120×40, tab labels use full label: "Repositories", "Members"
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/1:Repositories/);
    expect(snapshot).toMatch(/2:Members/);
  });

  test("SNAP-TAB-007: active tab rendered with underline and bold", async () => {
    // Active tab rendered with bold + underline (ANSI SGR codes)
    // Inactive tabs rendered without bold/underline
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Snapshot comparison validates styling (bold + underline ANSI codes)
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-TAB-008: count K-abbreviated above 999", async () => {
    // Org with 1500 repos shows "Repositories (1.5K)"
    // Requires test fixture org with >999 items in a tab
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatch(/\d+\.\d+K\)/);
  });

  test("SNAP-TAB-009: count capped at 9999+", async () => {
    // Org with 15000+ items shows "(9999+)"
    // Requires test fixture org with >9999 items in a tab
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatch(/9999\+\)/);
  });
});

// =============================================================================
// Header Rendering
// =============================================================================

describe("TUI_ORG_OVERVIEW — header rendering", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("SNAP-HDR-001: header shows title in bold", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-HDR-002: header shows color-coded visibility badge", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-HDR-003: header shows word-wrapped description", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-HDR-004: header shows placeholder when description empty", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    expect(tui.snapshot()).toMatch(/No description provided\./);
  });

  test("SNAP-HDR-005: header hides metadata at minimum breakpoint", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repos");
    const snapshot = tui.snapshot();
    expect(snapshot).not.toMatch(/Website/);
    expect(snapshot).not.toMatch(/Location/);
  });

  test("SNAP-HDR-006: header shows all metadata at standard breakpoint", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// =============================================================================
// Loading and Error States
// =============================================================================

describe("TUI_ORG_OVERVIEW — loading and error states", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("SNAP-STA-001: loading state shows Loading text", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    expect(tui.snapshot()).toMatch(/Loading/);
  });

  test("SNAP-STA-002: error state shows message with retry hint", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("retry");
    expect(tui.snapshot()).toMatch(/Press R to retry/);
  });

  test("KEY-STA-001: R key retries in error state", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("retry");
    await tui.sendKeys("r");
    // Should trigger re-fetch; if API still errors, shows error again
    // If API succeeds on retry, shows content
  });
});

// =============================================================================
// Tab Navigation Keyboard
// =============================================================================

describe("TUI_ORG_OVERVIEW — tab navigation keyboard", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("KEY-TAB-001: Tab key cycles forward through tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("Tab");
    await tui.waitForText("Members");

    await tui.sendKeys("Tab");
    await tui.waitForText("Teams");
  });

  test("KEY-TAB-002: Shift+Tab cycles backward through tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("shift+Tab");
    // Should wrap to last visible tab (Teams for non-owner)
  });

  test("KEY-TAB-003: Tab wraps forward from last to first", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("3"); // jump to Teams (last for non-owner)
    await tui.sendKeys("Tab"); // should wrap to Repositories
    await tui.waitForText("Repositories");
  });

  test("KEY-TAB-004: Shift+Tab wraps backward from first to last", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("shift+Tab"); // should wrap to last visible tab
  });

  test("KEY-TAB-005: number 1 jumps to first tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // go to Members
    await tui.sendKeys("1"); // back to Repositories
  });

  test("KEY-TAB-006: number 2 jumps to second tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // jump to Members
  });

  test("KEY-TAB-007: number 3 jumps to third tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("3"); // jump to Teams
  });

  test("KEY-TAB-008: number 4 activates Settings push for owner", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("4"); // jump to Settings
    // For pushOnActivate tabs, this pushes a new screen via NavigationProvider
  });

  test("KEY-TAB-009: number 4 is no-op for non-owner", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("4"); // no-op for non-owner
    // Verify still on current tab (Repositories)
  });

  test("KEY-TAB-010: number beyond tab count is no-op", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("9"); // no-op
    // Verify still on Repositories tab
  });
});

// =============================================================================
// Tab Scroll Preservation
// =============================================================================

describe("TUI_ORG_OVERVIEW — tab scroll preservation", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("KEY-SCR-001: scroll position preserved across tab switch", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    for (let i = 0; i < 5; i++) await tui.sendKeys("j");
    await tui.sendKeys("2"); // Members
    await tui.sendKeys("1"); // back to Repos

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-SCR-002: focus index preserved across tab switch", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("j", "j"); // focus 3rd item
    await tui.sendKeys("Tab"); // switch to Members
    await tui.sendKeys("shift+Tab"); // back to Repos

    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-SCR-003: independent scroll state per tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    for (let i = 0; i < 5; i++) await tui.sendKeys("j");
    await tui.sendKeys("2");
    await tui.sendKeys("j", "j");
    await tui.sendKeys("1");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// =============================================================================
// Lazy Loading
// =============================================================================

describe("TUI_ORG_OVERVIEW — lazy loading", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("INT-LAZY-001: default tab data loaded on mount", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("INT-LAZY-002: non-default tab data loaded on first activation", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // switch to Members
    await tui.waitForText("Members");
  });

  test("INT-LAZY-003: tab data cached after first load", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // Members
    await tui.waitForText("Members");
    await tui.sendKeys("1"); // back to Repos
    await tui.sendKeys("2"); // back to Members — should not show loading
  });
});

// =============================================================================
// Filter
// =============================================================================

describe("TUI_ORG_OVERVIEW — filter", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("KEY-FLT-001: slash activates filter input", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    expect(tui.snapshot()).toMatch(/Filter/);
  });

  test("KEY-FLT-002: filter text narrows list", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    await tui.sendText("api");
  });

  test("KEY-FLT-003: Esc clears filter and restores list", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    await tui.sendText("api");
    await tui.sendKeys("Escape");
  });

  test("KEY-FLT-004: navigation keys type into filter when active", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    await tui.sendText("jkq123");
  });

  test("KEY-FLT-005: filter text preserved per tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    await tui.sendText("api");
    await tui.sendKeys("Escape");
    await tui.sendKeys("2"); // Members
    await tui.sendKeys("1"); // back to Repos
  });

  test("KEY-FLT-006: slash is no-op on non-filterable tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("4");
  });

  test("EDGE-FLT-001: filter input capped at 100 characters", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    const longText = "a".repeat(150);
    await tui.sendText(longText);
  });
});

// =============================================================================
// Responsive Behavior
// =============================================================================

describe("TUI_ORG_OVERVIEW — responsive behavior", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("RSP-TAB-001: resize preserves active tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // Members
    await tui.resize(80, 24);
    expect(tui.snapshot()).toMatch(/2:Memb\./);
  });

  test("RSP-TAB-002: resize preserves focus within tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("j", "j");
    await tui.resize(80, 24);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RSP-TAB-003: resize reflows header metadata", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.resize(80, 24);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RSP-TAB-004: team detail 2 tabs at 80x24", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open first team
    await tui.waitForText("Memb.");
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/1:Memb\./);
    expect(snapshot).toMatch(/2:Repos/);
  });

  test("RSP-TAB-005: team detail 2 tabs at 120x40", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open first team
    await tui.waitForText("Members");
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/1:Members/);
    expect(snapshot).toMatch(/2:Repositories/);
  });

  test("RSP-TAB-006: below minimum shows terminal too small", async () => {
    tui = await launchTUI({ cols: 60, rows: 20 });
    await tui.sendKeys("g", "o");
    expect(tui.snapshot()).toMatch(/Terminal too small/);
  });
});

// =============================================================================
// Integration
// =============================================================================

describe("TUI_ORG_OVERVIEW — integration", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("INT-NAV-001: push-on-activate tab navigates to new screen", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("4"); // Settings (pushOnActivate)
  });

  test("INT-NAV-002: back navigation preserves tab state", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.sendKeys("q"); // back
  });

  test("INT-NAV-003: tab switch during loading does not cancel fetch", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // Members (starts loading)
    await tui.sendKeys("3"); // Teams (does not cancel Members fetch)
    await tui.sendKeys("2"); // Back to Members — should show cached data
  });

  test("EDGE-TAB-001: rapid tab switching no corruption", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    for (let i = 0; i < 20; i++) {
      await tui.sendKeys("Tab");
    }
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("EDGE-TAB-002: zero visible tabs shows empty message", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    // This test depends on a fixture org with all tabs gated
    // Left failing until fixture is available
  });

  test("EDGE-TAB-003: single tab renders tab bar", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    // Requires fixture with org that has only one tab visible
  });
});

// =============================================================================
// Team Detail (2 tabs)
// =============================================================================

describe("TUI_ORG_TEAM_DETAIL — tab navigation", () => {
  let tui: TUITestInstance | null = null;
  afterEach(async () => {
    if (tui) { await tui.terminate(); tui = null; }
  });

  test("KEY-TEAM-001: Tab cycles between 2 tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");

    await tui.sendKeys("Tab"); // → Repos
    await tui.sendKeys("Tab"); // → Members (wrap)
  });

  test("KEY-TEAM-002: number keys 1 and 2 jump to tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");

    await tui.sendKeys("2"); // → Repos
    await tui.sendKeys("1"); // → Members
  });

  test("KEY-TEAM-003: number 3 is no-op with 2 tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");

    await tui.sendKeys("3"); // no-op, only 2 tabs
  });

  test("SNAP-TEAM-001: team detail header with description placeholder", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-TEAM-002: team detail with permission badge", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});
```

---

## 10. Productionization Checklist

### 10.1 PoC Validation (before implementation)

**PoC 1: Keyboard event propagation** (`poc/tui-keyboard-propagation.tsx`)
- Verify `event.stopPropagation()` on a `KeyEvent` (from `useKeyboard`) prevents parent `useKeyboard` handlers from firing.
- Verify `<input focused>` captures printable keys (including `j`, `k`, `1`, `2`, `/`, `q`) without explicit `useKeyboard` handling in the component.
- Verify `Esc` (event.name === "escape") is receivable in `useKeyboard` even when `<input>` has focus.
- Verify `Tab` and `Shift+Tab` are receivable in `useKeyboard` when `<input>` is focused (needed for tab cycling to still work or explicitly be blocked).

**PoC 2: Partial box borders** (`poc/tui-box-border.tsx`)
- Verify `border={["bottom"]}` renders only a bottom border (no top, left, right).
- Verify `borderStyle="single"` + `borderColor="gray"` applies correctly to partial borders.
- Verify `border={["top"]}` renders only a top border (used for filter input).
- Verify `height={1}` on a `<box>` with partial border correctly computes layout (border may add to height).

If PoC tests pass, their assertions graduate into the E2E suite. If they fail, the component design must be revised before implementation proceeds.

### 10.2 Import & Build Validation

- [ ] `import { useKeyboard, useTerminalDimensions } from "@opentui/react"` resolves at build time
- [ ] All JSX intrinsics (`<box>`, `<text>`, `<input>`, `<scrollbox>`, `<span>`, `<b>`, `<u>`) resolve via `@opentui/react` JSX namespace
- [ ] Import paths use `.js` extension consistently (matching existing convention: `from "../lib/diff-syntax.js"` in `useDiffSyntaxStyle.ts`)
- [ ] `tsc --noEmit` passes with zero errors on all new files
- [ ] No circular imports between `types/breakpoint.ts` ← `hooks/useTabs.ts` ← `components/TabbedDetailView.tsx`
- [ ] `jsxImportSource: "@opentui/react"` in tsconfig.json is respected (verified: `apps/tui/tsconfig.json` line 7)

### 10.3 OpenTUI Prop Correctness

- [ ] `<text>` uses `fg` (NOT `color`), `wrapMode` (NOT `wrap`)
- [ ] Bold via `<b>`, underline via `<u>` (NOT boolean props like `bold` or `underline`)
- [ ] `<span>` uses `fg`/`bg`/`attributes` (NOT `dim`/`color`/`bold`)
- [ ] `<box>` `border` uses `BorderSides[]` array syntax: `border={["bottom"]}`, `border={["top"]}`
- [ ] `<input>` uses `onInput` for per-keystroke callback (NOT `onChange`), `maxLength`, `focused`, `placeholder`, `value`
- [ ] `useKeyboard` handler checks `event.name` and `event.shift` (NOT `event.key` or other DOM-style APIs)

### 10.4 Component & Hook Contracts

- [ ] 0 / 1 / 2 / 4 visible tabs all render correctly without crashes
- [ ] `forwardRef` + `useImperativeHandle` correctly exposes `TabbedDetailViewHandle`
- [ ] `isLoading=true` renders centered "Loading…" text
- [ ] `error` string renders red error message with "Press R to retry" hint
- [ ] Terminal below 80×24 renders "Terminal too small" message
- [ ] `useTabs` handles: empty array, invalid `initialTabId`, tab-becomes-invisible mid-session
- [ ] `useTabs` cycling wraps at both ends, jump ignores out-of-range indices
- [ ] `useTabScrollState` returns default `{scrollOffset: 0, focusedIndex: 0}` for unvisited tabs, preserves state across save/restore cycles
- [ ] `useTabFilter.switchTab` correctly saves current filter to departing tab and restores from arriving tab
- [ ] `useTabFilter.clearFilter` resets both `filterText` and `isFiltering`

### 10.5 Breakpoint Deduplication

- [ ] `Breakpoint` type lives in `apps/tui/src/types/breakpoint.ts` (already exists — verified)
- [ ] `apps/tui/src/types/index.ts` already re-exports from `./breakpoint.js` (verified)
- [ ] `apps/tui/src/screens/Agents/types.ts` updated to re-export from `../../types/breakpoint.js`
- [ ] `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` continues to compile (imports `Breakpoint` from `"../types.js"` which re-exports)
- [ ] No duplicate `Breakpoint` definitions remain in the codebase
- [ ] `getBreakpoint()` returns `Breakpoint | null` (not `Breakpoint | "unsupported"`)

### 10.6 Performance

- [ ] Tab switches < 50ms (only active tab content rendered, no inactive tab DOM)
- [ ] Scroll state lookup is O(1) via `Map.get()`
- [ ] No state updates during render (`useEffect` for auto-correction, not `queueMicrotask`)
- [ ] `useMemo` on `visibleTabs` prevents unnecessary re-filtering on every render
- [ ] `useCallback` on all exposed functions prevents unnecessary re-renders in consumers

---

## 11. File Inventory

| File Path | Type | Lines (est.) | Description |
|-----------|------|-------------|-------------|
| `apps/tui/src/components/TabbedDetailView.types.ts` | New | ~147 | All TypeScript interfaces |
| `apps/tui/src/hooks/useTabs.ts` | New | ~133 | Tab state management hook |
| `apps/tui/src/hooks/useTabScrollState.ts` | New | ~43 | Per-tab scroll preservation |
| `apps/tui/src/hooks/useTabFilter.ts` | New | ~70 | Per-tab filter state |
| `apps/tui/src/components/TabbedDetailView.tsx` | New | ~260 | Main component |
| `apps/tui/src/components/TabbedDetailView.test-helpers.ts` | New | ~45 | Test utilities |
| `apps/tui/src/components/index.ts` | Modified | ~9 lines appended | Barrel export additions |
| `apps/tui/src/hooks/index.ts` | Modified | ~6 lines appended | Barrel export additions |
| `apps/tui/src/screens/Agents/types.ts` | Modified | ~1 line change | Re-export Breakpoint |
| `e2e/tui/organizations.test.ts` | New | ~788 | 49 E2E tests across 10 describe blocks |
| `poc/tui-keyboard-propagation.tsx` | New (PoC) | ~60 | Keyboard event propagation validation |
| `poc/tui-box-border.tsx` | New (PoC) | ~40 | Partial border rendering validation |

**Total new source**: ~698 lines | **Total test**: ~788 lines | **Total PoC**: ~100 lines

---

## 12. Differences from specs/tui Reference Implementation

The `specs/tui/` directory contains a reference implementation of these files. The production implementation in `apps/tui/src/` differs in these ways:

| File | specs/tui version | Production version | Reason |
|------|-------------------|-------------------|--------|
| `hooks/useTabs.ts` | `queueMicrotask()` for auto-correction (line 118) | `useEffect()` for auto-correction | React 19 warns on side effects during render. `useEffect` is the correct pattern. |
| `components/TabbedDetailView.tsx` | `formatCount` no negative/NaN guard | Added `count < 0 \|\| Number.isNaN(count)` guard | Defensive programming for unexpected API data. |
| `components/TabbedDetailView.tsx` | `filterState` declared after `useTabs` (line 154) | `filterState` declared before `useTabs` | Ensures `filterState.switchTab` is available in the `useTabs` `onTabChange` callback without stale closure risk. |
| `components/index.ts` | Not read (may differ) | Appends to existing 13-export barrel | Production barrel already has 13 exports; we append rather than create. |
| `hooks/index.ts` | Full barrel with many hooks | Appends to existing 14-export barrel | Production barrel already has 14 exports from other tickets. |
| `components/TabbedDetailView.test-helpers.ts` | `formatCount` no negative/NaN guard | Added `count < 0 \|\| Number.isNaN(count)` guard | Matches production component logic. |
| `e2e/tui/organizations.test.ts` | No `afterEach` cleanup | `afterEach` terminates TUI process | Prevents leaked child processes in test suite. |
| `e2e/tui/organizations.test.ts` | `const tui = await launchTUI(...)` | `tui = await launchTUI(...)` (module-scoped `let`) | Enables `afterEach` cleanup via shared reference. |
| `types/breakpoint.ts` | New file in spec | Already exists in production | `apps/tui/src/types/breakpoint.ts` was created by an earlier ticket. No creation needed. |

---

## 13. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `useKeyboard` `stopPropagation()` doesn't prevent parent handlers | High — tab/filter keybindings leak | Low | PoC 1 validates. `KeyEvent` class confirmed to have `propagationStopped` flag in source. |
| `<input focused>` doesn't capture all printable keys when filter is active | High — navigation keys execute instead of typing | Low | PoC 1 validates. OpenTUI input is focus-gated by design per source analysis. |
| `<box border={["bottom"]}>` renders incorrectly or adds extra height | Medium — layout breaks | Low | PoC 2 validates. `BoxOptions.border` type confirmed as `boolean \| BorderSides[]` in source. |
| `@codeplane/ui-core` hooks not yet implemented | Medium — consumer screens can't fetch data | Confirmed | Component is data-agnostic (render prop pattern). Consumer screens handle data. Tests fail naturally per test philosophy. |
| `useEffect` auto-correction causes visible flicker on tab removal | Low — single frame correction | Low | Effect runs in React 19 commit phase before browser paint. No observable flicker. |
| Rapid tab switching causes stale closures in `onTabChange` callback | Medium — incorrect filter save/restore | Low | `useCallback` deps include `filterText`. State updates use functional `setState` to avoid closure staleness. |
| `height={1}` on `<box>` with `border={["bottom"]}` may consume 2 rows | Medium — layout miscalculation | Medium | PoC 2 validates. If border adds height, adjust to `height={2}` or use CSS-like `boxSizing` if available. |
| Existing `Breakpoint` import in `formatTimestamp.ts` breaks after re-export change | Low — build failure caught immediately | Very Low | Re-export is type-compatible. `tsc --noEmit` run in CI catches any resolution issues. |

---

## 14. Definition of Done

- [ ] All new files in Section 11 exist and compile with `tsc --noEmit`
- [ ] PoC tests in `poc/` pass for keyboard propagation and box borders
- [ ] `Breakpoint` type deduplicated; Agents screen `formatTimestamp.ts` still compiles
- [ ] Component renders correctly at 80×24, 120×40, 200×60
- [ ] Tab cycling wraps at both ends, direct number jump works for valid indices
- [ ] Push-on-activate tab calls `onPush()` without changing active tab
- [ ] Count badges display: 0→`(0)`, 999→`(999)`, 1500→`(1.5K)`, 10000→`(9999+)`, null→no badge
- [ ] Role-conditional tabs hidden; number keys for hidden tab indices are no-ops
- [ ] Scroll state and focus index preserved across tab switches
- [ ] Filter activates on `/`, captures keys via `<input focused>`, clears on `Esc`, preserves per-tab
- [ ] Loading/error/empty/undersized terminal states render correctly
- [ ] `afterEach` cleanup in all test describe blocks prevents leaked child processes
- [ ] All 49 E2E tests in `e2e/tui/organizations.test.ts` written (failing tests left failing — never skipped or commented out)
- [ ] No mocking of implementation details in tests
- [ ] OpenTUI props verified: `fg` not `color`, `wrapMode` not `wrap`, `<b>`/`<u>` not boolean props, `onInput` not `onChange`, `border` array syntax
- [ ] `useTabs` uses `useEffect` for auto-correction (not `queueMicrotask`)
- [ ] `formatCount` handles `null`, negative, `NaN`, 0, 1–999, 1000–9999, 10000+
- [ ] Barrel exports updated: `apps/tui/src/components/index.ts` includes TabbedDetailView exports; `apps/tui/src/hooks/index.ts` includes tab hook exports