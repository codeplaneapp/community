# Research Findings for TUI_DIFF_FILE_NAVIGATION

Based on an analysis of the Codeplane codebase (`apps/tui/`, `context/opentui/`, and existing design specs), here is the consolidated context necessary for implementing the sequential and targeted file jumping (`]/[`) feature.

## 1. OpenTUI `<scrollbox>` and Ref API
- **Source Locations**: 
  - `context/opentui/packages/core/src/renderables/ScrollBox.ts`
  - `context/opentui/packages/react/src/types/components.ts`
- **Mechanics**: The `<scrollbox>` React element exposes `ScrollBoxRenderable` when a `ref` is attached. 
- **Scroll Execution**: The `ScrollBoxRenderable` class explicitly implements the `scrollTo(position: number | { x: number; y: number }): void` method. When a number is passed, it sets the vertical scroll (`scrollTop`). This directly supports **AD-3** in the spec, confirming we can leverage `scrollboxRef.current.scrollTo(offset)` to snap the viewport exactly to a file's header `offsetTop`.
- **Viewport Properties**: It also exposes `scrollHeight`, `viewport.height`, and `scrollTop` properties, which align perfectly with the proposed `ScrollboxHandle` interface in `useFileNavigation.ts`.

## 2. Keybinding and Status Bar Context
- **Source Locations**: 
  - `apps/tui/src/hooks/useScreenKeybindings.ts`
  - `apps/tui/src/components/StatusBar.tsx`
- **Registration**: `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])` pushes a `PRIORITY.SCREEN` scope. The `bindings` parameter defines behavior, while `hints` manages the status bar footprint.
- **Status Bar File Indicator**: The status bar parses the `hints` array. To render the dynamically padding string (`"File N of M"`), we can inject `{ keys: fileNav.fileIndicator, label: "", order: 100 }` directly into the `useScreenKeybindings` hints payload from `DiffScreen.tsx`, rendering correctly flush-right as per spec without structural changes to `StatusBar.tsx`.

## 3. Existing Scroll Patterns
- **Source Location**: `apps/tui/src/components/ErrorScreen.tsx`
- **Pattern contrast**: In `ErrorScreen.tsx`, scroll positions (`traceScrollOffset`) are managed as raw React state `useState`, driving a `.slice()` on the content array for pseudo-virtualization. 
- **Evolution**: The Diff viewer leverages a more advanced pattern via `<scrollbox viewportCulling>` and imperative `scrollTo()` commands. Modifying `focusedFileIndex` updates state, and `queueMicrotask(() => scrollbox.scrollTo(offset))` bypasses the React render cycle for the actual scroll animation, avoiding double-renders.

## 4. DiffScreen and DiffViewer Architecture
- **Source Locations**: 
  - `specs/tui/engineering/tui-diff-screen-scaffold.md`
  - `specs/tui/engineering/tui-diff-split-view.md`
- **State Owner**: The scaffold outlines that `DiffScreen` is the top-level orchestrator. It manages `focusZone` (`"tree" | "content"`), which simplifies hosting `focusedFileIndex` and `treeCursorIndex` at this level so both the `DiffFileTree` sidebar and `DiffViewer` content area can react simultaneously.
- **`DiffViewer` Interface**: `DiffViewer` acts as an intermediary shell that decides whether to render `DiffUnifiedView` or `DiffSplitView`. It anticipates receiving `focusedFileIndex` and `onFileChange` to relay down to the specific renderer. 
- **Key Guarding**: The placeholder bindings in `tui-diff-screen-scaffold.md` restricted `]`/`[` to `when: () => ctx.focusZone === "content"`. According to the new product requirements, this guard is deliberately dropped so that sequential file switching works fluidly regardless of whether the sidebar or content pane is focused.

## 5. Layout and UI Utilities (`tui-diff-parse-utils`)
- **Theme Token Compatibility**: Focus indication and truncation functions specified for `DiffFileTree.tsx` (like `inverse={true}` for reverse video and path clipping) align natively with OpenTUI's `ThemeTokens` structure present in `apps/tui/src/theme/tokens.ts`.
- The requested `file-nav-utils.ts` functions (`truncateFilePath`, `abbreviateStat`) safely fill the gap since the existing text truncation hooks (`truncateRight` in `apps/tui/src/util/text.ts`) don't have the explicit left-truncating `…/path/to/file` logic needed for narrow sidebars.

## Summary
The OpenTUI library and Codeplane TUI hooks contain exactly the primitive building blocks required to satisfy the Engineering Specification. Ref-based scrolling via `<scrollbox>` is supported by the `ScrollBoxRenderable` native binding, and `useScreenKeybindings` is perfectly suited to handle the dynamic `File N of M` status injection without refactoring `StatusBar.tsx`.