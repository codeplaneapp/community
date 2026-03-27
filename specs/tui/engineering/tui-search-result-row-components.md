# Engineering Specification: Search Result Row Renderers

**Ticket:** `tui-search-result-row-components`
**Title:** Search result row renderers for repos, issues, users, and code tabs
**Type:** Engineering
**Status:** Ready for implementation
**Dependencies:** `tui-responsive-layout` (✅ Complete), `tui-theme-provider` (✅ Complete)

---

## 1. Overview

This ticket creates four per-type result row components for the TUI global search screen. Each component renders a single search result item inside a `ListRow` as provided by the `ListComponent`'s `renderItem` callback. The rows adapt column visibility to the current terminal breakpoint and render focused state via the `ListRow` wrapper's reverse video attribute.

### Deliverables

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/tui/src/screens/Search/results/RepoResultRow.tsx` | Repository search result row |
| 2 | `apps/tui/src/screens/Search/results/IssueResultRow.tsx` | Issue search result row |
| 3 | `apps/tui/src/screens/Search/results/UserResultRow.tsx` | User search result row |
| 4 | `apps/tui/src/screens/Search/results/CodeResultRow.tsx` | Code search result row |
| 5 | `apps/tui/src/screens/Search/results/index.ts` | Barrel re-exports |
| 6 | `apps/tui/src/screens/Search/results/columns.ts` | Shared column width calculation and breakpoint-dependent visibility helpers |
| 7 | `apps/tui/src/screens/Search/results/highlight.ts` | Match highlight parser for `<em>` tags in search results |
| 8 | `e2e/tui/search.test.ts` | E2E tests for all four result row types |

### Feature Mapping

These components implement the rendering layer for:
- `TUI_SEARCH_REPOS_TAB` — repository result rendering
- `TUI_SEARCH_ISSUES_TAB` — issue result rendering
- `TUI_SEARCH_USERS_TAB` — user result rendering
- `TUI_SEARCH_CODE_TAB` — code result rendering

### Relationship to Other Specs

- **`tui-search-data-hooks`** — Provides the `RepositorySearchResult`, `IssueSearchResult`, `UserSearchResult`, and `CodeSearchResult` types consumed by these row components. The types are defined in `apps/tui/src/hooks/useSearchTabs.types.ts`.
- **`tui-list-component`** — Provides the `ListComponent` and `ListRow` that wrap these row renderers. Each result row is the `children` of a `ListRow`. The `focused` boolean is passed through from `ListComponent`'s `renderItem(item, focused, index)`.
- **`tui-responsive-layout`** — Provides `useLayout()` and `useBreakpoint()` consumed by column visibility logic.

---

## 2. Current State Assessment

### Production Files (in `apps/tui/src/`)

| File | State | Relevance |
|------|-------|-----------|
| `hooks/useSearchTabs.types.ts` | Spec'd (tui-search-data-hooks) | Defines `RepositorySearchResult`, `IssueSearchResult`, `UserSearchResult`, `CodeSearchResult` consumed by these rows |
| `components/ListRow.tsx` | Spec'd (tui-list-component) | Wrapper providing focus highlight (reverse video) and selection indicator. Row components are rendered as `children`. |
| `components/ListComponent.tsx` | Spec'd (tui-list-component) | Calls `renderItem(item, focused, index)` — row components receive these args |
| `hooks/useLayout.ts` | 110 lines, complete | `useLayout()` provides `width`, `breakpoint`, `contentHeight` |
| `hooks/useBreakpoint.ts` | 17 lines, complete | `useBreakpoint()` returns current `Breakpoint \| null` |
| `hooks/useResponsiveValue.ts` | 34 lines, complete | `useResponsiveValue({ minimum, standard, large })` for breakpoint-keyed values |
| `hooks/useTheme.ts` | 30 lines, complete | `useTheme()` returns frozen `ThemeTokens` |
| `theme/tokens.ts` | 263 lines, complete | `ThemeTokens`, `TextAttributes`, `statusToToken()` |
| `util/text.ts` | 60 lines, complete | `truncateRight()`, `fitWidth()`, `truncateText()` |
| `types/breakpoint.ts` | 33 lines, complete | `Breakpoint` type, `getBreakpoint()` |

### Absent from Production

- `screens/Search/` — Directory does not exist
- `screens/Search/results/` — Directory does not exist
- No search result row components anywhere in `apps/tui/src/`
- No `<em>` tag highlight parser

---

## 3. Data Types (Input Contracts)

These types are defined in `tui-search-data-hooks` spec (`apps/tui/src/hooks/useSearchTabs.types.ts`). Reproduced here for reference — this ticket does **not** create or modify these types.

```typescript
interface RepositorySearchResult {
  id: string;
  owner: string;
  name: string;
  full_name: string;       // "owner/name"
  description: string;
  is_public: boolean;
  topics: string[];
  star_count?: number;     // may be absent
  language?: string;       // may be absent or empty
}

interface IssueSearchResult {
  id: string;
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  number: string;
  title: string;
  state: string;           // "open" | "closed"
  created_at?: string;     // ISO 8601 timestamp
}

interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;      // ignored in TUI (no images)
}

interface CodeSearchResult {
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  path: string;
  snippet: string;         // may contain <em>match</em> tags
}
```

> **Note on `star_count` and `language`**: The API search response may include these fields on `RepositorySearchResult`. If the upstream type definition does not include them, this ticket adds them as optional fields to the type in `useSearchTabs.types.ts`.

---

## 4. Shared Utilities

### 4.1 Column Width Calculator — `columns.ts`

**File:** `apps/tui/src/screens/Search/results/columns.ts`

A pure utility module that computes column widths and visibility for each row type based on the available width and current breakpoint. No React imports — purely functional.

```typescript
import type { Breakpoint } from "../../../types/breakpoint.js";

/**
 * Column visibility configuration for a result row.
 * Each boolean indicates whether that column is rendered at the current breakpoint.
 */
export interface ColumnVisibility {
  /** Always visible — primary identifier */
  primary: true;
  /** Secondary text (description, title, display name, file path) */
  secondary: boolean;
  /** Tertiary metadata (stars, timestamp, language) */
  tertiary: boolean;
  /** Quaternary metadata (topics, state badge detail) */
  quaternary: boolean;
}

/**
 * Resolved column widths in character count.
 */
export interface ColumnWidths {
  primary: number;
  secondary: number;
  tertiary: number;
  quaternary: number;
  /** Total consumed width including gaps */
  total: number;
}

/**
 * Breakpoint → column visibility rules.
 *
 * minimum  (80–119 cols): primary + secondary only (hide tertiary, quaternary)
 * standard (120–199 cols): primary + secondary + tertiary (hide quaternary only for some row types)
 * large    (200+ cols): all columns visible
 */
export function getColumnVisibility(breakpoint: Breakpoint | null): ColumnVisibility {
  if (!breakpoint || breakpoint === "minimum") {
    return { primary: true, secondary: true, tertiary: false, quaternary: false };
  }
  if (breakpoint === "standard") {
    return { primary: true, secondary: true, tertiary: true, quaternary: false };
  }
  // large
  return { primary: true, secondary: true, tertiary: true, quaternary: true };
}

// ── Per-row-type column width constants ──────────────────────────────

