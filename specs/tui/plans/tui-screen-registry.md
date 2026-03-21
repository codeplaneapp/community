# Implementation Plan: tui-screen-registry

## 1. Create Placeholder Screen Component
**File:** `apps/tui/src/screens/PlaceholderScreen.tsx`
- Create a reusable placeholder component for unimplemented screens using OpenTUI intrinsic elements.
- **Props:** Accept an optional `params?: Record<string, string>` object.
- **Layout:** Use a full-width/height `<box>` with `flexDirection="column"`, `justifyContent="center"`, and `alignItems="center"`.
- **Content:**
  - Extract the screen name from `params.__screenId`, defaulting to `"Unknown Screen"`.
  - Render the screen name using `<text bold>`.
  - Iterate over remaining params (excluding `__screenId`) and render them as `<text dimColor>key: value</text>`.
  - Render a final `<text dimColor>` displaying `"Screen not yet implemented"`.

## 2. Implement Screen Registry and Constants
**File:** `apps/tui/src/router/screens.ts`
- **Constants:** Define a frozen `SCREEN_IDS` object mapping screen names to their literal string values (e.g., `Dashboard: "Dashboard"`). Include all 17 screens specified in the PRD.
- **Types:**
  - Extract a `ScreenId` union type from `SCREEN_IDS`.
  - Define the `ScreenDefinition` interface containing `component`, `title`, `requiresRepo?`, and `requiresOrg?`.
- **Registry:**
  - Import `PlaceholderScreen`.
  - Create `screenRegistry: Readonly<Record<string, ScreenDefinition>>` and initialize it with `Object.freeze({...})`.
  - Map each `SCREEN_IDS` value to a definition object using `PlaceholderScreen` as the component and defining the appropriate `title`, `requiresRepo`, and `requiresOrg` flags based on the specification.
- **Lookup Functions:**
  - Implement `getScreen(id: string): ScreenDefinition | undefined` to retrieve a screen definition safely.
  - Implement `getAllScreenIds(): readonly string[]` returning a cached, frozen array of `Object.keys(screenRegistry)`.

## 3. Update Router Barrel Export
**File:** `apps/tui/src/router/index.ts`
- Append the new types and functions to the existing barrel exports:
  ```typescript
  export type { ScreenDefinition, ScreenId } from "./screens";
  export { SCREEN_IDS, screenRegistry, getScreen, getAllScreenIds } from "./screens";
  ```

## 4. Add E2E Tests
**File:** `e2e/tui/app-shell.test.ts`
- Append a new `describe("Screen Registry", () => { ... })` block to the existing test file.
- **Snapshot Tests:**
  - `REG-SNAP-001`: Dashboard placeholder renders centered screen name at 120x40.
  - `REG-SNAP-002`: Placeholder renders screen name at 80x24 minimum size.
  - `REG-SNAP-003`: Placeholder shows params when navigated with repo context.
  - `REG-SNAP-004`: Placeholder renders at 200x60 large terminal.
- **Keyboard Tests:**
  - `REG-KEY-001`: Go-to keybindings resolve to correct placeholder screens.
  - `REG-KEY-002`: Repo-context screens show correct placeholder title via go-to.
  - `REG-KEY-003`: Unknown screen in deep-link falls back to Dashboard.
- **Integration & Edge Case Tests:**
  - `REG-INT-001`: All 17 screens are registered and navigable.
  - `REG-INT-002`: Command palette shows navigation entries for all registered screens.
  - `REG-INT-004`: Placeholder screen shows 'not yet implemented' message.
  - `REG-EDGE-*`: Add tests for case sensitivity, invalid go-to keys, and empty param rendering.
- *Note:* Tests dependent on features not yet implemented (like command palette or deep-links) should be written to spec and left failing to serve as TDD targets for subsequent tickets.

## 5. Verification
- Run `bun run check` inside `apps/tui/` to ensure strict TypeScript compilation and verify there are no circular dependencies.
- Run `bun test e2e/tui/app-shell.test.ts` to execute the new test cases and generate initial baseline terminal snapshots.