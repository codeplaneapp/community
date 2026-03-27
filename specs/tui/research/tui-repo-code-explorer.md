# TUI Code Explorer Research Findings

Based on a comprehensive search of the current codebase in `/Users/williamcory/codeplane`, here are the findings to help implement the `tui-repo-code-explorer` feature.

## 1. Missing Dependency Artifacts

Per the engineering spec, there are several prerequisite artifacts and directories that are expected to exist. However, the current repository state shows that they are not yet implemented or are not present in this workspace:
- **`apps/tui/src/screens/Repository/`**: This directory does not exist yet. Only `Agents` and `PlaceholderScreen.tsx` are currently present under `apps/tui/src/screens/`.
- **`packages/ui-core/` & `apps/ui/src/`**: These directories do not exist in the monorepo root. Data fetching hooks like `useRepoTree`, `useFileContent`, and `useBookmarks` are not yet available.
- **`tui-repo-sidebar-split-layout`**: `SplitLayout.tsx` and `useSplitFocus.ts` are missing from `apps/tui/src/components/` and `apps/tui/src/hooks/` respectively.

## 2. OpenTUI Components (`context/opentui/`)

The OpenTUI React types (`context/opentui/packages/react/src/types/components.ts`) provide the structural foundation for the requested components:
- **`<box>`**: Supports `flexDirection`, `width`, `height`, `padding`, `border`, `focused`, `justifyContent`, `alignItems`, etc.
- **`<scrollbox>`**: Inherits container properties, plus `focused`.
- **`<text>`**: Supports styling, `attributes` (1=bold, 2=dim), and `truncate` properties.
- **`<code>`**: Takes `content`, `filetype`, and `syntaxStyle`.
- **`<markdown>`**: Takes `content` and `syntaxStyle`.
- **`<input>`**: Accepts `placeholder`, `value`, `focused`, `onInput`, `onChange`, and `onSubmit`.

## 3. Existing TUI Infrastructure (`apps/tui/src/`)

### Layout Context (`useLayout.ts`)
The `useLayout()` hook integrates tightly with OpenTUI's `useTerminalDimensions()` and provides responsive design variables:
- `width` and `height` of the terminal.
- `sidebarVisible` (boolean) and `sidebarWidth` (string percentage, e.g., "25%").
- `modalWidth` and `modalHeight` (string percentages).
- `contentHeight` (available rows excluding header/status bar).

### Screen Keybindings (`useScreenKeybindings.ts`)
The `useScreenKeybindings(bindings, hints)` hook is used to register localized keybindings and status bar hints when a screen or tab mounts:
- Associates key strings (e.g., `j`, `k`, `Enter`, `B`) with functions.
- Pushes the keybinding scope at `PRIORITY.SCREEN`.
- Automatically updates the status bar with the provided shortcut hints.

### Overlays / Modals (`useOverlay.ts`)
The `useOverlay()` hook allows interaction with the global overlay manager:
- Returns `activeOverlay`, `openOverlay`, `closeOverlay`, and `isOpen`.
- Useful for toggling the `BookmarkPicker` modal (though the spec requests rendering it conditionally inside the tab using absolute positioning).

### Text Utilities (`util/text.ts`)
Several utility functions exist for truncating text and rendering the breadcrumbs and file names cleanly:
- `truncateBreadcrumb(segments, maxWidth)`: Useful for the path breadcrumb in the `FileTree`.
- `truncateRight(text, maxWidth)`: Replaces the end of a string with `…`.
- `fitWidth(text, width, align)`: Pads or truncates text to fit a specific column width.

### Telemetry (`lib/telemetry.ts`)
The `emit(name, properties)` function is available to track user interactions:
- Can be wrapped by the planned `emitCodeExplorerEvent` to send structured event suffixes like `view`, `file_opened`, or `directory_expanded`.

## Summary for Implementation
While the TUI framework (hooks for keybindings, layout, layout calculation, OpenTUI component typings) is established and matches the spec's requirements, the structural dependencies (`SplitLayout`, data hooks, and the `Repository` scaffold) must be implemented or merged first before the Code Explorer tab can be directly built.