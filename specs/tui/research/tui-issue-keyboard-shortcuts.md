# Research Findings: tui-issue-keyboard-shortcuts

Based on a comprehensive review of the Codeplane repository, here are the detailed findings relevant to implementing the `tui-issue-keyboard-shortcuts` specification.

## 1. Global Keybinding Architecture

**File: `apps/tui/src/providers/KeybindingProvider.tsx`**
- Centralizes OpenTUI's `useKeyboard()` listener. All keyboard events route through this provider.
- Maintains a map of `KeybindingScope` entries and sorts them by `priority` ascending. 
- Evaluates scopes in order. Inserting an `ISSUE_WIDE_PRIORITY` of `4.5` between `SCREEN` (4) and `GLOBAL` (5) will seamlessly integrate into the existing numeric sort (`a.priority - b.priority`) without modifying the provider.

**File: `apps/tui/src/providers/keybinding-types.ts`**
- Defines `PRIORITY` with 5 levels: `TEXT_INPUT` (1), `MODAL` (2), `GOTO` (3), `SCREEN` (4), `GLOBAL` (5).
- `KeyHandler` defines the shape of a keybinding registration, including `group` which will be utilized by `HelpOverlayContent`.

## 2. Go-To Mode Foundations

**File: `apps/tui/src/components/GlobalKeybindings.tsx`**
- Currently implements `q`, `escape`, `ctrl+c`, `?`, `:`, and `g` bindings.
- Handlers for `onHelp`, `onCommandPalette`, and `onGoTo` are currently stubbed with `/* TODO */` comments.
- We can wire `onGoTo` to a new `GoToContext` that we provide to the component tree.

**File: `apps/tui/src/navigation/goToBindings.ts`**
- Contains the static map of `g` prefix destination keys (e.g., `d` -> Dashboard, `i` -> Issues).
- Exposes `executeGoTo(nav, binding, repoContext)` which performs the navigation route transitions and context resolution. This will directly support the `useGoToMode` hook implementation.

## 3. Help Overlay and Overlay Manager

**File: `apps/tui/src/components/OverlayLayer.tsx`**
- Manages the absolute-positioned rendering layer for modals.
- Currently renders a hardcoded placeholder for the help overlay: `[Help overlay content — pending TUI_HELP_OVERLAY implementation]`.
- Provides the necessary responsive dimensions (`layout.modalWidth`, `layout.modalHeight`). The placeholder should be easily swapped out for the new `<HelpOverlayContent />` component.

**File: `apps/tui/src/providers/OverlayManager.tsx`**
- Registers an `escape` binding at `PRIORITY.MODAL` when an overlay is open to close it.
- Manages the overlay state (`activeOverlay`). Exposes an `openOverlay` method that `GlobalKeybindings` can call when `?` or `:` are pressed.

## 4. Status Bar Hints

**File: `apps/tui/src/providers/KeybindingProvider.tsx` (contains `StatusBarHintsContext`)**
- The context provides `hints`, `registerHints`, `overrideHints`, and `isOverridden`.
- `registerHints` takes a source ID and an array of `StatusBarHint` objects, merging them from multiple sources and ordering them by `order` ASC.
- `overrideHints` allows temporary replacement of hints (ideal for Go-To mode destination displays), returning a cleanup function.

## 5. Application Bootstrap & Providers

**File: `apps/tui/src/index.tsx`**
- The application bootstrap wires up all the providers.
- The provider stack hierarchy is: `ThemeProvider` -> `KeybindingProvider` -> `OverlayManager` -> `AuthProvider` -> `APIClientProvider` -> `SSEProvider` -> `NavigationProvider` -> `LoadingProvider` -> `GlobalKeybindings`.
- The new `GoToProvider` should be inserted between `KeybindingProvider` and `OverlayManager` to allow scopes and overlays to consume go-to activation logic without cyclical issues.

## 6. Missing Dependencies & Folder Structure

- **Issues Screen:** The directory `apps/tui/src/screens/Issues/` does not currently exist in the repository. As noted in the engineering spec (`Dependencies: tui-issue-list-screen ... Status: Not started`), the base issue screens that this ticket assumes it will modify have not been scaffolded yet. The implementation plan expects to inject `useIssueKeyboard()` into `IssueListScreen.tsx`, `IssueDetailScreen.tsx`, `IssueCreateForm.tsx`, and `IssueEditForm.tsx`.
- **UI Core:** The `@codeplane/ui-core` package mentioned in the TUI spec is also not currently present under `packages/`, aligning with the TUI PRD indicating several backend/shared integrations are in a `Partial` or `Gated` state.

## Conclusion

The existing keybinding provider, normalization utilities, and overlay architecture flawlessly support the 6-layer priority model and the `useIssueKeyboard` orchestration hook. The global keybindings are perfectly poised to hook into the new overlay content and go-to contexts. However, the target issue screens designated for modification will need to be scaffolded before this specific keyboard orchestration logic can be physically applied to them.