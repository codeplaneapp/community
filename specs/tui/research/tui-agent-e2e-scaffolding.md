## Research Context for TUI Agent E2E Scaffolding

This document outlines the findings from investigating the codebase to support the `tui-agent-e2e-scaffolding` ticket. The research focuses on understanding existing TUI patterns, OpenTUI APIs, shared data layer expectations, and relevant agent-specific structures.

### 1. `e2e/tui/` Directory Status

- The directory `e2e/tui/` does **not** exist in the current project structure. This implies that the `e2e/tui/agents.test.ts` file, along with any necessary helper files like `e2e/tui/helpers.ts`, will need to be created from scratch. The engineering specification accounts for this by requiring a stub `helpers.ts` if it's missing.

### 2. `@codeplane/ui-core` Package Status and Expected API Surface

- The `@codeplane/ui-core` package, frequently referenced in PRDs and design documents as the shared data layer for the TUI, does **not** currently exist as an implemented package in the repository (e.g., in `packages/` or `node_modules`).
- Project specifications (`specs/tui/engineering/tui-agent-data-hooks.md`, `specs/tui/engineering/tui-foundation-scaffold.md`) explicitly state that `@codeplane/ui-core` is a *future* package. The TUI is expected to either use `@codeplane/sdk` directly or rely on mock/fixture data until `ui-core` is created.
- For the purpose of this E2E scaffolding ticket, test fixtures are explicitly defined as *constants* and will not interact with a live API or a `ui-core` implementation. This aligns with the understanding that `ui-core` is not yet available.
- Despite its absence, the project's various `specs/tui/*.md` files provide a clear picture of the *expected* API surface of `@codeplane/ui-core` for agent features. These include:
    - `useSendAgentMessage(owner, repo, sessionId)`
    - `useAgentMessages(owner, repo, sessionId)`
    - `useAgentSession(owner, repo, sessionId)`
    - `useSSE("agent_session_<sessionId>")`
    - `useUser()`
- These expected hooks and their parameters will inform the design of agent-specific helper functions and the overall structure of the tests, even if the actual implementation isn't present.

### 3. Agent-Specific Data Structures (for Test Fixtures)

- The core data types for agent messages and their parts were found in `apps/tui/src/screens/Agents/types.ts`:

    ```typescript
    export type MessageRole = "user" | "assistant" | "system" | "tool";

    export type MessagePart =
      | { type: "text"; content: string }
      | { type: "tool_call"; id: string; name: string; input: string }
      | { type: "tool_result"; id: string; name: string; output: string; isError: boolean };

    export interface AgentMessage {
      id: string;
      role: MessageRole;
      parts: MessagePart[];
      timestamp: string; // ISO-8601
      streaming?: boolean;
    }
    ```
- This provides the precise type definitions required for constructing robust agent message fixtures, covering different roles and part types, including `tool_call` and `tool_result` as specified in the engineering plan.

### 4. OpenTUI Components and Hooks (from `@opentui/react`)

- The OpenTUI React reconciler is located at `context/opentui/packages/react/`.
- Its `package.json` confirms dependencies on `@opentui/core` and `react-reconciler`, and specifies `react: >=19.0.0` as a peer dependency.
- **OpenTUI Hooks** (found in `context/opentui/packages/react/src/hooks/`):
    - `useKeyboard` (from `use-keyboard.ts`)
    - `useTerminalDimensions` (from `use-terminal-dimensions.ts`)
    - `useOnResize` (from `use-resize.ts`)
    - `useTimeline` (from `use-timeline.ts`)
- **OpenTUI Components** (re-exported from `context/opentui/packages/react/src/components/index.ts`):
    - `<box>` (`BoxRenderable`)
    - `<text>` (`TextRenderable`)
    - `<code>` (`CodeRenderable`)
    - `<diff>` (`DiffRenderable`)
    - `<markdown>` (`MarkdownRenderable`)
    - `<input>` (`InputRenderable`)
    - `<select>` (`SelectRenderable`)
    - `<textarea>` (`TextareaRenderable`)
    - `<scrollbox>` (`ScrollBoxRenderable`)
- **`<markdown>` Component Streaming API:**
    - The `MarkdownRenderable` class (defined in `context/opentui/packages/core/src/renderables/Markdown.ts`) supports a `streaming?: boolean` option.
    - When `streaming` is `true`, the component handles incremental content updates, with the trailing markdown block remaining unstable and tables rendering progressively. This property is crucial for simulating agent response streaming in the TUI.

### 5. `@microsoft/tui-test` API Surface

- The engineering specification directly provides the `TUITestInstance` interface and `launchTUI` function signature. These definitions are sufficient for the E2E test scaffolding, as they outline the required interactions and assertions for the test suite:
    ```typescript
    export interface TUITestInstance { /* ... methods as described in spec ... */ }
    export async function launchTUI(options?: { /* ... options as described in spec ... */ }): Promise<TUITestInstance>;
    ```

### 6. Braille Spinner Characters for Streaming Detection

- The engineering specification explicitly lists the braille spinner characters used for detecting streaming states: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`.

### 7. Other Relevant Codebase Context

- The root `package.json` indicates a pnpm monorepo structure with `apps/*` and `packages/*` workspaces. This explains why `apps/tui/` does not contain its own `package.json` file; its dependencies are likely managed at the monorepo root.
- The `apps/tui/src/screens/Agents/` directory structure (`components/`, `types.ts`, `utils/`) suggests a standard organization for TUI screens, which will be useful for future implementation steps beyond this scaffolding ticket.

This research provides a solid foundation for proceeding with the implementation of the `tui-agent-e2e-scaffolding` ticket, with clear understanding of dependencies, expected APIs, and specific implementation details.