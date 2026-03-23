# Research Findings: TUI_REPO_KEYBOARD_SHORTCUTS

## 1. Keybinding Architecture (`KeybindingProvider`)

The TUI utilizes a centralized key dispatch model implemented in `apps/tui/src/providers/KeybindingProvider.tsx`. 

- It maintains five `PRIORITY` levels (`apps/tui/src/providers/keybinding-types.ts`):
  1. `TEXT_INPUT`: OpenTUI native
  2. `MODAL`: Overlays (Help, Palette, Confirmation)
  3. `GOTO`: Go-to mode navigation
  4. `SCREEN`: Screen-specific (This is where repo keyboard shortcuts will be composed)
  5. `GLOBAL`: Fallback keys (`q`, `Esc`, `Ctrl+C`, `?`, `:`, `g`)
- Scopes are registered via `registerScope({ priority, bindings, active })` which returns a cleanup ID.
- Handlers define a `when?: () => boolean` predicate. The dispatcher iterates scopes sorted by priority, and then falls back if `when()` returns false, which is exactly how the repo sub-layers (tab content, tab bar, repo-wide) must be implemented within a single `PRIORITY.SCREEN` scope.

## 2. Normalization & Key Representation

- Key descriptors are normalized using `normalizeKeyDescriptor` from `apps/tui/src/providers/normalize-key.ts`.
- Valid strings include: `"q"`, `"G"` (uppercase for shift+g), `"ctrl+c"`, `"escape"`, `"return"`, `"tab"`, `"shift+tab"`.
- Any keybinding map we compose for `useRepoKeyboard` must map the normalized string (via `normalizeKeyDescriptor`) to the handler object.

## 3. Global Scope and `g` (Go-To Mode)

- `apps/tui/src/hooks/useGlobalKeybindings.ts` currently registers `g` at `PRIORITY.GLOBAL` (5).
- `GlobalKeybindings.tsx` owns the global bindings and has a TODO for `onGoTo`.
- To intercept `g` for the repository screen before it hits `PRIORITY.GLOBAL`, `useRepoKeyboard` must register `g` in its `PRIORITY.SCREEN` (4) scope. It can then initiate its own transient 1500ms go-to mode and register a dynamic `PRIORITY.GOTO` (3) scope to capture the second key.

## 4. Status Bar Hints (`StatusBarHintsContext`)

- Managed within `KeybindingProvider.tsx` but exported via `StatusBarHintsContext`.
- API exposes `registerHints(sourceId, hints)` for base hints and `overrideHints(hints)` for transient modes (like modal or go-to mode).
- Responsive hint dropping is standard. Hint objects use `{ keys: "g", label: "go-to", order: 30 }`. Ordering handles prioritization.

## 5. Overlay Manager (`OverlayManager.tsx`)

- The app manages overlays (modals) through `OverlayContext`.
- When an overlay is open, it registers a `PRIORITY.MODAL` (2) scope containing only `escape`.
- Unhandled keys in modal scopes drop through to `SCREEN` unless suppressed via predicates. Thus, `noInputNoModal` (`!hasActiveModal()`) should be checked in `when()` predicates of `PRIORITY.SCREEN` bindings if we want to suppress repo actions while a modal is open.

## 6. Repository Screen Scaffold Context

- Currently, the repository screens (`RepoOverview`, `Issues`, `DiffView`, etc.) are mapped to `PlaceholderScreen` in `apps/tui/src/router/registry.ts`.
- The `tui-repo-screen-scaffold` dependency implies the screen structure will be updated to include `RepoContextProvider`, `RepoHeader`, `TabBar`, and `ActiveTabContent` components. Our implementation of `useRepoKeyboard` is meant to be called within `RepoOverviewScreen` right after data loading, providing `RepoKeyboardContext` downwards.

## 7. Implementation Strategy Integration

- **Single `SCREEN` Scope:** `useRepoKeyboard` will calculate a single map of all `PRIORITY.SCREEN` bindings. It will use `when()` predicates relying on `focusLayer` and `inputFocused` to enforce sub-layer priority (A: tab-content > B: tab-bar > C: repo-wide).
- **Tab Content Hooks:** `useTabContentKeybindings` will allow child tabs (e.g. `Changes`, `Code`) to push their bindings into `useRepoKeyboard` dynamically via context.
- **Command Palette:** The `buildRepoCommands` pattern provides pure data (`PaletteCommand[]`) which is later ingested by the `tui-command-palette` dependency.