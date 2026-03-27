# Implementation Plan: tui-wiki-highlighted-text

## 1. Create `HighlightedText` Component
**File:** `apps/tui/src/components/HighlightedText.tsx`
- Implement the pure function `findSegments(text: string, query: string): TextSegment[]` for case-insensitive, non-overlapping match decomposition.
- Implement the pure function `truncateGraphemeAware(text: string, maxWidth: number): string` using `Intl.Segmenter` to safely truncate strings while respecting grapheme boundaries.
- Implement the `HighlightedTextInner` React component that accepts `text`, `query`, `color`, `highlightColor`, and `maxWidth` props.
- Utilize the `useTheme()` hook to retrieve `theme.primary` as the default highlight color if `highlightColor` is not explicitly provided.
- Apply text attributes such as `TextAttributes.BOLD` to the highlighted segments.
- Wrap the component in `React.memo` to ensure referential stability and prevent unnecessary re-renders.
- Export the component as `HighlightedText`.
- Export `_findSegments_FOR_TESTING` and `_truncateGraphemeAware_FOR_TESTING` to allow direct testing of the pure functions.

## 2. Register Component in Barrel File
**File:** `apps/tui/src/components/index.ts`
- Add the necessary exports to make the component available across the TUI workspace:
  ```typescript
  export { HighlightedText } from "./HighlightedText.js";
  export type { HighlightedTextProps } from "./HighlightedText.js";
  ```

## 3. Implement Unit and Integration Tests
**File:** `e2e/tui/wiki.test.ts`
- Create the test file dedicated to the wiki screen and `HighlightedText` component.
- Import `_findSegments_FOR_TESTING` and `_truncateGraphemeAware_FOR_TESTING` directly from the component file.
- Write unit tests for `findSegments` covering all edge cases, including empty queries, full matches, multiple non-overlapping matches, and unicode/emoji preservation.
- Write unit tests for `truncateGraphemeAware` covering string lengths under, exactly at, and over the `maxWidth`, as well as combined emoji (ZWJ sequences) truncation.
- Import `launchTUI`, `createMockAPIEnv`, and `TUITestInstance` from `./helpers.js` (or `./helpers.ts`).
- Write integration tests that launch the TUI, navigate to the wiki search screen, input search queries, and verify the correct text highlighting (ANSI SGR 1 bold + primary color) and truncation rendering via terminal snapshot comparisons at different breakpoints (80x24, 120x40, 200x60).