# Implementation Plan: TUI Command Palette

## Phase 1: Core Utilities and Infrastructure

**1. Implement Fuzzy Search Algorithm**
- **File**: `apps/tui/src/lib/fuzzyMatch.ts`
- **Action**: Create pure function `fuzzyMatch(pattern, target)` and `fuzzyFilter(pattern, items, accessor, aliasAccessor)`.
- **Details**: Implement scoring heuristic (exact prefix, contiguous, boundaries). Ensure O(n x m) performance, aiming for <16ms per 200 items. Do not allocate intermediate arrays in the inner loop.

**2. Unit Test Fuzzy Search**
- **File**: `e2e/tui/fuzzy-match.test.ts`
- **Action**: Create standalone tests for `fuzzyMatch` and `fuzzyFilter` verifying scoring, case-insensitivity, exact prefix prioritization, and performance.

**3. Enhance Keybinding Provider**
- **Files**: `apps/tui/src/providers/keybinding-types.ts`, `apps/tui/src/providers/KeybindingProvider.tsx`
- **Action**: Add `onUnhandledKey?: (key: string, event: KeyEvent) => boolean` to the `KeybindingScope` interface. Update the dispatch loop in `KeybindingProvider.tsx` to invoke `onUnhandledKey` if no explicit binding matches, consuming the event if it returns `true`.

## Phase 2: Command Registry

**4. Define Command Types**
- **File**: `apps/tui/src/commands/types.ts`
- **Action**: Define `PaletteCommand` interface (id, name, aliases, description, category, keybinding, action, contextRequirements) and `CommandContext`.

**5. Create Navigation Commands**
- **File**: `apps/tui/src/commands/navigationCommands.ts`
- **Action**: Map `ScreenName` targets to `PaletteCommand` arrays. Implement `requiresRepo` filtering via context callbacks.

**6. Expose Command Registry**
- **File**: `apps/tui/src/commands/index.ts`
- **Action**: Implement `buildCommandRegistry(context: CommandContext)` to aggregate and return commands.

## Phase 3: State Management & UI Components

**7. Implement useCommandPalette Hook**
- **File**: `apps/tui/src/hooks/useCommandPalette.ts`
- **Action**: Manage query state, highlight index, filtering (via `fuzzyFilter`), and pagination. Use `useLayout()` to determine if description/category columns should render. Construct `CommandContext` using `useNavigation()`. Memoize the filtered command list to prevent unnecessary recalculations.

**8. Build CommandPalette Component**
- **File**: `apps/tui/src/components/CommandPalette.tsx`
- **Action**: 
  - Use OpenTUI components `<box>`, `<scrollbox>`, `<text>`.
  - Register a keybinding scope at `PRIORITY.MODAL`. Bind `j/k` to navigation, `enter` to execute, `ctrl+c` to dismiss.
  - Use the new `onUnhandledKey` interceptor to append printable characters to the search query buffer.
  - Apply styling using `useTheme()` (e.g., `theme.primary` for highlighted row background, reverse video).
  - Add layout resize listener to auto-close if the terminal shrinks below minimum dimensions.

**9. Update Barrel Files**
- **Files**: `apps/tui/src/components/index.ts`, `apps/tui/src/hooks/index.ts`
- **Action**: Export the new hook and component to make them cleanly available to the rest of the application.

## Phase 4: Integration

**10. Integrate into Overlay Layer**
- **File**: `apps/tui/src/components/OverlayLayer.tsx`
- **Action**: 
  - Replace the existing `[Command palette content...]` placeholder with `<CommandPalette />`.
  - Implement custom sizing logic for `command-palette`: 90%x80% for `minimum`, 60%x60% for `standard`, and 50%x50% for `large` breakpoints (overriding default modal sizes).

## Phase 5: End-to-End Testing

**11. Write TUI App Shell Tests**
- **File**: `e2e/tui/app-shell.test.ts`
- **Action**: Add a new `describe("TUI_COMMAND_PALETTE")` block containing tests leveraging `@microsoft/tui-test`.
- **Details**:
  - Add Visual State Snapshot tests (centered layout, expanded layouts, empty states, highlighted states).
  - Add Keyboard Interaction tests (activating via `:`, typing characters to filter, using `j/k` to navigate, `Enter` to select, `Esc` to close).
  - Add Context-Sensitive tests ensuring repo-scoped commands only appear when inside a repository.
  - Add Edge Case tests (max query length, rapid opening/closing).