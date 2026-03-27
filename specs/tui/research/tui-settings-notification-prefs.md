## Research Findings: TUI Settings - Notification Preferences

### 1. Current State of the Codebase
Based on codebase searches, the `SettingsScreen` and related `NotificationPrefsTab` components do **not** exist yet. The `Settings` screen is currently mapped to a `PlaceholderScreen`.
- **Router mapping**: In `apps/tui/src/router/registry.ts`, `[ScreenName.Settings]` maps to `PlaceholderScreen`.
- **E2E tests**: There is no `e2e/tui/settings.test.ts` file yet. The only mention of `settings` in E2E tests is navigating to it in `e2e/tui/app-shell.test.ts`.
- **`@codeplane/ui-core` integration**: The UI-core package is currently missing or heavily stubbed. In `apps/tui/src/providers/APIClientProvider.tsx`, there is a comment: `// Mock implementation of APIClient since @codeplane/ui-core is missing`. Therefore, the hooks `useNotificationPreferences`, `useUpdateNotificationPreferences`, and `useUser` might need to be stubbed first or added to a mock layer.

### 2. OpenTUI and TUI App Patterns
To implement the `NotificationPrefsTab`, the following established patterns in `apps/tui` must be used:

#### Layout & Breakpoints
Responsive sizing is handled by `useLayout()` from `apps/tui/src/hooks/useLayout.ts`.
```typescript
import { useLayout } from "../hooks/useLayout.js";

// Usage in component
const { width, breakpoint, contentHeight } = useLayout();
// breakpoint can be 'large', 'standard', or null (for minimum/unsupported).
```

#### Theme & Colors
Components reference semantic color tokens by name via `useTheme()`.
```typescript
import { useTheme } from "../hooks/useTheme.js";

// Usage in component
const theme = useTheme();
// Available tokens: theme.primary, theme.success, theme.warning, theme.error, theme.muted, theme.surface, theme.border
<text fg={theme.success}>[ON]</text>
```

#### Keybindings
Screen-specific keybindings should be registered using the `useScreenKeybindings` hook from `apps/tui/src/hooks/useScreenKeybindings.ts` (which wraps `KeybindingProvider`).
```typescript
import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";

// Registering keybindings
useScreenKeybindings([
  {
    key: "Space",
    group: "Settings",
    description: "Toggle Notifications",
    handler: () => handleToggle()
  }
]);
```
Alternatively, direct keyboard events can be captured using `@opentui/react`'s `useKeyboard` hook if lower-level control is needed, as seen in `TerminalTooSmallScreen`:
```typescript
import { useKeyboard } from "@opentui/react";

useKeyboard((event: { name: string; ctrl?: boolean }) => {
  if (event.name === "r") { /* handle retry */ }
});
```

### 3. Implementation Path
Since the parent `SettingsScreen.tsx` is missing, you will need to:
1. Scaffold `apps/tui/src/screens/SettingsScreen.tsx` with a basic tab layout containing the new `NotificationPrefsTab`.
2. Update `apps/tui/src/router/registry.ts` to map `[ScreenName.Settings]` to the newly created `SettingsScreen`.
3. Scaffold the `NotificationPrefsTab.tsx` following the spec, leveraging `<box>`, `<text>`, `<scrollbox>` from `@opentui/react`.
4. Apply responsive conditional rendering checking `breakpoint === "large"` or `breakpoint === "standard"` from `useLayout()`.
5. Mock the `useNotificationPreferences` hook if `@codeplane/ui-core` doesn't export it yet.