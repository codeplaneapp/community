Findings (ordered by severity):
1. High: `TextAttributes` bit flags do not match OpenTUI’s actual attribute encoding in `apps/tui/src/theme/tokens.ts:175-183`. `UNDERLINE` is set to `4` but OpenTUI uses `8`, and `REVERSE` is set to `8` but OpenTUI inverse uses `32`. This will render wrong styles if consumed.
2. High: Theme immutability is only shallow. The token objects are frozen, but their `RGBA` values are mutable singletons (`apps/tui/src/theme/tokens.ts:90-143,258`). A consumer can mutate `TRUECOLOR_TOKENS.primary.r` and globally corrupt all future `createTheme('truecolor')` calls.
3. Medium: `createTheme` has no runtime default/guard (`apps/tui/src/theme/tokens.ts:155-164`). Invalid runtime input from JS returns `undefined` despite return type `Readonly<ThemeTokens>`.
4. Medium: `statusToToken` blindly calls `status.toLowerCase()` (`apps/tui/src/theme/tokens.ts:209-210`). Null/undefined/non-string statuses from API edges will throw.
5. Low: `apps/tui/src/theme/index.ts:8-12` still documents `tokens.ts` as a planned module even though it now exists, so the barrel file docs are stale.

Test execution:
- Ran `bun test e2e/tui/app-shell.test.ts -t "TOKEN-"`: 26 passed, 0 failed.
- Full `bun test e2e/tui/app-shell.test.ts` currently times out broadly in this workspace (pre-existing harness/runtime issue).
- `bun test e2e/tui/app-shell.test.ts -t "(TOKEN-|DET-)"` reveals unrelated existing `DET-TSC-001` failure from broader TypeScript errors outside this ticket.

Scope checks requested:
- OpenTUI components/hooks: this ticket does not add component/hook usage, but the exported `TextAttributes` API is currently incompatible with OpenTUI bit values.
- Keyboard interactions: no keyboard logic changed in this ticket.
- `@codeplane/ui-core` data access: no direct API-call path was introduced by this ticket.