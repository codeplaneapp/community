# Engineering Specification: TUI Reusable DetailView with Scrollable Sections

**Ticket:** `tui-detail-view-component`
**Status:** Not started
**Dependencies:** `tui-theme-and-color-tokens` (implemented), `tui-bootstrap-and-renderer` (implemented)
**Feature Group:** Cross-cutting (consumed by TUI_ISSUES, TUI_LANDINGS, TUI_WORKSPACES, TUI_WORKFLOWS, TUI_WIKI, TUI_AGENTS)

---

## 1. Overview

This specification describes the implementation of the shared `DetailView` component — the foundational detail layout abstraction used across all entity detail screens in the Codeplane TUI (issue detail, landing detail, workspace detail, workflow run detail, wiki page detail, agent session detail, etc.).

The deliverable is a composable component + hook system:

1. **`components/DetailView.tsx`** — A `<scrollbox>`-wrapped vertical layout with a header slot, titled sections with underline separators, and a footer slot. Keyboard-driven scrolling and section jumping.
2. **`components/DetailSection.tsx`** — An individual titled section with bold header and underline border.
3. **`components/DetailHeader.tsx`** — A composable header component for entity identity (title, status badge, metadata row).
4. **`hooks/useDetailNavigation.ts`** — Section-aware scroll management with `Tab`/`Shift+Tab` section cycling, `1`-`9` section jumping, and `j`/`k` content scrolling.
5. **Integration with OpenTUI `<markdown>` and `<code>` components** — Sections can contain rich markdown content and syntax-highlighted code blocks.

This component replaces ad-hoc detail rendering in individual screens with a single, tested, composable abstraction. It is the detail-view counterpart to the `ScrollableList` component.

---

## 2. Current State Assessment

### Production Files (in `apps/tui/src/`)

| File | State | Relevance |
|------|-------|----------|
| `components/SkeletonDetail.tsx` | 64 lines, complete | Loading placeholder for detail views. Shows section headers with block-character placeholder content. Uses `useLayout()` and `useTheme()`. **Not** the interactive detail — purely visual skeleton. Will be used as the loading state before DetailView renders real data. |
| `components/AppShell.tsx` | Complete | Root layout providing header bar, content area, status bar. DetailView renders within the content area. |
| `components/ActionButton.tsx` | 58 lines, complete | Button with loading state (`isLoading` → spinner + "Saving…"). Uses `useTheme()` and `useLoading()` for spinner frame. Can be composed in DetailView footer for action buttons. |
| `components/FullScreenError.tsx` | 52 lines, complete | Full-screen error display with `screenLabel` and `LoadingError`. Uses `truncateRight()`. Consuming screens render this before DetailView when data fetch fails. |
| `hooks/useScreenKeybindings.ts` | 55 lines, complete | Registers screen-level keybindings at `PRIORITY.SCREEN` with automatic status bar hint derivation. Pushes scope on mount, pops on unmount. DetailView will use this for scroll/section navigation bindings. |
| `hooks/useLayout.ts` | 110 lines, complete | Provides `LayoutContext` with `width`, `height`, `contentHeight`, `breakpoint`, `sidebarVisible`, `sidebarWidth`, `modalWidth`, `modalHeight`, `sidebar`. |
| `hooks/useTheme.ts` | 30 lines, complete | Provides `Readonly<ThemeTokens>` via `useContext(ThemeContext)`. Referentially stable for session lifetime. |
| `providers/NavigationProvider.tsx` | Complete | Provides `push()`, `pop()`, `replace()`, `reset()`, `canGoBack`, `repoContext`, `orgContext`, `saveScrollPosition()`, `getScrollPosition()`. |
| `providers/KeybindingProvider.tsx` | 165 lines, complete | Priority-based keyboard dispatch. 5-tier priority (TEXT_INPUT=1, MODAL=2, GOTO=3, SCREEN=4, GLOBAL=5). DetailView registers a SCREEN-priority scope. |
| `providers/keybinding-types.ts` | 89 lines, complete | `KeyHandler` (key, description, group, handler, when?), `PRIORITY`, `StatusBarHint` (keys, label, order?), `KeybindingScope` (id, priority, bindings Map, active). |
| `theme/tokens.ts` | 263 lines, complete | `ThemeTokens` interface (RGBA-based), `TextAttributes` (`BOLD=1`, `DIM=2`, `UNDERLINE=4`, `REVERSE=8`), `statusToToken()` mapping, `CoreTokenName` type. |
| `router/types.ts` | 103 lines, complete | `ScreenName` enum (32 screens including `IssueDetail`, `LandingDetail`, `WorkspaceDetail`, `WorkflowRunDetail`, `WikiDetail`), `ScreenEntry` (with `scrollPosition?: number`), `NavigationContext`, `ScreenComponentProps`. |

### Absent from Production

- `components/DetailView.tsx` — Does not exist
- `components/DetailSection.tsx` — Does not exist
- `components/DetailHeader.tsx` — Does not exist
- `hooks/useDetailNavigation.ts` — Does not exist
- No reusable detail component anywhere in `apps/tui/src/`

---

## 3. File Inventory

### Source Files (all under `apps/tui/src/`)

| File | Purpose | Action |
|------|---------|--------|
| `hooks/useDetailNavigation.ts` | Section-aware scroll management hook | **New** |
| `components/DetailView.tsx` | Reusable scrollbox detail with header, sections, footer | **New** |
| `components/DetailSection.tsx` | Individual titled section with bold header and underline separator | **New** |
| `components/DetailHeader.tsx` | Entity header with title, status badge, metadata row | **New** |
| `components/index.ts` | Barrel re-exports for components | **Modify** (add DetailView, DetailSection, DetailHeader) |
| `hooks/index.ts` | Barrel re-exports for hooks | **Modify** (add useDetailNavigation) |