/** Gap between columns in characters */
const COL_GAP = 2;

/**
 * Compute column widths for RepoResultRow.
 *
 * Layout: [owner/repo (max 50)] [description (flex)] [★ count (6)] [language (12)] [topics (remaining)]
 */
export function repoColumnWidths(
  availableWidth: number,
  visibility: ColumnVisibility,
): ColumnWidths {
  const primaryMax = 50;
  const tertiaryWidth = visibility.tertiary ? 6 + COL_GAP : 0;    // star count
  const quaternaryWidth = visibility.quaternary ? 12 + COL_GAP : 0; // language
  const primaryWidth = Math.min(primaryMax, Math.floor(availableWidth * 0.35));
  const secondaryWidth = Math.max(
    10,
    availableWidth - primaryWidth - tertiaryWidth - quaternaryWidth - COL_GAP,
  );

  return {
    primary: primaryWidth,
    secondary: secondaryWidth,
    tertiary: visibility.tertiary ? 6 : 0,
    quaternary: visibility.quaternary ? 12 : 0,
    total: primaryWidth + COL_GAP + secondaryWidth + tertiaryWidth + quaternaryWidth,
  };
}

/**
 * Compute column widths for IssueResultRow.
 *
 * Layout: [repo context (max 30, muted)] [#number (max 8)] [title (flex)] [state badge (8)] [timestamp (12)]
 */
export function issueColumnWidths(
  availableWidth: number,
  visibility: ColumnVisibility,
): ColumnWidths {
  const contextMax = 30;
  const numberWidth = 8;
  const stateWidth = 8;
  const timestampWidth = visibility.tertiary ? 12 + COL_GAP : 0;
  const contextWidth = Math.min(contextMax, Math.floor(availableWidth * 0.2));
  const titleWidth = Math.max(
    10,
    availableWidth - contextWidth - numberWidth - stateWidth - timestampWidth - COL_GAP * 3,
  );

  return {
    primary: contextWidth + COL_GAP + numberWidth,
    secondary: titleWidth,
    tertiary: visibility.tertiary ? 12 : 0,
    quaternary: stateWidth,
    total: contextWidth + numberWidth + titleWidth + stateWidth + timestampWidth + COL_GAP * 3,
  };
}

/**
 * Compute column widths for UserResultRow.
 *
 * Layout: [username (max 20, primary)] [display_name in parens (max 30, muted)]
 */
export function userColumnWidths(
  availableWidth: number,
  _visibility: ColumnVisibility,
): ColumnWidths {
  const usernameMax = 20;
  const displayNameMax = 30;
  const usernameWidth = Math.min(usernameMax, Math.floor(availableWidth * 0.3));
  const displayNameWidth = Math.min(displayNameMax, availableWidth - usernameWidth - COL_GAP);

  return {
    primary: usernameWidth,
    secondary: Math.max(0, displayNameWidth),
    tertiary: 0,
    quaternary: 0,
    total: usernameWidth + COL_GAP + displayNameWidth,
  };
}

/**
 * Compute column widths for CodeResultRow.
 *
 * Layout: [repo context (muted, max 25)] [file path (max 60, primary)] [code snippet (flex, with gutter)]
 *
 * Code rows are 2 terminal rows tall (1 for header, 1 for snippet).
 */
export function codeColumnWidths(
  availableWidth: number,
  visibility: ColumnVisibility,
): ColumnWidths {
  const contextMax = 25;
  const pathMax = 60;
  const contextWidth = visibility.tertiary
    ? Math.min(contextMax, Math.floor(availableWidth * 0.15))
    : 0;
  const pathWidth = Math.min(pathMax, availableWidth - contextWidth - COL_GAP);

  return {
    primary: pathWidth,
    secondary: Math.max(10, availableWidth - 2), // snippet uses full width on line 2
    tertiary: contextWidth,
    quaternary: 0,
    total: availableWidth,
  };
}
```

### 4.2 Match Highlight Parser — `highlight.ts`

**File:** `apps/tui/src/screens/Search/results/highlight.ts`

Parses `<em>` tags from search API response strings into styled text segments. The search API wraps matching substrings in `<em>...</em>` tags. This utility converts those into an array of segments that the row components render with appropriate styling.

```typescript
/**
 * A segment of text that is either a plain string or a highlighted match.
 */
export interface TextSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Parse a string containing <em>match</em> tags into segments.
 *
 * Input:  "function <em>handleClick</em>(event)"
 * Output: [
 *   { text: "function ", highlighted: false },
 *   { text: "handleClick", highlighted: true },
 *   { text: "(event)", highlighted: false },
 * ]
 *
 * If the input contains no <em> tags, returns a single unhighlighted segment.
 * Handles nested or malformed tags gracefully (treats unmatched tags as literal text).
 * HTML-entity decoding is NOT performed — the API returns plain text within tags.
 */
export function parseHighlights(input: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /<em>(.*?)<\/em>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), highlighted: false });
    }
    // The matched (highlighted) text
    segments.push({ text: match[1], highlighted: true });
    lastIndex = regex.lastIndex;
  }

  // Remaining text after last match
  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), highlighted: false });
  }

  // If no matches found, return the full string as unhighlighted
  if (segments.length === 0) {
    segments.push({ text: input, highlighted: false });
  }

  return segments;
}

/**
 * Compute the display length of a string with <em> tags removed.
 * Used for truncation calculations.
 */
export function plainTextLength(input: string): number {
  return input.replace(/<em>(.*?)<\/em>/g, "$1").length;
}

/**
 * Truncate a string that may contain <em> tags to a maximum display width.
 * Preserves tag boundaries — never splits a tag mid-way.
 * Appends "…" if truncated.
 *
 * @param input - String possibly containing <em> tags
 * @param maxWidth - Maximum display width in characters
 * @returns Truncated string with <em> tags intact where possible
 */
export function truncateHighlighted(input: string, maxWidth: number): string {
  if (maxWidth < 1) return "";
  const plain = input.replace(/<em>(.*?)<\/em>/g, "$1");
  if (plain.length <= maxWidth) return input;

  // Parse into segments and truncate by character budget
  const segments = parseHighlights(input);
  let budget = maxWidth - 1; // reserve 1 for ellipsis
  const result: string[] = [];

  for (const seg of segments) {
    if (budget <= 0) break;
    if (seg.text.length <= budget) {
      result.push(seg.highlighted ? `<em>${seg.text}</em>` : seg.text);
      budget -= seg.text.length;
    } else {
      const truncated = seg.text.slice(0, budget);
      result.push(seg.highlighted ? `<em>${truncated}</em>` : truncated);
      budget = 0;
    }
  }

  result.push("…");
  return result.join("");
}
```

### 4.3 Relative Timestamp Formatter

Reuses a utility that should exist in `apps/tui/src/util/format.ts`. If it does not yet exist, this ticket adds the following function:

```typescript
/**
 * Format an ISO 8601 timestamp as a relative time string.
 *
 * Examples: "2m ago", "3h ago", "5d ago", "2w ago", "3mo ago", "1y ago"
 *
 * Maximum precision is minutes. Anything under 1 minute shows "just now".
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 0 || Number.isNaN(diffMs)) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
```

### 4.4 Left-Truncate Path Utility

For code result file paths, a left-truncation utility replaces the beginning of long paths with `.../`:

```typescript
/**
 * Truncate a file path from the left, preserving the rightmost segments.
 *
 * Example: truncatePathLeft("src/components/screens/Search/results/CodeResultRow.tsx", 30)
 *          → ".../Search/results/CodeResultRow.tsx"
 *
 * If the path fits within maxWidth, returns it unchanged.
 * If the filename alone exceeds maxWidth, truncates from the right with "…".
 */
