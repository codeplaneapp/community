Not LGTM. The plan has multiple blockers and is not implementable as written.

1. Verification step is incorrect: `apps/tui/` has no `package.json`, and `bun run check` does not exist in this workspace (only root `typecheck`).
2. E2E execution is currently impossible: `e2e/tui/helpers.ts` `launchTUI()` is a hard stub that throws, so the proposed new `app-shell` E2E tests cannot run or generate snapshots.
3. Screen-count/source mismatch: plan says “all 17 screens specified in PRD,” but the provided TUI PRD screen inventory lists 15 top-level screens, and deep-link allowlist in TUI_SCREEN_ROUTER is 13. The plan needs an explicit canonical ID set.
4. Type safety is too weak in step 2: `Readonly<Record<string, ScreenDefinition>>`, `getScreen(id: string)`, and `readonly string[]` lose compile-time guarantees. Use `Record<ScreenId, ScreenDefinition>` and `readonly ScreenId[]` with exhaustive `satisfies` checks.
5. Placeholder API is brittle: encoding screen identity via `params.__screenId` is a hidden convention and can collide with real params. `screenId` should be an explicit prop.
6. OpenTUI API usage is underspecified/inconsistent: plan uses `<text bold>` / `<text dimColor>`, while current code patterns use `fg` and inline `<b>/<em>`. The plan must specify the exact, type-valid OpenTUI props/components to avoid TS/runtime drift.
7. Keyboard spec coverage is incomplete: tests mention go-to behavior, but implementation steps do not define the go-to key map wiring, repo-required error path (`No repository in context`), timeout/cancel semantics, or invalid-key handling per design.
8. `requiresRepo` / `requiresOrg` flags are defined but no enforcement path is planned (deep-link validation, go-to gating, fallback behavior).
9. Data-access criterion is not addressed: plan does not state whether this ticket is intentionally data-hook-free, nor how it coexists with router-level `@codeplane/ui-core` concerns in design (`useUser`, `useNotifications`).
10. Test strategy is misaligned with stated philosophy: note says leave failing tests for unimplemented features, but examples include frontend features (command palette/deep-link), not backend-only gaps.

What is correct: code/test target paths are mostly correct (`apps/tui/src/**`, `e2e/tui/**`).

Required before approval: fix verification commands, establish canonical screen IDs, tighten types, remove `__screenId` magic, add explicit go-to/deep-link enforcement logic in the plan, and split pure registry unit tests from currently non-runnable E2E harness tests.