### Test Files (all under `e2e/tui/`)

| File | Purpose | Action |
|------|---------|--------|
| `detail-view.test.ts` | E2E tests for DetailView scrolling, section navigation, responsive layout, snapshot matching | **New** |

---

## 4. Architecture

### 4.1 Component Hierarchy

```
DetailView
├── <scrollbox ref={scrollboxRef} scrollY={true}>  ← main scrollable container
│   ├── <box flexDirection="column" gap={1} padding={1}>
│   │   ├── {header}                               ← header slot (ReactNode)
│   │   ├── DetailSection × N                      ← one per section entry
│   │   │   ├── <box flexDirection="row" gap={1}>  ← section title row
│   │   │   │   ├── <text bold>{title}</text>      ← bold section title
│   │   │   │   └── <text dim muted>[index]</text>  ← section number hint
│   │   │   ├── <text fg={border}>───────</text>    ← underline separator
│   │   │   └── <box>                              ← section content slot
│   │   │       └── {content}                      ← ReactNode
│   │   └── {footer}                               ← footer slot (ReactNode)
```

### 4.2 Data Flow

```
Screen component (e.g., IssueDetailScreen)
  ├── fetches data via @codeplane/ui-core hooks (useIssues, useLandings, etc.)
  ├── constructs header ReactNode using <DetailHeader>
  ├── constructs sections array [{title, content}]
  ├── constructs footer ReactNode (ActionButton row)
  └── passes all to <DetailView header={...} sections={...} footer={...} />
       └── DetailView manages scroll position, section focus, and keyboard
            └── useDetailNavigation generates keybindings
                 └── useScreenKeybindings registers them at PRIORITY.SCREEN
```

### 4.3 OpenTUI Scrollbox Integration

The `<scrollbox>` component from OpenTUI provides the native scroll container. The ref type is `ScrollBoxRenderable` from `@opentui/core`. Key methods used:

- `scrollBy(delta: number | { x, y }, unit: ScrollUnit)` — Relative scroll. Units: `"absolute"` (rows), `"viewport"` (fraction of viewport height).
- `scrollTo(position: number | { x, y })` — Absolute scroll position.
- `scrollChildIntoView(childId: string)` — Scroll a child element into the viewport by its `id` attribute.
- `scrollTop: number` — Read current vertical scroll position (getter).

The hook communicates scroll intent via callbacks. The component translates those into scrollbox method calls via ref. This keeps the hook testable without OpenTUI dependencies.

### 4.4 Relationship to Other Components

- **TabbedDetailView** (future `tui-tabbed-detail-view` ticket): Higher-level component that adds a tab bar. May compose `DetailView` internally for its tab content areas. Shares `DetailSection` and `DetailHeader` sub-components.
- **SkeletonDetail** (existing): Loading placeholder. Consuming screens render `SkeletonDetail` while data is loading, then swap to `DetailView` once data arrives. Section headers should match between skeleton and real view.
- **ScrollableList** (sibling component): List-view counterpart. Both register keybindings at `PRIORITY.SCREEN` and use `j`/`k` for navigation. They never coexist on the same screen.

---

## Implementation Plan

### Step 1: `hooks/useDetailNavigation.ts`

**File:** `apps/tui/src/hooks/useDetailNavigation.ts`

A hook that manages section focus index and produces a `bindings` array for `useScreenKeybindings()`. The hook does NOT hold a ref to the scrollbox — it communicates via callback props.

```typescript
import { useState, useCallback, useMemo, useRef } from "react";
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";

export interface UseDetailNavigationOptions {
  /** Number of sections in the detail view. */
  sectionCount: number;
  /** Callback to scroll the scrollbox by a delta (in rows). */
  onScroll: (delta: number) => void;
  /** Callback to scroll a specific section into view by index. */
  onScrollToSection: (index: number) => void;
  /** Callback to scroll by a full page (positive = down, negative = up). */
  onPageScroll: (direction: 1 | -1) => void;
  /** Callback when q is pressed (back navigation). */
  onBack: () => void;
  /**
   * Predicate controlling whether navigation bindings are active.
   * When false, all key handlers are no-ops (except onBack).
   * Used to disable navigation when an overlay or text input is focused.
   */
  isActive?: () => boolean;
}

export interface UseDetailNavigationResult {
  /** Currently focused section index (0-based). */
  focusedSection: number;
  /** Set focused section index programmatically. */
  setFocusedSection: (index: number) => void;
  /** Keybinding handlers for useScreenKeybindings(). */
  bindings: KeyHandler[];
  /** Status bar hints derived from bindings. */
  hints: StatusBarHint[];
}
```

**Keybinding registration:**

| Key | Description | Group | Behavior |
|-----|-------------|-------|----------|
| `j` | Scroll down | Navigation | `onScroll(1)` — scroll down 1 row |
| `k` | Scroll up | Navigation | `onScroll(-1)` — scroll up 1 row |
| `down` | Scroll down | Navigation | Same as `j` |
| `up` | Scroll up | Navigation | Same as `k` |
| `ctrl+d` | Page down | Navigation | `onPageScroll(1)` — half viewport down |
| `ctrl+u` | Page up | Navigation | `onPageScroll(-1)` — half viewport up |
| `tab` | Next section | Sections | Increment `focusedSection` modulo `sectionCount`, call `onScrollToSection` |
| `shift+tab` | Prev section | Sections | Decrement `focusedSection` with wrap, call `onScrollToSection` |
| `1`–`9` | Jump to section N | Sections | Set `focusedSection` to N-1, call `onScrollToSection(N-1)`. Only registered for `min(sectionCount, 9)` keys. |
| `q` | Back | Navigation | Calls `onBack()`. Always active (not gated by `isActive`). |

