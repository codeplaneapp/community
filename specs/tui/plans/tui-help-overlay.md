# Implementation Plan: TUI Help Overlay (tui-help-overlay)

## 1. Overview
This document outlines the step-by-step implementation for the Codeplane TUI Help Overlay, providing a responsive, scrollable, and context-aware keybinding reference. The overlay activates upon pressing `?` and displays categorized keybindings (Global, Go To, and Screen-Specific).

## 2. Step-by-Step Implementation

### Step 2.1: Create `apps/tui/src/components/HelpOverlay.tsx`
**Action:** Create a new React component utilizing OpenTUI layout primitives (`<box>`, `<text>`).
**Requirements:**
- **Data Assembly:** 
  - Hardcode Global keybindings (`?`, `:`, `q`, `Esc`, `Ctrl+C`).
  - Import `goToBindings` from `../navigation/goToBindings.js` to populate the "Go To" section.
  - Fetch screen-specific bindings from `KeybindingContext.getScreenBindings()`, deduping against globals.
- **Formatting:** Implement a `formatKeyDisplay(normalizedKey: string): string` helper to convert strings like `ctrl+c` to `Ctrl+C`, `escape` to `Esc`.
- **Scroll State Management:** Use `useState` for `scrollOffset`. Flatten all display items (headings, entries, separators, blank rows) into a single array. Display a visible slice based on terminal dimensions.
- **Keybinding Registration:** In a `useEffect`, register a `PRIORITY.MODAL` scope to capture:
  - Scroll actions: `j`, `k`, `down`, `up`, `G`, `ctrl+d`, `ctrl+u`.
  - `g g` sequence: Use a `useRef` timer to detect double presses within 1500ms.
  - Suppress collisions: Explicitly capture `q`, `/`, `:`, `Space`, `Enter`, `Tab` with no-op handlers to prevent bleeding into underlying scopes.
- **Layout & Responsiveness:** Compute visible rows by subtracting headers/footers from `overlayInnerHeight`. Use `useLayout()` and `useTerminalDimensions()` from `@opentui/react` to determine maximum width and apply truncations via `truncateText()`.
- **Telemetry & Logging:**
  - On mount: `emit("tui.help_overlay.opened", ...)` and `logger.debug(...)`.
  - On unmount: `emit("tui.help_overlay.closed", ...)` capturing duration and whether scrolled.
  - On scroll: `emit("tui.help_overlay.scrolled", ...)`.

### Step 2.2: Update `apps/tui/src/components/GlobalKeybindings.tsx`
**Action:** Wire up the trigger for the Help Overlay.
**Requirements:**
- Replace the `onHelp` TODO stub with a call to `useOverlay().openOverlay("help")`.
- Due to existing logic in `OverlayManager`, calling this when "help" is active will automatically act as a toggle and handle unmounting.

### Step 2.3: Modify `apps/tui/src/components/OverlayLayer.tsx`
**Action:** Render the `HelpOverlay` component instead of the placeholder text.
**Requirements:**
- Replace `[Help overlay content — pending TUI_HELP_OVERLAY implementation]` with `<HelpOverlay />`.
- Adjust the overlay height logic. Since standard layouts specify 60%, override it when `activeOverlay === "help"` to apply the required 70% height for standard/large breakpoints, and 90% for minimum breakpoints.

### Step 2.4: Verify `apps/tui/src/components/StatusBar.tsx`
**Action:** Ensure the right-hand side `? help` hint is visible.
**Requirements:**
- Check the existing conditional rendering logic to ensure the `? help` hint renders consistently across all standard screens when the modal is closed.

### Step 2.5: Implement E2E Tests in `e2e/tui/app-shell.test.ts`
**Action:** Append the full suite of TUI test cases within a `describe("TUI_HELP_OVERLAY")` block.
**Requirements:**
- Use `@microsoft/tui-test` to test UI components via terminal snapshots and simulated keyboard interactions (`tui.sendKeys`, `tui.waitForText`).
- Implement 34 tests explicitly covering:
  - Toggle open/close via `?` and close via `Esc`.
  - Validation of Global, Go To, and Screen-specific rendered text.
  - Scrolling interactions (`j`, `k`, `G`, `g g`, `Ctrl+D`, `Ctrl+U`).
  - Key suppression (`:` and `q` do not trigger global actions when open).
  - Responsive resizing behaviors (large-to-small truncations).
  - Mutual exclusion with command palette overlays.
- Leave failing tests failing if they correspond to not-yet-implemented backend routes or screens (e.g., Diff Viewer).

## 3. Productionization & Code Quality Checklist
- [ ] Ensure all code compiles cleanly (`tsc --noEmit`).
- [ ] No hardcoded ANSI codes; use OpenTUI `useTheme()` tokens (`primary`, `warning`, `border`, `muted`).
- [ ] Avoid `any` types. Rely entirely on strictly-typed data models for row items.
- [ ] Confirm the overlay properly unmounts on `?` or `Esc`, avoiding memory leaks or stale event listeners.
- [ ] Wrap `<HelpOverlay />` in `OverlayLayer.tsx` with an `ErrorBoundary` configured to call `closeOverlay()` on crash, accompanied by appropriate error logs.