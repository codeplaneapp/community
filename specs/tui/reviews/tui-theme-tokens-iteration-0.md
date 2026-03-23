Tests run:
- `bun test e2e/tui/app-shell.test.ts` -> `63 fail`, `57 errors` (harness error: `stdin is not a TTY. The TUI requires an interactive terminal.`)
- `bun test e2e/tui/app-shell.test.ts --test-name-pattern "TOKEN-"` -> `26 pass`
- `bun test e2e/tui/app-shell.test.ts --test-name-pattern "DET-"` -> `32 pass`
- `bun run check` in `apps/tui` -> pass

Findings (highest severity first):
1. The new compatibility test is intentionally hardcoded to pass and does not verify behavior. In [app-shell.test.ts](/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:907), `TOKEN-COMPAT-002` prints `true` unconditionally ([line 924](/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:924)) with meta-comments explaining the bypass. This is a false-positive test and invalidates the claim of robust verification.
2. `TextAttributes` values are incompatible with OpenTUI semantics. In [tokens.ts](/Users/williamcory/codeplane/apps/tui/src/theme/tokens.ts:175), `UNDERLINE` is `1 << 2` and `REVERSE` is `1 << 3`; OpenTUI’s attribute model includes `ITALIC` before `UNDERLINE` and uses `INVERSE` as a later bit. This will produce wrong styling if consumed by components.
3. The code claims immutability but exports mutable shared RGBA instances. [tokens.ts](/Users/williamcory/codeplane/apps/tui/src/theme/tokens.ts:148) says frozen/pre-allocated tokens are reused, but `RGBA` objects are mutable and shared globally ([constants at lines 44-55](/Users/williamcory/codeplane/apps/tui/src/theme/tokens.ts:44), reused in [frozen objects at lines 90-143](/Users/williamcory/codeplane/apps/tui/src/theme/tokens.ts:90)). One consumer mutating `theme.primary.r` mutates global theme state for everyone.
4. `createTheme` can return `undefined` at runtime despite docs saying “Never null.” In [tokens.ts](/Users/williamcory/codeplane/apps/tui/src/theme/tokens.ts:155), the switch has no default/error path; invalid runtime input returns `undefined` ([line 164](/Users/williamcory/codeplane/apps/tui/src/theme/tokens.ts:164)).
5. Palette drift and dead duplication were introduced. [colors.ts](/Users/williamcory/codeplane/apps/tui/src/screens/Agents/components/colors.ts:3) duplicates theme palette values, is currently unused, and its `muted` value (`168,168,168`) conflicts with theme `ansi256` muted (`138,138,138`) ([tokens.ts line 62](/Users/williamcory/codeplane/apps/tui/src/theme/tokens.ts:62)). The compatibility test also omits muted entirely ([app-shell.test.ts:895](/Users/williamcory/codeplane/e2e/tui/app-shell.test.ts:895)).
6. `statusToToken` is incomplete against known backend statuses and will miscolor common states as muted. In [tokens.ts](/Users/williamcory/codeplane/apps/tui/src/theme/tokens.ts:209), statuses like `failure`, `starting`, and `online/offline` are not mapped. `failure` is used in workflow status logic ([workflow.ts](/Users/williamcory/codeplane/packages/sdk/src/services/workflow.ts:721)).
7. Documentation drift: [theme/index.ts](/Users/williamcory/codeplane/apps/tui/src/theme/index.ts:7) still describes `tokens.ts` as a “Planned module” even though this ticket adds and exports it.

OpenTUI/components/hooks and data-access checks:
- No new OpenTUI component/hook wiring was added in this ticket, so component/hook interaction correctness is mostly not exercised here.
- No direct API calls were introduced in modified `apps/tui/src` files (no `fetch`/client wiring in these changes).
- No keyboard interaction implementation changed in this ticket.

Result: not LGTM.