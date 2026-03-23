# Implementation Plan: tui-repo-sidebar-split-layout

## Overview
Implement the `SplitLayout` component for the Codeplane TUI, providing a robust two-panel (sidebar + main) layout with proper keyboard focus management, responsive resizing, and semantic theming.

## Step 1: Create `useSplitFocus` Hook
**File:** `apps/tui/src/hooks/useSplitFocus.ts`
- Implement a binary state hook managing `"sidebar"` vs `"main"` focus.
- Add an effect to force focus to `"main"` when `sidebarVisible` becomes `false`.
- Ensure `toggleFocus` is a no-op when the sidebar is hidden.
- Return `focusedPanel`, `toggleFocus`, `setFocus`, and `sidebarFocusable`.

## Step 2: Export Hook
**File:** `apps/tui/src/hooks/index.ts`
- Add `export { useSplitFocus } from "./useSplitFocus.js";`
- Add `export type { SplitPanel, SplitFocusState } from "./useSplitFocus.js";`

## Step 3: Create `SplitLayout` Component
**File:** `apps/tui/src/components/SplitLayout.tsx`
- Implement the `<SplitLayout>` component using OpenTUI `<box>` elements.
- Consume `useLayout()` for `sidebarVisible` and `sidebarWidth`.
- Consume `useTheme()` for border colors (`primary` for focused, `border` for unfocused).
- Consume `useSplitFocus(layout.sidebarVisible, initialFocus)`.
- Use the render props pattern for `sidebar(focused)` and `main(focused)`.
- Use `useScreenKeybindings` to register `Tab`, `Ctrl+W` (focus toggle) and `Ctrl+B` (sidebar toggle) at `PRIORITY.SCREEN`.
- Handle the single-panel fallback when `layout.sidebarVisible` is false.

## Step 4: Export Component
**File:** `apps/tui/src/components/index.ts`
- Add `export { SplitLayout } from "./SplitLayout.js";`
- Add `export type { SplitLayoutProps } from "./SplitLayout.js";`

## Step 5: Update Global Keybindings (`Ctrl+B` Fallback)
**File:** `apps/tui/src/hooks/useGlobalKeybindings.ts`
- Add `onSidebarToggle: () => void;` to the handlers interface.
- Add `{ key: "ctrl+b", description: "Toggle sidebar", group: "Global", handler: handlers.onSidebarToggle }` to the keybindings array.

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`
- Consume `useLayout()`.
- Create `onSidebarToggle` callback invoking `layout.sidebar.toggle()`.
- Pass `onSidebarToggle` to the `useGlobalKeybindings` hook.

## Step 6: Create E2E Tests
**File:** `e2e/tui/split-layout.test.ts`
- Use `@microsoft/tui-test` and `launchTUI()` to test the component in a real terminal environment.
- **Snapshot Tests:** Verify rendering at standard (120x40), minimum (80x24), and large (200x60) sizes. Verify border colors based on focus.
- **Keyboard Tests:** Simulate `Tab`, `Ctrl+W`, `Ctrl+B` and verify visual focus and layout changes.
- **Resize Tests:** Resize the terminal dynamically (`terminal.resize()`) and verify the sidebar correctly hides/shows and focus snaps to `"main"` when hidden.
- **Status Bar Tests:** Verify that status bar hints for `Tab` appear/disappear based on sidebar visibility.

## Step 7: Final Validation
- Run `bun run check` to ensure TypeScript compilation passes.
- Run `bun test e2e/tui/split-layout.test.ts` to execute the E2E suite and generate/verify golden snapshots.