# TUI Settings Emails Research

## Context and Architecture
Based on the Codeplane TUI design specifications and the current repository state, here are the key findings for implementing `TUI_SETTINGS_EMAILS`:

### 1. File Structure and Routing
- **Entry Point & Router**: The TUI entry point is `apps/tui/src/index.tsx`. Screen routing is handled by `ScreenRouter.tsx` mapping via `apps/tui/src/router/registry.ts`.
- **Current State of Settings**: The `Settings` screen is currently mapped to `PlaceholderScreen` in `registry.ts` (`[ScreenName.Settings]: { component: PlaceholderScreen ... }`). 
- **To Implement**: We will need to create `apps/tui/src/screens/settings/SettingsScreen.tsx` and `apps/tui/src/screens/settings/EmailsTab.tsx`, and update `registry.ts` to point `ScreenName.Settings` to the new `SettingsScreen`.

### 2. Available Hooks and Components
- **OpenTUI Primitives**: `<box>`, `<scrollbox>`, `<text>`, `<input>` are provided by `@opentui/react`.
- **Data Hooks**: The specification references `@codeplane/ui-core` hooks like `useUserEmails`, `useAddEmail`, `useDeleteEmail`, etc. A search across the project specifications indicates these are part of a shared SDK layer (likely imported from `@codeplane/sdk` based on `apps/tui/package.json` dependencies, or to be defined in `apps/tui/src/hooks/useSettingsData.ts`).
- **Keybindings**: The TUI uses a specialized `useScreenKeybindings` hook (`apps/tui/src/hooks/useScreenKeybindings.ts`) for registering screen-specific Vim-style navigation and form interactions.
- **Layout**: `useLayout` and `useResponsiveValue` hooks (`apps/tui/src/hooks/`) assist with adapting to minimum (80x24), standard (120x40), and large (200x60+) terminal sizes.

### 3. Implementation Steps

#### `SettingsScreen.tsx` (To create)
- Implement a tab navigation system using `Tab` / `Shift+Tab` or numbers `1-9`.
- Map the `Emails` tab (likely index 1) to render `<EmailsTab />`.

#### `EmailsTab.tsx` (To create)
- **State**: React `useState` for `focusedIndex`, `isInputFocused`, `emailInput`, `validationError`, `deleteConfirmId`.
- **Form Section**: `<box flexDirection="row">` wrapping to column at 80x24. Input field for email entry, Space-toggleable primary checkbox, and client-side validation logic (length >= 3, includes `@`).
- **List Section**: A `<scrollbox>` rendering `emails` (sorted primary first). Responsive rendering truncating email addresses based on `useLayout()` thresholds.
- **Actions**: Bind `j`/`k` (list nav), `a` (focus input), `d` then `y` (delete with confirm), `v` (verify), `p` (set primary).

### 4. Testing Strategy
- **Framework**: E2E tests are written in Bun using `@microsoft/tui-test` and are located in `e2e/tui/`. 
- **New Test File**: `e2e/tui/settings.test.ts` (currently missing) should be created using the `launchTUI()` helper from `e2e/tui/helpers.ts`.
- **Coverage**: Add snapshot and interaction tests covering rendering at different terminal sizes, form input submission, error states (e.g. 500, 409), and full lifecycle (add -> primary -> delete).
