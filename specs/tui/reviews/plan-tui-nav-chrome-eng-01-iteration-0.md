Not LGTM. The plan is directionally good, but it is not implementation-safe or fully spec-complete.

1. Regression risk: Step 3 says to set PlaceholderScreen for all 31 screens. That would overwrite currently implemented agent screens (Agents, AgentChat, AgentSessionCreate, AgentSessionReplay) and regress behavior/tests.
2. Migration scope is underspecified: renaming/relocating navigation types and hook exports requires explicit updates in existing consumers (e.g., GlobalKeybindings, HeaderBar, goToBindings, deepLinks, router imports). “Update lingering imports” is too vague for a high-risk refactor.
3. Keyboard spec coverage is incomplete: no explicit implementation/test steps for global `Esc`, `Ctrl+C`, `?`, `:` behavior, and no clear reconciliation of `q` at root (quit) vs provider pop no-op semantics.
4. OpenTUI hook usage is not concretely planned where behavior depends on it (especially keyboard handling via `useKeyboard` and resize/terminal constraints in navigation snapshots).
5. Scroll cache design is incomplete: adds `useScrollPositionCache`, but does not define context plumbing, lifecycle integration (save/restore points), or tests proving it works.
6. Screen inventory enforcement lacks specificity: it says “all 31” but does not include a canonical enumerated mapping table tied to features/spec IDs, increasing drift risk.
7. Test plan is incomplete/misaligned with strict acceptance: missing explicit assertions for breadcrumb separator `›`, context inheritance edge cases (partial owner/repo params), duplicate equivalence (`undefined` vs `{}`), and unknown-screen fallback rendering path.
8. @codeplane/ui-core criterion is unaddressed: no explicit statement that this ticket is nav-chrome only and must not introduce direct data fetching outside ui-core patterns.
9. Quality gates are not defined tightly enough (exact commands and pass criteria for typecheck + targeted e2e after file moves/deletions).

Positive: target directories are mostly correct (`apps/tui/src` and `e2e/tui`). But the above issues mean the plan is not yet robust enough to approve.