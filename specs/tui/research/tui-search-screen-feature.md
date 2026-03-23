# TUI_SEARCH_SCREEN Codebase Research

Based on the engineering specification and the current state of the repository, here is the context and existing code patterns to help implement the `TUI_SEARCH_SCREEN` feature.

## 1. Routing and Navigation (Existing Context)

The search screen is already scaffolded in the central routing files, but currently points to a placeholder. You will need to wire it up to the new component.

- **Router Types**: `ScreenName.Search` is already defined in `apps/tui/src/router/types.ts`.
- **Registry (`apps/tui/src/router/registry.ts`)**:
  ```typescript
  [ScreenName.Search]: {
    component: PlaceholderScreen, // TODO: Update this to SearchScreen
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Search",
  },
  ```
- **Global Go-To Binding (`apps/tui/src/navigation/goToBindings.ts`)**:
  The `g s` keybinding is already configured to push the Search screen.

## Component Structure
```
apps/tui/src/screens/Search/
├── SearchScreen.tsx             # Main layout, SearchInput + TabBar + Results
├── useSearchLogic.ts            # Hooks, 300ms debounce, fetching 4 entity types
├── components/
│   ├── SearchResultList.tsx     # <ScrollableList> mapping, handling push()
│   └── SearchResultRow.tsx      # Entity-specific row renderers

e2e/tui/search.test.ts                 # All @microsoft/tui-test test cases
```

## 4. Key Implementation Reminders
- **Debouncing**: Ensure the 300ms timeout for the `debouncedQuery` is properly cleared on component unmount and subsequent keystrokes within `useSearchLogic.ts`.
- **Focus Targets**: You must track state for `focusTarget` (`'input' | 'list'`). OpenTUI's `<input>` naturally captures keys when focused; you must wire the `onBlur` via `Esc` or `Enter` to visually pass the focus state down to the `SearchResultList`.
- **Auto-Selection Effect**: When the 4 parallel requests resolve, the `useEffect` must gracefully shift `activeTab` to the first tab that has `>0` results if the currently active tab has `0` results.
- **Reverse Video**: Ensure `SearchResultRow` properly applies reverse video/primary accent when its index matches the `<ScrollableList>`'s internal focused index.