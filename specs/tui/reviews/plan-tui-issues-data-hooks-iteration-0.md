Not LGTM.

Critical findings:
1. Scope mismatch with TUI ticket requirements: the plan explicitly implements in `packages/ui-core/src/hooks/issues/*` and tests in `packages/ui-core/.../__tests__`, while your acceptance criteria require code in `apps/tui/src/` and tests in `e2e/tui/`.
2. OpenTUI usage is absent. There are no steps for `<box>/<scrollbox>/<text>/<input>/<select>/<code>/<diff>/<markdown>` or hooks (`useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`).
3. Keyboard interaction requirements are unaddressed. No implementation or test steps cover global keys (`?`, `:`, `q`, `Esc`, `Ctrl+C`), list nav (`j/k`, `gg`, `G`), search (`/`), tab switching, or diff keys.

Major findings:
4. Data-access integration is inverted for this ticket: the plan builds new `@codeplane/ui-core` hooks but does not specify wiring TUI screens to those hooks in `apps/tui/src/`.
5. Test strategy does not meet TUI PRD/design requirements (`@microsoft/tui-test`, terminal snapshots, keyboard-driven e2e flows). It only proposes hook-level tests.
6. Step 2 pagination patch is brittle (`path` string concatenation). It should use `URL`/`URLSearchParams` to avoid malformed URLs and duplicate `page/per_page` params.
7. Optimistic/caching behavior is underspecified (query keys, invalidation, repo/issue keying), risking stale or inconsistent issue/detail/comment state.

Given the above, this plan does not satisfy the stated TUI constraints and should be rewritten around `apps/tui/src` implementation plus `e2e/tui` verification.