Findings (ordered by severity):
1. HIGH — E2E harness is a hard stub, so org tabbed-detail tests are non-functional. `/Users/williamcory/codeplane/specs/tui/e2e/tui/helpers.ts:20` always throws. `bun test e2e/tui/organizations.test.ts` result: 0 pass / 58 fail, all from the stub error.
2. HIGH — Component barrel does not export the new component/types. `/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/index.ts:20` only has `export {}`. Consumers cannot import `TabbedDetailView` from the public components entrypoint.
3. HIGH — `pushOnActivate` contract is broken when `onPush` is missing. `/Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useTabs.ts:61-63` only short-circuits if both are set; with `pushOnActivate=true` and no callback, tab selection still changes (contradicts `/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/TabbedDetailView.types.ts:67-71`).
4. HIGH — Initial activation semantics are wrong for lazy loading. `useTabs` seeds activation with initial tab (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useTabs.ts:49-53`) but never calls `onFirstActivation` for that initial tab (`:69-74` only runs on tab switch), so default-tab first-load hooks can be skipped.
5. MEDIUM — `isFirstRender` never transitions off `true` for the initial tab until a tab switch occurs (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useTabs.ts:53,75`). This is unstable for consumers that treat it as a one-shot signal.
6. MEDIUM — `UseTabsReturn.activeTab` is typed as always present, but can be `undefined` when there are no visible tabs. Declared at `/Users/williamcory/codeplane/specs/tui/apps/tui/src/hooks/useTabs.ts:28`, computed as maybe undefined at `:112-113`, returned at `:130`.
7. MEDIUM — Filter mode does not stop propagation for non-Escape keys. `/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/TabbedDetailView.tsx:170-178` returns early without `stopPropagation()`, so global keybindings may still fire while the filter input is active.
8. MEDIUM — The new org E2E file contains many placeholder tests with no assertions, violating the stated test philosophy (tests should validate user-facing behavior). Representative sections: `/Users/williamcory/codeplane/specs/tui/e2e/tui/organizations.test.ts:247-257`, `273-282`, `296-305`, `318-328`, `330-340`, `445-458`, `478-489`, `704-717`.
9. LOW — `formatCount` is duplicated in two places (`/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/TabbedDetailView.tsx:24-29` and `/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/TabbedDetailView.test-helpers.ts:39-44`), increasing drift risk.

Additional verification:
- No direct API/HTTP calls were introduced in the ticket files under `apps/tui/src/components` and `apps/tui/src/hooks`.
- `bun test e2e/tui/diff.test.ts` passes (97 pass, 10 skip), so failures are localized to the new organizations test path/harness.

Verdict: reject.