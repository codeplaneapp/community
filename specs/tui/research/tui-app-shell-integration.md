# TUI App Shell Integration Research

## Overview
This document synthesizes research findings for integrating the AppShell layout components in the Codeplane TUI (`tui-app-shell-integration`). The goal is to evaluate existing implementations, confirm structural alignments with the engineering spec, and outline the missing elements that need implementation.

## Current Codebase State

### 1. `apps/tui/src/components/GlobalKeybindings.tsx`
- **Status**: Partially implemented.
- **Current findings**: `onQuit`, `onEscape`, and `onForceQuit` are implemented correctly with navigation support and process exits. However, `onHelp`, `onCommandPalette`, and `onGoTo` are currently empty `TODO` stubs.
- **Required Action**: 
  - Needs to import `useOverlay` from `../hooks/useOverlay.js`.
  - The `onHelp` callback needs to call `openOverlay("help")`.
  - The `onCommandPalette` callback needs to call `openOverlay("command-palette")`.
  - `onGoTo` should remain an empty no-op but have a comment acknowledging go-to keybinding execution belongs to a dedicated `PRIORITY.GOTO` scope (managed separately).

### 2. Provider Hierarchy (`apps/tui/src/index.tsx`)
- **Status**: Correctly structured.
- **Current findings**: The layout is ordered accurately based on optimized render requirements rather than logical dependency chains:
  - `ThemeProvider` wraps `KeybindingProvider`.
  - `KeybindingProvider` wraps `OverlayManager`.
  - `OverlayManager` wraps the Navigation and AppShell logic.
  - Deep link flow correctly uses `parseCLIArgs` and `buildInitialStack` from `deepLinks.ts`.
- **Required Action**: No functional changes needed. It fulfills the specified architecture.

### 3. AppShell & Responsive Layout (`apps/tui/src/components/AppShell.tsx`)
- **Status**: Fully implemented.
- **Current findings**: The layout uses the `useLayout()` hook. It conditionally renders `<TerminalTooSmallScreen />` if the terminal breakpoint evaluates to `null` (less than 80x24 dimensions). The primary UI renders `HeaderBar`, `children` (Content), `StatusBar`, and `OverlayLayer` in a column flexbox.
- **Required Action**: None. Validated as correct.

### 4. Overlay System (`apps/tui/src/providers/OverlayManager.tsx` & `apps/tui/src/components/OverlayLayer.tsx`)
- **Status**: Fully implemented and robust.
- **Current findings**: 
  - `OverlayManager.tsx` robustly enforces single-overlay active states. It automatically unregisters old keybinding scopes when a new overlay opens.
  - It captures the `escape` key at `PRIORITY.MODAL`, overriding the global escape bindings and cleanly tearing down overlay statuses without altering the navigation stack.
  - `OverlayLayer.tsx` displays placeholder content strings (e.g., `[Help overlay content — pending ...]`) for overlays until specific content components are finalized.
- **Required Action**: None required to the system itself, only consuming it from `GlobalKeybindings`.

### 5. Hook Systems
- **`useOverlay.ts`**: Returns the context exposing `activeOverlay`, `openOverlay`, `closeOverlay`, and `isOpen` functions.
- **`useGlobalKeybindings.ts`**: Registers global mappings mapping key descriptors (`q`, `escape`, `ctrl+c`, `?`, `:`, `g`) to the `GlobalKeybindingActions` interface. Registered at `PRIORITY.GLOBAL` (5).

### 6. E2E Test Scaffolding (`e2e/tui/app-shell.test.ts`)
- **Status**: Foundation exists; lacks integration tests.
- **Current findings**: The file has numerous tests covering typescript compilation, package validation, theme colors, responsive bounds (`types/breakpoint.ts`), and spinner utilities. 
- **Required Action**: Needs the two substantial new test suites described in the spec:
  1. `TUI_APP_SHELL — AppShell layout integration` (Static/unit layout bounds and deep links).
  2. `TUI_APP_SHELL — Live TUI integration (PTY-based)` (Interactions invoking layout updates, resizing behavior, overlay states, and process lifecycles).

## Summary
The architecture works harmoniously as is. The primary implementation task is modifying `GlobalKeybindings.tsx` to actively bridge user keystrokes into the ready `OverlayManager` system, followed by applying the extensive E2E integration test suite inside `e2e/tui/app-shell.test.ts`.