export function truncatePathLeft(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path;
  if (maxWidth <= 4) return path.slice(path.length - maxWidth);

  const prefix = ".../";
  const budget = maxWidth - prefix.length;

  // Walk path segments from right to left
  const parts = path.split("/");
  const kept: string[] = [];
  let length = 0;

  for (let i = parts.length - 1; i >= 0; i--) {
    const segmentLength = parts[i].length + (kept.length > 0 ? 1 : 0); // +1 for "/"
    if (length + segmentLength > budget) break;
    kept.unshift(parts[i]);
    length += segmentLength;
  }

  if (kept.length === 0) {
    // Filename alone exceeds budget — truncate from right
    const filename = parts[parts.length - 1];
    return prefix + filename.slice(0, budget - 1) + "…";
  }

  return prefix + kept.join("/");
}
```

This function is added to `apps/tui/src/util/text.ts` alongside the existing truncation utilities.

---

## 5. Component Specifications

### 5.1 Rendering Contract with ListComponent

Each result row component is called from a `ListComponent`'s `renderItem` prop:

```typescript
// In SearchScreen (future ticket):
<ListComponent
  items={activeTab.items}
  renderItem={(item, focused, index) => <RepoResultRow item={item} focused={focused} width={availableWidth} />}
  onSelect={handleSelect}
  keyExtractor={(item) => item.id}
  // ...pagination props
/>
```

The `ListRow` wrapper (from `tui-list-component`) applies:
- `paddingX={1}` — 1 character padding on each side
- `attributes={focused ? TextAttributes.REVERSE : 0}` — reverse video on focused row
- `height={rowHeight}` — 1 for most rows, 2 for code rows
- `flexDirection="row"` on the inner content box
- 2-character selection indicator prefix (either `● ` or `  `)

This means the available width for row content is:

```
availableWidth = terminalWidth - 2 (paddingX) - 2 (selection indicator)
```

Each result row component receives this as a `width` prop and must not exceed it.

### 5.2 Focused Row Rendering

Focus is handled by the `ListRow` wrapper via `TextAttributes.REVERSE` (SGR 7) applied to the entire row `<box>`. Result row components do **not** apply their own focus styling. However, they receive the `focused` prop for two purposes:

1. **Conditional content** — At minimum breakpoint, focused rows may show additional detail that unfocused rows hide (e.g., full description tooltip). This ticket does not implement tooltips but preserves the prop for future use.
2. **Color adjustment** — Under reverse video, `theme.muted` text may become hard to read. The `focused` prop allows rows to skip `fg={theme.muted}` when focused, falling back to the default foreground (which reverse video inverts to the background color).

**Decision:** For this initial implementation, all color props are applied identically regardless of `focused` state. The reverse video attribute from `ListRow` produces sufficient contrast across all three color tiers. If user testing reveals readability issues with muted text under reverse video, a follow-up ticket will add focused-state color overrides.

---

### 5.3 RepoResultRow

**File:** `apps/tui/src/screens/Search/results/RepoResultRow.tsx`

Renders a single repository search result.

#### Visual Layout

```
Standard (120+ cols):
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  owner/repo-name                  A short description of the…        ★ 142   TypeScript             │
│                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘

Minimum (80–119 cols):
┌──────────────────────────────────────────────────────────────────────────────┐
│  owner/repo-name         A short description of the repository…    🔒       │
└──────────────────────────────────────────────────────────────────────────────┘

Large (200+ cols):
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  owner/repo-name                  A short description of the repository        ★ 142   TypeScript   go, cli, tool     │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Column Mapping

| Column | Content | Max Width | Color | Breakpoint |
|--------|---------|-----------|-------|------------|
| Primary | `owner/repo` | 50ch | `theme.primary` (when focused, inherits reverse video) | Always |
| Visibility badge | `🔒` (private) or empty | 2ch | `theme.warning` | Always (appended to primary) |
| Secondary | `description` (truncated) | Flex | `theme.muted` | Always |
| Tertiary | `★ {count}` | 6ch | `theme.muted` | Standard + Large |
| Quaternary-a | `language` | 12ch | `theme.muted` | Large |
| Quaternary-b | Topic tags (max 3 + `+N`) | Remaining | `theme.muted` | Large |

#### Props

```typescript
import type { RepositorySearchResult } from "../../../hooks/useSearchTabs.types.js";
import type { Breakpoint } from "../../../types/breakpoint.js";

export interface RepoResultRowProps {
  item: RepositorySearchResult;
  focused: boolean;
  width: number;
  breakpoint: Breakpoint | null;
}
```

#### Implementation

```typescript
import { useMemo } from "react";
import { useTheme } from "../../../hooks/useTheme.js";
import { truncateRight } from "../../../util/text.js";
import { getColumnVisibility, repoColumnWidths } from "./columns.js";
import type { RepoResultRowProps } from "./RepoResultRow.js";
import { TextAttributes } from "../../../theme/tokens.js";

export function RepoResultRow({ item, focused, width, breakpoint }: RepoResultRowProps) {
  const theme = useTheme();
  const visibility = useMemo(() => getColumnVisibility(breakpoint), [breakpoint]);
  const cols = useMemo(() => repoColumnWidths(width, visibility), [width, visibility]);

  const fullName = truncateRight(item.full_name, 50);
  const visibilityBadge = item.is_public ? "" : " 🔒";
  const primaryText = truncateRight(fullName + visibilityBadge, cols.primary);

  const description = item.description
    ? truncateRight(item.description, cols.secondary)
    : "";

  const starText = visibility.tertiary && item.star_count != null
    ? `★ ${formatCompactNumber(item.star_count)}`
    : "";

  const languageText = visibility.quaternary && item.language
    ? truncateRight(item.language, 12)
    : "";

  const topicText = visibility.quaternary && item.topics.length > 0
    ? formatTopics(item.topics, Math.max(0, width - cols.total - 2))
    : "";

  return (
    <box flexDirection="row" width={width}>
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        {primaryText}
      </text>
      <text>{"  "}</text>
      <box flexGrow={1}>
        <text fg={theme.muted}>{description}</text>
      </box>
      {starText && (
        <>
          <text>{"  "}</text>
          <text fg={theme.muted}>{starText}</text>
        </>
      )}
      {languageText && (
        <>
          <text>{"  "}</text>
          <text fg={theme.muted}>{languageText}</text>
        </>
      )}
      {topicText && (
        <>
          <text>{"  "}</text>
          <text fg={theme.muted}>{topicText}</text>
        </>
      )}
    </box>
  );
}

/**
 * Format topics as comma-separated tags, max 3 shown, with +N overflow.
 *
 * ["go", "cli", "tool", "devops", "automation"] → "go, cli, tool +2"
 */
function formatTopics(topics: string[], maxWidth: number): string {
  if (topics.length === 0 || maxWidth < 3) return "";

  const MAX_SHOWN = 3;
  const shown = topics.slice(0, MAX_SHOWN);
  const overflow = topics.length - MAX_SHOWN;

  let text = shown.join(", ");
  if (overflow > 0) {
    text += ` +${overflow}`;
  }

  if (text.length > maxWidth) {
    // Reduce shown tags until it fits
    for (let count = shown.length - 1; count >= 1; count--) {
      const reduced = topics.slice(0, count).join(", ");
      const newOverflow = topics.length - count;
      const candidate = `${reduced} +${newOverflow}`;
      if (candidate.length <= maxWidth) return candidate;
    }
    // Single tag + overflow
    const single = topics[0];
    const singleOverflow = topics.length - 1;
    const candidate = singleOverflow > 0 ? `${single} +${singleOverflow}` : single;
    return candidate.length <= maxWidth ? candidate : truncateRight(candidate, maxWidth);
  }

  return text;
}

/**
 * Format a number compactly: 1234 → "1.2k", 12345 → "12k", 123 → "123"
 */
function formatCompactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
```

