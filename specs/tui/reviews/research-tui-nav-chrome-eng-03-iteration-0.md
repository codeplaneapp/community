Research is not sufficient for `tui-nav-chrome-eng-03`.

1. OpenTUI API coverage is incomplete. It only mentions `useTerminalDimensions` and does not analyze other relevant APIs/usage tied to this ticket: `useKeyboard` path for `Ctrl+B` integration in `apps/tui/src/components/GlobalKeybindings.tsx:11-52`, `useOnResize` usage patterns in `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx:2`, or key `<box width={...}>` consumers that depend on `sidebarWidth`/`modalWidth` semantics.

2. `@codeplane/ui-core` dependency impact is not identified. Even if no new ui-core hook is required, the research should explicitly state that. It also misses responsive logic embedded in screens that consume ui-core hooks, e.g. `AgentChatScreen` (`useAgentSession` + `getBreakpoint(... ) as Breakpoint`) at `apps/tui/src/screens/Agents/AgentChatScreen.tsx:5-33` and `AgentSessionReplayScreen` at `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx:3-27`.

3. Existing TUI code-pattern exploration is shallow. It cites only `breakpoint.ts`, `useLayout.ts`, and one test file, but misses concrete migration points still using `'unsupported'`: `apps/tui/src/components/AppShell.tsx:12`, `apps/tui/src/components/TabbedDetailView.tsx:137,215`, `apps/tui/src/components/WorkspaceStatusBadge.tsx:128`.

4. Test analysis is incomplete. It notes `'unsupported'` expectations in `e2e/tui/app-shell.test.ts` (correct), but does not call out that many "hook" tests are logic re-creations via `bunEval`/inline functions rather than exercising actual hook modules (`e2e/tui/app-shell.test.ts:1157-1264`), which affects confidence for the proposed new hook set.

5. It lacks required depth/traceability: no line-level references in the research itself, no file-by-file refactor list for the claimed "sweeping" changes, and no explicit mapping to ticket-required integration points (notably `Ctrl+B` sidebar toggle behavior and persistent user preference state).