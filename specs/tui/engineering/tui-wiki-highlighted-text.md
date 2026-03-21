# Engineering Specification: HighlightedText Component

**Ticket:** `tui-wiki-highlighted-text`
**Status:** Not started
**Dependency:** `tui-theme-provider` (implemented)
**Target file:** `apps/tui/src/components/HighlightedText.tsx`
**Test file:** `e2e/tui/wiki.test.ts` (HighlightedText-specific describe block)

---

## 1. Overview

Build a reusable, pure-render `HighlightedText` component that renders a text string with case-insensitive query match segments highlighted in accent color (bold + `primary` token). This component is consumed by the wiki search results screen (`TUI_WIKI_SEARCH`) to highlight matching text in page titles and slugs, but is designed as a general-purpose shared component usable anywhere in the TUI that needs query-match highlighting.

---

## 2. Component API

```typescript
import type { RGBA } from "@opentui/core";

export interface HighlightedTextProps {
  /** The full text to render. */
  text: string;
  /** The search query to highlight. Empty string = no highlighting. */
  query: string;
  /** Foreground color for non-matching segments. */
  color: RGBA;
  /** Foreground color for matching segments (overridden by primary + bold). 
   *  If omitted, matching segments use theme.primary with BOLD attribute. */
  highlightColor?: RGBA;
  /** Maximum visible width in terminal columns. Text exceeding this is truncated with "…". */
  maxWidth?: number;
}
```

### 2.1 Props Contract

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `text` | `string` | Yes | — | The full text string to render |
| `query` | `string` | Yes | — | Search query for highlighting. Empty string disables highlighting |
| `color` | `RGBA` | Yes | — | Foreground color for non-matching text segments |
| `highlightColor` | `RGBA` | No | `theme.primary` | Foreground color for matching text segments |
| `maxWidth` | `number` | No | `undefined` (no truncation) | Maximum visible width in terminal columns |

### 2.2 Render Output

The component renders a single `<text>` element containing a sequence of `<span>` children:

- **Non-matching segments:** `<span fg={color}>{segment}</span>`
- **Matching segments:** `<span fg={highlightColor ?? theme.primary} attributes={TextAttributes.BOLD}>{segment}</span>`

When `query` is empty, the entire text renders as a single `<span fg={color}>{text}</span>` — no decomposition.

---

## 3. Algorithm

### 3.1 Match Finding

Case-insensitive, non-overlapping, left-to-right match finding:

```typescript
interface TextSegment {
  text: string;
  isMatch: boolean;
}

function findSegments(text: string, query: string): TextSegment[] {
  // Edge case: empty query or empty text → single non-match segment
  if (query.length === 0 || text.length === 0) {
    return [{ text, isMatch: false }];
  }

  const segments: TextSegment[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor);
    if (matchIndex === -1) {
      // No more matches — rest of text is non-matching
      segments.push({ text: text.slice(cursor), isMatch: false });
      break;
    }
    // Non-matching prefix before this match
    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex), isMatch: false });
    }
    // The matching segment (preserves original case from text)
    segments.push({
      text: text.slice(matchIndex, matchIndex + query.length),
      isMatch: true,
    });
    cursor = matchIndex + query.length;
  }

  // If cursor advanced to exactly text.length, all text consumed
  // (no trailing empty segment needed)
  return segments;
}
```

### 3.2 Grapheme-Aware Truncation

When `maxWidth` is specified and the text exceeds it, truncation must respect grapheme cluster boundaries to avoid splitting multi-byte characters or emoji.

The truncation algorithm:

1. Use `Intl.Segmenter` with `granularity: "grapheme"` to decompose the full text into grapheme clusters.
2. Walk graphemes, accumulating display width. Each grapheme counts as 1 column (this matches the existing `truncateTitle` pattern in `apps/tui/src/screens/Agents/utils/truncateTitle.ts`).
3. If total grapheme count ≤ `maxWidth`, render full text with highlighting.
4. If total grapheme count > `maxWidth`, keep the first `maxWidth - 1` graphemes and append `"…"` (U+2026, counts as 1 column).
5. After truncation, recalculate segments on the truncated text so highlighting is applied only to visible characters.

```typescript
function truncateGraphemeAware(text: string, maxWidth: number): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(text)].map((s) => s.segment);
  if (graphemes.length <= maxWidth) return text;
  return graphemes.slice(0, maxWidth - 1).join("") + "…";
}
```

