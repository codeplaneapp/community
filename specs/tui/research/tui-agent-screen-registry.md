# Research Findings: TUI Agent Screen Registry Context

Based on an exploration of the `apps/tui/` codebase and the engineering specification for the `tui-agent-screen-registry` ticket, here is the context relevant to the upcoming implementation.

## 1. Existing Routing Infrastructure

The foundational routing plumbing is fully implemented and provides the primitives we need to build the `navigation/` registry layer on top.

- **`apps/tui/src/router/types.ts`**: Defines `ScreenEntry` (uses `screen: string` rather than an enum) and `NavigationContextType`. It also defines `MAX_STACK_DEPTH = 32` and a push deduplication helper `screenEntriesEqual`. The `ScreenEntry` object includes an automatically generated `id` and optional `params?: Record<string, string>`.
- **`apps/tui/src/providers/NavigationProvider.tsx`**: Fully implements the navigation stack logic (`push`, `pop`, `replace`, `reset`, `canPop`). Notably, the stack deduplicates consecutive pushes of the same screen and params. The provider optionally accepts an `initialStack` prop for pre-populating deep-linked routes.
- **`apps/tui/src/hooks/useNavigation.ts`**: Exposes the `NavigationContextType` via the React context. This is the hook the new Agent stub screens (`AgentChatScreen` and `AgentSessionReplayScreen`) will use to access `current.params?.sessionId`.

## 2. Agent Module State

A substantial portion of the agent component UI is already built, but none of the actual screens or routing are.

- **`apps/tui/src/screens/Agents/types.ts`**: Already defines domain types such as `MessageRole`, `MessagePart`, `AgentMessage`, and `Breakpoint`.
- **`apps/tui/src/screens/Agents/components/`**: Contains fully implemented components like `MessageBlock.tsx` and `ToolBlock.tsx`, along with `colors.ts`. These are correctly out of scope for this ticket.
- **Agent Stubs**: The spec requires creating `AgentSessionListScreen.tsx`, `AgentChatScreen.tsx`, `AgentSessionCreateScreen.tsx`, and `AgentSessionReplayScreen.tsx`, plus a barrel `index.ts`. None of these exist yet. They should be created as minimal placeholder implementations that satisfy the type-checker.

## 3. The Gap: `navigation/` and `commands/`

The directories for the type-safe registry and command palette do not currently exist and must be created from scratch:

- **`apps/tui/src/navigation/`**: Does not exist. This will house `screenRegistry.ts`, `goToBindings.ts`, `deepLinks.ts`, and the barrel `index.ts`.
- **`apps/tui/src/commands/`**: Does not exist. This will house `types.ts`, `agentCommands.ts`, and the barrel `index.ts`.
- **`apps/tui/src/screens/PlaceholderScreen.tsx`**: Does not exist. Required as a stand-in for all non-agent routes within the `screenRegistry`.

## 4. E2E Testing Infrastructure

The testing layer uses a mocked TUI instance interface that needs to be consumed.

- **`e2e/tui/helpers.ts`**: Exports the `TUITestInstance` interface and `launchTUI()` function. The implementation is currently a stub throwing an error, but the interface dictates how tests should interact with the application (`sendKeys`, `sendText`, `waitForText`, `snapshot`, etc.).
- **`e2e/tui/agents.test.ts`**: Already exists and contains 518+ test stubs for downstream functionality. The spec indicates we should leave this file untouched and create a *new* test file: `e2e/tui/agents-registry.test.ts`.
- The spec specifies that tests failing due to unimplemented backends should be left failing and not skipped. This is critical for the E2E methodology used in this repository.

## 5. Implementation Considerations

- **String compatibility**: The `ScreenName` enum created in `navigation/screenRegistry.ts` must have string values that perfectly map to the `screen: string` identifiers expected by the `NavigationProvider` push/replace methods. 
- **Type Exhaustiveness**: The `screenRegistry` mapping `Record<ScreenName, ScreenDefinition>` will trigger a compile-time error if any defined `ScreenName` is missing an entry. The same applies to the deep-link switch statement.
- **`CommandContext` & `hasWriteAccess()`**: Since we are only defining the types and agent command implementations, no data hooks are consumed from `@codeplane/ui-core` in this step. The palette action functions will mock checking context requirements against the interfaces created in `apps/tui/src/commands/types.ts`.
- **Breadcrumbs**: For `AgentChat` and `AgentSessionReplay`, the `breadcrumb` in the `screenRegistry` will dynamically render an 8-character truncated `sessionId` using the function definition option, taking `params` as input.