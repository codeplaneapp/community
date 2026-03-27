# TUI Repository Settings View - Research Findings

Based on a review of the `apps/tui/`, `context/opentui/`, and `packages/ui-core/` directories, here is the context necessary to implement the `tui-repo-settings-view` specification.

## 1. Directory Structure & Scaffolding
- The directory `apps/tui/src/screens/Repository` **does not currently exist** in the repository. The only screens implemented so far are `Agents` and `PlaceholderScreen.tsx`.
- The spec mentions `RepoOverviewScreen` and `RepoContext.ts` as dependencies (`tui-repo-screen-scaffold`). This means we will be building the first substantive parts of the Repository screen, or we need to ensure the scaffold is built prior.

## 2. API Client and Data Hooks
- **`useAPIClient`**: The import `import { useAPIClient } from "../useAPIClient.js";` outlined in the spec points to a hook that isn't at `apps/tui/src/hooks/useAPIClient.ts`. Instead, it is currently located at `apps/tui/src/providers/APIClientProvider.tsx`. Furthermore, the current implementation of `APIClient` is a mock interface that only exposes `baseUrl` and `token` (it lacks the `request(path, options)` method called in the spec). You will need to either update the mock or adapt the spec to align with the actual `ui-core` API client exported from `specs/tui/packages/ui-core/src/client/context.ts`.
- **`useOptimisticMutation`**: Exists at `apps/tui/src/hooks/useOptimisticMutation.ts` and its signature perfectly matches the design in the specification (taking `id`, `entityType`, `action`, `mutate`, `onOptimistic`, `onRevert`, and `onSuccess`).

## 3. Keybindings Architecture
- **`useScreenKeybindings`**: Available at `apps/tui/src/hooks/useScreenKeybindings.ts`. The implementation accepts an array of `KeyHandler` objects.
- **Conditional Keybindings (`when`)**: The spec uses the `when` property for contextual keybindings (`when: () => isNav`). A review of `apps/tui/src/providers/keybinding-types.ts` confirms that the `KeyHandler` interface natively supports the `when?: () => boolean` property, matching the spec exactly. 

## 4. OpenTUI Components & Hooks
- **React Components**: Found in `context/opentui/packages/react/src/components/index.ts`. All the core OpenTUI components specified in the design are fully supported and mapped: `<box>`, `<scrollbox>`, `<text>`, `<input>`, `<select>`, `<textarea>`, `<code>`, `<diff>`, and `<markdown>`.
- **Focus Management**: The spec mentions manually focusing inputs via a ref (`useRef<InputRenderable>`). The underlying OpenTUI core component for `input` should expose a `.focus()` method, but it may require checking how `@opentui/react` forwards refs to the native Zig renderables.

## 5. Layout and Theming Utilities
- **`useLayout`**: Located at `apps/tui/src/hooks/useLayout.ts`. Returns an object containing `width`, `height`, `breakpoint`, `contentHeight`, etc., strictly synced with terminal resize events without debounce.
- **`useResponsiveValue`**: Available at `apps/tui/src/hooks/useResponsiveValue.ts`. Important detail: When the terminal falls below the minimum supported size (80x24), `breakpoint` becomes `null` and this hook returns `undefined` unless a `fallback` is provided. The implementation should utilize the `fallback` parameter or the `??` operator to prevent layout crashes.
- **`useTheme`**: Found at `apps/tui/src/hooks/useTheme.ts`. It provides strongly-typed RGBA tokens via `ThemeTokens` in `apps/tui/src/theme/tokens.ts`. The available token names perfectly align with the spec: `primary`, `success`, `warning`, `error`, `muted`, `surface`, and `border`.

## 6. Telemetry and Error Handling
- Telemetry is handled globally via `apps/tui/src/lib/telemetry.ts` utilizing `trackEvent`.
- Status bar error flashing, as required by the `PERMISSION_DENIED_FLASH_MS`, is localized effectively via the proposed internal state (`statusMessage`), removing the need to build a global overlay just for inline warnings.