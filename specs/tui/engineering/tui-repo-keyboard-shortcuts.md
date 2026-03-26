# Engineering Specification: TUI Repo Keyboard Shortcuts

## Overview
This specification details the implementation of the `useRepoKeyboard()` hook and the overarching keyboard dispatch architecture for the repository screen in the Codeplane TUI. It establishes a robust 7-layer priority system that coordinates inputs across the global app shell, go-to mode, repository-wide actions, tab navigation, and active tab content, while dynamically updating the status bar and help overlay.

## Architecture & Approach

The keyboard interaction model for the repository screen is managed by an orchestrated priority stack using OpenTUI's `useKeyboard` capabilities. `useRepoKeyboard()` acts as the central coordinator for the repository-specific context, ensuring no keybinding conflicts exist and context is always cleanly resolved.

### Priority Resolution Rules
Input events pass through a strict 7-layer hierarchy. The first layer to claim a key consumes it.

1. **Layer 1 (Text Input):** Native `<input>`/`<textarea>` focus traps. Captures all printable characters, `Tab`, `Shift+Tab`, and numbers. Allows `Esc` and `Ctrl+C` to propagate.
2. **Layer 2 (Modal):** Overlay traps (Help Overlay, Command Palette). Consumes all keys except `Esc`, `?` (if help), and `Ctrl+C`.
3. **Layer 3 (Go-to):** Transient `useGoToMode` scope (1500ms timeout). Captures the second keypress after a `g` prefix.
4. **Layer 4 (Tab Content):** Handlers specific to the active tab's focused sub-panel (e.g., `j`/`k`, `Enter`, `d`, `/`).
5. **Layer 5 (Tab Bar):** Repo tab navigation (`Tab`, `Shift+Tab`, `1`-`6`, `h`, `l`).
6. **Layer 6 (Repo-wide):** Universal repository actions (`s` star, `c` copy clone URL, `n` new item, `R` retry).
7. **Layer 7 (Global):** TUI-wide fallback shortcuts (`q`, `Esc`, `?`, `:`, `Ctrl+C`).

## Component Design

### `useRepoKeyboard` Hook
**Path:** `apps/tui/src/screens/repo/hooks/useRepoKeyboard.ts`

This hook encapsulates the orchestration logic for Layers 4, 5, and 6, and registers display state for the status bar and help overlay.

```typescript
import { useEffect, useMemo } from 'react';
import { useKeybindings } from '../../../providers/KeybindingProvider';
import { useStatusBar } from '../../../providers/StatusBarProvider';
import { useHelpOverlay } from '../../../providers/HelpOverlayProvider';
import { useTerminalDimensions } from '@opentui/react';

export interface Keybinding {
  key: string;
  description: string;
  action: string; // Analytics event string
  handler: () => void;
}

export interface TabKeybindings {
  groupName: string;
  bindings: Keybinding[];
}

interface UseRepoKeyboardArgs {
  repoFullName: string;
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  tabContentBindings: TabKeybindings | null;
  errorState: Error | null;
  isInputFocused: boolean;
  isModalOpen: boolean;
}

export function useRepoKeyboard(args: UseRepoKeyboardArgs) {
  // 1. Define repo-wide bindings (s, c, n, R)
  // 2. Define tab navigation bindings (Tab, Shift+Tab, 1-6)
  // 3. Register bindings into scopes with priorities 4, 5, 6
  // 4. Compute responsive status bar hints
  // 5. Update Help Overlay groupings
}
```

### `useGoToMode` Hook
**Path:** `apps/tui/src/hooks/useGoToMode.ts`

Manages the `g` prefix transient state machine.

```typescript
export function useGoToMode() {
  // Listens for 'g'. If pressed, enters 'active' state for 1500ms.
  // Pushes a Layer 3 keybinding scope.
  // Captures next keystroke to navigate or scroll to top (g g).
  // Cancels on unrecognized key, Esc, q, or timeout.
}
```

## Implementation Plan

### Step 1: Implement `useGoToMode`
**File:** `apps/tui/src/hooks/useGoToMode.ts`
- Implement the 1500ms timeout state machine utilizing React `useEffect` for the timer cleanup.
- Register a high-priority keybinding scope (Layer 3) when active.
- Handle destinations: `d` (dashboard), `i` (issues), `r` (repos), `w` (workspaces), `n` (notifications), `s` (search), `a` (agents), `o` (orgs), `f` (workflows), `k` (wiki).
- Differentiate `g g` to fire a "scroll to top" action.
- Update the Status Bar securely via `useStatusBar` with destination hints while active.

