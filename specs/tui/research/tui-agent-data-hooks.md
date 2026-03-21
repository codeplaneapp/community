# Research Findings: Codeplane TUI Agent Data Hooks

## 1. Codebase Ground Truth & Directory State

Based on exploration of the workspace directory (`/Users/williamcory/codeplane/specs/tui/`), I have confirmed the following ground truth outlined in the engineering spec:

*   **Missing Packages:** The `packages/` and `context/` directories do not exist in this localized root. Specifically, `packages/ui-core/` is entirely absent, confirming that this task involves greenfield package creation. 
*   **Server Stubs:** Since `apps/server/` and `apps/ui/` are also absent from this snapshot, we cannot directly inspect the `apps/server/src/routes/agents.ts` implementations. The engineering spec serves as the sole authoritative source of truth for the API contract, database behaviors, and string/number coercions (e.g., `sequence`, `partIndex` being strings from DB).

## 2. Existing TUI Types vs Canonical Types

I inspected `apps/tui/src/screens/Agents/types.ts`. The current local TUI types are:

```typescript
export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; input: string }
  | { type: "tool_result"; id: string; name: string; output: string; isError: boolean; };

export interface AgentMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  timestamp: string; // ISO-8601
  /** True when this message is still being streamed (assistant only) */
  streaming?: boolean;
}
```

**Reconciliation required:**
As the engineering spec highlights, the canonical wire types for `ui-core` will differ from these local display types:
*   The TUI uses `timestamp`, whereas `ui-core` will return `createdAt`.
*   The TUI expects a discriminated union for `MessagePart`, whereas the server returns `AgentPart[]` with `content: unknown`.
*   The TUI `AgentMessage` has a display-only `streaming?: boolean` field that is not part of the wire response.

While the TUI type reconciliation is out of scope for *this* ticket, building the `ui-core` types properly according to the spec is critical so the TUI can later build an adapter (e.g., `mapServerMessageToDisplayMessage`).

## 3. OpenTUI and Shared Contexts

A scan of `apps/tui/` reveals existing OpenTUI dependencies. Files like `apps/tui/src/screens/Agents/components/MessageBlock.tsx` import `useTerminalDimensions` from `@opentui/react`, and style utilities use `RGBA` and `SyntaxStyle` from `@opentui/core`.

However, there is currently no network or data-fetching layer in `apps/tui/`. The UI components are purely presentational. The implementation of `@codeplane/ui-core` will fill this gap. Crucially, the engineering spec emphasizes that **no OpenTUI imports or TUI-specific React components should be placed in `packages/ui-core/`**. The hooks must remain framework-agnostic React 19 hooks, using the native `fetch` API available via Bun, allowing future reuse by `apps/web/`.

## 4. Hook Architecture Strategy

Based on the spec and context, the implementation in `packages/ui-core/` needs:
*   **Internal Utilities:** Robust `usePaginatedQuery` and `useMutation` base hooks. These handle the nuanced logic of stale-while-revalidate, unmount safety (`isMounted` guards), `AbortController` lifecycles, and auto-pagination.
*   **Strict Error Parsing:** Utilizing a custom `ApiError` class that maps HTTP status codes and parses the `{ message, errors? }` shape returned by the `hono`-based server SDK.
*   **API Client Context:** A lightweight wrapper around native `fetch` with an injection mechanism (`APIClientProvider`) for the authentication token.

These foundations must be strictly tested using a generic `renderHook` and `mockAPIClient` utility since the project cannot rely on standard web-based testing libraries (like `@testing-library/react`) in this Bun environment.