Not LGTM.

Major issues found:
1. Spec conflict on stack overflow behavior: the plan mandates silent drop-oldest overflow, but TUI screen-router acceptance says push past 32 must be no-op with transient status-bar error. This must be resolved, not left ambiguous.
2. Screen ID canonicalization is inconsistent: `DEFAULT_ROOT_SCREEN = "Dashboard"` conflicts with deep-link/router IDs that are lowercase (e.g., `dashboard`, `issues`). The plan mixes display labels and route IDs.
3. `ScreenEntry` is underspecified relative to router requirements: it only stores `screen` + `params`; router spec calls for display title/context semantics needed for breadcrumbs and context-aware navigation.
4. Keyboard behavior mismatches/incompleteness:
- Plan treats `Tab` as `replace` stack behavior, but design says tab cycles within tabbed screens (not necessarily navigation-stack mutation).
- Missing required router/global behaviors in tests: `Esc` precedence (overlay close vs pop), go-to cancel/timeout, invalid go-to key handling, repo-context guard errors, text-input-focus pass-through rules, and `Ctrl+C` immediate quit semantics.
5. OpenTUI integration expectations are not cleanly scoped: NavigationProvider is headless (React-only), but plan’s Phase 4 heavily depends on downstream OpenTUI screens/chrome (`HeaderBar`, `ScreenRouter`, truncation layout) without declaring cross-ticket prerequisites.
6. `@codeplane/ui-core` usage is not explicitly handled: provider should use none, but proposed E2E paths rely on repo/issues screens that require ui-core hooks and backend fixtures; plan gives no fixture/data strategy, making failures non-diagnostic for this ticket.
7. Test plan quality gaps:
- No provider-level unit tests for `screenEntriesEqual`, `push/pop/replace/reset`, and `canPop` invariants.
- Several E2E cases are weak/non-assertive (e.g., root quit uses manual terminate rather than asserting process exit from `q`).
- Proposed overflow test does not reliably exceed 32 entries (using go-to/reset patterns can keep depth low).
- Dedup/replace assertions are indirect and may validate unrelated behavior.
8. Path/scaffolding specificity gap: plan says “update `e2e/tui/app-shell.test.ts`” but does not specify creation/fallback when absent, nor required harness readiness (`launchTUI` behavior, helper contracts).

The plan targets correct top-level directories (`apps/tui/src`, `e2e/tui`) but is not robust or internally consistent enough to approve.