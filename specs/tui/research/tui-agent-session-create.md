# TUI Agent Session Create — Research Findings

Based on an investigation of the Codeplane monorepo, here are the technical findings to inform the implementation of `tui-agent-session-create`.

## 1. Domain Types (`apps/tui/src/screens/Agents/types.ts`)
- The `types.ts` file correctly isolates agent-related models like `AgentMessage`, `MessageRole`, `SessionStatusFilter`, and `SessionListColumn`.
- It imports `Breakpoint` from `../../types/breakpoint.js` which is used in `AgentSessionListScreen`.
- **Actionable:** The new interfaces (`InlineCreateState`, `CreateErrorType`, etc.) defined in the spec can safely be appended to this file.

## 2. Shared Hook (`packages/ui-core/src/hooks/agents/useCreateAgentSession.ts`)
- The `useCreateAgentSession` hook is implemented and exposed.
- Its signature is: `(owner: string, repo: string) => { mutate: (input: { title: string }) => Promise<AgentSession>, isLoading: boolean, error: HookError | null }`.
- `mutate` performs a `POST` request to `/api/repos/${owner}/${repo}/agent/sessions` and expects a `201 Created`.
- It throws an `ApiError(400, "title is required")` locally if the title is empty.
- **Actionable:** The `mutate` call inside the new UI components will perfectly map to this API.

## 3. Agent Session List (`apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`)
- Currently, the `handleCreate` function is a stub:
  ```typescript
  const handleCreate = useCallback(() => {
    // Check write access; if read-only → showFlash("Write access required")
    // push("agent-session-create", { owner, repo })
  }, []);
  ```
- The screen passes an extensive object to `useSessionListKeybindings`, including `createSession: handleCreate`.
- **Actionable:** We need to replace the stubbed `handleCreate` with `setShowInlineCreate(true)`. The inline component will mount conditionally, pushing the list down. Opacity can be configured via a `flexGrow` box.

## 4. Keybinding Dispatcher (`apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts`)
- The hook is currently mostly documented logic with commented-out key handlers awaiting `@opentui/react` hook integration.
- **Actionable:** We need to add `isInlineCreateActive` to the `SessionListKeybindingActions` interface. Even though the native `useKeyboard` logic is a stub, adding the property ensures the API signature is prepared for the event guard.

## 5. Router and Screen Registry (`apps/tui/src/router/screens.ts`)
- Contains `SCREEN_IDS` and `screenRegistry`.
- `AgentChat` is notably missing from `SCREEN_IDS`.
- **Actionable:** We must add `AgentChat: "AgentChat"` to the constants and register it in the `screenRegistry` object using `PlaceholderScreen` to support the navigation target.

## 6. Command Palette (`apps/tui/src/commands/agentCommands.ts`)
- The current commands export `createAgentCommands(context: CommandContext)`. 
- There is an existing command `create-agent-session` which executes `context.navigate(ScreenName.AgentSessionCreate, { owner, repo })`.
- **Actionable:** The spec asks to update this to trigger an overlay (`context.openModal("agent-session-create", { owner, repo })`). We will modify the command's action block according to the spec.

## 7. Component Exports (`apps/tui/src/screens/Agents/components/index.ts`)
- Centralizes agent component exports. 
- **Actionable:** Will need to export the newly created `InlineSessionCreate` component from here.

## Summary
The scaffolding surrounding `tui-agent-session-create` is highly stable and cleanly decoupled. The underlying `@codeplane/ui-core` hooks are exactly matching the anticipated types. Implementing the new features vertically as outlined in the spec will integrate cleanly into the existing React architecture without conflicting with existing modules.