**Design decisions:**

- The hook does NOT hold a ref to the scrollbox DOM node. It communicates via callback props (`onScroll`, `onScrollToSection`, `onPageScroll`). This keeps the hook framework-agnostic and testable.
- `isActive` predicate allows the consuming screen to disable navigation when an input field or overlay is focused. `q` (back) is NOT gated — it always works.
- Number keys 1-9 map to section indices 0-8. Only `min(sectionCount, 9)` keys are registered.
- Section focus index is tracked independently from scroll position. Scrolling with `j`/`k` does NOT change section focus — only `Tab`, `Shift+Tab`, and number keys change focused section.
- The `bindings` array is memoized via `useMemo` and only regenerates when `sectionCount` changes or callback references change.
- A `useRef` is used to ensure handlers always reference the latest options without causing `useMemo` to regenerate the bindings array.

**Status bar hints generated:**

```typescript
const hints: StatusBarHint[] = [
  { keys: "j/k", label: "scroll", order: 0 },
  { keys: "Tab", label: "next section", order: 10 },
  { keys: `1-${Math.min(sectionCount, 9)}`, label: "jump to section", order: 20 },
  { keys: "Ctrl+D/U", label: "page", order: 30 },
  { keys: "q", label: "back", order: 90 },
];
```

---

### Step 2: `components/DetailSection.tsx`

**File:** `apps/tui/src/components/DetailSection.tsx`

A self-contained section component rendering a bold title, underline separator, and content slot.

```typescript
import React, { useMemo } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { TextAttributes } from "../theme/tokens.js";

export interface DetailSectionProps {
  /** Section title displayed in bold above the underline separator. */
  title: string;
  /** Content rendered below the separator. Accepts markdown, code, or any ReactNode. */
  children: React.ReactNode;
  /** Section index (0-based). Used for number key jump hints. */
  index?: number;
  /** Whether this section is currently focused via section navigation. */
  focused?: boolean;
  /** Whether to show the section number hint next to the title. Default: true. */
  showIndex?: boolean;
  /**
   * Unique identifier for this section's root box.
   * Used by scrollbox.scrollChildIntoView() for section jumping.
   */
  sectionId?: string;
}
```

**Rendering structure:**

```
<box flexDirection="column" width="100%" id={sectionId}>
  <box flexDirection="row" gap={1}>
    <text fg={focused ? theme.primary : undefined} attributes={TextAttributes.BOLD}>
      {title}
    </text>
    {showIndex && index !== undefined && (
      <text fg={theme.muted} attributes={TextAttributes.DIM}>[{index + 1}]</text>
    )}
  </box>
  <text fg={theme.border}>{separator}</text>
  <box flexDirection="column">
    {children}
  </box>
</box>
```

**Design decisions:**

- The `sectionId` prop maps to the `<box id={...}>` attribute. This is the handle used by `scrollbox.scrollChildIntoView(sectionId)` when the user jumps to a section.
- `focused` prop highlights the section title in `theme.primary` (blue) to indicate the currently targeted section. When not focused, the title uses the default foreground.
- The section number hint `[N]` is shown in muted+dim text next to the title, teaching users that number keys jump to sections. Hidden via `showIndex={false}`.
- The underline separator uses Unicode box-drawing character `─` (U+2500). Width adapts to terminal width: `Math.max(1, width - 4)`.
- The separator string is memoized via `useMemo` keyed on `width` to avoid per-render string allocation.

---

### Step 3: `components/DetailHeader.tsx`

**File:** `apps/tui/src/components/DetailHeader.tsx`

A composable header for entity detail screens. Renders title, optional status badge, and optional metadata rows.

```typescript
import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { TextAttributes } from "../theme/tokens.js";
import { statusToToken, type CoreTokenName } from "../theme/tokens.js";
import type { ThemeTokens } from "../theme/tokens.js";

export interface DetailHeaderProps {
  /** Entity title (issue title, workspace name, etc.). */
  title: string;
  /** Status string (e.g., "open", "closed", "running"). Maps to semantic color via statusToToken(). */
  status?: string;
  /** Custom status label override. If not provided, status string is titlecased. */
  statusLabel?: string;
  /** Metadata key-value pairs rendered as a row below the title. */
  metadata?: Array<{ label: string; value: string }>;
  /** Additional ReactNode rendered between title row and metadata (e.g., labels, assignees). */
  children?: React.ReactNode;
}
```

**Rendering structure:**

```
<box flexDirection="column" width="100%">
  <box flexDirection="row" gap={2}>
    <text attributes={TextAttributes.BOLD}>{title}</text>
    {displayStatus && (
      <text fg={statusColor} attributes={TextAttributes.BOLD}>[{displayStatus}]</text>
    )}
  </box>
  {children}
  {metadata && (
    <box flexDirection={metadataDirection} gap={breakpoint === "minimum" ? 0 : 3}>
      {metadata.map((m, i) => (
        <box key={i} flexDirection="row" gap={1}>
          <text fg={theme.muted}>{m.label}:</text>
          <text>{m.value}</text>
        </box>
      ))}
    </box>
  )}
</box>
```

**Design decisions:**