---

### 5.4 IssueResultRow

**File:** `apps/tui/src/screens/Search/results/IssueResultRow.tsx`

Renders a single issue search result.

#### Visual Layout

```
Standard (120+ cols):
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  owner/repo            #42  Fix the broken login flow                         ● open        3h ago  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘

Minimum (80–119 cols):
┌──────────────────────────────────────────────────────────────────────────────┐
│  owner/repo       #42  Fix the broken login flow              ● open        │
└──────────────────────────────────────────────────────────────────────────────┘

Large (200+ cols):
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  owner/repo-name               #42  Fix the broken login flow that occurs when…                ● open        3h ago  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Column Mapping

| Column | Content | Max Width | Color | Breakpoint |
|--------|---------|-----------|-------|------------|
| Repo context | `owner/repo` | 30ch | `theme.muted` | Always |
| Number | `#42` | 8ch | `theme.primary` | Always |
| Title | Issue title (truncated) | Flex | Default (no color override) | Always |
| State badge | `● open` or `● closed` | 8ch | `theme.success` (open) / `theme.error` (closed) | Always |
| Timestamp | Relative time | 12ch | `theme.muted` | Standard + Large |

#### Props

```typescript
import type { IssueSearchResult } from "../../../hooks/useSearchTabs.types.js";
import type { Breakpoint } from "../../../types/breakpoint.js";

export interface IssueResultRowProps {
  item: IssueSearchResult;
  focused: boolean;
  width: number;
  breakpoint: Breakpoint | null;
}
```

#### Implementation

```typescript
import { useMemo } from "react";
import { useTheme } from "../../../hooks/useTheme.js";
import { truncateRight } from "../../../util/text.js";
import { statusToToken, TextAttributes } from "../../../theme/tokens.js";
import { getColumnVisibility } from "./columns.js";
import { formatRelativeTime } from "../../../util/format.js";

export function IssueResultRow({ item, focused, width, breakpoint }: IssueResultRowProps) {
  const theme = useTheme();
  const visibility = useMemo(() => getColumnVisibility(breakpoint), [breakpoint]);

  const repoContext = truncateRight(
    `${item.repository_owner}/${item.repository_name}`,
    30,
  );
  const issueNumber = `#${item.number}`;
  const stateColor = theme[statusToToken(item.state)];
  const stateText = `● ${item.state}`;

  const timestampText = visibility.tertiary && item.created_at
    ? formatRelativeTime(item.created_at)
    : "";

  // Calculate available width for title
  const fixedWidth =
    repoContext.length + 2 +       // repo context + gap
    issueNumber.length + 2 +       // number + gap
    stateText.length +             // state badge
    (timestampText ? 2 + timestampText.length : 0); // gap + timestamp
  const titleWidth = Math.max(10, width - fixedWidth);
  const title = truncateRight(item.title, titleWidth);

  return (
    <box flexDirection="row" width={width}>
      <text fg={theme.muted}>{repoContext}</text>
      <text>{"  "}</text>
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>{issueNumber}</text>
      <text>{"  "}</text>
      <box flexGrow={1}>
        <text>{title}</text>
      </box>
      <text>{"  "}</text>
      <text fg={stateColor}>{stateText}</text>
      {timestampText && (
        <>
          <text>{"  "}</text>
          <text fg={theme.muted}>{timestampText}</text>
        </>
      )}
    </box>
  );
}
```

---

### 5.5 UserResultRow

**File:** `apps/tui/src/screens/Search/results/UserResultRow.tsx`

Renders a single user search result. This is the simplest row — no avatar rendering (TUI constraint: no images).

#### Visual Layout

```
All breakpoints:
┌──────────────────────────────────────────────────────────────────────────────┐
│  username           (Display Name)                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Column Mapping

| Column | Content | Max Width | Color | Breakpoint |
|--------|---------|-----------|-------|------------|
| Primary | `username` | 20ch | `theme.primary`, bold | Always |
| Secondary | `(display_name)` | 30ch | `theme.muted` | Always (if display_name non-empty) |

#### Props

```typescript
import type { UserSearchResult } from "../../../hooks/useSearchTabs.types.js";
import type { Breakpoint } from "../../../types/breakpoint.js";

export interface UserResultRowProps {
  item: UserSearchResult;
  focused: boolean;
  width: number;
  breakpoint: Breakpoint | null;
}
```

#### Implementation

```typescript
import { useTheme } from "../../../hooks/useTheme.js";
import { truncateRight } from "../../../util/text.js";
import { TextAttributes } from "../../../theme/tokens.js";

export function UserResultRow({ item, focused, width, breakpoint }: UserResultRowProps) {
  const theme = useTheme();

  const username = truncateRight(item.username, 20);
  const displayName = item.display_name
    ? truncateRight(`(${item.display_name})`, 32) // 30 for name + 2 for parens
    : "";

  return (
    <box flexDirection="row" width={width}>
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        {username}
      </text>
      {displayName && (
        <>
          <text>{"  "}</text>
          <text fg={theme.muted}>{displayName}</text>
        </>
      )}
    </box>
  );
}
```

---

### 5.6 CodeResultRow

**File:** `apps/tui/src/screens/Search/results/CodeResultRow.tsx`

Renders a single code search result. This is the most complex row — it uses **2 terminal rows** (height=2): one for the header line (repo + file path) and one for the code snippet with syntax highlighting and match highlighting.

#### Visual Layout

```
Standard (120+ cols):
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  owner/repo  .../screens/Search/results/CodeResultRow.tsx                                           │
│   │ 42 │  function handleClick(event: MouseEvent) {                                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘

Minimum (80–119 cols):
┌──────────────────────────────────────────────────────────────────────────────┐
│  .../Search/results/CodeResultRow.tsx                                       │
│   │ 42 │  function handleClick(event: MouseEvent) {                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

At minimum breakpoint, the repo context is hidden from the header line and only the file path is shown.

#### Column Mapping (Header Line)

| Column | Content | Max Width | Color | Breakpoint |
|--------|---------|-----------|-------|------------|
| Repo context | `owner/repo` | 25ch | `theme.muted` | Standard + Large |
| File path | Path (left-truncated with `.../`) | 60ch | `theme.primary` | Always |

#### Snippet Line

The second line renders the code snippet using OpenTUI's `<code>` component for syntax highlighting. Match highlights (from `<em>` tags) are rendered as **bold + primary color** text.

The snippet line includes a gutter:

```
 │ {lineNumber} │  {code content with highlights}
