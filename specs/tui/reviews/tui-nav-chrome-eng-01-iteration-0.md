NOT LGTM.

Tests run:
1. `bun run check` (in `/Users/williamcory/codeplane/apps/tui`) -> failed (exit 2).
2. `bun test ../../e2e/tui/app-shell.test.ts --timeout 30000` -> failed (180 passed, 204 failed).
3. `bun test ../../e2e/tui/app-shell.test.ts --timeout 30000 --filter "TUI_SCREEN_ROUTER"` -> still failed with same failures.

Findings (ordered by severity):
1. BLOCKER: build/typecheck is broken in ticket-touched files.
- `/Users/williamcory/codeplane/apps/tui/src/hooks/index.ts:16` exports `./useNavigation.js`, but that file was deleted.
- `/Users/williamcory/codeplane/apps/tui/src/router/ScreenRouter.tsx:12`, `:15` use invalid OpenTUI text props (`color`, `bold`).
- `/Users/williamcory/codeplane/apps/tui/src/screens/PlaceholderScreen.tsx:8`, `:9`, `:12` use invalid OpenTUI text props (`bold`, `color`, `underline`).
- `/Users/williamcory/codeplane/apps/tui/src/router/ScreenRouter.tsx:26` currently fails JSX component typing (`Component cannot be used as a JSX component`).

2. BLOCKER: required global keybindings from design are missing.
- `/Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:13-67` has no handling for `?` (help overlay) and `:` (command palette), which are specified as global keys.

3. HIGH: `Esc` behavior does not match spec.
- `/Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:60-66` always pops/quits; spec requires closing open modal/overlay first.

4. HIGH: navigation context export regression.
- Deleting `/Users/williamcory/codeplane/apps/tui/src/hooks/useNavigation.ts` without updating barrel compatibility broke hook imports and multiple tests.

5. HIGH: ErrorBoundary current-screen reporting regressed.
- `/Users/williamcory/codeplane/apps/tui/src/index.tsx:44` captures screen once; `onNavigate` callback was removed, so `/Users/williamcory/codeplane/apps/tui/src/index.tsx:59` passes stale `currentScreen` into `ErrorBoundary` after navigation.

6. MEDIUM: deep-link validation errors are computed but dropped.
- `/Users/williamcory/codeplane/apps/tui/src/index.tsx:34-39` ignores `deepLinkResult.error`; no log/status surfacing.

7. MEDIUM: repo-context inheritance guard is incorrect for partial params.
- `/Users/williamcory/codeplane/apps/tui/src/providers/NavigationProvider.tsx:53` and `:104` use `!owner && !repo`; with only one missing param, required repo context can remain invalid.

8. MEDIUM: go-to execution can create surprising stacks for non-repo destinations when repo context exists.
- `/Users/williamcory/codeplane/apps/tui/src/navigation/goToBindings.ts:34-47` always pushes `RepoOverview` when `repoContext` exists, then pushes target (even Dashboard/Notifications). This can make `q` return to repo screens unexpectedly.

9. LOW (test quality nits in ticket-added tests):
- `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:4121-4125` (`NAV-004`) has no assertion and can pass vacuously.
- `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:4378` hardcodes registry size `32` (brittle; duplicates enum-count assertion).
- `/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:4466` uses fixed `2000ms` sleep (flaky/slow).

Notes:
- I did not find direct HTTP/API calls introduced in the touched navigation/router files; data-access constraint is respected there.
- E2E execution is additionally blocked by environment/module issue: `Cannot find module '@microsoft/tui-test/lib/terminal/term.js'` from `e2e/tui/helpers.ts`.