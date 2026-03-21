1. Blocker: `apps/tui/src/router/screens.ts` is effectively dead code. Nothing in runtime imports `router/screens` (only `router/index` re-exports it), while actual navigation/deep-link/go-to logic uses `apps/tui/src/navigation/screenRegistry.ts`, `goToBindings.ts`, and `deepLinks.ts`.
2. Blocker: `PlaceholderScreen` derives the title from `params.__screenId` (`apps/tui/src/screens/PlaceholderScreen.tsx:14`), but `__screenId` is never set anywhere (grep hit only this file). This yields `Unknown Screen` instead of the intended screen name.
3. Blocker: New registry shape diverges from active screen model: missing `AgentChat`/`AgentSessionCreate`/`AgentSessionReplay`, uses `RepoDetail` and `Diff` instead of existing `RepoOverview` and `DiffView`, and marks Organizations as `requiresOrg: true` (`apps/tui/src/router/screens.ts:119`) which conflicts with global `g o` navigation expectations.
4. Blocker (tests): Test runs fail before any assertion of real behavior because `launchTUI` is a stub that throws (`e2e/tui/helpers.ts:20`).
   - `bun test e2e/tui/app-shell.test.ts`: 0 pass, 34 fail.
   - `bun test e2e/tui`: 155 pass, 127 fail (same stub error for all launch-based tests).
5. High: New app-shell registry tests contain incorrect/weak checks:
   - `e2e/tui/app-shell.test.ts:291` uses `--screen repo-detail`, but deep-link parsing map does not support that id.
   - `e2e/tui/app-shell.test.ts:388-395` asserts case-sensitive deep-links, but parser lowercases input (`apps/tui/src/navigation/deepLinks.ts:51`) and existing suite expects case-insensitive behavior.
   - `e2e/tui/app-shell.test.ts:325` claims all 17 screens are covered, but only iterates 7 entries (`:328-336`).
   - `e2e/tui/app-shell.test.ts:432-437` uses try/catch forced-fail pattern instead of `waitForNoText`, reducing clarity and signal.
6. Medium: Type safety is weakened in the new registry: `screenRegistry` is `Record<string, ScreenDefinition>` and `getAllScreenIds()` returns `string[]` (`apps/tui/src/router/screens.ts:52,133,152`), so completeness against `ScreenId` is not enforced.
7. Medium/nit: `PlaceholderScreen` uses `dimColor` (`apps/tui/src/screens/PlaceholderScreen.tsx:31,37`) while project convention is `fg="gray"`; targeted file type-check invocation also flagged these props.
8. Verification: No direct API calls were introduced in the modified `apps/tui/src` files (good for the `@codeplane/ui-core` rule), but overall this change set is not shippable.