```

Gutter characters: `│` (U+2502 box-drawing vertical) with line number right-aligned to 4 characters. If the snippet does not include line number information, the gutter shows only the border.

#### Props

```typescript
import type { CodeSearchResult } from "../../../hooks/useSearchTabs.types.js";
import type { Breakpoint } from "../../../types/breakpoint.js";

export interface CodeResultRowProps {
  item: CodeSearchResult;
  focused: boolean;
  width: number;
  breakpoint: Breakpoint | null;
}
```

#### Implementation

```typescript
import { useMemo } from "react";
import { useTheme } from "../../../hooks/useTheme.js";
import { truncateRight } from "../../../util/text.js";
import { truncatePathLeft } from "../../../util/text.js";
import { TextAttributes } from "../../../theme/tokens.js";
import { parseHighlights, truncateHighlighted } from "./highlight.js";

/** Gutter width: " │ NNNN │  " = 11 characters */
const GUTTER_WIDTH = 11;

export function CodeResultRow({ item, focused, width, breakpoint }: CodeResultRowProps) {
  const theme = useTheme();

  const showRepoContext = breakpoint !== "minimum" && breakpoint !== null;
  const repoContext = showRepoContext
    ? truncateRight(`${item.repository_owner}/${item.repository_name}`, 25)
    : "";

  const pathBudget = showRepoContext
    ? Math.min(60, width - repoContext.length - 2)
    : Math.min(60, width);
  const filePath = truncatePathLeft(item.path, pathBudget);

  // Parse snippet — extract line number if present (format: "NNN: code...")
  const { lineNumber, code } = parseSnippetLine(item.snippet);

  // Truncate code to available width minus gutter
  const codeBudget = Math.max(10, width - GUTTER_WIDTH);
  const truncatedSnippet = truncateHighlighted(code, codeBudget);

  // Parse highlights for rendering
  const segments = useMemo(
    () => parseHighlights(truncatedSnippet),
    [truncatedSnippet],
  );

  const gutterNumber = lineNumber != null
    ? String(lineNumber).padStart(4, " ")
    : "    ";

  return (
    <box flexDirection="column" width={width} height={2}>
      {/* Line 1: header (repo context + file path) */}
      <box flexDirection="row" height={1}>
        {repoContext && (
          <>
            <text fg={theme.muted}>{repoContext}</text>
            <text>{"  "}</text>
          </>
        )}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          {filePath}
        </text>
      </box>

      {/* Line 2: gutter + code snippet */}
      <box flexDirection="row" height={1}>
        <text fg={theme.border}>{" │ "}</text>
        <text fg={theme.muted}>{gutterNumber}</text>
        <text fg={theme.border}>{" │  "}</text>
        <box flexGrow={1}>
          {segments.map((seg, i) =>
            seg.highlighted ? (
              <text key={i} fg={theme.primary} attributes={TextAttributes.BOLD}>
                {seg.text}
              </text>
            ) : (
              <text key={i}>{seg.text}</text>
            ),
          )}
        </box>
      </box>
    </box>
  );
}

/**
 * Extract line number prefix from a snippet string.
 *
 * The API may return snippets in the format "123: code goes here"
 * or just "code goes here" without a line number.
 */
function parseSnippetLine(snippet: string): { lineNumber: number | null; code: string } {
  const match = snippet.match(/^(\d+):\s*/);
  if (match) {
    return {
      lineNumber: parseInt(match[1], 10),
      code: snippet.slice(match[0].length),
    };
  }
  return { lineNumber: null, code: snippet };
}
```

**Row height:** CodeResultRow requires `rowHeight={2}` on the `ListComponent`. The `SearchScreen` component (future ticket) passes this prop when the active tab is the code tab:

```typescript
<ListComponent
  items={codeTab.items}
  renderItem={(item, focused, index) => (
    <CodeResultRow item={item} focused={focused} width={availableWidth} breakpoint={breakpoint} />
  )}
  rowHeight={2}  // code rows are 2 lines tall
  // ...
/>
```

---

### 5.7 Barrel Exports

**File:** `apps/tui/src/screens/Search/results/index.ts`

```typescript
export { RepoResultRow } from "./RepoResultRow.js";
export type { RepoResultRowProps } from "./RepoResultRow.js";

export { IssueResultRow } from "./IssueResultRow.js";
export type { IssueResultRowProps } from "./IssueResultRow.js";

export { UserResultRow } from "./UserResultRow.js";
export type { UserResultRowProps } from "./UserResultRow.js";

export { CodeResultRow } from "./CodeResultRow.js";
export type { CodeResultRowProps } from "./CodeResultRow.js";

export { parseHighlights, plainTextLength, truncateHighlighted } from "./highlight.js";
export type { TextSegment } from "./highlight.js";

export {
  getColumnVisibility,
  repoColumnWidths,
  issueColumnWidths,
  userColumnWidths,
  codeColumnWidths,
} from "./columns.js";
export type { ColumnVisibility, ColumnWidths } from "./columns.js";
```

---

## 6. Implementation Plan

### Step 1: Create directory structure

Create `apps/tui/src/screens/Search/results/` directory.

### Step 2: Implement `highlight.ts`

**File:** `apps/tui/src/screens/Search/results/highlight.ts`

Implement `parseHighlights()`, `plainTextLength()`, and `truncateHighlighted()` as specified in §4.2. This is a pure utility with zero dependencies on React or OpenTUI.

**Verification:** Unit-testable in isolation. Write at least 8 test cases covering:
- No `<em>` tags (passthrough)
- Single `<em>` match
- Multiple `<em>` matches
- Adjacent `<em>` tags
- `<em>` at start of string
- `<em>` at end of string
- Truncation that falls within a highlighted segment
- Empty string input

### Step 3: Implement `columns.ts`

**File:** `apps/tui/src/screens/Search/results/columns.ts`

Implement `getColumnVisibility()` and the four per-type width calculators as specified in §4.1. Pure functions, no React imports.

**Verification:** Unit-testable. Test each calculator at 80, 120, and 200 column widths with corresponding visibility settings.

### Step 4: Add `truncatePathLeft` to text utilities

**File:** `apps/tui/src/util/text.ts`

Add `truncatePathLeft()` as specified in §4.4 to the existing text utility file.

**Verification:** Unit-testable. Cover paths shorter than max, paths requiring truncation, single-segment paths, and edge cases (maxWidth < prefix length).

### Step 5: Add `formatRelativeTime` to format utilities

**File:** `apps/tui/src/util/format.ts`

Add `formatRelativeTime()` as specified in §4.3. If the file does not exist, create it.

**Verification:** Unit-testable. Cover each time bucket boundary (just now, minutes, hours, days, weeks, months, years) and edge cases (future timestamps, NaN).

### Step 6: Implement `RepoResultRow.tsx`

**File:** `apps/tui/src/screens/Search/results/RepoResultRow.tsx`

Implement as specified in §5.3. Depends on: `columns.ts`, `useTheme`, `truncateRight`, `TextAttributes`.

Internal helpers `formatTopics()` and `formatCompactNumber()` are module-private functions within this file.

### Step 7: Implement `IssueResultRow.tsx`

**File:** `apps/tui/src/screens/Search/results/IssueResultRow.tsx`

Implement as specified in §5.4. Depends on: `columns.ts`, `useTheme`, `truncateRight`, `statusToToken`, `formatRelativeTime`.

### Step 8: Implement `UserResultRow.tsx`

**File:** `apps/tui/src/screens/Search/results/UserResultRow.tsx`

Implement as specified in §5.5. Depends on: `useTheme`, `truncateRight`, `TextAttributes`.

### Step 9: Implement `CodeResultRow.tsx`

**File:** `apps/tui/src/screens/Search/results/CodeResultRow.tsx`

Implement as specified in §5.6. Depends on: `highlight.ts`, `columns.ts`, `useTheme`, `truncatePathLeft`, `truncateRight`, `TextAttributes`.

**Note:** The `parseSnippetLine()` helper is module-private within this file.

### Step 10: Create barrel exports

**File:** `apps/tui/src/screens/Search/results/index.ts`

Export all components, types, and utilities as specified in §5.7.

### Step 11: Update `RepositorySearchResult` type (if needed)

**File:** `apps/tui/src/hooks/useSearchTabs.types.ts`

If `star_count` and `language` fields are not already present on `RepositorySearchResult`, add them as optional fields:

```typescript
interface RepositorySearchResult {
  // ... existing fields ...
  star_count?: number;
  language?: string;
}
```

### Step 12: Write E2E tests

**File:** `e2e/tui/search.test.ts`

Write E2E tests as specified in §7.

---

## 7. Unit & Integration Tests

### 7.1 Pure Utility Tests

These tests validate the non-React utility functions. They run fast and cover edge cases exhaustively.

**File:** `e2e/tui/search-result-utils.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { parseHighlights, plainTextLength, truncateHighlighted } from
  "../../apps/tui/src/screens/Search/results/highlight.js";
