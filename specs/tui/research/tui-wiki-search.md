# Codebase Research: TUI_WIKI_SEARCH

This document provides the context and codebase patterns necessary to implement the `tui-wiki-search` ticket, derived from an analysis of the Codeplane TUI repository. It outlines missing dependencies to create, existing patterns to follow, and architectural alignments.

## 1. Current State & Missing Components

Several components mentioned in the Engineering Specification do not currently exist and must be implemented as part of (or prior to) this ticket:

*   **Wiki Screen Directory:** The directory `apps/tui/src/screens/Wiki` does not exist. You will need to scaffold `WikiListScreen.tsx`, the `components/` subdirectory (for `WikiSearchInput.tsx` and `WikiListRow.tsx`), and the `hooks/` subdirectory (for `useWikiSearch.ts`).
*   **`HighlightedText` Component:** The reusable text highlighting component does not exist in `apps/tui/src/components`. You will need to build `apps/tui/src/components/HighlightedText.tsx` to handle case-insensitive segment matching and styling.
*   **`useWikiPages` Hook:** The `@codeplane/ui-core` package is not present in the workspace, meaning `useWikiPages` has not been implemented. You must implement the data fetching hook locally (e.g., `apps/tui/src/hooks/useWikiPages.ts`), utilizing the existing data fetching primitives.
*   **Debounce Hook:** No generic `useDebounce` hook exists. The debouncing logic for the search input should be written directly inside `useWikiSearch.ts` using `useEffect` and `setTimeout`, as advised by the spec.

## 2. Existing Patterns to Leverage

### A. Data Fetching (`useRepoFetch.ts`)
Instead of `@codeplane/ui-core`, the TUI implements data fetching via `apps/tui/src/hooks/useRepoFetch.ts`. This provides an authenticated `get` method and standard error handling.

```typescript
import { useRepoFetch, toLoadingError } from "../../hooks/useRepoFetch.js";

// Usage in your useWikiPages.ts or useWikiSearch.ts hook
const { get } = useRepoFetch();

// Fetching with an AbortController for debounce cancellation
const controller = new AbortController();
get<WikiResponse>(`/api/repos/${owner}/${repo}/wiki?q=${query}&page=1&per_page=30`, { 
  signal: controller.signal 
})
.catch(err => setError(toLoadingError(err)));
```

### B. Keyboard Interception (`useScreenKeybindings.ts`)
The TUI uses a priority-based keybinding context to handle navigation and shortcuts. You should register the `/` keybinding at the screen level using `useScreenKeybindings`.

```typescript
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

useScreenKeybindings([
  { 
    key: "/", 
    description: "Search wiki", 
    group: "Navigation", 
    handler: () => focusSearchInput() 
  },
  // Map Esc to go back or clear search depending on state
  { 
    key: "Esc", 
    description: "Back / Clear", 
    group: "Navigation", 
    handler: handleEsc 
  }
]);
```
*Note: In `WikiSearchInput.tsx`, you will need to intercept keyboard events directly on the `<input>` element to handle `Enter`, `Esc`, `Ctrl+U`, and `Ctrl+W` while focused, preventing them from bubbling up to the list view.*

### C. Pagination Loading (`usePaginationLoading.ts`)
For the memory-capped, page-based scrolling mentioned in the spec (500 items, `page=1&per_page=30`), refer to `apps/tui/src/hooks/usePaginationLoading.ts`.
It provides standardized state for inline pagination loading and retry mechanisms that you can adapt for the Wiki List.

### D. OpenTUI Primitives & Responsiveness
The TUI relies on OpenTUI. For responsive widths (100% at 80x24, 70% at 120x40, 60% at 200x60), you should utilize standard OpenTUI layout hooks.

```typescript
import { useTerminalDimensions } from "@opentui/core";
// or
import { useBreakpoint } from "../../hooks/useBreakpoint.js"; 

const { width } = useTerminalDimensions();
// Calculate width allocations dynamically based on `width`.
```

## 3. Implementation Step-by-Step Context

1.  **State Management (`useWikiSearch.ts`)**
    *   Create internal state `searchQuery` (raw text) and `activeQuery` (debounced text passed to the API).
    *   Use `useEffect` with a 300ms timeout for the debounce. Ensure you call `clearTimeout` in the cleanup function to prevent memory leaks and cancel pending requests when typing rapidly.
2.  **Search Input Component (`WikiSearchInput.tsx`)**
    *   Render `<box flexDirection="row">` containing `<text color="muted">/ </text>` followed by the OpenTUI `<input>` primitive.
    *   Manually implement `Ctrl+U` (clear text) and `Ctrl+W` (delete word regex) in the `<input onChange={...}>` or key handler.
3.  **Highlighting (`HighlightedText.tsx`)**
    *   Create this as a pure, memoized functional component (`React.memo`).
    *   It should use `String.prototype.matchAll` with a case-insensitive regex built from the query to find start/end indices of matches.
    *   Split the text into segments and map them to OpenTUI `<text>` elements. Apply `color="primary"` and `bold={true}` to matching segments.
4.  **Testing Strategy**
    *   All new implementations should be verified against the test specification in `e2e/tui/wiki.test.ts` using `@microsoft/tui-test`.