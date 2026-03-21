# Implementation Plan: tui-agent-screen-registry

This document outlines the step-by-step implementation plan for the `tui-agent-screen-registry` ticket. It registers all agent-related screens in the TUI's navigation, go-to system, command palette, and deep-link parser. The work involves creating necessary type-safe registries and stub components, while integrating seamlessly with the existing `NavigationProvider`.

## Step 1: Create Placeholder and Agent Stub Screens

First, establish the minimal viable screen components to satisfy routing exhaustiveness. These are stubs and will be fully implemented in subsequent feature tickets.

1.  **Create Placeholder Screen**
    *   **File:** `apps/tui/src/screens/PlaceholderScreen.tsx`
    *   **Implementation:** Render a simple `<box>` with `flexDirection="column"` containing a `<text fg="gray">` stating "Screen not yet implemented."
2.  **Create Agent Session List Stub**
    *   **File:** `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`
    *   **Implementation:** Minimal `<box>` with `<text bold>Agent Sessions</text>` and "Not yet implemented."
3.  **Create Agent Chat Stub**
    *   **File:** `apps/tui/src/screens/Agents/AgentChatScreen.tsx`
    *   **Implementation:** Use `useNavigation()` hook from `../../hooks/useNavigation.js` to extract `sessionId` from `current.params`. Display the session ID in the text.
4.  **Create Agent Session Create Stub**
    *   **File:** `apps/tui/src/screens/Agents/AgentSessionCreateScreen.tsx`
    *   **Implementation:** Minimal `<box>` with "New Agent Session" and "Not yet implemented."
5.  **Create Agent Session Replay Stub**
    *   **File:** `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx`
    *   **Implementation:** Similar to Chat Screen, extract and display `sessionId` via `useNavigation()`.
6.  **Create Agents Barrel Export**
    *   **File:** `apps/tui/src/screens/Agents/index.ts`
    *   **Implementation:** Re-export the four new screen components. *Do not re-export existing `components/`, `types.ts`, or `utils/` here.* 

## Step 2: Establish the Screen Registry

Build the core type-safe mapping layer connecting logical screen names to their metadata and React components.

1.  **Create Screen Registry**
    *   **File:** `apps/tui/src/navigation/screenRegistry.ts`
    *   **Implementation:**
        *   Define `ScreenName` enum with values matching string keys (e.g., `Agents = "Agents"`, `AgentChat = "AgentChat"`, etc., alongside placeholders for core screens like `Dashboard`, `RepoList`, etc.).
        *   Define `ScreenDefinition` interface (`component`, `requiresRepo`, `params`, `breadcrumb`).
        *   Export a strongly typed `screenRegistry: Record<ScreenName, ScreenDefinition>` object.
        *   Map the 4 agent screens to their stubs with `requiresRepo: true`. Set dynamic `breadcrumb` functions for `AgentChat` and `AgentSessionReplay` that truncate `params.sessionId`.
        *   Map all other `ScreenName` values to the `PlaceholderScreen` component.

## Step 3: Implement Go-To Keybindings

Define the registry for `g {key}` rapid navigation.

1.  **Create Go-To Bindings**
    *   **File:** `apps/tui/src/navigation/goToBindings.ts`
    *   **Implementation:**
        *   Define `GoToBinding` interface (`key`, `screen`, `requiresRepo`, `description`).
        *   Export an array `goToBindings` containing entries for all spec-defined core screens and add `{ key: "a", screen: ScreenName.Agents, requiresRepo: true, description: "Agents" }`.
        *   Implement helper `executeGoTo(nav: NavigationContextType, binding: GoToBinding, repoContext: { owner, repo } | null)` that constructs a navigation stack (Dashboard -> RepoOverview -> TargetScreen) using `nav.reset()` followed by sequential `nav.push()` calls.

## Step 4: Add Deep-Link Parsing

Support CLI invocation directly to agent screens with prepopulated navigation stacks.

1.  **Create Deep Links Parser**
    *   **File:** `apps/tui/src/navigation/deepLinks.ts`
    *   **Implementation:**
        *   Define `DeepLinkArgs` (`screen`, `repo`, `sessionId`, `org`) and `DeepLinkResult` (`stack`, `error`).
        *   Define `SCREEN_ID_MAP` mapping cli strings (`"agents"`, `"agent-chat"`, `"agent-replay"`) to `ScreenName` enum values. *Intentionally omit `"agent-create"`*.
        *   Implement `parseCliArgs(argv: string[])` to parse CLI flags into `DeepLinkArgs`.
        *   Implement `buildInitialStack(args: DeepLinkArgs)` that builds an array for `NavigationProvider`'s `initialStack` prop. Handle required arguments strictly (e.g., if `--screen agent-chat` is given without `--session-id`, return error string and fallback to Dashboard stack). Enforce `sessionId` validation (max 255 chars, no whitespace).

## Step 5: Export Navigation Module

1.  **Create Navigation Barrel Export**
    *   **File:** `apps/tui/src/navigation/index.ts`
    *   **Implementation:** Re-export all types, enums, constants, and functions from `screenRegistry`, `goToBindings`, and `deepLinks`.

## Step 6: Create Command Palette Registry

Define the types and agent-specific commands for the globally accessible command palette (`:`).

1.  **Create Command Types**
    *   **File:** `apps/tui/src/commands/types.ts`
    *   **Implementation:** Define `PaletteCommand` and `CommandContext` interfaces specifying execution context, visibility criteria (`contextRequirements`), and actions.
2.  **Implement Agent Commands**
    *   **File:** `apps/tui/src/commands/agentCommands.ts`
    *   **Implementation:** Export `createAgentCommands(context: CommandContext): PaletteCommand[]`. 
        *   Add "Agent Sessions" (navigates to list, requires repo context, keybinding `g a`).
        *   Add "New Agent Session" (navigates to create form, requires repo context AND write access).
3.  **Export Command Registry**
    *   **File:** `apps/tui/src/commands/index.ts`
    *   **Implementation:** Re-export types and factory. Export `buildCommandRegistry(context: CommandContext)` which aggregates commands (currently just calling `...createAgentCommands(context)`).

## Step 7: End-to-End Tests

Create a new E2E test file specifically testing the navigation wiring.

1.  **Create Test File**
    *   **File:** `e2e/tui/agents-registry.test.ts`
    *   **Implementation:** 
        *   Implement 35 tests strictly adhering to the categories in the engineering spec: 
            *   **Go-to navigation** (e.g., `NAV-AGT-001` through `NAV-AGT-006`)
            *   **Command palette** (e.g., `CMD-AGT-001` through `CMD-AGT-006`)
            *   **Deep-links** (e.g., `DLK-AGT-001` through `DLK-AGT-012`)
            *   **Screen registry** (e.g., `REG-AGT-001` through `REG-AGT-005`)
            *   **Snapshots** (e.g., `SNAP-AGT-001` through `SNAP-AGT-006` testing at various breakpoints).
        *   Import `launchTUI` from `./helpers`.
        *   Tests that timeout/fail due to unimplemented TUI behavior must be left to fail naturally, enforcing exact behavior.

## Notes for execution
*   Do **not** modify existing files in `apps/tui/src/screens/Agents/` outside of adding the new stub components and `index.ts`.
*   Do **not** touch existing files inside `apps/tui/src/router/`, `providers/`, or `hooks/`.
*   Ensure that the `screenRegistry` mapping satisfies TypeScript exhaustiveness checks without using `@ts-ignore` or `any`.