Not LGTM.

The research is directionally useful, but it is not deep enough for this ticket and misses critical implementation context.

1) OpenTUI API coverage is incomplete
- The plan does not audit existing OpenTUI prop misuse in the exact files it proposes to migrate.
- Examples in target Agent files:
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentChatScreen.tsx:152` (`color={...}`), `:169` (`bold`), `:254` (`borderTop`)
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx:167` (`borderBottom`), `:212` (`borderLeft`), multiple `color={...}` uses
- OpenTUI typings show expected APIs are `fg/bg/attributes` for text and `border` sides for boxes:
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/node_modules/@opentui/core/renderables/TextNode.d.ts:8`
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/node_modules/@opentui/core/renderables/Box.d.ts:9`
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/node_modules/@opentui/react/src/types/components.d.ts:28`
- Research should explicitly call this out; otherwise migration steps are not reliably executable.

2) Hardcoded color audit is incomplete
- It reports only two component files, but there are additional hardcoded color strings/named colors:
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/TabbedDetailView.tsx:70`
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/TabbedDetailView.tsx:257`
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/TabbedDetailView.tsx:313`
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx:7`
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/screens/Agents/AgentSessionListScreen.tsx:202`
- This directly conflicts with the ticket’s “no hardcoded color strings” requirement.

3) @codeplane/ui-core hook mapping is missing
- Header/Status enhancements need concrete data sources for connection state, sync state, and unread notifications.
- Research does not identify concrete hooks for these.
- In this workspace, `@codeplane/ui-core` exports agents/issues/workspaces but not notification/sync hooks:
  - `/Users/williamcory/codeplane/specs/tui/packages/ui-core/src/index.ts:21`
- Local SSE provider exposes subscribe-only plumbing, not a ready connection-health/unread-count hook:
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/providers/SSEProvider.tsx:10`

4) Existing TUI patterns were not fully leveraged
- Research omits reusable existing token/status pattern already present in `WorkspaceStatusBadge` (good migration precedent):
  - `/Users/williamcory/codeplane/specs/tui/apps/tui/src/components/WorkspaceStatusBadge.tsx:51`

5) Depth and traceability are below bar
- The research does not include line-level citations, which makes verification slower and less reliable for a wide-scope token migration.

6) Test-plan claim is not grounded in current baseline
- Running `bun test e2e/tui/app-shell.test.ts -t "THEME|DET-|TOKEN-|PROVIDER-"` currently fails due existing type/module breakages (including OpenTUI prop mismatches and missing `@codeplane/ui-core` module resolution in TUI app), which the research does not capture as risk.

Required improvements before LGTM:
- Full color-literal audit including `color=`, named color strings, and invalid OpenTUI style props.
- Explicit mapping for connection/sync/unread data sources (existing hook vs new hook vs temporary placeholder).
- Line-level references for every finding.
- Validation plan that acknowledges current failing baseline and isolates ticket-specific verification.