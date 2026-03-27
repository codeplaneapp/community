# Research Context for TUI_DIFF_SCROLL_SYNC

## Executive Summary
This document outlines the codebase context required to implement the `TUI_DIFF_SCROLL_SYNC` feature. Currently, the `apps/tui/src/components/diff` directory does not exist, as this ticket is blocked by its dependency (`tui-diff-split-view`). However, the necessary foundational utilities, hooks, and native OpenTUI primitives required by the spec are already present in the codebase.

## OpenTUI Native Diff Primitive
The core OpenTUI package implements a native Diff renderable which provides insight into how OpenTUI manages Diff rendering:
- **Location**: `context/opentui/packages/core/src/renderables/Diff.ts`
- **Existing `syncScroll` Behavior**: The native `DiffRenderable` currently exposes a `syncScroll` boolean flag. This natively implements **mouse scroll synchronization** by tracking `onMouseEvent` and ensuring that if the target is inside the left or right panes, the `scrollY` and `scrollX` of the opposing pane is updated.
- **Split View Layout**: OpenTUI natively parses the diff hunks, inserts filler lines (empty content) where necessary, and assigns `width: "50%"` to a `leftCodeRenderable` and `rightCodeRenderable`.
- **Note for Implementation**: The engineering spec outlines a custom React implementation involving `DiffSyncController`, `DiffSplitView`, and `DiffPane`. This means the implementation will largely bypass OpenTUI's native diff sync in favor of a virtual scroll window (50 line buffer) managed by React state, utilizing the native `diff-syntax` and `useDiffSyntaxStyle` logic.

## Relevant TUI Application Architecture

### 1. Keybinding System
The TUI employs a priority-based, LIFO stack for global and screen-specific keybindings.
- **Provider**: `apps/tui/src/providers/KeybindingProvider.tsx` uses `@opentui/react`'s `useKeyboard` to capture global input, then filters it down based on registered scopes.
- **Screen Hook**: `apps/tui/src/hooks/useScreenKeybindings.ts` provides `useScreenKeybindings(bindings)`. This is the exact hook the spec expects `DiffSplitView` to use to bind `j`, `k`, `ctrl+d`, `ctrl+u`, `G`, `]`, `[`, etc.
- **Important Pattern**: The `g g` go-to mode is a two-key sequence managed at a higher scope level in `KeybindingProvider`. To integrate `scrollToTop` with `g g`, the implementation will need to expose the scroll state globally or have the go-to handler access the active screen context.

### 2. Telemetry Logging
Scroll telemetry accumulation is a core feature of the spec (`useScrollTelemetry.ts`).
- **Location**: `apps/tui/src/lib/telemetry.ts`
- **Usage**: Exports an `emit(name, properties)` function. When `CODEPLANE_TUI_DEBUG="true"`, this logs to `stderr`. The telemetry hook should batch scroll events and call `emit("tui.diff.split_view_scrolled", {...})` after a 500ms debounce.

### 3. Layout and Terminal Responsiveness
The `DiffViewer` and `DiffSplitView` will rely heavily on the window dimensions to manage the virtual window constraint and decide when to auto-revert to `unified` mode.
- **Location**: `apps/tui/src/hooks/useLayout.ts`
- **Usage**: Exports `useLayout()` returning a `LayoutContext`. It exposes `width`, `height`, `contentHeight` (`height - 2` to accommodate the header and status bar), and `sidebarVisible`.
- **Integration**: The spec indicates `totalLines - viewportHeight` for scroll clamping. `viewportHeight` maps directly to `layout.contentHeight`.

### 4. Diff Syntax Highlighting
While styling isn't modified directly by scroll sync, it's passed down to the panes.
- **Location**: `apps/tui/src/hooks/useDiffSyntaxStyle.ts` and `apps/tui/src/lib/diff-syntax.ts`
- **Usage**: `useDiffSyntaxStyle` provides a memoized `SyntaxStyle` instance derived from the detected color tier (Truecolor, ANSI 256, ANSI 16).

## E2E Testing Context
- **Location**: `e2e/tui/diff.test.ts`
- **Pattern**: Existing diff tests (for syntax highlighting) use `@microsoft/tui-test` to spin up a terminal instance via a helper `launchTUI({ cols, rows })`, send keys using `terminal.sendKeys(...)`, wait for text (`terminal.waitForText(...)`), and use Golden snapshot comparisons (`expect(snapshot).toMatchSnapshot()`).
- **Scroll Sync Integration**: The testing structure is fully prepared to accommodate the `SNAP-SYNC-*`, `KEY-SYNC-*`, `RSP-SYNC-*`, and `INT-SYNC-*` suites outlined in the spec using the exact same methods.

## Conclusion
The repository is primed for the `tui-diff-split-view` dependency and the subsequent `tui-diff-scroll-sync` features. The `DiffSyncController` pattern defined in the spec integrates seamlessly with the existing `useScreenKeybindings`, `telemetry.emit`, and `useLayout` primitives. No architectural discrepancies were found between the spec and the current state of `apps/tui/`.