# TUI Settings Profile Research

## 1. Overview
The Codeplane TUI `Settings Profile` tab is designed to be a keyboard-driven form for users to update their personal information (Display Name, Bio, Avatar URL, and Email). It will leverage the Codeplane API for data fetching and mutations, utilizing optimistic UI updates and responsive terminal sizing.

## 2. Architecture & Components

### Form Components & Data Hooks
- **`ProfileTab` Container**: 
  - Orchestrates state for fields: `displayName`, `bio`, `avatarUrl`, `email`, along with `focusedIndex` (0 to 5 for inputs and buttons), `banner`, and `isSubmitting`.
  - Uses `@codeplane/ui-core` adapter hooks (`useUser()` for initial state, `useUpdateUser()` for `PATCH` requests).
- **`DiscardDialog`**:
  - A modal component rendered conditionally when the user presses `Esc` with unsaved changes. It traps focus and captures `y` (confirm discard) and `n`/`Esc` (cancel).
  - Utilizes `<box>` with `position="absolute"` and centered alignment to overlay content.
- **Input Management**: 
  - Leverages OpenTUI primitives `<input>` for single-line text and `<input multiline>` (or `<textarea>` per the established `FormComponent` pattern) for multi-line bio fields.
  - Fields utilize a dirty-state check by comparing current values to the frozen initial API payload (`isDirty`).

### OpenTUI Constraints & Hooks
- **Layout**: Adapts using `useLayout()`. 
  - 80x24: Bio is 3 lines high, abbreviated labels (`Name:`, `Bio:`).
  - 120x40: Bio is 6 lines high, standard labels.
  - 200x60+: Bio is 10 lines high.
- **Keyboard Navigation**: Uses `@opentui/react`'s `useKeyboard` to implement explicit form navigation priority:
  - `Tab`/`Shift+Tab`: Cycle `focusedIndex` from 0 to 5.
  - `Ctrl+S`: Save form globally.
  - `Esc`: Trigger `DiscardDialog` if dirty, else go back.
  - `Enter`: Submit form on `Save`, cancel on `Cancel`, or insert newlines/advance if on specific inputs.

## 3. Implementation Plan

### 3.1 Utilities
- **`apps/tui/src/screens/settings/utils/profileValidation.ts`**
  - `validateAvatarUrl(url: string)`: Validates HTTP/HTTPS and length (<= 2048).
  - `validateDisplayName(name: string)`: Checks length (<= 255).
  - `validateBio(bio: string)`: Checks length (<= 2000).
  - `getModifiedFields(original, current)`: Extracts only changed fields for the `PATCH` payload.

### 3.2 Modal & Tab UI
- **`apps/tui/src/screens/settings/components/DiscardDialog.tsx`**: Reusable modal trapping `y`/`n`/`Esc` keys with `theme.warning` borders.
- **`apps/tui/src/screens/settings/tabs/ProfileTab.tsx`**: Renders `<input>` boxes mapped to the internal `focusedIndex`. Active inputs use `theme.primary` border color; invalid inputs use `theme.error`.
- **`apps/tui/src/screens/settings/SettingsScreen.tsx`**: Entry point that registers `ProfileTab` and controls tab cycling.

## 4. Testing Strategy (`e2e/tui/settings.test.ts`)
- **Keyboard Navigation Tests**:
  - Assert `Tab` and `Shift+Tab` cycles correctly through all fields.
  - Assert `Ctrl+S` submittal maps state accurately to the mock API payload.
  - Assert `Esc` with dirty state accurately triggers `DiscardDialog` and correctly manages `y`/`n` responses.
- **Validation Tests**: Assert correct HTTP 422 behavior, ensuring an error banner triggers and appropriate inputs switch to a red border.
- **Responsive Layout**: Run terminal snapshot assertions (`@microsoft/tui-test`) across 80x24, 120x40, and resize events to guarantee input state survival during render-loop resizes.