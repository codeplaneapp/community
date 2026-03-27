# Research Report: TUI Repository File Tree Context

Based on my investigation into the codebase, here is a comprehensive breakdown of the existing context, patterns, hooks, and utilities that will help implement the `tui-repo-file-tree` feature for the Codeplane TUI.

## 1. OpenTUI Components (`@opentui/react` and `@opentui/core`)

The TUI is built using OpenTUI's custom reconciler, exposing various layout primitives. The ones most relevant to the File Tree are:

- **`<box>`:** The primary layout primitive, using flexbox mechanics (e.g., `flexDirection="column"`, `flexGrow={1}`, `justifyContent`, `alignItems`). This will be used to layout the sidebar, nested components (BookmarkSelector, SearchInput), and the main container.
- **`<scrollbox>`:** Crucial for the file tree listing, especially since we map large deeply-nested directory structures into a flat list. It will naturally accept keyboard scrolling or imperative scrolling to keep the `focusedIndex` visible.
- **`<text>`:** Used for rendering the directory names, error/warning states, and file metadata. It supports foreground (`fg`) colors, which map well to `theme.primary`, `theme.muted`, `theme.warning`, and `theme.error`.

## 2. Layout and Responsiveness Hooks (`apps/tui/src/hooks`)

The `tui-repo-file-tree` needs to respond smoothly to terminal resizes, altering indentation and collapsing the sidebar when space runs out.

- **`useLayout()` (`useLayout.ts`):** 
  Returns a comprehensive `LayoutContext` encompassing `width`, `height`, `breakpoint` ("minimum", "standard", "large"), `contentHeight`, and `sidebarVisible`. It computes the sidebar's width dynamically (`getSidebarWidth` returns percentages) and also returns `sidebar` state (from `useSidebarState()`). This replaces inline width/sidebar computations and strictly bounds the responsive breakpoints.
  
- **`useResponsiveValue()` (`useResponsiveValue.ts`):** 
  Provides a clean way to define breakpoint-specific values. For the file tree, this is specifically indicated by the spec for indentation levels per depth:
  ```tsx
  const indentPerLevel = useResponsiveValue({ minimum: 1, standard: 2, large: 2 });
  ```

- **`useSidebarState()`:**
  Exposed via `useLayout()`, this handles user preference and auto-override for collapsing/expanding sidebars (e.g., `Ctrl+B` toggles visibility).

## 3. Interaction and Keybindings (`apps/tui/src/hooks/useScreenKeybindings.ts`)

- **`useScreenKeybindings(bindings, hints?)`:**
  A central hook that scopes keybindings to the current screen using the global `KeybindingProvider`. It pushes to `PRIORITY.SCREEN` and automatically cleans up on unmount.
  The spec requires multiple bindings for the file tree (e.g., `j/k` for navigation, `Enter/l` for selection, `/` for search, etc.).
  The hook automatically registers `StatusBarHint` combinations unless overridden. The File Tree's keybindings should be bundled directly into this hook when the sidebar is `focused`.

## 4. UI Feedback: Loading States (`apps/tui/src/hooks/useSpinner.ts`)

- **`useSpinner(active: boolean)`:**
  A highly optimized animation primitive. Instead of using `setInterval`, it registers a `Timeline` with OpenTUI's `engine`. It returns either a braille spinner frame (e.g., `⠋`, `⠙`) on Unicode terminals or ASCII frames (`-`, `\`, `|`, `/`) when active, and an empty string `""` when inactive. 
  This hook perfectly fits the spec's requirement for directory loading animation: `⟳ ` (which can be the `useSpinner` output if loading, or a static symbol otherwise).

## 5. String Manipulation & Truncation (`apps/tui/src/util/text.ts` & `truncate.ts`)

Because terminal real-estate is constrained, filenames in deeply nested directories easily overflow.

- **`truncateText(text: string, maxWidth: number)`:** 
  Available in `util/truncate.ts`, this optimally shrinks a string from the right and appends an ellipsis (`…`) if it exceeds `maxWidth`. It correctly handles Unicode lengths.
  To use this in the `FileTreeEntry`, we can calculate available width: `sidebarWidth - indent - iconWidth - padding`, and pass the name to `truncateText`.

## 6. Telemetry and Logging (`apps/tui/src/lib/`)

- **`telemetry.ts` (`emit`)**:
  Provides the `emit(name: string, properties?: Record<string, any>)` function. Automatically includes terminal dimensions, TUI version, and session ID. We must emit specific events matching the product spec (e.g., `tui.repo.file_tree.view`, `tui.repo.file_tree.expand_dir`).
  
- **`logger.ts` (`logger`)**:
  Exposes `logger.info`, `logger.warn`, `logger.error`, and `logger.debug`. Bound to standard error (`stderr`) and filtered by the `CODEPLANE_TUI_LOG_LEVEL` or `CODEPLANE_TUI_DEBUG` environment flags.

## Synthesis for Implementation

The `FileTree` component should:
1. Wrap its top-level element in a `<box flexDirection="column" height="100%">`.
2. Determine available dimensions from OpenTUI's `useLayout` hook to dynamically adjust truncations via `truncateText()`.
3. Feed the normalized and flattened nodes (from `useTreeState`) into a `<scrollbox>` listing `FileTreeEntry` items.
4. Render `FileTreeEntry` with appropriate prefixes, utilizing `useSpinner` if `entry.loading === true`.
5. Consume `useScreenKeybindings` when `focused` is true, delegating logic back to `useTreeState` functions like `moveFocusDown`, `expandOrSelect`, etc.
6. Publish operational telemetry by calling `emit(...)` directly during user interactions or fetch results.