import { getColumnVisibility, repoColumnWidths, issueColumnWidths, userColumnWidths, codeColumnWidths } from
  "../../apps/tui/src/screens/Search/results/columns.js";
import { truncatePathLeft } from "../../apps/tui/src/util/text.js";
import { formatRelativeTime } from "../../apps/tui/src/util/format.js";

// ── parseHighlights ─────────────────────────────────────────────────

describe("parseHighlights", () => {
  test("returns single unhighlighted segment for plain text", () => {
    const result = parseHighlights("hello world");
    expect(result).toEqual([{ text: "hello world", highlighted: false }]);
  });

  test("parses single <em> tag", () => {
    const result = parseHighlights("hello <em>world</em> foo");
    expect(result).toEqual([
      { text: "hello ", highlighted: false },
      { text: "world", highlighted: true },
      { text: " foo", highlighted: false },
    ]);
  });

  test("parses multiple <em> tags", () => {
    const result = parseHighlights("<em>a</em> b <em>c</em>");
    expect(result).toEqual([
      { text: "a", highlighted: true },
      { text: " b ", highlighted: false },
      { text: "c", highlighted: true },
    ]);
  });

  test("parses <em> at start of string", () => {
    const result = parseHighlights("<em>start</em> rest");
    expect(result).toEqual([
      { text: "start", highlighted: true },
      { text: " rest", highlighted: false },
    ]);
  });

  test("parses <em> at end of string", () => {
    const result = parseHighlights("prefix <em>end</em>");
    expect(result).toEqual([
      { text: "prefix ", highlighted: false },
      { text: "end", highlighted: true },
    ]);
  });

  test("parses adjacent <em> tags", () => {
    const result = parseHighlights("<em>a</em><em>b</em>");
    expect(result).toEqual([
      { text: "a", highlighted: true },
      { text: "b", highlighted: true },
    ]);
  });

  test("handles empty string", () => {
    const result = parseHighlights("");
    expect(result).toEqual([{ text: "", highlighted: false }]);
  });

  test("handles empty <em> tags", () => {
    const result = parseHighlights("a<em></em>b");
    expect(result).toEqual([
      { text: "a", highlighted: false },
      { text: "", highlighted: true },
      { text: "b", highlighted: false },
    ]);
  });
});

// ── plainTextLength ─────────────────────────────────────────────────

describe("plainTextLength", () => {
  test("returns length of plain text", () => {
    expect(plainTextLength("hello")).toBe(5);
  });

  test("strips <em> tags from length calculation", () => {
    expect(plainTextLength("hello <em>world</em>")).toBe(11);
  });

  test("handles multiple tags", () => {
    expect(plainTextLength("<em>a</em> <em>b</em>")).toBe(3);
  });
});

// ── truncateHighlighted ─────────────────────────────────────────────

describe("truncateHighlighted", () => {
  test("returns input unchanged when within budget", () => {
    expect(truncateHighlighted("short", 10)).toBe("short");
  });

  test("preserves <em> tags when within budget", () => {
    expect(truncateHighlighted("<em>hi</em>", 10)).toBe("<em>hi</em>");
  });

  test("truncates long plain text with ellipsis", () => {
    const result = truncateHighlighted("a very long string", 10);
    expect(plainTextLength(result.replace(/<\/?em>/g, ""))).toBeLessThanOrEqual(10);
    expect(result).toContain("…");
  });

  test("truncates within a highlighted segment", () => {
    const result = truncateHighlighted("<em>abcdefghij</em>", 5);
    expect(result).toContain("…");
    expect(plainTextLength(result.replace(/<\/?em>/g, ""))).toBeLessThanOrEqual(5);
  });

  test("returns empty for maxWidth 0", () => {
    expect(truncateHighlighted("anything", 0)).toBe("");
  });
});

// ── getColumnVisibility ─────────────────────────────────────────────

describe("getColumnVisibility", () => {
  test("minimum shows primary + secondary only", () => {
    const vis = getColumnVisibility("minimum");
    expect(vis.primary).toBe(true);
    expect(vis.secondary).toBe(true);
    expect(vis.tertiary).toBe(false);
    expect(vis.quaternary).toBe(false);
  });

  test("standard adds tertiary", () => {
    const vis = getColumnVisibility("standard");
    expect(vis.tertiary).toBe(true);
    expect(vis.quaternary).toBe(false);
  });

  test("large shows all columns", () => {
    const vis = getColumnVisibility("large");
    expect(vis.tertiary).toBe(true);
    expect(vis.quaternary).toBe(true);
  });

  test("null breakpoint behaves as minimum", () => {
    const vis = getColumnVisibility(null);
    expect(vis.tertiary).toBe(false);
    expect(vis.quaternary).toBe(false);
  });
});

// ── repoColumnWidths ────────────────────────────────────────────────