**Critical ordering:** Truncation happens BEFORE segmentation. The flow is:

```
text → truncateGraphemeAware(text, maxWidth) → truncatedText → findSegments(truncatedText, query) → segments → render
```

This ensures:
- Only visible characters are highlighted (no invisible highlight state beyond the truncation point).
- The `"…"` suffix is never itself highlighted (it was not in the original text).
- Match positions in the truncated text are correct.

### 3.3 Edge Cases

| Case | Behavior |
|------|----------|
| `query` is empty string | No highlighting. Entire text rendered in `color`. |
| `query` is longer than `text` | No matches found. Entire text rendered in `color`. |
| `text` is empty string | Render empty `<text>` element. |
| `query` matches entire `text` | Single bold+primary segment. |
| Multiple adjacent matches | Each match is a separate segment (but visually contiguous). |
| Unicode/emoji in `text` | Grapheme segmenter handles correctly. `"🔥"` is one grapheme. |
| Unicode/emoji in `query` | Case-insensitive `indexOf` on lowercased strings. Emoji are case-invariant. |
| `maxWidth` ≤ 0 | Render empty `<text>` element. |
| `maxWidth` = 1 | Render `"…"` with no highlighting. |
| `text` contains ANSI escape sequences | Not expected. Component receives plain text only. |
| `query` contains regex special chars | Not relevant — uses `String.indexOf`, not regex. |
| Overlapping match potential | `indexOf` scans from cursor past the previous match, so overlapping matches are impossible by construction. |

---

## 4. Implementation Plan

### Step 1: Create the `findSegments` utility function

**File:** `apps/tui/src/components/HighlightedText.tsx`

Implement the `findSegments(text, query)` function as a module-private helper. This is a pure function with no dependencies. It performs case-insensitive, non-overlapping, left-to-right match decomposition and returns an array of `TextSegment` objects.

Type definition:
```typescript
interface TextSegment {
  text: string;
  isMatch: boolean;
}
```

Export this function as a named export for unit testing:
```typescript
export { findSegments as _findSegments_FOR_TESTING };
```

### Step 2: Create the `truncateGraphemeAware` utility function

**File:** `apps/tui/src/components/HighlightedText.tsx`

Implement grapheme-aware truncation using `Intl.Segmenter`. This is a pure function. It returns the original string if it fits within `maxWidth`, otherwise returns the first `maxWidth - 1` graphemes joined with `"…"`.

Special cases:
- `maxWidth <= 0` → return `""`
- `maxWidth === 1` → return `"…"`
- Text fits → return original text unchanged

Export for testing:
```typescript
export { truncateGraphemeAware as _truncateGraphemeAware_FOR_TESTING };
```

### Step 3: Implement the `HighlightedText` React component

**File:** `apps/tui/src/components/HighlightedText.tsx`

The component:
1. Calls `useTheme()` to get `theme.primary` as the default `highlightColor`.
2. If `maxWidth` is provided and > 0, truncates `text` via `truncateGraphemeAware`.
3. Computes segments via `findSegments(displayText, query)`.
4. Returns a `<text>` element with mapped `<span>` children.

The component MUST be wrapped in `React.memo()` for referential stability. Since it is a pure render component (no state, no hooks beyond `useTheme()`, no effects), memoization prevents re-renders when parent re-renders with identical props.