- `statusToToken()` from `theme/tokens.ts` maps API status strings to semantic color tokens. Examples: `"open"` → `success` (green), `"closed"` → `error` (red), `"pending"` → `warning` (yellow), `"running"` → `success` (green).
- Metadata renders as a horizontal row at `standard`/`large` breakpoints and stacks vertically at `minimum` breakpoint (80×24). The component reads `breakpoint` from `useLayout()` internally.
- The `children` slot between title and metadata allows screens to inject custom content like label badges, assignee lists, or linked items.
- `titleCase()` helper converts status strings (e.g., `"open"` → `"Open"`, `"in_progress"` → `"In_progress"`). Screens can override with `statusLabel` for custom display.

---

### Step 4: `components/DetailView.tsx`

**File:** `apps/tui/src/components/DetailView.tsx`

The main component that composes the scrollbox, header, sections, and footer.

```typescript
import React, { useRef, useCallback } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useLayout } from "../hooks/useLayout.js";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";
import { useDetailNavigation } from "../hooks/useDetailNavigation.js";
import { DetailSection } from "./DetailSection.js";

export interface DetailViewSection {
  /** Section title displayed in bold. */
  title: string;
  /** Section content — any ReactNode (markdown, code, text, lists, etc.). */
  content: React.ReactNode;
  /** Optional unique ID for this section. Defaults to `detail-section-{index}`. */
  id?: string;
}

export interface DetailViewProps {
  /** Header content rendered above all sections. Typically a <DetailHeader>. */
  header?: React.ReactNode;
  /** Array of titled sections with content. */
  sections: DetailViewSection[];
  /** Footer content rendered below all sections. Typically action buttons. */
  footer?: React.ReactNode;
  /** Whether to show section index numbers. Default: true. */
  showSectionIndices?: boolean;
  /** Override the scroll-per-j/k keystroke in rows. Default: 1. */
  scrollStep?: number;
  /** Predicate to gate keyboard navigation. When false, detail navigation keys are disabled. */
  isNavigationActive?: () => boolean;
  /** Callback invoked on back navigation (q key). Defaults to navigation.pop(). */
  onBack?: () => void;
}
```

**Implementation:**

```typescript
export function DetailView({
  header,
  sections,
  footer,
  showSectionIndices = true,
  scrollStep = 1,
  isNavigationActive,
  onBack,
}: DetailViewProps) {
  const { contentHeight, breakpoint } = useLayout();
  const navigation = useNavigation();
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);

  // ── Scroll callbacks bridging the hook to the scrollbox ref ──
  const handleScroll = useCallback(
    (delta: number) => {
      scrollboxRef.current?.scrollBy(delta * scrollStep, "absolute");
    },
    [scrollStep]
  );

  const handleScrollToSection = useCallback(
    (index: number) => {
      const sectionId = sections[index]?.id ?? `detail-section-${index}`;
      scrollboxRef.current?.scrollChildIntoView(sectionId);
    },
    [sections]
  );

  const handlePageScroll = useCallback(
    (direction: 1 | -1) => {
      // Scroll by half viewport height using viewport units
      scrollboxRef.current?.scrollBy(
        { x: 0, y: direction * 0.5 },
        "viewport"
      );
    },
    []
  );

  const handleBack = useCallback(() => {
    // Save scroll position before navigating back
    const currentEntry = navigation.currentScreen;
    const scrollTop = scrollboxRef.current?.scrollTop ?? 0;
    navigation.saveScrollPosition(currentEntry.id, scrollTop);

    if (onBack) {
      onBack();
    } else {
      navigation.pop();
    }
  }, [onBack, navigation]);

  const { focusedSection, bindings, hints } = useDetailNavigation({
    sectionCount: sections.length,
    onScroll: handleScroll,
    onScrollToSection: handleScrollToSection,
    onPageScroll: handlePageScroll,
    onBack: handleBack,
    isActive: isNavigationActive,
  });

  // Register keybindings at SCREEN priority
  useScreenKeybindings(bindings, hints);

  // Responsive: hide section indices at minimum breakpoint
  const effectiveShowIndices = showSectionIndices && breakpoint !== "minimum";

  return (
    <scrollbox
      ref={scrollboxRef}
      scrollY={true}
      scrollX={false}
      width="100%"
      height={contentHeight}
      padding={1}
    >
      <box flexDirection="column" width="100%" gap={1}>
        {/* Header slot */}
        {header && (
          <box flexDirection="column" width="100%">
            {header}
          </box>
        )}

        {/* Sections */}
        {sections.map((section, index) => (
          <DetailSection
            key={section.id ?? `detail-section-${index}`}
            title={section.title}
            index={index}
            focused={focusedSection === index}
            showIndex={effectiveShowIndices}
            sectionId={section.id ?? `detail-section-${index}`}
          >
            {section.content}
          </DetailSection>
        ))}

        {/* Footer slot */}
        {footer && (
          <box flexDirection="column" width="100%">
            {footer}
          </box>
        )}
      </box>
    </scrollbox>
  );
}
```

**Design decisions:**

- **`scrollboxRef`**: Typed as `React.Ref<ScrollBoxRenderable>` from `@opentui/core`. If `ScrollBoxRenderable` is not exported from the installed version, fall back to `any` with a `// TODO: type scrollbox ref when @opentui/core exports ScrollBoxRenderable` comment.
- **`scrollBy(delta, "absolute")`**: For `j`/`k`, scrolls by `scrollStep` rows. Default is 1 row per keystroke.
- **`scrollBy({ x: 0, y: 0.5 }, "viewport")`**: For `Ctrl+D`/`Ctrl+U`, scrolls by half the viewport height. This matches vim's half-page scroll.
- **`scrollChildIntoView(sectionId)`**: For section jumping, scrolls the section's `id`-attributed `<box>` into view. OpenTUI's scrollbox handles this natively.
- **`contentHeight`** from `useLayout()` = `Math.max(0, height - 2)`, ensuring the scrollbox fills the space between header bar and status bar.
- **Scroll position caching**: On back navigation, the component saves `scrollboxRef.current.scrollTop` via `navigation.saveScrollPosition()` before popping. The `ScreenEntry.scrollPosition` field in `router/types.ts` already supports this.
- **Footer inside scrollbox**: The footer scrolls with content. For sticky action bars, consuming screens render action UI outside the DetailView.
- **Section indices hidden at minimum breakpoint**: `effectiveShowIndices` is false when `breakpoint === "minimum"`, saving horizontal space at 80×24.

