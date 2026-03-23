# TUI OverlayManager Research Findings

Based on the analysis of the `apps/tui/`, `context/opentui/`, and `e2e/tui/` directories, the following codebase context is crucial for implementing `tui-nav-chrome-eng-04`.

## 1. KeybindingProvider Integration (`apps/tui/src/providers/`)

### `keybinding-types.ts`
- Defines `PRIORITY` which includes `MODAL: 2`. This priority is higher than `GOTO (3)`, `SCREEN (4)`, and `GLOBAL (5)`.
- Defines `KeyHandler` with properties: `key`, `description`, `group`, and `handler`.
- Exposes `StatusBarHintsContextType` with `overrideHints(hints: StatusBarHint[]): () => void`. This is what we will use to temporarily replace status bar hints with `Esc: close` when an overlay is open.

### `KeybindingProvider.tsx`
- Exports `KeybindingContext` with `registerScope({ priority, bindings, active }): string` and `removeScope(id: string): void`.
- Exports `StatusBarHintsContext`.
- Overlays can register a scope with `PRIORITY.MODAL` (or `"center"` as needed by the spec), `left: "25%"` (or `"center"`), `zIndex: 100`.
- Borders and backgrounds can be applied to `<box>` using `border={true}`, `borderColor`, and `backgroundColor`.

## 5. E2E Test Scaffolding (`e2e/tui/`)

### `app-shell.test.ts`
- Extensive testing using `@microsoft/tui-test` and `launchTUI({ cols, rows, env })`.
- The test suite heavily uses `terminal.sendKeys(...)`, `terminal.waitForText(...)`, and `terminal.snapshot()`.
- Overlays can be tested independently of actual content implementation by asserting against the placeholder text (e.g., `"Keybindings"`, `"Command Palette"`, `"Esc close"`).

## Conclusion / Plan Check
We have everything required to build `overlay-types.ts`, `OverlayManager.tsx`, `useOverlay.ts`, and `OverlayLayer.tsx` without blocking on downstream issues. The `KeybindingContext` already fully supports layered MODAL priorities and the layout system already provides `modalWidth`/`modalHeight` breakpoints.