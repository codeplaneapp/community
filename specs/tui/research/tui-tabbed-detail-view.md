# Research Findings for `tui-tabbed-detail-view`

## 1. Existing `Breakpoint` Type
Found in `apps/tui/src/screens/Agents/types.ts`:
```typescript
export type Breakpoint = "minimum" | "standard" | "large";
```
**Action**: This type must be extracted to `apps/tui/src/types/breakpoint.ts` along with a `getBreakpoint(cols, rows)` function as detailed in the spec. `apps/tui/src/screens/Agents/types.ts` will need to import it from the shared location.

## 2. OpenTUI Component APIs & JSX Intrinsic Elements
Exploration of `../../context/opentui/packages/react/jsx-namespace.d.ts` reveals the following intrinsic elements for OpenTUI React reconciler:
- `box`: Accepts `BoxProps` for flexbox layouts.
- `text`: Accepts `TextProps`.
- `span`: Accepts `SpanProps`.
- `input`: Accepts `InputProps`.
- `scrollbox`: Accepts `ScrollBoxProps`.
- **Text Modifiers**: `b`, `i`, `u`, `strong`, `em` all resolve to `SpanProps`. 

*Note on colors and attributes*: OpenTUI uses `fg` and `bg` for coloring text rather than `color`. Modifiers like bold or underline are wrapped via elements like `<b>` and `<u>` or passed via an `attributes` bitfield, not boolean properties like `bold={true}` on `<text>`.

## 3. OpenTUI Keyboard Handling (`useKeyboard`)
Exploration of `../../context/opentui/packages/core/src/lib/KeyHandler.ts` confirms the signature and properties of `KeyEvent`:
- `name: string` (e.g., `"tab"`, `"escape"`, `"/"`)
- `shift: boolean`
- `ctrl: boolean`
- Methods: `stopPropagation(): void` and `preventDefault(): void`
- Additional properties: `defaultPrevented`, `propagationStopped`.
This perfectly aligns with the spec's plan to intercept keys when `isFiltering` is active and halt propagation for specific bindings.

## 4. OpenTUI Terminal Dimensions (`useTerminalDimensions`)
Exploration of `../../context/opentui/packages/react/src/hooks/use-terminal-dimensions.ts` confirms it exports a hook:
```typescript
export const useTerminalDimensions = () => {
  // returns { width: number, height: number }
}
```
This matches the spec's requirement for dynamic, responsive breakpoint detection during resize events.

## 5. File System Structure & Barrel Exports
- **Hooks Directory**: `apps/tui/src/hooks/` exists and contains `index.ts`, `useClipboard.ts`, `useDiffSyntaxStyle.ts`, and `useNavigation.ts`.
- **Components Directory**: `apps/tui/src/components/` does not currently exist. It must be created, along with its `index.ts` barrel file.

## 6. End-to-End Testing Patterns
Looking at `e2e/tui/diff.test.ts`, tests are driven by `@microsoft/tui-test` using `bun:test`.
```typescript
import { describe, test, expect } from "bun:test";
// Snapshot testing format used:
// expect(tui.snapshot()).toMatchSnapshot();
// expect(tui.snapshot()).toMatch(/Regex/);
```
Since no mock setup is needed (real API server with fixtures is the standard), the `e2e/tui/organizations.test.ts` file can be authored safely according to the extensive testing suite block outlined in the spec.

## Conclusion
The engineering specification is highly accurate. The OpenTUI interfaces, React abstractions, and testing environment align flawlessly with the defined implementation plan.