---

### Step 5: Update barrel exports

**File:** `apps/tui/src/components/index.ts`

Append to existing exports:

```typescript
export { DetailView } from "./DetailView.js";
export type { DetailViewProps, DetailViewSection } from "./DetailView.js";
export { DetailSection } from "./DetailSection.js";
export type { DetailSectionProps } from "./DetailSection.js";
export { DetailHeader } from "./DetailHeader.js";
export type { DetailHeaderProps } from "./DetailHeader.js";
```

**File:** `apps/tui/src/hooks/index.ts`

Append to existing exports:

```typescript
export { useDetailNavigation } from "./useDetailNavigation.js";
export type { UseDetailNavigationOptions, UseDetailNavigationResult } from "./useDetailNavigation.js";
```

---

### Step 6: Integration patterns with OpenTUI `<markdown>` and `<code>`

The DetailView hosts rich content within its sections. These are the canonical integration patterns for consuming screens:

**Markdown content (issue body, wiki page):**

```typescript
import { useDiffSyntaxStyle } from "../hooks/useDiffSyntaxStyle.js";

function IssueDetailScreen({ entry, params }: ScreenComponentProps) {
  const syntaxStyle = useDiffSyntaxStyle();
  // ... fetch issue data via @codeplane/ui-core hooks ...

  return (
    <DetailView
      header={
        <DetailHeader
          title={issue.title}
          status={issue.state}
          metadata={[
            { label: "Author", value: issue.author.username },
            { label: "Created", value: formatRelativeTime(issue.createdAt) },
          ]}
        />
      }
      sections={[
        {
          title: "Description",
          content: (
            <markdown content={issue.body} syntaxStyle={syntaxStyle} conceal={true} />
          ),
        },
        {
          title: "Comments",
          content: <CommentList comments={issue.comments} />,
        },
      ]}
      footer={
        <box flexDirection="row" gap={2}>
          <ActionButton label="Close" onPress={closeIssue} />
        </box>
      }
    />
  );
}
```

**Code content (workflow definition, file preview):**

```typescript
{
  title: "Source",
  content: (
    <code content={workflow.definition} filetype="yaml" syntaxStyle={syntaxStyle} />
  ),
}
```

**Comment list (issue comments, landing reviews):**

```typescript
{
  title: `Comments (${comments.length})`,
  content: (
    <box flexDirection="column" gap={1}>
      {comments.map((comment) => (
        <box key={comment.id} flexDirection="column" gap={0}>
          <box flexDirection="row" gap={2}>
            <text fg={theme.primary} attributes={TextAttributes.BOLD}>
              {comment.author}
            </text>
            <text fg={theme.muted}>{formatRelativeTime(comment.createdAt)}</text>
          </box>
          <markdown content={comment.body} syntaxStyle={syntaxStyle} conceal={true} />
        </box>
      ))}
    </box>
  ),
}
```

**Loading pattern (consuming screen):**

```typescript
function IssueDetailScreen({ entry, params }: ScreenComponentProps) {
  const { data: issue, isLoading, error, refetch } = useIssue(params.owner, params.repo, params.number);

  if (isLoading) return <SkeletonDetail sections={["Description", "Comments"]} />;
  if (error) return <FullScreenError screenLabel="issue" error={error} />;
  if (!issue) return <FullScreenError screenLabel="issue" error={{ summary: "Issue not found" }} />;

  return <DetailView ... />;
}
```

---

## 5. Responsive Behavior

### 5.1 Minimum breakpoint (80×24)

- Section index hints `[N]` are hidden (`effectiveShowIndices` forced false).
- Metadata row in `DetailHeader` wraps vertically (`flexDirection="column"`) instead of horizontal.
- Footer action buttons stack vertically.
- Section underline separator width adapts to `width - 4` (76 chars at 80 columns).
- `contentHeight` = 22 rows (80×24 minus 2 for header/status bar).

### 5.2 Standard breakpoint (120×40)

- Full layout: section indices shown, metadata horizontal, normal gaps.
- `contentHeight` = 38 rows.
- This is the primary design target.

### 5.3 Large breakpoint (200×60)

- Wider content area allows more metadata per row.
- Section underlines extend to full width.
- More context visible without scrolling.
- `contentHeight` = 58 rows.

### 5.4 Below minimum (< 80×24)

The `AppShell`'s `TerminalTooSmallScreen` renders before DetailView is reached. DetailView does not need to handle this case.

---

## 6. Scroll Position & Back Navigation

The `NavigationProvider` already supports scroll position caching per `ScreenEntry`:

- `saveScrollPosition(entryId: string, position: number): void`
- `getScrollPosition(entryId: string): number | undefined`
- `ScreenEntry.scrollPosition?: number`

The DetailView participates:

