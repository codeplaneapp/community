Blocking findings (ordered by severity):
1. Test harness is not implemented, so the claimed E2E coverage is non-functional. `launchTUI()` still throws immediately in [helpers.ts](/Users/williamcory/codeplane/specs/tui/e2e/tui/helpers.ts:20), and `bun test e2e/tui/app-shell.test.ts` results in 0 pass / 19 fail before any navigation behavior is exercised.
2. Multiple tests in [app-shell.test.ts](/Users/williamcory/codeplane/specs/tui/e2e/tui/app-shell.test.ts:1) are effectively placeholders with weak or missing assertions, so they do not prove the behaviors they claim (examples: NAV-KEY-003 at :63, NAV-KEY-004 at :70, NAV-INT-002 at :141, NAV-EDGE-001 at :179, NAV-EDGE-003 at :196).
3. Several scenario tests are logically incorrect relative to their titles:
- NAV-INT-003 does not drive stack depth anywhere near 32 and does not assert overflow behavior ([app-shell.test.ts](/Users/williamcory/codeplane/specs/tui/e2e/tui/app-shell.test.ts:148)).
- NAV-EDGE-001 never attempts `useNavigation` outside a provider despite claiming that behavior ([app-shell.test.ts](/Users/williamcory/codeplane/specs/tui/e2e/tui/app-shell.test.ts:179)).
- NAV-EDGE-002 does not actually exercise `{}` params vs `undefined` params dedup semantics ([app-shell.test.ts](/Users/williamcory/codeplane/specs/tui/e2e/tui/app-shell.test.ts:185)).
4. Navigation infrastructure is defined but not integrated in this ticket’s code surface (only provider/hook/type/barrel files were added under `apps/tui/src`), so keyboard interaction conformance to the TUI design spec is not demonstrated end-to-end.

Code review notes on implementation files:
- Provider logic in [NavigationProvider.tsx](/Users/williamcory/codeplane/specs/tui/apps/tui/src/providers/NavigationProvider.tsx:1) is structurally reasonable for stack ops (push/pop/replace/reset, dedupe, max-depth cap).
- No direct API calls were introduced in the reviewed `apps/tui/src` changes (so no violation of `@codeplane/ui-core` data-access rule in this ticket).
- OpenTUI component/hook usage is not present in these changed navigation files; correctness is therefore unproven rather than verified.