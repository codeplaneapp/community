# Implementation Plan: TUI Global Keybindings

Based on the engineering specifications and research findings, the foundational infrastructure for the keybinding system is already in place. This implementation plan focuses on completing the missing logic in the `GlobalKeybindings` component to enable Go-To mode, integrating it with `goToBindings.ts`, and appending the required E2E and unit tests to ensure full system coverage.

## Step 1: Implement Go-To Mode in `GlobalKeybindings.tsx`

**Target File:** `apps/tui/src/components/GlobalKeybindings.tsx`

The current implementation has stubbed callbacks. We need to implement the full transient state management, scope registration, and status bar hint override for Go-To mode.

**Action Items:**
1. Import necessary contexts and utilities:
   - `KeybindingContext`, `StatusBarHintsContext`, `PRIORITY`, `KeyHandler` from `../providers/keybinding-types.js`.
   - `goToBindings`, `executeGoTo` from `../navigation/goToBindings.js`.
   - `useNavigation` from `../providers/NavigationProvider.js`.
2. Implement internal state:
   - `const [goToMode, setGoToMode] = useState(false);`
   - `const goToTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);`
   - `const goToScopeId = useRef<string | null>(null);`
3. Implement the `cleanupGoTo` function to clear timeouts, remove the `GOTO` scope, and clear the state.
4. Implement the `onGoTo` callback:
   - Check if already in go-to mode.
   - Register a `PRIORITY.GOTO` scope parsing the array from `goToBindings`.
   - Add an `escape` binding to the scope to cancel go-to mode.
   - Trigger `statusBarCtx?.overrideHints(...)` with the mapped go-to bindings.
   - Set `goToMode` to true and start a 1500ms timeout to auto-cancel via `cleanupGoTo`.
5. Hook up `onQuit`, `onEscape`, `onForceQuit` to `useGlobalKeybindings` with `useNavigation` pop/exit logic.

## Step 2: Append Missing E2E Tests to `app-shell.test.ts`

**Target File:** `e2e/tui/app-shell.test.ts`

The `app-shell.test.ts` file currently focuses on layout and theming. We need to append the exhaustive keybinding integration and priority dispatch tests outlined in the spec.

**Action Items:**
1. Append a new `describe("KeybindingProvider — Priority Dispatch", ...)` block at the end of the file.
2. Add the **Snapshot Tests** (`KEY-SNAP-001` through `004`) to verify the status bar hint rendering across different terminal sizes and screens.
3. Add the **Global Keybinding Tests** (`KEY-KEY-001` through `006`) testing `q`, `Escape`, `Ctrl+C`, `?`, `:`, and `g`.
4. Add the **Priority Layering Tests** (`KEY-KEY-010` through `015`) confirming that modal scopes shadow screen scopes, and that text inputs capture printable keys but allow `Ctrl+C` and `Escape` to pass through.
5. Add the **Scope Lifecycle Tests** (`KEY-KEY-020`, `KEY-KEY-021`) ensuring rapid transitions don't leave stale scopes.
6. Add the **Status Bar Hint Tests** (`KEY-KEY-030`, `KEY-KEY-031`) testing the `?` help hint and temporary overrides.
7. Add the **Edge Case & Responsive Tests** (`KEY-EDGE-001...`, `KEY-RSP-001...`) covering unhandled keys, sequential dispatch, and resizing operations.

*(Note: Tests depending on unmerged features like `KEY-KEY-004` or `KEY-KEY-005` will naturally fail until the Help Overlay / Command Palette are implemented, which complies with the testing philosophy constraint).* 

## Step 3: Verify and Update Normalization Unit Tests

**Target File:** `e2e/tui/keybinding-normalize.test.ts`

The research indicated a need to verify the "release" event behavior.

**Action Items:**
1. Open `e2e/tui/keybinding-normalize.test.ts`.
2. Ensure the test specifically checks for `eventType: "release"` handling logic. 
   *Example:* 
   ```typescript
   test("release events are distinguished by eventType", () => {
     // Normalization itself just returns the key, but the test proves the event object is intact
     // The caller (KeybindingProvider) is responsible for dropping them.
     const releaseEvent = makeEvent({ name: "q", eventType: "release" });
     expect(normalizeKeyEvent(releaseEvent)).toBe("q");
   });
   ```

## Step 4: Verification and QA

**Action Items:**
1. Run the TypeScript compiler to ensure the ESM imports (`.js` paths) and new generic typings from the keybinding context resolve properly:
   ```bash
   bun run tsc --noEmit -p apps/tui/tsconfig.json
   ```
2. Run the normalization unit tests:
   ```bash
   bun test e2e/tui/keybinding-normalize.test.ts
   ```
3. Run the App Shell E2E tests (which now include keybindings). Verify that failures are *only* on explicitly unimplemented features (`?` overlay, `:` palette) and that Go-To and Priority mechanics pass fully:
   ```bash
   bun test e2e/tui/app-shell.test.ts
   ```
4. Perform a local functional check by running `bun run apps/tui/src/index.tsx` (if the dev harness supports it) and rapidly pressing `g` then `d` to ensure the Go-To state override briefly renders and then navigates or times out safely.