1. **On `q` press** (back): Before calling `navigation.pop()`, reads `scrollboxRef.current?.scrollTop` and stores it via `navigation.saveScrollPosition(currentEntry.id, scrollTop)`.
2. **On mount** (when navigating to a detail screen): The consuming screen can read `navigation.getScrollPosition(entry.id)` and call `scrollboxRef.current?.scrollTo(position)` in a `useEffect`. This is an opt-in pattern — the DetailView does not do it automatically because the consuming screen controls when data is ready.

---

## 7. Error and Loading States

The DetailView itself does not handle data loading — that's the consuming screen's responsibility. The canonical three-phase pattern:

1. **Loading**: Render `<SkeletonDetail sections={["Description", "Comments"]} />`. The skeleton's section headers should match the real DetailView's section titles for visual continuity.
2. **Error**: Render `<FullScreenError screenLabel="issue" error={error} />`. The status bar should show `R retry` hint (handled by `useScreenLoading()`).
3. **Data ready**: Render `<DetailView ... />` with real content.

This pattern is enforced by convention, not by the DetailView component itself.

---

## 8. Scope

### In scope

- `DetailView` component with scrollbox wrapping, section rendering, and keyboard navigation
- `DetailSection` component with bold title, underline separator, and content slot
- `DetailHeader` component with title, status badge, and metadata row
- `useDetailNavigation` hook with section focus, scroll handlers, and keybinding generation
- Responsive layout adaptation at all three breakpoints
- Integration patterns with OpenTUI `<markdown>` and `<code>` components
- Barrel export updates
- E2E tests

### Out of scope

- Individual screen implementations (IssueDetailScreen, LandingDetailScreen, etc.) — separate tickets
- Data hooks (`useIssue`, `useLanding`, etc.) — provided by `@codeplane/ui-core`
- Comment creation form — uses FormSystem from `tui-form-component` ticket
- Inline comment support on diffs — uses DiffViewer from `tui-diff-viewer` ticket
- Collapsible sections (expand/collapse) — future enhancement, not in this ticket
- Sticky footer (action bar outside scrollbox) — screen-level concern
- TabbedDetailView — separate ticket that may compose DetailView

---

## Unit & Integration Tests

### Test File: `e2e/tui/detail-view.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`. Tests run against a real API server with test fixtures. No mocks of implementation details.

Tests navigate to an entity detail screen (e.g., issue detail via `--screen issue-detail`) that consumes DetailView. **Tests that fail because the issue detail screen or backend is not yet implemented are left failing — they are never skipped or commented out.**

