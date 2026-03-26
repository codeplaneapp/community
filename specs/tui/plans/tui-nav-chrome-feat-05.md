# Implementation Plan: TUI_COMMAND_PALETTE

This document outlines the step-by-step implementation plan for `tui-nav-chrome-feat-05` (Command Palette) in the Codeplane TUI, utilizing React 19 and OpenTUI.

## Phase 1: Types & Core Utilities

### 1. Define Command Types
**File:** `apps/tui/src/commands/types.ts`
- Create `PaletteCommand` interface defining `id`, `name`, `aliases`, `description`, `category` (`Navigate`, `Action`, `Toggle`), `keybinding`, `priority`, `contextRequirements`, `featureFlag`, and an `action` callback.
- Create `CommandContext` interface decoupled from React hooks containing navigation methods (`navigate`, `resetTo`), context checkers (`hasRepoContext`, `getRepoContext`, `hasWriteAccess`), and `closePalette`.
- Export constants for limits (`MAX_QUERY_LENGTH`, `MAX_NAME_LENGTH`, `MAX_DESCRIPTION_LENGTH`, `MAX_KEYBINDING_LENGTH`) and sorting (`CATEGORY_ORDER`).

### 2. Implement Fuzzy Matching
**File:** `apps/tui/src/lib/fuzzyMatch.ts`
- Build a standalone fuzzy matching algorithm (`fuzzyScore` and `scoreCommand`) with no external dependencies.
- Implement a three-tier scoring system:
  1. Exact prefix match / word-boundary prefix.
  2. Contiguous substring match.
  3. Non-contiguous character match (in-order).
- Include length and gap penalties to ensure deterministic ordering.

## Phase 2: Command Registries

### 1. Navigation Commands
**File:** `apps/tui/src/commands/navigationCommands.ts`
- Import `goToBindings` from `../navigation/goToBindings.js`.
- Implement `createNavigationCommands(context: CommandContext): PaletteCommand[]` to map `goToBindings` into palette commands.
- Ensure `action` callbacks trigger `context.resetTo(Dashboard)` followed by `context.navigate(...)` and `context.closePalette()`.

### 2. Action & Toggle Commands
**Files:** `apps/tui/src/commands/actionCommands.ts` & `apps/tui/src/commands/toggleCommands.ts`
- Create `createActionCommands(context)` returning actions like "Create New Issue", "Create Landing Request", "Mark All Notifications Read", and "Sign Out".
- Create `createToggleCommands(context)` returning toggles like "Toggle Diff View", "Toggle Whitespace", and "Toggle Sidebar".

### 3. Registry & Barrel File
**Files:** `apps/tui/src/commands/registry.ts` & `apps/tui/src/commands/index.ts`
- Implement `buildCommandRegistry(context)` combining outputs of navigation, action, and toggle command creators.
- Export types, constants, and registry builders in `index.ts`.

## Phase 3: The Command Palette Component

### 1. Component State & Layout Hooks
**File:** `apps/tui/src/components/CommandPalette.tsx`
- Initialize state for `query` (string) and `highlightIndex` (number).
- Consume `useNavigation`, `useLayout`, `useTheme`, `useOverlay`, `KeybindingContext`, and `StatusBarHintsContext`.
- Memoize the `commandContext` referencing current navigation state and overlay close functionality.
- Filter the command registry via context checks (`nav.repoContext`) and feature flags.
- Compute `filteredCommands` sorting by fuzzy score (`scoreCommand`) or fallback category/priority sorting if `query` is empty.

### 2. Keyboard Event Routing (MODAL Scope)
- Register a `PRIORITY.MODAL` scope using `KeybindingContext.registerScope()` capturing list navigation keys: `j`, `k`, `Up`, `Down`, `Enter`, `Escape`, `Ctrl+C`, `Ctrl+U`, `Ctrl+D`, `Backspace`.
- Ensure hints update dynamically via `hintsCtx.overrideHints` when the palette is open.

### 3. Text Input Capture
- Utilize the OpenTUI `useKeyboard` hook strictly at the component level to capture printable characters missing from the modal scope.
- Append single printable character `event.name` to the `query` string (avoiding `j` and `k` if not in insert mode, or strictly isolating navigation logic from input typing logic via the KeybindingProvider priority fall-through).

### 4. UI Rendering
- Render the modal container using `<box>` with `position="absolute"`, calculated dynamic sizing (`layout.modalWidth`, `layout.modalHeight`), and `zIndex={101}`.
- Render search row: `<text>` prefix `> ` followed by the current `query` string.
- Render `<scrollbox>` for `filteredCommands` iterating over items. Render responsive columns based on `layout.breakpoint !== "minimum"` (`showCategory`, `showDescription`).
- Highlight the focused row using `theme.primary` background.

## Phase 4: App Shell Integration

### 1. Register Overlay
**File:** `apps/tui/src/components/OverlayLayer.tsx`
- Import `<CommandPalette />`.
- Add the conditional rendering block: `if (activeOverlay === "command-palette") return <CommandPalette />;`

### 2. Global Keybinding Registration
**File:** `apps/tui/src/components/GlobalKeybindings.tsx`
- Modify `onCommandPalette` to dispatch `openOverlay("command-palette")`.
**File:** `apps/tui/src/hooks/useGlobalKeybindings.ts`
- Add a `when` guard logic to the `:` mapping (e.g., `when: () => !isTextInputFocused`) preventing trigger when focused inside standard forms or search boxes.

## Phase 5: E2E Testing

**File:** `e2e/tui/app-shell.test.ts`
- Introduce a new `describe("TUI_COMMAND_PALETTE")` block.
- Use `launchTUI()` helper for assertions.
- **Snapshot Tests:**
  - Command palette renders cleanly on standard (120x40), minimum (80x24), and large (200x60) terminal dimensions.
  - Empty query state, highlighted row state, filtered result state, and no-match state snapshots.
- **Interaction Tests:**
  - Validate `:` opens and `Esc`/`Ctrl+C` closes the palette.
  - Validate `j`/`k`/`Up`/`Down` navigation, including boundary wrap-around behavior.
  - Validate fuzzy search filtering via typed characters.
  - Validate `Enter` triggers closing and executes target navigation context.
  - Validate contextual commands only appear when `repoContext` is present (e.g., loading TUI with `--repo alice/test-repo`).
  - Validate maximum query length bounds.