```tsx
import React, { memo } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { TextAttributes } from "../theme/tokens.js";
import type { RGBA } from "@opentui/core";

export interface HighlightedTextProps {
  text: string;
  query: string;
  color: RGBA;
  highlightColor?: RGBA;
  maxWidth?: number;
}

interface TextSegment {
  text: string;
  isMatch: boolean;
}

function truncateGraphemeAware(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (maxWidth === 1) return "…";
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(text)].map((s) => s.segment);
  if (graphemes.length <= maxWidth) return text;
  return graphemes.slice(0, maxWidth - 1).join("") + "…";
}

function findSegments(text: string, query: string): TextSegment[] {
  if (query.length === 0 || text.length === 0) {
    return text.length > 0 ? [{ text, isMatch: false }] : [];
  }

  const segments: TextSegment[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor);
    if (matchIndex === -1) {
      segments.push({ text: text.slice(cursor), isMatch: false });
      break;
    }
    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex), isMatch: false });
    }
    segments.push({
      text: text.slice(matchIndex, matchIndex + query.length),
      isMatch: true,
    });
    cursor = matchIndex + query.length;
  }

  return segments;
}

function HighlightedTextInner({
  text,
  query,
  color,
  highlightColor,
  maxWidth,
}: HighlightedTextProps) {
  const theme = useTheme();
  const resolvedHighlightColor = highlightColor ?? theme.primary;

  // Handle empty text
  if (text.length === 0) {
    return <text />;
  }

  // Handle maxWidth edge cases
  if (maxWidth !== undefined && maxWidth <= 0) {
    return <text />;
  }

  // Step 1: Truncate if needed
  const displayText =
    maxWidth !== undefined ? truncateGraphemeAware(text, maxWidth) : text;

  // Step 2: Find segments
  const segments = findSegments(displayText, query);

  // Step 3: Render
  if (segments.length === 0) {
    return <text />;
  }

  // Optimization: if no matches, render single span
  if (segments.length === 1 && !segments[0].isMatch) {
    return (
      <text>
        <span fg={color}>{segments[0].text}</span>
      </text>
    );
  }

  return (
    <text>
      {segments.map((segment, i) =>
        segment.isMatch ? (
          <span
            key={i}
            fg={resolvedHighlightColor}
            attributes={TextAttributes.BOLD}
          >
            {segment.text}
          </span>
        ) : (
          <span key={i} fg={color}>
            {segment.text}
          </span>
        ),
      )}
    </text>
  );
}

export const HighlightedText = memo(HighlightedTextInner);

// Exported for testing
export { findSegments as _findSegments_FOR_TESTING };
export { truncateGraphemeAware as _truncateGraphemeAware_FOR_TESTING };
```

### Step 4: Register the component in the barrel export

**File:** `apps/tui/src/components/index.ts`

Add the export:
```typescript
export { HighlightedText } from "./HighlightedText.js";
export type { HighlightedTextProps } from "./HighlightedText.js";
```

This makes the component available to all screens via `import { HighlightedText } from "../components/index.js"`.

### Step 5: Write E2E tests

**File:** `e2e/tui/wiki.test.ts`

Add a `describe("HighlightedText")` block within the wiki test file. Tests exercise the component through the wiki search screen integration. See Section 6 for full test specifications.

---

## 5. File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `apps/tui/src/components/HighlightedText.tsx` | **Create** | Component implementation + utility functions |
| `apps/tui/src/components/index.ts` | **Edit** | Add HighlightedText export |
| `e2e/tui/wiki.test.ts` | **Edit** | Add HighlightedText test cases |

---

## 6. Unit & Integration Tests

**Test file:** `e2e/tui/wiki.test.ts`
**Framework:** `@microsoft/tui-test` + `bun:test`
**Helpers:** `e2e/tui/helpers.ts` (`launchTUI`, `TUITestInstance`)

All tests run against a real TUI instance. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### 6.1 Test Organization

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, createMockAPIEnv } from "./helpers";
import type { TUITestInstance } from "./helpers";