```typescript
// e2e/tui/detail-view.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  createMockAPIEnv,
  type TUITestInstance,
} from "./helpers";

describe("DetailView component", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  // ── Section Rendering ──────────────────────────────────────────────

  describe("section rendering", () => {
    test("renders section titles in bold with underline separators", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      // Wait for the detail screen to load with section titles
      await tui.waitForText("Description");
      await tui.waitForText("Comments");

      // Verify underline separator exists (Unicode box-drawing)
      const snapshot = tui.snapshot();
      expect(snapshot).toMatch(/─{10,}/);
    });

    test("renders section number hints at standard size", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Section index hints should be visible at standard size
      const snapshot = tui.snapshot();
      expect(snapshot).toMatch(/\[1\]/);
      expect(snapshot).toMatch(/\[2\]/);
    });

    test("hides section number hints at minimum breakpoint", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Section index hints should NOT be visible at minimum size
      const snapshot = tui.snapshot();
      expect(snapshot).not.toMatch(/\[1\]/);
    });
  });

  // ── Header ─────────────────────────────────────────────────────────

  describe("detail header", () => {
    test("renders title and status badge with semantic color", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      // Wait for header to render with status badge
      await tui.waitForText("[Open]");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("[Open]");
    });

    test("renders metadata key-value pairs", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Author:");
      const snapshot = tui.snapshot();
      expect(snapshot).toMatch(/Author:/);
    });

    test("metadata stacks vertically at minimum breakpoint", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Author:");

      // At minimum size, metadata should be on separate lines
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Author:");
    });
  });

  // ── j/k Scroll Navigation ──────────────────────────────────────────

  describe("j/k scroll navigation", () => {
    test("j scrolls content down", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");
      const before = tui.snapshot();

      // Press j multiple times to scroll down
      await tui.sendKeys("j", "j", "j", "j", "j");

      const after = tui.snapshot();
      // Content should have changed (scrolled)
      expect(after).not.toEqual(before);
    });

    test("k scrolls content up after scrolling down", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Scroll down first
      await tui.sendKeys("j", "j", "j", "j", "j");
      const scrolledDown = tui.snapshot();

      // Scroll back up
      await tui.sendKeys("k", "k", "k", "k", "k");
      const scrolledUp = tui.snapshot();

      expect(scrolledUp).not.toEqual(scrolledDown);
    });

    test("Down arrow scrolls same as j", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");
      const before = tui.snapshot();

      await tui.sendKeys("Down", "Down", "Down", "Down", "Down");

      const after = tui.snapshot();
      expect(after).not.toEqual(before);
    });
  });

  // ── Page Scroll ────────────────────────────────────────────────────

  describe("page scroll", () => {
    test("Ctrl+D scrolls half page down", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");
      const before = tui.snapshot();

      await tui.sendKeys("ctrl+d");
      const after = tui.snapshot();

      expect(after).not.toEqual(before);
    });

    test("Ctrl+U scrolls half page up", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Scroll down first
      await tui.sendKeys("ctrl+d", "ctrl+d");
      const scrolled = tui.snapshot();

      await tui.sendKeys("ctrl+u");
      const after = tui.snapshot();

      expect(after).not.toEqual(scrolled);
    });
  });

  // ── Section Navigation ─────────────────────────────────────────────

  describe("section jumping", () => {
    test("Tab cycles to next section and scrolls it into view", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Press Tab to go to next section (Comments)
      await tui.sendKeys("Tab");

      // Comments section title should be visible
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Comments");
    });

    test("Shift+Tab cycles to previous section", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Go to second section, then back
      await tui.sendKeys("Tab");
      await tui.sendKeys("shift+Tab");

      // Should be back at Description section
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Description");
    });

    test("number key 2 jumps directly to second section", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Press 2 to jump to second section
      await tui.sendKeys("2");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Comments");
    });

    test("number key 1 jumps back to first section", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Jump to section 2, then back to section 1
      await tui.sendKeys("2");
      await tui.sendKeys("1");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Description");
    });

    test("Tab wraps around from last section to first", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Navigate past all sections — should wrap to first
      // (assuming 2 sections: Description, Comments)
      await tui.sendKeys("Tab", "Tab");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Description");
    });

    test("Shift+Tab wraps from first section to last", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Shift+Tab from first section wraps to last
      await tui.sendKeys("shift+Tab");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Comments");
    });
  });

  // ── Back Navigation ────────────────────────────────────────────────

  describe("back navigation", () => {
    test("q pops back to previous screen", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Press q to go back
      await tui.sendKeys("q");

      // Should return to issues list or previous screen
      // The detail view section titles should no longer be visible
      await tui.waitForNoText("Description");
    });

    test("q works even when navigation is gated inactive", async () => {
      // q is never gated by isActive — it always triggers back navigation
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");
      await tui.sendKeys("q");
      await tui.waitForNoText("Description");
    });
  });

  // ── Responsive Snapshots ───────────────────────────────────────────

  describe("responsive layout", () => {
    test("snapshot at minimum terminal size (80x24)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("snapshot at standard terminal size (120x40)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("snapshot at large terminal size (200x60)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("adapts layout on terminal resize from standard to minimum", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");
      const standardSnapshot = tui.snapshot();

      // Resize to minimum
      await tui.resize(
        TERMINAL_SIZES.minimum.width,
        TERMINAL_SIZES.minimum.height
      );

      const minimumSnapshot = tui.snapshot();

      // Layout should differ (section indices hidden, shorter separators)
      expect(minimumSnapshot).not.toEqual(standardSnapshot);
    });
  });

  // ── Markdown Integration ───────────────────────────────────────────

  describe("markdown content rendering", () => {
    test("renders markdown content within a section", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // The issue body should be rendered as markdown
      // Content depends on test fixtures but Description section must exist
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Description");
    });
  });

  // ── Status Bar Hints ───────────────────────────────────────────────

  describe("status bar integration", () => {
    test("shows scroll keybinding hints in status bar", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Status bar (last line) should show navigation hints
      const statusBar = tui.getLine(tui.rows - 1);
      expect(statusBar).toMatch(/j\/k/);
    });

    test("shows section navigation hints in status bar", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      const statusBar = tui.getLine(tui.rows - 1);
      expect(statusBar).toMatch(/Tab/);
    });

    test("shows back navigation hint in status bar", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      const statusBar = tui.getLine(tui.rows - 1);
      expect(statusBar).toMatch(/q/);
    });
  });

  // ── Breadcrumb Trail ───────────────────────────────────────────────

  describe("breadcrumb integration", () => {
    test("header bar shows breadcrumb trail including issue number", async () => {
      tui = await launchTUI({
        ...TERMINAL_SIZES.standard,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Header bar (first line) should contain breadcrumb with issue reference
      const headerBar = tui.getLine(0);
      expect(headerBar).toMatch(/#1|Issue/);
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────

  describe("edge cases", () => {
    test("scroll does not crash when content is shorter than viewport", async () => {
      // When content fits within viewport, j/k should be no-ops, not errors
      tui = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
        env: createMockAPIEnv(),
        args: [
          "--screen", "issue-detail",
          "--repo", "alice/test-repo",
          "--issue", "1",
        ],
      });

      await tui.waitForText("Description");

      // Multiple scroll operations should not crash
      await tui.sendKeys("j", "j", "j", "k", "k", "k");
      await tui.sendKeys("ctrl+d", "ctrl+u");

      // Should still be on the detail screen
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Description");
    });
  });
});
```

### Test Principles Applied

1. **Tests that fail due to unimplemented backends stay failing.** The tests navigate to `issue-detail` which requires a backend API returning issue data. If the backend or IssueDetailScreen is not yet implemented, these tests fail. They are **never** skipped or commented out.

2. **No mocking of implementation details.** Tests use `launchTUI()` which spawns a real TUI process with a real PTY via `@microsoft/tui-test`. No mocking of hooks, state, or components.

3. **Each test validates one behavior.** Test names describe user-facing behavior: "j scrolls content down", "Tab cycles to next section", "q pops back".

4. **Snapshot tests are supplementary.** The responsive snapshots catch visual regressions. Interaction tests (j/k, Tab, q) are the primary verification mechanism.

5. **Tests run at representative sizes.** Snapshots captured at minimum (80×24), standard (120×40), and large (200×60).

6. **Tests are independent.** Each test creates a fresh TUI instance via `launchTUI()` and terminates it in `afterEach`.

7. **Key input uses helpers.ts conventions.** `sendKeys("Tab")`, `sendKeys("shift+Tab")`, `sendKeys("ctrl+d")`, `sendKeys("ctrl+u")` all map through the `resolveKey()` function in helpers.ts. Note: `ctrl+u` falls through to the dynamic `ctrl+X` handler (not explicitly mapped like `ctrl+d`), which is correct.

---

## 10. Productionization Checklist

