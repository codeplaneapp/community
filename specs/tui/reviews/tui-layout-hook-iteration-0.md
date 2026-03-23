Tests run:
- `bun run check` in `apps/tui`: pass.
- `bun test ../../e2e/tui/app-shell.test.ts --timeout 30000`: fail (170 pass, 18 fail).
- `bun test ../../e2e/tui/app-shell.test.ts -t "HOOK-LAY" --timeout 30000`: pass (38 pass).
- `bun test ../../e2e/tui/app-shell.test.ts -t "RESP-LAY" --timeout 30000`: fail (0 pass, 15 fail).

Findings (highest severity first):
1. High: New responsive E2E tests are currently non-runnable in this workspace because `launchTUI()` imports `@microsoft/tui-test` from a path Bun cannot resolve from `e2e/tui` (`Cannot find module '@microsoft/tui-test/lib/terminal/term.js'`). The added `RESP-LAY-*` tests therefore all fail before validating behavior. Reference: [e2e/tui/helpers.ts#L288](/Users/williamcory/codeplane/e2e/tui/helpers.ts#L288), first failures at [e2e/tui/app-shell.test.ts#L1669](/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts#L1669).
2. High: `useLayout` is not integrated into any runtime screen/app-shell code, so layout decisions are not actually centralized in behavior yet. `useLayout` appears only in its own file and barrel export. References: [apps/tui/src/hooks/useLayout.ts#L125](/Users/williamcory/codeplane/apps/tui/src/hooks/useLayout.ts#L125), [apps/tui/src/hooks/index.ts#L14](/Users/williamcory/codeplane/apps/tui/src/hooks/index.ts#L14), [apps/tui/src/index.tsx#L14](/Users/williamcory/codeplane/apps/tui/src/index.tsx#L14).
3. Medium: Several new "useLayout" tests are tautological and do not test the hook implementation; they reimplement logic inline in test code, so they can pass even if the hook regresses. References: [e2e/tui/app-shell.test.ts#L1435](/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts#L1435), [e2e/tui/app-shell.test.ts#L1490](/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts#L1490), [e2e/tui/app-shell.test.ts#L1513](/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts#L1513), [e2e/tui/app-shell.test.ts#L1536](/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts#L1536).
4. Medium: Keyboard/layout spec gap: sidebar visibility is hard-coded to breakpoint only and explicitly defers `Ctrl+B` user toggle (“Future...”), but design requires `Ctrl+B` sidebar toggle behavior. References: [apps/tui/src/hooks/useLayout.ts#L31](/Users/williamcory/codeplane/apps/tui/src/hooks/useLayout.ts#L31), [apps/tui/src/hooks/useLayout.ts#L130](/Users/williamcory/codeplane/apps/tui/src/hooks/useLayout.ts#L130).
5. Low: Breakpoint values/types are duplicated across modules, increasing drift risk (`util/constants`, `types/breakpoint`, and Agents-local `Breakpoint` type). References: [apps/tui/src/util/constants.ts#L5](/Users/williamcory/codeplane/apps/tui/src/util/constants.ts#L5), [apps/tui/src/types/breakpoint.ts#L29](/Users/williamcory/codeplane/apps/tui/src/types/breakpoint.ts#L29), [apps/tui/src/screens/Agents/types.ts#L16](/Users/williamcory/codeplane/apps/tui/src/screens/Agents/types.ts#L16).
6. Nit: New files are missing trailing newlines (`hooks/index.ts`, `hooks/useLayout.ts`, `types/breakpoint.ts`, `types/index.ts`).

Checks requested:
- OpenTUI hook usage: `useTerminalDimensions` usage is syntactically correct; no misuse of OpenTUI components in modified source.
- Keyboard interactions vs design: tested keys (`:`, `g r`, `q`, `ctrl+c`) align with spec, but `Ctrl+B` sidebar toggle is not represented in hook behavior.
- Data access: no direct API calls introduced in changed `apps/tui/src` files (no violation of `@codeplane/ui-core`-only access in this patch).

Verdict: not LGTM.