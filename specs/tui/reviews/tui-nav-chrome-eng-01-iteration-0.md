Not LGTM.

Test execution:
1. `bun run test:e2e` (in `/Users/williamcory/codeplane/specs/tui/apps/tui`) fails immediately with module-resolution/runtime errors, including `Cannot find module '@codeplane/ui-core'` and no screen text rendered.
2. `bun test ../../e2e/tui/app-shell.test.ts --timeout 30000 --bail 1` fails on first case (`stdin is not a TTY` + missing expected UI output).
3. `bun run check` fails with many TypeScript errors, including in changed files (`ScreenRouter.tsx`, `PlaceholderScreen.tsx`, agent screens, `providers/index.ts`).

Findings (ordered by severity):
1. Screen routing is not actually mounted, so stack navigation cannot function end-to-end. `ScreenRouter` exists but is not rendered by the shell (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/AppShell.tsx:22`, `/Users/williamcory/codeplane/specs/tui/apps/tui/src/index.tsx:64`).
2. Global navigation chrome behavior is incomplete: help, command palette, and go-to are TODO no-ops (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/GlobalKeybindings.tsx:17`, `:18`, `:19`). This directly violates the design keybindings.
3. `Esc` behavior is wrong vs spec (should behave like `q` when no overlay; here it only pops if `canGoBack`, otherwise no-op) (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/GlobalKeybindings.tsx:12`).
4. Deep-link stack model is type/contract-incompatible with `NavigationProvider`: deep-links return `{screen, params}` instead of full `ScreenEntry` (`id`, `breadcrumb`) (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/navigation/deepLinks.ts:13`, `:72`, `:76`) while provider expects `ScreenEntry[]` (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/providers/NavigationProvider.tsx:19`).
5. Deep-link implementation is incomplete for required screens (`issues`, etc.) and often falls through to “not yet implemented” (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/navigation/deepLinks.ts:128`, `:219`).
6. CLI parsing does not pass deep-link fields needed by the new deep-link code (`session-id`, `org`), so agent deep-links cannot work (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/lib/terminal.ts:35`, `/Users/williamcory/codeplane/specs/tui/apps/tui/src/index.tsx:43`).
7. Session ID validation regex is incorrect (`/\\s/` checks literal backslash-s, not whitespace) (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/navigation/deepLinks.ts:114`).
8. Go-to execution logic is not spec-aligned and not wired: `executeGoTo` always resets to Dashboard first and may push RepoOverview for non-repo destinations (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/navigation/goToBindings.ts:41`, `:43`), but `onGoTo` never calls it.
9. Repo context inheritance has a logic bug: it only inherits when both `owner` and `repo` are missing; partial params are left invalid (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/providers/NavigationProvider.tsx:85`, `:148`).
10. Claimed scroll caching is not implemented for consumers: `useScrollPositionCache()` is a no-op stub (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/providers/NavigationProvider.tsx:224`, `:239`).
11. OpenTUI component API usage is incorrect in changed files (e.g., unsupported `color`/`bold`/`underline` props), causing compile failures and likely runtime mismatch (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/router/ScreenRouter.tsx:15`, `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/PlaceholderScreen.tsx:9`, `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx:154`, `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx:133`).
12. OpenTUI keyboard hook is misused in replay screen (`useKeyboard` callback compares event object to strings), so interactions won’t behave as intended (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx:85`).
13. Navigation context migration is incomplete in changed agent screens (`current` used instead of `currentScreen`) (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx:24`, `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx:21`).
14. Agent navigation typing/behavior regressions: string literals used instead of `ScreenName` and replay action routes to chat instead of replay (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionListScreen.tsx:109`, `:124`).
15. Agent list responsiveness violates design: terminal dimensions are hardcoded (`120x40`) instead of using terminal hooks (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionListScreen.tsx:42`).
16. Registry wiring makes changed agent screens unreachable: agent entries still point to `PlaceholderScreen` (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/router/registry.ts:162`, `:168`, `:174`, `:180`).
17. Export surface is broken: `AuthState` is exported but not defined, and an export statement is concatenated on one line (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/providers/index.ts:12`, `:13`).
18. Ticket test requirement not met: `e2e/tui/app-shell.test.ts` does not contain the required `NAV-*` block from `tui-nav-chrome-eng-01` (the file is dominated by unrelated `LOAD-*`/`KEY-*` suites).

Data-access check:
- In the reviewed changed files, I did not find direct `fetch`/axios calls.
- However, integration is still not robust: SSE path is stubbed (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx:20`) and session-list SSE hook is no-op (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/hooks/useSessionListSSE.ts:21`).