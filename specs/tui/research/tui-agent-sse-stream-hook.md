# Research Document: `tui-agent-sse-stream-hook`

## 1. `packages/ui-core/` Context
- **API Client Definition**: Evaluated `packages/ui-core/src/client/types.ts`. The `APIClient` interfaces exposes `request(path, options): Promise<Response>`. This validates the spec's plan to consume raw `Response` objects from the client for `createSSEReader` to tap into `response.body.getReader()`.
- **Testing Infrastructure**: `packages/ui-core/src/test-utils/mockAPIClient.ts` provides `createMockAPIClient()` with robust utilities like `respondWith`, `respondWithJSON`, and `respondWithError`. These match perfectly with the testing strategy outlined in the engineering spec.
- **Error Handlers**: `packages/ui-core/src/types/errors.ts` exposes `parseResponseError` and defines `NetworkError`, which we will import and use to handle 4xx/5xx responses appropriately during the SSE ticket exchange.
- **Agent Types**: `packages/ui-core/src/types/agents.ts` contains the fundamental wire types (`AgentMessage`, `AgentPartType`).

## 2. OpenTUI & `useTimeline` API Mismatch (Critical Risk Found)
- **The Discrepancy**: The engineering spec outlines the `apps/tui/src/hooks/useAgentStream.ts` adapter using `useTimeline` as follows:
  ```typescript
  const timeline = useTimeline({ active: stream.streaming, interval: 80, frames: 10 });
  ```
- **The Reality**: Deep investigation into `../../context/opentui/packages/react/src/hooks/use-timeline.ts` and `../../context/opentui/packages/core/src/animation/Timeline.ts` reveals this is **incorrect**. The actual `useTimeline` hook accepts `TimelineOptions` containing properties like `duration`, `loop`, `autoplay`, and `onComplete`. It returns a `@opentui/core` `Timeline` class instance, not an object with a `frame` property.
- **Mitigation Needed**: When developing the actual feature, the TUI adapter will either need to implement a standard `useEffect`-based polling interval or properly orchestrate OpenTUI's `Timeline` and `.currentTime` API to manage the spinner frames rather than relying on the non-existent `interval/frames` API.

## 3. Dependency Verification
- **`eventsource-parser`**: A search in the monorepo root via `bun.lock` validates that `eventsource-parser` version `^3.0.6` is correctly installed and resolvable, as expected by the spec.

## 4. `apps/tui/` Context
- **TUI Agent Types**: `apps/tui/src/screens/Agents/types.ts` successfully imports and overrides base types. It includes an `AgentMessage` type extended with `streaming?: boolean`, strictly aligning with the requirement in the engineering spec.
- **Hook Registry**: `apps/tui/src/hooks/index.ts` is confirmed as the standard barrel location where we will export the newly created TUI adapter hook (`useAgentStream` and its state type).

## 5. `apps/ui/` Context
- The `apps/ui/` web client directory is not available inside the current codebase environment. We will not be able to mirror an existing web implementation and will stick entirely to the logic described in the `tui-agent-sse-stream-hook` specification.