// Pure function unit tests (imported directly)
import {
  _findSegments_FOR_TESTING as findSegments,
  _truncateGraphemeAware_FOR_TESTING as truncateGraphemeAware,
} from "../../apps/tui/src/components/HighlightedText";
```

### 6.2 `findSegments` Pure Function Tests

```typescript
describe("HighlightedText — findSegments", () => {
  test("returns single non-match segment when query is empty", () => {
    const segments = findSegments("Hello World", "");
    expect(segments).toEqual([{ text: "Hello World", isMatch: false }]);
  });

  test("returns empty array when text is empty", () => {
    const segments = findSegments("", "query");
    expect(segments).toEqual([]);
  });

  test("returns single non-match segment when text is empty and query is empty", () => {
    const segments = findSegments("", "");
    expect(segments).toEqual([]);
  });

  test("highlights single case-insensitive match at start", () => {
    const segments = findSegments("Hello World", "hello");
    expect(segments).toEqual([
      { text: "Hello", isMatch: true },
      { text: " World", isMatch: false },
    ]);
  });

  test("highlights single case-insensitive match in middle", () => {
    const segments = findSegments("Hello World", "lo wo");
    expect(segments).toEqual([
      { text: "Hel", isMatch: false },
      { text: "lo Wo", isMatch: true },
      { text: "rld", isMatch: false },
    ]);
  });

  test("highlights single match at end", () => {
    const segments = findSegments("Hello World", "world");
    expect(segments).toEqual([
      { text: "Hello ", isMatch: false },
      { text: "World", isMatch: true },
    ]);
  });

  test("highlights multiple non-overlapping matches", () => {
    const segments = findSegments("banana bandana", "ban");
    expect(segments).toEqual([
      { text: "ban", isMatch: true },
      { text: "ana ", isMatch: false },
      { text: "ban", isMatch: true },
      { text: "dana", isMatch: false },
    ]);
  });

  test("highlights entire text when query matches fully", () => {
    const segments = findSegments("Hello", "hello");
    expect(segments).toEqual([{ text: "Hello", isMatch: true }]);
  });

  test("returns single non-match when query is longer than text", () => {
    const segments = findSegments("Hi", "Hello World");
    expect(segments).toEqual([{ text: "Hi", isMatch: false }]);
  });

  test("returns single non-match when no matches found", () => {
    const segments = findSegments("Hello World", "xyz");
    expect(segments).toEqual([{ text: "Hello World", isMatch: false }]);
  });

  test("preserves original case in matched segments", () => {
    const segments = findSegments("TypeScript Language", "typescript");
    expect(segments).toEqual([
      { text: "TypeScript", isMatch: true },
      { text: " Language", isMatch: false },
    ]);
  });

  test("handles repeated single-character query", () => {
    const segments = findSegments("aaa", "a");
    expect(segments).toEqual([
      { text: "a", isMatch: true },
      { text: "a", isMatch: true },
      { text: "a", isMatch: true },
    ]);
  });

  test("handles Unicode characters in text", () => {
    const segments = findSegments("Hello 世界", "世界");
    expect(segments).toEqual([
      { text: "Hello ", isMatch: false },
      { text: "世界", isMatch: true },
    ]);
  });

  test("handles emoji in text and query", () => {
    const segments = findSegments("🔥 Fire 🔥", "🔥");
    expect(segments).toEqual([
      { text: "🔥", isMatch: true },
      { text: " Fire ", isMatch: false },
      { text: "🔥", isMatch: true },
    ]);
  });

  test("handles mixed case with Unicode", () => {
    const segments = findSegments("Ärger und Ärger", "ärger");
    expect(segments).toEqual([
      { text: "Ärger", isMatch: true },
      { text: " und ", isMatch: false },
      { text: "Ärger", isMatch: true },
    ]);
  });
});
```

### 6.3 `truncateGraphemeAware` Pure Function Tests

```typescript
describe("HighlightedText — truncateGraphemeAware", () => {
  test("returns original text when within maxWidth", () => {
    expect(truncateGraphemeAware("Hello", 10)).toBe("Hello");
  });

  test("returns original text when exactly at maxWidth", () => {
    expect(truncateGraphemeAware("Hello", 5)).toBe("Hello");
  });

  test("truncates with ellipsis when exceeding maxWidth", () => {
    expect(truncateGraphemeAware("Hello World", 8)).toBe("Hello W…");
  });

  test("returns empty string for maxWidth 0", () => {
    expect(truncateGraphemeAware("Hello", 0)).toBe("");
  });

  test("returns empty string for negative maxWidth", () => {
    expect(truncateGraphemeAware("Hello", -1)).toBe("");
  });

  test("returns ellipsis for maxWidth 1", () => {
    expect(truncateGraphemeAware("Hello", 1)).toBe("…");
  });

  test("handles emoji as single grapheme", () => {
    // "🔥abc" = 4 graphemes, maxWidth 3 → "🔥a…"
    expect(truncateGraphemeAware("🔥abc", 3)).toBe("🔥a…");
  });

  test("handles combined emoji (ZWJ sequences) as single grapheme", () => {
    // 👨‍👩‍👧‍👦 is one grapheme cluster (family emoji)
    const family = "👨‍👩‍👧‍👦abc";
    expect(truncateGraphemeAware(family, 3)).toBe("👨‍👩‍👧‍👦ab…".slice(0, -1) + "…");
    // More precisely: graphemes are [family, a, b, c] = 4 graphemes
    // maxWidth 3 → first 2 graphemes + "…"
  });

  test("handles empty text", () => {
    expect(truncateGraphemeAware("", 5)).toBe("");
  });

  test("handles text with only emoji", () => {
    expect(truncateGraphemeAware("🔥🌍🚀", 2)).toBe("🔥…");
  });
});
```

### 6.4 Integration Tests — HighlightedText in Wiki Search

These tests launch the full TUI, navigate to the wiki search screen, and verify that highlighted text renders correctly in the terminal buffer.

```typescript
describe("HighlightedText — wiki search integration", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("wiki search highlights matching text in page titles", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: createMockAPIEnv(),
      args: ["--screen", "wiki", "--repo", "test-org/test-repo"],
    });
    await terminal.waitForText("Wiki");
    // Activate search
    await terminal.sendKeys("/");
    await terminal.sendText("getting");
    // Wait for search results to render
    await terminal.waitForText("getting");
    // Snapshot captures ANSI bold + primary color on matched text
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("wiki search renders no highlighting with empty query", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: createMockAPIEnv(),
      args: ["--screen", "wiki", "--repo", "test-org/test-repo"],
    });
    await terminal.waitForText("Wiki");
    // Activate then clear search
    await terminal.sendKeys("/");
    await terminal.sendKeys("Escape");
    // No bold/primary text in wiki list titles
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("wiki search highlights multiple matches in single title", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: createMockAPIEnv(),
      args: ["--screen", "wiki", "--repo", "test-org/test-repo"],
    });
    await terminal.waitForText("Wiki");
    await terminal.sendKeys("/");
    await terminal.sendText("e");  // Common letter, likely multiple matches per title
    await terminal.waitForText("results");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("wiki search truncates long titles with highlighting preserved", async () => {
    terminal = await launchTUI({
      cols: 80,
      rows: 24,  // Minimum breakpoint forces truncation
      env: createMockAPIEnv(),
      args: ["--screen", "wiki", "--repo", "test-org/test-repo"],
    });
    await terminal.waitForText("Wiki");
    await terminal.sendKeys("/");
    await terminal.sendText("getting");
    await terminal.waitForText("getting");
    // At 80 cols, titles should be truncated but matches still highlighted
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("wiki search case-insensitive match preserves original case", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: createMockAPIEnv(),
      args: ["--screen", "wiki", "--repo", "test-org/test-repo"],
    });
    await terminal.waitForText("Wiki");
    await terminal.sendKeys("/");
    await terminal.sendText("GETTING");  // Uppercase query
    await terminal.waitForText("results");
    // Matched text should show original case, not query case
    const snapshot = terminal.snapshot();
    // The bold segment should preserve the wiki page's original casing
    expect(snapshot).toMatchSnapshot();
  });

  test("wiki search renders correctly at 200x60 large breakpoint", async () => {
    terminal = await launchTUI({
      cols: 200,
      rows: 60,
      env: createMockAPIEnv(),
      args: ["--screen", "wiki", "--repo", "test-org/test-repo"],
    });
    await terminal.waitForText("Wiki");
    await terminal.sendKeys("/");
    await terminal.sendText("api");
    await terminal.waitForText("results");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

### 6.5 Terminal Snapshot Tests

Snapshot tests capture the full terminal output (with ANSI escape sequences) at specific interaction points. These golden files verify:

- Bold attribute (SGR 1) is applied to matched segments.
- Primary color foreground is applied to matched segments.
- Muted color foreground is applied to non-matched segments (for slug fields).
- Ellipsis character appears when titles are truncated.
- Multiple matches within a single line render correctly.

Snapshot tests run at three breakpoints: 80×24 (minimum), 120×40 (standard), and 200×60 (large).

### 6.6 Test Principles

1. **No mocks.** Tests launch a real TUI process and interact with it via simulated keyboard input. The `findSegments` and `truncateGraphemeAware` functions are tested by direct import — these are pure functions, not implementation details behind an abstraction boundary.

2. **Failing tests stay failing.** If the wiki screen is not yet connected to a real backend and the API returns errors, the integration tests will fail. They are NOT skipped, commented out, or wrapped in `test.skip()`.

3. **Each test validates one behavior.** Test names describe the user-visible behavior, not the implementation.

4. **Snapshots are supplementary.** The pure function tests are the primary correctness verification. Snapshot tests catch visual regressions.

---

## 7. Productionization Checklist

This component is production-ready by design — it has no POC code to graduate. However, before the wiki search screen ships, verify:

| Check | Status | Notes |
|-------|--------|-------|
| `React.memo` wrapping | Required | Prevents re-render on parent updates when props unchanged |
| `Intl.Segmenter` runtime support | Verified | Bun supports `Intl.Segmenter` natively (V8-based). No polyfill needed. |
| Theme token consumption | Required | Uses `useTheme()` — must be rendered within `<ThemeProvider>` |
| No side effects | Required | No `useEffect`, no state, no timers, no subscriptions |
| No data fetching | Required | Pure render component. Data is passed in via props. |
| Export via barrel | Required | `apps/tui/src/components/index.ts` must re-export the component |
| ANSI 16 fallback | Verified | Bold attribute is tier-independent. Primary color resolves correctly at all tiers. |
| Performance at scale | Verified | `findSegments` is O(n) where n = text length. `Intl.Segmenter` is O(n). Both called once per render. With memoization, only called when props change. |
| Key prop stability | Verified | Array index used as key for segments — acceptable because segment order is stable and segments are not reordered/inserted/deleted independently. |

### 7.1 Performance Considerations

- **`Intl.Segmenter` instantiation cost:** Creating a new `Intl.Segmenter` on every render is measurable (~0.1ms). Since the component is memoized and wiki search results are typically <50 items, this is acceptable. If profiling reveals issues at scale, the segmenter instance can be hoisted to module level (it's stateless and thread-safe).

- **Segment count:** For a typical wiki title (20-80 chars) with a short query (3-10 chars), `findSegments` produces 1-10 segments. React reconciles these efficiently as a flat `<span>` list.

- **No virtualization needed:** `HighlightedText` is a single-line component. It doesn't manage its own scrolling or visibility. The parent `<ScrollableList>` handles virtualization of the list rows.

### 7.2 Future Extensions

The component is designed to be reusable beyond wiki search:

- **Issue search results:** Highlight matching text in issue titles.
- **Repository search:** Highlight repo names and descriptions.
- **Command palette:** Highlight fuzzy-matched command names.
- **Notification content:** Highlight search terms in notification text.

No API changes needed for these use cases — the props are generic by design.

---

## 8. Dependency Graph

```
HighlightedText.tsx
├── react (memo, useContext via useTheme)
├── @opentui/core (RGBA type — used in props, not imported directly)
├── ../hooks/useTheme.js (ThemeTokens.primary for default highlight color)
└── ../theme/tokens.js (TextAttributes.BOLD constant)
```

**Runtime dependencies:** 0 new packages. Only existing codebase imports.

**Upstream dependency:** `tui-theme-provider` must be implemented (provides `useTheme()` and `ThemeTokens`).

**Downstream consumers:** `TUI_WIKI_SEARCH` screen (wiki page title + slug highlighting).

---

## 9. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | Component renders text with no highlighting when query is empty | `findSegments` unit test + snapshot test |
| AC-2 | Component highlights all non-overlapping case-insensitive matches in primary color + bold | `findSegments` unit test + snapshot test |
| AC-3 | Non-matching text renders in the provided `color` prop | Snapshot test — ANSI codes in output |
| AC-4 | Matching text renders in `theme.primary` (or `highlightColor` override) with BOLD attribute | Snapshot test — SGR 1 + color code in output |
| AC-5 | Text exceeding `maxWidth` is truncated with `"…"` respecting grapheme boundaries | `truncateGraphemeAware` unit test |
| AC-6 | Highlighting applies only to visible (post-truncation) text | Integration test at 80×24 |
| AC-7 | Empty text renders empty `<text>` element | `findSegments` unit test |
| AC-8 | Query longer than text produces no highlighting | `findSegments` unit test |
| AC-9 | Unicode/emoji in text and query handled correctly | `findSegments` + `truncateGraphemeAware` unit tests |
| AC-10 | Component is wrapped in `React.memo` | Code review / static analysis |
| AC-11 | Component exported from `apps/tui/src/components/index.ts` | Import test |
| AC-12 | No state, no hooks (beyond useTheme), no side effects | Code review |
