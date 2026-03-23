# Research Findings: tui-repo-tab-bar-component

## Overview
This document outlines the codebase context required to implement the `tui-repo-tab-bar-component` ticket. The repository uses React 19 with OpenTUI. I investigated the existing `apps/tui/src/` directory to identify patterns for theming, responsive layouts, keybindings, overlay detection, and routing that will inform the tab bar implementation.

## 1. Theming and Styling
**Files Analyzed:** `apps/tui/src/theme/tokens.ts`, `apps/tui/src/hooks/useTheme.ts`

The TUI relies on a strictly defined set of semantic tokens for coloring and styling text, rather than raw ANSI codes. 

- **Color Hooks:** `useTheme()` returns an object of semantic RGBA colors (e.g., `primary`, `muted`). 
  - For active tabs, we use `theme.primary`.
  - For inactive tabs, we use `theme.muted`.
- **Text Attributes:** Instead of custom escape sequences, OpenTUI accepts an `attributes` prop on the `<text>` component utilizing bitwise flags from `TextAttributes`.
  - Active tabs will require: `attributes={TextAttributes.REVERSE | TextAttributes.UNDERLINE | TextAttributes.BOLD}`.
  - Inactive tabs will pass `attributes={0}` or omit it.

## 2. Layout and Responsiveness
**Files Analyzed:** `apps/tui/src/hooks/useLayout.ts`

Responsive sizing is handled by `useLayout()`, which synchronously wraps `@opentui/react`'s `useTerminalDimensions()`.
- It provides `width` and `height` properties representing terminal columns and rows.
- The tab bar component logic requires dynamically switching tab label formatting:
  - If `width < 100`, abbreviations should be used (e.g., `"1:Bkmk"`).
  - If `width >= 100`, full labels should be used (e.g., `"1:Bookmarks"`).
- It also dictates inter-tab spacing (2 spaces below 200 cols, 4 spaces for 200+).

## 3. Keyboard Input and Suppression Logic
**Files Analyzed:** `apps/tui/src/hooks/useScreenKeybindings.ts`, `apps/tui/src/providers/keybinding-types.ts`, `apps/tui/src/hooks/useOverlay.ts`

Keybindings in the TUI use a priority-based scoping system. 

- **Registration:** `useScreenKeybindings(bindings, hints)` registers a `PRIORITY.SCREEN` scope. Bindings take a descriptor (e.g., `"1"`, `"tab"`, `"shift+tab"`, `"h"`, `"l"`), a description, a group, a handler, and an optional `when` predicate.
- **Suppression (Modals):** Modals operate at `PRIORITY.MODAL`. However, to ensure tab keybindings are safely ignored when overlays are active, `useOverlay()` returns the `activeOverlay` state. If `activeOverlay !== null`, the `when` predicate for our tab keys should return `false`.
- **Suppression (Input):** When forms/inputs are focused, the screen must pass an `inputFocused` boolean to `useTabBarKeybindings`, which also feeds into the `when` predicate to ignore keystrokes.

## 4. Routing and Screen Registry
**Files Analyzed:** `apps/tui/src/router/registry.ts`, `apps/tui/src/screens/`

- `RepoOverviewScreen` currently points to `PlaceholderScreen` inside `screenRegistry`. 
- The `RepoOverviewScreen` folder (`apps/tui/src/screens/RepoOverview/`) does not exist yet. The new `RepoOverviewScreen.tsx` will need to be created, and `screenRegistry` will need to be updated to import and use the new screen component.
- The context state (`RepoTabProvider`) should wrap the tab bar and content inside `RepoOverviewScreen`, but persist state globally in a module-level `Map` (as outlined in the spec) to preserve tab selections across navigation.

## 5. E2E Testing Foundation
**Files Analyzed:** `e2e/tui/`

- Testing utilities live in `e2e/tui/helpers.ts` (e.g., `launchTUI`, `TERMINAL_SIZES`).
- TUI testing uses `@microsoft/tui-test`. Snapshot tests are utilized heavily (`tui.snapshot()`).
- There is currently no `repository.test.ts`. This file will be newly created to house the 33 detailed E2E test cases specified in the ticket, validating rendering, terminal sizes, cycling, and rapid inputs.