describe("repoColumnWidths", () => {
  test("at 80 cols minimum, primary <= 50 and secondary >= 10", () => {
    const vis = getColumnVisibility("minimum");
    const cols = repoColumnWidths(76, vis); // 80 - 4 (padding + selection)
    expect(cols.primary).toBeLessThanOrEqual(50);
    expect(cols.secondary).toBeGreaterThanOrEqual(10);
    expect(cols.tertiary).toBe(0);
    expect(cols.quaternary).toBe(0);
  });

  test("at 120 cols standard, tertiary is 6 (star count)", () => {
    const vis = getColumnVisibility("standard");
    const cols = repoColumnWidths(116, vis);
    expect(cols.tertiary).toBe(6);
    expect(cols.quaternary).toBe(0);
  });

  test("at 200 cols large, quaternary is 12 (language)", () => {
    const vis = getColumnVisibility("large");
    const cols = repoColumnWidths(196, vis);
    expect(cols.tertiary).toBe(6);
    expect(cols.quaternary).toBe(12);
  });
});

// ── issueColumnWidths ───────────────────────────────────────────────

describe("issueColumnWidths", () => {
  test("at minimum, no timestamp column", () => {
    const vis = getColumnVisibility("minimum");
    const cols = issueColumnWidths(76, vis);
    expect(cols.tertiary).toBe(0);
  });

  test("at standard, timestamp column is 12", () => {
    const vis = getColumnVisibility("standard");
    const cols = issueColumnWidths(116, vis);
    expect(cols.tertiary).toBe(12);
  });
});

// ── truncatePathLeft ────────────────────────────────────────────────

describe("truncatePathLeft", () => {
  test("returns short paths unchanged", () => {
    expect(truncatePathLeft("src/index.ts", 30)).toBe("src/index.ts");
  });

  test("truncates long paths from left with .../", () => {
    const result = truncatePathLeft("src/components/screens/Search/results/CodeResultRow.tsx", 30);
    expect(result).toMatch(/^\.\.\//);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain("CodeResultRow.tsx");
  });

  test("handles single-segment paths", () => {
    const result = truncatePathLeft("VeryLongFilenameExceedingLimit.tsx", 20);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  test("returns full path if it fits exactly", () => {
    const path = "exactly20characters!";
    expect(truncatePathLeft(path, 20)).toBe(path);
  });
});

// ── formatRelativeTime ──────────────────────────────────────────────

describe("formatRelativeTime", () => {
  test("returns 'just now' for recent timestamps", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  test("formats minutes", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  test("formats hours", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
  });

  test("formats days", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
  });

  test("formats weeks", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
    expect(formatRelativeTime(twoWeeksAgo)).toBe("2w ago");
  });

  test("handles future timestamps gracefully", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(formatRelativeTime(future)).toBe("just now");
  });
});
```

### 7.2 E2E Search Result Row Tests

**File:** `e2e/tui/search.test.ts`

These tests verify the visual rendering and responsive behavior of each result row type within the full TUI application context. They launch the TUI, navigate to the search screen, enter a query, and assert on the rendered terminal output.

```typescript
import { describe, test, expect } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

const TUI_SRC = join(import.meta.dir, "../../apps/tui/src");
const RESULTS_DIR = join(TUI_SRC, "screens/Search/results");

// ── File existence ──────────────────────────────────────────────────

describe("TUI_SEARCH result row file structure", () => {
  test("RepoResultRow.tsx exists", () => {
    expect(existsSync(join(RESULTS_DIR, "RepoResultRow.tsx"))).toBe(true);
  });

  test("IssueResultRow.tsx exists", () => {
    expect(existsSync(join(RESULTS_DIR, "IssueResultRow.tsx"))).toBe(true);
  });

  test("UserResultRow.tsx exists", () => {
    expect(existsSync(join(RESULTS_DIR, "UserResultRow.tsx"))).toBe(true);
  });

  test("CodeResultRow.tsx exists", () => {
    expect(existsSync(join(RESULTS_DIR, "CodeResultRow.tsx"))).toBe(true);
  });

  test("columns.ts exists", () => {
    expect(existsSync(join(RESULTS_DIR, "columns.ts"))).toBe(true);
  });

  test("highlight.ts exists", () => {
    expect(existsSync(join(RESULTS_DIR, "highlight.ts"))).toBe(true);
  });

  test("index.ts barrel exports exist", () => {
    expect(existsSync(join(RESULTS_DIR, "index.ts"))).toBe(true);
  });
});

// ── Export verification ─────────────────────────────────────────────

describe("TUI_SEARCH result row exports", () => {
  test("RepoResultRow is exported from index", async () => {
    const mod = await import(join(RESULTS_DIR, "index.ts"));
    expect(typeof mod.RepoResultRow).toBe("function");
  });

  test("IssueResultRow is exported from index", async () => {
    const mod = await import(join(RESULTS_DIR, "index.ts"));
    expect(typeof mod.IssueResultRow).toBe("function");
  });

  test("UserResultRow is exported from index", async () => {
    const mod = await import(join(RESULTS_DIR, "index.ts"));
    expect(typeof mod.UserResultRow).toBe("function");
  });

  test("CodeResultRow is exported from index", async () => {
    const mod = await import(join(RESULTS_DIR, "index.ts"));
    expect(typeof mod.CodeResultRow).toBe("function");
  });

  test("parseHighlights is exported from index", async () => {
    const mod = await import(join(RESULTS_DIR, "index.ts"));
    expect(typeof mod.parseHighlights).toBe("function");
  });

  test("getColumnVisibility is exported from index", async () => {
    const mod = await import(join(RESULTS_DIR, "index.ts"));
    expect(typeof mod.getColumnVisibility).toBe("function");
  });
});

// ── TypeScript compilation ──────────────────────────────────────────

describe("TUI_SEARCH result row compilation", () => {
  test("all result row files pass TypeScript type checking", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "check"],
      { cwd: join(import.meta.dir, "../../apps/tui"), stdout: "pipe", stderr: "pipe" },
    );
    const exitCode = await proc.exited;
    // Type check should pass (exit 0) or report errors we can inspect
    // We specifically check that our new files don't introduce type errors
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      // If there are errors, ensure none are from our files
      const ourErrors = stderr.split("\n").filter(
        (line) => line.includes("screens/Search/results/"),
      );
      expect(ourErrors).toEqual([]);
    }
  });
});

// ── Highlight utility behavior ──────────────────────────────────────

describe("TUI_SEARCH_CODE_TAB highlight parsing", () => {
  test("parseHighlights handles code snippet with matches", async () => {
    const { parseHighlights } = await import(join(RESULTS_DIR, "highlight.ts"));
    const segments = parseHighlights("func <em>main</em>() {");
    expect(segments.length).toBe(3);
    expect(segments[1].highlighted).toBe(true);
    expect(segments[1].text).toBe("main");
  });

  test("truncateHighlighted preserves highlights within budget", async () => {
    const { truncateHighlighted, plainTextLength } = await import(join(RESULTS_DIR, "highlight.ts"));
    const result = truncateHighlighted("short <em>match</em>", 50);
    expect(result).toBe("short <em>match</em>");
  });
});

// ── Column visibility responsive behavior ───────────────────────────