### Step 2: Implement Repo-Wide & Tab Navigation Bindings
**File:** `apps/tui/src/screens/repo/hooks/useRepoKeyboard.ts`
- Wire up `useStarRepo(owner, repo)` for the `s` shortcut.
- Wire up `useClipboard()` for the `c` shortcut.
- Implement conditional `n` execution depending on the `activeTabIndex` (Issues vs. Landings).
- Implement navigation handlers for `Tab`, `Shift+Tab`, `h`, `l`, and `1`-`6`.
- Register these handlers into the `KeybindingProvider` using designated priorities.

### Step 3: Implement Responsive Status Bar Hints
**File:** `apps/tui/src/screens/repo/hooks/useRepoKeyboard.ts`
- Utilize `useTerminalDimensions()` to compute available terminal width dynamically.
- Truncate and filter the list of context-sensitive hints:
  - `< 100 cols`: 3 primary hints (e.g., `j/k:nav  ↵:open  q:back`).
  - `100 - 119 cols`: 5-6 hints.
  - `120 - 199 cols`: 6-8 hints.
  - `>= 200 cols`: Full display.
- Ensure updates execute synchronously within one render frame on focus or resize changes.

### Step 4: Implement Help Overlay Integration
**File:** `apps/tui/src/components/overlays/HelpOverlay.tsx`
- Refactor `<HelpOverlay>` to render groups dynamically.
- Use `useTerminalDimensions()` to handle overlay resizing:
  - Minimum (80x24): 90% width/height, 1 column layout.
  - Standard (120x40): 70% width/height, 1 column layout.
  - Large (200x60): 60% width/height, 2 column layout.
- Limit max items rendered to 80 to prevent overflow issues, appending `...` if exceeded.

### Step 5: Wire up `RepoScreen`
**File:** `apps/tui/src/screens/repo/RepoScreen.tsx`
- Integrate `useRepoKeyboard`.
- Establish a callback or context to retrieve `tabContentBindings` from the active child tab component dynamically.
- Verify that command palette (`:`) commands for "Star Repository", "Copy URL", etc., trigger the same internal handlers as the keyboard shortcuts.
- Add telemetry calls matching the `tui.repo.keyboard.*` events defined in the spec.

## Unit & Integration Tests

**Target:** `e2e/tui/repository.test.ts`
All tests must use `@microsoft/tui-test`. Implement the extensive suite of 70 tests categorized by user flows. Representative tests to implement:

### Terminal Snapshot Tests
- `repo-keyboard-status-bar-overview`: Assert status bar shows `s:star`, `c:clone`, `Tab:switch tab`, `q:back` at 120x40.
- `repo-keyboard-status-bar-changes-tab`: Assert tab-specific hints update on switch.
- `repo-keyboard-status-bar-80col`: Assert layout safely truncates to 3 hints at 80 columns.
- `repo-keyboard-help-overlay-open`: Assert `?` displays labeled groups for Global, Go To, Repo, Tab, and active group.
- `repo-keyboard-help-overlay-200x60`: Assert modal assumes a 60% width, two-column layout.

### Keyboard Interaction Tests
- **Priority Dispatch:** 
  - `repo-keyboard-tab-in-form-advances-field`: Assert `Tab` inside Settings form advances field instead of switching repo tabs (Layer 1 vs Layer 5 priority).
  - `repo-keyboard-esc-closes-modal`: Assert `Esc` closes help overlay without popping the screen (Layer 2 vs Layer 7 priority).
  - `repo-keyboard-number-in-text-input`: Assert `3` types into input, does not switch to Code tab.
- **Repository-Wide Actions:**
  - `repo-keyboard-s-stars-from-overview`: Assert `s` triggers star toggle, updates star count immediately (Optimistic UI).
  - `repo-keyboard-c-copies-clone-url`: Assert clipboard populates and status bar confirms "Copied!".
- **Go-To Mode:**
  - `repo-keyboard-g-i-navigates-issues`: Assert `g` then `i` navigates to issues list.
  - `repo-keyboard-g-g-scrolls-to-top`: Assert list scrolls to first index.
  - `repo-keyboard-g-timeout-cancels`: Assert state returns to normal silently after 1500ms without input.
- **Rapid Input & Edge Cases:**
  - `repo-keyboard-rapid-j-presses`: Assert no dropped events on rapid `j` presses.
  - `repo-keyboard-rapid-star-toggle`: Assert rapid `s` presses are debounced appropriately without throwing network panics.