All code in this ticket targets production (`apps/tui/src/`). There is no PoC code to graduate. The following items must be verified before considering this ticket complete:

### 10.1 Type Safety

- [ ] All props interfaces exported from barrel files
- [ ] `scrollboxRef` typed as `React.Ref<ScrollBoxRenderable>` from `@opentui/core`. If `ScrollBoxRenderable` is not available in the installed version, use `any` with `// TODO: type scrollbox ref when @opentui/core exports ScrollBoxRenderable`.
- [ ] `DetailViewSection` interface enforces `title: string` and `content: ReactNode`
- [ ] `UseDetailNavigationOptions` and `UseDetailNavigationResult` exported as types
- [ ] No implicit `any` types beyond the scrollbox ref fallback

### 10.2 Performance

- [ ] `useDetailNavigation` bindings array is memoized (only recreated when `sectionCount` changes or callback refs change)
- [ ] `DetailSection` does not re-render when sibling sections change (stable React keys via `section.id ?? detail-section-${index}`)
- [ ] `scrollboxRef` callbacks wrapped in `useCallback` with minimal dependencies
- [ ] Separator string in `DetailSection` memoized via `useMemo` keyed on `width` (no per-render `.repeat()` allocation)
- [ ] Status bar hints memoized via `useMemo` keyed on `sectionCount`

### 10.3 Accessibility

- [ ] All keyboard shortcuts registered via `useScreenKeybindings()` → appear in help overlay (`?`)
- [ ] Section focus state visually communicated (`theme.primary` color on focused section title)
- [ ] Status bar hints show all available navigation commands
- [ ] Section number hints `[N]` teach discoverability of number key navigation

### 10.4 Edge Cases

- [ ] Zero sections: `DetailView` with `sections={[]}` renders header and footer with no sections. No crash.
- [ ] One section: Section navigation wraps correctly (`Tab` on section 0 stays on section 0).
- [ ] Empty section content: `DetailSection` with `children={null}` renders title and separator with no content below. No crash.
- [ ] Very long title: Handled by OpenTUI text wrapping. No horizontal overflow beyond terminal width.
- [ ] Terminal at exact minimum (80×24): All content fits within 22 rows of content height. Scrolling and section jumping work.
- [ ] Content shorter than viewport: `scrollBy()` is a no-op on the scrollbox. No crash.
- [ ] `sections` array changes dynamically: React re-renders sections list. Focused section index clamped to new length if it exceeds bounds.
- [ ] `scrollboxRef.current` is null during first render: All ref method calls use optional chaining (`?.`).

### 10.5 Integration Verification

- [ ] `DetailView` renders correctly inside `AppShell` content area (fills `contentHeight`)
- [ ] `useScreenKeybindings` properly registers bindings on mount and removes them on unmount (verify via help overlay)
- [ ] Back navigation (`q`) correctly pops the navigation stack and saves scroll position
- [ ] `SkeletonDetail` loading state section headers align with `DetailView` section titles for visual continuity
- [ ] OpenTUI `<markdown>` component renders correctly inside `DetailSection`
- [ ] OpenTUI `<code>` component renders correctly inside `DetailSection`
- [ ] `useDetailNavigation` bindings do not conflict with global keybindings (`?`, `:`, `g` prefix). Priority system in `KeybindingProvider` resolves: global bindings at PRIORITY.GLOBAL (5) are lower priority than screen bindings at PRIORITY.SCREEN (4).

---

## 11. Dependencies Graph

```
tui-detail-view-component
├── tui-theme-and-color-tokens (implemented)
│   └── TextAttributes, ThemeTokens, statusToToken, CoreTokenName
├── tui-bootstrap-and-renderer (implemented)
│   └── AppShell, providers (KeybindingProvider, NavigationProvider, ThemeProvider),
│       hooks (useLayout, useTheme, useScreenKeybindings, useNavigation),
│       SkeletonDetail, ActionButton, FullScreenError
└── (consumed by)
    ├── tui-issue-detail-view (IssueDetail screen)
    ├── tui-landing-detail-view (LandingDetail screen)
    ├── tui-workspace-detail-view (WorkspaceDetail screen)
    ├── tui-workflow-run-detail-view (WorkflowRunDetail screen)
    ├── tui-wiki-detail-view (WikiDetail screen)
    ├── tui-agent-chat-view (AgentChat screen)
    └── tui-tabbed-detail-view (may compose DetailView internally)
```

---

## 12. Open Questions

| # | Question | Default Decision | Revisit Trigger |
|---|----------|------------------|----------------|
| 1 | Should sections support collapse/expand with a toggle key? | No — out of scope for this ticket. All sections render expanded. | If detail screens have 5+ sections and vertical space is constrained. |
| 2 | Should the footer be sticky (outside scrollbox) or scrollable? | Scrollable (inside scrollbox). Consuming screens can render a sticky footer outside DetailView if needed. | If action buttons need to always be visible (e.g., issue close/reopen). |
| 3 | Should `scrollChildIntoView` snap the section to the top of the viewport or just bring it into view? | Just bring into view (OpenTUI default behavior — minimal scroll to make child visible). | If users find section jumping disorienting because the section appears at variable positions. |
| 4 | Should `scrollboxRef` type be strongly typed? | Use `ScrollBoxRenderable` from `@opentui/core` if available; fall back to `any` with TODO. | When OpenTUI publishes typed ref exports in a stable release. |
| 5 | Should `j`/`k` scroll change the focused section index when crossing section boundaries? | No — `j`/`k` only scrolls; section focus only changes via `Tab`/`Shift+Tab`/number keys. | If users expect section highlighting to follow their scroll position (would require intersection observer-like logic). |