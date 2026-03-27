Ran tests:
- `bun test e2e/tui/app-shell.test.ts --timeout 30000` fails (project-wide `tsc` failures plus runtime module resolution failures).
- `bun test e2e/tui/app-shell.test.ts -t "TUI_OVERLAY_MANAGER" --timeout 30000` fails 22/22 overlay tests due missing `@microsoft/tui-test/lib/terminal/term.js`.

Findings (highest severity first):
1. Overlay behavior is not wired to global keys. `/Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:17-19` still has TODO no-ops for `onHelp` and `onCommandPalette`, so `?` and `:` do not open overlays.
2. Focus trapping is not implemented. `/Users/williamcory/codeplane/apps/tui/src/providers/OverlayManager.tsx:104-113` registers only `Esc`; `q`, `g`, and screen bindings can still dispatch to lower-priority scopes, violating modal trap requirements.
3. `OverlayManager` performs side effects inside state updaters (`setActiveOverlay`). `/Users/williamcory/codeplane/apps/tui/src/providers/OverlayManager.tsx:44-67` and `:75-126` register/remove scopes and override hints inside updater callbacks; this is not React-safe under strict/concurrent semantics and can duplicate or mis-order effects.
4. Confirm overlay contract is inconsistent. `/Users/williamcory/codeplane/apps/tui/src/providers/overlay-types.ts:17-19` allows `openOverlay("confirm")` with no payload; `/Users/williamcory/codeplane/apps/tui/src/providers/OverlayManager.tsx:76-102` clears confirm payload on toggle/swap without calling `onCancel`, while `closeOverlay` always calls `onCancel`.
5. Barrel export is incomplete for the new hook. `/Users/williamcory/codeplane/apps/tui/src/hooks/index.ts` does not export `useOverlay`, so the “exported through module barrels” claim is incomplete.
6. Overlay rendering has correctness/type-safety nits. `/Users/williamcory/codeplane/apps/tui/src/components/OverlayLayer.tsx:43-46` uses `top="auto"`/`left="auto"` (not centered per design) and `width/height as any` casts.
7. New E2E section has defects: `/Users/williamcory/codeplane/e2e/tui/helpers.ts:288-291` imports a non-existent internal tui-test path; `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:5383` sends literal `"\\x03"` instead of Ctrl+C; OVERLAY-011/012 assertions are weak/vacuous.

Data-access check: no direct API calls were introduced in the modified `apps/tui/src` files.