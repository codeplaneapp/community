# Research Findings for `tui-modal-component`

Based on a thorough review of the Codeplane TUI codebase, here are the architectural patterns, components, and APIs relevant to implementing the new `<Modal>` component and `useModal()` hook.

## 1. Existing Overlay Architecture

The TUI currently implements a singleton overlay architecture via the `OverlayManager` provider. 

- **`apps/tui/src/providers/OverlayManager.tsx`**: Manages the `activeOverlay` state (`"help" | "command-palette" | "confirm" | null`). When an overlay is opened, the manager directly registers a `PRIORITY.MODAL` keybinding scope that binds the `escape` key to close the overlay. This means the new `<Modal>` component's `dismissOnEsc` prop defaults to `true` but should be set to `false` when rendered by the `OverlayLayer` to avoid duplicate bindings.
- **`apps/tui/src/components/OverlayLayer.tsx`**: Currently renders an inline `<box position="absolute" ...>` at `zIndex={100}`. It manually applies responsive widths (`layout.modalWidth` / `layout.modalHeight`), theme colors (`theme.surface`, `theme.border`), and a title bar. This file is perfectly primed to have its inline layout logic replaced by the new generic `<Modal>` component.
- **`apps/tui/src/hooks/useOverlay.ts`**: Hook for interacting with the `OverlayManager`.

## 2. Keybinding and Focus Trap Patterns

The TUI has a highly centralized keybinding system. OpenTUI does not use DOM-based capture phases; focus trapping is entirely priority-based.

- **`apps/tui/src/providers/KeybindingProvider.tsx`**: Handles all OpenTUI `useKeyboard` events. Events flow through scopes sorted by priority (`PRIORITY.MODAL` is `2`, making it higher priority than screen or global keys but lower than text input focus).
- **`apps/tui/src/providers/keybinding-types.ts`**: Defines the `KeyHandler` and `PRIORITY` objects. To trap focus, the `<Modal>` component simply needs to register a scope with `priority: PRIORITY.MODAL`. Keys not matched in this scope will fall through, allowing `Ctrl+C` (Global) to still exit the app.

## 3. Theming and Styling (`apps/tui/src/theme/tokens.ts`)

The TUI strictly enforces semantic tokens for all colors instead of direct ANSI values.
- `theme.surface`: Background color for modals/overlays.
- `theme.border`: Box border color and horizontal separator lines.
- `theme.primary`: Used for the modal title text.
- `theme.muted`: Used for helper text like "Esc close".
The `<Modal>` must use the `useTheme()` hook and pass these RGBA tokens to OpenTUI's `fg`, `backgroundColor`, and `borderColor` props.

## 4. Responsive Layout System (`apps/tui/src/hooks/useLayout.ts`)

The `useLayout()` hook exposes pre-calculated values based on terminal dimensions:
- `breakpoint`: Can be `"minimum"`, `"standard"`, `"large"`, or `null`.
- `modalWidth` & `modalHeight`: These are percentage strings computed by fallback logic (`50%` on large, `60%` on standard, `90%` on minimum).
The `ResponsiveSize` resolver in `<Modal>` needs to respect these fallbacks if a specific dimension is requested, seamlessly integrating with the existing `useLayout()` approach.

## 5. Testing Infrastructure (`e2e/tui/app-shell.test.ts`)

The E2E tests use `@microsoft/tui-test`. The `app-shell.test.ts` file already contains 22 existing overlay tests (`TUI_OVERLAY_MANAGER` block, `OVERLAY-001` through `OVERLAY-022`) that ensure:
- Only one overlay is visible at a time.
- The screen content remains rendered underneath the overlay.
- Keybinding scopes correctly unmount and do not leak on `Escape`.
- Overlays render with the correct dimensions based on breakpoints.

Any implementation of `<Modal>` within `OverlayLayer.tsx` must continue to pass all of these `OVERLAY-*` snapshot and interaction tests. The new `MODAL-*` test suite (16 tests) will also be added to this file to cover `<Modal>` specific behavior such as absolute positioning, titles, focus trapping, and rendering standalone modals outside of the `OverlayManager`.