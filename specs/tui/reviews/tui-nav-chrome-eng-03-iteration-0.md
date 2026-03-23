1. P0 — Ctrl+B sidebar behavior is not actually wired into input handling. `useSidebarState` exposes `toggle`, but no keybinding calls it. See `/Users/williamcory/codeplane/apps/tui/src/hooks/useSidebarState.ts:83`, `/Users/williamcory/codeplane/apps/tui/src/hooks/useGlobalKeybindings.ts:25`, `/Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:21`, `/Users/williamcory/codeplane/apps/tui/src/components/AppShell.tsx:7`.
2. P0 — `useLayout` now contains component-local state (`useSidebarState`) and is used by many components, creating multiple independent sidebar states instead of one shared app state. See `/Users/williamcory/codeplane/apps/tui/src/hooks/useLayout.ts:94`, `/Users/williamcory/codeplane/apps/tui/src/components/HeaderBar.tsx:9`, `/Users/williamcory/codeplane/apps/tui/src/components/StatusBar.tsx:13`, `/Users/williamcory/codeplane/apps/tui/src/components/FullScreenLoading.tsx:27`.
3. P1 — Sidebar fields are computed but not consumed by UI chrome; AppShell still renders only header/content/status with no sidebar container. So the new sidebar state has no visible effect. See `/Users/williamcory/codeplane/apps/tui/src/hooks/useLayout.ts:103`, `/Users/williamcory/codeplane/apps/tui/src/components/AppShell.tsx:15`.
4. P1 — New tests are not robust for the claimed behavior. Several “hook” tests reimplement logic instead of testing production code (`useResponsiveValue`, sidebar width logic). See `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:4819`, `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:5025`. `RESP-SB-001` only checks snapshot inequality, which is weak and not semantically tied to sidebar visibility (`/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:5106`).
5. P1 — The new barrel-import tests fail because the hooks barrel is broken (`useNavigation` export points to a missing file). This makes `HOOK-BP-001`, `HOOK-RV-001`, `HOOK-SB-009/010` fail immediately. See `/Users/williamcory/codeplane/apps/tui/src/hooks/index.ts:16`.
6. P2 — Spec mismatch risk: implementation hard-codes Ctrl+B as no-op at `minimum` (`/Users/williamcory/codeplane/apps/tui/src/hooks/useSidebarState.ts:52`, `:86`), while design text says 80x24 hides sidebar “(toggle with Ctrl+B)”.
7. P3 (nit) — Unused type import in `/Users/williamcory/codeplane/apps/tui/src/hooks/useResponsiveValue.ts:3`.

Test execution summary:
- Ran `bun test e2e/tui/app-shell.test.ts --timeout 30000` from repo root: large failure set, including new hook/barrel cases.
- Ran targeted tests (`useBreakpoint hook`, `useResponsiveValue hook`, `resolveSidebarVisibility pure function`): barrel-import assertions fail.
- Ran `cd apps/tui && bun -e "import('./src/hooks/index.js')..."`: fails with `Cannot find module './useNavigation.js'`.
- Ran `cd apps/tui && bun test ../../e2e/tui/app-shell.test.ts -t "RESP-SB-001"`: fails in this repo due `@microsoft/tui-test` resolution from `e2e/tui/helpers.ts`.

OpenTUI/API checks:
- Modified files use OpenTUI hooks/components in expected syntax (`useTerminalDimensions`, `<box>`).
- No direct API calls were introduced in modified files (no `fetch`/client construction in the touched hooks/components).