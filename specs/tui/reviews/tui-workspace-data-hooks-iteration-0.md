Not LGTM.

Critical findings (ordered by severity):
1. Workspace hooks cannot compile or use the API client correctly: they import a non-existent module and destructure fetch from useAPIClient even though the client exposes request(...). See packages/ui-core/src/hooks/workspaces/useWorkspace.ts:2,11; useWorkspaceSSH.ts:2,13; useDeleteWorkspace.ts:2,17; useDestroyWorkspaceSession.ts:2,17; useDeleteWorkspaceSnapshot.ts:2,17.
2. Paginated hooks are wired incorrectly: usePaginatedQuery requires client plus synchronous parseResponse(data, headers), but useWorkspaces/useWorkspaceSessions/useWorkspaceSnapshots omit client and pass async parseResponse expecting Response objects. See useWorkspaces.ts:12-24, useWorkspaceSessions.ts:14-26, useWorkspaceSnapshots.ts:12-24.
3. Mutation hooks misuse useMutation signatures and return types: generic parameters are reversed, mutationFn destructures { fetch } from AbortSignal, and responses are returned as raw Response without required status/body parsing. See useCreateWorkspace.ts:6-30, useCreateWorkspaceSession.ts:6-32, useCreateWorkspaceSnapshot.ts:6-25, useSuspendWorkspace.ts:17-31, useResumeWorkspace.ts:17-31. Also onRevert is passed to useMutation though unsupported (useSuspendWorkspace.ts:29, useResumeWorkspace.ts:29 vs useMutation.ts:4-10).
4. refetch is broken in useWorkspace: refetch mutates a ref and performs a no-op state set, so effect dependencies on refetchCounter.current do not reliably trigger re-fetch. See useWorkspace.ts:18-21,66.
5. Workspace test suite is placeholder-only and does not validate behavior. The test files contain empty test bodies throughout (for example: packages/ui-core/src/hooks/workspaces/__tests__/useWorkspace.test.ts:5-43, useWorkspaces.test.ts:5-61, useCreateWorkspace.test.ts:5-36, and similarly across all 13 workspace test files).

Verification results:
- Running bun run test in packages/ui-core failed (26 failing tests, currently in agent hooks).
- Running bun test src/hooks/workspaces/__tests__ passes, but only because those tests are empty placeholders.
- Running bun run check in packages/ui-core fails with multiple TS errors, including workspace hook errors listed above.
- In apps/tui/src there is no implemented workspace UI wiring yet (only registry/placeholders), so OpenTUI component/hook usage and keyboard behavior for workspace flows cannot be validated in TUI screens. See apps/tui/src/screens/index.ts:13, apps/tui/src/router/screens.ts:91-94, apps/tui/src/screens/PlaceholderScreen.tsx:17-38.