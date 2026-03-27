# Research Findings for `tui-repo-bookmarks-view`

## 1. Directory and Structure State
- **Target Directory:** `apps/tui/src/screens/Repository/` does not currently exist. The `Repository` screen scaffold (from the dependency `tui-repo-screen-scaffold`) and the `tabs/` structure must be created as part of this or the upstream ticket. The spec outlines precise files to create in this path.
- **Web UI & UI-Core:** Neither `apps/ui/` nor `packages/ui-core/` currently exist in this project state. This confirms that all data fetching for this specific implementation must use the provided workaround (e.g., direct `fetch` calls or a yet-to-be-provided `useRepoFetch`) as noted in the "Productionization Notes" section of the spec.

## 2. Missing Upstream Dependencies
- As stated in the spec's "Out of Scope" section, `tui-repo-tree-hooks` (which is supposed to provide `useBookmarks`, `repo-tree-types.ts`, and `useRepoFetch`) is not present in the current branch. This matches the risk register: *"Import the hook — tests will fail at the API level as expected per project policy."*

## 3. Existing TUI Infrastructure Context
All the required existing hooks and components mentioned in the spec are confirmed present and match the expected APIs:

### Layout and Breakpoints (`useLayout`)
- Located at `apps/tui/src/hooks/useLayout.ts`.
- Provides `width`, `height`, `contentHeight`, `breakpoint` (which resolves to `"large" | "standard" | "minimum" | null`), `modalWidth`, and `modalHeight`.
- Breakpoints map correctly to the standard sizes described in the design spec.

### Theme and Styling (`useTheme`)
- Located at `apps/tui/src/hooks/useTheme.ts`.
- Exposes standard tokens: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`.
- Text attributes are exported in `apps/tui/src/theme/tokens.ts` as `TextAttributes` with bitwise flags: `BOLD (1)`, `DIM (2)`, `UNDERLINE (4)`, `REVERSE (8)`.
- The spec correctly uses `TextAttributes.REVERSE | TextAttributes.BOLD` for focus styling.

### Mutation and Loading States (`useScreenLoading`, `useOptimisticMutation`)
- **`useScreenLoading`** (`apps/tui/src/hooks/useScreenLoading.ts`): Provides the screen-level loading lifecycle. Returns `showSpinner`, `showSkeleton`, `showError`, `loadingError`, `retry`, and `spinnerFrame`. Properly handles a sub-80ms spinner skip threshold and integrates with `LoadingProvider`.
- **`useOptimisticMutation`** (`apps/tui/src/hooks/useOptimisticMutation.ts`): Designed for rapid UI updates with automatic status-bar error flashes on revert. The signature expects `id`, `entityType`, `action`, `mutate`, `onOptimistic`, and `onRevert`. It manages its own loading state and properly catches server errors.

### Keybindings (`useScreenKeybindings`)
- Located at `apps/tui/src/hooks/useScreenKeybindings.ts`.
- Pushes scope to `PRIORITY.SCREEN`. Allows conditional handlers using a `when` function (e.g., `when: () => mode === "list"`).
- Integrates tightly with the `StatusBarHintsContext` to show interactive hotkeys on the bottom edge of the terminal.

### Components (`SkeletonList`)
- Located at `apps/tui/src/components/SkeletonList.tsx`.
- The spec's implementation accurately mirrors the props required by the component: `columns`, `metaWidth`, and `statusWidth`.
- It renders deterministic placeholder widths based on the terminal's `contentHeight`.

### Utilities (`text.ts`)
- `truncateRight` is available in `apps/tui/src/util/text.ts` and behaves precisely as needed for shortening long bookmark names gracefully in smaller terminal sizes.

## 4. OpenTUI Capabilities
- `@opentui/react` and `@opentui/core` provide the foundational elements (`<box>`, `<scrollbox>`, `<text>`, `<input>`) expected by the spec.
- The flexbox model used in the provided implementation plan (e.g., `flexDirection`, `flexGrow`, `padding`) completely aligns with the primitives exposed by OpenTUI.
- Form state management works identically to React DOM inputs but captures terminal keyboard focus via the `focused` boolean prop.

## 5. Next Steps
Based on these findings, the engineering spec is ready to be directly translated into code. The absence of `useBookmarks` and the target screen directory is an expected state. The developer implementing this can confidently drop the files into the designated paths, implement the provided code snippets directly, and rely on the existing hooks to function exactly as described.