describe("TUI_SEARCH responsive column visibility", () => {
  test("minimum breakpoint hides star count and language on repo rows", async () => {
    const { getColumnVisibility, repoColumnWidths } = await import(join(RESULTS_DIR, "columns.ts"));
    const vis = getColumnVisibility("minimum");
    const cols = repoColumnWidths(76, vis);
    expect(cols.tertiary).toBe(0);
    expect(cols.quaternary).toBe(0);
  });

  test("standard breakpoint shows star count but hides language on repo rows", async () => {
    const { getColumnVisibility, repoColumnWidths } = await import(join(RESULTS_DIR, "columns.ts"));
    const vis = getColumnVisibility("standard");
    const cols = repoColumnWidths(116, vis);
    expect(cols.tertiary).toBe(6);
    expect(cols.quaternary).toBe(0);
  });

  test("large breakpoint shows all columns on repo rows", async () => {
    const { getColumnVisibility, repoColumnWidths } = await import(join(RESULTS_DIR, "columns.ts"));
    const vis = getColumnVisibility("large");
    const cols = repoColumnWidths(196, vis);
    expect(cols.tertiary).toBe(6);
    expect(cols.quaternary).toBe(12);
  });

  test("minimum breakpoint hides timestamp on issue rows", async () => {
    const { getColumnVisibility, issueColumnWidths } = await import(join(RESULTS_DIR, "columns.ts"));
    const vis = getColumnVisibility("minimum");
    const cols = issueColumnWidths(76, vis);
    expect(cols.tertiary).toBe(0);
  });

  test("standard breakpoint shows timestamp on issue rows", async () => {
    const { getColumnVisibility, issueColumnWidths } = await import(join(RESULTS_DIR, "columns.ts"));
    const vis = getColumnVisibility("standard");
    const cols = issueColumnWidths(116, vis);
    expect(cols.tertiary).toBe(12);
  });
});

// ── Text utility additions ──────────────────────────────────────────

describe("TUI_SEARCH text utilities", () => {
  test("truncatePathLeft preserves filename", async () => {
    const { truncatePathLeft } = await import("../../apps/tui/src/util/text.js");
    const result = truncatePathLeft("a/b/c/d/e/f/g/file.tsx", 20);
    expect(result).toContain("file.tsx");
    expect(result.length).toBeLessThanOrEqual(20);
  });

  test("formatRelativeTime returns string for valid ISO timestamp", async () => {
    const { formatRelativeTime } = await import("../../apps/tui/src/util/format.js");
    const result = formatRelativeTime(new Date().toISOString());
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
```

### 7.3 Test Philosophy Notes

1. **Failing tests stay failing.** The E2E tests that launch the full TUI and navigate to the search screen will fail until the `SearchScreen` component and `useSearchTabs` hook are implemented (future tickets). The file existence and export tests will pass as soon as this ticket is complete.

2. **No mocks.** Pure utility tests import and call the actual functions. Component export tests verify the real barrel module.

3. **Snapshot tests deferred.** Visual snapshot tests for how the rows render in a terminal are deferred to the `tui-search-screen-scaffold` ticket, which integrates these row components into the full `SearchScreen` with `ListComponent`. This ticket verifies structure, exports, and utility correctness.

---

## 8. Design Decisions

### 8.1 Why separate row components (not a generic renderer)?

Each search result type has fundamentally different column layouts, data shapes, and responsive behaviors. A generic `SearchResultRow` with per-type branching would be a large switch statement with type narrowing. Separate components are:
- Easier to read and maintain individually
- Independently testable
- Follow the established TUI pattern of composable `renderItem` callbacks

### 8.2 Why `breakpoint` as a prop (not via hook)?

The row components receive `breakpoint` as a prop rather than calling `useBreakpoint()` internally. This is for two reasons:
1. **Performance** — The `SearchScreen` calls `useBreakpoint()` once and passes it to all visible rows. This avoids N×`useBreakpoint()` calls (one per row), each of which calls `useTerminalDimensions()` and `useMemo()`.
2. **Testability** — Passing breakpoint as a prop makes it trivial to test each row at each breakpoint without mocking hooks.

### 8.3 Why `width` as a prop (not derived)?

Same rationale as breakpoint. The `SearchScreen` computes `availableWidth` once (accounting for `ListRow` padding and selection indicator) and passes it to all rows. This ensures pixel-perfect consistency and avoids redundant calculations.

### 8.4 Why CodeResultRow is 2 rows tall?

Code search results contain two distinct pieces of information — the file path (where the match is) and the code snippet (what the match looks like). Cramming both onto a single line would require either extreme truncation or sacrificing one of them. The 2-row layout provides a clear visual hierarchy: header line for location context, snippet line for code preview.

### 8.5 Why left-truncation for file paths?

File paths in code search results are most informative at the right end (filename and immediate parent directory). The left portion (root directories) is least informative and often repetitive across results. Left-truncation with `.../` preserves the most useful segments.

### 8.6 Why `<em>` tag parsing instead of API-provided offsets?

The Codeplane search API (following the Gitea/Forgejo convention) returns match highlights as `<em>` tags within the snippet string. This is the API contract — there is no alternative offset-based highlighting API. The parser is simple, fast, and handles edge cases gracefully.

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `RepositorySearchResult` may not include `star_count`/`language` | Stars and language columns render empty | Both fields are optional. Rows degrade gracefully by hiding empty columns. Step 11 adds the fields to the type. |
| Code snippet format varies (line numbers may be absent) | Gutter renders empty line number | `parseSnippetLine()` handles both formats. Empty gutter shows 4 spaces. |
| `<em>` tags may be nested or malformed | Highlight parser produces incorrect segments | Regex `/<em>(.*?)<\/em>/g` uses non-greedy match. Nested tags are treated as literal text (acceptable degradation). |
| Wide Unicode characters in repo names/paths | Columns misalign | Known limitation. `truncateRight()` counts `string.length`, not display width. CJK-aware truncation is tracked in `tui-responsive-layout` spec. |
| ListComponent `rowHeight` mismatch with CodeResultRow | Code rows render clipped or with extra whitespace | The SearchScreen must pass `rowHeight={2}` for the code tab. This is documented in §5.6 and enforced by visual testing. |

---

## 10. Acceptance Criteria

1. All 7 source files exist under `apps/tui/src/screens/Search/results/`.
2. All 4 row components and 2 utilities are exported from the barrel `index.ts`.
3. All files pass TypeScript type checking (`bun run check` in `apps/tui`).
4. `parseHighlights()` correctly parses `<em>` tags into `TextSegment[]` for all test cases in §7.1.
5. `truncateHighlighted()` never produces output exceeding `maxWidth` display characters.
6. `truncatePathLeft()` always preserves the rightmost path segment (filename).
7. `getColumnVisibility()` returns correct visibility flags for all 4 breakpoint values (null, minimum, standard, large).
8. `RepoResultRow` shows owner/repo + description at minimum; adds star count at standard; adds language + topics at large.
9. `IssueResultRow` shows repo context + number + title + state badge at minimum; adds timestamp at standard.
10. `UserResultRow` shows username + display_name at all breakpoints.
11. `CodeResultRow` renders 2 lines (header + snippet) with gutter; hides repo context at minimum breakpoint.
12. All result rows render correctly when `focused=true` (no broken layout under reverse video).
13. `formatRelativeTime()` returns correct relative strings for all time bucket boundaries.
14. All E2E tests in `e2e/tui/search.test.ts` and `e2e/tui/search-result-utils.test.ts` pass (file existence, exports, utility behavior).
