# TUI Spinner Hook Research Findings

## 1. Existing Spinner Implementations

### `apps/tui/src/screens/Agents/components/MessageBlock.tsx`
- **Pattern:** Uses an inline `useSpinner` custom hook.
- **State Management:** Relies on `useState` and `useEffect` invoking `setInterval` for the animation loop.
- **Frames:** Hardcodes `const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;`.
- **Interval:** Hardcoded to `100ms` via `SPINNER_INTERVAL_MS`.
- **Return Value:** Returns the current frame as a string when `active` is `true`, otherwise returns `""`.
- **Migration Path:** The inline hook, `BRAILLE_FRAMES` array, and interval constant should be removed entirely in favor of importing and using the canonical `useSpinner` hook.

### `apps/tui/src/hooks/useAgentStream.ts`
- **Pattern:** Implements spinner state logic directly inside a `useEffect` hook without abstracting it out.
- **State Management:** Manages a `frameIndex` state that increments via `setInterval` as long as `stream.streaming` is `true`. It correctly resets to `0` when inactive.
- **Frames:** Hardcodes the identical braille frame array `SPINNER_FRAMES`.
- **Interval:** Hardcoded to `80ms` via `SPINNER_INTERVAL_MS`.
- **Return Value:** Injects `spinnerFrame` into the returned `TUIAgentStreamState` object.
- **Migration Path:** The state variables, `useEffect`, and hardcoded constants should be replaced with a single call to the canonical `useSpinner(stream.streaming)` hook.

## 2. Unicode Detection Utility

### `apps/tui/src/theme/detect.ts`
- **Capabilities:** Exposes `isUnicodeSupported(): boolean` which determines if the terminal supports Unicode sequences.
- **Mechanism:** Returns `false` if `process.env.TERM === "dumb"` or if `process.env.NO_COLOR` is explicitly provided, falling back to ASCII character sets.
- **Integration:** This function is a pure utility and is ready to be utilized by the new `useSpinner` module to conditionally select between `BRAILLE_FRAMES` and `ASCII_FRAMES` arrays.

## 3. Hook Export Barrel

### `apps/tui/src/hooks/index.ts`
- **Pattern:** Acts as the primary public API surface for hooks consumed across the TUI application (exporting `useNavigation`, `useAgentStream`, etc.).
- **Integration:** The new `useSpinner` hook will need to be exported from this barrel file to align with existing repository structure conventions.

## 4. OpenTUI Animation API Context

- The engineering specification strictly mandates replacing standard `setInterval` polling with `@opentui/core`'s native `Timeline` and `engine` primitives.
- **Mechanism:** 
  - A single, module-level singleton `Timeline` will be registered globally with `engine.register(timeline)`.
  - Synchronization across multiple concurrent UI spinners is managed via a shared module state object and subscribed to via React's `useSyncExternalStore`.
  - The timeline computes a discrete `frameIndex` using `Math.floor(animation.progress * FRAMES.length)` within an `onUpdate` callback.
  - CPU load is aggressively managed by manually playing/pausing the timeline as the `activeCount` of consumers transitions between zero and one, leveraging OpenTUI's `requestLive()` and `dropLive()` internal lifecycle.