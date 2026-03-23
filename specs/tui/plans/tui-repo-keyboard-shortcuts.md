# Implementation Plan: TUI_REPO_KEYBOARD_SHORTCUTS

## 1. Overview
This plan defines the step-by-step approach to implementing the master keyboard dispatch hook (`useRepoKeyboard()`) for the Codeplane TUI repository screen. It unifies keybindings from the overview, tab navigation, and active tab content into a single `PRIORITY.SCREEN` scope using OpenTUI's `KeybindingProvider`, while cleanly managing context-sensitive behavior, status bar hints, and help overlays.

## 2. File Inventory

**New Files:**
- `apps/tui/src/screens/Repository/keyboard-types.ts`
- `apps/tui/src/screens/Repository/keyboard-constants.ts`
- `apps/tui/src/screens/Repository/RepoKeyboardContext.tsx`
- `apps/tui/src/screens/Repository/useRepoKeyboard.ts`
- `apps/tui/src/screens/Repository/useTabContentKeybindings.ts`
- `apps/tui/src/screens/Repository/repoCommands.ts`
- `apps/tui/src/lib/clipboard.ts`

**Modified Files:**
- `apps/tui/src/screens/Repository/index.tsx`
- `apps/tui/src/screens/Repository/index.ts`
- `apps/tui/src/components/GlobalKeybindings.tsx`

**Test Files:**
- `e2e/tui/repository.test.ts`

## 3. Step-by-Step Implementation

### Step 1: Define Types (`apps/tui/src/screens/Repository/keyboard-types.ts`)
Create the TypeScript interfaces. Define `RepoFocusLayer` (`"overview"`, `"tab-bar"`, `"tab-content"`, etc.), `KeybindingGroupDef`, and the context API structures (`RepoKeyboardAPI`, `RepoKeyboardContextValue`).

### Step 2: Define Constants (`apps/tui/src/screens/Repository/keyboard-constants.ts`)
Define repository tab names (`REPO_TAB_NAMES`), status bar hint presets (`REPO_OVERVIEW_HINTS`, `GOTO_MODE_HINTS`), timeout values (`GOTO_TIMEOUT_MS = 1500`), and a responsive `getHintBudget(terminalWidth)` utility to manage status bar limits.

### Step 3: Create Context (`apps/tui/src/screens/Repository/RepoKeyboardContext.tsx`)
Create `RepoKeyboardContext` using React's `createContext` and expose a `useRepoKeyboardContext` hook that throws an error if accessed outside the provider boundary.

### Step 4: Implement Clipboard Utility (`apps/tui/src/lib/clipboard.ts`)
Implement an asynchronous `writeToClipboard(text: string)` utility that attempts to write text to the system clipboard sequentially using `Bun.spawn` with `pbcopy`, `xclip`, `xsel`, and `wl-copy`. 

### Step 5: Implement Core Hook (`apps/tui/src/screens/Repository/useRepoKeyboard.ts`)
1. Create `useRepoKeyboard` to consume `KeybindingContext` and `StatusBarHintsContext`.
2. Manage internal state: `focusLayer`, `inputFocused`, and `goToActive` alongside a timeout ref.
3. Compute a composed `Map` of keybindings. Enforce priorities via `when()` predicates based on the focus layer: Tab content (highest), tab bar, and repo-wide actions (`s`, `c`, `n`, `R`).
4. Register the `PRIORITY.SCREEN` scope to the `KeybindingProvider`.
5. Dynamically register a `PRIORITY.GOTO` scope when `goToActive` is true to intercept the second key sequence (e.g., `g d` for dashboard).
6. Sync context-sensitive status hints to `StatusBarHintsContext` based on `useLayout().width` and the active tab/focus layer.
7. Format help group structures to integrate with `useHelpOverlay()`.

### Step 6: Implement Tab Content Hook (`apps/tui/src/screens/Repository/useTabContentKeybindings.ts`)
Implement the `useTabContentKeybindings` convenience hook to allow child components (e.g., Diff Viewer or Settings) to imperatively register and clean up their contextual keybindings on mount/unmount via `RepoKeyboardContext`.

### Step 7: Build Command Palette Support (`apps/tui/src/screens/Repository/repoCommands.ts`)
Export a `buildRepoCommands(options)` function that returns an array of `PaletteCommand` objects. This surfaces repo actions (like copy clone URL, star toggle, and tab switching) natively inside the fuzzy search command palette.

### Step 8: Integrate with Screen Scaffold (`apps/tui/src/screens/Repository/index.tsx`)
1. Refactor `RepoOverviewScreen` to invoke `useRepoKeyboard` after fetching repository data via `@codeplane/ui-core`.
2. Map actions like `onToggleStar` to their backend mutation functions.
3. Wrap the sub-components (`RepoHeader`, `TabBar`, `ActiveTabContent`) in `<RepoKeyboardContext.Provider value={...}>`.

### Step 9: Wire Global Go-To Fallback (`apps/tui/src/components/GlobalKeybindings.tsx`)
Verify the `PRIORITY.GLOBAL` binding for `g` exists as a final fallback. Because the repository scope operates at `PRIORITY.SCREEN`, it will gracefully intercept `g` presses before the global handler when inside the repository view.

### Step 10: Export via Barrel File (`apps/tui/src/screens/Repository/index.ts`)
Export the required functions, types, and hooks to keep imports clean across `apps/tui`.

## 4. E2E Testing Strategy (`e2e/tui/repository.test.ts`)

Using `@microsoft/tui-test`, create the testing suite:

1. **Terminal Snapshot Verification:** Navigate to the repo screen and capture snapshots for standard views and dimensions (`80x24`, `120x40`, `200x60`) to assert that `getHintBudget` correctly truncates status bar hints.
2. **Help Overlay State:** Send `?` and take snapshots verifying the help modal renders the contextual active tab groups accurately. 
3. **Go-To Mode Assertions:** Send `g`, assert status bar indicates Go-To commands, and wait 1500ms to verify it times out correctly. Simulate valid entries (`g i` to jump to issues).
4. **Action Dispatch & Edge Cases:**
   - Press `s` and assert the star increment locally (Optimistic UI).
   - Press `c` and confirm "Copied!" notification is rendered on the status bar.
   - If user lacks permission, verify `n` reveals a transient error and triggers the correct error paths. Unimplemented backend scenarios must fail as intended.
5. **Suppression Guard Tests:** Tab into a form or activate `/` (search). Send keys like `s` or `c` and verify they register as text input and do *not* execute repository operations.